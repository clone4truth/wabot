import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { VideoStickerProcessor } from '../../src/stickers/processors/video.processor';
import { ToImageProcessor } from '../../src/stickers/processors/toimg.processor';
import { ToGifProcessor } from '../../src/stickers/processors/togif.processor';
import { AppError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';

const dlMock = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: dlMock.downloadMedia,
  resolveMediaUrl: (u: string) => u,
}));

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vidfix-'));
const files: Record<string, string> = {};

function serveAsTemp(name: string): string {
  const tmp = path.join(workdir, `dl_${Date.now()}_${Math.random().toString(36).slice(2)}_${name}`);
  fs.copyFileSync(path.join(workdir, name), tmp);
  return tmp;
}

describe('Video + konversi sticker (fixtures lokal)', () => {
  beforeAll(() => {
    execSync(`ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=2:size=320x240:rate=10 -c:v mpeg4 ${workdir}/short.mp4`);
    execSync(`ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=2:size=240x320:rate=10 -c:v mpeg4 ${workdir}/portrait.mp4`);
    execSync(`ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=11:size=320x240:rate=10 -c:v mpeg4 ${workdir}/long.mp4`);
    files['short.mp4'] = `${workdir}/short.mp4`;
    files['portrait.mp4'] = `${workdir}/portrait.mp4`;
    files['long.mp4'] = `${workdir}/long.mp4`;
    dlMock.downloadMedia.mockImplementation(async (url: string) => {
      const name = String(url).split('/').pop() || '';
      const src = files[name];
      if (!src) throw new Error('404');
      const tmp = serveAsTemp(name);
      return { filePath: tmp, mimeType: 'video/mp4', size: fs.statSync(tmp).size };
    });
  }, 120000);

  afterAll(() => {
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('video pendek -> webp animasi valid + temp dibersihkan', async () => {
    const before = new Set(fs.readdirSync(os.tmpdir()));
    const result = await new VideoStickerProcessor().process('http://x/short.mp4');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.pages).toBeGreaterThan(1);
    expect(meta.width).toBeLessThanOrEqual(512);
    expect(meta.height).toBeLessThanOrEqual(512);
    await new Promise((r) => setTimeout(r, 100));
    const leaked = fs.readdirSync(os.tmpdir()).filter((f) => !before.has(f) && (f.endsWith('.mp4') || f.endsWith('.webp')));
    expect(leaked).toEqual([]);
  }, 60000);

  it('video portrait -> output <= 512x512', async () => {
    const result = await new VideoStickerProcessor().process('http://x/portrait.mp4');
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(512);
    expect(meta.height).toBeLessThanOrEqual(512);
  }, 60000);

  it('video > 10 detik -> VIDEO_TOO_LONG (bukan silent trim)', async () => {
    await expect(new VideoStickerProcessor().process('http://x/long.mp4')).rejects.toMatchObject({
      code: ErrorCode.VIDEO_TOO_LONG,
    });
  }, 60000);

  it('video rusak -> error + temp dibersihkan', async () => {
    dlMock.downloadMedia.mockImplementationOnce(async () => {
      const tmp = path.join(workdir, 'corrupt.mp4');
      fs.writeFileSync(tmp, Buffer.from('bukan-video'));
      return { filePath: tmp, mimeType: 'video/mp4', size: 11 };
    });
    await expect(new VideoStickerProcessor().process('http://x/corrupt.mp4')).rejects.toBeInstanceOf(AppError);
    expect(fs.existsSync(path.join(workdir, 'corrupt.mp4'))).toBe(false);
  }, 60000);

  it('!toimg: static -> PNG berdimensi; animated -> ditolak', async () => {
    const png = await Sharp({ create: { width: 100, height: 80, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).webp().toBuffer();
    const ok = await new ToImageProcessor().process(png, false);
    expect(ok.mimetype).toBe('image/png');
    expect(ok.width).toBeGreaterThan(0);
    expect(ok.height).toBeGreaterThan(0);

    const animated = await new VideoStickerProcessor().process('http://x/short.mp4');
    await expect(new ToImageProcessor().process(animated.buffer, true)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_STICKER_TYPE,
    });
  }, 120000);

  it('!togif: animated -> MP4; static -> ditolak', async () => {
    const animated = await new VideoStickerProcessor().process('http://x/short.mp4');
    const mp4 = await new ToGifProcessor().process(animated.buffer);
    expect(mp4.mimetype).toBe('video/mp4');
    expect(mp4.buffer.length).toBeGreaterThan(0);

    const png = await Sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).webp().toBuffer();
    await expect(new ToGifProcessor().process(png)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_STICKER_TYPE,
    });
  }, 120000);
});
