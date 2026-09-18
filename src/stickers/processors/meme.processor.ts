import Sharp from 'sharp';
import { StickerResult } from '../result';
import { renderFittedText } from '../rendering/text-layout';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { cleanupTempFile } from '../../media/temp-files';
import { validateImageContent } from '../../media/validator';
import { countUnicodeCharacters, sanitizeText } from '../rendering/text-utils';
import env from '../../config/env';

export class MemeProcessor {
  async process(imageUrl: string, memeText: string): Promise<StickerResult> {
    if (!imageUrl) {
      throw new AppError(
        ErrorCode.MODIFIER_REQUIRES_IMAGE,
        'Mode meme membutuhkan foto',
        { userMessage: '❌ Mode meme membutuhkan foto.' },
      );
    }

    let topText = '';
    let bottomText = '';
    const raw = String(memeText ?? '');
    const sepIdx = raw.indexOf('|');

    if (sepIdx === -1) {
      topText = sanitizeText(raw);
    } else {
      topText = sanitizeText(raw.slice(0, sepIdx));
      bottomText = sanitizeText(raw.slice(sepIdx + 1));
    }

    if (!topText && !bottomText) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_INPUT,
        'Format: !stiker meme <atas> | <bawah>',
        { userMessage: '❌ Format: !stiker meme <atas> | <bawah>' },
      );
    }

    if (
      countUnicodeCharacters(topText) > env.maxTextLength ||
      countUnicodeCharacters(bottomText) > env.maxTextLength
    ) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, `Teks meme maksimal ${env.maxTextLength} karakter`);
    }

    const { filePath } = await downloadMedia(imageUrl).catch((err) => {
      if (err instanceof AppError) throw err;
      throw new AppError(ErrorCode.MEDIA_DOWNLOAD_FAILED, `Failed to download image: ${String(err)}`);
    });

    try {
      if (!(await validateImageContent(filePath))) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Format foto meme tidak didukung atau rusak');
      }

      const imageBuffer = await Sharp(filePath).toBuffer();

      // Lebar teks meme dihitung terhadap canvas akhir 512px (bukan resolusi sumber yang mungkin cuma 100px).
      const textCanvasWidth = 460;

      const topBuffer = topText
        ? (await renderFittedText({
            text: topText.toUpperCase(),
            maxWidth: textCanvasWidth,
            maxHeight: 140,
            maxFontSize: 44,
            minFontSize: 18,
            color: '#ffffff',
            outlineColor: '#000000',
            outlineWidth: 3,
            margin: 8,
          })).buffer
        : null;

      const bottomBuffer = bottomText
        ? (await renderFittedText({
            text: bottomText.toUpperCase(),
            maxWidth: textCanvasWidth,
            maxHeight: 140,
            maxFontSize: 44,
            minFontSize: 18,
            color: '#ffffff',
            outlineColor: '#000000',
            outlineWidth: 3,
            margin: 8,
          })).buffer
        : null;

      let sharpInstance = Sharp(imageBuffer).resize(512, 512, { fit: 'cover' });

      const composites: Sharp.OverlayOptions[] = [];
      if (topBuffer) {
        composites.push({ input: topBuffer, gravity: 'north' });
      }
      if (bottomBuffer) {
        composites.push({ input: bottomBuffer, gravity: 'south' });
      }


      if (composites.length > 0) {
        sharpInstance = sharpInstance.composite(composites);
      }

      const webpBuffer = await sharpInstance.webp({ quality: 90 }).toBuffer();
      const meta = await Sharp(webpBuffer).metadata();

      return {
        buffer: webpBuffer,
        mimetype: 'image/webp',
        width: meta.width || 512,
        height: meta.height || 512,
        animated: false,
        size: webpBuffer.length,
      };
    } finally {
      cleanupTempFile(filePath);
    }
  }
}
