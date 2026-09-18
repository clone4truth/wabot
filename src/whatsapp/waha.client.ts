import fetch from 'node-fetch';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { logger } from '../observability/logger';

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

  private async post(path: string, body: Record<string, unknown>, action: string, chatId: string): Promise<any> {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ session: this.session, chatId, ...body }),
      });
    } catch (err) {
      logger.error(`WAHA ${action} request failed`, { chatId, error: String(err) });
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send via WAHA');
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      logger.error(`WAHA ${action} failed with status ${response.status}: ${responseBody.slice(0, 200)}`, { chatId, status: response.status, responseBody: responseBody.slice(0, 300) });
      throw new AppError(ErrorCode.WAHA_SEND_FAILED, 'Failed to send via WAHA');
    }

    return response.json().catch(() => ({}));
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
    logger.info('Sticker sent via WAHA', { chatId });
  }

  async sendImage(chatId: string, imageBuffer: Buffer, mimetype: string, replyTo?: string): Promise<void> {
    const ext = mimetype.includes('png') ? 'png' : mimetype.includes('jpeg') || mimetype.includes('jpg') ? 'jpeg' : 'webp';
    await this.ensureChatLoaded(chatId);
    await this.post('/api/sendImage', {
      file: {
        mimetype,
        filename: `image.${ext}`,
        data: imageBuffer.toString('base64'),
      },
      ...(replyTo ? { reply_to: replyTo } : {}),
    }, 'sendImage', chatId);
    logger.info('Image sent via WAHA', { chatId });
  }

  async sendText(chatId: string, text: string, replyTo?: string): Promise<void> {
    await this.post('/api/sendText', { text, ...(replyTo ? { reply_to: replyTo } : {}) }, 'sendText', chatId);
  }

  // Best-effort: paksa engine me-load chat ke store (membantu chat @lid).
  private async ensureChatLoaded(chatId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/sendSeen`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ session: this.session, chatId }),
      });
    } catch {
      // Abaikan — hanya pemanasan chat store.
    }
  }

  async sendReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    try {
      await this.post('/api/sendReaction', { messageId, reaction: emoji }, 'sendReaction', chatId);
    } catch {
      // Reaction is optional, ignore failures
    }
  }

  // Best-effort: info chat (nama + foto) via overview. null bila gagal.
  async getChatInfo(chatId: string): Promise<{ name?: string; picture?: string } | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(
        `${this.baseUrl}/api/${this.session}/chats/overview?limit=1&ids=${encodeURIComponent(chatId)}`,
        { headers: { 'X-Api-Key': this.apiKey }, signal: controller.signal },
      );
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      const chat = Array.isArray(data) ? data[0] : data?.chats?.[0];
      if (!chat) return null;
      return {
        name: this.cleanName(chat.name || chat.pushName),
        picture: chat.picture || undefined,
      };
    } catch {
      return null;
    }
  }

  private cleanName(name: unknown): string | undefined {
    if (typeof name !== 'string') return undefined;
    const trimmed = name.trim();
    if (!trimmed || trimmed === '~') return undefined;
    return trimmed.slice(0, 32);
  }

  // Best-effort: ambil foto profil chat untuk avatar stiker. null bila tidak ada/gagal.
  async getProfilePicture(chatId: string): Promise<{ buffer: Buffer; mimetype: string } | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        `${this.baseUrl}/api/${this.session}/chats/${encodeURIComponent(chatId)}/picture`,
        { headers: { 'X-Api-Key': this.apiKey }, signal: controller.signal },
      );
      clearTimeout(timeout);
      if (!res.ok) return null;
      const { url } = (await res.json()) as { url?: string | null };
      if (!url) return null;
      return this.fetchImage(url);
    } catch {
      return null;
    }
  }

  // Best-effort: download gambar dari URL. null bila gagal.
  async fetchImage(url: string): Promise<{ buffer: Buffer; mimetype: string } | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const imgRes = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!imgRes.ok) return null;
      const mimetype = imgRes.headers.get('content-type') || 'image/jpeg';
      if (!mimetype.startsWith('image/')) return null;
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) return null;
      return { buffer, mimetype };
    } catch {
      return null;
    }
  }
}
