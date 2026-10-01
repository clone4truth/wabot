type EntryState = 'processing' | 'done';

interface Entry {
  state: EntryState;
  expiresAt: number;
}

// Idempotency in-memory dengan state:
// PROCESSING = sedang diproses (duplikat konkuren diabaikan),
// DONE = sukses (retry diabaikan), gagal = state dihapus agar boleh retry.
//
// PERF: peta ini dibaca pada hot path setiap webhook, jadi tidak boleh ada
// sorting atau linear-scan O(n) per request. Map JS mempertahankan urutan
// insert, sehingga evict-oldest cukup O(1) lewat iterator.
export class IdempotencyGuard {
  private cache = new Map<string, Entry>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
    private readonly maxSize: number = 10_000,
  ) {
    // Sweep BERKALA, bukan per-request. Versi lama memanggil evictExpired() +
    // sort 10.000 entry di setiap `tryStart()`, padahal TTL 24 jam hampir tidak
    // pernah membuat entry kedaluwarsa — jadi itu pajak permanen yang tidak perlu.
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

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
    const entry = this.get(key);
    if (entry) return false;
    this.evictIfFull();
    this.cache.set(key, { state: 'processing', expiresAt: Date.now() + this.ttlMs });
    return true;
  }

  markProcessing(key: string): void {
    this.evictIfFull();
    this.cache.set(key, { state: 'processing', expiresAt: Date.now() + this.ttlMs });
  }

  markDone(key: string): void {
    this.evictIfFull();
    this.cache.set(key, { state: 'done', expiresAt: Date.now() + this.ttlMs });
  }

  markFailed(key: string): void {
    this.cache.delete(key);
  }

  // Kompatibilitas: tandai langsung DONE (dipakai bila state rinci tak perlu).
  markProcessed(key: string): void {
    this.markDone(key);
  }

  /** Hentikan timer sweep (dipanggil saat shutdown). */
  stop(): void {
    clearInterval(this.sweepTimer);
  }

  /**
   * Jaga cap keras. Kalau cache penuh, buang entri paling tua.
   *
   * Versi lama memakai `Array.from(cache.entries()).sort(...)[0]` — itu
   * O(n log n) plus ~600 KB garbage per request, dan hanya dipakai untuk
   * mengambil SATU nilai minimum. Map sudah urut selon insert, jadi
   * `keys().next().value` memberi entri terlama dalam O(1) tanpa alokasi.
   */
  private evictIfFull(): void {
    while (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next();
      if (oldest.done) return;
      this.cache.delete(oldest.value);
    }
  }

  /** Buang entry kedaluwarsa. Dipanggil dari timer, bukan dari request path. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

const SWEEP_INTERVAL_MS = 60_000;