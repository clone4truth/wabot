import { describe, it, expect } from 'vitest';
import { IdempotencyGuard } from '../../src/security/idempotency';

describe('IdempotencyGuard', () => {
  it('should detect duplicate', async () => {
    const guard = new IdempotencyGuard(60000, 100);
    guard.markProcessed('msg-1');
    expect(guard.isDuplicate('msg-1')).toBe(true);
  });

  it('should not detect non-existent key', () => {
    const guard = new IdempotencyGuard();
    expect(guard.isDuplicate('msg-2')).toBe(false);
  });

  it('should return false after TTL expires', async () => {
    const guard = new IdempotencyGuard(10);
    guard.markProcessed('msg-3');
    await new Promise(r => setTimeout(r, 20));
    expect(guard.isDuplicate('msg-3')).toBe(false);
  });

  describe('tryStart (atomic check + set)', () => {
    it('panggilan pertama -> true (state processing)', () => {
      const guard = new IdempotencyGuard();
      expect(guard.tryStart('key-1')).toBe(true);
      expect(guard.isProcessing('key-1')).toBe(true);
    });

    it('panggilan kedua langsung -> false (mencegah concurrent execution)', () => {
      const guard = new IdempotencyGuard();
      expect(guard.tryStart('key-2')).toBe(true);
      expect(guard.tryStart('key-2')).toBe(false);
    });

    it('setelah markDone -> false (tidak boleh diproses ulang)', () => {
      const guard = new IdempotencyGuard();
      expect(guard.tryStart('key-3')).toBe(true);
      guard.markDone('key-3');
      expect(guard.tryStart('key-3')).toBe(false);
    });

    it('setelah markFailed -> true (retry diizinkan)', () => {
      const guard = new IdempotencyGuard();
      expect(guard.tryStart('key-4')).toBe(true);
      guard.markFailed('key-4');
      expect(guard.tryStart('key-4')).toBe(true);
    });

    it('setelah TTL kedaluwarsa -> true (boleh dimulai lagi)', async () => {
      const guard = new IdempotencyGuard(15);
      expect(guard.tryStart('key-5')).toBe(true);
      await new Promise((r) => setTimeout(r, 25));
      expect(guard.tryStart('key-5')).toBe(true);
    });
  });
});
