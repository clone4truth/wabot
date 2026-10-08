import sharp from 'sharp';
import { BackgroundRemovalProvider, BackgroundRemovalOptions } from '../types';
import env from '../../../config/env';
import { AppError } from '../../../errors/app-error';
import { ErrorCode } from '../../../errors/error-codes';
import { inferForegroundMask, MODEL_EDGE } from '../inference-worker';

// Sticker output is 512px; 1024px preserves edges while avoiding a second
// full-resolution RGBA allocation for a 25MP photograph.
const OUTPUT_EDGE = 1024;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export class LocalBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = 'local';

  async removeBackground(input: Buffer, options: BackgroundRemovalOptions = {}): Promise<Buffer> {
    const deadline = Date.now() + (options.timeoutMs ?? env.backgroundRemovalTimeoutMs);
    const checkDeadline = () => {
      if (options.signal?.aborted || Date.now() >= deadline) {
        throw new AppError(ErrorCode.PROCESSING_TIMEOUT, 'Pemrosesan background dibatalkan atau melewati batas waktu');
      }
    };
    checkDeadline();

    const { data, info } = await sharp(input, {
      limitInputPixels: env.backgroundRemovalMaxPixels,
      failOn: 'warning',
    })
      .rotate()
      .resize(OUTPUT_EDGE, OUTPUT_EDGE, { fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    checkDeadline();

    // Existing cutouts already have the correct mask. Keep their transparent
    // edges and details instead of asking the model to segment them again.
    let transparentPixels = 0;
    const cutoutThreshold = info.width * info.height * 0.01;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 16) transparentPixels++;
      if (transparentPixels > cutoutThreshold) break;
    }
    if (transparentPixels <= cutoutThreshold) {
      const rgb = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .flatten({ background: 'white' })
        .resize(MODEL_EDGE, MODEL_EDGE, { fit: 'fill', kernel: 'lanczos3' })
        .raw()
        .toBuffer();
      checkDeadline();

      // U²-NetP uses NCHW RGB, scaled by the image maximum and ImageNet
      // means/stddevs, matching the published model's preprocessing.
      const plane = MODEL_EDGE * MODEL_EDGE;
      const tensor = new Float32Array(3 * plane);
      let max = 1;
      for (const value of rgb) max = Math.max(max, value);
      for (let i = 0; i < plane; i++) {
        for (let channel = 0; channel < 3; channel++) {
          tensor[channel * plane + i] = (rgb[i * 3 + channel] / max - MEAN[channel]) / STD[channel];
        }
      }
      const mask = await inferForegroundMask(tensor, options, deadline);
      checkDeadline();
      const alpha = await sharp(mask, { raw: { width: MODEL_EDGE, height: MODEL_EDGE, channels: 1 } })
        .resize(info.width, info.height, { fit: 'fill', kernel: 'lanczos3' })
        .toColourspace('b-w')
        .raw()
        .toBuffer();
      checkDeadline();
      for (let i = 0; i < alpha.length; i++) {
        // Tiny probability noise in the background would count as visible
        // content when fitting the subject. Keep real soft edges, clear only
        // the near-transparent floor, and make the subject interior opaque.
        const predictedAlpha = alpha[i] < 5 ? 0 : alpha[i] > 250 ? 255 : alpha[i];
        data[i * 4 + 3] = Math.round(data[i * 4 + 3] * predictedAlpha / 255);
      }
    }

    const output = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer();
    checkDeadline();
    return output;
  }
}
