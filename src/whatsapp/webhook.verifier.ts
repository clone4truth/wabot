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
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
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
