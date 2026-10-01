import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import env from '../config/env';
import { logger } from '../observability/logger';

export function createTempFile(suffix: string = '.tmp'): string {
  const dir = env.tempDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}${suffix}`;
  return path.join(dir, filename);
}

export function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn('Failed to cleanup temp file', { error: String(err) });
  }
}

export function scheduleCleanup(filePath: string, ttlMs: number = env.tempFileTtlSeconds * 1000): void {
  const timer = setTimeout(() => cleanupTempFile(filePath), ttlMs);
  // Tanpa unref, tiap pemanggilan menahan handle timer beserta closure-nya
  // selama TTL penuh (300 detik default) — timer menumpuk sebanding dengan traffic.
  timer.unref?.();
}

/**
 * Hapus file yatim di direktori temp.
 *
 * Recursive karena `togif.processor` membuat subdirektori kerja per job
 * (`togif-<uuid>/`) berisi satu PNG per frame. Semuanya ikut terhapus di sini.
 */
export function cleanupOrphanFiles(maxAgeMs: number = env.tempFileTtlSeconds * 1000): void {
  const now = Date.now();
  for (const dir of [env.tempDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      sweepPath(path.join(dir, entry), now, maxAgeMs);
    }
  }
}

function sweepPath(target: string, now: number, maxAgeMs: number): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return;
  }

  // Bulat ke atas supaya file di dalam subdirektori yang baru saja dihapus
  // ikut terpilih, bukan hanya direktori itu sendiri.
  if (now - Math.max(stat.mtimeMs, stat.ctimeMs) <= maxAgeMs) return;

  try {
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }
  } catch {
    // best-effort: file mungkin sedang dipakai proses lain
  }
}
