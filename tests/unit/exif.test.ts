import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { buildStickerExif, addStickerExif } from '../../src/stickers/exif';

describe('EXIF pack stiker WhatsApp', () => {
  it('buildStickerExif memuat pack-id + emoji', () => {
    const exif = buildStickerExif({ packName: 'PackSaya', emojis: ['😂'] });
    const s = exif.toString('binary');
    expect(s.startsWith('Exif\0\0')).toBe(true);
    expect(s).toContain('sticker-pack-id');
    expect(s).toContain('PackSaya');
  });

  it('addStickerExif menempel metadata tanpa merusak webp', async () => {
    const plain = await Sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
    }).webp().toBuffer();
    const out = await addStickerExif(plain, { packName: 'PackSaya', emojis: ['😂'] });
    expect(out.slice(0, 4).toString()).toBe('RIFF');
    const s = out.toString('binary');
    expect(s).toContain('sticker-pack-id');
    expect(s).toContain('PackSaya');
  });
});
