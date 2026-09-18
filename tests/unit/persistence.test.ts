import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { JsonFileStore } from '../../src/storage/json-store';
import { IdempotencyGuard } from '../../src/security/idempotency';
import { MemoryRateLimiter } from '../../src/security/memory-rate-limiter';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'botstate-'));
}

describe('JsonFileStore', () => {
  it('set/get + TTL kedaluwarsa', async () => {
    const store = new JsonFileStore(tmpDir(), 's.json', 10_000);
    store.set('a', 1);
    expect(store.get('a')).toBe(1);
    store.set('b', 2, 10);
    await new Promise((r) => setTimeout(r, 20));
    expect(store.get('b')).toBeUndefined();
  });

  it('snapshot selamat dari restart (instance baru, file sama)', () => {
    const dir = tmpDir();
    const first = new JsonFileStore(dir, 's.json', 10_000);
    first.set('k', 'v', 60_000);
    first.flush();
    const second = new JsonFileStore(dir, 's.json', 10_000);
    expect(second.get('k')).toBe('v');
  });

  it('entri kedaluwarsa tidak dimuat ulang', async () => {
    const dir = tmpDir();
    const first = new JsonFileStore(dir, 's.json', 10_000);
    first.set('k', 'v', 10);
    first.flush();
    await new Promise((r) => setTimeout(r, 20));
    const second = new JsonFileStore(dir, 's.json', 10_000);
    expect(second.get('k')).toBeUndefined();
  });

  it('file korup -> mulai kosong tanpa throw', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 's.json'), 'bukan-json{{{');
    expect(() => new JsonFileStore(dir, 's.json', 10_000)).not.toThrow();
  });
});

describe('IdempotencyGuard persisten', () => {
  it('duplikat terdeteksi lintas restart', () => {
    const dir = tmpDir();
    const first = new IdempotencyGuard(60_000, 100, new JsonFileStore(dir, 's.json', 10_000));
    first.markProcessed('evt-1');
    expect(first.isDuplicate('evt-1')).toBe(true);
    first.flush();

    const second = new IdempotencyGuard(60_000, 100, new JsonFileStore(dir, 's.json', 10_000));
    expect(second.isDuplicate('evt-1')).toBe(true);
    expect(second.isDuplicate('evt-lain')).toBe(false);
  });
});

describe('MemoryRateLimiter persisten', () => {
  it('hitungan jendela lanjut setelah restart', async () => {
    const dir = tmpDir();
    const mk = () => new MemoryRateLimiter(new JsonFileStore(dir, 's.json', 10_000));
    const first = mk();
    // Habiskan kuota user sampai diblokir (batas diambil dari env).
    let blocked = false;
    for (let i = 0; i < 5000 && !blocked; i++) {
      blocked = !(await first.consume('persist-user')).allowed;
    }
    expect(blocked).toBe(true);
    first.flush();

    const second = mk();
    expect((await second.consume('persist-user')).allowed).toBe(false);
    expect((await second.consume('user-lain')).allowed).toBe(true);
  });
});
