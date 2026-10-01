import { FastifyRequest, FastifyReply } from 'fastify';
import fetch from 'node-fetch';
import env from '../config/env';
import { discardResponseBody } from '../media/http-body';

let cachedWahaStatus = 'unknown';
let lastCheck = 0;
let inflightCheck: Promise<boolean> | null = null;
const CHECK_INTERVAL_MS = 30_000;

// Liveness: selalu 200 bila proses hidup. Tanpa info sensitif/dependensi.
export async function healthController(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

// Readiness: status dependensi WAHA. Boleh 503 saat WAHA down tanpa
// dianggap sebagai kematian aplikasi.
export async function readyController(_req: FastifyRequest, reply: FastifyReply) {
  const wahaOk = await checkWAHACached();
  const body: Record<string, unknown> = {
    status: wahaOk ? 'ok' : 'degraded',
    uptime: process.uptime(),
    waha: wahaOk ? 'connected' : 'unreachable',
    timestamp: new Date().toISOString(),
  };
  // URL internal WAHA hanya dibuka di non-production.
  if (env.appEnv !== 'production') {
    body.wahaUrl = env.wahaBaseUrl;
  }
  return reply.status(wahaOk ? 200 : 503).send(body);
}

async function checkWAHACached(): Promise<boolean> {
  const now = Date.now();
  if (now - lastCheck < CHECK_INTERVAL_MS && cachedWahaStatus !== 'unknown') {
    return cachedWahaStatus === 'connected';
  }

  // Single-flight. Versi lama hanya punya cache boolean: selama check pertama
  // masih berjalan, `cachedWahaStatus` tetap 'unknown' sehingga guard selalu
  // gagal dan SETIAP /ready concurrent menembakkan request sendiri ke WAHA
  // (yang tidak diautentikasi dan tidak di-rate-limit). 200 hit = 200 socket.
  if (!inflightCheck) {
    lastCheck = now;
    inflightCheck = checkWAHA()
      .then((ok) => {
        cachedWahaStatus = ok ? 'connected' : 'unreachable';
        return ok;
      })
      .finally(() => {
        inflightCheck = null;
      });
  }
  return inflightCheck;
}

async function checkWAHA(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${env.wahaBaseUrl}/api/sessions`, {
      method: 'GET',
      headers: { 'X-Api-Key': env.wahaApiKey },
      signal: controller.signal,
    });
    // Body tidak dibaca, hanya status — buang agar socket kembali ke pool.
    discardResponseBody(res);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  } finally {
    // Di path catch (WAHA tidak terjangkau) timer lama tidak pernah dibuang,
    // sehingga masih aktif 3 detik sambil menahan AbortController-nya.
    clearTimeout(timeout);
  }
}
