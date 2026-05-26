import { NATURAL_WONDER_SPECTACLE_RECIPES } from '@/systems/wonder-spectacle/recipes';
import type {
  WonderSpectacleMapPresentationKind,
  WonderSpectacleRecipe,
  WonderSpectacleRenderMode,
  WonderSpectacleSurface,
} from '@/systems/wonder-spectacle/types';

function cloneRecipe(recipe: WonderSpectacleRecipe): WonderSpectacleRecipe {
  return {
    ...recipe,
    affinityTags: [...recipe.affinityTags],
    surfaceSupport: [...recipe.surfaceSupport] as ['map', 'codex', 'reveal'],
    mapPrimitives: [...recipe.mapPrimitives],
    codexPrimitives: [...recipe.codexPrimitives],
    revealPrimitives: [...recipe.revealPrimitives],
    timingHints: [...recipe.timingHints],
  };
}

export function getNaturalWonderSpectacleRecipes(): WonderSpectacleRecipe[] {
  return NATURAL_WONDER_SPECTACLE_RECIPES.map(cloneRecipe);
}

export function getWonderSpectacleRecipe(wonderId: string): WonderSpectacleRecipe | null {
  const recipe = NATURAL_WONDER_SPECTACLE_RECIPES.find(candidate => candidate.wonderId === wonderId);
  return recipe ? cloneRecipe(recipe) : null;
}

export interface WonderSpectacleRenderModeOptions {
  surface: WonderSpectacleSurface;
  wonderId: string;
  discovered: boolean;
  reducedMotion: boolean;
  presentationKind?: WonderSpectacleMapPresentationKind;
  lowZoom?: boolean;
}

export function getWonderSpectacleRenderMode(options: WonderSpectacleRenderModeOptions): WonderSpectacleRenderMode {
  const recipe = getWonderSpectacleRecipe(options.wonderId);
  if (!options.discovered) return 'hidden';
  if (!recipe) {
    if (options.surface === 'map') return 'map-static';
    if (options.surface === 'codex') return 'codex-static';
    return 'reveal-static';
  }

  if (options.surface === 'map') {
    return options.presentationKind === 'live' && !options.lowZoom && !options.reducedMotion
      ? 'map-animated'
      : 'map-static';
  }

  if (options.surface === 'codex') {
    return options.reducedMotion ? 'codex-static' : 'codex-ambient';
  }

  return options.reducedMotion ? 'reveal-static' : 'reveal-amplified';
}
