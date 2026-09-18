import Fastify from 'fastify';
import { webhookController } from './http/webhook.controller';
import { healthController } from './http/health.controller';
import { logger } from './observability/logger';
import env from './config/env';

const fastify = Fastify({
  logger: env.logLevel !== 'silent',
  bodyLimit: 1_048_576,
});

fastify.post('/webhook', { bodyLimit: 1_048_576 }, webhookController);
fastify.get('/health', healthController);

export { fastify };
