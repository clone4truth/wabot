import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Sharp from 'sharp';
import { fastify } from '../../src/app';
import env from '../../src/config/env';
import { defaultBackgroundRemovalService } from '../../src/stickers/background-removal/service';
import { LocalBackgroundRemovalProvider } from '../../src/stickers/background-removal/providers/local.provider';
import { DisabledBackgroundRemovalProvider } from '../../src/stickers/background-removal/providers/disabled.provider';

// Mock transport WAHA: controller + service memakai mock ini, render stiker tetap asli.
const wahaMocks = vi.hoisted(() => ({
  sendText: vi.fn().mockResolvedValue(undefined),
  sendImage: vi.fn().mockResolvedValue(undefined),
  sendSticker: vi.fn().mockResolvedValue(undefined),
  sendVideo: vi.fn().mockResolvedValue(undefined),
  sendReaction: vi.fn().mockResolvedValue(undefined),
  getChatInfo: vi.fn().mockResolvedValue(null),
  getContactSavedName: vi.fn().mockResolvedValue(undefined),
  getProfilePicture: vi.fn().mockResolvedValue(null),
  getGroupParticipants: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/whatsapp/waha.client', () => ({
  WAHAClient: vi.fn().mockImplementation(() => wahaMocks),
}));

// Mock download media
const dlMock = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: dlMock.downloadMedia,
  resolveMediaUrl: (u: string) => u,
}));

const KEY = 'integration-v2-hmac-key';
let n = 0;
const uid = (p: string) => `${p}-${Date.now()}-${n++}`;

