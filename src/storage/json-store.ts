import fs from 'fs';
import path from 'path';
import { logger } from '../observability/logger';

interface Entry {
  value: unknown;
  expiresAt: number;
}

// Key-value store file-JSON dengan snapshot atomik (tulis tmp + rename).
// Dipakai agar idempotency + rate-limit selamat dari restart container.
// Single-process: aman untuk 1 replika (sesuai arsitektur V1).
const registry = new Set<JsonFileStore>();
let signalsHooked = false;

function hookSignals(): void {
  if (signalsHooked) return;
  signalsHooked = true;
  const flushAll = () => {
    for (const store of registry) {
      try {
        store.flush();
      } catch {
        // best-effort saat shutdown
      }
    }
  };
  process.once('SIGTERM', () => {
    flushAll();
  });
  process.once('SIGINT', () => {
    flushAll();
  });
}

export class JsonFileStore {
  private data = new Map<string, Entry>();
  private readonly filePath: string;
  private saveTimer?: NodeJS.Timeout;

  constructor(
    dir: string,
    private readonly fileName: string = 'bot-state.json',
    private readonly saveDebounceMs: number = 500,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, fileName);
    this.load();
    registry.add(this);
    hookSignals();
  }

  get(key: string): unknown | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      this.scheduleSave();
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs: number = 0): void {
    this.data.set(key, { value, expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0 });
    this.scheduleSave();
  }

  delete(key: string): void {
    if (this.data.delete(key)) this.scheduleSave();
  }

  keys(): string[] {
    return Array.from(this.data.keys());
  }

  get size(): number {
    return this.data.size;
  }

  prune(): void {
    const now = Date.now();
    let removed = false;
    for (const [key, entry] of this.data) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.data.delete(key);
        removed = true;
      }
    }
    if (removed) this.scheduleSave();
  }

  flush(): void {
    const plain: Record<string, Entry> = {};
    for (const [key, entry] of this.data) plain[key] = entry;
    const tmpPath = `${this.filePath}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(plain));
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      logger.warn('Gagal menyimpan state ke disk', { file: this.filePath, error: String(err) });
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.flush();
    }, this.saveDebounceMs);
    this.saveTimer.unref?.();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, Entry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.expiresAt > 0 && now > entry.expiresAt) continue;
        this.data.set(key, { value: entry.value, expiresAt: entry.expiresAt || 0 });
      }
    } catch (err) {
      logger.warn('Gagal memuat state dari disk, mulai kosong', { file: this.filePath, error: String(err) });
    }
  }
}

const sharedStores = new Map<string, JsonFileStore>();

export function getSharedStore(dir: string): JsonFileStore {
  let store = sharedStores.get(dir);
  if (!store) {
    store = new JsonFileStore(dir);
    sharedStores.set(dir, store);
  }
  return store;
}
