import Sharp from 'sharp';
import { BackgroundRemovalProvider, BackgroundRemovalOptions } from '../types';

export class LocalBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'local';

  async removeBackground(input: Buffer, _options?: BackgroundRemovalOptions): Promise<Buffer> {
    const sharpImg = Sharp(input).ensureAlpha();
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
    const out = Buffer.from(data);

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

    return Sharp(out, {
      raw: { width, height, channels },
    })
      .png()
      .toBuffer();
  }
}
