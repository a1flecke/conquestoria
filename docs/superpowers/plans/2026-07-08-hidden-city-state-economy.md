# Hidden City-State Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repo forbids subagents in `CLAUDE.md`, so do not use subagent-driven execution even if a generic skill recommends it.

**Goal:** Implement issue #490 by giving active city-states a hidden, production-backed economy that grows, queues safe buildings/units, mobilizes under threat, stays viewer-safe, and composes with existing regional grievance, coalition, reparations, quest, save, solo, hot-seat, web/PWA, and Tauri paths.

**Architecture:** Add a focused `minor-civ-economy-system.ts` that normalizes economy metadata, derives minor-civ-safe tech/resources, selects one legal queue item, processes real city production through existing `processCity`, handles minor-civ unit completion, and exposes viewer-safe presentation summaries. Integrate it from `processMinorCivTurn` before minor-civ planning/movement while changing regional grievance processing to provide a shared mobilization budget instead of independently spawning extra defenders in the same turn.

**Tech Stack:** TypeScript, Vite, Vitest, DOM/CSS UI, existing `EventBus`, existing `processCity`, existing minor-civ coalition/grievance helpers, existing save normalization in `src/storage/save-manager.ts`.

---

## Target Agent

This plan is written for a Sonnet 4.5 coding agent. Keep the spec and this plan open while working. Do not infer missing gameplay rules from taste; implement the exact contracts here and in `docs/superpowers/specs/2026-07-07-hidden-city-state-economy-design.md`.

## Spec And Rule References

- Spec: `docs/superpowers/specs/2026-07-07-hidden-city-state-economy-design.md`
- Existing related plan: `docs/superpowers/plans/2026-07-07-minor-civ-regional-grievance-mobilization.md`
- Rules to keep open:
  - `CLAUDE.md`
  - `.claude/rules/game-systems.md`
  - `.claude/rules/strategy-game-mechanics.md`
  - `.claude/rules/end-to-end-wiring.md`
  - `.claude/rules/ui-panels.md`
  - `.claude/rules/spec-fidelity.md`
  - `.claude/rules/incremental-mr-completion.md`
  - `docs/superpowers/plans/README.md`

## Concrete Tuning For This Implementation

Use these exact first-pass values. Adjusting them is a balance follow-up, not part of this implementation.

```ts
export const MINOR_CIV_ECONOMY_TUNING = {
  explorer: {
    productionMultiplier: 0.75,
    queueDecisionInterval: 5,
    caps: { settled: 1, fortifying: 2, mobilizing: 3, recovering: 1 },
    recoveryTurns: 8,
    pendingSpawnMaxAttempts: 3,
  },
  standard: {
    productionMultiplier: 1,
    queueDecisionInterval: 4,
    caps: { settled: 2, fortifying: 3, mobilizing: 4, recovering: 2 },
    recoveryTurns: 6,
    pendingSpawnMaxAttempts: 3,
  },
  veteran: {
    productionMultiplier: 1.15,
    queueDecisionInterval: 3,
    caps: { settled: 2, fortifying: 4, mobilizing: 5, recovering: 2 },
    recoveryTurns: 5,
    pendingSpawnMaxAttempts: 4,
  },
} as const;
```

- Militaristic city-states get `+1` cap only while `fortifying` or `mobilizing`.
- Cultural city-states use the table cap unchanged and prefer culture/science buildings over extra peaceful units.
- Mercantile city-states use the table cap unchanged and prefer gold/economy buildings before peaceful units.
- `fortifying` is the default response to regional grievance status `wary`.
- `mobilizing` is the response to direct war, immediate city threat, regional grievance status `mobilizing` or `coalition-talks`, or an active/forming coalition involving the city-state.
- `recovering` applies while `economy.localRecoveryUntilTurn > state.turn` or a relevant regional grievance has `recoveryStrainedUntilTurn > state.turn`.
- Early-game force projection remains local: do not widen `MINOR_OPERATIONAL_RADIUS`.

## Files And Responsibilities

- Modify `src/core/types.ts`: add `MinorCivPosture`, `MinorCivPolicy`, `MinorCivEconomyState`, optional `MinorCivState.economy`, and `minor-civ:production-completed` event.
- Create `src/systems/minor-civ-economy-system.ts`: economy normalization, tech/resource helpers, candidate filtering/scoring, posture evaluation, unit caps, pending spawn handling, `processMinorCivEconomyTurn`, and viewer-safe presentation helper.
- Modify `src/systems/minor-civ-coalition-system.ts`: expose a mobilization-budget helper and add an option to process regional grievance without direct defender spawning.
- Modify `src/systems/minor-civ-system.ts`: call regional grievance pressure processing without direct spawns, process the hidden economy, then run planning/movement/combat/quests/alliance/garrison/relationship logic.
- Modify `src/storage/save-manager.ts`: normalize minor-civ economy state after quest and coalition normalization, without emitting events or creating units.
- Modify `src/systems/minor-civ-presentation.ts`: compose economy presentation with existing known/unknown masking.
- Modify `src/ui/minor-civ-notifications.ts`: add production/mobilization notification drafts with viewer-safe text.
- Modify `src/ui/minor-civ-notification-listeners.ts`: route `minor-civ:production-completed` to eligible solo and hot-seat viewers.
- Modify `src/ui/diplomacy-panel.ts`: render broad economy posture with regional grievance as one coherent block, remove exact pressure leakage, and keep gift/festival/reparations/war actions reachable.
- Tests:
  - `tests/systems/minor-civ-economy-system.test.ts`
  - `tests/systems/minor-civ-system.test.ts`
  - `tests/systems/minor-civ-presentation.test.ts`
  - `tests/storage/save-persistence.test.ts`
  - `tests/ui/minor-civ-notifications.test.ts`
  - `tests/ui/minor-civ-notification-listeners.test.ts`
  - `tests/ui/diplomacy-panel.test.ts`

## Player Truth Table

| Before | Action | Internal State | Immediate Visible Result |
|---|---|---|---|
| Discovered peaceful city-state row shows relationship, quest, gift, festival, war/peace actions | Advance turns until the hidden economy completes a safe building | City-state city gains the building and `economy.recentProductionSummary` records a building class | No raw queue or ETA appears; row can show broad `Quiet` or `Prosperous`; existing actions remain reachable |
| Discovered city-state has regional grievance `wary` | Open diplomacy | Economy posture resolves to `fortifying` through shared presentation | Row shows one coherent warning such as `Regional grievance: Wary · Fortifying`, without exact pressure numbers |
| City-state is mobilizing and completes a unit | End turn | Unit is added to `state.units` and `mc.units`, with `movementPointsLeft = 0`, `hasMoved = true`, and `hasActed = true` | Eligible viewer may receive a broad warning; no same-turn hidden attack occurs |
| Production completes while city and adjacent tiles are occupied | End turn | `economy.pendingUnitSpawn` stores the completed unit and no unit is created | No notification claims a unit exists; next turn retries if a legal tile opens |
| Hot-seat player A knows Sparta; player B does not | Economy event fires for Sparta | Event routes by viewer eligibility | Player A gets pending/log notification; player B gets no name, color, location, posture, or queue hint |
| Solo player has not discovered Sparta | Economy event fires for Sparta | Event exists in hidden state only | No notification/log text leaks Sparta or the event |
| Player pays reparations from an open diplomacy panel | Click `Pay Reparations` | Regional pressure cools; economy posture recomputes from the cooled grievance | Open panel rerenders; exact pressure is still hidden; reparations cannot be double-clicked from stale DOM |

## Misleading UI Risks

- `Mobilizing` must not appear after reparations if the shared regional grievance helper has cooled the pressure below mobilization.
- `Prosperous` must not imply exact queue details. It means recent building/economy completion or peaceful growth only.
- `Training defenders` must not appear for a blocked `pendingUnitSpawn`; use `Recovering` or no production hint until a unit actually exists.
- Exact hidden pressure values such as `(55)` must not render in `diplomacy-panel.ts`.
- Undiscovered city-state names, colors, map targets, and production classes must not render in notifications or diplomacy rows.
- A default focused economy hint must not remove gift, festival, reparations, or war/peace actions.

## Interaction Replay Checklist

- Open diplomacy with a discovered city-state in `wary` regional grievance.
- Pay reparations once and assert panel rerenders with cooled posture.
- Repeat-click the old reparations button reference and assert gold is not deducted twice.
- Reopen diplomacy and assert broad posture persists without exact pressure.
- Open hot-seat as another current player and assert hidden city-state economy details do not leak.
- Trigger a production-completed notification in solo and assert undiscovered city-states remain silent.

## Queue And ETA Checklist

This implementation does not add a player-visible production queue for city-states. The hidden queue lives on the existing `City.productionQueue`, but the player sees only broad posture and coarse production class hints when visibility allows it. Tests must assert that exact queue item ids and ETA text are not rendered.

