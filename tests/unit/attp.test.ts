import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { AttpProcessor } from '../../src/stickers/processors/attp.processor';

describe('AttpProcessor (teks animasi)', () => {
  it('menghasilkan webp animasi 8 frame', async () => {
    const result = await new AttpProcessor().process('halo dunia');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.pages).toBe(8);
  }, 60000);

  it('teks kosong ditolak dengan jelas', async () => {
    await expect(new AttpProcessor().process('   ')).rejects.toThrow();
  });
});
