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

// Nama family font untuk atribut font_desc Pango (bukan path file).
export function getFontFamily(fontPath?: string): string {
  const p = (fontPath || getDefaultFontPath()).toLowerCase();
  if (p.includes('noto')) return 'Noto Sans';
  if (p.includes('dejavu')) return 'DejaVu Sans';
  if (p.includes('lato')) return 'Lato';
  return 'sans';
}
