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
  setTimeout(() => cleanupTempFile(filePath), ttlMs);
}

export function cleanupOrphanFiles(maxAgeMs: number = env.tempFileTtlSeconds * 1000): void {
  const dir = env.tempDir;
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // skip
    }
  }
}
