type EntryState = 'processing' | 'done';

interface Entry {
  state: EntryState;
  expiresAt: number;
}

// Idempotency in-memory dengan state:
// PROCESSING = sedang diproses (duplikat konkuren diabaikan),
// DONE = sukses (retry diabaikan), gagal = state dihapus agar boleh retry.
export class IdempotencyGuard {
  private cache = new Map<string, Entry>();

  constructor(
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
    private readonly maxSize: number = 10_000,
  ) {}

  private get(key: string): Entry | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry;
  }

  isDuplicate(key: string): boolean {
    return this.get(key) !== undefined;
  }

  isProcessing(key: string): boolean {
    return this.get(key)?.state === 'processing';
  }

  tryStart(key: string): boolean {
    this.evictExpired();
    const entry = this.cache.get(key);
    const now = Date.now();
    if (entry && now <= entry.expiresAt) {
      return false;
    }
    this.evictIfFull();
    this.cache.set(key, { state: 'processing', expiresAt: now + this.ttlMs });
    return true;
  }

  markProcessing(key: string): void {
    this.evictIfFull();
    this.cache.set(key, { state: 'processing', expiresAt: Date.now() + this.ttlMs });
  }

  markDone(key: string): void {
    this.cache.set(key, { state: 'done', expiresAt: Date.now() + this.ttlMs });
  }

  markFailed(key: string): void {
    this.cache.delete(key);
  }

  // Kompatibilitas: tandai langsung DONE (dipakai bila state rinci tak perlu).
  markProcessed(key: string): void {
    this.evictIfFull();
    this.cache.set(key, { state: 'done', expiresAt: Date.now() + this.ttlMs });
  }

  private evictIfFull(): void {
    this.evictExpired();
    if (this.cache.size < this.maxSize) return;
    const oldest = Array.from(this.cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]?.[0];
    if (oldest) this.cache.delete(oldest);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }

  get size(): number {
    return this.cache.size;
  }
}
