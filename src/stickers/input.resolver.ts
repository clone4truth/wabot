import env from '../config/env';
import { NormalizedMessage } from '../whatsapp/types';

export interface ResolvedInput {
  type: 'text' | 'image' | 'video' | 'toimg' | 'togif';
  source: 'reply' | 'media' | 'direct';
  content: {
    text?: string;
    senderName?: string;
    senderId?: string;
    quotedSenderName?: string;
    quotedSenderId?: string;
    quotedBody?: string;
    mediaUrl?: string;
    mimetype?: string;
    args?: string;
    command?: string;
  };
  modifier?: string;
}

function quotedLabel(mimetype?: string): string {
  if (mimetype?.startsWith('video')) return 'Video';
  if (mimetype?.startsWith('image')) return 'Foto';
  return 'File';
}

export class InputResolver {
  resolve(msg: {
    command: string;
    args: string;
    reply?: { body?: string; senderId?: string; senderName?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
    senderName?: string;
    senderId?: string;
  }): ResolvedInput | null {
    const { command, args, reply, media, senderName, senderId } = msg;
    const commandName = command.replace(/^!/, '').toLowerCase();

    if (commandName === 'toimg') {
      return { type: 'toimg', source: 'reply', content: { args: reply?.body || '', mediaUrl: reply?.media?.url || media?.url } };
    }

    if (commandName === 'togif') {
      return { type: 'togif', source: 'reply', content: { args: reply?.body || '', mediaUrl: reply?.media?.url || media?.url } };
    }

    if (commandName !== 'stiker') return null;

    // Priority 1: Replied message
    if (reply) {
      if (reply.media?.url) {
        if (reply.media.mimetype?.startsWith('video')) {
          return { type: 'video', source: 'reply', content: { mediaUrl: reply.media.url, mimetype: reply.media.mimetype, args } };
        }
        return { type: 'image', source: 'reply', content: { mediaUrl: reply.media.url, mimetype: reply.media.mimetype, args } };
      }
      // Reply teks + ada args: args jadi isi, pesan reply jadi quote.
      // Reply teks tanpa args: isi pesan reply yang dijadikan stiker bubble.
      const quotedBody = reply.body || (reply.media ? quotedLabel(reply.media.mimetype) : '');
      if (args) {
        return {
          type: 'text', source: 'reply',
          content: {
            text: args, args, senderName, senderId,
            quotedSenderName: reply.senderName, quotedSenderId: reply.senderId, quotedBody,
          },
        };
      }
      if (reply.body) {
        return {
          type: 'text', source: 'reply',
          content: { text: reply.body, args, senderName: reply.senderName, senderId: reply.senderId },
        };
      }
    }

    // Priority 2: Current message media
    if (media?.url) {
      if (media.mimetype?.startsWith('video')) {
        return { type: 'video', source: 'media', content: { mediaUrl: media.url, mimetype: media.mimetype, args } };
      }
      return { type: 'image', source: 'media', content: { mediaUrl: media.url, mimetype: media.mimetype, args } };
    }

    // Priority 3: Direct text
    if (args) {
      return { type: 'text', source: 'direct', content: { text: args, args, senderName, senderId } };
    }

    return null;
  }
}
