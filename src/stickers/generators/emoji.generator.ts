import Sharp from 'sharp';
import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { splitGraphemes, sanitizeText, escapeXml, isEmojiGrapheme } from '../rendering/text-utils';
import { getDefaultFontPath, getFontFamily } from '../rendering/fonts';

export class EmojiGenerator implements StickerGenerator {
  readonly name = 'emoji';

  supports(input: GeneratorInput): boolean {
    return input.type === 'emoji';
  }

  validate(input: GeneratorInput, _context: GeneratorContext): void {
    const raw = (input.text ?? input.content?.text ?? '') as string;
    const clean = sanitizeText(raw);
    const graphemes = splitGraphemes(clean);
    const count = graphemes.length;
    if (count < 1 || count > 4) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, '❌ Command !emoji hanya menerima 1-4 emoji');
    }
    const allEmoji = graphemes.every((g) => isEmojiGrapheme(g));
    if (!allEmoji) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, '❌ Command !emoji hanya menerima karakter emoji yang valid');
    }
  }

  async process(input: GeneratorInput, _context: GeneratorContext): Promise<ProcessingResult> {
    const raw = (input.text ?? input.content?.text ?? '') as string;
    const clean = sanitizeText(raw);
    const graphemes = splitGraphemes(clean);
    const count = graphemes.length;

    if (count < 1 || count > 4) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, '❌ Command !emoji hanya menerima 1-4 emoji');
    }
    const allEmoji = graphemes.every((g) => isEmojiGrapheme(g));
    if (!allEmoji) {
      throw new AppError(ErrorCode.INVALID_ARGUMENT, '❌ Command !emoji hanya menerima karakter emoji yang valid');
    }

    let fontSize = 240;
    let y = 340;

    if (count === 2) {
      fontSize = 170;
      y = 320;
    } else if (count >= 3) {
      fontSize = 120;
      y = 300;
    }

    const defaultFamily = getFontFamily(getDefaultFontPath());
    const fontFamily = `${defaultFamily}, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <text x="256" y="${y}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize}">
        ${escapeXml(clean)}
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
