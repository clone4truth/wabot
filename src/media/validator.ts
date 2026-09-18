import fs from 'fs';
import { logger } from '../observability/logger';
import env from '../config/env';
import Sharp from 'sharp';

const MIME_SIGNATURES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
  'image/png': Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

export async function validateMediaFile(
  filePath: string,
  expectedMimeTypes: string[]
): Promise<{ valid: boolean; detectedMime?: string }> {
  try {
    const buffer = await fs.promises.readFile(filePath);
    for (const mime of expectedMimeTypes) {
      const sig = MIME_SIGNATURES[mime];
      if (sig && buffer.slice(0, sig.length).equals(sig)) {
        return { valid: true, detectedMime: mime };
      }
    }
    return { valid: false };
  } catch (err) {
    logger.warn('Media validation failed', { filePath, error: String(err) });
    return { valid: false };
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
    const metadata = await Sharp(filePath).metadata();
    return metadata.width !== undefined && metadata.height !== undefined;
  } catch {
    return false;
  }
}

export function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Bandingkan hostname (tanpa port): .host ikut menyertakan port sehingga
    // perbandingan lama selalu gagal untuk URL ber-port.
    const allowedHostname = new URL(env.wahaBaseUrl).hostname;
    return (
      parsed.hostname === allowedHostname ||
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}
