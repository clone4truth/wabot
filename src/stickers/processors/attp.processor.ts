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
import { validateText } from '../rendering/text-utils';
import { renderFittedText, renderTextLinesToBuffer } from '../rendering/text-layout';

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
      const frameCount = preset.frameCount;
      const fps = preset.fps;

      for (let i = 0; i < frameCount; i++) {
        deadline.throwIfExpired();
        const style = preset.getFrameStyle(i);
        const textLayer = await renderTextLinesToBuffer({
          lines: layout.lines,
          fontSize: layout.fontSize,
          color: style.color,
          outlineColor: '#000000',
          outlineWidth: 2,
        });
        deadline.throwIfExpired();

        const textMeta = await Sharp(textLayer).metadata();
        const contentWidth = textMeta.width || 1;
        const contentHeight = textMeta.height || 1;
        const scale = style.scale ?? 1;
        const targetWidth = Math.max(1, Math.round(contentWidth * scale));
        const targetHeight = Math.max(1, Math.round(contentHeight * scale));
        let frameText = await Sharp(textLayer)
          .resize(targetWidth, targetHeight, { fit: 'fill' })
          .png()
          .toBuffer();

        const opacity = style.opacity ?? 1;
        if (opacity < 1) {
          const opacityMask = await Sharp({
            create: {
              width: targetWidth,
              height: targetHeight,
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: Math.max(0, opacity) },
            },
          }).png().toBuffer();
          frameText = await Sharp(frameText)
            .composite([{ input: opacityMask, blend: 'dest-in' }])
            .png()
            .toBuffer();
        }

        const left = Math.round((512 - targetWidth) / 2 + (style.dx ?? 0));
        const top = Math.round((512 - targetHeight) / 2 + (style.dy ?? 0));
        await Sharp({
          create: {
            width: 512,
            height: 512,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([{ input: frameText, left, top }])
          .png()
          .toFile(path.join(workdir, `${i}.png`));
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
    // Reserve space for every built-in transform: zoom 1.12, slide ±30px,
    // and bounce -32px. Pango RGBA preserves native emoji colors.
    const fitted = await renderFittedText({
      text,
      maxWidth: 400,
      maxHeight: 392,
      margin: 0,
      maxFontSize: 112,
      minFontSize: 18,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
    });
    deadline?.throwIfExpired();
    return {
      fontSize: fitted.fontSize,
      lines: fitted.lines,
      lh: fitted.lineHeight,
      startY: Math.round((512 - fitted.contentHeight) / 2),
    };
  }
}
