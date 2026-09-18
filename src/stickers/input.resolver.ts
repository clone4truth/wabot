import env from '../config/env';
import { NormalizedMessage } from '../whatsapp/types';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export interface ResolvedInput {
  type: 'text' | 'image' | 'video' | 'toimg' | 'togif' | 'ttp' | 'attp' | 'meme';
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

const TEXT_MODIFIERS = ['teks', 'quote', 'bubble'];
const IMAGE_MODIFIERS = ['full', 'crop', 'circle', 'meme'];

function quotedLabel(mimetype?: string): string {
  if (mimetype?.startsWith('video')) return 'Video';
  if (mimetype?.startsWith('image')) return 'Foto';
  return 'File';
}

export class InputResolver {
  resolve(msg: {
    command: string;
    args: string;
    modifier?: string;
    reply?: { body?: string; senderId?: string; senderName?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
    senderName?: string;
    senderId?: string;
  }): ResolvedInput | null {
    const { command, args, modifier, reply, media, senderName, senderId } = msg;
    const commandName = command.replace(/^!/, '').toLowerCase();

    if (commandName === 'toimg') {
      const mime = reply?.media?.mimetype || media?.mimetype;
      if (mime && !mime.startsWith('image/webp')) {
        throw new AppError(
          ErrorCode.UNSUPPORTED_STICKER_TYPE,
          'Reply sticker static lalu gunakan !toimg',
          { userMessage: '❌ Reply sticker static lalu gunakan !toimg.' },
        );
      }
      return { type: 'toimg', source: 'reply', content: { args: reply?.body || '', mediaUrl: reply?.media?.url || media?.url } };
    }

    if (commandName === 'togif') {
      const mime = reply?.media?.mimetype || media?.mimetype;
      if (mime && !mime.startsWith('image/webp')) {
        throw new AppError(
          ErrorCode.UNSUPPORTED_STICKER_TYPE,
          'Reply sticker animasi lalu gunakan !togif',
          { userMessage: '❌ Reply sticker animasi lalu gunakan !togif.' },
        );
      }
      return { type: 'togif', source: 'reply', content: { args: reply?.body || '', mediaUrl: reply?.media?.url || media?.url } };
    }

    if (commandName !== 'stiker' && commandName !== 'ttp' && commandName !== 'attp') return null;

    // Text-to-Picture (statis) & Animated-TTP: !ttp / !attp <teks> (atau reply teks).
    if (commandName === 'ttp' || commandName === 'attp') {
      const inputText = args || reply?.body || '';
      if (!inputText) return null;
      return { type: commandName, source: args ? 'direct' : 'reply', content: { text: inputText, args } };
    }

    // Command: !stiker
    const hasImageMedia = Boolean(
      (reply?.media?.url && reply.media.mimetype?.startsWith('image')) ||
      (media?.url && media.mimetype?.startsWith('image')),
    );
    const hasVideoMedia = Boolean(
      (reply?.media?.url && reply.media.mimetype?.startsWith('video')) ||
      (media?.url && media.mimetype?.startsWith('video')),
    );

    // P0: Force Text via modifier === 'teks'
    if (modifier === 'teks') {
      if (args) {
        return {
          type: 'text',
          source: reply ? 'reply' : 'direct',
          modifier: 'teks',
          content: { text: args, args, senderName, senderId },
        };
      }
      // Tanpa args: bila reply teks murni (bukan media), jadikan teks reply
      if (reply?.body && !reply.media) {
        return {
          type: 'text',
          source: 'reply',
          modifier: 'teks',
          content: { text: reply.body, args: '', senderName: reply.senderName, senderId: reply.senderId },
        };
      }
      // Reply media atau tanpa teks sama sekali
      throw new AppError(
        ErrorCode.UNSUPPORTED_INPUT,
        'Tambahkan teks setelah !stiker teks',
        { userMessage: '❌ Tambahkan teks setelah !stiker teks.' },
      );
    }

    // P0: Text-only modifiers (quote, bubble)
    if (modifier && TEXT_MODIFIERS.includes(modifier)) {
      if (hasVideoMedia || hasImageMedia) {
        throw new AppError(
          ErrorCode.MODIFIER_REQUIRES_TEXT,
          `Mode ${modifier} membutuhkan teks`,
          { userMessage: `❌ Mode ${modifier} membutuhkan teks.` },
        );
      }
      if (args) {
        return {
          type: 'text',
          source: reply ? 'reply' : 'direct',
          modifier,
          content: {
            text: args,
            args,
            senderName,
            senderId,
            quotedSenderName: reply?.senderName,
            quotedSenderId: reply?.senderId,
            quotedBody: reply?.body,
          },
        };
      }
      if (reply?.body) {
        return {
          type: 'text',
          source: 'reply',
          modifier,
          content: { text: reply.body, args: '', senderName: reply.senderName, senderId: reply.senderId },
        };
      }
      throw new AppError(
        ErrorCode.MODIFIER_REQUIRES_TEXT,
        `Mode ${modifier} membutuhkan teks`,
        { userMessage: `❌ Mode ${modifier} membutuhkan teks.` },
      );
    }

    // P0: Image-only modifiers (full, crop, circle, meme)
    if (modifier && IMAGE_MODIFIERS.includes(modifier)) {
      if (hasVideoMedia) {
        throw new AppError(
          ErrorCode.MODIFIER_REQUIRES_IMAGE,
          `Mode ${modifier} membutuhkan foto`,
          { userMessage: `❌ Mode ${modifier} membutuhkan foto.` },
        );
      }
      if (!hasImageMedia) {
        throw new AppError(
          ErrorCode.MODIFIER_REQUIRES_IMAGE,
          `Mode ${modifier} membutuhkan foto`,
          { userMessage: `❌ Mode ${modifier} membutuhkan foto.` },
        );
      }
      const targetMedia = (reply?.media?.url && reply.media.mimetype?.startsWith('image')) ? reply.media : media!;
      const isReply = Boolean(reply?.media?.url && reply.media.mimetype?.startsWith('image'));
      if (modifier === 'meme') {
        return {
          type: 'meme',
          source: isReply ? 'reply' : 'media',
          content: { mediaUrl: targetMedia.url, mimetype: targetMedia.mimetype, args },
        };
      }
      return {
        type: 'image',
        source: isReply ? 'reply' : 'media',
        modifier,
        content: { mediaUrl: targetMedia.url, mimetype: targetMedia.mimetype, args },
      };
    }

    // Default unmodified resolution
    // Priority 1: Replied message
    if (reply) {
      if (reply.media?.url) {
        if (reply.media.mimetype?.startsWith('video')) {
          return { type: 'video', source: 'reply', content: { mediaUrl: reply.media.url, mimetype: reply.media.mimetype, args } };
        }
        return { type: 'image', source: 'reply', content: { mediaUrl: reply.media.url, mimetype: reply.media.mimetype, args }, modifier: 'full' };
      }
      const quotedBody = reply.body || (reply.media ? quotedLabel(reply.media.mimetype) : '');
      if (args) {
        return {
          type: 'text',
          source: 'reply',
          content: {
            text: args,
            args,
            senderName,
            senderId,
            quotedSenderName: reply.senderName,
            quotedSenderId: reply.senderId,
            quotedBody,
          },
        };
      }
      if (reply.body) {
        return {
          type: 'text',
          source: 'reply',
          content: { text: reply.body, args, senderName: reply.senderName, senderId: reply.senderId },
        };
      }
    }

    // Priority 2: Current message media
    if (media?.url) {
      if (media.mimetype?.startsWith('video')) {
        return { type: 'video', source: 'media', content: { mediaUrl: media.url, mimetype: media.mimetype, args } };
      }
      return { type: 'image', source: 'media', content: { mediaUrl: media.url, mimetype: media.mimetype, args }, modifier: 'full' };
    }

    // Priority 3: Direct text
    if (args) {
      return { type: 'text', source: 'direct', content: { text: args, args, senderName, senderId } };
    }

    return null;
  }
}
