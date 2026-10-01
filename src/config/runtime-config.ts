import env from './env';
import { JsonFileStore, getSharedStore } from '../storage/json-store';

/**
 * Konfigurasi runtime yang bisa diubah dari dashboard admin.
 *
 * `env` dibaca sekali saat boot dan immutable, jadi perubahan lewat dashboard
 * disimpan terpisah di JSON store lalu di-overlay di sini. Semua consumer
 * membaca lewat `runtimeConfig.get()`, bukan `env.*`, supaya perubahan benar-benar
 * berlaku tanpa restart.
 *
 * Setiap field selalu bernilai konkret: nilainya adalah "override bila ada,
 * selain itu default dari env". Tidak ada sentinel `null` — `defaults` menyimpan
 * nilai env untuk ditampilkan di UI dan untuk `reset()`.
 */
export interface RuntimeConfig {
  userRateLimit: number;
  groupRateLimit: number;
  videoConcurrencyPerUser: number;
  maxImageJobs: number;
  maxVideoJobs: number;
  maxAnimationJobs: number;
  maxBackgroundJobs: number;
  maxTextLength: number;
  maxImageBytes: number;
  maxVideoBytes: number;
  groupAdminOnly: boolean;
  commandPrefix: string;
  /** Chat yang boleh pakai bot. Kosong = semua chat diizinkan. */
  allowedChatIds: string[];
  /** Sender yang diblokir. */
  blockedSenderIds: string[];
}

const CONFIG_KEY = 'admin:runtime-config';
const PREFIX_KEY = 'admin:prefix:';

// Default diambil dari env saat module load. Array di-copy supaya perubahan
// dari dashboard tidak mengubah object env itu sendiri.
const DEFAULTS: RuntimeConfig = {
  userRateLimit: env.userRateLimit,
  groupRateLimit: env.groupRateLimit,
  videoConcurrencyPerUser: env.videoConcurrencyPerUser,
  maxImageJobs: env.maxImageJobs,
  maxVideoJobs: env.maxVideoJobs,
  maxAnimationJobs: env.maxAnimationJobs,
  maxBackgroundJobs: env.maxBackgroundJobs,
  maxTextLength: env.maxTextLength,
  maxImageBytes: env.maxImageBytes,
  maxVideoBytes: env.maxVideoBytes,
  groupAdminOnly: env.groupAdminOnly,
  commandPrefix: env.commandPrefix,
  allowedChatIds: [...env.allowedChatIds],
  blockedSenderIds: [...env.blockedSenderIds],
};

const LIMITS = {
  userRateLimit: { min: 1, max: 1000 },
  groupRateLimit: { min: 1, max: 5000 },
  videoConcurrencyPerUser: { min: 1, max: 10 },
  maxImageJobs: { min: 1, max: 32 },
  maxVideoJobs: { min: 1, max: 16 },
  maxAnimationJobs: { min: 1, max: 16 },
  maxBackgroundJobs: { min: 1, max: 8 },
  maxTextLength: { min: 1, max: 4000 },
  maxImageBytes: { min: 64 * 1024, max: 64 * 1024 * 1024 },
  maxVideoBytes: { min: 64 * 1024, max: 128 * 1024 * 1024 },
} as const;

type NumericField = keyof typeof LIMITS;

const MAX_ID_LIST = 5_000;

export function isValidPrefix(prefix: string): boolean {
  return /^[^\w\s]$/u.test(prefix);
}

/** Normalisasi input daftar ID: trim, buang kosong, dedup, batas panjang. */
export function normalizeIdList(raw: unknown): string[] | null {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[\n,]/)
      : null;
  if (!list) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const value = String(item).trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= MAX_ID_LIST) break;
  }
  return out;
}

export class RuntimeConfigStore {
  private config: RuntimeConfig = { ...DEFAULTS };
  private readonly store: JsonFileStore;

  constructor(store?: JsonFileStore) {
    this.store = store ?? getSharedStore(env.dataDir);
    this.load();
  }

  /** Effective config: override bila ada, selain itu default env. */
  get(): RuntimeConfig {
    return { ...this.config };
  }

  /** Tampilan untuk UI: nilai aktif + nilai env sebagai referensi + batas valid. */
  snapshot(): {
    effective: RuntimeConfig;
    defaults: RuntimeConfig;
    limits: typeof LIMITS;
  } {
    return {
      effective: this.get(),
      defaults: { ...DEFAULTS, allowedChatIds: [...DEFAULTS.allowedChatIds], blockedSenderIds: [...DEFAULTS.blockedSenderIds] },
      limits: LIMITS,
    };
  }

