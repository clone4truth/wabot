import Sharp from 'sharp';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { wrapWords, splitGraphemes } from './text-utils';
import { renderFittedText, FittedTextResult } from './text-layout';

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

/** Metadata boleh diringkas, tetapi setiap preview tetap diukur dan diberi ellipsis. */
async function fitPreview(
  text: string,
  width: number,
  fontSize: number,
  maxLines: number,
  fontWeight = 'normal',
  maxGraphemes = 140,
  color = '#ffffff',
): Promise<FittedTextResult> {
  const graphemes = splitGraphemes(String(text ?? '').replace(/\s+/g, ' ').trim() || '—');
  const height = Math.round(fontSize * 1.35) * maxLines;
  const fit = async (length: number): Promise<FittedTextResult | null> => {
    const preview = graphemes.slice(0, length).join('').trimEnd() + (length < graphemes.length ? '…' : '');
    try {
      return await renderFittedText({
        text: preview,
        maxWidth: width,
        maxHeight: height,
        minFontSize: fontSize,
        maxFontSize: fontSize,
        margin: 0,
        fontFamily: 'sans-serif',
        fontWeight,
        color,
        outlineColor: 'transparent',
        outlineWidth: 0,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.TEXT_TOO_LONG) return null;
      throw error;
    }
  };

  const limit = Math.min(graphemes.length, maxGraphemes);
  const complete = await fit(limit);
  if (complete) return complete;

  let low = 0;
  let high = limit - 1;
  let result = await fit(0);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = await fit(middle);
    if (candidate) {
      result = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (!result) throw new AppError(ErrorCode.TEXT_TOO_LONG, 'Preview tidak muat dalam bubble');
  return result;
}

export async function renderChatBubbleToBuffer(options: ChatBubbleOptions): Promise<Buffer> {
  const { senderName, senderId, quoted, avatar } = options;
  const text = String(options.text ?? '').trim();
  if (!text) throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Teks tidak boleh kosong');
  const time = options.time || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const W = 512;
  const bubbleX = 18;
  const bubbleW = 476;
  const pad = 20;
  const contentX = pad;
  const innerW = bubbleW - pad * 2;

  // Avatar hanya menempati header: seluruh lebar bubble tersedia untuk isi pesan.
  const avatarSize = 56;
  const avatarGap = 12;
  const nameX = contentX + (avatar ? avatarSize + avatarGap : 0);
  const nameWidth = innerW - (avatar ? avatarSize + avatarGap : 0);

  const nameSize = 28;
  const quoteNameSize = 22;
  const quoteBodySize = 22;
  const timeSize = 22;
  const nameColor = senderColor(senderId || senderName);
  const quotedColor = senderColor(quoted?.senderId || quoted?.senderName || '?');

  const quotePad = 12;
  const quoteTextX = contentX + quotePad + 4;
  const quoteWidth = innerW - quotePad * 2 - 4;
  const [nameLayout, timeLayout, quoteNameLayout, quoteBodyLayout] = await Promise.all([
    fitPreview(senderName, nameWidth, nameSize, 1, 'bold', 80, nameColor),
    fitPreview(time, innerW, timeSize, 1, 'normal', 80, '#8696a0'),
    quoted ? fitPreview(quoted.senderName, quoteWidth, quoteNameSize, 1, 'bold', 80, quotedColor) : null,
    quoted ? fitPreview(quoted.body, quoteWidth, quoteBodySize, 2, 'normal', 140, '#cfd4d9') : null,
  ]);

  const headerH = Math.max(nameLayout.contentHeight, avatar ? avatarSize : 0);
  const headerGap = 12;
  const quoteBoxH = quoted ? quotePad * 2 + quoteNameLayout!.contentHeight + 4 + quoteBodyLayout!.contentHeight : 0;
  const quoteH = quoted ? quoteBoxH + 12 : 0;
  const timeH = 4 + timeLayout.contentHeight;
  const fixedH = pad + headerH + headerGap + quoteH + timeH + pad;
  const maxBubbleH = W - 24;
  const maxAvailableTextH = maxBubbleH - fixedH;

  // Pilih teks terbesar yang benar-benar muat; isi utama tidak pernah dipotong.
  const textLayout = await renderFittedText({
    text,
    maxWidth: innerW,
    maxHeight: maxAvailableTextH,
    maxFontSize: 56,
    minFontSize: 18,
    margin: 0,
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    color: '#ffffff',
    outlineColor: 'transparent',
    outlineWidth: 0,
    align: 'left',
  });

  let y = pad;
  const overlays: Sharp.OverlayOptions[] = [];
  const nameTop = y + Math.round((headerH - nameLayout.contentHeight) / 2);
  y += headerH + headerGap;

  // Blok quote (balasan)
  let quoteTop = 0;
  let quoteNameTop = 0;
  let quoteBodyTop = 0;
  if (quoted) {
    quoteTop = y;
    quoteNameTop = y + quotePad;
    quoteBodyTop = quoteNameTop + quoteNameLayout!.contentHeight + 4;
    y += quoteH;
  }

  const textTop = y;
  y += textLayout.contentHeight;

  // Jam
  y += 4;
  const timeTop = y;
  y += timeLayout.contentHeight;

  const bubbleH = y + pad;
  const bubbleY = Math.max(12, Math.round((W - bubbleH) / 2));

  // Avatar lingkaran di kiri atas bubble
  let defs = '';
  let avatarEl = '';
  if (avatar) {
    const dataUri = `data:${avatar.mimetype};base64,${avatar.buffer.toString('base64')}`;
    const cx = bubbleX + pad + avatarSize / 2;
    const cy = bubbleY + pad + avatarSize / 2;
    defs = `<defs><clipPath id="av"><circle cx="${cx}" cy="${cy}" r="${avatarSize / 2}"/></clipPath></defs>`;
    avatarEl = `<image href="${dataUri}" x="${cx - avatarSize / 2}" y="${cy - avatarSize / 2}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>`;
  }

  const quoteElements = quoted
    ? `<rect x="${bubbleX + contentX}" y="${bubbleY + quoteTop}" width="${innerW}" height="${quoteBoxH}" rx="10" fill="#ffffff" opacity="0.07"/>` +
      `<rect x="${bubbleX + contentX}" y="${bubbleY + quoteTop}" width="5" height="${quoteBoxH}" rx="2.5" fill="${quotedColor}"/>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">` + defs +
    `<rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="26" fill="#1f2c34"/>` +
    `<polygon points="${bubbleX + 18},${bubbleY} ${bubbleX - 12},${bubbleY + 6} ${bubbleX + 18},${bubbleY + 30}" fill="#1f2c34"/>` +
    quoteElements +
    avatarEl +
    `</svg>`;

  overlays.push({ input: nameLayout.contentBuffer, left: bubbleX + nameX, top: bubbleY + nameTop });
  if (quoted) {
    overlays.push(
      { input: quoteNameLayout!.contentBuffer, left: bubbleX + quoteTextX, top: bubbleY + quoteNameTop },
      { input: quoteBodyLayout!.contentBuffer, left: bubbleX + quoteTextX, top: bubbleY + quoteBodyTop },
    );
  }
  overlays.push(
    { input: textLayout.contentBuffer, left: bubbleX + contentX, top: bubbleY + textTop },
    {
      input: timeLayout.contentBuffer,
      left: bubbleX + contentX + innerW - timeLayout.contentWidth,
      top: bubbleY + timeTop,
    },
  );

  return Sharp(Buffer.from(svg)).composite(overlays).webp({ quality: 90 }).toBuffer();
}
