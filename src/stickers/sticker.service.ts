import { StickerResult } from './result';
import { BubbleProcessor } from './processors/bubble.processor';
import { ImageStickerProcessor } from './processors/image.processor';
import { VideoStickerProcessor } from './processors/video.processor';
import { ToImageProcessor } from './processors/toimg.processor';
import { ToGifProcessor } from './processors/togif.processor';
import { InputResolver, ResolvedInput } from './input.resolver';
import { downloadMedia } from '../media/downloader';
import Sharp from 'sharp';
import fs from 'fs';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export class StickerService {
  private inputResolver = new InputResolver();
  private processors = {
    text: new BubbleProcessor(),
    image: new ImageStickerProcessor(),
    video: new VideoStickerProcessor(),
    toimg: new ToImageProcessor(),
    togif: new ToGifProcessor(),
  };

  async process(normalizedMessage: {
    command: string;
    args: string;
    reply?: { body?: string; senderId?: string; senderName?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
    chatId: string;
    senderId: string;
    senderName?: string;
    isGroup: boolean;
  }): Promise<StickerResult | null> {
    const { command, args, reply, media, senderName, senderId } = normalizedMessage;
    const input = this.inputResolver.resolve({ command, args, reply, media, senderName, senderId });

    if (!input) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Unsupported input type');
    }

    const timeoutMs = this.getTimeout(input.type);
    const result = await Promise.race([
      this.runProcessor(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout')), timeoutMs)
      ),
    ]);

    return result;
  }

  // Ekstrak argumen primitif dari ResolvedInput sesuai signature tiap prosesor.
  private async runProcessor(input: ResolvedInput): Promise<StickerResult | null> {
    const content = input.content;

    switch (input.type) {
      case 'text': {
        const quoted = content.quotedBody
          ? { senderName: content.quotedSenderName || '?', senderId: content.quotedSenderId, body: content.quotedBody }
          : undefined;
        return this.processors.text.process(content.text ?? '', content.senderName, content.senderId, quoted);
      }
      case 'image': {
        if (!content.mediaUrl) {
          throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
        }
        return this.processors.image.process(content.mediaUrl, input.modifier ?? 'full');
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
    };
    return timeouts[inputType] || env.textProcessingTimeoutMs;
  }
}
