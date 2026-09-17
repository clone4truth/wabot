export interface StickerResult {
  buffer: Buffer;
  mimetype: 'image/webp';
  width: number;
  height: number;
  animated: boolean;
  size: number;
}

export function createStickerResult(
  buffer: Buffer,
  width: number,
  height: number,
  animated: boolean = false
): StickerResult {
  return {
    buffer,
    mimetype: 'image/webp',
    width,
    height,
    animated,
    size: buffer.length,
  };
}
