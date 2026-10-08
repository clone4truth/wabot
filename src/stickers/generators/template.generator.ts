import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { defaultTemplateRegistry } from '../templates/registry';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class TemplateGenerator implements StickerGenerator {
  readonly name = 'template';

  supports(input: GeneratorInput): boolean {
    return input.type === 'template';
  }

  validate(input: GeneratorInput): void {
    const templateName = this.templateName(input);
    if (!templateName) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_INPUT,
        'Nama template harus ditentukan. Gunakan !template list.',
        { userMessage: '❌ Tentukan nama template. Ketik !template list.' },
      );
    }
  }

  async process(input: GeneratorInput): Promise<ProcessingResult> {
    const templateName = this.templateName(input);
    const text = input.text ?? (input.content?.text as string) ?? '';
    const template = defaultTemplateRegistry.resolve(templateName);
    return template.render({ text });
  }

  private templateName(input: GeneratorInput): string {
    return (input.options?.template as string) ?? (input.content?.template as string)
      ?? (input.modifier !== 'template' ? input.modifier : undefined) ?? '';
  }
}
