import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { fitVisibleImage } from '../../src/stickers/rendering/visible-image';

async function alphaBounds(buffer: Buffer) {
  const alpha = await sharp(buffer).ensureAlpha().extractChannel('alpha').png().toBuffer();
  const { info } = await sharp(alpha).trim({ background: 'black', threshold: 0, lineArt: true })
    .toBuffer({ resolveWithObject: true });
  return info;
}

describe('Visible image fitting', () => {
  it('enlarges black content inside a large transparent canvas with safe padding', async () => {
    const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect x="320" y="360" width="160" height="80" fill="black"/></svg>');
    const result = await (await fitVisibleImage(source)).png().toBuffer();
    const metadata = await sharp(result).metadata();
    const bounds = await alphaBounds(result);
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(bounds.width).toBeGreaterThanOrEqual(488);
    expect(bounds.height).toBeGreaterThanOrEqual(244);
    expect(bounds.trimOffsetLeft).toBe(-12);
  });

  it('keeps all opaque borders, including a uniform photo background', async () => {
    const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="white"/><rect x="180" y="180" width="40" height="40" fill="black"/></svg>');
    const result = await (await fitVisibleImage(source)).png().toBuffer();
    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(512);
    expect(data[0]).toBe(255);
    expect(data[3]).toBe(255);
  });

  it('keeps faint visible details at the edge instead of trimming them away', async () => {
    const source = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect x="10" y="100" width="1" height="100" fill="black" opacity="0.02"/><rect x="200" y="100" width="100" height="100" fill="white"/></svg>');
    const result = await (await fitVisibleImage(source)).png().toBuffer();
    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let faintPixels = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < 20; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha > 0) faintPixels++;
      }
    }
    expect(faintPixels).toBeGreaterThan(0);
  });

  it('handles empty and tiny transparent images', async () => {
    for (const size of [1, 64]) {
      const source = await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } }).png().toBuffer();
      const result = await (await fitVisibleImage(source)).png().toBuffer();
      const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(512);
      expect(info.height).toBe(512);
      expect(data.some((value, index) => index % 4 === 3 && value !== 0)).toBe(false);
    }
  });
});
