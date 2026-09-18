import env from '../config/env';

// Pembatas konkurensi per user untuk job berat (video). In-memory saja:
// slot yang sedang berjalan tidak perlu selamat dari restart.
export class PerUserConcurrency {
  private readonly running = new Map<string, number>();

  constructor(private readonly max: number = env.videoConcurrencyPerUser) {}

  tryAcquire(key: string): boolean {
    const current = this.running.get(key) ?? 0;
    if (current >= this.max) return false;
    this.running.set(key, current + 1);
    return true;
  }

  release(key: string): void {
    const current = (this.running.get(key) ?? 1) - 1;
    if (current <= 0) this.running.delete(key);
    else this.running.set(key, current);
  }

  get active(): number {
    let total = 0;
    for (const n of this.running.values()) total += n;
    return total;
  }
}
