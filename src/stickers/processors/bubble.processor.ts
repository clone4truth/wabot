import Sharp from 'sharp';
import { renderChatBubbleToBuffer, QuotedMessage } from '../rendering/chat-bubble';
import { StickerResult } from '../result';
import env from '../../config/env';
import { validateText } from '../rendering/text-utils';

export class BubbleProcessor {
  async process(
    text: string,
    senderName?: string,
    senderId?: string,
    quoted?: QuotedMessage,
    avatar?: { buffer: Buffer; mimetype: string } | null,
  ): Promise<StickerResult> {
    const clean = validateText(text, {
      maxLength: env.maxTextLength,
      emptyMessage: 'Teks bubble tidak boleh kosong',
    });

    const bubble = await renderChatBubbleToBuffer({
      senderName: senderName || '?',
      senderId: senderId || senderName || '?',
      text: clean,
      quoted,
      avatar,
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
