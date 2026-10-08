import path from 'path';
import Sharp from 'sharp';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { wrapWords, splitGraphemes } from './text-utils';
import { escapePangoMarkup } from './text-layout';

const NAME_COLORS = ['#e542a3', '#e7b75b', '#a5b337', '#1fa855', '#53bdeb', '#a695e7', '#ff6b6b', '#00a884'];
const BUBBLE_STYLES = {
  incoming: { background: '#202c33', time: '#8696a0', quote: '#1d282f' },
  outgoing: { background: '#005c4b', time: '#99beb6', quote: '#025144' },
};
const TEXT_COLOR = '#e9edef';
const FONT_DIRECTORY = path.resolve(__dirname, '../../../assets/fonts');

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
  direction?: 'incoming' | 'outgoing';
  showSenderName?: boolean;
}

export function senderColor(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

/** Legacy wrapper; bubble layout uses measured glyph widths. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  return wrapWords(text, maxChars, maxLines);
}

interface TextLayer {
  buffer: Buffer;
  width: number;
  height: number;
}

type MeasureLine = (text: string) => Promise<TextLayer>;

/** Bundled Roboto and Pango keep font metrics consistent and retain colour emoji. */
async function renderLine(text: string, size: number, color: string, medium = false): Promise<TextLayer> {
  const { data, info } = await Sharp({
    text: {
      // A transparent reference retains ascent/descent across lowercase/capitals.
      text: `<span foreground="${color}">${escapePangoMarkup(text)}</span><span alpha="1">Ágj</span>`,
      font: `Roboto ${medium ? 'Medium' : 'Normal'} ${size}`,
      fontfile: path.join(FONT_DIRECTORY, medium ? 'Roboto-Medium.ttf' : 'Roboto-Regular.ttf'),
      dpi: 72,
      rgba: true,
    },
  }).raw().toBuffer({ resolveWithObject: true });
  let right = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = (y * info.width + x) * info.channels + 3;
      if (data[alpha] <= 1) data[alpha] = 0;
      else right = Math.max(right, x);
    }
  }
  const width = Math.max(1, right + 1);
  const buffer = await Sharp(data, { raw: info })
    .extract({ left: 0, top: 0, width, height: info.height }).png().toBuffer();
  return { buffer, width, height: info.height };
}

/** Preserve explicit newlines, splitting a token only if it cannot fit intact. */
async function wrapMeasured(text: string, width: number, measure: MeasureLine): Promise<string[]> {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let current = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if ((await measure(candidate)).width <= width) { current = candidate; continue; }
      if (current) lines.push(current);
      current = '';
      if ((await measure(word)).width <= width) { current = word; continue; }
      for (const grapheme of splitGraphemes(word)) {
        if ((await measure(current + grapheme)).width > width) {
          if (!current) throw new AppError(ErrorCode.TEXT_TOO_LONG, 'Glyph tidak muat dalam bubble');
          lines.push(current);
          current = grapheme;
        } else current += grapheme;
      }
    }
    lines.push(current);
  }
  return lines;
}

async function preview(text: string, width: number, maxLines: number, measure: MeasureLine): Promise<string[]> {
  const graphemes = splitGraphemes(String(text ?? '').replace(/\s+/g, ' ').trim() || '—');
  const fits = async (length: number) => {
    const candidate = graphemes.slice(0, length).join('').trimEnd() + (length < graphemes.length ? '…' : '');
    const lines = await wrapMeasured(candidate, width, measure);
    return lines.length <= maxLines ? lines : null;
  };
  const limit = Math.min(graphemes.length, 140);
  const complete = await fits(limit);
  if (complete) return complete;
  let low = 0;
  let high = limit - 1;
  let result = ['…'];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = await fits(middle);
    if (candidate) { result = candidate; low = middle + 1; }
    else high = middle - 1;
  }
  return result;
}

