import fs from 'fs';
import path from 'path';

export function getAvailableFonts(): string[] {
  const fontPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/opentype/noto/NotoSans-Bold.ttf',
  ];
  return fontPaths.filter(p => fs.existsSync(p));
}

export function getDefaultFontPath(): string {
  const fonts = getAvailableFonts();
  if (fonts.length > 0) return fonts[0];
  return '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
}
