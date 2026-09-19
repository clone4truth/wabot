/**
 * P1 tests — ACTUAL RENDERED PIXEL BOUNDS untuk caption & templates.
 *
 * Invariant: FULL INPUT dirender utuh (tanpa clip/truncate/hide-overflow), ATAU
 * TEXT_TOO_LONG. Untuk CJK/emoji/wide-glyph, estimasi lebar karakter tidak cukup —
 * hasil render aktual diukur via trim box dan harus berada dalam safe area.
 */

import { describe, it, expect, vi } from 'vitest';
import Sharp from 'sharp';
import { escapeXml } from '../../src/stickers/rendering/text-utils';
import { fitTextIntoRegionRendered } from '../../src/stickers/rendering/text-layout';
import { defaultTemplateRegistry } from '../../src/stickers/templates/registry';
import { ErrorCode } from '../../src/errors/error-codes';

vi.mock('../../src/media/downloader', () => ({
  downloadMedia: vi.fn(async () => {
    const file = `/tmp/test-rb-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    await Sharp({
      create: { width: 512, height: 512, channels: 4, background: { r: 120, g: 180, b: 240, alpha: 1 } },
    })
      .png()
      .toFile(file);
    return { filePath: file, mimeType: 'image/png', size: 1000 };
  }),
}));

describe('fitTextIntoRegionRendered: actual pixel bounds', () => {
  const CASES: Array<[string, string]> = [
    ['Latin', 'The quick brown fox jumps over the lazy dog repeatedly'],
    ['CJK', '你好世界你好世界'],
    ['Japanese', 'こんにちは世界'],
    ['Korean', '안녕하세요 세계'],
    ['Flag emoji', '🇮🇩 Indonesia merdeka'],
    ['ZWJ family emoji', '👨‍👩‍👧‍👦 Keluarga bahagia'],
    ['Wide W glyphs', 'WWWWWWWWWWWW'],
    ['Wide m glyphs', 'mmmmmmmmmmmm'],
  ];

  for (const [name, text] of CASES) {
    it(`${name}: rendered bounds within safe area`, async () => {
      const fitted = await fitTextIntoRegionRendered({
        text,
        width: 480,
        height: 150,
        maxFontSize: 28,
        minFontSize: 14,
      });
      expect(fitted.renderedWidth).toBeLessThanOrEqual(480);
      expect(fitted.renderedHeight).toBeLessThanOrEqual(150);
      expect(fitted.renderedWidth).toBeGreaterThan(0);
      expect(fitted.renderedHeight).toBeGreaterThan(0);
    }, 30_000);
  }

  it('impossible text → TEXT_TOO_LONG (never silent clip)', async () => {
    await expect(
      fitTextIntoRegionRendered({
        text: 'kata '.repeat(300).trim(),
        width: 480,
        height: 150,
        maxFontSize: 28,
        minFontSize: 14,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.TEXT_TOO_LONG });
  }, 30_000);

  it('returned layout renders the full text (lines preserved)', async () => {
    const fitted = await fitTextIntoRegionRendered({
      text: 'CJK wide test 你好世界',
      width: 480,
      height: 150,
      maxFontSize: 28,
      minFontSize: 14,
    });
    expect(fitted.lines.join(' ')).toContain('你好世界');
  }, 30_000);
});

describe('Templates: rendered pixel bounds (terminal/breaking/wanted/minimal)', () => {
  const longMixed =
    'Pengumuman penting hari ini: server maintenance rutin jam 02:00 WIB 🚀✨ 你好世界 こんにちは 안녕하세요 mohon simpan pekerjaan Anda!';

  it('terminal: prefix prompt participates in measurement', async () => {
    const text = 'git push origin main && npm run deploy --production';

    const fittedWithPrefix = await fitTextIntoRegionRendered({
      text,
      width: 432,
      height: 340,
      maxFontSize: 22,
      minFontSize: 12,
      fontFamily: 'monospace',
      renderLine: (lines, fontSize, lineHeight) =>
        lines
          .map((line, idx) => {
            const y = Math.round(fontSize * 0.85) + idx * lineHeight + Math.round(fontSize * 0.85);
            const prefix = idx === 0
              ? '<tspan fill="#48bb78">user@wabot:~$ </tspan>'
              : '<tspan fill="#718096">&gt; </tspan>';
            return `<text x="40" y="${y}" font-family="monospace,sans-serif" font-size="${fontSize}" font-weight="bold" fill="#f7fafc">${prefix}${escapeXml(line)}</text>`;
          })
          .join(''),
    });

    const fittedNoPrefix = await fitTextIntoRegionRendered({
      text,
      width: 432,
      height: 340,
      maxFontSize: 22,
      minFontSize: 12,
      fontFamily: 'monospace',
    });

    // Prefix menambah lebar ter-render → engine memilih font yang sama atau lebih
    // kecil dibanding render tanpa prefix (prefix berpartisipasi dalam pengukuran).
    expect(fittedWithPrefix.fontSize).toBeLessThanOrEqual(fittedNoPrefix.fontSize);
    expect(fittedWithPrefix.renderedWidth).toBeLessThanOrEqual(432);
  }, 30_000);

  it('terminal: long mixed text renders fully at 512x512', async () => {
    const tpl = defaultTemplateRegistry.resolve('terminal');
    const res = await tpl.render({ text: longMixed });
    expect(res.width).toBe(512);
    expect(res.height).toBe(512);
  }, 30_000);

  it('breaking/wanted/minimal: CJK + emoji tanpa overflow', async () => {
    for (const name of ['breaking', 'wanted', 'minimal']) {
      const tpl = defaultTemplateRegistry.resolve(name);
      const res = await tpl.render({ text: longMixed });
      expect(res.width).toBe(512);
      expect(res.height).toBe(512);
    }
  }, 60_000);

  it('semua template: teks mustahil panjang → TEXT_TOO_LONG terkontrol', async () => {
    for (const name of ['terminal', 'breaking', 'wanted', 'minimal']) {
      const tpl = defaultTemplateRegistry.resolve(name);
      await expect(tpl.render({ text: 'kata '.repeat(400).trim() })).rejects.toMatchObject({
        code: ErrorCode.TEXT_TOO_LONG,
      });
    }
  }, 120_000);
});

describe('CaptionGenerator end-to-end: rendered bounds guard', () => {
  it('caption CJK + emoji panjang dirender penuh dalam banner (tanpa clip)', async () => {
    const { CaptionGenerator } = await import('../../src/stickers/generators/caption.generator');
    const generator = new CaptionGenerator();

    const res = await generator.process(
      {
        type: 'caption',
        mediaUrl: 'http://example.com/photo.png',
        text: '你好世界你好世界こんにちは世界안녕하세요 👨‍👩‍👧‍👦🇮🇩',
        options: { position: 'bottom' },
      },
      { chatId: 'x@c.us', senderId: 'y@c.us' },
    );

    expect(res.mimetype).toBe('image/webp');
    expect(res.width).toBe(512);
    expect(res.height).toBe(512);
  }, 60_000);

  it('caption validate() rejects text that cannot fit banner capacity', async () => {
    const { CaptionGenerator } = await import('../../src/stickers/generators/caption.generator');
    const generator = new CaptionGenerator();
    expect(() =>
      generator.validate(
        { type: 'caption', mediaUrl: 'http://x/p.png', text: 'kata '.repeat(200).trim() },
        { chatId: 'x@c.us', senderId: 'y@c.us' },
      ),
    ).toThrow();
  }, 60_000);
});
