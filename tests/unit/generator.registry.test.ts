import { describe, it, expect } from 'vitest';
import { GeneratorRegistry } from '../../src/stickers/generators/registry';
import { StickerGenerator, GeneratorInput, GeneratorContext } from '../../src/stickers/generators/types';
import { ProcessingResult } from '../../src/stickers/result';
import { ErrorCode } from '../../src/errors/error-codes';

class MockGenerator implements StickerGenerator {
  constructor(public readonly name: string, private supportedType: string) { }

  supports(input: GeneratorInput): boolean {
    return input.type === this.supportedType;
  }

  validate(): void { }

  async process(): Promise<ProcessingResult> {
    return {
      buffer: Buffer.from('mock'),
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: 4,
    };
  }
}

describe('GeneratorRegistry', () => {
  it('berhasil meregister dan me-resolve generator yang cocok', () => {
    const registry = new GeneratorRegistry();
    const textGen = new MockGenerator('text', 'text');
    const imageGen = new MockGenerator('image', 'image');

    registry.register(textGen);
    registry.register(imageGen);

    expect(registry.get('text')).toBe(textGen);
    expect(registry.resolve({ type: 'text' })).toBe(textGen);
    expect(registry.resolve({ type: 'image' })).toBe(imageGen);
    expect(registry.getAll().length).toBe(2);
  });

  it('menolak registrasi generator dengan nama duplikat', () => {
    const registry = new GeneratorRegistry();
    const gen1 = new MockGenerator('dup', 'type1');
    const gen2 = new MockGenerator('dup', 'type2');

    registry.register(gen1);
    expect(() => registry.register(gen2)).toThrow(/already registered/i);
  });

  it('melempar UNSUPPORTED_INPUT jika tidak ada generator yang mendukung input', () => {
    const registry = new GeneratorRegistry();
    registry.register(new MockGenerator('text', 'text'));

    expect(() => registry.resolve({ type: 'unknown_type' })).toThrowError();
    try {
      registry.resolve({ type: 'unknown_type' });
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.UNSUPPORTED_INPUT);
    }
  });
});
