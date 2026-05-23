import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';

export type WonderVisualKind = 'natural' | 'legendary';

export type WonderMapLandmark =
  | 'volcano'
  | 'mountain'
  | 'crystal'
  | 'forest'
  | 'reef'
  | 'canyon'
  | 'aurora'
  | 'falls'
  | 'bones'
  | 'sands'
  | 'ruins'
  | 'islands'
  | 'bay'
  | 'lake'
  | 'storm'
  | 'masked';

export type WonderVignette = WonderMapLandmark;
export type LegendaryWonderLandmark = 'spire' | 'arch' | 'dome' | 'obelisk' | 'citadel' | 'archive' | 'masked';

export interface WonderVisualDefinition {
  id: string;
  kind: WonderVisualKind;
  medallionGlyph: string;
  palette: {
    base: string;
    accent: string;
    glow: string;
  };
  mapLandmark: WonderMapLandmark;
  vignette: WonderVignette;
  supportsAmbientAnimation: boolean;
  reducedMotionFallback: 'static-landmark' | 'static-medallion';
  maskedLabel?: string;
  legendaryLandmark?: LegendaryWonderLandmark;
}

const LEGENDARY_LANDMARK_TYPES = ['spire', 'arch', 'dome', 'obelisk', 'citadel', 'archive'] as const;

function landmarkTypeForLegendaryWonder(wonderId: string): LegendaryWonderLandmark {
  const hash = [...wonderId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return LEGENDARY_LANDMARK_TYPES[hash % LEGENDARY_LANDMARK_TYPES.length];
}

const NATURAL_WONDER_VISUALS: Record<string, WonderVisualDefinition> = {
  great_volcano: naturalVisual('great_volcano', '◆', 'volcano', '#4c1f24', '#f0643a', '#ffc46b'),
  sacred_mountain: naturalVisual('sacred_mountain', '△', 'mountain', '#34405a', '#d5d8ff', '#eef0ff'),
  crystal_caverns: naturalVisual('crystal_caverns', '◇', 'crystal', '#27324f', '#74e6ff', '#c9fbff'),
  ancient_forest: naturalVisual('ancient_forest', '♣', 'forest', '#1f3f2a', '#7ccf6b', '#c5f7a7'),
  coral_reef: naturalVisual('coral_reef', '◌', 'reef', '#174b5c', '#ff9eb5', '#8ef4ff'),
  grand_canyon: naturalVisual('grand_canyon', '▱', 'canyon', '#5d3825', '#e28d4c', '#ffd28a'),
  aurora_fields: naturalVisual('aurora_fields', '≈', 'aurora', '#24324d', '#9cf5d4', '#d4f7ff'),
  frozen_falls: naturalVisual('frozen_falls', '❄', 'falls', '#29435a', '#aee8ff', '#effbff'),
  dragon_bones: naturalVisual('dragon_bones', '✶', 'bones', '#3f342b', '#e4d5bd', '#fff2d3'),
  singing_sands: naturalVisual('singing_sands', '∿', 'sands', '#6a4b25', '#f1cf73', '#fff0aa'),
  sunken_ruins: naturalVisual('sunken_ruins', '⌂', 'ruins', '#173c52', '#6fd4c8', '#bdf7ef'),
  floating_islands: naturalVisual('floating_islands', '⬡', 'islands', '#39405b', '#b8d77a', '#eef7b4'),
  bioluminescent_bay: naturalVisual('bioluminescent_bay', '●', 'bay', '#123f55', '#39e6cb', '#b6fff4'),
  bottomless_lake: naturalVisual('bottomless_lake', '◉', 'lake', '#17394a', '#5cb8ff', '#d0edff'),
  eternal_storm: naturalVisual('eternal_storm', 'ϟ', 'storm', '#202943', '#b7c7ff', '#f1f5ff'),
};

const LEGENDARY_WONDER_VISUALS: Record<string, WonderVisualDefinition> = Object.fromEntries(
  getLegendaryWonderDefinitions().map(definition => [
    definition.id,
    {
      id: definition.id,
      kind: 'legendary',
      medallionGlyph: '✦',
      palette: {
        base: '#2b2633',
        accent: '#e8c170',
        glow: '#fff0b8',
      },
      mapLandmark: 'masked',
      vignette: 'masked',
      supportsAmbientAnimation: false,
      reducedMotionFallback: 'static-medallion',
      maskedLabel: 'Legendary wonder',
      legendaryLandmark: landmarkTypeForLegendaryWonder(definition.id),
    } satisfies WonderVisualDefinition,
  ]),
);

const FALLBACK_WONDER_VISUAL: Omit<WonderVisualDefinition, 'id'> = {
  kind: 'natural',
  medallionGlyph: '?',
  palette: {
    base: '#2f3338',
    accent: '#d8dde6',
    glow: '#ffffff',
  },
  mapLandmark: 'masked',
  vignette: 'masked',
  supportsAmbientAnimation: false,
  reducedMotionFallback: 'static-medallion',
  maskedLabel: 'Unknown wonder',
  legendaryLandmark: 'masked',
};

const WONDER_VISUAL_CATALOG: Record<string, WonderVisualDefinition> = {
  ...NATURAL_WONDER_VISUALS,
  ...LEGENDARY_WONDER_VISUALS,
};

function naturalVisual(
  id: string,
  medallionGlyph: string,
  mapLandmark: Exclude<WonderMapLandmark, 'masked'>,
  base: string,
  accent: string,
  glow: string,
): WonderVisualDefinition {
  return {
    id,
    kind: 'natural',
    medallionGlyph,
    palette: { base, accent, glow },
    mapLandmark,
    vignette: mapLandmark,
    supportsAmbientAnimation: true,
    reducedMotionFallback: 'static-landmark',
  };
}

export function getWonderVisualDefinition(wonderId: string): WonderVisualDefinition {
  return WONDER_VISUAL_CATALOG[wonderId] ?? { ...FALLBACK_WONDER_VISUAL, id: wonderId };
}

export function getWonderVisualDefinitions(): WonderVisualDefinition[] {
  return Object.values(WONDER_VISUAL_CATALOG).map(visual => ({
    ...visual,
    palette: { ...visual.palette },
  }));
}