export async function renderChatBubbleToBuffer(options: ChatBubbleOptions): Promise<Buffer> {
  const text = String(options.text ?? '').trim();
  if (!text) throw new AppError(ErrorCode.UNSUPPORTED_INPUT, 'Teks tidak boleh kosong');
  if (splitGraphemes(text).length > 2000) throw new AppError(ErrorCode.TEXT_TOO_LONG, 'Teks tidak muat dalam bubble');
  const { senderName, senderId, quoted } = options;
  const outgoing = options.direction === 'outgoing';
  const showSenderName = !outgoing && options.showSenderName !== false;
  const style = BUBBLE_STYLES[outgoing ? 'outgoing' : 'incoming'];
  const avatar = showSenderName ? options.avatar : null;
  const time = options.time ?? new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: process.env.TZ || 'Asia/Jakarta',
  }).format(new Date());
  const canvas = 512;
  const margin = 12;
  const avatarSize = avatar ? 64 : 0;
  const avatarGap = avatar ? 12 : 0;
  const tailWidth = 20;
  const maxBubbleWidth = Math.min(420, canvas - margin * 2 - avatarSize - avatarGap - tailWidth);
  const nameColor = senderColor(senderId || senderName);
  const quotedColor = senderColor(quoted?.senderId || quoted?.senderName || '?');

  // Keep normal messages at a consistent 2x14px size; shrink only to fit the
  // sticker's height. Metadata has its own lower baseline, as in the reference.
  for (let bodySize = 28; bodySize >= 18; bodySize -= 2) {
    const nameSize = Math.round(bodySize * 14 / 16);
    const timeSize = Math.round(bodySize * 11 / 14);
    const quoteSize = Math.round(bodySize * 14 / 16);
    const padX = Math.round(bodySize / 2);
    const padTop = Math.round(bodySize * 0.5);
    const padBottom = Math.round(bodySize * 0.25);
    const quotePadding = Math.round(bodySize * 0.3);
    const headerGap = Math.round(bodySize * 0.1);
    const timeGap = Math.round(bodySize * 0.4);
    const timeDrop = Math.round(bodySize * 0.45);
    const footerGap = Math.round(bodySize * 0.1);
    const innerWidth = maxBubbleWidth - padX * 2;
    const cache = new Map<string, Promise<TextLayer>>();
    const measure = (size: number, color: string, medium = false): MeasureLine => (value) => {
      const key = `${size}:${color}:${medium}:${value}`;
      if (!cache.has(key)) cache.set(key, renderLine(value, size, color, medium));
      return cache.get(key)!;
    };
    const bodyMeasure = measure(bodySize, TEXT_COLOR);
    const nameMeasure = measure(nameSize, nameColor, true);
    const quoteNameMeasure = measure(quoteSize, quotedColor, true);
    const quoteBodyMeasure = measure(quoteSize, '#aebac1');
    const [nameLines, lines, timeLayer, quoteNameLines, quoteBodyLines] = await Promise.all([
      showSenderName ? preview(senderName, innerWidth, 1, nameMeasure) : [],
      wrapMeasured(text, innerWidth, bodyMeasure),
      measure(timeSize, style.time)(time),
      quoted ? preview(quoted.senderName, innerWidth - padX, 1, quoteNameMeasure) : [],
      quoted ? preview(quoted.body, innerWidth - padX, 2, quoteBodyMeasure) : [],
    ]);
    const nameLayer = showSenderName ? await nameMeasure(nameLines[0]) : null;
    const bodyLayers = await Promise.all(lines.map(bodyMeasure));
    const quoteNameLayer = quoted ? await quoteNameMeasure(quoteNameLines[0]) : null;
    const quoteBodyLayers = await Promise.all(quoteBodyLines.map(quoteBodyMeasure));
    const bodyLineHeight = Math.max(Math.round(bodySize * 1.2), ...bodyLayers.map(layer => layer.height));
    const quoteLineHeight = Math.max(Math.round(quoteSize * 1.2), ...quoteBodyLayers.map(layer => layer.height));
    const quoteHeight = quoted ? quotePadding * 2 + quoteNameLayer!.height + headerGap + quoteBodyLayers.length * quoteLineHeight : 0;
    const headerHeight = nameLayer ? nameLayer.height + headerGap : 0;
    const textTop = padTop + headerHeight + (quoted ? quoteHeight + quotePadding : 0);
    const lastWidth = lines.at(-1) ? bodyLayers.at(-1)!.width : 0;
    const inlineTime = lastWidth + timeGap + timeLayer.width <= innerWidth;
    const contentWidth = Math.max(nameLayer?.width ?? 0, ...bodyLayers.map(layer => layer.width),
      inlineTime ? lastWidth + timeGap + timeLayer.width : timeLayer.width,
      quoted ? quoteNameLayer!.width + padX : 0, ...quoteBodyLayers.map(layer => layer.width + padX));
    const bubbleWidth = Math.ceil(contentWidth + padX * 2);
    const bodyBottom = textTop + bodyLineHeight * (lines.length - 1) + bodyLayers.at(-1)!.height;
    const timeTop = inlineTime ? bodyBottom - timeLayer.height + timeDrop : bodyBottom + footerGap;
    const bubbleHeight = Math.ceil(Math.max(bodyBottom, timeTop + timeLayer.height) + padBottom);
    if (bubbleHeight > canvas - margin * 2 || bubbleWidth > maxBubbleWidth) continue;

    const groupLeft = margin;
    const bubbleX = outgoing ? canvas - margin - tailWidth - bubbleWidth : groupLeft + avatarSize + avatarGap + tailWidth;
    const bubbleY = Math.round((canvas - bubbleHeight) / 2);
    const radius = Math.round(bodySize * 0.45);
    const tailHeight = Math.round(bodySize * 0.6);
    const quoteTop = bubbleY + padTop + headerHeight;
    // Reflect just the bubble outline, leaving text and the quoted message readable.
    const tailTransform = outgoing ? ` transform="translate(${bubbleX * 2 + bubbleWidth} 0) scale(-1 1)"` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
      `<path d="M ${bubbleX + radius} ${bubbleY} H ${bubbleX + bubbleWidth - radius} Q ${bubbleX + bubbleWidth} ${bubbleY} ${bubbleX + bubbleWidth} ${bubbleY + radius} V ${bubbleY + bubbleHeight - radius} Q ${bubbleX + bubbleWidth} ${bubbleY + bubbleHeight} ${bubbleX + bubbleWidth - radius} ${bubbleY + bubbleHeight} H ${bubbleX + radius} Q ${bubbleX} ${bubbleY + bubbleHeight} ${bubbleX} ${bubbleY + bubbleHeight - radius} V ${bubbleY + tailHeight} L ${bubbleX - tailWidth + 2} ${bubbleY + 4} Q ${bubbleX - tailWidth} ${bubbleY} ${bubbleX - tailWidth + 5} ${bubbleY} Z" fill="${style.background}"${tailTransform}/>` +
      (quoted ? `<rect x="${bubbleX + padX}" y="${quoteTop}" width="${contentWidth}" height="${quoteHeight}" rx="8" fill="${style.quote}"/><rect x="${bubbleX + padX}" y="${quoteTop}" width="6" height="${quoteHeight}" rx="3" fill="${quotedColor}"/>` : '') + `</svg>`;
    const overlays: Sharp.OverlayOptions[] = [
      ...(nameLayer ? [{ input: nameLayer.buffer, left: bubbleX + padX, top: bubbleY + padTop }] : []),
      ...bodyLayers.map((layer, i) => ({ input: layer.buffer, left: bubbleX + padX, top: bubbleY + textTop + i * bodyLineHeight })),
      { input: timeLayer.buffer, left: bubbleX + bubbleWidth - padX - timeLayer.width, top: bubbleY + timeTop },
    ];
    if (quoted) {
      const quoteX = bubbleX + padX + Math.round(padX / 2);
      const quoteY = quoteTop + quotePadding;
      overlays.push({ input: quoteNameLayer!.buffer, left: quoteX, top: quoteY },
        ...quoteBodyLayers.map((layer, i) => ({ input: layer.buffer, left: quoteX, top: quoteY + quoteNameLayer!.height + headerGap + i * quoteLineHeight })));
    }
    if (avatar) {
      const mask = Buffer.from(`<svg width="${avatarSize}" height="${avatarSize}"><circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" fill="white"/></svg>`);
      const avatarBuffer = await Sharp(avatar.buffer).rotate().resize(avatarSize, avatarSize, { fit: 'cover' })
        .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
      overlays.push({ input: avatarBuffer, left: groupLeft, top: bubbleY + bubbleHeight - avatarSize });
    }
    return Sharp(Buffer.from(svg)).composite(overlays).webp({ lossless: true }).toBuffer();
  }
  throw new AppError(ErrorCode.TEXT_TOO_LONG, 'Teks tidak muat dalam bubble');
}
