import { getDefaultFontPath, getFontFamily } from './fonts';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { escapeXml, wrapWords, splitGraphemes } from './text-utils';
import Sharp from 'sharp';
import { logger } from '../../observability/logger';

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
export function escapePangoMarkup(text: string): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


export interface FittedTextOptions extends TextLayoutOptions {
  minFontSize?: number;
  maxFontSize?: number;
  margin?: number;
}

export interface TextLayoutMetrics {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  totalHeight: number;
  maxCharsPerLine: number;
}

/**
 * Hitung metrik layout teks secara deterministik tanpa rendering.
 */
export function calculateTextLayout(options: {
  text: string;
  maxWidth: number;
  fontSize: number;
  margin?: number;
  maxLines?: number;
}): TextLayoutMetrics {
  const { text, maxWidth, fontSize, margin = 16, maxLines } = options;
  const safeWidth = Math.max(20, maxWidth - margin * 2);

  // Deteksi rasio emoji/karakter lebar dalam teks untuk menyesuaikan estimasi maxCharsPerLine
  const graphemes = splitGraphemes(text);
  let wideCount = 0;
  for (const g of graphemes) {
    if (/(\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(g)) {
      wideCount++;
    }
  }
  const wideRatio = graphemes.length > 0 ? wideCount / graphemes.length : 0;
  // Karakter Latin rata-rata ~0.74em (dengan outline), emoji ~1.30em
  const charWidthFactor = 0.74 + wideRatio * 0.56;
  const maxCharsPerLine = Math.max(4, Math.floor(safeWidth / (fontSize * charWidthFactor)));

  const lines = wrapWords(text, maxCharsPerLine, maxLines);
  const lineHeight = Math.round(fontSize * 1.25);
  const totalHeight = lines.length * lineHeight;

  return {
    lines,
    fontSize,
    lineHeight,
    totalHeight,
    maxCharsPerLine,
  };
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
  margin: number = 16,
): Promise<Buffer> {
  const family = getFontFamily(getDefaultFontPath());
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const ax = align === 'left' ? margin : align === 'right' ? maxWidth - margin : maxWidth / 2;

  const layout = calculateTextLayout({ text, maxWidth, fontSize, margin });
  const { lines, lineHeight: lh, totalHeight: totalH } = layout;
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
    margin = 16,
  } = options as any;

  return renderSingleLine(text, maxWidth, maxHeight, fontSize, color, align, outlineColor, outlineWidth, margin);
}

export interface FittedTextResult {
  buffer: Buffer;
  fontSize: number;
}

/**
 * Cari font terbesar agar hasil render aktual muat di safe area.
 * Menggunakan validasi 2-level:
 * Level 1: Logical layout bounds (totalHeight <= safeHeight)
 * Level 2: Rendered pixel trim box (info.width <= safeWidth && info.height <= safeHeight)
 * Tidak pernah menerima output yang terpotong.
 */
export async function renderFittedText(options: FittedTextOptions): Promise<FittedTextResult> {
  const {
    text,
    maxWidth,
    maxHeight,
    margin = 16,
    minFontSize = 16,
    maxFontSize = 96,
  } = options;
  const safeW = maxWidth - margin * 2;
  const safeH = maxHeight - margin * 2;

  let lastError: unknown = null;
  for (let size = maxFontSize; size >= minFontSize; size -= 4) {
    const layout = calculateTextLayout({
      text,
      maxWidth,
      fontSize: size,
      margin,
    });

    // Level 1: Logical bounds check sebelum render
    if (layout.totalHeight > safeH) {
      lastError = new Error(`logical layout overflow (${layout.totalHeight}px > ${safeH}px) at ${size}px`);
      continue;
    }

    try {
      const buffer = await renderTextToBuffer({ ...options, fontSize: size, margin } as any);
      
      // Level 2: Rendered pixel trim bounds check
      const { info } = await Sharp(buffer).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
      if (info.width <= safeW && info.height <= safeH) {
        logger.debug('Text layout selected', {
          fontSize: size,
          lineCount: layout.lines.length,
          renderWidth: info.width,
          renderHeight: info.height,
        });
        return { buffer, fontSize: size };
      }
      lastError = new Error(`rendered trim overflow (${info.width}x${info.height} > ${safeW}x${safeH}) at ${size}px`);
    } catch (err) {
      lastError = err;
    }
  }

  throw new AppError(
    ErrorCode.TEXT_TOO_LONG,
    `Teks tidak muat dijadikan stiker: ${String((lastError as Error)?.message || lastError)}`,
  );
}
