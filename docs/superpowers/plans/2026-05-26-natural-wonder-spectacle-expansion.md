# Natural Wonder Spectacle Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use subagents for this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stage 2E natural-wonder spectacle recipes across live map rendering, Codex vignette/replay, and discovery reveal without gameplay, audio playback, video, save, or legendary city landmark changes.

**Architecture:** Add a presentation-only `wonder-spectacle` system that owns recipe data, render-mode decisions, and validation helpers. Canvas map and SVG/CSS UI adapters consume the same recipes through shared render-mode helpers so animation gating is centralized and testable. Existing map, Codex, and discovery reveal entry points are updated in place; no parallel surfaces are introduced.

**Tech Stack:** TypeScript, Canvas 2D, DOM/SVG/CSS, Vitest/jsdom, Vite, existing `createGameButton`, existing wonder Codex and renderer modules.

---

## Source Documents And Rules

Read these before editing:

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`
- `.claude/rules/incremental-mr-completion.md`
- `docs/superpowers/plans/README.md`
- `docs/superpowers/specs/2026-05-26-natural-wonder-spectacle-expansion-design.md`

## File Structure

Create:

- `src/systems/wonder-spectacle/types.ts`
  - Type unions for primitives, palette keys, surfaces, render modes, reduced-motion fallback, timing hints, sound moods, and recipes.
- `src/systems/wonder-spectacle/recipes.ts`
  - One authored natural-wonder spectacle recipe per current `WONDER_DEFINITIONS` natural wonder.
- `src/systems/wonder-spectacle/presentation.ts`
  - `getWonderSpectacleRecipe`, `getNaturalWonderSpectacleRecipes`, and `getWonderSpectacleRenderMode`.
- `src/systems/wonder-spectacle/validation.ts`
  - Test-facing support helpers for required surfaces, support tables, duplicate detection, recipe IDs, and affinity validation.
- `src/renderer/wonders/natural-wonder-effects-renderer.ts`
  - Canvas primitive support table and `drawNaturalWonderSpectacleEffects`.
- `src/ui/wonder-spectacle-vignette.ts`
  - SVG/CSS primitive support table, `createWonderSpectacleVignette`, and replay-state rendering.
- `tests/systems/wonder-spectacle/recipes.test.ts`
  - Future-extension recipe contract tests.
- `tests/systems/wonder-spectacle/presentation.test.ts`
  - Shared render-mode decision tests.
- `tests/renderer/natural-wonder-effects-renderer.test.ts`
  - Canvas adapter support and behavior tests.
- `tests/renderer/hex-renderer-wonder-spectacle.test.ts`
  - Low-zoom live map integration test with a scoped natural-wonder renderer mock.
- `tests/ui/wonder-spectacle-vignette.test.ts`
  - SVG/CSS adapter, accessibility, replay-state, and reduced-motion tests.

Modify:

- `src/renderer/wonders/natural-wonder-renderer.ts`
  - Insert spectacle effects behind the landmark shape and add `lowZoom` to render options.
- `src/renderer/hex-renderer.ts`
  - Pass low-zoom state into natural wonder rendering using `LOD_SPRITE_ZOOM_THRESHOLD`.
- `src/ui/wonder-codex-page.ts`
  - Replace the natural wonder hero vignette with spectacle vignette and add local visual-only replay.
- `src/ui/wonder-discovery-ceremony.ts`
  - Use the amplified reveal spectacle variant for natural wonder discovery.
- `tests/renderer/natural-wonder-renderer.test.ts`
  - Assert live/last-seen/low-zoom/reduced-motion behavior at the integrated renderer boundary.
- `tests/ui/wonder-codex-page.test.ts`
  - Assert replay control, visual-only state, accessibility, and reduced-motion behavior.
- `tests/ui/wonder-atlas-panel.test.ts`
  - Assert discovered natural Codex pages expose replay while undiscovered pages do not.
- `tests/ui/wonder-discovery-ceremony.test.ts`
  - Assert reveal consumes amplified spectacle mode and keeps action semantics.

Do not modify:

- `src/audio/**`
- `src/storage/**`
- `src-tauri/**`
- wonder placement, yields, discovery rewards, AI, save schema, or legendary city landmark rendering.

## Player Truth Table

| Surface | Before | Action | Immediate visible result | State change |
| --- | --- | --- | --- | --- |
| Map live visible natural wonder | Player pans over a visible discovered/visible natural wonder at normal zoom | None | Wonder tile shows bounded spectacle behind the landmark | None |
| Map last-seen natural wonder | Player sees remembered fog tile containing a wonder | None | Static landmark only | None |
| Map low zoom | Player zooms out below sprite threshold | None | Static landmark only | None |
| Codex natural page | Player opens a discovered natural wonder page | Click `Replay animation` | Vignette enters amplified replay state for 3-5 seconds, then returns to ambient | Local DOM state only |
| Codex reduced motion | Player has reduced motion enabled | Click replay equivalent if present | Static hero state remains visible; no loop animation | None |
| Discovery reveal | Player discovers a natural wonder | Click `Continue` | Reveal closes and normal game resumes | Existing resolve callback only |
| Discovery reveal | Player discovers a natural wonder | Click `Open Atlas` | Reveal resolves with existing `open-atlas` action | Existing resolve callback only |

## Misleading UI Risks

- `map-animated` must never appear for `last-seen`, `unexplored`, `unknown-fog`, low zoom, reduced motion, missing recipes, or undiscovered wonders.
- Codex replay is allowed for discovered-but-not-currently-live-visible natural wonders because the Codex is reference presentation, not live map intel.
- Replay labels must say `Replay animation`, never `Play video`, because Stage 2E does not implement real video.
- Sound mood metadata must never appear in UI in Stage 2E.
- Recipe primitive names must never appear in player-facing UI.

## Interaction Replay Checklist

- Open a discovered natural wonder Codex page.
- Click `Replay animation`.
- Assert the vignette reports `data-wonder-spectacle-mode="reveal-amplified"`.
- Advance timers beyond replay duration.
- Assert the vignette returns to `data-wonder-spectacle-mode="codex-ambient"`.
- Click `Replay animation` twice quickly.
- Assert there is one active replay state, no duplicate buttons, and no gameplay callbacks fire.
- Reopen Codex for a different current player.
- Assert only that player's discovered natural wonders expose replay.

---

### Task 1: Add Spectacle Recipe Types And Contract Tests

**Files:**

- Create: `src/systems/wonder-spectacle/types.ts`
- Create: `src/systems/wonder-spectacle/recipes.ts`
- Create: `src/systems/wonder-spectacle/validation.ts`
- Create: `tests/systems/wonder-spectacle/recipes.test.ts`

- [ ] **Step 1: Write failing recipe contract tests**

Create `tests/systems/wonder-spectacle/recipes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-spectacle/recipes.test.ts
```

Expected: fail with unresolved imports from `@/systems/wonder-spectacle/*`.

- [ ] **Step 3: Add spectacle types**

Create `src/systems/wonder-spectacle/types.ts`:

```ts
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
```

- [ ] **Step 4: Add the recipe catalog**

Create `src/systems/wonder-spectacle/recipes.ts`:

```ts
import type { WonderSpectacleRecipe } from '@/systems/wonder-spectacle/types';

function recipe(input: Omit<WonderSpectacleRecipe, 'intensity' | 'surfaceSupport'>): WonderSpectacleRecipe {
  return {
    ...input,
    surfaceSupport: ['map', 'codex', 'reveal'],
    intensity: 'spectacle',
  };
}

export const NATURAL_WONDER_SPECTACLE_RECIPES = [
  recipe({
    wonderId: 'great_volcano',
    paletteKey: 'fire',
    affinityTags: ['fire', 'stone', 'nature'],
    mapPrimitives: ['heatGlow', 'smokePlume', 'embers'],
    codexPrimitives: ['heatGlow', 'embers'],
    revealPrimitives: ['heatGlow', 'smokePlume', 'embers', 'stonePulse'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'volcanic-breath',
    timingHints: ['pulse', 'flicker'],
  }),
  recipe({
    wonderId: 'sacred_mountain',
    paletteKey: 'stone',
    affinityTags: ['mountain', 'stone', 'sky'],
    mapPrimitives: ['stonePulse', 'mist'],
    codexPrimitives: ['stonePulse', 'sparkle'],
    revealPrimitives: ['stonePulse', 'mist', 'lightBands'],
    reducedMotionFallback: 'static-landmark',
    soundMood: 'high-wind-chime',
    timingHints: ['slow', 'pulse'],
  }),
  recipe({
    wonderId: 'crystal_caverns',
    paletteKey: 'crystal',
    affinityTags: ['cave', 'stone', 'discovery'],
    mapPrimitives: ['crystalGleam', 'deepWaterAura'],
    codexPrimitives: ['crystalGleam', 'sparkle'],
    revealPrimitives: ['crystalGleam', 'sparkle', 'stonePulse'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'crystal-hum',
    timingHints: ['pulse'],
  }),
  recipe({
    wonderId: 'ancient_forest',
    paletteKey: 'forest',
    affinityTags: ['forest', 'healing', 'nature'],
    mapPrimitives: ['fireflies', 'leafDrift'],
    codexPrimitives: ['fireflies', 'leafDrift'],
    revealPrimitives: ['fireflies', 'leafDrift', 'sparkle'],
    reducedMotionFallback: 'static-landmark',
    soundMood: 'forest-whisper',
    timingHints: ['slow', 'drift'],
  }),
  recipe({
    wonderId: 'coral_reef',
    paletteKey: 'reef',
    affinityTags: ['sea', 'food', 'nature'],
    mapPrimitives: ['waterFlow', 'sparkle'],
    codexPrimitives: ['waterFlow', 'sparkle'],
    revealPrimitives: ['waterFlow', 'sparkle', 'deepWaterAura'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'reef-glimmer',
    timingHints: ['drift', 'pulse'],
  }),
  recipe({
    wonderId: 'grand_canyon',
    paletteKey: 'canyon',
    affinityTags: ['canyon', 'stone', 'earth'],
    mapPrimitives: ['stonePulse', 'mist'],
    codexPrimitives: ['stonePulse', 'sparkle'],
    revealPrimitives: ['stonePulse', 'mist', 'lightBands'],
    reducedMotionFallback: 'static-landmark',
    soundMood: 'canyon-echo',
    timingHints: ['slow'],
  }),
  recipe({
    wonderId: 'aurora_fields',
    paletteKey: 'aurora',
    affinityTags: ['aurora', 'sky', 'science'],
    mapPrimitives: ['lightBands', 'sparkle'],
    codexPrimitives: ['lightBands', 'sparkle'],
    revealPrimitives: ['lightBands', 'sparkle', 'deepWaterAura'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'aurora-shimmer',
    timingHints: ['drift', 'slow'],
  }),
  recipe({
    wonderId: 'frozen_falls',
    paletteKey: 'iceWater',
    affinityTags: ['ice', 'water', 'stone'],
    mapPrimitives: ['waterFlow', 'mist', 'sparkle'],
    codexPrimitives: ['waterFlow', 'mist'],
    revealPrimitives: ['waterFlow', 'mist', 'sparkle', 'stonePulse'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'frozen-fall',
    timingHints: ['drift'],
  }),
  recipe({
    wonderId: 'dragon_bones',
    paletteKey: 'ancientBone',
    affinityTags: ['fossil', 'science', 'ancient'],
    mapPrimitives: ['fossilDust', 'stonePulse'],
    codexPrimitives: ['fossilDust', 'sparkle'],
    revealPrimitives: ['fossilDust', 'stonePulse', 'sparkle'],
    reducedMotionFallback: 'static-landmark',
    soundMood: 'ancient-bones',
    timingHints: ['slow', 'drift'],
  }),
  recipe({
    wonderId: 'singing_sands',
    paletteKey: 'desert',
    affinityTags: ['desert', 'travel', 'culture'],
    mapPrimitives: ['sandRipple', 'sparkle'],
    codexPrimitives: ['sandRipple', 'sparkle'],
    revealPrimitives: ['sandRipple', 'sparkle', 'lightBands'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'singing-sand',
    timingHints: ['drift', 'pulse'],
  }),
  recipe({
    wonderId: 'sunken_ruins',
    paletteKey: 'ruins',
    affinityTags: ['ocean', 'ancient', 'science'],
    mapPrimitives: ['ruinGlimmer', 'deepWaterAura'],
    codexPrimitives: ['ruinGlimmer', 'waterFlow'],
    revealPrimitives: ['ruinGlimmer', 'deepWaterAura', 'waterFlow'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'sunken-ruin',
    timingHints: ['slow', 'drift'],
  }),
  recipe({
    wonderId: 'floating_islands',
    paletteKey: 'skyIsland',
    affinityTags: ['sky', 'stone', 'discovery'],
    mapPrimitives: ['mist', 'leafDrift', 'stonePulse'],
    codexPrimitives: ['mist', 'leafDrift'],
    revealPrimitives: ['mist', 'leafDrift', 'stonePulse', 'lightBands'],
    reducedMotionFallback: 'static-landmark',
    soundMood: 'floating-wind',
    timingHints: ['slow', 'drift'],
  }),
  recipe({
    wonderId: 'bioluminescent_bay',
    paletteKey: 'reef',
    affinityTags: ['sea', 'light', 'science'],
    mapPrimitives: ['deepWaterAura', 'sparkle'],
    codexPrimitives: ['deepWaterAura', 'sparkle'],
    revealPrimitives: ['deepWaterAura', 'sparkle', 'waterFlow'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'glowing-bay',
    timingHints: ['pulse', 'drift'],
  }),
  recipe({
    wonderId: 'bottomless_lake',
    paletteKey: 'deepWater',
    affinityTags: ['water', 'healing', 'science'],
    mapPrimitives: ['deepWaterAura', 'mist'],
    codexPrimitives: ['deepWaterAura', 'sparkle'],
    revealPrimitives: ['deepWaterAura', 'mist', 'sparkle'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'deep-lake',
    timingHints: ['slow', 'pulse'],
  }),
  recipe({
    wonderId: 'eternal_storm',
    paletteKey: 'storm',
    affinityTags: ['storm', 'sky', 'science'],
    mapPrimitives: ['lightning', 'mist'],
    codexPrimitives: ['lightning', 'deepWaterAura'],
    revealPrimitives: ['lightning', 'mist', 'deepWaterAura'],
    reducedMotionFallback: 'static-aura',
    soundMood: 'distant-thunder',
    timingHints: ['flicker', 'pulse'],
  }),
] satisfies WonderSpectacleRecipe[];
```

- [ ] **Step 5: Add presentation and validation exports needed by tests**

Create `src/systems/wonder-spectacle/presentation.ts`:

```ts
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
```

Create `src/systems/wonder-spectacle/validation.ts`:

```ts
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
```

- [ ] **Step 6: Run recipe tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-spectacle/recipes.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/systems/wonder-spectacle/types.ts src/systems/wonder-spectacle/recipes.ts src/systems/wonder-spectacle/presentation.ts src/systems/wonder-spectacle/validation.ts tests/systems/wonder-spectacle/recipes.test.ts
git commit -m "feat(wonders): add natural spectacle recipes"
```

### Task 2: Add Shared Render-Mode Decisions

**Files:**

- Modify: `src/systems/wonder-spectacle/presentation.ts`
- Test: `tests/systems/wonder-spectacle/presentation.test.ts`

- [ ] **Step 1: Write failing render-mode tests**

Create `tests/systems/wonder-spectacle/presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getWonderSpectacleRenderMode } from '@/systems/wonder-spectacle/presentation';

describe('wonder spectacle render modes', () => {
  it('animates map only for live visible natural wonders at normal zoom with motion enabled', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-animated');
  });

  it('uses static map rendering for last-seen, low zoom, reduced motion, missing recipes, and undiscovered wonders', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'last-seen',
      lowZoom: false,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: true,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: true,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'missing-wonder',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: false,
      discovered: true,
    })).toBe('map-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'map',
      wonderId: 'great_volcano',
      presentationKind: 'live',
      lowZoom: false,
      reducedMotion: false,
      discovered: false,
    })).toBe('hidden');
  });

  it('allows Codex ambient and replay modes for discovered natural wonders even when not live visible', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'codex',
      wonderId: 'great_volcano',
      reducedMotion: false,
      discovered: true,
    })).toBe('codex-ambient');
    expect(getWonderSpectacleRenderMode({
      surface: 'reveal',
      wonderId: 'great_volcano',
      reducedMotion: false,
      discovered: true,
    })).toBe('reveal-amplified');
  });

  it('hides undiscovered Codex/replay spectacle and uses static modes for reduced motion', () => {
    expect(getWonderSpectacleRenderMode({
      surface: 'codex',
      wonderId: 'great_volcano',
      reducedMotion: false,
      discovered: false,
    })).toBe('hidden');
    expect(getWonderSpectacleRenderMode({
      surface: 'codex',
      wonderId: 'great_volcano',
      reducedMotion: true,
      discovered: true,
    })).toBe('codex-static');
    expect(getWonderSpectacleRenderMode({
      surface: 'reveal',
      wonderId: 'great_volcano',
      reducedMotion: true,
      discovered: true,
    })).toBe('reveal-static');
  });
});
```

- [ ] **Step 2: Run the failing render-mode tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-spectacle/presentation.test.ts
```

Expected: fail because `getWonderSpectacleRenderMode` is not exported.

- [ ] **Step 3: Implement shared render-mode helper**

Update the top-level imports in `src/systems/wonder-spectacle/presentation.ts`, then add the render-mode helper below the existing recipe exports:

```ts
import type {
  WonderSpectacleMapPresentationKind,
  WonderSpectacleRenderMode,
  WonderSpectacleSurface,
} from '@/systems/wonder-spectacle/types';

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
```

- [ ] **Step 4: Run render-mode tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-spectacle/presentation.test.ts tests/systems/wonder-spectacle/recipes.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/wonder-spectacle/presentation.ts tests/systems/wonder-spectacle/presentation.test.ts
git commit -m "feat(wonders): add spectacle render modes"
```

### Task 3: Add Canvas Spectacle Adapter And Map Integration

**Files:**

- Create: `src/renderer/wonders/natural-wonder-effects-renderer.ts`
- Modify: `src/renderer/wonders/natural-wonder-renderer.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Test: `tests/renderer/natural-wonder-effects-renderer.test.ts`
- Test: `tests/renderer/natural-wonder-renderer.test.ts`
- Test: `tests/renderer/hex-renderer-wonder-spectacle.test.ts`

- [ ] **Step 1: Write failing Canvas adapter tests**

Create `tests/renderer/natural-wonder-effects-renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CANVAS_WONDER_SPECTACLE_PRIMITIVES,
  drawNaturalWonderSpectacleEffects,
} from '@/renderer/wonders/natural-wonder-effects-renderer';
import { getNaturalWonderSpectacleRecipes } from '@/systems/wonder-spectacle/presentation';

class MockCanvasContext {
  operations: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  globalAlpha = 1;
  shadowBlur = 0;
  shadowColor = '';

  save(): void { this.operations.push('save'); }
  restore(): void { this.operations.push('restore'); }
  beginPath(): void { this.operations.push('beginPath'); }
  arc(): void { this.operations.push('arc'); }
  ellipse(): void { this.operations.push('ellipse'); }
  moveTo(): void { this.operations.push('moveTo'); }
  lineTo(): void { this.operations.push('lineTo'); }
  bezierCurveTo(): void { this.operations.push('bezierCurveTo'); }
  closePath(): void { this.operations.push('closePath'); }
  fill(): void { this.operations.push(`fill:${this.fillStyle}`); }
  stroke(): void { this.operations.push(`stroke:${this.strokeStyle}`); }
}

describe('natural wonder spectacle canvas adapter', () => {
  it('supports every primitive used by recipes', () => {
    for (const recipe of getNaturalWonderSpectacleRecipes()) {
      for (const primitive of [...recipe.mapPrimitives, ...recipe.codexPrimitives, ...recipe.revealPrimitives]) {
        expect(CANVAS_WONDER_SPECTACLE_PRIMITIVES).toContain(primitive);
      }
    }
  });

  it('draws animated map effects only for map-animated mode', () => {
    const animated = new MockCanvasContext();
    drawNaturalWonderSpectacleEffects({
      ctx: animated as unknown as CanvasRenderingContext2D,
      wonderId: 'great_volcano',
      cx: 50,
      cy: 50,
      size: 40,
      nowMs: 1200,
      mode: 'map-animated',
    });
    expect(animated.operations).toContain('save');
    expect(animated.operations).toContain('restore');
    expect(animated.operations.some(operation => operation.startsWith('fill:'))).toBe(true);

    const staticCtx = new MockCanvasContext();
    drawNaturalWonderSpectacleEffects({
      ctx: staticCtx as unknown as CanvasRenderingContext2D,
      wonderId: 'great_volcano',
      cx: 50,
      cy: 50,
      size: 40,
      nowMs: 1200,
      mode: 'map-static',
    });
    expect(staticCtx.operations).toEqual([]);
  });
});
```

- [ ] **Step 2: Write failing integrated renderer tests**

Modify `tests/renderer/natural-wonder-renderer.test.ts` so every existing `drawNaturalWonderLandmark` call includes `lowZoom: false`, and add low-zoom behavior coverage:

```ts
it('draws spectacle effects for live natural wonders at normal zoom', () => {
  const ctx = new MockCanvasContext();

  drawNaturalWonderLandmark({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    cx: 40,
    cy: 40,
    size: 32,
    wonderId: 'great_volcano',
    presentationKind: 'live',
    nowMs: 1200,
    reducedMotion: false,
    lowZoom: false,
  });

  expect(ctx.operations.some(operation => operation.includes('rgba('))).toBe(true);
});

it('does not draw spectacle effects for last-seen, reduced-motion, or low-zoom landmarks', () => {
  for (const options of [
    { presentationKind: 'last-seen' as const, reducedMotion: false, lowZoom: false },
    { presentationKind: 'live' as const, reducedMotion: true, lowZoom: false },
    { presentationKind: 'live' as const, reducedMotion: false, lowZoom: true },
  ]) {
    const ctx = new MockCanvasContext();
    drawNaturalWonderLandmark({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 40,
      cy: 40,
      size: 32,
      wonderId: 'great_volcano',
      nowMs: 1200,
      ...options,
    });
    expect(ctx.operations.some(operation => operation.includes('rgba('))).toBe(false);
  }
});
```

- [ ] **Step 3: Run failing renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/natural-wonder-effects-renderer.test.ts tests/renderer/natural-wonder-renderer.test.ts
```

Expected: fail because the adapter and `lowZoom` option do not exist.

- [ ] **Step 4: Implement Canvas adapter**

Create `src/renderer/wonders/natural-wonder-effects-renderer.ts`:

```ts
import { getWonderSpectacleRecipe } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectaclePrimitive, WonderSpectacleRenderMode } from '@/systems/wonder-spectacle/types';

export const CANVAS_WONDER_SPECTACLE_PRIMITIVES = [
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
] as const satisfies readonly WonderSpectaclePrimitive[];

export interface NaturalWonderSpectacleDrawOptions {
  ctx: CanvasRenderingContext2D;
  wonderId: string;
  cx: number;
  cy: number;
  size: number;
  nowMs: number;
  mode: WonderSpectacleRenderMode;
}

function phase(nowMs: number, speed = 900): number {
  return (Math.sin(nowMs / speed) + 1) / 2;
}

function drawAura(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, amount: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, size * (0.5 + amount * 0.18), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16 + amount * 0.12;
  ctx.fill();
}

function drawPrimitive(
  ctx: CanvasRenderingContext2D,
  primitive: WonderSpectaclePrimitive,
  cx: number,
  cy: number,
  size: number,
  nowMs: number,
): void {
  const p = phase(nowMs, primitive === 'lightning' ? 180 : 900);
  if (primitive === 'lightning') {
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.18, cy - size * 0.5);
    ctx.lineTo(cx - size * 0.1, cy - size * 0.02);
    ctx.lineTo(cx + size * 0.1, cy - size * 0.02);
    ctx.lineTo(cx - size * 0.18, cy + size * 0.45);
    ctx.strokeStyle = `rgba(241,245,255,${0.35 + p * 0.45})`;
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.stroke();
    return;
  }
  if (primitive === 'smokePlume' || primitive === 'mist' || primitive === 'fossilDust') {
    ctx.beginPath();
    ctx.ellipse(cx - size * 0.12, cy - size * (0.35 + p * 0.08), size * 0.22, size * 0.12, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(248,241,223,0.24)';
    ctx.fill();
    return;
  }
  if (primitive === 'waterFlow' || primitive === 'sandRipple' || primitive === 'lightBands' || primitive === 'leafDrift') {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.5, cy + size * (p * 0.16 - 0.08));
    ctx.bezierCurveTo(cx - size * 0.18, cy - size * 0.28, cx + size * 0.2, cy + size * 0.28, cx + size * 0.5, cy - size * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = Math.max(1.5, size * 0.045);
    ctx.stroke();
    return;
  }
  drawAura(ctx, cx, cy, size, 'rgba(232,193,112,1)', p);
}

export function drawNaturalWonderSpectacleEffects(options: NaturalWonderSpectacleDrawOptions): void {
  if (options.mode !== 'map-animated') return;
  const recipe = getWonderSpectacleRecipe(options.wonderId);
  if (!recipe) return;

  options.ctx.save();
  for (const primitive of recipe.mapPrimitives) {
    drawPrimitive(options.ctx, primitive, options.cx, options.cy, options.size, options.nowMs);
  }
  options.ctx.restore();
}
```

- [ ] **Step 5: Wire adapter into natural wonder renderer**

Modify `src/renderer/wonders/natural-wonder-renderer.ts`:

```ts
import { drawNaturalWonderSpectacleEffects } from '@/renderer/wonders/natural-wonder-effects-renderer';
import { getWonderSpectacleRenderMode } from '@/systems/wonder-spectacle/presentation';
```

Add `lowZoom` to `NaturalWonderRenderOptions`:

```ts
  lowZoom: boolean;
```

In `drawNaturalWonderLandmark`, after drawing the base circle and before the glow/shape:

```ts
  const spectacleMode = getWonderSpectacleRenderMode({
    surface: 'map',
    wonderId,
    presentationKind,
    lowZoom,
    reducedMotion,
    discovered: presentationKind === 'live' || presentationKind === 'last-seen',
  });
  drawNaturalWonderSpectacleEffects({ ctx, cx, cy, size, wonderId, nowMs, mode: spectacleMode });
```

- [ ] **Step 6: Wire low zoom through map renderer**

Modify `src/renderer/hex-renderer.ts`:

```ts
import { LOD_SPRITE_ZOOM_THRESHOLD } from '@/renderer/sprites/sprite-system';
```

Pass `zoom` into `drawHex` as a new argument or pass `lowZoom` directly. The final call to `drawNaturalWonderLandmark` must include:

```ts
      lowZoom: zoom < LOD_SPRITE_ZOOM_THRESHOLD,
```

- [ ] **Step 7: Add hex-renderer low-zoom integration test**

Create `tests/renderer/hex-renderer-wonder-spectacle.test.ts` so the natural-wonder renderer can be mocked without disturbing the broad `hex-renderer` suite:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '@/core/types';
import type { VisibilityMap } from '@/systems/fog-of-war';
import { drawHexMap } from '@/renderer/hex-renderer';

vi.mock('@/renderer/wonders/natural-wonder-renderer', () => ({
  drawNaturalWonderLandmark: vi.fn(),
}));
```

Copy `MockCanvasContext`, `makeMap`, and `makeCamera` from `tests/renderer/hex-renderer.test.ts` into this new test file, excluding unrelated test cases, then add:

```ts
it('passes low zoom state to natural wonder rendering', async () => {
  const { drawNaturalWonderLandmark } = await import('@/renderer/wonders/natural-wonder-renderer');
  const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
  const map = makeMap();
  map.tiles['0,0'].wonder = 'great_volcano';
  const camera = { ...makeCamera(), zoom: 0.35 };
  const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'visible' } };

  drawHexMap(ctx, map, camera as Camera, undefined, 'player', visibility);

  expect(drawNaturalWonderLandmark).toHaveBeenCalledWith(expect.objectContaining({
    wonderId: 'great_volcano',
    lowZoom: true,
    presentationKind: 'live',
  }));
});
```

- [ ] **Step 8: Run renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/natural-wonder-effects-renderer.test.ts tests/renderer/natural-wonder-renderer.test.ts tests/renderer/hex-renderer-wonder-spectacle.test.ts tests/renderer/hex-renderer.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/wonders/natural-wonder-effects-renderer.ts src/renderer/wonders/natural-wonder-renderer.ts src/renderer/hex-renderer.ts tests/renderer/natural-wonder-effects-renderer.test.ts tests/renderer/natural-wonder-renderer.test.ts tests/renderer/hex-renderer-wonder-spectacle.test.ts tests/renderer/hex-renderer.test.ts
git commit -m "feat(wonders): render natural spectacle on map"
```

### Task 4: Add SVG/CSS Spectacle Vignette Adapter

**Files:**

- Create: `src/ui/wonder-spectacle-vignette.ts`
- Test: `tests/ui/wonder-spectacle-vignette.test.ts`

- [ ] **Step 1: Write failing UI adapter tests**

Create `tests/ui/wonder-spectacle-vignette.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  SVG_WONDER_SPECTACLE_PRIMITIVES,
  createWonderSpectacleVignette,
} from '@/ui/wonder-spectacle-vignette';
import { getNaturalWonderSpectacleRecipes } from '@/systems/wonder-spectacle/presentation';

describe('wonder spectacle vignette', () => {
  it('supports every primitive used by recipes', () => {
    for (const recipe of getNaturalWonderSpectacleRecipes()) {
      for (const primitive of [...recipe.mapPrimitives, ...recipe.codexPrimitives, ...recipe.revealPrimitives]) {
        expect(SVG_WONDER_SPECTACLE_PRIMITIVES).toContain(primitive);
      }
    }
  });

  it('renders an accessible ambient Codex vignette', () => {
    const root = createWonderSpectacleVignette({
      wonderId: 'great_volcano',
      name: 'Great Volcano',
      mode: 'codex-ambient',
      reducedMotion: false,
    });

    expect(root.dataset.wonderSpectacleMode).toBe('codex-ambient');
    expect(root.querySelector('svg')?.getAttribute('aria-label')).toBe('Great Volcano spectacle animation');
    expect(root.querySelectorAll('[data-wonder-spectacle-primitive]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('animate').length).toBeGreaterThan(0);
  });

  it('renders static equivalent for reduced motion', () => {
    const root = createWonderSpectacleVignette({
      wonderId: 'great_volcano',
      name: 'Great Volcano',
      mode: 'codex-static',
      reducedMotion: true,
    });

    expect(root.dataset.wonderSpectacleMode).toBe('codex-static');
    expect(root.dataset.vignetteMotion).toBe('static');
    expect(root.querySelectorAll('animate')).toHaveLength(0);
  });

  it('renders amplified replay/reveal mode from the same recipe', () => {
    const root = createWonderSpectacleVignette({
      wonderId: 'great_volcano',
      name: 'Great Volcano',
      mode: 'reveal-amplified',
      reducedMotion: false,
    });

    expect(root.dataset.wonderSpectacleMode).toBe('reveal-amplified');
    expect(root.querySelector('[data-wonder-spectacle-variant="amplified"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run failing adapter tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-spectacle-vignette.test.ts
```

Expected: fail because `wonder-spectacle-vignette.ts` does not exist.

- [ ] **Step 3: Implement SVG/CSS adapter**

Create `src/ui/wonder-spectacle-vignette.ts`:

```ts
import { getWonderSpectacleRecipe } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectaclePrimitive, WonderSpectacleRenderMode } from '@/systems/wonder-spectacle/types';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export const SVG_WONDER_SPECTACLE_PRIMITIVES = [
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
] as const satisfies readonly WonderSpectaclePrimitive[];

export interface WonderSpectacleVignetteOptions {
  wonderId: string;
  name: string;
  mode: Extract<WonderSpectacleRenderMode, 'codex-ambient' | 'codex-static' | 'reveal-amplified' | 'reveal-static'>;
  reducedMotion: boolean;
}

function createSvgElement(name: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function appendPrimitive(svg: SVGSVGElement, primitive: WonderSpectaclePrimitive, amplified: boolean, motionEnabled: boolean): void {
  const node = createSvgElement(primitive === 'lightning' ? 'path' : 'circle');
  node.setAttribute('data-wonder-spectacle-primitive', primitive);
  node.setAttribute('data-wonder-spectacle-variant', amplified ? 'amplified' : 'ambient');
  if (node.tagName === 'path') {
    node.setAttribute('d', 'M58 12 L36 48 H52 L40 88 L72 42 H56 Z');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', amplified ? '7' : '5');
  } else {
    node.setAttribute('cx', primitive === 'embers' || primitive === 'sparkle' ? '68' : '50');
    node.setAttribute('cy', primitive === 'smokePlume' || primitive === 'mist' ? '28' : '50');
    node.setAttribute('r', amplified ? '34' : '25');
    node.setAttribute('fill', 'currentColor');
    node.setAttribute('opacity', amplified ? '0.34' : '0.22');
  }
  if (motionEnabled) {
    const pulse = createSvgElement('animate');
    pulse.setAttribute('attributeName', 'opacity');
    pulse.setAttribute('values', amplified ? '0.22;0.58;0.22' : '0.14;0.34;0.14');
    pulse.setAttribute('dur', amplified ? '1.6s' : '3.2s');
    pulse.setAttribute('repeatCount', 'indefinite');
    node.appendChild(pulse);
  }
  svg.appendChild(node);
}

export function createWonderSpectacleVignette(options: WonderSpectacleVignetteOptions): HTMLElement {
  const recipe = getWonderSpectacleRecipe(options.wonderId);
  const visual = getWonderVisualDefinition(options.wonderId);
  const wrapper = document.createElement('div');
  const motionEnabled = !options.reducedMotion && !options.mode.endsWith('static');
  wrapper.dataset.wonderSpectacleMode = options.mode;
  wrapper.dataset.vignetteMotion = motionEnabled
    ? options.mode === 'reveal-amplified' ? 'amplified' : 'ambient'
    : 'static';
  wrapper.style.cssText = 'position:relative;width:118px;height:118px;flex:0 0 118px;display:grid;place-items:center;color:' + visual.palette.glow + ';';

  const svg = createSvgElement('svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${options.name} spectacle animation`);
  svg.style.cssText = `width:112px;height:112px;filter:drop-shadow(0 0 12px ${visual.palette.glow});`;

  const base = createSvgElement('circle');
  base.setAttribute('cx', '50');
  base.setAttribute('cy', '50');
  base.setAttribute('r', '32');
  base.setAttribute('fill', visual.palette.base);
  svg.appendChild(base);

  const primitives = options.mode.startsWith('reveal')
    ? recipe?.revealPrimitives ?? []
    : recipe?.codexPrimitives ?? [];
  for (const primitive of primitives) {
    appendPrimitive(svg, primitive, options.mode === 'reveal-amplified', motionEnabled);
  }

  wrapper.appendChild(svg);
  return wrapper;
}
```

- [ ] **Step 4: Run UI adapter tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-spectacle-vignette.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/wonder-spectacle-vignette.ts tests/ui/wonder-spectacle-vignette.test.ts
git commit -m "feat(wonders): add spectacle vignette adapter"
```

### Task 5: Integrate Codex Spectacle And Replay

**Files:**

- Modify: `src/ui/wonder-codex-page.ts`
- Modify: `tests/ui/wonder-codex-page.test.ts`
- Modify: `tests/ui/wonder-atlas-panel.test.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Discovered natural wonder Codex page shows ambient spectacle | Click `Replay animation` | Vignette switches to amplified mode |
| Amplified replay is active | Timer reaches replay duration | Vignette returns to ambient mode |
| Reduced motion natural Codex page | View page | Static spectacle and accessible replay explanation/no animation |
| Undiscovered natural wonder | Open Atlas/Codex | No page, no replay, no primitive or sound metadata |

- [ ] **Step 1: Write failing Codex replay tests**

Update the existing Vitest import in `tests/ui/wonder-codex-page.test.ts` to include fake-timer helpers, then add:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('renders visual-only replay control for natural wonder spectacle', () => {
  const onAction = vi.fn();
  const root = createWonderCodexPage(page(), {
    mode: 'desktop',
    onAction,
    onSelectRelated: vi.fn(),
  });

  const replay = root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]');
  expect(replay).toBeTruthy();
  expect(replay!.textContent).toContain('Replay animation');
  expect(replay!.getAttribute('aria-label')).toBe('Replay Great Volcano animation');
  expect(root.querySelector('[data-wonder-spectacle-mode="codex-ambient"]')).toBeTruthy();

  replay!.click();
  expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();
  expect(onAction).not.toHaveBeenCalled();

  vi.advanceTimersByTime(3600);
  expect(root.querySelector('[data-wonder-spectacle-mode="codex-ambient"]')).toBeTruthy();
});

it('does not render replay for legendary pages or promise video playback', () => {
  const root = createWonderCodexPage(page({
    id: 'oracle-of-delphi',
    kind: 'legendary',
    title: 'Oracle of Delphi',
    stateLabel: 'Legendary wonder',
    actions: [],
  }), {
    mode: 'desktop',
    onAction: vi.fn(),
    onSelectRelated: vi.fn(),
  });

  expect(root.querySelector('[data-codex-replay-animation]')).toBeNull();
  expect(root.textContent).not.toContain('Play video');
});

it('keeps reduced-motion Codex spectacle static', () => {
  const root = createWonderCodexPage(page(), {
    mode: 'desktop',
    reducedMotion: true,
    onAction: vi.fn(),
    onSelectRelated: vi.fn(),
  });

  expect(root.querySelector('[data-wonder-spectacle-mode="codex-static"]')).toBeTruthy();
  root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]')?.click();
  expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeNull();
});

it('restarts visual replay cleanly when clicked twice', () => {
  const root = createWonderCodexPage(page(), {
    mode: 'desktop',
    onAction: vi.fn(),
    onSelectRelated: vi.fn(),
  });

  const replay = root.querySelector<HTMLButtonElement>('[data-codex-replay-animation]')!;

  replay.click();
  vi.advanceTimersByTime(1800);
  replay.click();
  vi.advanceTimersByTime(2000);
  expect(root.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();

  vi.advanceTimersByTime(1800);
  expect(root.querySelector('[data-wonder-spectacle-mode="codex-ambient"]')).toBeTruthy();
});
```

Add to `tests/ui/wonder-atlas-panel.test.ts`:

```ts
it('does not expose natural spectacle replay for undiscovered wonders', () => {
  const panel = createWonderAtlasPanel(document.body, makeState(), {
    onViewOnMap: () => {},
    onClose: () => {},
  });

  expect(panel.querySelector('[data-codex-entry-id="great_volcano"]')).toBeNull();
  expect(panel.querySelector('[data-codex-replay-animation]')).toBeNull();
  expect(panel.textContent).not.toContain('Replay animation');
  expect(panel.textContent).not.toContain('volcanic-breath');
});
```

- [ ] **Step 2: Run failing Codex tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts tests/ui/wonder-atlas-panel.test.ts
```

Expected: fail because replay and spectacle vignette are not wired.

- [ ] **Step 3: Wire natural Codex pages to spectacle vignette**

Modify `src/ui/wonder-codex-page.ts` imports:

```ts
import { getWonderSpectacleRenderMode } from '@/systems/wonder-spectacle/presentation';
import type { WonderSpectacleRenderMode } from '@/systems/wonder-spectacle/types';
import { createWonderSpectacleVignette } from '@/ui/wonder-spectacle-vignette';
```

Add helper inside `createWonderCodexPage` before `hero` is appended:

```ts
  let codexSpectacleMode: Extract<WonderSpectacleRenderMode, 'codex-ambient' | 'codex-static' | 'reveal-amplified' | 'reveal-static'> =
    page.kind === 'natural'
      ? getWonderSpectacleRenderMode({
        surface: 'codex',
        wonderId: page.id,
        discovered: true,
        reducedMotion: options.reducedMotion ?? false,
      }) as Extract<WonderSpectacleRenderMode, 'codex-ambient' | 'codex-static'>
      : 'codex-static';
  let vignetteHost: HTMLElement | null = null;

  function renderSpectacleVignette(): HTMLElement {
    if (page.kind !== 'natural') {
      return createWonderVignette({
        kind: page.kind,
        wonderId: page.id,
        visibility: 'masked',
        name: page.title,
        visual: page.visual,
        canViewOnMap: false,
        maskedLabel: page.stateLabel,
        stateLabel: page.stateLabel,
      } as Parameters<typeof createWonderVignette>[0], { reducedMotion: options.reducedMotion });
    }
    return createWonderSpectacleVignette({
      wonderId: page.id,
      name: page.title,
      mode: codexSpectacleMode,
      reducedMotion: options.reducedMotion ?? false,
    });
  }
```

Replace the current `hero.appendChild(createWonderVignette(...))` block with:

```ts
  vignetteHost = document.createElement('div');
  vignetteHost.dataset.codexSpectacleHost = 'true';
  vignetteHost.appendChild(renderSpectacleVignette());
  hero.appendChild(vignetteHost);
```

After `hero.appendChild(copy);`, add replay control only for natural pages:

```ts
  if (page.kind === 'natural') {
    const replay = createGameButton('Replay animation', 'ghost');
    replay.dataset.codexReplayAnimation = 'true';
    replay.setAttribute('aria-label', `Replay ${page.title} animation`);
    let replayTimer: number | null = null;
    replay.addEventListener('click', () => {
      if ((options.reducedMotion ?? false) || !vignetteHost) return;
      if (replayTimer !== null) {
        window.clearTimeout(replayTimer);
      }
      codexSpectacleMode = 'reveal-amplified';
      vignetteHost.textContent = '';
      vignetteHost.appendChild(renderSpectacleVignette());
      replayTimer = window.setTimeout(() => {
        if (!vignetteHost) return;
        codexSpectacleMode = 'codex-ambient';
        vignetteHost.textContent = '';
        vignetteHost.appendChild(renderSpectacleVignette());
        replayTimer = null;
      }, 3600);
    });
    copy.appendChild(replay);
  }
```

Keep existing `onAction` untouched. Replay must not call it.

- [ ] **Step 4: Run Codex tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-codex-page.test.ts tests/ui/wonder-atlas-panel.test.ts tests/ui/wonder-spectacle-vignette.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/wonder-codex-page.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-atlas-panel.test.ts
git commit -m "feat(wonders): add codex spectacle replay"
```

### Task 6: Integrate Discovery Reveal Spectacle

**Files:**

- Modify: `src/ui/wonder-discovery-ceremony.ts`
- Modify: `tests/ui/wonder-discovery-ceremony.test.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Natural wonder reveal opens | None | Amplified spectacle is shown for motion-enabled users |
| Natural wonder reveal opens with reduced motion | None | Static spectacle/hero is shown |
| Reveal actions are visible | Click `Continue` | Resolves once with `continue` |
| Reveal actions are visible | Click `Open Atlas` | Resolves once with `open-atlas` |

- [ ] **Step 1: Write failing reveal spectacle tests**

Modify `tests/ui/wonder-discovery-ceremony.test.ts`:

```ts
it('renders amplified spectacle from the natural wonder recipe', () => {
  createWonderDiscoveryCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: false });

  expect(document.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();
  expect(document.querySelector('[data-wonder-spectacle-variant="amplified"]')).toBeTruthy();
});

it('uses static spectacle for reduced-motion reveal', () => {
  createWonderDiscoveryCeremony(document.body, item(), { onResolve: () => {} }, { reducedMotion: true });

  expect(document.querySelector('[data-wonder-spectacle-mode="reveal-static"]')).toBeTruthy();
  expect(document.querySelector('[data-vignette-motion="static"]')).toBeTruthy();
});
```

Update the existing first test assertion from:

```ts
expect(document.querySelector('[data-vignette-motion="ambient"]')).toBeTruthy();
```

to:

```ts
expect(document.querySelector('[data-wonder-spectacle-mode="reveal-amplified"]')).toBeTruthy();
```

- [ ] **Step 2: Run failing reveal tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-discovery-ceremony.test.ts
```

Expected: fail because discovery reveal still uses `createWonderVisualVignette`.

- [ ] **Step 3: Wire discovery reveal to spectacle adapter**

Modify `src/ui/wonder-discovery-ceremony.ts` imports:

```ts
import { getWonderSpectacleRenderMode } from '@/systems/wonder-spectacle/presentation';
import { createWonderSpectacleVignette } from '@/ui/wonder-spectacle-vignette';
```

Remove `createWonderVisualVignette` import.

Replace vignette creation:

```ts
  const spectacleMode = getWonderSpectacleRenderMode({
    surface: 'reveal',
    wonderId: item.wonderId,
    discovered: true,
    reducedMotion,
  });
  const vignette = createWonderSpectacleVignette({
    wonderId: item.wonderId,
    name: item.name,
    mode: spectacleMode === 'reveal-amplified' ? 'reveal-amplified' : 'reveal-static',
    reducedMotion,
  });
```

Keep existing sizing:

```ts
  vignette.style.width = '148px';
  vignette.style.height = '148px';
  vignette.style.flexBasis = '148px';
```

- [ ] **Step 4: Run reveal and Codex UI tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-discovery-ceremony.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-spectacle-vignette.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/wonder-discovery-ceremony.ts tests/ui/wonder-discovery-ceremony.test.ts
git commit -m "feat(wonders): amplify discovery reveal spectacle"
```

### Task 7: Final Convention Tests, Rule Checks, And Review

**Files:**

- Modify: `tests/systems/wonder-spectacle/recipes.test.ts`
- No production changes expected unless tests reveal a real gap.

- [ ] **Step 1: Add support-table validation test**

Extend `tests/systems/wonder-spectacle/recipes.test.ts`:

```ts
import { CANVAS_WONDER_SPECTACLE_PRIMITIVES } from '@/renderer/wonders/natural-wonder-effects-renderer';
import { SVG_WONDER_SPECTACLE_PRIMITIVES } from '@/ui/wonder-spectacle-vignette';

it('keeps every recipe primitive supported by every Stage 2E adapter', () => {
  for (const recipe of getNaturalWonderSpectacleRecipes()) {
    for (const primitive of [...recipe.mapPrimitives, ...recipe.codexPrimitives, ...recipe.revealPrimitives]) {
      expect(CANVAS_WONDER_SPECTACLE_PRIMITIVES).toContain(primitive);
      expect(SVG_WONDER_SPECTACLE_PRIMITIVES).toContain(primitive);
    }
  }
});
```

- [ ] **Step 2: Run focused wonder spectacle suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/wonder-spectacle/recipes.test.ts tests/systems/wonder-spectacle/presentation.test.ts tests/renderer/natural-wonder-effects-renderer.test.ts tests/renderer/natural-wonder-renderer.test.ts tests/renderer/hex-renderer-wonder-spectacle.test.ts tests/renderer/hex-renderer.test.ts tests/ui/wonder-spectacle-vignette.test.ts tests/ui/wonder-codex-page.test.ts tests/ui/wonder-atlas-panel.test.ts tests/ui/wonder-discovery-ceremony.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit final test/support changes**

Commit the support-table validation delta:

```bash
git add tests/systems/wonder-spectacle/recipes.test.ts
git commit -m "test(wonders): enforce spectacle adapter contracts"
```

- [ ] **Step 4: Run source rule checker**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/wonder-spectacle/types.ts src/systems/wonder-spectacle/recipes.ts src/systems/wonder-spectacle/presentation.ts src/systems/wonder-spectacle/validation.ts src/renderer/wonders/natural-wonder-effects-renderer.ts src/renderer/wonders/natural-wonder-renderer.ts src/renderer/hex-renderer.ts src/ui/wonder-spectacle-vignette.ts src/ui/wonder-codex-page.ts src/ui/wonder-discovery-ceremony.ts
```

Expected: no output and exit 0.

- [ ] **Step 5: Run wonder regressions**

Run:

```bash
./scripts/run-wonder-regressions.sh
```

Expected: all listed wonder regression tests pass.

- [ ] **Step 6: Run dual builds**

Run:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn build:tauri
```

Expected: both commands exit 0. Existing large chunk warnings are acceptable if no errors appear.

- [ ] **Step 7: Run full test suite**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: full Vitest and hook smoke suite passes.

- [ ] **Step 8: Inspect diffs for regressions**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check
```

Expected:

- branch diff includes only Stage 2E spectacle implementation, tests, and existing design docs
- working tree diff is empty after commits
- `git diff --check` exits 0

## Plan Self-Review Checklist

Spec coverage:

- Natural wonder spectacle recipes: Task 1.
- Shared render-mode policy: Task 2.
- Live-visible map spectacle only: Tasks 2 and 3.
- Low zoom, last-seen, reduced motion static paths: Tasks 2 and 3.
- Codex animated accent and replay: Tasks 4 and 5.
- Replay is visual-only local state: Task 5.
- Discovery reveal amplified variant: Task 6.
- Mandatory sound metadata without playback: Task 1.
- Future-extension contract tests: Tasks 1 and 7.
- No legendary city landmark spectacle: Task 1 recipes only cover `WONDER_DEFINITIONS`; Task 2 hides non-recipe IDs.
- Browser/PWA and Tauri shared path: Tasks 3-6 modify shared Canvas/DOM code only; Task 7 runs both builds.

Placeholder scan:

- The plan must not contain placeholder markers or vague test instructions.
- Every test step includes concrete test code or exact assertions.
- Every implementation step names exact files and exported functions.

Type consistency:

- Recipe fields are defined in Task 1 and reused unchanged in later tasks.
- Render modes are defined in Task 1 and returned by Task 2.
- Canvas and SVG support table names match Task 7 imports.
- Replay control uses `data-codex-replay-animation` consistently.

Quality bar for Sonnet 4.5 medium effort:

- Keep implementations minimal and deterministic.
- Prefer simple Canvas/SVG primitives over clever animation abstractions.
- Do not introduce asset loading, audio playback, videos, save data, or platform branches.
- Commit after each task so review can isolate regressions.
