import { AnimationPreset } from './types';

export const rainbowAnimation: AnimationPreset = {
  name: 'rainbow',
  frameCount: 8,
  fps: 8,
  getFrameStyle(frame: number) {
    const colors = ['#ff004c', '#ff8a00', '#ffee00', '#00e676', '#00b0ff', '#d500f9', '#ff004c', '#ff8a00'];
    return { color: colors[frame % colors.length] };
  },
};

export const fadeAnimation: AnimationPreset = {
  name: 'fade',
  frameCount: 8,
  fps: 8,
  getFrameStyle(frame: number) {
    const opacities = [0.15, 0.4, 0.7, 1.0, 1.0, 0.7, 0.4, 0.15];
    return { color: '#00f0ff', opacity: opacities[frame % opacities.length] };
  },
};

export const zoomAnimation: AnimationPreset = {
  name: 'zoom',
  frameCount: 8,
  fps: 8,
  getFrameStyle(frame: number) {
    const scales = [0.82, 0.88, 0.96, 1.05, 1.12, 1.05, 0.96, 0.88];
    return { color: '#ff007f', scale: scales[frame % scales.length] };
  },
};

export const blinkAnimation: AnimationPreset = {
  name: 'blink',
  frameCount: 8,
  fps: 8,
  getFrameStyle(frame: number) {
    const visible = [1, 1, 0, 0, 1, 1, 0, 0];
    return { color: '#facc15', opacity: visible[frame % visible.length] };
  },
};

export const slideAnimation: AnimationPreset = {
  name: 'slide',
  frameCount: 8,
  fps: 8,
  getFrameStyle(frame: number) {
    const offsets = [-30, -15, 0, 15, 30, 15, 0, -15];
    return { color: '#10b981', dx: offsets[frame % offsets.length] };
  },
};

export const bounceAnimation: AnimationPreset = {
  name: 'bounce',
  frameCount: 8,
  fps: 8,
  getFrameStyle(frame: number) {
    const offsets = [0, -12, -24, -32, -18, 0, 6, 0];
    return { color: '#8b5cf6', dy: offsets[frame % offsets.length] };
  },
};
