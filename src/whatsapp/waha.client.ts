import fetch from 'node-fetch';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { logger } from '../observability/logger';
import { hashIdentifier } from '../observability/privacy';
import { fetchExternalImageSafe } from '../media/safe-external-image-fetcher';
import { discardResponseBody } from '../media/http-body';
import { firstHumanDisplayName } from './display-name';
import { firstMessageTimestamp } from './message-time';
import { messageStanzaId } from './message-id';

/**
 * Response resmi WAHA untuk GET /api/{session}/chats/{chatId}/picture
 * (docs: https://waha.devlike.pro/docs/how-to/chats/):
 *   { "url": "https://..." } — `url` adalah field terdokumentasi;
 *   `url` dapat bernilai null bila chat tidak punya foto profil.
 * `pictureUrl` HANYA fallback kompatibilitas untuk deployment lama/non-resmi.
 */
export interface WahaPictureResponse {
  url?: string | null;
  pictureUrl?: string | null;
}

export interface WahaLookupOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface WahaMessageLookupOptions extends WahaLookupOptions {
  /** Quoted author, needed to serialize bare WEBJS group message ids. */
  participant?: string;
}

function lookupDeadline(options: WahaLookupOptions | undefined, defaultTimeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, Math.min(defaultTimeoutMs, options?.timeoutMs ?? defaultTimeoutMs)));
  const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  return { signal, cleanup: () => clearTimeout(timer) };
}

