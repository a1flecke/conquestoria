import type { City, CrisisArchetype, HexCoord } from '@/core/types';
import { getOccupiedCityMood } from '@/systems/city-occupation-system';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import type { LegendaryWonderMapEntry } from '@/systems/legendary-wonder-map-presentation';
import { drawLegendaryWonderLandmarkGlyph } from '@/renderer/wonders/legendary-wonder-renderer';
import {
  selectPrimaryCityWonder,
  type CityMapPresentation,
} from '@/renderer/city-map-presentation';

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
  presentation: CityMapPresentation;
  screen: { x: number; y: number };
  size: number;
  ownerColor: string;
  playerCivId: string;
  isMinorCiv: boolean;
  minorCivIcon?: string;
  breakaway?: { status: 'secession' | 'established' };
  intel: {
    hasEmbeddedSpy: boolean;
    hasInfiltratedSpy: boolean;
  };
  landmarkEntries: LegendaryWonderMapEntry[];
  lowZoom: boolean;
  reducedMotion: boolean;
  nowMs: number;
  // Viewer-safe world-pressure intel (#526 MR5) -- set only when this city appears in
  // getWorldPressurePresentationForViewer(...).cityBadges for the current viewer.
  worldPressureCrisis?: CrisisArchetype;
  // #593 MR6: set only when this city appears in
  // getLoyaltyPressurePresentationForViewer(...).cityBadges for the current viewer.
  loyaltyPressure?: true;
}

export type CityRenderPassName =
  | 'base'
  | 'icon'
  | 'landmarks'
  | 'label'
  | 'status'
  | 'production'
  | 'idle'
  | 'intel'
  | 'world-pressure'
  | 'loyalty-pressure';

export type CityRenderPass = {
  name: CityRenderPassName;
  draw: (ctx: CanvasRenderingContext2D, item: CityRenderItem) => void;
};

export function getProductionBadgeIcon(city: { productionQueue: string[] }): string | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return PRODUCTION_ICONS[id] ?? PRODUCTION_ICON_FALLBACK;
}

const TIER_STRUCTURE_COUNTS = {
  outpost: 1,
  village: 2,
  town: 3,
  city: 4,
  metropolis: 5,
} as const;

const SPECIALIZATION_COLORS = {
  military: '#b84b43',
  food: '#78a95b',
  production: '#b37a45',
  economy: '#d6b34f',
  science: '#5d94cf',
  culture: '#a76ac2',
  espionage: '#59606c',
} as const;

const FAMILY_ROOF_COLORS: Record<string, string> = {
  pharaohs: '#d3b35b',
  hellenes: '#7f9fb8',
  imperials: '#9b5148',
  vikings: '#61817d',
  khanate: '#a67c48',
  shogunate: '#764d58',
  generic: '#7d7467',
};

export function getCityDioramaBounds(size: number): { width: number; height: number } {
  return { width: size * 1.22, height: size * 0.96 };
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const characters = [...text];
  for (let length = characters.length - 1; length >= 1; length--) {
    const candidate = `${characters.slice(0, length).join('')}…`;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
  }
  return ctx.measureText('…').width <= maxWidth ? '…' : '';
}

export function fitCityBannerLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  population: number,
  maxWidth: number,
  showPopulation: boolean,
): string {
  const normalizedName = name.trim() || 'City';
  if (!showPopulation) return truncateTextToWidth(ctx, normalizedName, maxWidth);

  const populationSuffix = ` (${population})`;
  const fullLabel = `${normalizedName}${populationSuffix}`;
  if (ctx.measureText(fullLabel).width <= maxWidth) return fullLabel;

  const suffixWidth = ctx.measureText(populationSuffix).width;
  const nameWidth = maxWidth - suffixWidth;
  if (nameWidth > 0) {
    const fittedName = truncateTextToWidth(ctx, normalizedName, nameWidth);
    if (fittedName) {
      const fittedLabel = `${fittedName}${populationSuffix}`;
      if (ctx.measureText(fittedLabel).width <= maxWidth) return fittedLabel;
    }
  }

  return truncateTextToWidth(ctx, normalizedName, maxWidth);
}

function setFittedFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFontSize: number,
  minFontSize: number,
  weight = '',
): void {
  let fontSize = maxFontSize;
  const prefix = weight ? `${weight} ` : '';
  ctx.font = `${prefix}${fontSize}px system-ui`;
  while (fontSize > minFontSize && ctx.measureText(text).width > maxWidth) {
    fontSize = Math.max(minFontSize, fontSize - 0.5);
    ctx.font = `${prefix}${fontSize}px system-ui`;
  }
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxFontSize: number,
  minFontSize = 5,
  weight = '',
): void {
  setFittedFont(ctx, text, maxWidth, maxFontSize, minFontSize, weight);
  ctx.fillText(text, x, y);
}

export function getCityBannerTextColor(backgroundColor: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(backgroundColor);
  if (!match) return '#fff';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 155 ? '#181818' : '#fff';
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fillStyle: string,
  strokeStyle?: string,
): void {
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

function getArchitecturePalette(item: CityRenderItem): { wall: string; roof: string; trim: string } {
  const eraLightness = Math.min(4, Math.max(0, item.presentation.architectureEra - 1));
  const stale = item.presentation.visibilityMode === 'last-seen';
  return {
    wall: stale ? '#89857d' : ['#dfcfaa', '#d8c8a4', '#c7c3b5', '#b8bec1', '#adb8bd'][eraLightness],
    roof: stale ? '#66635e' : FAMILY_ROOF_COLORS[item.presentation.visualFamily] ?? FAMILY_ROOF_COLORS.generic,
    trim: stale ? '#55524d' : '#3d3a35',
  };
}

function markPass(ctx: CanvasRenderingContext2D, passName: CityRenderPassName): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`city-pass:${passName}`);
}

export function drawCityBasePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'base');
  ctx.beginPath();
  ctx.arc(item.screen.x, item.screen.y + item.size * 0.19, item.size * 0.44, 0, Math.PI);
  ctx.fillStyle = 'rgba(31,34,34,0.72)';
  ctx.fill();
  ctx.strokeStyle = item.ownerColor;
  ctx.lineWidth = Math.max(1.5, item.size * 0.045);
  ctx.stroke();
}

export function drawCityIconPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'icon');
  const { wall, roof, trim } = getArchitecturePalette(item);
  const count = item.lowZoom ? 1 : TIER_STRUCTURE_COUNTS[item.presentation.populationTier];
  const spacing = item.size * 0.19;
  const bodyWidth = item.size * (count === 1 ? 0.34 : 0.22);
  const bodyHeight = item.size * (0.24 + Math.min(3, item.presentation.architectureEra) * 0.025);
  const startX = item.screen.x - ((count - 1) * spacing) / 2;
  const baseline = item.screen.y + item.size * 0.18;

  for (let index = 0; index < count; index++) {
    const x = startX + index * spacing;
    const height = bodyHeight * (index % 2 === 0 ? 1 : 0.82);
    drawRect(ctx, x - bodyWidth / 2, baseline - height, bodyWidth, height, wall, trim);
    ctx.beginPath();
    ctx.moveTo(x - bodyWidth * 0.65, baseline - height);
    ctx.lineTo(x, baseline - height - item.size * 0.12);
    ctx.lineTo(x + bodyWidth * 0.65, baseline - height);
    ctx.closePath();
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.stroke();
  }

  if (!item.lowZoom) {
    item.presentation.specializations.forEach((category, index) => {
      const width = item.size * 0.11;
      drawRect(
        ctx,
        item.screen.x - item.size * 0.12 + index * item.size * 0.14,
        baseline - item.size * 0.08,
        width,
        item.size * 0.045,
        SPECIALIZATION_COLORS[category],
      );
    });
  }

  if (item.presentation.isCapital || item.presentation.isBreakawayCapital) {
    const flagX = item.screen.x;
    const flagTop = item.screen.y - item.size * 0.44;
    ctx.beginPath();
    ctx.moveTo(flagX, baseline - bodyHeight);
    ctx.lineTo(flagX, flagTop);
    ctx.lineTo(flagX + item.size * 0.19, flagTop + item.size * 0.06);
    ctx.lineTo(flagX, flagTop + item.size * 0.12);
    ctx.fillStyle = item.presentation.isBreakawayCapital ? '#f2d35e' : item.ownerColor;
    ctx.fill();
    ctx.strokeStyle = '#312f2b';
    ctx.stroke();
  }

  if (item.isMinorCiv && !item.lowZoom) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    drawFittedText(
      ctx,
      item.minorCivIcon ?? '📜',
      item.screen.x,
      item.screen.y + item.size * 0.03,
      item.size * 0.28,
      item.size * 0.18,
    );
  }
}

