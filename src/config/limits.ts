import env from './env';

export const limits = {
  text: { maxChars: env.maxTextLength },
  image: { maxBytes: env.maxImageBytes },
  video: { maxBytes: env.maxVideoBytes, maxDurationSec: env.maxVideoDurationSeconds },
  processing: {
    textMs: env.textProcessingTimeoutMs,
    imageMs: env.imageProcessingTimeoutMs,
    videoMs: env.videoProcessingTimeoutMs,
  },
  canvas: { maxWidth: 512, maxHeight: 512 },
  tempFileRetentionMs: env.tempFileTtlSeconds * 1000,
} as const;
