import fs from 'fs';
import { logger } from '../observability/logger';
import env from '../config/env';
import Sharp from 'sharp';

const MIME_SIGNATURES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
  'image/png': Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

// Cukup 12 byte untuk semua signature di bawah (magic PNG 8 byte, box 'ftyp' 4-8).
const MAGIC_PROBE_BYTES = 12;

export async function validateMediaFile(
  filePath: string,
  expectedMimeTypes: string[]
): Promise<{ valid: boolean; detectedMime?: string }> {
  let handle: fs.promises.FileHandle | undefined;
  try {
    // Baca HANYA 12 byte. `readFile` di sini akan menarik seluruh file (sampai
    // 20 MB) ke heap padahal yang dicek cuma 8 byte magic — dikalikan 4 slot
    // image yang sedang jalan, itu ~80 MB sia-sia.
    handle = await fs.promises.open(filePath, 'r');
    const probe = Buffer.alloc(MAGIC_PROBE_BYTES);
    const { bytesRead } = await handle.read(probe, 0, MAGIC_PROBE_BYTES, 0);

    for (const mime of expectedMimeTypes) {
      if (mime === 'video/mp4') {
        // Box 'ftyp' MP4 ada di offset 4, bukan 0.
        if (bytesRead > 8 && probe.subarray(4, 8).toString() === 'ftyp') {
          return { valid: true, detectedMime: mime };
        }
        continue;
      }
      const sig = MIME_SIGNATURES[mime];
      if (sig && bytesRead >= sig.length && probe.subarray(0, sig.length).equals(sig)) {
        return { valid: true, detectedMime: mime };
      }
    }
    return { valid: false };
  } catch (err) {
    logger.warn('Media validation failed', { error: String(err) });
    return { valid: false };
  } finally {
    // File descriptor harus selalu ditutup, termasuk saat throw.
    await handle?.close().catch(() => {});
  }
}

export function validateFileSize(filePath: string, maxBytes: number): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.size <= maxBytes;
  } catch {
    return false;
  }
}

export async function validateImageContent(filePath: string): Promise<boolean> {
  try {
    // `.metadata()` hanya membaca header. Batas piksel sesungguhnya ditegakkan
    // di call site decode (sharpInputOptions).
    const metadata = await Sharp(filePath, { limitInputPixels: env.maxInputPixels }).metadata();
    return metadata.width !== undefined && metadata.height !== undefined;
  } catch {
    return false;
  }
}

export function isAllowedOrigin(url: string): boolean {
  try {
    const candidate = new URL(url);
    const allowed = new URL(env.wahaBaseUrl);
    // Exact origin: scheme + hostname + port harus sama persis.
    return candidate.origin === allowed.origin;
  } catch {
    return false;
  }
}
