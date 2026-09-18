import Sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { renderTextToBuffer } from '../rendering/text-layout';
import { StickerResult } from '../result';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { createTempFile, cleanupTempFile } from '../../media/temp-files';
import { logger } from '../../observability/logger';

// Animated Text-to-Picture: teks ganti warna tiap frame -> webp animasi.
const FRAME_COLORS = ['#ff004c', '#ff8a00', '#ffee00', '#00e676', '#00b0ff', '#d500f9', '#ff004c', '#ff8a00'];
const FRAME_COUNT = 8;
const FRAME_FPS = 8;

function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.FFMPEG_PATH || 'ffmpeg', args, (err) => {
      if (!err) {
        resolve();
        return;
      }
      if ((err as any).killed || (err as any).code === 'ETIMEDOUT') {
        reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout'));
        return;
      }
      reject(err);
    });
    child.once('error', () => {});
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // abaikan bila proses sudah mati
      }
    }, timeoutMs);
    if (typeof (child as any).unref === 'function') {
      // Jangan unref child (harus selesai sebelum resolve); timer dibiarkan.
    }
  });
}

export class AttpProcessor {
  async process(text: string, timeoutMs: number = env.videoProcessingTimeoutMs): Promise<StickerResult> {
    const clean = String(text ?? '').trim();
    if (!clean) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Teks !attp tidak boleh kosong');
    }
    if (clean.length > env.maxTextLength) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, `Teks maksimal ${env.maxTextLength} karakter`);
    }

    const workdir = path.join(env.tempDir, `attp-${randomUUID()}`);
    fs.mkdirSync(workdir, { recursive: true });
    const outputPath = createTempFile('.webp');
    try {
      for (let i = 0; i < FRAME_COUNT; i++) {
        const frame = await renderTextToBuffer({
          text: clean,
          maxWidth: 440,
          maxHeight: 400,
          fontSize: 56,
          color: FRAME_COLORS[i % FRAME_COLORS.length],
        });
        await Sharp(frame).png().toFile(path.join(workdir, `${i}.png`));
      }

      await runFfmpeg([
        '-y', '-loglevel', 'error',
        '-framerate', String(FRAME_FPS),
        '-i', path.join(workdir, '%d.png'),
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-quality', '75',
        '-loop', '0',
        '-an',
        outputPath,
      ], timeoutMs);

      const buffer = await fs.promises.readFile(outputPath);
      logger.info('ATTP sticker dibuat', { frames: FRAME_COUNT, size: buffer.length });
      return {
        buffer,
        mimetype: 'image/webp',
        width: 512,
        height: 512,
        animated: true,
        size: buffer.length,
      };
    } finally {
      try {
        fs.rmSync(workdir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
      cleanupTempFile(outputPath);
    }
  }
}
