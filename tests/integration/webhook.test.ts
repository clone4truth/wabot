import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { fastify } from '../../src/app';
import env from '../../src/config/env';

// Mock transport WAHA: controller + service memakai mock ini, render stiker tetap asli.
const wahaMocks = vi.hoisted(() => ({
  sendText: vi.fn().mockResolvedValue(undefined),
  sendImage: vi.fn().mockResolvedValue(undefined),
  sendSticker: vi.fn().mockResolvedValue(undefined),
  sendReaction: vi.fn().mockResolvedValue(undefined),
  getChatInfo: vi.fn().mockResolvedValue(null),
  getContactSavedName: vi.fn().mockResolvedValue(undefined),
  getProfilePicture: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/whatsapp/waha.client', () => ({
  WAHAClient: vi.fn().mockImplementation(() => wahaMocks),
}));

const KEY = 'integration-test-hmac-key';
let n = 0;
const uid = (p: string) => `${p}-${Date.now()}-${n++}`;

function rawMessage(body: string, over: any = {}) {
  return JSON.stringify({
    event: 'message',
    session: 'bot',
    payload: {
      id: uid('msg'), timestamp: Date.now(), from: uid('user') + '@c.us',
      to: 'bot@c.us', body, hasMedia: false, ...over,
    },
  });
}

function signedHeaders(raw: string) {
  return {
    'content-type': 'application/json',
    'x-webhook-hmac': crypto.createHmac('sha512', KEY).update(raw).digest('hex'),
    'x-webhook-hmac-algorithm': 'sha512',
  };
}

function postWebhook(raw: string, headers: any = signedHeaders(raw)) {
  return fastify.inject({ method: 'POST', url: '/webhooks', payload: raw, headers });
}

describe('Webhook end-to-end', () => {
  beforeAll(() => {
    env.wahaWebhookHmacKey = KEY;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('event non-message -> 200 tanpa aksi', async () => {
    const raw = JSON.stringify({ event: 'session.status', session: 'bot', payload: {} });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendText).not.toHaveBeenCalled();
  });

  it('!ping signature valid -> balas Pong', async () => {
    const res = await postWebhook(rawMessage('!ping'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('Pong');
  });

  it('signature salah -> 403', async () => {
    const raw = rawMessage('!ping');
    const res = await postWebhook(raw, {
      'content-type': 'application/json',
      'x-webhook-hmac': '0'.repeat(128),
      'x-webhook-hmac-algorithm': 'sha512',
    });
    expect(res.statusCode).toBe(403);
    expect(wahaMocks.sendText).not.toHaveBeenCalled();
  });

  it('tanpa header signature -> tetap diproses (skip verifikasi)', async () => {
    const raw = rawMessage('!ping');
    const res = await postWebhook(raw, { 'content-type': 'application/json' });
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
  });

  it('eventId sama dua kali -> duplicate', async () => {
    const dupId = uid('dup-msg');
    const payload = {
      event: 'message', session: 'bot',
      payload: { id: dupId, timestamp: Date.now(), from: uid('user') + '@c.us', to: 'bot@c.us', body: '!ping', hasMedia: false },
    };
    const raw = JSON.stringify(payload);
    const first = await postWebhook(raw);
    const second = await postWebhook(raw);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).duplicate).toBe(true);
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
  });

  it('teks tanpa prefix -> 200 tanpa aksi', async () => {
    const res = await postWebhook(rawMessage('halo apa kabar'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendText).not.toHaveBeenCalled();
  });

  it('!menu dan !help terkirim', async () => {
    expect((await postWebhook(rawMessage('!menu'))).statusCode).toBe(200);
    expect((await postWebhook(rawMessage('!help'))).statusCode).toBe(200);
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(2);
  });

  it('!stiker hello -> render + kirim stiker webp', async () => {
    const res = await postWebhook(rawMessage('!stiker hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
    const buf: Buffer = wahaMocks.sendSticker.mock.calls[0][1];
    expect(buf.slice(0, 4).toString()).toBe('RIFF');
  }, 30000);

  it('!ttp hello -> stiker gradien ber-EXIF', async () => {
    const res = await postWebhook(rawMessage('!ttp hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
    const buf: Buffer = wahaMocks.sendSticker.mock.calls[0][1];
    expect(buf.slice(0, 4).toString()).toBe('RIFF');
    expect(buf.toString('binary')).toContain('sticker-pack-id');
  }, 30000);

  it('spam cepat dari satu user -> rate_limited tanpa retry storm', async () => {
    const from = uid('spammer') + '@c.us';
    const results: { status: number; body: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const raw = JSON.stringify({
        event: 'message', session: 'bot',
        payload: { id: uid('spam'), timestamp: Date.now(), from, to: 'bot@c.us', body: '!ping', hasMedia: false },
      });
      const res = await postWebhook(raw);
      results.push({ status: res.statusCode, body: res.body });
    }
    // Ditangani dengan 200 + status rate_limited agar WAHA tidak me-retry.
    expect(results).toContainEqual(expect.objectContaining({ status: 200 }));
    const last = results[results.length - 1];
    expect(last.status).toBe(200);
    expect(JSON.parse(last.body).status).toBe('rate_limited');
  });
});
