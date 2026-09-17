import { describe, it, expect } from 'vitest';
import { ErrorCode } from '../../src/errors/error-codes';
import { AppError } from '../../src/errors/app-error';

describe('ErrorCode', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCode.INVALID_COMMAND).toBe('INVALID_COMMAND');
    expect(ErrorCode.UNSUPPORTED_INPUT).toBe('UNSUPPORTED_INPUT');
    expect(ErrorCode.TEXT_TOO_LONG).toBe('TEXT_TOO_LONG');
    expect(ErrorCode.MEDIA_TOO_LARGE).toBe('MEDIA_TOO_LARGE');
    expect(ErrorCode.VIDEO_TOO_LONG).toBe('VIDEO_TOO_LONG');
    expect(ErrorCode.PROCESSING_TIMEOUT).toBe('PROCESSING_TIMEOUT');
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ErrorCode.WAHA_SEND_FAILED).toBe('WAHA_SEND_FAILED');
    expect(ErrorCode.INVALID_WEBHOOK_SIGNATURE).toBe('INVALID_WEBHOOK_SIGNATURE');
  });
});

describe('AppError', () => {
  it('should create error with code and message', () => {
    const err = new AppError(ErrorCode.TEXT_TOO_LONG, 'Teks terlalu panjang');
    expect(err.code).toBe(ErrorCode.TEXT_TOO_LONG);
    expect(err.message).toBe('Teks terlalu panjang');
  });
});
