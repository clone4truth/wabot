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

describe('IdempotencyGuard states (in-memory)', () => {
  it('sukses dua kali -> kedua diabaikan', () => {
    const guard = new IdempotencyGuard();
    expect(guard.isDuplicate('evt-1')).toBe(false);
    guard.markProcessing('evt-1');
    expect(guard.isDuplicate('evt-1')).toBe(true);
    guard.markDone('evt-1');
    expect(guard.isDuplicate('evt-1')).toBe(true);
  });

  it('gagal pertama -> retry boleh proses lagi', () => {
    const guard = new IdempotencyGuard();
    guard.markProcessing('evt-2');
    guard.markFailed('evt-2');
    expect(guard.isDuplicate('evt-2')).toBe(false);
  });

  it('duplikat konkuren -> hanya satu mengeksekusi', async () => {
    const guard = new IdempotencyGuard();
    let executions = 0;
    async function handle(key: string): Promise<string> {
      if (guard.isDuplicate(key)) return 'ignored';
      guard.markProcessing(key);
      await new Promise((r) => setTimeout(r, 20));
      executions++;
      guard.markDone(key);
      return 'executed';
    }
    const [a, b] = await Promise.all([handle('evt-3'), handle('evt-3')]);
    expect(executions).toBe(1);
    expect([a, b].sort()).toEqual(['executed', 'ignored']);
  });

  it('TTL kedaluwarsa -> boleh lagi', async () => {
    const guard = new IdempotencyGuard(10);
    guard.markProcessing('evt-4');
    await new Promise((r) => setTimeout(r, 20));
    expect(guard.isDuplicate('evt-4')).toBe(false);
  });
});

describe('MemoryRateLimiter (in-memory)', () => {
  it('batas berlaku dalam satu window', async () => {
    const limiter = new MemoryRateLimiter();
    let blocked = false;
    for (let i = 0; i < 5000 && !blocked; i++) {
      blocked = !(await limiter.consume('user-x')).allowed;
    }
    expect(blocked).toBe(true);
    expect((await limiter.consume('user-lain')).allowed).toBe(true);
  });
});
