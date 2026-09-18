import { URL } from 'url';
import fetch from 'node-fetch';
import fs from 'fs';
import { logger } from '../observability/logger';
import env from '../config/env';
import { validateMediaFile, isAllowedOrigin } from './validator';
import { createTempFile, scheduleCleanup } from './temp-files';

export interface DownloadResult {
  filePath: string;
  mimeType: string;
  size: number;
}

export async function downloadMedia(mediaUrl: string): Promise<DownloadResult> {
  const resolvedUrl = resolveMediaUrl(mediaUrl);
  if (!isAllowedOrigin(resolvedUrl)) {
    throw new Error(`SSRF violation: URL not allowed (${redactUrl(resolvedUrl)})`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetch(resolvedUrl, { signal: controller.signal });
  } catch (err) {
    throw new Error(`Failed to download media: ${String(err)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = await response.buffer();

  if (buffer.length > env.maxImageBytes && buffer.length > env.maxVideoBytes) {
    throw new Error('Downloaded media exceeds size limit');
  }

  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
    : contentType.includes('png') ? '.png'
    : contentType.includes('webp') ? '.webp'
    : contentType.includes('mp4') || contentType.includes('video') ? '.mp4' : '.bin';

  const filePath = createTempFile(ext);
  await fs.promises.writeFile(filePath, buffer);

  const valid = await validateMediaFile(filePath, [
    'image/jpeg', 'image/png', 'image/webp', 'video/mp4'
  ]);

  if (!valid.valid) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw new Error('Downloaded file content validation failed');
  }

  scheduleCleanup(filePath);
  logger.info('Media downloaded', { filePath, mimeType: contentType, size: buffer.length });

  return { filePath, mimeType: contentType, size: buffer.length };
}

// WAHA sering mengisi media.url dengan host lokalnya sendiri
// (mis. http://localhost:3000/api/files/...) yang tidak bisa dijangkau
// dari container bot. Tukar origin-nya ke WAHA_BASE_URL yang publik.
export function resolveMediaUrl(mediaUrl: string): string {
  try {
    const parsed = new URL(mediaUrl);
    if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
      const base = new URL(env.wahaBaseUrl);
      parsed.protocol = base.protocol;
      parsed.host = base.host;
      parsed.port = base.port;
      return parsed.toString();
    }
    return mediaUrl;
  } catch {
    return mediaUrl;
  }
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '(invalid url)';
  }
}