export function drawCityLandmarkPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  markPass(ctx, 'landmarks');
  if (item.landmarkEntries.length === 0) return;
  const selection = item.projection.renderMode === 'landmark-only'
    ? selectPrimaryCityWonder(item.landmarkEntries)
    : {
        primary: item.presentation.primaryWonder,
        completedOverflowCount: item.presentation.completedWonderOverflowCount,
      };
  if (!selection.primary) return;
  (ctx as unknown as { operations?: string[] }).operations?.push('legendary-landmarks:start');
  const radius = item.size * (item.lowZoom ? 0.12 : 0.16);
  const x = item.projection.renderMode === 'landmark-only' ? item.screen.x : item.screen.x + item.size * 0.4;
  const y = item.projection.renderMode === 'landmark-only' ? item.screen.y : item.screen.y - item.size * 0.3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(16,16,24,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,193,112,0.78)';
  ctx.lineWidth = Math.max(1, radius * 0.14);
  ctx.stroke();
  drawLegendaryWonderLandmarkGlyph({
    ctx,
    cx: x,
    cy: y,
    radius,
    metadata: selection.primary.metadata,
    state: selection.primary.state,
    reducedMotion: item.reducedMotion,
    nowMs: item.nowMs,
  });
  if (selection.completedOverflowCount > 0 && !item.lowZoom) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8e7af';
    drawFittedText(
      ctx,
      `+${selection.completedOverflowCount}`,
      x + radius * 0.72,
      y + radius * 0.72,
      radius * 1.4,
      Math.max(8, item.size * 0.13),
      5,
      'bold',
    );
  }
}

export function drawCityLabelPass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'label');
  const bannerWidth = item.size * 1.22;
  const bannerHeight = Math.max(13, item.size * 0.27);
  const bannerY = item.screen.y + item.size * 0.27;
  drawRect(
    ctx,
    item.screen.x - bannerWidth / 2,
    bannerY,
    bannerWidth,
    bannerHeight,
    item.ownerColor,
    'rgba(255,255,255,0.82)',
  );
  const availableTextWidth = bannerWidth * 0.92;
  const preferredFontSize = Math.max(9, item.size * 0.18);
  const desiredLabel = item.lowZoom
    ? item.projection.name
    : `${item.projection.name} (${item.projection.population})`;
  setFittedFont(
    ctx,
    desiredLabel,
    availableTextWidth,
    preferredFontSize,
    8,
    'bold',
  );
  const label = fitCityBannerLabel(
    ctx,
    item.projection.name,
    item.projection.population,
    availableTextWidth,
    !item.lowZoom,
  );
  ctx.fillStyle = getCityBannerTextColor(item.ownerColor);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, item.screen.x, bannerY + bannerHeight / 2);
}

