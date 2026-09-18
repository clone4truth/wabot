import env from '../config/env';

export enum ErrorCode {
  INVALID_COMMAND = 'INVALID_COMMAND',
  UNSUPPORTED_INPUT = 'UNSUPPORTED_INPUT',
  TEXT_TOO_LONG = 'TEXT_TOO_LONG',
  MEDIA_TOO_LARGE = 'MEDIA_TOO_LARGE',
  VIDEO_TOO_LONG = 'VIDEO_TOO_LONG',
  MEDIA_DOWNLOAD_FAILED = 'MEDIA_DOWNLOAD_FAILED',
  MEDIA_DECODE_FAILED = 'MEDIA_DECODE_FAILED',
  PROCESSING_TIMEOUT = 'PROCESSING_TIMEOUT',
  VIDEO_BUSY = 'VIDEO_BUSY',
  RATE_LIMITED = 'RATE_LIMITED',
  WAHA_SEND_FAILED = 'WAHA_SEND_FAILED',
  INVALID_WEBHOOK_SIGNATURE = 'INVALID_WEBHOOK_SIGNATURE',
  MEDIA_NOT_AVAILABLE = 'MEDIA_NOT_AVAILABLE',
  UNSUPPORTED_STICKER_TYPE = 'UNSUPPORTED_STICKER_TYPE',
  TEMP_FILE_CLEANUP_FAILED = 'TEMP_FILE_CLEANUP_FAILED',
  INVALID_MODIFIER_INPUT = 'INVALID_MODIFIER_INPUT',
  MODIFIER_REQUIRES_IMAGE = 'MODIFIER_REQUIRES_IMAGE',
  MODIFIER_REQUIRES_TEXT = 'MODIFIER_REQUIRES_TEXT',
  FEATURE_DISABLED = 'FEATURE_DISABLED',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
}

export const userMessages: Record<ErrorCode, string> = {
  [ErrorCode.INVALID_COMMAND]: '❌ Perintah tidak dikenal. Gunakan !menu untuk daftar command.',
  [ErrorCode.UNSUPPORTED_INPUT]: '❌ Reply teks, foto, video, atau sticker yang didukung.',
  [ErrorCode.TEXT_TOO_LONG]: '❌ Teks terlalu panjang.',
  [ErrorCode.MEDIA_TOO_LARGE]: '❌ Ukuran media terlalu besar.',
  [ErrorCode.VIDEO_TOO_LONG]: '❌ Video terlalu panjang.',
  [ErrorCode.MEDIA_DOWNLOAD_FAILED]: '❌ Gagal mengunduh media dari WAHA.',
  [ErrorCode.MEDIA_DECODE_FAILED]: '❌ Format media tidak didukung atau rusak.',
  [ErrorCode.PROCESSING_TIMEOUT]: '⏳ Proses stiker melebihi batas waktu. Coba lagi.',
  [ErrorCode.VIDEO_BUSY]: '⏳ Videomu masih diproses. Tunggu sebentar lalu coba lagi.',
  [ErrorCode.RATE_LIMITED]: '⏳ Terlalu banyak permintaan. Coba lagi beberapa saat.',
  [ErrorCode.WAHA_SEND_FAILED]: '❌ Gagal mengirim stiker ke WAHA.',
  [ErrorCode.INVALID_WEBHOOK_SIGNATURE]: '❌ Webhook tidak valid.',
  [ErrorCode.MEDIA_NOT_AVAILABLE]: '❌ Media dari pesan yang direply tidak tersedia.',
  [ErrorCode.UNSUPPORTED_STICKER_TYPE]: '❌ Tipe sticker tidak didukung. Animated → !togif, static → !toimg.',
  [ErrorCode.TEMP_FILE_CLEANUP_FAILED]: '⚠️ Gagal membersihkan file sementara.',
  [ErrorCode.INVALID_MODIFIER_INPUT]: '❌ Modifier tidak didukung untuk input ini.',
  [ErrorCode.MODIFIER_REQUIRES_IMAGE]: '❌ Mode ini membutuhkan foto.',
  [ErrorCode.MODIFIER_REQUIRES_TEXT]: '❌ Mode ini membutuhkan teks.',
  [ErrorCode.FEATURE_DISABLED]: '❌ Fitur remove background belum tersedia.',
  [ErrorCode.INVALID_ARGUMENT]: '❌ Argumen perintah tidak valid.',
};

// Pesan user dinamis: limit configurable tercermin di respons (bukan hardcode).
// Tidak memakai raw internal message agar tak bocor ke user, kecuali userMessage eksplisit disediakan.
export function userMessageForError(err: { code: ErrorCode; userMessage?: string; details?: Record<string, unknown> }): string {
  if (err.userMessage) {
    return err.userMessage;
  }
  if (typeof err.details?.userMessage === 'string') {
    return err.details.userMessage;
  }
  if (err.code === ErrorCode.TEXT_TOO_LONG) {
    return `❌ Teks maksimal ${env.maxTextLength} karakter.`;
  }
  if (err.code === ErrorCode.VIDEO_TOO_LONG) {
    return `❌ Video maksimal ${env.maxVideoDurationSeconds} detik.`;
  }
  return userMessages[err.code] ?? '❌ Gagal membuat sticker.';
}
