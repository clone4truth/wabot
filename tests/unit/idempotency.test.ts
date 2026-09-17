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
});
