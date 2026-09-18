import Sharp from 'sharp';
import { StickerTemplate } from './types';
import { StickerResult } from '../result';
import { escapeXml, validateText } from '../rendering/text-utils';
import { getDefaultFontPath, getFontFamily } from '../rendering/fonts';
import { fitTextIntoRegion } from '../rendering/text-layout';

export class TerminalTemplate implements StickerTemplate {
  readonly name = 'terminal';
  readonly description = 'Tampilan jendela terminal konsol retro dengan prompt CLI';
  readonly supportedInput = 'text';

  async render(input: { text?: string }): Promise<StickerResult> {
    const clean = validateText(input.text ?? '', { emptyMessage: 'Teks template terminal tidak boleh kosong' });
    const family = getFontFamily(getDefaultFontPath());

    const fitted = fitTextIntoRegion({
      text: clean,
      width: 432,
      height: 340,
      maxFontSize: 22,
      minFontSize: 12,
    });

    const { lines, fontSize, lineHeight } = fitted;
    const startY = 120 + Math.round(fontSize * 0.85);

    const codeTexts = lines
      .map((line, idx) => {
        const y = startY + idx * lineHeight;
        const prefix = idx === 0 ? '<tspan fill="#48bb78">user@wabot:~$ </tspan>' : '<tspan fill="#718096">&gt; </tspan>';
        return `<text x="40" y="${y}" font-family="monospace,${family}" font-size="${fontSize}" font-weight="bold" fill="#f7fafc">${prefix}${escapeXml(line)}</text>`;
      })
      .join('');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="32" fill="#1a202c"/>
        <path d="M 0 32 Q 0 0 32 0 L 480 0 Q 512 0 512 32 L 512 60 L 0 60 Z" fill="#2d3748"/>
        <!-- Terminal Dots -->
        <circle cx="36" cy="30" r="8" fill="#e53e3e"/>
        <circle cx="62" cy="30" r="8" fill="#d69e2e"/>
        <circle cx="88" cy="30" r="8" fill="#38a169"/>
        <text x="256" y="36" text-anchor="middle" font-family="monospace,sans-serif" font-size="16" fill="#a0aec0">bash - 512×512</text>
        ${codeTexts}
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
    return {
      buffer,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: buffer.length,
    };
  }
}

export class BreakingTemplate implements StickerTemplate {
  readonly name = 'breaking';
  readonly description = 'Banner siaran langsung berita terkini Breaking News';
  readonly supportedInput = 'text';

  async render(input: { text?: string }): Promise<StickerResult> {
    const clean = validateText(input.text ?? '', { emptyMessage: 'Teks template breaking tidak boleh kosong' });
    const family = getFontFamily(getDefaultFontPath());

    const fitted = fitTextIntoRegion({
      text: clean,
      width: 452,
      height: 300,
      maxFontSize: 34,
      minFontSize: 14,
    });

    const { lines, fontSize, lineHeight, totalHeight } = fitted;
    const startY = 150 + Math.round((300 - totalHeight) / 2) + Math.round(fontSize * 0.85);

    const bodyTexts = lines
      .map((line, idx) => {
        const y = startY + idx * lineHeight;
        return `<text x="256" y="${y}" text-anchor="middle" font-family="${family},sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="2" paint-order="stroke">${escapeXml(line)}</text>`;
      })
      .join('');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="24" fill="#111827"/>
        <!-- Header Breaking News -->
        <rect x="0" y="0" width="512" height="100" fill="#dc2626"/>
        <text x="256" y="65" text-anchor="middle" font-family="${family},sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="4">BREAKING NEWS</text>
        <!-- Yellow ticker -->
        <rect x="0" y="100" width="512" height="24" fill="#facc15"/>
        <text x="256" y="117" text-anchor="middle" font-family="${family},sans-serif" font-size="14" font-weight="bold" fill="#000000" letter-spacing="2">● LIVE BROADCAST ●</text>
        ${bodyTexts}
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
    return {
      buffer,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: buffer.length,
    };
  }
}

