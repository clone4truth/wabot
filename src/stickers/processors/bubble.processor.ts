import Sharp from 'sharp';
import { renderChatBubbleToBuffer, QuotedMessage } from '../rendering/chat-bubble';
import { StickerResult } from '../result';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class BubbleProcessor {
  async process(text: string, senderName?: string, senderId?: string, quoted?: QuotedMessage): Promise<StickerResult> {
    if (text.length > env.maxTextLength) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, `Teks maksimal ${env.maxTextLength} karakter`);
    }

    const bubble = await renderChatBubbleToBuffer({
      senderName: senderName || 'W',
      senderId: senderId || senderName || '?',
      text,
      quoted,
    });

    const webpBuffer = await Sharp(bubble)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer();

    return {
      buffer: webpBuffer,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: webpBuffer.length,
    };
  }
}
