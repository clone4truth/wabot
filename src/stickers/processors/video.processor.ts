import Sharp from 'sharp';
import { StickerResult } from '../result';
import { convertVideoToAnimatedWebp, getVideoMetadata } from '../../media/ffmpeg';
import { cleanupTempFile, createTempFile } from '../../media/temp-files';
import { validateFileSize } from '../../media/validator';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { createDeadline } from '../jobs/deadline';

// WhatsApp's official animated sticker validator permits at most 500 KiB.
const MAX_ANIMATED_STICKER_BYTES = 500 * 1024;
const { Image: WebPImage } = require('node-webpmux');

export class VideoStickerProcessor {
  async process(
    videoUrl: string,
    timeoutMs: number = env.videoProcessingTimeoutMs,
    signal?: AbortSignal,
  ): Promise<StickerResult> {
    const startTime = Date.now();
    // TOTAL-DEADLINE (P0): deadline absolut dari sisa budget JobManager.
    const deadline = createDeadline(timeoutMs, signal);
    const { filePath } = await downloadMedia(videoUrl, { timeoutMs, signal }).catch((err) => {
      if (err instanceof AppError) throw err;
      throw new AppError(ErrorCode.MEDIA_DOWNLOAD_FAILED, `Failed to download video: ${String(err)}`);
    });

    const outputPath = createTempFile('.webp');
    try {
      // STRICT remaining budget: TIDAK ADA Math.max yang memperpanjang deadline.
      let remainingProbe = timeoutMs - (Date.now() - startTime);
      if (remainingProbe <= 0) {
        throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout');
      }
      remainingProbe = Math.min(5000, remainingProbe);

      let metadata;
      try {
        metadata = await getVideoMetadata(filePath, remainingProbe, deadline.signal);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, `Video tidak dapat dibaca: ${String(err)}`);
      }

      if (metadata.duration > env.maxVideoDurationSeconds) {
        throw new AppError(ErrorCode.VIDEO_TOO_LONG, `Video maksimal ${env.maxVideoDurationSeconds} detik`);
      }

      if (!validateFileSize(filePath, env.maxVideoBytes)) {
        throw new AppError(ErrorCode.MEDIA_TOO_LARGE, 'Video terlalu besar');
      }

      // Jangan terima input/output yang diproses setelah deadline.
      deadline.throwIfExpired();

      let fps = 15;
      const minFps = Math.min(fps, Math.max(1, Math.ceil(2 / metadata.duration)));
      // Re-encode the original video only if its sticker is too large. Keep
      // every second and the 512px canvas; adjust motion sampling and quality.
      for (const quality of [80, 60, 35, 10, 0]) {
        deadline.throwIfExpired();
        const remainingFfmpeg = timeoutMs - (Date.now() - startTime);
        if (remainingFfmpeg <= 0) {
          throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout');
        }

        await convertVideoToAnimatedWebp(
          filePath, outputPath, 512, env.maxVideoDurationSeconds,
          fps, remainingFfmpeg, deadline.signal, quality,
        );
        deadline.throwIfExpired();
        const result = await this.validateOutput(outputPath, metadata.duration);
        deadline.throwIfExpired();
        if (result.size <= MAX_ANIMATED_STICKER_BYTES) return result;

        // Estimate the next frame rate from actual encoded size rather than
        // repeatedly encoding a long, detailed clip at nearly the same size.
        fps = Math.max(minFps, Math.floor(fps * MAX_ANIMATED_STICKER_BYTES / result.size * 0.85));
      }

      throw new AppError(ErrorCode.MEDIA_TOO_LARGE, 'Animated sticker exceeds 500KB', {
        userMessage: '❌ Video terlalu detail untuk stiker 500KB. Gunakan video yang lebih singkat.',
      });
    } finally {
      deadline.cleanup();
      cleanupTempFile(filePath);
      cleanupTempFile(outputPath);
    }
  }


  // Validasi output aktual: ada, >0 byte, WebP valid, <=512px, animated.
  private async validateOutput(outputPath: string, durationSec: number): Promise<StickerResult> {
    let buffer: Buffer;
    try {
      const fs = await import('fs');
      buffer = await fs.promises.readFile(outputPath);
    } catch {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Video output tidak ditemukan');
    }
    if (buffer.length === 0) {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Video output kosong');
    }
    let meta;
    try {
      meta = await Sharp(buffer).metadata();
    } catch {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Video output rusak');
    }
    if (meta.format !== 'webp') {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Video output bukan WebP');
    }
    if ((meta.width || 0) > 512 || (meta.height || 0) > 512) {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Dimensi video output melebihi 512px');
    }
    if ((meta.pages ?? 1) <= 1) {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Video output tidak animasi');
    }

    // Lower frame rates can round a fractional clip length up or down. Remux
    // only frame delays, keeping compressed frame pixels untouched, so the
    // complete animation lasts exactly as long as the accepted source video.
    const durationMs = Math.round(durationSec * 1000);
    const encodedDurationMs = meta.delay?.reduce((sum, delay) => sum + delay, 0);
    if (encodedDurationMs !== durationMs) {
      const image = new WebPImage();
      await image.load(buffer);
      const frameCount = image.frames.length;
      const frameDelay = Math.floor(durationMs / frameCount);
      if (frameDelay < 8) {
        throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Video terlalu singkat untuk stiker animasi');
      }
      const extraMilliseconds = durationMs % frameCount;
      const frames = image.frames.map((frame: Record<string, unknown>, index: number) => ({
        ...frame, delay: frameDelay + (index < extraMilliseconds ? 1 : 0),
      }));
      buffer = Buffer.from(await image.save(null, { frames }));
    }
    return {
      buffer,
      mimetype: 'image/webp',
      width: meta.width || 512,
      height: meta.height || 512,
      animated: true,
      size: buffer.length,
    };
  }
}
