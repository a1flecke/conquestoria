import type { GameState, HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import {
  getLegendaryWonderMapEntries,
  type LegendaryWonderMapEntry,
} from '@/systems/legendary-wonder-map-presentation';
import {
  drawCityRenderItem,
  type CityRenderItem,
  type CityRenderProjection,
} from '@/renderer/city-render-passes';

export { getProductionBadgeIcon } from '@/renderer/city-render-passes';

interface CityRenderInfo {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  color: string;
  unrestLevel: 0 | 1 | 2;
  breakawayStatus?: 'secession' | 'established';
  breakawayTurnsLeft?: number;
}

interface CityRenderOptions {
  reducedMotion?: boolean;
  nowMs?: number;
}

const OWNER_COLORS: Record<string, string> = {
  player: '#4a90d9',
  'ai-1': '#d94a4a',
};

export function getCityRenderData(state: GameState): CityRenderInfo[] {
  return Object.values(state.cities).map(city => {
    const owner = state.civilizations[city.owner];
    return {
      name: city.name,
      position: city.position,
      population: city.population,
      owner: city.owner,
      color: owner?.color ?? OWNER_COLORS[city.owner] ?? '#888',
      unrestLevel: city.unrestLevel,
      breakawayStatus: owner?.breakaway?.status,
      breakawayTurnsLeft: owner?.breakaway
        ? Math.max(0, owner.breakaway.establishesOnTurn - state.turn)
        : undefined,
    };
  });
}

export function drawCities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  playerCivId: string,
  options: CityRenderOptions | boolean = {},
): void {
  const items = createCityRenderItems(state, camera, playerCivId, options);
  for (const item of items) {
    drawCityRenderItem(ctx, item);
  }
}

function createCityRenderItems(
  state: GameState,
  camera: Camera,
  playerCivId: string,
  options: CityRenderOptions | boolean,
): CityRenderItem[] {
  const reducedMotion = typeof options === 'boolean' ? options : options.reducedMotion ?? false;
  const nowMs = typeof options === 'boolean' ? state.turn * 1000 : options.nowMs ?? state.turn * 1000;
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return [];

  const landmarksByCity = new Map<string, LegendaryWonderMapEntry[]>();
  for (const entry of getLegendaryWonderMapEntries(state, playerCivId)) {
    landmarksByCity.set(entry.cityId, [...(landmarksByCity.get(entry.cityId) ?? []), entry]);
  }

  const items: CityRenderItem[] = [];
  for (const projection of getCityRenderProjection(state, playerCivId)) {
    const city = projection.liveCityId ? state.cities[projection.liveCityId] : undefined;
    const mcState = projection.isLive && projection.owner.startsWith('mc-') ? state.minorCivs?.[projection.owner] : null;
    const mcDef = mcState ? MINOR_CIV_DEFINITIONS.find(definition => definition.id === mcState.definitionId) : null;
    const ownerColor = mcDef?.color
      ?? state.civilizations[projection.owner]?.color
      ?? OWNER_COLORS[projection.owner]
      ?? '#888';
    const breakaway = projection.isLive ? state.civilizations[projection.owner]?.breakaway : undefined;
    const minorCivIcon = mcDef?.archetype === 'militaristic'
      ? '⚔️'
      : mcDef?.archetype === 'mercantile'
        ? '🪙'
        : '📜';

    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(projection.position, state.map.width, camera)
      : [projection.position];

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;

      const pixel = hexToPixel(renderCoord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom;
      const landmarkEntries = projection.liveCityId
        ? landmarksByCity.get(projection.liveCityId) ?? []
        : [];

      items.push({
        projection,
        city: projection.isLive ? city : undefined,
        screen,
        size,
        ownerColor,
        playerCivId,
        isMinorCiv: projection.isLive && projection.owner.startsWith('mc-'),
        minorCivIcon,
        breakaway: breakaway ? { status: breakaway.status } : undefined,
        landmarkEntries,
        lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
        reducedMotion,
        nowMs,
        turn: state.turn,
      });
    }
  }

  return items;
}

function getCityRenderProjection(state: GameState, playerCivId: string): CityRenderProjection[] {
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return [];

  const liveCities = Object.values(state.cities)
    .filter(city => getVisibility(vis, city.position) === 'visible')
    .map(city => ({
      name: city.name,
      position: city.position,
      population: city.population,
      owner: city.owner,
      isLive: true,
      liveCityId: city.id,
    }));

  const staleCities = Object.values(vis.lastSeen ?? {})
    .filter(snapshot => getVisibility(vis, snapshot.coord) === 'fog' && snapshot.city)
    .map(snapshot => ({
      name: snapshot.city!.name,
      position: snapshot.coord,
      population: snapshot.city!.population,
      owner: snapshot.city!.owner,
      isLive: false,
    }));

  return [...liveCities, ...staleCities];
}
