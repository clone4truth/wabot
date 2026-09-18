import { describe, it, expect } from 'vitest';
import { PerUserConcurrency } from '../../src/stickers/concurrency';

describe('PerUserConcurrency', () => {
  it('izinkan sampai batas, tolak selebihnya', () => {
    const limiter = new PerUserConcurrency(2);
    expect(limiter.tryAcquire('u')).toBe(true);
    expect(limiter.tryAcquire('u')).toBe(true);
    expect(limiter.tryAcquire('u')).toBe(false);
    expect(limiter.active).toBe(2);
  });

  it('release membuka slot lagi', () => {
    const limiter = new PerUserConcurrency(1);
    expect(limiter.tryAcquire('u')).toBe(true);
    expect(limiter.tryAcquire('u')).toBe(false);
    limiter.release('u');
    expect(limiter.tryAcquire('u')).toBe(true);
    expect(limiter.active).toBe(1);
  });

  it('key berbeda independen + release aman ganda', () => {
    const limiter = new PerUserConcurrency(1);
    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('b')).toBe(true);
    limiter.release('tak-ada');
    expect(limiter.active).toBe(2);
  });
});
