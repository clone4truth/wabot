import { WAHAPayload, WahaMessage, NormalizedMessage } from './types';
import { isCommand } from '../commands/parser';
import { logger } from '../observability/logger';
import { firstMessageTimestamp } from './message-time';

export class MessageNormalizer {
  // Nama tampil: pushName dari WAHA bila ada, fallback ke id pengirim.
  static displayName(notifyName: unknown, id: string): string {
    if (typeof notifyName === 'string' && notifyName.trim()) return notifyName.trim().slice(0, 32);
    return id.split('@')[0];
  }

  normalize(payload: WAHAPayload): NormalizedMessage {
    const msg: WahaMessage = payload.payload;
    const reply = msg.replyTo;
    const isGroup = msg.from.includes('g.us');

    // Di grup, pengirim ada di participant; di DM pengirim = from.
    // Varian nama field antar engine: participant / sender / _data.sender.
    const senderId =
      msg.participant ||
      (msg as any).sender ||
      (msg._data?.sender?.id as string | undefined) ||
      (typeof msg._data?.sender === 'string' ? (msg._data.sender as string) : undefined) ||
      msg.from;

    const normalized: NormalizedMessage = {
      eventId: `${payload.session}_${payload.payload.id}`,
      session: payload.session,
      messageId: msg.id,
      timestamp: firstMessageTimestamp(msg.timestamp, msg._data?.timestamp, msg._data?.t, msg._data?.messageTimestamp),
      chatId: msg.from,
      senderId,
      senderName: MessageNormalizer.displayName(msg.notifyName || msg._data?.notifyName, senderId),
      isGroup,
      fromMe: msg.fromMe === true,
      body: msg.body || '',
    };

    if (reply) {
      const quoted = MessageNormalizer.resolveReplySender(msg, reply, isGroup);
      normalized.reply = {
        messageId: reply.id,
        timestamp: firstMessageTimestamp(
          reply.timestamp,
          reply._data?.timestamp, reply._data?.t, reply._data?.messageTimestamp,
          msg._data?.quotedMsg?.timestamp, msg._data?.quotedMsg?.t, msg._data?.quotedMsg?.messageTimestamp,
          msg._data?.quotedMessage?.timestamp, msg._data?.quotedMessage?.messageTimestamp,
        ),
        body: reply.body,
        senderId: quoted.id,
        senderName: quoted.name,
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

  // Cari pengirim pesan yang di-quote:
  // 1. replyTo.participant (field resmi WAHA, bisa absen tergantung engine),
  // 2. prefix replyTo.id: "true_" = dari bot sendiri, "false_" = dari lawan chat (DM),
  // 3. fallback "?" daripada nama ngawur.
  static resolveReplySender(
    msg: WahaMessage,
    reply: NonNullable<WahaMessage['replyTo']>,
    isGroup: boolean,
  ): { id?: string; name: string } {
    const participant = reply.participant || reply.sender;
    const rawNotify = reply.senderName || (reply as any)._data?.notifyName;
    if (participant) {
      return { id: participant, name: rawNotify || MessageNormalizer.displayName(undefined, participant) };
    }
    if (!isGroup) {
      if (reply.id?.startsWith('true_')) {
        const meId = msg.to || 'bot';
        return { id: meId, name: MessageNormalizer.displayName(undefined, meId) };
      }
      if (reply.id?.startsWith('false_')) {
        return { id: msg.from, name: MessageNormalizer.displayName(msg.notifyName || msg._data?.notifyName, msg.from) };
      }
    }
    return { id: undefined, name: rawNotify || '?' };
  }

  shouldIgnore(msg: NormalizedMessage, prefix?: string): boolean {
    if (msg.fromMe) return true;
    if (!msg.body && !msg.media) return true;
    if (!isCommand(msg.body || '', prefix)) return true;
    return false;
  }
}
