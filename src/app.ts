import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { webhookController } from './http/webhook.controller';
import { healthController } from './http/health.controller';
import { dashboardController } from './http/dashboard.controller';
import { logsController } from './http/logs.controller';
import { logger, getLogs, getErrors } from './observability/logger';
import env from './config/env';

const fastify = Fastify({
  logger: env.logLevel !== 'silent',
  bodyLimit: 1_048_576,
});

fastify.addHook('preParsing', async (request) => {
  const rawBody = await new Promise<Buffer>((resolve, reject) => {
    let buf = Buffer.alloc(0);
    request.raw.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
    });
    request.raw.on('end', () => resolve(buf));
    request.raw.on('error', reject);
  });
  (request as any).rawBody = rawBody;
});

fastify.post('/webhooks', { bodyLimit: 1_048_576 }, webhookController);
fastify.post('/webhook', { bodyLimit: 1_048_576 }, webhookController);
fastify.get('/health', healthController);
fastify.get('/dashboard', dashboardController);
fastify.get('/api/logs', logsController);

export { fastify };
