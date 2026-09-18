import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { AttpProcessor } from '../../src/stickers/processors/attp.processor';
import { AttpGenerator } from '../../src/stickers/generators/attp.generator';
import { defaultAnimationRegistry } from '../../src/stickers/animations/registry';

describe('ATTP Animation Presets & AttpGenerator', () => {
  const processor = new AttpProcessor();
  const generator = new AttpGenerator();

  it('lists all registered animation presets', () => {
    const list = defaultAnimationRegistry.list();
    expect(list).toContain('rainbow');
    expect(list).toContain('fade');
    expect(list).toContain('zoom');
    expect(list).toContain('blink');
    expect(list).toContain('slide');
    expect(list).toContain('bounce');
  });

  it('renders default rainbow animated sticker', async () => {
    const result = await processor.process('Halo');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect((meta.pages ?? 1) > 1).toBe(true);
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 10000);

  it('renders fade animated sticker', async () => {
    const result = await processor.process('Fade Text', 'fade');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    const meta = await Sharp(result.buffer).metadata();
    expect((meta.pages ?? 1) > 1).toBe(true);
  }, 10000);

  it('renders zoom animated sticker', async () => {
    const result = await processor.process('Zoom Text', 'zoom');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    const meta = await Sharp(result.buffer).metadata();
    expect((meta.pages ?? 1) > 1).toBe(true);
  }, 10000);

  it('AttpGenerator supports attp type', () => {
    expect(generator.supports({ type: 'attp' })).toBe(true);
    expect(generator.supports({ type: 'ttp' })).toBe(false);
  });

  it('AttpGenerator processes input with options.effect', async () => {
    const context = { chatId: '123@c.us', senderId: '456@c.us' };
    const result = await generator.process(
      {
        type: 'attp',
        text: 'Gen ATTP',
        options: { effect: 'bounce' },
      },
      context
    );
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  }, 10000);

  it('AttpGenerator validates empty text', () => {
    const context = { chatId: '123@c.us', senderId: '456@c.us' };
    expect(() => generator.validate({ type: 'attp', text: '' }, context)).toThrow(
      'Teks !attp tidak boleh kosong'
    );
  });

  it('rejects unknown explicit animation effect with INVALID_ARGUMENT', () => {
    expect(() => defaultAnimationRegistry.resolve('unknown-effect')).toThrow();
    const context = { chatId: '123@c.us', senderId: '456@c.us' };
    expect(() =>
      generator.validate(
        {
          type: 'attp',
          text: 'ATTP Test',
          options: { effect: 'unknown-effect' },
        },
        context
      )
    ).toThrow();
  });
});
