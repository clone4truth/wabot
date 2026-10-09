import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { TextStickerProcessor } from '../processors/text.processor';
import { QuoteProcessor } from '../processors/quote.processor';
import { BubbleProcessor } from '../processors/bubble.processor';
import { firstHumanDisplayName } from '../../whatsapp/display-name';
import { formatMessageTime, normalizeMessageTimestamp } from '../../whatsapp/message-time';
import { getRememberedMessageTimestamp, rememberMessageTimestamp } from '../../whatsapp/message-timestamp-cache';
import { WahaLookupOptions } from '../../whatsapp/waha.client';
import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

interface ResolvedPerson {
  savedName?: string;
  info?: { name?: string; picture?: string } | null;
}

function optionalLookup<T>(request: () => Promise<T>, signal: AbortSignal | undefined, fallback: T): Promise<T> {
  if (signal?.aborted) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const onAbort = () => finish(fallback);
    const finish = (value: T) => {
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => signal?.aborted ? fallback : request()).then(finish, () => finish(fallback));
  });
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
      return this.processBubble(content, context, text, input);
    }

    return this.plainTextProcessor.process(text);
  }

  private async processBubble(content: Record<string, unknown>, context: GeneratorContext, text: string, input: GeneratorInput) {
    const timeoutMs = input.timeoutMs ?? env.textProcessingTimeoutMs;
    const deadlineAt = Date.now() + timeoutMs;
    const controller = new AbortController();
    // Metadata/avatar are optional. Leave time for measured text and WebP output.
    const enrichmentMs = Math.max(0, timeoutMs - 750);
    const timer = setTimeout(() => controller.abort(), enrichmentMs);
    if (enrichmentMs === 0) controller.abort();
    const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
    const lookupOptions = { signal, timeoutMs: enrichmentMs };
    const throwIfCancelled = () => {
      if (input.signal?.aborted || Date.now() >= deadlineAt) {
        throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan atau waktu pemrosesan habis');
      }
    };
    try {
      throwIfCancelled();
      const waha = context.wahaClient;
      // A bubble is viewed from the user who requested it, rather than the bot.
      // Current command text is authored by that user, even if an engine uses
      // different identifier formats in its metadata. For replies, only an
      // exact known author match is sufficient to identify an outgoing bubble.
      const direction = content.timestampSource === 'current' || content.senderId === context.senderId
        ? 'outgoing'
        : 'incoming';
      const showSenderName = direction === 'incoming' && context.isGroup !== false;
      const senderId = (content.senderId as string | undefined) ??
        (content.timestampSource === 'reply' ? undefined : context.senderId);
      const quotedSenderId = content.quotedSenderId as string | undefined;
      const [byId, time] = await Promise.all([
        this.resolvePeople([showSenderName ? senderId : undefined, quotedSenderId], context, lookupOptions),
        this.resolveBubbleTime(content, context, lookupOptions),
      ]);

      const sender = senderId ? byId.get(senderId) : undefined;
      const quotedRes = quotedSenderId ? byId.get(quotedSenderId) : undefined;

      const senderName = showSenderName ? firstHumanDisplayName(
        [sender?.savedName, sender?.info?.name, content.senderName,
          content.timestampSource === 'reply' ? undefined : context.senderName],
        'Pengguna WhatsApp',
      ) : undefined;
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
      if (showSenderName && waha && !signal.aborted) {
        if (sender?.info?.picture) {
          avatar = await optionalLookup(() => waha.fetchExternalImage(sender.info!.picture!, lookupOptions), signal, null);
        }
        if (!avatar && senderId && !signal.aborted) {
          avatar = await optionalLookup(() => waha.getProfilePicture(senderId, context.session, lookupOptions), signal, null);
        }
      }

      throwIfCancelled();
      return await this.bubbleProcessor.process(text, senderName, senderId, quoted, avatar, time, direction, showSenderName);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  private async resolveBubbleTime(content: Record<string, unknown>, context: GeneratorContext, options?: WahaLookupOptions): Promise<string> {
    let timestamp = normalizeMessageTimestamp(content.timestamp);
    if (timestamp === undefined && content.timestampSource === 'reply' && typeof content.messageId === 'string') {
      timestamp = getRememberedMessageTimestamp(context.session, context.chatId, content.messageId);
      if (timestamp === undefined && context.wahaClient) {
        timestamp = await optionalLookup(() => context.wahaClient!.getMessageTimestamp(
          context.chatId, content.messageId as string, context.session,
          { ...options, participant: typeof content.senderId === 'string' ? content.senderId : undefined },
        ), options?.signal, undefined);
        rememberMessageTimestamp(context.session, context.chatId, content.messageId, timestamp);
      }
    }
    return formatMessageTime(timestamp);
  }

  private async resolvePeople(
    rawIds: Array<string | undefined>,
    context: GeneratorContext,
    options?: WahaLookupOptions,
  ): Promise<Map<string, ResolvedPerson>> {
    const waha = context.wahaClient;
    const ids = [...new Set(rawIds.filter(Boolean))] as string[];
    if (!waha || ids.length === 0) return new Map();

    const resolved = await Promise.all(
      ids.map(async (id) => {
        const [savedName, info] = await Promise.all([
          optionalLookup(() => waha.getContactSavedName(id, context.session, options), options?.signal, undefined),
          optionalLookup(() => waha.getChatInfo(id, context.session, options), options?.signal, null),
        ]);
        return [id, { savedName, info }] as const;
      }),
    );
    return new Map(resolved);
  }
}
