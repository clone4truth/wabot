import { StickerGenerator, GeneratorInput } from './types';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class GeneratorRegistry {
  private generators = new Map<string, StickerGenerator>();

  register(generator: StickerGenerator): void {
    const key = generator.name.toLowerCase();
    if (this.generators.has(key)) {
      throw new Error(`Generator with name "${generator.name}" is already registered`);
    }
    this.generators.set(key, generator);
  }

  resolve(input: GeneratorInput): StickerGenerator {
    for (const generator of this.generators.values()) {
      if (generator.supports(input)) {
        return generator;
      }
    }
    throw new AppError(ErrorCode.UNSUPPORTED_INPUT, `No generator found for input type "${input.type}"`);
  }

  get(name: string): StickerGenerator | undefined {
    return this.generators.get(name.toLowerCase());
  }

  getAll(): StickerGenerator[] {
    return Array.from(this.generators.values());
  }
}

import { TextGenerator } from './text.generator';
import { ImageGenerator } from './image.generator';
import { VideoGenerator } from './video.generator';
import { MemeGenerator } from './meme.generator';
import { TtpGenerator } from './ttp.generator';
import { AttpGenerator } from './attp.generator';
import { TemplateGenerator } from './template.generator';
import { EmojiGenerator } from './emoji.generator';
import { BadgeGenerator } from './badge.generator';
import { CaptionGenerator } from './caption.generator';
import { RemoveBgGenerator } from './removebg.generator';
import { ToImageGenerator } from './toimg.generator';
import { ToGifGenerator } from './togif.generator';

export function createDefaultGeneratorRegistry(): GeneratorRegistry {
  const registry = new GeneratorRegistry();
  // Order matters for multi-type support: specialized generators first
  registry.register(new CaptionGenerator());
  registry.register(new RemoveBgGenerator());
  registry.register(new TemplateGenerator());
  registry.register(new EmojiGenerator());
  registry.register(new BadgeGenerator());
  registry.register(new TtpGenerator());
  registry.register(new AttpGenerator());
  registry.register(new MemeGenerator());
  registry.register(new VideoGenerator());
  registry.register(new ToImageGenerator());
  registry.register(new ToGifGenerator());
  registry.register(new TextGenerator());
  registry.register(new ImageGenerator());
  return registry;
}

export const defaultGeneratorRegistry = createDefaultGeneratorRegistry();
