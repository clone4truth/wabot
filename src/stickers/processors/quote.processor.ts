import Sharp from 'sharp';
import { renderFittedText } from '../rendering/text-layout';
import { StickerResult } from '../result';
import { validateText } from '../rendering/text-utils';

export class QuoteProcessor {
  async process(text: string, senderName?: string): Promise<StickerResult> {
    const clean = validateText(text, { emptyMessage: 'Teks kutipan tidak boleh kosong' });

    const quoteText = senderName
      ? `“${clean}”\n\n— ${senderName}`
      : `“${clean}”`;

    const { buffer } = await renderFittedText({
      text: quoteText,
      maxWidth: 512,
      maxHeight: 512,
      margin: 32,
      maxFontSize: 44,
      minFontSize: 18,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
      align: 'center',
    });

    const webpBuffer = await Sharp(buffer)
      .webp({ quality: 90, preset: 'text' })
      .toBuffer();

    const meta = await Sharp(webpBuffer).metadata();

    return {
      buffer: webpBuffer,
      mimetype: 'image/webp',
      width: meta.width || 512,
      height: meta.height || 512,
      animated: false,
      size: webpBuffer.length,
    };
  }
}
