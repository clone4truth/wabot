import Sharp from 'sharp';
import fs from 'fs';
import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { validateImageContent } from '../../media/validator';
import { cleanupTempFile } from '../../media/temp-files';
import { BackgroundRemovalService, defaultBackgroundRemovalService } from '../background-removal/service';
import { sharpInputOptions } from '../../media/sharp-runtime';
import { fitVisibleImage } from '../rendering/visible-image';

// Sisi terpanjang gambar analisis untuk smart-crop. Cukup presisi untuk
// menentukan bounding box subjek, tapi hanya ~0.26 MP raw RGBA (1 MB).
const SUBJECT_CROP_ANALYSIS_EDGE = 512;

const OUTLINE_COLORS: Record<string, { r: number; g: number; b: number; alpha: number }> = {
  white: { r: 255, g: 255, b: 255, alpha: 1 },
  black: { r: 0, g: 0, b: 0, alpha: 1 },
  gold: { r: 251, g: 191, b: 36, alpha: 1 },
};

export class RemoveBgGenerator implements StickerGenerator {
  readonly name = 'removebg';

  private bgService: BackgroundRemovalService;

  constructor(bgService: BackgroundRemovalService = defaultBackgroundRemovalService) {
    this.bgService = bgService;
  }

  supports(input: GeneratorInput): boolean {
    const mod = (input.modifier || '').toLowerCase();
    return (
      input.type === 'removebg' ||
      input.type === 'subject' ||
      input.type === 'outline' ||
      (input.type === 'image' && (mod === 'removebg' || mod === 'subject' || mod === 'outline'))
    );
  }

  validate(input: GeneratorInput, _context: GeneratorContext): void {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string | undefined);
    if (!mediaUrl) {
      throw new AppError(ErrorCode.MODIFIER_REQUIRES_IMAGE, 'Fitur ini memerlukan gambar');
    }
  }

  async process(input: GeneratorInput, _context: GeneratorContext): Promise<ProcessingResult> {
    const mediaUrl = input.mediaUrl ?? (input.content?.mediaUrl as string | undefined);
    if (!mediaUrl) {
      throw new AppError(ErrorCode.MODIFIER_REQUIRES_IMAGE, 'Fitur ini memerlukan gambar');
    }

    const { filePath } = await downloadMedia(mediaUrl, {
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });

    try {
      if (!(await validateImageContent(filePath))) {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Invalid image content');
      }

      const inputBuffer = await fs.promises.readFile(filePath);
      const transparentPng = await this.bgService.removeBackground(inputBuffer, {
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      });

      const mode = (
        input.modifier ??
        input.type ??
        'removebg'
      ).toLowerCase();

      let finalBuffer: Buffer;

      if (mode === 'subject') {
        finalBuffer = await this.processSubjectSmartCrop(transparentPng);
      } else if (mode === 'outline') {
        const colorName =
          (input.options?.color as string | undefined) ||
          (input.text ? input.text.trim().toLowerCase() : '') ||
          'white';
        finalBuffer = await this.processOutline(transparentPng, colorName);
      } else {
        // default: removebg
        finalBuffer = await (await fitVisibleImage(transparentPng))
          .webp({ quality: 95, smartSubsample: true })
          .toBuffer();
      }

      const meta = await Sharp(finalBuffer).metadata();

      return {
        buffer: finalBuffer,
        mimetype: 'image/webp',
        width: meta.width || 512,
        height: meta.height || 512,
        animated: false,
        size: finalBuffer.length,
      };
    } finally {
      cleanupTempFile(filePath);
    }
  }

  private async processSubjectSmartCrop(transparentPng: Buffer): Promise<Buffer> {
    const originalMeta = await Sharp(transparentPng, sharpInputOptions()).metadata();
    const origWidth = originalMeta.width ?? 0;
    const origHeight = originalMeta.height ?? 0;

    // Turunkan dulu ke resolusi yang cukup untuk menghitung bounding box subjek.
    // Output akhir hanya 512x512, jadi resolusi penuh tidak menambah kualitas —
    // hanya menghasilkan raw RGBA 100 MB (25 MP x 4) plus ~25 juta iterasi
    // loop JS sinkron yang memblokir event loop (dan /health) selama detik-detik.
    const analysisBuffer = await Sharp(transparentPng, sharpInputOptions())
      .resize(SUBJECT_CROP_ANALYSIS_EDGE, SUBJECT_CROP_ANALYSIS_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const { data, info } = await Sharp(analysisBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let foundAlpha = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * channels + 3];
        if (a > 20) {
          foundAlpha = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!foundAlpha) {
      // Fallback to normal fit contain
      return Sharp(transparentPng)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();
    }

    // Kembalikan koordinat ke skala gambar asli sebelum di-crop.
    const scaleX = width > 0 ? origWidth / width : 1;
    const scaleY = height > 0 ? origHeight / height : 1;
    const boxMinX = Math.floor(minX * scaleX);
    const boxMinY = Math.floor(minY * scaleY);
    const subjectW = Math.max(1, Math.round((maxX - minX + 1) * scaleX));
    const subjectH = Math.max(1, Math.round((maxY - minY + 1) * scaleY));

    // Add 12% safe padding
    const padX = Math.round(subjectW * 0.12);
    const padY = Math.round(subjectH * 0.12);

    const cropX = Math.max(0, Math.min(origWidth - 1, boxMinX - padX));
    const cropY = Math.max(0, Math.min(origHeight - 1, boxMinY - padY));
    const cropW = Math.max(1, Math.min(origWidth - cropX, subjectW + padX * 2));
    const cropH = Math.max(1, Math.min(origHeight - cropY, subjectH + padY * 2));

    return Sharp(transparentPng)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 90 })
      .toBuffer();
  }

  private async processOutline(transparentPng: Buffer, colorName: string): Promise<Buffer> {
    const color = OUTLINE_COLORS[colorName.toLowerCase()] ?? OUTLINE_COLORS.white;

    // Resize subject to 480x480 inside 512x512 first to make room for outline
    const fitted = await (await fitVisibleImage(transparentPng, 472))
      .toBuffer();

    const fittedMeta = await Sharp(fitted).metadata();
    const w = fittedMeta.width || 472;
    const h = fittedMeta.height || 472;

    // Dilate alpha mask to create border
    const alphaChannel = await Sharp(fitted).ensureAlpha().extractChannel(3).toBuffer();
    const dilatedAlpha = await Sharp(alphaChannel)
      .blur(6)
      .threshold(12)
      .toBuffer();

    // Create solid color layer masked by dilated alpha
    const outlineLayer = await Sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: color,
      },
    })
      .composite([{ input: dilatedAlpha, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Composite original subject over the outline layer
    const composited = await Sharp(outlineLayer)
      .composite([{ input: fitted }])
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer();

    return composited;
  }
}
