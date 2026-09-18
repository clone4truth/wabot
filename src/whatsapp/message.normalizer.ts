import { WAHAPayload, WahaMessage, NormalizedMessage } from './types';
import { logger } from '../observability/logger';

export class MessageNormalizer {
  // Nama tampil: pushName dari WAHA bila ada, fallback ke id pengirim.
  static displayName(notifyName: unknown, id: string): string {
    if (typeof notifyName === 'string' && notifyName.trim()) return notifyName.trim().slice(0, 32);
    return id.split('@')[0];
  }

  normalize(payload: WAHAPayload): NormalizedMessage {
    const msg: WahaMessage = payload.payload;
    const reply = msg.replyTo;

    const normalized: NormalizedMessage = {
      eventId: `${payload.session}_${payload.payload.id}`,
      messageId: msg.id,
      chatId: msg.from,
      senderId: msg.from,
      senderName: MessageNormalizer.displayName(msg.notifyName || msg._data?.notifyName, msg.from),
      isGroup: msg.from.includes('g.us'),
      fromMe: false,
      body: msg.body || '',
    };

    if (reply) {
      normalized.reply = {
        messageId: reply.id,
        body: reply.body,
        senderId: reply.sender,
        senderName: reply.senderName
          || MessageNormalizer.displayName((reply as any).notifyName, reply.sender || 'W'),
        media: reply.media,
      };
    }

    if (msg.hasMedia && msg.media?.url) {
      normalized.media = {
        url: msg.media.url,
        mimetype: msg.media.mimetype,
      };
    }

    return normalized;
  }

  shouldIgnore(msg: NormalizedMessage): boolean {
    if (msg.fromMe) return true;
    if (!msg.body && !msg.media) return true;
    if (!msg.body?.startsWith('!')) return true;
    return false;
  }
}
