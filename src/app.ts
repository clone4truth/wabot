import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { Readable } from 'stream';
import { webhookController } from './http/webhook.controller';
import { healthController, readyController } from './http/health.controller';
import { registerAdminRoutes } from './http/admin/admin.routes';
import { registerDashboardStatic } from './http/admin/static';
import env from './config/env';

const fastify = Fastify({
  logger: env.logLevel !== 'silent',
  bodyLimit: 1_048_576,
});

// Dibutuhkan untuk session cookie dashboard admin (HttpOnly + SameSite).
// Harus di-register SEBELUM admin routes agar dekorator `cookies` tersedia.
fastify.register(fastifyCookie, { parseOptions: { path: '/' } });

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
fastify.get('/ready', readyController);

// Dashboard admin + API-nya. Semua /api/admin/* kecuali /login dan /session
// dijaga session cookie (lihat admin.routes.ts).
//
// CATATAN: route lama /dashboard + /api/logs (HTML string tanpa auth) DIHAPUS.
// Dashboard sekarang SPA Vue yang di-serve di /dashboard, dan log hanya lewat
// /api/admin/logs yang butuh login.
fastify.register(registerAdminRoutes);
fastify.register(registerDashboardStatic);

export { fastify };
