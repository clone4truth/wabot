import Sharp from 'sharp';
import { renderTextToBuffer } from '../rendering/text-layout';
import { StickerResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class BubbleProcessor {
  async process(text: string): Promise<StickerResult> {
    const buffer = await renderTextToBuffer({
      text,
      maxWidth: 512,
      maxHeight: 512,
      fontSize: 28,
      color: '#ffffff',
      outlineColor: '#1a1a1a',
      outlineWidth: 1,
    });

    const roundedBuffer = await Sharp(buffer)
      .extend({
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 90 })
      .toBuffer();

    return {
      buffer: roundedBuffer,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: roundedBuffer.length,
    };
  }
}
