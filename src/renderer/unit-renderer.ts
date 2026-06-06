import type { Unit, VisibilityMap, GameState } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible, isForestConcealedUnit } from '@/systems/fog-of-war';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import { resolveUnitVisual, type UnitMotionState, type UnitRoleMarker } from './unit-visual-resolver';

const STACK_OFFSETS = [
  { x: 0, y: 0 },
  { x: -0.18, y: -0.1 },
  { x: 0.18, y: 0.1 },
];

function groupUnitsByHex(units: Unit[]): Record<string, Unit[]> {
  const groups: Record<string, Unit[]> = {};
  for (const unit of units) {
    const key = `${unit.position.q},${unit.position.r}`;
    groups[key] ??= [];
    groups[key].push(unit);
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) => a.id.localeCompare(b.id));
  }
  return groups;
}

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
  const useSprites = options.useSprites ?? true;
  const sprite = useSprites
    ? ('spriteOverride' in options ? options.spriteOverride ?? null : spriteCache.getUnit(unit.type, visual.spriteOwnerId))
    : null;

  if (useSprites && !sprite) {
    spriteCache.ensureCiv(visual.spriteOwnerId, visual.color);
  }

  if (sprite) {
    const drawSize = size * (options.stackSize === 1 ? 0.9 : 0.65);
    ctx.drawImage(sprite, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
  } else {
    ctx.beginPath();
    ctx.arc(x, y, size * (options.stackSize === 1 ? 0.35 : 0.25), 0, Math.PI * 2);
    ctx.fillStyle = visual.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${size * (options.stackSize === 1 ? 0.4 : 0.28)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(visual.fallbackIcon, x, y);
  }

  drawRoleMarker(ctx, visual.roleMarker, x, y, size);

  if (unit.health < 100) {
    const barWidth = size * 0.42;
    const barHeight = size * 0.06;
    const barX = x - barWidth / 2;
    const barY = y + size * 0.28;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const healthRatio = unit.health / 100;
    ctx.fillStyle = healthRatio > 0.5 ? '#4caf50' : healthRatio > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }

  if (unit.isFortified) {
    const badgeR = size * 0.16;
    const badgeX = x - size * 0.34;
    const badgeY = y - size * 0.34;
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
  const visibleUnits = Object.values(units).filter(unit =>
    !options.hiddenUnitIds?.has(unit.id)
    && isVisible(playerVisibility, unit.position)
    && !isForestConcealedUnit(state, currentPlayer, unit),
  );

  for (const stack of Object.values(groupUnitsByHex(visibleUnits))) {
    // Skip entire stack if all units are handled by the DOM sprite overlay
    if (stack.every(u => activeOverlayIds.has(u.id))) continue;
    const anchor = stack[0].position;
    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(anchor, state.map.width, camera)
      : [anchor];

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;

      const pixel = hexToPixel(renderCoord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom;
      const unitsToDraw = stack.slice(0, 3);

      for (let index = 0; index < unitsToDraw.length; index++) {
        const unit = unitsToDraw[index];
        const offset = stack.length === 1 ? STACK_OFFSETS[0] : STACK_OFFSETS[index];
        const unitX = screen.x + offset.x * size;
        const unitY = screen.y + offset.y * size;
        drawUnitGlyph(ctx, state, unit, unitX, unitY, size, colorLookup, {
          stackSize: stack.length,
          stackIndex: index,
          useSprites: camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD,
        });
      }

      if (stack.length > 1) {
        ctx.beginPath();
        ctx.arc(screen.x + size * 0.34, screen.y - size * 0.34, size * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.stroke();
        ctx.font = `${size * 0.18}px system-ui`;
        ctx.fillStyle = 'white';
        ctx.fillText(String(stack.length), screen.x + size * 0.34, screen.y - size * 0.34);
      }
    }
  }
}
