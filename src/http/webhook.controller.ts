import { FastifyRequest, FastifyReply } from 'fastify';
import { WebhookVerifier } from '../whatsapp/webhook.verifier';
import { MessageNormalizer } from '../whatsapp/message.normalizer';
import { IdempotencyGuard } from '../security/idempotency';
import { MemoryRateLimiter } from '../security/memory-rate-limiter';
import { StickerService } from '../stickers/sticker.service';
import { parseCommand } from '../commands/parser';
import { CommandRouter } from '../commands/router';
import { createStikerHandler } from '../commands/stiker.handler';
import { createToimgHandler } from '../commands/toimg.handler';
import { createTogifHandler } from '../commands/togif.handler';
import { handleMenu } from '../commands/menu.handler';
import { handleHelp } from '../commands/help.handler';
import { handlePing } from '../commands/ping.handler';
import { WAHAClient } from '../whatsapp/waha.client';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import env from '../config/env';
import { logger } from '../observability/logger';

const verifier = new WebhookVerifier();
const normalizer = new MessageNormalizer();
const idempotency = new IdempotencyGuard();
const rateLimiter = new MemoryRateLimiter();
const stickerService = new StickerService();
const wahaClient = new WAHAClient();
const commandRouter = new CommandRouter();

commandRouter.register('stiker', createStikerHandler(stickerService));
commandRouter.register('toimg', createToimgHandler(stickerService));
commandRouter.register('togif', createTogifHandler(stickerService));

export async function webhookController(request: FastifyRequest, reply: FastifyReply) {
  const startTime = Date.now();

  try {
    const rawBodyBuf = (request as any).rawBody as Buffer | undefined;
    const body = rawBodyBuf?.toString('utf8') ?? JSON.stringify(request.body);

    verifier.validateBodySize(body);

    const wahaHmac = (request.headers['x-webhook-hmac'] as string | undefined) || '';
    const wahaAlgo = (request.headers['x-webhook-hmac-algorithm'] as string | undefined) || 'sha512';
    const hubSig = (request.headers['x-hub-signature-256'] as string | undefined) || '';

    // WAHA hanya mengirim header HMAC bila HMAC Key diisi. Tanpa header = lewati verifikasi.
    if (env.wahaWebhookHmacKey && (wahaHmac || hubSig)) {
      const verifyResult = wahaHmac
        ? verifier.verifyWaha(body, wahaHmac, wahaAlgo)
        : verifier.verify(body, hubSig);
      if (!verifyResult.valid) {
        logger.warn('Invalid webhook signature', {
          requestId: request.id,
          wahaAlgo,
          wahaHmacPrefix: wahaHmac ? wahaHmac.slice(0, 20) : '(empty)',
          hubSigPrefix: hubSig ? hubSig.slice(0, 20) : '(empty)',
          expectedPrefix: verifyResult.expected?.slice(0, 20) || 'N/A',
          receivedPrefix: verifyResult.received?.slice(0, 20) || 'N/A',
          bodyLength: body.length,
          hmacKeySet: !!env.wahaWebhookHmacKey,
        });
        throw new AppError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
      }
    }

    const payload = request.body as any;

    if (payload.event !== 'message') {
      return reply.code(200).send({ status: 'ok' });
    }

    const message = normalizer.normalize(payload);

    const raw = (payload as any).payload as any;
    logger.info('Incoming message', {
      requestId: request.id,
      chatId: message.chatId,
      senderId: message.senderId,
      isGroup: message.isGroup,
      fromMe: message.fromMe,
      rawFrom: raw?.from,
      rawTo: raw?.to,
      rawParticipant: raw?.participant,
      rawSender: raw?.sender?.id || raw?.sender,
      bodyPrefix: message.body.slice(0, 30),
    });

    if (normalizer.shouldIgnore(message) || message.fromMe) {
      return reply.code(200).send({ status: 'ok' });
    }

    const rateKey = message.isGroup ? `group:${message.chatId}` : message.senderId;
    const rateResult = await rateLimiter.consume(rateKey);
    if (!rateResult.allowed) {
      // Sudah ditangani (balas peringatan) -> 200 agar WAHA tidak me-retry.
      await wahaClient.sendText(message.chatId, '⏳ Terlalu banyak permintaan. Coba lagi beberapa saat.');
      return reply.code(200).send({ status: 'rate_limited' });
    }

    const idempotencyKey = `${message.eventId}`;
    if (idempotency.isDuplicate(idempotencyKey)) {
      logger.info('Duplicate webhook detected', { eventId: message.eventId });
      return reply.code(200).send({ status: 'ok', duplicate: true });
    }

    const parsed = parseCommand(message.body);
    if (!parsed) {
      return reply.code(200).send({ status: 'ok' });
    }

    idempotency.markProcessed(idempotencyKey);

    const result = await dispatchCommand(parsed, message);

    logger.info('Webhook processed', {
      requestId: request.id,
      messageIdHash: message.messageId,
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

async function dispatchCommand(parsed: NonNullable<ReturnType<typeof parseCommand>>, message: any) {
  const replyTo = message.messageId;
  switch (parsed.name) {
    case 'menu':
      await wahaClient.sendText(message.chatId, handleMenu(), replyTo);
      break;
    case 'help':
      await wahaClient.sendText(message.chatId, handleHelp(), replyTo);
      break;
    case 'ping':
      const ping = handlePing();
      await wahaClient.sendText(message.chatId, `🏓 Pong! Latency: ${ping.latency}ms`, replyTo);
      break;
    default:
      let result: any;
      try {
        result = await commandRouter.dispatch(parsed, {
          ...message,
          reply: message.reply,
          media: message.media,
        });
      } catch (err: any) {
        if (err instanceof AppError) {
          await wahaClient.sendText(message.chatId, err.message, replyTo);
          return;
        }
        throw err;
      }

      if (result && result.buffer) {
        if (result.mimetype === 'image/webp') {
          await wahaClient.sendSticker(message.chatId, result.buffer, replyTo);
        } else {
          await wahaClient.sendImage(message.chatId, result.buffer, result.mimetype, replyTo);
        }
      }
  }
}
