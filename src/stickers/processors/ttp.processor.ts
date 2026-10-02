import Sharp from 'sharp';
import { renderFittedText } from '../rendering/text-layout';
import { ProcessingResult } from '../result';
import { validateText } from '../rendering/text-utils';

import { getTtpStyle } from '../ttp/styles';

export class TtpProcessor {
  async process(text: string, style?: string, asImage = false): Promise<ProcessingResult> {
    const clean = validateText(text, { emptyMessage: 'Teks !ttp tidak boleh kosong' });
    const preset = getTtpStyle(style);

    const bg = preset.renderBg(clean);

    const { buffer: overlay } = await renderFittedText({
      text: clean,
      maxWidth: 480,
      maxHeight: 448,
      maxFontSize: 128,
      minFontSize: 18,
      margin: 16,
      color: preset.textColor,
      outlineColor: preset.outlineColor,
      outlineWidth: preset.outlineWidth,
      outputScale: asImage ? 2 : 1,
    });

    // Rasterize both SVG layers at their final resolution so PNG text stays
    // crisp at 1024px, including its outlines and background details.
    const composed = Sharp(bg, { density: asImage ? 144 : 72 })
      .composite([{ input: overlay, gravity: 'center' }]);
    const buffer = await (asImage
      ? composed.png({ compressionLevel: 9 })
      : composed.webp({ lossless: true, preset: 'text' })
    ).toBuffer();

    const meta = await Sharp(buffer).metadata();
    const dimension = asImage ? 1024 : 512;

    return {
      buffer,
      mimetype: asImage ? 'image/png' : 'image/webp',
      width: meta.width || dimension,
      height: meta.height || dimension,
      animated: false,
      size: buffer.length,
    };
  }
}
