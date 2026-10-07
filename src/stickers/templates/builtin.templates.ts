import Sharp from 'sharp';
import { StickerTemplate } from './types';
import { StickerResult } from '../result';
import { validateText } from '../rendering/text-utils';
import { getDefaultFontPath, getFontFamily } from '../rendering/fonts';
import { renderFittedText } from '../rendering/text-layout';

/**
 * INVARIANT SEMUA TEMPLATE:
 *   FULL INPUT → dirender UTUH (tanpa clip/truncate/hide-overflow), atau
 *   TEXT_TOO_LONG → ditolak dengan error terkontrol.
 * Layout tervalidasi terhadap BOUNDS PIKSEL RENDER AKTUAL (bukan estimasi lebar karakter).
 */

export class TerminalTemplate implements StickerTemplate {
  readonly name = 'terminal';
  readonly description = 'Tampilan jendela terminal konsol retro dengan prompt CLI';
  readonly supportedInput = 'text';

  async render(input: { text?: string }): Promise<StickerResult> {
    const clean = validateText(input.text ?? '', { emptyMessage: 'Teks template terminal tidak boleh kosong' });
    const family = getFontFamily(getDefaultFontPath());

    const fitted = await renderFittedText({
      text: clean,
      maxWidth: 432,
      maxHeight: 330,
      margin: 0,
      maxFontSize: 36,
      minFontSize: 12,
      fontFamily: 'monospace',
      fontWeight: 'bold',
      color: '#f7fafc',
      outlineColor: 'transparent',
      outlineWidth: 0,
      align: 'left',
    });

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="32" fill="#1a202c"/>
        <path d="M 0 32 Q 0 0 32 0 L 480 0 Q 512 0 512 32 L 512 60 L 0 60 Z" fill="#2d3748"/>
        <!-- Terminal Dots -->
        <circle cx="36" cy="30" r="8" fill="#e53e3e"/>
        <circle cx="62" cy="30" r="8" fill="#d69e2e"/>
        <circle cx="88" cy="30" r="8" fill="#38a169"/>
        <text x="256" y="36" text-anchor="middle" font-family="monospace,sans-serif" font-size="16" fill="#a0aec0">bash - 512×512</text>
        <text x="40" y="105" font-family="monospace,${family}" font-size="20" font-weight="bold" fill="#48bb78">user@wabot:~$</text>
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg))
      .composite([{ input: fitted.contentBuffer, left: 40, top: 120 }])
      .webp({ lossless: true, preset: 'text' })
      .toBuffer();
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

    // Rendered pixel bounds (P1): ukur text-layer aktual sebelum commit layout final.
    const fitted = await renderFittedText({
      text: clean,
      maxWidth: 452,
      maxHeight: 300,
      margin: 0,
      maxFontSize: 72,
      minFontSize: 14,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: 2,
    });

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="24" fill="#111827"/>
        <!-- Header Breaking News -->
        <rect x="0" y="0" width="512" height="100" fill="#dc2626"/>
        <text x="256" y="65" text-anchor="middle" font-family="${family},sans-serif" font-size="44" font-weight="900" fill="#ffffff" letter-spacing="4">BREAKING NEWS</text>
        <!-- Yellow ticker -->
        <rect x="0" y="100" width="512" height="24" fill="#facc15"/>
        <text x="256" y="117" text-anchor="middle" font-family="${family},sans-serif" font-size="14" font-weight="bold" fill="#000000" letter-spacing="2">● LIVE BROADCAST ●</text>
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg))
      .composite([{
        input: fitted.contentBuffer,
        left: 30 + Math.round((452 - fitted.contentWidth) / 2),
        top: 150 + Math.round((300 - fitted.contentHeight) / 2),
      }])
      .webp({ lossless: true, preset: 'text' })
      .toBuffer();
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

    // Rendered pixel bounds (P1)
    const fitted = await renderFittedText({
      text: clean,
      maxWidth: 432,
      maxHeight: 220,
      margin: 0,
      maxFontSize: 72,
      minFontSize: 14,
      color: '#3b2f2f',
      outlineColor: 'transparent',
      outlineWidth: 0,
      fontFamily: 'serif',
    });

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="20" fill="#ecd5b3"/>
        <rect x="20" y="20" width="472" height="472" rx="12" fill="none" stroke="#5c4033" stroke-width="6"/>
        <rect x="30" y="30" width="452" height="452" rx="8" fill="none" stroke="#5c4033" stroke-width="2"/>
        <!-- Header -->
        <text x="256" y="95" text-anchor="middle" font-family="${family},serif" font-size="64" font-weight="900" fill="#3b2f2f" letter-spacing="8">WANTED</text>
        <text x="256" y="145" text-anchor="middle" font-family="${family},serif" font-size="22" font-weight="bold" fill="#5c4033" letter-spacing="3">DEAD OR ALIVE</text>
        <!-- Footer Reward -->
        <text x="256" y="445" text-anchor="middle" font-family="${family},serif" font-size="28" font-weight="900" fill="#8b0000" letter-spacing="2">REWARD $1,000,000</text>
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg))
      .composite([{
        input: fitted.contentBuffer,
        left: 40 + Math.round((432 - fitted.contentWidth) / 2),
        top: 180 + Math.round((220 - fitted.contentHeight) / 2),
      }])
      .webp({ lossless: true, preset: 'text' })
      .toBuffer();
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

    // Rendered pixel bounds (P1)
    const fitted = await renderFittedText({
      text: clean,
      maxWidth: 432,
      maxHeight: 240,
      margin: 0,
      maxFontSize: 72,
      minFontSize: 14,
      color: '#f8fafc',
      outlineColor: 'transparent',
      outlineWidth: 0,
      fontWeight: '500',
    });

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" rx="40" fill="#0f172a"/>
        <rect x="36" y="36" width="440" height="440" rx="24" fill="none" stroke="#334155" stroke-width="2"/>
        <circle cx="256" cy="110" r="16" fill="#38bdf8" opacity="0.8"/>
        <line x1="180" y1="420" x2="332" y2="420" stroke="#475569" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `;

    const buffer = await Sharp(Buffer.from(svg))
      .composite([{
        input: fitted.contentBuffer,
        left: 40 + Math.round((432 - fitted.contentWidth) / 2),
        top: 160 + Math.round((240 - fitted.contentHeight) / 2),
      }])
      .webp({ lossless: true, preset: 'text' })
      .toBuffer();
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
