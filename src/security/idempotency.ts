import env from '../config/env';

interface IdempotencyEntry {
  processed: boolean;
  expiresAt: number;
}

export class IdempotencyGuard {
  private cache = new Map<string, IdempotencyEntry>();

  constructor(
    private readonly ttlMs: number = env.tempFileTtlSeconds * 1000,
    private readonly maxSize: number = 10_000
  ) {}

  isDuplicate(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return entry.processed;
  }

  markProcessed(key: string): void {
    this.evictExpired();
    if (this.cache.size >= this.maxSize) {
      const oldest = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt
      )[0]?.[0];
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { processed: true, expiresAt: Date.now() + this.ttlMs });
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }
}
