import Sharp from 'sharp';
import { StickerResult } from '../result';
import { renderFittedText } from '../rendering/text-layout';
import { validateText } from '../rendering/text-utils';

export class TextStickerProcessor {
  async process(text: string, modifier?: string): Promise<StickerResult> {
    const clean = validateText(text, { emptyMessage: 'Teks stiker tidak boleh kosong' });

    // Default PRD: teks putih, outline hitam, transparan, tengah, adaptive.
    const { buffer: textBuffer } = await renderFittedText({
      text: clean,
      maxWidth: 512,
      maxHeight: 512,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
    });

    const webpBuffer = await Sharp(textBuffer)
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
