import Sharp from 'sharp';
import { StickerResult } from '../result';
import { renderFittedText } from '../rendering/text-layout';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class TextStickerProcessor {
  async process(text: string, modifier?: string): Promise<StickerResult> {
    // Hitung Unicode characters, bukan UTF-16 units (emoji = 1 char).
    if (Array.from(text).length > env.maxTextLength) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, `Teks maksimal ${env.maxTextLength} karakter`);
    }

    // Default PRD: teks putih, outline hitam, transparan, tengah, adaptive.
    const { buffer: textBuffer } = await renderFittedText({
      text,
      maxWidth: 512,
      maxHeight: 512,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
    });

    const webpBuffer = await Sharp(textBuffer)
      .webp({ quality: 90, preset: 'text' })
      .toBuffer();

    return {
      buffer: webpBuffer,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: webpBuffer.length,
    };
  }
}
