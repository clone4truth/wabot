import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { WAHAClient } from '../../src/whatsapp/waha.client';
import { AppError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';

// Format request sesuai docs resmi WAHA: POST /api/<action> + session di body.
describe('WAHAClient (format API resmi)', () => {
  let server: http.Server;
  let baseUrl: string;
  const seen: { url?: string; body: any }[] = [];
  let failNext = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        seen.push({ url: req.url, body: data ? JSON.parse(data) : null });
        if (failNext > 0) {
          failNext--;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'boom' }));
          return;
        }
        if (req.url?.includes('/chats/overview')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ id: '1', name: 'Nama Tersimpan', picture: 'http://x/av.jpg' }]));
          return;
        }
        if (req.url?.startsWith('/api/contacts?')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: '1', name: 'Kontak Tersimpan', pushname: 'nick' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  const client = () => new WAHAClient(baseUrl, 'key', 'bot');

  it('sendText: path + session + chatId + text (+reply_to)', async () => {
    await client().sendText('1@c.us', 'hi', 'msg_1');
    const last = seen[seen.length - 1];
    expect(last.url).toBe('/api/sendText');
    expect(last.body).toMatchObject({ session: 'bot', chatId: '1@c.us', text: 'hi', reply_to: 'msg_1' });
  });

  it('sendImage: file base64 + filename', async () => {
    await client().sendImage('1@c.us', Buffer.from('img'), 'image/png');
    const last = seen[seen.length - 1];
    expect(last.url).toBe('/api/sendImage');
    expect(last.body.file).toMatchObject({ mimetype: 'image/png', filename: 'image.png' });
    expect(typeof last.body.file.data).toBe('string');
  });

  it('sendSticker: webp base64', async () => {
    await client().sendSticker('1@c.us', Buffer.from('stk'));
    const last = seen[seen.length - 1];
    expect(last.url).toBe('/api/sendSticker');
    expect(last.body.file).toMatchObject({ mimetype: 'image/webp', filename: 'sticker.webp' });
  });

  it('gagal kirim -> AppError WAHA_SEND_FAILED', async () => {
    failNext = 1;
    try {
      await client().sendText('1@c.us', 'hi');
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(ErrorCode.WAHA_SEND_FAILED);
    }
  });

  it('sendReaction gagal tetap diam', async () => {
    failNext = 1;
    await expect(client().sendReaction('1@c.us', 'm1', '👍')).resolves.toBeUndefined();
  });

  it('getChatInfo: parsed array overview', async () => {
    expect(await client().getChatInfo('1')).toEqual({ name: 'Nama Tersimpan', picture: 'http://x/av.jpg' });
  });

  it('getContactSavedName: name tersimpan, bukan pushname', async () => {
    expect(await client().getContactSavedName('1')).toBe('Kontak Tersimpan');
  });

  it('getChatInfo null saat 404', async () => {
    const c = new WAHAClient('http://127.0.0.1:1', 'key', 'bot');
    expect(await c.getChatInfo('1')).toBeNull();
  });
});
