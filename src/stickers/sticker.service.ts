import { ProcessingResult } from './result';
import { BubbleProcessor } from './processors/bubble.processor';
import { TextStickerProcessor } from './processors/text.processor';
import { QuoteProcessor } from './processors/quote.processor';
import { MemeProcessor } from './processors/meme.processor';
import { TtpProcessor } from './processors/ttp.processor';
import { AttpProcessor } from './processors/attp.processor';
import { ImageStickerProcessor } from './processors/image.processor';
import { addStickerExif } from './exif';
import { logger } from '../observability/logger';
import { VideoStickerProcessor } from './processors/video.processor';
import { ToImageProcessor } from './processors/toimg.processor';
import { ToGifProcessor } from './processors/togif.processor';
import { InputResolver, ResolvedInput } from './input.resolver';
import { PerUserConcurrency } from './concurrency';
import { cleanupTempFile } from '../media/temp-files';
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
  private videoSlots: PerUserConcurrency;

  constructor(videoSlots?: PerUserConcurrency) {
    this.videoSlots = videoSlots ?? new PerUserConcurrency();
  }

  private processors = {
    text: new BubbleProcessor(),
    plainText: new TextStickerProcessor(),
    quote: new QuoteProcessor(),
    meme: new MemeProcessor(),
    ttp: new TtpProcessor(),
    attp: new AttpProcessor(),
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
  }): Promise<ProcessingResult | null> {
    const { command, args, modifier, reply, media, senderName, senderId } = normalizedMessage;
    const input = this.inputResolver.resolve({ command, args, modifier, reply, media, senderName, senderId });

    if (!input) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Unsupported input type');
    }

    const timeoutMs = this.getTimeout(input.type);
    const needsSlot = input.type === 'video' || input.type === 'togif';
    const slotKey = `video:${senderId}`;
    if (needsSlot && !this.videoSlots.tryAcquire(slotKey)) {
      throw new AppError(ErrorCode.VIDEO_BUSY, 'Video masih diproses');
    }
    try {
      const isHeavy = input.type === 'video' || input.type === 'togif' || input.type === 'attp';
      let raw: ProcessingResult | null;
      if (isHeavy) {
        raw = await this.runProcessor(input, timeoutMs);
      } else {
        let timer: NodeJS.Timeout | undefined;
        try {
          raw = await Promise.race([
            this.runProcessor(input, timeoutMs),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout')), timeoutMs);
              if (typeof (timer as any).unref === 'function') (timer as any).unref();
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
      return this.withPackMeta(raw, input.type);
    } finally {
      if (needsSlot) this.videoSlots.release(slotKey);
    }
  }

  // Metadata pack WhatsApp (nama pack + emoji) untuk webp statis.
  private async withPackMeta(result: ProcessingResult | null, inputType: string): Promise<ProcessingResult | null> {
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
  private async runProcessor(input: ResolvedInput, timeoutMs: number = env.textProcessingTimeoutMs): Promise<ProcessingResult | null> {
    const content = input.content;

    switch (input.type) {
      case 'text': {
        const text = content.text ?? '';
        // Sesuai PRD: default = plain text; bubble/quote hanya bila eksplisit.
        if (input.modifier === 'quote') {
          return this.processors.quote.process(text, content.senderName);
        }
        if (input.modifier === 'bubble') {
          return this.processBubble(content);
        }
        return this.processors.plainText.process(text);
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
      case 'attp': {
        return this.processors.attp.process(content.text ?? '', timeoutMs);
      }
      case 'video': {
        if (!content.mediaUrl) {
          throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
        }
        return this.processors.video.process(content.mediaUrl, timeoutMs);
      }
      case 'toimg':
      case 'togif': {
        const url = content.mediaUrl;
        if (!url) {
          throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Reply stiker yang mau dikonversi tidak tersedia');
        }
        const { filePath } = await downloadMedia(url);
        try {
          const stickerBuffer = await fs.promises.readFile(filePath);
          if (input.type === 'toimg') {
            const meta = await Sharp(stickerBuffer).metadata();
            const isAnimated = (meta.pages ?? 1) > 1;
            return this.processors.toimg.process(stickerBuffer, isAnimated);
          }
          return await this.processors.togif.process(stickerBuffer, timeoutMs);
        } finally {
          cleanupTempFile(filePath);
        }
      }
      default:
        throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'No processor for this input');
    }
  }

  // Stiker bubble eksplisit (!stiker bubble): nama + avatar + quote.
  private async processBubble(content: ResolvedInput['content']) {
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

  private getTimeout(inputType: string): number {
    const timeouts: Record<string, number> = {
      text: env.textProcessingTimeoutMs,
      image: env.imageProcessingTimeoutMs,
      video: env.videoProcessingTimeoutMs,
      toimg: env.imageProcessingTimeoutMs,
      togif: env.videoProcessingTimeoutMs,
      meme: env.imageProcessingTimeoutMs,
      ttp: env.textProcessingTimeoutMs,
      attp: env.videoProcessingTimeoutMs,
    };
    return timeouts[inputType] || env.textProcessingTimeoutMs;
  }
}
