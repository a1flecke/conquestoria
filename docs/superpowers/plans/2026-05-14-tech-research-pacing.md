# Tech Research Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix issue #133 by making early tech research costs use a production-style pacing model so first real unlocks, especially Bronze Working, complete in fun live turn ranges.

**Architecture:** Add research-specific pacing helpers to `src/systems/pacing-model.ts`, then wire tech audit rows through those helpers without changing turn processing or hiding live ETA math. Retune the targeted opening tech costs in `src/systems/tech-definitions.ts`, and prove the player-visible tech panel still displays actual live-science ETA rather than model-profile ETA.

**Tech Stack:** TypeScript, Vitest, jsdom for UI tests, Vite build, repo wrapper `./scripts/run-with-mise.sh`, rule check script `scripts/check-src-rule-violations.sh`

**Model Target:** GPT-5.4, medium reasoning effort.

---

## Scope Check

This plan implements one vertical slice from `docs/superpowers/specs/2026-05-13-tech-research-pacing-design.md`: tech research pacing. It does not change production, queue semantics, turn processing, save format, tech prerequisites, or tech panel layout. The only UI-facing behavior under this plan is that existing ETA text reflects the retuned costs using live science per turn.

## File Map

| File | Responsibility |
|---|---|
| `src/systems/pacing-model.ts` | Add research output profiles, opening-tier classifiers, metadata multiplier, recommended tech window, and recommended tech cost helpers. |
| `tests/systems/pacing-model.test.ts` | Unit-test research profiles, structural opening-tier helpers, multiplier behavior, recommended windows, and recommended readable costs. |
| `src/systems/pacing-audit.ts` | Use the research pacing helpers for tech audit rows and expose tech audit profile plus live-baseline turn fields. |
| `tests/systems/pacing-audit.test.ts` | Prove current Bronze Working starts as a slow outlier, then prove retuned opening-baseline tech rows are no longer slow outliers. |
| `src/systems/tech-definitions.ts` | Retune only targeted starter prerequisite and first-real-unlock tech costs. Do not add metadata unless a tested outlier exception is deliberately chosen. |
| `tests/systems/tech-definitions.test.ts` | Add structural tests for starter prerequisite and first-real-unlock membership plus cost windows. |
| `tests/integration/pacing-simulation.test.ts` | Add deterministic Bronze Working baseline and science-invested turn-processing fixtures. |
| `tests/ui/tech-panel.test.ts` | Add jsdom test proving visible Bronze Working ETA is based on live science per turn. |

## Player Truth Table

| Before | Action | Internal state | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Tech panel is open, Stone Weapons is completed, Bronze Working is current research, one city produces 1 live science/turn | Player opens Research panel | `Tech.cost` for Bronze Working is retuned; no hidden science multiplier is applied | Current research summary shows `Turns remaining: 10` or another value in 9-11 | Full tech panel, queue controls, zoom controls |
| Same state, city has idle production set to science and produces 2 live science/turn | Player opens Research panel | Live science calculation includes idle science through existing city yield path | Current research summary shows `Turns remaining: 5` or another value in 5-7 | Full tech panel, queue controls, zoom controls |
| Pacing debug panel is available in local/dev surfaces | Developer opens the pacing audit surface | Tech audit row uses research profile helpers and actual `Tech.cost` | Audit row can distinguish recommended cost, audit ETA, and live one-city baseline ETA | Existing building and unit audit rows |

## Misleading UI Risks

- The tech panel must not display model-profile ETA as if it were live ETA. Player-facing ETA must use `calculateProjectedCityYields(...).science` and actual `Tech.cost`.
- The pacing audit may show audit-profile estimates, but the row must carry a live one-city baseline value for opening techs so a future implementer cannot accidentally hide a 50-turn live Bronze Working behind a healthy model estimate.
- The `first real unlock` helper must be structural. It must not inspect unlock prose, because prose is inconsistent and would make the audit brittle.
- Specialized roots such as Espionage Scouting should not be flattened into the opening starter target unless their explicit or resolved pacing band is `starter`.

## Interaction Replay Checklist

This plan does not add new interactions. The UI regression path is:

- open tech panel with Bronze Working current
- inspect current research summary
- inspect Bronze Working card text in the rendered tree
- change only live science in fixture from 1 to 2
- reopen tech panel
- verify visible ETA changes from baseline range to science-invested range

No add, reorder, remove, or repeat-click behavior changes in this plan.

## Queue And ETA Checklist

- Active item remains shown in the current research summary.
- Queued follow-up display remains unchanged.
- ETA text remains visible and live-science based.
- Reorder and remove behavior are not changed in this plan.
- If a queued item later becomes invalid, existing queue behavior remains responsible; this plan does not alter that path.

---

### Task 1: Research Pacing Model Helpers

**Files:**
- Modify: `src/systems/pacing-model.ts`
- Modify: `tests/systems/pacing-model.test.ts`

