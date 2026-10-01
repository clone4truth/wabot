import sharp from 'sharp';
import { BackgroundRemovalProvider, BackgroundRemovalOptions } from '../types';
import env from '../../../config/env';
import { AppError } from '../../../errors/app-error';
import { ErrorCode } from '../../../errors/error-codes';

export class LocalBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'local';

  async removeBackground(input: Buffer, options?: BackgroundRemovalOptions): Promise<Buffer> {
    if (options?.signal?.aborted) {
      throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan');
    }

    // WAJIB: tanpa limitInputPixels, gambar 16384x16384 di-decode jadi ~1 GB
    // raw RGBA, lalu `new Buffer(data)` di bawah menambah salinan kedua.
    const sharpImg = sharp(input, { limitInputPixels: env.backgroundRemovalMaxPixels, failOn: 'warning' })
      .ensureAlpha();
    const { data, info } = await sharpImg.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    // Sample corner pixels to estimate background color
    const corners = [
      0, // top-left
      (width - 1) * channels, // top-right
      ((height - 1) * width) * channels, // bottom-left
      ((height - 1) * width + (width - 1)) * channels, // bottom-right
    ];

    let bgR = 0, bgG = 0, bgB = 0;
    for (const c of corners) {
      bgR += data[c];
      bgG += data[c + 1];
      bgB += data[c + 2];
    }
    bgR = Math.round(bgR / corners.length);
    bgG = Math.round(bgG / corners.length);
    bgB = Math.round(bgB / corners.length);

    const threshold = 35;
    // `data` sudah dipegang sharp sebagai buffer milik kita; tulis ulang alpha
    // secara in-place. `Buffer.from(data)` di sini berarti alokasi kedua sebesar
    // penuh (mis. 100 MB pada 25 MP) hanya untuk menulis byte yang sama.
    const out = data;

    if (options?.signal?.aborted) {
      throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Job dibatalkan');
    }

    for (let i = 0; i < out.length; i += channels) {
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];

      const diff = Math.sqrt(
        (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2
      );

      if (diff < threshold) {
        out[i + 3] = 0; // set alpha to 0
      }
    }

    return sharp(out, {
      raw: { width, height, channels },
    })
      .png()
      .toBuffer();
  }
}
