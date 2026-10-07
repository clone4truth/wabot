import { describe, it, expect, vi } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import { EmojiGenerator } from '../../src/stickers/generators/emoji.generator';
import { BadgeGenerator } from '../../src/stickers/generators/badge.generator';
import { CaptionGenerator } from '../../src/stickers/generators/caption.generator';

const dlMock = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: dlMock.downloadMedia,
  resolveMediaUrl: (u: string) => u,
}));

let counter = 0;
async function createFixtureJpg(): Promise<string> {
  const p = `/tmp/test_caption_src_${Date.now()}_${counter++}.jpg`;
  const jpg = await Sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 50, g: 100, b: 200 } },
  }).jpeg().toBuffer();
  fs.writeFileSync(p, jpg);
  dlMock.downloadMedia.mockResolvedValue({ filePath: p, mimeType: 'image/jpeg', size: jpg.length });
  return p;
}

describe('EmojiGenerator', () => {
  const generator = new EmojiGenerator();
  const context = { chatId: '123@c.us', senderId: '456@c.us' };

  it('generates sticker for single emoji', async () => {
    const result = await generator.process({ type: 'emoji', text: '😂' }, context);
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.animated).toBe(false);
  });

  it('mempertahankan warna asli emoji, bukan glyph monokrom', async () => {
    const result = await generator.process({ type: 'emoji', text: '😂' }, context);
    const { data } = await Sharp(result.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let coloredPixels = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      if (alpha > 32 && Math.max(red, green, blue) - Math.min(red, green, blue) > 20) {
        coloredPixels++;
      }
    }

    expect(coloredPixels).toBeGreaterThan(1_000);
  });

  it('generates sticker for complex emoji (flag & ZWJ)', async () => {
    const resultFlag = await generator.process({ type: 'emoji', text: '🇮🇩' }, context);
    expect(resultFlag.width).toBe(512);

    const resultZwj = await generator.process({ type: 'emoji', text: '👨‍💻' }, context);
    expect(resultZwj.width).toBe(512);
  });

  it('generates sticker for up to 4 emojis', async () => {
    const result = await generator.process({ type: 'emoji', text: '😂🔥❤️✨' }, context);
    expect(result.width).toBe(512);
  });

  it('rejects more than 4 emojis', () => {
    expect(() => generator.validate({ type: 'emoji', text: '😂🔥❤️✨🎉' }, context)).toThrow(
      /hanya menerima 1-4 emoji/i
    );
  });

  it('accepts valid emojis: pictographic, flag, ZWJ, keycap', () => {
    const validCases = ['😂', '❤️', '👨‍💻', '👨‍👩‍👧‍👦', '🇮🇩', '1️⃣'];
    for (const em of validCases) {
      expect(() => generator.validate({ type: 'emoji', text: em }, context)).not.toThrow();
    }
  });

  it('rejects non-emoji characters like plain letters or words', () => {
    const invalidCases = ['A', 'AB', 'test', '1234'];
    for (const inv of invalidCases) {
      expect(() => generator.validate({ type: 'emoji', text: inv }, context)).toThrow(
        /karakter emoji yang valid/i
      );
    }
  });

  it('rejects empty input', () => {
    expect(() => generator.validate({ type: 'emoji', text: '   ' }, context)).toThrow();
  });
});

describe('BadgeGenerator', () => {
  const generator = new BadgeGenerator();
  const context = { chatId: '123@c.us', senderId: '456@c.us' };

  it('generates status badge for ONLINE', async () => {
    const result = await generator.process({ type: 'badge', text: 'ONLINE' }, context);
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('generates status badge for ERROR', async () => {
    const result = await generator.process({ type: 'badge', text: 'ERROR' }, context);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('mempertahankan warna emoji di dalam label badge', async () => {
    const result = await generator.process({ type: 'badge', text: 'OKE 😷' }, context);
    const { data, info } = await Sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let yellowEmojiPixels = 0;
    for (let y = 210; y < 302; y++) {
      for (let x = 130; x < 470; x++) {
        const offset = (y * 512 + x) * info.channels;
        if (data[offset] > 170 && data[offset + 1] > 110 && data[offset + 2] < 100 && data[offset + 3] > 32) {
          yellowEmojiPixels++;
        }
      }
    }
    expect(yellowEmojiPixels).toBeGreaterThan(100);
  });

  it('rejects empty badge text', () => {
    expect(() => generator.validate({ type: 'badge', text: '' }, context)).toThrow(
      /tidak boleh kosong/i
    );
  });

  it('rejects badge text longer than 24 characters', () => {
    expect(() =>
      generator.validate({ type: 'badge', text: 'STATUS_YANG_TERLALU_PANJANG_UNTUK_BADGE' }, context)
    ).toThrow(/maksimal 24 karakter/i);
  });
});

describe('CaptionGenerator', () => {
  const generator = new CaptionGenerator();
  const context = { chatId: '123@c.us', senderId: '456@c.us' };

  it('generates caption bottom (default)', async () => {
    await createFixtureJpg();
    const result = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/test.jpg',
        text: 'Ini caption bawah',
      },
      context
    );
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('generates caption top', async () => {
    await createFixtureJpg();
    const result = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/test.jpg',
        text: 'Ini caption atas',
        options: { position: 'top' },
      },
      context
    );
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('generates caption overlay', async () => {
    await createFixtureJpg();
    const result = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/test.jpg',
        text: 'Ini caption overlay',
        options: { position: 'overlay' },
      },
      context
    );
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('renders adaptive layout for long caption and emoji without clipping', async () => {
    await createFixtureJpg();
    const result = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/test.jpg',
        text: 'Teks caption panjang adaptif dengan emoji 🚀✨ untuk memastikan layout banner menyesuaikan tinggi tanpa terpotong sama sekali.',
      },
      context
    );
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('rejects caption that exceeds max banner capacity with TEXT_TOO_LONG', () => {
    const tooLong = 'Kata '.repeat(80);
    expect(() =>
      generator.validate(
        { type: 'caption', mediaUrl: 'http://example.com/test.jpg', text: tooLong },
        context
      )
    ).toThrow();
  });

  it('rejects missing image mediaUrl', () => {
    expect(() =>
      generator.validate({ type: 'caption', text: 'Caption saja tanpa gambar' }, context)
    ).toThrow(/memerlukan gambar/i);
  });

  it('rejects empty caption text', () => {
    expect(() =>
      generator.validate(
        { type: 'caption', mediaUrl: 'http://example.com/test.jpg', text: '   ' },
        context
      )
    ).toThrow(/tidak boleh kosong/i);
  });
});
