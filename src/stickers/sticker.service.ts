import { ProcessingResult } from './result';
import { addStickerExif } from './exif';
import { logger } from '../observability/logger';
import { InputResolver, ResolvedInput } from './input.resolver';
import { PerUserConcurrency } from './concurrency';
import { WAHAClient } from '../whatsapp/waha.client';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { GeneratorRegistry, defaultGeneratorRegistry } from './generators/registry';
import { GeneratorContext, GeneratorInput } from './generators/types';
import { JobManager, defaultJobManager, JobType } from './jobs/job-manager';
import { hashIdentifier } from '../observability/privacy';
import { resolveMentionDisplayNames } from '../whatsapp/mention-display';
import Sharp from 'sharp';

const MAX_STATIC_STICKER_BYTES = 100 * 1024;

export class StickerService {
  private inputResolver = new InputResolver();
  private wahaClient: WAHAClient;
  private videoSlots: PerUserConcurrency;
  private registry: GeneratorRegistry;
  private jobManager: JobManager;

  constructor(
    videoSlots?: PerUserConcurrency,
    registry?: GeneratorRegistry,
    jobManager?: JobManager,
    wahaClient?: WAHAClient,
  ) {
    this.videoSlots = videoSlots ?? new PerUserConcurrency();
    this.registry = registry ?? defaultGeneratorRegistry;
    this.jobManager = jobManager ?? defaultJobManager;
    this.wahaClient = wahaClient ?? new WAHAClient();
  }