export class WantedTemplate implements StickerTemplate {
  readonly name = 'wanted';
  readonly description = 'Poster buronan klasik ala koboi barat Wanted Dead or Alive';
  readonly supportedInput = 'text';

  async render(input: { text?: string }): Promise<StickerResult> {
    const clean = validateText(input.text ?? '', { emptyMessage: 'Teks template wanted tidak boleh kosong' });
    const family = getFontFamily(getDefaultFontPath());

    const fitted = fitTextIntoRegion({
      text: clean,
      width: 432,
      height: 220,
      maxFontSize: 34,
      minFontSize: 14,
    });

    const { lines, fontSize, lineHeight, totalHeight } = fitted;
    const startY = 180 + Math.round((220 - totalHeight) / 2) + Math.round(fontSize * 0.85);

    const bodyTexts = lines
      .map((line, idx) => {
        const y = startY + idx * lineHeight;
        return `<text x="256" y="${y}" text-anchor="middle" font-family="${family},serif" font-size="${fontSize}" font-weight="bold" fill="#3b2f2f">${escapeXml(line)}</text>`;
      })
      .join('');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="20" fill="#ecd5b3"/>
        <rect x="20" y="20" width="472" height="472" rx="12" fill="none" stroke="#5c4033" stroke-width="6"/>
        <rect x="30" y="30" width="452" height="452" rx="8" fill="none" stroke="#5c4033" stroke-width="2"/>
        <!-- Header -->
        <text x="256" y="95" text-anchor="middle" font-family="${family},serif" font-size="64" font-weight="900" fill="#3b2f2f" letter-spacing="8">WANTED</text>
        <text x="256" y="145" text-anchor="middle" font-family="${family},serif" font-size="22" font-weight="bold" fill="#5c4033" letter-spacing="3">DEAD OR ALIVE</text>
        ${bodyTexts}
        <!-- Footer Reward -->
        <text x="256" y="445" text-anchor="middle" font-family="${family},serif" font-size="28" font-weight="900" fill="#8b0000" letter-spacing="2">REWARD $1,000,000</text>
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
    return {
      buffer,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: buffer.length,
    };
  }
}

export class MinimalTemplate implements StickerTemplate {
  readonly name = 'minimal';
  readonly description = 'Kartu kutipan estetis bergaya modern minimalis';
  readonly supportedInput = 'text';

  async render(input: { text?: string }): Promise<StickerResult> {
    const clean = validateText(input.text ?? '', { emptyMessage: 'Teks template minimal tidak boleh kosong' });
    const family = getFontFamily(getDefaultFontPath());

    const fitted = fitTextIntoRegion({
      text: clean,
      width: 432,
      height: 240,
      maxFontSize: 34,
      minFontSize: 14,
    });

    const { lines, fontSize, lineHeight, totalHeight } = fitted;
    const startY = 160 + Math.round((240 - totalHeight) / 2) + Math.round(fontSize * 0.85);

    const bodyTexts = lines
      .map((line, idx) => {
        const y = startY + idx * lineHeight;
        return `<text x="256" y="${y}" text-anchor="middle" font-family="${family},sans-serif" font-size="${fontSize}" font-weight="500" fill="#f8fafc">${escapeXml(line)}</text>`;
      })
      .join('');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="40" fill="#0f172a"/>
        <rect x="36" y="36" width="440" height="440" rx="24" fill="none" stroke="#334155" stroke-width="2"/>
        <circle cx="256" cy="110" r="16" fill="#38bdf8" opacity="0.8"/>
        ${bodyTexts}
        <line x1="180" y1="420" x2="332" y2="420" stroke="#475569" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
    return {
      buffer,
      mimetype: 'image/webp',
      width: 512,
      height: 512,
      animated: false,
      size: buffer.length,
    };
  }
}
