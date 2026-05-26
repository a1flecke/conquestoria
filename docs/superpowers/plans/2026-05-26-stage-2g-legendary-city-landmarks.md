# Stage 2G Legendary City Landmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Execute inline unless the user explicitly authorizes subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authored, convention-tested legendary city landmark system with richer owned completed landmarks, late-construction ghosts, overflow rotation, and compact city/Codex previews.

**Architecture:** Replace hash-based legendary visual assignment with explicit landmark metadata and validation helpers. Keep gameplay state unchanged; derive viewer-safe map/panel/Codex presentation models from existing completed wonders and owned projects. Render through token adapters now, with optional future `assetKey`/bespoke renderer hooks for Stage 2I.

**Tech Stack:** TypeScript, Canvas 2D renderer, DOM UI panels, Vite, Vitest, jsdom UI tests, existing `./scripts/run-with-mise.sh yarn ...` wrapper.

---

## Source Spec

Implement exactly from:

- `docs/superpowers/specs/2026-05-26-stage-2g-legendary-city-landmarks-design.md`
- Roadmap context: `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`

Rules to read before editing:

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/strategy-game-mechanics.md`
- `.claude/rules/end-to-end-wiring.md`
- `.claude/rules/spec-fidelity.md`
- `.claude/rules/incremental-mr-completion.md`
- `docs/superpowers/plans/README.md`

## File Structure

- Create `src/systems/legendary-wonder-landmark-types.ts`
  - Shared metadata, token, render-entry, and preview view-model types.
- Create `src/systems/legendary-wonder-landmark-catalog.ts`
  - Explicit metadata for every current legendary wonder.
  - Catalog-adjacent authoring guide comment.
- Create `src/systems/legendary-wonder-landmark-validation.ts`
  - Coverage, duplicate, unknown-token, and renderer-support helpers for tests.
- Modify `src/systems/wonder-visual-catalog.ts`
  - Remove hash-based legendary landmark assignment for known legendary wonders.
  - Pull explicit family fallback from landmark metadata only.
- Modify `src/systems/legendary-wonder-map-presentation.ts`
  - Return owned completed entries and owned late-construction ghost entries.
  - Keep relationship-aware shape but produce only `relationship: 'owned'` in 2G.
- Create `src/systems/legendary-wonder-landmark-presentation.ts`
  - City/Codex/inspection preview helpers, completion grouping, overflow windowing, and active ghost eligibility.
- Modify `src/renderer/wonders/legendary-wonder-slots.ts`
  - Add 5-turn overflow windowing and stable `+N`.
- Modify `src/renderer/wonders/legendary-wonder-renderer.ts`
  - Render token-driven completed landmarks and ghost scaffolds.
  - Export renderer support tables for tests.
- Modify `src/renderer/city-renderer.ts`
  - Targeted landmark layer extraction and explicit draw ordering.
- Modify `src/renderer/render-loop.ts`
  - Pass `performance.now()` into city rendering for runtime animation while renderer tests can inject deterministic `nowMs`.
- Modify `src/ui/territory-inspection-panel.ts`
  - Use helper so inspection lists all owned completed city landmarks.
- Modify `src/ui/city-panel.ts`
  - Add compact city landmark preview.
- Modify `src/systems/wonder-codex/presentation.ts`
  - Add owned landmark preview to page view model.
- Modify `src/ui/wonder-codex-page.ts`
  - Render compact owned landmark preview.
- Add/modify tests:
  - `tests/systems/legendary-wonder-landmark-catalog.test.ts`
  - `tests/systems/legendary-wonder-map-presentation.test.ts`
  - `tests/renderer/legendary-wonder-slots.test.ts`
  - `tests/systems/wonder-codex/presentation.test.ts`
  - `tests/renderer/legendary-wonder-renderer.test.ts`
  - `tests/renderer/city-renderer.test.ts`
  - `tests/ui/territory-inspection-panel.test.ts`
  - `tests/ui/city-panel.test.ts`
  - `tests/ui/wonder-codex-page.test.ts`

## Player Truth Table

| Before | Player action | Immediate visible result | Must remain reachable |
|---|---|---|---|
| Owned visible city has one completed legendary wonder | View map | Solid landmark medallion appears around city | City selection, unit selection, labels, production badge |
| Owned visible city has active legendary at 59% | View map | No map ghost | City panel still shows active construction preview |
| Owned visible city has active legendary at 60%+ | View map | Faint `Under construction` ghost/scaffold appears | It is not counted as completed |
| Owned city has 8 completed legendary wonders | View map on turn 9 | Five landmarks plus `+3`; visible five chosen by 5-turn window | Inspection/city/Codex list all 8 |
| Same city, turn advances to 10 | View map | Visible five rotate deterministically | `+3` remains stable |
| Rival completed wonder known only through 2F completed intel | Open map/Codex | No map landmark, no host city preview | Rival journal remains safe text only |
| Reduced motion enabled | View map/Codex/city preview | Static landmark/ghost, no pulse/glint | All names and actions remain readable |

## Misleading UI Risks

- `Completed landmark` means an owned completed legendary wonder exists in `completedLegendaryWonders` for the viewer and the host city is safely visible/owned for the surface.
- `Under construction` ghost means an owned building-phase project exists in that host city. On the map it additionally requires `progressRatio >= 0.6`.
- `+N` means additional completed owned landmarks in the same city, not active ghosts and not rival intel.
- `Known rival completed` from Stage 2F must not imply map location, host city, or landmark visibility.
- The city/Codex preview must not read rival city/project objects to enrich rival pages.
- The renderer may have a defensive unknown-ID fallback, but tests must fail for missing metadata on real legendary definitions.

## Interaction Replay Checklist

- Open map with one completed owned wonder.
- Open map with active project below 60%, then at 60%+.
- Render a city with 7+ completed wonders at turns 0, 4, 5, 9, and 10.
- Open territory inspection for an overflow city and confirm every completed wonder name is listed.
- Open city panel and confirm completed plus active ghost previews render without hiding existing production controls.
- Open owned completed Codex page and confirm compact preview renders; open rival intel Codex page and confirm no landmark preview.
- Reopen/render for another hot-seat viewer and confirm prior viewer landmarks disappear.

---

## Task 1: Add Explicit Landmark Metadata And Validation

**Files:**
- Create: `src/systems/legendary-wonder-landmark-types.ts`
- Create: `src/systems/legendary-wonder-landmark-catalog.ts`
- Create: `src/systems/legendary-wonder-landmark-validation.ts`
- Modify: `src/systems/wonder-visual-catalog.ts`
- Test: `tests/systems/legendary-wonder-landmark-catalog.test.ts`

- [ ] **Step 1: Write failing catalog contract tests**

Create `tests/systems/legendary-wonder-landmark-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import {
  getLegendaryWonderLandmarkMetadata,
  getLegendaryWonderLandmarkMetadataCatalog,
} from '@/systems/legendary-wonder-landmark-catalog';
import {
  validateLegendaryWonderLandmarkCatalog,
  validateLegendaryWonderLandmarkRendererSupport,
} from '@/systems/legendary-wonder-landmark-validation';
import {
  CANVAS_LEGENDARY_LANDMARK_AURAS,
  CANVAS_LEGENDARY_LANDMARK_FAMILIES,
  CANVAS_LEGENDARY_LANDMARK_GHOSTS,
  CANVAS_LEGENDARY_LANDMARK_MOTIFS,
  CANVAS_LEGENDARY_LANDMARK_MOTIONS,
  CANVAS_LEGENDARY_LANDMARK_VARIANTS,
} from '@/renderer/wonders/legendary-wonder-renderer';

