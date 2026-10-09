import env from '../config/env';
import { JsonFileStore, getSharedStore } from '../storage/json-store';
import { countGraphemes } from '../stickers/rendering/text-utils';

export const MAX_CONTACT_ALIAS_LENGTH = 32;
export const MAX_CONTACT_ALIASES_PER_USER = 200;

type SaveResult = { ok: true; name: string } | { ok: false; reason: 'name' | 'limit' | 'identity' };

/** Personal names belong to the requester and session, across their chats. */
export class ContactAliasStore {
  constructor(private readonly store: JsonFileStore = getSharedStore(env.dataDir)) {}

  private key(requesterId: string, session?: string): string {
    return `contact-aliases:${JSON.stringify([session ?? env.wahaSession, requesterId])}`;
  }

  private read(requesterId: string, session?: string): Map<string, string> {
    const raw = this.store.get(this.key(requesterId, session));
    if (!Array.isArray(raw)) return new Map();
    return new Map(raw.filter((item): item is [string, string] =>
      Array.isArray(item) && item.length === 2 &&
      typeof item[0] === 'string' && typeof item[1] === 'string',
    ).slice(0, MAX_CONTACT_ALIASES_PER_USER));
  }

  get(requesterId: string, contactId: string | undefined, session?: string): string | undefined {
    if (!requesterId || !contactId) return undefined;
    return this.read(requesterId, session).get(contactId);
  }

  set(requesterId: string, contactId: string, name: string, session?: string): SaveResult {
    if (!requesterId || !contactId) return { ok: false, reason: 'identity' };
    const clean = name.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (!clean || /[\u0000-\u001f\u007f]/u.test(clean) || countGraphemes(clean) > MAX_CONTACT_ALIAS_LENGTH) {
      return { ok: false, reason: 'name' };
    }
    const aliases = this.read(requesterId, session);
    if (!aliases.has(contactId) && aliases.size >= MAX_CONTACT_ALIASES_PER_USER) {
      return { ok: false, reason: 'limit' };
    }
    aliases.set(contactId, clean);
    this.store.set(this.key(requesterId, session), [...aliases]);
    return { ok: true, name: clean };
  }

  delete(requesterId: string, contactId: string, session?: string): boolean {
    const aliases = this.read(requesterId, session);
    if (!aliases.delete(contactId)) return false;
    const key = this.key(requesterId, session);
    if (aliases.size) this.store.set(key, [...aliases]);
    else this.store.delete(key);
    return true;
  }
}

export const contactAliases = new ContactAliasStore();
