import type { City, HexCoord } from '@/core/types';
import { getOccupiedCityMood } from '@/systems/city-occupation-system';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import type { LegendaryWonderMapEntry } from '@/systems/legendary-wonder-map-presentation';
import { drawLegendaryWonderLandmarks } from '@/renderer/wonders/legendary-wonder-renderer';
import { spriteCache } from '@/renderer/sprites/sprite-loader';

const CITY_ICON_EMOJI_Y_NUDGE_RATIO = 0.08;

export interface CityRenderProjection {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  isLive: boolean;
  liveCityId?: string;
  renderMode?: 'city' | 'landmark-only';
}

export interface CityRenderItem {
  projection: CityRenderProjection;
  city?: City;
  screen: { x: number; y: number };
  size: number;
  ownerColor: string;
  playerCivId: string;
  isMinorCiv: boolean;
  minorCivIcon?: string;
  breakaway?: { status: 'secession' | 'established' };
  landmarkEntries: LegendaryWonderMapEntry[];
  lowZoom: boolean;
  reducedMotion: boolean;
  nowMs: number;
  turn: number;
}

export type CityRenderPassName =
  | 'base'
  | 'icon'
  | 'landmarks'
  | 'label'
  | 'status'
  | 'production'
  | 'idle';

export type CityRenderPass = {
  name: CityRenderPassName;
  draw: (ctx: CanvasRenderingContext2D, item: CityRenderItem) => void;
};

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

function markPass(ctx: CanvasRenderingContext2D, passName: CityRenderPassName): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`city-pass:${passName}`);
}

export function drawCityBasePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'base');
  ctx.beginPath();
  ctx.arc(item.screen.x, item.screen.y, item.size * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = item.ownerColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawCityIconPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'icon');
  ctx.font = `${item.size * 0.45}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    item.isMinorCiv ? item.minorCivIcon ?? '📜' : '🏛️',
    item.screen.x,
    item.screen.y + item.size * CITY_ICON_EMOJI_Y_NUDGE_RATIO,
  );
}

export function drawCityLandmarkPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'landmarks');
  if (item.landmarkEntries.length === 0) return;
  drawLegendaryWonderLandmarks({
    ctx,
    cx: item.screen.x,
    cy: item.screen.y,
    size: item.size,
    entries: item.landmarkEntries,
    reducedMotion: item.reducedMotion,
    lowZoom: item.lowZoom,
    turn: item.turn,
    nowMs: item.nowMs,
  });
}

export function drawCityLabelPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'label');
  ctx.font = `bold ${Math.max(9, item.size * 0.22)}px system-ui`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `${item.projection.name} (${item.projection.population})`,
    item.screen.x,
    item.screen.y + item.size * 0.5,
  );
}

export function drawCityStatusBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'status');
  if (!item.projection.isLive || !item.city) return;

  const statusText = item.breakaway
    ? item.breakaway.status === 'secession' ? '⛓' : '👑'
    : item.city.occupation
      ? getOccupiedCityMood(item.city) === 2 ? '☹' : '⚡'
      : item.city.unrestLevel > 0
        ? item.city.unrestLevel === 2 ? '🔥' : '⚡'
        : null;
  if (!statusText) return;

  ctx.font = `${item.size * 0.28}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(statusText, item.screen.x + item.size * 0.45, item.screen.y - item.size * 0.45);
}

export function drawCityProductionBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'production');
  if (!item.projection.isLive || !item.city || item.city.owner !== item.playerCivId) return;

  const badgeSprite = item.lowZoom ? null : getProductionBadgeSprite(item.city, item.playerCivId);
  if (badgeSprite) {
    const badgeSize = item.size * 0.30;
    ctx.drawImage(
      badgeSprite,
      item.screen.x + item.size * 0.45 - badgeSize / 2,
      item.screen.y + item.size * 0.45 - badgeSize / 2,
      badgeSize,
      badgeSize,
    );
    return;
  }

  const buildIcon = getProductionBadgeIcon(item.city);
  if (!buildIcon) return;
  ctx.font = `${item.size * 0.28}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(buildIcon, item.screen.x + item.size * 0.45, item.screen.y + item.size * 0.45);
}

export function drawCityIdleBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'idle');
  if (
    !item.projection.isLive ||
    !item.city ||
    item.city.owner !== item.playerCivId ||
    item.city.productionQueue.length > 0 ||
    (item.city.idleProduction !== 'gold' && item.city.idleProduction !== 'science')
  ) {
    return;
  }

  const idleIcon = item.city.idleProduction === 'gold' ? '💰' : '🔬';
  ctx.font = `${item.size * 0.28}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(idleIcon, item.screen.x - item.size * 0.45, item.screen.y - item.size * 0.45);
}

export const CITY_RENDER_PASSES: CityRenderPass[] = [
  { name: 'base', draw: drawCityBasePass },
  { name: 'icon', draw: drawCityIconPass },
  { name: 'landmarks', draw: drawCityLandmarkPass },
  { name: 'label', draw: drawCityLabelPass },
  { name: 'status', draw: drawCityStatusBadgePass },
  { name: 'production', draw: drawCityProductionBadgePass },
  { name: 'idle', draw: drawCityIdleBadgePass },
];

export function drawCityRenderItem(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  ctx.save();
  try {
    for (const pass of CITY_RENDER_PASSES) {
      pass.draw(ctx, item);
    }
  } finally {
    ctx.restore();
  }
}
