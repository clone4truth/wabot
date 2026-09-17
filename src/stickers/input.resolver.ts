import env from '../config/env';
import { NormalizedMessage } from '../whatsapp/types';

export interface ResolvedInput {
  type: 'text' | 'image' | 'video' | 'toimg' | 'togif';
  source: 'reply' | 'media' | 'direct';
  content: {
    text?: string;
    mediaUrl?: string;
    mimetype?: string;
    args?: string;
    command?: string;
  };
  modifier?: string;
}

export class InputResolver {
  resolve(msg: {
    command: string;
    args: string;
    reply?: { body?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
  }): ResolvedInput | null {
    const { command, args, reply, media } = msg;
    const commandName = command.replace(/^!/, '').toLowerCase();

    if (commandName === 'toimg') {
      return { type: 'toimg', source: 'reply', content: { args: reply?.body || '' } };
    }

    if (commandName === 'togif') {
      return { type: 'togif', source: 'reply', content: { args: reply?.body || '' } };
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
      if (reply.body) {
        return { type: 'text', source: 'reply', content: { text: reply.body, args } };
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
      return { type: 'text', source: 'direct', content: { text: args, args } };
    }

    return null;
  }
}
