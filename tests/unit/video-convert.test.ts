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
import env from '../../src/config/env';

// Isolasi tempDir PER FILE test: test 'workspace bersih' di file ini (dan di
// attp.test.ts) menghitung file 'togif-*'/'*.mp4' di env.tempDir. Worker vitest
// lain (webhook, processor-deadline) menulis file serupa secara PARALEL di
// tempDir bersama -> salah dihitung sebagai leak (flaky CI). env.tempDir dibaca
// saat process() berjalan, jadi override di beforeAll cukup.
let privateTempDir: string;
let savedTempDir: string;

beforeAll(() => {
  privateTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vidconv-test-'));
  savedTempDir = env.tempDir;
  env.tempDir = privateTempDir;
});

afterAll(() => {
  env.tempDir = savedTempDir;
  fs.rmSync(privateTempDir, { recursive: true, force: true });
});

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

  it('video timeout -> PROCESSING_TIMEOUT + ffmpeg mati', async () => {
    const { convertVideoToAnimatedWebp } = await import('../../src/media/ffmpeg');
    const { execSync } = await import('child_process');
    const out = `/tmp/timeout_${Date.now()}.webp`;
    const fs = await import('fs');
    try {
      await expect(
        convertVideoToAnimatedWebp(`${workdir}/short.mp4`, out, 512, 10, 15, 150),
      ).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });
      // Pastikan tidak ada proses ffmpeg yatim untuk output ini.
      const base = out.split('/').pop() as string;
      let leaked = true;
      for (let i = 0; i < 30; i++) {
        try {
          const ps = execSync('ps -eo args').toString();
          leaked = ps.split('\n').some((line) => line.includes('ffmpeg') && line.includes(base));
        } catch {
          leaked = false;
        }
        if (!leaked) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(leaked).toBe(false);
    } finally {
      try {
        fs.unlinkSync(out);
      } catch {
        // abaikan
      }
    }
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

  it('!togif timeout -> PROCESSING_TIMEOUT + workspace bersih', async () => {
    const env = (await import('../../src/config/env')).default;
    const fs = await import('fs');
    // Snapshot SETELAH VideoStickerProcessor selesai: output .webp-nya sudah
    // dibersihkan oleh processor itu sendiri, jadi tidak terhitung sebagai leak.
    const animated = await new VideoStickerProcessor().process('http://x/short.mp4');
    const before = new Set(
      fs.readdirSync(env.tempDir).filter((f: string) => f.startsWith('togif-') || f.endsWith('.mp4')),
    );
    await expect(new ToGifProcessor().process(animated.buffer, 50)).rejects.toMatchObject({
      code: ErrorCode.PROCESSING_TIMEOUT,
    });
    const leaked = fs.readdirSync(env.tempDir).filter((f: string) => (f.startsWith('togif-') || f.endsWith('.mp4')) && !before.has(f));
    expect(leaked).toEqual([]);
  }, 120000);

  it('!togif konkuren: workspace UUID tidak tabrakan + bersih', async () => {
    const env = (await import('../../src/config/env')).default;
    // Snapshot SETELAH VideoStickerProcessor selesai (lihat catatan test timeout).
    const animated = await new VideoStickerProcessor().process('http://x/short.mp4');
    const before = new Set(
      (await import('fs')).readdirSync(env.tempDir).filter((f: string) => f.startsWith('togif-')),
    );
    const results = await Promise.all([
      new ToGifProcessor().process(animated.buffer),
      new ToGifProcessor().process(animated.buffer),
    ]);
    expect(results[0].mimetype).toBe('video/mp4');
    expect(results[1].mimetype).toBe('video/mp4');
    const fs = await import('fs');
    const leaked = fs.readdirSync(env.tempDir).filter((f: string) => f.startsWith('togif-') && !before.has(f));
    expect(leaked).toEqual([]);
  }, 120000);

  it('!togif: animated -> MP4 (h264 + yuv420p + actual dimensions); static -> ditolak', async () => {
    const animated = await new VideoStickerProcessor().process('http://x/short.mp4');
    const mp4 = await new ToGifProcessor().process(animated.buffer);
    expect(mp4.mimetype).toBe('video/mp4');
    expect(mp4.buffer.length).toBeGreaterThan(0);

    const { getVideoMetadata } = await import('../../src/media/ffmpeg');
    const tmpOut = path.join(workdir, `check_${Date.now()}.mp4`);
    fs.writeFileSync(tmpOut, mp4.buffer);
    try {
      const meta = await getVideoMetadata(tmpOut);
      expect(meta.format.toLowerCase()).toContain('mp4');
      expect(meta.codec).toBe('h264');
      expect(meta.pixelFormat).toBe('yuv420p');
      expect(meta.duration).toBeGreaterThan(0);
      expect(meta.width).toBeGreaterThan(0);
      expect(meta.width).toBeLessThanOrEqual(512);
      expect(meta.height).toBeGreaterThan(0);
      expect(meta.height).toBeLessThanOrEqual(512);
      expect(mp4.width).toBe(meta.width);
      expect(mp4.height).toBe(meta.height);
    } finally {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }

    const png = await Sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).webp().toBuffer();
    await expect(new ToGifProcessor().process(png)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_STICKER_TYPE,
    });
  }, 120000);

  it('!toimg & !togif: corrupt buffer -> MEDIA_DECODE_FAILED', async () => {
    const corruptBuffer = Buffer.from('bukan-webp-dan-corrupt-data');
    await expect(new ToImageProcessor().process(corruptBuffer)).rejects.toMatchObject({
      code: ErrorCode.MEDIA_DECODE_FAILED,
    });
    await expect(new ToGifProcessor().process(corruptBuffer)).rejects.toMatchObject({
      code: ErrorCode.MEDIA_DECODE_FAILED,
    });
  });

  it('!toimg & !togif: reject non-WebP buffer format', async () => {
    const jpegBuffer = await Sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
    await expect(new ToImageProcessor().process(jpegBuffer)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_STICKER_TYPE,
    });
    await expect(new ToGifProcessor().process(jpegBuffer)).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_STICKER_TYPE,
    });
  });

  it('!togif: uneven frame delays preserves total duration approximately', async () => {
    const tmpWebpDir = path.join(workdir, 'uneven-test');
    fs.mkdirSync(tmpWebpDir, { recursive: true });
    execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=red:s=64x64 -frames:v 1 ${tmpWebpDir}/0.png`);
    execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=blue:s=64x64 -frames:v 1 ${tmpWebpDir}/1.png`);
    execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=green:s=64x64 -frames:v 1 ${tmpWebpDir}/2.png`);

    const concatContent = [
      "file '0.png'",
      "duration 0.05",
      "file '1.png'",
      "duration 0.30",
      "file '2.png'",
      "duration 0.10",
      "file '2.png'",
    ].join('\n');
    fs.writeFileSync(path.join(tmpWebpDir, 'frames.txt'), concatContent);

    const unevenWebpPath = path.join(tmpWebpDir, 'uneven.webp');
    execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i ${tmpWebpDir}/frames.txt -c:v libwebp -loop 0 -an ${unevenWebpPath}`);
    const unevenWebpBuffer = fs.readFileSync(unevenWebpPath);

    const result = await new ToGifProcessor().process(unevenWebpBuffer);
    expect(result.mimetype).toBe('video/mp4');

    const { getVideoMetadata } = await import('../../src/media/ffmpeg');
    const tmpMp4 = path.join(workdir, `uneven_out_${Date.now()}.mp4`);
    fs.writeFileSync(tmpMp4, result.buffer);
    try {
      const meta = await getVideoMetadata(tmpMp4);
      // Expected duration adalah ~0.45s (toleransi 0.35s - 0.65s)
      expect(meta.duration).toBeGreaterThan(0.35);
      expect(meta.duration).toBeLessThan(0.65);
    } finally {
      if (fs.existsSync(tmpMp4)) fs.unlinkSync(tmpMp4);
      fs.rmSync(tmpWebpDir, { recursive: true, force: true });
    }
  }, 120000);
});

