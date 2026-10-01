import { RateLimiter, RateLimitResult } from './rate-limiter';
import { runtimeConfig } from '../config/runtime-config';

interface Bucket {
  count: number;
  windowStart: number;
}

const SWEEP_INTERVAL_MS = 30_000;

/**
 * Rate limiter in-memory sesuai PRD V1 (tanpa database/Redis).
 *
 * PERF & KEAMANAN:
 *  - `buckets` dibatasi keras. Versi lama unbounded dan hanya hoping di-expire
 *    lewat scan; karena HMAC webhook opsional, `senderId`/`chatId` bisa
 *    dikendalikan penyerang sehingga map bisa digembungkan tanpa batas.
 *  - Sweep BERKALA, bukan per-request. Versi lama scan seluruh map di setiap
 *    `consume()` — dan `consume()` dipanggil DUA kali per webhook (user + group),
 *    jadi N key unik dalam satu jendela 60 detik berarti ~N^2/2 iterasi sinkron
 *    memblokir event loop.
 */
export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs = 60_000;
  private readonly maxBuckets: number;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(maxBuckets: number = 50_000) {
    this.maxBuckets = maxBuckets;
    this.sweepTimer = setInterval(() => this.cleanup(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  /**
   * Catat pemakaian kuota untuk `key`.
   *
   * `limitOverride` dipakai untuk bucket yang tidak mengikuti aturan
   * user/group (mis. percobaan login dashboard). Tanpa ini, limiter login
   * diam-diam memakai `USER_RATE_LIMIT` yang tidak terkait dengan maksudnya.
   */
  async consume(key: string, cost: number = 1, limitOverride?: number): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    const limit = limitOverride ?? this.getLimit(key);

    if (!bucket || now - bucket.windowStart > this.windowMs) {
      this.evictOneIfFull();
      this.buckets.set(key, { count: cost, windowStart: now });
      return { allowed: true, remaining: Math.max(0, limit - cost), resetAt: now + this.windowMs };
    }

    if (bucket.count + cost > limit) {
      return { allowed: false, remaining: 0, resetAt: bucket.windowStart + this.windowMs };
    }

    bucket.count += cost;
    return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.windowStart + this.windowMs };
  }

  /**
   * Hapus bucket sepenuhnya (hitungan kembali ke nol).
   *
   * JANGAN achieve ini dengan `consume(key, -N)`: itu membuat `count` negatif
   * dan membuat batas effectively tidak berlaku — setelah satu reset, penyerang
   * bisa menebak tanpa batas selama jendela masih aktif.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private getLimit(key: string): number {
    const cfg = runtimeConfig.get();
    return key.startsWith('group:') ? cfg.groupRateLimit : cfg.userRateLimit;
  }

  /** Sisa kuota yang masih bisa dipakai `key` pada jendela aktif. */
  remaining(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() - bucket.windowStart > this.windowMs) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, this.getLimit(key) - bucket.count);
  }

  cleanup(): void {
    this.evictExpired(Date.now());
  }

  /** Hentikan timer sweep (dipanggil saat shutdown). */
  stop(): void {
    clearInterval(this.sweepTimer);
  }

  private evictExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart > this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Jaga cap keras dengan membuang entri terlama (urutan insert) dalam O(1).
   * Dipakai hanya saat map penuh — tidak perlu scan.
   */
  private evictOneIfFull(): void {
    while (this.buckets.size >= this.maxBuckets) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) return;
      this.buckets.delete(oldest.value);
    }
  }
}