import Sharp from 'sharp';
import { StickerResult } from '../result';
import { validateImageContent } from '../../media/validator';
import { cleanupTempFile } from '../../media/temp-files';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { defaultEffectRegistry } from '../effects/registry';

export class ImageStickerProcessor {
  async process(imageUrl: string, modifier: string = 'full'): Promise<StickerResult> {
    const { filePath, mimeType } = await this.downloadAndValidate(imageUrl);

    try {
      const metadata = await Sharp(filePath).metadata();
      const canvasSize = { width: 512, height: 512 };

      let sharpInstance = Sharp(filePath);
      let outWidth = canvasSize.width;
      let outHeight = canvasSize.height;

      if (defaultEffectRegistry.has(modifier)) {
        const effect = defaultEffectRegistry.get(modifier)!;
        sharpInstance = sharpInstance.resize(canvasSize.width, canvasSize.height, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        });
        sharpInstance = await effect.apply(sharpInstance);
      } else {
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
            const squareSize = 512;
            outWidth = squareSize;
            outHeight = squareSize;
            // Mask lingkaran putih via SVG 512x512: dest-in memakai alpha mask
            const circleMask = Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${squareSize}" height="${squareSize}">` +
              `<circle cx="${squareSize / 2}" cy="${squareSize / 2}" r="${squareSize / 2}" fill="white"/>` +
              `</svg>`,
            );
            sharpInstance = sharpInstance
              .resize(squareSize, squareSize, { fit: 'cover' })
              .composite([{ input: circleMask, blend: 'dest-in' }]);
            break;
          }
          default:
            sharpInstance = sharpInstance.resize(canvasSize.width, canvasSize.height, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            });
        }
      }

      const webpBuffer = await sharpInstance.webp({ quality: 90 }).toBuffer();
      const meta = await Sharp(webpBuffer).metadata();

      return {
        buffer: webpBuffer,
        mimetype: 'image/webp',
        width: meta.width || outWidth,
        height: meta.height || outHeight,
        animated: false,
        size: webpBuffer.length,
      };
    } finally {
      cleanupTempFile(filePath);
    }
  }

  private async downloadAndValidate(imageUrl: string) {
    let filePath: string;
    let mimeType: string;
    try {
      ({ filePath, mimeType } = await import('../../media/downloader').then(m =>
        m.downloadMedia(imageUrl)
      ));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(ErrorCode.MEDIA_DOWNLOAD_FAILED, `Failed to download media: ${String(err)}`);
    }

    try {
      if (!(await validateImageContent(filePath))) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Invalid image content');
      }

      return { filePath, mimeType };
    } catch (err) {
      cleanupTempFile(filePath);
      throw err;
    }
  }
}
