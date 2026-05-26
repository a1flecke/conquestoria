import { NATURAL_WONDER_SPECTACLE_RECIPES } from '@/systems/wonder-spectacle/recipes';
import type { WonderSpectacleRecipe } from '@/systems/wonder-spectacle/types';

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
