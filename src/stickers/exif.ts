// node-webpmux murni-JS (tanpa binary) untuk mux EXIF ke WebP.
const { Image: WebPImage } = require('node-webpmux');

export interface StickerPackInfo {
  packId?: string;
  packName?: string;
  publisher?: string;
  emojis?: string[];
}

const DEFAULT_PACK: Required<StickerPackInfo> = {
  packId: 'waha-sticker-bot',
  packName: 'WAHA Stiker',
  publisher: 'StickerBot',
  emojis: ['🤖'],
};

// EXIF UserComment ala stiker WhatsApp (tag 0x5741, tipe UNDEFINED).
export function buildStickerExif(info: StickerPackInfo = {}): Buffer {
  const merged = { ...DEFAULT_PACK, ...info };
  const json = {
    'sticker-pack-id': merged.packId,
    'sticker-pack-name': merged.packName,
    'sticker-pack-publisher': merged.publisher,
    emojis: merged.emojis,
  };
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf-8');
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00,
    0x00, 0x00,
  ]);
  header.writeUInt32LE(jsonBuf.length, 14);
  return Buffer.concat([Buffer.from('Exif\0\0', 'binary'), header, jsonBuf]);
}

// Sisipkan metadata pack ke webp statis. Animasi dilewati (re-encode
// menghilangkan frame animasi).
export async function addStickerExif(webp: Buffer, info: StickerPackInfo = {}): Promise<Buffer> {
  const img = new WebPImage();
  await img.load(webp);
  img.exif = buildStickerExif(info);
  const out = await img.save(null);
  return Buffer.from(out);
}
