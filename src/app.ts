import Fastify from 'fastify';
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

fastify.post('/webhooks', { bodyLimit: 1_048_576 }, webhookController);
fastify.get('/health', healthController);
fastify.get('/dashboard', dashboardController);
fastify.get('/api/logs', logsController);

export { fastify };
