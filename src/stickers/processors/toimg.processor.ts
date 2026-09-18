import Sharp from 'sharp';
import { ImageResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class ToImageProcessor {
  async process(stickerBuffer: Buffer, isAnimated?: boolean): Promise<ImageResult> {
    let meta;
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

    const animated = isAnimated !== undefined ? isAnimated : (meta.pages ?? 1) > 1;
    if (animated) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_STICKER_TYPE,
        'Sticker bergerak. Gunakan !togif',
        { userMessage: '❌ Sticker bergerak. Gunakan !togif.' },
      );
    }

    let pngBuffer: Buffer;
    try {
      pngBuffer = await Sharp(stickerBuffer).png().toBuffer();
    } catch {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Gagal mengonversi sticker ke gambar');
    }

    const pngMeta = await Sharp(pngBuffer).metadata().catch(() => null);

    return {
      buffer: pngBuffer,
      mimetype: 'image/png',
      width: pngMeta?.width || meta.width || 0,
      height: pngMeta?.height || meta.height || 0,
      animated: false,
      size: pngBuffer.length,
    };
  }
}
