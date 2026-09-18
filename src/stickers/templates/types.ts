import { StickerResult } from '../result';

export interface StickerTemplate {
  readonly name: string;
  readonly description: string;
  readonly supportedInput: 'text' | 'image' | 'text+image';
  render(input: { text?: string; imageBuffer?: Buffer }): Promise<StickerResult>;
}
