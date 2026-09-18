import Sharp from 'sharp';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { escapeXml, wrapWords } from './text-utils';

// Palet warna nama ala WhatsApp.
const NAME_COLORS = ['#ff8fab', '#ffb86b', '#ffd60a', '#7bed6f', '#4cc9f0', '#b892ff', '#ff6b6b', '#4dd0a6'];

export interface QuotedMessage {
  senderName: string;
  senderId?: string;
  body: string;
}

export interface ChatBubbleOptions {
  senderName: string;
  senderId: string;
  text: string;
  quoted?: QuotedMessage;
  avatar?: { buffer: Buffer; mimetype: string } | null;
  time?: string;
}

export function senderColor(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

/**
 * Bungkus kata ke baris-baris (backward-compatible wrapper mengarah ke wrapWords).
 */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  return wrapWords(text, maxChars, maxLines);
}

export async function renderChatBubbleToBuffer(options: ChatBubbleOptions): Promise<Buffer> {
  const { senderName, senderId, quoted, avatar } = options;
  const text = String(options.text ?? '').trim();
  const time = options.time || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const W = 512;
  const bubbleX = 30;
  const bubbleW = 452;
  const pad = 26;

  // Kolom avatar di kiri bila foto profil tersedia.
  const avatarSize = 76;
  const avatarGap = 18;
  const indent = avatar ? avatarSize + avatarGap : 0;
  const contentX = pad + indent;
  const innerW = bubbleW - pad - indent - pad;

  const nameSize = 30;
  const quoteNameSize = 24;
  const quoteBodySize = 24;
  const timeSize = 22;

  const lh = (s: number) => Math.round(s * 1.35);

  const nameColor = senderColor(senderId || senderName);
  const quotedColor = senderColor(quoted?.senderId || quoted?.senderName || '?');

  // Preview kutipan: sengaja dibatasi maksimal 140 karakter Unicode untuk ringkasan UI chat WhatsApp.
  const quotedRaw = quoted ? Array.from(quoted.body).slice(0, 140).join('') : '';
  const quotedSuffix = quoted && Array.from(quoted.body).length > 140 ? '...' : '';
  const quotedPreview = quoted ? `${quotedRaw}${quotedSuffix}` : '';
  const quotedLines = quoted ? wrapWords(quotedPreview, Math.max(4, Math.floor(innerW / (quoteBodySize * 0.62)) - 4), 2) : [];

  // Hitung tinggi komponen tetap sebelum teks utama
  const nameH = lh(nameSize) + 8;
  const quoteH = quoted ? (14 + lh(quoteNameSize) + quotedLines.length * lh(quoteBodySize) + 14 + 12) : 0;
  const timeH = 4 + lh(timeSize);
  const fixedH = pad + 8 + nameH + quoteH + timeH + pad;

  // Batas maksimum tinggi bubble agar muat di canvas 512x512 dengan margin atas/bawah minimal 14px
  const maxBubbleH = W - 28; // 484px
  const maxAvailableTextH = maxBubbleH - fixedH;

  // Adaptive font layout fitting: coba font 34 turun hingga 18
  let chosenTextSize = 18;
  let chosenTextLines: string[] = [];
  let foundFit = false;

  for (let size = 34; size >= 18; size -= 2) {
    const maxChars = Math.max(4, Math.floor(innerW / (size * 0.62)));
    const lines = wrapWords(text, maxChars);
    const textH = lines.length * lh(size);
    if (textH <= maxAvailableTextH) {
      chosenTextSize = size;
      chosenTextLines = lines;
      foundFit = true;
      break;
    }
  }

  if (!foundFit) {
    throw new AppError(ErrorCode.TEXT_TOO_LONG, 'Teks terlalu panjang untuk dimuat ke dalam bubble');
  }

  let y = pad + 8;
  const parts: string[] = [];

  // Nama pengirim
  parts.push(`<text x="${contentX}" y="${y + nameSize}" font-family="sans-serif" font-size="${nameSize}" font-weight="bold" fill="${nameColor}">${escapeXml(senderName)}</text>`);
  y += nameH;

  // Blok quote (balasan)
  if (quoted) {
    const qBoxH = 14 + lh(quoteNameSize) + quotedLines.length * lh(quoteBodySize) + 14;
    parts.push(`<rect x="${contentX - 10}" y="${y}" width="${innerW + 20}" height="${qBoxH}" rx="12" fill="#ffffff" opacity="0.07"/>`);
    parts.push(`<rect x="${contentX - 10}" y="${y}" width="7" height="${qBoxH}" rx="3.5" fill="${quotedColor}"/>`);
    let qy = y + 14;
    parts.push(`<text x="${contentX + 12}" y="${qy + quoteNameSize}" font-family="sans-serif" font-size="${quoteNameSize}" font-weight="bold" fill="${quotedColor}">${escapeXml(quoted.senderName)}</text>`);
    qy += lh(quoteNameSize);
    for (const line of quotedLines) {
      parts.push(`<text x="${contentX + 12}" y="${qy + quoteBodySize}" font-family="sans-serif" font-size="${quoteBodySize}" fill="#cfd4d9">${escapeXml(line)}</text>`);
      qy += lh(quoteBodySize);
    }
    y += qBoxH + 12;
  }

  // Teks utama adaptif tanpa silent truncation
  for (const line of chosenTextLines) {
    parts.push(`<text x="${contentX}" y="${y + chosenTextSize}" font-family="sans-serif" font-size="${chosenTextSize}" fill="#ffffff">${escapeXml(line)}</text>`);
    y += lh(chosenTextSize);
  }

  // Jam
  y += 4;
  parts.push(`<text x="${contentX + innerW}" y="${y + timeSize}" font-family="sans-serif" font-size="${timeSize}" fill="#8696a0" text-anchor="end">${escapeXml(time)}</text>`);
  y += lh(timeSize);

  const bubbleH = y + pad;
  const bubbleY = Math.max(14, Math.round((W - bubbleH) / 2));

  // Avatar lingkaran di kiri atas bubble
  let defs = '';
  let avatarEl = '';
  if (avatar) {
    const dataUri = `data:${avatar.mimetype};base64,${avatar.buffer.toString('base64')}`;
    const cx = bubbleX + pad + avatarSize / 2;
    const cy = bubbleY + pad + 8 + avatarSize / 2;
    defs = `<defs><clipPath id="av"><circle cx="${cx}" cy="${cy}" r="${avatarSize / 2}"/></clipPath></defs>`;
    avatarEl = `<image href="${dataUri}" x="${cx - avatarSize / 2}" y="${cy - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">` + defs +
    `<rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="26" fill="#1f2c34"/>` +
    `<polygon points="${bubbleX + 18},${bubbleY} ${bubbleX - 12},${bubbleY + 6} ${bubbleX + 18},${bubbleY + 30}" fill="#1f2c34"/>` +
    avatarEl +
    `<g transform="translate(${bubbleX},${bubbleY})">${parts.join('')}</g>` +
    `</svg>`;

  return Sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
}
