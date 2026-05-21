import type { TilePresentationKind } from '@/renderer/tile-presentation';
import { getWonderVisualDefinition, type WonderMapLandmark } from '@/systems/wonder-visual-catalog';

export interface NaturalWonderRenderOptions {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  size: number;
  wonderId: string;
  presentationKind: TilePresentationKind;
  nowMs: number;
  reducedMotion: boolean;
}

function pulse(nowMs: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : Math.sin(nowMs / 700) * 0.08;
}

function drawPeak(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, accent: string): void {
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy + size * 0.32);
  ctx.lineTo(cx - size * 0.08, cy - size * 0.36);
  ctx.lineTo(cx + size * 0.08, cy - size * 0.08);
  ctx.lineTo(cx + size * 0.28, cy - size * 0.28);
  ctx.lineTo(cx + size * 0.48, cy + size * 0.32);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
}

function drawWave(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, accent: string): void {
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.45, cy);
  ctx.bezierCurveTo(cx - size * 0.25, cy - size * 0.22, cx - size * 0.08, cy + size * 0.22, cx + size * 0.12, cy);
  ctx.bezierCurveTo(cx + size * 0.28, cy - size * 0.18, cx + size * 0.38, cy + size * 0.16, cx + size * 0.48, cy - size * 0.04);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.stroke();
}

function drawCrystal(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, accent: string): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.3, cy - size * 0.04);
  ctx.lineTo(cx + size * 0.12, cy + size * 0.4);
  ctx.lineTo(cx - size * 0.26, cy + size * 0.18);
  ctx.lineTo(cx - size * 0.18, cy - size * 0.16);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
}

function drawLandmarkShape(
  ctx: CanvasRenderingContext2D,
  landmark: WonderMapLandmark,
  cx: number,
  cy: number,
  size: number,
  accent: string,
): void {
  if (landmark === 'volcano' || landmark === 'mountain' || landmark === 'canyon') {
    drawPeak(ctx, cx, cy, size, accent);
    return;
  }
  if (landmark === 'crystal' || landmark === 'bones' || landmark === 'ruins') {
    drawCrystal(ctx, cx, cy, size, accent);
    return;
  }
  if (landmark === 'reef' || landmark === 'bay' || landmark === 'lake' || landmark === 'falls' || landmark === 'storm') {
    drawWave(ctx, cx, cy, size, accent);
    return;
  }
  if (landmark === 'forest' || landmark === 'islands') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.45);
    ctx.lineTo(cx + size * 0.38, cy + size * 0.22);
    ctx.lineTo(cx + size * 0.12, cy + size * 0.22);
    ctx.lineTo(cx + size * 0.28, cy + size * 0.44);
    ctx.lineTo(cx - size * 0.28, cy + size * 0.44);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.22);
    ctx.lineTo(cx - size * 0.38, cy + size * 0.22);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    return;
  }
  if (landmark === 'aurora' || landmark === 'sands') {
    drawWave(ctx, cx, cy - size * 0.12, size, accent);
    drawWave(ctx, cx, cy + size * 0.14, size * 0.8, accent);
    return;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

export function drawNaturalWonderLandmark(options: NaturalWonderRenderOptions): void {
  const { ctx, cx, cy, size, wonderId, presentationKind, nowMs, reducedMotion } = options;
  const visual = getWonderVisualDefinition(wonderId);
  const anim = pulse(nowMs, reducedMotion);
  const radius = size * (0.32 + anim);

  ctx.save();
  ctx.globalAlpha = presentationKind === 'last-seen' ? 0.72 : 1;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = visual.palette.base;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.strokeStyle = visual.palette.glow;
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.stroke();

  drawLandmarkShape(ctx, visual.mapLandmark, cx, cy, size, visual.palette.accent);
  ctx.restore();
}
