import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { ToImageProcessor } from '../processors/toimg.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { cleanupTempFile } from '../../media/temp-files';
import Sharp from 'sharp';
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
    const { filePath } = await downloadMedia(url);

    try {
      const stickerBuffer = await fs.promises.readFile(filePath);
      let meta: Sharp.Metadata;
      try {
        meta = await Sharp(stickerBuffer).metadata();
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
