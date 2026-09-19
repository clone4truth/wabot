/**
 * P0 tests — processor deadline semantics (mock child-process helper + downloader;
 * fixture WebP/MP4 animasi nyata dibuat via ffmpeg agar validasi konten lolos):
 * - ATTP: frame rendering memakan budget → FFmpeg hanya menerima SISA waktu.
 * - ToGif: frame extraction memakan budget → FFmpeg & ffprobe hanya menerima sisa.
 * - Video: ffprobe tidak pernah melebihi sisa deadline; FFmpeg menerima sisa budget.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';

const ffmpegMocks = vi.hoisted(() => ({
  runFfmpegWithTimeout: vi.fn(async () => ({ stdout: '', stderr: '' })),
  runFfprobeWithTimeout: vi.fn(async () => ({ stdout: '', stderr: '' })),
  getVideoMetadata: vi.fn(async () => ({
    duration: 1,
    width: 64,
    height: 64,
    format: 'mp4',
    codec: 'h264',
    pixelFormat: 'yuv420p',
  })),
  convertVideoToAnimatedWebp: vi.fn(async () => undefined),
}));

vi.mock('../../src/media/ffmpeg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/media/ffmpeg')>();
  return {
    ...actual,
    runFfmpegWithTimeout: ffmpegMocks.runFfmpegWithTimeout,
    runFfprobeWithTimeout: ffmpegMocks.runFfprobeWithTimeout,
    getVideoMetadata: ffmpegMocks.getVideoMetadata,
    convertVideoToAnimatedWebp: ffmpegMocks.convertVideoToAnimatedWebp,
  };
});

vi.mock('../../src/media/downloader', () => ({
  downloadMedia: vi.fn(),
  resolveMediaUrl: (u: string) => u,
}));

import Sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AttpProcessor } from '../../src/stickers/processors/attp.processor';
import { ToGifProcessor } from '../../src/stickers/processors/togif.processor';
import { VideoStickerProcessor } from '../../src/stickers/processors/video.processor';
import { downloadMedia } from '../../src/media/downloader';
import { ErrorCode } from '../../src/errors/error-codes';

const mockedDownload = vi.mocked(downloadMedia);

// Fixtures nyata: animated WebP + MP4 (dibuat sekali via ffmpeg).
let animatedWebp: Buffer;
let sampleMp4: Buffer;
let fixtureDir: string;

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-fx-'));
  const webpPath = path.join(fixtureDir, 'anim.webp');
  const mp4Path = path.join(fixtureDir, 'out.mp4');
  execSync(
    `ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=64x64:rate=5 -c:v libwebp -loop 0 -an ${webpPath}`,
  );
  execSync(
    `ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=64x64:rate=5 -c:v libx264 -pix_fmt yuv420p -an ${mp4Path}`,
  );
  animatedWebp = fs.readFileSync(webpPath);
  sampleMp4 = fs.readFileSync(mp4Path);

  // Mock ffmpeg: tulis fixture ke outputPath (arg terakhir) sesuai ekstensi.
  ffmpegMocks.runFfmpegWithTimeout.mockImplementation(async (args: string[]) => {
    const out = args[args.length - 1];
    if (typeof out === 'string' && out.endsWith('.webp')) fs.writeFileSync(out, animatedWebp);
    else if (typeof out === 'string' && out.endsWith('.mp4')) fs.writeFileSync(out, sampleMp4);
    return { stdout: '', stderr: '' };
  });
  ffmpegMocks.convertVideoToAnimatedWebp.mockImplementation(
    async (_inputPath: string, outputPath: string) => {
      fs.writeFileSync(outputPath, animatedWebp);
    },
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks menghapus impl_once tapi bukan impl default dari mockImplementation;
  // pastikan impl default tetap terpasang.
  ffmpegMocks.runFfmpegWithTimeout.mockImplementation(async (args: string[]) => {
    const out = args[args.length - 1];
    if (typeof out === 'string' && out.endsWith('.webp')) fs.writeFileSync(out, animatedWebp);
    else if (typeof out === 'string' && out.endsWith('.mp4')) fs.writeFileSync(out, sampleMp4);
    return { stdout: '', stderr: '' };
  });
  ffmpegMocks.convertVideoToAnimatedWebp.mockImplementation(
    async (_inputPath: string, outputPath: string) => {
      fs.writeFileSync(outputPath, animatedWebp);
    },
  );
  ffmpegMocks.getVideoMetadata.mockResolvedValue({
    duration: 1,
    width: 64,
    height: 64,
    format: 'mp4',
    codec: 'h264',
    pixelFormat: 'yuv420p',
  });
});

describe('ATTP: FFmpeg receives only remaining budget', () => {
  it('frame rendering consumes budget and ffmpeg timeoutMs < total budget', async () => {
    const totalBudget = 60_000;
    await new AttpProcessor().process('halo dunia attp budget', { timeoutMs: totalBudget });

    expect(ffmpegMocks.runFfmpegWithTimeout).toHaveBeenCalledTimes(1);
    const ffmpegTimeout = ffmpegMocks.runFfmpegWithTimeout.mock.calls[0][1] as number;
    // Layout + 8 frame Sharp render mengonsumsi waktu nyata → FFmpeg HARUS menerima
    // lebih kecil dari budget total (bukan budget penuh 60s).
    expect(ffmpegTimeout).toBeLessThan(totalBudget);
    expect(ffmpegTimeout).toBeGreaterThan(0);
  }, 60_000);

  it('passes the deadline signal into ffmpeg', async () => {
    await new AttpProcessor().process('halo dunia signal', { timeoutMs: 60_000 });
    const signal = ffmpegMocks.runFfmpegWithTimeout.mock.calls[0][2] as AbortSignal | undefined;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);
  }, 60_000);
});

describe('ToGif: FFmpeg + ffprobe receive remaining budget', () => {
  it('frame extraction consumes budget; ffmpeg gets remaining time', async () => {
    const totalBudget = 60_000;

    await new ToGifProcessor().process(animatedWebp, totalBudget);

    expect(ffmpegMocks.runFfmpegWithTimeout).toHaveBeenCalledTimes(1);
    const ffmpegTimeout = ffmpegMocks.runFfmpegWithTimeout.mock.calls[0][1] as number;
    expect(ffmpegTimeout).toBeLessThan(totalBudget);
    expect(ffmpegTimeout).toBeGreaterThan(0);
  }, 60_000);

  it('ffprobe timeout never exceeds remaining deadline after ffmpeg consumed time', async () => {
    const totalBudget = 60_000;

    // Simulasi ffmpeg nyangkut 50ms agar sisa deadline menyusut sebelum ffprobe.
    ffmpegMocks.runFfmpegWithTimeout.mockImplementationOnce(async (args: string[]) => {
      await new Promise((r) => setTimeout(r, 50));
      const out = args[args.length - 1];
      if (typeof out === 'string' && out.endsWith('.mp4')) fs.writeFileSync(out, sampleMp4);
      return { stdout: '', stderr: '' };
    });

    await new ToGifProcessor().process(animatedWebp, totalBudget);

    expect(ffmpegMocks.getVideoMetadata).toHaveBeenCalledTimes(1);
    const probeTimeout = ffmpegMocks.getVideoMetadata.mock.calls[0][1] as number;
    // ffprobe timeout mencerminkan waktu yang sudah dikonsumsi frame extraction +
    // ffmpeg — jauh lebih kecil dari budget total (bukan budget baru).
    expect(probeTimeout).toBeLessThan(totalBudget - 30);
    expect(probeTimeout).toBeGreaterThan(0);
  }, 60_000);

  it('passes deadline signal into ffmpeg', async () => {
    await new ToGifProcessor().process(animatedWebp, 60_000);
    const ffmpegSignal = ffmpegMocks.runFfmpegWithTimeout.mock.calls[0][2] as AbortSignal | undefined;
    expect(ffmpegSignal).toBeDefined();
  }, 60_000);
});

describe('Video: strict remaining budget (no deadline extension)', () => {
  function stubDownload(tag: string): string {
    const tmp = path.join(os.tmpdir(), `proc-dl-${tag}-${Date.now()}.mp4`);
    fs.writeFileSync(tmp, Buffer.from('fake-video-bytes'));
    // Delay kecil agar elapsed > 0 → sisa budget terbukti menyusut (bukan budget penuh).
    mockedDownload.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 25));
      return { filePath: tmp, mimeType: 'video/mp4', size: 10 };
    });
    return tmp;
  }

  it('ffprobe timeout = min(5000, remaining) — never extends deadline', async () => {
    const totalBudget = 60_000;
    const tmp = stubDownload('ok');

    try {
      await new VideoStickerProcessor().process('http://x/video.mp4', totalBudget);

      const probeTimeout = ffmpegMocks.getVideoMetadata.mock.calls[0][1] as number;
      // STRICT: min(5000, remaining) — TIDAK ada Math.max yang memperpanjang deadline.
      expect(probeTimeout).toBeLessThanOrEqual(5000);
      expect(probeTimeout).toBeLessThan(totalBudget);

      expect(ffmpegMocks.convertVideoToAnimatedWebp).toHaveBeenCalledTimes(1);
      const convTimeout = ffmpegMocks.convertVideoToAnimatedWebp.mock.calls[0][5] as number;
      expect(convTimeout).toBeLessThan(totalBudget);
      expect(convTimeout).toBeGreaterThan(0);
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* processor cleanup may have removed it */ }
    }
  }, 60_000);

  it('exhausted budget (remaining <= 0) → PROCESSING_TIMEOUT before ffprobe', async () => {
    const tmp = stubDownload('expired');

    try {
      // Budget 0 → remaining = 0 - elapsed ≤ 0 → timeout sebelum ffprobe/ffmpeg.
      await expect(
        new VideoStickerProcessor().process('http://x/video.mp4', 0),
      ).rejects.toMatchObject({ code: ErrorCode.PROCESSING_TIMEOUT });
      expect(ffmpegMocks.getVideoMetadata).not.toHaveBeenCalled();
      expect(ffmpegMocks.convertVideoToAnimatedWebp).not.toHaveBeenCalled();
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }, 60_000);

  it('signal propagates into ffmpeg conversion call', async () => {
    const controller = new AbortController();
    const tmp = stubDownload('sig');

    try {
      await new VideoStickerProcessor().process('http://x/video.mp4', 60_000, controller.signal);
      const convSignal = ffmpegMocks.convertVideoToAnimatedWebp.mock.calls[0][6] as AbortSignal | undefined;
      expect(convSignal).toBeDefined();
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }, 60_000);
});
