import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';
import { NATURAL_WONDER_SPECTACLE_RECIPES } from '@/systems/wonder-spectacle/recipes';

export {
  CODEX_AFFINITY_TAGS,
  SPECTACLE_PALETTE_KEYS,
  SPECTACLE_PRIMITIVES,
  SPECTACLE_REDUCED_MOTION_FALLBACKS,
  SPECTACLE_SOUND_MOODS,
  SPECTACLE_SURFACES,
  TIMING_HINTS,
} from '@/systems/wonder-spectacle/types';

export function getDuplicateRecipeIds(): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const recipe of NATURAL_WONDER_SPECTACLE_RECIPES) {
    if (seen.has(recipe.wonderId)) duplicates.add(recipe.wonderId);
    seen.add(recipe.wonderId);
  }
  return [...duplicates].sort((a, b) => a.localeCompare(b));
}

export function getMissingNaturalWonderRecipeIds(): string[] {
  const recipeIds = new Set(NATURAL_WONDER_SPECTACLE_RECIPES.map(recipe => recipe.wonderId));
  return WONDER_DEFINITIONS
    .map(wonder => wonder.id)
    .filter(wonderId => !recipeIds.has(wonderId))
    .sort((a, b) => a.localeCompare(b));
}
