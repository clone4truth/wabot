import { describe, it, expect } from 'vitest';
import { validateMediaFile, validateFileSize, isAllowedOrigin } from '../../src/media/validator';
import fs from 'fs';

describe('validateMediaFile', () => {
  it('should validate JPEG signature', async () => {
    const tmpPath = '/tmp/test_jpeg_' + Date.now() + '.jpg';
    fs.writeFileSync(tmpPath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
    const result = await validateMediaFile(tmpPath, ['image/jpeg']);
    expect(result.valid).toBe(true);
    fs.unlinkSync(tmpPath);
  });

  it('should reject non-matching file', async () => {
    const tmpPath = '/tmp/test_invalid_' + Date.now() + '.tmp';
    fs.writeFileSync(tmpPath, Buffer.from([0x00, 0x00]));
    const result = await validateMediaFile(tmpPath, ['image/jpeg']);
    expect(result.valid).toBe(false);
    fs.unlinkSync(tmpPath);
  });
});

describe('validateFileSize', () => {
  it('should accept file under limit', () => {
    const tmpPath = '/tmp/test_size_' + Date.now() + '.bin';
    fs.writeFileSync(tmpPath, Buffer.alloc(100));
    expect(validateFileSize(tmpPath, 1000)).toBe(true);
    fs.unlinkSync(tmpPath);
  });

  it('should reject file over limit', () => {
    const tmpPath = '/tmp/test_size2_' + Date.now() + '.bin';
    fs.writeFileSync(tmpPath, Buffer.alloc(10000));
    expect(validateFileSize(tmpPath, 5000)).toBe(false);
    fs.unlinkSync(tmpPath);
  });
});

describe('isAllowedOrigin', () => {
  it('should allow same origin', () => {
    process.env.WAHA_BASE_URL = 'http://localhost:3001';
    expect(isAllowedOrigin('http://localhost:3001/api/files/test')).toBe(true);
  });

  it('should reject arbitrary URL', () => {
    process.env.WAHA_BASE_URL = 'http://localhost:3001';
    expect(isAllowedOrigin('http://evil.com/file')).toBe(false);
  });
});
