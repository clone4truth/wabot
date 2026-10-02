import { describe, it, expect, vi, beforeAll } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import { ImageStickerProcessor } from '../../src/stickers/processors/image.processor';
import { ErrorCode } from '../../src/errors/error-codes';

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

  it('gambar invalid konten -> MEDIA_DECODE_FAILED dan file temp langsung dibersihkan', async () => {
    const p = `/tmp/test_invalid_img_${Date.now()}_${counter++}.jpg`;
    fs.writeFileSync(p, Buffer.from('bukan-file-gambar-yang-bisa-didecode'));
    dlMock.downloadMedia.mockResolvedValueOnce({ filePath: p, mimeType: 'image/jpeg', size: 36 });

    await expect(new ImageStickerProcessor().process('http://x/invalid.jpg')).rejects.toMatchObject({
      code: ErrorCode.MEDIA_DECODE_FAILED,
    });

    // File temp harus langsung tidak ada di filesystem (tanpa menunggu TTL)
    expect(fs.existsSync(p)).toBe(false);
  });

  it('full enlarges visible content by removing transparent outer padding', async () => {
    const p = `/tmp/test_transparent_img_${Date.now()}_${counter++}.png`;
    const png = await Sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect x="320" y="320" width="160" height="160" fill="black"/></svg>')).png().toBuffer();
    fs.writeFileSync(p, png);
    dlMock.downloadMedia.mockResolvedValue({ filePath: p, mimeType: 'image/png', size: png.length });
    const result = await new ImageStickerProcessor().process('http://x/a.png', 'full');
    expect(await alphaAt(result.buffer, 0.1, 0.5)).toBeGreaterThan(200);
    expect(await alphaAt(result.buffer, 0.01, 0.5)).toBe(0);
    expect(fs.existsSync(p)).toBe(false);
  });

  it('trim enlarges content with uniform opaque borders', async () => {
    const p = `/tmp/test_white_margin_${Date.now()}_${counter++}.png`;
    const png = await Sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="white"/><rect x="320" y="320" width="160" height="160" fill="black"/></svg>')).png().toBuffer();
    fs.writeFileSync(p, png);
    dlMock.downloadMedia.mockResolvedValue({ filePath: p, mimeType: 'image/png', size: png.length });
    const result = await new ImageStickerProcessor().process('http://x/a.png', 'trim');
    const { data } = await Sharp(result.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(data[0]).toBeLessThan(30);
    expect(fs.existsSync(p)).toBe(false);
  });
});
