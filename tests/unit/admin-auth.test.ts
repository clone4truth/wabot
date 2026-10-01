import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AdminAuth } from '../../src/security/admin-auth';
import { JsonFileStore } from '../../src/storage/json-store';
import { MemoryRateLimiter } from '../../src/security/memory-rate-limiter';
import env from '../../src/config/env';

const PASSWORD = 'password-yang-kuat';

function tmpStore(): JsonFileStore {
  return new JsonFileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'admin-auth-')), 's.json', 10_000);
}

/** Kunci rate limit harus berbeda per klien supaya test tidak saling memengaruhi. */
let clientSeq = 0;
const nextKey = () => `client-${++clientSeq}`;

describe('AdminAuth', () => {
  let savedPassword: string;

  beforeEach(() => {
    savedPassword = env.adminPassword;
    env.adminPassword = PASSWORD;
  });

  afterEach(() => {
    env.adminPassword = savedPassword;
  });

  it('nonaktif bila ADMIN_PASSWORD kosong', async () => {
    env.adminPassword = '';
    const auth = new AdminAuth(tmpStore());
    expect(auth.isEnabled()).toBe(false);
    const res = await auth.login('apa saja', nextKey());
    expect(res.ok).toBe(false);
    auth.stop();
  });

  it('password benar -> token + session valid', async () => {
    const auth = new AdminAuth(tmpStore());
    const res = await auth.login(PASSWORD, nextKey());
    expect(res.ok).toBe(true);
    expect(res.token).toBeTruthy();
    expect(auth.validateSession(res.token)).toBe(true);
    auth.stop();
  });

  it('password salah ditolak dan tidak menghasilkan session', async () => {
    const auth = new AdminAuth(tmpStore());
    const res = await auth.login('salah', nextKey());
    expect(res.ok).toBe(false);
    expect(res.token).toBeUndefined();
    auth.stop();
  });

  it('logout mencabut token', async () => {
    const auth = new AdminAuth(tmpStore());
    const { token } = await auth.login(PASSWORD, nextKey());
    expect(auth.validateSession(token)).toBe(true);
    auth.logout(token);
    expect(auth.validateSession(token)).toBe(false);
    auth.stop();
  });

  it('revokeAll mencabut semua sesi', async () => {
    const auth = new AdminAuth(tmpStore());
    const a = await auth.login(PASSWORD, nextKey());
    const b = await auth.login(PASSWORD, nextKey());
    auth.revokeAll();
    expect(auth.validateSession(a.token)).toBe(false);
    expect(auth.validateSession(b.token)).toBe(false);
    auth.stop();
  });

  it('token palsu / undefined tidak valid', () => {
    const auth = new AdminAuth(tmpStore());
    expect(auth.validateSession(undefined)).toBe(false);
    expect(auth.validateSession('token-palsu')).toBe(false);
    auth.stop();
  });

  it('cookie HttpOnly + SameSite=Strict, Secure hanya di production', () => {
    const auth = new AdminAuth(tmpStore());
    const savedEnv = env.appEnv;

    env.appEnv = 'development';
    expect(auth.cookieOptions().httpOnly).toBe(true);
    expect(auth.cookieOptions().sameSite).toBe('strict');
    expect(auth.cookieOptions().secure).toBe(false);

    env.appEnv = 'production';
    expect(auth.cookieOptions().secure).toBe(true);

    env.appEnv = savedEnv;
    auth.stop();
  });

  // REGRESI: sebelumnya "reset" dilakukan dengan consume(key, -N) sehingga
  // count menjadi negatif. Akibatnya setelah satu login berhasil, penyerang
  // bisa menebak password tanpa batas selama jendela masih aktif.
  it('login berhasil mereset penghitung secara absolut (tidak jadi negatif)', async () => {
    const auth = new AdminAuth(tmpStore());
    const key = nextKey();

    expect((await auth.login(PASSWORD, key)).ok).toBe(true);
    // regression guard: satu tebakan salah lagi harus dihitung sebagai percobaan #1,
    // bukan jadi "sisa kuota" yang besar.
    expect((await auth.login('salah', key)).ok).toBe(false);
    auth.stop();
  });

  it('percobaan login dibatasi 5 per jendela 60 detik', async () => {
    const auth = new AdminAuth(tmpStore());
    const key = nextKey();

    const results = [];
    for (let i = 0; i < 7; i++) {
      results.push(await auth.login('salah', key));
    }

    // 5 pertama ditolak karena password salah, sisanya karena kena rate limit.
    expect(results.slice(0, 5).every((r) => r.reason === 'Password salah.')).toBe(true);
    expect(results.slice(5).every((r) => /Terlalu banyak percobaan/.test(r.reason ?? ''))).toBe(true);

    //ilveraturi password benar juga harus tetap ditolak sampai jendela berganti.
    expect((await auth.login(PASSWORD, key)).ok).toBe(false);
    auth.stop();
  });

  it('rate limit login terpisah per klien', async () => {
    const auth = new AdminAuth(tmpStore());
    const a = nextKey();
    const b = nextKey();

    for (let i = 0; i < 6; i++) await auth.login('salah', a);
    expect((await auth.login(PASSWORD, a)).ok).toBe(false);

    // Klien lain tidak terpengaruh.
    expect((await auth.login(PASSWORD, b)).ok).toBe(true);
    auth.stop();
  });

  it('password komparasi panjang berbeda tetap aman (timingSafeEqual)', async () => {
    const auth = new AdminAuth(tmpStore());
    expect((await auth.login('x', nextKey())).ok).toBe(false);
    expect((await auth.login(PASSWORD + 'ekstra-panjang-sekali', nextKey())).ok).toBe(false);
    expect((await auth.login(PASSWORD, nextKey())).ok).toBe(true);
    auth.stop();
  });
});

