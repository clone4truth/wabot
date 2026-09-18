import { ImageEffect } from './types';
import {
  BlurEffect,
  GrayscaleEffect,
  SepiaEffect,
  InvertEffect,
  PixelEffect,
  SharpenEffect,
  ShadowEffect,
} from './builtin.effects';

export class EffectRegistry {
  private effects = new Map<string, ImageEffect>();

  constructor() {
    this.register(new BlurEffect());
    this.register(new GrayscaleEffect());
    this.register(new SepiaEffect());
    this.register(new InvertEffect());
    this.register(new PixelEffect());
    this.register(new SharpenEffect());
    this.register(new ShadowEffect());
  }

  register(effect: ImageEffect): void {
    this.effects.set(effect.name.toLowerCase(), effect);
  }

  get(name: string): ImageEffect | undefined {
    return this.effects.get(name.toLowerCase());
  }

  has(name: string): boolean {
    return this.effects.has(name.toLowerCase());
  }

  getAll(): ImageEffect[] {
    return Array.from(this.effects.values());
  }
}

export const defaultEffectRegistry = new EffectRegistry();
