import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const transport = vi.hoisted(() => ({
  sendText: vi.fn().mockResolvedValue(undefined),
  sendSticker: vi.fn().mockResolvedValue(undefined),
  getContactSavedName: vi.fn().mockResolvedValue(undefined),
  getChatInfo: vi.fn().mockResolvedValue(null),
  getProfilePicture: vi.fn().mockResolvedValue(null),
  getMessageTimestamp: vi.fn().mockResolvedValue(undefined),
}));
const render = vi.hoisted(() => vi.fn().mockResolvedValue({
  buffer: Buffer.from('webp'), mimetype: 'image/webp', width: 512, height: 512, animated: false, size: 4,
}));
vi.mock('../../src/whatsapp/waha.client', () => ({ WAHAClient: vi.fn().mockImplementation(() => transport) }));
vi.mock('../../src/stickers/processors/bubble.processor', () => ({ BubbleProcessor: vi.fn().mockImplementation(() => ({ process: render })) }));

import { fastify } from '../../src/app';
import env from '../../src/config/env';
import { runtimeConfig } from '../../src/config/runtime-config';

const KEY = 'webhook-reply-time-test-key';
async function post(payload: Record<string, unknown>) {
  const raw = JSON.stringify({ event: 'message', session: 'reply-time', payload });
  return fastify.inject({
    method: 'POST', url: '/webhooks', payload: raw,
    headers: {
      'content-type': 'application/json',
      'x-webhook-hmac': crypto.createHmac('sha512', KEY).update(raw).digest('hex'),
      'x-webhook-hmac-algorithm': 'sha512',
    },
  });
}

describe('WEBJS replied message timestamp through the real webhook pipeline', () => {
  beforeAll(() => {
    env.wahaWebhookHmacKey = KEY;
    runtimeConfig.update({ groupAdminOnly: false, allowedChatIds: [], blockedSenderIds: [] });
    vi.stubEnv('TZ', 'Asia/Jakarta');
  });
  afterAll(() => vi.unstubAllEnvs());

  it('caches a non-command original and renders its time for a bare reply id and Wid participant', async () => {
    const original = await post({
      id: 'false_group@g.us_ORIGINAL_222@lid',
      timestamp: Date.parse('2026-10-07T05:45:00Z') / 1000,
      from: 'group@g.us', participant: '222@lid', body: 'Pesan lama', fromMe: false,
    });
    expect(original.statusCode).toBe(200);
    expect(render).not.toHaveBeenCalled();

    const reply = await post({
      id: 'false_group@g.us_COMMAND_111@lid',
      timestamp: Date.parse('2026-10-08T06:19:00Z') / 1000,
      from: 'group@g.us', participant: '111@lid', body: '!stiker bubble', fromMe: false,
      replyTo: {
        id: 'ORIGINAL', body: 'Pesan lama',
        participant: { server: 'lid', user: '222', _serialized: '222@lid' },
        _data: { type: 'chat', body: 'Pesan lama' },
      },
    });
    expect(reply.statusCode).toBe(200);
    expect(render).toHaveBeenCalledWith('Pesan lama', '222', '222@lid', undefined, null, '12:45', 'incoming', true);
    expect(transport.getMessageTimestamp).not.toHaveBeenCalled();
    expect(transport.sendSticker).toHaveBeenCalledTimes(1);
  });
});
