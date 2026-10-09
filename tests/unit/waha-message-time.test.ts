import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { WAHAClient } from '../../src/whatsapp/waha.client';

describe('WAHA original message time lookup', () => {
  let server: http.Server;
  let baseUrl: string;
  let status = 200;
  let response: unknown = { timestamp: 1791440340 };
  let history: unknown = [];
  const responses = new Map<string, { status: number; data: unknown }>();
  const requests: string[] = [];
  let stall: 'headers' | 'body' | undefined;
  let lastRequest: { method?: string; url?: string; apiKey?: string | string[] };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push(req.url ?? '');
      lastRequest = { method: req.method, url: req.url, apiKey: req.headers['x-api-key'] };
      if (stall === 'headers') return;
      const isHistory = /\/messages\?/.test(req.url ?? '');
      const result = responses.get(req.url ?? '') ?? { status, data: isHistory ? history : response };
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      if (stall === 'body') {
        res.write('{"timestamp":');
        return;
      }
      res.end(JSON.stringify(result.data));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    status = 200;
    stall = undefined;
    response = { timestamp: 1791440340 };
    history = [];
    responses.clear();
    requests.length = 0;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('uses the documented GET endpoint without downloading media, with encoded session/chat/message segments', async () => {
    const client = new WAHAClient(baseUrl, 'test-key', 'configured-default');
    const result = await client.getMessageTimestamp('628123@c.us / room', 'false_628123@c.us_a/b?x#y', 'event/session ?#');
    expect(result).toBe(1791440340000);
    expect(lastRequest).toEqual({
      method: 'GET',
      url: '/api/event%2Fsession%20%3F%23/chats/628123%40c.us%20%2F%20room/messages/false_628123%40c.us_a%2Fb%3Fx%23y?downloadMedia=false',
      apiKey: 'test-key',
    });
  });

  it('uses the configured session when no webhook session is passed', async () => {
    await new WAHAClient(baseUrl, 'test-key', 'default/session').getMessageTimestamp('chat', 'message');
    expect(lastRequest.url).toBe('/api/default%2Fsession/chats/chat/messages/message?downloadMedia=false');
  });

  it('also accepts a millisecond timestamp from an engine response', async () => {
    response = { timestamp: 1791440340000 };
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('chat', 'message')).toBe(1791440340000);
  });

  it('returns unknown for a missing timestamp', async () => {
    response = { id: 'message' };
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('chat', 'message')).toBeUndefined();
  });

  it('returns unknown when the original message is no longer available', async () => {
    status = 404;
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('chat', 'message')).toBeUndefined();
  });

  it('resolves a bare group reply id using its quoted participant, without needing recent history', async () => {
    status = 404;
    responses.set('/api/bot/chats/group%40g.us/messages/false_group%40g.us_STANZA_222%40lid?downloadMedia=false', {
      status: 200, data: { id: 'false_group@g.us_STANZA_222@lid', timestamp: 1791440340 },
    });
    const result = await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('group@g.us', 'STANZA', 'bot', { participant: '222@lid' });
    expect(result).toBe(1791440340000);
    expect(requests).toHaveLength(1);
  });

  it('tries the outgoing group id when the quoted message was authored by the bot', async () => {
    status = 404;
    responses.set('/api/bot/chats/group%40g.us/messages/true_group%40g.us_OWN_222%40lid?downloadMedia=false', {
      status: 200, data: { timestamp: 1791440340 },
    });
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('group@g.us', 'OWN', 'bot', { participant: '222@lid' })).toBe(1791440340000);
    expect(requests).toHaveLength(2);
  });

  it('finds the exact original id in history when WEBJS cannot look it up directly', async () => {
    status = 500;
    responses.set('/api/bot/chats/group%40g.us/messages?downloadMedia=false&limit=100&sortBy=timestamp&sortOrder=desc', {
      status: 200, data: [
        { id: 'false_group@g.us_OTHER_222@lid', body: 'same text', timestamp: 1791449999 },
        { id: 'false_group@g.us_STANZA_222@lid', body: 'same text', timestamp: 1791440340 },
      ],
    });
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('group@g.us', 'STANZA')).toBe(1791440340000);
    expect(lastRequest.apiKey).toBe('key');
  });

  it('does not borrow another message time when only its text matches', async () => {
    response = {};
    history = [{ id: 'false_chat_OTHER', body: 'same text', timestamp: 1791440340 }];
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('chat', 'MISSING')).toBeUndefined();
  });

  it.each([401, 403])('does not retry history when authentication is rejected with %s', async (code) => {
    status = code;
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('chat', 'false_chat_STANZA')).toBeUndefined();
    expect(requests).toHaveLength(1);
  });

  it.each(['headers', 'body'] as const)('bounds a stalled %s lookup to two seconds including the response body', async (phase) => {
    stall = phase;
    const start = Date.now();
    expect(await new WAHAClient(baseUrl, 'key', 'bot').getMessageTimestamp('chat', 'message')).toBeUndefined();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(1900);
    expect(elapsed).toBeLessThan(4000);
  }, 5000);
});
