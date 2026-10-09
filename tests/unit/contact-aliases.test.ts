import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import env from '../../src/config/env';
import { JsonFileStore } from '../../src/storage/json-store';
import { ContactAliasStore, MAX_CONTACT_ALIASES_PER_USER } from '../../src/whatsapp/contact-aliases';
import { handleContactCommand } from '../../src/commands/contact.handler';
import { NormalizedMessage } from '../../src/whatsapp/types';

let dir: string;
let file: JsonFileStore;
let aliases: ContactAliasStore;
const message: NormalizedMessage = {
  eventId: 'alias-test', messageId: 'command', session: 'bot',
  chatId: 'group@g.us', senderId: 'andi@lid', senderName: 'Andi', isGroup: true, fromMe: false, body: '!kontak',
  reply: { messageId: 'original', senderId: 'rara@lid', senderName: 'Rara' },
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(env.tempDir, 'contact-aliases-'));
  file = new JsonFileStore(dir);
  aliases = new ContactAliasStore(file);
});
afterEach(() => {
  file.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('personal contact names', () => {
  it('keeps two users and two sessions independent for the same contact', () => {
    aliases.set('andi@lid', 'rara@lid', 'Kak Rara', 'bot');
    aliases.set('budi@lid', 'rara@lid', 'Rara Kantor', 'bot');
    aliases.set('andi@lid', 'rara@lid', 'Rara Sekolah', 'other-bot');
    expect(aliases.get('andi@lid', 'rara@lid', 'bot')).toBe('Kak Rara');
    expect(aliases.get('budi@lid', 'rara@lid', 'bot')).toBe('Rara Kantor');
    expect(aliases.get('andi@lid', 'rara@lid', 'other-bot')).toBe('Rara Sekolah');
    expect(aliases.get('another@lid', 'rara@lid', 'bot')).toBeUndefined();
  });

  it('persists aliases across a store restart', () => {
    aliases.set('andi@lid', 'rara@lid', 'Kak Rara', 'bot');
    file.close();
    file = new JsonFileStore(dir);
    aliases = new ContactAliasStore(file);
    expect(aliases.get('andi@lid', 'rara@lid', 'bot')).toBe('Kak Rara');
  });

  it('normalizes whitespace and preserves complete Unicode names', () => {
    expect(aliases.set('andi@lid', 'rara@lid', '  Kak\n Rara 👨‍👩‍👧‍👦  ', 'bot')).toEqual({ ok: true, name: 'Kak Rara 👨‍👩‍👧‍👦' });
    expect(aliases.get('andi@lid', 'rara@lid', 'bot')).toBe('Kak Rara 👨‍👩‍👧‍👦');
  });

  it.each(['', '   ', 'a'.repeat(33), 'Rara\u0000'])('rejects invalid name %j without replacing a saved name', (name) => {
    aliases.set('andi@lid', 'rara@lid', 'Kak Rara', 'bot');
    expect(aliases.set('andi@lid', 'rara@lid', name, 'bot')).toEqual({ ok: false, reason: 'name' });
    expect(aliases.get('andi@lid', 'rara@lid', 'bot')).toBe('Kak Rara');
  });

  it('allows editing at the per-user limit without evicting someone else', () => {
    for (let i = 0; i < MAX_CONTACT_ALIASES_PER_USER; i++) aliases.set('andi@lid', `person-${i}@lid`, `Nama ${i}`, 'bot');
    expect(aliases.set('andi@lid', 'new@lid', 'Baru', 'bot')).toEqual({ ok: false, reason: 'limit' });
    expect(aliases.set('andi@lid', 'person-0@lid', 'Nama Baru', 'bot')).toEqual({ ok: true, name: 'Nama Baru' });
    expect(aliases.set('budi@lid', 'new@lid', 'Baru', 'bot').ok).toBe(true);
  });

  it('removes only the caller’s alias', () => {
    aliases.set('andi@lid', 'rara@lid', 'Kak Rara', 'bot');
    aliases.set('budi@lid', 'rara@lid', 'Rara Kantor', 'bot');
    expect(aliases.delete('andi@lid', 'rara@lid', 'bot')).toBe(true);
    expect(aliases.get('andi@lid', 'rara@lid', 'bot')).toBeUndefined();
    expect(aliases.get('budi@lid', 'rara@lid', 'bot')).toBe('Rara Kantor');
  });
});

describe('contact command', () => {
  it('saves, reads and deletes a name for the quoted author', () => {
    expect(handleContactCommand('nama Kak Rara', message, '!', aliases)).toContain('disimpan: Kak Rara');
    expect(handleContactCommand('', message, '!', aliases)).toBe('Nama kontak pilihanmu: Kak Rara');
    expect(handleContactCommand('hapus', message, '!', aliases)).toContain('dihapus');
    expect(aliases.get(message.senderId, message.reply!.senderId, message.session)).toBeUndefined();
  });

  it('requires a known quoted author and uses the current prefix in guidance', () => {
    const response = handleContactCommand('nama Kak Rara', { ...message, reply: undefined }, '?', aliases);
    expect(response).toContain('Reply pesan seseorang');
    expect(response).toContain('?kontak nama Kak Rara');
    expect(response).not.toContain('!kontak');
  });

  it('does not delete an alias for a malformed action', () => {
    aliases.set(message.senderId, 'rara@lid', 'Kak Rara', 'bot');
    expect(handleContactCommand('hapus semuanya', message, '!', aliases)).toContain('tidak dikenal');
    expect(aliases.get(message.senderId, 'rara@lid', 'bot')).toBe('Kak Rara');
  });
});
