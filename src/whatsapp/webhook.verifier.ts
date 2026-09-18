import crypto from 'crypto';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export class WebhookVerifier {
  verify(body: string, signature: string): { valid: boolean; expected?: string; received?: string } {
    if (!env.wahaWebhookHmacKey) {
      return { valid: true };
    }
    const expected = crypto
      .createHmac('sha256', env.wahaWebhookHmacKey)
      .update(body)
      .digest('hex');

    const sig = signature.replace(/^sha256=/, '');

    if (sig.length !== expected.length) {
      return { valid: false, expected, received: sig };
    }

    try {
      const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
      return { valid, expected, received: sig };
    } catch {
      return { valid: false, expected, received: sig };
    }
  }

  verifyBody(body: string, signature: string): void {
    const result = this.verify(body, signature);
    if (!result.valid) {
      throw new AppError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
    }
  }

  validateBodySize(body: string, maxBytes: number = 1_048_576): void {
    if (Buffer.byteLength(body) > maxBytes) {
      throw new AppError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Webhook body too large');
    }
  }
}
