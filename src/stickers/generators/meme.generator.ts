import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { MemeProcessor } from '../processors/meme.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class MemeGenerator implements StickerGenerator {
  readonly name = 'meme';
  private processor = new MemeProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'meme';
  }

  validate(input: GeneratorInput): void {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string);
    if (!mediaUrl) {
      throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Media tidak tersedia');
    }
  }

  async process(input: GeneratorInput): Promise<ProcessingResult> {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string);
    const args = (input.content?.args as string) ?? input.text ?? '';
    return this.processor.process(mediaUrl, args);
  }
}
