import Sharp from 'sharp';
import { renderFittedText } from '../rendering/text-layout';
import { StickerResult } from '../result';
import { escapeXml, validateText } from '../rendering/text-utils';

// Text-to-Picture: teks besar di atas background gradien deterministik.
const PALETTES: [string, string][] = [
  ['#8338ec', '#3a86ff'],
  ['#ff006e', '#8338ec'],
  ['#06d6a0', '#118ab2'],
  ['#f77f00', '#d62828'],
  ['#10002b', '#5a189a'],
  ['#22223b', '#4a4e69'],
];

export class TtpProcessor {
  async process(text: string): Promise<StickerResult> {
    const clean = validateText(text, { emptyMessage: 'Teks !ttp tidak boleh kosong' });

    let hash = 0;
    const chars = Array.from(clean);
    for (let i = 0; i < chars.length; i++) {
      hash = (hash * 31 + (chars[i].codePointAt(0) ?? 0)) >>> 0;
    }
    const [from, to] = PALETTES[hash % PALETTES.length];

    const bg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
      `</linearGradient></defs>` +
      `<rect width="512" height="512" rx="64" fill="url(#g)"/>` +
      `<text x="30" y="480" font-family="sans-serif" font-size="26" font-weight="bold" fill="#ffffff" opacity="0.85">${escapeXml('TTP')}</text>` +
      `</svg>`,
    );

    const { buffer: overlay } = await renderFittedText({
      text: clean,
      maxWidth: 440,
      maxHeight: 400,
      maxFontSize: 64,
      minFontSize: 18,
      margin: 16,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
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