// Klien WAHA mengikuti docs resmi: POST /api/<action> dengan session di body JSON.
export class WAHAClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly session: string;

  constructor(baseUrl?: string, apiKey?: string, session?: string) {
    this.baseUrl = (baseUrl || env.wahaBaseUrl).replace(/\/$/, '');
    this.apiKey = apiKey || env.wahaApiKey;
    this.session = session || env.wahaSession;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  private async request(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: Record<string, unknown>,
    action: string,
    logChatId?: string,
  ): Promise<any> {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      logger.error(`WAHA ${action} request failed`, {
        chatIdHash: logChatId ? hashIdentifier(logChatId) : undefined,
        error: String(err),
      });
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send via WAHA');
    }

    if (!response.ok) {
      // Body WAHA tidak dibaca pada jalur error — buang agar socket kembali ke pool.
      discardResponseBody(response);
      logger.error(`WAHA ${action} failed with status ${response.status}`, {
        chatIdHash: logChatId ? hashIdentifier(logChatId) : undefined,
        status: response.status,
      });
      const appErr = new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send via WAHA');
      (appErr as any).status = response.status;
      throw appErr;
    }

    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  private async post(path: string, body: Record<string, unknown>, action: string, chatId: string): Promise<any> {
    return this.request('POST', path, { session: this.session, chatId, ...body }, action, chatId);
  }

  async sendSticker(chatId: string, stickerBuffer: Buffer, replyTo?: string): Promise<void> {
    await this.ensureChatLoaded(chatId);
    await this.post('/api/sendSticker', {
      file: {
        mimetype: 'image/webp',
        filename: 'sticker.webp',
        data: stickerBuffer.toString('base64'),
      },
      ...(replyTo ? { reply_to: replyTo } : {}),
    }, 'sendSticker', chatId);
    logger.info('Sticker sent via WAHA', { chatIdHash: hashIdentifier(chatId) });
  }

  async sendImage(
    chatId: string,
    imageBuffer: Buffer,
    mimetype: 'image/png' | 'image/jpeg' | 'image/webp',
    replyTo?: string,
  ): Promise<void> {
    const ext = mimetype.includes('png') ? 'png' : mimetype.includes('jpeg') ? 'jpeg' : 'webp';
    await this.ensureChatLoaded(chatId);
    await this.post('/api/sendImage', {
      file: {
        mimetype,
        filename: `image.${ext}`,
        data: imageBuffer.toString('base64'),
      },
      ...(replyTo ? { reply_to: replyTo } : {}),
    }, 'sendImage', chatId);
    logger.info('Image sent via WAHA', { chatIdHash: hashIdentifier(chatId) });
  }

  async sendVideo(
    chatId: string,
    videoBuffer: Buffer,
    mimetype: 'video/mp4',
    replyTo?: string,
  ): Promise<void> {
    await this.ensureChatLoaded(chatId);
    await this.post('/api/sendVideo', {
      file: {
        mimetype,
        filename: 'video.mp4',
        data: videoBuffer.toString('base64'),
      },
      convert: false,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }, 'sendVideo', chatId);
    logger.info('Video sent via WAHA', { chatIdHash: hashIdentifier(chatId) });
  }

  async sendText(chatId: string, text: string, replyTo?: string): Promise<void> {
    await this.post('/api/sendText', { text, ...(replyTo ? { reply_to: replyTo } : {}) }, 'sendText', chatId);
  }

  // Best-effort: paksa engine me-load chat ke store (membantu chat @lid).
  //
  // PENTING: response WAHA sendSeen SELALU harus dibuang. Method ini dipanggil
  // sebelum setiap sendSticker/sendImage/sendVideo; bila body tidak dibaca maka
  // satu socket bocor permanen per stiker yang dikirim.
  private async ensureChatLoaded(chatId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/api/sendSeen`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ session: this.session, chatId }),
      });
      discardResponseBody(res);
    } catch {
      // Abaikan — hanya pemanasan chat store.
    }
  }

  async sendReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    try {
      await this.request(
        'PUT',
        '/api/reaction',
        {
          session: this.session,
          messageId,
          reaction: emoji,
        },
        'sendReaction',
        chatId,
      );
    } catch (err: any) {
      logger.warn('WAHA sendReaction failed', {
        action: 'sendReaction',
        chatIdHash: hashIdentifier(chatId),
        messageIdHash: hashIdentifier(messageId),
        status: err?.status || err?.code || 'error',
      });
    }
  }

  // Best-effort: nama kontak manusia. Prioritas nama tersimpan, lalu pushname
  // dan shortName. Nomor/ID mentah sengaja ditolak agar tidak masuk ke stiker.
  async getContactSavedName(chatId: string, session = this.session, options?: WahaLookupOptions): Promise<string | undefined> {
    const deadline = lookupDeadline(options, 2000);
    try {
      const res = await fetch(
        `${this.baseUrl}/api/contacts?contactId=${encodeURIComponent(chatId)}&session=${encodeURIComponent(session)}`,
        { headers: { 'X-Api-Key': this.apiKey }, signal: deadline.signal },
      );
      if (!res.ok) {
        discardResponseBody(res);
        return undefined;
      }
      const data = (await res.json()) as any;
      return firstHumanDisplayName([data?.name, data?.pushname, data?.pushName, data?.shortName]);
    } catch {
      return undefined;
    } finally {
      deadline.cleanup();
    }
  }

  // Official Chats API: fetch only the original message metadata, never media.
  // Missing quotes are best-effort; a bounded lookup must not block the sticker.
  async getMessageTimestamp(chatId: string, messageId: string, session = this.session, options?: WahaMessageLookupOptions): Promise<number | undefined> {
    if (!chatId || !messageId) return undefined;
    const deadline = lookupDeadline(options, 2000);
    try {
      const path = `${this.baseUrl}/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}/messages`;
      const read = async (url: string) => {
        const res = await fetch(url, {
          headers: { 'X-Api-Key': this.apiKey }, signal: deadline.signal,
          size: 4 * 1024 * 1024, redirect: 'error',
        });
        if (!res.ok) {
          discardResponseBody(res);
          return { status: res.status, data: undefined };
        }
        return { status: res.status, data: await res.json() as any };
      };
      const stanza = messageStanzaId(messageId);
      // WEBJS group lookups require a full id, including the quoted author.
      // Other engines also accept serialized ids. The author may be the bot.
      const ids = stanza === messageId && chatId.endsWith('@g.us') && options?.participant
        ? [`false_${chatId}_${stanza}_${options.participant}`, `true_${chatId}_${stanza}_${options.participant}`]
        : [messageId];
      for (const id of ids) {
        const { status, data } = await read(`${path}/${encodeURIComponent(id)}?downloadMedia=false`);
        if (status === 401 || status === 403) return undefined;
        const timestamp = firstMessageTimestamp(data?.timestamp, data?._data?.timestamp, data?._data?.t, data?._data?.messageTimestamp);
        if (timestamp !== undefined) return timestamp;
      }

      // A quote can omit its author or use an older engine id format. Recover
      // the original by its stanza id, never by text or the latest timestamp.
      // All attempts share the same deadline; media is never downloaded.
      const { data: messages } = await read(`${path}?downloadMedia=false&limit=100&sortBy=timestamp&sortOrder=desc`);
      if (!Array.isArray(messages)) return undefined;
      const original = messages.find((message) => typeof message?.id === 'string' && messageStanzaId(message.id) === stanza);
      return firstMessageTimestamp(original?.timestamp, original?._data?.timestamp, original?._data?.t, original?._data?.messageTimestamp);
    } catch {
      return undefined;
    } finally {
      deadline.cleanup();
    }
  }

  // Best-effort: daftar partisipan grup + role (docs: participants/v2).
  // Role selain 'participant' (admin/superadmin) dianggap admin.
  async getGroupParticipants(groupId: string): Promise<{ id: string; role: string }[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(
        `${this.baseUrl}/api/${this.session}/groups/${encodeURIComponent(groupId)}/participants/v2`,
        { headers: { 'X-Api-Key': this.apiKey }, signal: controller.signal },
      );
      if (!res.ok) {
        discardResponseBody(res);
        return [];
      }
      const data = (await res.json()) as any;
      const list = Array.isArray(data) ? data : data?.participants || [];
      return list
        .filter((p: any) => p && typeof p.id === 'string')
        .map((p: any) => ({ id: p.id, role: String(p.role || 'participant') }));
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
  async getChatInfo(chatId: string, session = this.session, options?: WahaLookupOptions): Promise<{ name?: string; picture?: string } | null> {
    const deadline = lookupDeadline(options, 2500);
    try {
      const res = await fetch(
        `${this.baseUrl}/api/${encodeURIComponent(session)}/chats/overview?limit=1&ids=${encodeURIComponent(chatId)}`,
        { headers: { 'X-Api-Key': this.apiKey }, signal: deadline.signal },
      );
      if (!res.ok) {
        discardResponseBody(res);
        return null;
      }
      const data = (await res.json()) as any;
      const chat = Array.isArray(data) ? data[0] : data?.chats?.[0];
      if (!chat) return null;
      return {
        name: this.cleanName(chat.name || chat.pushName),
        picture: chat.picture || undefined,
      };
    } catch {
      return null;
    } finally {
      deadline.cleanup();
    }
  }

  private cleanName(name: unknown): string | undefined {
    return firstHumanDisplayName([name]);
  }

  // Best-effort: ambil foto profil chat untuk avatar stiker. null bila tidak ada/gagal.
  // Menggunakan SSRF-safe fetcher untuk URL picture yang dikembalikan WAHA.
  async getProfilePicture(chatId: string, session = this.session, options?: WahaLookupOptions): Promise<{ buffer: Buffer; mimetype: string } | null> {
    const deadline = lookupDeadline(options, 3000);
    try {
      const res = await fetch(
        `${this.baseUrl}/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}/picture`,
        { headers: { 'X-Api-Key': this.apiKey }, signal: deadline.signal },
      );
      if (!res.ok) {
        discardResponseBody(res);
        return null;
      }
      const data = (await res.json()) as WahaPictureResponse;
      // `url` adalah field TERDOKUMENTASI WAHA saat ini — diprioritaskan.
      // `pictureUrl` hanya fallback kompatibilitas, bukan field resmi.
      const pictureUrl: string | null | undefined = data?.url ?? data?.pictureUrl;
      if (!pictureUrl) return null;
      return await this.fetchExternalImage(pictureUrl, { ...options, signal: deadline.signal });
    } catch {
      return null;
    } finally {
      deadline.cleanup();
    }
  }

  // Best-effort: download gambar dari URL eksternal menggunakan SSRF-safe fetcher.
  // Mengembalikan null bila URL private/tidak valid/gagal.
  async fetchExternalImage(url: string, options?: WahaLookupOptions): Promise<{ buffer: Buffer; mimetype: string } | null> {
    return fetchExternalImageSafe(url, {
      timeoutMs: options?.timeoutMs ?? 5_000,
      signal: options?.signal,
      maxBytes: env.avatarMaxBytes,
      maxPixels: env.avatarMaxPixels,
    });
  }

  /**
   * @deprecated Gunakan fetchExternalImage untuk URL eksternal.
   * Method ini dipertahankan untuk backward-compat internal caller.
   */
  async fetchImage(url: string): Promise<{ buffer: Buffer; mimetype: string } | null> {
    return this.fetchExternalImage(url);
  }
}
