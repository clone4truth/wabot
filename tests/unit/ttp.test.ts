import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { TtpProcessor } from '../../src/stickers/processors/ttp.processor';

describe('TtpProcessor (Text-to-Picture adaptif)', () => {
  const processor = new TtpProcessor();

  it('teks pendek -> menghasilkan webp statis 512x512', async () => {
    const result = await processor.process('Halo');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(false);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('teks 300 karakter muat atau controlled TEXT_TOO_LONG', async () => {
    const text300 = 'kata '.repeat(60).trim();
    try {
      const result = await processor.process(text300);
      expect(result.width).toBe(512);
      expect(result.height).toBe(512);
    } catch (err: any) {
      expect(err.code).toBe('TEXT_TOO_LONG');
    }
  });

  it('teks dengan emoji tidak crash', async () => {
    const result = await processor.process('Warna warni 😂🔥💪🇮🇩');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('teks berawalan kata reserved (quote hello) diproses penuh', async () => {
    const result = await processor.process('quote hello');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('teks kosong ditolak', async () => {
    await expect(processor.process('   ')).rejects.toMatchObject({
      code: 'UNSUPPORTED_INPUT',
    });
  });
});
