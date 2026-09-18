import Sharp from 'sharp';
import { renderFittedText } from '../rendering/text-layout';
import { StickerResult } from '../result';
import { escapeXml, validateText } from '../rendering/text-utils';

import { getTtpStyle } from '../ttp/styles';

export class TtpProcessor {
  async process(text: string, style?: string): Promise<StickerResult> {
    const clean = validateText(text, { emptyMessage: 'Teks !ttp tidak boleh kosong' });
    const preset = getTtpStyle(style);

    const bg = preset.renderBg(clean);

    const { buffer: overlay } = await renderFittedText({
      text: clean,
      maxWidth: 440,
      maxHeight: 400,
      maxFontSize: 64,
      minFontSize: 18,
      margin: 16,
      color: preset.textColor,
      outlineColor: preset.outlineColor,
      outlineWidth: preset.outlineWidth,
    });

    const webpBuffer = await Sharp(bg)
      .composite([{ input: overlay, gravity: 'center' }])
      .webp({ quality: 90 })
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
