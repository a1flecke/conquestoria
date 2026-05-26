import type { WonderCodexTag } from '@/systems/wonder-codex/types';

export const SPECTACLE_PRIMITIVES = [
  'heatGlow',
  'smokePlume',
  'embers',
  'waterFlow',
  'sparkle',
  'lightBands',
  'mist',
  'lightning',
  'fireflies',
  'leafDrift',
  'sandRipple',
  'stonePulse',
  'crystalGleam',
  'fossilDust',
  'deepWaterAura',
  'ruinGlimmer',
] as const;

export type WonderSpectaclePrimitive = typeof SPECTACLE_PRIMITIVES[number];

export const SPECTACLE_PALETTE_KEYS = [
  'fire',
  'stone',
  'crystal',
  'forest',
  'reef',
  'canyon',
  'aurora',
  'iceWater',
  'ancientBone',
  'desert',
  'ruins',
  'skyIsland',
  'deepWater',
  'storm',
] as const;

export type WonderSpectaclePaletteKey = typeof SPECTACLE_PALETTE_KEYS[number];

export const SPECTACLE_SURFACES = ['map', 'codex', 'reveal'] as const;
export type WonderSpectacleSurface = typeof SPECTACLE_SURFACES[number];

export const SPECTACLE_REDUCED_MOTION_FALLBACKS = ['static-aura', 'static-landmark'] as const;
export type WonderSpectacleReducedMotionFallback = typeof SPECTACLE_REDUCED_MOTION_FALLBACKS[number];

export const TIMING_HINTS = ['slow', 'pulse', 'drift', 'flicker'] as const;
export type WonderSpectacleTimingHint = typeof TIMING_HINTS[number];

export const SPECTACLE_SOUND_MOODS = [
  'volcanic-breath',
  'high-wind-chime',
  'crystal-hum',
  'forest-whisper',
  'reef-glimmer',
  'canyon-echo',
  'aurora-shimmer',
  'frozen-fall',
  'ancient-bones',
  'singing-sand',
  'sunken-ruin',
  'floating-wind',
  'glowing-bay',
  'deep-lake',
  'distant-thunder',
] as const;

export type WonderSpectacleSoundMood = typeof SPECTACLE_SOUND_MOODS[number];
export type WonderSpectacleAffinityTag = WonderCodexTag;

export const CODEX_AFFINITY_TAGS = [
  'ancient',
  'aurora',
  'canyon',
  'cave',
  'coast',
  'culture',
  'desert',
  'discovery',
  'earth',
  'fire',
  'food',
  'forest',
  'fossil',
  'healing',
  'ice',
  'knowledge',
  'light',
  'mountain',
  'nature',
  'ocean',
  'science',
  'sea',
  'sky',
  'stone',
  'storm',
  'travel',
  'water',
] as const satisfies readonly WonderCodexTag[];

export type WonderSpectacleRenderMode =
  | 'hidden'
  | 'map-animated'
  | 'map-static'
  | 'codex-ambient'
  | 'codex-static'
  | 'reveal-amplified'
  | 'reveal-static';

export type WonderSpectacleMapPresentationKind = 'live' | 'last-seen' | 'unknown-fog' | 'unexplored';

export interface WonderSpectacleRecipe {
  wonderId: string;
  paletteKey: WonderSpectaclePaletteKey;
  affinityTags: WonderSpectacleAffinityTag[];
  surfaceSupport: ['map', 'codex', 'reveal'];
  mapPrimitives: WonderSpectaclePrimitive[];
  codexPrimitives: WonderSpectaclePrimitive[];
  revealPrimitives: WonderSpectaclePrimitive[];
  intensity: 'spectacle';
  reducedMotionFallback: WonderSpectacleReducedMotionFallback;
  soundMood: WonderSpectacleSoundMood;
  timingHints: WonderSpectacleTimingHint[];
}
