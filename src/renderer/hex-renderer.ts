import type { GameMap, HexCoord, HexTile, TerrainType, VisibilityMap } from '@/core/types';
import { hexToPixel, hexesInRange, HEX_CORNERS_POINTY, hexNeighbors, getWrappedHexNeighbors, hexKey } from '@/systems/hex-utils';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { shouldRenderOwnedTileBorder, shouldRenderOwnedTileBorderForPresentation } from './render-visibility';
import { resolveTilePresentationForViewer, type TilePresentationKind } from './tile-presentation';
import { drawNaturalWonderLandmark } from './wonders/natural-wonder-renderer';
import { RESOURCE_ICONS, RESOURCE_TECH } from '@/systems/trade-system';
import { LOD_SPRITE_ZOOM_THRESHOLD } from '@/renderer/sprites/sprite-system';
import { getOutpostMarkerImage } from './improvements/resource-outpost-marker';
import { getRailSegmentImage } from './improvements/rail-segment-loader';
import { getTerrainTileImage } from './terrain/terrain-tile-loader';
import { drawImprovementTreatment } from './improvements/improvement-treatment';

// Compatibility catalog for inspection/UI consumers. Strategic-map improvements
// render as terrain treatments rather than these glyphs.
export const IMPROVEMENT_ICONS: Record<string, string> = {
  farm: '🌾',
  mine: '⛏️',
  lumber_camp: '🪵',
  watermill: '💧',
  plantation: '🌿',
  pasture: '🐂',
  camp: '⛺',
  quarry: '⚒️',
  resource_outpost: '🚩',  // emoji fallback; SVG drawn via getOutpostMarkerImage when loaded
};

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
  viewerVisibility: VisibilityMap | undefined,
  zoom: number,
  presentationKind: TilePresentationKind,
  nowMs: number,
  reducedMotion: boolean,
  lowZoom: boolean,
  viewerTechs: ReadonlySet<string> = new Set(),
  lairGlyph?: string,
  suppressTerrainLabel: boolean = false,
  currentTurn?: number,
): void {
  drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer, viewerVisibility, presentationKind, nowMs, reducedMotion, lowZoom, viewerTechs, lairGlyph, currentTurn);
  if (shouldShowTerrainLabel(zoom) && !suppressTerrainLabel) {
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
  beastLairGlyphs?: Map<string, string>,
  currentPlayer?: string,
  viewerVisibility?: VisibilityMap,
  viewerTechs: ReadonlySet<string> = new Set(),
  terrainLabelSuppressedCoords: ReadonlySet<string> = new Set(),
  currentTurn?: number,
): void {
  const size = camera.hexSize;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : 0;
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const tile of Object.values(map.tiles)) {
    const renderCoords = map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(tile.coord, map.width, camera)
      : [tile.coord];
    const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;
    const tileKey = `${tile.coord.q},${tile.coord.r}`;
    const rawLairGlyph = beastLairGlyphs?.get(tileKey);

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;

      const pixel = hexToPixel(renderCoord, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;
      const presentation = resolveTilePresentationForViewer(map, viewerVisibility, renderCoord);
      const isExplored = presentation.kind === 'live' || presentation.kind === 'last-seen';
      drawTileAtScreen(
        ctx,
        screen,
        scaledSize,
        presentation.tile,
        isVillage && presentation.kind === 'live',
        currentPlayer,
        viewerVisibility,
        camera.zoom,
        presentation.kind,
        nowMs,
        reducedMotion,
        camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
        viewerTechs,
        presentation.kind === 'live' ? rawLairGlyph : undefined,
        terrainLabelSuppressedCoords.has(tileKey),
        currentTurn,
      );
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
  viewerVisibility?: VisibilityMap,
): void {
  for (const river of map.rivers) {
    if (
      !canRenderRiverEndpoint(map, viewerVisibility, river.from)
      && !canRenderRiverEndpoint(map, viewerVisibility, river.to)
    ) {
      continue;
    }
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
  viewerVisibility?: VisibilityMap,
): void {
  ctx.strokeStyle = '#4a8faf';
  ctx.lineWidth = 3 * camera.zoom;
  ctx.lineCap = 'round';

  for (const river of map.rivers) {
    if (
      !canRenderRiverEndpoint(map, viewerVisibility, river.from)
      && !canRenderRiverEndpoint(map, viewerVisibility, river.to)
    ) {
      continue;
    }
    if (!camera.isHexVisible(river.from) && !camera.isHexVisible(river.to)) continue;
    drawRiverSegment(ctx, camera, river.from, river.to);
  }

  if (map.wrapsHorizontally) {
    drawWrapGhostRivers(ctx, map, camera, viewerVisibility);
  }
}

function canRenderRiverEndpoint(map: GameMap, visibility: VisibilityMap | undefined, coord: HexCoord): boolean {
  const presentation = resolveTilePresentationForViewer(map, visibility, coord);
  return presentation.kind === 'live' || presentation.kind === 'last-seen';
}

// --- Roads (programmatic line, like rivers) and rail (directional sprite once
// both segment endpoints qualify — see `resolveTileHasRail` in road-network.ts) ---

function roadConnects(
  map: GameMap,
  visibility: VisibilityMap | undefined,
  cityTileKeys: ReadonlySet<string>,
  coord: HexCoord,
): boolean {
  const presentation = resolveTilePresentationForViewer(map, visibility, coord);
  if (presentation.kind !== 'live' && presentation.kind !== 'last-seen') return false;
  return Boolean(presentation.tile.hasRoad) || cityTileKeys.has(hexKey(coord));
}

function endpointHasRail(
  map: GameMap,
  visibility: VisibilityMap | undefined,
  completedTechsByCiv: Record<string, string[]>,
  coord: HexCoord,
): boolean {
  return resolveTilePresentationForViewer(map, visibility, coord, completedTechsByCiv).hasRail;
}

function drawRoadSegment(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  from: HexCoord,
  to: HexCoord,
): void {
  const fromPixel = hexToPixel(from, camera.hexSize);
  const toPixel = hexToPixel(to, camera.hexSize);
  const fromScreen = camera.worldToScreen(fromPixel.x, fromPixel.y);
  const toScreen = camera.worldToScreen(toPixel.x, toPixel.y);
  ctx.beginPath();
  ctx.moveTo(fromScreen.x, fromScreen.y);
  ctx.lineTo(toScreen.x, toScreen.y);
  ctx.stroke();
}

function drawRailSegment(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  from: HexCoord,
  to: HexCoord,
): boolean {
  const railImg = getRailSegmentImage();
  if (!railImg) return false;

  const fromPixel = hexToPixel(from, camera.hexSize);
  const toPixel = hexToPixel(to, camera.hexSize);
  const fromScreen = camera.worldToScreen(fromPixel.x, fromPixel.y);
  const toScreen = camera.worldToScreen(toPixel.x, toPixel.y);
  const dx = toScreen.x - fromScreen.x;
  const dy = toScreen.y - fromScreen.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return false;

  const midX = (fromScreen.x + toScreen.x) / 2;
  const midY = (fromScreen.y + toScreen.y) / 2;
  const angle = Math.atan2(dy, dx);
  const width = 8 * camera.zoom;

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  ctx.drawImage(railImg, -length / 2, -width / 2, length, width);
  ctx.restore();
  return true;
}

function forEachRoadSegment(
  map: GameMap,
  visibility: VisibilityMap | undefined,
  cityTileKeys: ReadonlySet<string>,
  onSegment: (from: HexCoord, to: HexCoord) => void,
): void {
  const seenPairs = new Set<string>();
  for (const tile of Object.values(map.tiles)) {
    if (!roadConnects(map, visibility, cityTileKeys, tile.coord)) continue;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(tile.coord, map.width)
      : hexNeighbors(tile.coord);
    for (const neighbor of neighbors) {
      if (!roadConnects(map, visibility, cityTileKeys, neighbor)) continue;
      const pairKey = [hexKey(tile.coord), hexKey(neighbor)].sort().join('|');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      onSegment(tile.coord, neighbor);
    }
  }
}

function drawRoadOrRailSegment(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  visibility: VisibilityMap | undefined,
  completedTechsByCiv: Record<string, string[]>,
  from: HexCoord,
  to: HexCoord,
): void {
  const isRail = endpointHasRail(map, visibility, completedTechsByCiv, from)
    && endpointHasRail(map, visibility, completedTechsByCiv, to);
  if (isRail && drawRailSegment(ctx, camera, from, to)) return;
  drawRoadSegment(ctx, camera, from, to);
}

export function drawRoads(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  cityTileKeys: ReadonlySet<string>,
  viewerVisibility?: VisibilityMap,
  completedTechsByCiv: Record<string, string[]> = {},
): void {
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 3 * camera.zoom;
  ctx.lineCap = 'round';

  forEachRoadSegment(map, viewerVisibility, cityTileKeys, (from, to) => {
    if (camera.isHexVisible(from) || camera.isHexVisible(to)) {
      drawRoadOrRailSegment(ctx, map, camera, viewerVisibility, completedTechsByCiv, from, to);
    }
  });

  if (map.wrapsHorizontally) {
    drawWrapGhostRoads(ctx, map, camera, cityTileKeys, viewerVisibility, completedTechsByCiv);
  }
}

export function drawWrapGhostRoads(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  cityTileKeys: ReadonlySet<string>,
  viewerVisibility?: VisibilityMap,
  completedTechsByCiv: Record<string, string[]> = {},
): void {
  forEachRoadSegment(map, viewerVisibility, cityTileKeys, (from, to) => {
    for (const offset of getHorizontalWrapOffsetsForRiver(from, to, map.width)) {
      const ghostFrom: HexCoord = { q: from.q + offset, r: from.r };
      const ghostTo: HexCoord = { q: to.q + offset, r: to.r };
      if (!camera.isHexVisible(ghostFrom) && !camera.isHexVisible(ghostTo)) continue;
      drawRoadOrRailSegment(ctx, map, camera, viewerVisibility, completedTechsByCiv, ghostFrom, ghostTo);
    }
  });
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
  viewerVisibility?: VisibilityMap,
  presentationKind: TilePresentationKind = 'live',
  nowMs: number = 0,
  reducedMotion: boolean = false,
  lowZoom: boolean = false,
  viewerTechs: ReadonlySet<string> = new Set(),
  lairGlyph?: string,
  currentTurn?: number,
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

  // Fill with terrain color (always — acts as fallback while tile loads)
  ctx.fillStyle = TERRAIN_COLORS[tile.terrain] ?? '#888';
  ctx.fill();

  // Draw terrain tile image if loaded (replaces flat color within canvas hex clip).
  // Tiles are 128×111 SVG — designed at the 2:√3 bounding-box ratio, so draw at
  // 2*size × √3*size (≈1.732*size). Flat color above fills the tiny hex-tip triangles
  // that the tile doesn't reach at top/bottom. Canvas clip keeps edges clean.
  const terrainImg = getTerrainTileImage(tile.terrain, tile.coord.q, tile.coord.r);
  if (terrainImg) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(terrainImg, cx - size, cy - size * 0.866, size * 2, size * 1.732);
    ctx.restore();
  }

  // Catastrophe crisis: devastated tile tint. `tile` is already fog-resolved by
  // resolveTilePresentationForViewer (only 'live' presentation carries the real
  // devastatedUntilTurn field), so no extra visibility check is needed here.
  if (tile.devastatedUntilTurn !== undefined && currentTurn !== undefined && tile.devastatedUntilTurn > currentTurn) {
    ctx.fillStyle = 'rgba(40,30,20,0.45)';
    ctx.fill();
  }

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw improvement indicator
  if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
    if (tile.improvement === 'resource_outpost') {
      const outpostImg = getOutpostMarkerImage();
      if (outpostImg) {
        const s = size * 0.6;
        ctx.drawImage(outpostImg, cx - s / 2, cy - s, s, s);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${size * 0.5}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🚩', cx, cy);
      }
    } else {
      drawImprovementTreatment(ctx, tile.improvement, cx, cy, size);
    }
  }

  // Draw construction progress indicator
  if (tile.improvement !== 'none' && tile.improvementTurnsLeft > 0) {
    ctx.globalAlpha = 0.42;
    drawImprovementTreatment(ctx, tile.improvement, cx, cy, size);
    ctx.globalAlpha = 1;
    ctx.font = `bold ${size * 0.22}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${tile.improvementTurnsLeft}t`, cx, cy + size * 0.3);
  }

  // Draw resource icon (tech-gated).
  // No explicit visibility guard needed: drawHex receives presentation.tile, which
  // already has resource: null for unexplored/unknown-fog tiles (via unknownTile()).
  // Last-seen tiles carry the resource from the snapshot — showing it is correct
  // (the player remembers what they saw). Tech gate still applies.
  // Suppressed on wonder tiles — the wonder landmark visual takes priority and
  // the resource is accessible via the inspection panel tap.
  if (tile.resource && !tile.wonder && viewerTechs.has(RESOURCE_TECH[tile.resource] ?? '')) {
    const icon = RESOURCE_ICONS[tile.resource] ?? '◆';
    // Corner layout when a completed improvement OR a village glyph will occupy the center
    const needsCornerLayout =
      (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) || isVillage;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (needsCornerLayout) {
      // Option B: small icon at top-left corner; other glyph stays centered
      ctx.font = `${size * 0.3}px system-ui`;
      ctx.fillText(icon, cx - size * 0.3, cy - size * 0.3);
    } else {
      // No competing glyph — centered at full icon size
      ctx.font = `${size * 0.5}px system-ui`;
      ctx.fillText(icon, cx, cy);
    }
  }

  // Draw wonder indicator
  if (tile.wonder) {
    drawNaturalWonderLandmark({
      ctx,
      cx,
      cy,
      size,
      wonderId: tile.wonder,
      presentationKind,
      nowMs,
      reducedMotion,
      lowZoom,
    });
  }

  // Draw village indicator
  if (isVillage && !tile.wonder) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏕️', cx, cy);
  }

  // Draw beast lair indicator (shown on explored tiles)
  if (lairGlyph && !tile.wonder && !isVillage) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lairGlyph, cx, cy);
  }

  // Draw ownership indicator
  const renderOwnership = viewerVisibility
    ? shouldRenderOwnedTileBorderForPresentation(presentationKind, currentPlayer, tile.owner)
    : shouldRenderOwnedTileBorder(viewerVisibility, currentPlayer, tile.owner ?? undefined, tile.coord);
  if (tile.owner && currentPlayer && renderOwnership) {
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
  outlineColor?: string,
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
  if (outlineColor) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

export function drawMinorCivTerritory(
  ctx: CanvasRenderingContext2D,
  center: HexCoord,
  color: string,
  camera: Camera,
  mapWidth?: number,
  wrapsHorizontally = false,
  viewerVisibility?: VisibilityMap,
  viewerCivId?: string,
  territoryOwnerId?: string,
): void {
  const hexes = hexesInRange(center, 2);
  for (const hex of hexes) {
    if (
      territoryOwnerId
      && viewerCivId
      && !shouldRenderOwnedTileBorder(viewerVisibility, viewerCivId, territoryOwnerId, hex)
    ) {
      continue;
    }

    const renderCoords = wrapsHorizontally && mapWidth
      ? getHorizontalWrapRenderCoords(hex, mapWidth, camera)
      : [hex];

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;
      const pixel = hexToPixel(renderCoord, camera.hexSize);
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
}
