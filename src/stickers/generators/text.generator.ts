import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { TextStickerProcessor } from '../processors/text.processor';
import { QuoteProcessor } from '../processors/quote.processor';
import { BubbleProcessor } from '../processors/bubble.processor';

export class TextGenerator implements StickerGenerator {
  readonly name = 'text';

  private plainTextProcessor = new TextStickerProcessor();
  private quoteProcessor = new QuoteProcessor();
  private bubbleProcessor = new BubbleProcessor();

  supports(input: GeneratorInput): boolean {
    return input.type === 'text';
  }

  validate(): void {}

  async process(input: GeneratorInput, context: GeneratorContext): Promise<ProcessingResult> {
    const content = input.content ?? {};
    const text = (input.text ?? content.text ?? '') as string;
    const modifier = input.modifier;

    if (modifier === 'quote') {
      const senderName = (content.senderName as string) ?? context.senderName;
      return this.quoteProcessor.process(text, senderName);
    }

    if (modifier === 'bubble') {
      return this.processBubble(content, context, text);
    }

    return this.plainTextProcessor.process(text);
  }

  private async processBubble(content: Record<string, unknown>, context: GeneratorContext, text: string) {
    const waha = context.wahaClient;
    const senderId = (content.senderId as string) ?? context.senderId;
    const quotedSenderId = content.quotedSenderId as string | undefined;

    const ids = [...new Set([senderId, quotedSenderId].filter(Boolean))] as string[];
    let byId = new Map<string, any>();

    if (waha && ids.length > 0) {
      const resolved = await Promise.all(
        ids.map(async (id) => {
          const [savedName, info] = await Promise.all([
            waha.getContactSavedName(id).catch(() => undefined),
            waha.getChatInfo(id).catch(() => null),
          ]);
          return { id, savedName, info };
        }),
      );
      byId = new Map(resolved.map((r) => [r.id, r]));
    }

    const sender = senderId ? byId.get(senderId) : undefined;
    const quotedRes = quotedSenderId ? byId.get(quotedSenderId) : undefined;

    const senderName = sender?.savedName || sender?.info?.name || (content.senderName as string) || context.senderName;
    const quoted = content.quotedBody
      ? {
          senderName: quotedRes?.savedName || quotedRes?.info?.name || (content.quotedSenderName as string) || '?',
          senderId: quotedSenderId,
          body: content.quotedBody as string,
        }
      : undefined;

    let avatar = null;
    if (waha) {
      if (sender?.info?.picture) {
        avatar = await waha.fetchExternalImage(sender.info.picture).catch(() => null);
      }
      if (!avatar && senderId) {
        avatar = await waha.getProfilePicture(senderId).catch(() => null);
      }
    }

    return this.bubbleProcessor.process(text, senderName, senderId, quoted, avatar);
  }
}
