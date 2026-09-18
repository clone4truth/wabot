import { AnimationPreset, AnimationContext } from './types';
import { escapeXml } from '../rendering/text-utils';

function renderTextLines(
  context: AnimationContext,
  color: string,
  opacity: number = 1,
  strokeColor: string = '#000000',
  strokeWidth: number = 4
): string {
  const { layout, fontFamily } = context;
  return layout.lines
    .map((line, idx) => {
      const y = layout.startY + idx * layout.lh + Math.round(layout.fontSize * 0.85);
      return `<text x="256" y="${y}" text-anchor="middle" font-family="${fontFamily},sans-serif" font-size="${layout.fontSize}" font-weight="bold" fill="${color}" fill-opacity="${opacity}" stroke="${strokeColor}" stroke-opacity="${opacity}" stroke-width="${strokeWidth}" paint-order="stroke">${escapeXml(line)}</text>`;
    })
    .join('');
}

export const rainbowAnimation: AnimationPreset = {
  name: 'rainbow',
  frameCount: 8,
  fps: 8,
  renderSvg(frame: number, context: AnimationContext): string {
    const colors = ['#ff004c', '#ff8a00', '#ffee00', '#00e676', '#00b0ff', '#d500f9', '#ff004c', '#ff8a00'];
    const color = colors[frame % colors.length];
    const texts = renderTextLines(context, color);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${texts}</svg>`;
  },
};

export const fadeAnimation: AnimationPreset = {
  name: 'fade',
  frameCount: 8,
  fps: 8,
  renderSvg(frame: number, context: AnimationContext): string {
    const opacities = [0.15, 0.4, 0.7, 1.0, 1.0, 0.7, 0.4, 0.15];
    const opacity = opacities[frame % opacities.length];
    const texts = renderTextLines(context, '#00f0ff', opacity);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${texts}</svg>`;
  },
};

export const zoomAnimation: AnimationPreset = {
  name: 'zoom',
  frameCount: 8,
  fps: 8,
  renderSvg(frame: number, context: AnimationContext): string {
    const scales = [0.82, 0.88, 0.96, 1.05, 1.12, 1.05, 0.96, 0.88];
    const s = scales[frame % scales.length];
    const texts = renderTextLines(context, '#ff007f');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><g transform="translate(256, 256) scale(${s}) translate(-256, -256)">${texts}</g></svg>`;
  },
};

export const blinkAnimation: AnimationPreset = {
  name: 'blink',
  frameCount: 8,
  fps: 8,
  renderSvg(frame: number, context: AnimationContext): string {
    const visible = [1, 1, 0, 0, 1, 1, 0, 0];
    const opacity = visible[frame % visible.length];
    const texts = renderTextLines(context, '#facc15', opacity);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${texts}</svg>`;
  },
};

export const slideAnimation: AnimationPreset = {
  name: 'slide',
  frameCount: 8,
  fps: 8,
  renderSvg(frame: number, context: AnimationContext): string {
    const offsets = [-30, -15, 0, 15, 30, 15, 0, -15];
    const dx = offsets[frame % offsets.length];
    const texts = renderTextLines(context, '#10b981');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><g transform="translate(${dx}, 0)">${texts}</g></svg>`;
  },
};

export const bounceAnimation: AnimationPreset = {
  name: 'bounce',
  frameCount: 8,
  fps: 8,
  renderSvg(frame: number, context: AnimationContext): string {
    const offsets = [0, -12, -24, -32, -18, 0, 6, 0];
    const dy = offsets[frame % offsets.length];
    const texts = renderTextLines(context, '#8b5cf6');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><g transform="translate(0, ${dy})">${texts}</g></svg>`;
  },
};
