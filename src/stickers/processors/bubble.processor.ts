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
    time?: string,
    direction?: 'incoming' | 'outgoing',
    showSenderName?: boolean,
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
      time,
      direction,
      showSenderName,
    });

    return {
      buffer: bubble,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: bubble.length,
    };
  }
}
