import Sharp from 'sharp';
import { renderTextToBuffer } from '../rendering/text-layout';
import { StickerResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class QuoteProcessor {
  async process(text: string, senderName?: string): Promise<StickerResult> {
    const lines: string[] = [];
    if (senderName) lines.push(`— ${senderName}`);
    lines.push(`"${text}"`);

    const quoteText = lines.join('\n');
    const fontSize = 24;

    const buffer = await renderTextToBuffer({
      text: quoteText,
      maxWidth: 512,
      maxHeight: 512,
      fontSize,
      color: '#e0e0e0',
      outlineColor: '#333333',
      outlineWidth: 1,
    });

    const webpBuffer = await Sharp(buffer).webp({ quality: 90, preset: 'text' }).toBuffer();

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
