import { FastifyInstance } from 'fastify';
import env from '../../config/env';
import { WahaSessionClient, WahaSessionError } from '../../whatsapp/waha-session.client';

const READ_CACHE_MS = 15_000;
const PROFILE_CACHE_MS = 60_000;
const ACTION_COOLDOWN_MS = 15_000;

/** Share one upstream request, including failures, without background timers. */
function cachedRead<T>(load: () => Promise<T>, ttlMs = READ_CACHE_MS) {
  let cached: Promise<T> | undefined;
  let settled = false;
  let expiresAt = 0;
  return {
    read(): Promise<T> {
      if (cached && (!settled || Date.now() < expiresAt)) return cached;
      const pending = load();
      cached = pending;
      settled = false;
      const complete = () => {
        if (cached !== pending) return;
        settled = true;
        expiresAt = Date.now() + ttlMs;
      };
      pending.then(complete, complete);
      return pending;
    },
    clear(): void {
      cached = undefined;
      expiresAt = 0;
    },
  };
}

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
  const profileRead = cachedRead(() => waha.getProfile(), PROFILE_CACHE_MS);
  let profileOwner: string | undefined;
  const sessionRead = cachedRead(async () => {
    const session = await waha.getSession();
    if (session?.status !== 'WORKING' || session.me?.id !== profileOwner) {
      profileRead.clear();
      profileOwner = session?.me?.id;
    }
    return session;
  });
  const qrRead = cachedRead(() => waha.getQr());
  // Only the four whitelisted actions can enter this map.
  const nextActionAt = new Map<string, number>();
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
    const session = await sessionRead.read();
    // Explicit projection: never return session.config (HMAC, proxy, headers).
    return {
      name: waha.session,
      exists: session !== null,
      status: session?.status ?? 'MISSING',
      engine: typeof session?.engine === 'string' ? session.engine : session?.engine?.engine ?? null,
      me: session?.status === 'WORKING' && session.me ? { id: session.me.id, pushName: session.me.pushName } : null,
      webhookConfigured: webhookConfigured(),
    };
  });

  secure.get('/api/admin/whatsapp/qr', async (_request, reply) => {
    const session = await sessionRead.read();
    if (session?.status !== 'SCAN_QR_CODE') {
      return reply.code(409).send({ error: 'QR belum tersedia. Tunggu sesi siap dipindai.' });
    }
    return qrRead.read();
  });

  secure.get('/api/admin/whatsapp/profile', async (_request, reply) => {
    const session = await sessionRead.read();
    if (session?.status !== 'WORKING') {
      return reply.code(409).send({ error: 'Profil tersedia setelah WhatsApp terhubung.' });
    }
    return profileRead.read();
  });

  secure.post<{ Params: { action: string } }>('/api/admin/whatsapp/:action', async (request, reply) => {
    const action = request.params.action === 'connect' ? 'start' : request.params.action;
    if (!['start', 'stop', 'restart', 'logout'].includes(action)) {
      return reply.code(400).send({ error: 'Operasi WhatsApp tidak dikenal.' });
    }
    if (mutating) {
      return reply.code(409).send({ error: 'Operasi sesi sedang berjalan. Tunggu sebentar.' });
    }
    if (Date.now() < (nextActionAt.get(action) ?? 0)) {
      reply.header('Retry-After', Math.ceil(((nextActionAt.get(action) ?? 0) - Date.now()) / 1000));
      return reply.code(429).send({ error: 'Tunggu sebentar sebelum mengulangi operasi ini.' });
    }
    nextActionAt.set(action, Date.now() + ACTION_COOLDOWN_MS);
    mutating = true;
    try {
      const session = await sessionRead.read();
      let changed = false;
      if (action === 'start') {
        if (!session) {
          if (!webhookConfigured()) {
            return reply.code(409).send({
              error: 'Atur WAHA_BOT_WEBHOOK_URL ke URL /webhooks bot yang dapat dijangkau WAHA, lalu restart bot.',
            });
          }
          await waha.createSession(env.wahaBotWebhookUrl);
          changed = true;
        } else if (session.status === 'STOPPED') {
          await waha.action('start');
          changed = true;
        } else if (session.status === 'FAILED') {
          await waha.action('restart');
          changed = true;
        }
        // STARTING / SCAN_QR_CODE / WORKING: already connecting or connected.
      } else {
        if (!session) return reply.code(409).send({ error: 'Sesi belum dibuat. Hubungkan WhatsApp terlebih dahulu.' });
        await waha.action(action as 'stop' | 'restart' | 'logout');
        changed = true;
      }
      if (changed) {
        sessionRead.clear();
        qrRead.clear();
        profileRead.clear();
      }
      return { ok: true };
    } finally {
      mutating = false;
    }
  });
}
