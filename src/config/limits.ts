import env from './env';
import { runtimeConfig } from './runtime-config';

/**
 * Batas yang bisa berubah dari dashboard admin harus dibaca saat akses, bukan
 * di-snapshot saat module load — kalau di-copy sekali, perubahan dari dashboard
 * tidak berlaku sampai restart. Karena itu field yang runtime-disposable memakai
 * getter.
 */
export const limits = {
  text: {
    get maxChars(): number {
      return runtimeConfig.get().maxTextLength;
    },
  },
  image: {
    get maxBytes(): number {
      return runtimeConfig.get().maxImageBytes;
    },
  },
  video: {
    get maxBytes(): number {
      return runtimeConfig.get().maxVideoBytes;
    },
    maxDurationSec: env.maxVideoDurationSeconds,
  },
  processing: {
    textMs: env.textProcessingTimeoutMs,
    imageMs: env.imageProcessingTimeoutMs,
    videoMs: env.videoProcessingTimeoutMs,
  },
  canvas: { maxWidth: 512, maxHeight: 512 },
  tempFileRetentionMs: env.tempFileTtlSeconds * 1000,
};