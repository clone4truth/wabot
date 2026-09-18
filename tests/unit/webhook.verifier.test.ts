import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { WebhookVerifier } from '../../src/whatsapp/webhook.verifier';
import { AppError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';
import env from '../../src/config/env';

// Format signature sesuai docs resmi WAHA:
// HMAC-SHA512 atas raw body -> header X-Webhook-Hmac.
const KEY = 'unit-test-hmac-key';
const BODY = JSON.stringify({ event: 'message', session: 'bot', payload: { id: 'm1' } });

describe('WebhookVerifier (format HMAC WAHA)', () => {
  const verifier = new WebhookVerifier();
  let savedKey: string;

  beforeAll(() => {
    savedKey = env.wahaWebhookHmacKey;
    env.wahaWebhookHmacKey = KEY;
  });

  afterAll(() => {
    env.wahaWebhookHmacKey = savedKey;
  });

  it('menerima sha512 yang valid', () => {
    const sig = crypto.createHmac('sha512', KEY).update(BODY).digest('hex');
    const result = verifier.verifyWaha(BODY, sig, 'sha512');
    expect(result.valid).toBe(true);
    expect(result.expected).toBe(sig);
  });

  it('menolak sha512 yang salah', () => {
    const result = verifier.verifyWaha(BODY, '0'.repeat(128), 'sha512');
    expect(result.valid).toBe(false);
    expect(result.expected).toHaveLength(128);
    expect(result.received).toBe('0'.repeat(128));
  });

  it('menolak panjang signature yang beda tanpa timingSafeEqual error', () => {
    const result = verifier.verifyWaha(BODY, 'abc', 'sha512');
    expect(result.valid).toBe(false);
  });

  it('mendukung algoritma lain (sha256)', () => {
    const sig = crypto.createHmac('sha256', KEY).update(BODY).digest('hex');
    expect(verifier.verifyWaha(BODY, sig, 'sha256').valid).toBe(true);
  });

  it('lolos bila HMAC key tidak diset', () => {
    env.wahaWebhookHmacKey = '';
    expect(verifier.verifyWaha(BODY, 'salah', 'sha512').valid).toBe(true);
    env.wahaWebhookHmacKey = KEY;
  });

  it('verifyBody melempar AppError INVALID_WEBHOOK_SIGNATURE saat tidak valid', () => {
    expect(() => verifier.verifyBody(BODY, 'salah')).toThrow(AppError);
    try {
      verifier.verifyBody(BODY, 'salah');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_WEBHOOK_SIGNATURE);
    }
  });

  it('kompatibel format sha256= (GitHub/Meta)', () => {
    const hex = crypto.createHmac('sha256', KEY).update(BODY).digest('hex');
    expect(verifier.verify(BODY, `sha256=${hex}`).valid).toBe(true);
    expect(verifier.verify(BODY, hex).valid).toBe(true);
    expect(verifier.verify(BODY, 'sha256=deadbeef').valid).toBe(false);
  });

  it('validateBodySize menolak body raksasa', () => {
    expect(() => verifier.validateBodySize('x'.repeat(1_048_577))).toThrow(AppError);
    expect(() => verifier.validateBodySize('kecil')).not.toThrow();
  });
});
