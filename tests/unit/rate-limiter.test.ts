import { describe, it, expect } from 'vitest';
import { MemoryRateLimiter } from '../../src/security/memory-rate-limiter';

describe('MemoryRateLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = new MemoryRateLimiter();
    const result = await limiter.consume('user:123', 1);
    expect(result.allowed).toBe(true);
  });

  it('should block requests exceeding limit', async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 10; i++) {
      await limiter.consume('user:456', 1);
    }
    const result = await limiter.consume('user:456', 1);
    expect(result.allowed).toBe(false);
  });

  it('should use group limit for group keys', async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 40; i++) {
      await limiter.consume('group:789', 1);
    }
    const result = await limiter.consume('group:789', 1);
    expect(result.allowed).toBe(false);
  });
});
