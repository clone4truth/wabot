import { describe, it, expect, vi, beforeAll } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import { ImageStickerProcessor } from '../../src/stickers/processors/image.processor';

const dlMock = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: dlMock.downloadMedia,
  resolveMediaUrl: (u: string) => u,
}));

async function alphaAt(webp: Buffer, fx: number, fy: number): Promise<number> {
  const { data, info } = await Sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(fx * info.width);
  const y = Math.floor(fy * info.height);
  return data[(y * info.width + x) * info.channels + 3];
}

let counter = 0;

async function fixtureJpg(): Promise<string> {
  const p = `/tmp/test_circle_src_${Date.now()}_${counter++}.jpg`;
  const jpg = await Sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } },
  }).jpeg().toBuffer();
  fs.writeFileSync(p, jpg);
  dlMock.downloadMedia.mockResolvedValue({ filePath: p, mimeType: 'image/jpeg', size: jpg.length });
  return p;
}

describe('ImageStickerProcessor circle mask', () => {
  it('tengah terlihat, sudut transparan, dimensi 512x512', async () => {
    await fixtureJpg();
    const result = await new ImageStickerProcessor().process('http://x/a.jpg', 'circle');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(await alphaAt(result.buffer, 0.5, 0.5)).toBeGreaterThan(200);
    expect(await alphaAt(result.buffer, 0.01, 0.01)).toBe(0);
  });

  it('crop: dimensi 512x512 tanpa padding transparan di tepi', async () => {
    await fixtureJpg();
    const result = await new ImageStickerProcessor().process('http://x/a.jpg', 'crop');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(await alphaAt(result.buffer, 0.5, 0.5)).toBeGreaterThan(200);
  });


  it('full: dimensi 512 dan sudut transparan untuk portrait', async () => {
    const p = `/tmp/test_portrait_${Date.now()}.jpg`;
    const jpg = await Sharp({
      create: { width: 200, height: 400, channels: 3, background: { r: 30, g: 200, b: 30 } },
    }).jpeg().toBuffer();
    fs.writeFileSync(p, jpg);
    dlMock.downloadMedia.mockResolvedValue({ filePath: p, mimeType: 'image/jpeg', size: jpg.length });
    const result = await new ImageStickerProcessor().process('http://x/a.jpg', 'full');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    // Contain: bar transparan di kiri-kanan.
    expect(await alphaAt(result.buffer, 0.01, 0.5)).toBe(0);
    expect(await alphaAt(result.buffer, 0.5, 0.5)).toBeGreaterThan(200);
  });
});
