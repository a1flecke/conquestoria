/**
 * Canvas drawing for the Great General command effects (#889). Pure drawing: the timeline (`animation-system.ts`) owns
 * the clock and hands in `progress` in [0, 1], so nothing here reads time and nothing here needs the paint clock.
 *
 * Each ability has a shape you can tell apart without colour (the colours are the General's crest colours):
 *   rally         two rings rising outward, with a plus mark lifting off (healing / steadying)
 *   seize         a burst of rays (one more action)
 *   last-stand    a ring that closes in and locks into a hex-shaped shield outline (holding the line)
 *   final-command the last-stand/rally language doubled and slowed, in gold (the General's last order)
 *   static        one steady ring, drawn instead of any motion when the player prefers reduced motion
 */
import { hexToPixel } from '@/systems/hex-utils';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getGeneralPresentation } from '@/systems/great-general-presentation';
import type { Camera } from './camera';
import type { UnitMapPresentation } from './unit-map-presentation';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

export type GeneralAbilityEffectType =
  | 'general-rally'
  | 'general-seize'
  | 'general-last-stand'
  | 'general-final-command'
  | 'general-ability-static';

export const GENERAL_ABILITY_EFFECT_TYPES: readonly GeneralAbilityEffectType[] = [
  'general-rally',
  'general-seize',
  'general-last-stand',
  'general-final-command',
  'general-ability-static',
];

export const FINAL_COMMAND_GOLD = '#f2c94c';

export function isGeneralAbilityEffect(type: string): type is GeneralAbilityEffectType {
  return (GENERAL_ABILITY_EFFECT_TYPES as readonly string[]).includes(type);
}

export interface GeneralAbilityEffectStyle {
  readonly accent?: string;
  readonly glow?: string;
  /** Reach of the effect in hexes (Last Stand marks a wider area than one unit). */
  readonly radiusHexes?: number;
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function plusMark(ctx: CanvasRenderingContext2D, x: number, y: number, arm: number): void {
  ctx.beginPath();
  ctx.moveTo(x - arm, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x, y + arm);
  ctx.stroke();
}

export function drawGeneralAbilityEffect(
  ctx: CanvasRenderingContext2D,
  type: GeneralAbilityEffectType,
  progress: number,
  x: number,
  y: number,
  size: number,
  style: GeneralAbilityEffectStyle,
): void {
  const accent = style.accent ?? '#ffffff';
  const glow = style.glow ?? accent;
  const reach = size * (style.radiusHexes ?? 1);
  const fade = 1 - progress;
  ctx.save();
  switch (type) {
    case 'general-rally': {
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = Math.max(0, fade * 0.9);
      ctx.beginPath();
      ctx.arc(x, y, reach * (0.35 + progress * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = glow;
      ctx.globalAlpha = Math.max(0, fade * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, reach * (0.2 + progress * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = Math.max(0, fade);
      plusMark(ctx, x, y - progress * size * 0.45, size * 0.14);
      break;
    }
    case 'general-seize': {
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.globalAlpha = Math.max(0, fade);
      const inner = reach * (0.2 + progress * 0.25);
      const outer = reach * (0.45 + progress * 0.45);
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x + inner * Math.cos(angle), y + inner * Math.sin(angle));
        ctx.lineTo(x + outer * Math.cos(angle), y + outer * Math.sin(angle));
        ctx.stroke();
      }
      ctx.fillStyle = glow;
      ctx.globalAlpha = Math.max(0, fade * 0.35);
      ctx.beginPath();
      ctx.arc(x, y, reach * 0.3 * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'general-last-stand': {
      // A ring contracts onto the hex (the line closing), then the hex outline stays lit as it fades: the shield.
      const closing = Math.min(1, progress / 0.55);
      ctx.lineWidth = Math.max(2, size * 0.06);
      ctx.strokeStyle = glow;
      ctx.globalAlpha = Math.max(0, (1 - closing) * 0.8);
      ctx.beginPath();
      ctx.arc(x, y, reach * (1.15 - closing * 0.45), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      const shield = progress < 0.55 ? closing : Math.min(1, fade / 0.45);
      ctx.globalAlpha = Math.max(0, shield * 0.9);
      hexPath(ctx, x, y, size * 0.72);
      ctx.stroke();
      ctx.globalAlpha *= 0.25;
      ctx.fill();
      break;
    }
    case 'general-final-command': {
      ctx.lineWidth = Math.max(3, size * 0.07);
      ctx.strokeStyle = FINAL_COMMAND_GOLD;
      ctx.globalAlpha = Math.max(0, fade * 0.95);
      ctx.beginPath();
      ctx.arc(x, y, reach * (0.4 + progress * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = Math.max(0, fade * 0.7);
      ctx.beginPath();
      ctx.arc(x, y, reach * (0.25 + Math.max(0, progress - 0.2) * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = FINAL_COMMAND_GOLD;
      ctx.globalAlpha = Math.max(0, fade * 0.25);
      ctx.beginPath();
      ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'general-ability-static': {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/**
 * The persistent Last Stand marker (#889): a steady shield outline under a unit that is currently held. State-derived
 * and static, so it needs no timeline and no repaint of its own -- `setGameState` already invalidates when the hold
 * appears, is consumed by its one save, or expires.
 */
export function drawLastStandHoldMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.globalAlpha = 0.9;
  hexPath(ctx, x, y, size * 0.7);
  ctx.stroke();
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.restore();
}

/** The slice of `GameState` the marker reads (structural, so the full state satisfies it without the core type barrel). */
type HoldMarkerState = NonNullable<Parameters<typeof resolveGeneralDefinition>[0]> & {
  readonly turn: number;
  readonly units: Readonly<Record<string, { readonly lastStandHold?: { readonly expiresTurn: number; readonly generalDefinitionId?: string } } | undefined>>;
  readonly map: { readonly wrapsHorizontally?: boolean; readonly width: number };
};

/**
 * Marks every visible stack that holds a unit under an active Last Stand (#889). Only the presentations the viewer
 * can already see are passed in, so a rival's hold is shown exactly when its units are, and never otherwise. The hold
 * is the existing `Unit.lastStandHold`: nothing new is stored, and the marker disappears when the hold expires or its
 * one survival save is spent, because the state no longer has it.
 */
export function drawLastStandHoldMarkers(
  ctx: CanvasRenderingContext2D,
  presentations: readonly UnitMapPresentation[],
  camera: Camera,
  state: HoldMarkerState,
): void {
  for (const presentation of presentations) {
    let generalDefinitionId: string | undefined;
    for (const id of presentation.memberIds) {
      const hold = state.units[id]?.lastStandHold;
      if (hold && state.turn <= hold.expiresTurn) { generalDefinitionId = hold.generalDefinitionId; break; }
    }
    if (generalDefinitionId === undefined) continue;
    const definition = resolveGeneralDefinition(state, generalDefinitionId);
    const colour = definition ? getGeneralPresentation(definition).primary : '#9ec5ff';
    const coords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(presentation.coord, state.map.width, camera)
      : [presentation.coord];
    for (const coord of coords) {
      if (!camera.isHexVisible(coord)) continue;
      const pixel = hexToPixel(coord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      drawLastStandHoldMarker(ctx, screen.x, screen.y, camera.hexSize * camera.zoom, colour);
    }
  }
}
