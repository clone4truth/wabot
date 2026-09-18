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
