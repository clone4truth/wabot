import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { TtpProcessor } from '../processors/ttp.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { resolveTtpStyle } from '../ttp/styles';

export class TtpGenerator implements StickerGenerator {
  readonly name = 'ttp';

  private processor = new TtpProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'ttp';
  }

  validate(input: GeneratorInput, _context: GeneratorContext): void {
    const text = (input.text ?? input.content?.text) as string | undefined;
    if (!text || !text.trim()) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, 'Teks !ttp tidak boleh kosong');
    }
    const style = (input.options?.style ?? input.content?.style) as string | undefined;
    if (style) {
      resolveTtpStyle(style);
    }
  }

  async process(input: GeneratorInput, _context: GeneratorContext): Promise<ProcessingResult> {
    const text = (input.text ?? input.content?.text ?? '') as string;
    const style = (input.options?.style ?? input.content?.style) as string | undefined;
    return this.processor.process(text, style);
  }
}
