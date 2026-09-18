import Sharp from 'sharp';
import { ImageResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class ToImageProcessor {
  async process(stickerBuffer: Buffer, isAnimated: boolean): Promise<ImageResult> {
    if (isAnimated) {
      throw new AppError(ErrorCode.UNSUPPORTED_STICKER_TYPE, 'Animated sticker tidak bisa dikonversi ke gambar');
    }

    const pngBuffer = await Sharp(stickerBuffer).png().toBuffer().catch(() => {
      throw new AppError(ErrorCode.MEDIA_DECODE_FAILED, 'Sticker tidak dapat dibaca');
    });
    const meta = await Sharp(pngBuffer).metadata().catch(() => null);

    return {
      buffer: pngBuffer,
      mimetype: 'image/png',
      width: meta?.width || 0,
      height: meta?.height || 0,
      animated: false,
      size: pngBuffer.length,
    };
  }
}
