import Sharp from 'sharp';
import { randomUUID } from 'crypto';
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

      const timeoutMs = env.videoProcessingTimeoutMs;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const ffmpeg = require('fluent-ffmpeg');
        const command: any = ffmpeg()
          .input(path.join(workdir, '%d.png'))
          .inputOptions(['-framerate 10'])
          .outputFormat('mp4')
          .outputOptions(['-pix_fmt yuv420p', '-movflags +faststart'])
          .output(outputPath);
        const timer = setTimeout(() => {
          try {
            command.kill('SIGKILL');
          } catch {
            // abaikan bila proses sudah mati
          }
          done(() => reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout')));
        }, timeoutMs);
        if (typeof (timer as any).unref === 'function') (timer as any).unref();
        function done(fn: () => void): void {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        }
        command
          .on('end', () => done(resolve))
          .on('error', (err: Error) => {
            logger.error('ToGif conversion failed', { error: String(err) });
            done(() => reject(err));
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
