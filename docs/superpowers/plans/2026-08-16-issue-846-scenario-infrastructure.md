# Scenario Infrastructure (Issue #846) Implementation Plan

> **For agentic workers:** Per this repository's CLAUDE.md ("NEVER use subagents or parallel agents"), execute this plan **inline in the current session** using `superpowers:executing-plans`, not `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give developers and tests a typed, deterministic way to construct a specific `GameState` (era/turn, map, civs, units, cities, tech, diplomacy) without playing dozens of turns, built entirely from canonical system helpers so it can never drift into a duplicate fixture format.

**Architecture:** A `ScenarioDefinition` (a `base` config for `createNewGame`/`createHotSeatGame` plus a list of typed `ScenarioStep`s) is folded by `buildScenario()` into a `GameState`, applying each step through the same canonical system functions gameplay itself uses (`createUnit`, `foundCity`, `declareWar`, etc.). The same `buildScenario` + a small named `SCENARIOS` registry are consumed by (a) Vitest tests directly, and (b) a `DEV`-only `?scenario=<name>` branch in the composition root that publishes the built state through the existing `campaignEntry.enterCampaign` path — no new state-management or mutation surface.

**Tech Stack:** TypeScript, Vitest, Vite (`import.meta.env.DEV`), existing `@/core/game-state.ts` and `@/systems/*` helpers.

## Global Constraints

- Full design/rationale: `docs/superpowers/specs/2026-08-16-issue-846-scenario-infrastructure-design.md` — read it if a task below is ambiguous.
- Never hand-construct `Unit`/`City` objects with literal gameplay fields (strength, movement, etc.) — always start from the real `createUnit`/`foundCity` and layer only scenario-specific `overrides` on top.
- Diplomacy changes must update both civs' `diplomacy` state (matches `declareWar`/`makePeace`/`signTreaty` call-site convention everywhere else in this codebase).
- All commands run via `bash scripts/run-with-mise.sh yarn <cmd>` — never bare `yarn` or `eval "$(mise activate bash)"`.
- Before `git push`/`gh pr create`, run `yarn build` and `yarn test` and confirm both exit 0.
- Do not modify `src/systems/barbarian-system.ts`, `src/systems/beast-system.ts`, `src/ai/*` or any other file under active work by the parallel #547 agent — this plan only adds new files under `src/testing/` and `tests/testing/`, plus one small additive branch in `src/app/controllers/game-session-controller.ts`.

---

## Task 1: Scenario types

**Files:**
- Create: `src/testing/scenario-types.ts`
- Test: `tests/testing/scenario-types.test.ts`

**Interfaces:**
- Produces: `ScenarioDefinition`, `ScenarioStep` (discriminated union: `terrain` | `unit` | `city` | `camp` | `tech` | `diplomacy` | `gold`), `ScenarioError` class. Every later task imports these from `@/testing/scenario-types`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/testing/scenario-types.test.ts
import { describe, expect, it } from 'vitest';
import { ScenarioError } from '@/testing/scenario-types';

