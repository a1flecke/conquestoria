import { getWonderSpectacleRecipe } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectaclePrimitive, WonderSpectacleRenderMode } from '@/systems/wonder-spectacle/types';

export const CANVAS_WONDER_SPECTACLE_PRIMITIVES = [
  'heatGlow',
  'smokePlume',
  'embers',
  'waterFlow',
  'sparkle',
  'lightBands',
  'mist',
  'lightning',
  'fireflies',
  'leafDrift',
  'sandRipple',
  'stonePulse',
  'crystalGleam',
  'fossilDust',
  'deepWaterAura',
  'ruinGlimmer',
] as const satisfies readonly WonderSpectaclePrimitive[];

export interface NaturalWonderSpectacleDrawOptions {
  ctx: CanvasRenderingContext2D;
  wonderId: string;
  cx: number;
  cy: number;
  size: number;
  nowMs: number;
  mode: WonderSpectacleRenderMode;
}

function phase(nowMs: number, speed = 900): number {
  return (Math.sin(nowMs / speed) + 1) / 2;
}

function drawAura(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  amount: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, size * (0.5 + amount * 0.18), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16 + amount * 0.12;
  ctx.fill();
}

function drawPrimitive(
  ctx: CanvasRenderingContext2D,
  primitive: WonderSpectaclePrimitive,
  cx: number,
  cy: number,
  size: number,
  nowMs: number,
): void {
  const p = phase(nowMs, primitive === 'lightning' ? 180 : 900);
  if (primitive === 'lightning') {
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.18, cy - size * 0.5);
    ctx.lineTo(cx - size * 0.1, cy - size * 0.02);
    ctx.lineTo(cx + size * 0.1, cy - size * 0.02);
    ctx.lineTo(cx - size * 0.18, cy + size * 0.45);
    ctx.strokeStyle = `rgba(241,245,255,${0.35 + p * 0.45})`;
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.stroke();
    return;
  }
  if (primitive === 'smokePlume' || primitive === 'mist' || primitive === 'fossilDust') {
    ctx.beginPath();
    ctx.ellipse(cx - size * 0.12, cy - size * (0.35 + p * 0.08), size * 0.22, size * 0.12, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(248,241,223,0.24)';
    ctx.fill();
    return;
  }
  if (primitive === 'waterFlow' || primitive === 'sandRipple' || primitive === 'lightBands' || primitive === 'leafDrift') {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.5, cy + size * (p * 0.16 - 0.08));
    ctx.bezierCurveTo(cx - size * 0.18, cy - size * 0.28, cx + size * 0.2, cy + size * 0.28, cx + size * 0.5, cy - size * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    ctx.stroke();
    return;
  }
  drawAura(ctx, cx, cy, size, 'rgba(232,193,112,1)', p);
}

export function drawNaturalWonderSpectacleEffects(options: NaturalWonderSpectacleDrawOptions): void {
  if (options.mode !== 'map-animated') return;
  const recipe = getWonderSpectacleRecipe(options.wonderId);
  if (!recipe) return;

  options.ctx.save();
  for (const primitive of recipe.mapPrimitives) {
    drawPrimitive(options.ctx, primitive, options.cx, options.cy, options.size, options.nowMs);
  }
  options.ctx.restore();
}