## Task 1: Types, Save Normalization, And Event Skeleton

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/minor-civ-economy-system.ts`
- Modify: `src/storage/save-manager.ts`
- Test: `tests/storage/save-persistence.test.ts`
- Test: `tests/systems/minor-civ-economy-system.test.ts`

- [ ] **Step 1: Write failing type/normalization tests**

Add to `tests/storage/save-persistence.test.ts`:

```ts
it('normalizes missing hidden minor-civ economy state after coalition state', () => {
  const state = createNewGame(undefined, 'minor-economy-legacy', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  delete (minorCiv as any).economy;
  minorCiv.regionalGrievanceByCiv = {
    player: {
      targetCivId: 'player',
      pressure: 55,
      status: 'mobilizing',
      lastUpdatedTurn: state.turn,
      causes: [],
      mobilizationProgress: 12,
    },
  };

  const loaded = normalizeLoadedStateForTest(state);

  expect(loaded.minorCivs[minorCiv.id].economy).toMatchObject({
    policy: 'balanced',
    posture: 'settled',
    lastProcessedTurn: Math.max(0, state.turn - 1),
  });
  expect(loaded.minorCivs[minorCiv.id].regionalGrievanceByCiv?.player).toMatchObject({
    pressure: 55,
    status: 'mobilizing',
    mobilizationProgress: 12,
  });
});

it('drops malformed pending minor-civ economy spawns without creating units on load', () => {
  const state = createNewGame(undefined, 'minor-economy-bad-pending', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const unitCountBefore = Object.keys(state.units).length;
  (minorCiv as any).economy = {
    policy: 'balanced',
    posture: 'settled',
    lastProcessedTurn: state.turn,
    pendingUnitSpawn: { unitType: 'settler', completedTurn: 'bad', attempts: -1 },
  };

  const loaded = normalizeLoadedStateForTest(state);

  expect(loaded.minorCivs[minorCiv.id].economy?.pendingUnitSpawn).toBeUndefined();
  expect(Object.keys(loaded.units)).toHaveLength(unitCountBefore);
});
```

Create `tests/systems/minor-civ-economy-system.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { normalizeMinorCivEconomyState } from '@/systems/minor-civ-economy-system';

describe('minor-civ economy normalization', () => {
  it('does not change city queue, production progress, units, or regional grievance', () => {
    const state = createNewGame(undefined, 'minor-economy-normalize-system', 'small');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    const city = state.cities[minorCiv.cityId];
    city.productionQueue = ['walls'];
    city.productionProgress = 7;
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 45,
        status: 'mobilizing',
        lastUpdatedTurn: state.turn,
        causes: [],
      },
    };
    const beforeUnits = structuredClone(state.units);

    const result = normalizeMinorCivEconomyState(state);

    expect(result.cities[city.id].productionQueue).toEqual(['walls']);
    expect(result.cities[city.id].productionProgress).toBe(7);
    expect(result.units).toEqual(beforeUnits);
    expect(result.minorCivs[minorCiv.id].regionalGrievanceByCiv).toEqual(minorCiv.regionalGrievanceByCiv);
    expect(result.minorCivs[minorCiv.id].economy).toMatchObject({ policy: 'balanced', posture: 'settled' });
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/systems/minor-civ-economy-system.test.ts`

Expected: FAIL because `normalizeMinorCivEconomyState` and `MinorCivState.economy` do not exist.

- [ ] **Step 3: Add types and event**

In `src/core/types.ts`, add near the existing minor-civ types:

```ts
export type MinorCivPosture = 'settled' | 'fortifying' | 'mobilizing' | 'recovering';
export type MinorCivPolicy = 'balanced' | 'defense' | 'economy' | 'knowledge' | 'recovery';

export interface MinorCivEconomyState {
  policy: MinorCivPolicy;
  posture: MinorCivPosture;
  lastProcessedTurn: number;
  lastPostureChangeTurn?: number;
  localRecoveryUntilTurn?: number;
  lastQueueDecisionTurn?: number;
  pendingUnitSpawn?: {
    unitType: UnitType;
    completedTurn: number;
    attempts: number;
  };
  recentProductionSummary?: {
    itemId: string;
    itemClass: 'building' | 'unit' | 'idle';
    completedTurn: number;
  };
}
```

Add `economy?: MinorCivEconomyState;` to `MinorCivState`.

Add this event to `GameEvents` near the other `minor-civ:*` events:

```ts
'minor-civ:production-completed': {
  minorCivId: string;
  cityId: string;
  itemId: string;
  itemClass: 'building' | 'unit';
  state?: GameState;
};
```

- [ ] **Step 4: Implement normalization skeleton**

Create `src/systems/minor-civ-economy-system.ts`:

```ts
import type { GameState, MinorCivEconomyState, MinorCivPolicy, MinorCivPosture, UnitType } from '@/core/types';
import { TRAINABLE_UNITS } from '@/systems/city-system';

const POLICIES = new Set<MinorCivPolicy>(['balanced', 'defense', 'economy', 'knowledge', 'recovery']);
const POSTURES = new Set<MinorCivPosture>(['settled', 'fortifying', 'mobilizing', 'recovering']);
const SAFE_UNIT_TYPES = new Set<UnitType>(TRAINABLE_UNITS.map(unit => unit.type));

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizePendingSpawn(value: unknown, completedTurnFallback: number): MinorCivEconomyState['pendingUnitSpawn'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.unitType !== 'string') return undefined;
  if (!SAFE_UNIT_TYPES.has(record.unitType as UnitType)) return undefined;
  if (!isFiniteNonNegative(record.completedTurn)) return undefined;
  if (!isFiniteNonNegative(record.attempts)) return undefined;
  if (record.completedTurn > completedTurnFallback) return undefined;
  return {
    unitType: record.unitType as UnitType,
    completedTurn: record.completedTurn,
    attempts: record.attempts,
  };
}

export function createDefaultMinorCivEconomyState(state: Pick<GameState, 'turn'>): MinorCivEconomyState {
  return {
    policy: 'balanced',
    posture: 'settled',
    lastProcessedTurn: Math.max(0, state.turn - 1),
  };
}

function normalizeEconomy(value: unknown, state: Pick<GameState, 'turn'>): MinorCivEconomyState {
  const defaults = createDefaultMinorCivEconomyState(state);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaults;
  const record = value as Record<string, unknown>;
  const economy: MinorCivEconomyState = {
    policy: typeof record.policy === 'string' && POLICIES.has(record.policy as MinorCivPolicy)
      ? record.policy as MinorCivPolicy
      : defaults.policy,
    posture: typeof record.posture === 'string' && POSTURES.has(record.posture as MinorCivPosture)
      ? record.posture as MinorCivPosture
      : defaults.posture,
    lastProcessedTurn: isFiniteNonNegative(record.lastProcessedTurn)
      ? record.lastProcessedTurn
      : defaults.lastProcessedTurn,
  };
  if (isFiniteNonNegative(record.lastPostureChangeTurn)) economy.lastPostureChangeTurn = record.lastPostureChangeTurn;
  if (isFiniteNonNegative(record.localRecoveryUntilTurn)) economy.localRecoveryUntilTurn = record.localRecoveryUntilTurn;
  if (isFiniteNonNegative(record.lastQueueDecisionTurn)) economy.lastQueueDecisionTurn = record.lastQueueDecisionTurn;
  const pending = normalizePendingSpawn(record.pendingUnitSpawn, state.turn);
  if (pending) economy.pendingUnitSpawn = pending;
  if (typeof record.recentProductionSummary === 'object' && record.recentProductionSummary !== null && !Array.isArray(record.recentProductionSummary)) {
    const summary = record.recentProductionSummary as Record<string, unknown>;
    if (
      typeof summary.itemId === 'string'
      && (summary.itemClass === 'building' || summary.itemClass === 'unit' || summary.itemClass === 'idle')
      && isFiniteNonNegative(summary.completedTurn)
    ) {
      economy.recentProductionSummary = {
        itemId: summary.itemId,
        itemClass: summary.itemClass,
        completedTurn: summary.completedTurn,
      };
    }
  }
  return economy;
}

export function normalizeMinorCivEconomyState(state: GameState): GameState {
  const minorCivs = { ...(state.minorCivs ?? {}) };
  for (const [minorCivId, minorCiv] of Object.entries(minorCivs)) {
    if (minorCiv.isDestroyed) {
      minorCivs[minorCivId] = { ...minorCiv, economy: normalizeEconomy(minorCiv.economy, state) };
      continue;
    }
    minorCivs[minorCivId] = { ...minorCiv, economy: normalizeEconomy(minorCiv.economy, state) };
  }
  return { ...state, minorCivs };
}
```

- [ ] **Step 5: Wire save normalization**

In `src/storage/save-manager.ts`, import:

```ts
import { normalizeMinorCivEconomyState } from '@/systems/minor-civ-economy-system';
```

Wrap the current quest/coalition normalization so economy runs after coalition state and before pirate migration:

```ts
const normalizedCityState = migrateLegacyPirateFleets(normalizeMinorCivEconomyState(normalizeMinorCivCoalitionState(normalizeMinorCivQuestState(
  migrateLegacyCoastalData(normalizeThreatPressureDefaults(normalizeLandmassKeys(normalizeLegacyCitySimState(migrateStripCityGrid(migrateLegacyPlanningState(migrateLegacyNamingState(ensureGameIdentity(state)))))))),
))));
```

- [ ] **Step 6: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/systems/minor-civ-economy-system.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/minor-civ-economy-system.ts src/storage/save-manager.ts tests/storage/save-persistence.test.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "feat: normalize hidden city-state economy state"
```

## Task 2: Minor-Civ-Safe Tech, Resource, Candidate, And Posture Helpers

**Files:**
- Modify: `src/systems/minor-civ-economy-system.ts`
- Test: `tests/systems/minor-civ-economy-system.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add to `tests/systems/minor-civ-economy-system.test.ts`:

```ts
import {
  chooseMinorCivQueueItem,
  evaluateMinorCivEconomyPosture,
  getMinorCivAvailableResources,
  getMinorCivBuildCandidates,
  getMinorCivCompletedTechBand,
  getMinorCivUnitCap,
} from '@/systems/minor-civ-economy-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { hexKey } from '@/systems/hex-utils';

it('derives minor-civ tech bands by era without needing a Civilization record', () => {
  const state = createNewGame(undefined, 'minor-economy-tech-band', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  state.era = 2;

  const techs = getMinorCivCompletedTechBand(state, minorCiv.id);

  expect(state.civilizations[minorCiv.id]).toBeUndefined();
  expect(techs).toContain('bronze-working');
  expect(techs.every(techId => typeof techId === 'string')).toBe(true);
});

it('reads city-state resources from owned improved tiles and does not use major-civ resource lookup', () => {
  const state = createNewGame(undefined, 'minor-economy-resource-band', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  const resourceTile = city.ownedTiles.find(coord => hexKey(coord) !== hexKey(city.position)) ?? city.position;
  const key = hexKey(resourceTile);
  state.map.tiles[key] = {
    ...state.map.tiles[key],
    owner: minorCiv.id,
    resource: 'copper',
    improvement: 'mine',
    improvementTurnsLeft: 0,
  };
  state.era = 1;

  expect(getCivAvailableResources(state, minorCiv.id).has('copper')).toBe(false);
  expect(getMinorCivAvailableResources(state, minorCiv.id).has('copper')).toBe(true);
});

it('does not reveal resource-gated candidates before the era band reveals their resource', () => {
  const state = createNewGame(undefined, 'minor-economy-resource-negative', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  state.era = 1;
  state.map.tiles[hexKey(city.position)] = {
    ...state.map.tiles[hexKey(city.position)],
    owner: minorCiv.id,
    resource: 'iron',
  };

  const candidates = getMinorCivBuildCandidates(state, minorCiv.id);

  expect(candidates.units.map(unit => unit.type)).not.toContain('swordsman');
});

it('filters city-state unsafe candidates', () => {
  const state = createNewGame(undefined, 'minor-economy-safe-candidates', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;

  const candidates = getMinorCivBuildCandidates(state, minorCiv.id);
  const ids = [...candidates.buildings.map(building => building.id), ...candidates.units.map(unit => unit.type)];

  expect(ids).not.toContain('settler');
  expect(ids).not.toContain('worker');
  expect(ids).not.toContain('spy_scout');
  expect(ids).not.toContain('caravan');
  expect(candidates.buildings.every(building => !building.nationalProject && !building.uniquePerEmpire)).toBe(true);
});

it('maps regional grievance and recovery strain into economy posture', () => {
  const state = createNewGame(undefined, 'minor-economy-posture', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  minorCiv.regionalGrievanceByCiv = {
    player: {
      targetCivId: 'player',
      pressure: 50,
      status: 'mobilizing',
      lastUpdatedTurn: state.turn,
      recoveryStrainedUntilTurn: state.turn + 3,
      causes: [],
    },
  };

  expect(evaluateMinorCivEconomyPosture(state, minorCiv.id)).toBe('recovering');
});

it('uses challenge, posture, and archetype for unit caps', () => {
  const state = createNewGame(undefined, 'minor-economy-caps', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  minorCiv.definitionId = 'sparta';
  state.opponentChallenge = 'veteran';

  expect(getMinorCivUnitCap(state, minorCiv.id, 'mobilizing')).toBe(6);
});

it('chooses a deterministic single queue item', () => {
  const state = createNewGame(undefined, 'minor-economy-queue-choice', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  state.minorCivs[minorCiv.id].economy = { policy: 'defense', posture: 'fortifying', lastProcessedTurn: 0 };

  expect(chooseMinorCivQueueItem(state, minorCiv.id)).toEqual(chooseMinorCivQueueItem(state, minorCiv.id));
});

it('treats low cooled wary pressure as settled when no local threat exists', () => {
  const state = createNewGame(undefined, 'minor-economy-cooled-wary', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  minorCiv.regionalGrievanceByCiv = {
    player: {
      targetCivId: 'player',
      pressure: 5,
      status: 'wary',
      lastUpdatedTurn: state.turn,
      causes: [],
    },
  };

  expect(evaluateMinorCivEconomyPosture(state, minorCiv.id)).toBe('settled');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts`

Expected: FAIL because the helper functions do not exist.

- [ ] **Step 3: Implement helper exports**

In `src/systems/minor-civ-economy-system.ts`, extend imports:

```ts
import type { Building, MinorCivArchetype, ResourceType, TrainableUnitEntry } from '@/core/types';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import { getAvailableBuildings, getTrainableUnitsForCity } from '@/systems/city-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { TECH_TREE } from '@/systems/tech-definitions';
import { hexKey, hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
```

Add these helpers:

```ts
export const MINOR_CIV_ECONOMY_TUNING = {
  explorer: {
    productionMultiplier: 0.75,
    queueDecisionInterval: 5,
    caps: { settled: 1, fortifying: 2, mobilizing: 3, recovering: 1 },
    recoveryTurns: 8,
    pendingSpawnMaxAttempts: 3,
  },
  standard: {
    productionMultiplier: 1,
    queueDecisionInterval: 4,
    caps: { settled: 2, fortifying: 3, mobilizing: 4, recovering: 2 },
    recoveryTurns: 6,
    pendingSpawnMaxAttempts: 3,
  },
  veteran: {
    productionMultiplier: 1.15,
    queueDecisionInterval: 3,
    caps: { settled: 2, fortifying: 4, mobilizing: 5, recovering: 2 },
    recoveryTurns: 5,
    pendingSpawnMaxAttempts: 4,
  },
} as const;

const UNSAFE_UNIT_TYPES = new Set<UnitType>([
  'settler',
  'worker',
  'spy_scout',
  'spy_informant',
  'spy_agent',
  'spy_operative',
  'spy_hacker',
  'caravan',
  'transport',
  'troop_transport',
]);
const UNSAFE_BUILDING_IDS = new Set<string>();

function getMinorCivDefinition(minorCivId: string, state: GameState) {
  const minorCiv = state.minorCivs[minorCivId];
  return minorCiv ? MINOR_CIV_DEFINITIONS.find(definition => definition.id === minorCiv.definitionId) : undefined;
}

function distance(state: GameState, left: { q: number; r: number }, right: { q: number; r: number }): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(left, right, state.map.width) : hexDistance(left, right);
}

export function getMinorCivCompletedTechBand(state: GameState, minorCivId: string): string[] {
  if (!state.minorCivs[minorCivId]) return [];
  return TECH_TREE
    .filter(tech => tech.era <= state.era)
    .map(tech => tech.id)
    .sort();
}

export function getMinorCivAvailableResources(state: GameState, minorCivId: string): Set<ResourceType> {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !city) return new Set();
  const completedTechs = new Set(getMinorCivCompletedTechBand(state, minorCivId));
  const definitions = new Map(RESOURCE_DEFINITIONS.map(definition => [definition.id, definition]));
  const resources = new Set<ResourceType>();
  const cityKey = hexKey(city.position);
  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    const tile = state.map.tiles[key];
    if (!tile?.resource) continue;
    const definition = definitions.get(tile.resource as ResourceType);
    if (!definition || !completedTechs.has(definition.tech)) continue;
    if (key === cityKey) {
      resources.add(tile.resource as ResourceType);
      continue;
    }
    if (tile.improvement === definition.requiredImprovement && tile.improvementTurnsLeft === 0) {
      resources.add(tile.resource as ResourceType);
    }
  }
  return resources;
}

export function getMinorCivBuildCandidates(state: GameState, minorCivId: string): { buildings: Building[]; units: TrainableUnitEntry[] } {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !city || city.owner !== minorCiv.id || minorCiv.isDestroyed) {
    return { buildings: [], units: [] };
  }
  const completedTechs = getMinorCivCompletedTechBand(state, minorCivId);
  const resources = getMinorCivAvailableResources(state, minorCivId);
  const buildings = getAvailableBuildings(city, completedTechs, state.map, resources, state.era)
    .filter(building => !building.nationalProject && !building.uniquePerEmpire && !UNSAFE_BUILDING_IDS.has(building.id));
  const units = getTrainableUnitsForCity(city, completedTechs, state.map, undefined, resources)
    .filter(unit => !UNSAFE_UNIT_TYPES.has(unit.type));
  return { buildings, units };
}

function hasImmediateCityThreat(state: GameState, minorCivId: string): boolean {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !city) return false;
  return Object.values(state.units).some(unit => (
    unit.owner !== minorCiv.id
    && !unit.transportId
    && distance(state, city.position, unit.position) <= 2
    && (minorCiv.diplomacy.atWarWith.includes(unit.owner) || unit.owner === 'barbarian')
  ));
}

export function evaluateMinorCivEconomyPosture(state: GameState, minorCivId: string): MinorCivPosture {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv || minorCiv.isDestroyed) return 'settled';
  const economy = minorCiv.economy;
  if ((economy?.localRecoveryUntilTurn ?? 0) > state.turn) return 'recovering';
  const grievances = Object.values(minorCiv.regionalGrievanceByCiv ?? {});
  if (grievances.some(grievance => (grievance.recoveryStrainedUntilTurn ?? 0) > state.turn)) return 'recovering';
  if (minorCiv.diplomacy.atWarWith.length > 0 || hasImmediateCityThreat(state, minorCivId)) return 'mobilizing';
  if (grievances.some(grievance => grievance.status === 'mobilizing' || grievance.status === 'coalition-talks')) return 'mobilizing';
  if (Object.values(state.minorCivCoalitions ?? {}).some(coalition => coalition.memberIds.includes(minorCivId) && (coalition.status === 'forming' || coalition.status === 'active'))) return 'mobilizing';
  if (grievances.some(grievance => grievance.status === 'wary' && grievance.pressure >= 20) || minorCiv.units.filter(unitId => state.units[unitId]).length === 0) return 'fortifying';
  return 'settled';
}

export function getMinorCivUnitCap(state: GameState, minorCivId: string, posture: MinorCivPosture): number {
  const challenge = resolveOpponentChallenge(state);
  const tuning = MINOR_CIV_ECONOMY_TUNING[challenge];
  const definition = getMinorCivDefinition(minorCivId, state);
  const archetypeBonus = definition?.archetype === 'militaristic' && (posture === 'fortifying' || posture === 'mobilizing') ? 1 : 0;
  return Math.max(1, tuning.caps[posture] + archetypeBonus);
}
```

Add candidate scoring:

```ts
function scoreBuilding(building: Building, archetype: MinorCivArchetype | undefined, posture: MinorCivPosture): number {
  let score = 20;
  if (posture === 'fortifying' || posture === 'mobilizing') {
    if (building.id === 'walls' || building.id === 'barracks' || building.id === 'stable') score += 60;
  }
  if (archetype === 'mercantile' && (building.yields.gold > 0 || building.id === 'marketplace')) score += 35;
  if (archetype === 'cultural' && (building.yields.science > 0 || building.id === 'library' || building.id === 'temple' || building.id === 'monument')) score += 35;
  if (archetype === 'militaristic' && (building.id === 'walls' || building.id === 'barracks')) score += 35;
  score += building.yields.food * 3 + building.yields.production * 4 + building.yields.gold * 2 + building.yields.science * 2;
  return score;
}

function scoreUnit(unit: TrainableUnitEntry, archetype: MinorCivArchetype | undefined, posture: MinorCivPosture, currentUnits: number, cap: number): number {
  if (currentUnits >= cap) return -1;
  let score = posture === 'mobilizing' ? 90 : posture === 'fortifying' ? 60 : 15;
  if (archetype === 'militaristic') score += 20;
  if (unit.type === 'scout') score -= 20;
  return score;
}

export function chooseMinorCivQueueItem(state: GameState, minorCivId: string): string | null {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv) return null;
  const definition = getMinorCivDefinition(minorCivId, state);
  const posture = minorCiv.economy?.posture ?? evaluateMinorCivEconomyPosture(state, minorCivId);
  const cap = getMinorCivUnitCap(state, minorCivId, posture);
  const currentUnits = minorCiv.units.filter(unitId => Boolean(state.units[unitId])).length;
  const candidates = getMinorCivBuildCandidates(state, minorCivId);
  const scored = [
    ...candidates.buildings.map(building => ({ id: building.id, score: scoreBuilding(building, definition?.archetype, posture) })),
    ...candidates.units.map(unit => ({ id: unit.type, score: scoreUnit(unit, definition?.archetype, posture, currentUnits, cap) })),
  ].filter(candidate => candidate.score >= 0);
  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return scored[0]?.id ?? null;
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-economy-system.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "feat: add city-state economy candidate helpers"
```

## Task 3: Production Processing, Pending Spawns, And No Same-Turn Action

**Files:**
- Modify: `src/systems/minor-civ-economy-system.ts`
- Test: `tests/systems/minor-civ-economy-system.test.ts`

- [ ] **Step 1: Write failing production tests**

Add to `tests/systems/minor-civ-economy-system.test.ts`:

```ts
import { processMinorCivEconomyTurn } from '@/systems/minor-civ-economy-system';
import { createUnit } from '@/systems/unit-system';
import { getWrappedHexNeighbors, hexNeighbors } from '@/systems/hex-utils';

it('processes real city production and completes a minor-civ building', () => {
  const state = createNewGame(undefined, 'minor-economy-building', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  city.productionQueue = ['walls'];
  city.productionProgress = 999;
  minorCiv.economy = { policy: 'defense', posture: 'fortifying', lastProcessedTurn: 0 };

  const result = processMinorCivEconomyTurn(state, minorCiv.id);

  expect(result.state.cities[city.id].buildings).toContain('walls');
  expect(result.state.minorCivs[minorCiv.id].economy?.recentProductionSummary).toMatchObject({
    itemId: 'walls',
    itemClass: 'building',
    completedTurn: state.turn,
  });
});

it('completes a minor-civ unit into state.units and mc.units with no same-turn action', () => {
  const state = createNewGame(undefined, 'minor-economy-unit', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  city.productionQueue = ['warrior'];
  city.productionProgress = 999;
  minorCiv.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };
  const beforeUnitIds = new Set(Object.keys(state.units));

  const result = processMinorCivEconomyTurn(state, minorCiv.id);
  const newUnit = Object.values(result.state.units).find(unit => !beforeUnitIds.has(unit.id))!;

  expect(newUnit.owner).toBe(minorCiv.id);
  expect(result.state.minorCivs[minorCiv.id].units).toContain(newUnit.id);
  expect(newUnit.movementPointsLeft).toBe(0);
  expect(newUnit.hasMoved).toBe(true);
  expect(newUnit.hasActed).toBe(true);
});

it('stores pending unit spawn when city and adjacent tiles are occupied', () => {
  const state = createNewGame(undefined, 'minor-economy-pending-spawn', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  city.productionQueue = ['warrior'];
  city.productionProgress = 999;
  minorCiv.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };
  const adjacent = state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(city.position, state.map.width)
    : hexNeighbors(city.position);
  const occupied = [city.position, ...adjacent];
  occupied.forEach((coord, index) => {
    const blocker = createUnit('warrior', 'player', coord, state.idCounters);
    blocker.id = `spawn-blocker-${index}`;
    state.units[blocker.id] = blocker;
  });

  const result = processMinorCivEconomyTurn(state, minorCiv.id);

  expect(result.state.minorCivs[minorCiv.id].economy?.pendingUnitSpawn).toMatchObject({
    unitType: 'warrior',
    completedTurn: state.turn,
    attempts: 1,
  });
  expect(Object.values(result.state.units).filter(unit => unit.owner === minorCiv.id && unit.type === 'warrior')).toHaveLength(1);
});

it('retries pending spawns before adding more production progress and clears after creation', () => {
  const state = createNewGame(undefined, 'minor-economy-pending-retry', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  city.productionQueue = ['walls'];
  city.productionProgress = 0;
  minorCiv.economy = {
    policy: 'defense',
    posture: 'mobilizing',
    lastProcessedTurn: 0,
    pendingUnitSpawn: { unitType: 'warrior', completedTurn: state.turn - 1, attempts: 1 },
  };
  const beforeProgress = city.productionProgress;
  const beforeUnitIds = new Set(Object.keys(state.units));

  const result = processMinorCivEconomyTurn(state, minorCiv.id);
  const newUnit = Object.values(result.state.units).find(unit => !beforeUnitIds.has(unit.id))!;

  expect(newUnit.owner).toBe(minorCiv.id);
  expect(result.state.minorCivs[minorCiv.id].economy?.pendingUnitSpawn).toBeUndefined();
  expect(result.state.cities[city.id].productionProgress).toBe(beforeProgress);
});

it('does not process destroyed or captured city-states', () => {
  const state = createNewGame(undefined, 'minor-economy-captured-skip', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  city.owner = 'player';
  city.productionQueue = ['walls'];
  city.productionProgress = 999;

  const result = processMinorCivEconomyTurn(state, minorCiv.id);

  expect(result.state.cities[city.id].buildings).not.toContain('walls');
});

it('does not replace an active legal hidden queue item just because the decision interval elapsed', () => {
  const state = createNewGame(undefined, 'minor-economy-preserve-queue', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  city.productionQueue = ['walls'];
  city.productionProgress = 1;
  minorCiv.economy = {
    policy: 'balanced',
    posture: 'settled',
    lastProcessedTurn: 0,
    lastQueueDecisionTurn: 0,
  };
  state.turn = 20;

  const result = processMinorCivEconomyTurn(state, minorCiv.id);

  expect(result.state.cities[city.id].productionQueue[0]).toBe('walls');
  expect(result.state.cities[city.id].productionProgress).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts`

Expected: FAIL because `processMinorCivEconomyTurn` does not exist.

- [ ] **Step 3: Implement production processing**

In `src/systems/minor-civ-economy-system.ts`, add imports:

```ts
import type { EventBus } from '@/core/event-bus';
import { assignCityFocus, normalizeWorkedTilesForCity } from '@/systems/city-work-system';
import { processCity } from '@/systems/city-system';
import { calculateCityYields } from '@/systems/resource-system';
import { getWrappedHexNeighbors, hexNeighbors } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';
```

Add:

```ts
interface MinorCivEconomyTurnResult {
  state: GameState;
  completed?: {
    minorCivId: string;
    cityId: string;
    itemId: string;
    itemClass: 'building' | 'unit';
  };
}

function legalSpawnPositions(state: GameState, minorCivId: string): Array<{ q: number; r: number }> {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!city) return [];
  const occupied = new Set(Object.values(state.units).filter(unit => !unit.transportId).map(unit => hexKey(unit.position)));
  const adjacent = state.map.wrapsHorizontally ? getWrappedHexNeighbors(city.position, state.map.width) : hexNeighbors(city.position);
  return [city.position, ...adjacent]
    .filter(coord => {
      const tile = state.map.tiles[hexKey(coord)];
      return tile && tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain' && !occupied.has(hexKey(coord));
    })
    .sort((left, right) => left.q - right.q || left.r - right.r);
}

function createMinorCivUnit(state: GameState, minorCivId: string, unitType: UnitType): { state: GameState; created: boolean } {
  const position = legalSpawnPositions(state, minorCivId)[0];
  const minorCiv = state.minorCivs[minorCivId];
  if (!position || !minorCiv) return { state, created: false };
  const unit = createUnit(unitType, minorCivId, position, state.idCounters);
  unit.movementPointsLeft = 0;
  unit.hasMoved = true;
  unit.hasActed = true;
  return {
    state: {
      ...state,
      units: { ...state.units, [unit.id]: unit },
      minorCivs: {
        ...state.minorCivs,
        [minorCivId]: {
          ...minorCiv,
          units: [...minorCiv.units.filter(unitId => Boolean(state.units[unitId])), unit.id],
        },
      },
    },
    created: true,
  };
}

function updateMinorEconomy(state: GameState, minorCivId: string, patch: Partial<MinorCivEconomyState>): GameState {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv) return state;
  const economy = { ...(minorCiv.economy ?? createDefaultMinorCivEconomyState(state)), ...patch };
  return {
    ...state,
    minorCivs: {
      ...state.minorCivs,
      [minorCivId]: { ...minorCiv, economy },
    },
  };
}

function isMinorCivQueueHeadLegal(state: GameState, minorCivId: string, itemId: string | undefined): boolean {
  if (!itemId) return false;
  const candidates = getMinorCivBuildCandidates(state, minorCivId);
  return candidates.buildings.some(building => building.id === itemId)
    || candidates.units.some(unit => unit.type === itemId);
}
```

Implement:

```ts
export function processMinorCivEconomyTurn(state: GameState, minorCivId: string, bus?: EventBus): MinorCivEconomyTurnResult {
  let nextState = normalizeMinorCivEconomyState(state);
  const minorCiv = nextState.minorCivs[minorCivId];
  const city = minorCiv ? nextState.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || minorCiv.isDestroyed || !city || city.owner !== minorCiv.id) {
    return { state: nextState };
  }

  const tuning = MINOR_CIV_ECONOMY_TUNING[resolveOpponentChallenge(nextState)];
  const economy = minorCiv.economy ?? createDefaultMinorCivEconomyState(nextState);
  const pending = economy.pendingUnitSpawn;
  if (pending) {
    const spawned = createMinorCivUnit(nextState, minorCivId, pending.unitType);
    if (spawned.created) {
      nextState = updateMinorEconomy(spawned.state, minorCivId, { pendingUnitSpawn: undefined });
      return { state: nextState, completed: { minorCivId, cityId: city.id, itemId: pending.unitType, itemClass: 'unit' } };
    }
    const attempts = pending.attempts + 1;
    nextState = updateMinorEconomy(nextState, minorCivId, {
      pendingUnitSpawn: attempts > tuning.pendingSpawnMaxAttempts ? undefined : { ...pending, attempts },
    });
    return { state: nextState };
  }

  const posture = evaluateMinorCivEconomyPosture(nextState, minorCivId);
  const policy: MinorCivPolicy = posture === 'mobilizing' || posture === 'fortifying'
    ? 'defense'
    : posture === 'recovering' ? 'recovery' : 'balanced';
  const normalizedWork = city.workedTiles.length > city.population
    ? normalizeWorkedTilesForCity(nextState, city.id)
    : assignCityFocus(nextState, city.id, posture === 'recovering' ? 'food' : posture === 'mobilizing' ? 'production' : 'balanced');
  nextState = normalizedWork.state;

  const currentCity = nextState.cities[city.id];
  let queue = currentCity.productionQueue;
  let madeQueueDecision = false;
  const queueHeadLegal = isMinorCivQueueHeadLegal(nextState, minorCivId, queue[0]);
  const emptyQueueDecisionReady = queue.length === 0
    && (economy.lastQueueDecisionTurn ?? -999) + tuning.queueDecisionInterval <= nextState.turn;
  const invalidQueueHead = queue.length > 0 && !queueHeadLegal;
  if (emptyQueueDecisionReady || invalidQueueHead) {
    const chosen = chooseMinorCivQueueItem(nextState, minorCivId);
    queue = chosen ? [chosen] : [];
    madeQueueDecision = true;
    nextState = {
      ...nextState,
      cities: {
        ...nextState.cities,
        [city.id]: { ...currentCity, productionQueue: queue },
      },
    };
  }

  const completedTechs = getMinorCivCompletedTechBand(nextState, minorCivId);
  const availableResources = getMinorCivAvailableResources(nextState, minorCivId);
  const cityForYields = nextState.cities[city.id];
  const yields = calculateCityYields(cityForYields, nextState.map, undefined, completedTechs, {});
  const productionYield = Math.max(0, Math.floor(yields.production * tuning.productionMultiplier));
  const processed = processCity(cityForYields, nextState.map, yields.food, productionYield, undefined, completedTechs, undefined, nextState.era, availableResources);
  nextState = {
    ...nextState,
    cities: { ...nextState.cities, [city.id]: processed.city },
  };

  let completed: MinorCivEconomyTurnResult['completed'];
  if (processed.completedUnit) {
    const spawned = createMinorCivUnit(nextState, minorCivId, processed.completedUnit);
    if (spawned.created) {
      nextState = spawned.state;
      completed = { minorCivId, cityId: city.id, itemId: processed.completedUnit, itemClass: 'unit' };
    } else {
      nextState = updateMinorEconomy(nextState, minorCivId, {
        pendingUnitSpawn: { unitType: processed.completedUnit, completedTurn: nextState.turn, attempts: 1 },
      });
    }
  } else if (processed.completedBuilding) {
    completed = { minorCivId, cityId: city.id, itemId: processed.completedBuilding, itemClass: 'building' };
  }

  nextState = updateMinorEconomy(nextState, minorCivId, {
    posture,
    policy,
    lastProcessedTurn: nextState.turn,
    lastPostureChangeTurn: posture !== economy.posture ? nextState.turn : economy.lastPostureChangeTurn,
    lastQueueDecisionTurn: madeQueueDecision ? nextState.turn : economy.lastQueueDecisionTurn,
    recentProductionSummary: completed ? {
      itemId: completed.itemId,
      itemClass: completed.itemClass,
      completedTurn: nextState.turn,
    } : economy.recentProductionSummary,
  });

  if (completed) bus?.emit('minor-civ:production-completed', { ...completed, state: nextState });
  return { state: nextState, completed };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-economy-system.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "feat: process hidden city-state production"
```

## Task 4: Turn-Loop Integration And Shared Mobilization Budget

**Files:**
- Modify: `src/systems/minor-civ-coalition-system.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `src/systems/minor-civ-economy-system.ts`
- Test: `tests/systems/minor-civ-system.test.ts`
- Test: `tests/systems/minor-civ-economy-system.test.ts`

- [ ] **Step 1: Write failing integration tests**

Add to `tests/systems/minor-civ-system.test.ts`:

```ts
it('runs hidden economy before minor-civ planning so completed units cannot act same turn', () => {
  const state = createNewGame(undefined, 'minor-economy-turn-order', 'small');
  const mcId = Object.keys(state.minorCivs)[0]!;
  const mc = state.minorCivs[mcId];
  const city = state.cities[mc.cityId];
  city.productionQueue = ['warrior'];
  city.productionProgress = 999;
  mc.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };
  const beforeIds = new Set(Object.keys(state.units));

  const result = processMinorCivTurn(state, new EventBus());
  const created = Object.values(result.units).find(unit => !beforeIds.has(unit.id))!;

  expect(created.owner).toBe(mcId);
  expect(created.hasActed).toBe(true);
  expect(result.opponentAI?.minorCivs[mcId]?.assignedUnitIds).toContain(created.id);
});

it('does not spawn both economy defender and regional grievance defender in one minor-civ turn', () => {
  const state = createNewGame(undefined, 'minor-economy-no-double-spawn', 'small');
  state.era = 2;
  const mcId = Object.keys(state.minorCivs)[0]!;
  const mc = state.minorCivs[mcId];
  const city = state.cities[mc.cityId];
  city.population = 4;
  city.productionQueue = ['warrior'];
  city.productionProgress = 999;
  mc.regionalGrievanceByCiv = {
    player: {
      targetCivId: 'player',
      pressure: 90,
      status: 'coalition-talks',
      lastUpdatedTurn: state.turn,
      mobilizationProgress: 24,
      causes: [],
    },
  };
  const beforeMinorUnits = mc.units.filter(unitId => state.units[unitId]).length;

  const result = processMinorCivTurn(state, new EventBus());
  const afterMinorUnits = result.minorCivs[mcId].units.filter(unitId => result.units[unitId]).length;

  expect(afterMinorUnits - beforeMinorUnits).toBe(1);
});

it('production-backed defenders stay within local force projection', () => {
  const state = createNewGame(undefined, 'minor-economy-local-defense', 'small');
  const mcId = Object.keys(state.minorCivs)[0]!;
  const mc = state.minorCivs[mcId];
  const city = state.cities[mc.cityId];
  const distant = createUnit('warrior', 'barbarian', { q: city.position.q + 9, r: city.position.r }, state.idCounters);
  distant.id = 'distant-raider';
  state.units[distant.id] = distant;
  city.productionQueue = ['warrior'];
  city.productionProgress = 999;
  mc.economy = { policy: 'defense', posture: 'mobilizing', lastProcessedTurn: 0 };

  const result = processMinorCivTurn(state, new EventBus());

  expect(JSON.stringify(result.opponentAI?.minorCivs[mcId])).not.toContain('distant-raider');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-economy-system.test.ts`

Expected: FAIL because the turn loop does not call the economy and regional grievance still spawns independently.

- [ ] **Step 3: Add regional grievance spawn control and budget helper**

In `src/systems/minor-civ-coalition-system.ts`, add:

```ts
export interface MinorCivRegionalGrievanceTurnOptions {
  allowDefenderSpawns?: boolean;
}

export interface MinorCivMobilizationBudget {
  targetCivId: string | null;
  pressure: number;
  status: MinorCivRegionalGrievanceStatus | null;
  wantsDefender: boolean;
  allowsConscription: boolean;
  recoveryStrainedUntilTurn?: number;
  conscriptCooldownUntilTurn?: number;
}

export function getMinorCivMobilizationBudget(state: GameState, minorCivId: string): MinorCivMobilizationBudget {
  const minorCiv = state.minorCivs[minorCivId];
  const grievances = Object.values(minorCiv?.regionalGrievanceByCiv ?? {})
    .sort((left, right) => right.pressure - left.pressure || left.targetCivId.localeCompare(right.targetCivId));
  const top = grievances[0];
  const directWarTarget = minorCiv?.diplomacy.atWarWith.find(targetId => state.civilizations[targetId]);
  return {
    targetCivId: top?.targetCivId ?? directWarTarget ?? null,
    pressure: top?.pressure ?? 0,
    status: top?.status ?? null,
    wantsDefender: Boolean(top && (top.status === 'mobilizing' || top.status === 'coalition-talks')),
    allowsConscription: Boolean(top && (top.pressure >= CONSCRIPTION_PRESSURE || isDirectWarGrievance(state, minorCiv!, top.targetCivId))),
    recoveryStrainedUntilTurn: top?.recoveryStrainedUntilTurn,
    conscriptCooldownUntilTurn: top?.conscriptCooldownUntilTurn,
  };
}
```

Change the signature:

```ts
export function processMinorCivRegionalGrievanceTurn(
  state: GameState,
  minorCivId: string,
  options: MinorCivRegionalGrievanceTurnOptions = {},
): GameState {
  const allowDefenderSpawns = options.allowDefenderSpawns ?? true;
```

Wrap both `spawnRegionalDefender` branches with `allowDefenderSpawns`.

- [ ] **Step 4: Consume budget in economy without direct duplicate spawns**

In `src/systems/minor-civ-economy-system.ts`, import:

```ts
import { getMinorCivMobilizationBudget } from '@/systems/minor-civ-coalition-system';
```

Inside `chooseMinorCivQueueItem`, boost defender units when `getMinorCivMobilizationBudget(state, minorCivId).wantsDefender` is true by treating posture as `mobilizing`.

Inside `processMinorCivEconomyTurn`, before queue selection, compute:

```ts
const budget = getMinorCivMobilizationBudget(nextState, minorCivId);
```

Use `budget.recoveryStrainedUntilTurn` in posture handling and do not create a separate regional cooldown field. Do not perform emergency conscription in this first pass. The existing regional conscription remains available only through direct callers that use the default `allowDefenderSpawns: true`; the minor-civ turn loop below will pass `false` so #490 does not double-spawn.

- [ ] **Step 5: Wire `processMinorCivTurn`**

In `src/systems/minor-civ-system.ts`, import:

```ts
import { processMinorCivEconomyTurn } from './minor-civ-economy-system';
```

Change the per-minor-civ loop order:

```ts
nextState = processMinorCivRegionalGrievanceTurn(nextState, mcId, { allowDefenderSpawns: false });
const economyResult = processMinorCivEconomyTurn(nextState, mcId, bus);
nextState = economyResult.state;
mc = nextState.minorCivs[mcId];
```

Place those lines after reset and before `planPurposefulMinorCivTurn`. Remove the later existing `processMinorCivRegionalGrievanceTurn(nextState, mcId)` call from the end of the loop.

Keep `processGarrison` as a temporary backstop but modify it to skip free respawn when `mc.economy` exists and `state.cities[mc.cityId]?.owner === mc.id`:

```ts
if (mc.economy && state.cities[mc.cityId]?.owner === mc.id) {
  return { ...state, minorCivs: { ...state.minorCivs, [mc.id]: { ...mc, units: aliveUnits } } };
}
```

- [ ] **Step 6: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-economy-system.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/minor-civ-system.ts src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-economy-system.ts tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "feat: run city-state economy in minor-civ turns"
```

## Task 5: Viewer-Safe Presentation, Notifications, And Hot-Seat Routing

**Files:**
- Modify: `src/systems/minor-civ-presentation.ts`
- Modify: `src/ui/minor-civ-notifications.ts`
- Modify: `src/ui/minor-civ-notification-listeners.ts`
- Test: `tests/systems/minor-civ-presentation.test.ts`
- Test: `tests/ui/minor-civ-notifications.test.ts`
- Test: `tests/ui/minor-civ-notification-listeners.test.ts`

- [ ] **Step 1: Write failing presentation and notification tests**

Add to `tests/systems/minor-civ-presentation.test.ts`:

```ts
import { getMinorCivEconomyPresentationForPlayer } from '@/systems/minor-civ-presentation';

it('masks hidden city-state economy presentation from undiscovered viewers', () => {
  const state = createNewGame(undefined, 'minor-economy-presentation-hidden', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  minorCiv.economy = {
    policy: 'defense',
    posture: 'mobilizing',
    lastProcessedTurn: state.turn,
    recentProductionSummary: { itemId: 'warrior', itemClass: 'unit', completedTurn: state.turn },
  };

  const presentation = getMinorCivEconomyPresentationForPlayer(state, 'player', minorCiv.id);

  expect(presentation.known).toBe(false);
  expect(presentation.postureLabel).toBeNull();
  expect(presentation.hint).toBeNull();
});

it('shows only broad city-state economy posture to discovered viewers', () => {
  const state = createNewGame(undefined, 'minor-economy-presentation-known', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';
  minorCiv.economy = {
    policy: 'defense',
    posture: 'mobilizing',
    lastProcessedTurn: state.turn,
    recentProductionSummary: { itemId: 'warrior', itemClass: 'unit', completedTurn: state.turn },
  };

  const presentation = getMinorCivEconomyPresentationForPlayer(state, 'player', minorCiv.id);

  expect(presentation).toMatchObject({
    known: true,
    postureLabel: 'Mobilizing',
    hint: 'training defenders',
  });
  expect(JSON.stringify(presentation)).not.toContain('warrior');
});

it('recomputes effective posture from cooled grievance state for immediate UI refresh', () => {
  const state = createNewGame(undefined, 'minor-economy-presentation-cooled', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';
  minorCiv.regionalGrievanceByCiv = {
    player: {
      targetCivId: 'player',
      pressure: 5,
      status: 'wary',
      lastUpdatedTurn: state.turn,
      causes: [],
    },
  };
  minorCiv.economy = {
    policy: 'defense',
    posture: 'mobilizing',
    lastProcessedTurn: state.turn,
  };

  const presentation = getMinorCivEconomyPresentationForPlayer(state, 'player', minorCiv.id);

  expect(presentation.postureLabel).toBe('Quiet');
});
```

Add to `tests/ui/minor-civ-notifications.test.ts`:

```ts
it('creates viewer-safe production notifications only for discovered city-states', () => {
  const state = createNewGame(undefined, 'minor-economy-notification', 'small');
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const hidden = getMinorCivNotification(state, 'player', {
    type: 'minor-civ:production-completed',
    minorCivId: minorCiv.id,
    cityId: minorCiv.cityId,
    itemId: 'warrior',
    itemClass: 'unit',
  });
  expect(hidden).toBeNull();

  state.civilizations.player.visibility.tiles[hexKey(state.cities[minorCiv.cityId].position)] = 'fog';
  const known = getMinorCivNotification(state, 'player', {
    type: 'minor-civ:production-completed',
    minorCivId: minorCiv.id,
    cityId: minorCiv.cityId,
    itemId: 'warrior',
    itemClass: 'unit',
  });

  expect(known?.message).toContain('is strengthening its defenses');
  expect(known?.message).not.toContain('warrior');
});
```

Add to `tests/ui/minor-civ-notification-listeners.test.ts`:

```ts
it('routes city-state economy production to eligible hot-seat viewers only', () => {
  const state = createHotSeatGame({
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'A', slotId: 'player-1', civType: 'egypt', isHuman: true },
      { name: 'B', slotId: 'player-2', civType: 'rome', isHuman: true },
    ],
  }, 'minor-economy-hotseat-notify');
  state.pendingEvents = {};
  const minorCiv = Object.values(state.minorCivs)[0]!;
  const city = state.cities[minorCiv.cityId];
  state.civilizations['player-1'].visibility.tiles[hexKey(city.position)] = 'fog';
  const bus = new EventBus();
  const log: string[] = [];

  registerMinorCivNotificationListeners(bus, () => state, {
    appendToCivLog: (civId, message) => { log.push(`${civId}:${message}`); },
  });

  bus.emit('minor-civ:production-completed', {
    minorCivId: minorCiv.id,
    cityId: city.id,
    itemId: 'warrior',
    itemClass: 'unit',
    state,
  });

  expect(state.pendingEvents?.['player-1']).toHaveLength(1);
  expect(state.pendingEvents?.['player-2']).toBeUndefined();
  expect(log.some(entry => entry.startsWith('player-1:'))).toBe(true);
  expect(log.some(entry => entry.startsWith('player-2:'))).toBe(false);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-presentation.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts`

Expected: FAIL because the new presentation and notification event do not exist.

- [ ] **Step 3: Implement presentation helper**

In `src/systems/minor-civ-presentation.ts`, add:

```ts
import type { MinorCivPosture } from '@/core/types';
import { evaluateMinorCivEconomyPosture } from '@/systems/minor-civ-economy-system';

export interface MinorCivEconomyPresentation {
  known: boolean;
  postureLabel: string | null;
  hint: string | null;
}

const POSTURE_LABELS: Record<MinorCivPosture, string> = {
  settled: 'Quiet',
  fortifying: 'Fortifying',
  mobilizing: 'Mobilizing',
  recovering: 'Recovering',
};

export function getMinorCivEconomyPresentationForPlayer(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivEconomyPresentation {
  const base = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId);
  if (!base.known) return { known: false, postureLabel: null, hint: null };
  const economy = state.minorCivs[minorCivId]?.economy;
  const effectivePosture = evaluateMinorCivEconomyPosture(state, minorCivId);
  if (!economy) return { known: true, postureLabel: POSTURE_LABELS[effectivePosture], hint: null };
  const summary = economy.recentProductionSummary;
  const hint = summary?.itemClass === 'unit'
    ? 'training defenders'
    : summary?.itemClass === 'building'
      ? 'investing locally'
      : effectivePosture === 'recovering' ? 'recovering from levy' : null;
  return {
    known: true,
    postureLabel: POSTURE_LABELS[effectivePosture],
    hint,
  };
}
```

- [ ] **Step 4: Implement notification draft and listener routing**

In `src/ui/minor-civ-notifications.ts`, add event union member:

```ts
| { type: 'minor-civ:production-completed'; minorCivId: string; cityId: string; itemId: string; itemClass: 'building' | 'unit' }
```

Before the `majorCivId` gate, add:

```ts
if (event.type === 'minor-civ:production-completed') {
  const presentation = getTargetedMinorCivPresentation(state, viewerCivId, event.minorCivId);
  if (!presentation) return null;
  return {
    message: event.itemClass === 'unit'
      ? `${presentation.name} is strengthening its defenses.`
      : `${presentation.name} is growing more prosperous.`,
    type: event.itemClass === 'unit' ? 'warning' : 'info',
    turn: state.turn,
  };
}
```

In `src/ui/minor-civ-notification-listeners.ts`, add listener:

```ts
bus.on('minor-civ:production-completed', data => {
  const state = data.state ?? getState();
  for (const civId of Object.keys(state.civilizations)) {
    const notification = getMinorCivNotification(state, civId, {
      type: 'minor-civ:production-completed',
      minorCivId: data.minorCivId,
      cityId: data.cityId,
      itemId: data.itemId,
      itemClass: data.itemClass,
    });
    if (!notification) continue;
    queueHotSeatEvent(state, civId, { type: 'minor-civ:production-completed', message: notification.message, turn: state.turn });
    appendToCivLog(civId, notification.message, notification.type);
  }
});
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-presentation.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/minor-civ-presentation.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts tests/systems/minor-civ-presentation.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts
git commit -m "feat: route city-state economy presentation safely"
```

## Task 6: Diplomacy Panel Integration And Exact-Pressure Cleanup

**Files:**
- Modify: `src/ui/diplomacy-panel.ts`
- Test: `tests/ui/diplomacy-panel.test.ts`

- [ ] **Step 1: Write failing UI tests**

Update the existing grievance panel test in `tests/ui/diplomacy-panel.test.ts` so it asserts no exact pressure number:

```ts
expect(panel.textContent).toContain('Regional grievance: Mobilizing');
expect(panel.textContent).toContain('Mobilizing');
expect(panel.textContent).not.toContain('(55)');
```

Add:

```ts
it('renders broad economy posture without hiding city-state actions', () => {
  const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
  state.minorCivs['mc-sparta'] = {
    id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: [],
    diplomacy: state.civilizations.player.diplomacy,
    activeQuests: {},
    chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
    regionalGrievanceByCiv: {
      player: { targetCivId: 'player', pressure: 55, status: 'mobilizing', lastUpdatedTurn: state.turn, causes: [] },
    },
    economy: {
      policy: 'defense',
      posture: 'mobilizing',
      lastProcessedTurn: state.turn,
      recentProductionSummary: { itemId: 'warrior', itemClass: 'unit', completedTurn: state.turn },
    },
    isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
  };
  state.cities['mc-city'] = {
    ...state.cities['city-border'], id: 'mc-city', owner: 'mc-sparta',
    position: { q: 6, r: 0 }, ownedTiles: [{ q: 6, r: 0 }],
  };
  state.civilizations.player.visibility.tiles['6,0'] = 'fog';

  const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

  expect(panel.textContent).toContain('Regional grievance: Mobilizing');
  expect(panel.textContent).toContain('training defenders');
  expect(panel.textContent).not.toContain('warrior');
  expect(panel.querySelector('.mc-gift')).not.toBeNull();
  expect(panel.querySelector('.mc-war')).not.toBeNull();
});

it('rerenders reparations cooling into economy posture without double charging from stale DOM', () => {
  const { container, state } = makeDiplomacyFixture({ currentPlayer: 'player' });
  state.civilizations.player.gold = 200;
  state.minorCivs['mc-sparta'] = {
    id: 'mc-sparta', definitionId: 'sparta', cityId: 'mc-city', units: [],
    diplomacy: state.civilizations.player.diplomacy,
    activeQuests: {},
    chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
    regionalGrievanceByCiv: {
      player: { targetCivId: 'player', pressure: 25, status: 'wary', lastUpdatedTurn: state.turn, causes: [] },
    },
    economy: { policy: 'defense', posture: 'fortifying', lastProcessedTurn: state.turn },
    isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
  };
  state.cities['mc-city'] = { ...state.cities['city-border'], id: 'mc-city', owner: 'mc-sparta', position: { q: 6, r: 0 }, ownedTiles: [{ q: 6, r: 0 }] };
  state.civilizations.player.visibility.tiles['6,0'] = 'fog';
  let currentState = state;
  const render = () => createDiplomacyPanel(container, currentState, {
    onAction: () => {},
    onMinorCivReparations: mcId => {
      currentState.minorCivs[mcId].regionalGrievanceByCiv!.player.pressure = 5;
      currentState.minorCivs[mcId].regionalGrievanceByCiv!.player.status = 'wary';
      currentState.minorCivs[mcId].economy = { ...currentState.minorCivs[mcId].economy!, posture: 'settled' };
      currentState.civilizations.player.gold -= 60;
      render();
    },
    onClose: () => {},
  });

  const panel = render();
  const button = panel.querySelector<HTMLButtonElement>('[data-action="pay-reparations"]')!;
  button.click();
  button.click();
  const rerendered = container.querySelector('#diplomacy-panel') as HTMLElement;

  expect(currentState.civilizations.player.gold).toBe(140);
  expect(rerendered.textContent).not.toContain('Pay Reparations');
  expect(rerendered.textContent).not.toContain('(25)');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts`

Expected: FAIL because the panel still renders exact pressure and does not render economy presentation.

- [ ] **Step 3: Render coherent broad posture**

In `src/ui/diplomacy-panel.ts`, import:

```ts
import { getMinorCivEconomyPresentationForPlayer } from '@/systems/minor-civ-presentation';
```

When building `minorCivRows`, compute:

```ts
const economyPresentation = getMinorCivEconomyPresentationForPlayer(state, state.currentPlayer, mcId);
const regionalGrievanceText = grievance && grievanceStatusLabel
  ? `Regional grievance: ${grievanceStatusLabel}${economyPresentation.postureLabel ? ` · ${economyPresentation.postureLabel}` : ''}`
  : economyPresentation.postureLabel ? `City-state posture: ${economyPresentation.postureLabel}` : null;
const economyHintText = economyPresentation.hint;
```

Add `economyHintText` to `MinorCivRowData`.

Replace the current pressure-rendering text:

```ts
regionalGrievanceText: grievance && grievanceStatusLabel
  ? `Regional grievance: ${grievanceStatusLabel} (${Math.round(grievance.pressure)})`
  : null,
```

with:

```ts
regionalGrievanceText,
economyHintText,
```

Render:

```ts
if (row.economyHintText !== null) {
  minorCivsHtml += `<div style="font-size:11px;opacity:0.65;margin-top:4px;" data-text="mc-economy-hint-${row.mcIdx}"></div>`;
}
```

Set text:

```ts
if (row.economyHintText !== null) {
  setText(`mc-economy-hint-${row.mcIdx}`, row.economyHintText);
}
```

Keep existing action buttons unchanged.

Update the reparations click listener to guard stale repeat clicks before invoking the callback:

```ts
panel.querySelectorAll('.mc-reparations').forEach(btn => {
  btn.addEventListener('click', () => {
    const button = btn as HTMLButtonElement;
    if (button.disabled) return;
    button.disabled = true;
    const mcId = button.dataset.mcId!;
    panel.remove();
    callbacks.onMinorCivReparations?.(mcId);
  });
});
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `./scripts/run-with-mise.sh yarn test --run tests/ui/diplomacy-panel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/diplomacy-panel.ts tests/ui/diplomacy-panel.test.ts
git commit -m "feat: show city-state economy posture in diplomacy"
```

## Task 7: Save, Client Neutrality, Rule Checks, And Full Regression Pass

**Files:**
- Modify tests only if the verification commands expose a real gap.
- No platform-specific source file should be modified for this task.

- [ ] **Step 1: Run source rule check for changed `src` files**

Run with the actual changed source file list from `git diff --name-only origin/main...HEAD`:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/minor-civ-economy-system.ts src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-system.ts src/storage/save-manager.ts src/systems/minor-civ-presentation.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts src/ui/diplomacy-panel.ts
```

Expected: PASS with no rule violation output.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-presentation.test.ts tests/storage/save-persistence.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/ui/diplomacy-panel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS. This is required because `yarn test` does not type-check.

- [ ] **Step 4: Run Tauri frontend build**

Run:

```bash
./scripts/run-with-mise.sh yarn build:tauri
```

Expected: PASS. This verifies the shared frontend compiles for the desktop client after changing shared systems, storage normalization, and UI.

- [ ] **Step 5: Check client-neutral source boundaries**

Run:

```bash
rg -n "@tauri|__TAURI__|window\\.location|/conquestoria/" src/core/types.ts src/systems/minor-civ-economy-system.ts src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-system.ts src/storage/save-manager.ts src/systems/minor-civ-presentation.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts src/ui/diplomacy-panel.ts
```

Expected: no matches. Shared gameplay, save, and UI modules must not branch on web/PWA/Tauri details for #490.

- [ ] **Step 6: Run full tests before push/PR**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 7: Inspect committed and uncommitted diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- src/core/types.ts src/systems/minor-civ-economy-system.ts src/systems/minor-civ-coalition-system.ts src/systems/minor-civ-system.ts src/storage/save-manager.ts src/systems/minor-civ-presentation.ts src/ui/minor-civ-notifications.ts src/ui/minor-civ-notification-listeners.ts src/ui/diplomacy-panel.ts tests/systems/minor-civ-economy-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/minor-civ-presentation.test.ts tests/storage/save-persistence.test.ts tests/ui/minor-civ-notifications.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/ui/diplomacy-panel.test.ts
git diff
```

Expected:
- branch diff shows only the implementation and tests for #490
- uncommitted diff is empty after final commit
- no Tauri-specific imports, browser-only globals, or platform path branches in shared gameplay modules
- no exact hidden pressure values rendered in player-facing city-state economy UI

- [ ] **Step 8: Final commit if verification fixes were needed**

```bash
git add src tests
git commit -m "test: cover hidden city-state economy regressions"
```

Only run this commit if Step 1-5 caused additional changes after Task 6.

## Self-Review Notes

- Spec coverage: data model, normalization, queue selection, city production, unit completion, pending spawn, regional grievance integration, no duplicate defender spawning, presentation, solo/hot-seat routing, save/load, web/PWA/Tauri neutrality, gameplay balance, and regression coverage are each mapped to tasks above.
- Architecture review: the new economy module owns hidden economy logic; presentation remains a helper boundary; UI does not read raw hidden fields except through presentation helpers.
- Gameplay balance review: caps and production multipliers are challenge-based, bounded, and local; city-states cannot expand or become hidden full major civs.
- Hot-seat and solo review: notification tests cover eligible and ineligible viewers; solo tests assert undiscovered silence.
- Client review: no platform-specific source path is in scope; build verification catches shared TypeScript mistakes for web/PWA/Tauri frontend code.
- Regression review: targeted tests cover save migration, no same-turn unit action, no double spawn, blocked pending spawn, exact-pressure cleanup, and visible panel rerender behavior.
