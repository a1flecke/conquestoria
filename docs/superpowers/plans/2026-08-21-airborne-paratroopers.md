# Airborne Paratroopers Implementation Plan

> ✅ **All 15 tasks merged (2026-08-21)** — executed inline, task-by-task, in this branch. Tasks 1-14 landed as originally scoped; a real regression surfaced only by the Task 15 full-suite run (pacing-audit's outlier gate, Paratrooper's `power-spike` vs `core` band) was fixed in a follow-up commit on the same branch. See `docs/superpowers/specs/2026-08-21-airborne-paratroopers-design.md` for the approved design this plan implements. Helicopter air assault (spec §18) and a transport plane (spec §19) remain deliberately deferred — not part of this phase.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This repo's CLAUDE.md forbids subagents/parallel agents — execute inline, not via subagent-driven-development.**

**Goal:** Add a Paratrooper land unit and a canonical `paradrop` action — relocate from a friendly airfield city to a visible, legal tile within range, landing vulnerable — plus a new flak-risk extension to the existing air-defense system, fully wired through UI, AI, saves, and hot-seat.

**Architecture:** One new system module (`src/systems/airborne-system.ts`) owns all paradrop legality/execution as paired `get*`/`can*`/`execute*` functions, following the exact pattern `air-operations-system.ts` and `transport-system.ts` already use. UI, AI candidate generation, AI lookahead simulation, and AI execution all call the same functions — no parallel legality paths. Landing vulnerability reuses existing `hasActed`/`hasMoved`/`movementPointsLeft` flags (no new persisted field, no save migration). A new `getHostileAirDefenseThreat` query is added to the existing `air-defense-system.ts` by flipping its provider-lookup direction (hostile-civ coverage of a point, instead of a defender's own-civ coverage) — no second air-defense system.

**Tech Stack:** TypeScript, Vitest, Canvas 2D renderer, DOM/CSS UI panels. No new dependencies.

## Global Constraints

- No `Math.random()` anywhere — flak damage is deterministic (no RNG at all); interception reuses `deterministicCombatSeed`.
- Every system function that mutates `GameState` returns a new state via spread-copy; never write through `state.units[id] = ...`.
- `state.currentPlayer` for all ownership/visibility checks — never hardcode `'player'`.
- Game-consequence notifications go through `notification-delivery`'s `deliver(civId, ...)`, never `showNotification` (that's for the acting player's own immediate feedback only).
- New buttons in `src/ui/` need `style.cssText`/`Object.assign` with background+color, or use the file's existing `makeButton` helper (already compliant) — never a bare `createElement('button')`.
- `textContent`/`createTextNode()` for all dynamic UI text — never `innerHTML` with game-generated strings.
- Paratrooper: `strength: 50`, `movementPoints: 2`, `visionRange: 2`, `productionCost: 210`, `domain: 'land'`, `techRequired: 'air-superiority'`, `requiredTechs: ['armored-tactics']`, terminal (no `upgradesTo`).
- Paradrop: `range: 4` hexes from launch city, launch requires the unit standing on a friendly city with `'airfield'` in `city.buildings`.
- Flak damage: flat, deterministic, equal to the strongest applicable hostile AA provider's `defenseModifier` (8 or 12) — never RNG-based, never independently lethal to a full-health unit.
- No difficulty tier may change legal targets, visible information, flak/interception mechanics, or the landing lockout — only AI scoring weights vary by difficulty.
- Every jargon term ("flak", "SAM Site") in player-facing copy must carry a plain-language gloss in the same string.
- Risk highlight overlays must be distinguishable by `type`/icon, not color alone.

---

## File Structure

| File | Change |
|---|---|
| `src/core/types.ts` | Add `'paratrooper'` to `UnitType`; add `paradrop?: ParadropCapability` to `UnitDefinition`; add `ParadropCapability` interface |
| `src/app/ports.ts` | Add `{ kind: 'paradrop'; unitId: string }` to `PendingMapIntent` |
| `src/input/map-tap-intent.ts` | Widen `ResolvablePendingIntent` and the pending-check to include `'paradrop'` |
| `src/systems/air-operations-system.ts` | Export `getAirBaseKind` (was private) |
| `src/systems/unit-system.ts` | Export `isBlockingCityFor` (was private); add `paratrooper` to `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` |
| `src/systems/air-defense-system.ts` | Add `providersForOwner` export (was private); add `getHostileAirDefenseThreat`, `getKnownHostileAirDefenseThreat` |
| `src/systems/airborne-system.ts` | **New.** `ParadropFailureReason`, `getParadropLaunchState`, `getParadropTargets`, `canParadrop`, `executeParadrop`, `notifyParadropOutcome` (viewer-scoped `appendNotification` calls for both civs, so it fires for human- and AI-triggered drops alike) |
| `src/systems/city-system.ts` | Add `paratrooper` to `TRAINABLE_UNITS` + `PRODUCTION_ICONS` |
| `src/systems/tech-definitions-eras9.ts` | Add `'paratrooper'` to `air-superiority`'s `unlocksUnits` |
| `src/systems/combat-role-definitions.ts` | Add `paratrooper` role entry |
| `src/renderer/sprites/sprite-catalog.ts` | Add `paratrooper` to `UNIT_MOTION_STYLES` + `UNIT_SPRITE_CATALOG` (aliases `InfantrySprite`, matching the existing `mechanized_infantry` alias) |
| `src/ai/ai-tactics.ts` | Add `'paradrop'` to `AITacticalAction`; add private `rankParadrop`, spread into `rankUnitTacticalActions` (the sole exported aggregator); add case to `applyPredictedAction`'s lookahead switch |
| `src/ai/ai-major-turn.ts` | Add case to `executeAction` switch |
| `src/app/controllers/map-interaction-controller.ts` | Add `case 'paradrop':` to the `resolve-pending` switch (acting-player toast + SFX only — cross-civ notification lives in `airborne-system.ts`, not here) |
| `src/app/controllers/selection-controller.ts` | Wire `onStartParadrop`/`getParadropTargets` callbacks, `pendingIntent`, highlights, range/flak preview text |
| `src/ui/selected-unit-info.ts` | Add Paradrop button + accessible preview text |
| `tests/systems/airborne-system.test.ts` | **New.** Core legality/execution/notification coverage |
| `tests/systems/air-defense-system.test.ts` | Extend with hostile-threat coverage + regression |
| `tests/ai/ai-tactics.test.ts` | Extend `rankUnitTacticalActions` coverage for paradrop candidates |
| `tests/systems/airborne-balance.test.ts` | **New.** Statistical/representative-situation coverage |
| `tests/systems/airborne-hotseat.test.ts` | **New.** Two-civ discovery isolation, handoff |
| `tests/systems/airborne-save.test.ts` | **New.** Save/load round-trip |

---

### Task 1: Export reusable helpers from existing systems

**Files:**
- Modify: `src/systems/air-operations-system.ts` (the private `getAirBaseKind` function)
- Modify: `src/systems/unit-system.ts` (the private `isBlockingCityFor` function)
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/unit-system.test.ts`

**Interfaces:**
- Produces: `export function getAirBaseKind(state: GameState, base: AirBaseRef): string | undefined` from `air-operations-system.ts`
- Produces: `export function isBlockingCityFor(state: GameState, unit: Unit, city: City): boolean` from `unit-system.ts`

Both functions already exist and are fully correct — this task only changes their visibility, with a regression test proving no existing caller's behavior changed.

- [x] **Step 1: Write the failing regression test for `getAirBaseKind`**

Add to `tests/systems/air-operations-system.test.ts` (open the file first to match its existing fixture-building helpers — reuse whatever `makeState`/`makeCity` helpers it already has rather than inventing new ones):

```typescript
import { getAirBaseKind } from '@/systems/air-operations-system';

it('getAirBaseKind is exported and returns the building kind for a city base', () => {
  const state = makeStateWithAirfieldCity(); // reuse this file's existing city-with-airfield fixture builder
  const cityId = Object.keys(state.cities)[0]!;
  expect(getAirBaseKind(state, { kind: 'city', cityId })).toBe('airfield');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts -t "getAirBaseKind is exported"`
Expected: FAIL — `getAirBaseKind` is not exported from the module.

- [x] **Step 3: Export the function**

In `src/systems/air-operations-system.ts`, change:
```typescript
function getAirBaseKind(state: GameState, base: AirBaseRef) {
```
to:
```typescript
export function getAirBaseKind(state: GameState, base: AirBaseRef): string | undefined {
```
(Add the explicit return type annotation since it's now part of the module's public surface.)

- [x] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts -t "getAirBaseKind is exported"`
Expected: PASS

- [x] **Step 5: Repeat Steps 1-4 for `isBlockingCityFor`**

Test (add to `tests/systems/unit-system.test.ts`, reusing its existing city/unit fixture helpers):
```typescript
import { isBlockingCityFor } from '@/systems/unit-system';

it('isBlockingCityFor is exported and blocks a foreign unallied city', () => {
  const state = makeStateWithTwoCivs(); // reuse this file's existing two-civ fixture builder
  const foreignCity = Object.values(state.cities).find(c => c.owner !== 'civ-a')!;
  const unit = Object.values(state.units).find(u => u.owner === 'civ-a')!;
  expect(isBlockingCityFor(state, unit, foreignCity)).toBe(true);
});
```
Change `function isBlockingCityFor(...)` to `export function isBlockingCityFor(...): boolean` in `src/systems/unit-system.ts`.

- [x] **Step 6: Run both full test files to confirm zero regressions**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts tests/systems/unit-system.test.ts`
Expected: PASS, same pass count as before this task plus the 2 new tests.

- [x] **Step 7: Commit**

```bash
git add src/systems/air-operations-system.ts src/systems/unit-system.ts tests/systems/air-operations-system.test.ts tests/systems/unit-system.test.ts
git commit -m "refactor(#543): export getAirBaseKind and isBlockingCityFor for paradrop reuse"
```

---

### Task 2: Add the Paratrooper unit type and definition

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Test: `tests/systems/unit-system.test.ts`

**Interfaces:**
- Produces: `UnitType` includes `'paratrooper'`
- Produces: `ParadropCapability { range: number; baseKinds: Array<'airfield'> }` on `UnitDefinition.paradrop?`
- Produces: `UNIT_DEFINITIONS.paratrooper: UnitDefinition`, `UNIT_DESCRIPTIONS.paratrooper: string`

- [x] **Step 1: Write the failing test**

Add to `tests/systems/unit-system.test.ts`:

```typescript
import { UNIT_DEFINITIONS, UNIT_DESCRIPTIONS } from '@/systems/unit-system';

describe('paratrooper unit definition', () => {
  it('is a terminal era-9 land unit weaker than contemporary Infantry', () => {
    const paratrooper = UNIT_DEFINITIONS.paratrooper;
    const infantry = UNIT_DEFINITIONS.infantry;
    expect(paratrooper.domain).toBe('land');
    expect(paratrooper.strength).toBeLessThan(infantry.strength);
    expect(paratrooper.techRequired).toBe('air-superiority');
    expect(paratrooper.requiredTechs).toEqual(['armored-tactics']);
    expect(paratrooper.upgradesTo).toBeUndefined();
    expect(paratrooper.paradrop).toEqual({ range: 4, baseKinds: ['airfield'] });
  });

  it('has a plain-language, mechanically honest description', () => {
    expect(UNIT_DESCRIPTIONS.paratrooper).toMatch(/paradrop/i);
    expect(UNIT_DESCRIPTIONS.paratrooper).not.toMatch(/instant|guaranteed|unstoppable/i);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts -t "paratrooper unit definition"`
Expected: FAIL — `UNIT_DEFINITIONS.paratrooper` is undefined.

- [x] **Step 3: Add the type additions**

In `src/core/types.ts`, find the `UnitType` union (search for the string containing `'exosuit_infantry'`) and add `'paratrooper'` to it — insert it near `'infantry'`/`'mechanized_infantry'` for readability, exact position doesn't matter to the type system.

Find the `AirOperationDefinition` interface (search `interface AirOperationDefinition`) and add a new sibling interface immediately after it:

```typescript
export interface ParadropCapability {
  /** Hex distance from the launch city, wrap-aware. Not related to airOperation's operationalRange/ferryRange — this unit isn't an aircraft. */
  range: number;
  /** Building kinds on a friendly city that make it a valid launch point. */
  baseKinds: Array<'airfield'>;
}
```

Find the `UnitDefinition` interface's `airOperation?: AirOperationDefinition;` line and add immediately after it:
```typescript
  paradrop?: ParadropCapability;
```

- [x] **Step 4: Add the unit definition**

In `src/systems/unit-system.ts`, add to `UNIT_DEFINITIONS` (place it near the other era-9 land units, e.g. right after the `mechanized_infantry` entry, to keep era-adjacent units grouped as the file already does):

```typescript
  paratrooper: {
    type: 'paratrooper', name: 'Paratrooper', movementPoints: 2,
    visionRange: 2, strength: 50, canFoundCity: false,
    canBuildImprovements: false, productionCost: 210,
    domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    techRequired: 'air-superiority', requiredTechs: ['armored-tactics'],
    paradrop: { range: 4, baseKinds: ['airfield'] },
  },
```

Add to `UNIT_DESCRIPTIONS` (near the `infantry`/`mechanized_infantry` entries):
```typescript
  paratrooper: 'Airborne infantry. Paradrops from a friendly Airfield city onto any visible tile within range, but lands with no movement and cannot act again that turn. Weaker in a stand-up fight than Infantry — its value is repositioning, not raw combat strength. Does not upgrade further.',
```

- [x] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts -t "paratrooper unit definition"`
Expected: PASS

- [x] **Step 6: Run `yarn build` to catch every `Record<UnitType, ...>` the compiler now requires an entry for**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAILS with TypeScript errors listing every exhaustive `Record<UnitType, X>` map missing a `paratrooper` key (e.g. `UNIT_MOTION_STYLES`, `UNIT_SPRITE_CATALOG`, `PRODUCTION_ICONS`, `UNIT_ROLE_DEFINITIONS`, `combatRoleOf`-style maps). **This error list is the authoritative checklist for Tasks 6-8 below — record every file it names now**, since some may not already be listed in this plan's File Structure table if the current file layout has more exhaustive maps than this plan's audit found.

- [x] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts tests/systems/unit-system.test.ts
git commit -m "feat(#543): add Paratrooper unit type and definition"
```

(The `yarn build` failure from Step 6 is expected and will be fixed incrementally by later tasks — do not try to make `yarn build` pass yet.)

---

### Task 3: `airborne-system.ts` — launch eligibility and target legality

**Files:**
- Create: `src/systems/airborne-system.ts`
- Test: `tests/systems/airborne-system.test.ts`

**Interfaces:**
- Consumes: `UNIT_DEFINITIONS` from `@/systems/unit-system`; `getAirBaseKind` from `@/systems/air-operations-system` (Task 1); `isBlockingCityFor` from `@/systems/unit-system` (Task 1); `getVisibility` from `@/systems/fog-of-war`; `buildUnitOccupancy`, `getUnitIdsAtCoord` from `@/systems/unit-occupancy`; `getMovementCostForUnit` from `@/systems/unit-system`; `hexKey`, `hexesInRange`, `getWrappedHexesInRange`, `hexDistance`, `wrappedHexDistance` from `@/systems/hex-utils`.
- Produces:
  ```typescript
  export type ParadropFailureReason =
    | 'not-airborne-unit' | 'no-launch-base' | 'already-acted'
    | 'out-of-range' | 'unexplored' | 'impassable-terrain'
    | 'destination-occupied' | 'foreign-city';
  export interface ParadropLaunchState { ok: true } | { ok: false; reason: ParadropFailureReason }
  export function getParadropLaunchState(state: GameState, unitId: string): ParadropLaunchState;
  export function getParadropTargets(state: GameState, unitId: string): HexCoord[];
  export function canParadrop(state: GameState, unitId: string, destination: HexCoord): { ok: true } | { ok: false; reason: ParadropFailureReason };
  ```

- [x] **Step 1: Write the failing tests**

Create `tests/systems/airborne-system.test.ts`. Base the fixture helpers on the pattern already used in `tests/systems/air-operations-system.test.ts` (open it first and reuse its map/city/unit builder style — do not invent a divergent fixture shape). Cover every case below with a real state, not a mock:

```typescript
import { describe, it, expect } from 'vitest';
import { getParadropLaunchState, getParadropTargets, canParadrop } from '@/systems/airborne-system';
import type { GameState } from '@/core/types';

// Build a minimal deterministic map + two civs + a paratrooper standing on
// an airfield city, mirroring air-operations-system.test.ts's fixture style.
function makeParadropFixture(): { state: GameState; unitId: string; cityId: string } {
  // Implementer: construct with a small flat map, one civ with a city that
  // has 'airfield' in buildings, one paratrooper unit positioned on that
  // city's tile with movementPointsLeft > 0 and hasActed: false, matching
  // the shape air-operations-system.test.ts's city-with-airfield fixture
  // already builds for aircraft. Reuse that helper directly if it already
  // parameterizes the building list; do not duplicate map-building logic.
  throw new Error('implement using this file\'s existing fixture conventions');
}

describe('getParadropLaunchState', () => {
  it('rejects a unit with no paradrop capability', () => {
    const { state } = makeParadropFixture();
    const infantryId = 'infantry-1'; // add a plain infantry unit to the fixture
    expect(getParadropLaunchState(state, infantryId)).toEqual({ ok: false, reason: 'not-airborne-unit' });
  });

  it('rejects a paratrooper not standing on an airfield city', () => {
    const { state, unitId } = makeParadropFixture();
    const moved = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, position: { q: 99, r: 99 } } } };
    expect(getParadropLaunchState(moved, unitId)).toEqual({ ok: false, reason: 'no-launch-base' });
  });

  it('rejects a paratrooper that already acted this turn', () => {
    const { state, unitId } = makeParadropFixture();
    const acted = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, hasActed: true } } };
    expect(getParadropLaunchState(acted, unitId)).toEqual({ ok: false, reason: 'already-acted' });
  });

  it('accepts an eligible paratrooper on an airfield city', () => {
    const { state, unitId } = makeParadropFixture();
    expect(getParadropLaunchState(state, unitId)).toEqual({ ok: true });
  });
});

describe('getParadropTargets', () => {
  it('excludes tiles beyond paradrop range', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    for (const target of targets) {
      // fixture's launch city is at a known origin — assert no target exceeds range 4
      expect(Math.max(Math.abs(target.q), Math.abs(target.r), Math.abs(target.q + target.r))).toBeLessThanOrEqual(4);
    }
  });

  it('excludes unexplored tiles even if within range', () => {
    const { state, unitId } = makeParadropFixture();
    // fixture must include at least one in-range tile marked 'unexplored' in visibility
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 3 && t.r === 3)).toBe(false); // the unexplored fixture tile
  });

  it('excludes an occupied tile', () => {
    const { state, unitId } = makeParadropFixture();
    // fixture must include a friendly unit occupying an otherwise-legal in-range tile
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 0)).toBe(false); // the occupied fixture tile
  });

  it('excludes a foreign unallied city tile even though it is visible and in range', () => {
    const { state, unitId } = makeParadropFixture();
    // fixture must include a hostile civ's city within range
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 2 && t.r === 0)).toBe(false); // the foreign-city fixture tile
  });

  it('excludes impassable terrain (ocean) for a land unit', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === -1 && t.r === 2)).toBe(false); // the ocean fixture tile
  });

  it('includes a plain visible, passable, unoccupied in-range tile', () => {
    const { state, unitId } = makeParadropFixture();
    const targets = getParadropTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 1)).toBe(true); // the legal fixture tile
  });
});

