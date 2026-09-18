import { StickerResult } from './result';
import { BubbleProcessor } from './processors/bubble.processor';
import { TextStickerProcessor } from './processors/text.processor';
import { QuoteProcessor } from './processors/quote.processor';
import { MemeProcessor } from './processors/meme.processor';
import { TtpProcessor } from './processors/ttp.processor';
import { ImageStickerProcessor } from './processors/image.processor';
import { addStickerExif } from './exif';
import { logger } from '../observability/logger';
import { VideoStickerProcessor } from './processors/video.processor';
import { ToImageProcessor } from './processors/toimg.processor';
import { ToGifProcessor } from './processors/togif.processor';
import { InputResolver, ResolvedInput } from './input.resolver';
import { downloadMedia } from '../media/downloader';
import { WAHAClient } from '../whatsapp/waha.client';
import Sharp from 'sharp';
import fs from 'fs';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export class StickerService {
  private inputResolver = new InputResolver();
  private wahaClient = new WAHAClient();
  private processors = {
    text: new BubbleProcessor(),
    plainText: new TextStickerProcessor(),
    quote: new QuoteProcessor(),
    meme: new MemeProcessor(),
    ttp: new TtpProcessor(),
    image: new ImageStickerProcessor(),
    video: new VideoStickerProcessor(),
    toimg: new ToImageProcessor(),
    togif: new ToGifProcessor(),
  };

  async process(normalizedMessage: {
    command: string;
    args: string;
    modifier?: string;
    reply?: { body?: string; senderId?: string; senderName?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
    chatId: string;
    senderId: string;
    senderName?: string;
    isGroup: boolean;
  }): Promise<StickerResult | null> {
    const { command, args, modifier, reply, media, senderName, senderId } = normalizedMessage;
    const input = this.inputResolver.resolve({ command, args, modifier, reply, media, senderName, senderId });

    if (!input) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Unsupported input type');
    }

    const timeoutMs = this.getTimeout(input.type);
    const raw = await Promise.race([
      this.runProcessor(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout')), timeoutMs)
      ),
    ]);

    return this.withPackMeta(raw, input.type);
  }

  // Metadata pack WhatsApp (nama pack + emoji) untuk webp statis.
  private async withPackMeta(result: StickerResult | null, inputType: string): Promise<StickerResult | null> {
    if (!result || result.mimetype !== 'image/webp' || result.animated) return result;
    const emojis: Record<string, string[]> = {
      text: ['💬'],
      image: ['🖼️'],
      video: ['🎬'],
      meme: ['😂'],
      ttp: ['🎨'],
    };
    try {
      const buffer = await addStickerExif(result.buffer, { emojis: emojis[inputType] || ['🤖'] });
      return { ...result, buffer, size: buffer.length };
    } catch (err) {
      logger.warn('Gagal menempel EXIF pack, kirim tanpa metadata', { error: String(err) });
      return result;
    }
  }

  // Ekstrak argumen primitif dari ResolvedInput sesuai signature tiap prosesor.
  private async runProcessor(input: ResolvedInput): Promise<StickerResult | null> {
    const content = input.content;

    switch (input.type) {
      case 'text': {
        const text = content.text ?? '';
        if (input.modifier === 'quote') {
          return this.processors.quote.process(text, content.senderName);
        }
        if (input.modifier === 'teks') {
          return this.processors.plainText.process(text);
        }
        // Resolve nama tersimpan + info chat per ID unik (best-effort, paralel).
        // Prioritas nama: kontak tersimpan > overview > pushName payload > ID.
        const ids = [...new Set([content.senderId, content.quotedSenderId].filter(Boolean))] as string[];
        const resolved = await Promise.all(
          ids.map(async (id) => {
            const [savedName, info] = await Promise.all([
              this.wahaClient.getContactSavedName(id).catch(() => undefined),
              this.wahaClient.getChatInfo(id).catch(() => null),
            ]);
            return { id, savedName, info };
          }),
        );
        const byId = new Map(resolved.map((r) => [r.id, r]));
        const sender = content.senderId ? byId.get(content.senderId) : undefined;
        const quotedRes = content.quotedSenderId ? byId.get(content.quotedSenderId) : undefined;

        const senderName = sender?.savedName || sender?.info?.name || content.senderName;
        const quoted = content.quotedBody
          ? {
              senderName: quotedRes?.savedName || quotedRes?.info?.name || content.quotedSenderName || '?',
              senderId: content.quotedSenderId,
              body: content.quotedBody,
            }
          : undefined;

        let avatar = sender?.info?.picture
          ? await this.wahaClient.fetchImage(sender.info.picture).catch(() => null)
          : null;
        if (!avatar && content.senderId) {
          avatar = await this.wahaClient.getProfilePicture(content.senderId).catch(() => null);
        }
        return this.processors.text.process(content.text ?? '', senderName, content.senderId, quoted, avatar);
      }
      case 'image': {
        if (!content.mediaUrl) {
          throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
        }
        return this.processors.image.process(content.mediaUrl, input.modifier ?? 'full');
      }
      case 'meme': {
        if (!content.mediaUrl) {
          throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
        }
        return this.processors.meme.process(content.mediaUrl, content.args ?? '');
      }
      case 'ttp': {
        return this.processors.ttp.process(content.text ?? '');
      }
      case 'video': {
        if (!content.mediaUrl) {
          throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
        }
        return this.processors.video.process(content.mediaUrl);
      }
      case 'toimg':
      case 'togif': {
        const url = content.mediaUrl;
        if (!url) {
          throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Reply stiker yang mau dikonversi tidak tersedia');
        }
        const { filePath } = await downloadMedia(url);
        const stickerBuffer = await fs.promises.readFile(filePath);
        if (input.type === 'toimg') {
          const meta = await Sharp(stickerBuffer).metadata();
          const isAnimated = (meta.pages ?? 1) > 1;
          return this.processors.toimg.process(stickerBuffer, isAnimated);
        }
        return this.processors.togif.process(stickerBuffer);
      }
      default:
        throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'No processor for this input');
    }
  }

  private getTimeout(inputType: string): number {
    const timeouts: Record<string, number> = {
      text: env.textProcessingTimeoutMs,
      image: env.imageProcessingTimeoutMs,
      video: env.videoProcessingTimeoutMs,
      toimg: env.imageProcessingTimeoutMs,
      togif: env.videoProcessingTimeoutMs,
      meme: env.imageProcessingTimeoutMs,
      ttp: env.textProcessingTimeoutMs,
    };
    return timeouts[inputType] || env.textProcessingTimeoutMs;
  }
}