  /**
   * Simpan sebagian config. Field yang tidak disebut tidak berubah.
   * Nilai di luar batas ditolak agar config tidak bisa membuat bot tak bisa
   * melayani (mis. maxImageJobs = 0 → semua request kena JOB_QUEUE_FULL).
   */
  update(patch: Record<string, unknown>): { ok: boolean; rejected: string[] } {
    const rejected: string[] = [];
    const next: RuntimeConfig = { ...this.config };

    for (const [key, raw] of Object.entries(patch)) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        rejected.push(key);
        continue;
      }
      const field = key as keyof RuntimeConfig;

      if (field === 'allowedChatIds' || field === 'blockedSenderIds') {
        const normalized = normalizeIdList(raw);
        if (!normalized) {
          rejected.push(key);
          continue;
        }
        next[field] = normalized;
        continue;
      }

      if (field === 'groupAdminOnly') {
        if (typeof raw !== 'boolean') {
          rejected.push(key);
          continue;
        }
        next.groupAdminOnly = raw;
        continue;
      }

      if (field === 'commandPrefix') {
        if (typeof raw !== 'string' || !isValidPrefix(raw)) {
          rejected.push(key);
          continue;
        }
        next.commandPrefix = raw;
        continue;
      }

      const bound = LIMITS[field as NumericField];
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(num) || !Number.isInteger(num)) {
        rejected.push(key);
        continue;
      }
      if (bound && (num < bound.min || num > bound.max)) {
        rejected.push(key);
        continue;
      }
      (next as Record<NumericField, number>)[field as NumericField] = num;
    }

    this.config = next;
    this.persist();
    return { ok: rejected.length === 0, rejected };
  }

  /** Kembalikan semua field ke nilai env. */
  reset(): RuntimeConfig {
    this.config = {
      ...DEFAULTS,
      allowedChatIds: [...DEFAULTS.allowedChatIds],
      blockedSenderIds: [...DEFAULTS.blockedSenderIds],
    };
    this.persist();
    return this.get();
  }

  // ---- Prefix per chat ----

  listPrefixes(): Array<{ chatId: string; prefix: string }> {
    return this.store
      .keys()
      .filter((key) => key.startsWith(PREFIX_KEY))
      .map((key) => ({
        chatId: key.slice(PREFIX_KEY.length),
        prefix: String(this.store.get(key) ?? ''),
      }))
      .filter((entry) => entry.prefix.length > 0);
  }

  setPrefix(chatId: string, prefix: string): boolean {
    if (!isValidPrefix(prefix)) return false;
    this.store.set(`${PREFIX_KEY}${chatId}`, prefix, PREFIX_TTL_MS);
    return true;
  }

  clearPrefix(chatId: string): void {
    this.store.delete(`${PREFIX_KEY}${chatId}`);
  }

  resolvePrefix(chatId: string): string {
    const override = this.store.get(`${PREFIX_KEY}${chatId}`);
    return typeof override === 'string' && override ? override : this.config.commandPrefix;
  }

  private load(): void {
    const raw = this.store.get(CONFIG_KEY);
    if (!raw || typeof raw !== 'object') return;
    const stored = raw as Partial<RuntimeConfig>;
    // Gabung di atas default, bukan menimpa: field baru yang belum pernah
    // disimpan tidak boleh membuat config jadi undefined.
    this.config = {
      ...DEFAULTS,
      ...stored,
      allowedChatIds: Array.isArray(stored.allowedChatIds) ? stored.allowedChatIds : [...DEFAULTS.allowedChatIds],
      blockedSenderIds: Array.isArray(stored.blockedSenderIds) ? stored.blockedSenderIds : [...DEFAULTS.blockedSenderIds],
    };
  }

  private persist(): void {
    // TTL 0 = permanen: konfigurasi harus bertahan melewati restart.
    this.store.set(CONFIG_KEY, this.config, 0);
  }
}

// Prefix user-defined dibatasi umur supaya tidak tumbuh selamanya di bot-state.json.
// 90 hari jauh lebih lama dari lifecycle grup mana pun.
const PREFIX_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const runtimeConfig = new RuntimeConfigStore();