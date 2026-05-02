import type { Unit, VisibilityMap, GameState } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible, isForestConcealedUnit } from '@/systems/fog-of-war';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

const UNIT_ICONS: Record<string, string> = {
  settler: '🏕️',
  worker: '👷',
  scout: '🔭',
  warrior: '⚔️',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  spy_scout: '🕵️',
  spy_informant: '🕵️',
  spy_agent: '🕵️',
  spy_operative: '🕵️',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '🦅',
  war_hound: '🐺',
};

const OWNER_COLORS: Record<string, string> = {
  player: '#4a90d9',
  'ai-1': '#d94a4a',
  barbarian: '#8b4513',
};

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

export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Record<string, Unit>,
  camera: Camera,
  playerVisibility: VisibilityMap,
  state: GameState,
  currentPlayer: string,
  colorLookup?: Record<string, string>,
): void {
  const visibleUnits = Object.values(units).filter(unit =>
    isVisible(playerVisibility, unit.position) && !isForestConcealedUnit(state, currentPlayer, unit),
  );

  for (const stack of Object.values(groupUnitsByHex(visibleUnits))) {
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
        const ownerColor = colorLookup?.[unit.owner] ?? OWNER_COLORS[unit.owner] ?? '#888';

        ctx.beginPath();
        ctx.arc(unitX, unitY, size * (stack.length === 1 ? 0.35 : 0.25), 0, Math.PI * 2);
        ctx.fillStyle = ownerColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = `${size * (stack.length === 1 ? 0.4 : 0.28)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(UNIT_ICONS[unit.type] ?? '?', unitX, unitY);

        if (unit.health < 100) {
          const barWidth = size * 0.42;
          const barHeight = size * 0.06;
          const barX = unitX - barWidth / 2;
          const barY = unitY + size * 0.28;

          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(barX, barY, barWidth, barHeight);

          const healthRatio = unit.health / 100;
          ctx.fillStyle = healthRatio > 0.5 ? '#4caf50' : healthRatio > 0.25 ? '#ff9800' : '#f44336';
          ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
        }
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
