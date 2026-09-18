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
  const body = JSON.stringify(request.body);

  try {
    verifier.validateBodySize(body);

    const sigHeader = (request.headers['x-hub-signature-256'] as string | undefined) || '';
    const verifyResult = verifier.verify(body, sigHeader);

    if (!verifyResult.valid) {
      logger.warn('Invalid webhook signature', {
        requestId: request.id,
        sigHeader: sigHeader.slice(0, 20),
        expectedPrefix: verifyResult.expected?.slice(0, 20) || 'N/A',
        receivedPrefix: verifyResult.received?.slice(0, 20) || 'N/A',
        bodyLength: body.length,
        hmacKeySet: !!env.wahaWebhookHmacKey,
      });
      throw new AppError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
    }

    const payload = request.body as any;

    if (payload.event !== 'message') {
      return reply.code(200).send({ status: 'ok' });
    }

    const message = normalizer.normalize(payload);

    if (normalizer.shouldIgnore(message) || message.fromMe) {
      return reply.code(200).send({ status: 'ok' });
    }

    const rateKey = message.isGroup ? `group:${message.chatId}` : message.senderId;
    const rateResult = await rateLimiter.consume(rateKey);
    if (!rateResult.allowed) {
      await wahaClient.sendText(message.chatId, '⏳ Terlalu banyak permintaan. Coba lagi beberapa saat.');
      return reply.code(429).send({ status: 'rate_limited' });
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

    let result: any;
    try {
      result = await commandRouter.dispatch(parsed, {
        ...message,
        reply: message.reply,
        media: message.media,
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        await wahaClient.sendText(message.chatId, err.message);
        return reply.code(200).send({ status: 'ok', error: err.code });
      }
      throw err;
    }

    if (result && result.buffer) {
      await wahaClient.sendImage(message.chatId, result.buffer, result.mimetype);
    } else if (parsed.name === 'menu') {
      await wahaClient.sendText(message.chatId, handleMenu());
    } else if (parsed.name === 'help') {
      await wahaClient.sendText(message.chatId, handleHelp());
    } else if (parsed.name === 'ping') {
      const ping = handlePing();
      await wahaClient.sendText(message.chatId, `🏓 Pong! Latency: ${ping.latency}ms`);
    }

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
