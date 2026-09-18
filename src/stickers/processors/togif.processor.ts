import Sharp from 'sharp';
import { randomUUID } from 'crypto';
import { VideoResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { cleanupTempFile, createTempFile } from '../../media/temp-files';
import { getVideoMetadata, runFfmpegWithTimeout } from '../../media/ffmpeg';
import env from '../../config/env';
import fs from 'fs';
import path from 'path';

export class ToGifProcessor {
  async process(stickerBuffer: Buffer, timeoutMs: number = env.videoProcessingTimeoutMs): Promise<VideoResult> {
    let meta;
    try {
      meta = await Sharp(stickerBuffer).metadata();
    } catch {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Format media tidak didukung atau rusak');
    }

    if (meta.format !== 'webp') {
      throw new AppError(
        ErrorCode.UNSUPPORTED_STICKER_TYPE,
        'Reply sticker animasi lalu gunakan !togif',
        { userMessage: '❌ Reply sticker animasi lalu gunakan !togif.' },
      );
    }

    const pages = meta.pages ?? 1;
    if (pages <= 1) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_STICKER_TYPE,
        'Sticker static. Gunakan !toimg',
        { userMessage: '❌ Sticker static. Gunakan !toimg.' },
      );
    }

    // Hitung timing / FPS berdasarkan metadata.delay jika tersedia dari WebP
    let fps = 10;
    if (Array.isArray(meta.delay) && meta.delay.length > 0) {
      const avgDelay = meta.delay.reduce((a, b) => a + b, 0) / meta.delay.length;
      if (avgDelay > 0) {
        fps = Math.max(1, Math.min(30, Math.round(1000 / avgDelay)));
      }
    }

    // Sampling frame secara merata bila pages > 30 (bukan membuang sisa frame)
    const MAX_FRAMES = 30;
    let frameIndices: number[] = [];
    if (pages <= MAX_FRAMES) {
      frameIndices = Array.from({ length: pages }, (_, i) => i);
    } else {
      frameIndices = Array.from({ length: MAX_FRAMES }, (_, k) =>
        Math.min(pages - 1, Math.round((k * (pages - 1)) / (MAX_FRAMES - 1))),
      );
      // Sesuaikan fps agar total durasi asli tetap terwakili
      const samplingRatio = MAX_FRAMES / pages;
      fps = Math.max(1, Math.min(30, Math.round(fps * samplingRatio)));
    }

    const workdir = path.join(env.tempDir, `togif-${randomUUID()}`);
    fs.mkdirSync(workdir, { recursive: true });
    const outputPath = createTempFile('.mp4');

    try {
      for (let i = 0; i < frameIndices.length; i++) {
        const frameIdx = frameIndices[i];
        const framePath = path.join(workdir, `${i}.png`);
        const png = await Sharp(stickerBuffer, { page: frameIdx }).png().toBuffer();
        await fs.promises.writeFile(framePath, png);
      }

      await runFfmpegWithTimeout([
        '-y',
        '-loglevel', 'error',
        '-framerate', String(fps),
        '-i', path.join(workdir, '%d.png'),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-an',
        outputPath,
      ], timeoutMs);

      const outMeta = await getVideoMetadata(outputPath);
      if (
        !outMeta.format.toLowerCase().includes('mp4') ||
        outMeta.codec !== 'h264' ||
        outMeta.width <= 0 || outMeta.width > 512 ||
        outMeta.height <= 0 || outMeta.height > 512 ||
        outMeta.duration <= 0
      ) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Output MP4 tidak valid');
      }

      const mp4Buffer = await fs.promises.readFile(outputPath).catch(() => {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Konversi GIF gagal');
      });
      if (mp4Buffer.length === 0) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Konversi GIF gagal');
      }

      return {
        buffer: mp4Buffer,
        mimetype: 'video/mp4',
        width: outMeta.width,
        height: outMeta.height,
        animated: true,
        size: mp4Buffer.length,
      };
    } finally {
      try {
        fs.rmSync(workdir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      cleanupTempFile(outputPath);
    }
  }
}
