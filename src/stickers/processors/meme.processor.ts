import Sharp from 'sharp';
import { StickerResult } from '../result';
import { renderTextToBuffer } from '../rendering/text-layout';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { cleanupTempFile } from '../../media/temp-files';

export class MemeProcessor {
  async process(imageUrl: string, memeText: string): Promise<StickerResult> {
    const [topText, bottomText] = memeText.split('|').map(s => s.trim());

    const { filePath } = await downloadMedia(imageUrl).catch(() => {
      throw new AppError(ErrorCode.MEDIA_DOWNLOAD_FAILED, 'Failed to download image');
    });

    try {
      const imageBuffer = await Sharp(filePath).toBuffer();
      const { width, height } = await Sharp(filePath).metadata();

      const maxTextWidth = Math.min(width || 512, 512);
      const topBuffer = topText
        ? await renderTextToBuffer({ text: topText, maxWidth: maxTextWidth, maxHeight: 80, fontSize: 24 })
        : null;
      const bottomBuffer = bottomText
        ? await renderTextToBuffer({ text: bottomText, maxWidth: maxTextWidth, maxHeight: 80, fontSize: 24 })
        : null;

      let sharpInstance = Sharp(imageBuffer).resize(512, 512, { fit: 'cover' });

      if (topBuffer) {
        sharpInstance = sharpInstance.composite([{ input: topBuffer, gravity: 'north' }]);
      }
      if (bottomBuffer) {
        sharpInstance = sharpInstance.composite([{ input: bottomBuffer, gravity: 'south' }]);
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
}
