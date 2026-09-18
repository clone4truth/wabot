import { describe, it, expect, vi, beforeAll } from 'vitest';
import crypto from 'crypto';
import { fastify } from '../../src/app';
import env from '../../src/config/env';
import { getLogs } from '../../src/observability/logger';
import { hashIdentifier } from '../../src/observability/privacy';

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

describe('hashIdentifier', () => {
  it('deterministik, tidak mengandung raw value', () => {
    const a = hashIdentifier('62812@c.us');
    expect(a).toBe(hashIdentifier('62812@c.us'));
    expect(a).not.toContain('62812');
    expect(a).toHaveLength(16);
    expect(hashIdentifier('x')).not.toBe(hashIdentifier('y'));
    expect(hashIdentifier('')).toBe('n/a');
  });
});

describe('Production log bebas data mentah', () => {
  const KEY = 'privacy-test-key';
  const CHAT = '62899001122@c.us';
  const SENDER = '62899001122@c.us';
  const SECRET_BODY = '!ping rahasia-dapur-xyz';

  beforeAll(() => {
    env.wahaWebhookHmacKey = KEY;
  });

  it('tidak ada chatId/senderId/body mentah di log', async () => {
    const before = getLogs().length;
    const raw = JSON.stringify({
      event: 'message', session: 'bot',
      payload: { id: 'priv-msg-1', timestamp: Date.now(), from: CHAT, to: 'bot@c.us', body: SECRET_BODY, hasMedia: false },
    });
    const sig = crypto.createHmac('sha512', KEY).update(raw).digest('hex');
    const res = await fastify.inject({
      method: 'POST', url: '/webhooks', payload: raw,
      headers: { 'content-type': 'application/json', 'x-webhook-hmac': sig, 'x-webhook-hmac-algorithm': 'sha512' },
    });
    expect(res.statusCode).toBe(200);

    const fresh = getLogs().slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    const dumped = JSON.stringify(fresh);
    expect(dumped).not.toContain(CHAT);
    expect(dumped).not.toContain(SENDER);
    expect(dumped).not.toContain(SECRET_BODY);
    expect(dumped).not.toContain('rahasia-dapur-xyz');
    // Korelasi via hash tetap ada.
    expect(dumped).toContain(hashIdentifier(CHAT));
  });
});
