import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { ToImageProcessor } from '../processors/toimg.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { cleanupTempFile } from '../../media/temp-files';
import env from '../../config/env';
import sharp from 'sharp';
import { sharpInputOptions } from '../../media/sharp-runtime';
import fs from 'fs';

export class ToImageGenerator implements StickerGenerator {
  readonly name = 'toimg';
  private processor = new ToImageProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'toimg';
  }

  validate(input: GeneratorInput): void {
    const url = input.mediaUrl ?? (input.content?.mediaUrl as string);
    if (!url) {
      throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Reply stiker yang mau dikonversi tidak tersedia');
    }
  }

  async process(input: GeneratorInput): Promise<ProcessingResult> {
    const url = input.mediaUrl ?? (input.content?.mediaUrl as string);
    // WAJIB teruskan signal: tanpa ini JobManager tidak bisa membatalkan job yang
    // macet di download, dan slot 'image' (MAX_IMAGE_JOBS=4) tertahan selamanya
    // sehingga semua request berikutnya kena JOB_QUEUE_FULL.
    const timeoutMs = input.timeoutMs ?? env.imageProcessingTimeoutMs;
    const { filePath } = await downloadMedia(url, { timeoutMs, signal: input.signal });

    try {
      const stickerBuffer = await fs.promises.readFile(filePath);
      let meta: sharp.Metadata;
      try {
        meta = await sharp(stickerBuffer, sharpInputOptions()).metadata();
      } catch {
        throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Format media tidak didukung atau rusak');
      }

      if (meta.format !== 'webp') {
        throw new AppError(
          ErrorCode.UNSUPPORTED_STICKER_TYPE,
          'Reply sticker static lalu gunakan !toimg',
          { userMessage: '❌ Reply sticker static lalu gunakan !toimg.' },
        );
      }

      const isAnimated = (meta.pages ?? 1) > 1;
      return await this.processor.process(stickerBuffer, isAnimated);
    } finally {
      cleanupTempFile(filePath);
    }
  }
}
