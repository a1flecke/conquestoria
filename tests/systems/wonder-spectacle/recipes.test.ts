import { describe, expect, it } from 'vitest';
import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';
import { getWonderCodexContent } from '@/systems/wonder-codex/content';
import {
  getNaturalWonderSpectacleRecipes,
  getWonderSpectacleRecipe,
} from '@/systems/wonder-spectacle/presentation';
import {
  CODEX_AFFINITY_TAGS,
  SPECTACLE_PALETTE_KEYS,
  SPECTACLE_PRIMITIVES,
  SPECTACLE_REDUCED_MOTION_FALLBACKS,
  SPECTACLE_SOUND_MOODS,
  SPECTACLE_SURFACES,
  TIMING_HINTS,
  getDuplicateRecipeIds,
  getMissingNaturalWonderRecipeIds,
} from '@/systems/wonder-spectacle/validation';

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

describe('natural wonder spectacle recipes', () => {
  it('covers exactly every natural wonder definition', () => {
    expect(getDuplicateRecipeIds()).toEqual([]);
    expect(getMissingNaturalWonderRecipeIds()).toEqual([]);
    expect(sorted(getNaturalWonderSpectacleRecipes().map(recipe => recipe.wonderId))).toEqual(
      sorted(WONDER_DEFINITIONS.map(wonder => wonder.id)),
    );
  });

  it('provides complete future-extension metadata for every recipe', () => {
    for (const recipe of getNaturalWonderSpectacleRecipes()) {
      expect(getWonderSpectacleRecipe(recipe.wonderId)).toEqual(recipe);
      expect(SPECTACLE_PALETTE_KEYS).toContain(recipe.paletteKey);
      expect(recipe.intensity).toBe('spectacle');
      expect(SPECTACLE_REDUCED_MOTION_FALLBACKS).toContain(recipe.reducedMotionFallback);
      expect(SPECTACLE_SOUND_MOODS).toContain(recipe.soundMood);
      expect(recipe.affinityTags.length).toBeGreaterThanOrEqual(2);
      for (const tag of recipe.affinityTags) expect(CODEX_AFFINITY_TAGS).toContain(tag);
      expect(recipe.surfaceSupport).toEqual(['map', 'codex', 'reveal']);
      for (const surface of recipe.surfaceSupport) expect(SPECTACLE_SURFACES).toContain(surface);
      expect(recipe.mapPrimitives.length).toBeGreaterThan(0);
      expect(recipe.codexPrimitives.length).toBeGreaterThan(0);
      expect(recipe.revealPrimitives.length).toBeGreaterThanOrEqual(recipe.codexPrimitives.length);
      for (const primitive of [
        ...recipe.mapPrimitives,
        ...recipe.codexPrimitives,
        ...recipe.revealPrimitives,
      ]) {
        expect(SPECTACLE_PRIMITIVES).toContain(primitive);
      }
      for (const hint of recipe.timingHints) expect(TIMING_HINTS).toContain(hint);
    }
  });

  it('keeps recipe affinities aligned with Codex identity', () => {
    for (const recipe of getNaturalWonderSpectacleRecipes()) {
      const codex = getWonderCodexContent(recipe.wonderId);
      expect(codex?.kind).toBe('natural');
      const codexTags = new Set(codex?.tags ?? []);
      const overlap = recipe.affinityTags.filter(tag => codexTags.has(tag));
      expect(overlap.length).toBeGreaterThanOrEqual(1);
    }
  });
});