- [ ] **Step 1: Write failing research pacing model tests**

Append these tests to `tests/systems/pacing-model.test.ts`:

```ts
import { TECH_TREE } from '@/systems/tech-definitions';
import type { PacingMetadata } from '@/core/types';
import {
  estimateTurnsToComplete,
  getMetadataComplexityMultiplier,
  getProductionOutputProfileForEra,
  getRecommendedTechCost,
  getRecommendedTechTurnWindow,
  getResearchOutputProfileForEra,
  getResearchOutputProfileForTech,
  getTargetTurnWindow,
  isFirstRealUnlockTech,
  isStarterPrerequisiteTech,
} from '@/systems/pacing-model';

function tech(id: string) {
  const found = TECH_TREE.find(candidate => candidate.id === id);
  if (!found) throw new Error(`missing tech ${id}`);
  return found;
}

describe('research pacing model', () => {
  it('returns stable established-era research profiles', () => {
    expect(getResearchOutputProfileForEra(Number.NaN)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForEra(1)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForEra(2)).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
    expect(getResearchOutputProfileForEra(5)).toEqual({ name: 'era-5-established', outputPerTurn: 13 });
    expect(getResearchOutputProfileForEra(99)).toEqual({ name: 'era-5-established', outputPerTurn: 13 });
  });

  it('classifies starter prerequisites structurally from era, prerequisites, and pacing band', () => {
    expect(isStarterPrerequisiteTech(tech('stone-weapons'))).toBe(true);
    expect(isStarterPrerequisiteTech(tech('fire'))).toBe(true);
    expect(isStarterPrerequisiteTech(tech('espionage-scouting'))).toBe(false);
    expect(isStarterPrerequisiteTech(tech('archery'))).toBe(false);
  });

  it('classifies first real unlocks structurally without reading unlock prose', () => {
    expect(isFirstRealUnlockTech(tech('archery'))).toBe(true);
    expect(isFirstRealUnlockTech(tech('bronze-working'))).toBe(true);
    expect(isFirstRealUnlockTech(tech('writing'))).toBe(true);
    expect(isFirstRealUnlockTech(tech('early-empire'))).toBe(false);
    expect(isFirstRealUnlockTech(tech('lookouts'))).toBe(false);
  });

  it('uses the opening baseline profile for starter and first real unlock techs', () => {
    expect(getResearchOutputProfileForTech(tech('stone-weapons'))).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForTech(tech('bronze-working'))).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(getResearchOutputProfileForTech(tech('espionage-scouting'))).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
    expect(getResearchOutputProfileForTech(tech('lookouts'))).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
    expect(getResearchOutputProfileForTech(tech('early-empire'))).toEqual({ name: 'era-2-established', outputPerTurn: 4 });
  });

  it('returns opening-specific turn windows before generic era windows', () => {
    expect(getRecommendedTechTurnWindow(tech('stone-weapons'))).toEqual({ min: 2, max: 5 });
    expect(getRecommendedTechTurnWindow(tech('archery'))).toEqual({ min: 8, max: 12 });
    expect(getRecommendedTechTurnWindow(tech('bronze-working'))).toEqual({ min: 9, max: 11 });
    expect(getRecommendedTechTurnWindow(tech('early-empire'))).toEqual({ min: 4, max: 7 });
  });

  it('applies metadata complexity with bounded cost pressure', () => {
    const neutral: PacingMetadata = {
      band: 'core',
      role: 'neutral',
      impact: 1,
      scope: 'city',
      snowball: 1,
      urgency: 1,
      situationality: 1,
      unlockBreadth: 1,
    };
    const broadAccelerant: PacingMetadata = {
      ...neutral,
      impact: 1.25,
      scope: 'empire',
      snowball: 1.25,
      unlockBreadth: 1.2,
    };
    const urgentNiche: PacingMetadata = {
      ...neutral,
      urgency: 1.25,
      situationality: 1.25,
    };

    expect(getMetadataComplexityMultiplier(broadAccelerant)).toBeGreaterThan(getMetadataComplexityMultiplier(neutral));
    expect(getMetadataComplexityMultiplier(urgentNiche)).toBeLessThan(getMetadataComplexityMultiplier(neutral));
    expect(getMetadataComplexityMultiplier({
      ...broadAccelerant,
      impact: 9,
      snowball: 9,
      unlockBreadth: 9,
    })).toBe(1.35);
    expect(getMetadataComplexityMultiplier({
      ...urgentNiche,
      urgency: 9,
      situationality: 9,
    })).toBe(0.75);
    expect(getMetadataComplexityMultiplier(broadAccelerant, { max: 1.1 })).toBe(1.1);
  });

  it('recommends readable opening tech costs inside accepted live turn windows', () => {
    const stone = getRecommendedTechCost(tech('stone-weapons'));
    const archery = getRecommendedTechCost(tech('archery'));
    const bronze = getRecommendedTechCost(tech('bronze-working'));

    expect(estimateTurnsToComplete({ cost: stone, outputPerTurn: 1 })).toBeGreaterThanOrEqual(2);
    expect(estimateTurnsToComplete({ cost: stone, outputPerTurn: 1 })).toBeLessThanOrEqual(5);
    expect(estimateTurnsToComplete({ cost: archery, outputPerTurn: 1 })).toBeGreaterThanOrEqual(8);
    expect(estimateTurnsToComplete({ cost: archery, outputPerTurn: 1 })).toBeLessThanOrEqual(12);
    expect(estimateTurnsToComplete({ cost: bronze, outputPerTurn: 1 })).toBeGreaterThanOrEqual(9);
    expect(estimateTurnsToComplete({ cost: bronze, outputPerTurn: 1 })).toBeLessThanOrEqual(11);
  });
});
```

