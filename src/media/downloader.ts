import { URL } from 'url';
import fetch, { Response } from 'node-fetch';
import fs from 'fs';
import { logger } from '../observability/logger';
import env from '../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { validateMediaFile, isAllowedOrigin } from './validator';
import { createTempFile, scheduleCleanup } from './temp-files';

export interface DownloadResult {
  filePath: string;
  mimeType: string;
  size: number;
}

export interface DownloadOptions {
  /** Timeout maksimum untuk keseluruhan download (ms). Default: FETCH_TIMEOUT_MS. */
  timeoutMs?: number;
  /** AbortSignal dari caller untuk cancellation segera. */
  signal?: AbortSignal;
}


const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;

function assertHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`SSRF violation: invalid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`SSRF violation: scheme not allowed (${parsed.protocol})`);
  }
  return parsed;
}

// Fetch manual agar setiap redirect ikut divalidasi exact WAHA origin allowlist (tidak buta
// mengikuti redirect ke host external/attacker).
async function fetchValidated(
  url: string,
  opts: { timeoutMs: number; signal?: AbortSignal },
  remaining: number = MAX_REDIRECTS,
): Promise<Response> {
  assertHttpUrl(url);
  if (!isAllowedOrigin(url)) {
    throw new Error(`SSRF violation: URL not allowed (${redactUrl(url)})`);
  }
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs;

  // Merge caller signal: bila caller abort → abort download
  let externalHandler: (() => void) | undefined;
  if (opts.signal && !opts.signal.aborted) {
    externalHandler = () => controller.abort();
    opts.signal.addEventListener('abort', externalHandler, { once: true });
  } else if (opts.signal?.aborted) {
    controller.abort();
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'X-Api-Key': env.wahaApiKey },
    });
    if (response.status >= 300 && response.status < 400) {
      if (remaining <= 0) throw new Error('Too many redirects');
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect tanpa Location');
      await response.arrayBuffer().catch(() => {});
      return fetchValidated(new URL(location, url).toString(), opts, remaining - 1);
    }
    return response;
  } catch (err) {
    if (err instanceof Error && /SSRF|redirect/i.test(err.message)) throw err;
    throw new Error(`Failed to download media: ${String(err)}`);
  } finally {
    clearTimeout(timeout);
    if (externalHandler && opts.signal) {
      opts.signal.removeEventListener('abort', externalHandler);
    }
  }
}

// Baca body dengan batas byte aktual (jangan percaya Content-Length saja).
async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const body = response.body;
  if (!body) throw new Error('Empty response body');
  for await (const chunk of body as any) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new AppError(ErrorCode.MEDIA_TOO_LARGE, 'Downloaded media exceeds size limit');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function downloadMedia(mediaUrl: string, options?: DownloadOptions): Promise<DownloadResult> {
  const resolvedUrl = resolveMediaUrl(mediaUrl);
  const effectiveTimeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const response = await fetchValidated(resolvedUrl, {
    timeoutMs: Math.min(effectiveTimeoutMs, FETCH_TIMEOUT_MS * 3), // cap at 45s
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  // Batas streaming = yang terbesar agar tipe terdeteksi dulu dari magic bytes;
  // batas spesifik tipe ditegakkan setelah magic terdeteksi.
  const streamCap = Math.max(env.maxImageBytes, env.maxVideoBytes);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > streamCap) {
    throw new AppError(ErrorCode.MEDIA_TOO_LARGE, 'Downloaded media exceeds size limit');
  }

  const buffer = await readLimited(response, streamCap);

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

  // Tegakkan limit spesifik tipe media aktual (bukan declared).
  const typeCap = valid.detectedMime?.startsWith('video')
    ? env.maxVideoBytes
    : env.maxImageBytes;
  if (buffer.length > typeCap) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw new AppError(ErrorCode.MEDIA_TOO_LARGE, 'Downloaded media exceeds size limit');
  }

  scheduleCleanup(filePath);
  logger.info('Media downloaded', { mimeType: contentType, size: buffer.length });

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
