import type { Unit, VisibilityMap, GameState } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import { resolveUnitVisual, type UnitMotionState, type UnitRoleMarker } from './unit-visual-resolver';
import {
  buildUnitMapPresentations,
  applyUnitAnchorOffset,
  getUnitLayoutMetrics,
  type UnitMapPresentation,
} from './unit-map-presentation';

function drawRoleMarker(
  ctx: CanvasRenderingContext2D,
  marker: UnitRoleMarker,
  x: number,
  y: number,
  size: number,
): void {
  if (!marker) return;
  const markerX = x + size * 0.28;
  const markerY = y - size * 0.3;
  ctx.beginPath();
  if (marker === 'chevron') {
    ctx.moveTo(markerX - size * 0.1, markerY - size * 0.06);
    ctx.lineTo(markerX, markerY + size * 0.08);
    ctx.lineTo(markerX + size * 0.1, markerY - size * 0.06);
  } else {
    ctx.moveTo(markerX, markerY - size * 0.11);
    ctx.lineTo(markerX + size * 0.11, markerY);
    ctx.lineTo(markerX, markerY + size * 0.11);
    ctx.lineTo(markerX - size * 0.11, markerY);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.72)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.stroke();
}

export interface UnitGlyphDrawOptions {
  stackSize: number;
  stackIndex: number;
  motion?: UnitMotionState;
  useSprites?: boolean;
  spriteOverride?: HTMLImageElement | null;
}

export function drawUnitGlyph(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  unit: Unit,
  x: number,
  y: number,
  size: number,
  colorLookup: Record<string, string> | undefined,
  options: UnitGlyphDrawOptions,
): void {
  const visual = resolveUnitVisual(state, unit, colorLookup, options.motion ?? 'idle');
  const metrics = getUnitLayoutMetrics(size);
  const useSprites = options.useSprites ?? true;
  const sprite = useSprites
    ? ('spriteOverride' in options ? options.spriteOverride ?? null : spriteCache.getUnit(unit.type, visual.spriteOwnerId))
    : null;

  if (useSprites && !sprite) {
    spriteCache.ensureCiv(visual.spriteOwnerId, visual.color);
  }

  if (sprite) {
    const drawSize = metrics.displaySize;
    ctx.drawImage(sprite, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
  } else {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = visual.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${size * 0.4}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(visual.fallbackIcon, x, y);
  }

  drawRoleMarker(ctx, visual.roleMarker, x, y, metrics.displaySize);

  if (unit.health < 100) {
    const barWidth = metrics.healthBar.width;
    const barHeight = metrics.healthBar.height;
    const barX = x + metrics.healthBar.x;
    const barY = y + metrics.healthBar.y;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const healthRatio = unit.health / 100;
    ctx.fillStyle = healthRatio > 0.5 ? '#4caf50' : healthRatio > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }

  if (unit.isFortified) {
    const badgeR = metrics.fortifiedBadge.radius;
    const badgeX = x + metrics.fortifiedBadge.x;
    const badgeY = y + metrics.fortifiedBadge.y;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,150,0,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `${size * 0.18}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText('F', badgeX, badgeY);
  }
}

export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Record<string, Unit>,
  camera: Camera,
  playerVisibility: VisibilityMap,
  state: GameState,
  currentPlayer: string,
  colorLookup?: Record<string, string>,
  options: { hiddenUnitIds?: Set<string> } = {},
  activeOverlayIds: ReadonlySet<string> = new Set(),
): void {
  const presentations = buildUnitMapPresentations(
    { ...state, units },
    currentPlayer,
    playerVisibility,
    options.hiddenUnitIds ?? new Set(),
    null,
  );
  drawUnitPresentations(ctx, presentations, camera, state, colorLookup, activeOverlayIds);
}

export function drawUnitPresentations(
  ctx: CanvasRenderingContext2D,
  presentations: UnitMapPresentation[],
  camera: Camera,
  state: GameState,
  colorLookup?: Record<string, string>,
  activeOverlayIds: ReadonlySet<string> = new Set(),
): void {
  for (const presentation of presentations) {
    if (presentation.memberIds.every(id => activeOverlayIds.has(id))) continue;
    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(presentation.coord, state.map.width, camera)
      : [presentation.coord];

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;

      const pixel = hexToPixel(renderCoord, camera.hexSize);
      const rawScreen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom;
      const screen = applyUnitAnchorOffset(rawScreen, size, presentation.anchorOffsetFactor);
      const metrics = getUnitLayoutMetrics(size);

      if (presentation.isSelected) {
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, metrics.halfDisplaySize * 0.92, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = Math.max(2, size * 0.04);
        ctx.stroke();
      }

      for (const offset of metrics.depthOffsets.slice(0, Math.min(2, presentation.stackCount - 1))) {
        ctx.beginPath();
        ctx.arc(
          screen.x + offset.x,
          screen.y + offset.y,
          metrics.displaySize * 0.32,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fill();
      }

      drawUnitGlyph(ctx, state, presentation.leadUnit, screen.x, screen.y, size, colorLookup, {
        stackSize: presentation.stackCount,
        stackIndex: 0,
        useSprites: camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD,
      });

      if (presentation.stackCount > 1) {
        ctx.beginPath();
        ctx.arc(
          screen.x + metrics.countBadge.x,
          screen.y + metrics.countBadge.y,
          metrics.countBadge.radius,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.stroke();
        ctx.font = `${size * 0.18}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.fillText(
          String(presentation.stackCount),
          screen.x + metrics.countBadge.x,
          screen.y + metrics.countBadge.y,
        );
      }
    }
  }
}
