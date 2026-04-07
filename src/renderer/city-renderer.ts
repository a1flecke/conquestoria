import type { GameState, HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible } from '@/systems/fog-of-war';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { Camera } from './camera';

interface CityRenderInfo {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  color: string;
  unrestLevel: 0 | 1 | 2;
}

const OWNER_COLORS: Record<string, string> = {
  player: '#4a90d9',
  'ai-1': '#d94a4a',
};

export function getCityRenderData(state: GameState): CityRenderInfo[] {
  return Object.values(state.cities).map(city => ({
    name: city.name,
    position: city.position,
    population: city.population,
    owner: city.owner,
    color: state.civilizations[city.owner]?.color ?? OWNER_COLORS[city.owner] ?? '#888',
    unrestLevel: city.unrestLevel,
  }));
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
    if (!camera.isHexVisible(city.position)) continue;

    const pixel = hexToPixel(city.position, camera.hexSize);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const size = camera.hexSize * camera.zoom;
    const mcState = city.owner.startsWith('mc-') ? state.minorCivs?.[city.owner] : null;
    const mcDef = mcState ? MINOR_CIV_DEFINITIONS.find(d => d.id === mcState.definitionId) : null;
    const color = mcDef?.color ?? state.civilizations[city.owner]?.color ?? OWNER_COLORS[city.owner] ?? '#888';

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

    if (city.unrestLevel > 0) {
      ctx.font = `${size * 0.28}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(city.unrestLevel === 2 ? '🔥' : '⚡', screen.x + size * 0.45, screen.y - size * 0.45);
    }
  }
}
