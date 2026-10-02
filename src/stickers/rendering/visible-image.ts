import sharp from 'sharp';
import { sharpInputOptions } from '../../media/sharp-runtime';

/** Fit visible pixels, ignoring only fully transparent outer rows/columns. */
export async function fitVisibleImage(
  input: string | Buffer,
  size: number = 512,
  padding: number = 12,
): Promise<sharp.Sharp> {
  const options = sharpInputOptions();
  const image = sharp(input, options).rotate();
  const metadata = await sharp(input, options).metadata();
  const background = { r: 0, g: 0, b: 0, alpha: 0 };

  if (!metadata.hasAlpha) {
    return image.resize(size, size, { fit: 'contain', background });
  }

  // Materialize alpha separately: trim precedes extractChannel in Sharp's
  // pipeline. Trimming the original RGB image could remove visible borders.
  const { data: alpha, info: original } = await sharp(input, options)
    .rotate()
    .extractChannel('alpha')
    .png()
    .toBuffer({ resolveWithObject: true });
  if (original.width < 3 || original.height < 3) {
    return image.resize(size, size, { fit: 'contain', background });
  }
  const { info: bounds } = await sharp(alpha, options)
    .trim({ background: 'black', threshold: 0, lineArt: true })
    .png()
    .toBuffer({ resolveWithObject: true });

  // Empty/opaque images retain their original size. Keep their whole canvas.
  if (bounds.width === original.width && bounds.height === original.height) {
    return image.resize(size, size, { fit: 'contain', background });
  }

  return image
    .extract({
      left: -(bounds.trimOffsetLeft ?? 0),
      top: -(bounds.trimOffsetTop ?? 0),
      width: bounds.width,
      height: bounds.height,
    })
    .resize(size - padding * 2, size - padding * 2, { fit: 'contain', background })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background });
}
