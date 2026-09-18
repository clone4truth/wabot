import Sharp from 'sharp';
import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { countGraphemes, sanitizeText, escapeXml } from '../rendering/text-utils';
import { getDefaultFontPath, getFontFamily } from '../rendering/fonts';

interface BadgeTheme {
  bg: string;
  border: string;
  dot: string;
  text: string;
}

const BADGE_THEMES: Record<string, BadgeTheme> = {
  online: {
    bg: '#052e16',
    border: '#16a34a',
    dot: '#22c55e',
    text: '#86efac',
  },
  offline: {
    bg: '#0f172a',
    border: '#475569',
    dot: '#94a3b8',
    text: '#cbd5e1',
  },
  live: {
    bg: '#450a0a',
    border: '#dc2626',
    dot: '#ef4444',
    text: '#fca5a5',
  },
  error: {
    bg: '#450a0a',
    border: '#b91c1c',
    dot: '#f87171',
    text: '#fecaca',
  },
  success: {
    bg: '#022c22',
    border: '#059669',
    dot: '#10b981',
    text: '#6ee7b7',
  },
};

const DEFAULT_THEME: BadgeTheme = {
  bg: '#172554',
  border: '#2563eb',
  dot: '#3b82f6',
  text: '#93c5fd',
};

export class BadgeGenerator implements StickerGenerator {
  readonly name = 'badge';

  supports(input: GeneratorInput): boolean {
    return input.type === 'badge';
  }

  validate(input: GeneratorInput, _context: GeneratorContext): void {
    const raw = (input.text ?? input.content?.text ?? '') as string;
    const clean = sanitizeText(raw);
    if (!clean) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, 'Teks badge tidak boleh kosong');
    }
    if (countGraphemes(clean) > 24) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, 'Teks badge maksimal 24 karakter');
    }
  }

  async process(input: GeneratorInput, _context: GeneratorContext): Promise<ProcessingResult> {
    const raw = (input.text ?? input.content?.text ?? '') as string;
    const clean = sanitizeText(raw);
    if (!clean) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, 'Teks badge tidak boleh kosong');
    }
    if (countGraphemes(clean) > 24) {
      throw new AppError(ErrorCode.TEXT_TOO_LONG, 'Teks badge maksimal 24 karakter');
    }

    const themeKey = clean.toLowerCase();
    const theme = BADGE_THEMES[themeKey] ?? DEFAULT_THEME;

    const family = getFontFamily(getDefaultFontPath());
    const displayLabel = clean.toUpperCase();

    // Badge pill dimensions
    const badgeHeight = 110;
    const badgeY = Math.round((512 - badgeHeight) / 2);
    const fontSize = clean.length > 12 ? 30 : 38;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="${theme.border}" flood-opacity="0.5"/>
        </filter>
      </defs>
      <!-- Background pill -->
      <rect x="36" y="${badgeY}" width="440" height="${badgeHeight}" rx="55" fill="${theme.bg}" stroke="${theme.border}" stroke-width="4" filter="url(#glow)" />
      <!-- Indicator Dot -->
      <circle cx="95" cy="${badgeY + Math.round(badgeHeight / 2)}" r="16" fill="${theme.dot}" />
      <circle cx="95" cy="${badgeY + Math.round(badgeHeight / 2)}" r="24" fill="none" stroke="${theme.dot}" stroke-width="3" opacity="0.4" />
      <!-- Status Text -->
      <text x="270" y="${badgeY + Math.round(badgeHeight / 2) + Math.round(fontSize * 0.35)}" text-anchor="middle" font-family="${family},sans-serif" font-size="${fontSize}" font-weight="bold" fill="${theme.text}" letter-spacing="2">
        ${escapeXml(displayLabel)}
      </text>
    </svg>`;

    const buffer = await Sharp(Buffer.from(svg))
      .webp({ quality: 90 })
      .toBuffer();

    const meta = await Sharp(buffer).metadata();

    return {
      buffer,
      mimetype: 'image/webp',
      width: meta.width || 512,
      height: meta.height || 512,
      animated: false,
      size: buffer.length,
    };
  }
}
