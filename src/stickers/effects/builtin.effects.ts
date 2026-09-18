import Sharp from 'sharp';
import { ImageEffect } from './types';

export class BlurEffect implements ImageEffect {
  readonly name = 'blur';

  apply(image: Sharp.Sharp, options: Record<string, unknown> = {}): Sharp.Sharp {
    const rawRadius = Number(options.radius);
    const radius = Number.isFinite(rawRadius) && rawRadius > 0 && rawRadius <= 20 ? rawRadius : 5;
    return image.blur(radius);
  }
}

export class GrayscaleEffect implements ImageEffect {
  readonly name = 'grayscale';

  apply(image: Sharp.Sharp): Sharp.Sharp {
    return image.grayscale();
  }
}

export class SepiaEffect implements ImageEffect {
  readonly name = 'sepia';

  apply(image: Sharp.Sharp): Sharp.Sharp {
    return image.recomb([
      [0.393, 0.769, 0.189],
      [0.349, 0.686, 0.168],
      [0.272, 0.534, 0.131],
    ]);
  }
}

export class InvertEffect implements ImageEffect {
  readonly name = 'invert';

  apply(image: Sharp.Sharp): Sharp.Sharp {
    return image.negate({ alpha: false });
  }
}

export class PixelEffect implements ImageEffect {
  readonly name = 'pixel';

  async apply(image: Sharp.Sharp): Promise<Sharp.Sharp> {
    const pixelSize = 48;
    const downscaledBuffer = await image
      .resize(pixelSize, pixelSize, { kernel: 'nearest' })
      .toBuffer();
    return Sharp(downscaledBuffer).resize(512, 512, { kernel: 'nearest' });
  }
}

export class SharpenEffect implements ImageEffect {
  readonly name = 'sharpen';

  apply(image: Sharp.Sharp): Sharp.Sharp {
    return image.sharpen();
  }
}

export class ShadowEffect implements ImageEffect {
  readonly name = 'shadow';

  async apply(image: Sharp.Sharp): Promise<Sharp.Sharp> {
    const imgBuffer = await image.ensureAlpha().png().toBuffer();
    const meta = await Sharp(imgBuffer).metadata();
    const w = meta.width || 512;
    const h = meta.height || 512;

    const alpha = await Sharp(imgBuffer).extractChannel(3).toBuffer();
    const blurredAlpha = await Sharp(alpha).blur(8).toBuffer();

    const shadowLayer = await Sharp({
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.6 } },
    })
      .composite([{ input: blurredAlpha, blend: 'dest-in' }])
      .png()
      .toBuffer();

    const pad = 16;
    const canvas = await Sharp({
      create: { width: w + pad, height: h + pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: shadowLayer, top: 10, left: 10 },
        { input: imgBuffer, top: 0, left: 0 },
      ])
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    return Sharp(canvas);
  }
}