Remove the original import block at the top of the file before adding this expanded import block, so the file has one import list.

- [ ] **Step 2: Run the pacing-model tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts
```

Expected: FAIL with missing exports such as `getResearchOutputProfileForEra`, `getRecommendedTechCost`, or `isFirstRealUnlockTech`.

- [ ] **Step 3: Add research helpers to `src/systems/pacing-model.ts`**

Replace the import block and add these helper definitions after `estimateTurnsToComplete`:

```ts
import type { Building, PacingBand, PacingContentType, PacingMetadata, Tech } from '@/core/types';
import type { TRAINABLE_UNITS } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';

export interface ResearchOutputProfile {
  name:
    | 'opening-baseline'
    | 'opening-science-invested'
    | 'era-2-established'
    | 'era-3-established'
    | 'era-4-established'
    | 'era-5-established';
  outputPerTurn: number;
}

const RESEARCH_OUTPUT_BY_ERA: Record<number, ResearchOutputProfile> = {
  1: { name: 'opening-baseline', outputPerTurn: 1 },
  2: { name: 'era-2-established', outputPerTurn: 4 },
  3: { name: 'era-3-established', outputPerTurn: 7 },
  4: { name: 'era-4-established', outputPerTurn: 10 },
  5: { name: 'era-5-established', outputPerTurn: 13 },
};

export const OPENING_SCIENCE_INVESTED_PROFILE: ResearchOutputProfile = {
  name: 'opening-science-invested',
  outputPerTurn: 2,
};

