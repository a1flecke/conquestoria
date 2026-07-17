import type { HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import type { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

export type EffectAnimationType =
  | 'combat-flash'
  | 'wonder-discovery-pulse'
  | 'wonder-discovery-static-highlight'
  | 'disembark-flash';

export interface EffectAnimationData {
  /** Hex the effect marks. Screen position is derived from the camera every frame. */
  coord: HexCoord;
  accent?: string;
  glow?: string;
}

export interface Animation {
  id: string;
  type: EffectAnimationType;
  startTime: number;
  duration: number;
  data: EffectAnimationData;
  onComplete?: () => void;
}

export interface AnimationMapContext {
  width: number;
  wrapsHorizontally: boolean;
}

export class AnimationSystem {
  private animations: Animation[] = [];
  private nextId = 1;

  add(
    type: EffectAnimationType,
    duration: number,
    data: EffectAnimationData,
    onComplete?: () => void,
  ): string {
    const id = `anim-${this.nextId++}`;
    this.animations.push({
      id,
      type,
      startTime: performance.now(),
      duration,
      data,
      onComplete,
    });
    return id;
  }

  update(ctx: CanvasRenderingContext2D, camera: Camera, map: AnimationMapContext, now: number): void {
    const completed: Animation[] = [];

    for (const anim of this.animations) {
      const elapsed = now - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);

      const renderCoords = map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(anim.data.coord, map.width, camera)
        : [anim.data.coord];
      for (const renderCoord of renderCoords) {
        if (!camera.isHexVisible(renderCoord)) continue;
        const pixel = hexToPixel(renderCoord, camera.hexSize);
        const screen = camera.worldToScreen(pixel.x, pixel.y);
        const size = camera.hexSize * camera.zoom;
        this.renderAnimation(ctx, anim, progress, screen.x, screen.y, size);
      }

      if (progress >= 1) {
        completed.push(anim);
      }
    }

    // Remove completed animations
    for (const anim of completed) {
      this.animations = this.animations.filter(a => a.id !== anim.id);
      anim.onComplete?.();
    }
  }

  private renderAnimation(
    ctx: CanvasRenderingContext2D,
    anim: Animation,
    progress: number,
    x: number,
    y: number,
    size: number,
  ): void {
    switch (anim.type) {
      case 'combat-flash': {
        const alpha = 1 - progress;
        ctx.fillStyle = `rgba(255, 100, 50, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, size * (0.5 + progress * 0.5), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'wonder-discovery-pulse': {
        const { accent, glow } = anim.data;
        const alpha = 1 - progress;
        ctx.save();
        ctx.strokeStyle = glow ?? '#fff';
        ctx.globalAlpha = Math.max(0.15, alpha);
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.beginPath();
        ctx.arc(x, y, size * (0.48 + progress * 0.72), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0.10, alpha * 0.35);
        ctx.fillStyle = accent ?? '#fff';
        ctx.beginPath();
        ctx.arc(x, y, size * (0.32 + progress * 0.18), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'wonder-discovery-static-highlight': {
        const { accent } = anim.data;
        ctx.save();
        ctx.strokeStyle = accent ?? '#fff';
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(2, size * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'disembark-flash': {
        // Expanding teal ring — signals a unit has disembarked at this hex.
        const alpha = 1 - progress;
        ctx.save();
        ctx.strokeStyle = `rgba(74, 200, 217, ${alpha * 0.7})`;
        ctx.lineWidth = Math.max(1, size * 0.04);
        ctx.beginPath();
        ctx.arc(x, y, size * (0.3 + progress * 0.4), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }
}
