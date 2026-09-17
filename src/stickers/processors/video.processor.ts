import { StickerResult } from '../result';
import { convertVideoToAnimatedWebp, getVideoMetadata } from '../../media/ffmpeg';
import { cleanupTempFile } from '../../media/temp-files';
import { validateFileSize } from '../../media/validator';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';

export class VideoStickerProcessor {
  async process(videoUrl: string): Promise<StickerResult> {
    const { filePath } = await downloadMedia(videoUrl).catch(() => {
      throw new AppError(ErrorCode.MEDIA_DOWNLOAD_FAILED, 'Failed to download video');
    });

    try {
      const metadata = await getVideoMetadata(filePath);

      if (metadata.duration > env.maxVideoDurationSeconds) {
        throw new AppError(ErrorCode.VIDEO_TOO_LONG, `Video maksimal ${env.maxVideoDurationSeconds} detik`);
      }

      if (!validateFileSize(filePath, env.maxVideoBytes)) {
        throw new AppError(ErrorCode.MEDIA_TOO_LARGE, 'Video terlalu besar');
      }

      const outputPath = `/tmp/sticker_${Date.now()}.webp`;
      await convertVideoToAnimatedWebp(filePath, outputPath);

      const fs = await import('fs');
      const finalBuffer = await fs.promises.readFile(outputPath);

      return {
        buffer: finalBuffer,
        mimetype: 'image/webp',
        width: 512,
        height: 512,
        animated: true,
        size: finalBuffer.length,
      };
    } finally {
      cleanupTempFile(filePath);
    }
  }
}
