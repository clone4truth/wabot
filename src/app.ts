import Fastify from 'fastify';
import { Readable } from 'stream';
import { webhookController } from './http/webhook.controller';
import { healthController } from './http/health.controller';
import { dashboardController } from './http/dashboard.controller';
import { logsController } from './http/logs.controller';
import { logger } from './observability/logger';
import env from './config/env';

const fastify = Fastify({
  logger: env.logLevel !== 'silent',
  bodyLimit: 1_048_576,
});

// Simpan raw body untuk verifikasi HMAC, lalu teruskan stream agar JSON parser tetap jalan.
fastify.addHook('preParsing', async (request, _reply, payload) => {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  (request as any).rawBody = buf;
  return Readable.from(buf);
});

fastify.post('/webhooks', { bodyLimit: 1_048_576 }, webhookController);
fastify.get('/health', healthController);
fastify.get('/dashboard', dashboardController);
fastify.get('/api/logs', logsController);

export { fastify };