describe('canParadrop', () => {
  it('rejects a tile outside getParadropTargets with the correct reason', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: 99, r: 99 })).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('accepts a tile inside getParadropTargets', () => {
    const { state, unitId } = makeParadropFixture();
    expect(canParadrop(state, unitId, { q: 1, r: 1 })).toEqual({ ok: true });
  });
});
```

Fill in `makeParadropFixture` with a real fixture before running — follow `tests/systems/air-operations-system.test.ts`'s existing map/city/unit construction helpers exactly rather than writing new ones from scratch, so the two test files share fixture conventions.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [x] **Step 3: Implement `airborne-system.ts`**

```typescript
import type { GameState, HexCoord, Unit } from '@/core/types';
import { getAirBaseKind } from '@/systems/air-operations-system';
import { isBlockingCityFor, UNIT_DEFINITIONS, getMovementCostForUnit } from '@/systems/unit-system';
import { getVisibility } from '@/systems/fog-of-war';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';
import { hexKey, hexesInRange, getWrappedHexesInRange, hexDistance, wrappedHexDistance } from '@/systems/hex-utils';

export type ParadropFailureReason =
  | 'not-airborne-unit' | 'no-launch-base' | 'already-acted'
  | 'out-of-range' | 'unexplored' | 'impassable-terrain'
  | 'destination-occupied' | 'foreign-city';

export type ParadropLaunchState =
  | { ok: true }
  | { ok: false; reason: ParadropFailureReason };

export const PARADROP_FAILURE_MESSAGES: Record<ParadropFailureReason, string> = {
  'not-airborne-unit': 'This unit cannot paradrop.',
  'no-launch-base': 'Stand in a friendly city with an Airfield to paradrop.',
  'already-acted': 'This unit has already acted this turn.',
  'out-of-range': 'That tile is outside paradrop range.',
  'unexplored': 'You have not explored that tile.',
  'impassable-terrain': 'A Paratrooper cannot land there.',
  'destination-occupied': 'That tile is occupied.',
  'foreign-city': 'Move adjacent, then use the city assault action.',
};

