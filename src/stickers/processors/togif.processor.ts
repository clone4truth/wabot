import { StickerResult } from '../result';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import fs from 'fs';

export class ToGifProcessor {
  async process(stickerBuffer: Buffer): Promise<StickerResult | null> {
    const inputPath = `/tmp/sticker_${Date.now()}.webp`;
    const outputPath = `/tmp/sticker_${Date.now()}.mp4`;

    try {
      await fs.promises.writeFile(inputPath, stickerBuffer);

      await new Promise<void>((resolve, reject) => {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg(inputPath)
          .outputFormat('mp4')
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });

      const mp4Buffer = await fs.promises.readFile(outputPath);

      return {
        buffer: mp4Buffer,
        mimetype: 'video/mp4' as any,
        width: 512,
        height: 512,
        animated: true,
        size: mp4Buffer.length,
      };
    } finally {
      try { fs.unlinkSync(inputPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}
