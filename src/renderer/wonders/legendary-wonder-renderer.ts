import type { WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import { assignLegendaryWonderSlots } from '@/renderer/wonders/legendary-wonder-slots';
import {
  LEGENDARY_LANDMARK_AURAS,
  LEGENDARY_LANDMARK_FAMILIES,
  LEGENDARY_LANDMARK_GHOSTS,
  LEGENDARY_LANDMARK_MOTIFS,
  LEGENDARY_LANDMARK_MOTIONS,
  LEGENDARY_LANDMARK_VARIANTS,
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
}

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  kind: WonderVisualDefinition['legendaryLandmark'],
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  switch (kind) {
    case 'arch':
      ctx.arc(cx, cy + radius * 0.35, radius * 0.62, Math.PI, Math.PI * 2);
      ctx.lineTo(cx + radius * 0.48, cy + radius * 0.72);
      ctx.lineTo(cx - radius * 0.48, cy + radius * 0.72);
      break;
    case 'dome':
      ctx.arc(cx, cy + radius * 0.2, radius * 0.7, Math.PI, Math.PI * 2);
      ctx.lineTo(cx + radius * 0.7, cy + radius * 0.65);
      ctx.lineTo(cx - radius * 0.7, cy + radius * 0.65);
      break;
    case 'obelisk':
      ctx.moveTo(cx, cy - radius * 0.82);
      ctx.lineTo(cx + radius * 0.34, cy + radius * 0.7);
      ctx.lineTo(cx - radius * 0.34, cy + radius * 0.7);
      break;
    case 'citadel':
      ctx.rect(cx - radius * 0.62, cy - radius * 0.34, radius * 1.24, radius * 1.02);
      ctx.moveTo(cx - radius * 0.62, cy - radius * 0.34);
      ctx.lineTo(cx - radius * 0.38, cy - radius * 0.68);
      ctx.lineTo(cx - radius * 0.12, cy - radius * 0.34);
      ctx.lineTo(cx + radius * 0.12, cy - radius * 0.68);
      ctx.lineTo(cx + radius * 0.38, cy - radius * 0.34);
      break;
    case 'archive':
      ctx.rect(cx - radius * 0.66, cy - radius * 0.5, radius * 1.32, radius * 1.08);
      ctx.moveTo(cx - radius * 0.44, cy - radius * 0.5);
      ctx.lineTo(cx - radius * 0.44, cy + radius * 0.58);
      ctx.moveTo(cx, cy - radius * 0.5);
      ctx.lineTo(cx, cy + radius * 0.58);
      ctx.moveTo(cx + radius * 0.44, cy - radius * 0.5);
      ctx.lineTo(cx + radius * 0.44, cy + radius * 0.58);
      break;
    case 'spire':
    default:
      ctx.moveTo(cx, cy - radius * 0.84);
      ctx.lineTo(cx + radius * 0.54, cy + radius * 0.68);
      ctx.lineTo(cx, cy + radius * 0.38);
      ctx.lineTo(cx - radius * 0.54, cy + radius * 0.68);
      break;
  }
  ctx.closePath();
}

export function drawLegendaryWonderLandmarks(options: {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  size: number;
  entries: LegendaryWonderRenderEntry[];
  reducedMotion: boolean;
  lowZoom: boolean;
}): void {
  if (options.entries.length === 0) return;
  const slots = assignLegendaryWonderSlots(options.entries);
  const entryByWonderId = new Map(options.entries.map(entry => [entry.wonderId, entry]));
  const radius = options.size * (options.lowZoom ? 0.13 : 0.16);
  const orbit = options.size * 0.74;

  options.ctx.save();
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
    drawSilhouette(options.ctx, entry.visual.legendaryLandmark, x, y, radius * 0.72);
    options.ctx.fillStyle = entry.visual.palette.accent;
    options.ctx.fill();
    options.ctx.strokeStyle = entry.visual.palette.glow;
    options.ctx.lineWidth = Math.max(1, radius * 0.08);
    options.ctx.stroke();
  }
  options.ctx.restore();
}
