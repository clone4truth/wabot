import { FastifyRequest, FastifyReply } from 'fastify';
import { WebhookVerifier } from '../whatsapp/webhook.verifier';
import { MessageNormalizer } from '../whatsapp/message.normalizer';
import { IdempotencyGuard } from '../security/idempotency';
import { MemoryRateLimiter } from '../security/memory-rate-limiter';
import { StickerService } from '../stickers/sticker.service';
import { parseCommand } from '../commands/parser';
import { CommandRouter } from '../commands/router';
import { createStikerHandler } from '../commands/stiker.handler';
import { createTtpHandler } from '../commands/ttp.handler';
import { createAttpHandler } from '../commands/attp.handler';
import { createToimgHandler } from '../commands/toimg.handler';
import { createTogifHandler } from '../commands/togif.handler';
import { handleMenu } from '../commands/menu.handler';
import { handleHelp } from '../commands/help.handler';
import { handlePing } from '../commands/ping.handler';
import { handleTemplateCommand } from '../commands/template.handler';
import { handleJobCommand } from '../commands/job.handler';
import { WAHAClient } from '../whatsapp/waha.client';
import { AccessGuard } from '../security/access';
import { AppError } from '../errors/app-error';
import { ErrorCode, userMessageForError } from '../errors/error-codes';
import { ProcessingResult } from '../stickers/result';
import env from '../config/env';
import { logger } from '../observability/logger';
import { hashIdentifier } from '../observability/privacy';

const verifier = new WebhookVerifier();
const normalizer = new MessageNormalizer();
const idempotency = new IdempotencyGuard();
const rateLimiter = new MemoryRateLimiter();
const stickerService = new StickerService();
const wahaClient = new WAHAClient();
const accessGuard = new AccessGuard(wahaClient);
const commandRouter = new CommandRouter();

commandRouter.register('stiker', createStikerHandler(stickerService));
commandRouter.register('ttp', createTtpHandler(stickerService));
commandRouter.register('attp', createAttpHandler(stickerService));
commandRouter.register('toimg', createToimgHandler(stickerService));
commandRouter.register('togif', createTogifHandler(stickerService));
commandRouter.register('emoji', createStikerHandler(stickerService));
commandRouter.register('badge', createStikerHandler(stickerService));

