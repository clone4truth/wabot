import { describe, expect, it } from 'vitest';
import Sharp from 'sharp';
import { StickerService } from '../../src/stickers/sticker.service';
import { GeneratorRegistry } from '../../src/stickers/generators/registry';
import { JobManager } from '../../src/stickers/jobs/job-manager';
import { Image } from 'node-webpmux';

describe('final static sticker compatibility', () => {
  it('compresses a high-detail image below 100KB while preserving canvas, alpha and pack metadata', async () => {
    const pixels = Buffer.alloc(512 * 512 * 4);
    let state = 12345;
    for (let i = 0; i < pixels.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        state = (state * 1664525 + 1013904223) >>> 0;
        pixels[i + channel] = state >>> 24;
      }
      const pixel = i / 4;
      const x = pixel % 512;
      const y = Math.floor(pixel / 512);
      pixels[i + 3] = x >= 16 && x < 496 && y >= 16 && y < 496 ? 255 : 0;
    }
    const original = await Sharp(pixels, { raw: { width: 512, height: 512, channels: 4 } })
      .webp({ quality: 95 }).toBuffer();
    expect(original.length).toBeGreaterThan(100 * 1024);
    const registry = new GeneratorRegistry();
    registry.register({
      name: 'size-fixture', supports: () => true, validate: () => {},
      process: async () => ({ buffer: original, mimetype: 'image/webp', width: 512, height: 512, animated: false, size: original.length }),
    });
    const service = new StickerService(undefined, registry, new JobManager({ image: 1 }));
    const result = await service.process({ command: '!stiker', args: 'fixture', chatId: 'chat', senderId: 'sender', isGroup: false });
    expect(result!.buffer.length).toBeLessThanOrEqual(100 * 1024);
    expect(result!.size).toBe(result!.buffer.length);
    expect(await Sharp(result!.buffer).metadata()).toMatchObject({ format: 'webp', width: 512, height: 512, hasAlpha: true });
    const { data, info } = await Sharp(result!.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
    expect(data[(256 * 512 + 256) * info.channels + 3]).toBe(255);
    const webp = new Image();
    await webp.load(result!.buffer);
    expect(webp.exif).toBeDefined();
    expect(webp.exif!.toString()).toContain('sticker-pack-name');
  });
});
