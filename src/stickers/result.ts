export interface StickerResult {
  buffer: Buffer;
  mimetype: 'image/webp';
  width: number;
  height: number;
  animated: boolean;
  size: number;
}

export interface ImageResult {
  buffer: Buffer;
  mimetype: 'image/png';
  width: number;
  height: number;
  animated: false;
  size: number;
}

export interface VideoResult {
  buffer: Buffer;
  mimetype: 'video/mp4';
  width: number;
  height: number;
  animated: true;
  size: number;
}

export type ProcessingResult = StickerResult | ImageResult | VideoResult;

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
