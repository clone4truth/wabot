import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

/**
 * Hitung jumlah karakter Unicode sesungguhnya (grapheme/codepoint),
 * bukan raw UTF-16 code units (seperti emoji yang terdiri dari surrogate pairs).
 */
export function countUnicodeCharacters(text: string): number {
  return Array.from(String(text ?? '')).length;
}

/**
 * Normalisasi Unicode ke NFC dan trim spasi di awal/akhir tanpa merusak emoji/karakter internasional.
 */
export function sanitizeText(text: string): string {
  return String(text ?? '').normalize('NFC').trim();
}

/**
 * Escape karakter khusus XML/SVG (&, <, >, ", ') agar aman diinjeksikan ke dalam SVG.
 */
export function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TextValidationOptions {
  maxLength?: number;
  emptyMessage?: string;
  userMessage?: string;
}

/**
 * Validasi umum untuk semua generator berbasis teks:
 * - Membersihkan teks via sanitizeText
 * - Memastikan tidak kosong (throw UNSUPPORTED_INPUT)
 * - Memastikan panjang karakter Unicode tidak melebihi batas (throw TEXT_TOO_LONG)
 */
export function validateText(text: string, options: TextValidationOptions = {}): string {
  const clean = sanitizeText(text);
  const maxLength = options.maxLength ?? env.maxTextLength;

  if (!clean) {
    throw new AppError(
      ErrorCode.UNSUPPORTED_INPUT,
      options.emptyMessage || 'Teks tidak boleh kosong',
      options.userMessage ? { userMessage: options.userMessage } : undefined,
    );
  }

  const length = countUnicodeCharacters(clean);
  if (length > maxLength) {
    throw new AppError(
      ErrorCode.TEXT_TOO_LONG,
      `Teks maksimal ${maxLength} karakter (diberikan: ${length})`,
      options.userMessage ? { userMessage: options.userMessage } : undefined,
    );
  }

  return clean;
}

/**
 * Bungkus kata ke baris-baris berdasarkan maxChars.
 * Jika kata/token melebihi maxChars, token dipecah menjadi beberapa segmen tanpa data loss (tanpa …).
 */
export function wrapWords(text: string, maxChars: number, maxLines?: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
        if (maxLines && lines.length >= maxLines) break;
      }
      let remaining = word;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, maxChars);
        remaining = remaining.slice(maxChars);
        if (remaining.length > 0) {
          lines.push(chunk);
          if (maxLines && lines.length >= maxLines) break;
        } else {
          current = chunk;
        }
      }
      if (maxLines && lines.length >= maxLines) break;
    } else {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (maxLines && lines.length >= maxLines) {
          current = '';
          break;
        }
        current = word;
      }
    }
  }

  if (current && (!maxLines || lines.length < maxLines)) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

