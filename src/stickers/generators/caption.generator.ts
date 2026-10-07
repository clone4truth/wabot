import Sharp from 'sharp';
import { sharpInputOptions } from '../../media/sharp-runtime';
import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { validateImageContent } from '../../media/validator';
import { cleanupTempFile } from '../../media/temp-files';
import { validateText } from '../rendering/text-utils';
import { fitTextIntoRegion, renderFittedText } from '../rendering/text-layout';

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
    // dijalankan di process() via renderer Pango berbasis bounds piksel (Stage 2).
    fitTextIntoRegion({
      text: clean,
      width: 480,
      height: 160,
      maxFontSize: 56,
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

    const maxRegionH = 160;
    // Stage 1+2: logical wrap LALU ukur bounds piksel render aktual — menjamin
    // teks penuh ter-render tanpa clipping (CJK/emoji/wide glyphs termasuk).
    const fitted = await renderFittedText({
      text: clean,
      maxWidth: 512,
      maxHeight: maxRegionH,
      margin: 16,
      maxFontSize: 56,
      minFontSize: 14,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
    });

    const bannerHeight = Math.max(112, Math.min(192, fitted.contentHeight + 32));
    const imageHeight = 512 - bannerHeight;

    const { filePath } = await downloadMedia(mediaUrl);

    try {
      if (!(await validateImageContent(filePath))) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Invalid image content');
      }

      let finalSharp: Sharp.Sharp;
      const bannerMode = position === 'overlay' ? 'overlay' : position === 'top' ? 'top' : 'bottom';
      const bannerSvg = this.renderBannerSvg(bannerHeight, bannerMode);
      const bannerLayer = await Sharp(Buffer.from(bannerSvg))
        .composite([{
          input: fitted.contentBuffer,
          left: Math.round((512 - fitted.contentWidth) / 2),
          top: Math.round((bannerHeight - fitted.contentHeight) / 2),
        }])
        .png()
        .toBuffer();

      if (position === 'top') {
        const resizedImage = await Sharp(filePath, sharpInputOptions())
          .resize(512, imageHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        finalSharp = Sharp({
          create: {
            width: 512,
            height: 512,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        }).composite([
          { input: bannerLayer, top: 0, left: 0 },
          { input: resizedImage, top: bannerHeight, left: 0 },
        ]);
      } else if (position === 'overlay') {
        const resizedImage = await Sharp(filePath, sharpInputOptions())
          .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        finalSharp = Sharp(resizedImage).composite([
          { input: bannerLayer, top: 512 - bannerHeight, left: 0 },
        ]);
      } else {
        // default: bottom
        const resizedImage = await Sharp(filePath, sharpInputOptions())
          .resize(512, imageHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer();

        finalSharp = Sharp({
          create: {
            width: 512,
            height: 512,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        }).composite([
          { input: resizedImage, top: 0, left: 0 },
          { input: bannerLayer, top: imageHeight, left: 0 },
        ]);
      }

      const webpBuffer = await finalSharp.webp({ quality: 95, preset: 'text', smartSubsample: true }).toBuffer();
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
    height: number,
    mode: 'top' | 'bottom' | 'overlay',
  ): string {
    const bgRect = mode === 'overlay'
      ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.85"/></linearGradient></defs><rect width="512" height="${height}" fill="url(#g)"/>`
      : `<rect width="512" height="${height}" rx="16" fill="#0f172acc" stroke="#334155" stroke-width="2"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="${height}" viewBox="0 0 512 ${height}">
      ${bgRect}
    </svg>`;
  }
}
