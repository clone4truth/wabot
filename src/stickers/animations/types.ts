export interface AnimationLayout {
  fontSize: number;
  lines: string[];
  lh: number;
  startY: number;
}

export interface AnimationFrameStyle {
  color: string;
  opacity?: number;
  scale?: number;
  dx?: number;
  dy?: number;
}

export interface AnimationPreset {
  name: string;
  frameCount: number;
  fps: number;
  getFrameStyle(frame: number): AnimationFrameStyle;
}
