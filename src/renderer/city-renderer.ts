import type { GameState, HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import type { WorldPressurePresentation } from '@/systems/world-pressure-presentation';
import type { LoyaltyPressurePresentation } from '@/systems/loyalty-pressure-presentation';
import type { ReligionBadgePresentation } from '@/systems/religion-badge-presentation';
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
import {
  buildLiveCityMapPresentation,
  buildStaleCityMapPresentation,
} from '@/renderer/city-map-presentation';

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
  // Precomputed by the caller (render-loop caches this in setGameState, not per frame --
  // see getWorldPressurePresentationForViewer). Falling back to an empty presentation
  // when omitted keeps direct drawCities() callers (tests, tooling) working unchanged.
  worldPressurePresentation?: WorldPressurePresentation;
  // #593 MR6: same caching convention as worldPressurePresentation above.
  loyaltyPressurePresentation?: LoyaltyPressurePresentation;
  // #594 MR7: same caching convention as worldPressurePresentation above.
  religionBadgePresentation?: ReligionBadgePresentation;
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
  const worldPressurePresentation = typeof options === 'boolean' ? undefined : options.worldPressurePresentation;
  const worldPressureBadgesByCityId = new Map(
    (worldPressurePresentation?.cityBadges ?? []).map(badge => [badge.cityId, badge.archetype]),
  );
  const loyaltyPressurePresentation = typeof options === 'boolean' ? undefined : options.loyaltyPressurePresentation;
  const loyaltyPressureCityIds = new Set(
    (loyaltyPressurePresentation?.cityBadges ?? []).map(badge => badge.cityId),
  );
  const religionBadgePresentation = typeof options === 'boolean' ? undefined : options.religionBadgePresentation;
  const religionBadgeByCityId = new Map(
    (religionBadgePresentation?.cityBadges ?? []).map(badge => [badge.cityId, badge.isOwnFaith]),
  );
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return [];

  const landmarksByCoord = new Map<string, LegendaryWonderMapEntry[]>();
  for (const entry of getLegendaryWonderMapEntries(state, playerCivId)) {
    const key = `${entry.coord.q},${entry.coord.r}`;
    landmarksByCoord.set(key, [...(landmarksByCoord.get(key) ?? []), entry]);
  }

  const items: CityRenderItem[] = [];
  const viewerSpies = Object.values(state.espionage?.[playerCivId]?.spies ?? {});
  const projections = getCityRenderProjection(state, playerCivId);
  const projectedKeys = new Set(projections.map(projection => `${projection.position.q},${projection.position.r}`));
  for (const projection of projections) {
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
      const landmarkEntries = landmarksByCoord.get(`${projection.position.q},${projection.position.r}`) ?? [];
      const presentation = projection.isLive && city
        ? buildLiveCityMapPresentation(state, city, landmarkEntries)
        : buildStaleCityMapPresentation(projection.population);

      items.push({
        projection,
        city: projection.isLive ? city : undefined,
        presentation,
        screen,
        size,
        ownerColor,
        playerCivId,
        isMinorCiv: projection.isLive && projection.owner.startsWith('mc-'),
        minorCivIcon,
        breakaway: breakaway ? { status: breakaway.status } : undefined,
        intel: {
          hasEmbeddedSpy: projection.isLive
            && projection.owner === playerCivId
            && viewerSpies.some(spy => spy.status === 'embedded' && spy.targetCityId === city?.id),
          hasInfiltratedSpy: projection.isLive
            && viewerSpies.some(spy => (
              spy.infiltrationCityId === city?.id
              && (spy.status === 'stationed' || spy.status === 'on_mission' || spy.status === 'idle')
            )),
        },
        landmarkEntries,
        lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
        reducedMotion,
        nowMs,
        worldPressureCrisis: city ? worldPressureBadgesByCityId.get(city.id) : undefined,
        loyaltyPressure: city && loyaltyPressureCityIds.has(city.id) ? true : undefined,
        religionBadge: city && religionBadgeByCityId.has(city.id)
          ? { isOwnFaith: religionBadgeByCityId.get(city.id)! }
          : undefined,
      });
    }
  }

  for (const [coordKey, landmarkEntries] of landmarksByCoord.entries()) {
    if (projectedKeys.has(coordKey)) continue;
    const [q, r] = coordKey.split(',').map(Number);
    const coord = { q, r };
    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(coord, state.map.width, camera)
      : [coord];
    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;
      const pixel = hexToPixel(renderCoord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom;
      const firstEntry = landmarkEntries[0];
      items.push({
        projection: {
          name: firstEntry.cityName ?? firstEntry.label,
          position: coord,
          population: 0,
          owner: firstEntry.ownerId,
          isLive: false,
          renderMode: 'landmark-only',
        },
        presentation: buildStaleCityMapPresentation(0),
        screen,
        size,
        ownerColor: state.civilizations[firstEntry.ownerId]?.color
          ?? OWNER_COLORS[firstEntry.ownerId]
          ?? '#888',
        playerCivId,
        isMinorCiv: false,
        intel: { hasEmbeddedSpy: false, hasInfiltratedSpy: false },
        landmarkEntries,
        lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
        reducedMotion,
        nowMs,
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