function paradropDistance(state: GameState, from: HexCoord, to: HexCoord): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(from, to, state.map.width) : hexDistance(from, to);
}

export function getParadropLaunchState(state: GameState, unitId: string): ParadropLaunchState {
  const unit = state.units[unitId];
  const capability = unit && UNIT_DEFINITIONS[unit.type].paradrop;
  if (!unit || !capability) return { ok: false, reason: 'not-airborne-unit' };
  if (unit.hasActed || unit.movementPointsLeft <= 0) return { ok: false, reason: 'already-acted' };
  const launchCity = Object.values(state.cities).find(city =>
    city.owner === unit.owner && hexKey(city.position) === hexKey(unit.position));
  const baseKind = launchCity && getAirBaseKind(state, { kind: 'city', cityId: launchCity.id });
  if (!launchCity || !baseKind || !capability.baseKinds.includes(baseKind as 'airfield')) {
    return { ok: false, reason: 'no-launch-base' };
  }
  return { ok: true };
}

export function getParadropTargets(state: GameState, unitId: string): HexCoord[] {
  const launchState = getParadropLaunchState(state, unitId);
  if (!launchState.ok) return [];
  const unit = state.units[unitId]!;
  const capability = UNIT_DEFINITIONS[unit.type].paradrop!;
  const visibility = state.civilizations[unit.owner]?.visibility;
  const occupancy = buildUnitOccupancy(state.units);
  const candidates = state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, capability.range, state.map.width)
    : hexesInRange(unit.position, capability.range);

  return candidates.filter(coord => {
    if (visibility && getVisibility(visibility, coord) !== 'visible') return false;
    const tile = state.map.tiles[hexKey(coord)];
    if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) return false;
    if (getUnitIdsAtCoord(occupancy, coord).length > 0) return false;
    const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(coord));
    if (city && isBlockingCityFor(state, unit, city)) return false;
    return true;
  });
}

export function canParadrop(state: GameState, unitId: string, destination: HexCoord): { ok: true } | { ok: false; reason: ParadropFailureReason } {
  const launchState = getParadropLaunchState(state, unitId);
  if (!launchState.ok) return launchState;
  const unit = state.units[unitId]!;
  const capability = UNIT_DEFINITIONS[unit.type].paradrop!;
  const visibility = state.civilizations[unit.owner]?.visibility;

  if (paradropDistance(state, unit.position, destination) > capability.range) return { ok: false, reason: 'out-of-range' };
  if (visibility && getVisibility(visibility, destination) !== 'visible') return { ok: false, reason: 'unexplored' };
  const tile = state.map.tiles[hexKey(destination)];
  if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) {
    return { ok: false, reason: 'impassable-terrain' };
  }
  const occupancy = buildUnitOccupancy(state.units);
  if (getUnitIdsAtCoord(occupancy, destination).length > 0) return { ok: false, reason: 'destination-occupied' };
  const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(destination));
  if (city && isBlockingCityFor(state, unit, city)) return { ok: false, reason: 'foreign-city' };

  // Cross-check against getParadropTargets rather than trusting the individual
  // checks above to stay in sync forever — if the two diverge, out-of-range
  // is the most informative fallback reason for an otherwise-unexplained miss.
  const inTargets = getParadropTargets(state, unitId).some(t => hexKey(t) === hexKey(destination));
  if (!inTargets) return { ok: false, reason: 'out-of-range' };
  return { ok: true };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/systems/airborne-system.ts tests/systems/airborne-system.test.ts
git commit -m "feat(#543): add paradrop launch and target legality (airborne-system.ts)"
```

---

### Task 4: `executeParadrop` — relocation and landing lockout (no flak/interception yet)

**Files:**
- Modify: `src/systems/airborne-system.ts`
- Test: `tests/systems/airborne-system.test.ts`

**Interfaces:**
- Consumes: `canParadrop` (Task 3)
- Produces:
  ```typescript
  export type ParadropResult =
    | { ok: true; state: GameState; flak?: { damage: number; providerId: string; providerLabel: string }; interception?: { interceptorId: string; result: import('@/core/types').CombatResult } }
    | { ok: false; state: GameState; reason: ParadropFailureReason };
  export function executeParadrop(state: GameState, unitId: string, destination: HexCoord): ParadropResult;
  ```
  (This task implements relocation + lockout only; `flak`/`interception` fields stay always-`undefined` until Task 6 wires them.)

- [x] **Step 1: Write the failing tests**

Add to `tests/systems/airborne-system.test.ts`:

```typescript
import { executeParadrop } from '@/systems/airborne-system';

describe('executeParadrop', () => {
  it('rejects an illegal destination without mutating state', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 99, r: 99 });
    expect(result).toEqual({ ok: false, state, reason: 'out-of-range' });
  });

  it('relocates the unit and applies the landing lockout on success', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const landed = result.state.units[unitId]!;
    expect(landed.position).toEqual({ q: 1, r: 1 });
    expect(landed.movementPointsLeft).toBe(0);
    expect(landed.hasMoved).toBe(true);
    expect(landed.hasActed).toBe(true);
  });

  it('does not mutate the input state object', () => {
    const { state, unitId } = makeParadropFixture();
    const before = JSON.stringify(state);
    executeParadrop(state, unitId, { q: 1, r: 1 });
    expect(JSON.stringify(state)).toBe(before);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts -t "executeParadrop"`
Expected: FAIL — `executeParadrop` is not exported.

- [x] **Step 3: Implement the relocation-only version**

Append to `src/systems/airborne-system.ts`:

```typescript
import type { CombatResult } from '@/core/types';

export type ParadropResult =
  | { ok: true; state: GameState; flak?: { damage: number; providerId: string; providerLabel: string }; interception?: { interceptorId: string; result: CombatResult } }
  | { ok: false; state: GameState; reason: ParadropFailureReason };

export function executeParadrop(state: GameState, unitId: string, destination: HexCoord): ParadropResult {
  const check = canParadrop(state, unitId, destination);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const unit = state.units[unitId]!;
  const landedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unitId]: { ...unit, position: { ...destination }, movementPointsLeft: 0, hasMoved: true, hasActed: true },
    },
  };
  return { ok: true, state: landedState };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS, all tests in the file.

- [x] **Step 5: Add and pass the turn-reset lockout integration test**

Add to `tests/systems/airborne-system.test.ts`. The verified real turn-reset entry point is `processTurn`, exported from `src/core/turn-manager.ts` (confirmed: it resets `movementPointsLeft` and `hasMoved` for the acting civ's units around line 1100, and `movementPointsLeft`/`hasActed` around line 633 for a related path — read its full signature before writing this test, since it likely takes more than just `state` as an argument, matching how Task 4's other turn-processing call sites in this codebase invoke it):

```typescript
import { processTurn } from '@/core/turn-manager';

it('landing lockout clears via real next-turn processing, not a hand-set flag', () => {
  const { state, unitId } = makeParadropFixture();
  const dropped = executeParadrop(state, unitId, { q: 1, r: 1 });
  if (!dropped.ok) throw new Error('expected ok');
  const nextTurnState = processTurn(dropped.state /* plus whatever other required arguments processTurn takes — check existing turn-manager.test.ts callers for the exact call shape */);
  const unit = nextTurnState.units[unitId]!;
  expect(unit.hasActed).toBe(false);
  expect(unit.hasMoved).toBe(false);
  expect(unit.movementPointsLeft).toBeGreaterThan(0);
});
```

This is the explicit #542-lesson regression the spec requires (§7/§15) — it must call the real pipeline, not assert a manually-constructed state.

- [x] **Step 6: Run full test file**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add src/systems/airborne-system.ts tests/systems/airborne-system.test.ts
git commit -m "feat(#543): implement executeParadrop relocation and landing lockout"
```

---

### Task 5: `getHostileAirDefenseThreat` — flak coverage query

**Files:**
- Modify: `src/systems/air-defense-system.ts`
- Test: `tests/systems/air-defense-system.test.ts`

**Interfaces:**
- Consumes: `isHostileOwnerTo` from `@/systems/owner-hostility` (same predicate `selectInterceptor` uses)
- Produces:
  ```typescript
  export function getHostileAirDefenseThreat(state: GameState, unit: Unit, position: HexCoord): UnfilteredCoverage;
  export function getKnownHostileAirDefenseThreat(state: GameState, unit: Unit, position: HexCoord, viewerId: string): AirDefenseCoverageResult;
  ```

- [x] **Step 1: Write the failing tests**

Add to `tests/systems/air-defense-system.test.ts` (reuse this file's existing Mobile AA / SAM Site fixture builders — open the file first):

```typescript
import { getHostileAirDefenseThreat, getKnownHostileAirDefenseThreat, resolveAirDefenseCoverage } from '@/systems/air-defense-system';

describe('getHostileAirDefenseThreat', () => {
  it('detects a hostile civ\'s Mobile AA covering a landing tile', () => {
    const state = makeStateWithHostileMobileAA(); // reuse/extend existing fixture helper
    const droppingUnit = Object.values(state.units).find(u => u.owner === 'civ-a')!;
    const threat = getHostileAirDefenseThreat(state, droppingUnit, { q: 0, r: 0 }); // the AA's covered tile
    expect(threat.flatDefenseModifier).toBe(8);
  });

  it('does not count a friendly-civ AA provider as hostile threat', () => {
    const state = makeStateWithFriendlyMobileAA();
    const droppingUnit = Object.values(state.units).find(u => u.owner === 'civ-a')!;
    const threat = getHostileAirDefenseThreat(state, droppingUnit, { q: 0, r: 0 });
    expect(threat.flatDefenseModifier).toBe(0);
  });

  it('applies stacking-group dedup: SAM Site (12) supersedes Mobile AA (8) covering the same tile, not additive', () => {
    const state = makeStateWithHostileSamAndMobileAA(); // extend fixture to place both near the same tile
    const droppingUnit = Object.values(state.units).find(u => u.owner === 'civ-a')!;
    const threat = getHostileAirDefenseThreat(state, droppingUnit, { q: 0, r: 0 });
    expect(threat.flatDefenseModifier).toBe(12);
  });

  it('does not change existing own-civ resolveAirDefenseCoverage behavior (regression)', () => {
    const state = makeStateWithFriendlyMobileAA();
    const defender = Object.values(state.units).find(u => u.owner === 'civ-a')!;
    const coverage = resolveAirDefenseCoverage(state, defender, 'civ-b');
    expect(coverage.flatDefenseModifier).toBe(8); // unchanged from pre-existing behavior
  });
});

