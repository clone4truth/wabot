import Sharp from 'sharp';
import { renderTextToBuffer } from '../rendering/text-layout';
import { StickerResult } from '../result';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

// Text-to-Picture: teks besar di atas background gradien.
const PALETTES: [string, string][] = [
  ['#8338ec', '#3a86ff'],
  ['#ff006e', '#8338ec'],
  ['#06d6a0', '#118ab2'],
  ['#f77f00', '#d62828'],
  ['#10002b', '#5a189a'],
  ['#22223b', '#4a4e69'],
];

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class TtpProcessor {
  async process(text: string): Promise<StickerResult> {
    const clean = String(text ?? '').trim();
    if (!clean) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Teks !ttp tidak boleh kosong');
    }
    if (clean.length > env.maxTextLength) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, `Teks maksimal ${env.maxTextLength} karakter`);
    }

    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
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

    const overlay = await renderTextToBuffer({
      text: clean,
      maxWidth: 440,
      maxHeight: 400,
      fontSize: 56,
      color: '#ffffff',
    });

    const webpBuffer = await Sharp(bg)
      .composite([{ input: overlay, gravity: 'center' }])
      .webp({ quality: 90 })
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
