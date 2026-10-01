import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { ImageStickerProcessor } from '../processors/image.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class ImageGenerator implements StickerGenerator {
  readonly name = 'image';
  private processor = new ImageStickerProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'image';
  }

  validate(input: GeneratorInput): void {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string);
    if (!mediaUrl) {
      throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
    }
  }

  async process(input: GeneratorInput): Promise<ProcessingResult> {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string);
    const modifier = input.modifier ?? 'full';
    // Teruskan deadline ke processor. Tanpa ini, `!stiker` pada media yang
    // stalling akan menahan slot JobManager tanpa batas (JobManager hanya
    // melepas slot di .finally(), tidak pernah force-reject).
    return this.processor.process(mediaUrl, modifier, input.timeoutMs, input.signal);
  }
}
