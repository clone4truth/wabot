import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { TtpProcessor } from '../../src/stickers/processors/ttp.processor';
import { TextStickerProcessor } from '../../src/stickers/processors/text.processor';
import { QuoteProcessor } from '../../src/stickers/processors/quote.processor';

async function whiteTextBounds(buffer: Buffer) {
  const { data, info } = await Sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = info.height;
  let bottom = -1;
  let left = info.width;
  let right = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] < 225 || data[offset + 1] < 225 || data[offset + 2] < 225 || data[offset + 3] === 0) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

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

  it('short text fills a readable area while keeping safe edges', async () => {
    const result = await processor.process('Halo', 'minimal');
    const bounds = await whiteTextBounds(result.buffer);
    expect(bounds.height).toBeGreaterThanOrEqual(80);
    expect(bounds.width).toBeGreaterThan(200);
    expect(bounds.left).toBeGreaterThanOrEqual(16);
    expect(bounds.right).toBeLessThan(496);
  });

  it('image output renders native 1024px text at twice the sticker resolution', async () => {
    const sticker = await processor.process('Halo', 'minimal');
    const image = await processor.process('Halo', 'minimal', true);
    const metadata = await Sharp(image.buffer).metadata();
    expect(image.mimetype).toBe('image/png');
    expect(image.animated).toBe(false);
    expect(metadata.format).toBe('png');
    expect(image.width).toBe(1024);
    expect(image.height).toBe(1024);
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
    const stickerBounds = await whiteTextBounds(sticker.buffer);
    const imageBounds = await whiteTextBounds(image.buffer);
    expect(imageBounds.width).toBeGreaterThanOrEqual(stickerBounds.width * 2 - 2);
    expect(imageBounds.height).toBeGreaterThanOrEqual(stickerBounds.height * 2 - 2);
    expect(image.size).toBe(image.buffer.length);
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

describe('Static text readability', () => {
  it('plain text and quotes use larger readable glyphs for short messages', async () => {
    const plain = await new TextStickerProcessor().process('Halo');
    const quote = await new QuoteProcessor().process('Halo');
    expect((await whiteTextBounds(plain.buffer)).height).toBeGreaterThanOrEqual(100);
    expect((await whiteTextBounds(quote.buffer)).height).toBeGreaterThanOrEqual(65);
    expect(plain.width).toBe(512);
    expect(quote.width).toBe(512);
  });
});
