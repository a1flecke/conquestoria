import { getLegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-catalog';
import type { WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { resolveLegendaryWonderBespokeAsset } from '@/renderer/wonders/legendary-wonder-bespoke-assets';
import { assignLegendaryWonderSlots } from '@/renderer/wonders/legendary-wonder-slots';
import {
  LEGENDARY_LANDMARK_AURAS,
  LEGENDARY_LANDMARK_FAMILIES,
  LEGENDARY_LANDMARK_GHOSTS,
  LEGENDARY_LANDMARK_MOTIFS,
  LEGENDARY_LANDMARK_MOTIONS,
  LEGENDARY_LANDMARK_VARIANTS,
  type LegendaryWonderLandmarkMetadata,
  type LegendaryWonderLandmarkState,
} from '@/systems/legendary-wonder-landmark-types';

export const CANVAS_LEGENDARY_LANDMARK_FAMILIES = LEGENDARY_LANDMARK_FAMILIES;
export const CANVAS_LEGENDARY_LANDMARK_VARIANTS = LEGENDARY_LANDMARK_VARIANTS;
export const CANVAS_LEGENDARY_LANDMARK_MOTIFS = LEGENDARY_LANDMARK_MOTIFS;
export const CANVAS_LEGENDARY_LANDMARK_AURAS = LEGENDARY_LANDMARK_AURAS;
export const CANVAS_LEGENDARY_LANDMARK_MOTIONS = LEGENDARY_LANDMARK_MOTIONS;
export const CANVAS_LEGENDARY_LANDMARK_GHOSTS = LEGENDARY_LANDMARK_GHOSTS;

export interface LegendaryWonderRenderEntry {
  wonderId: string;
  label: string;
  turnCompleted: number;
  visual: WonderVisualDefinition;
  state?: LegendaryWonderLandmarkState;
  metadata?: LegendaryWonderLandmarkMetadata;
  progressRatio?: number;
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  family: LegendaryWonderLandmarkMetadata['family'],
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  switch (family) {
    case 'oracle':
    case 'spire':
    case 'signal':
      drawSpireSilhouette(ctx, cx, cy, radius);
      break;
    case 'waterworks':
    case 'gateway':
    case 'drydock':
      drawArchSilhouette(ctx, cx, cy, radius);
      break;
    case 'garden':
    case 'observatory':
      drawDomeSilhouette(ctx, cx, cy, radius);
      break;
    case 'laboratory':
      drawObeliskSilhouette(ctx, cx, cy, radius);
      break;
    case 'foundry':
    case 'bastion':
    case 'hall':
      drawCitadelSilhouette(ctx, cx, cy, radius);
      break;
    case 'exchange':
    case 'network':
    case 'archive':
    default:
      drawArchiveSilhouette(ctx, cx, cy, radius);
      break;
  }
  ctx.closePath();
}

function drawArchSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.arc(cx, cy + radius * 0.35, radius * 0.62, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.48, cy + radius * 0.72);
  ctx.lineTo(cx - radius * 0.48, cy + radius * 0.72);
}

function drawDomeSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.arc(cx, cy + radius * 0.2, radius * 0.7, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.7, cy + radius * 0.65);
  ctx.lineTo(cx - radius * 0.7, cy + radius * 0.65);
}

function drawObeliskSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.moveTo(cx, cy - radius * 0.82);
  ctx.lineTo(cx + radius * 0.34, cy + radius * 0.7);
  ctx.lineTo(cx - radius * 0.34, cy + radius * 0.7);
}

function drawCitadelSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.rect(cx - radius * 0.62, cy - radius * 0.34, radius * 1.24, radius * 1.02);
  ctx.moveTo(cx - radius * 0.62, cy - radius * 0.34);
  ctx.lineTo(cx - radius * 0.38, cy - radius * 0.68);
  ctx.lineTo(cx - radius * 0.12, cy - radius * 0.34);
  ctx.lineTo(cx + radius * 0.12, cy - radius * 0.68);
  ctx.lineTo(cx + radius * 0.38, cy - radius * 0.34);
}

function drawArchiveSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.rect(cx - radius * 0.66, cy - radius * 0.5, radius * 1.32, radius * 1.08);
  ctx.moveTo(cx - radius * 0.44, cy - radius * 0.5);
  ctx.lineTo(cx - radius * 0.44, cy + radius * 0.58);
  ctx.moveTo(cx, cy - radius * 0.5);
  ctx.lineTo(cx, cy + radius * 0.58);
  ctx.moveTo(cx + radius * 0.44, cy - radius * 0.5);
  ctx.lineTo(cx + radius * 0.44, cy + radius * 0.58);
}

function drawSpireSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.moveTo(cx, cy - radius * 0.84);
  ctx.lineTo(cx + radius * 0.54, cy + radius * 0.68);
  ctx.lineTo(cx, cy + radius * 0.38);
  ctx.lineTo(cx - radius * 0.54, cy + radius * 0.68);
}

function pulseAlpha(nowMs: number): number {
  return (Math.sin(nowMs / 900) + 1) / 2;
}

export function drawLegendaryWonderLandmarkGlyph(options: {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  radius: number;
  metadata: LegendaryWonderLandmarkMetadata;
  state: LegendaryWonderLandmarkState;
  reducedMotion: boolean;
  nowMs: number;
}): void {
  const { ctx, cx, cy, radius, metadata, state, reducedMotion, nowMs } = options;
  const motion = reducedMotion ? 'none' : metadata.motion;
  if (metadata.aura !== 'none') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = metadata.palette.glow;
    ctx.globalAlpha = motion === 'pulse' ? 0.12 + pulseAlpha(nowMs) * 0.12 : 0.14;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (state === 'under-construction') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.72, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = metadata.palette.accent;
    ctx.lineWidth = Math.max(1, radius * 0.13);
    ctx.stroke();
    return;
  }

  const bespokeAsset = resolveLegendaryWonderBespokeAsset(metadata.assetKey);
  if (bespokeAsset) {
    bespokeAsset.draw({
      ctx,
      cx,
      cy,
      radius: radius * 0.72 * metadata.scale,
      metadata,
      reducedMotion,
      nowMs,
    });
    return;
  }

  drawSilhouette(ctx, metadata.family, cx, cy, radius * 0.72 * metadata.scale);
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.08);
  ctx.stroke();

  if (motion === 'glint' || motion === 'spark') {
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.34, cy - radius * 0.34);
    ctx.lineTo(cx + radius * 0.34, cy + radius * 0.34);
    ctx.strokeStyle = metadata.palette.glow;
    ctx.lineWidth = Math.max(1, radius * 0.06);
    ctx.stroke();
  }
}

export function drawLegendaryWonderLandmarks(options: {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  size: number;
  entries: LegendaryWonderRenderEntry[];
  reducedMotion: boolean;
  lowZoom: boolean;
  turn?: number;
  nowMs?: number;
}): void {
  if (options.entries.length === 0) return;
  const slots = assignLegendaryWonderSlots(options.entries, options.turn ?? 0);
  const entryByWonderId = new Map(options.entries.map(entry => [entry.wonderId, entry]));
  const nowMs = options.nowMs ?? 0;
  const radius = options.size * (options.lowZoom ? 0.13 : 0.16);
  const orbit = options.size * 0.74;

  options.ctx.save();
  (options.ctx as unknown as { operations?: string[] }).operations?.push('legendary-landmarks:start');
  for (const slot of slots) {
    const x = options.cx + slot.dx * orbit;
    const y = options.cy + slot.dy * orbit;
    options.ctx.beginPath();
    options.ctx.arc(x, y, radius, 0, Math.PI * 2);
    options.ctx.fillStyle = 'rgba(16,16,24,0.92)';
    options.ctx.fill();
    options.ctx.strokeStyle = 'rgba(232,193,112,0.78)';
    options.ctx.lineWidth = Math.max(1, radius * 0.14);
    options.ctx.stroke();

    if (slot.kind === 'overflow') {
      options.ctx.font = `bold ${Math.max(8, radius * 0.82)}px system-ui`;
      options.ctx.textAlign = 'center';
      options.ctx.textBaseline = 'middle';
      options.ctx.fillStyle = '#f8e7af';
      options.ctx.fillText(`+${slot.overflowCount}`, x, y);
      continue;
    }

    const entry = entryByWonderId.get(slot.wonderId);
    if (!entry) continue;
    const metadata = entry.metadata ?? getLegendaryWonderLandmarkMetadata(entry.wonderId);
    drawLegendaryWonderLandmarkGlyph({
      ctx: options.ctx,
      cx: x,
      cy: y,
      radius: radius * (options.lowZoom ? 0.82 : 1),
      metadata,
      state: entry.state ?? 'completed',
      reducedMotion: options.reducedMotion,
      nowMs,
    });
  }
  options.ctx.restore();
}