function rawMessage(body: string, over: any = {}) {
  return JSON.stringify({
    event: 'message',
    session: 'bot',
    payload: {
      id: uid('msg-v2'),
      timestamp: Date.now(),
      from: uid('user-v2') + '@c.us',
      to: 'bot@c.us',
      body,
      hasMedia: false,
      ...over,
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

function postWebhook(raw: string) {
  return fastify.inject({ method: 'POST', url: '/webhooks', payload: raw, headers: signedHeaders(raw) });
}

describe('Webhook V2 Studio & Creative Commands', () => {
  let tmpDir: string;
  let testPngPath: string;

  beforeAll(async () => {
    env.wahaWebhookHmacKey = KEY;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-v2-test-'));

    // Create a circular red graphic on transparent background for effects/removebg
    const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="50" fill="#ef4444"/>
    </svg>`;
    testPngPath = path.join(tmpDir, 'test-src.png');
    await Sharp(Buffer.from(svg)).png().toFile(testPngPath);

    dlMock.downloadMedia.mockImplementation(async () => {
      const copyPath = path.join(tmpDir, `copy_${Date.now()}_${n++}.png`);
      fs.copyFileSync(testPngPath, copyPath);
      return { filePath: copyPath, mimeType: 'image/png', size: fs.statSync(copyPath).size };
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('!ttp style gold Hello -> sendSticker WebP', async () => {
    const res = await postWebhook(rawMessage('!ttp style gold Hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
    const [, buf] = wahaMocks.sendSticker.mock.calls[0];
    expect(Buffer.isBuffer(buf)).toBe(true);
    const meta = await Sharp(buf).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('!ttp style goldd Hello -> rejects unknown style via sendText', async () => {
    const res = await postWebhook(rawMessage('!ttp style goldd Hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('tidak tersedia');
  });

  it('!attp effect fade Hello -> sendSticker animated WebP', async () => {
    const res = await postWebhook(rawMessage('!attp effect fade Hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
    const [, buf] = wahaMocks.sendSticker.mock.calls[0];
    const meta = await Sharp(buf).metadata();
    expect(meta.format).toBe('webp');
    expect((meta.pages ?? 1) > 1).toBe(true);
  }, 15000);

  it('!attp effect faade Hello -> rejects unknown effect via sendText', async () => {
    const res = await postWebhook(rawMessage('!attp effect faade Hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('tidak tersedia');
  });

  it('!emoji 😂 -> sendSticker', async () => {
    const res = await postWebhook(rawMessage('!emoji 😂'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('!emoji ABC -> rejects non-emoji input via sendText', async () => {
    const res = await postWebhook(rawMessage('!emoji ABC'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('hanya menerima');
  });

  it('!badge ONLINE -> sendSticker', async () => {
    const res = await postWebhook(rawMessage('!badge ONLINE'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
    const [, buf] = wahaMocks.sendSticker.mock.calls[0];
    const meta = await Sharp(buf).metadata();
    expect(meta.width).toBe(512);
  });

  it('!stiker template terminal npm test -> sendSticker', async () => {
    const res = await postWebhook(rawMessage('!stiker template terminal npm test'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('!stiker template notfound hello -> rejects unknown template via sendText', async () => {
    const res = await postWebhook(rawMessage('!stiker template notfound hello'));
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('tidak ditemukan');
  });

  it('reply photo + !stiker blur -> sendSticker', async () => {
    const raw = rawMessage('!stiker blur', {
      replyTo: { id: 'media-blur', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('reply photo + !stiker pixel -> sendSticker', async () => {
    const raw = rawMessage('!stiker pixel', {
      replyTo: { id: 'media-pixel', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('reply photo + !stiker shadow -> sendSticker', async () => {
    const raw = rawMessage('!stiker shadow', {
      replyTo: { id: 'media-shadow', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('reply photo + !stiker caption bottom Halo -> sendSticker', async () => {
    const raw = rawMessage('!stiker caption bottom Halo', {
      replyTo: { id: 'media-caption', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('reply photo + !stiker caption with excessive text -> rejects TEXT_TOO_LONG via sendText', async () => {
    const raw = rawMessage(`!stiker caption bottom ${'Kata '.repeat(80)}`, {
      replyTo: { id: 'media-caption-long', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toMatch(/maksimal|terlalu panjang/);
  });

  it('reply photo + !stiker removebg (local provider) -> sendSticker', async () => {
    defaultBackgroundRemovalService.setProvider(new LocalBackgroundRemovalProvider());
    const raw = rawMessage('!stiker removebg', {
      replyTo: { id: 'media-rmbg', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('reply photo + !stiker removebg (disabled provider) -> rejects with FEATURE_DISABLED', async () => {
    defaultBackgroundRemovalService.setProvider(new DisabledBackgroundRemovalProvider());
    const raw = rawMessage('!stiker removebg', {
      replyTo: { id: 'media-rmbg-dis', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).not.toHaveBeenCalled();
    expect(wahaMocks.sendText).toHaveBeenCalledTimes(1);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('belum tersedia');
  });

  it('reply photo + !stiker subject -> sendSticker', async () => {
    defaultBackgroundRemovalService.setProvider(new LocalBackgroundRemovalProvider());
    const raw = rawMessage('!stiker subject', {
      replyTo: { id: 'media-subj', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('reply photo + !stiker outline black -> sendSticker', async () => {
    defaultBackgroundRemovalService.setProvider(new LocalBackgroundRemovalProvider());
    const raw = rawMessage('!stiker outline black', {
      replyTo: { id: 'media-outl', media: { url: 'http://example.com/src.png', mimetype: 'image/png' } },
    });
    const res = await postWebhook(raw);
    expect(res.statusCode).toBe(200);
    expect(wahaMocks.sendSticker).toHaveBeenCalledTimes(1);
  });

  it('!help removebg / !help blur / !help caption -> returns command detail via alias', async () => {
    const resRmbg = await postWebhook(rawMessage('!help removebg'));
    expect(resRmbg.statusCode).toBe(200);
    expect(String(wahaMocks.sendText.mock.calls[0][1])).toContain('removebg');

    const resBlur = await postWebhook(rawMessage('!help blur'));
    expect(resBlur.statusCode).toBe(200);
    expect(String(wahaMocks.sendText.mock.calls[1][1])).toContain('blur');

    const resCap = await postWebhook(rawMessage('!help caption'));
    expect(resCap.statusCode).toBe(200);
    expect(String(wahaMocks.sendText.mock.calls[2][1])).toContain('caption');
  });
});
