import { ErrorCode } from './error-codes';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly userMessage?: string;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, userMessage?: string) {
    super(message);
    this.code = code;
    this.details = details;
    this.userMessage =
      userMessage ??
      (typeof details?.userMessage === 'string'
        ? details.userMessage
        : (message.startsWith('❌') || message.startsWith('⏳') || message.startsWith('⚠️') ? message : undefined));
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

