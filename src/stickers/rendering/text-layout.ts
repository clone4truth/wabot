import { getDefaultFontPath, getFontFamily } from './fonts';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { wrapText } from './chat-bubble';
import Sharp from 'sharp';

export interface TextLayoutOptions {
  text: string;
  maxWidth: number;
  maxHeight: number;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  align?: 'left' | 'center' | 'right';
}

// Escape karakter khusus XML agar teks user tidak merusak markup Pango
// (mis. "&", "<", ">" pada "!stiker a & b" atau "<3").
export function escapePangoMarkup(text: string): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface FittedTextOptions extends TextLayoutOptions {
  minFontSize?: number;
  maxFontSize?: number;
  margin?: number;
}

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderSingleLine(
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontSize: number,
  color: string,
  align: 'left' | 'center' | 'right',
  outlineColor: string,
  outlineWidth: number,
): Promise<Buffer> {
  // Render via SVG: ukuran font presisi dalam px (Pango/sharp me-render
  // font_desc raksasa yang tak terprediksi). Outline via paint-order stroke.
  const family = getFontFamily(getDefaultFontPath());
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const ax = align === 'left' ? 0 : align === 'right' ? maxWidth : maxWidth / 2;
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * 0.62)));
  const lines = wrapText(text, maxChars, 20);
  const lh = Math.round(fontSize * 1.25);
  const totalH = lines.length * lh;
  const startY = Math.max(0, Math.round((maxHeight - totalH) / 2));
  const stroke = outlineWidth > 0 && outlineColor !== 'transparent'
    ? ` stroke="${outlineColor}" stroke-width="${Math.round(outlineWidth * 2)}" paint-order="stroke"`
    : '';

  const texts = lines
    .map((line, i) => {
      const y = startY + i * lh + Math.round(fontSize * 0.85);
      return `<text x="${ax}" y="${y}" text-anchor="${anchor}" font-family="${family},sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}"${stroke}>${escapeXml(line)}</text>`;
    })
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}" height="${maxHeight}" viewBox="0 0 ${maxWidth} ${maxHeight}">` +
    texts +
    `</svg>`;

  return Sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderTextToBuffer(options: TextLayoutOptions): Promise<Buffer> {
  const {
    text,
    maxWidth,
    maxHeight,
    fontSize = 32,
    color = '#ffffff',
    outlineColor = '#000000',
    outlineWidth = 2,
    align = 'center',
  } = options;

  // Outline di-render langsung oleh SVG (paint-order stroke).
  return renderSingleLine(text, maxWidth, maxHeight, fontSize, color, align, outlineColor, outlineWidth);
}

export interface FittedTextResult {
  buffer: Buffer;
  fontSize: number;
}

// Cari font terbesar agar hasil render aktual muat di safe area.
// Ukur via trim box nyata, bukan estimasi panjang karakter.
export async function renderFittedText(options: FittedTextOptions): Promise<FittedTextResult> {
  const {
    maxWidth,
    maxHeight,
    margin = 16,
    minFontSize = 16,
    maxFontSize = 96,
  } = options;
  const safeW = maxWidth - margin * 2;
  const safeH = maxHeight - margin * 2;

  let lastError: unknown = null;
  for (let size = maxFontSize; size >= minFontSize; size -= 8) {
    try {
      const buffer = await renderTextToBuffer({ ...options, fontSize: size });
      const { info } = await Sharp(buffer).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
      if (info.width <= safeW && info.height <= safeH) {
        return { buffer, fontSize: size };
      }
      lastError = new Error(`overflow at ${size}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw new AppError(
    ErrorCode.TEXT_TOO_LONG,
    `Teks tidak muat dijadikan stiker: ${String((lastError as Error)?.message || lastError)}`,
  );
}
