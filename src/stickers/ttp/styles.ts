import { escapeXml } from '../rendering/text-utils';

export interface TextStylePreset {
  name: string;
  renderBg(text: string): Buffer;
  textColor: string;
  outlineColor: string;
  outlineWidth: number;
}

const PALETTES: [string, string][] = [
  ['#8338ec', '#3a86ff'],
  ['#ff006e', '#8338ec'],
  ['#06d6a0', '#118ab2'],
  ['#f77f00', '#d62828'],
  ['#10002b', '#5a189a'],
  ['#22223b', '#4a4e69'],
];

export const textStylePresets: Record<string, TextStylePreset> = {
  gradient: {
    name: 'gradient',
    renderBg(text: string): Buffer {
      let hash = 0;
      const chars = Array.from(text);
      for (let i = 0; i < chars.length; i++) {
        hash = (hash * 31 + (chars[i].codePointAt(0) ?? 0)) >>> 0;
      }
      const [from, to] = PALETTES[hash % PALETTES.length];
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
        `</linearGradient></defs>` +
        `<rect width="512" height="512" rx="64" fill="url(#g)"/>` +
        `<text x="30" y="480" font-family="sans-serif" font-size="26" font-weight="bold" fill="#ffffff" opacity="0.85">${escapeXml('TTP')}</text>` +
        `</svg>`,
      );
    },
    textColor: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 2,
  },
  minimal: {
    name: 'minimal',
    renderBg(): Buffer {
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
        `<rect width="512" height="512" rx="48" fill="#1e293b"/>` +
        `<rect x="24" y="24" width="464" height="464" rx="36" fill="none" stroke="#334155" stroke-width="2"/>` +
        `</svg>`,
      );
    },
    textColor: '#f8fafc',
    outlineColor: 'transparent',
    outlineWidth: 0,
  },
  dark: {
    name: 'dark',
    renderBg(): Buffer {
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
        `<rect width="512" height="512" rx="48" fill="#09090b"/>` +
        `<rect x="16" y="16" width="480" height="480" rx="40" fill="none" stroke="#27272a" stroke-width="3"/>` +
        `</svg>`,
      );
    },
    textColor: '#ffffff',
    outlineColor: '#27272a',
    outlineWidth: 1,
  },
  terminal: {
    name: 'terminal',
    renderBg(): Buffer {
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
        `<rect width="512" height="512" rx="32" fill="#000000"/>` +
        `<rect x="12" y="12" width="488" height="488" rx="24" fill="none" stroke="#15803d" stroke-width="2"/>` +
        `</svg>`,
      );
    },
    textColor: '#22c55e',
    outlineColor: '#052e16',
    outlineWidth: 2,
  },
  gold: {
    name: 'gold',
    renderBg(): Buffer {
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
        `<defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="#2a1b0a"/><stop offset="1" stop-color="#140a02"/>` +
        `</linearGradient></defs>` +
        `<rect width="512" height="512" rx="56" fill="url(#gold)"/>` +
        `<rect x="24" y="24" width="464" height="464" rx="44" fill="none" stroke="#d97706" stroke-width="3" opacity="0.6"/>` +
        `</svg>`,
      );
    },
    textColor: '#fbbf24',
    outlineColor: '#78350f',
    outlineWidth: 2,
  },
  neon: {
    name: 'neon',
    renderBg(): Buffer {
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
        `<defs><linearGradient id="neon" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="#18002e"/><stop offset="1" stop-color="#020024"/>` +
        `</linearGradient></defs>` +
        `<rect width="512" height="512" rx="56" fill="url(#neon)"/>` +
        `<rect x="20" y="20" width="472" height="472" rx="44" fill="none" stroke="#ec4899" stroke-width="2" opacity="0.8"/>` +
        `</svg>`,
      );
    },
    textColor: '#38bdf8',
    outlineColor: '#db2777',
    outlineWidth: 2,
  },
};

textStylePresets.default = {
  ...textStylePresets.gradient,
  name: 'default',
};

import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export function resolveTtpStyle(name: string): TextStylePreset {
  const clean = name.trim().toLowerCase();
  const preset = textStylePresets[clean];
  if (!preset) {
    const valid = Object.keys(textStylePresets).filter((k) => k !== 'default').join(', ');
    throw new AppError(
      ErrorCode.INVALID_ARGUMENT,
      `❌ Style "${name}" tidak tersedia.\nPreset: ${valid}.`,
    );
  }
  return preset;
}

export function getTtpStyle(name?: string): TextStylePreset {
  if (!name) return textStylePresets.default;
  return resolveTtpStyle(name);
}

export function listTtpStyles(): string[] {
  return Object.keys(textStylePresets);
}
