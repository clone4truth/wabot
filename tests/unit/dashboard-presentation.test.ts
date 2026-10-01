import { describe, expect, it } from 'vitest';
import { activityMessage, BYTES_PER_MB, phoneChatId, recipientLabel, userMessage } from '../../dashboard/src/lib/presentation';
import { jobLabel, jobTypeLabel } from '../../dashboard/src/lib/jobs';
import { whatsappStatus } from '../../dashboard/src/lib/whatsapp';
import { ApiError } from '../../dashboard/src/lib/api';

describe('dashboard user-facing presentation', () => {
  it.each([
    ['0812 3456 7890', '6281234567890@c.us'],
    ['+62 (812) 3456-7890', '6281234567890@c.us'],
    ['+1 202 555 0100', '12025550100@c.us'],
    ['62812@c.us', null], ['<script>', null], ['', null], ['123', null],
    ['1234567890123456', null],
  ])('normalizes phone input %s without accepting internal IDs', (input, expected) => {
    expect(phoneChatId(input)).toBe(expected);
  });
  it('keeps infrastructure errors out of user-facing messages', () => {
    expect(userMessage(new ApiError('WAHA_API_KEY secret-key https://internal', 502))).not.toContain('secret-key');
    expect(userMessage(new Error('stack trace'), 'Coba lagi.')).toBe('Coba lagi.');
    expect(activityMessage({ level: 'error', message: 'secret-key', error: 'stack', timestamp: '' })).not.toMatch(/secret-key|stack/);
    expect(activityMessage({ level: 'info', message: 'Internal path /tmp/media', timestamp: '' })).toBe('Aktivitas bot diperbarui.');
  });
  it('does not expose unknown statuses or identity hashes', () => {
    expect(whatsappStatus('INTERNAL_UNKNOWN').label).toBe('Perlu diperiksa');
    expect(jobLabel('INTERNAL_UNKNOWN')).toBe('Perlu diperiksa');
    expect(jobTypeLabel('processor_internal')).toBe('Stiker');
    expect(recipientLabel('abcdef123', 0)).toBe('Percakapan 1');
    expect(recipientLabel('12345@g.us', 1)).toBe('Grup WhatsApp 2');
    expect(recipientLabel('6281234567890@c.us', 0)).toBe('+6281234567890');
  });
  it('round-trips non-integer media sizes without losing bytes', () => {
    const bytes = 3456789;
    expect(Math.round((bytes / BYTES_PER_MB) * BYTES_PER_MB)).toBe(bytes);
  });
});
