import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { AttpProcessor } from '../../src/stickers/processors/attp.processor';

describe('AttpProcessor (teks animasi)', () => {
  it('menghasilkan webp animasi 8 frame dengan dimensi aktual 512x512', async () => {
    const result = await new AttpProcessor().process('halo dunia');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.pages).toBe(8);
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 60000);

  it('mendukung teks panjang secara adaptif tanpa crash', async () => {
    const result = await new AttpProcessor().process('Teks animasi yang cukup panjang untuk menguji adaptive font scaling pada attp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(meta.pages).toBe(8);
  }, 60000);

  it('mendukung teks dengan emoji dan kata awalan reserved', async () => {
    const result = await new AttpProcessor().process('bubble error 😂🔥');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 60000);


  it('teks kosong ditolak dengan jelas', async () => {
    await expect(new AttpProcessor().process('   ')).rejects.toThrow();
  });

  it('timeout -> PROCESSING_TIMEOUT + workspace bersih', async () => {
    const env = (await import('../../src/config/env')).default;
    const fs = await import('fs');
    const before = new Set(fs.readdirSync(env.tempDir).filter((f: string) => f.startsWith('attp-')));
    await expect(new AttpProcessor().process('halo dunia', 50)).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
    });
    const leaked = fs.readdirSync(env.tempDir).filter((f: string) => f.startsWith('attp-') && !before.has(f));
    expect(leaked).toEqual([]);
  }, 60000);
});
