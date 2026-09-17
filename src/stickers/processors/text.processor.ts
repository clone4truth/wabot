import Sharp from 'sharp';
import { StickerResult } from '../result';
import { renderTextToBuffer, calculateFontSize } from '../rendering/text-layout';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class TextStickerProcessor {
  async process(text: string, modifier?: string): Promise<StickerResult> {
    if (text.length > env.maxTextLength) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, `Teks maksimal ${env.maxTextLength} karakter`);
    }

    const fontSize = calculateFontSize(text, 512, 512);
    const textBuffer = await renderTextToBuffer({
      text,
      maxWidth: 512,
      maxHeight: 512,
      fontSize,
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
