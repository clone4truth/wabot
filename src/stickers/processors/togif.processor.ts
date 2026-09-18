import Sharp from 'sharp';
import { VideoResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { cleanupTempFile, createTempFile } from '../../media/temp-files';
import { logger } from '../../observability/logger';
import env from '../../config/env';
import fs from 'fs';
import path from 'path';

export class ToGifProcessor {
  async process(stickerBuffer: Buffer): Promise<VideoResult> {
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

    const dir = env.tempDir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    const outputPath = createTempFile('.mp4');
    const framePaths: string[] = [];

    try {
      // Ekstrak frame via Sharp (decoder webp ffmpeg tidak stabil) lalu encode.
      const count = Math.min(pages, 30);
      for (let i = 0; i < count; i++) {
        const framePath = path.join(dir, `togif_${stamp}_${i}.png`);
        const png = await Sharp(stickerBuffer, { page: i }).png().toBuffer();
        await fs.promises.writeFile(framePath, png);
        framePaths.push(framePath);
      }

      await new Promise<void>((resolve, reject) => {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg()
          .input(path.join(dir, `togif_${stamp}_%d.png`))
          .inputOptions(['-framerate 10'])
          .outputFormat('mp4')
          .outputOptions(['-pix_fmt yuv420p', '-movflags +faststart'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => {
            logger.error('ToGif conversion failed', { error: String(err) });
            reject(err);
          })
          .run();
      });

      const mp4Buffer = await fs.promises.readFile(outputPath).catch(() => {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Konversi GIF gagal');
      });
      if (mp4Buffer.length === 0) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Konversi GIF gagal');
      }

      return {
        buffer: mp4Buffer,
        mimetype: 'video/mp4',
        width: 512,
        height: 512,
        animated: true,
        size: mp4Buffer.length,
      };
    } finally {
      for (const p of framePaths) cleanupTempFile(p);
      cleanupTempFile(outputPath);
    }
  }
}
