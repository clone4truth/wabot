import Sharp from 'sharp';
import fs from 'fs';
import path from 'path';
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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.env.FFMPEG_PATH || 'ffmpeg', args, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export class AttpProcessor {
  async process(text: string): Promise<StickerResult> {
    const clean = String(text ?? '').trim();
    if (!clean) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Teks !attp tidak boleh kosong');
    }
    if (clean.length > env.maxTextLength) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, `Teks maksimal ${env.maxTextLength} karakter`);
    }

    if (!fs.existsSync(env.tempDir)) fs.mkdirSync(env.tempDir, { recursive: true });
    const dir = env.tempDir;
    const stamp = Date.now();
    const framePaths: string[] = [];
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
        const framePath = path.join(dir, `attp_${stamp}_${i}.png`);
        await Sharp(frame).png().toFile(framePath);
        framePaths.push(framePath);
      }

      await runFfmpeg([
        '-y', '-loglevel', 'error',
        '-framerate', String(FRAME_FPS),
        '-i', path.join(dir, `attp_${stamp}_%d.png`),
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-quality', '75',
        '-loop', '0',
        '-an',
        outputPath,
      ]);

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
      for (const p of framePaths) cleanupTempFile(p);
      cleanupTempFile(outputPath);
    }
  }
}
