import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Sharp from 'sharp';
import { fastify } from '../../src/app';
import env from '../../src/config/env';
import { runtimeConfig } from '../../src/config/runtime-config';
import { COMMAND_REGISTRY } from '../../src/commands/metadata';
import { defaultAnimationRegistry } from '../../src/stickers/animations/registry';
import { defaultEffectRegistry } from '../../src/stickers/effects/registry';
import { defaultTemplateRegistry } from '../../src/stickers/templates/registry';
import { listTtpStyles } from '../../src/stickers/ttp/styles';
import { defaultBackgroundRemovalService } from '../../src/stickers/background-removal/service';
import { LocalBackgroundRemovalProvider } from '../../src/stickers/background-removal/providers/local.provider';
import { FFMPEG_THREAD_ARGS, getVideoMetadata, runFfmpegWithTimeout } from '../../src/media/ffmpeg';

// Only network boundaries are replaced; the webhook, parser, resolver, job
// manager, generators, rasterisation, EXIF, and FFmpeg all execute for real.
const transport = vi.hoisted(() => ({
  sendText: vi.fn().mockResolvedValue(undefined),
  sendImage: vi.fn().mockResolvedValue(undefined),
  sendSticker: vi.fn().mockResolvedValue(undefined),
  sendVideo: vi.fn().mockResolvedValue(undefined),
  getChatInfo: vi.fn().mockResolvedValue(null),
  getContactSavedName: vi.fn().mockResolvedValue('Rara'),
  getProfilePicture: vi.fn().mockResolvedValue(null),
  getMessageTimestamp: vi.fn().mockResolvedValue(undefined),
  getGroupParticipants: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/whatsapp/waha.client', () => ({
  WAHAClient: vi.fn().mockImplementation(() => transport),
}));

const downloader = vi.hoisted(() => ({ downloadMedia: vi.fn() }));
vi.mock('../../src/media/downloader', () => ({
  downloadMedia: downloader.downloadMedia,
  resolveMediaUrl: (url: string) => url,
}));

interface CommandCase {
  command: string;
  metadata: string;
  fixture?: string;
  animated?: boolean;
  output?: 'image' | 'video' | 'text';
  replyText?: string;
}

const imageModifiers = ['full', 'trim', 'crop', 'circle', ...defaultEffectRegistry.getAll().map((effect) => effect.name)];
const cases: CommandCase[] = [
  { command: '!stiker', metadata: 'stiker', fixture: 'photo.png' },
  { command: '!stiker Halo', metadata: 'stiker' },
  { command: '!stiker', metadata: 'stiker', fixture: 'video.mp4', animated: true },
  { command: '!stiker teks Halo', metadata: 'stiker teks' },
  { command: '!stiker teks', metadata: 'stiker teks', replyText: 'Halo dari reply' },
  { command: '!stiker quote', metadata: 'stiker quote', replyText: 'Pesan kutipan' },
  { command: '!stiker bubble', metadata: 'stiker bubble', replyText: 'Gatau,\nbiasanya ngikut aja' },
  { command: '!stiker bubble Halo', metadata: 'stiker bubble' },
  { command: '!stiker meme ATAS | BAWAH', metadata: 'stiker meme', fixture: 'photo.png' },
  ...imageModifiers.map((modifier) => ({ command: `!stiker ${modifier}`, metadata: `stiker ${modifier}`, fixture: 'photo.png' })),
  ...['removebg', 'subject'].map((modifier) => ({ command: `!stiker ${modifier}`, metadata: `stiker ${modifier}`, fixture: 'photo.png' })),
  ...['white', 'black', 'gold'].map((color) => ({ command: `!stiker outline ${color}`, metadata: 'stiker outline', fixture: 'photo.png' })),
  ...['top', 'bottom', 'overlay'].map((position) => ({ command: `!stiker caption ${position} Halo`, metadata: 'stiker caption', fixture: 'photo.png' })),
  ...defaultTemplateRegistry.list().map((template) => ({ command: `!stiker template ${template.name} Halo`, metadata: 'stiker template' })),
  { command: '!ttp Halo', metadata: 'ttp' },
  { command: '!ttp', metadata: 'ttp', replyText: 'Pesan dari reply' },
  ...listTtpStyles().filter((style) => style !== 'default').flatMap((style): CommandCase[] => [
    { command: `!ttp style ${style} Halo`, metadata: 'ttp' },
    { command: `!ttp --image style ${style} Halo`, metadata: 'ttp --image', output: 'image' },
  ]),
  { command: '!attp Halo', metadata: 'attp', animated: true },
  ...defaultAnimationRegistry.list().map((effect) => ({ command: `!attp effect ${effect} Halo`, metadata: 'attp', animated: true })),
  ...['😂', '🇮🇩', '👨‍💻', '😂 🔥 ❤️ ✨'].map((emoji) => ({ command: `!emoji ${emoji}`, metadata: 'emoji' })),
  ...['ONLINE', 'OFFLINE', 'LIVE', 'ERROR', 'SUCCESS'].map((badge) => ({ command: `!badge ${badge}`, metadata: 'badge' })),
  { command: '!toimg', metadata: 'toimg', fixture: 'static.webp', output: 'image' },
  { command: '!togif', metadata: 'togif', fixture: 'animated.webp', output: 'video' },
  ...['!menu', '!help', '!help effects', '!template list', '!template info terminal', '!ping', '!prefix', '!job'].map((command): CommandCase => ({
    command, metadata: command.slice(1).split(' ')[0], output: 'text',
  })),
];

