import { FastifyInstance } from 'fastify';
import env from '../../config/env';
import { WahaSessionClient, WahaSessionError } from '../../whatsapp/waha-session.client';

function webhookConfigured(): boolean {
  try {
    const url = new URL(env.wahaBotWebhookUrl);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Register inside the authenticated admin scope only. */
export async function registerWhatsappRoutes(secure: FastifyInstance): Promise<void> {
  const waha = new WahaSessionClient();
  let mutating = false;

  secure.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  secure.setErrorHandler((error, request, reply) => {
    if (!(error instanceof WahaSessionError)) {
      request.log.error({ err: error }, 'WhatsApp admin request failed');
      return reply.code(500).send({ error: 'Operasi WhatsApp gagal. Coba lagi.' });
    }
    // A WAHA 401 is an upstream configuration error, not an expired admin login.
    const message = error.status === 401 || error.status === 403
      ? 'Autentikasi WAHA gagal. Periksa WAHA_API_KEY di server.'
      : error.message;
    return reply.code(502).send({ error: message });
  });

  secure.get('/api/admin/whatsapp', async () => {
    const session = await waha.getSession();
    // Explicit projection: never return session.config (HMAC, proxy, headers).
    return {
      name: waha.session,
      exists: session !== null,
      status: session?.status ?? 'MISSING',
      engine: typeof session?.engine === 'string' ? session.engine : session?.engine?.engine ?? null,
      me: session?.me ? { id: session.me.id, pushName: session.me.pushName } : null,
      webhookConfigured: webhookConfigured(),
    };
  });

  secure.get('/api/admin/whatsapp/qr', async (_request, reply) => {
    const session = await waha.getSession();
    if (session?.status !== 'SCAN_QR_CODE') {
      return reply.code(409).send({ error: 'QR belum tersedia. Tunggu sesi siap dipindai.' });
    }
    return waha.getQr();
  });

  secure.post<{ Params: { action: string } }>('/api/admin/whatsapp/:action', async (request, reply) => {
    const { action } = request.params;
    if (!['connect', 'stop', 'restart', 'logout'].includes(action)) {
      return reply.code(400).send({ error: 'Operasi WhatsApp tidak dikenal.' });
    }
    if (mutating) {
      return reply.code(409).send({ error: 'Operasi sesi sedang berjalan. Tunggu sebentar.' });
    }
    mutating = true;
    try {
      const session = await waha.getSession();
      if (action === 'connect') {
        if (!session) {
          if (!webhookConfigured()) {
            return reply.code(409).send({
              error: 'Atur WAHA_BOT_WEBHOOK_URL ke URL /webhooks bot yang dapat dijangkau WAHA, lalu restart bot.',
            });
          }
          await waha.createSession(env.wahaBotWebhookUrl);
        } else if (session.status === 'STOPPED') {
          await waha.action('start');
        } else if (session.status === 'FAILED') {
          await waha.action('restart');
        }
        // STARTING / SCAN_QR_CODE / WORKING: already connecting or connected.
      } else {
        if (!session) return reply.code(409).send({ error: 'Sesi belum dibuat. Hubungkan WhatsApp terlebih dahulu.' });
        await waha.action(action as 'stop' | 'restart' | 'logout');
      }
      return { ok: true };
    } finally {
      mutating = false;
    }
  });
}
