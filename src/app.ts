import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import { webhookController } from './http/webhook.controller';
import { healthController } from './http/health.controller';
import { logger } from './observability/logger';
import env from './config/env';

const fastify = Fastify({
  logger: env.logLevel !== 'silent',
  bodyLimit: 1_048_576,
});

fastify.register(formBodyPlugin);

fastify.post('/webhook', { bodyLimit: 1_048_576 }, webhookController);
fastify.get('/health', healthController);

export { fastify };
