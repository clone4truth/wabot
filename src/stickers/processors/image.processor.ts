import Sharp from 'sharp';
import { StickerResult } from '../result';
import { validateImageContent } from '../../media/validator';
import { cleanupTempFile } from '../../media/temp-files';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class ImageStickerProcessor {
  async process(imageUrl: string, modifier: string = 'full'): Promise<StickerResult> {
    const { filePath, mimeType } = await this.downloadAndValidate(imageUrl);

    try {
      const metadata = await Sharp(filePath).metadata();
      const canvasSize = { width: 512, height: 512 };

      let sharpInstance = Sharp(filePath);

      switch (modifier) {
        case 'full':
          sharpInstance = sharpInstance.resize(canvasSize.width, canvasSize.height, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          });
          break;
        case 'crop':
          sharpInstance = sharpInstance.resize(canvasSize.width, canvasSize.height, {
            fit: 'cover',
          });
          break;
        case 'circle': {
          const squareSize = Math.min(metadata.width || 512, metadata.height || 512, 512);
          sharpInstance = sharpInstance
            .resize(squareSize, squareSize, { fit: 'cover' })
            .composite([{
              input: { create: { width: squareSize, height: squareSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } },
              gravity: 'center',
              blend: 'dest-in',
            }]);
          break;
        }
        default:
          sharpInstance = sharpInstance.resize(canvasSize.width, canvasSize.height, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          });
      }

      const webpBuffer = await sharpInstance.webp({ quality: 90 }).toBuffer();

      return {
        buffer: webpBuffer,
        mimetype: 'image/webp',
        width: 512,
        height: 512,
        animated: false,
        size: webpBuffer.length,
      };
    } finally {
      cleanupTempFile(filePath);
    }
  }

  private async downloadAndValidate(imageUrl: string) {
    const { filePath, mimeType } = await import('../../media/downloader').then(m =>
      m.downloadMedia(imageUrl)
    ).catch(() => {
      throw new AppError(ErrorCode.MEDIA_DOWNLOAD_FAILED, 'Failed to download media');
    });

    if (!validateImageContent(filePath)) {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Invalid image content');
    }

    return { filePath, mimeType };
  }
}
