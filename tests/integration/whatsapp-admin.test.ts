import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import cookiePlugin from '@fastify/cookie';
import env from '../../src/config/env';
import { registerAdminRoutes } from '../../src/http/admin/admin.routes';
import { WahaSessionClient } from '../../src/whatsapp/waha-session.client';

const PASSWORD = 'whatsapp-test-password';
const API_KEY = 'upstream-test-key';
const QR = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

describe('WhatsApp dashboard against a local WAHA HTTP simulator', () => {
  let app: FastifyInstance;
  let upstream: http.Server;
  let baseUrl: string;
  let cookie: string;
  let saved: typeof env;
  let status: string | null;
  let failStatus = 0;
  let qr = QR;
  const calls: Array<{ method?: string; url?: string; body: any; key?: string; accept?: string }> = [];

  beforeAll(async () => {
    saved = { ...env };
    upstream = http.createServer(async (req, res) => {
      let text = '';
      for await (const part of req) text += part;
      calls.push({ method: req.method, url: req.url, body: text ? JSON.parse(text) : null, key: req.headers['x-api-key'] as string, accept: req.headers.accept });
      res.setHeader('Content-Type', 'application/json');
      if (failStatus) {
        res.writeHead(failStatus);
        res.end(JSON.stringify({ error: API_KEY }));
        return;
      }
      if (req.url === '/api/default/auth/qr') {
        res.end(JSON.stringify({ base64: qr, mimetype: 'image/png' }));
        return;
      }
      if (req.method === 'GET') {
        if (!status) {
          res.writeHead(404);
          res.end('{}');
        } else {
          res.end(JSON.stringify({ name: 'default', status, engine: { engine: 'WEBJS' }, me: status === 'WORKING' ? { id: '62812345@c.us', pushName: 'Test Bot' } : null, config: { webhooks: [{ hmac: { key: 'hmac-must-stay-server-side' } }], proxy: { password: API_KEY } } }));
        }
        return;
      }
      if (req.url === '/api/sessions') status = 'SCAN_QR_CODE';
      else if (req.url?.endsWith('/stop')) status = 'STOPPED';
      else status = 'SCAN_QR_CODE';
      res.end('{}');
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    Object.assign(env, { adminPassword: PASSWORD, appEnv: 'development', wahaBaseUrl: baseUrl, wahaApiKey: API_KEY, wahaSession: 'default', wahaBotWebhookUrl: 'http://sticker-bot:3000/webhooks', wahaWebhookHmacKey: 'test-webhook-key' });
    app = Fastify({ logger: false });
    app.register(cookiePlugin);
    app.register(registerAdminRoutes);
    const login = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: PASSWORD } });
    expect(login.statusCode).toBe(200);
    cookie = String(login.headers['set-cookie']).split(';')[0];
  });

  beforeEach(() => {
    status = 'STOPPED';
    failStatus = 0;
    qr = QR;
    calls.length = 0;
    env.wahaBotWebhookUrl = 'http://sticker-bot:3000/webhooks';
  });

  afterAll(async () => {
    await app.close();
    upstream.closeAllConnections();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    Object.assign(env, saved);
  });

  const get = (path = '') => app.inject({ method: 'GET', url: `/api/admin/whatsapp${path}`, headers: { cookie } });
  const action = (name: string) => app.inject({ method: 'POST', url: `/api/admin/whatsapp/${name}`, headers: { cookie } });

  it('requires admin authentication for status, QR and every mutation', async () => {
    for (const path of ['', '/qr', '/connect', '/restart', '/stop', '/logout']) {
      const response = await app.inject({ method: ['', '/qr'].includes(path) ? 'GET' : 'POST', url: `/api/admin/whatsapp${path}` });
      expect(response.statusCode).toBe(401);
    }
    expect(calls).toHaveLength(0);
  });

  it('projects session metadata without forwarding upstream secrets', async () => {
    status = 'WORKING';
    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'WORKING', name: 'default', engine: 'WEBJS', exists: true, me: { pushName: 'Test Bot' } });
    expect(response.body).not.toContain(API_KEY);
    expect(response.body).not.toContain('hmac-must-stay-server-side');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(calls[0].key).toBe(API_KEY);
  });

  it('creates a missing session with the configured bot webhook and HMAC', async () => {
    status = null;
    expect((await get()).json().status).toBe('MISSING');
    expect((await action('connect')).statusCode).toBe(200);
    const create = calls.find(call => call.method === 'POST');
    expect(create?.url).toBe('/api/sessions');
    expect(create?.body).toMatchObject({ name: 'default', start: true, config: { webhooks: [{ url: env.wahaBotWebhookUrl, events: ['message'], hmac: { key: env.wahaWebhookHmacKey } }] } });
  });

  it('does not create a session without a valid webhook URL', async () => {
    status = null;
    for (const url of ['', 'file:///tmp/private', 'https://user:password@example.com/webhooks']) {
      env.wahaBotWebhookUrl = url;
      expect((await action('connect')).statusCode).toBe(409);
    }
    expect(calls.some(call => call.method === 'POST')).toBe(false);
  });

  it('starts a stopped session without overwriting its existing configuration', async () => {
    expect((await action('connect')).statusCode).toBe(200);
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/api/sessions/default/start', body: null });
  });

  it('connect is idempotent for starting, scanning and connected sessions', async () => {
    for (const value of ['STARTING', 'SCAN_QR_CODE', 'WORKING', 'PASSKEY_REQUIRED']) {
      status = value;
      expect((await action('connect')).statusCode).toBe(200);
    }
    expect(calls.every(call => call.method === 'GET')).toBe(true);
  });

  it('restarts failed sessions', async () => {
    status = 'FAILED';
    await action('connect');
    expect(calls.at(-1)?.url).toBe('/api/sessions/default/restart');
  });

  it('fetches a PNG QR using Accept application/json and disables caching', async () => {
    status = 'SCAN_QR_CODE';
    const response = await get('/qr');
    expect(response.statusCode).toBe(200);
    expect(response.json().dataUrl).toBe(`data:image/png;base64,${QR}`);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(calls.at(-1)).toMatchObject({ url: '/api/default/auth/qr', accept: 'application/json' });
  });

  it('does not fetch a QR until the session is ready for scanning', async () => {
    for (const value of ['STARTING', 'WORKING', 'STOPPED', 'PASSKEY_REQUIRED']) {
      status = value;
      expect((await get('/qr')).statusCode).toBe(409);
    }
    expect(calls.some(call => call.url?.endsWith('/auth/qr'))).toBe(false);
  });

  it('rejects malformed or non-PNG QR payloads', async () => {
    status = 'SCAN_QR_CODE';
    for (const value of ['', '<script>', Buffer.from('<svg/>').toString('base64')]) {
      qr = value;
      expect((await get('/qr')).statusCode).toBe(502);
    }
  });

  it('routes restart, stop and logout to the documented session endpoints', async () => {
    for (const name of ['restart', 'stop', 'logout']) {
      expect((await action(name)).statusCode).toBe(200);
      expect(calls.at(-1)).toMatchObject({ method: 'POST', url: `/api/sessions/default/${name}`, body: null });
    }
  });

  it('rejects unsupported operations and missing-session mutations', async () => {
    expect((await action('delete')).statusCode).toBe(400);
    expect(calls).toHaveLength(0);
    status = null;
    expect((await action('logout')).statusCode).toBe(409);
    expect(calls.some(call => call.method === 'POST')).toBe(false);
  });

  it('returns upstream auth failures as 502 without leaking secrets or logging out admin', async () => {
    failStatus = 401;
    const response = await get();
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toContain('WAHA_API_KEY');
    expect(response.body).not.toContain(API_KEY);
    expect((await app.inject({ method: 'GET', url: '/api/admin/session', headers: { cookie } })).json().authenticated).toBe(true);
  });

  it('encodes session names in URL path segments', async () => {
    const client = new WahaSessionClient(baseUrl, API_KEY, 'bot/a b');
    await client.action('restart');
    expect(calls.at(-1)?.url).toBe('/api/sessions/bot%2Fa%20b/restart');
  });

  it('aborts requests that exceed the timeout', async () => {
    const slow = http.createServer(() => undefined);
    await new Promise<void>(resolve => slow.listen(0, '127.0.0.1', resolve));
    const client = new WahaSessionClient(`http://127.0.0.1:${(slow.address() as AddressInfo).port}`, API_KEY, 'default', 30);
    try {
      await expect(client.getSession()).rejects.toThrow('terlalu lama');
    } finally {
      slow.closeAllConnections();
      await new Promise<void>(resolve => slow.close(() => resolve()));
    }
  });
});