describe('ScenarioError', () => {
  it('is a real Error with a readable name', () => {
    const error = new ScenarioError('bad step');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ScenarioError');
    expect(error.message).toBe('bad step');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-types.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-types'`

- [ ] **Step 3: Write the types file**

```ts
// src/testing/scenario-types.ts
/**
 * Canonical scenario representation (#846). A ScenarioDefinition never carries
 * raw partial GameState — every step maps 1:1 to a canonical system call in
 * scenario-builder.ts, so a scenario can never bypass the same construction
 * rules real gameplay uses. See docs/superpowers/specs/
 * 2026-08-16-issue-846-scenario-infrastructure-design.md for the full design.
 */
import type {
  City,
  HexCoord,
  HexTile,
  HotSeatConfig,
  SoloSetupConfig,
  TreatyType,
  Unit,
  UnitType,
} from '@/core/types';

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

export interface TerrainStep {
  readonly kind: 'terrain';
  readonly position: HexCoord;
  readonly terrain: HexTile['terrain'];
}

export interface UnitStep {
  readonly kind: 'unit';
  readonly civId: string;
  readonly type: UnitType;
  readonly position: HexCoord;
  readonly overrides?: Partial<Unit>;
  /** Skip the "tile already occupied" guard — for intentionally corrupt/edge-case scenarios. */
  readonly unsafe?: boolean;
}

export interface CityStep {
  readonly kind: 'city';
  readonly civId: string;
  readonly position: HexCoord;
  readonly overrides?: Partial<City>;
  readonly unsafe?: boolean;
}

export interface CampStep {
  readonly kind: 'camp';
  readonly position: HexCoord;
  readonly overrides?: Partial<{ strength: number; spawnCooldown: number; resurgent: boolean; banditLordName: string }>;
  readonly unsafe?: boolean;
}

export interface TechStep {
  readonly kind: 'tech';
  readonly civId: string;
  readonly techIds: readonly string[];
}

export interface DiplomacyStep {
  readonly kind: 'diplomacy';
  readonly civA: string;
  readonly civB: string;
  readonly status: 'war' | 'peace' | 'alliance';
}

export interface GoldStep {
  readonly kind: 'gold';
  readonly civId: string;
  readonly amount: number;
}

export type ScenarioStep =
  | TerrainStep
  | UnitStep
  | CityStep
  | CampStep
  | TechStep
  | DiplomacyStep
  | GoldStep;

export type ScenarioBase =
  | { readonly kind: 'solo'; readonly config: SoloSetupConfig }
  | { readonly kind: 'hotSeat'; readonly config: HotSeatConfig };

export interface ScenarioDefinition {
  readonly name: string;
  readonly description: string;
  readonly seed: string;
  readonly base: ScenarioBase;
  readonly steps: readonly ScenarioStep[];
}

/** TreatyType re-exported for callers building diplomacy assertions in tests. */
export type { TreatyType };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/testing/scenario-types.ts tests/testing/scenario-types.test.ts
git commit -m "feat(testing): add typed ScenarioDefinition/ScenarioStep for #846"
```

---

## Task 2: Scenario builder

**Files:**
- Create: `src/testing/scenario-builder.ts`
- Test: `tests/testing/scenario-builder.test.ts`

**Interfaces:**
- Consumes: `ScenarioDefinition`, `ScenarioStep`, `ScenarioError` from `@/testing/scenario-types` (Task 1).
- Produces: `buildScenario(definition: ScenarioDefinition): GameState`. Task 3 (named scenarios + their tests) and Task 4 (dev loader) both call this exact function.

- [ ] **Step 1: Write the failing determinism + base-construction test**

```ts
// tests/testing/scenario-builder.test.ts
import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/testing/scenario-builder';
import { ScenarioError, type ScenarioDefinition, type ScenarioStep } from '@/testing/scenario-types';
import { hexKey } from '@/systems/hex-utils';
import { getBlockingMapEntityAt } from '@/systems/unit-system';

function withoutGameId(state: ReturnType<typeof buildScenario>) {
  const { gameId, ...rest } = state;
  return rest;
}

const soloBase: ScenarioDefinition['base'] = {
  kind: 'solo',
  config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Determinism Check' },
};

describe('buildScenario', () => {
  it('is deterministic for a given seed (excluding gameId)', () => {
    const definition: ScenarioDefinition = {
      name: 'determinism-check',
      description: 'test only',
      seed: 'scenario-determinism-check',
      base: soloBase,
      steps: [],
    };
    const first = buildScenario(definition);
    const second = buildScenario(definition);
    expect(withoutGameId(first)).toEqual(withoutGameId(second));
  });

  it('derives everything not named in base/steps from createNewGame', () => {
    const definition: ScenarioDefinition = {
      name: 'base-only',
      description: 'test only',
      seed: 'scenario-base-only',
      base: soloBase,
      steps: [],
    };
    const state = buildScenario(definition);
    expect(Object.keys(state.civilizations)).toEqual(['player', 'ai-1']);
    expect(state.civilizations.player.units.length).toBeGreaterThan(0);
    expect(state.map.tiles).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-builder'`

- [ ] **Step 3: Write the builder's base construction + step dispatch skeleton**

```ts
// src/testing/scenario-builder.ts
/**
 * Folds a ScenarioDefinition into a GameState by starting from the canonical
 * createNewGame/createHotSeatGame constructor, then applying each step
 * through the same system helpers gameplay uses. See
 * docs/superpowers/specs/2026-08-16-issue-846-scenario-infrastructure-design.md.
 */
import type { GameState, Unit } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { hexKey } from '@/systems/hex-utils';
import { updateVisibility } from '@/systems/fog-of-war';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { ScenarioError, type ScenarioDefinition, type ScenarioStep } from '@/testing/scenario-types';
import { applyUnitStep } from '@/testing/scenario-steps/unit-step';
import { applyCityStep } from '@/testing/scenario-steps/city-step';
import { applyCampStep } from '@/testing/scenario-steps/camp-step';
import { applyTechStep } from '@/testing/scenario-steps/tech-step';
import { applyDiplomacyStep } from '@/testing/scenario-steps/diplomacy-step';
import { applyGoldStep } from '@/testing/scenario-steps/gold-step';

function applyTerrainStep(state: GameState, step: Extract<ScenarioStep, { kind: 'terrain' }>): GameState {
  const key = hexKey(step.position);
  const tile = state.map.tiles[key];
  if (!tile) throw new ScenarioError(`Invalid coordinate ${key} in terrain step`);
  return { ...state, map: { ...state.map, tiles: { ...state.map.tiles, [key]: { ...tile, terrain: step.terrain } } } };
}

function applyStep(state: GameState, step: ScenarioStep): GameState {
  switch (step.kind) {
    case 'terrain': return applyTerrainStep(state, step);
    case 'unit': return applyUnitStep(state, step);
    case 'city': return applyCityStep(state, step);
    case 'camp': return applyCampStep(state, step);
    case 'tech': return applyTechStep(state, step);
    case 'diplomacy': return applyDiplomacyStep(state, step);
    case 'gold': return applyGoldStep(state, step);
  }
}

function refreshVisibilityAndContacts(state: GameState): GameState {
  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];
    const civUnits = civ.units
      .map(unitId => state.units[unitId])
      .filter((unit): unit is Unit => unit != null);
    const cityPositions = Object.values(state.cities)
      .filter(city => city.owner === civId)
      .map(city => city.position);
    updateVisibility(civ.visibility, civUnits, state.map, cityPositions);
  }
  for (const civId of Object.keys(state.civilizations)) {
    refreshLastSeenPresentationsForCiv(state, civId);
    syncCivilizationContactsFromVisibility(state, civId);
  }
  return state;
}

export function buildScenario(definition: ScenarioDefinition): GameState {
  let state: GameState = definition.base.kind === 'solo'
    ? createNewGame({ ...definition.base.config, seed: definition.seed })
    : createHotSeatGame(definition.base.config, definition.seed);

  definition.steps.forEach((step, index) => {
    try {
      state = applyStep(state, step);
    } catch (error) {
      if (error instanceof ScenarioError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new ScenarioError(`Scenario "${definition.name}" step ${index} (${step.kind}) failed: ${reason}`);
    }
  });

  return refreshVisibilityAndContacts(state);
}
```

- [ ] **Step 4: Run test to verify it passes (step appliers still missing — expected next failure)**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/unit-step'` (the six step-applier modules don't exist yet; this is the expected next failure, not a regression)

- [ ] **Step 5: Write the failing unit-step test**

Append to `tests/testing/scenario-builder.test.ts`:

```ts
describe('unit step', () => {
  it('places a canonical unit via createUnit, then layers overrides on top', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-check',
      description: 'test only',
      seed: 'scenario-unit-step-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 }, overrides: { health: 40 } },
      ],
    };
    const state = buildScenario(definition);
    const scout = Object.values(state.units).find(u => u.type === 'scout' && u.owner === 'player');
    expect(scout).toBeDefined();
    expect(scout!.movementPointsLeft).toBe(3); // UNIT_DEFINITIONS.scout.movementPoints — proves createUnit ran
    expect(scout!.health).toBe(40); // proves the override layered on top
    expect(state.civilizations.player.units).toContain(scout!.id);
  });

  it('works identically for an AI-owned civId', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-ai-check',
      description: 'test only',
      seed: 'scenario-unit-step-ai-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'ai-1', type: 'warrior', position: { q: 0, r: 0 } },
      ],
    };
    const state = buildScenario(definition);
    const warrior = Object.values(state.units).find(u => u.type === 'warrior' && u.owner === 'ai-1');
    expect(warrior).toBeDefined();
    expect(state.civilizations['ai-1'].units).toContain(warrior!.id);
  });

  it('throws ScenarioError on an invalid coordinate', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-bad-coord',
      description: 'test only',
      seed: 'scenario-unit-step-bad-coord',
      base: soloBase,
      steps: [{ kind: 'unit', civId: 'player', type: 'scout', position: { q: 99999, r: 99999 } }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });

  it('throws ScenarioError on an unknown civId', () => {
    const definition: ScenarioDefinition = {
      name: 'unit-step-bad-civ',
      description: 'test only',
      seed: 'scenario-unit-step-bad-civ',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'nonexistent', type: 'scout', position: { q: 0, r: 0 } },
      ],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });

  it('rejects placing a unit on an already-occupied tile unless unsafe: true', () => {
    const stepsBase: ScenarioStep[] = [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
      { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 } },
      { kind: 'unit', civId: 'ai-1', type: 'warrior', position: { q: 0, r: 0 } },
    ];
    const blocked: ScenarioDefinition = {
      name: 'unit-step-occupied', description: 'test only', seed: 'scenario-unit-step-occupied',
      base: soloBase, steps: stepsBase,
    };
    expect(() => buildScenario(blocked)).toThrow(ScenarioError);

    const allowed: ScenarioDefinition = {
      ...blocked,
      name: 'unit-step-occupied-unsafe',
      steps: [...stepsBase.slice(0, 2), { ...stepsBase[2], unsafe: true } as ScenarioStep],
    };
    expect(() => buildScenario(allowed)).not.toThrow();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/unit-step'`

- [ ] **Step 7: Implement the unit step**

```ts
// src/testing/scenario-steps/unit-step.ts
import type { GameState, Unit } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { hexKey } from '@/systems/hex-utils';
import { ScenarioError, type UnitStep } from '@/testing/scenario-types';

export function applyUnitStep(state: GameState, step: UnitStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in unit step`);

  const key = hexKey(step.position);
  if (!state.map.tiles[key]) throw new ScenarioError(`Invalid coordinate ${key} in unit step`);

  if (!step.unsafe) {
    const occupant = Object.values(state.units).find(unit => hexKey(unit.position) === key);
    if (occupant) {
      throw new ScenarioError(`Tile ${key} already occupied by unit "${occupant.id}" (pass unsafe: true to override)`);
    }
  }

  const civDef = resolveCivDefinition(state, civ.civType);
  const unit: Unit = { ...createUnit(step.type, step.civId, step.position, state.idCounters, civDef?.bonusEffect), ...step.overrides };

  return {
    ...state,
    units: { ...state.units, [unit.id]: unit },
    civilizations: {
      ...state.civilizations,
      [step.civId]: { ...civ, units: [...civ.units, unit.id] },
    },
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/city-step'` (next missing module; unit-step tests themselves now pass, remaining failures are import errors from the skeleton's other imports)

- [ ] **Step 9: Write the failing city-step test**

Append to `tests/testing/scenario-builder.test.ts`:

```ts
describe('city step', () => {
  it('founds a canonical city via foundCity and claims nearby territory', () => {
    const definition: ScenarioDefinition = {
      name: 'city-step-check',
      description: 'test only',
      seed: 'scenario-city-step-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'plains' },
        { kind: 'terrain', position: { q: 1, r: 0 }, terrain: 'plains' },
        { kind: 'city', civId: 'ai-1', position: { q: 2, r: 0 } },
      ],
    };
    const state = buildScenario(definition);
    const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey({ q: 2, r: 0 }));
    expect(city).toBeDefined();
    expect(city!.owner).toBe('ai-1');
    expect(city!.name.length).toBeGreaterThan(0); // proves foundCity's naming ran, not a hand literal
    expect(state.civilizations['ai-1'].cities).toContain(city!.id);
    expect(state.map.tiles[hexKey({ q: 1, r: 0 })].owner).toBe('ai-1'); // territory recalculated
  });

  it('rejects founding on an already-occupied tile unless unsafe: true', () => {
    const steps: ScenarioStep[] = [
      { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'plains' },
      { kind: 'city', civId: 'ai-1', position: { q: 2, r: 0 } },
      { kind: 'city', civId: 'player', position: { q: 2, r: 0 } },
    ];
    const blocked: ScenarioDefinition = {
      name: 'city-step-occupied', description: 'test only', seed: 'scenario-city-step-occupied',
      base: soloBase, steps,
    };
    expect(() => buildScenario(blocked)).toThrow(ScenarioError);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/city-step'`

- [ ] **Step 11: Implement the city step**

```ts
// src/testing/scenario-steps/city-step.ts
import type { City, GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { collectUsedCityNames } from '@/systems/city-name-system';
import { recalculateTerritory } from '@/systems/city-territory-system';
import { initializeLegendaryWonderProjectsForCity } from '@/systems/legendary-wonder-system';
import { hexKey } from '@/systems/hex-utils';
import { ScenarioError, type CityStep } from '@/testing/scenario-types';

export function applyCityStep(state: GameState, step: CityStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in city step`);

  const key = hexKey(step.position);
  if (!state.map.tiles[key]) throw new ScenarioError(`Invalid coordinate ${key} in city step`);

  if (!step.unsafe) {
    const existingCity = Object.values(state.cities).find(c => hexKey(c.position) === key);
    if (existingCity) {
      throw new ScenarioError(`Tile ${key} already has city "${existingCity.id}" (pass unsafe: true to override)`);
    }
  }

  const civDef = resolveCivDefinition(state, civ.civType);
  const city: City = {
    ...foundCity(step.civId, step.position, state.map, state.idCounters, {
      civType: civ.civType,
      namingPool: civDef?.cityNames,
      civName: civDef?.name ?? civ.name,
      usedNames: collectUsedCityNames(state),
      completedTechs: civ.techState.completed,
    }),
    ...step.overrides,
  };

  let nextState: GameState = {
    ...state,
    cities: { ...state.cities, [city.id]: city },
    civilizations: {
      ...state.civilizations,
      [step.civId]: { ...civ, cities: [...civ.cities, city.id] },
    },
  };
  nextState = initializeLegendaryWonderProjectsForCity(nextState, step.civId, city.id);
  nextState = recalculateTerritory(nextState, { reason: 'founding', preserveForeignHolders: true }).state;
  return nextState;
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/camp-step'` (next missing module)

- [ ] **Step 13: Write the failing camp-step test**

Append to `tests/testing/scenario-builder.test.ts`:

```ts
describe('camp step', () => {
  it('places a barbarian camp that getBlockingMapEntityAt recognizes', () => {
    const definition: ScenarioDefinition = {
      name: 'camp-step-check',
      description: 'test only',
      seed: 'scenario-camp-step-check',
      base: soloBase,
      steps: [
        { kind: 'terrain', position: { q: 5, r: 5 }, terrain: 'plains' },
        { kind: 'terrain', position: { q: 6, r: 5 }, terrain: 'plains' },
        { kind: 'unit', civId: 'player', type: 'warrior', position: { q: 5, r: 5 } },
        { kind: 'camp', position: { q: 6, r: 5 } },
      ],
    };
    const state = buildScenario(definition);
    const camp = Object.values(state.barbarianCamps).find(c => hexKey(c.position) === hexKey({ q: 6, r: 5 }));
    expect(camp).toBeDefined();
    const mover = Object.values(state.units).find(u => u.owner === 'player');
    const blocking = getBlockingMapEntityAt(state, mover!, { q: 6, r: 5 });
    expect(blocking).toEqual({ reason: 'barbarian-camp', entityId: camp!.id });
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/camp-step'`

- [ ] **Step 15: Implement the camp step**

```ts
// src/testing/scenario-steps/camp-step.ts
import type { BarbarianCamp, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { ScenarioError, type CampStep } from '@/testing/scenario-types';

export function applyCampStep(state: GameState, step: CampStep): GameState {
  const key = hexKey(step.position);
  if (!state.map.tiles[key]) throw new ScenarioError(`Invalid coordinate ${key} in camp step`);

  if (!step.unsafe) {
    const occupantUnit = Object.values(state.units).find(unit => hexKey(unit.position) === key);
    const occupantCamp = Object.values(state.barbarianCamps ?? {}).find(camp => hexKey(camp.position) === key);
    if (occupantUnit || occupantCamp) {
      throw new ScenarioError(`Tile ${key} already occupied (pass unsafe: true to override)`);
    }
  }

  const id = `scenario-camp-${state.idCounters.nextCampId++}`;
  // No canonical constructor exists for an exact-position camp — spawnBarbarianCamp
  // only picks a random distance-constrained tile. BarbarianCamp is a flat data
  // record with no derived fields, so a direct literal is the correct level here
  // (same justification as the terrain step).
  const camp: BarbarianCamp = {
    id,
    position: { ...step.position },
    strength: 1,
    spawnCooldown: 99, // inert for the scenario's lifetime; scenarios don't advance turns
    ...step.overrides,
  };

  return { ...state, barbarianCamps: { ...(state.barbarianCamps ?? {}), [id]: camp } };
}
```

- [ ] **Step 16: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/tech-step'` (next missing module)

- [ ] **Step 17: Write the failing tech-step and diplomacy-step and gold-step tests**

Append to `tests/testing/scenario-builder.test.ts`:

```ts
describe('tech step', () => {
  it('marks the named techs completed for the civ', () => {
    const definition: ScenarioDefinition = {
      name: 'tech-step-check',
      description: 'test only',
      seed: 'scenario-tech-step-check',
      base: soloBase,
      steps: [{ kind: 'tech', civId: 'player', techIds: ['pottery', 'bronze-working'] }],
    };
    const state = buildScenario(definition);
    expect(state.civilizations.player.techState.completed).toEqual(
      expect.arrayContaining(['pottery', 'bronze-working']),
    );
  });

  it('throws ScenarioError on an unknown tech id', () => {
    const definition: ScenarioDefinition = {
      name: 'tech-step-bad-id',
      description: 'test only',
      seed: 'scenario-tech-step-bad-id',
      base: soloBase,
      steps: [{ kind: 'tech', civId: 'player', techIds: ['not-a-real-tech'] }],
    };
    expect(() => buildScenario(definition)).toThrow(ScenarioError);
  });
});

describe('diplomacy step', () => {
  it('declares war bilaterally', () => {
    const definition: ScenarioDefinition = {
      name: 'diplomacy-step-check',
      description: 'test only',
      seed: 'scenario-diplomacy-step-check',
      base: soloBase,
      steps: [{ kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' }],
    };
    const state = buildScenario(definition);
    expect(state.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
    expect(state.civilizations['ai-1'].diplomacy.atWarWith).toContain('player');
  });
});

describe('gold step', () => {
  it('adds gold to the civ', () => {
    const definition: ScenarioDefinition = {
      name: 'gold-step-check',
      description: 'test only',
      seed: 'scenario-gold-step-check',
      base: soloBase,
      steps: [{ kind: 'gold', civId: 'player', amount: 250 }],
    };
    const state = buildScenario(definition);
    expect(state.civilizations.player.gold).toBe(250);
  });
});
```

- [ ] **Step 18: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenario-steps/tech-step'`

- [ ] **Step 19: Implement the tech, diplomacy, and gold steps**

```ts
// src/testing/scenario-steps/tech-step.ts
import type { GameState } from '@/core/types';
import { getTechById } from '@/systems/tech-system';
import { ScenarioError, type TechStep } from '@/testing/scenario-types';

export function applyTechStep(state: GameState, step: TechStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in tech step`);

  for (const techId of step.techIds) {
    if (!getTechById(techId)) throw new ScenarioError(`Unknown tech id "${techId}" in tech step`);
  }

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [step.civId]: {
        ...civ,
        techState: {
          ...civ.techState,
          completed: [...new Set([...civ.techState.completed, ...step.techIds])],
        },
      },
    },
  };
}
```

```ts
// src/testing/scenario-steps/diplomacy-step.ts
import type { GameState } from '@/core/types';
import { declareWar, makePeace, signTreaty } from '@/systems/diplomacy-system';
import { ScenarioError, type DiplomacyStep } from '@/testing/scenario-types';

