import env from '../config/env';
import { runtimeConfig, RuntimeConfigStore } from '../config/runtime-config';
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
const ADMIN_CACHE_MAX_GROUPS = 1_000;
const ADMIN_FAILURE_TTL_MS = 30 * 1000;
const ADMIN_CACHE_SWEEP_MS = 60_000;


export class AccessGuard {
  private readonly store: JsonFileStore;
  private readonly adminCache = new Map<string, AdminCache>();
  // Single-flight: satu request WAHA per grup, dipakai ulang semua pemanggil
  // yang arrive bersamaan. Tanpa ini, 20 pesan bersamaan di grup yang sama
  // menembakkan 20 request paralel ke WAHA (yang ada di VPS yang sama).
  private readonly inflightAdminLookups = new Map<string, Promise<Set<string>>>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly waha: WAHAClient = new WAHAClient(),
    store?: JsonFileStore,
    private readonly config: RuntimeConfigStore = runtimeConfig,
  ) {
    this.store = store ?? getSharedStore(env.dataDir);
    this.sweepTimer = setInterval(() => this.sweepAdminCache(), ADMIN_CACHE_SWEEP_MS);
    this.sweepTimer.unref?.();
  }

  async check(msg: { chatId: string; senderId: string; isGroup: boolean }): Promise<{ allowed: boolean; reason?: DenyReason }> {
    const cfg = this.config.get();
    if (cfg.blockedSenderIds.some((id) => sameId(id, msg.senderId))) {
      return { allowed: false, reason: 'blocked' };
    }
    if (cfg.allowedChatIds.length > 0 && !cfg.allowedChatIds.some((id) => sameId(id, msg.chatId))) {
      return { allowed: false, reason: 'chat' };
    }
    if (msg.isGroup && cfg.groupAdminOnly && !(await this.isGroupAdmin(msg.chatId, msg.senderId))) {
      return { allowed: false, reason: 'admin' };
    }
    return { allowed: true };
  }

  async isGroupAdmin(groupId: string, senderId: string): Promise<boolean> {
    const cached = this.adminCache.get(groupId);
    if (cached && Date.now() < cached.expiresAt) {
      return Array.from(cached.admins).some((id) => sameId(id, senderId));
    }

    let admins: Set<string>;
    try {
      admins = await this.fetchAdmins(groupId);
    } catch (err) {
      // Fail-open dengan log: admin-only itu kenyamanan, bukan benteng.
      logger.warn('Gagal cek admin grup, izinkan sementara', { chatIdHash: hashIdentifier(groupId), error: String(err) });
      return true;
    }
    return Array.from(admins).some((id) => sameId(id, senderId));
  }

  /**
   * Single-flight lookup admin grup.
   *
   * `adminCache` sengaja tidak di-cache saat lookup gagal: versi lama begitu,
   * dan akibatnya saat WAHA sedang down SETIAP pesan memicu request baru —
   * membanjiri tepat pada saat dependency-nya sudah gagal. Sekarang kegagalan
   * di-cache sebagai entri kosong berb TTL pendek supaya ada jeda.
   */
  private fetchAdmins(groupId: string): Promise<Set<string>> {
    const existing = this.inflightAdminLookups.get(groupId);
    if (existing) return existing;

    const lookup = this.waha
      .getGroupParticipants(groupId)
      .then((participants) => {
        const admins = new Set(
          participants.filter((p) => p.role !== 'participant').map((p) => p.id),
        );
        this.setAdminCache(groupId, admins, ADMIN_CACHE_TTL_MS);
        return admins;
      })
      .catch((err) => {
        // Cache negatif singkat: hentikan retry storm selama WAHA pulih.
        this.setAdminCache(groupId, new Set(), ADMIN_FAILURE_TTL_MS);
        throw err;
      })
      .finally(() => {
        this.inflightAdminLookups.delete(groupId);
      });

    this.inflightAdminLookups.set(groupId, lookup);
    return lookup;
  }

  private setAdminCache(groupId: string, admins: Set<string>, ttlMs: number): void {
    this.evictOldestAdminIfFull();
    this.adminCache.set(groupId, { admins, expiresAt: Date.now() + ttlMs });
  }

  private evictOldestAdminIfFull(): void {
    while (this.adminCache.size >= ADMIN_CACHE_MAX_GROUPS) {
      const oldest = this.adminCache.keys().next();
      if (oldest.done) return;
      this.adminCache.delete(oldest.value);
    }
  }

  /**
   * Buang entri admin kedaluwarsa.
   *
   * Versi lama tidak punya metode sapu sama sekali: entri basi tidak pernah
   * dihapus, hanya ditimpa saat grup yang sama dicek lagi — jadi map tumbuh
   * monoton selama masa hidup proses.
   */
  private sweepAdminCache(): void {
    const now = Date.now();
    for (const [groupId, entry] of this.adminCache) {
      if (now >= entry.expiresAt) this.adminCache.delete(groupId);
    }
  }

  /** Hentikan timer sweep (dipanggil saat shutdown). */
  stop(): void {
    clearInterval(this.sweepTimer);
  }

  resolvePrefix(chatId: string): string {
    return this.config.resolvePrefix(chatId);
  }

  // Prefix 1 karakter simbol (bukan huruf/angka/spasi).
  setPrefix(chatId: string, prefix: string): boolean {
    return this.config.setPrefix(chatId, prefix);
  }

  clearPrefix(chatId: string): void {
    this.config.clearPrefix(chatId);
  }
}
