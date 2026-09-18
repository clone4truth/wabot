export interface AnimationLayout {
  fontSize: number;
  lines: string[];
  lh: number;
  startY: number;
}

export interface AnimationContext {
  text: string;
  layout: AnimationLayout;
  fontFamily: string;
}

export interface AnimationPreset {
  name: string;
  frameCount: number;
  fps: number;
  renderSvg(frame: number, context: AnimationContext): string;
}
