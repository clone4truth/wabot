import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fastify } from '../../src/app';
import env from '../../src/config/env';
import { runtimeConfig } from '../../src/config/runtime-config';

const PASSWORD = 'test-admin-password';

/** Login dan ambil cookie session supaya endpoint terproteksi bisa diuji. */
async function loginCookie(password = PASSWORD): Promise<string> {
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password },
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return typeof raw === 'string' ? raw.split(';')[0] : '';
}

describe('Endpoint gating & dashboard auth', () => {
  let savedEnv: string;
  let savedBase: string;
  let savedPassword: string;

  beforeEach(() => {
    savedEnv = env.appEnv;
    savedBase = env.wahaBaseUrl;
    savedPassword = env.adminPassword;
  });

  afterEach(() => {
    env.appEnv = savedEnv;
    env.wahaBaseUrl = savedBase;
    env.adminPassword = savedPassword;
  });

  it('/health selalu 200 minimal tanpa info sensitif', async () => {
    env.appEnv = 'production';
    const res = await fastify.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(JSON.stringify(body)).not.toContain('waha');
  });

  it('/ready 503 saat WAHA unreachable, tanpa URL internal di production', async () => {
    env.appEnv = 'production';
    env.wahaBaseUrl = 'http://127.0.0.1:9';
    const res = await fastify.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).waha).toBe('unreachable');
    expect(res.body).not.toContain('127.0.0.1');
  });

  // Route lama (HTML string tanpa auth) sudah dihapus. Pastikan tidak ada
  // endpoint yang membocorkan log tanpa login.
  it('route lama /api/logs tidak ada lagi', async () => {
    expect((await fastify.inject({ method: 'GET', url: '/api/logs' })).statusCode).toBe(404);
  });

  it('/api/admin/* menolak tanpa session cookie', async () => {
    env.adminPassword = PASSWORD;
    for (const url of ['/api/admin/overview', '/api/admin/jobs', '/api/admin/config', '/api/admin/logs']) {
      const res = await fastify.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
    }
  });

  it('/api/admin/* menolak session cookie palsu', async () => {
    env.adminPassword = PASSWORD;
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: { cookie: 'stb_session=token-palsu-yang-panjang' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('login salah -> 401 tanpa membocorkan password', async () => {
    env.adminPassword = PASSWORD;
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'salah' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain(PASSWORD);
  });

  it('login benar -> cookie HttpOnly + SameSite, lalu endpoint terbuka', async () => {
    env.adminPassword = PASSWORD;
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(String(raw)).toContain('HttpOnly');
    expect(String(raw)).toContain('SameSite=Strict');

    const cookie = await loginCookie();
    const authed = await fastify.inject({
      method: 'GET',
      url: '/api/admin/overview',
      headers: { cookie },
    });
    expect(authed.statusCode).toBe(200);
    expect(JSON.parse(authed.body).process).toBeTruthy();
  });

  it('dashboard admin aktif hanya bila ADMIN_PASSWORD diset', async () => {
    env.adminPassword = '';
    const res = await fastify.inject({ method: 'GET', url: '/api/admin/session' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ enabled: false, authenticated: false });

    const gated = await fastify.inject({ method: 'GET', url: '/api/admin/overview' });
    expect(gated.statusCode).toBe(503);

    env.adminPassword = PASSWORD;
    const enabled = await fastify.inject({ method: 'GET', url: '/api/admin/session' });
    expect(JSON.parse(enabled.body).enabled).toBe(true);
  });

  it('logout mencabut session', async () => {
    env.adminPassword = PASSWORD;
    const cookie = await loginCookie();
    expect(
      (await fastify.inject({ method: 'GET', url: '/api/admin/jobs', headers: { cookie } })).statusCode,
    ).toBe(200);

    await fastify.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie } });

    expect(
      (await fastify.inject({ method: 'GET', url: '/api/admin/jobs', headers: { cookie } })).statusCode,
    ).toBe(401);
  });
});

describe('Runtime config via API', () => {
  let savedPassword: string;

  beforeEach(() => {
    savedPassword = env.adminPassword;
    env.adminPassword = PASSWORD;
  });

  afterEach(() => {
    env.adminPassword = savedPassword;
    runtimeConfig.reset();
    for (const { chatId } of runtimeConfig.listPrefixes()) runtimeConfig.clearPrefix(chatId);
  });

  async function authed(method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown) {
    const cookie = await loginCookie();
    return fastify.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  it('update config tersimpan dan memengaruhi consumer', async () => {
    const res = await authed('PUT', '/api/admin/config', { userRateLimit: 42 });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).effective.userRateLimit).toBe(42);
    expect(runtimeConfig.get().userRateLimit).toBe(42);
  });

  it('tolak nilai di luar batas (maxImageJobs = 0 akan mematikan semua job)', async () => {
    const res = await authed('PUT', '/api/admin/config', { maxImageJobs: 0 });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).rejected).toContain('maxImageJobs');
    // Nilai lama harus tetap berlaku — config parsial tidak boleh merusak config.
    expect(runtimeConfig.get().maxImageJobs).toBe(env.maxImageJobs);
  });

  it('tolak prefix yang bukan 1 simbol', async () => {
    const res = await authed('PUT', '/api/admin/config', { commandPrefix: 'ab' });
    expect(res.statusCode).toBe(400);
    expect(runtimeConfig.get().commandPrefix).toBe(env.commandPrefix);
  });

  it('reset mengembalikan nilai env', async () => {
    await authed('PUT', '/api/admin/config', { userRateLimit: 42, groupAdminOnly: true });
    const res = await authed('POST', '/api/admin/config/reset');
    expect(res.statusCode).toBe(200);
    expect(runtimeConfig.get().userRateLimit).toBe(env.userRateLimit);
    expect(runtimeConfig.get().groupAdminOnly).toBe(env.groupAdminOnly);
  });

  it('daftar access control di-hash di respons (tidak membocorkan chatId)', async () => {
    await authed('POST', '/api/admin/access/prefix', { chatId: 'grup-rahasia@g.us', prefix: '?' });
    const res = await authed('GET', '/api/admin/access');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(res.body).not.toContain('grup-rahasia@g.us');
    expect(body.prefixOverrides).toHaveLength(1);
    expect(body.prefixOverrides[0].prefix).toBe('?');
    expect(body.prefixOverrides[0].chatIdHash).toMatch(/^[0-9a-f]+$/);
  });

  it('jobs expose statistik antrean', async () => {
    const res = await authed('GET', '/api/admin/jobs');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.queues.image.limit).toBe(env.maxImageJobs);
    expect(body.queues.video.limit).toBe(env.maxVideoJobs);
    expect(body.byStatus).toHaveProperty('PROCESSING');
  });

  it('commands registry terbaca', async () => {
    const res = await authed('GET', '/api/admin/commands');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).total).toBeGreaterThan(10);
  });
});
