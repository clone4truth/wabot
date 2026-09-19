import Sharp from 'sharp';
import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { validateImageContent } from '../../media/validator';
import { cleanupTempFile } from '../../media/temp-files';
import { escapeXml, validateText } from '../rendering/text-utils';
import { getDefaultFontPath, getFontFamily } from '../rendering/fonts';
import { fitTextIntoRegion, fitTextIntoRegionRendered, FittedRegionResult, FittedRegionRenderedResult } from '../rendering/text-layout';

export class CaptionGenerator implements StickerGenerator {
  readonly name = 'caption';

  supports(input: GeneratorInput): boolean {
    return input.type === 'caption' || (input.type === 'image' && input.modifier === 'caption');
  }

  validate(input: GeneratorInput, _context: GeneratorContext): void {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string | undefined);
    if (!mediaUrl) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Caption memerlukan gambar sebagai input');
    }
    const text = (input.text ?? input.content?.text ?? '') as string;
    const clean = validateText(text, { emptyMessage: 'Teks caption tidak boleh kosong' });

    // Pre-check sinkron (logical) di validate; validasi bounds render aktual
    // dijalankan di process() via fitTextIntoRegionRendered (Stage 2).
    fitTextIntoRegion({
      text: clean,
      width: 480,
      height: 160,
      maxFontSize: 28,
      minFontSize: 14,
    });
  }

  async process(input: GeneratorInput, _context: GeneratorContext): Promise<ProcessingResult> {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string | undefined);
    if (!mediaUrl) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Caption memerlukan gambar sebagai input');
    }

    const text = (input.text ?? input.content?.text ?? '') as string;
    const clean = validateText(text, { emptyMessage: 'Teks caption tidak boleh kosong' });

    const position = (
      (input.options?.position as string) ??
      (input.options?.mode as string) ??
      (input.content?.position as string) ??
      'bottom'
    ).toLowerCase();

    const maxRegionH = position === 'overlay' ? 140 : 150;
    // Stage 1+2: logical wrap LALU ukur bounds piksel render aktual — menjamin
    // teks penuh ter-render tanpa clipping (CJK/emoji/wide glyphs termasuk).
    const fitted = await fitTextIntoRegionRendered({
      text: clean,
      width: 480,
      height: maxRegionH,
      maxFontSize: 28,
      minFontSize: 14,
    });

    const bannerHeight = position === 'overlay' ? 140 : Math.max(100, Math.min(180, fitted.totalHeight + 32));
    const imageHeight = 512 - bannerHeight;

    const { filePath } = await downloadMedia(mediaUrl);

    try {
      if (!(await validateImageContent(filePath))) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Invalid image content');
      }

      const family = getFontFamily(getDefaultFontPath());
      let finalSharp: Sharp.Sharp;

      if (position === 'top') {
        const resizedImage = await Sharp(filePath)
          .resize(512, imageHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        const bannerSvg = this.renderBannerSvg(fitted, family, bannerHeight, 'top');

        finalSharp = Sharp({
          create: {
            width: 512,
            height: 512,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        }).composite([
          { input: Buffer.from(bannerSvg), top: 0, left: 0 },
          { input: resizedImage, top: bannerHeight, left: 0 },
        ]);
      } else if (position === 'overlay') {
        const resizedImage = await Sharp(filePath)
          .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        const overlaySvg = this.renderBannerSvg(fitted, family, bannerHeight, 'overlay');

        finalSharp = Sharp(resizedImage).composite([
          { input: Buffer.from(overlaySvg), top: 512 - bannerHeight, left: 0 },
        ]);
      } else {
        // default: bottom
        const resizedImage = await Sharp(filePath)
          .resize(512, imageHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        const bannerSvg = this.renderBannerSvg(fitted, family, bannerHeight, 'bottom');

        finalSharp = Sharp({
          create: {
            width: 512,
            height: 512,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        }).composite([
          { input: resizedImage, top: 0, left: 0 },
          { input: Buffer.from(bannerSvg), top: imageHeight, left: 0 },
        ]);
      }

      const webpBuffer = await finalSharp.webp({ quality: 90 }).toBuffer();
      const meta = await Sharp(webpBuffer).metadata();

      return {
        buffer: webpBuffer,
        mimetype: 'image/webp',
        width: meta.width || 512,
        height: meta.height || 512,
        animated: false,
        size: webpBuffer.length,
      };
    } finally {
      cleanupTempFile(filePath);
    }
  }

  private renderBannerSvg(
    fitted: FittedRegionResult,
    family: string,
    height: number,
    mode: 'top' | 'bottom' | 'overlay',
  ): string {
    const { lines, fontSize, lineHeight, totalHeight } = fitted;
    const startY = Math.round((height - totalHeight) / 2) + Math.round(fontSize * 0.85);

    const textElements = lines
      .map((line, idx) => {
        const y = startY + idx * lineHeight;
        return `<text x="256" y="${y}" text-anchor="middle" font-family="${family},sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="2" paint-order="stroke">${escapeXml(line)}</text>`;
      })
      .join('');

    const bgRect = mode === 'overlay'
      ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.85"/></linearGradient></defs><rect width="512" height="${height}" fill="url(#g)"/>`
      : `<rect width="512" height="${height}" rx="16" fill="#0f172acc" stroke="#334155" stroke-width="2"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="${height}" viewBox="0 0 512 ${height}">
      ${bgRect}
      ${textElements}
    </svg>`;
  }
}
