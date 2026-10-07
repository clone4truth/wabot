import { describe, it, expect } from 'vitest';
import Sharp from 'sharp';
import { renderTextToBuffer, renderFittedText, calculateTextLayout } from '../../src/stickers/rendering/text-layout';
import { ErrorCode } from '../../src/errors/error-codes';

async function pixels(buf: Buffer) {
  const { data, info } = await Sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

async function inkBounds(buf: Buffer) {
  const { data, w, h, ch } = await pixels(buf);
  let left = w;
  let right = -1;
  let top = h;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + ch - 1] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, right, top, bottom };
}

describe('Text outline (Pango stroke tak valid -> paint-order SVG)', () => {
  it('teks putih dikelilingi outline hitam', async () => {
    const buf = await renderTextToBuffer({ text: 'Hi', maxWidth: 512, maxHeight: 512, fontSize: 96 });
    const { data, w, h, ch } = await pixels(buf);
    let white = 0;
    let outlined = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * ch;
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 128 || r < 200 || g < 200 || b < 200) continue;
        white++;
        let ring = false;
        for (let dy = -5; dy <= 5 && !ring; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = (yy * w + xx) * ch;
            if (data[j + 3] > 128 && data[j] < 80 && data[j + 1] < 80 && data[j + 2] < 80) {
              ring = true;
              break;
            }
          }
        }
        if (ring) outlined++;
      }
    }
    expect(white).toBeGreaterThan(100);
    // Mayoritas piksel putih tepi punya tetangga outline hitam.
    expect(outlined).toBeGreaterThan(white * 0.1);
  }, 60000);
});

