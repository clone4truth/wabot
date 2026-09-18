import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { AttpProcessor } from '../processors/attp.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { defaultAnimationRegistry } from '../animations/registry';

export class AttpGenerator implements StickerGenerator {
  readonly name = 'attp';

  private processor = new AttpProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'attp';
  }

  validate(input: GeneratorInput, _context: GeneratorContext): void {
    const text = (input.text ?? input.content?.text) as string | undefined;
    if (!text || !text.trim()) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, 'Teks !attp tidak boleh kosong');
    }
    const effect = (input.options?.effect ?? input.options?.preset ?? input.content?.effect) as string | undefined;
    if (effect) {
      defaultAnimationRegistry.resolve(effect);
    }
  }

  async process(input: GeneratorInput, _context: GeneratorContext): Promise<ProcessingResult> {
    const text = (input.text ?? input.content?.text ?? '') as string;
    const effect = (input.options?.effect ?? input.options?.preset ?? input.content?.effect) as string | undefined;
    return this.processor.process(text, {
      effect,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });
  }
}
