import type { GameMap, HexCoord, HexTile, TerrainType } from '@/core/types';
import { hexToPixel, hexesInRange, HEX_CORNERS_POINTY } from '@/systems/hex-utils';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

// --- Terrain labels ---

const TERRAIN_LABELS: Record<TerrainType, string> = {
  grassland: 'Grass',
  plains: 'Plains',
  desert: 'Desert',
  tundra: 'Tundra',
  snow: 'Snow',
  forest: 'Forest',
  hills: 'Hills',
  mountain: 'Mtn',
  ocean: 'Ocean',
  coast: 'Coast',
  jungle: 'Jungle',
  swamp: 'Swamp',
  volcanic: 'Volc',
};

const LABEL_ZOOM_THRESHOLD = 0.5;

export function getTerrainLabel(terrain: TerrainType): string {
  return TERRAIN_LABELS[terrain] ?? terrain;
}

export function shouldShowTerrainLabel(zoom: number): boolean {
  return zoom >= LABEL_ZOOM_THRESHOLD;
}

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

function drawTileAtScreen(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  scaledSize: number,
  tile: HexTile,
  isVillage: boolean,
  currentPlayer: string | undefined,
  zoom: number,
): void {
  drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer);
  if (shouldShowTerrainLabel(zoom)) {
    const label = getTerrainLabel(tile.terrain);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = `${Math.round(scaledSize * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, screen.x, screen.y + scaledSize * 0.45);
  }
}

export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
  currentPlayer?: string,
): void {
  const size = camera.hexSize;

  for (const tile of Object.values(map.tiles)) {
    const renderCoords = map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(tile.coord, map.width)
      : [tile.coord];
    const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;

      const pixel = hexToPixel(renderCoord, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;
      drawTileAtScreen(ctx, screen, scaledSize, tile, isVillage, currentPlayer, camera.zoom);
    }
  }
}

function isNearHorizontalWrapEdge(coord: HexCoord, mapWidth: number): boolean {
  return coord.q >= mapWidth - 3 || coord.q < 3;
}

export function getHorizontalWrapOffsetsForRiver(
  from: HexCoord,
  to: HexCoord,
  mapWidth: number,
): number[] {
  if (!isNearHorizontalWrapEdge(from, mapWidth) && !isNearHorizontalWrapEdge(to, mapWidth)) {
    return [];
  }

  return [mapWidth, -mapWidth];
}

export function drawWrapGhostRivers(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
): void {
  for (const river of map.rivers) {
    for (const offset of getHorizontalWrapOffsetsForRiver(river.from, river.to, map.width)) {
      const ghostFrom: HexCoord = { q: river.from.q + offset, r: river.from.r };
      const ghostTo: HexCoord = { q: river.to.q + offset, r: river.to.r };
      if (!camera.isHexVisible(ghostFrom) && !camera.isHexVisible(ghostTo)) continue;
      drawRiverSegment(ctx, camera, ghostFrom, ghostTo);
    }
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
    drawRiverSegment(ctx, camera, river.from, river.to);
  }

  if (map.wrapsHorizontally) {
    drawWrapGhostRivers(ctx, map, camera);
  }
}

function drawRiverSegment(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  from: HexCoord,
  to: HexCoord,
): void {
  const fromPixel = hexToPixel(from, camera.hexSize);
  const toPixel = hexToPixel(to, camera.hexSize);
  const fromScreen = camera.worldToScreen(fromPixel.x, fromPixel.y);
  const toScreen = camera.worldToScreen(toPixel.x, toPixel.y);

  const midX = (fromScreen.x + toScreen.x) / 2;
  const midY = (fromScreen.y + toScreen.y) / 2;
  const dx = toScreen.x - fromScreen.x;
  const dy = toScreen.y - fromScreen.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  const perpX = (-dy / len) * camera.hexSize * camera.zoom * 0.3;
  const perpY = (dx / len) * camera.hexSize * camera.zoom * 0.3;

  ctx.beginPath();
  ctx.moveTo(midX - perpX, midY - perpY);
  ctx.lineTo(midX + perpX, midY + perpY);
  ctx.stroke();
}


function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tile: HexTile,
  isVillage: boolean = false,
  currentPlayer?: string,
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

  // Draw construction progress indicator
  if (tile.improvement !== 'none' && tile.improvementTurnsLeft > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${size * 0.35}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔨', cx, cy - size * 0.15);
    ctx.font = `bold ${size * 0.22}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`${tile.improvementTurnsLeft}t`, cx, cy + size * 0.25);
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
  if (tile.owner && currentPlayer) {
    ctx.strokeStyle = tile.owner === currentPlayer ? 'rgba(74,144,217,0.5)' : 'rgba(217,74,74,0.5)';
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

export function drawMinorCivTerritory(
  ctx: CanvasRenderingContext2D,
  center: HexCoord,
  color: string,
  camera: Camera,
): void {
  const hexes = hexesInRange(center, 2);
  for (const hex of hexes) {
    if (!camera.isHexVisible(hex)) continue;
    const pixel = hexToPixel(hex, camera.hexSize);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const size = camera.hexSize * camera.zoom;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = screen.x + size * Math.cos(angle);
      const y = screen.y + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
