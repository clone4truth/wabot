/**
 * P1 contract tests — WAHA picture endpoint (GET /api/{session}/chats/{chatId}/picture).
 *
 * Official docs (https://waha.devlike.pro/docs/how-to/chats/):
 *   Response: { "url": "https://example.com/picture.jpg" }
 *   `url` can be null if there's no picture for the chat.
 *
 * Kontrak kode: `url` adalah field resmi (diprioritaskan);
 * `pictureUrl` hanya fallback kompatibilitas.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { WAHAClient } from '../../src/whatsapp/waha.client';

vi.mock('../../src/media/safe-external-image-fetcher', () => ({
  fetchExternalImageSafe: vi.fn(async (url: string) => {
    if (!url) return null;
    return { buffer: Buffer.from('fake-image'), mimetype: 'image/png' };
  }),
}));

describe('WAHAClient.getProfilePicture: official contract', () => {
  let server: http.Server;
  let baseUrl: string;
  let picturePayload: unknown;
  let pictureRequests: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url?.includes('/picture')) {
        pictureRequests.push(req.url ?? '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(picturePayload));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it('documented response { url } → uses url', async () => {
    picturePayload = { url: 'https://cdn.example.com/avatar.webp' };
    const result = await new WAHAClient(baseUrl, 'key', 'bot').getProfilePicture('1@c.us');
    expect(result).not.toBeNull();
    expect(result?.buffer.toString()).toBe('fake-image');
  });

  it('documented response { url: null } → returns null (no picture)', async () => {
    picturePayload = { url: null };
    const result = await new WAHAClient(baseUrl, 'key', 'bot').getProfilePicture('1@c.us');
    expect(result).toBeNull();
  });

  it('legacy { pictureUrl } without url → compatibility fallback used', async () => {
    picturePayload = { pictureUrl: 'https://legacy.example.com/pic.jpg' };
    const result = await new WAHAClient(baseUrl, 'key', 'bot').getProfilePicture('1@c.us');
    expect(result).not.toBeNull();
  });

  it('both fields present → official `url` wins over pictureUrl', async () => {
    picturePayload = {
      url: 'https://cdn.example.com/official.webp',
      pictureUrl: 'https://legacy.example.com/old.jpg',
    };
    const { fetchExternalImageSafe } = await import('../../src/media/safe-external-image-fetcher');
    await new WAHAClient(baseUrl, 'key', 'bot').getProfilePicture('1@c.us');
    expect(fetchExternalImageSafe).toHaveBeenLastCalledWith(
      'https://cdn.example.com/official.webp',
      expect.anything(),
    );
  });

  it('missing url and pictureUrl (empty object) → returns null', async () => {
    picturePayload = {};
    const result = await new WAHAClient(baseUrl, 'key', 'bot').getProfilePicture('1@c.us');
    expect(result).toBeNull();
  });

  it('requests the documented endpoint path', async () => {
    picturePayload = { url: null };
    pictureRequests = [];
    await new WAHAClient(baseUrl, 'key', 'bot').getProfilePicture('628123@c.us');
    expect(pictureRequests.some((u) => u.includes('/api/bot/chats/628123%40c.us/picture'))).toBe(
      true,
    );
  });
});
