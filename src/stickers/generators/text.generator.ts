import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { TextStickerProcessor } from '../processors/text.processor';
import { QuoteProcessor } from '../processors/quote.processor';
import { BubbleProcessor } from '../processors/bubble.processor';
import { firstHumanDisplayName } from '../../whatsapp/display-name';

interface ResolvedPerson {
  savedName?: string;
  info?: { name?: string; picture?: string } | null;
}

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
      const senderId = (content.senderId as string) ?? context.senderId;
      const person = await this.resolvePeople([senderId], context).then((people) => people.get(senderId));
      const senderName = firstHumanDisplayName(
        [person?.savedName, person?.info?.name, content.senderName, context.senderName],
        'Pengguna WhatsApp',
      );
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

    const byId = await this.resolvePeople([senderId, quotedSenderId], context);

    const sender = senderId ? byId.get(senderId) : undefined;
    const quotedRes = quotedSenderId ? byId.get(quotedSenderId) : undefined;

    const senderName = firstHumanDisplayName(
      [sender?.savedName, sender?.info?.name, content.senderName, context.senderName],
      'Pengguna WhatsApp',
    );
    const quoted = content.quotedBody
      ? {
          senderName: firstHumanDisplayName(
            [quotedRes?.savedName, quotedRes?.info?.name, content.quotedSenderName],
            'Pengguna WhatsApp',
          )!,
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

  private async resolvePeople(
    rawIds: Array<string | undefined>,
    context: GeneratorContext,
  ): Promise<Map<string, ResolvedPerson>> {
    const waha = context.wahaClient;
    const ids = [...new Set(rawIds.filter(Boolean))] as string[];
    if (!waha || ids.length === 0) return new Map();

    const resolved = await Promise.all(
      ids.map(async (id) => {
        const [savedName, info] = await Promise.all([
          waha.getContactSavedName(id).catch(() => undefined),
          waha.getChatInfo(id).catch(() => null),
        ]);
        return [id, { savedName, info }] as const;
      }),
    );
    return new Map(resolved);
  }
}
