import type { GameState, HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible } from '@/systems/fog-of-war';
import { getOccupiedCityMood } from '@/systems/city-occupation-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';

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
): void {
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return;

  for (const city of Object.values(state.cities)) {
    if (!isVisible(vis, city.position)) continue;
    const mcState = city.owner.startsWith('mc-') ? state.minorCivs?.[city.owner] : null;
    const mcDef = mcState ? MINOR_CIV_DEFINITIONS.find(d => d.id === mcState.definitionId) : null;
    const color = mcDef?.color ?? state.civilizations[city.owner]?.color ?? OWNER_COLORS[city.owner] ?? '#888';
    const breakaway = state.civilizations[city.owner]?.breakaway;

    const renderCoords = state.map.wrapsHorizontally
      ? getHorizontalWrapRenderCoords(city.position, state.map.width, camera)
      : [city.position];

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
      const isMinorCiv = city.owner.startsWith('mc-');
      if (isMinorCiv) {
        const mcState = state.minorCivs?.[city.owner];
        const def = mcState ? MINOR_CIV_DEFINITIONS.find(d => d.id === mcState.definitionId) : null;
        const icon = def?.archetype === 'militaristic' ? '⚔️'
          : def?.archetype === 'mercantile' ? '🪙'
          : '📜';
        ctx.fillText(icon, screen.x, screen.y);
      } else {
        ctx.fillText('🏛️', screen.x, screen.y);
      }

      // City name + population below
      ctx.font = `bold ${Math.max(9, size * 0.22)}px system-ui`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${city.name} (${city.population})`, screen.x, screen.y + size * 0.5);

      if (breakaway) {
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(breakaway.status === 'secession' ? '⛓' : '👑', screen.x + size * 0.45, screen.y - size * 0.45);
      } else if (city.occupation) {
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getOccupiedCityMood(city) === 2 ? '☹' : '⚡', screen.x + size * 0.45, screen.y - size * 0.45);
      } else if (city.unrestLevel > 0) {
        ctx.font = `${size * 0.28}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(city.unrestLevel === 2 ? '🔥' : '⚡', screen.x + size * 0.45, screen.y - size * 0.45);
      }

      // Bottom-right badge: currently-building icon (player-owned, non-empty queue only)
      if (city.owner === playerCivId) {
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
