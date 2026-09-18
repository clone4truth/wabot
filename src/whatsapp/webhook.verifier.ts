import crypto from 'crypto';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export class WebhookVerifier {
  verify(body: string, signature: string): boolean {
    if (!env.wahaWebhookHmacKey) {
      return true;
    }
    const expected = crypto
      .createHmac('sha256', env.wahaWebhookHmacKey)
      .update(body)
      .digest('hex');

    const sig = signature.replace(/^sha256=/, '');

    if (sig.length !== expected.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return false;
    }
  }

  verifyBody(body: string, signature: string): void {
    if (!this.verify(body, signature)) {
      throw new AppError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
    }
  }

  validateBodySize(body: string, maxBytes: number = 1_048_576): void {
    if (Buffer.byteLength(body) > maxBytes) {
      throw new AppError(ErrorCode.INVALID_WEBHOOK_SIGNATURE, 'Webhook body too large');
    }
  }
}
