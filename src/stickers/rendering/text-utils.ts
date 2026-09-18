import env from '../../config/env';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

/**
 * Pisahkan string menjadi array grapheme cluster utuh (user-perceived characters).
 * Mencegah pemecahan sequence ZWJ, skin tone modifiers, dan bendera regional.
 */
export function splitGraphemes(text: string): string[] {
  const normalized = String(text ?? '');
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('id', {
      granularity: 'grapheme',
    });
    return Array.from(
      segmenter.segment(normalized),
      segment => segment.segment,
    );
  }
  return Array.from(normalized);
}

/**
 * Hitung jumlah grapheme cluster aktual dalam teks.
 */
export function countGraphemes(text: string): number {
  return splitGraphemes(text).length;
}

/**
 * Potong teks berdasarkan batas grapheme cluster tanpa merusak sequence emoji.
 */
export function sliceGraphemes(text: string, start: number, end?: number): string {
  const graphemes = splitGraphemes(text);
  return graphemes.slice(start, end).join('');
}

/**
 * Periksa apakah sebuah grapheme cluster merupakan karakter emoji valid.
 * Mendukung:
 * - Standar Extended_Pictographic (termasuk ZWJ sequences, skin tones)
 * - Bendera regional (Regional_Indicator)
 * - Keycap sequences ([0-9#*]\uFE0F?\u20E3)
 */
export function isEmojiGrapheme(grapheme: string): boolean {
  if (!grapheme) return false;
  // Keycap sequence: 1️⃣, #️⃣, *️⃣
  if (/^[0-9#*]\uFE0F?\u20E3$/.test(grapheme)) return true;
  // Regional indicators (flags): 🇮🇩
  if (/^\p{Regional_Indicator}{2}$/u.test(grapheme)) return true;
  // Extended Pictographic (base emojis, modifier sequences, skin tones, ZWJ sequences)
  if (/\p{Extended_Pictographic}/u.test(grapheme)) return true;
  return false;
}

/**
 * Legacy alias untuk countGraphemes agar kompatibilitas fungsi lama tetap terjaga.
 * Secara internal menggunakan grapheme cluster.
 */
export const countUnicodeCharacters = countGraphemes;

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
 * - Memastikan panjang grapheme cluster tidak melebihi batas (throw TEXT_TOO_LONG)
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

  const length = countGraphemes(clean);
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
 * Bungkus kata ke baris-baris berdasarkan maxChars (grapheme clusters).
 * Jika kata/token melebihi maxChars, token dipecah menjadi beberapa segmen tanpa data loss (tanpa …)
 * dan tanpa memecah sequence emoji multi-codepoint.
 */
export function wrapWords(text: string, maxChars: number, maxLines?: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let currentGraphemes: string[] = [];

  for (const word of words) {
    const wordGraphemes = splitGraphemes(word);

    if (wordGraphemes.length > maxChars) {
      if (currentGraphemes.length > 0) {
        lines.push(currentGraphemes.join(''));
        currentGraphemes = [];
        if (maxLines && lines.length >= maxLines) break;
      }
      let remaining = [...wordGraphemes];
      while (remaining.length > 0) {
        const chunk = remaining.splice(0, maxChars);
        if (remaining.length > 0) {
          lines.push(chunk.join(''));
          if (maxLines && lines.length >= maxLines) break;
        } else {
          currentGraphemes = chunk;
        }
      }
      if (maxLines && lines.length >= maxLines) break;
    } else {
      const candidateGraphemes = currentGraphemes.length > 0
        ? [...currentGraphemes, ' ', ...wordGraphemes]
        : wordGraphemes;

      if (candidateGraphemes.length <= maxChars) {
        currentGraphemes = candidateGraphemes;
      } else {
        if (currentGraphemes.length > 0) {
          lines.push(currentGraphemes.join(''));
        }
        if (maxLines && lines.length >= maxLines) {
          currentGraphemes = [];
          break;
        }
        currentGraphemes = wordGraphemes;
      }
    }
  }

  if (currentGraphemes.length > 0 && (!maxLines || lines.length < maxLines)) {
    lines.push(currentGraphemes.join(''));
  }

  return lines.length > 0 ? lines : [''];
}