const ALLIANCE_TURNS_REMAINING = 999; // scenarios don't tick turns; effectively permanent

export function applyDiplomacyStep(state: GameState, step: DiplomacyStep): GameState {
  const civA = state.civilizations[step.civA];
  const civB = state.civilizations[step.civB];
  if (!civA) throw new ScenarioError(`Unknown civId "${step.civA}" in diplomacy step`);
  if (!civB) throw new ScenarioError(`Unknown civId "${step.civB}" in diplomacy step`);

  if (step.status === 'war') {
    return {
      ...state,
      civilizations: {
        ...state.civilizations,
        [step.civA]: { ...civA, diplomacy: declareWar(civA.diplomacy, step.civB, state.turn) },
        [step.civB]: { ...civB, diplomacy: declareWar(civB.diplomacy, step.civA, state.turn) },
      },
    };
  }

  if (step.status === 'peace') {
    return {
      ...state,
      civilizations: {
        ...state.civilizations,
        [step.civA]: { ...civA, diplomacy: makePeace(civA.diplomacy, step.civB, state.turn) },
        [step.civB]: { ...civB, diplomacy: makePeace(civB.diplomacy, step.civA, state.turn) },
      },
    };
  }

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [step.civA]: {
        ...civA,
        diplomacy: signTreaty(civA.diplomacy, step.civA, step.civB, 'alliance', ALLIANCE_TURNS_REMAINING, state.turn),
      },
      [step.civB]: {
        ...civB,
        diplomacy: signTreaty(civB.diplomacy, step.civB, step.civA, 'alliance', ALLIANCE_TURNS_REMAINING, state.turn),
      },
    },
  };
}
```

```ts
// src/testing/scenario-steps/gold-step.ts
import type { GameState } from '@/core/types';
import { ScenarioError, type GoldStep } from '@/testing/scenario-types';

