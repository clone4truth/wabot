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
    reply?: { body?: string; senderId?: string; senderName?: string; media?: { url?: string; mimetype?: string } };
    media?: { url?: string; mimetype?: string };
    chatId: string;
    senderId: string;
    senderName?: string;
    isGroup: boolean;
    session?: string;
  }): Promise<ProcessingResult | null> {
    const { command, args, modifier, options, reply, media, senderName, senderId, chatId, session } = normalizedMessage;
    const input = this.inputResolver.resolve({ command, args, modifier, options, reply, media, senderName, senderId });

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

    const context: GeneratorContext = {
      chatId,
      senderId,
      senderName,
      session,
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
      const isHeavy = input.type === 'video' || input.type === 'togif' || input.type === 'attp';
      let raw: ProcessingResult | null;

      if (isHeavy) {
        raw = await this.jobManager.execute(jobType, senderId, () =>
          generator.process(generatorInput, context)
        );
      } else {
        let timer: NodeJS.Timeout | undefined;
        try {
          raw = await Promise.race([
            this.jobManager.execute(jobType, senderId, () =>
              generator.process(generatorInput, context)
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Processing timeout')),
                timeoutMs
              );
              if (typeof (timer as any).unref === 'function') (timer as any).unref();
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

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
    try {
      const buffer = await addStickerExif(result.buffer, { emojis: emojis[inputType] || ['🤖'] });
      return { ...result, buffer, size: buffer.length };
    } catch (err) {
      logger.warn('Gagal menempel EXIF pack, kirim tanpa metadata', { error: String(err) });
      return result;
    }
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
