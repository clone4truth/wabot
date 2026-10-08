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

  it('LocalBackgroundRemovalProvider preserves a foreground object and removes its background', async () => {
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

  it('removes a varied photographic background offline while the event loop remains responsive', async () => {
    const input = fs.readFileSync('tests/fixtures/background-removal/astronaut.png');
    let ticks = 0;
    const timer = setInterval(() => ticks++, 25);
    let output: Buffer;
    try {
      output = await new LocalBackgroundRemovalProvider().removeBackground(input);
    } finally {
      clearInterval(timer);
    }
    const { data, info } = await Sharp(output!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    // Gray wall, purple flag and gold rocket all disappear; skin, black
    // collar and helmet remain, independent of their RGB corner colors.
    for (const [x, y] of [[0, 0], [50, 50], [400, 50]]) expect(alpha(x, y)).toBeLessThan(10);
    for (const [x, y] of [[220, 100], [180, 250], [300, 450]]) expect(alpha(x, y)).toBeGreaterThan(240);
    expect(ticks).toBeGreaterThan(10);
  }, 15_000);

  it('keeps existing transparent cutout details without re-segmenting them', async () => {
    const input = await Sharp(Buffer.from(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="30" fill="white"/><circle cx="50" cy="50" r="10" fill="black"/>
    </svg>`)).png().toBuffer();
    const output = await new LocalBackgroundRemovalProvider().removeBackground(input);
    const before = await Sharp(input).ensureAlpha().raw().toBuffer();
    const after = await Sharp(output).ensureAlpha().raw().toBuffer();
    expect(after).toEqual(before);
  });

  it('terminates cancelled inference and can process the next job with a fresh worker', async () => {
    const { buffer } = await createFixtureImageWithCircle();
    const provider = new LocalBackgroundRemovalProvider();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50);
    try {
      await expect(provider.removeBackground(buffer, { signal: controller.signal })).rejects.toMatchObject({
        code: ErrorCode.PROCESSING_TIMEOUT,
      });
    } finally {
      clearTimeout(timer);
    }
    const output = await provider.removeBackground(buffer);
    const { data } = await Sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[(100 * 200 + 100) * 4 + 3]).toBeGreaterThan(200);
  }, 15_000);

  it('honors an expired local processing budget', async () => {
    const { buffer } = await createFixtureImageWithCircle();
    await expect(new LocalBackgroundRemovalProvider().removeBackground(buffer, { timeoutMs: 0 })).rejects.toMatchObject({
      code: ErrorCode.PROCESSING_TIMEOUT,
    });
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
    // The original subject spans only 80/200px. It should now fill the safe
    // area rather than retain the removed background's empty padding.
    const { info } = await Sharp(result.buffer).trim({ threshold: 10 })
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBeGreaterThan(450);
    expect(info.height).toBeGreaterThan(450);
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

    const { data, info } = await Sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // The outline must follow the subject, leaving the canvas corners transparent.
    for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) {
      expect(data[(y * info.width + x) * info.channels + 3]).toBe(0);
    }
    const center = (256 * info.width + 256) * info.channels;
    expect(data[center]).toBeGreaterThan(220);
    expect(data[center + 1]).toBeLessThan(40);

    let whiteOutlinePixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset] > 220 && data[offset + 1] > 220 && data[offset + 2] > 220 && data[offset + 3] > 220) {
        whiteOutlinePixels++;
      }
    }
    expect(whiteOutlinePixels).toBeGreaterThan(5_000);
    expect(whiteOutlinePixels).toBeLessThan(50_000);
  });

  it('rejects input without mediaUrl', () => {
    const generator = new RemoveBgGenerator();
    expect(() => generator.validate({ type: 'removebg' }, context)).toThrow();
  });
});