  async process(normalizedMessage: {
    command: string;
    args: string;
    modifier?: string;
    options?: Record<string, unknown>;
    reply?: { messageId?: string; timestamp?: number; body?: string; senderId?: string; senderName?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
    chatId: string;
    senderId: string;
    senderName?: string;
    messageId?: string;
    timestamp?: number;
    isGroup: boolean;
    session?: string;
  }): Promise<ProcessingResult | null> {
    const { command, args, modifier, options, reply, media, senderName, senderId, chatId, session, messageId, timestamp, isGroup } = normalizedMessage;
    const input = this.inputResolver.resolve({ command, args, modifier, options, reply, media, senderName, senderId, messageId, timestamp });

    if (!input) {
      throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Unsupported input type');
    }

    const generatorInput: GeneratorInput = {
      type: input.type,
      modifier: input.modifier,
      text: input.content.text,
      mediaUrl: input.content.mediaUrl,
      mimetype: input.content.mimetype,
      options: input.options,
      content: input.content,
    };

    await this.resolveMentionText(generatorInput, session);

    const context: GeneratorContext = {
      chatId,
      senderId,
      senderName,
      session,
      isGroup,
      wahaClient: this.wahaClient,
    };

    const generator = this.registry.resolve(generatorInput);
    await generator.validate(generatorInput, context);

    const jobType = this.resolveJobType(input.type);
    const timeoutMs = this.getTimeout(input.type);
    const needsSlot = jobType === 'video';
    const slotKey = `video:${senderId}`;

    if (needsSlot && !this.videoSlots.tryAcquire(slotKey)) {
      throw new AppError(ErrorCode.VIDEO_BUSY, 'Video masih diproses');
    }

    try {
      const ownerHash = hashIdentifier(senderId);
      const raw = await this.jobManager.execute(
        jobType,
        ownerHash,
        (ctx) => {
          // Propagate remaining deadline + cancellation signal into the generator.
          const effectiveInput: GeneratorInput = {
            ...generatorInput,
            timeoutMs: ctx?.remainingTimeoutMs ?? timeoutMs,
            signal: ctx?.signal,
          };
          return generator.process(effectiveInput, context);
        },
        { timeoutMs },
      );

      return this.withPackMeta(raw, input.type);
    } finally {
      if (needsSlot) this.videoSlots.release(slotKey);
    }
  }

  private resolveJobType(type: string): JobType {
    if (type === 'video' || type === 'togif') {
      return 'video';
    }
    if (type === 'attp') {
      return 'animation';
    }
    if (type === 'removebg' || type === 'subject' || type === 'outline') {
      return 'background';
    }
    return 'image';
  }

  /** Resolve @number to @Display Name consistently for every text feature. */
  private async resolveMentionText(input: GeneratorInput, session?: string): Promise<void> {
    const content = input.content ?? {};
    const fields = [
      input.text,
      content.text as string | undefined,
      content.args as string | undefined,
      content.quotedBody as string | undefined,
    ];
    if (!fields.some((value) => typeof value === 'string' && /@\d{7,20}/.test(value))) return;

    const [text, contentText, args, quotedBody] = await resolveMentionDisplayNames(fields, {
      getContactSavedName: (contactId) => this.wahaClient.getContactSavedName(contactId, session),
    });
    if (typeof input.text === 'string') input.text = text;
    if (typeof content.text === 'string') content.text = contentText;
    if (typeof content.args === 'string') content.args = args;
    if (typeof content.quotedBody === 'string') content.quotedBody = quotedBody;
  }

  // Metadata pack WhatsApp (nama pack + emoji) untuk webp statis.
  private async withPackMeta(result: ProcessingResult | null, inputType: string): Promise<ProcessingResult | null> {
    if (!result || result.mimetype !== 'image/webp' || result.animated) return result;
    const emojis: Record<string, string[]> = {
      text: ['💬'],
      image: ['🖼️'],
      video: ['🎬'],
      meme: ['😂'],
      ttp: ['🎨'],
      attp: ['✨'],
      emoji: ['😀'],
      badge: ['🏷️'],
      caption: ['📝'],
      template: ['📋'],
      removebg: ['✂️'],
      subject: ['🎯'],
      outline: ['⭐'],
    };
    const pack = { emojis: emojis[inputType] || ['🤖'] };
    const attachPack = async (input: Buffer): Promise<Buffer> => {
      try {
        return await addStickerExif(input, pack);
      } catch (err) {
        logger.warn('Gagal menempel EXIF pack, kirim tanpa metadata', { error: String(err) });
        return input;
      }
    };
    let buffer = await attachPack(result.buffer);
    // WhatsApp's static sticker limit includes the final pack metadata. Only
    // recompress oversized images; text and existing small stickers stay crisp.
    if (buffer.length > MAX_STATIC_STICKER_BYTES) {
      for (const quality of [85, 65, 45, 25, 10, 1]) {
        const encoded = await Sharp(result.buffer).webp({ quality, alphaQuality: 100, effort: 4 }).toBuffer();
        buffer = await attachPack(encoded);
        if (buffer.length <= MAX_STATIC_STICKER_BYTES) break;
      }
      if (buffer.length > MAX_STATIC_STICKER_BYTES) {
        throw new AppError(ErrorCode.MEDIA_TOO_LARGE, 'Hasil stiker melebihi 100 KB', {
          userMessage: '❌ Gambar terlalu kompleks untuk stiker 100 KB. Coba gambar dengan detail lebih sederhana.',
        });
      }
    }
    return { ...result, buffer, size: buffer.length };
  }

  private getTimeout(inputType: string): number {
    const timeouts: Record<string, number> = {
      text: env.textProcessingTimeoutMs,
      image: env.imageProcessingTimeoutMs,
      video: env.videoProcessingTimeoutMs,
      toimg: env.imageProcessingTimeoutMs,
      togif: env.videoProcessingTimeoutMs,
      meme: env.imageProcessingTimeoutMs,
      ttp: env.textProcessingTimeoutMs,
      attp: env.videoProcessingTimeoutMs,
      template: env.imageProcessingTimeoutMs,
      emoji: env.textProcessingTimeoutMs,
      badge: env.textProcessingTimeoutMs,
      caption: env.imageProcessingTimeoutMs,
      removebg: env.backgroundRemovalTimeoutMs,
      subject: env.backgroundRemovalTimeoutMs,
      outline: env.backgroundRemovalTimeoutMs,
    };
    return timeouts[inputType] || env.textProcessingTimeoutMs;
  }
}
