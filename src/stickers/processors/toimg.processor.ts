import Sharp from 'sharp';
import { StickerResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class ToImageProcessor {
  async process(stickerBuffer: Buffer, isAnimated: boolean): Promise<StickerResult | null> {
    if (isAnimated) {
      return null;
    }

    const pngBuffer = await Sharp(stickerBuffer).png().toBuffer();

    return {
      buffer: pngBuffer,
      mimetype: 'image/png' as any,
      width: 0,
      height: 0,
      animated: false,
      size: pngBuffer.length,
    };
  }
}
