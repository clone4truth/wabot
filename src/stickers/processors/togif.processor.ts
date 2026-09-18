import Sharp from 'sharp';
import { randomUUID } from 'crypto';
import { VideoResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { cleanupTempFile, createTempFile } from '../../media/temp-files';
import { getVideoMetadata, runFfmpegWithTimeout } from '../../media/ffmpeg';
import { logger } from '../../observability/logger';
import env from '../../config/env';
import fs from 'fs';
import path from 'path';

export class ToGifProcessor {
  async process(stickerBuffer: Buffer, timeoutMs: number = env.videoProcessingTimeoutMs): Promise<VideoResult> {
    // Input wajib animated (stiker statis -> tolak dengan arahan).
    let pages = 1;
    try {
      pages = (await Sharp(stickerBuffer).metadata()).pages ?? 1;
    } catch {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Sticker tidak dapat dibaca');
    }
    if (pages <= 1) {
      throw new AppError(ErrorCode.UNSUPPORTED_STICKER_TYPE, 'Static sticker tidak bisa dikonversi ke GIF');
    }

    const workdir = path.join(env.tempDir, `togif-${randomUUID()}`);
    fs.mkdirSync(workdir, { recursive: true });
    const outputPath = createTempFile('.mp4');

    try {
      // Ekstrak frame via Sharp (decoder webp ffmpeg tidak stabil) lalu encode.
      const count = Math.min(pages, 30);
      for (let i = 0; i < count; i++) {
        const framePath = path.join(workdir, `${i}.png`);
        const png = await Sharp(stickerBuffer, { page: i }).png().toBuffer();
        await fs.promises.writeFile(framePath, png);
      }

      await runFfmpegWithTimeout([
        '-y',
        '-loglevel', 'error',
        '-framerate', '10',
        '-i', path.join(workdir, '%d.png'),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-an',
        outputPath,
      ], timeoutMs);

      const meta = await getVideoMetadata(outputPath);
      if (
        !meta.format.toLowerCase().includes('mp4') ||
        meta.codec !== 'h264' ||
        meta.width <= 0 || meta.width > 512 ||
        meta.height <= 0 || meta.height > 512
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
        width: meta.width,
        height: meta.height,
        animated: true,
        size: mp4Buffer.length,
      };
    } finally {
      // Hapus seluruh workspace (frames + output bila gagal).
      try {
        fs.rmSync(workdir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
      cleanupTempFile(outputPath);
    }
  }
}
