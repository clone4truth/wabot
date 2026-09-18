import { describe, it, expect, vi, beforeAll } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import { MemeProcessor } from '../../src/stickers/processors/meme.processor';

const dlMock = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: dlMock.downloadMedia,
  resolveMediaUrl: (u: string) => u,
}));

let counter = 0;
async function createFixtureImage(width = 200, height = 200): Promise<string> {
  const p = `/tmp/test_meme_fixture_${Date.now()}_${counter++}.jpg`;
  const jpg = await Sharp({
    create: { width, height, channels: 3, background: { r: 50, g: 100, b: 200 } },
  }).jpeg().toBuffer();
  fs.writeFileSync(p, jpg);
  dlMock.downloadMedia.mockResolvedValue({ filePath: p, mimeType: 'image/jpeg', size: jpg.length });
  return p;
}

describe('MemeProcessor', () => {
  const processor = new MemeProcessor();

  it('A | B -> keduanya di-render dan menghasilkan webp 512x512', async () => {
    await createFixtureImage();
    const result = await processor.process('http://x/img.jpg', 'Atas | Bawah');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('A | B | C -> bagian setelah pipe pertama tidak hilang (bottom = "B | C")', async () => {
    await createFixtureImage();
    const result = await processor.process('http://x/img.jpg', 'Top | Middle | Bottom');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
  });

  it('| B -> teks bawah saja berhasil diproses', async () => {
    await createFixtureImage();
    const result = await processor.process('http://x/img.jpg', '| Hanya Bawah');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
  });

  it('A | -> teks atas saja berhasil diproses', async () => {
    await createFixtureImage();
    const result = await processor.process('http://x/img.jpg', 'Hanya Atas |');
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
  });

  it('empty both (| atau spasi kosong) -> validation error', async () => {
    await expect(processor.process('http://x/img.jpg', '   |   ')).rejects.toMatchObject({
      code: 'UNSUPPORTED_INPUT',
    });
    await expect(processor.process('http://x/img.jpg', '')).rejects.toMatchObject({
      code: 'UNSUPPORTED_INPUT',
    });
  });

  it('100px source image -> output tetap 512x512 tanpa error', async () => {
    await createFixtureImage(100, 100);
    const result = await processor.process('http://x/img.jpg', 'Small | Image');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });
});
