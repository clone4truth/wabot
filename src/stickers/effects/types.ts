import Sharp from 'sharp';

export interface ImageEffect {
  readonly name: string;
  apply(
    image: Sharp.Sharp,
    options?: Record<string, unknown>,
  ): Sharp.Sharp | Promise<Sharp.Sharp>;
}
