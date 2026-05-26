import type { GameState, HexCoord } from '@/core/types';

const CITY_ICON_EMOJI_Y_NUDGE_RATIO = 0.08;
import { hexToPixel } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { getOccupiedCityMood } from '@/systems/city-occupation-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import {
  getLegendaryWonderMapEntries,
  type LegendaryWonderMapEntry,
} from '@/systems/legendary-wonder-map-presentation';
import { drawLegendaryWonderLandmarks } from '@/renderer/wonders/legendary-wonder-renderer';

export function getProductionBadgeIcon(city: { productionQueue: string[] }): string | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return PRODUCTION_ICONS[id] ?? PRODUCTION_ICON_FALLBACK;
}

export function getProductionBadgeSprite(
  city: { productionQueue: string[] },
  civId: string,
): HTMLImageElement | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return spriteCache.getBuilding(id, civId) ?? null;
}

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

interface CityRenderProjection {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  isLive: boolean;
  liveCityId?: string;
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
  reducedMotion: boolean = false,
): void {
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return;
  const landmarksByCity = new Map<string, LegendaryWonderMapEntry[]>();
  for (const entry of getLegendaryWonderMapEntries(state, playerCivId)) {
    landmarksByCity.set(entry.cityId, [...(landmarksByCity.get(entry.cityId) ?? []), entry]);
  }

  for (const projection of getCityRenderProjection(state, playerCivId)) {
    const city = projection.liveCityId ? state.cities[projection.liveCityId] : undefined;
    const mcState = projection.isLive && projection.owner.startsWith('mc-') ? state.minorCivs?.[projection.owner] : null;
    const mcDef = mcState ? MINOR_CIV_DEFINITIONS.find(d => d.id === mcState.definitionId) : null;
    const color = mcDef?.color ?? state.civilizations[projection.owner]?.color ?? OWNER_COLORS[projection.owner] ?? '#888';
    const breakaway = projection.isLive ? state.civilizations[projection.owner]?.breakaway : undefined;

    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(projection.position, state.map.width, camera)
      : [projection.position];

    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;

      const pixel = hexToPixel(renderCoord, camera.hexSize);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const size = camera.hexSize * camera.zoom;

      // City background — larger than unit circle
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // City icon — archetype icon for minor civs
      ctx.font = `${size * 0.45}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const isMinorCiv = projection.isLive && projection.owner.startsWith('mc-');
      if (isMinorCiv) {
        const mcState = state.minorCivs?.[projection.owner];
        const def = mcState ? MINOR_CIV_DEFINITIONS.find(d => d.id === mcState.definitionId) : null;
        const icon = def?.archetype === 'militaristic' ? '⚔️'
          : def?.archetype === 'mercantile' ? '🪙'
          : '📜';
        ctx.fillText(icon, screen.x, screen.y + size * CITY_ICON_EMOJI_Y_NUDGE_RATIO);
      } else {
        ctx.fillText('🏛️', screen.x, screen.y + size * CITY_ICON_EMOJI_Y_NUDGE_RATIO);
      }

      // City name + population below
      ctx.font = `bold ${Math.max(9, size * 0.22)}px system-ui`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${projection.name} (${projection.population})`, screen.x, screen.y + size * 0.5);

      const legendaryEntries = projection.liveCityId ? landmarksByCity.get(projection.liveCityId) ?? [] : [];
      if (legendaryEntries.length > 0) {
        drawLegendaryWonderLandmarks({
          ctx,
          cx: screen.x,
          cy: screen.y,
          size,
          entries: legendaryEntries,
          reducedMotion,
          lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
        });
      }

      if (projection.isLive && city && breakaway) {
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(breakaway.status === 'secession' ? '⛓' : '👑', screen.x + size * 0.45, screen.y - size * 0.45);
      } else if (projection.isLive && city?.occupation) {
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getOccupiedCityMood(city) === 2 ? '☹' : '⚡', screen.x + size * 0.45, screen.y - size * 0.45);
      } else if (projection.isLive && city && city.unrestLevel > 0) {
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(city.unrestLevel === 2 ? '🔥' : '⚡', screen.x + size * 0.45, screen.y - size * 0.45);
      }

      // Bottom-right badge: currently-building icon (player-owned, non-empty queue only)
      if (projection.isLive && city && city.owner === playerCivId) {
        const badgeSprite = camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD
          ? getProductionBadgeSprite(city, playerCivId)
          : null;
        if (badgeSprite) {
          const badgeSize = size * 0.30;
          ctx.drawImage(
            badgeSprite,
            screen.x + size * 0.45 - badgeSize / 2,
            screen.y + size * 0.45 - badgeSize / 2,
            badgeSize,
            badgeSize,
          );
        } else {
          const buildIcon = getProductionBadgeIcon(city);
          if (buildIcon) {
            ctx.font = `${size * 0.28}px system-ui`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(buildIcon, screen.x + size * 0.45, screen.y + size * 0.45);
          }
        }
      }

      // Top-left badge: idle production mode (player-owned, queue empty, idleProduction set)
      if (
        projection.isLive &&
        city &&
        city.owner === playerCivId &&
        city.productionQueue.length === 0 &&
        (city.idleProduction === 'gold' || city.idleProduction === 'science')
      ) {
        const idleIcon = city.idleProduction === 'gold' ? '💰' : '🔬';
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(idleIcon, screen.x - size * 0.45, screen.y - size * 0.45);
      }
    }
  }
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
