import { fastify } from './app';
import env from './config/env';
import { logger } from './observability/logger';
import { cleanupOrphanFiles } from './media/temp-files';
import { tuneSharpRuntime } from './media/sharp-runtime';
import { stopRuntimeTimers } from './http/webhook.controller';

const ORPHAN_SWEEP_INTERVAL_MS = 60_000;

let orphanSweep: NodeJS.Timeout | undefined;

/**
 * Hentikan semua timer background yang dibuat modul singleton.
 *
 * Semuanya di-unref() sehingga tidak menahan event loop, tapi tetap harus
 * dihentikan eksplisit agar tidak tetap berjalan selama graceful shutdown
 * (mis. saat `fastify.close()` sedang drain request).
 */
function stopBackgroundTimers(): void {
  if (orphanSweep) clearInterval(orphanSweep);
  stopRuntimeTimers();
}

async function start(): Promise<void> {
  try {
    tuneSharpRuntime();
    cleanupOrphanFiles();

    // Sapu file yatim secara berkala, bukan hanya saat boot. Container yang jalan
    // lama akan menumpuk file tmp yang bocor (mis. writeFile gagal ENOSPC).
    orphanSweep = setInterval(() => cleanupOrphanFiles(), ORPHAN_SWEEP_INTERVAL_MS);
    orphanSweep.unref?.();

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

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  try {
    await fastify.close();
    stopBackgroundTimers();
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: String(err) });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
