import { describe, it, expect } from 'vitest';
import { createStickerResult } from '../../src/stickers/result';

describe('StickerResult', () => {
  it('should create valid sticker result', () => {
    const buffer = Buffer.from('test');
    const result = createStickerResult(buffer, 512, 512, false);
    expect(result.buffer).toBe(buffer);
    expect(result.mimetype).toBe('image/webp');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.animated).toBe(false);
    expect(result.size).toBe(4);
  });
});
