import { StickerResult } from './result';
import { TextStickerProcessor } from './processors/text.processor';
import { ImageStickerProcessor } from './processors/image.processor';
import { VideoStickerProcessor } from './processors/video.processor';
import { ToImageProcessor } from './processors/toimg.processor';
import { ToGifProcessor } from './processors/togif.processor';
import { InputResolver } from './input.resolver';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export class StickerService {
  private inputResolver = new InputResolver();
  private processors = {
    text: new TextStickerProcessor(),
    image: new ImageStickerProcessor(),
    video: new VideoStickerProcessor(),
    toimg: new ToImageProcessor(),
    togif: new ToGifProcessor(),
  };

  async process(normalizedMessage: {
    command: string;
    args: string;
    reply?: { body?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
    chatId: string;
    senderId: string;
    isGroup: boolean;
  }): Promise<StickerResult | null> {
    const { command, args, reply, media, chatId } = normalizedMessage;
    const input = this.inputResolver.resolve({ command, args, reply, media });

    if (!input) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Unsupported input type');
    }

    const processor = this.getProcessor(input.type);
    if (!processor) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'No processor for this input');
    }

    const timeoutMs = this.getTimeout(input.type);
    const result = await Promise.race([
      processor.process(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout')), timeoutMs)
      ),
    ]);

    return result;
  }

  private getProcessor(inputType: string) {
    const map: Record<string, any> = {
      text: this.processors.text,
      image: this.processors.image,
      video: this.processors.video,
      toimg: this.processors.toimg,
      togif: this.processors.togif,
    };
    return map[inputType];
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
