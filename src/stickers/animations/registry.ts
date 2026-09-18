import { AnimationPreset } from './types';
import {
  rainbowAnimation,
  fadeAnimation,
  zoomAnimation,
  blinkAnimation,
  slideAnimation,
  bounceAnimation,
} from './builtin.animations';

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
    this.presets.set(preset.name.toLowerCase(), preset);
  }

  get(name?: string): AnimationPreset {
    if (!name) return rainbowAnimation;
    return this.presets.get(name.toLowerCase()) ?? rainbowAnimation;
  }

  list(): string[] {
    return Array.from(this.presets.keys());
  }
}

export const defaultAnimationRegistry = new AnimationRegistry();
