import { FastifyRequest, FastifyReply } from 'fastify';
import fetch from 'node-fetch';
import env from '../config/env';
import { logger } from '../observability/logger';

let cachedWahaStatus = 'unknown';
let lastCheck = 0;
const CHECK_INTERVAL_MS = 30_000;

export async function healthController(_req: FastifyRequest, reply: FastifyReply) {
  const wahaOk = await checkWAHACached();
  const overall = wahaOk ? 'ok' : 'degraded';

  return reply.status(wahaOk ? 200 : 503).send({
    status: overall,
    uptime: process.uptime(),
    waha: wahaOk ? 'connected' : 'unreachable',
    wahaUrl: env.wahaBaseUrl,
    timestamp: new Date().toISOString(),
  });
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