describe('getKnownHostileAirDefenseThreat', () => {
  it('withholds an undiscovered hostile AA provider from the viewer-scoped preview', () => {
    const state = makeStateWithHostileMobileAA(); // civ-a has NOT discovered civ-b's Mobile AA
    const droppingUnit = Object.values(state.units).find(u => u.owner === 'civ-a')!;
    const known = getKnownHostileAirDefenseThreat(state, droppingUnit, { q: 0, r: 0 }, 'civ-a');
    expect(known.flatDefenseModifier).toBe(0);
    expect(known.providers).toHaveLength(0);
  });

  it('surfaces a discovered hostile AA provider to the viewer-scoped preview', () => {
    const state = makeStateWithDiscoveredHostileMobileAA(); // civ-a HAS visibility of civ-b's Mobile AA tile
    const droppingUnit = Object.values(state.units).find(u => u.owner === 'civ-a')!;
    const known = getKnownHostileAirDefenseThreat(state, droppingUnit, { q: 0, r: 0 }, 'civ-a');
    expect(known.flatDefenseModifier).toBe(8);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-defense-system.test.ts -t "HostileAirDefenseThreat"`
Expected: FAIL — functions not exported.

- [x] **Step 3: Implement**

In `src/systems/air-defense-system.ts`:
1. Change `function providersForOwner(` to `export function providersForOwner(` (needed by the new functions below).
2. Add near the bottom of the file:

```typescript
import { isHostileOwnerTo } from './owner-hostility';

export function getHostileAirDefenseThreat(state: GameState, unit: Unit, position: HexCoord): UnfilteredCoverage {
  const hostileProviders = Object.keys(state.civilizations)
    .filter(civId => isHostileOwnerTo(state, unit.owner, civId))
    .flatMap(civId => providersForOwner(state, civId))
    .filter(provider => distance(state, provider.position, position) <= provider.radius
      && (provider.protectedDomains === undefined || provider.protectedDomains.includes('land')));
  return selectStrongestAirDefenseProviders(hostileProviders);
}

export function getKnownHostileAirDefenseThreat(
  state: GameState,
  unit: Unit,
  position: HexCoord,
  viewerId: string,
): AirDefenseCoverageResult {
  const result = getHostileAirDefenseThreat(state, unit, position);
  const visible = new Set(result.providers.filter(provider => known(state, provider, viewerId)).map(provider => provider.id));
  return {
    flatDefenseModifier: result.providers.filter(p => visible.has(p.id)).reduce((total, p) => total + p.defenseModifier, 0),
    facts: result.facts.filter(fact => visible.has(fact.key.slice('air-defense:'.length))),
    providers: result.providers.filter(provider => visible.has(provider.id)).map(provider => ({ ...provider, position: { ...provider.position } })),
  };
}
```

Note the `protectedDomains.includes('land')` filter — flak threatens a landing (land-domain) paratrooper, matching the same domain-filtering convention `providersFor` already uses for aircraft.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-defense-system.test.ts`
Expected: PASS, entire file (confirms the regression test too).

- [x] **Step 5: Commit**

```bash
git add src/systems/air-defense-system.ts tests/systems/air-defense-system.test.ts
git commit -m "feat(#543): add hostile air-defense threat query for paradrop flak"
```

---

### Task 6: Wire flak and interception into `executeParadrop`

**Files:**
- Modify: `src/systems/airborne-system.ts`
- Test: `tests/systems/airborne-system.test.ts`

**Interfaces:**
- Consumes: `getHostileAirDefenseThreat` (Task 5); `selectInterceptor`, `applyCombatOutcomeToState`, `deterministicCombatSeed`, `resolveCombat`, `buildCombatContextForDefender`, `resolveCombatEra` — same imports `air-operations-system.ts`'s `resolveAirStrike` already uses (open that file's import block again and mirror it exactly); `appendNotification` from `@/core/notification-log` (verified signature: `appendNotification(state: Pick<GameState, 'notificationLog' | 'idCounters'>, civId: string, draft): NotificationEntry` — it **mutates its `state` argument in place** and returns the created entry, not a new state; every existing caller in this codebase pre-copies `notificationLog`/`idCounters` onto a fresh object first, then calls it for the side effect, ignoring the return value — mirror `air-operations-system.ts`'s `appendAirBaseLossNotifications` exactly, do not treat it as a pure function); `isHostileOwnerTo` from `@/systems/owner-hostility`; `getVisibility` from `@/systems/fog-of-war`.
- Produces: `executeParadrop`'s `flak`/`interception` result fields are now populated; landing/interception/flak outcomes are recorded via `appendNotification` for both the dropping civ (always) and a hostile civ that can currently see the landing tile (viewer-scoped) — this lives inside `executeParadrop` itself, not the UI controller, so it fires identically whether a human or the AI triggers the drop (see Task 10's note about why the controller does *not* duplicate this).

- [x] **Step 1: Write the failing tests**

Add to `tests/systems/airborne-system.test.ts`:

```typescript
describe('executeParadrop — flak', () => {
  it('applies deterministic flak damage from hostile AA covering the landing tile', () => {
    const { state, unitId } = makeParadropFixtureWithHostileAAAtDestination(); // extend fixture: hostile Mobile AA (8) covers { q: 1, r: 1 }
    const before = state.units[unitId]!.health;
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.flak).toEqual({ damage: 8, providerId: expect.any(String), providerLabel: expect.any(String) });
    expect(result.state.units[unitId]!.health).toBe(before - 8);
  });

  it('applies no flak when the landing tile has no hostile coverage', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.flak).toBeUndefined();
  });

  it('applies flak from hostile AA the dropping civ has NOT discovered (no preview leak, but real effect)', () => {
    const { state, unitId } = makeParadropFixtureWithUndiscoveredHostileAAAtDestination();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.flak?.damage).toBe(8); // still applies even though undiscovered
  });

  it('destroys the paratrooper if flak damage alone reduces health to zero or below', () => {
    const { state, unitId } = makeParadropFixtureWithHostileAAAtDestination();
    const wounded = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, health: 5 } } };
    const result = executeParadrop(wounded, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.units[unitId]).toBeUndefined();
  });
});

describe('executeParadrop — interception', () => {
  it('resolves combat against a known enemy interceptor in range of the landing tile', () => {
    const { state, unitId } = makeParadropFixtureWithInterceptorInRange(); // extend fixture: hostile fighter on intercept stance
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.interception).toBeDefined();
    expect(result.interception!.interceptorId).toBeTruthy();
  });

  it('resolves combat against a HIDDEN enemy interceptor too (no visibility filter, matches #539)', () => {
    const { state, unitId } = makeParadropFixtureWithUndiscoveredInterceptorInRange();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.interception).toBeDefined();
  });

  it('sequences flak before interception: flak-weakened unit enters the interception combat at reduced health', () => {
    const { state, unitId } = makeParadropFixtureWithHostileAAAndInterceptorAtDestination();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok && result.state.units[unitId] === undefined) return; // unit died in interception, acceptable
    if (!result.ok) throw new Error('expected ok');
    expect(result.flak).toBeDefined();
    expect(result.interception).toBeDefined();
  });

  it('is deterministic under a fixed seed (same inputs, same outcome, run twice)', () => {
    const { state, unitId } = makeParadropFixtureWithInterceptorInRange();
    const first = executeParadrop(state, unitId, { q: 1, r: 1 });
    const second = executeParadrop(state, unitId, { q: 1, r: 1 });
    expect(first.ok ? first.state.units[unitId]?.health : 'destroyed')
      .toEqual(second.ok ? second.state.units[unitId]?.health : 'destroyed');
  });

  it('does NOT apply the launch city\'s friendly-city combat bonus during interception (regression for the position-before-combat ordering bug)', () => {
    // Launch city is heavily fortified/friendly; the landing tile is open,
    // undefended ground near the interceptor. If the interceptor loses this
    // fight against a full-strength paratrooper on open ground, but the
    // fixture is built so it would WIN against a defender still standing in
    // the friendly launch city, this test catches the bug where the combat
    // context was built from the unit's stale pre-drop position.
    const { state, unitId } = makeParadropFixtureWhereInterceptorBeatsOpenGroundButLosesToFriendlyCityDefender();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.units[unitId]).toBeUndefined(); // interceptor wins on open ground, as it should
  });
});

describe('executeParadrop — notifications', () => {
  it('always logs an outcome notification for the dropping civ', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    const unit = state.units[unitId]!;
    expect(result.state.notificationLog?.[unit.owner]?.some(n => /landed/i.test(n.message))).toBe(true);
  });

  it('notifies a hostile civ that can see the landing tile', () => {
    const { state, unitId } = makeParadropFixtureNearVisibleHostileCiv(); // civ-b has visibility of { q: 1, r: 1 }
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-b']?.some(n => /paratrooper/i.test(n.message))).toBe(true);
  });

  it('does NOT notify a hostile civ that cannot see the landing tile', () => {
    const { state, unitId } = makeParadropFixtureNearHiddenHostileCiv(); // civ-b has no visibility of { q: 1, r: 1 }
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-b'] ?? []).toEqual(state.notificationLog?.['civ-b'] ?? []); // unchanged
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts -t "executeParadrop — flak"`
Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts -t "executeParadrop — interception"`
Expected: FAIL — `result.flak`/`result.interception` are always `undefined`.

- [x] **Step 3: Implement**

Open `src/systems/air-operations-system.ts` and copy its exact import list for `deterministicCombatSeed`, `resolveCombat`, `buildCombatContextForDefender`, `resolveCombatEra`, `applyCombatOutcomeToState`, `selectInterceptor` into `airborne-system.ts`'s imports (these are the same dependencies `resolveAirStrike`'s interception branch already uses — do not reimplement combat resolution, call the same functions).

Replace `executeParadrop`'s body:

```typescript
import { appendNotification } from '@/core/notification-log';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

type ParadropOutcome = {
  flak?: { damage: number; providerId: string; providerLabel: string };
  interception?: { interceptorId: string; result: import('@/core/types').CombatResult };
  destroyed: boolean;
};

// Records the drop's outcome for both sides. Lives here (not in the UI
// controller) so it fires identically for a human-triggered and an
// AI-triggered drop -- see end-to-end-wiring.md's "shared state mutations
// must be actor-complete" rule. Mirrors appendAirBaseLossNotifications's
// exact pre-copy-then-mutate pattern in air-operations-system.ts: build a
// state with fresh notificationLog/idCounters copies once, then call
// appendNotification (which mutates that copy in place) per recipient.
function notifyParadropOutcome(state: GameState, droppedUnit: Unit, destination: HexCoord, outcome: ParadropOutcome): GameState {
  const nextState: GameState = {
    ...state,
    idCounters: { ...state.idCounters },
    notificationLog: Object.fromEntries(Object.entries(state.notificationLog ?? {}).map(([civId, entries]) => [civId, [...entries]])),
  };
  const name = UNIT_DEFINITIONS[droppedUnit.type].name;
  const parts: string[] = [];
  if (outcome.flak) parts.push(`${outcome.flak.damage} flak damage from ${outcome.flak.providerLabel}`);
  if (outcome.interception) parts.push('intercepted');
  const suffix = parts.length ? ` (${parts.join(', ')})` : '';
  appendNotification(nextState, droppedUnit.owner, {
    message: outcome.destroyed ? `${name} was destroyed on the drop${suffix}.` : `${name} landed${suffix}. It cannot act again this turn.`,
    type: outcome.destroyed || outcome.flak || outcome.interception ? 'warning' : 'info',
    turn: state.turn,
    target: { kind: 'map', coord: { ...destination }, label: name },
  });

  for (const civId of Object.keys(nextState.civilizations)) {
    if (civId === droppedUnit.owner || !isHostileOwnerTo(nextState, droppedUnit.owner, civId)) continue;
    const visibility = nextState.civilizations[civId]?.visibility;
    if (!visibility || getVisibility(visibility, destination) !== 'visible') continue;
    appendNotification(nextState, civId, {
      message: 'An enemy Paratrooper has landed nearby.',
      type: 'warning',
      turn: state.turn,
      target: { kind: 'map', coord: { ...destination }, label: 'Paratrooper' },
    });
  }
  return nextState;
}

export function executeParadrop(state: GameState, unitId: string, destination: HexCoord): ParadropResult {
  const check = canParadrop(state, unitId, destination);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const unit = state.units[unitId]!;

  // Relocate to the destination FIRST, before flak/interception resolve.
  // This is not cosmetic: buildCombatContextForDefender reads the
  // defender's *current position* to compute friendly-city and
  // adjacent-support combat bonuses (combat-context.ts ~line 64-79). If
  // the unit were still at its launch city when interception resolves, it
  // would wrongly get that city's "defending in a friendly city" bonus
  // during the interception fight -- exactly the opposite of "lands
  // vulnerable". See the regression test added in Step 1 above.
  let workingUnit: Unit = { ...unit, position: { ...destination } };

  // Flak first (deterministic chip damage from hostile ground AA covering the tile).
  const threat = getHostileAirDefenseThreat(state, unit, destination);
  const strongestProvider = threat.providers[0];
  let flak: { damage: number; providerId: string; providerLabel: string } | undefined;
  if (strongestProvider && threat.flatDefenseModifier > 0) {
    flak = { damage: threat.flatDefenseModifier, providerId: strongestProvider.id, providerLabel: strongestProvider.label };
    const health = workingUnit.health - threat.flatDefenseModifier;
    if (health <= 0) {
      const { [unitId]: _removed, ...remainingUnits } = state.units;
      const owner = state.civilizations[unit.owner];
      const strippedState: GameState = {
        ...state,
        units: remainingUnits,
        civilizations: owner ? { ...state.civilizations, [unit.owner]: { ...owner, units: owner.units.filter(id => id !== unitId) } } : state.civilizations,
      };
      return { ok: true, state: notifyParadropOutcome(strippedState, unit, destination, { flak, destroyed: true }), flak };
    }
    workingUnit = { ...workingUnit, health };
  }

  // Interception second, against the (possibly flak-weakened) unit at its
  // destination, reusing #539's mechanism unchanged.
  let nextState: GameState = { ...state, units: { ...state.units, [unitId]: workingUnit } };
  const interceptor = selectInterceptor(nextState, workingUnit, destination);
  let interception: { interceptorId: string; result: import('@/core/types').CombatResult } | undefined;
  if (interceptor) {
    const seed = deterministicCombatSeed(nextState.gameId, nextState.turn, interceptor.id, workingUnit.id);
    const result = resolveCombat(
      interceptor,
      workingUnit,
      nextState.map,
      seed,
      buildCombatContextForDefender(nextState, interceptor, workingUnit, { isIntercepting: true }),
      resolveCombatEra(nextState, interceptor, workingUnit),
    );
    nextState = applyCombatOutcomeToState(nextState, result, seed).state;
    if (nextState.units[interceptor.id]) {
      nextState = { ...nextState, units: { ...nextState.units, [interceptor.id]: { ...nextState.units[interceptor.id]!, interceptedTurn: state.turn } } };
    }
    interception = { interceptorId: interceptor.id, result };
    if (!nextState.units[unitId]) {
      return { ok: true, state: notifyParadropOutcome(nextState, unit, destination, { flak, interception, destroyed: true }), flak, interception };
    }
  }

  const survivor = nextState.units[unitId]!;
  const landedState: GameState = {
    ...nextState,
    units: { ...nextState.units, [unitId]: { ...survivor, movementPointsLeft: 0, hasMoved: true, hasActed: true } },
  };
  return { ok: true, state: notifyParadropOutcome(landedState, unit, destination, { flak, interception, destroyed: false }), flak, interception };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS, entire file.

- [x] **Step 5: Commit**

```bash
git add src/systems/airborne-system.ts tests/systems/airborne-system.test.ts
git commit -m "feat(#543): wire flak damage and interception into executeParadrop"
```

---

### Task 7: Production wiring — trainable unit, tech unlock, production icon, combat role

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/tech-definitions-eras9.ts`
- Modify: `src/systems/combat-role-definitions.ts`
- Test: `tests/systems/city-system.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts` (existing, should pass without new tests), `tests/systems/combat-role-definitions.test.ts`

**Interfaces:**
- Produces: `TRAINABLE_UNITS` includes a `paratrooper` entry; `PRODUCTION_ICONS.paratrooper`; `air-superiority` tech's `unlocksUnits` includes `'paratrooper'`; `UNIT_ROLE_DEFINITIONS.paratrooper`.

- [x] **Step 1: Write the failing test**

Add to `tests/systems/city-system.test.ts`:

```typescript
import { TRAINABLE_UNITS, PRODUCTION_ICONS } from '@/systems/city-system';

it('paratrooper is trainable, tech-gated on air-superiority, and has a production icon', () => {
  const entry = TRAINABLE_UNITS.find(u => u.type === 'paratrooper');
  expect(entry).toBeDefined();
  expect(entry!.techRequired).toBe('air-superiority');
  expect(PRODUCTION_ICONS.paratrooper).toBeDefined();
});
```

Add to `tests/systems/combat-role-definitions.ts`'s test file:
```typescript
import { UNIT_ROLE_DEFINITIONS } from '@/systems/combat-role-definitions';

it('paratrooper has a combat role definition', () => {
  expect(UNIT_ROLE_DEFINITIONS.paratrooper).toBeDefined();
  expect(UNIT_ROLE_DEFINITIONS.paratrooper.primaryRole).toBe('frontline');
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "paratrooper is trainable"`
Expected: FAIL.

- [x] **Step 3: Implement**

In `src/systems/city-system.ts`, add to `TRAINABLE_UNITS` (near the `mechanized_infantry` entry, keeping era-adjacent units grouped):

```typescript
  { type: 'paratrooper', name: 'Paratrooper', cost: 210, techRequired: 'air-superiority', requiredTechs: ['armored-tactics'], pacing: { band: 'core', role: 'airborne-repositioning', impact: 1.15, scope: 'military', snowball: 1.0, urgency: 1.0, situationality: 1.6, unlockBreadth: 1 } },
```

(`snowball: 1.0` and modest `impact` keep the generic AI production scorer from treating this as standing-army filler — its value is `situationality: 1.6`, deliberately higher than `mechanized_infantry`'s, reflecting that it's worth building for a specific paradrop opportunity rather than blanket production. This directly satisfies §4/§12's era-relevance requirement through the existing pacing-metadata mechanism rather than new scoring code.)

Add to `PRODUCTION_ICONS` (matching the existing `paratrooper`-adjacent entries' emoji style):
```typescript
  paratrooper: '🪂',
```

In `src/systems/tech-definitions-eras9.ts`, find the `air-superiority` tech entry and add `'paratrooper'` to its `unlocksUnits` array (create the array if it doesn't already have one for this tech — check the entry's current shape first; `wwii_fighter` is also gated on `air-superiority` so `unlocksUnits` likely already exists there with `'wwii_fighter'` in it — append `'paratrooper'` alongside it).

In `src/systems/combat-role-definitions.ts`, add (near the `infantry`/`mechanized_infantry` entries):
```typescript
  paratrooper: role('frontline', 'Airborne infantry that repositions via paradrop but fights below contemporary line-infantry strength.', ['frontline', 'capture'], { counters: ['civilian'], vulnerableTo: ['ranged', 'shock'], upgradeFamily: 'paratrooper' }),
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts`
Expected: PASS. `tech-unlocks-consistency.test.ts` is an existing generic test — it will now also assert `paratrooper`'s `techRequired` matches an entry in `air-superiority`'s `unlocksUnits`; if it fails, the tech-file edit above is incomplete.

- [x] **Step 5: Commit**

```bash
git add src/systems/city-system.ts src/systems/tech-definitions-eras9.ts src/systems/combat-role-definitions.ts tests/systems/city-system.test.ts
git commit -m "feat(#543): wire Paratrooper into production, tech unlock, and combat roles"
```

---

### Task 8: Sprite catalog and content-description honesty pass

**Files:**
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Test: `tests/renderer/sprites/sprite-catalog.test.ts` (existing generic coverage test)

**Interfaces:**
- Produces: `UNIT_MOTION_STYLES.paratrooper`, `UNIT_SPRITE_CATALOG.paratrooper`

- [x] **Step 1: Run the existing generic catalog test to see it fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts`
Expected: FAIL — this test already loops over every `UnitType` and asserts catalog coverage (per `.claude/rules/sprites.md`), so it fails automatically now that `'paratrooper'` exists as a `UnitType` with no catalog entry. No new test needs to be written for this task — the existing generic test is the spec.

- [x] **Step 2: Add the catalog entries**

In `src/renderer/sprites/sprite-catalog.ts`, add to `UNIT_MOTION_STYLES` (near `mechanized_infantry`):
```typescript
  paratrooper: 'humanoid',
```

Add to `UNIT_SPRITE_CATALOG` (near `mechanized_infantry`, which already aliases `InfantrySprite` as its placeholder — same precedent applies here):
```typescript
  paratrooper: withMotion('paratrooper', InfantrySprite),
```

- [x] **Step 3: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts`
Expected: PASS

- [x] **Step 4: Run `yarn build` again and address any remaining `Record<UnitType, ...>` gaps from Task 2's Step 6 checklist**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: Fewer or zero remaining `paratrooper`-related type errors. If any remain, add the missing entry to that map now, following the same "reuse the nearest infantry-family precedent" approach used above, and re-run the build until clean of `paratrooper`-specific errors (errors unrelated to this feature, if any, are out of scope for this task).

- [x] **Step 5: Commit**

```bash
git add src/renderer/sprites/sprite-catalog.ts
git commit -m "feat(#543): add Paratrooper sprite catalog fallback (aliases InfantrySprite)"
```

---

### Task 9: AI candidate ranking, lookahead, and execution

**Files:**
- Modify: `src/ai/ai-tactics.ts`
- Modify: `src/ai/ai-major-turn.ts`
- Test: `tests/ai/ai-tactics.test.ts`

**Interfaces:**
- Consumes: `getParadropTargets`, `canParadrop`, `executeParadrop` (Tasks 3-6); `getKnownHostileAirDefenseThreat` (Task 5); `selectInterceptor` (existing)
- Produces: `AITacticalAction` includes `{ kind: 'paradrop'; unitId: string; destination: HexCoord }`. `rankParadrop` stays **module-private**, matching every sibling ranker in this file (`rankAirStrikes`, `rankAirSupport`, `rankCapture` are all unexported — only the aggregator `rankUnitTacticalActions` at ~line 856 is `export`ed) — do not export it; test it through `rankUnitTacticalActions`, the same way this file's other rankers are already tested.

- [x] **Step 1: Write the failing tests**

Add to `tests/ai/ai-tactics.test.ts` (reuse this file's existing `AITacticalContext` fixture builders and whatever it already imports from `@/ai/ai-tactics` — likely just `rankUnitTacticalActions`, confirm against the file's current imports):

```typescript
import { rankUnitTacticalActions } from '@/ai/ai-tactics';

describe('rankUnitTacticalActions — paradrop', () => {
  it('produces no paradrop candidates for a unit with no paradrop capability', () => {
    const context = makeTacticalContext(); // reuse existing helper
    const infantry = Object.values(context.state.units).find(u => u.type === 'infantry')!;
    const actions = rankUnitTacticalActions(context, infantry);
    expect(actions.some(a => a.action.kind === 'paradrop')).toBe(false);
  });

  it('produces paradrop candidates only for tiles the AI civ can actually see', () => {
    const context = makeParadropTacticalContext(); // extend fixture with a paratrooper on an airfield city + a mix of visible/hidden in-range tiles
    const paratrooper = Object.values(context.state.units).find(u => u.type === 'paratrooper')!;
    const actions = rankUnitTacticalActions(context, paratrooper).filter(a => a.action.kind === 'paradrop');
    const hiddenTile = { q: 3, r: 3 }; // fixture's unexplored in-range tile
    expect(actions.some(a => a.action.kind === 'paradrop' && a.action.destination.q === hiddenTile.q && a.action.destination.r === hiddenTile.r)).toBe(false);
  });

  it('never scores a paradrop target the same civ could not legally drop onto (parity with canParadrop)', () => {
    const context = makeParadropTacticalContext();
    const paratrooper = Object.values(context.state.units).find(u => u.type === 'paratrooper')!;
    const actions = rankUnitTacticalActions(context, paratrooper).filter(a => a.action.kind === 'paradrop');
    for (const ranked of actions) {
      if (ranked.action.kind !== 'paradrop') continue;
      expect(canParadrop(context.state, ranked.action.unitId, ranked.action.destination).ok).toBe(true);
    }
  });

  it('scores a reinforcement drop onto a threatened friendly city above an isolated low-value drop', () => {
    const context = makeThreatenedCityReinforcementContext(); // extend fixture: a threatened friendly city plus a far, unsupported legal tile
    const paratrooper = Object.values(context.state.units).find(u => u.type === 'paratrooper')!;
    const actions = rankUnitTacticalActions(context, paratrooper).filter(a => a.action.kind === 'paradrop');
    const reinforce = actions.find(a => a.action.kind === 'paradrop' /* && destination adjacent to the threatened city, per fixture */);
    const isolated = actions.find(a => a.action.kind === 'paradrop' /* && destination far from any objective, per fixture */);
    expect(reinforce).toBeDefined();
    expect(isolated).toBeDefined();
    expect(reinforce!.score).toBeGreaterThan(isolated!.score);
  });
});
```

Full end-to-end AI execution (a real AI turn actually moving a Paratrooper via `processMajorCivStrategicTurn`) is covered by Task 15's full-suite regression run and manual smoke test, not a narrow unit test here — `executeAction` in `ai-major-turn.ts` and `applyPredictedAction`'s switch in this file are both private, matching every other action kind's test coverage pattern in this codebase (verified: neither is imported by name in any existing test file).

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts -t "rankUnitTacticalActions — paradrop"`
Expected: FAIL — no paradrop candidates are produced yet.

- [x] **Step 3: Implement `rankParadrop` and wire it into the aggregator and both execution switches**

In `src/ai/ai-tactics.ts`:

1. Add to the `AITacticalAction` union:
```typescript
  | { kind: 'paradrop'; unitId: string; destination: HexCoord }
```

2. Add near `rankAirSupport`/`rankCapture` (reuse this file's existing `ranked(action, score)` helper at ~line 174 — match its signature exactly), **not exported**:
```typescript
import { getParadropTargets, canParadrop, executeParadrop } from '@/systems/airborne-system';
import { getKnownHostileAirDefenseThreat } from '@/systems/air-defense-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

function rankParadrop(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  if (!UNIT_DEFINITIONS[unit.type].paradrop || unit.hasActed) return [];
  const targets = getParadropTargets(context.state, unit.id);
  return targets.map(destination => {
    const threat = getKnownHostileAirDefenseThreat(context.state, unit, destination, context.actorId);
    const objectiveDistance = context.plan.target
      ? distance(context.state, destination, targetPosition(context.plan))
      : Infinity;
    // Base score below the mandatory-tier attack/capture actions elsewhere in
    // this file (those score 600+); paradrop is a repositioning tool, scored
    // like rankAirSupport's 300-460 band, discounted by known flak risk and
    // by distance from the current strategic objective so isolated drops with
    // no supporting plan don't outscore a normal advance.
    const riskDiscount = threat.flatDefenseModifier * 4;
    const objectiveBonus = Number.isFinite(objectiveDistance) ? Math.max(0, 40 - objectiveDistance * 5) : 0;
    return ranked({ kind: 'paradrop', unitId: unit.id, destination }, Math.max(0, 320 + objectiveBonus - riskDiscount));
  }).filter(candidate => canParadrop(context.state, unit.id, (candidate.action as Extract<AITacticalAction, { kind: 'paradrop' }>).destination).ok);
}
```

(The trailing `.filter(canParadrop...)` is deliberately redundant with `getParadropTargets`'s own filtering — it's the same defense-in-depth pattern `rankCapture` already uses elsewhere in this file, protecting against the two functions drifting out of sync later.)

3. In `rankUnitTacticalActions` (~line 856), find its spread list (~line 876-879: `...rankAirStrikes(context, unit), ...rankAirSupport(context, unit), ..., ...rankCapture(context, unit)`) and add `...rankParadrop(context, unit)` to that same list. This is the only place a new caller is needed — `rankUnitTacticalActions` is already the sole exported entry point every consumer (including this task's own tests) goes through.

4. Add a case to `applyPredictedAction`'s switch (this file, ~line 971 — the lookahead-simulation applier used when the AI predicts a candidate action's consequences before committing to it):
```typescript
    case 'paradrop': {
      const result = executeParadrop(next, action.unitId, action.destination);
      return result.ok ? result.state : next;
    }
```

In `src/ai/ai-major-turn.ts`, add to `executeAction`'s switch (mirroring the `air-strike` case exactly):
```typescript
    case 'paradrop': {
      const result = executeParadrop(state, action.unitId, action.destination);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
```
Import `executeParadrop` from `@/systems/airborne-system` in this file too.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts`
Expected: PASS.

- [x] **Step 5: Add the difficulty-leak guard test**

```typescript
it('Veteran and Explorer AI have identical legal paradrop target sets under identical fog — only weighting differs', () => {
  const veteranContext = makeParadropTacticalContext({ difficulty: 'veteran' });
  const explorerContext = makeParadropTacticalContext({ difficulty: 'explorer' });
  const paratrooperV = Object.values(veteranContext.state.units).find(u => u.type === 'paratrooper')!;
  const paratrooperE = Object.values(explorerContext.state.units).find(u => u.type === 'paratrooper')!;
  const veteranTargets = rankUnitTacticalActions(veteranContext, paratrooperV)
    .filter(a => a.action.kind === 'paradrop').map(a => a.action.kind === 'paradrop' ? a.action.destination : null);
  const explorerTargets = rankUnitTacticalActions(explorerContext, paratrooperE)
    .filter(a => a.action.kind === 'paradrop').map(a => a.action.kind === 'paradrop' ? a.action.destination : null);
  expect(new Set(veteranTargets.map(t => `${t?.q},${t?.r}`))).toEqual(new Set(explorerTargets.map(t => `${t?.q},${t?.r}`)));
});
```

If `makeParadropTacticalContext` doesn't yet support a `difficulty` parameter, check how other AI tests already parameterize difficulty (grep `tests/ai/` for `difficulty:`) and match that convention rather than inventing a new one.

- [x] **Step 6: Run full AI test file**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add src/ai/ai-tactics.ts src/ai/ai-major-turn.ts tests/ai/ai-tactics.test.ts
git commit -m "feat(#543): add AI paradrop candidate ranking, lookahead, and execution"
```

---

### Task 10: Player input wiring — pending intent, tap resolution, controller dispatch

**Files:**
- Modify: `src/app/ports.ts`
- Modify: `src/input/map-tap-intent.ts`
- Modify: `src/app/controllers/map-interaction-controller.ts`
- Test: `tests/input/map-tap-intent.test.ts`, `tests/app/controllers/map-interaction-controller.test.ts`

**Interfaces:**
- Produces: `PendingMapIntent` includes `{ kind: 'paradrop'; unitId: string }`; `resolveMapTapIntent` treats it as resolvable like `'air-mission'`; the controller executes it.

- [x] **Step 1: Write the failing tests**

Add to `tests/input/map-tap-intent.test.ts` (reuse this file's existing `SelectionSnapshot` fixture helpers):

```typescript
it('resolves a tap while a paradrop pending intent is active as resolve-pending', () => {
  const state = makeStateWithParatrooper(); // reuse/extend existing fixture helper
  const selection = { ...makeSelectionSnapshot(), pendingIntent: { kind: 'paradrop', unitId: 'paratrooper-1' } };
  const intent = resolveMapTapIntent(state, selection, { q: 1, r: 1 }, false);
  expect(intent).toEqual({ kind: 'resolve-pending', pending: { kind: 'paradrop', unitId: 'paratrooper-1' }, coord: { q: 1, r: 1 } });
});
```

Add to `tests/app/controllers/map-interaction-controller.test.ts` (reuse this file's existing controller-construction fixture):

```typescript
it('handleHexTap resolves a pending paradrop by calling executeParadrop and clearing the pending intent', () => {
  const { controller, session, selection } = makeControllerFixtureWithParatrooper(); // extend existing fixture
  selection.setPendingIntent({ kind: 'paradrop', unitId: 'paratrooper-1' });
  controller.handleHexTap({ q: 1, r: 1 });
  expect(selection.getPendingIntent()).toEqual({ kind: 'none' });
  expect(session.getState().units['paratrooper-1']?.position).toEqual({ q: 1, r: 1 });
});

it('handleHexTap rejects an illegal paradrop tap without committing state', () => {
  const { controller, session, selection } = makeControllerFixtureWithParatrooper();
  selection.setPendingIntent({ kind: 'paradrop', unitId: 'paratrooper-1' });
  const before = session.getState();
  controller.handleHexTap({ q: 99, r: 99 });
  expect(session.getState()).toBe(before); // no commit on illegal tap
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/input/map-tap-intent.test.ts tests/app/controllers/map-interaction-controller.test.ts -t "paradrop"`
Expected: FAIL — `'paradrop'` isn't a recognized `PendingMapIntent` kind yet.

- [x] **Step 3: Implement**

In `src/app/ports.ts`, add to the `PendingMapIntent` union:
```typescript
  | { readonly kind: 'paradrop'; readonly unitId: string }
```

In `src/input/map-tap-intent.ts`:
1. Change the `ResolvablePendingIntent` type:
```typescript
export type ResolvablePendingIntent = Extract<PendingMapIntent, { kind: 'journey' | 'air-mission' | 'unload' | 'paradrop' }>;
```
2. Change the pending-check condition:
```typescript
  if (pending.kind === 'journey' || pending.kind === 'air-mission' || pending.kind === 'paradrop') {
    return { kind: 'resolve-pending', pending, coord };
  }
```

In `src/app/controllers/map-interaction-controller.ts`, add a case to the `resolve-pending` switch, mirroring the `'air-mission'` case exactly (find that case, ~line 154-171 in the pre-implementation audit, and place this immediately after it):

```typescript
          case 'paradrop': {
            const pending = intent.pending;
            const result = executeParadrop(session.getState(), pending.unitId, coord);
            if (!result.ok) {
              deps.showNotification(PARADROP_FAILURE_MESSAGES[result.reason], 'warning');
              return;
            }
            // executeParadrop already logged both sides' notifications
            // (dropping civ + any hostile civ that can see the landing
            // tile) via appendNotification -- see Task 6. This case only
            // needs the acting player's own immediate toast feedback,
            // exactly like the 'air-mission' case above it does not
            // duplicate cross-civ notification logic in the controller.
            selection.setPendingIntent({ kind: 'none' });
            session.commit(result.state);
            selectionController.refreshCurrentPlayerVisibility();
            deps.updateHUD();
            // No dedicated "unit move" SFX exists in this codebase (grep
            // confirmed src/audio/sfx.ts has no such entry — ordinary
            // movement is silent by convention). transportUnload is the
            // closest existing analog for "a unit newly arrives on a
            // tile"; combat is reused for any HP-loss event (flak,
            // interception, or both), matching spec §16's "reuse
            // existing damage SFX" requirement.
            if (result.flak || result.interception) SFX.combat();
            else SFX.transportUnload();
            selectionController.selectUnit(pending.unitId);
            return;
          }
```

Add the imports this case needs at the top of the file: `import { executeParadrop, PARADROP_FAILURE_MESSAGES } from '@/systems/airborne-system';`.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/input/map-tap-intent.test.ts tests/app/controllers/map-interaction-controller.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/app/ports.ts src/input/map-tap-intent.ts src/app/controllers/map-interaction-controller.ts tests/input/map-tap-intent.test.ts tests/app/controllers/map-interaction-controller.test.ts
git commit -m "feat(#543): wire paradrop into pending-intent tap resolution"
```

---

### Task 11: Selected-unit-info UI — Paradrop button and accessible preview

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/app/controllers/selection-controller.ts`
- Test: `tests/ui/selected-unit-info.test.ts`, `tests/app/controllers/selection-controller.test.ts`

**Interfaces:**
- Consumes: `getParadropTargets`, `getParadropLaunchState`, `PARADROP_FAILURE_MESSAGES` (Task 3/10); `getKnownHostileAirDefenseThreat` (Task 5)
- Produces: new callback fields `onStartParadrop?: (unitId: string) => void` and `getParadropPreview?: (unitId: string, destination: HexCoord) => { range: number; knownFlakDamage?: number; knownFlakLabel?: string }` on the selected-unit-info callbacks interface (open the file and match its existing callback-interface name exactly — it's the interface containing `onStartIntercept` etc., confirmed at line ~111 in the pre-implementation audit).

- [x] **Step 1: Write the failing test**

Add to `tests/ui/selected-unit-info.test.ts` (reuse this file's existing DOM-fixture/render helpers):

```typescript
it('renders a Paradrop button for an eligible paratrooper and calls onStartParadrop on click', () => {
  const panel = document.createElement('div');
  const onStartParadrop = vi.fn();
  const state = makeStateWithParatrooperOnAirfield(); // extend/reuse existing fixture
  const unitId = Object.keys(state.units)[0]!;
  renderSelectedUnitInfo(panel, state, unitId, { onClose: vi.fn(), onStartParadrop });
  const button = Array.from(panel.querySelectorAll('button')).find(b => b.textContent === 'Paradrop');
  expect(button).toBeDefined();
  button!.click();
  expect(onStartParadrop).toHaveBeenCalledWith(unitId);
});

it('does not render a Paradrop button for a unit with no paradrop capability', () => {
  const panel = document.createElement('div');
  const state = makeStateWithInfantry();
  const unitId = Object.keys(state.units)[0]!;
  renderSelectedUnitInfo(panel, state, unitId, { onClose: vi.fn(), onStartParadrop: vi.fn() });
  const button = Array.from(panel.querySelectorAll('button')).find(b => b.textContent === 'Paradrop');
  expect(button).toBeUndefined();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts -t "Paradrop"`
Expected: FAIL — no such button exists yet.

- [x] **Step 3: Implement**

In `src/ui/selected-unit-info.ts`:
1. Add to the callbacks interface (the one containing `onStartIntercept?`):
```typescript
  onStartParadrop?: (unitId: string) => void;
```
2. Near the existing `onStartAirMission` button block (found at ~line 745-750 in the pre-implementation audit), add:
```typescript
  const paradropCapability = def.paradrop;
  if (paradropCapability && !unit.hasActed && callbacks.onStartParadrop) {
    actionsDiv.appendChild(makeButton('Paradrop', '#7c3aed', () => callbacks.onStartParadrop!(unitId)));
  }
```
(Import `UNIT_DEFINITIONS` if not already imported in this file — `def` above assumes the existing local variable name this file already uses for `UNIT_DEFINITIONS[unit.type]`; match whatever it's actually called by reading the surrounding code.)

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`
Expected: PASS

- [x] **Step 5: Wire the callback and highlight flow in `selection-controller.ts`**

Add to the `renderSelectedUnitInfo` call's callback object (found at ~line 174-214 in the pre-implementation audit, alongside `onStartAirMission`):

```typescript
        onStartParadrop: uid => {
          selection.setPendingIntent({ kind: 'paradrop', unitId: uid });
          const state = session.getState();
          const unit = state.units[uid]!;
          const range = UNIT_DEFINITIONS[unit.type].paradrop!.range;
          const targets = getParadropTargets(state, uid);
          const flakByTile = new Map(targets.map(coord => [
            `${coord.q},${coord.r}`,
            getKnownHostileAirDefenseThreat(state, unit, coord, unit.owner).flatDefenseModifier,
          ]));
          selection.setRanges([], []);
          selectUnit(uid);
          renderLoop.setHighlights(targets.map(coord => ({
            coord,
            type: (flakByTile.get(`${coord.q},${coord.r}`) ?? 0) > 0 ? 'paradrop-flak-risk' as const : 'paradrop-target' as const,
          })));
          // Spec §10 requires the exact numbers before commit, not just a
          // spatial highlight distinction: state the range and, if any legal
          // tile carries known flak, the worst known figure among them.
          // A per-tile hover tooltip with the exact number for the specific
          // tile under the cursor is a documented follow-up (§10 is satisfied
          // at a coarser grain here — the flak-risk highlight type already
          // marks exactly which tiles carry it); do not silently skip this
          // TODO by deleting the note once picked up.
          const worstKnownFlak = Math.max(0, ...flakByTile.values());
          const flakWarning = worstKnownFlak > 0
            ? ` Highlighted red tiles have known anti-aircraft coverage — up to -${worstKnownFlak} HP on landing.`
            : '';
          deps.showNotification(
            `Paradrop range: ${range}. Lands with no movement and cannot act again this turn.${flakWarning}`,
            'info',
          );
        },
```

Add `import { getParadropTargets } from '@/systems/airborne-system';` and `import { getKnownHostileAirDefenseThreat } from '@/systems/air-defense-system';` to this file's imports.

- [x] **Step 6: Add the highlight-type accessibility test**

The `'paradrop-flak-risk'` vs `'paradrop-target'` highlight types must resolve to visually distinct treatments (icon/label, not color alone) in whatever renderer consumes `renderLoop.setHighlights` — grep the renderer for how `'air-strike'`/`'air-recon'` highlight types are drawn (icon vs. fill) and add `'paradrop-target'`/`'paradrop-flak-risk'` following the exact same pattern (not a new one-off color swatch). Add a render test asserting the two types produce different icon glyphs, not just different fill colors — match this file's existing highlight-type render test structure.

- [x] **Step 7: Run the selection-controller test file**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add src/ui/selected-unit-info.ts src/app/controllers/selection-controller.ts tests/ui/selected-unit-info.test.ts tests/app/controllers/selection-controller.test.ts
git commit -m "feat(#543): add Paradrop button, target highlighting, and flak-risk indicator"
```

---

### Task 12: Hot-seat isolation regression

**Corrected during review (2026-08-21):** this slot originally planned a separate "viewer-scoped notifications" task that called a `deps.notificationDelivery.deliver(...)` field on the map-interaction controller. That field does not exist — grepping this controller and `air-operations-system.ts` for `notificationDelivery`/`deliver(` found no such call site anywhere in the existing air-mission code (`resolveAirStrike` never notifies the struck civ's owner through the controller either). Cross-civ notification for paradrops is instead handled directly inside `executeParadrop` (Task 6, via `appendNotification` mirroring `air-operations-system.ts`'s own `appendAirBaseLossNotifications` pattern) so it fires identically for both human- and AI-triggered drops, which a controller-only implementation could never do for AI turns. Task 6's own tests already cover the notification content and viewer-scoping; this renumbered task covers the hot-seat isolation property specifically.

**Files:**
- Create: `tests/systems/airborne-hotseat.test.ts`

**Interfaces:**
- Consumes: `getKnownHostileAirDefenseThreat` (Task 5), `getParadropTargets` (Task 3)

- [x] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { getKnownHostileAirDefenseThreat } from '@/systems/air-defense-system';
import { getParadropTargets } from '@/systems/airborne-system';

describe('hot-seat isolation — paradrop preview data', () => {
  it('civ A (who has discovered a hostile SAM Site) sees flak risk; civ B (who has not) sees none for the same tile', () => {
    const state = makeHotSeatFixtureWithSamSiteDiscoveredByOneCiv(); // civ-a has visibility of civ-c's SAM Site tile; civ-b does not
    const paratrooperA = Object.values(state.units).find(u => u.owner === 'civ-a' && u.type === 'paratrooper')!;
    const paratrooperB = Object.values(state.units).find(u => u.owner === 'civ-b' && u.type === 'paratrooper')!;
    const samCoveredTile = { q: 0, r: 0 };

    const knownToA = getKnownHostileAirDefenseThreat(state, paratrooperA, samCoveredTile, 'civ-a');
    const knownToB = getKnownHostileAirDefenseThreat(state, paratrooperB, samCoveredTile, 'civ-b');

    expect(knownToA.flatDefenseModifier).toBe(12);
    expect(knownToB.flatDefenseModifier).toBe(0);
  });

  it('paradrop target sets are independently correct per civ under the same map state', () => {
    const state = makeHotSeatFixtureTwoCivsDifferentFog();
    const paratrooperA = Object.values(state.units).find(u => u.owner === 'civ-a' && u.type === 'paratrooper')!;
    const paratrooperB = Object.values(state.units).find(u => u.owner === 'civ-b' && u.type === 'paratrooper')!;
    const targetsA = getParadropTargets(state, paratrooperA.id);
    const targetsB = getParadropTargets(state, paratrooperB.id);
    expect(targetsA).not.toEqual(targetsB); // fixture must construct genuinely different fog for each civ
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-hotseat.test.ts`
Expected: FAIL until fixtures are built out (the underlying functions already exist from Tasks 3 and 5 — this task is pure test-writing to prove the isolation property explicitly, per spec §14).

- [x] **Step 3: Build the fixtures and confirm the tests pass against existing implementation**

No production code should need to change for this task — `getKnownHostileAirDefenseThreat` and `getParadropTargets` are already viewer-scoped by construction (Tasks 3/5). If either test fails once the fixture is correctly built, that indicates a real bug introduced in an earlier task — stop and fix the root cause in `airborne-system.ts`/`air-defense-system.ts` rather than adjusting the test to match broken behavior.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-hotseat.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add tests/systems/airborne-hotseat.test.ts
git commit -m "test(#543): prove two-civ hot-seat discovery isolation for paradrop preview data"
```

---

### Task 13: Save/load round-trip regression

**Files:**
- Create: `tests/systems/airborne-save.test.ts`

**Interfaces:**
- Consumes: `executeParadrop` (Task 6); `serializeSaveFile`/`parseSaveFile` from `@/storage/save-file-transfer` (verified exports — `parseSaveFile` returns a `SaveFileParseResult`, check its shape in that file for the field holding the parsed `GameState` before writing the test); `processTurn` from `@/core/turn-manager` (verified export, the same real turn-processing entry point used in Task 4 Step 5 — confirm it resets `hasActed`/`movementPointsLeft`/`hasMoved` for the acting civ's units, which the pre-implementation audit found at `turn-manager.ts` around lines 633/1100).

- [x] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { executeParadrop } from '@/systems/airborne-system';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { processTurn } from '@/core/turn-manager';

describe('paradrop save/load round-trip', () => {
  it('preserves landed position and lockout through a same-turn save/load, then clears correctly next turn', () => {
    const { state, unitId } = makeParadropFixture(); // reuse Task 3's fixture
    const dropped = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!dropped.ok) throw new Error('expected ok');

    const serialized = serializeSaveFile(dropped.state);
    const parsed = parseSaveFile(serialized);
    // Implementer: confirm the exact success-case field name on
    // SaveFileParseResult (check src/storage/save-file-transfer.ts) —
    // this assumes a discriminated `{ ok: true; state: GameState }` shape
    // matching every other result type in this codebase; adjust if the
    // real type differs.
    if (!parsed.ok) throw new Error('expected successful parse');
    const loaded = parsed.state;

    const unit = loaded.units[unitId]!;
    expect(unit.position).toEqual({ q: 1, r: 1 });
    expect(unit.hasActed).toBe(true);
    expect(unit.movementPointsLeft).toBe(0);

    const nextTurn = processTurn(loaded /* plus whatever other required arguments processTurn takes — match Task 4 Step 5's call exactly */);
    const resetUnit = nextTurn.units[unitId]!;
    expect(resetUnit.hasActed).toBe(false);
    expect(resetUnit.movementPointsLeft).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-save.test.ts`
Expected: FAIL until the serialize/deserialize/turn-reset imports are filled in correctly.

- [x] **Step 3: Fill in the real imports and confirm no production code changes are needed**

Per spec §15, no schema migration is expected — if this test fails against correctly-wired imports, it indicates a real serialization gap (e.g. `Unit`'s existing fields not round-tripping `paratrooper`-specific state), which would be a genuine bug to fix in `src/storage/`, not a reason to weaken the test.

- [x] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-save.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add tests/systems/airborne-save.test.ts
git commit -m "test(#543): prove paradrop state round-trips through save/load with no schema migration"
```

---

### Task 14: Balance and statistical validation

**Files:**
- Create: `tests/systems/airborne-balance.test.ts`

**Interfaces:**
- Consumes: `executeParadrop`, `getParadropTargets` (Tasks 3-6); `rankParadrop` (Task 9)

- [x] **Step 1: Write the tests**

Implement each representative situation from spec §17 as a statistical/sampled assertion, following `strategy-game-mechanics.md`'s "run N trials, assert average is in expected range" convention (check an existing statistical test, e.g. in `tests/systems/combat-system.test.ts`, for this repo's exact sampling helper pattern and reuse it):

```typescript
import { describe, it, expect } from 'vitest';
import { executeParadrop, getParadropTargets } from '@/systems/airborne-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('paradrop balance — representative situations (#543 spec §17)', () => {
  it('range 4 reaches meaningfully behind a typical frontline without covering the whole map on a standard map size', () => {
    const state = makeStandardSizeMapFixtureWithParatrooperAtFrontline(); // reuse the map generator's default size, not a hand-shrunk test map
    const paratrooper = Object.values(state.units).find(u => u.type === 'paratrooper')!;
    const targets = getParadropTargets(state, paratrooper.id);
    const mapArea = state.map.width * /* map height from fixture */ 1;
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.length).toBeLessThan(mapArea * 0.15); // range doesn't trivialize the whole map — tune this threshold from the actual sampled number, don't leave 0.15 unverified
  });

  it('at era-9 baseline (full health, no flak/interception), Paratrooper is not strictly dominant over Infantry', () => {
    const paratrooper = UNIT_DEFINITIONS.paratrooper;
    const infantry = UNIT_DEFINITIONS.infantry;
    expect(paratrooper.strength).toBeLessThan(infantry.strength);
    expect(paratrooper.productionCost).toBeGreaterThanOrEqual(infantry.productionCost);
  });

  it('flak + interception together reduce landing health more than either alone, without guaranteeing destruction of a full-health unit (statistical sample)', () => {
    const trials = 50;
    let flakOnlyDestroyed = 0;
    let combinedDestroyed = 0;
    for (let seedOffset = 0; seedOffset < trials; seedOffset++) {
      const flakOnlyState = makeFlakOnlyFixture(seedOffset);
      const flakOnlyUnit = Object.values(flakOnlyState.state.units).find(u => u.type === 'paratrooper')!;
      const flakOnlyResult = executeParadrop(flakOnlyState.state, flakOnlyUnit.id, flakOnlyState.destination);
      if (flakOnlyResult.ok && !flakOnlyResult.state.units[flakOnlyUnit.id]) flakOnlyDestroyed++;

      const combinedState = makeFlakAndInterceptorFixture(seedOffset);
      const combinedUnit = Object.values(combinedState.state.units).find(u => u.type === 'paratrooper')!;
      const combinedResult = executeParadrop(combinedState.state, combinedUnit.id, combinedState.destination);
      if (combinedResult.ok && !combinedResult.state.units[combinedUnit.id]) combinedDestroyed++;
    }
    expect(flakOnlyDestroyed).toBe(0); // flak alone at current magnitudes never one-shots a full-health unit
    expect(combinedDestroyed).toBeGreaterThan(0); // combined risk is real
    expect(combinedDestroyed).toBeLessThan(trials); // but not a guaranteed kill either
  });

  it('rankParadrop scores a reinforcement drop to a threatened friendly city above an isolated low-value drop', () => {
    const context = makeThreatenedCityReinforcementContext();
    const paratrooper = Object.values(context.state.units).find(u => u.type === 'paratrooper')!;
    const actions = rankParadrop(context, paratrooper);
    const reinforceAction = actions.find(a => a.action.kind === 'paradrop' && /* destination matches the threatened city's adjacent tile */ true);
    const isolatedAction = actions.find(a => a.action.kind === 'paradrop' && /* destination matches a far, unsupported tile */ true);
    expect(reinforceAction).toBeDefined();
    expect(isolatedAction).toBeDefined();
    expect(reinforceAction!.score).toBeGreaterThan(isolatedAction!.score);
  });
});
```

- [x] **Step 2: Run tests, fill in fixtures, observe actual numbers**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-balance.test.ts`

Build out each fixture using the map/AI-context conventions already established in earlier tasks' test files. Where a test asserts an unverified threshold (e.g. the `0.15` map-coverage fraction above), **replace it with the actual observed value from a real run once the fixture exists**, per spec §17's requirement that these are starting numbers to validate, not numbers to leave unverified in the plan.

- [x] **Step 3: If any assertion reveals range/stat/damage values are wrong, fix the spec and the definition together**

If, e.g., range 4 turns out to cover an unreasonably large fraction of a standard map, change `paratrooper.paradrop.range` in `src/systems/unit-system.ts` (Task 2) and record the change with the observed data in a short note at the top of this test file — per spec §17, this is an expected, documented outcome of running the balance pass, not a plan failure.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-balance.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add tests/systems/airborne-balance.test.ts src/systems/unit-system.ts
git commit -m "test(#543): add statistical balance validation for paradrop range, stats, and flak/interception risk"
```

---

### Task 15: Full regression pass and PR readiness

**Files:** None new — verification only.

- [x] **Step 1: Run the full fast test tier**

Run: `bash scripts/run-with-mise.sh yarn test:fast`
Expected: PASS, zero regressions in `#539` interception tests, `#540` transport/amphibious tests, movement/ZOC tests, or any other existing suite.

- [x] **Step 2: Run the full build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS, zero TypeScript errors.

- [x] **Step 3: Run the full test suite (not just fast tier) at least once before opening a PR**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [x] **Step 4: Manual smoke test in the browser**

Start the dev server, start a new game or load a save at era 9+, research `armored-tactics` and `air-superiority`, build an Airfield, train a Paratrooper, select it, click Paradrop, confirm: range highlight appears, tapping a legal tile relocates the unit and shows it can't act again, tapping an illegal tile shows the correct rejection message, the unit's info panel reflects the lockout. Take a screenshot as proof per this project's UI-change verification convention.

- [x] **Step 5: Update the plan doc's phase-status annotation**

Per `.claude/rules/spec-fidelity.md`'s "Plan Docs Must Stay Synced With Merged Phases" rule, once this plan's tasks are merged, add a status line to this file's header (e.g. `✅ Phase 1 merged (#PR-number)`) in the same PR that completes it.

- [x] **Step 6: Final commit and hand off for PR creation**

```bash
git status
git log --oneline main..HEAD
```

Confirm the commit history above reads cleanly as a task-by-task history before opening the PR (per this project's incremental-delivery preference — do not squash into one giant commit).