export interface MetadataComplexityOptions {
  min?: number;
  max?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeEra(era: number): number {
  const numericEra = Number.isFinite(era) ? era : 1;
  const normalized = Math.max(1, Math.floor(numericEra));
  return Math.min(5, normalized);
}

function findTech(techId: string, techs: Tech[]): Tech | undefined {
  return techs.find(candidate => candidate.id === techId);
}

export function getResearchOutputProfileForEra(era: number): ResearchOutputProfile {
  return RESEARCH_OUTPUT_BY_ERA[normalizeEra(era)];
}

export function isStarterPrerequisiteTech(tech: Tech): boolean {
  return tech.era === 1
    && tech.prerequisites.length === 0
    && resolveTechPacingBand(tech) === 'starter';
}

export function isFirstRealUnlockTech(tech: Tech, techs: Tech[] = TECH_TREE): boolean {
  if (tech.era > 2 || tech.prerequisites.length !== 1) return false;
  const prerequisite = findTech(tech.prerequisites[0], techs);
  return Boolean(prerequisite && isStarterPrerequisiteTech(prerequisite));
}

export function getResearchOutputProfileForTech(tech: Tech, techs: Tech[] = TECH_TREE): ResearchOutputProfile {
  if (isStarterPrerequisiteTech(tech) || isFirstRealUnlockTech(tech, techs)) {
    return RESEARCH_OUTPUT_BY_ERA[1];
  }

  if (tech.era <= 1) {
    return RESEARCH_OUTPUT_BY_ERA[2];
  }

  return getResearchOutputProfileForEra(tech.era);
}

export function getRecommendedTechTurnWindow(tech: Tech, techs: Tech[] = TECH_TREE): { min: number; max: number } {
  if (tech.id === 'bronze-working') {
    return { min: 9, max: 11 };
  }
  if (isStarterPrerequisiteTech(tech)) {
    return { min: 2, max: 5 };
  }
  if (isFirstRealUnlockTech(tech, techs)) {
    return { min: 8, max: 12 };
  }

  return getTargetTurnWindow({
    era: tech.era,
    band: resolveTechPacingBand(tech),
    contentType: 'tech',
  });
}

function inferTechScope(tech: Tech): PacingMetadata['scope'] {
  const unlockText = tech.unlocks.join(' ').toLowerCase();
  if (unlockText.includes('unit') || unlockText.includes('warrior') || unlockText.includes('swordsman')) {
    return 'military';
  }
  if (unlockText.includes('building') || unlockText.includes('library') || unlockText.includes('monument')) {
    return 'city';
  }
  return 'empire';
}

function metadataForTech(tech: Tech): PacingMetadata {
  return tech.pacing ?? {
    band: resolveTechPacingBand(tech),
    role: 'inferred',
    impact: 1,
    scope: inferTechScope(tech),
    snowball: 1,
    urgency: 1,
    situationality: 1,
    unlockBreadth: 1,
  };
}

export function getMetadataComplexityMultiplier(
  metadata: PacingMetadata,
  options: MetadataComplexityOptions = {},
): number {
  const min = options.min ?? 0.75;
  const max = options.max ?? 1.35;
  const scopeFactor = metadata.scope === 'empire'
    ? 1.08
    : metadata.scope === 'city'
      ? 0.96
      : 1;
  const impactFactor = metadata.impact;
  const snowballFactor = 1 + ((metadata.snowball - 1) * 0.5);
  const unlockBreadthFactor = 1 + ((metadata.unlockBreadth - 1) * 0.4);
  const urgencyFactor = clamp(1 - ((metadata.urgency - 1) * 0.25), 0.5, 1.25);
  const situationalityFactor = clamp(1 - ((metadata.situationality - 1) * 0.2), 0.5, 1.25);

  return Number(clamp(
    scopeFactor
      * impactFactor
      * snowballFactor
      * unlockBreadthFactor
      * urgencyFactor
      * situationalityFactor,
    min,
    max,
  ).toFixed(2));
}

function roundRecommendedTechCost(cost: number): number {
  if (cost < 20) return Math.max(1, Math.round(cost));
  return Math.max(5, Math.round(cost / 5) * 5);
}

export function getRecommendedTechCost(tech: Tech, techs: Tech[] = TECH_TREE): number {
  const profile = getResearchOutputProfileForTech(tech, techs);
  const window = getRecommendedTechTurnWindow(tech, techs);
  const targetTurns = Math.round((window.min + window.max) / 2);
  const metadata = metadataForTech(tech);
  return roundRecommendedTechCost(profile.outputPerTurn * targetTurns * getMetadataComplexityMultiplier(metadata));
}
```

Keep the existing production helpers below these new helpers. Do not change `estimateTurnsToComplete`, `resolveBuildingPacingBand`, or `resolveUnitPacingBand` in this task.

- [ ] **Step 4: Run pacing-model tests and verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts
```

Expected: PASS for all `pacing-model` tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/systems/pacing-model.ts tests/systems/pacing-model.test.ts
git commit -m "feat(pacing): add research cost model helpers"
```

---

### Task 2: Tech Pacing Audit Rows

**Files:**
- Modify: `src/systems/pacing-audit.ts`
- Modify: `tests/systems/pacing-audit.test.ts`

- [ ] **Step 1: Write failing pacing-audit tests for tech profiles and slow outliers**

Append these tests to `tests/systems/pacing-audit.test.ts`:

```ts
describe('tech pacing audit', () => {
  it('reports research profile and live baseline fields for tech rows', () => {
    const bronze = buildPacingAudit().find(row => row.id === 'bronze-working');

    expect(bronze).toBeDefined();
    expect(bronze?.contentType).toBe('tech');
    expect(bronze?.researchProfile).toBe('opening-baseline');
    expect(bronze?.liveBaselineTurns).toBe(bronze?.estimatedTurns);
    expect(bronze?.liveBaselineTurns).toBeGreaterThan(11);
    expect(bronze?.recommendedCost).toBeGreaterThan(0);
  });

  it('flags current Bronze Working as a slow opening outlier before the retune', () => {
    const bronze = buildPacingAudit().find(row => row.id === 'bronze-working');

    expect(bronze?.estimatedTurns).toBe(50);
    expect(bronze?.target).toEqual({ min: 9, max: 11 });
    expect(bronze?.outlier).toBe(true);
    expect(bronze?.outlierReason).toBe('Slower than target window');
  });
});
```

- [ ] **Step 2: Run pacing-audit tests and verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-audit.test.ts
```

Expected: FAIL because `researchProfile` and `liveBaselineTurns` do not exist on `PacingAuditRow`, and tech rows still use hardcoded `tech.era === 1 ? 3 : 8`.

- [ ] **Step 3: Update `src/systems/pacing-audit.ts` tech row logic**

Update the imports from `@/systems/pacing-model` to include:

```ts
  type ResearchOutputProfile,
  getRecommendedTechCost,
  getRecommendedTechTurnWindow,
  getResearchOutputProfileForTech,
```

Extend `PacingAuditRow`:

```ts
  researchProfile?: ResearchOutputProfile['name'];
  liveBaselineTurns?: number;
```

Replace the `...TECH_TREE.map(tech => { ... })` block with:

```ts
    ...TECH_TREE.map(tech => {
      const band = resolveTechPacingBand(tech);
      const profile = getResearchOutputProfileForTech(tech);
      const target = getRecommendedTechTurnWindow(tech);
      const currentCost = tech.cost;
      return {
        id: tech.id,
        label: tech.name,
        contentType: 'tech' as const,
        era: tech.era,
        band,
        currentCost,
        target,
        researchProfile: profile.name,
        liveBaselineTurns: profile.name === 'opening-baseline'
          ? estimateTurnsToComplete({ cost: currentCost, outputPerTurn: 1 })
          : undefined,
        ...buildAuditSignals(currentCost, profile.outputPerTurn, target, getRecommendedTechCost(tech)),
      };
    }),
```

Then change `buildAuditSignals` to accept an optional recommended cost override:

```ts
function buildAuditSignals(
  currentCost: number,
  outputPerTurn: number,
  target: { min: number; max: number },
  recommendedCostOverride?: number,
): Pick<PacingAuditRow, 'estimatedTurns' | 'recommendedCost' | 'outlier' | 'outlierReason'> {
  const estimatedTurns = estimateTurnsToComplete({ cost: currentCost, outputPerTurn });
  const recommendedTurns = Math.round((target.min + target.max) / 2);
  const recommendedCost = recommendedCostOverride ?? recommendedTurns * outputPerTurn;
  const outlier = estimatedTurns < target.min || estimatedTurns > target.max;
  const outlierReason = estimatedTurns > target.max
    ? 'Slower than target window'
    : estimatedTurns < target.min
      ? 'Faster than target window'
      : 'Within target window';

  return {
    estimatedTurns,
    recommendedCost,
    outlier,
    outlierReason,
  };
}
```

- [ ] **Step 4: Run pacing-audit tests and verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-audit.test.ts
```

Expected: PASS for all `pacing-audit` tests.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/systems/pacing-audit.ts tests/systems/pacing-audit.test.ts
git commit -m "feat(pacing): audit tech research profiles"
```

---

### Task 3: Deterministic Bronze Working And Visible ETA Regressions

**Files:**
- Modify: `tests/integration/pacing-simulation.test.ts`
- Modify: `tests/ui/tech-panel.test.ts`

- [ ] **Step 1: Add deterministic integration fixtures for Bronze Working**

Add this import to `tests/integration/pacing-simulation.test.ts`:

```ts
import { calculateProjectedCityYields } from '@/systems/city-work-system';
```

Append this helper and tests to the same file:

```ts

function makeBronzeWorkingResearchState(scienceInvestment: 'baseline' | 'idle-science') {
  const state = createNewGame(undefined, `bronze-working-${scienceInvestment}`, 'small');
  const player = state.civilizations.player;
  const settlerId = player.units.find(unitId => state.units[unitId]?.type === 'settler');
  expect(settlerId).toBeDefined();

  const city = foundCity('player', state.units[settlerId!].position, state.map);
  state.cities[city.id] = {
    ...city,
    productionQueue: [],
    idleProduction: scienceInvestment === 'idle-science' ? 'science' : null,
  };
  player.cities.push(city.id);
  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    state.map.tiles[key] = {
      ...state.map.tiles[key],
      terrain: 'grassland',
      resource: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      owner: 'player',
    };
  }

  player.techState.completed = ['stone-weapons'];
  player.techState.currentResearch = 'bronze-working';
  player.techState.researchProgress = 0;
  player.techState.researchQueue = [];

  expect(calculateProjectedCityYields(state, city.id).science).toBe(
    scienceInvestment === 'idle-science' ? 2 : 1,
  );

  return state;
}

function turnsToCompleteBronzeWorking(scienceInvestment: 'baseline' | 'idle-science'): number {
  let next = makeBronzeWorkingResearchState(scienceInvestment);
  for (let turn = 1; turn <= 20; turn++) {
    next = processTurn(next, new EventBus());
    if (next.civilizations.player.techState.completed.includes('bronze-working')) {
      return turn;
    }
  }
  return Number.POSITIVE_INFINITY;
}

it('completes Bronze Working in 9-11 turns for a baseline one-city opening', () => {
  const turns = turnsToCompleteBronzeWorking('baseline');
  expect(turns).toBeGreaterThanOrEqual(9);
  expect(turns).toBeLessThanOrEqual(11);
});

it('completes Bronze Working in 5-7 turns when opening production is invested into science', () => {
  const turns = turnsToCompleteBronzeWorking('idle-science');
  expect(turns).toBeGreaterThanOrEqual(5);
  expect(turns).toBeLessThanOrEqual(7);
});
```

- [ ] **Step 2: Run integration pacing tests and verify Bronze tests fail before retune**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/integration/pacing-simulation.test.ts
```

Expected: FAIL because current Bronze Working cost is 50, so baseline completion is outside 9-11 turns.

- [ ] **Step 3: Add visible ETA regression test to tech panel**

In `tests/ui/tech-panel.test.ts`, add imports:

```ts
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
```

Append this helper and test:

```ts
function makeBronzeWorkingPanelState(scienceInvestment: 'baseline' | 'idle-science' = 'baseline') {
  const state = createNewGame(undefined, 'tech-panel-bronze-working-eta', 'small');
  const player = state.civilizations.player;
  const settlerId = player.units.find(unitId => state.units[unitId]?.type === 'settler');
  expect(settlerId).toBeDefined();

  const city = foundCity('player', state.units[settlerId!].position, state.map);
  state.cities[city.id] = {
    ...city,
    productionQueue: [],
    idleProduction: scienceInvestment === 'idle-science' ? 'science' : null,
  };
  player.cities.push(city.id);
  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    state.map.tiles[key] = {
      ...state.map.tiles[key],
      terrain: 'grassland',
      resource: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      owner: 'player',
    };
  }

