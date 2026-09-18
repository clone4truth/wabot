import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { VideoStickerProcessor } from '../processors/video.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import env from '../../config/env';

export class VideoGenerator implements StickerGenerator {
  readonly name = 'video';
  private processor = new VideoStickerProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'video';
  }

  validate(input: GeneratorInput): void {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string);
    if (!mediaUrl) {
      throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
    }
  }

  async process(input: GeneratorInput): Promise<ProcessingResult> {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string);
    const timeoutMs = input.timeoutMs ?? env.videoProcessingTimeoutMs;
    return this.processor.process(mediaUrl, timeoutMs);
  }
}
