import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AttpProcessor } from '../../src/stickers/processors/attp.processor';
import env from '../../src/config/env';

// Isolasi tempDir PER FILE test: worker vitest lain (webhook, processor-deadline,)
// juga membuat file 'attp-*' di tempDir bersama secara paralel — tanpa isolasi,
// test leak-check di file ini bisa salah menghitung file worker lain sebagai
// kebocoran (flaky CI). env.tempDir dibaca saat process() berjalan, jadi
// override di beforeAll cukup.
let privateTempDir: string;
let savedTempDir: string;

beforeAll(() => {
  privateTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attp-test-'));
  savedTempDir = env.tempDir;
  env.tempDir = privateTempDir;
});

afterAll(() => {
  env.tempDir = savedTempDir;
  fs.rmSync(privateTempDir, { recursive: true, force: true });
});

describe('AttpProcessor (teks animasi)', () => {
  it('menghasilkan webp animasi 8 frame dengan dimensi aktual 512x512', async () => {
    const result = await new AttpProcessor().process('halo dunia');
    expect(result.mimetype).toBe('image/webp');
    expect(result.animated).toBe(true);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.pages).toBe(8);
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 60000);

  it('mendukung teks panjang secara adaptif tanpa crash', async () => {
    const result = await new AttpProcessor().process('Teks animasi yang cukup panjang untuk menguji adaptive font scaling pada attp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(meta.pages).toBe(8);
  }, 60000);

  it('mendukung teks dengan emoji dan kata awalan reserved', async () => {
    const result = await new AttpProcessor().process('bubble error 😂🔥');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    const meta = await Sharp(result.buffer).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 60000);


  it('teks kosong ditolak dengan jelas', async () => {
    await expect(new AttpProcessor().process('   ')).rejects.toThrow();
  });

  it('timeout -> PROCESSING_TIMEOUT + workspace bersih', async () => {
    const env = (await import('../../src/config/env')).default;
    const fs = await import('fs');
    const before = new Set(fs.readdirSync(env.tempDir).filter((f: string) => f.startsWith('attp-')));
    await expect(new AttpProcessor().process('halo dunia', 50)).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
    });
    const leaked = fs.readdirSync(env.tempDir).filter((f: string) => f.startsWith('attp-') && !before.has(f));
    expect(leaked).toEqual([]);
  }, 60000);
});
