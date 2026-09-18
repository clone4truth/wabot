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
  getGroupParticipants: vi.fn().mockResolvedValue([]),
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

  it('tanpa header signature + HMAC key tersedia -> 403', async () => {
    const raw = rawMessage('!ping');
    const res = await postWebhook(raw, { 'content-type': 'application/json' });
    expect(res.statusCode).toBe(403);
    expect(wahaMocks.sendText).not.toHaveBeenCalled();
  });

  it('tanpa header signature + HMAC key kosong -> diproses (dev mode)', async () => {
    const saved = env.wahaWebhookHmacKey;
    env.wahaWebhookHmacKey = '';
    try {
      const raw = rawMessage('!ping');
      const res = await postWebhook(raw, { 'content-type': 'application/json' });
      expect(res.statusCode).toBe(200);
      expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    } finally {
      env.wahaWebhookHmacKey = saved;
    }
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

  it('pesan fromMe berisi !stiker -> diabaikan tanpa respons', async () => {
    const res = await postWebhook(rawMessage('!stiker halo', { fromMe: true }));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendText).not.toHaveBeenCalled();
    expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    expect(wahaMocks.sendImage).not.toHaveBeenCalled();
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

  it('!ttp hello -> stiker gradien ber-EXIF', async () => {    const res = await postWebhook(rawMessage('!ttp hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
    const buf: Buffer = wahaMocks.sendSticker.mock.calls[0][1];
    expect(buf.slice(0, 4).toString()).toBe('RIFF');
    expect(buf.toString('binary')).toContain('sticker-pack-id');
  }, 30000);

  it('!attp hello -> stiker webp animasi', async () => {
    const res = await postWebhook(rawMessage('!attp hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
    const buf: Buffer = wahaMocks.sendSticker.mock.calls[0][1];
    expect(buf.slice(0, 4).toString()).toBe('RIFF');
    const Sharp = (await import('sharp')).default;
    const meta = await Sharp(buf).metadata();
    expect(meta.pages).toBeGreaterThan(1);
  }, 60000);

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

  it('grup: satu user spam -> user limiter bekerja', async () => {
    const group = uid('grup') + '@g.us';
    const from = uid('spammer') + '@c.us';
    const results: string[] = [];
    for (let i = 0; i < 9; i++) {
      const raw = JSON.stringify({
        event: 'message', session: 'bot',
        payload: { id: uid('gspam'), timestamp: Date.now(), from: group, participant: from, to: 'bot@c.us', body: '!ping', hasMedia: false },
      });
      results.push((await postWebhook(raw)).body);
    }
    // 9 request grup < 30 (limit grup) -> penolakan ke-9 pasti dari user limiter.
    expect(JSON.parse(results[8]).status).toBe('rate_limited');
  });

  it('grup: banyak user -> group limiter bekerja', async () => {
    const group = uid('grupramai') + '@g.us';
    const denied: boolean[] = [];
    for (let u = 0; u < 4; u++) {
      const from = uid(`warga${u}`) + '@c.us';
      for (let i = 0; i < 8; i++) {
        const raw = JSON.stringify({
          event: 'message', session: 'bot',
          payload: { id: uid('gramai'), timestamp: Date.now(), from: group, participant: from, to: 'bot@c.us', body: '!ping', hasMedia: false },
        });
        denied.push(JSON.parse((await postWebhook(raw)).body).status === 'rate_limited');
      }
    }
    // 32 request grup > 30 (limit grup); tiap user tepat 8 (batas user) -> request 31-32 ditolak grup limiter.
    expect(denied.slice(30)).toEqual([true, true]);
  });

  it('gagal pertama -> retry event sama boleh diproses', async () => {
    const payload = {
      event: 'message', session: 'bot',
      payload: { id: uid('retry-ev'), timestamp: Date.now(), from: uid('user') + '@c.us', to: 'bot@c.us', body: '!ping', hasMedia: false },
    };
    const raw = JSON.stringify(payload);
    wahaMocks.sendText.mockRejectedValueOnce(new Error('WAHA down'));
    const failed = await postWebhook(raw);
    expect(failed.statusCode).toBe(500);
    const retried = await postWebhook(raw);
    expect(retried.statusCode).toBe(200);
    expect(JSON.parse(retried.body).duplicate).toBeUndefined();
  });

  it('error user hanya pesan stabil Bahasa Indonesia (tanpa internal)', async () => {
    const res = await postWebhook(rawMessage(`!stiker ${'x'.repeat(301)}`));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(wahaMocks.sendText.mock.calls[0][1]).toBe('❌ Teks maksimal 300 karakter.');
  });

  it('sender terblokir -> diam (200 tanpa aksi)', async () => {
    env.blockedSenderIds = ['jahat@c.us'];
    try {
      const res = await postWebhook(rawMessage('!ping', { from: 'jahat@c.us' }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).denied).toBe('blocked');
      expect(wahaMocks.sendText).not.toHaveBeenCalled();
    } finally {
      env.blockedSenderIds = [];
    }
  });

  it('chat di luar allowlist -> diam', async () => {
    env.allowedChatIds = ['grup-utama@g.us'];
    try {
      const res = await postWebhook(rawMessage('!ping', { from: 'grup-lain@g.us' }));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).denied).toBe('chat');
      expect(wahaMocks.sendText).not.toHaveBeenCalled();
    } finally {
      env.allowedChatIds = [];
    }
  });

  it('admin-only: member ditolak, admin diproses', async () => {
    env.groupAdminOnly = true;
    wahaMocks.getGroupParticipants.mockResolvedValue([
      { id: 'bos@c.us', role: 'admin' },
      { id: 'warga@c.us', role: 'participant' },
    ]);
    try {
      const group = uid('grup') + '@g.us';
      const denied = await postWebhook(rawMessage('!ping', { from: group }));
      expect(denied.statusCode).toBe(200);
      expect(JSON.parse(denied.body).denied).toBe('admin');
      expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('admin');

      vi.clearAllMocks();
      wahaMocks.getGroupParticipants.mockResolvedValue([
        { id: 'bos@c.us', role: 'admin' },
        { id: 'warga@c.us', role: 'participant' },
      ]);
      const ok = await postWebhook(
        rawMessage('!ping', { from: group, participant: 'bos@c.us' }),
      );
      expect(ok.statusCode).toBe(200);
      expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    } finally {
      env.groupAdminOnly = false;
      wahaMocks.getGroupParticipants.mockResolvedValue([]);
    }
  });

  it('!prefix lihat + ubah + dipakai', async () => {
    const { getSharedStore } = await import('../../src/storage/json-store');
    const chat = uid('chatprefix') + '@c.us';
    const store = getSharedStore(env.dataDir);
    try {
      const show = await postWebhook(rawMessage('!prefix', { from: chat }));
      expect(show.statusCode).toBe(200);
      expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('Prefix chat ini');

      vi.clearAllMocks();
      const set = await postWebhook(rawMessage('!prefix ?', { from: chat }));
      expect(set.statusCode).toBe(200);
      expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('diubah');

      vi.clearAllMocks();
      const used = await postWebhook(rawMessage('?ping', { from: chat }));
      expect(used.statusCode).toBe(200);
      expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('Pong');
    } finally {
      store.delete(`prefix:${chat}`);
    }
  });
});