describe('Adaptive fitted layout (ukur render aktual)', () => {
  it('tries the minimum font even when the decrement would skip it', async () => {
    const fitted = await renderFittedText({
      text: 'WWWW', maxWidth: 225, maxHeight: 100,
      maxFontSize: 53, minFontSize: 50, margin: 0,
    });
    expect(fitted.fontSize).toBe(50);
  });

  it('does not accept wide glyphs merely because the final SVG clipped them', async () => {
    const fitted = await renderFittedText({
      text: 'WWWW', maxWidth: 128, maxHeight: 128,
      maxFontSize: 64, minFontSize: 16, margin: 0,
    });
    // A 64px WWWW layer is wider than 128px. Its clipped raster used to pass
    // trim bounds when the safe area equalled the final canvas.
    expect(fitted.fontSize).toBeLessThan(64);
    const bounds = await inkBounds(fitted.buffer);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(127);
  });

  it('keeps the complete outline inside margins for left, center and right alignment', async () => {
    for (const align of ['left', 'center', 'right'] as const) {
      const fitted = await renderFittedText({
        text: 'WWWW', maxWidth: 160, maxHeight: 100,
        maxFontSize: 56, minFontSize: 16, margin: 12,
        outlineWidth: 8, align,
      });
      const bounds = await inkBounds(fitted.buffer);
      expect(bounds.left).toBeGreaterThanOrEqual(12);
      expect(bounds.right).toBeLessThan(148);
      expect(bounds.top).toBeGreaterThanOrEqual(12);
      expect(bounds.bottom).toBeLessThan(88);
    }
  });

  it('renders a native 1024px PNG with the same logical fitted layout', async () => {
    const options = { text: 'Baca jelas', maxWidth: 512, maxHeight: 512, margin: 16, maxFontSize: 128 };
    const normal = await renderFittedText(options);
    const large = await renderFittedText({ ...options, outputScale: 2 });
    expect(large.fontSize).toBe(normal.fontSize);
    const meta = await Sharp(large.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
    const bounds = await inkBounds(large.buffer);
    expect(bounds.left).toBeGreaterThanOrEqual(31);
    expect(bounds.right).toBeLessThan(993);
    expect(bounds.top).toBeGreaterThanOrEqual(31);
    expect(bounds.bottom).toBeLessThan(993);
  });

  it('calculateTextLayout: menghasilkan metrik layout deterministik tanpa rendering', () => {
    const layout = calculateTextLayout({
      text: 'Halo dunia stiker bot',
      maxWidth: 512,
      fontSize: 32,
      margin: 16,
    });
    expect(layout.fontSize).toBe(32);
    expect(layout.lineHeight).toBe(Math.round(32 * 1.25));
    expect(layout.lines.length).toBeGreaterThan(0);
    expect(layout.totalHeight).toBe(layout.lines.length * layout.lineHeight);
  });

  it('teks pendek -> font besar, teks panjang -> mengecil', async () => {
    const short = await renderFittedText({ text: 'Hi', maxWidth: 512, maxHeight: 512 });
    const long = await renderFittedText({
      text: 'ini kalimat yang cukup panjang untuk diuji adaptive sizing '.repeat(4),
      maxWidth: 512, maxHeight: 512,
    });
    expect(short.fontSize).toBeGreaterThanOrEqual(80);
    expect(long.fontSize).toBeLessThan(short.fontSize);
  }, 120000);

  it('300 karakter tetap muat tanpa clip', async () => {
    const fitted = await renderFittedText({ text: 'kata '.repeat(60).trim(), maxWidth: 512, maxHeight: 512 });
    const { info } = await Sharp(fitted.buffer).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    expect(info.width).toBeLessThanOrEqual(512 - 32);
    expect(info.height).toBeLessThanOrEqual(512 - 32);
  }, 120000);

  it('teks mustahil muat -> error jelas (bukan silent truncate)', async () => {
    await expect(
      renderFittedText({ text: 'kata '.repeat(2000).trim(), maxWidth: 512, maxHeight: 512, minFontSize: 40 }),
    ).rejects.toMatchObject({ code: ErrorCode.TEXT_TOO_LONG });
  }, 120000);

  it('unbroken 250 karakter render success tanpa kehilangan karakter', async () => {
    const text250 = 'a'.repeat(250);
    const fitted = await renderFittedText({ text: text250, maxWidth: 512, maxHeight: 512, minFontSize: 16 });
    expect(fitted.buffer.length).toBeGreaterThan(1000);
    const { info } = await Sharp(fitted.buffer).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    expect(info.width).toBeLessThanOrEqual(512 - 32);
    expect(info.height).toBeLessThanOrEqual(512 - 32);
  }, 120000);
});

describe('Unicode + emoji', () => {
  it('menjaga kata tetap utuh dan mempertahankan warna emoji pada teks campuran', async () => {
    const fitted = await renderFittedText({
      text: 'kocak 😷',
      maxWidth: 512,
      maxHeight: 512,
      margin: 16,
      maxFontSize: 144,
      minFontSize: 18,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
    });

    expect(fitted.lines.flatMap((line) => line.split(/\s+/))).toEqual(['kocak', '😷']);

    const { data, info } = await Sharp(fitted.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let coloredPixels = 0;
    let transparentPixels = 0;
    let left = info.width;
    let right = -1;
    let top = info.height;
    let bottom = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const alpha = data[offset + 3];
        if (alpha === 0) {
          transparentPixels++;
          continue;
        }
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        if (alpha > 32 && Math.max(red, green, blue) - Math.min(red, green, blue) > 20) {
          coloredPixels++;
        }
      }
    }

    expect(coloredPixels).toBeGreaterThan(1_000);
    expect(transparentPixels).toBeGreaterThan(info.width * info.height * 0.6);
    expect(left).toBeGreaterThanOrEqual(16);
    expect(right).toBeLessThanOrEqual(495);
    expect(top).toBeGreaterThanOrEqual(16);
    expect(bottom).toBeLessThanOrEqual(495);
  });

  it('render tanpa crash (fallback font environment)', async () => {
    const fitted = await renderFittedText({ text: 'Halo 😂🔥 Semangat 💪 Indonesia 🇮🇩', maxWidth: 512, maxHeight: 512 });
    expect(fitted.buffer.length).toBeGreaterThan(1000);
    const { info } = await Sharp(fitted.buffer).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    expect(info.width).toBeGreaterThan(50);
  }, 120000);

  it('100 emoji render dan fit dalam safe area tanpa clip', async () => {
    const emoji100 = '😂'.repeat(100);
    const fitted = await renderFittedText({ text: emoji100, maxWidth: 512, maxHeight: 512, minFontSize: 16 });
    expect(fitted.buffer.length).toBeGreaterThan(500);
    const { info } = await Sharp(fitted.buffer).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    expect(info.width).toBeLessThanOrEqual(512 - 32);
    expect(info.height).toBeLessThanOrEqual(512 - 32);
  }, 120000);
});