describe('legendary wonder landmark catalog', () => {
  it('has explicit metadata for every current legendary wonder and no extras', () => {
    const definitionIds = getLegendaryWonderDefinitions().map(definition => definition.id).sort();
    const metadataIds = getLegendaryWonderLandmarkMetadataCatalog().map(entry => entry.wonderId).sort();

    expect(metadataIds).toEqual(definitionIds);
    expect(validateLegendaryWonderLandmarkCatalog()).toEqual([]);
  });

  it('does not use hash-based landmark identity for known legendary wonders', () => {
    const oracle = getLegendaryWonderLandmarkMetadata('oracle-of-delphi');
    const canal = getLegendaryWonderLandmarkMetadata('grand-canal');

    expect(oracle.family).toBe('oracle');
    expect(canal.family).toBe('waterworks');
    expect(getWonderVisualDefinition('oracle-of-delphi').legendaryLandmark).toBe(oracle.family);
    expect(getWonderVisualDefinition('grand-canal').legendaryLandmark).toBe(canal.family);
  });

  it('declares only renderer-supported family, variant, motif, aura, motion, and ghost tokens', () => {
    expect(validateLegendaryWonderLandmarkRendererSupport({
      families: CANVAS_LEGENDARY_LANDMARK_FAMILIES,
      variants: CANVAS_LEGENDARY_LANDMARK_VARIANTS,
      motifs: CANVAS_LEGENDARY_LANDMARK_MOTIFS,
      auras: CANVAS_LEGENDARY_LANDMARK_AURAS,
      motions: CANVAS_LEGENDARY_LANDMARK_MOTIONS,
      ghosts: CANVAS_LEGENDARY_LANDMARK_GHOSTS,
    })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: FAIL because `legendary-wonder-landmark-catalog` and validation modules do not exist.

- [ ] **Step 3: Add shared landmark types**

Create `src/systems/legendary-wonder-landmark-types.ts`:

```ts
export const LEGENDARY_LANDMARK_FAMILIES = [
  'oracle',
  'waterworks',
  'spire',
  'archive',
  'garden',
  'foundry',
  'bastion',
  'observatory',
  'exchange',
  'hall',
  'gateway',
  'drydock',
  'signal',
  'laboratory',
  'network',
] as const;

export type LegendaryLandmarkFamily = typeof LEGENDARY_LANDMARK_FAMILIES[number];

export const LEGENDARY_LANDMARK_VARIANTS = ['standard', 'wide', 'tall', 'compact'] as const;
export type LegendaryLandmarkVariant = typeof LEGENDARY_LANDMARK_VARIANTS[number];

export const LEGENDARY_LANDMARK_MOTIFS = [
  'prophecy',
  'canal',
  'sun',
  'knowledge',
  'moon',
  'forge',
  'tide',
  'stars',
  'trade',
  'victory',
  'horizon',
  'shipwright',
  'signal',
  'atom',
  'network',
] as const;
export type LegendaryLandmarkMotif = typeof LEGENDARY_LANDMARK_MOTIFS[number];

export const LEGENDARY_LANDMARK_AURAS = ['none', 'dedicationGlow', 'civicAura', 'foundationPulse'] as const;
export type LegendaryLandmarkAura = typeof LEGENDARY_LANDMARK_AURAS[number];

export const LEGENDARY_LANDMARK_MOTIONS = ['none', 'pulse', 'glint', 'spark'] as const;
export type LegendaryLandmarkMotion = typeof LEGENDARY_LANDMARK_MOTIONS[number];

export const LEGENDARY_LANDMARK_GHOSTS = ['scaffold', 'foundation', 'outline'] as const;
export type LegendaryLandmarkGhost = typeof LEGENDARY_LANDMARK_GHOSTS[number];

export interface LegendaryWonderLandmarkMetadata {
  wonderId: string;
  family: LegendaryLandmarkFamily;
  variant: LegendaryLandmarkVariant;
  motif: LegendaryLandmarkMotif;
  palette: {
    base: string;
    accent: string;
    glow: string;
  };
  scale: number;
  aura: LegendaryLandmarkAura;
  motion: LegendaryLandmarkMotion;
  constructionGhost: LegendaryLandmarkGhost;
  assetKey?: string;
}

export type LegendaryWonderLandmarkRelationship = 'owned' | 'known-rival';
export type LegendaryWonderLandmarkState = 'completed' | 'under-construction';

export interface LegendaryWonderLandmarkView {
  wonderId: string;
  label: string;
  cityId: string;
  turnCompleted?: number;
  relationship: LegendaryWonderLandmarkRelationship;
  state: LegendaryWonderLandmarkState;
  metadata: LegendaryWonderLandmarkMetadata;
  progressRatio?: number;
}
```

- [ ] **Step 4: Add explicit catalog and authoring guide**

Create `src/systems/legendary-wonder-landmark-catalog.ts`:

```ts
import type { LegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-types';

/*
 * Legendary landmark authoring guide:
 * - Add exactly one metadata entry for each legendary wonder definition.
 * - Do not use hash/random assignment for known wonders.
 * - Pick domain tokens from legendary-wonder-landmark-types.ts only.
 * - Keep this catalog presentation-only: no rewards, costs, requirements, quests, or AI values.
 * - For future bespoke art, add assetKey only after a renderer/asset registry supports it.
 * - Run tests/systems/legendary-wonder-landmark-catalog.test.ts before merge.
 */
const LEGENDARY_WONDER_LANDMARK_METADATA: Record<string, LegendaryWonderLandmarkMetadata> = {
  'oracle-of-delphi': landmark('oracle-of-delphi', 'oracle', 'tall', 'prophecy', '#2f2943', '#d8c47a', '#fff0b8', 1.02, 'dedicationGlow', 'glint', 'outline'),
  'grand-canal': landmark('grand-canal', 'waterworks', 'wide', 'canal', '#173c52', '#74d0ff', '#c8f3ff', 1.05, 'civicAura', 'pulse', 'foundation'),
  'sun-spire': landmark('sun-spire', 'spire', 'tall', 'sun', '#46311f', '#f2c45d', '#fff1a6', 1.08, 'dedicationGlow', 'glint', 'scaffold'),
  'world-archive': landmark('world-archive', 'archive', 'wide', 'knowledge', '#263044', '#b9c7ff', '#edf0ff', 1.0, 'civicAura', 'pulse', 'outline'),
  'moonwell-gardens': landmark('moonwell-gardens', 'garden', 'wide', 'moon', '#203b34', '#9fd7a0', '#def7bf', 1.0, 'civicAura', 'spark', 'foundation'),
  'ironroot-foundry': landmark('ironroot-foundry', 'foundry', 'compact', 'forge', '#3a2b26', '#e08b52', '#ffd2a0', 1.04, 'foundationPulse', 'pulse', 'scaffold'),
  'tidecaller-bastion': landmark('tidecaller-bastion', 'bastion', 'wide', 'tide', '#18364b', '#7ec7e8', '#cff5ff', 1.03, 'civicAura', 'glint', 'outline'),
  'starvault-observatory': landmark('starvault-observatory', 'observatory', 'tall', 'stars', '#252d4d', '#a8b9ff', '#f1f4ff', 1.06, 'dedicationGlow', 'spark', 'scaffold'),
  'whispering-exchange': landmark('whispering-exchange', 'exchange', 'wide', 'trade', '#342c3f', '#e0bc72', '#fff0c4', 0.98, 'civicAura', 'glint', 'foundation'),
  'hall-of-champions': landmark('hall-of-champions', 'hall', 'wide', 'victory', '#3a2931', '#e4aa62', '#ffe0a8', 1.03, 'dedicationGlow', 'pulse', 'outline'),
  'gate-of-the-world': landmark('gate-of-the-world', 'gateway', 'wide', 'horizon', '#24364a', '#9fd3e8', '#e0f8ff', 1.06, 'civicAura', 'glint', 'scaffold'),
  'leviathan-drydock': landmark('leviathan-drydock', 'drydock', 'wide', 'shipwright', '#23384d', '#80bfe2', '#c8eeff', 1.06, 'foundationPulse', 'pulse', 'foundation'),
  'storm-signal-spire': landmark('storm-signal-spire', 'signal', 'tall', 'signal', '#202943', '#b7c7ff', '#f1f5ff', 1.08, 'dedicationGlow', 'spark', 'scaffold'),
  'manhattan-project': landmark('manhattan-project', 'laboratory', 'compact', 'atom', '#31313c', '#d2d8e8', '#ffffff', 1.0, 'foundationPulse', 'pulse', 'outline'),
  internet: landmark('internet', 'network', 'wide', 'network', '#202c3d', '#80d8ff', '#d9f8ff', 0.98, 'civicAura', 'spark', 'foundation'),
};

function landmark(
  wonderId: string,
  family: LegendaryWonderLandmarkMetadata['family'],
  variant: LegendaryWonderLandmarkMetadata['variant'],
  motif: LegendaryWonderLandmarkMetadata['motif'],
  base: string,
  accent: string,
  glow: string,
  scale: number,
  aura: LegendaryWonderLandmarkMetadata['aura'],
  motion: LegendaryWonderLandmarkMetadata['motion'],
  constructionGhost: LegendaryWonderLandmarkMetadata['constructionGhost'],
): LegendaryWonderLandmarkMetadata {
  return {
    wonderId,
    family,
    variant,
    motif,
    palette: { base, accent, glow },
    scale,
    aura,
    motion,
    constructionGhost,
  };
}

export function getLegendaryWonderLandmarkMetadata(wonderId: string): LegendaryWonderLandmarkMetadata {
  const metadata = LEGENDARY_WONDER_LANDMARK_METADATA[wonderId];
  if (metadata) return { ...metadata, palette: { ...metadata.palette } };
  return landmark(wonderId, 'spire', 'standard', 'knowledge', '#2b2633', '#e8c170', '#fff0b8', 1, 'none', 'none', 'outline');
}

export function getLegendaryWonderLandmarkMetadataCatalog(): LegendaryWonderLandmarkMetadata[] {
  return Object.values(LEGENDARY_WONDER_LANDMARK_METADATA).map(metadata => ({
    ...metadata,
    palette: { ...metadata.palette },
  }));
}
```

- [ ] **Step 5: Add validation helpers**

Create `src/systems/legendary-wonder-landmark-validation.ts`:

```ts
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderLandmarkMetadataCatalog } from '@/systems/legendary-wonder-landmark-catalog';
import {
  LEGENDARY_LANDMARK_AURAS,
  LEGENDARY_LANDMARK_FAMILIES,
  LEGENDARY_LANDMARK_GHOSTS,
  LEGENDARY_LANDMARK_MOTIFS,
  LEGENDARY_LANDMARK_MOTIONS,
  LEGENDARY_LANDMARK_VARIANTS,
} from '@/systems/legendary-wonder-landmark-types';

function missing(expected: string[], actual: string[], label: string): string[] {
  return expected.filter(value => !actual.includes(value)).map(value => `Missing ${label}: ${value}`);
}

function unknown(actual: string[], expected: string[], label: string): string[] {
  return actual.filter(value => !expected.includes(value)).map(value => `Unknown ${label}: ${value}`);
}

export function validateLegendaryWonderLandmarkCatalog(): string[] {
  const definitionIds = getLegendaryWonderDefinitions().map(definition => definition.id);
  const metadata = getLegendaryWonderLandmarkMetadataCatalog();
  const metadataIds = metadata.map(entry => entry.wonderId);
  const duplicateIds = metadataIds.filter((id, index) => metadataIds.indexOf(id) !== index);
  const issues = [
    ...missing(definitionIds, metadataIds, 'legendary landmark metadata'),
    ...unknown(metadataIds, definitionIds, 'legendary landmark metadata'),
    ...duplicateIds.map(id => `Duplicate legendary landmark metadata: ${id}`),
  ];

  for (const entry of metadata) {
    if (!LEGENDARY_LANDMARK_FAMILIES.includes(entry.family)) issues.push(`Unknown family: ${entry.family}`);
    if (!LEGENDARY_LANDMARK_VARIANTS.includes(entry.variant)) issues.push(`Unknown variant: ${entry.variant}`);
    if (!LEGENDARY_LANDMARK_MOTIFS.includes(entry.motif)) issues.push(`Unknown motif: ${entry.motif}`);
    if (!LEGENDARY_LANDMARK_AURAS.includes(entry.aura)) issues.push(`Unknown aura: ${entry.aura}`);
    if (!LEGENDARY_LANDMARK_MOTIONS.includes(entry.motion)) issues.push(`Unknown motion: ${entry.motion}`);
    if (!LEGENDARY_LANDMARK_GHOSTS.includes(entry.constructionGhost)) issues.push(`Unknown ghost: ${entry.constructionGhost}`);
    if (entry.scale <= 0) issues.push(`Invalid scale: ${entry.wonderId}`);
  }
  return issues;
}

export function validateLegendaryWonderLandmarkRendererSupport(support: {
  families: readonly string[];
  variants: readonly string[];
  motifs: readonly string[];
  auras: readonly string[];
  motions: readonly string[];
  ghosts: readonly string[];
}): string[] {
  return [
    ...missing([...LEGENDARY_LANDMARK_FAMILIES], [...support.families], 'canvas family support'),
    ...missing([...LEGENDARY_LANDMARK_VARIANTS], [...support.variants], 'canvas variant support'),
    ...missing([...LEGENDARY_LANDMARK_MOTIFS], [...support.motifs], 'canvas motif support'),
    ...missing([...LEGENDARY_LANDMARK_AURAS], [...support.auras], 'canvas aura support'),
    ...missing([...LEGENDARY_LANDMARK_MOTIONS], [...support.motions], 'canvas motion support'),
    ...missing([...LEGENDARY_LANDMARK_GHOSTS], [...support.ghosts], 'canvas ghost support'),
  ];
}
```

- [ ] **Step 6: Temporarily export renderer support arrays**

Modify `src/renderer/wonders/legendary-wonder-renderer.ts` near the imports:

```ts
import {
  LEGENDARY_LANDMARK_AURAS,
  LEGENDARY_LANDMARK_FAMILIES,
  LEGENDARY_LANDMARK_GHOSTS,
  LEGENDARY_LANDMARK_MOTIFS,
  LEGENDARY_LANDMARK_MOTIONS,
  LEGENDARY_LANDMARK_VARIANTS,
} from '@/systems/legendary-wonder-landmark-types';

export const CANVAS_LEGENDARY_LANDMARK_FAMILIES = LEGENDARY_LANDMARK_FAMILIES;
export const CANVAS_LEGENDARY_LANDMARK_VARIANTS = LEGENDARY_LANDMARK_VARIANTS;
export const CANVAS_LEGENDARY_LANDMARK_MOTIFS = LEGENDARY_LANDMARK_MOTIFS;
export const CANVAS_LEGENDARY_LANDMARK_AURAS = LEGENDARY_LANDMARK_AURAS;
export const CANVAS_LEGENDARY_LANDMARK_MOTIONS = LEGENDARY_LANDMARK_MOTIONS;
export const CANVAS_LEGENDARY_LANDMARK_GHOSTS = LEGENDARY_LANDMARK_GHOSTS;
```

The actual drawing support is expanded in Task 3. This step makes catalog tests compile while still forcing metadata coverage.

- [ ] **Step 7: Replace hash assignment in visual catalog**

Modify `src/systems/wonder-visual-catalog.ts`:

```ts
import { getLegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-catalog';
import type { LegendaryLandmarkFamily } from '@/systems/legendary-wonder-landmark-types';
```

Change `LegendaryWonderLandmark`:

```ts
export type LegendaryWonderLandmark = LegendaryLandmarkFamily | 'masked';
```

Remove `LEGENDARY_LANDMARK_TYPES` and `landmarkTypeForLegendaryWonder`.

Replace the `LEGENDARY_WONDER_VISUALS` construction with this block so metadata is computed inside the map callback and no hash fallback remains for known legendary wonders:

```ts
const LEGENDARY_WONDER_VISUALS: Record<string, WonderVisualDefinition> = Object.fromEntries(
  getLegendaryWonderDefinitions().map(definition => {
    const metadata = getLegendaryWonderLandmarkMetadata(definition.id);
    return [
      definition.id,
      {
        id: definition.id,
        kind: 'legendary',
        medallionGlyph: '✦',
        palette: metadata.palette,
        mapLandmark: 'masked',
        vignette: 'masked',
        supportsAmbientAnimation: false,
        reducedMotionFallback: 'static-medallion',
        maskedLabel: 'Legendary wonder',
        legendaryLandmark: metadata.family,
      } satisfies WonderVisualDefinition,
    ];
  }),
);
```

- [ ] **Step 8: Run catalog tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/systems/legendary-wonder-landmark-types.ts src/systems/legendary-wonder-landmark-catalog.ts src/systems/legendary-wonder-landmark-validation.ts src/systems/wonder-visual-catalog.ts src/renderer/wonders/legendary-wonder-renderer.ts tests/systems/legendary-wonder-landmark-catalog.test.ts
git commit -m "feat(wonders): add authored legendary landmark metadata"
```

## Task 2: Add Viewer-Safe Landmark Presentation And Overflow Rotation

**Files:**
- Create: `src/systems/legendary-wonder-landmark-presentation.ts`
- Modify: `src/systems/legendary-wonder-map-presentation.ts`
- Modify: `src/renderer/wonders/legendary-wonder-slots.ts`
- Test: `tests/systems/legendary-wonder-map-presentation.test.ts`
- Test: `tests/renderer/legendary-wonder-slots.test.ts`

- [ ] **Step 1: Write failing presentation and privacy tests**

Append to `tests/systems/legendary-wonder-map-presentation.test.ts`:

```ts
it('adds owned active construction ghosts only at final-works progress on visible owned cities', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
  state.currentPlayer = 'player';
  state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
  state.cities['city-river'].productionProgress = 72;
  state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';
  state.legendaryWonderProjects = {
    'oracle-of-delphi:player:city-river': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'city-river',
      phase: 'building',
      investedProduction: 72,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const entries = getLegendaryWonderMapEntries(state, 'player');

  expect(entries).toContainEqual(expect.objectContaining({
    wonderId: 'oracle-of-delphi',
    relationship: 'owned',
    state: 'under-construction',
    progressRatio: 0.6,
  }));
});

it('does not add map ghosts below final-works progress', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
  state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
  state.cities['city-river'].productionProgress = 71;
  state.civilizations.player.visibility.tiles[hexKey(state.cities['city-river'].position)] = 'visible';
  state.legendaryWonderProjects = {
    'oracle-of-delphi:player:city-river': {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'city-river',
      phase: 'building',
      investedProduction: 71,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  expect(getLegendaryWonderMapEntries(state, 'player')
    .some(entry => entry.state === 'under-construction')).toBe(false);
});

it('does not render rival landmarks from completed rival intel alone', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'rival', cityId: 'city-rival', turnCompleted: 20 },
  };
  state.legendaryWonderIntel = {
    player: [{
      kind: 'completed',
      eventId: 'completed:oracle-of-delphi:rival:20',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      completionTurn: 20,
      learnedTurn: 20,
    }],
  };
  state.civilizations.player.visibility.tiles[hexKey(state.cities['city-rival'].position)] = 'visible';

  expect(getLegendaryWonderMapEntries(state, 'player')).toEqual([]);
});
```

Add slot tests in the same file or in a new `tests/renderer/legendary-wonder-slots.test.ts`:

```ts
import { assignLegendaryWonderSlots } from '@/renderer/wonders/legendary-wonder-slots';

it('rotates overflow windows every five turns while keeping a stable overflow count', () => {
  const entries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((wonderId, index) => ({
    wonderId,
    turnCompleted: index + 1,
  }));

  expect(assignLegendaryWonderSlots(entries, 4).filter(slot => slot.kind === 'landmark').map(slot => slot.wonderId))
    .toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(assignLegendaryWonderSlots(entries, 5).filter(slot => slot.kind === 'landmark').map(slot => slot.wonderId))
    .toEqual(['b', 'c', 'd', 'e', 'f']);
  expect(assignLegendaryWonderSlots(entries, 10).filter(slot => slot.kind === 'landmark').map(slot => slot.wonderId))
    .toEqual(['c', 'd', 'e', 'f', 'g']);
  expect(assignLegendaryWonderSlots(entries, 10).find(slot => slot.kind === 'overflow')).toMatchObject({
    kind: 'overflow',
    overflowCount: 3,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/legendary-wonder-slots.test.ts
```

Expected: FAIL because map entries do not yet carry completed/under-construction state, ghost progress ratios, or 5-turn overflow rotation.

- [ ] **Step 3: Add presentation helper**

Create `src/systems/legendary-wonder-landmark-presentation.ts`:

```ts
import type { City, GameState } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-catalog';
import type { LegendaryWonderLandmarkView } from '@/systems/legendary-wonder-landmark-types';

export const LEGENDARY_CONSTRUCTION_GHOST_MAP_THRESHOLD = 0.6;

export function getCompletedLegendaryLandmarksForCity(
  state: GameState,
  viewerId: string,
  cityId: string,
): LegendaryWonderLandmarkView[] {
  const city = state.cities[cityId];
  if (!city || city.owner !== viewerId) return [];
  return Object.entries(state.completedLegendaryWonders ?? {})
    .filter(([, completion]) => completion.ownerId === viewerId && completion.cityId === cityId)
    .map(([wonderId, completion]) => ({
      wonderId,
      label: getLegendaryWonderDefinition(wonderId)?.name ?? 'Legendary wonder',
      cityId,
      turnCompleted: completion.turnCompleted,
      relationship: 'owned' as const,
      state: 'completed' as const,
      metadata: getLegendaryWonderLandmarkMetadata(wonderId),
    }))
    .sort((a, b) => (a.turnCompleted ?? 0) - (b.turnCompleted ?? 0) || a.wonderId.localeCompare(b.wonderId));
}

export function getActiveLegendaryConstructionGhostForCity(
  state: GameState,
  viewerId: string,
  city: City,
  options: { mapOnly: boolean },
): LegendaryWonderLandmarkView | null {
  if (city.owner !== viewerId) return null;
  const activeItem = city.productionQueue[0];
  if (!activeItem?.startsWith('legendary:')) return null;
  const wonderId = activeItem.replace(/^legendary:/, '');
  const project = Object.values(state.legendaryWonderProjects ?? {})
    .find(candidate => candidate.ownerId === viewerId && candidate.cityId === city.id && candidate.wonderId === wonderId && candidate.phase === 'building');
  const definition = getLegendaryWonderDefinition(wonderId);
  if (!project || !definition) return null;
  const progressRatio = Math.max(0, Math.min(1, project.investedProduction / definition.productionCost));
  if (options.mapOnly && progressRatio < LEGENDARY_CONSTRUCTION_GHOST_MAP_THRESHOLD) return null;
  return {
    wonderId,
    label: definition.name,
    cityId: city.id,
    relationship: 'owned',
    state: 'under-construction',
    metadata: getLegendaryWonderLandmarkMetadata(wonderId),
    progressRatio,
  };
}

export function getLegendaryLandmarkPreviewForCity(
  state: GameState,
  viewerId: string,
  cityId: string,
): LegendaryWonderLandmarkView[] {
  const city = state.cities[cityId];
  if (!city || city.owner !== viewerId) return [];
  const completed = getCompletedLegendaryLandmarksForCity(state, viewerId, cityId);
  const ghost = getActiveLegendaryConstructionGhostForCity(state, viewerId, city, { mapOnly: false });
  return ghost ? [...completed, ghost] : completed;
}
```

- [ ] **Step 4: Update map presentation**

Modify `src/systems/legendary-wonder-map-presentation.ts`:

```ts
import {
  getActiveLegendaryConstructionGhostForCity,
  getCompletedLegendaryLandmarksForCity,
} from '@/systems/legendary-wonder-landmark-presentation';
import { getVisibility } from '@/systems/fog-of-war';
import type { LegendaryWonderLandmarkState } from '@/systems/legendary-wonder-landmark-types';
```

Extend `LegendaryWonderMapEntry`:

```ts
  relationship: 'owned' | 'known-rival';
  state: LegendaryWonderLandmarkState;
  progressRatio?: number;
```

Replace the return body with:

```ts
  const entries: LegendaryWonderMapEntry[] = [];
  for (const city of Object.values(state.cities)) {
    if (city.owner !== viewerId) continue;
    if (getVisibility(visibility, city.position) !== 'visible') continue;
    for (const landmark of getCompletedLegendaryLandmarksForCity(state, viewerId, city.id)) {
      entries.push({
        wonderId: landmark.wonderId,
        cityId: city.id,
        coord: { ...city.position },
        ownerId: viewerId,
        relationship: 'owned',
        state: 'completed',
        turnCompleted: landmark.turnCompleted ?? 0,
        label: landmark.label,
        visual: getWonderVisualDefinition(landmark.wonderId),
      });
    }
    const ghost = getActiveLegendaryConstructionGhostForCity(state, viewerId, city, { mapOnly: true });
    if (ghost) {
      entries.push({
        wonderId: ghost.wonderId,
        cityId: city.id,
        coord: { ...city.position },
        ownerId: viewerId,
        relationship: 'owned',
        state: 'under-construction',
        turnCompleted: Number.MAX_SAFE_INTEGER,
        label: ghost.label,
        visual: getWonderVisualDefinition(ghost.wonderId),
        progressRatio: ghost.progressRatio,
      });
    }
  }
  return entries;
```

- [ ] **Step 5: Update slot rotation**

Modify `src/renderer/wonders/legendary-wonder-slots.ts`:

```ts
export function assignLegendaryWonderSlots(inputs: LegendaryWonderSlotInput[], turn = 0): LegendaryWonderSlot[] {
  const sorted = [...inputs].sort((a, b) => a.turnCompleted - b.turnCompleted || a.wonderId.localeCompare(b.wonderId));
  if (sorted.length <= 6) {
    return sorted.slice(0, 6).map((input, index) => ({
      kind: 'landmark',
      wonderId: input.wonderId,
      turnCompleted: input.turnCompleted,
      slotIndex: index,
      ...OFFSETS[index],
    }));
  }

  const windowStart = Math.floor(turn / 5) % sorted.length;
  const visible = Array.from({ length: 5 }, (_, offset) => sorted[(windowStart + offset) % sorted.length]);
  const slots: LegendaryWonderSlot[] = visible.map((input, index) => ({
    kind: 'landmark',
    wonderId: input.wonderId,
    turnCompleted: input.turnCompleted,
    slotIndex: index,
    ...OFFSETS[index],
  }));
  slots.push({ kind: 'overflow', slotIndex: 5, overflowCount: sorted.length - 5, ...OFFSETS[5] });
  return slots;
}
```

- [ ] **Step 6: Run presentation tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/legendary-wonder-slots.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/legendary-wonder-landmark-presentation.ts src/systems/legendary-wonder-map-presentation.ts src/renderer/wonders/legendary-wonder-slots.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/legendary-wonder-slots.test.ts
git commit -m "feat(wonders): derive safe legendary landmark views"
```

## Task 3: Render Token Landmarks, Ghosts, And Layer Order

**Files:**
- Modify: `src/renderer/wonders/legendary-wonder-renderer.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/renderer/legendary-wonder-renderer.test.ts`
- Test: `tests/renderer/city-renderer.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Update `tests/renderer/legendary-wonder-renderer.test.ts`:

```ts
it('draws every authored family with nonblank canvas operations', () => {
  const families = getLegendaryWonderLandmarkMetadataCatalog().map(entry => entry.family);
  for (const family of families) {
    const ctx = new MockCanvasContext();
    drawLegendaryWonderLandmarkGlyph({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      cx: 80,
      cy: 80,
      radius: 12,
      metadata: { ...getLegendaryWonderLandmarkMetadata('oracle-of-delphi'), family },
      state: 'completed',
      reducedMotion: false,
      nowMs: 1000,
    });
    expect(ctx.operations.length, family).toBeGreaterThan(3);
    expect(ctx.operations.some(operation => operation.startsWith('fill:') || operation.startsWith('stroke:')), family).toBe(true);
  }
});

it('draws active construction ghosts as scaffold or outline operations', () => {
  const ctx = new MockCanvasContext();
  drawLegendaryWonderLandmarks({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    cx: 80,
    cy: 80,
    size: 48,
    reducedMotion: false,
    lowZoom: false,
    turn: 20,
    entries: [
      {
        wonderId: 'oracle-of-delphi',
        label: 'Oracle of Delphi',
        turnCompleted: Number.MAX_SAFE_INTEGER,
        visual: getWonderVisualDefinition('oracle-of-delphi'),
        state: 'under-construction',
        metadata: getLegendaryWonderLandmarkMetadata('oracle-of-delphi'),
        progressRatio: 0.6,
      },
    ],
  });

  expect(ctx.operations.some(operation => operation.includes('ghost') || operation.startsWith('stroke:'))).toBe(true);
});
```

Update `tests/renderer/city-renderer.test.ts`:

```ts
it('draws legendary landmark layer before city label and production badges remain above it', () => {
  const state = createNewGame(undefined, 'legendary-layer-order-test');
  const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map, state.idCounters);
  city.productionQueue = ['granary'];
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
  };

  const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
  drawCities(ctx, state, makeCamera(), 'player');

  const ops = (ctx as unknown as MockCanvasContext).operations;
  const landmarkIndex = ops.findIndex(operation => operation === 'legendary-landmarks:start');
  const labelIndex = ops.findIndex(operation => operation.includes(`text:${city.name}`));
  const badgeIndex = ops.findIndex(operation => operation.includes(`text:${getProductionBadgeIcon(city)}`));
  expect(landmarkIndex).toBeGreaterThanOrEqual(0);
  expect(labelIndex).toBeGreaterThanOrEqual(0);
  expect(badgeIndex).toBeGreaterThanOrEqual(0);
  expect(landmarkIndex).toBeLessThan(labelIndex);
  expect(landmarkIndex).toBeLessThan(badgeIndex);
});
```

- [ ] **Step 2: Run renderer tests to verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/legendary-wonder-renderer.test.ts tests/renderer/city-renderer.test.ts
```

Expected: FAIL because exported glyph renderer, `turn`, `metadata`, `state`, and explicit op markers do not exist.

- [ ] **Step 3: Update renderer types and glyph function**

Modify `src/renderer/wonders/legendary-wonder-renderer.ts`:

```ts
import type { LegendaryWonderLandmarkMetadata, LegendaryWonderLandmarkState } from '@/systems/legendary-wonder-landmark-types';
import { getLegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-catalog';

export interface LegendaryWonderRenderEntry {
  wonderId: string;
  label: string;
  turnCompleted: number;
  visual: WonderVisualDefinition;
  state?: LegendaryWonderLandmarkState;
  metadata?: LegendaryWonderLandmarkMetadata;
  progressRatio?: number;
}

function pulseAlpha(nowMs: number): number {
  return (Math.sin(nowMs / 900) + 1) / 2;
}

export function drawLegendaryWonderLandmarkGlyph(options: {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  radius: number;
  metadata: LegendaryWonderLandmarkMetadata;
  state: LegendaryWonderLandmarkState;
  reducedMotion: boolean;
  nowMs: number;
}): void {
  const { ctx, cx, cy, radius, metadata, state, reducedMotion, nowMs } = options;
  const motion = reducedMotion ? 'none' : metadata.motion;
  if (metadata.aura !== 'none') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = metadata.palette.glow;
    ctx.globalAlpha = motion === 'pulse' ? 0.12 + pulseAlpha(nowMs) * 0.12 : 0.14;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (state === 'under-construction') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.72, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = metadata.palette.accent;
    ctx.lineWidth = Math.max(1, radius * 0.13);
    ctx.stroke();
    return;
  }

  drawSilhouette(ctx, metadata.family, cx, cy, radius * 0.72 * metadata.scale);
  ctx.fillStyle = metadata.palette.accent;
  ctx.fill();
  ctx.strokeStyle = metadata.palette.glow;
  ctx.lineWidth = Math.max(1, radius * 0.08);
  ctx.stroke();

  if (motion === 'glint' || motion === 'spark') {
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.34, cy - radius * 0.34);
    ctx.lineTo(cx + radius * 0.34, cy + radius * 0.34);
    ctx.strokeStyle = metadata.palette.glow;
    ctx.lineWidth = Math.max(1, radius * 0.06);
    ctx.stroke();
  }
}
```

Update `drawSilhouette` to accept `LegendaryWonderLandmarkMetadata['family']` and replace the body with explicit helper calls. This keeps every authored family renderable without adding one-off drawing logic for each wonder:

```ts
function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  family: LegendaryWonderLandmarkMetadata['family'],
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  switch (family) {
    case 'oracle':
    case 'spire':
    case 'signal':
      drawSpireSilhouette(ctx, cx, cy, radius);
      break;
    case 'waterworks':
    case 'gateway':
    case 'drydock':
      drawArchSilhouette(ctx, cx, cy, radius);
      break;
    case 'garden':
    case 'observatory':
      drawDomeSilhouette(ctx, cx, cy, radius);
      break;
    case 'laboratory':
      drawObeliskSilhouette(ctx, cx, cy, radius);
      break;
    case 'foundry':
    case 'bastion':
    case 'hall':
      drawCitadelSilhouette(ctx, cx, cy, radius);
      break;
    case 'archive':
    case 'exchange':
    case 'network':
    default:
      drawArchiveSilhouette(ctx, cx, cy, radius);
      break;
  }
  ctx.closePath();
}

function drawArchSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.arc(cx, cy + radius * 0.35, radius * 0.62, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.48, cy + radius * 0.72);
  ctx.lineTo(cx - radius * 0.48, cy + radius * 0.72);
}

function drawDomeSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.arc(cx, cy + radius * 0.2, radius * 0.7, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + radius * 0.7, cy + radius * 0.65);
  ctx.lineTo(cx - radius * 0.7, cy + radius * 0.65);
}

function drawObeliskSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.moveTo(cx, cy - radius * 0.82);
  ctx.lineTo(cx + radius * 0.34, cy + radius * 0.7);
  ctx.lineTo(cx - radius * 0.34, cy + radius * 0.7);
}

function drawCitadelSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.rect(cx - radius * 0.62, cy - radius * 0.34, radius * 1.24, radius * 1.02);
  ctx.moveTo(cx - radius * 0.62, cy - radius * 0.34);
  ctx.lineTo(cx - radius * 0.38, cy - radius * 0.68);
  ctx.lineTo(cx - radius * 0.12, cy - radius * 0.34);
  ctx.lineTo(cx + radius * 0.12, cy - radius * 0.68);
  ctx.lineTo(cx + radius * 0.38, cy - radius * 0.34);
}

function drawArchiveSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.rect(cx - radius * 0.66, cy - radius * 0.5, radius * 1.32, radius * 1.08);
  ctx.moveTo(cx - radius * 0.44, cy - radius * 0.5);
  ctx.lineTo(cx - radius * 0.44, cy + radius * 0.58);
  ctx.moveTo(cx, cy - radius * 0.5);
  ctx.lineTo(cx, cy + radius * 0.58);
  ctx.moveTo(cx + radius * 0.44, cy - radius * 0.5);
  ctx.lineTo(cx + radius * 0.44, cy + radius * 0.58);
}

function drawSpireSilhouette(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.moveTo(cx, cy - radius * 0.84);
  ctx.lineTo(cx + radius * 0.54, cy + radius * 0.68);
  ctx.lineTo(cx, cy + radius * 0.38);
  ctx.lineTo(cx - radius * 0.54, cy + radius * 0.68);
}
```

- [ ] **Step 4: Update landmark draw loop**

Modify `drawLegendaryWonderLandmarks` options:

```ts
  turn?: number;
  nowMs?: number;
```

Inside function:

```ts
  const slots = assignLegendaryWonderSlots(options.entries, options.turn ?? 0);
  const nowMs = options.nowMs ?? 0;
  options.ctx.save();
  (options.ctx as unknown as { operations?: string[] }).operations?.push('legendary-landmarks:start');
```

Replace direct `drawSilhouette` call with:

```ts
    const metadata = entry.metadata ?? getLegendaryWonderLandmarkMetadata(entry.wonderId);
    drawLegendaryWonderLandmarkGlyph({
      ctx: options.ctx,
      cx: x,
      cy: y,
      radius: radius * (options.lowZoom ? 0.82 : 1),
      metadata,
      state: entry.state ?? 'completed',
      reducedMotion: options.reducedMotion,
      nowMs,
    });
```

- [ ] **Step 5: Pass turn/metadata from city renderer with deterministic timing**

Modify `src/renderer/city-renderer.ts` so draw timing is deterministic in tests and does not call `Date.now()` from the city renderer. First change the signature to accept an optional options object while preserving the default call shape:

```ts
interface CityRenderOptions {
  reducedMotion?: boolean;
  nowMs?: number;
}

export function drawCities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  playerCivId: string,
  options: CityRenderOptions | boolean = {},
): void {
  const reducedMotion = typeof options === 'boolean' ? options : options.reducedMotion ?? false;
  const nowMs = typeof options === 'boolean' ? state.turn * 1000 : options.nowMs ?? state.turn * 1000;
```

Then move the existing landmark draw block so it runs after the city circle/icon is drawn and before the city name/population label. Keep unrest, occupation, breakaway, production, and idle badges after the landmark block so badges remain on top. Update the landmark call:

```ts
const legendaryEntries = projection.liveCityId ? landmarksByCity.get(projection.liveCityId) ?? [] : [];
if (legendaryEntries.length > 0) {
drawLegendaryWonderLandmarks({
  ctx,
  cx: screen.x,
  cy: screen.y,
  size,
  entries: legendaryEntries,
  reducedMotion,
  lowZoom: camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD,
  turn: state.turn,
  nowMs,
});
}
```

Update `src/renderer/render-loop.ts` city draw call from the existing boolean argument to an options object:

```ts
drawCities(this.ctx, this.state, this.camera, viewerId, {
  reducedMotion: prefersReducedMotion(),
  nowMs: performance.now(),
});
```

This keeps runtime landmark pulse/glint alive, while renderer tests can call `drawCities(..., { nowMs: 1000 })` for deterministic assertions. Do not introduce `Date.now()` in renderer code.

- [ ] **Step 6: Run renderer tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/legendary-wonder-renderer.test.ts tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/wonders/legendary-wonder-renderer.ts src/renderer/city-renderer.ts src/renderer/render-loop.ts tests/renderer/legendary-wonder-renderer.test.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(wonders): render authored legendary city landmarks"
```

## Task 4: Add Inspection, City Panel, And Codex Previews

**Files:**
- Modify: `src/ui/territory-inspection-panel.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/systems/wonder-codex/presentation.ts`
- Modify: `src/ui/wonder-codex-page.ts`
- Test: `tests/ui/territory-inspection-panel.test.ts`
- Test: `tests/ui/city-panel.test.ts`
- Test: `tests/systems/wonder-codex/presentation.test.ts`
- Test: `tests/ui/wonder-codex-page.test.ts`

- [ ] **Step 1: Write failing UI and presentation tests**

Add to `tests/ui/territory-inspection-panel.test.ts`:

```ts
it('lists every completed owned legendary wonder in an overflow city', () => {
  const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
  const city = state.cities['city-river'];
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 1 },
    'grand-canal': { ownerId: 'player', cityId: city.id, turnCompleted: 2 },
    'sun-spire': { ownerId: 'player', cityId: city.id, turnCompleted: 3 },
    'world-archive': { ownerId: 'player', cityId: city.id, turnCompleted: 4 },
    'moonwell-gardens': { ownerId: 'player', cityId: city.id, turnCompleted: 5 },
    'ironroot-foundry': { ownerId: 'player', cityId: city.id, turnCompleted: 6 },
    'tidecaller-bastion': { ownerId: 'player', cityId: city.id, turnCompleted: 7 },
  };

  const panel = createTerritoryInspectionPanel(state, city.position, 'player');

  expect(panel.textContent).toContain('Oracle of Delphi');
  expect(panel.textContent).toContain('Grand Canal');
  expect(panel.textContent).toContain('Tidecaller Bastion');
});
```

Add to `tests/ui/city-panel.test.ts`:

```ts
it('renders compact legendary landmark preview with completed and active ghost states', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
  };
  city.productionQueue = ['legendary:grand-canal'];
  city.productionProgress = 90;
  state.legendaryWonderProjects = {
    'grand-canal:player:city-river': {
      wonderId: 'grand-canal',
      ownerId: 'player',
      cityId: city.id,
      phase: 'building',
      investedProduction: 90,
      transferableProduction: 0,
      questSteps: [],
    },
  };

  const panel = createCityPanel(container, city, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  expect(panel.querySelector('[data-section="legendary-landmark-preview"]')?.textContent).toContain('Oracle of Delphi');
  expect(panel.querySelector('[data-section="legendary-landmark-preview"]')?.textContent).toContain('Grand Canal');
  expect(panel.querySelector('[data-section="legendary-landmark-preview"]')?.textContent).toContain('Under construction');
});
```

Add to `tests/systems/wonder-codex/presentation.test.ts`:

```ts
it('adds owned legendary landmark preview to owned completed and active pages only', () => {
  const state = makeState();
  const baseCity = state.cities[Object.keys(state.cities)[0]];
  state.cities['safe-city'] = { ...baseCity, id: 'safe-city', owner: 'player' };
  state.completedLegendaryWonders = {
    'oracle-of-delphi': { ownerId: 'player', cityId: 'safe-city', turnCompleted: 58 },
  };

  const owned = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
  expect(owned.selectedPage?.landmarkPreview).toMatchObject({
    cityId: 'safe-city',
    cityName: state.cities['safe-city'].name,
  });
  expect(owned.selectedPage?.landmarkPreview?.items[0]).toMatchObject({
    wonderId: 'oracle-of-delphi',
    state: 'completed',
  });

  state.legendaryWonderIntel = {
    player: [{
      kind: 'completed',
      eventId: 'completed:grand-canal:ai-1:58',
      wonderId: 'grand-canal',
      civId: 'ai-1',
      civName: 'Rival',
      completionTurn: 58,
      learnedTurn: 58,
    }],
  };
  const rival = getWonderCodexViewModel(state, 'player', { initialWonderId: 'grand-canal' });
  expect(rival.selectedPage?.landmarkPreview).toBeUndefined();
});
```

Add to `tests/ui/wonder-codex-page.test.ts`:

```ts
it('renders compact landmark preview without adding rival actions', () => {
  const root = createWonderCodexPage(page({
    id: 'oracle-of-delphi',
    kind: 'legendary',
    title: 'Oracle of Delphi',
    subtitle: 'A sanctuary of prophecy.',
    stateLabel: 'Completed',
    visual: getWonderVisualDefinition('oracle-of-delphi'),
    actions: [],
    landmarkPreview: {
      cityId: 'city-river',
      cityName: 'River City',
      items: [{
        wonderId: 'oracle-of-delphi',
        label: 'Oracle of Delphi',
        state: 'completed',
      }],
    },
  }), { onAction: () => {}, onSelectRelated: () => {} });

  expect(root.querySelector('[data-section="legendary-landmark-preview"]')?.textContent).toContain('Oracle of Delphi');
  expect(root.querySelector('[data-codex-action="open-city"]')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/territory-inspection-panel.test.ts tests/ui/city-panel.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts
```

Expected: FAIL because preview view models and DOM sections do not exist.

- [ ] **Step 3: Add preview view-model helper**

Append to `src/systems/legendary-wonder-landmark-presentation.ts`:

```ts
export interface LegendaryWonderLandmarkPreviewView {
  cityId: string;
  cityName: string;
  items: Array<{
    wonderId: string;
    label: string;
    state: 'completed' | 'under-construction';
  }>;
}

export function getLegendaryLandmarkPreviewViewForCity(
  state: GameState,
  viewerId: string,
  cityId: string,
): LegendaryWonderLandmarkPreviewView | null {
  const city = state.cities[cityId];
  if (!city || city.owner !== viewerId) return null;
  const items = getLegendaryLandmarkPreviewForCity(state, viewerId, cityId)
    .map(item => ({ wonderId: item.wonderId, label: item.label, state: item.state }));
  if (items.length === 0) return null;
  return { cityId, cityName: city.name, items };
}
```

- [ ] **Step 4: Update territory inspection**

In `src/ui/territory-inspection-panel.ts`, replace the local `completedInCity` query with:

```ts
import { getCompletedLegendaryLandmarksForCity } from '@/systems/legendary-wonder-landmark-presentation';
```

```ts
  const cityAtCoord = Object.values(state.cities).find(candidate => hexKey(candidate.position) === key);
  const completedInCity = cityAtCoord
    ? getCompletedLegendaryLandmarksForCity(state, viewerId, cityAtCoord.id).map(entry => entry.label)
    : [];
```

- [ ] **Step 5: Update city panel**

Import:

```ts
import { getLegendaryLandmarkPreviewViewForCity } from '@/systems/legendary-wonder-landmark-presentation';
```

After `compactWonderSectionHtml`, add:

```ts
  const landmarkPreview = getLegendaryLandmarkPreviewViewForCity(state, state.currentPlayer, city.id);
  const landmarkPreviewHtml = landmarkPreview
    ? `<div data-section="legendary-landmark-preview" style="background:rgba(232,193,112,0.08);border:1px solid rgba(232,193,112,0.22);border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-weight:bold;font-size:13px;color:#e8c170;margin-bottom:6px;">Legendary landmarks</div>
        ${landmarkPreview.items.map((item, index) => `<div data-landmark-preview="${item.wonderId}" style="font-size:12px;opacity:0.86;"><span data-text="landmark-preview-${index}"></span></div>`).join('')}
      </div>`
    : '';
```

Insert `${landmarkPreviewHtml}` before `${idleSelectorHtml}` in `#city-list-view`.

After dynamic text setup:

```ts
  landmarkPreview?.items.forEach((item, index) => {
    setText(`landmark-preview-${index}`, item.state === 'under-construction'
      ? `${item.label} — Under construction`
      : `${item.label} — Completed`);
  });
```

- [ ] **Step 6: Update Codex presentation and page**

In `src/systems/wonder-codex/presentation.ts`, import preview type/helper:

```ts
import {
  getLegendaryLandmarkPreviewViewForCity,
  type LegendaryWonderLandmarkPreviewView,
} from '@/systems/legendary-wonder-landmark-presentation';
```

Add to `WonderCodexPageViewModel`:

```ts
  landmarkPreview?: LegendaryWonderLandmarkPreviewView;
```

In `buildPage`, after status:

```ts
  const cityIdForPreview = entry.kind === 'legendary'
    ? safeOwnedHostCityId(state, viewerId, state.completedLegendaryWonders?.[entry.id]?.cityId ?? ownedProject(state, viewerId, entry.id)?.cityId)
    : undefined;
  const landmarkPreview = cityIdForPreview
    ? getLegendaryLandmarkPreviewViewForCity(state, viewerId, cityIdForPreview)
    : null;
```

In return:

```ts
    ...(landmarkPreview ? { landmarkPreview } : {}),
```

In `src/ui/wonder-codex-page.ts`, after status section:

```ts
  if (page.landmarkPreview) {
    const preview = document.createElement('section');
    preview.dataset.section = 'legendary-landmark-preview';
    preview.style.cssText = 'border:1px solid rgba(232,193,112,0.24);border-radius:8px;padding:10px;background:rgba(232,193,112,0.07);display:grid;gap:6px;';
    appendText(preview, 'h4', 'City landmark preview', 'margin:0;font-size:13px;color:#f4d188;');
    appendText(preview, 'p', page.landmarkPreview.cityName, 'margin:0;font-size:12px;color:rgba(248,241,223,0.74);');
    const list = document.createElement('ul');
    list.style.cssText = 'margin:0;padding-left:18px;display:grid;gap:4px;font-size:12px;color:rgba(248,241,223,0.74);';
    for (const item of page.landmarkPreview.items) {
      const li = document.createElement('li');
      li.dataset.landmarkPreview = item.wonderId;
      li.textContent = item.state === 'under-construction'
        ? `${item.label} — Under construction`
        : `${item.label} — Completed`;
      list.appendChild(li);
    }
    preview.appendChild(list);
    root.appendChild(preview);
  }
```

- [ ] **Step 7: Run UI tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/territory-inspection-panel.test.ts tests/ui/city-panel.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/legendary-wonder-landmark-presentation.ts src/ui/territory-inspection-panel.ts src/ui/city-panel.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-page.ts tests/ui/territory-inspection-panel.test.ts tests/ui/city-panel.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts
git commit -m "feat(wonders): show legendary landmark previews"
```

## Task 5: Final Privacy Review, Rule Checks, And Full Verification

**Files:**
- Review all changed files.
- No new production file unless review finds an issue.

- [ ] **Step 1: Run targeted landmark and UI tests**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/legendary-wonder-landmark-catalog.test.ts tests/systems/legendary-wonder-map-presentation.test.ts tests/renderer/legendary-wonder-slots.test.ts tests/renderer/legendary-wonder-renderer.test.ts tests/renderer/city-renderer.test.ts tests/ui/territory-inspection-panel.test.ts tests/ui/city-panel.test.ts tests/systems/wonder-codex/presentation.test.ts tests/ui/wonder-codex-page.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run source rule check**

```bash
scripts/check-src-rule-violations.sh src/systems/legendary-wonder-landmark-types.ts src/systems/legendary-wonder-landmark-catalog.ts src/systems/legendary-wonder-landmark-validation.ts src/systems/wonder-visual-catalog.ts src/systems/legendary-wonder-map-presentation.ts src/systems/legendary-wonder-landmark-presentation.ts src/renderer/wonders/legendary-wonder-slots.ts src/renderer/wonders/legendary-wonder-renderer.ts src/renderer/city-renderer.ts src/renderer/render-loop.ts src/ui/territory-inspection-panel.ts src/ui/city-panel.ts src/systems/wonder-codex/presentation.ts src/ui/wonder-codex-page.ts
```

Expected: no output and exit 0.

- [ ] **Step 3: Run wonder regression suite**

```bash
./scripts/run-wonder-regressions.sh
```

Expected: PASS.

- [ ] **Step 4: Run build**

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. Vite chunk-size warnings are acceptable.

- [ ] **Step 5: Run full test suite**

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 6: Review branch and local diffs**

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src tests docs
```

Review for:

- no rival landmark leakage
- no hidden host-city leakage
- no gameplay mutations
- no save-format writes
- no direct Tauri/platform imports
- no map input behavior changes
- no missing metadata/test convention
- no stale hash-based known legendary assignment
- `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md` still records deferred Stage 2I bespoke art, Stage 2J rival landmark intel visibility, and Stage 2K city renderer layer architecture work

- [ ] **Step 7: Fix any review findings**

If review finds an issue, add a focused regression test first, then fix the smallest production surface. Re-run the targeted command from the failing area plus build/test if `src/` changed.

- [ ] **Step 8: Commit final fixes if needed**

If Step 7 changed files:

```bash
git add src tests docs
git commit -m "fix(wonders): harden legendary landmark rendering"
```

If no issues were found, do not create an empty commit.
