import Sharp from 'sharp';

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
  time?: string;
}

export function senderColor(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Bungkus kata perkiraan lebar font sans (cukup untuk SVG tanpa autowrap).
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (lines.length >= maxLines) break;
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function renderChatBubbleToBuffer(options: ChatBubbleOptions): Promise<Buffer> {
  const { senderName, senderId, quoted } = options;
  const text = String(options.text ?? '');
  const time = options.time || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const W = 512;
  const bubbleX = 30;
  const bubbleW = 452;
  const pad = 26;
  const innerW = bubbleW - pad * 2;

  const nameSize = 30;
  const quoteNameSize = 24;
  const quoteBodySize = 24;
  const textSize = 34;
  const timeSize = 22;

  const nameColor = senderColor(senderId || senderName);
  const quotedColor = senderColor(quoted?.senderId || quoted?.senderName || '?');
  const quotedLines = quoted ? wrapText(quoted.body.slice(0, 140), Math.floor(innerW / (quoteBodySize * 0.5)) - 4, 2) : [];
  const textLines = wrapText(text, Math.floor(innerW / (textSize * 0.5)), 10);

  const lh = (s: number) => Math.round(s * 1.35);
  let y = pad + 8;
  const parts: string[] = [];

  // Nama pengirim
  parts.push(`<text x="${pad}" y="${y + nameSize}" font-family="sans-serif" font-size="${nameSize}" font-weight="bold" fill="${nameColor}">${escapeXml(senderName)}</text>`);
  y += lh(nameSize) + 8;

  // Blok quote (balasan)
  if (quoted) {
    const quoteH = 14 + lh(quoteNameSize) + quotedLines.length * lh(quoteBodySize) + 14;
    parts.push(`<rect x="${pad - 10}" y="${y}" width="${innerW + 20}" height="${quoteH}" rx="12" fill="#ffffff" opacity="0.07"/>`);
    parts.push(`<rect x="${pad - 10}" y="${y}" width="7" height="${quoteH}" rx="3.5" fill="${quotedColor}"/>`);
    let qy = y + 14;
    parts.push(`<text x="${pad + 12}" y="${qy + quoteNameSize}" font-family="sans-serif" font-size="${quoteNameSize}" font-weight="bold" fill="${quotedColor}">${escapeXml(quoted.senderName)}</text>`);
    qy += lh(quoteNameSize);
    for (const line of quotedLines) {
      parts.push(`<text x="${pad + 12}" y="${qy + quoteBodySize}" font-family="sans-serif" font-size="${quoteBodySize}" fill="#cfd4d9">${escapeXml(line)}</text>`);
      qy += lh(quoteBodySize);
    }
    y += quoteH + 12;
  }

  // Teks utama
  for (const line of textLines) {
    parts.push(`<text x="${pad}" y="${y + textSize}" font-family="sans-serif" font-size="${textSize}" fill="#ffffff">${escapeXml(line)}</text>`);
    y += lh(textSize);
  }

  // Jam
  y += 4;
  parts.push(`<text x="${pad + innerW}" y="${y + timeSize}" font-family="sans-serif" font-size="${timeSize}" fill="#8696a0" text-anchor="end">${escapeXml(time)}</text>`);
  y += lh(timeSize);

  const bubbleH = y + pad;
  const bubbleY = Math.max(14, Math.round((W - bubbleH) / 2));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">` +
    `<rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="26" fill="#1f2c34"/>` +
    `<polygon points="${bubbleX + 18},${bubbleY} ${bubbleX - 12},${bubbleY + 6} ${bubbleX + 18},${bubbleY + 30}" fill="#1f2c34"/>` +
    `<g transform="translate(${bubbleX},${bubbleY})">${parts.join('')}</g>` +
    `</svg>`;

  return Sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
}
