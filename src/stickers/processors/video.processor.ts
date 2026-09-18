import Sharp from 'sharp';
import { StickerResult } from '../result';
import { convertVideoToAnimatedWebp, getVideoMetadata } from '../../media/ffmpeg';
import { cleanupTempFile, createTempFile } from '../../media/temp-files';
import { validateFileSize } from '../../media/validator';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';

export class VideoStickerProcessor {
  async process(videoUrl: string, timeoutMs: number = env.videoProcessingTimeoutMs): Promise<StickerResult> {
    const startTime = Date.now();
    const { filePath } = await downloadMedia(videoUrl).catch((err) => {
      if (err instanceof AppError) throw err;
      throw new AppError(ErrorCode.MEDIA_DOWNLOAD_FAILED, `Failed to download video: ${String(err)}`);
    });

    const outputPath = createTempFile('.webp');
    try {
      const elapsed = Date.now() - startTime;
      const remainingProbe = Math.max(1000, timeoutMs - elapsed);
      let metadata;
      try {
        metadata = await getVideoMetadata(filePath, Math.min(5000, remainingProbe));
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

      const elapsedBeforeFfmpeg = Date.now() - startTime;
      const remainingFfmpeg = timeoutMs - elapsedBeforeFfmpeg;
      if (remainingFfmpeg <= 0) {
        throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout');
      }

      await convertVideoToAnimatedWebp(
        filePath,
        outputPath,
        512,
        env.maxVideoDurationSeconds,
        15,
        remainingFfmpeg,
      );
      return await this.validateOutput(outputPath);
    } finally {
      cleanupTempFile(filePath);
      cleanupTempFile(outputPath);
    }
  }

  // Validasi output aktual: ada, >0 byte, WebP valid, <=512px, animated.
  private async validateOutput(outputPath: string): Promise<StickerResult> {
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
