import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { defaultEffectRegistry } from '../../src/stickers/effects/registry';

describe('Image Effects', () => {
  it('semua built-in effects terdaftar di registry', () => {
    const effects = ['blur', 'grayscale', 'sepia', 'invert', 'pixel', 'sharpen', 'shadow'];
    for (const name of effects) {
      expect(defaultEffectRegistry.has(name)).toBe(true);
      expect(defaultEffectRegistry.get(name)?.name).toBe(name);
    }
  });

  it('menerapkan blur effect menghasilkan buffer gambar valid', async () => {
    const input = Sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    });
    const effect = defaultEffectRegistry.get('blur')!;
    const processed = await effect.apply(input, { radius: 5 });
    const meta = await processed.metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it('menerapkan grayscale, sepia, invert, sharpen, pixel, shadow', async () => {
    const rawPng = await Sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 1 } },
    }).png().toBuffer();
    const createBase = () => Sharp(rawPng);

    for (const name of ['grayscale', 'sepia', 'invert', 'sharpen', 'pixel', 'shadow']) {
      const effect = defaultEffectRegistry.get(name)!;
      const result = await effect.apply(createBase());
      const buf = await result.png().toBuffer();
      const meta = await Sharp(buf).metadata();
      expect(meta.width).toBeGreaterThan(0);
      expect(meta.height).toBeGreaterThan(0);
    }
  });
});
