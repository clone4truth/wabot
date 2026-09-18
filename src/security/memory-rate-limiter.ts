import { RateLimiter, RateLimitResult } from './rate-limiter';
import env from '../config/env';
import { JsonFileStore, getSharedStore } from '../storage/json-store';

interface Bucket {
  count: number;
  windowStart: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly store: JsonFileStore;
  private readonly windowMs = 60_000;

  constructor(store?: JsonFileStore) {
    this.store = store ?? getSharedStore(env.dataDir);
  }

  async consume(key: string, cost: number = 1): Promise<RateLimitResult> {
    const now = Date.now();
    const storeKey = `rate:${key}`;
    const bucket = this.store.get(storeKey) as Bucket | undefined;

    if (!bucket || now - bucket.windowStart > this.windowMs) {
      const fresh = { count: cost, windowStart: now };
      this.store.set(storeKey, fresh, this.windowMs);
      return { allowed: true, remaining: Math.max(0, this.getLimit(key) - cost), resetAt: now + this.windowMs };
    }

    const limit = this.getLimit(key);
    if (bucket.count + cost > limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.windowStart + this.windowMs };
    }

    const updated = { count: bucket.count + cost, windowStart: bucket.windowStart };
    this.store.set(storeKey, updated, Math.max(0, bucket.windowStart + this.windowMs - now));
    return { allowed: true, remaining: Math.max(0, limit - updated.count), resetAt: bucket.windowStart + this.windowMs };
  }

  private getLimit(key: string): number {
    if (key.startsWith('group:')) return env.groupRateLimit;
    return env.userRateLimit;
  }

  cleanup(): void {
    this.store.prune();
  }

  flush(): void {
    this.store.flush();
  }
}
