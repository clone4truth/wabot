import sharp from 'sharp';
import env from '../config/env';
import { logger } from '../observability/logger';

/**
 * Opsi constructor Sharp yang WAJIB dipakai di setiap call site yang memproses
 * input dari user (media WAHA, avatar, background removal).
 *
 * Alasan: default Sharp adalah `limitInputPixels = 268_402_689` (~1.07 GB RGBA).
 * `downloadMedia` hanya membatasi BYTE, bukan PIKSEL — sticker WebP solid 16384x16384
 * hanya beberapa ratus KB sehingga lolos validasi lalu di-decode jadi ~1 GB.
 * Dengan batas ini, gambar bombs ditolak SEBELUM alokasi besar terjadi.
 */
export function sharpInputOptions(): sharp.SharpOptions {
  return { limitInputPixels: env.maxInputPixels, failOn: 'warning' };
}

/**
 * Batasi thread libvips per gambar.
 *
 * Default Sharp = `os.availableParallelism()`. Nilai ini HANYA diklem ke 1 pada
 * glibc tanpa jemalloc; image ini berbasis Alpine (musl) sehingga TIDAK diklem —
 * di mesin 4 core tiap operasi gambar memakai 4 thread, dan MAX_IMAGE_JOBS=4
 * + MAX_ANIMATION_JOBS=2 + MAX_BACKGROUND_JOBS=1 membuat total thread jauh
 * melampaui jumlah core sehingga event loop Node ikut terlahap.
 *
 * libaom tetap memakai thread sendiri yang independen dari nilai ini (terbatas 4).
 */
export function tuneSharpRuntime(): void {
  const requested = env.sharpConcurrency;
  const applied = sharp.concurrency(requested);
  sharp.cache({
    memory: env.sharpCacheMemoryMb,
    files: env.sharpCacheFiles,
    items: 100,
  });

  logger.info('Sharp runtime tuned', {
    concurrency: applied,
    cacheMemoryMb: env.sharpCacheMemoryMb,
    cacheFiles: env.sharpCacheFiles,
    maxInputPixels: env.maxInputPixels,
    uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? '(unset)',
  });
}