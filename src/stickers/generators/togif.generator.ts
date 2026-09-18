import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { ToGifProcessor } from '../processors/togif.processor';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { downloadMedia } from '../../media/downloader';
import { cleanupTempFile } from '../../media/temp-files';
import env from '../../config/env';
import Sharp from 'sharp';
import fs from 'fs';

export class ToGifGenerator implements StickerGenerator {
  readonly name = 'togif';
  private processor = new ToGifProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'togif';
  }

  validate(input: GeneratorInput): void {
    const url = input.mediaUrl ?? (input.content?.mediaUrl as string);
    if (!url) {
      throw new AppError(ErrorCode.MEDIA_NOT_AVAILABLE, 'Reply stiker yang mau dikonversi tidak tersedia');
    }
  }

  async process(input: GeneratorInput): Promise<ProcessingResult> {
    const url = input.mediaUrl ?? (input.content?.mediaUrl as string);
    const timeoutMs = input.timeoutMs ?? env.videoProcessingTimeoutMs;
    const { filePath } = await downloadMedia(url, { timeoutMs, signal: input.signal });

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
          'Reply sticker animasi lalu gunakan !togif',
          { userMessage: '❌ Reply sticker animasi lalu gunakan !togif.' },
        );
      }

      return await this.processor.process(stickerBuffer, timeoutMs, input.signal);
    } finally {
      cleanupTempFile(filePath);
    }
  }
}
