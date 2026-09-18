import { describe, it, expect } from 'vitest';
import {
  countGraphemes,
  splitGraphemes,
  sliceGraphemes,
  wrapWords,
  validateText,
} from '../../src/stickers/rendering/text-utils';

describe('Grapheme-safe Unicode handling', () => {
  it('countGraphemes: emoji tunggal dan kompleks dihitung 1 grapheme', () => {
    expect(countGraphemes('😂')).toBe(1);
    expect(countGraphemes('🇮🇩')).toBe(1);
    expect(countGraphemes('👨‍👩‍👧‍👦')).toBe(1);
    expect(countGraphemes('👩🏽‍💻')).toBe(1);
    expect(countGraphemes('❤️')).toBe(1);
  });

  it('splitGraphemes: memisahkan sequence multi-codepoint sebagai satu segmen utuh', () => {
    expect(splitGraphemes('🇮🇩')).toEqual(['🇮🇩']);
    expect(splitGraphemes('👨‍👩‍👧‍👦')).toEqual(['👨‍👩‍👧‍👦']);
    expect(splitGraphemes('👩🏽‍💻')).toEqual(['👩🏽‍💻']);
    expect(splitGraphemes('❤️')).toEqual(['❤️']);

    const mixed = splitGraphemes('🇮🇩 ID 😂');
    expect(mixed).toEqual(['🇮🇩', ' ', 'I', 'D', ' ', '😂']);
  });

  it('sliceGraphemes: memotong teks secara aman tanpa merusak ZWJ / surrogate', () => {
    const text = '🇮🇩 Indonesia 👨‍👩‍👧‍👦 keluarga ❤️';
    const sliced = sliceGraphemes(text, 0, 13);
    expect(sliced).toBe('🇮🇩 Indonesia 👨‍👩‍👧‍👦');
    expect(sliced).not.toContain('\uFFFD');
  });

  it('wrapWords: token panjang emoji tidak terpecah ZWJ dan tidak menghasilkan replacement char', () => {
    const emoji50 = '👨‍👩‍👧‍👦'.repeat(50);
    const lines = wrapWords(emoji50, 10);
    expect(lines.length).toBe(5);

    // Semua baris harus berisi 10 grapheme
    for (const line of lines) {
      expect(countGraphemes(line)).toBe(10);
      expect(line).not.toContain('\uFFFD');
    }

    // Seluruh 50 emoji harus tetap utuh
    const reconstructed = lines.join('');
    expect(countGraphemes(reconstructed)).toBe(50);
    expect(reconstructed).toBe(emoji50);
  });

  it('wrapWords: campuran teks dan bendera / emoji kompleks tidak corrupt', () => {
    const mixed = '🇮🇩'.repeat(25);
    const lines = wrapWords(mixed, 5);
    expect(lines.length).toBe(5);
    for (const line of lines) {
      expect(countGraphemes(line)).toBe(5);
    }
  });

  it('validateText: menghitung limit berdasarkan grapheme, bukan raw codepoint', () => {
    // 300 emoji keluarga (masing-masing 1 grapheme)
    const valid300 = '👨‍👩‍👧‍👦'.repeat(300);
    expect(() => validateText(valid300, { maxLength: 300 })).not.toThrow();

    // 301 emoji keluarga -> throw TEXT_TOO_LONG
    const invalid301 = '👨‍👩‍👧‍👦'.repeat(301);
    expect(() => validateText(invalid301, { maxLength: 300 })).toThrow(/maksimal 300 karakter/);
  });
});
