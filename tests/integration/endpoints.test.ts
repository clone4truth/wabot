import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fastify } from '../../src/app';
import env from '../../src/config/env';

describe('Endpoint gating (production vs development)', () => {
  let savedEnv: string;
  let savedBase: string;

  beforeEach(() => {
    savedEnv = env.appEnv;
    savedBase = env.wahaBaseUrl;
  });

  afterEach(() => {
    env.appEnv = savedEnv;
    env.wahaBaseUrl = savedBase;
  });

  it('/health selalu 200 minimal tanpa info sensitif', async () => {
    env.appEnv = 'production';
    const res = await fastify.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(JSON.stringify(body)).not.toContain('waha');
  });

  it('/dashboard + /api/logs 404 di production', async () => {
    env.appEnv = 'production';
    expect((await fastify.inject({ method: 'GET', url: '/dashboard' })).statusCode).toBe(404);
    expect((await fastify.inject({ method: 'GET', url: '/api/logs' })).statusCode).toBe(404);
  });

  it('/dashboard + /api/logs aktif di development', async () => {
    env.appEnv = 'development';
    expect((await fastify.inject({ method: 'GET', url: '/dashboard' })).statusCode).toBe(200);
    expect((await fastify.inject({ method: 'GET', url: '/api/logs' })).statusCode).toBe(200);
  });

  it('/ready 503 saat WAHA unreachable, tanpa URL internal di production', async () => {
    env.appEnv = 'production';
    env.wahaBaseUrl = 'http://127.0.0.1:9';
    const res = await fastify.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).waha).toBe('unreachable');
    expect(res.body).not.toContain('127.0.0.1');
  });
});
