import env from '../config/env';
import { WAHAClient } from '../whatsapp/waha.client';
import { JsonFileStore, getSharedStore } from '../storage/json-store';
import { logger } from '../observability/logger';
import { hashIdentifier } from '../observability/privacy';

export type DenyReason = 'chat' | 'blocked' | 'admin';

// Samakan ID lintas format (@lid vs @c.us) via bagian angka.
export function sameId(a: string, b: string): boolean {
  if (a === b) return true;
  const digits = (s: string) => (s.split('@')[0] || '').replace(/\D/g, '');
  const da = digits(a);
  const db = digits(b);
  return !!da && da === db;
}

interface AdminCache {
  admins: Set<string>;
  expiresAt: number;
}

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

export class AccessGuard {
  private readonly store: JsonFileStore;
  private readonly adminCache = new Map<string, AdminCache>();

  constructor(
    private readonly waha: WAHAClient = new WAHAClient(),
    store?: JsonFileStore,
  ) {
    this.store = store ?? getSharedStore(env.dataDir);
  }

  async check(msg: { chatId: string; senderId: string; isGroup: boolean }): Promise<{ allowed: boolean; reason?: DenyReason }> {
    if (env.blockedSenderIds.some((id) => sameId(id, msg.senderId))) {
      return { allowed: false, reason: 'blocked' };
    }
    if (env.allowedChatIds.length > 0 && !env.allowedChatIds.some((id) => sameId(id, msg.chatId))) {
      return { allowed: false, reason: 'chat' };
    }
    if (msg.isGroup && env.groupAdminOnly && !(await this.isGroupAdmin(msg.chatId, msg.senderId))) {
      return { allowed: false, reason: 'admin' };
    }
    return { allowed: true };
  }

  async isGroupAdmin(groupId: string, senderId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.adminCache.get(groupId);
    if (cached && now < cached.expiresAt) {
      return Array.from(cached.admins).some((id) => sameId(id, senderId));
    }
    let admins = new Set<string>();
    try {
      const participants = await this.waha.getGroupParticipants(groupId);
      admins = new Set(participants.filter((p) => p.role !== 'participant').map((p) => p.id));
    } catch (err) {
      // Fail-open dengan log: admin-only itu kenyamanan, bukan benteng.
      logger.warn('Gagal cek admin grup, izinkan sementara', { chatIdHash: hashIdentifier(groupId), error: String(err) });
      return true;
    }
    this.adminCache.set(groupId, { admins, expiresAt: now + ADMIN_CACHE_TTL_MS });
    return Array.from(admins).some((id) => sameId(id, senderId));
  }

  resolvePrefix(chatId: string): string {
    const override = this.store.get(`prefix:${chatId}`);
    return typeof override === 'string' && override ? override : env.commandPrefix;
  }

  // Prefix 1 karakter simbol (bukan huruf/angka/spasi).
  setPrefix(chatId: string, prefix: string): boolean {
    if (!/^[^\w\s]$/u.test(prefix)) return false;
    this.store.set(`prefix:${chatId}`, prefix);
    return true;
  }

  clearPrefix(chatId: string): void {
    this.store.delete(`prefix:${chatId}`);
  }
}
