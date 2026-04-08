import type { Unit, VisibilityMap, GameState } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible, isForestConcealedUnit } from '@/systems/fog-of-war';
import { Camera } from './camera';

const UNIT_ICONS: Record<string, string> = {
  settler: '🏕️',
  worker: '👷',
  scout: '🔭',
  warrior: '⚔️',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
};

const OWNER_COLORS: Record<string, string> = {
  player: '#4a90d9',
  'ai-1': '#d94a4a',
  barbarian: '#8b4513',
};

export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Record<string, Unit>,
  camera: Camera,
  playerVisibility: VisibilityMap,
  state: GameState,
  currentPlayer: string,
  colorLookup?: Record<string, string>,
): void {
  for (const unit of Object.values(units)) {
    // Only draw units visible to the player
    if (!isVisible(playerVisibility, unit.position)) continue;
    if (isForestConcealedUnit(state, currentPlayer, unit)) continue;
    if (!camera.isHexVisible(unit.position)) continue;

    const pixel = hexToPixel(unit.position, camera.hexSize);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const size = camera.hexSize * camera.zoom;

    // Unit background circle
    const ownerColor = colorLookup?.[unit.owner] ?? OWNER_COLORS[unit.owner] ?? '#888';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = ownerColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Unit icon
    ctx.font = `${size * 0.4}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(UNIT_ICONS[unit.type] ?? '?', screen.x, screen.y);

    // Health bar (if damaged)
    if (unit.health < 100) {
      const barWidth = size * 0.6;
      const barHeight = size * 0.08;
      const barX = screen.x - barWidth / 2;
      const barY = screen.y + size * 0.4;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      const healthRatio = unit.health / 100;
      ctx.fillStyle = healthRatio > 0.5 ? '#4caf50' : healthRatio > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
    }
  }
}
