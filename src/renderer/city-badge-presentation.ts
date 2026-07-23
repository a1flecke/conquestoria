/** Semantic glyphs used only for simultaneous strategic-map city badges. */
export const CITY_BADGE_GLYPHS = {
  underSiege: '⚔️',
  breakawaySecession: '⛓',
  breakawayEstablished: '👑',
  occupationSevere: '☹',
  occupation: '⚡',
  unrestSevere: '🔥',
  unrest: '⚡',
  production: '🏗️',
  idleGold: '💰',
  idleScience: '🔬',
  embeddedIntel: '🛡',
  infiltratedIntel: '👁',
  worldPressure: '⚠️',
  loyaltyPressure: '🙏',
} as const;

export type CityBadgeGlyphMeaning = keyof typeof CITY_BADGE_GLYPHS;

export type CityBadgeSlot =
  | 'status'
  | 'production'
  | 'idle'
  | 'leftIntel'
  | 'rightIntel'
  | 'worldPressure'
  | 'loyaltyPressure'
  | 'religion';

export interface BadgeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CityBadgeSlotLayout {
  center: { x: number; y: number };
  bounds: BadgeBounds;
}

export type CityBadgeLayout = Record<CityBadgeSlot, CityBadgeSlotLayout>;

/** Pairs whose text glyphs must remain distinguishable when both can appear. */
export const CITY_BADGE_GLYPH_COEXISTENCE: ReadonlyArray<
  readonly [CityBadgeGlyphMeaning, CityBadgeGlyphMeaning]
> = [
  ['production', 'underSiege'],
  ['production', 'breakawaySecession'],
  ['production', 'breakawayEstablished'],
  ['production', 'occupationSevere'],
  ['production', 'occupation'],
  ['production', 'unrestSevere'],
  ['production', 'unrest'],
  ['production', 'worldPressure'],
  ['production', 'loyaltyPressure'],
];

/** Pairs whose rendered bounds must not intersect. */
export const CITY_BADGE_SLOT_COEXISTENCE: ReadonlyArray<
  readonly [CityBadgeSlot, CityBadgeSlot]
> = [
  ['status', 'production'],
  ['status', 'worldPressure'],
  ['status', 'loyaltyPressure'],
  ['production', 'worldPressure'],
  ['production', 'religion'],
  ['worldPressure', 'loyaltyPressure'],
  ['worldPressure', 'religion'],
  ['loyaltyPressure', 'religion'],
];

function createSlot(
  screen: { x: number; y: number },
  size: number,
  dx: number,
  dy: number,
  width = 0.28,
  height = 0.28,
): CityBadgeSlotLayout {
  const center = { x: screen.x + size * dx, y: screen.y + size * dy };
  const boundsWidth = size * width;
  const boundsHeight = size * height;
  const x = center.x - boundsWidth / 2;
  const y = center.y - boundsHeight / 2;
  return {
    center,
    bounds: {
      x,
      y,
      width: boundsWidth,
      height: boundsHeight,
      left: x,
      right: x + boundsWidth,
      top: y,
      bottom: y + boundsHeight,
    },
  };
}

/**
 * Resolves all city-badge positions from one scale-aware coordinate system.
 * Production and idle intentionally share a slot because they cannot coexist.
 */
export function getCityBadgeLayout(
  screen: { x: number; y: number },
  size: number,
): CityBadgeLayout {
  return {
    status: createSlot(screen, size, 0.62, -0.4),
    production: createSlot(screen, size, -0.62, -0.4, 0.32, 0.32),
    idle: createSlot(screen, size, -0.62, -0.4),
    leftIntel: createSlot(screen, size, -0.52, 0.04),
    rightIntel: createSlot(screen, size, 0.52, 0.04),
    worldPressure: createSlot(screen, size, 0, -0.9, 0.32, 0.32),
    loyaltyPressure: createSlot(screen, size, 0.52, -0.9, 0.32, 0.32),
    religion: createSlot(screen, size, -0.85, -0.9, 0.32, 0.32),
  };
}