export function drawCityStatusBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'status');
  if (!item.projection.isLive || !item.city) return;

  // '⚔️' matches the city panel's own "Under siege" label icon (#522) for consistency
  // between the map badge and the panel status line.
  const statusText = item.breakaway
    ? item.breakaway.status === 'secession' ? '⛓' : '👑'
    : item.presentation.underSiege
      ? '⚔️'
      : item.city.occupation
        ? getOccupiedCityMood(item.city) === 2 ? '☹' : '⚡'
        : item.city.unrestLevel > 0
          ? item.city.unrestLevel === 2 ? '🔥' : '⚡'
          : null;
  if (!statusText) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  drawFittedText(
    ctx,
    statusText,
    item.screen.x + item.size * 0.48,
    item.screen.y - item.size * 0.42,
    item.size * 0.28,
    item.size * 0.28,
  );
}

export function drawCityProductionBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'production');
  if (!item.projection.isLive || !item.city || item.city.owner !== item.playerCivId) return;

  const buildIcon = getProductionBadgeIcon(item.city);
  if (!buildIcon) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  drawFittedText(
    ctx,
    buildIcon,
    item.screen.x - item.size * 0.48,
    item.screen.y - item.size * 0.42,
    item.size * 0.28,
    item.size * 0.28,
  );
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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  drawFittedText(
    ctx,
    idleIcon,
    item.screen.x - item.size * 0.48,
    item.screen.y - item.size * 0.42,
    item.size * 0.28,
    item.size * 0.28,
  );
}

export function drawCityIntelBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'intel');
  if (!item.projection.isLive || item.lowZoom) return;

  const badges = [
    item.intel.hasEmbeddedSpy
      ? { text: '🛡', x: item.screen.x - item.size * 0.5 }
      : null,
    item.intel.hasInfiltratedSpy
      ? { text: '👁', x: item.screen.x + item.size * 0.5 }
      : null,
  ].filter((badge): badge is { text: string; x: number } => badge !== null);
  const y = item.screen.y + item.size * 0.04;
  for (const badge of badges) {
    ctx.beginPath();
    ctx.arc(badge.x, y, item.size * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,24,30,0.86)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawFittedText(
      ctx,
      badge.text,
      badge.x,
      y,
      item.size * 0.28,
      item.size * 0.2,
    );
  }
}

// Reuses drawCityIntelBadgePass's dark-circle "intel" style, at top-center so it never
// collides with the corner status/production/idle/spy badges. One glyph for every
// archetype (matches city-panel's existing '⚠️' crisis convention) -- this is player
// intel about a rival's crisis, not the rival's own detailed diagnosis.
export function drawCityWorldPressureBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'world-pressure');
  if (!item.projection.isLive || !item.city || !item.worldPressureCrisis) return;

  const x = item.screen.x;
  const y = item.screen.y - item.size * 0.58;
  ctx.beginPath();
  ctx.arc(x, y, item.size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,30,0.86)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawFittedText(ctx, '⚠️', x, y, item.size * 0.28, item.size * 0.2);
}

// #593 MR6: same dark-circle badge style, offset to the upper-right of the
// world-pressure badge (which sits top-center) so the two never collide when a city
// happens to have both a world-pressure crisis and active loyalty pressure.
export function drawCityLoyaltyPressureBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'loyalty-pressure');
  if (!item.projection.isLive || !item.city || !item.loyaltyPressure) return;

  const x = item.screen.x + item.size * 0.5;
  const y = item.screen.y - item.size * 0.58;
  ctx.beginPath();
  ctx.arc(x, y, item.size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,30,0.86)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawFittedText(ctx, '☦', x, y, item.size * 0.28, item.size * 0.2);
}

export const CITY_RENDER_PASSES: CityRenderPass[] = [
  { name: 'base', draw: drawCityBasePass },
  { name: 'icon', draw: drawCityIconPass },
  { name: 'landmarks', draw: drawCityLandmarkPass },
  { name: 'label', draw: drawCityLabelPass },
  { name: 'status', draw: drawCityStatusBadgePass },
  { name: 'production', draw: drawCityProductionBadgePass },
  { name: 'idle', draw: drawCityIdleBadgePass },
  { name: 'intel', draw: drawCityIntelBadgePass },
  { name: 'world-pressure', draw: drawCityWorldPressureBadgePass },
  { name: 'loyalty-pressure', draw: drawCityLoyaltyPressureBadgePass },
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
