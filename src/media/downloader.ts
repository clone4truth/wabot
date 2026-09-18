import { URL } from 'url';
import crypto from 'crypto';
import path from 'path';
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

function cacheDir(): string {
  const dir = path.join(env.dataDir, 'media-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheKey(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

interface CacheMeta {
  ext: string;
  mimetype: string;
  expiresAt: number;
}

function readMediaCache(url: string): DownloadResult | null {
  try {
    const key = cacheKey(url);
    const dir = cacheDir();
    const metaPath = path.join(dir, `${key}.json`);
    const dataPath = path.join(dir, `${key}.bin`);
    if (!fs.existsSync(metaPath) || !fs.existsSync(dataPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CacheMeta;
    if (!meta || Date.now() > meta.expiresAt) {
      fs.unlinkSync(metaPath);
      fs.unlinkSync(dataPath);
      return null;
    }
    // Salin ke temp file agar lifecycle cleanup pemanggil tidak menghapus cache.
    const filePath = createTempFile(meta.ext || '.bin');
    fs.copyFileSync(dataPath, filePath);
    scheduleCleanup(filePath);
    const stat = fs.statSync(filePath);
    logger.info('Media cache hit', { size: stat.size });
    return { filePath, mimeType: meta.mimetype, size: stat.size };
  } catch {
    return null;
  }
}

function writeMediaCache(url: string, buffer: Buffer, mimetype: string, ext: string): void {
  try {
    const dir = cacheDir();
    const key = cacheKey(url);
    fs.writeFileSync(path.join(dir, `${key}.bin`), buffer);
    const meta: CacheMeta = { ext, mimetype, expiresAt: Date.now() + env.mediaCacheTtlSeconds * 1000 };
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(meta));
    pruneMediaCache(dir);
  } catch (err) {
    logger.warn('Gagal menulis media cache', { error: String(err) });
  }
}

function pruneMediaCache(dir: string): void {
  try {
    const bins = fs.readdirSync(dir).filter((f) => f.endsWith('.bin'));
    let total = 0;
    const entries = bins.map((f) => {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      total += stat.size;
      return { path: p, meta: p.replace(/\.bin$/, '.json'), size: stat.size, mtime: stat.mtimeMs };
    });
    if (total <= env.mediaCacheMaxBytes) return;
    entries.sort((a, b) => a.mtime - b.mtime);
    for (const entry of entries) {
      if (total <= env.mediaCacheMaxBytes) break;
      try {
        fs.unlinkSync(entry.path);
        if (fs.existsSync(entry.meta)) fs.unlinkSync(entry.meta);
        total -= entry.size;
      } catch {
        // lanjut
      }
    }
  } catch {
    // cache opsional, jangan gagalkan download
  }
}

export async function downloadMedia(mediaUrl: string): Promise<DownloadResult> {
  const resolvedUrl = resolveMediaUrl(mediaUrl);
  if (!isAllowedOrigin(resolvedUrl)) {
    throw new Error(`SSRF violation: URL not allowed (${redactUrl(resolvedUrl)})`);
  }

  const cached = readMediaCache(resolvedUrl);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    // File media di-host WAHA (/api/files/...) dan butuh API key.
    response = await fetch(resolvedUrl, {
      signal: controller.signal,
      headers: { 'X-Api-Key': env.wahaApiKey },
    });
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
  writeMediaCache(resolvedUrl, buffer, contentType, ext);

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
