import { StickerTemplate } from './types';
import {
  TerminalTemplate,
  BreakingTemplate,
  WantedTemplate,
  MinimalTemplate,
} from './builtin.templates';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class TemplateRegistry {
  private templates = new Map<string, StickerTemplate>();

  constructor() {
    this.register(new TerminalTemplate());
    this.register(new BreakingTemplate());
    this.register(new WantedTemplate());
    this.register(new MinimalTemplate());
  }

  register(template: StickerTemplate): void {
    const key = template.name?.trim().toLowerCase();
    if (!key) {
      throw new Error('Template name cannot be empty');
    }
    if (this.templates.has(key)) {
      throw new Error(`Template "${key}" already registered`);
    }
    this.templates.set(key, template);
  }

  get(name: string): StickerTemplate | undefined {
    return this.templates.get(name.toLowerCase());
  }

  has(name: string): boolean {
    return this.templates.has(name.toLowerCase());
  }

  resolve(name: string): StickerTemplate {
    const tpl = this.get(name);
    if (!tpl) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_INPUT,
        `Template "${name}" tidak ditemukan. Gunakan !template list untuk melihat daftar template.`,
        { userMessage: `❌ Template "${name}" tidak ditemukan. Ketik !template list.` },
      );
    }
    return tpl;
  }

  list(): Array<{ name: string; description: string; supportedInput: string }> {
    return Array.from(this.templates.values()).map((t) => ({
      name: t.name,
      description: t.description,
      supportedInput: t.supportedInput,
    }));
  }
}

export const defaultTemplateRegistry = new TemplateRegistry();