  player.techState.completed = ['stone-weapons'];
  player.techState.currentResearch = 'bronze-working';
  player.techState.researchProgress = 0;
  player.techState.researchQueue = [];

  expect(calculateProjectedCityYields(state, city.id).science).toBe(
    scienceInvestment === 'idle-science' ? 2 : 1,
  );

  return state;
}

it('shows live Bronze Working ETA from current science instead of audit-profile math', () => {
  const state = makeBronzeWorkingPanelState();

  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain('Researching: Bronze Working');
  expect(panel.textContent).toMatch(/Turns remaining: (9|10|11)/);
  expect(panel.textContent).not.toContain('50');
  expect(panel.querySelector('[data-tech-id="bronze-working"]')?.textContent).toMatch(/(9|10|11) turns/);
});
```

Append this companion test to prove the same rendered surface reacts to live science changes:

```ts
it('updates visible Bronze Working ETA when opening production is invested into science', () => {
  const state = makeBronzeWorkingPanelState('idle-science');

  const panel = createTechPanel(document.body, state, {
    onQueueResearch: () => {},
    onMoveQueuedResearch: () => {},
    onRemoveQueuedResearch: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toContain('Researching: Bronze Working');
  expect(panel.textContent).toMatch(/Turns remaining: (5|6|7)/);
  expect(panel.textContent).not.toMatch(/Turns remaining: (9|10|11)/);
  expect(panel.querySelector('[data-tech-id="bronze-working"]')?.textContent).toMatch(/(5|6|7) turns/);
});
```

- [ ] **Step 4: Run tech-panel test and verify it fails before retune**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/tech-panel.test.ts
```

Expected: FAIL because current Bronze Working ETA is outside 9-11 turns.

- [ ] **Step 5: Keep failing tests uncommitted until Task 4**

Do not commit Task 3 yet. These tests describe the desired behavior and should turn green after the data retune in Task 4.

---

### Task 4: Retune Opening Tech Costs And Add Structural Data Tests

**Files:**
- Modify: `src/systems/tech-definitions.ts`
- Modify: `tests/systems/tech-definitions.test.ts`
- Test: `tests/integration/pacing-simulation.test.ts`
- Test: `tests/ui/tech-panel.test.ts`
- Test: `tests/systems/pacing-audit.test.ts`

- [ ] **Step 1: Add structural cost tests to tech definitions**

Add imports to `tests/systems/tech-definitions.test.ts`:

```ts
import {
  estimateTurnsToComplete,
  getResearchOutputProfileForTech,
  isFirstRealUnlockTech,
  isStarterPrerequisiteTech,
} from '@/systems/pacing-model';
```

Append these tests:

```ts
describe('opening research pacing data', () => {
  it('keeps starter prerequisites inside the 2-5 turn baseline window', () => {
    const starters = TECH_TREE.filter(tech => isStarterPrerequisiteTech(tech));
    expect(starters.map(tech => tech.id)).toEqual(expect.arrayContaining([
      'stone-weapons',
      'gathering',
      'fire',
      'tribal-council',
      'pathfinding',
      'foraging',
      'herbalism',
      'oral-tradition',
      'cave-painting',
      'rafts',
      'copper-working',
      'mud-brick',
      'drums',
      'animism',
    ]));
    expect(starters.map(tech => tech.id)).not.toContain('espionage-scouting');

    const outliers = starters
      .map(tech => `${tech.id}:${estimateTurnsToComplete({ cost: tech.cost, outputPerTurn: 1 })}`)
      .filter(entry => {
        const turns = Number(entry.split(':')[1]);
        return turns < 2 || turns > 5;
      });

    expect(outliers).toEqual([]);
  });

  it('keeps structural first real unlocks inside the 8-12 turn baseline window', () => {
    const firstUnlocks = TECH_TREE.filter(tech => isFirstRealUnlockTech(tech));
    expect(firstUnlocks.map(tech => tech.id)).toEqual(expect.arrayContaining([
      'archery',
      'bronze-working',
      'writing',
      'wheel',
      'pottery',
      'animal-husbandry',
      'code-of-laws',
      'cartography',
      'sailing',
      'domestication',
      'granary-design',
      'bone-setting',
      'midwifery',
      'mythology',
      'rhetoric',
      'storytelling',
      'fishing',
      'smelting',
      'thatching',
      'foundations',
      'smoke-signals',
      'burial-rites',
    ]));
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('early-empire');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('lookouts');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('music');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('tool-making');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('messengers');
    expect(firstUnlocks.map(tech => tech.id)).not.toContain('sacred-sites');

    const outliers = firstUnlocks
      .filter(tech => tech.id !== 'bronze-working')
      .map(tech => `${tech.id}:${estimateTurnsToComplete({ cost: tech.cost, outputPerTurn: 1 })}`)
      .filter(entry => {
        const turns = Number(entry.split(':')[1]);
        return turns < 8 || turns > 12;
      });

    expect(outliers).toEqual([]);
  });

  it('keeps Bronze Working in its explicit 9-11 turn baseline window', () => {
    const bronze = TECH_TREE.find(tech => tech.id === 'bronze-working');
    expect(bronze).toBeDefined();
    expect(getResearchOutputProfileForTech(bronze!)).toEqual({ name: 'opening-baseline', outputPerTurn: 1 });
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 1 })).toBeGreaterThanOrEqual(9);
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 1 })).toBeLessThanOrEqual(11);
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 2 })).toBeGreaterThanOrEqual(5);
    expect(estimateTurnsToComplete({ cost: bronze!.cost, outputPerTurn: 2 })).toBeLessThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run tech-definitions tests and verify they fail before retune**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts
```

Expected: FAIL because current opening costs are too high.

- [ ] **Step 3: Retune targeted tech costs in `src/systems/tech-definitions.ts`**

Change only `cost` fields for starter prerequisite and first-real-unlock techs. Use this target table:

```ts
// Starter prerequisites: target 2-5 turns at 1 science/turn
stone-weapons: 4
gathering: 4
fire: 4
tribal-council: 4
pathfinding: 4
foraging: 5
herbalism: 5
oral-tradition: 5
cave-painting: 5
rafts: 5
copper-working: 5
mud-brick: 5
drums: 5
animism: 5

// First real unlocks: target 8-12 turns at 1 science/turn
archery: 10
bronze-working: 10
pottery: 10
animal-husbandry: 12
writing: 10
wheel: 10
code-of-laws: 10
cartography: 10
sailing: 10
domestication: 10
granary-design: 10
bone-setting: 10
midwifery: 10
mythology: 10
rhetoric: 10
storytelling: 10
fishing: 10
smelting: 10
thatching: 10
foundations: 10
smoke-signals: 10
burial-rites: 10
```

Do not change `espionage-scouting`, `lookouts`, `early-empire`, prerequisites, IDs, unlock text, era values, or track values in this task.

- [ ] **Step 4: Run data and player-visible ETA tests and verify retune passes**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts tests/integration/pacing-simulation.test.ts tests/ui/tech-panel.test.ts
```

Expected: PASS. Bronze Working baseline completes in 10 turns and science-invested completes in 5 turns.

- [ ] **Step 5: Update the pre-retune audit test expectations**

The Task 2 tests must now become green post-retune regressions.

In `reports research profile and live baseline fields for tech rows`, replace the live-baseline assertions with:

```ts
    expect(bronze?.liveBaselineTurns).toBe(bronze?.estimatedTurns);
    expect(bronze?.liveBaselineTurns).toBeGreaterThanOrEqual(9);
    expect(bronze?.liveBaselineTurns).toBeLessThanOrEqual(11);
```

Replace `flags current Bronze Working as a slow opening outlier before the retune` with:

```ts
  it('keeps retuned Bronze Working inside its opening target window', () => {
    const bronze = buildPacingAudit().find(row => row.id === 'bronze-working');

    expect(bronze?.estimatedTurns).toBeGreaterThanOrEqual(9);
    expect(bronze?.estimatedTurns).toBeLessThanOrEqual(11);
    expect(bronze?.target).toEqual({ min: 9, max: 11 });
    expect(bronze?.outlier).toBe(false);
    expect(bronze?.outlierReason).toBe('Within target window');
  });
```

Also append this audit regression:

```ts
  it('has no slow tech outliers among opening-baseline tech rows after retune', () => {
    const slowOutliers = buildPacingAudit()
      .filter(row => row.contentType === 'tech')
      .filter(row => row.researchProfile === 'opening-baseline')
      .filter(row => row.estimatedTurns > row.target.max)
      .map(row => `${row.id}:${row.estimatedTurns}/${row.target.max}`);

    expect(slowOutliers).toEqual([]);
  });
```

- [ ] **Step 6: Run all Task 4 targeted tests again**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts tests/integration/pacing-simulation.test.ts tests/ui/tech-panel.test.ts tests/systems/pacing-audit.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Tasks 3 and 4 together**

Run:

```bash
git add src/systems/tech-definitions.ts tests/systems/tech-definitions.test.ts tests/integration/pacing-simulation.test.ts tests/ui/tech-panel.test.ts tests/systems/pacing-audit.test.ts
git commit -m "fix(pacing): retune opening research costs"
```

---

### Task 5: Final Verification And Regression Audit

**Files:**
- Verify: `src/systems/pacing-model.ts`
- Verify: `src/systems/pacing-audit.ts`
- Verify: `src/systems/tech-definitions.ts`
- Verify: `tests/systems/pacing-model.test.ts`
- Verify: `tests/systems/pacing-audit.test.ts`
- Verify: `tests/systems/tech-definitions.test.ts`
- Verify: `tests/integration/pacing-simulation.test.ts`
- Verify: `tests/ui/tech-panel.test.ts`
- Verify: `docs/superpowers/plans/2026-05-14-tech-research-pacing.md`

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/pacing-model.ts src/systems/pacing-audit.ts src/systems/tech-definitions.ts
```

Expected: PASS with no rule violation output.

- [ ] **Step 2: Run mirrored and targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts tests/systems/tech-definitions.test.ts tests/integration/pacing-simulation.test.ts tests/ui/tech-panel.test.ts tests/systems/tech-progression.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build for TypeScript validation**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. This command runs `tsc` and Vite production build.

- [ ] **Step 4: Inspect committed and uncommitted diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- docs/superpowers/plans/2026-05-14-tech-research-pacing.md src/systems/pacing-model.ts src/systems/pacing-audit.ts src/systems/tech-definitions.ts tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts tests/systems/tech-definitions.test.ts tests/integration/pacing-simulation.test.ts tests/ui/tech-panel.test.ts
```

Expected:

- Branch diff includes this plan file plus only planned source and test files.
- Uncommitted diff is empty.
- Full diff shows no changes to tech IDs, prerequisites, unlock behavior, turn processing, save format, or research queue semantics.

- [ ] **Step 5: Commit any verification-only cleanup**

If Step 4 shows a small fix was needed, run targeted tests again and commit it:

```bash
git add docs/superpowers/plans/2026-05-14-tech-research-pacing.md src/systems/pacing-model.ts src/systems/pacing-audit.ts src/systems/tech-definitions.ts tests/systems/pacing-model.test.ts tests/systems/pacing-audit.test.ts tests/systems/tech-definitions.test.ts tests/integration/pacing-simulation.test.ts tests/ui/tech-panel.test.ts
git commit -m "test(pacing): lock research pacing regressions"
```

If Step 4 shows no changes, do not create an empty commit.

## Self-Review Checklist

### Spec Coverage

- Intent and root cause: Task 1 and Task 2 model/audit fix raw cost divided by live science.
- Player baseline targets: Task 3 and Task 4 verify Bronze Working 9-11 turns and starter prerequisites 2-5 turns.
- Science-investment target: Task 3 verifies Bronze Working 5-7 turns with idle production converted to science.
- Structural first-real-unlock definition: Task 1 tests helper membership; Task 4 tests inclusion and exclusion spot checks.
- Specialized root protection: Task 1 and Task 4 test Espionage Scouting and Lookouts stay out of starter/first-unlock flattening.
- Specialized profile protection: Task 1 verifies non-starter Era 1 espionage techs use the established profile instead of the opening baseline profile.
- Audit contract: Task 2 adds profile/live-baseline audit fields; Task 4 proves no slow opening tech outliers after retune.
- UI contract: Task 3 verifies visible tech panel ETA from live science and actual `Tech.cost`.
- Boundaries: Task 5 diff inspection checks no turn-processing, save, prerequisite, queue, or hidden multiplier changes.

### Placeholder Scan

A placeholder scan was run. No incomplete-marker text, vague test instructions, or references to functions outside the Task 1 definitions remain.

### Type Consistency

Planned exported names are consistent across tasks:

- `ResearchOutputProfile`
- `MetadataComplexityOptions`
- `OPENING_SCIENCE_INVESTED_PROFILE`
- `getResearchOutputProfileForEra`
- `getResearchOutputProfileForTech`
- `isStarterPrerequisiteTech`
- `isFirstRealUnlockTech`
- `getRecommendedTechTurnWindow`
- `getMetadataComplexityMultiplier`
- `getRecommendedTechCost`

Planned audit fields are consistent across tasks:

- `researchProfile?: ResearchOutputProfile['name']`
- `liveBaselineTurns?: number`