export async function webhookController(request: FastifyRequest, reply: FastifyReply) {
  const startTime = Date.now();

  try {
    const rawBodyBuf = (request as any).rawBody as Buffer | undefined;
    const body = rawBodyBuf?.toString('utf8') ?? JSON.stringify(request.body);

    verifier.validateBodySize(body);

    const wahaHmac = (request.headers['x-webhook-hmac'] as string | undefined) || '';
    const wahaAlgo = (request.headers['x-webhook-hmac-algorithm'] as string | undefined) || 'sha512';
    const hubSig = (request.headers['x-hub-signature-256'] as string | undefined) || '';

    // HMAC key kosong -> mode development, verifikasi dilewati.
    // HMAC key tersedia -> signature mandatory: tidak ada / tidak valid = reject.
    if (env.wahaWebhookHmacKey) {
      const verifyResult = wahaHmac
        ? verifier.verifyWaha(body, wahaHmac, wahaAlgo)
        : hubSig
          ? verifier.verify(body, hubSig)
          : { valid: false } as const;
      if (!verifyResult.valid) {
        logger.warn('Invalid webhook signature', { requestId: request.id });
        throw new AppError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
      }
    }

    const payload = request.body as any;

    if (payload.event !== 'message') {
      return reply.code(200).send({ status: 'ok' });
    }

    const message = normalizer.normalize(payload);

    logger.info('Incoming message', {
      requestId: request.id,
      session: payload.session,
      chatIdHash: hashIdentifier(message.chatId),
      senderIdHash: hashIdentifier(message.senderId),
      isGroup: message.isGroup,
      fromMe: message.fromMe,
    });

    const prefix = accessGuard.resolvePrefix(message.chatId);

    if (normalizer.shouldIgnore(message, prefix) || message.fromMe) {
      return reply.code(200).send({ status: 'ok' });
    }

    const parsed = parseCommand(message.body, prefix);
    if (!parsed) {
      return reply.code(200).send({ status: 'ok' });
    }

    const access = await accessGuard.check(message);
    if (!access.allowed) {
      if (access.reason === 'admin') {
        await wahaClient.sendText(message.chatId, '🔒 Bot ini hanya merespons admin grup.', message.messageId);
      } else {
        logger.info('Access ditolak', { requestId: request.id, reason: access.reason });
      }
      return reply.code(200).send({ status: 'ok', denied: access.reason });
    }

    const idempotencyKey = `${message.eventId}`;
    if (!idempotency.tryStart(idempotencyKey)) {
      logger.info('Duplicate webhook detected', { messageIdHash: hashIdentifier(message.eventId) });
      return reply.code(200).send({ status: 'ok', duplicate: true });
    }

    // Rate limit SETELAH idempotency atomic claim agar duplikat konkuren tidak memakan kuota.
    // PRD: private -> user limit; group -> user limit DAN group limit.
    const userResult = await rateLimiter.consume(`user:${message.senderId}`);
    const groupResult = message.isGroup
      ? await rateLimiter.consume(`group:${message.chatId}`)
      : { allowed: true, remaining: 0, resetAt: 0 };
    if (!userResult.allowed || !groupResult.allowed) {
      // Sudah ditangani (balas peringatan) -> tandai done agar tidak menggantung di PROCESSING
      idempotency.markDone(idempotencyKey);
      await wahaClient.sendText(message.chatId, '⏳ Terlalu banyak permintaan. Coba lagi beberapa saat.');
      return reply.code(200).send({ status: 'rate_limited' });
    }

    try {
      await dispatchCommand(parsed, message);
      idempotency.markDone(idempotencyKey);
    } catch (err) {
      // Gagal -> state dihapus agar retry WAHA boleh memproses lagi.
      idempotency.markFailed(idempotencyKey);
      throw err;
    }

    logger.info('Webhook processed', {
      requestId: request.id,
      messageIdHash: hashIdentifier(message.messageId),
      command: parsed.name,
      processingDurationMs: Date.now() - startTime,
      success: true,
    });

    return reply.code(200).send({ status: 'ok' });
  } catch (err: any) {
    if (err instanceof AppError && err.code === ErrorCode.INVALID_WEBHOOK_SIGNATURE) {
      return reply.code(403).send({ error: 'Invalid signature', debug: 'check logs for details' });
    }
    logger.error('Webhook processing error', { error: String(err), requestId: request.id });
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

async function handlePrefixCommand(message: any, arg: string, replyTo?: string) {
  const current = accessGuard.resolvePrefix(message.chatId);
  if (!arg) {
    await wahaClient.sendText(message.chatId, `Prefix chat ini: "${current}"\nUbah: ${current}prefix <simbol>`, replyTo);
    return;
  }
  if (message.isGroup && !(await accessGuard.isGroupAdmin(message.chatId, message.senderId))) {
    await wahaClient.sendText(message.chatId, '🔒 Hanya admin grup yang bisa ubah prefix.', replyTo);
    return;
  }
  if (accessGuard.setPrefix(message.chatId, arg)) {
    await wahaClient.sendText(message.chatId, `✅ Prefix diubah ke "${arg}"`, replyTo);
  } else {
    await wahaClient.sendText(message.chatId, `❌ Prefix harus 1 karakter simbol (mis. ! ? .). Prefix saat ini: "${current}"`, replyTo);
  }
}

async function dispatchCommand(parsed: NonNullable<ReturnType<typeof parseCommand>>, message: any) {
  const replyTo = message.messageId;
  switch (parsed.name) {
    case 'menu':
      await wahaClient.sendText(message.chatId, handleMenu(), replyTo);
      break;
    case 'help':
      await wahaClient.sendText(message.chatId, handleHelp(parsed.args), replyTo);
      break;
    case 'template':
      await wahaClient.sendText(message.chatId, handleTemplateCommand(parsed), replyTo);
      break;
    case 'job':
      await wahaClient.sendText(message.chatId, handleJobCommand(message.senderId), replyTo);
      break;
    case 'ping':
      const ping = handlePing();
      await wahaClient.sendText(message.chatId, `🏓 Pong! Latency: ${ping.latency}ms`, replyTo);
      break;
    case 'prefix':
      await handlePrefixCommand(message, parsed.args.trim(), replyTo);
      break;
    default:
      let result: ProcessingResult | null | undefined;
      try {
        result = await commandRouter.dispatch(parsed, {
          ...message,
          reply: message.reply,
          media: message.media,
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          // Hanya pesan user yang stabil (Bahasa Indonesia); detail internal tetap di log.
          await wahaClient.sendText(message.chatId, userMessageForError(err), replyTo);
          return;
        }
        throw err;
      }

      if (result) {
        await sendProcessingResult(result, message, replyTo);
      }
  }
}

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${JSON.stringify(x)}`);
}

async function sendProcessingResult(result: ProcessingResult, message: any, replyTo?: string): Promise<void> {
  switch (result.mimetype) {
    case 'image/webp':
      await wahaClient.sendSticker(message.chatId, result.buffer, replyTo);
      break;
    case 'image/png':
      await wahaClient.sendImage(message.chatId, result.buffer, result.mimetype, replyTo);
      break;
    case 'video/mp4':
      await wahaClient.sendVideo(message.chatId, result.buffer, result.mimetype, replyTo);
      break;
    default:
      assertNever(result);
  }
}
