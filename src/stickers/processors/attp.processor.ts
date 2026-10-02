import Sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { StickerResult } from '../result';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { createTempFile, cleanupTempFile } from '../../media/temp-files';
import { runFfmpegWithTimeout, FFMPEG_THREAD_ARGS } from '../../media/ffmpeg';
import { logger } from '../../observability/logger';
import { escapeXml, validateText } from '../rendering/text-utils';
import { fitTextIntoRegionRendered } from '../rendering/text-layout';
import { getDefaultFontPath, getFontFamily } from '../rendering/fonts';

import { defaultAnimationRegistry } from '../animations/registry';
import { AnimationLayout } from '../animations/types';
import { createDeadline } from '../jobs/deadline';

export interface AttpProcessOptions {
  effect?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class AttpProcessor {
  async process(
    text: string,
    optsOrEffect?: AttpProcessOptions | string | number,
    maybeTimeoutMs?: number,
  ): Promise<StickerResult> {
    let effectName: string | undefined;
    let timeoutMs = env.videoProcessingTimeoutMs;
    let signal: AbortSignal | undefined;

    if (typeof optsOrEffect === 'object' && optsOrEffect !== null && !Array.isArray(optsOrEffect)) {
      // New options object form
      effectName = optsOrEffect.effect;
      timeoutMs = optsOrEffect.timeoutMs ?? timeoutMs;
      signal = optsOrEffect.signal;
    } else if (typeof optsOrEffect === 'number') {
      timeoutMs = optsOrEffect;
    } else if (typeof optsOrEffect === 'string') {
      effectName = optsOrEffect;
      if (typeof maybeTimeoutMs === 'number') {
        timeoutMs = maybeTimeoutMs;
      }
    }

    // TOTAL-DEADLINE (P0): satu deadline absolut untuk seluruh proses.
    // timeoutMs di sini adalah SISA budget dari JobManager, bukan budget baru.
    const deadline = createDeadline(timeoutMs, signal);
    signal = deadline.signal;

    const clean = validateText(text, { emptyMessage: 'Teks !attp tidak boleh kosong' });
    const preset = defaultAnimationRegistry.get(effectName);

    // Hitung layout adaptif SATU KALI agar semua frame identik (tidak ada jitter/jumping).
    deadline.throwIfExpired();
    let layout: AnimationLayout;
    try {
      layout = await this.calculateStableLayout(clean, deadline);
    } catch (err) {
      deadline.cleanup();
      throw err;
    }

    const workdir = path.join(env.tempDir, `attp-${randomUUID()}`);
    fs.mkdirSync(workdir, { recursive: true });
    const outputPath = createTempFile('.webp');

    try {
      const family = getFontFamily(getDefaultFontPath());
      const frameCount = preset.frameCount;
      const fps = preset.fps;

      for (let i = 0; i < frameCount; i++) {
        deadline.throwIfExpired();
        const svg = preset.renderSvg(i, {
          text: clean,
          layout,
          fontFamily: family,
        });
        await Sharp(Buffer.from(svg)).png().toFile(path.join(workdir, `${i}.png`));
      }

      // FFmpeg hanya mendapat SISA waktu (bukan budget penuh dari awal proses).
      const remainingFfmpeg = deadline.remainingMs();
      if (remainingFfmpeg === undefined || remainingFfmpeg <= 0) {
        throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout');
      }
      deadline.throwIfExpired();

      await runFfmpegWithTimeout([
        '-y', '-loglevel', 'error',
        ...FFMPEG_THREAD_ARGS,
        '-framerate', String(fps),
        '-i', path.join(workdir, '%d.png'),
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-quality', '90',
        '-loop', '0',
        '-an',
        outputPath,
      ], remainingFfmpeg, signal);

      deadline.throwIfExpired();
      const buffer = await fs.promises.readFile(outputPath);

      deadline.throwIfExpired();
      const metadata = await Sharp(buffer).metadata();

      if (
        metadata.format !== 'webp' ||
        (metadata.pages ?? 1) <= 1 ||
        !metadata.width ||
        !metadata.height ||
        metadata.width > 512 ||
        metadata.height > 512
      ) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Output ATTP tidak valid');
      }

      logger.info('ATTP sticker dibuat', { effect: preset.name, frames: frameCount, size: buffer.length, width: metadata.width, height: metadata.height });
      return {
        buffer,
        mimetype: 'image/webp',
        width: metadata.width,
        height: metadata.height,
        animated: true,
        size: buffer.length,
      };
    } finally {
      deadline.cleanup();
      try {
        fs.rmSync(workdir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      cleanupTempFile(outputPath);
    }
  }

  private async calculateStableLayout(text: string, deadline?: ReturnType<typeof createDeadline>): Promise<AnimationLayout> {
    deadline?.throwIfExpired();
    const family = getFontFamily(getDefaultFontPath());
    // Reserve space for every built-in transform: zoom 1.12, slide ±30px,
    // and bounce -32px. Measure the same outlined glyphs used in final frames.
    const fitted = await fitTextIntoRegionRendered({
      text,
      width: 432,
      height: 416,
      maxFontSize: 112,
      minFontSize: 18,
      outlineWidth: 2,
      renderLine: (lines, fontSize, lineHeight) => {
        deadline?.throwIfExpired();
        return lines.map((line, idx) => {
          const y = idx * lineHeight + Math.round(fontSize * 0.85);
          return `<text x="256" y="${y}" text-anchor="middle" font-family="${family},sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="4" paint-order="stroke">${escapeXml(line)}</text>`;
        }).join('');
      },
    });
    deadline?.throwIfExpired();
    return {
      fontSize: fitted.fontSize,
      lines: fitted.lines,
      lh: fitted.lineHeight,
      startY: Math.round((512 - fitted.totalHeight) / 2),
    };
  }
}
