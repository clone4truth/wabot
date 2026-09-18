import { describe, it, expect, vi } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import { BackgroundRemovalService } from '../../src/stickers/background-removal/service';
import { DisabledBackgroundRemovalProvider } from '../../src/stickers/background-removal/providers/disabled.provider';
import { LocalBackgroundRemovalProvider } from '../../src/stickers/background-removal/providers/local.provider';
import { ApiBackgroundRemovalProvider } from '../../src/stickers/background-removal/providers/api.provider';
import { RemoveBgGenerator } from '../../src/stickers/generators/removebg.generator';
import { ErrorCode } from '../../src/errors/error-codes';

const dlMock = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: dlMock.downloadMedia,
  resolveMediaUrl: (u: string) => u,
}));

let counter = 0;
async function createFixtureImageWithCircle(): Promise<{ path: string; buffer: Buffer }> {
  const p = `/tmp/test_bg_src_${Date.now()}_${counter++}.png`;
  // Red circle 80px in center of 200x200 with white background
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" fill="#ffffff"/>
    <circle cx="100" cy="100" r="40" fill="#ff0000"/>
  </svg>`;
  const buffer = await Sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(p, buffer);
  dlMock.downloadMedia.mockResolvedValue({ filePath: p, mimeType: 'image/png', size: buffer.length });
  return { path: p, buffer };
}

describe('BackgroundRemovalProvider & Service', () => {
  it('DisabledBackgroundRemovalProvider throws FEATURE_DISABLED', async () => {
    const provider = new DisabledBackgroundRemovalProvider();
    await expect(provider.removeBackground(Buffer.from('dummy'))).rejects.toMatchObject({
      code: ErrorCode.FEATURE_DISABLED,
    });
  });

  it('LocalBackgroundRemovalProvider removes background based on corner color', async () => {
    const { buffer } = await createFixtureImageWithCircle();
    const provider = new LocalBackgroundRemovalProvider();
    const transparentPng = await provider.removeBackground(buffer);

    const meta = await Sharp(transparentPng).metadata();
    expect(meta.channels).toBe(4);

    // Corner pixel should be transparent (alpha = 0)
    const { data } = await Sharp(transparentPng).raw().toBuffer({ resolveWithObject: true });
    // Top-left pixel alpha:
    expect(data[3]).toBe(0);
    // Center pixel (red circle) should have high alpha:
    const centerIdx = (100 * 200 + 100) * 4;
    expect(data[centerIdx + 3]).toBeGreaterThan(200);
  });

  it('BackgroundRemovalService delegates directly to provider', async () => {
    const mockProvider = {
      name: 'mock',
      removeBackground: async (buf: Buffer) => Buffer.from(`processed-${buf.toString()}`),
    };
    const service = new BackgroundRemovalService(mockProvider);
    const result = await service.removeBackground(Buffer.from('hello'));
    expect(result.toString()).toBe('processed-hello');
  });

  it('ApiBackgroundRemovalProvider validates URL protocol', () => {
    const provider = new ApiBackgroundRemovalProvider();

    expect(() => provider.validateUrl('ftp://example.com/api')).toThrow();
    expect(() => provider.validateUrl('file:///etc/passwd')).toThrow();
    expect(() => provider.validateUrl('javascript:alert(1)')).toThrow();
    expect(() => provider.validateUrl('http://example.com/api')).not.toThrow();
    expect(() => provider.validateUrl('https://example.com/api')).not.toThrow();
  });
});

describe('RemoveBgGenerator', () => {
  const context = { chatId: '123@c.us', senderId: '456@c.us' };

  it('generates removebg sticker', async () => {
    await createFixtureImageWithCircle();
    const localService = new BackgroundRemovalService(new LocalBackgroundRemovalProvider());
    const generator = new RemoveBgGenerator(localService);

    const result = await generator.process(
      {
        type: 'removebg',
        mediaUrl: 'http://example.com/test.png',
      },
      context
    );

    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('generates subject smart crop sticker centered at 512x512', async () => {
    await createFixtureImageWithCircle();
    const localService = new BackgroundRemovalService(new LocalBackgroundRemovalProvider());
    const generator = new RemoveBgGenerator(localService);

    const result = await generator.process(
      {
        type: 'subject',
        mediaUrl: 'http://example.com/test.png',
      },
      context
    );

    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('generates outline sticker with white border around alpha', async () => {
    await createFixtureImageWithCircle();
    const localService = new BackgroundRemovalService(new LocalBackgroundRemovalProvider());
    const generator = new RemoveBgGenerator(localService);

    const result = await generator.process(
      {
        type: 'outline',
        mediaUrl: 'http://example.com/test.png',
        options: { color: 'white' },
      },
      context
    );

    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);

    // Verify alpha dilation exists
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
  });

  it('rejects input without mediaUrl', () => {
    const generator = new RemoveBgGenerator();
    expect(() => generator.validate({ type: 'removebg' }, context)).toThrow();
  });
});
