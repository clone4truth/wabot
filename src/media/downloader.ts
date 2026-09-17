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
  if (!isAllowedOrigin(mediaUrl)) {
    throw new Error('SSRF violation: URL not allowed');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const response = await fetch(mediaUrl, { signal: controller.signal });
  clearTimeout(timeout);

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
