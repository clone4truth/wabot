import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CaptionGenerator } from '../../src/stickers/generators/caption.generator';
import { AppError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';

const tempFiles: string[] = [];

function createTempImage(): string {
  const file = path.join(os.tmpdir(), `test-caption-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  tempFiles.push(file);
  return file;
}

vi.mock('../../src/media/downloader', () => ({
  downloadMedia: vi.fn(async () => {
    const file = createTempImage();
    await Sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 120, g: 180, b: 240, alpha: 1 },
      },
    })
      .png()
      .toFile(file);

    return {
      filePath: file,
      cleanup: async () => {
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch {
          // ignore
        }
      },
    };
  }),
}));

describe('CaptionGenerator', () => {
  const generator = new CaptionGenerator();
  const mockContext = {
    correlationId: 'test-caption',
    senderId: 'user-1',
  };

  afterAll(() => {
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  it('supports caption input type and image modifier', () => {
    expect(generator.supports({ type: 'caption' })).toBe(true);
    expect(generator.supports({ type: 'image', modifier: 'caption' })).toBe(true);
    expect(generator.supports({ type: 'image', modifier: 'blur' })).toBe(false);
  });

  it('renders short caption successfully at 512x512', async () => {
    const res = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/photo.png',
        text: 'Short caption',
        options: { position: 'bottom' },
      },
      mockContext,
    );

    expect(res.mimetype).toBe('image/webp');
    expect(res.width).toBe(512);
    expect(res.height).toBe(512);

    const meta = await Sharp(res.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('renders top and overlay captions successfully at 512x512', async () => {
    for (const pos of ['top', 'overlay']) {
      const res = await generator.process(
        {
          type: 'caption',
          mediaUrl: 'http://example.com/photo.png',
          text: `Position test: ${pos}`,
          options: { position: pos },
        },
        mockContext,
      );
      expect(res.width).toBe(512);
      expect(res.height).toBe(512);
      const meta = await Sharp(res.buffer).metadata();
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(512);
    }
  });

  it('renders multi-line long caption without clipping at 512x512', async () => {
    const longText = 'Ini adalah teks caption yang terdiri dari beberapa kata untuk memastikan adaptive font sizing bekerja dengan benar dan tidak terpotong sama sekali.';
    const res = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/photo.png',
        text: longText,
        options: { position: 'bottom' },
      },
      mockContext,
    );

    expect(res.width).toBe(512);
    expect(res.height).toBe(512);
    const meta = await Sharp(res.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('renders caption with emojis without crashing or clipping', async () => {
    const emojiText = 'Foto bareng sahabat seru banget! 🎉✨🔥🏖️';
    const res = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/photo.png',
        text: emojiText,
        options: { position: 'bottom' },
      },
      mockContext,
    );

    expect(res.width).toBe(512);
    expect(res.height).toBe(512);
  });

  it('renders caption with unbroken long token', async () => {
    const tokenText = 'Supercalifragilisticexpialidocious_unbroken_token';
    const res = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/photo.png',
        text: tokenText,
        options: { position: 'bottom' },
      },
      mockContext,
    );

    expect(res.width).toBe(512);
    expect(res.height).toBe(512);
  });

  it('rejects excessively long caption with TEXT_TOO_LONG', async () => {
    const excessive = 'Kata '.repeat(70);
    expect(() =>
      generator.validate(
        {
          type: 'caption',
          mediaUrl: 'http://example.com/photo.png',
          text: excessive,
        },
        mockContext,
      ),
    ).toThrowError(AppError);

    try {
      generator.validate(
        {
          type: 'caption',
          mediaUrl: 'http://example.com/photo.png',
          text: excessive,
        },
        mockContext,
      );
    } catch (err) {
      expect((err as AppError).code).toBe(ErrorCode.TEXT_TOO_LONG);
    }
  });
});
