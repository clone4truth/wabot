import env from '../config/env';
import { JsonFileStore, getSharedStore } from '../storage/json-store';

export class IdempotencyGuard {
  private readonly store: JsonFileStore;

  constructor(
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
    private readonly maxSize: number = 10_000,
    store?: JsonFileStore,
  ) {
    this.store = store ?? getSharedStore(env.dataDir);
  }

  private namespaced(key: string): string {
    return `idem:${key}`;
  }

  isDuplicate(key: string): boolean {
    return this.store.get(this.namespaced(key)) === true;
  }

  markProcessed(key: string): void {
    this.evictIfFull();
    this.store.set(this.namespaced(key), true, this.ttlMs);
  }

  private evictIfFull(): void {
    const keys = this.store.keys().filter((k) => k.startsWith('idem:'));
    if (keys.length < this.maxSize) return;
    // Hapus yang kedaluwarsa dulu, lalu yang tertua bila masih penuh.
    this.store.prune();
    const remaining = this.store.keys().filter((k) => k.startsWith('idem:'));
    for (let i = 0; i <= remaining.length - this.maxSize; i++) {
      this.store.delete(remaining[i]);
    }
  }

  get size(): number {
    return this.store.keys().filter((k) => k.startsWith('idem:')).length;
  }

  flush(): void {
    this.store.flush();
  }
}
