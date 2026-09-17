import { RateLimiter, RateLimitResult } from './rate-limiter';
import env from '../config/env';

interface Bucket {
  count: number;
  windowStart: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs = 60_000;

  async consume(key: string, cost: number = 1): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart > this.windowMs) {
      this.buckets.set(key, { count: cost, windowStart: now });
      return { allowed: true, remaining: Math.max(0, this.getLimit(key) - cost), resetAt: now + this.windowMs };
    }

    const limit = this.getLimit(key);
    if (bucket.count + cost > limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.windowStart + this.windowMs };
    }

    bucket.count += cost;
    return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.windowStart + this.windowMs };
  }

  private getLimit(key: string): number {
    if (key.startsWith('group:')) return env.groupRateLimit;
    return env.userRateLimit;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart > this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}
