import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMessageTime, normalizeMessageTimestamp } from '../../src/whatsapp/message-time';

const milliseconds = Date.parse('2026-10-08T06:19:00Z');

afterEach(() => vi.unstubAllEnvs());

describe('original WhatsApp message time', () => {
  it('normalizes WAHA seconds and engine milliseconds to the same instant', () => {
    expect(normalizeMessageTimestamp(milliseconds / 1000)).toBe(milliseconds);
    expect(normalizeMessageTimestamp(milliseconds)).toBe(milliseconds);
    expect(formatMessageTime(milliseconds / 1000, 'Asia/Jakarta')).toBe('13:19');
    expect(formatMessageTime(milliseconds, 'Asia/Jakarta')).toBe('13:19');
  });

  it('defaults to Asia/Jakarta independently of the server timezone', () => {
    vi.stubEnv('TZ', '');
    expect(formatMessageTime(milliseconds)).toBe('13:19');
  });

  it('honors a configured timezone and uses a 00–23 hour clock', () => {
    vi.stubEnv('TZ', 'UTC');
    expect(formatMessageTime(milliseconds)).toBe('06:19');
    expect(formatMessageTime(Date.parse('2026-10-08T00:04:00Z'))).toBe('00:04');
    expect(formatMessageTime(Date.parse('2026-10-08T17:04:00Z'), 'Asia/Jakarta')).toBe('00:04');
  });

  it('falls back to Jakarta for an invalid timezone setting', () => {
    vi.stubEnv('TZ', 'not-a-timezone');
    expect(formatMessageTime(milliseconds)).toBe('13:19');
  });

  it.each([undefined, null, 0, -1, NaN, Infinity, Number.MAX_VALUE, 'yesterday'])('keeps unknown or invalid timestamp %s unknown', (value) => {
    expect(normalizeMessageTimestamp(value)).toBeUndefined();
    expect(formatMessageTime(value)).toBe('--:--');
  });
});
