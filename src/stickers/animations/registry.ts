import { AnimationPreset } from './types';
import {
  rainbowAnimation,
  fadeAnimation,
  zoomAnimation,
  blinkAnimation,
  slideAnimation,
  bounceAnimation,
} from './builtin.animations';
import { AppError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';

export class AnimationRegistry {
  private presets = new Map<string, AnimationPreset>();

  constructor() {
    this.register(rainbowAnimation);
    this.register(fadeAnimation);
    this.register(zoomAnimation);
    this.register(blinkAnimation);
    this.register(slideAnimation);
    this.register(bounceAnimation);
  }

  register(preset: AnimationPreset): void {
    const key = preset.name?.trim().toLowerCase();
    if (!key) {
      throw new Error('Animation preset name cannot be empty');
    }
    if (this.presets.has(key)) {
      throw new Error(`Animation preset "${key}" already registered`);
    }
    this.presets.set(key, preset);
  }

  resolve(name: string): AnimationPreset {
    const key = name.trim().toLowerCase();
    const preset = this.presets.get(key);
    if (!preset) {
      throw new AppError(
        ErrorCode.INVALID_ARGUMENT,
        `❌ Efek "${name}" tidak tersedia.\nPreset: ${this.list().join(', ')}.`,
      );
    }
    return preset;
  }

  get(name?: string): AnimationPreset {
    if (!name) return rainbowAnimation;
    return this.resolve(name);
  }

  list(): string[] {
    return Array.from(this.presets.keys());
  }
}

export const defaultAnimationRegistry = new AnimationRegistry();
