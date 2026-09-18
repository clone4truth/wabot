import { FastifyRequest, FastifyReply } from 'fastify';
import fetch from 'node-fetch';
import env from '../config/env';

let cachedWahaStatus = 'unknown';
let lastCheck = 0;
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
  lastCheck = now;
  cachedWahaStatus = await checkWAHA() ? 'connected' : 'unreachable';
  return cachedWahaStatus === 'connected';
}

async function checkWAHA(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${env.wahaBaseUrl}/api/sessions`, {
      method: 'GET',
      headers: { 'X-Api-Key': env.wahaApiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}
