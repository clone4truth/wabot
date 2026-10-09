import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const transport = vi.hoisted(() => ({
  sendText: vi.fn().mockResolvedValue(undefined),
  sendSticker: vi.fn().mockResolvedValue(undefined),
  getContactSavedName: vi.fn().mockResolvedValue('Nama Kontak Bot'),
  getChatInfo: vi.fn().mockResolvedValue(null),
  getProfilePicture: vi.fn().mockResolvedValue(null),
  getMessageTimestamp: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/whatsapp/waha.client', () => ({ WAHAClient: vi.fn().mockImplementation(() => transport) }));

import { fastify } from '../../src/app';
import env from '../../src/config/env';
import { runtimeConfig } from '../../src/config/runtime-config';
import { BubbleProcessor } from '../../src/stickers/processors/bubble.processor';
import { contactAliases } from '../../src/whatsapp/contact-aliases';

const KEY = 'contact-alias-integration-key';
let counter = 0;
let render: ReturnType<typeof vi.spyOn>;

async function post(body: string, requester: string, chatId = 'group@g.us', withReply = true) {
  const raw = JSON.stringify({
    event: 'message', session: 'personal-contacts', payload: {
      id: `alias-command-${counter++}`, timestamp: Date.parse('2026-10-08T06:19:00Z') / 1000,
      from: chatId, participant: requester, body, fromMe: false,
      ...(withReply ? { replyTo: {
        id: 'ORIGINAL', body: 'Halo dari Rara', timestamp: Date.parse('2026-10-07T05:45:00Z') / 1000,
        participant: { _serialized: 'rara@lid', user: 'rara', server: 'lid' },
      } } : {}),
    },
  });
  return fastify.inject({
    method: 'POST', url: '/webhooks', payload: raw,
    headers: {
      'content-type': 'application/json',
      'x-webhook-hmac': crypto.createHmac('sha512', KEY).update(raw).digest('hex'),
    },
  });
}

describe('personal contact names through the webhook and real bubble renderer', () => {
  beforeAll(() => {
    env.wahaWebhookHmacKey = KEY;
    runtimeConfig.update({ groupAdminOnly: false, allowedChatIds: [], blockedSenderIds: [], userRateLimit: 100, groupRateLimit: 100 });
    vi.stubEnv('TZ', 'Asia/Jakarta');
    render = vi.spyOn(BubbleProcessor.prototype, 'process');
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    render.mockRestore();
    vi.unstubAllEnvs();
    await fastify.close();
  });

  it('keeps names personal across users and chats, and restores bot fallback after deleting an alias', async () => {
    expect((await post('!kontak nama Kak Rara', 'andi@lid')).statusCode).toBe(200);
    expect((await post('!kontak nama Rara Kantor', 'budi@lid')).statusCode).toBe(200);
    expect(transport.sendText.mock.calls.map((call) => call[1])).toEqual([
      expect.stringContaining('disimpan: Kak Rara'), expect.stringContaining('disimpan: Rara Kantor'),
    ]);

    vi.clearAllMocks();
    for (const [requester, expected] of [['andi@lid', 'Kak Rara'], ['budi@lid', 'Rara Kantor'], ['another@lid', 'Nama Kontak Bot']]) {
      const response = await post('!stiker bubble', requester, 'another-group@g.us');
      expect(response.statusCode).toBe(200);
      expect(render).toHaveBeenLastCalledWith('Halo dari Rara', expected, 'rara@lid', undefined, null, '12:45', 'incoming', true);
    }
    expect(transport.sendSticker).toHaveBeenCalledTimes(3);

    expect((await post('!kontak hapus', 'andi@lid')).statusCode).toBe(200);
    expect(contactAliases.get('andi@lid', 'rara@lid', 'personal-contacts')).toBeUndefined();
    expect(contactAliases.get('budi@lid', 'rara@lid', 'personal-contacts')).toBe('Rara Kantor');
    await post('!stiker bubble', 'andi@lid');
    expect(render.mock.calls.at(-1)?.[1]).toBe('Nama Kontak Bot');
  });

  it('uses the active chat prefix for the contact command and its guidance', async () => {
    runtimeConfig.setPrefix('custom-prefix@g.us', '?');
    try {
      await post('?kontak nama Kak Rara', 'prefix-user@lid', 'custom-prefix@g.us');
      expect(transport.sendText.mock.calls[0][1]).toContain('disimpan: Kak Rara');
      await post('?kontak', 'prefix-user@lid', 'custom-prefix@g.us');
      expect(transport.sendText.mock.calls[1][1]).toBe('Nama kontak pilihanmu: Kak Rara');
      await post('?kontak', 'prefix-user@lid', 'custom-prefix@g.us', false);
      expect(transport.sendText.mock.calls[2][1]).toContain('?kontak nama Kak Rara');
      expect(transport.sendText.mock.calls[2][1]).not.toContain('!kontak');
    } finally {
      runtimeConfig.clearPrefix('custom-prefix@g.us');
    }
  });
});
