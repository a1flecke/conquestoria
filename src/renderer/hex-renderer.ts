import type { GameMap, HexTile } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { Camera } from './camera';

const TERRAIN_COLORS: Record<string, string> = {
  grassland: '#5b8c3e',
  plains: '#c4a94d',
  desert: '#e0c872',
  tundra: '#a0b8a0',
  snow: '#e8e8f0',
  forest: '#3d6b3d',
  hills: '#8b7355',
  mountain: '#6b6b7b',
  ocean: '#2a5f8f',
  coast: '#4a8faf',
  jungle: '#2d5a2d',
  swamp: '#4a6b4a',
  volcanic: '#5a3a3a',
};

const HEX_CORNERS_POINTY = (function () {
  const corners: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ dx: Math.cos(angle), dy: Math.sin(angle) });
  }
  return corners;
})();

export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
): void {
  const size = camera.hexSize;

  for (const tile of Object.values(map.tiles)) {
    if (!camera.isHexVisible(tile.coord)) continue;

    const pixel = hexToPixel(tile.coord, size);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const scaledSize = size * camera.zoom;
    const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;

    drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage);
  }
}

export function drawRivers(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
): void {
  ctx.strokeStyle = '#4a8faf';
  ctx.lineWidth = 3 * camera.zoom;
  ctx.lineCap = 'round';

  for (const river of map.rivers) {
    if (!camera.isHexVisible(river.from) && !camera.isHexVisible(river.to)) continue;

    const fromPixel = hexToPixel(river.from, camera.hexSize);
    const toPixel = hexToPixel(river.to, camera.hexSize);
    const fromScreen = camera.worldToScreen(fromPixel.x, fromPixel.y);
    const toScreen = camera.worldToScreen(toPixel.x, toPixel.y);

    // Draw river along the edge between hexes
    const midX = (fromScreen.x + toScreen.x) / 2;
    const midY = (fromScreen.y + toScreen.y) / 2;

    // Perpendicular to edge for visual width
    const dx = toScreen.x - fromScreen.x;
    const dy = toScreen.y - fromScreen.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;

    const perpX = (-dy / len) * camera.hexSize * camera.zoom * 0.3;
    const perpY = (dx / len) * camera.hexSize * camera.zoom * 0.3;

    ctx.beginPath();
    ctx.moveTo(midX - perpX, midY - perpY);
    ctx.lineTo(midX + perpX, midY + perpY);
    ctx.stroke();
  }
}

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tile: HexTile,
  isVillage: boolean = false,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const corner = HEX_CORNERS_POINTY[i];
    const x = cx + corner.dx * size;
    const y = cy + corner.dy * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Fill with terrain color
  ctx.fillStyle = TERRAIN_COLORS[tile.terrain] ?? '#888';
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw improvement indicator
  if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = tile.improvement === 'farm' ? '🌾' : '⛏️';
    ctx.fillText(icon, cx, cy);
  }

  // Draw wonder indicator
  if (tile.wonder) {
    ctx.font = `bold ${size * 0.55}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#e8c170';
    ctx.shadowBlur = size * 0.3;
    ctx.fillStyle = '#e8c170';
    ctx.fillText('✦', cx, cy);
    ctx.shadowBlur = 0;
  }

  // Draw village indicator
  if (isVillage && !tile.wonder) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏕️', cx, cy);
  }

  // Draw ownership indicator
  if (tile.owner) {
    ctx.strokeStyle = tile.owner === 'player' ? 'rgba(74,144,217,0.5)' : 'rgba(217,74,74,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawHexHighlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const corner = HEX_CORNERS_POINTY[i];
    const x = cx + corner.dx * size;
    const y = cy + corner.dy * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