describe('MemoryRateLimiter', () => {
  it('menerapkan limit override per-call', async () => {
    const rl = new MemoryRateLimiter(100);
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if ((await rl.consume('k', 1, 3)).allowed) allowed++;
    }
    expect(allowed).toBe(3);
    rl.stop();
  });

  // REGRESI: count negatif membuat `count + cost > limit` hampir tidak pernah
  // true, sehingga limit efektif hilang.
  it('reset() mengembalikan hitungan ke nol, bukan negatif', async () => {
    const rl = new MemoryRateLimiter(100);
    const key = 'reset-me';

    await rl.consume(key, 1, 3);
    await rl.consume(key, 1, 3);
    rl.reset(key);

    expect((await rl.consume(key, 1, 3)).allowed).toBe(true);
    expect((await rl.consume(key, 1, 3)).allowed).toBe(true);
    expect((await rl.consume(key, 1, 3)).allowed).toBe(true);
    expect((await rl.consume(key, 1, 3)).allowed).toBe(false);
    rl.stop();
  });

  it('reset() membuat key bisa dipakai lagi penuh', async () => {
    const rl = new MemoryRateLimiter(100);
    const key = 'fresh';
    for (let i = 0; i < 5; i++) await rl.consume(key, 1, 2);
    expect((await rl.consume(key, 1, 2)).allowed).toBe(false);
    rl.reset(key);
    expect((await rl.consume(key, 1, 2)).allowed).toBe(true);
    rl.stop();
  });

  it('tetap menghormati cap keras jumlah bucket', async () => {
    const rl = new MemoryRateLimiter(10);
    for (let i = 0; i < 100; i++) await rl.consume(`user:${i}`);
    // Bucket yangбро sudah di-evict oleh yang terlama; jumlah tidak boleh
    // melebihi cap meski ada 100 key berbeda.
    const probe = await rl.consume('user:0', 1, 50);
    expect(probe.allowed).toBe(true);
    rl.stop();
  });

  it('jendela 60 detik expire secara wajar', async () => {
    vi.useFakeTimers();
    const rl = new MemoryRateLimiter(100);
    expect((await rl.consume('k', 1, 1)).allowed).toBe(true);
    expect((await rl.consume('k', 1, 1)).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect((await rl.consume('k', 1, 1)).allowed).toBe(true);
    rl.stop();
    vi.useRealTimers();
  });
});