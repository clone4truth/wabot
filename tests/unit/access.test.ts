import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AccessGuard, sameId } from '../../src/security/access';
import { JsonFileStore } from '../../src/storage/json-store';
import { RuntimeConfigStore } from '../../src/config/runtime-config';
import env from '../../src/config/env';

// Store + config sementara per test: AccessGuard kini membaca allow/block dari
// RuntimeConfigStore (bukan env immutable), jadi disuntikkan agar test tidak
// menyentuh data/ sungguhan.
function tmpStore(): JsonFileStore {
  return new JsonFileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'access-')), 's.json', 10_000);
}

function tmpConfig(): RuntimeConfigStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'access-cfg-'));
  return new RuntimeConfigStore(new JsonFileStore(dir, 'c.json', 10_000));
}

function fakeWaha(participants: { id: string; role: string }[] = [], fail = false) {
  return {
    getGroupParticipants: async () => {
      if (fail) throw new Error('down');
      return participants;
    },
  } as any;
}

describe('sameId (LID vs c.us)', () => {
  it('samakan lintas format, bedakan nomor', () => {
    expect(sameId('111@lid', '111@c.us')).toBe(true);
    expect(sameId('111@c.us', '111@c.us')).toBe(true);
    expect(sameId('111@lid', '222@c.us')).toBe(false);
  });
});

describe('AccessGuard', () => {
  let cfg: RuntimeConfigStore;

  beforeEach(() => {
    cfg = tmpConfig();
    // Mulai dari kondisi terbuka supaya tiap test hanya mengatur apa yang diuji.
    cfg.update({ allowedChatIds: [], blockedSenderIds: [], groupAdminOnly: false });
  });

  afterEach(() => {
    cfg = undefined as unknown as RuntimeConfigStore;
  });

  it('default: semua diizinkan tanpa lookup', async () => {
    const g = new AccessGuard(fakeWaha(), tmpStore(), cfg);
    expect(await g.check({ chatId: 'c', senderId: 's', isGroup: true })).toEqual({ allowed: true });
  });

  it('sender terblokir -> blocked (diam)', async () => {
    cfg.update({ blockedSenderIds: ['999@c.us'] });
    const g = new AccessGuard(fakeWaha(), tmpStore(), cfg);
    expect(await g.check({ chatId: 'c', senderId: '999@lid', isGroup: false })).toEqual({
      allowed: false, reason: 'blocked',
    });
  });

  it('allowlist: chat luar daftar -> chat', async () => {
    cfg.update({ allowedChatIds: ['grup-utama@g.us'] });
    const g = new AccessGuard(fakeWaha(), tmpStore(), cfg);
    expect(await g.check({ chatId: 'grup-lain@g.us', senderId: 's', isGroup: true })).toEqual({
      allowed: false, reason: 'chat',
    });
    expect(await g.check({ chatId: 'grup-utama@g.us', senderId: 's', isGroup: true })).toEqual({ allowed: true });
  });

  it('admin-only: admin/superadmin lolos, member ditolak', async () => {
    cfg.update({ groupAdminOnly: true });
    const g = new AccessGuard(
      fakeWaha([
        { id: 'boss@c.us', role: 'superadmin' },
        { id: 'wakil@c.us', role: 'admin' },
        { id: 'warga@c.us', role: 'participant' },
      ]),
      tmpStore(),
      cfg,
    );
    expect((await g.check({ chatId: 'gr@g.us', senderId: 'boss@c.us', isGroup: true })).allowed).toBe(true);
    expect(await g.check({ chatId: 'gr@g.us', senderId: 'warga@c.us', isGroup: true })).toEqual({
      allowed: false, reason: 'admin',
    });
  });

  it('admin-only: cocokkan LID pengirim vs c.us partisipan', async () => {
    cfg.update({ groupAdminOnly: true });
    const g = new AccessGuard(fakeWaha([{ id: '111@c.us', role: 'admin' }]), tmpStore(), cfg);
    expect((await g.check({ chatId: 'gr@g.us', senderId: '111@lid', isGroup: true })).allowed).toBe(true);
  });

  it('admin-only: lookup gagal -> fail-open + cache admin dipakai ulang', async () => {
    cfg.update({ groupAdminOnly: true });
    let calls = 0;
    const waha = {
      getGroupParticipants: async () => {
        calls++;
        return [{ id: 'a@c.us', role: 'admin' }];
      },
    } as any;
    const g = new AccessGuard(waha, tmpStore(), cfg);
    expect((await g.check({ chatId: 'gr@g.us', senderId: 'a@c.us', isGroup: true })).allowed).toBe(true);
    expect((await g.check({ chatId: 'gr@g.us', senderId: 'a@c.us', isGroup: true })).allowed).toBe(true);
    expect(calls).toBe(1);

    const down = new AccessGuard(fakeWaha([], true), tmpStore(), cfg);
    expect((await down.check({ chatId: 'gr@g.us', senderId: 'siapa@c.us', isGroup: true })).allowed).toBe(true);
  });

  it('prefix per-chat: default, set valid, tolak invalid, clear', () => {
    const g = new AccessGuard(fakeWaha(), tmpStore(), cfg);
    expect(g.resolvePrefix('c1')).toBe(env.commandPrefix);
    expect(g.setPrefix('c1', '?')).toBe(true);
    expect(g.resolvePrefix('c1')).toBe('?');
    expect(g.setPrefix('c1', 'ab')).toBe(false);
    expect(g.setPrefix('c1', 'a')).toBe(false);
    expect(g.setPrefix('c1', ' ')).toBe(false);
    expect(g.resolvePrefix('c1')).toBe('?');
    g.clearPrefix('c1');
    expect(g.resolvePrefix('c1')).toBe(env.commandPrefix);
  });
});
