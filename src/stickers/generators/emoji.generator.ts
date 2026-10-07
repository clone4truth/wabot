import Sharp from 'sharp';
import { StickerGenerator, GeneratorInput, GeneratorContext } from './types';
import { ProcessingResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import { splitGraphemes, sanitizeText, isEmojiGrapheme } from '../rendering/text-utils';

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

    // SVG/libRSVG merender font emoji sebagai glyph satu warna. Input `text`
    // milik Sharp memakai Pango; `rgba: true` mempertahankan bitmap warna dari
    // Noto Color Emoji. Render besar dahulu, lalu fit agar 1-4 emoji tidak clip.
    const coloredEmoji = await Sharp({
      text: {
        text: clean,
        font: 'Noto Color Emoji 384',
        rgba: true,
      },
    })
      .resize(456, 456, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const emojiMeta = await Sharp(coloredEmoji).metadata();
    const left = Math.max(0, Math.round((512 - (emojiMeta.width || 0)) / 2));
    const top = Math.max(0, Math.round((512 - (emojiMeta.height || 0)) / 2));

    const buffer = await Sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: coloredEmoji, left, top }])
      .webp({ quality: 90, alphaQuality: 100 })
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