export function applyGoldStep(state: GameState, step: GoldStep): GameState {
  const civ = state.civilizations[step.civId];
  if (!civ) throw new ScenarioError(`Unknown civId "${step.civId}" in gold step`);
  return {
    ...state,
    civilizations: { ...state.civilizations, [step.civId]: { ...civ, gold: civ.gold + step.amount } },
  };
}
```

- [ ] **Step 20: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: PASS (all suites)

- [ ] **Step 21: Write and run the hot-seat variant test**

Append to `tests/testing/scenario-builder.test.ts`:

```ts
describe('hot-seat base', () => {
  it('builds a hot-seat state with correct per-slot visibility', () => {
    const definition: ScenarioDefinition = {
      name: 'hot-seat-check',
      description: 'test only',
      seed: 'scenario-hot-seat-check',
      base: {
        kind: 'hotSeat',
        config: {
          playerCount: 2,
          mapSize: 'small',
          players: [
            { name: 'Alice', slotId: 'player-1', civType: 'generic', isHuman: true },
            { name: 'Bob', slotId: 'player-2', civType: 'generic', isHuman: true },
          ],
        },
      },
      steps: [
        { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
        { kind: 'unit', civId: 'player-1', type: 'scout', position: { q: 0, r: 0 } },
      ],
    };
    const state = buildScenario(definition);
    expect(state.hotSeat).toBeDefined();
    const scout = Object.values(state.units).find(u => u.type === 'scout' && u.owner === 'player-1');
    expect(scout).toBeDefined();
    expect(state.civilizations['player-1'].visibility.tiles[hexKey({ q: 0, r: 0 })]).toBe('visible');
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenario-builder.test.ts`
Expected: PASS

- [ ] **Step 22: Commit**

```bash
git add src/testing/scenario-builder.ts src/testing/scenario-steps/ tests/testing/scenario-builder.test.ts
git commit -m "feat(testing): add buildScenario with terrain/unit/city/camp/tech/diplomacy/gold steps"
```

---

## Task 3: Named scenario registry with the two representative bug scenarios

**Files:**
- Create: `src/testing/scenarios.ts`
- Test: `tests/testing/scenarios.test.ts`

**Interfaces:**
- Consumes: `buildScenario` (Task 2), `ScenarioDefinition` (Task 1).
- Produces: `SCENARIOS: Record<string, ScenarioDefinition>`. Task 4 (dev loader) imports this exact export.

- [ ] **Step 1: Write the failing test proving the #843 undefended-city condition**

```ts
// tests/testing/scenarios.test.ts
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';
import { hexKey } from '@/systems/hex-utils';
import { getBlockingMapEntityAt, getMovementRangeDetails } from '@/systems/unit-system';

describe('undefended-enemy-city scenario (#843)', () => {
  it('reproduces a player scout 2 hexes from an undefended, at-war AI city', () => {
    const state = buildScenario(SCENARIOS['undefended-enemy-city']);
    const scout = Object.values(state.units).find(u => u.type === 'scout' && u.owner === 'player');
    const city = Object.values(state.cities).find(c => c.owner === 'ai-1');
    expect(scout).toBeDefined();
    expect(city).toBeDefined();
    // city has no garrison unit
    expect(Object.values(state.units).some(u => hexKey(u.position) === hexKey(city!.position))).toBe(false);
    expect(state.civilizations.player.diplomacy.atWarWith).toContain('ai-1');

    // Exactly what #843's fix guards: reachable adjacency-only, not walk-through.
    const range = getMovementRangeDetails(state, scout!.id);
    const keys = range.reachable.map(hexKey);
    expect(keys).not.toContain(hexKey(city!.position));
    const blocking = getBlockingMapEntityAt(state, scout!, city!.position);
    expect(blocking).toEqual({ reason: 'foreign-city', entityId: city!.id });
  });
});

describe('undefended-barbarian-camp scenario (#845)', () => {
  it('reproduces a player unit directly adjacent to an undefended camp', () => {
    const state = buildScenario(SCENARIOS['undefended-barbarian-camp']);
    const mover = Object.values(state.units).find(u => u.owner === 'player');
    const camp = Object.values(state.barbarianCamps)[0];
    expect(mover).toBeDefined();
    expect(camp).toBeDefined();
    const blocking = getBlockingMapEntityAt(state, mover!, camp!.position);
    expect(blocking).toEqual({ reason: 'barbarian-camp', entityId: camp!.id });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenarios.test.ts`
Expected: FAIL — `Cannot find module '@/testing/scenarios'`

- [ ] **Step 3: Write the scenario registry**

```ts
// src/testing/scenarios.ts
/**
 * Named, reusable scenarios (#846). Both Vitest tests and the DEV-only
 * `?scenario=` browser loader (game-session-controller.ts) build from this
 * exact registry via buildScenario — no duplicate construction path.
 */
import type { ScenarioDefinition } from '@/testing/scenario-types';

export const SCENARIOS: Record<string, ScenarioDefinition> = {
  'undefended-enemy-city': {
    name: 'undefended-enemy-city',
    description:
      'Player scout 2 hexes from an undefended AI city while at war — validates #843 '
      + '(the city blocks movement/is assault-reachable only from direct adjacency, '
      + 'never walked through or treated as reachable from further away).',
    seed: 'scenario-undefended-enemy-city',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Undefended Enemy City' },
    },
    steps: [
      { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 1, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 2, r: 0 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 3, r: 0 }, terrain: 'plains' },
      { kind: 'diplomacy', civA: 'player', civB: 'ai-1', status: 'war' },
      { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 } },
      { kind: 'city', civId: 'ai-1', position: { q: 2, r: 0 } },
    ],
  },
  'undefended-barbarian-camp': {
    name: 'undefended-barbarian-camp',
    description:
      'Player unit directly adjacent to an undefended barbarian camp — validates #845 '
      + '(one-step camp assault; barbarians need no war check per game-systems.md).',
    seed: 'scenario-undefended-barbarian-camp',
    base: {
      kind: 'solo',
      config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'Undefended Barbarian Camp' },
    },
    steps: [
      { kind: 'terrain', position: { q: 5, r: 5 }, terrain: 'plains' },
      { kind: 'terrain', position: { q: 6, r: 5 }, terrain: 'plains' },
      { kind: 'unit', civId: 'player', type: 'warrior', position: { q: 5, r: 5 } },
      { kind: 'camp', position: { q: 6, r: 5 } },
    ],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/testing/scenarios.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/testing/scenarios.ts tests/testing/scenarios.test.ts
git commit -m "feat(testing): add undefended-enemy-city and undefended-barbarian-camp scenarios (#843/#845)"
```

---

## Task 4: DEV-only `?scenario=` browser loader

**Files:**
- Modify: `src/app/controllers/game-session-controller.ts:105` (widen the `campaignEntry` Pick), `game-session-controller.ts:349` (insert the new branch before the existing `MODE === 'e2e'` branch)
- Test: `tests/app/game-session-controller-scenario-loader.test.ts`

**Interfaces:**
- Consumes: `SCENARIOS` (Task 3), `buildScenario` (Task 2), `CampaignEntryController.enterCampaign` (existing).

- [ ] **Step 1: Read current state of the two edit sites**

Run: `sed -n '100,110p;345,385p' src/app/controllers/game-session-controller.ts`

Confirm line 105 currently reads:
```ts
  readonly campaignEntry: Pick<CampaignEntryController, 'showStartSavePanel' | 'showGameModeSelection' | 'enterCampaignForE2E'>;
```
and line 350 opens `if (import.meta.env.MODE === 'e2e') {`. If either has drifted (another PR touched this file), re-locate the equivalent lines before editing — do not blind-patch by line number.

- [ ] **Step 2: Widen the campaignEntry Pick to include `enterCampaign`**

Modify `src/app/controllers/game-session-controller.ts:105`:

```ts
// Before:
  readonly campaignEntry: Pick<CampaignEntryController, 'showStartSavePanel' | 'showGameModeSelection' | 'enterCampaignForE2E'>;

// After:
  readonly campaignEntry: Pick<CampaignEntryController, 'showStartSavePanel' | 'showGameModeSelection' | 'enterCampaignForE2E' | 'enterCampaign'>;
```

- [ ] **Step 3: Insert the DEV-only scenario branch**

Modify `src/app/controllers/game-session-controller.ts`, immediately before the existing `if (import.meta.env.MODE === 'e2e') {` line (currently line 350):

```ts
    // #846: developer scenario loader. import.meta.env.DEV is a Vite
    // compile-time constant (true for `vite`/`vite dev`, false for
    // `vite build`) — this whole branch, and the dynamic imports inside it,
    // are dead code eliminated from the production bundle. Distinct from the
    // MODE === 'e2e' branch below: this is reachable under plain `yarn dev`,
    // not only the Playwright test build.
    if (import.meta.env.DEV) {
      const scenarioName = new URLSearchParams(window.location.search).get('scenario');
      if (scenarioName) {
        const { SCENARIOS } = await import('@/testing/scenarios');
        const definition = SCENARIOS[scenarioName];
        if (!definition) {
          throw new Error(`Unknown scenario "${scenarioName}". Known scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
        }
        const { buildScenario } = await import('@/testing/scenario-builder');
        await deps.campaignEntry.enterCampaign(buildScenario(definition), `Scenario: ${definition.name}`);
        return;
      }
    }

```

This goes directly above the existing:
```ts
    if (import.meta.env.MODE === 'e2e') {
```

- [ ] **Step 4: Write the test**

```ts
// tests/app/game-session-controller-scenario-loader.test.ts
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';

// This test does not spin up the full GameSessionController (that needs a
// DOM, canvas, audio system, etc. — out of scope here). It instead proves
// the two invariants Task 4's manual code change depends on: (1) every name
// a developer might type resolves through the same SCENARIOS registry the
// Vitest suite uses, and (2) an unknown name is a clear, catchable error
// rather than a silent no-op — matching the `throw new Error(...)` in the
// controller branch itself.
describe('scenario loader contract', () => {
  it('SCENARIOS has at least the two representative bug scenarios', () => {
    expect(Object.keys(SCENARIOS)).toEqual(
      expect.arrayContaining(['undefended-enemy-city', 'undefended-barbarian-camp']),
    );
  });

  it('every registered scenario builds without throwing', () => {
    for (const name of Object.keys(SCENARIOS)) {
      expect(() => buildScenario(SCENARIOS[name]), `scenario "${name}"`).not.toThrow();
    }
  });

  it('mirrors the controller branch\'s unknown-name error message shape', () => {
    const scenarioName = 'not-a-real-scenario';
    const definition = SCENARIOS[scenarioName as keyof typeof SCENARIOS];
    expect(definition).toBeUndefined();
    const buildErrorMessage = () =>
      `Unknown scenario "${scenarioName}". Known scenarios: ${Object.keys(SCENARIOS).join(', ')}`;
    expect(buildErrorMessage()).toContain('undefended-enemy-city');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/game-session-controller-scenario-loader.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full architecture-boundary test to confirm the widened Pick doesn't violate composition-root rules**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/architecture-boundaries.test.ts`
Expected: PASS

- [ ] **Step 7: Manually verify under `yarn dev`**

Run: `bash scripts/run-with-mise.sh yarn dev` (or use the project's `run`/preview tooling), then open
`http://localhost:5173/?scenario=undefended-enemy-city` in a browser and confirm the game loads directly
into the scenario (no start-menu, an AI city visible near the player's scout). Then try
`http://localhost:5173/?scenario=not-a-real-name` and confirm the console shows the
"Unknown scenario" error rather than a silent blank screen.

- [ ] **Step 8: Commit**

```bash
git add src/app/controllers/game-session-controller.ts tests/app/game-session-controller-scenario-loader.test.ts
git commit -m "feat(app): add DEV-only ?scenario= developer loader (#846)"
```

---

## Task 5: Documentation

**Files:**
- Create: `docs/scenario-infrastructure.md`

- [ ] **Step 1: Write the doc**

```markdown
# Scenario Infrastructure

Deterministically reproduce a specific game state for debugging or regression testing,
without playing dozens of turns. See the design rationale in
`docs/superpowers/specs/2026-08-16-issue-846-scenario-infrastructure-design.md`.

## How it works

A `ScenarioDefinition` (`src/testing/scenario-types.ts`) names a `base` config
(everything `createNewGame`/`createHotSeatGame` needs: civ, map size, seed) plus a list
of typed `steps` (`terrain`, `unit`, `city`, `camp`, `tech`, `diplomacy`, `gold`).
`buildScenario()` (`src/testing/scenario-builder.ts`) folds a definition into a real
`GameState` by calling the same canonical system helpers gameplay itself uses
(`createUnit`, `foundCity`, `declareWar`, ...) — never a hand-built partial state.

## Creating a scenario

Add an entry to `SCENARIOS` in `src/testing/scenarios.ts`:

```ts
'my-new-scenario': {
  name: 'my-new-scenario',
  description: 'One sentence: what condition this reproduces and why.',
  seed: 'scenario-my-new-scenario',
  base: { kind: 'solo', config: { civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'My New Scenario' } },
  steps: [
    { kind: 'terrain', position: { q: 0, r: 0 }, terrain: 'plains' },
    { kind: 'unit', civId: 'player', type: 'scout', position: { q: 0, r: 0 } },
  ],
},
```

## Running one manually

```bash
bash scripts/run-with-mise.sh yarn dev
```

Then open `http://localhost:5173/?scenario=my-new-scenario`. This only works in dev mode
(`import.meta.env.DEV`) — see "Production isolation" below.

## Using one in a test

```ts
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';

const state = buildScenario(SCENARIOS['undefended-enemy-city']);
// state is a real GameState — pass it directly to whatever system you're testing.
```

## What NOT to represent directly

Do not add a step `kind` that lets a caller push a raw partial `Unit`/`City`/other
entity — every step must map to a canonical constructor (`createUnit`, `foundCity`,
...) plus narrow `overrides`. If you find yourself hand-writing gameplay fields
(strength, movement, yields) in a step, that is a sign the step should call a real
system helper instead.

## How canonical state is derived

Everything not named in `base`/`steps` — map, starting units for every civ, initial
visibility, minor civs, espionage state, idCounters — comes from
`createNewGame`/`createHotSeatGame`, called once at the start of `buildScenario`. Steps
only add the specific delta a scenario needs. After all steps run, `buildScenario`
recomputes visibility/contacts for every civ via the same system calls
`createNewGame` itself uses — never hand-set.

## Production/debug isolation guarantees

- The browser loader is gated on `import.meta.env.DEV`, a Vite compile-time constant —
  `false` for `vite build` (production), so the branch and its dynamic imports are
  eliminated from the production bundle, not merely hidden behind a runtime check.
- The loader only accepts a name that must match a key in the closed `SCENARIOS`
  registry — an unknown name throws, it never falls through to arbitrary behavior.
- Building a scenario never mutates a live `GameSession` — `buildScenario` is a pure
  function; the only thing that touches `GameSession` is the same
  `campaignEntry.enterCampaign(...)` call every other game-entry path already uses.
```

- [ ] **Step 2: Commit**

```bash
git add docs/scenario-infrastructure.md
git commit -m "docs: document scenario infrastructure usage (#846)"
```

---

## Task 6: Full validation pass

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all suites pass, 0 failures.

- [ ] **Step 2: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0.

- [ ] **Step 3: Confirm the scenario module graph is absent from the production bundle**

Run:
```bash
grep -rl "undefended-enemy-city" dist/assets/*.js
```
Expected: no matches (empty output, `grep` exits 1). If it matches, the DEV gate in Task 4 Step 3 did not tree-shake correctly — check that `import.meta.env.DEV` (not a runtime variable) guards both the branch and the dynamic imports.

- [ ] **Step 4: Run the hook smoke tests**

Run: `bash scripts/run-with-mise.sh yarn test:hooks`
Expected: exits 0 — confirms `check-src-edit.sh` has no complaints about the new/modified files (direct `session.getState()` mutation, etc.).

- [ ] **Step 5: Check for whitespace/newline issues**

Run: `git diff --check`
Expected: no output.

- [ ] **Step 6: Final full-suite confirmation before considering this plan done**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: exits 0. This is the same command the `require-green-before-push` hook runs before any `git push`/`gh pr create` — confirming it here avoids a surprise at push time.
