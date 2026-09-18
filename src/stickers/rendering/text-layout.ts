import { getDefaultFontPath, getFontFamily } from './fonts';
import Sharp from 'sharp';

export interface TextLayoutOptions {
  text: string;
  maxWidth: number;
  maxHeight: number;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  align?: 'left' | 'center' | 'right';
}

// Escape karakter khusus XML agar teks user tidak merusak markup Pango
// (mis. "&", "<", ">" pada "!stiker a & b" atau "<3").
export function escapePangoMarkup(text: string): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function renderTextToBuffer(options: TextLayoutOptions): Promise<Buffer> {
  const {
    text,
    maxWidth,
    maxHeight,
    fontSize = 32,
    color = '#ffffff',
    outlineColor = '#000000',
    outlineWidth = 2,
    align = 'center',
  } = options;

  const fontPath = getDefaultFontPath();
  const family = getFontFamily(fontPath);

  // Hanya atribut Pango yang valid: font_desc + foreground.
  // "stroke"/"stroke-width" bukan atribut Pango -> menyebabkan "invalid markup".
  const pangoMarkup = `<span font_desc="${family} ${fontSize}" foreground="${color}">${escapePangoMarkup(text)}</span>`;

  const overlay = {
    text: {
      text: pangoMarkup,
      font: family,
      fontfile: fontPath,
      width: maxWidth,
      height: maxHeight,
      align,
      rgba: true,
    },
  };

  const buffer = await Sharp({
    create: { width: maxWidth, height: maxHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: overlay, gravity: 'center' }])
    .png()
    .toBuffer();

  return buffer;
}

export function calculateFontSize(text: string, maxWidth: number, maxHeight: number): number {
  let fontSize = 64;
  while (fontSize > 8) {
    const estimatedWidth = text.length * fontSize * 0.6;
    const estimatedHeight = fontSize;
    if (estimatedWidth <= maxWidth && estimatedHeight <= maxHeight) {
      break;
    }
    fontSize -= 1;
  }
  return fontSize;
}