const KEY = 'command-matrix-hmac';
let counter = 0;
let fixtureDir: string;
const mimeTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4',
};

async function sendCommand(command: string, fixture?: string, replyText?: string, from?: string) {
  const messageId = `matrix-${Date.now()}-${counter++}`;
  const raw = JSON.stringify({
    event: 'message', session: 'matrix-session', payload: {
      id: messageId, timestamp: 1_791_468_000, notifyName: 'Rara',
      from: from ?? `matrix-user-${counter}@c.us`, to: 'bot@c.us', body: command,
      ...(fixture || replyText ? {
        replyTo: {
          id: `false_quoted-${counter}`, timestamp: 1_791_464_760,
          body: replyText, senderName: 'Rara', participant: '628123456789@c.us',
          ...(fixture ? { media: { url: `http://waha.test/${fixture}`, mimetype: mimeTypes[path.extname(fixture)] } } : {}),
        },
      } : {}),
    },
  });
  return fastify.inject({
    method: 'POST', url: '/webhooks', payload: raw, headers: {
      'content-type': 'application/json',
      'x-webhook-hmac': crypto.createHmac('sha512', KEY).update(raw).digest('hex'),
      'x-webhook-hmac-algorithm': 'sha512',
    },
  });
}

describe('Every advertised command executes through the webhook', () => {
  beforeAll(async () => {
    env.wahaWebhookHmacKey = KEY;
    defaultBackgroundRemovalService.setProvider(new LocalBackgroundRemovalProvider());
    fixtureDir = fs.mkdtempSync(path.join(env.tempDir, 'command-fixtures-'));
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="180"><rect width="220" height="180" fill="white"/><circle cx="110" cy="90" r="56" fill="#ef4444"/></svg>');
    await Sharp(svg).png().toFile(path.join(fixtureDir, 'photo.png'));
    await Sharp(svg).webp().toFile(path.join(fixtureDir, 'static.webp'));
    const cameraPhoto = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100" height="100" fill="red"/><rect x="100" width="100" height="100" fill="blue"/></svg>');
    await Sharp(cameraPhoto).withMetadata({ orientation: 6 }).jpeg().toFile(path.join(fixtureDir, 'camera.jpg'));
    await runFfmpegWithTimeout([
      '-y', '-loglevel', 'error', ...FFMPEG_THREAD_ARGS,
      '-f', 'lavfi', '-i', 'testsrc2=s=128x96:r=5:d=0.6',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', path.join(fixtureDir, 'video.mp4'),
    ], 30_000);
    await runFfmpegWithTimeout([
      '-y', '-loglevel', 'error', ...FFMPEG_THREAD_ARGS,
      '-i', path.join(fixtureDir, 'video.mp4'), '-c:v', 'libwebp', '-loop', '0', '-an', path.join(fixtureDir, 'animated.webp'),
    ], 30_000);
    downloader.downloadMedia.mockImplementation(async (url: string) => {
      const source = path.join(fixtureDir, path.basename(new URL(url).pathname));
      const filePath = path.join(env.tempDir, `matrix-download-${counter++}${path.extname(source)}`);
      await fs.promises.copyFile(source, filePath);
      return { filePath, mimeType: mimeTypes[path.extname(source)], size: fs.statSync(filePath).size };
    });
  }, 60_000);

  beforeEach(() => vi.clearAllMocks());

  afterAll(async () => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    await fastify.close();
  });

  it('covers every public entry listed by the menu registry', () => {
    const covered = new Set(cases.map((testCase) => testCase.metadata));
    expect(COMMAND_REGISTRY.map((entry) => entry.name).filter((name) => !covered.has(name))).toEqual([]);
  });

  it.each(cases)('$command produces the advertised output', async ({ command, fixture, output, animated, replyText }) => {
    const beforeFiles = fs.readdirSync(env.tempDir).sort();
    const response = await sendCommand(command, fixture, replyText);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    if (output === 'text') {
      expect(transport.sendText).toHaveBeenCalledTimes(1);
      expect(String(transport.sendText.mock.calls[0][1])).not.toMatch(/^❌/);
    } else {
      expect(transport.sendText).not.toHaveBeenCalled();
      const send = output === 'image' ? transport.sendImage : output === 'video' ? transport.sendVideo : transport.sendSticker;
      expect(send).toHaveBeenCalledTimes(1);
      const buffer = send.mock.calls[0][1] as Buffer;
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(100);
      if (output === 'video') {
        const outputPath = path.join(fixtureDir, `assert-${counter++}.mp4`);
        fs.writeFileSync(outputPath, buffer);
        const metadata = await getVideoMetadata(outputPath);
        expect(metadata.codec).toBe('h264');
        expect(metadata.pixelFormat).toBe('yuv420p');
        expect(metadata.duration).toBeGreaterThan(0);
        fs.rmSync(outputPath);
      } else {
        const metadata = await Sharp(buffer).metadata();
        expect(metadata.format).toBe(output === 'image' ? 'png' : 'webp');
        const dimension = command.startsWith('!ttp --image') ? 1024 : output === 'image' ? 220 : 512;
        expect(metadata.width).toBe(dimension);
        expect(metadata.height).toBe(output === 'image' && command === '!toimg' ? 180 : dimension);
        expect((metadata.pages ?? 1) > 1).toBe(Boolean(animated));
      }
    }
    expect(fs.readdirSync(env.tempDir).sort()).toEqual(beforeFiles);
  }, 60_000);

  it('prefix changes make every subsequent command use the new prefix', async () => {
    const chatId = `matrix-prefix-${counter++}@c.us`;
    try {
      expect((await sendCommand('!prefix ?', undefined, undefined, chatId)).statusCode).toBe(200);
      expect(transport.sendText.mock.calls[0][1]).toContain('Prefix diubah ke "?"');
      vi.clearAllMocks();
      await sendCommand('?stiker Halo', undefined, undefined, chatId);
      expect(transport.sendSticker).toHaveBeenCalledTimes(1);
      await sendCommand('?menu', undefined, undefined, chatId);
      expect(transport.sendText.mock.calls[0][1]).toContain('?stiker removebg');
    } finally {
      runtimeConfig.clearPrefix(chatId);
    }
  });

  it('a template without a name explains the missing argument', async () => {
    await sendCommand('!stiker template');
    expect(transport.sendSticker).not.toHaveBeenCalled();
    expect(transport.sendText.mock.calls[0][1]).toContain('Tentukan nama template');
  });

  it.each([
    { command: '!stiker meme ATAS | BAWAH', redY: 180, blueY: 332 },
    { command: '!stiker caption bottom Halo', redY: 128, blueY: 350 },
    { command: '!stiker caption top Halo', redY: 200, blueY: 450 },
    { command: '!stiker caption overlay Halo', redY: 128, blueY: 350 },
  ])('$command preserves the orientation of a camera JPEG', async ({ command, redY, blueY }) => {
    await sendCommand(command, 'camera.jpg');
    expect(transport.sendText).not.toHaveBeenCalled();
    expect(transport.sendSticker).toHaveBeenCalledTimes(1);
    const { data, info } = await Sharp(transport.sendSticker.mock.calls[0][1]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const red = (redY * info.width + 256) * info.channels;
    const blue = (blueY * info.width + 256) * info.channels;
    expect(data[red]).toBeGreaterThan(200);
    expect(data[red + 2]).toBeLessThan(50);
    expect(data[blue + 2]).toBeGreaterThan(200);
    expect(data[blue]).toBeLessThan(50);
  });
});
