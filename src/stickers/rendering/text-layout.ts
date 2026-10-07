import { getDefaultFontPath, getFontFamily } from './fonts';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { escapeXml, wrapWords, splitGraphemes, isEmojiGrapheme } from './text-utils';
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
  /** Rasterize the final SVG at this scale; fitting uses the logical dimensions. */
  outputScale?: number;
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
  breakLongWords?: boolean;
}): TextLayoutMetrics {
  const { text, maxWidth, fontSize, margin = 16, maxLines, breakLongWords = true } = options;
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

  const lines = wrapWords(text, maxCharsPerLine, maxLines, breakLongWords);
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

function buildTextLayer(
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontSize: number,
  color: string,
  align: 'left' | 'center' | 'right',
  outlineColor: string,
  outlineWidth: number,
  margin: number = 16,
  linesOverride?: string[],
): string {
  const family = getFontFamily(getDefaultFontPath());
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const ax = align === 'left' ? margin : align === 'right' ? maxWidth - margin : maxWidth / 2;

  const calculated = calculateTextLayout({ text, maxWidth, fontSize, margin });
  const layout = linesOverride
    ? {
        ...calculated,
        lines: linesOverride,
        totalHeight: linesOverride.length * calculated.lineHeight,
      }
    : calculated;
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

  return texts;
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
  const texts = buildTextLayer(text, maxWidth, maxHeight, fontSize, color, align, outlineColor, outlineWidth, margin);
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
  lines: string[];
}

function containsEmoji(text: string): boolean {
  return splitGraphemes(text).some(isEmojiGrapheme);
}

function parseHexColor(color: string): { r: number; g: number; b: number; alpha: number } {
  const normalized = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(normalized);
  if (short) {
    return {
      r: parseInt(short[1][0] + short[1][0], 16),
      g: parseInt(short[1][1] + short[1][1], 16),
      b: parseInt(short[1][2] + short[1][2], 16),
      alpha: 1,
    };
  }
  const full = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (full) {
    return {
      r: parseInt(full[1].slice(0, 2), 16),
      g: parseInt(full[1].slice(2, 4), 16),
      b: parseInt(full[1].slice(4, 6), 16),
      alpha: 1,
    };
  }
  return { r: 0, g: 0, b: 0, alpha: 1 };
}

/**
 * Pango dengan rgba:true mempertahankan glyph emoji berwarna di dalam teks.
 * Outline dibuat dari siluet alpha agar huruf tetap terbaca tanpa mewarnai emoji.
 */
async function renderPangoColorLines(
  lines: string[],
  fontSize: number,
  color: string,
  outlineColor: string,
  outlineWidth: number,
  align: 'left' | 'center' | 'right',
  scale = 1,
): Promise<Buffer> {
  const family = getFontFamily(getDefaultFontPath());
  const pangoAlign = align === 'center' ? 'centre' : align;
  const scaledFont = Math.max(1, Math.round(fontSize * scale));
  const markup = `<span foreground="${escapePangoMarkup(color)}">${lines.map(escapePangoMarkup).join('\n')}</span>`;
  const textImage = await Sharp({
    text: {
      text: markup,
      font: `${family} Bold ${scaledFont}`,
      align: pangoAlign,
      spacing: Math.round(fontSize * 0.25 * scale),
      rgba: true,
    },
  }).png().toBuffer();

  const meta = await Sharp(textImage).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  const radius = outlineWidth > 0 && outlineColor !== 'transparent'
    ? Math.max(1, Math.round(outlineWidth * scale))
    : 0;
  if (radius === 0) return textImage;

  const alphaMask = await Sharp(textImage).ensureAlpha().extractChannel(3).png().toBuffer();
  const silhouette = await Sharp({
    create: { width, height, channels: 4, background: parseHexColor(outlineColor) },
  })
    .composite([{ input: alphaMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const composites: Sharp.OverlayOptions[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      composites.push({ input: silhouette, left: radius + dx, top: radius + dy });
    }
  }
  composites.push({ input: textImage, left: radius, top: radius });

  return Sharp({
    create: {
      width: width + radius * 2,
      height: height + radius * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites).png().toBuffer();
}

async function placeTightTextOnCanvas(
  textImage: Buffer,
  maxWidth: number,
  maxHeight: number,
  margin: number,
  align: 'left' | 'center' | 'right',
  scale: number,
): Promise<Buffer> {
  const canvasWidth = Math.round(maxWidth * scale);
  const canvasHeight = Math.round(maxHeight * scale);
  const scaledMargin = Math.round(margin * scale);
  const meta = await Sharp(textImage).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  const left = align === 'left'
    ? scaledMargin
    : align === 'right'
      ? canvasWidth - scaledMargin - width
      : Math.round((canvasWidth - width) / 2);
  const top = Math.round((canvasHeight - height) / 2);

  return Sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: textImage, left, top }]).png().toBuffer();
}

function* fontSizeCandidates(max: number, min: number, step: number): Generator<number> {
  if (!Number.isFinite(step) || step <= 0) throw new RangeError('Font size step must be positive');
  for (let size = max; size > min; size -= step) yield size;
  if (max >= min) yield min;
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
    outputScale = 1,
  } = options;
  const safeW = maxWidth - margin * 2;
  const safeH = maxHeight - margin * 2;
  const align = options.align ?? 'center';
  const colorEmoji = containsEmoji(text);
  const minLayout = calculateTextLayout({
    text,
    maxWidth,
    fontSize: minFontSize,
    margin,
  });
  const hasTokenTooLongAtMinimum = String(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => splitGraphemes(word).length > minLayout.maxCharsPerLine);
  const wrappingStrategies = hasTokenTooLongAtMinimum ? [true] : [false, true];

  if (!Number.isFinite(outputScale) || outputScale <= 0) {
    throw new RangeError('outputScale must be a positive finite number');
  }

  let lastError: unknown = null;
  // Fase pertama menjaga setiap kata utuh dan mengecilkan font bila perlu.
  // Hanya bila semua ukuran gagal, fase kedua boleh memecah token ekstrem.
  for (const breakLongWords of wrappingStrategies) {
    for (const size of fontSizeCandidates(maxFontSize, minFontSize, 4)) {
      const layout = calculateTextLayout({
        text,
        maxWidth,
        fontSize: size,
        margin,
        breakLongWords,
      });

      // Level 1: Logical bounds check sebelum render
      if (layout.totalHeight > safeH) {
        lastError = new Error(`logical layout overflow (${layout.totalHeight}px > ${safeH}px) at ${size}px`);
        continue;
      }

      try {
        if (colorEmoji) {
          const tight = await renderPangoColorLines(
            layout.lines,
            size,
            options.color ?? '#ffffff',
            options.outlineColor ?? '#000000',
            options.outlineWidth ?? 2,
            align,
          );
          const measured = await Sharp(tight).metadata();
          const renderWidth = measured.width || 0;
          const renderHeight = measured.height || 0;
          if (renderWidth <= safeW && renderHeight <= safeH) {
            const scaledTight = outputScale === 1
              ? tight
              : await renderPangoColorLines(
                  layout.lines,
                  size,
                  options.color ?? '#ffffff',
                  options.outlineColor ?? '#000000',
                  options.outlineWidth ?? 2,
                  align,
                  outputScale,
                );
            const buffer = await placeTightTextOnCanvas(
              scaledTight, maxWidth, maxHeight, margin, align, outputScale,
            );
            logger.debug('Color text layout selected', {
              fontSize: size,
              lineCount: layout.lines.length,
              renderWidth,
              renderHeight,
              breakLongWords,
            });
            return { buffer, fontSize: size, lines: layout.lines };
          }
          lastError = new Error(`rendered color text overflow (${renderWidth}x${renderHeight} > ${safeW}x${safeH}) at ${size}px`);
          continue;
        }

        const textLayer = buildTextLayer(
          text, maxWidth, maxHeight, size,
          options.color ?? '#ffffff', align,
          options.outlineColor ?? '#000000', options.outlineWidth ?? 2, margin, layout.lines,
        );
        // Measure the whole layer independently of the final SVG viewport. Trimming
        // a clipped final raster cannot reveal glyphs that fell outside its canvas.
        const measured = await measureRenderedTextLayer(textLayer, maxWidth, maxHeight, size);
        if (measured.width <= safeW && measured.height <= safeH) {
          const inkLeft = align === 'left' ? margin
            : align === 'right' ? maxWidth - margin - measured.width
            : Math.floor((maxWidth - measured.width) / 2);
          const inkTop = Math.floor((maxHeight - measured.height) / 2);
          const dx = inkLeft - measured.left;
          const dy = inkTop - measured.top;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}" height="${maxHeight}" viewBox="0 0 ${maxWidth} ${maxHeight}"><g transform="translate(${dx},${dy})">${textLayer}</g></svg>`;
          const buffer = await Sharp(Buffer.from(svg), { density: 72 * outputScale }).png().toBuffer();
          logger.debug('Text layout selected', {
            fontSize: size,
            lineCount: layout.lines.length,
            renderWidth: measured.width,
            renderHeight: measured.height,
            breakLongWords,
          });
          return { buffer, fontSize: size, lines: layout.lines };
        }
        lastError = new Error(`rendered text overflow (${measured.width}x${measured.height} > ${safeW}x${safeH}) at ${size}px`);
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw new AppError(
    ErrorCode.TEXT_TOO_LONG,
    `Teks tidak muat dijadikan stiker: ${String((lastError as Error)?.message || lastError)}`,
  );
}

export interface FitTextRegionOptions {
  text: string;
  width: number;
  height: number;
  maxFontSize?: number;
  minFontSize?: number;
  lineHeightFactor?: number;
  maxCharsPerLine?: (fontSize: number) => number;
}

export interface FittedRegionResult {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  totalHeight: number;
}

export function fitTextIntoRegion(options: FitTextRegionOptions): FittedRegionResult {
  const {
    text,
    width,
    height,
    maxFontSize = 36,
    minFontSize = 14,
    lineHeightFactor = 1.25,
  } = options;

  // Grapheme-aware char width estimation
  const graphemes = splitGraphemes(text);
  let wideCount = 0;
  for (const g of graphemes) {
    if (/(\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(g)) {
      wideCount++;
    }
  }
  const wideRatio = graphemes.length > 0 ? wideCount / graphemes.length : 0;
  const charWidthFactor = 0.65 + wideRatio * 0.55;

  for (let size = maxFontSize; size >= minFontSize; size -= 2) {
    const charsPerLine = options.maxCharsPerLine
      ? options.maxCharsPerLine(size)
      : Math.max(4, Math.floor(width / (size * charWidthFactor)));

    // IMPORTANT: Never pass maxLines to wrapWords so NO content is silently discarded!
    const lines = wrapWords(text, charsPerLine);
    const lineHeight = Math.round(size * lineHeightFactor);
    const totalHeight = lines.length * lineHeight;

    if (totalHeight <= height) {
      return {
        lines,
        fontSize: size,
        lineHeight,
        totalHeight,
      };
    }
  }

  throw new AppError(
    ErrorCode.TEXT_TOO_LONG,
    '❌ Teks terlalu panjang untuk ukuran layout yang tersedia',
  );
}

// ---------------------------------------------------------------------------
// Stage 2 fit: ukur BOUNDS RENDER AKTUAL (piksel), bukan estimasi lebar karakter.
// ---------------------------------------------------------------------------

export interface FitTextRegionRenderedOptions {
  text: string;
  /** Lebar safe area piksel yang tidak boleh dilewati teks ter-render. */
  width: number;
  /** Tinggi safe area piksel yang tidak boleh dilewati teks ter-render. */
  height: number;
  maxFontSize?: number;
  minFontSize?: number;
  lineHeightFactor?: number;
  /** Initial wrapping capacity, for example after reserving a terminal prefix. */
  maxCharsPerLine?: (fontSize: number) => number;
  fontWeight?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  /** Font family SVG; default family font aplikasi. */
  fontFamily?: string;
  /** Kanvas SVG width/height yang dipakai saat render pengukuran. Default: width/height. */
  svgWidth?: number;
  svgHeight?: number;
  /** Pad vertikal antar-line dinyatakan sebagai multiplier fontSize. */
  /** Callback render kustom per baris kandidat (mis. untuk prefix terminal). Return string SVG text-layer. */
  renderLine?: (lines: string[], fontSize: number, lineHeight: number) => string;
  /** Batas percobaan font (default turun 2px per langkah). */
  step?: number;
}

export interface FittedRegionRenderedResult {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  totalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
}

/**
 * Render SATU baris/kumpulan baris ke SVG transparan, lalu ukur bounds piksel aktual
 * via trim(). Hanya teks-layer yang dirender — tanpa background — sehingga trim box
 * mencerminkan tepi glyph+outline sebenarnya.
 */
interface RenderedTextBounds {
  width: number;
  height: number;
  left: number;
  top: number;
}

async function measureRenderedTextLayer(
  textLayer: string,
  logicalWidth: number,
  logicalHeight: number,
  fontSize: number,
): Promise<RenderedTextBounds> {
  let padX = Math.ceil(Math.max(logicalWidth, fontSize * 4));
  let padY = Math.ceil(Math.max(logicalHeight, fontSize * 4));

  // Padding keeps negative bearings, outlines, wide glyphs and custom prefixes
  // visible. If ink still touches the measurement edge, grow and measure again.
  for (let attempt = 0; attempt < 4; attempt++) {
    const width = Math.ceil(logicalWidth + padX * 2);
    const height = Math.ceil(logicalHeight + padY * 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${padX},${padY})">${textLayer}</g></svg>`;
    const { data, info } = await Sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;

    for (let i = info.channels - 1; i < data.length; i += info.channels) {
      if (data[i] === 0) continue;
      const pixel = (i - (info.channels - 1)) / info.channels;
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    if (maxX < 0) throw new Error('Text layer contains no visible glyphs');
    if (minX > 0 && minY > 0 && maxX < info.width - 1 && maxY < info.height - 1) {
      return {
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        left: minX - padX,
        top: minY - padY,
      };
    }
    padX *= 2;
    padY *= 2;
  }

  throw new Error('Text layer exceeds the unclipped measurement canvas');
}

/**
 * fitTextIntoRegion Stage-2: validasi bounds piksel hasil render aktual.
 *
 * Stage 1 (logical wrap) tetap dipakai untuk menghasilkan kandidat baris;
 * Stage 2 merender kandidat ke SVG transparan dan menolaknya bila trim box
 * melebihi safe area. Loop menurunkan font hingga muat; bila minFontSize gagal
 * → TEXT_TOO_LONG (TIDAK PERNAH clip/truncate).
 */
export async function fitTextIntoRegionRendered(
  options: FitTextRegionRenderedOptions,
): Promise<FittedRegionRenderedResult> {
  const {
    text,
    width,
    height,
    maxFontSize = 36,
    minFontSize = 14,
    lineHeightFactor = 1.25,
    fontWeight = 'bold',
    color = '#ffffff',
    outlineColor = '#000000',
    outlineWidth = 0,
    fontFamily,
    svgWidth,
    svgHeight,
    renderLine,
    step = 2,
  } = options;

  const family = fontFamily ?? getFontFamily(getDefaultFontPath());
  const canvasW = svgWidth ?? width;
  const canvasH = svgHeight ?? height;

  const stroke = outlineWidth > 0 && outlineColor !== 'transparent'
    ? ` stroke="${outlineColor}" stroke-width="${Math.round(outlineWidth * 2)}" paint-order="stroke"`
    : '';

  let lastMeasure: { width: number; height: number } | null = null;

  for (const size of fontSizeCandidates(maxFontSize, minFontSize, step)) {
    // Stage 1: logical wrap (grapheme-aware) untuk kandidat baris.
    let charsPerLine = Math.max(1, Math.floor(options.maxCharsPerLine
      ? options.maxCharsPerLine(size)
      : width / (size * 0.62)));

    // A width estimate can undercount emoji/CJK/wide letters. Tighten wrapping
    // first, keeping the larger font when the resulting full text still fits.
    while (charsPerLine >= 1) {
      const lines = wrapWords(text, charsPerLine);
      const lineHeight = Math.round(size * lineHeightFactor);
      const totalHeight = lines.length * lineHeight;
      if (totalHeight > height) break;

      const startY = Math.round(size * 0.85);
      const textElements = renderLine
        ? renderLine(lines, size, lineHeight)
        : lines
            .map((line, idx) => {
              const y = startY + idx * lineHeight;
              return `<text x="${canvasW / 2}" y="${y}" text-anchor="middle" font-family="${family},sans-serif" font-size="${size}" font-weight="${fontWeight}" fill="${color}"${stroke}>${escapeXml(line)}</text>`;
            })
            .join('');

      try {
        const measured = await measureRenderedTextLayer(textElements, canvasW, canvasH, size);
        lastMeasure = measured;
        if (measured.width <= width && measured.height <= height) {
          return {
            lines,
            fontSize: size,
            lineHeight,
            totalHeight,
            renderedWidth: measured.width,
            renderedHeight: measured.height,
          };
        }
        if (measured.width <= width || charsPerLine === 1) break;
        charsPerLine = Math.max(1, Math.min(charsPerLine - 1, Math.floor(charsPerLine * width / measured.width)));
      } catch {
        // Render/measurement failure — try a smaller font without hiding text.
        break;
      }
    }
  }

  throw new AppError(
    ErrorCode.TEXT_TOO_LONG,
    `Teks tidak muat setelah diukur render aktual (safe ${width}x${height}, terakhir ${lastMeasure ? `${lastMeasure.width}x${lastMeasure.height}` : 'n/a'})`,
  );
}
