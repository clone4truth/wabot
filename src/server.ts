import { fastify } from './app';
import env from './config/env';
import { logger } from './observability/logger';
import { cleanupOrphanFiles } from './media/temp-files';

async function start(): Promise<void> {
  try {
    cleanupOrphanFiles();

    await fastify.listen({
      port: env.appPort,
      host: '0.0.0.0',
    });

    logger.info('Sticker Bot started', {
      port: env.appPort,
      env: env.appEnv,
      wahaBaseUrl: env.wahaBaseUrl,
    });
  } catch (err) {
    logger.error('Failed to start server', { error: String(err) });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: String(err) });
});

start();
