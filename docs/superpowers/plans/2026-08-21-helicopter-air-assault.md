# Helicopter Air Assault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This repo's CLAUDE.md forbids subagents/parallel agents — execute inline, not via subagent-driven-development.**

**Goal:** Add a Helicopter Air Assault action — an eligible infantry unit relocates from a friendly Helicopter Base city (using an available, un-acted Attack Helicopter stationed there) to a visible, legal tile within the helicopter's operational range, landing vulnerable exactly like Paradrop — fully wired through UI, AI, saves, and hot-seat, without persistent cargo and without diluting Attack Helicopter's anti-armor identity.

**Architecture:** `src/systems/airborne-system.ts` (Phase 1's Paradrop module) is extended, not duplicated. Two pieces of Paradrop's logic are extracted into shared helpers first (Tasks 1-2), each proven byte-identical to current behavior via a regression test, then Air Assault's own `getAirAssaultLaunchState`/`getAirAssaultTargets`/`canAirAssault`/`executeAirAssault` are built on top of those helpers (Tasks 3-5). UI, AI candidate generation, AI lookahead simulation, and AI execution all call the same functions — no parallel legality paths, following the exact pattern this codebase already uses for Paradrop, air missions, and transport.

**Tech Stack:** TypeScript, Vitest, Canvas 2D renderer, DOM/CSS UI panels. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-helicopter-air-assault-design.md` (read this first — this plan does not repeat its rationale, only its concrete requirements).

## Global Constraints

- No `Math.random()` anywhere — flak damage is deterministic; interception reuses `deterministicCombatSeed`.
- Every system function that mutates `GameState` returns a new state via spread-copy; never write through `state.units[id] = ...`.
- `state.currentPlayer` for all ownership/visibility checks — never hardcode `'player'`.
- Game-consequence notifications go through `appendNotification` (viewer-scoped), never `showNotification` (that's for the acting player's own immediate feedback only) — this lives inside `airborne-system.ts` itself, not the UI controller, so it fires identically for human- and AI-triggered assaults.
- New buttons in `src/ui/` use the file's existing `makeButton` helper (already compliant with the style.cssText/background+color rule).
- `textContent`/`createTextNode()` for all dynamic UI text — never `innerHTML` with game-generated strings.
- `AirAssaultCapability`: `{ baseKinds: Array<'helicopter_base'> }` — no `range` field; range is read live from `airOperation.operationalRange`.
- `airAssaultPassengerEligible?: true` on: `musketeer`, `grenadier`, `rifleman`, `machine_gunner`, `infantry`, `mechanized_infantry`, `exosuit_infantry`, `marine`, `paratrooper`.
- Launch requires the passenger standing on a friendly city with `'helicopter_base'` in `city.buildings`, and that city's air-base roster (`getAirBaseRoster`) must contain at least one unit with `!hasActed` **and** `UNIT_DEFINITIONS[type].airAssault` defined (not just any roster member — `combat_drone` also uses `helicopter_base` and must never be picked).
- On success: passenger gets the landing lockout (`movementPointsLeft: 0, hasMoved: true, hasActed: true`); the launching helicopter gets the identical lockout unconditionally (it flew the mission regardless of passenger outcome) — this is what keeps it from also attacking/rebasing/intercepting that turn.
- No difficulty tier may change legal targets, visible information, flak/interception mechanics, or either lockout — only AI scoring weights vary by difficulty.
- Every jargon term ("flak", "SAM Site") in player-facing copy must carry a plain-language gloss in the same string.
- Highlight overlays follow this file's existing convention exactly: a distinct fill color per highlight `type`, with the accompanying text notification (not a new icon-overlay system) carrying the plain-language accessibility burden — this matches how `paradrop-target`/`paradrop-flak-risk` already ship today, not a new pattern.
- No new persisted `Unit`/`GameState` field anywhere in this plan. No save migration.

---

## File Structure

| File | Change |
|---|---|
| `src/systems/airborne-system.ts` | Extract `isLegalAirborneLandingTile` + `resolveAirborneLanding`/`notifyAirborneOutcome` from Paradrop's existing code (Tasks 1-2); add `AirAssaultFailureReason`, `getAirAssaultLaunchState`, `getAirAssaultTargets`, `canAirAssault`, `executeAirAssault`, `AirAssaultResult` (Tasks 4-5) |
| `src/core/types.ts` | Add `AirAssaultCapability` interface + `airAssault?: AirAssaultCapability` on `UnitDefinition`; add `airAssaultPassengerEligible?: true` on `UnitDefinition` |
| `src/systems/unit-system.ts` | Add `airAssault: { baseKinds: ['helicopter_base'] }` to `attack_helicopter`; add `airAssaultPassengerEligible: true` to the 9 passenger-lineage units; extend `UNIT_DESCRIPTIONS.attack_helicopter` |
| `src/systems/combat-role-definitions.ts` | Add a `publicFacts` line to the `attack_helicopter` role entry |
| `src/ai/ai-tactics.ts` | Add `'air-assault'` to `AITacticalAction`; add private `rankAirAssault`, spread into `rankUnitTacticalActions`; add case to `actionId`; add case to the lookahead switch (`applyPredictedAction`) |
| `src/ai/ai-major-turn.ts` | Add case to `executeAction` switch |
| `src/app/ports.ts` | Add `{ kind: 'air-assault'; unitId: string }` to `PendingMapIntent` |
| `src/input/map-tap-intent.ts` | Widen `ResolvablePendingIntent` and the pending-check to include `'air-assault'` |
| `src/renderer/render-loop.ts` | Add `'air-assault-target'` / `'air-assault-flak-risk'` to `HexHighlight['type']` + `HEX_HIGHLIGHT_COLORS` |
| `src/app/controllers/selection-controller.ts` | Wire `onStartAirAssault`/`onCancelAirAssault` callbacks, `pendingIntent`, highlights, range/flak preview text |
| `src/app/controllers/map-interaction-controller.ts` | Add `case 'air-assault':` to the `resolve-pending` switch |
| `src/ui/selected-unit-info.ts` | Add Air Assault button (type-gated on `def.airAssaultPassengerEligible`, mirroring the existing Paradrop button exactly) + accessible preview text |
| `tests/systems/airborne-system.test.ts` | Extend: shared-helper regression tests (Tasks 1-2), new `describe` blocks for Air Assault (Tasks 4-5) |
| `tests/ai/ai-tactics.test.ts` | Extend: `rankAirAssault` coverage, opportunity-cost, production-scoring regression |
| `tests/systems/airborne-hotseat.test.ts` | Extend: Air Assault two-civ discovery isolation |
| `tests/systems/airborne-save.test.ts` | Extend: Air Assault save/load round-trip |
| `tests/systems/airborne-balance.test.ts` | Extend: Air Assault vs. Paradrop dominance check, representative situations |
| `tests/systems/description-honesty.test.ts` | (read only, to confirm new copy doesn't hit the denylist) |

---

### Task 1: Extract `isLegalAirborneLandingTile` from `getParadropTargets`

**Files:**
- Modify: `src/systems/airborne-system.ts`
- Test: `tests/systems/airborne-system.test.ts`

**Interfaces:**
- Consumes: everything `getParadropTargets` already imports (`isVisible`, `getMovementCostForUnit`, `UNIT_DEFINITIONS`, `getUnitIdsAtCoord`, `isBlockingCityFor`, `hexKey`)
- Produces: `function isLegalAirborneLandingTile(state: GameState, unit: Unit, coord: HexCoord, occupancy: ReturnType<typeof buildUnitOccupancy>): boolean` (module-private — both `getParadropTargets` and the new `getAirAssaultTargets` call it, but nothing outside this file needs it)

This is a pure refactor: `getParadropTargets`'s behavior must be provably unchanged before and after.

- [ ] **Step 1: Write the regression test proving current behavior, before touching any code**

Open `tests/systems/airborne-system.test.ts` and confirm the existing `describe('getParadropTargets', ...)` block (it already asserts range/fog/occupancy/foreign-city/terrain exclusions using `makeParadropFixture()` — these are your baseline). Add one more assertion capturing the exact current target set as a snapshot, so the refactor in Step 3 has a single sharp regression to run against:

```typescript
it('produces the exact same target set before and after the isLegalAirborneLandingTile extraction (regression)', () => {
  const { state, unitId } = makeParadropFixture();
  const targets = getParadropTargets(state, unitId).map(hexKey).sort();
  expect(targets).toEqual(['1,1'].sort());
});
```

- [ ] **Step 2: Run test to verify it currently passes (baseline, not a failing-test step — this one must already be green)**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts -t "isLegalAirborneLandingTile extraction"`
Expected: PASS (this proves your snapshot value is correct before refactoring).

- [ ] **Step 3: Extract the helper**

In `src/systems/airborne-system.ts`, replace `getParadropTargets`'s filter callback body with a call to a new shared function. The current function (from `getParadropTargets`, verify against the live file since it may have shifted slightly since this plan was written) is:

```typescript
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

  return candidates.filter(coord => isLegalAirborneLandingTile(state, unit, coord, occupancy));
}

function isLegalAirborneLandingTile(state: GameState, unit: Unit, coord: HexCoord, occupancy: ReturnType<typeof buildUnitOccupancy>): boolean {
  const visibility = state.civilizations[unit.owner]?.visibility;
  if (visibility && !isVisible(visibility, coord)) return false;
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) return false;
  if (getUnitIdsAtCoord(occupancy, coord).length > 0) return false;
  const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(coord));
  if (city && isBlockingCityFor(state, unit, city)) return false;
  return true;
}
```

Note `visibility` is now computed inside the helper (it was previously computed once outside the filter closure and captured) — this is a deliberate, harmless simplification since `state`/`unit` fully determine it; it does not change behavior for any single call.

- [ ] **Step 4: Run the full airborne-system test file**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS, every existing test including the new regression snapshot from Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/systems/airborne-system.ts tests/systems/airborne-system.test.ts
git commit -m "refactor(#543): extract isLegalAirborneLandingTile for air-assault reuse"
```

---

### Task 2: Extract `resolveAirborneLanding` + `notifyAirborneOutcome` from `executeParadrop`

**Files:**
- Modify: `src/systems/airborne-system.ts`
- Test: `tests/systems/airborne-system.test.ts`

**Interfaces:**
- Consumes: everything `executeParadrop` already imports (`selectInterceptor`, `deterministicCombatSeed`, `resolveCombat`, `buildCombatContextForDefender`, `resolveCombatEra`, `applyCombatOutcomeToState`, `getHostileAirDefenseThreat`, `appendNotification`, `isHostileOwnerTo`)
- Produces:
  ```typescript
  interface AirborneLandingOutcome {
    state: GameState;
    flak?: { damage: number; providerId: string; providerLabel: string };
    interception?: { interceptorId: string; result: CombatResult };
    survived: boolean;
  }
  function resolveAirborneLanding(state: GameState, unit: Unit, destination: HexCoord): AirborneLandingOutcome
  function notifyAirborneOutcome(state: GameState, droppedUnit: Unit, destination: HexCoord, outcome: { flak?: ...; interception?: ...; destroyed: boolean }, verb: string): GameState
  ```
  `verb` parameterizes only the notification text (`'paradropped'` for Paradrop, `'was flown in by helicopter'` for Air Assault) — no mechanical difference.

This is a pure refactor of `executeParadrop`'s body from the flak-damage step through interception resolution; it does **not** move the landing-lockout application (Step 3 in the original) or the final `notifyParadropOutcome` call, since Air Assault needs different lockout logic (the helicopter too) and a different notification message shape (see Task 5) — only the flak+interception resolution core is shared.

- [ ] **Step 1: Write the regression test proving current behavior**

Add to `tests/systems/airborne-system.test.ts`, inside (or right after) the existing `describe('executeParadrop', ...)` block:

```typescript
it('produces byte-identical outcomes before and after the resolveAirborneLanding extraction (regression)', () => {
  const { state, unitId } = makeParadropFixture();
  const before = executeParadrop(state, unitId, { q: 1, r: 1 });
  expect(before).toEqual({
    ok: true,
    state: expect.objectContaining({
      units: expect.objectContaining({
        [unitId]: expect.objectContaining({ position: { q: 1, r: 1 }, movementPointsLeft: 0, hasMoved: true, hasActed: true }),
      }),
    }),
  });
});
```

- [ ] **Step 2: Run test to verify it currently passes (baseline)**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts -t "resolveAirborneLanding extraction"`
Expected: PASS.

- [ ] **Step 3: Extract the helper**

Read the current full body of `executeParadrop` in `src/systems/airborne-system.ts` (it was last touched by the post-implementation review commit — verify against the live file, not this plan, since exact line numbers will have shifted from Task 1's edit). Pull everything from the flak calculation through the interception resolution (everything between `const check = canParadrop(...)` and the final landing-lockout application) into:

```typescript
function resolveAirborneLanding(state: GameState, unit: Unit, destination: HexCoord): {
  state: GameState;
  flak?: { damage: number; providerId: string; providerLabel: string };
  interception?: { interceptorId: string; result: CombatResult };
  survived: boolean;
} {
  let workingUnit: Unit = { ...unit, position: { ...destination } };

  const threat = getHostileAirDefenseThreat(state, unit, destination);
  const strongestProvider = threat.providers[0];
  let flak: { damage: number; providerId: string; providerLabel: string } | undefined;
  if (strongestProvider && threat.flatDefenseModifier > 0) {
    flak = { damage: threat.flatDefenseModifier, providerId: strongestProvider.id, providerLabel: strongestProvider.label };
    const health = workingUnit.health - threat.flatDefenseModifier;
    if (health <= 0) {
      const { [unit.id]: _removed, ...remainingUnits } = state.units;
      const owner = state.civilizations[unit.owner];
      const strippedState: GameState = {
        ...state,
        units: remainingUnits,
        civilizations: owner ? { ...state.civilizations, [unit.owner]: { ...owner, units: owner.units.filter(id => id !== unit.id) } } : state.civilizations,
      };
      return { state: strippedState, flak, survived: false };
    }
    workingUnit = { ...workingUnit, health };
  }

  let nextState: GameState = { ...state, units: { ...state.units, [unit.id]: workingUnit } };
  const interceptor = selectInterceptor(nextState, workingUnit, destination);
  let interception: { interceptorId: string; result: CombatResult } | undefined;
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
    if (!nextState.units[unit.id]) {
      return { state: nextState, flak, interception, survived: false };
    }
  }

  return { state: nextState, flak, interception, survived: true };
}
```

Then rewrite `executeParadrop` to call it:

```typescript
export function executeParadrop(state: GameState, unitId: string, destination: HexCoord): ParadropResult {
  const check = canParadrop(state, unitId, destination);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const unit = state.units[unitId]!;

  const landing = resolveAirborneLanding(state, unit, destination);
  if (!landing.survived) {
    return { ok: true, state: notifyParadropOutcome(landing.state, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: true }), flak: landing.flak, interception: landing.interception };
  }

  const survivor = landing.state.units[unitId]!;
  const landedState: GameState = {
    ...landing.state,
    units: { ...landing.state.units, [unitId]: { ...survivor, movementPointsLeft: 0, hasMoved: true, hasActed: true } },
  };
  return { ok: true, state: notifyParadropOutcome(landedState, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: false }), flak: landing.flak, interception: landing.interception };
}
```

Leave `notifyParadropOutcome` exactly as-is for now — Task 5 generalizes it into `notifyAirborneOutcome` once Air Assault needs it too, to avoid changing two things in one step.

- [ ] **Step 4: Run the full airborne-system test file**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS, every existing test including the new regression from Step 1 and every flak/interception/notification test already in the file.

- [ ] **Step 5: Run the full test suite once here — this refactor touches the most load-bearing function in the file**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. Also run `bash scripts/run-with-mise.sh yarn build` to confirm no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/systems/airborne-system.ts tests/systems/airborne-system.test.ts
git commit -m "refactor(#543): extract resolveAirborneLanding for air-assault reuse"
```

---

### Task 3: Add `AirAssaultCapability` and `airAssaultPassengerEligible` fields

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Test: `tests/systems/unit-system.test.ts`

**Interfaces:**
- Produces: `AirAssaultCapability { baseKinds: Array<'helicopter_base'> }` on `UnitDefinition.airAssault?`; `UnitDefinition.airAssaultPassengerEligible?: true`; `UNIT_DEFINITIONS.attack_helicopter.airAssault`; `airAssaultPassengerEligible: true` on the 9 lineage units.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/unit-system.test.ts`:

```typescript
describe('air assault capability wiring', () => {
  it('Attack Helicopter has the airAssault capability, keyed to helicopter_base', () => {
    expect(UNIT_DEFINITIONS.attack_helicopter.airAssault).toEqual({ baseKinds: ['helicopter_base'] });
  });

  it('Combat Drone (also helicopter_base-eligible) does NOT have the airAssault capability', () => {
    expect(UNIT_DEFINITIONS.combat_drone.airAssault).toBeUndefined();
  });

  it('marks exactly the historical infantry lineage as airAssaultPassengerEligible', () => {
    const eligible: UnitType[] = ['musketeer', 'grenadier', 'rifleman', 'machine_gunner', 'infantry', 'mechanized_infantry', 'exosuit_infantry', 'marine', 'paratrooper'];
    for (const type of eligible) {
      expect(UNIT_DEFINITIONS[type].airAssaultPassengerEligible).toBe(true);
    }
    const excluded: UnitType[] = ['mobile_aa', 'anti_tank_gun', 'cannon', 'artillery', 'rocket_artillery', 'tank', 'main_battle_tank', 'cavalry', 'settler', 'worker', 'attack_helicopter'];
    for (const type of excluded) {
      expect(UNIT_DEFINITIONS[type].airAssaultPassengerEligible).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts -t "air assault capability wiring"`
Expected: FAIL — `airAssault`/`airAssaultPassengerEligible` are undefined everywhere.

- [ ] **Step 3: Add the type fields**

In `src/core/types.ts`, find the `ParadropCapability` interface (search `interface ParadropCapability`) and add a new sibling interface immediately after it:

```typescript
export interface AirAssaultCapability {
  /** Building kinds this unit's air-base roster can launch an Air Assault from. */
  baseKinds: Array<'helicopter_base'>;
}
```

Find the `UnitDefinition` interface's `paradrop?: ParadropCapability;` line and add immediately after it:
```typescript
  /** Air-base-roster-driven troop insertion (see airborne-system.ts's executeAirAssault). Range is read from this same unit's airOperation.operationalRange, not stored here — the two must never drift apart by editing one and not the other (see the code comment at attack_helicopter's operationalRange definition). */
  airAssault?: AirAssaultCapability;
  /** True on units eligible to be carried by another unit's Air Assault action. Not derived from UnitClass — 'gunpowder' is too broad (also covers artillery/AA/anti-tank). */
  airAssaultPassengerEligible?: true;
```

- [ ] **Step 4: Add the capability to Attack Helicopter and the code comment on `operationalRange`**

In `src/systems/unit-system.ts`, find the `attack_helicopter` entry (search `attack_helicopter: {`) and change:

```typescript
  attack_helicopter: {
    type: 'attack_helicopter', name: 'Attack Helicopter',
    movementPoints: 5, visionRange: 3, strength: 40,
    canFoundCity: false, canBuildImprovements: false, productionCost: 230,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    airOperation: { baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'], carrierEligible: false },
  },
```
to:
```typescript
  attack_helicopter: {
    type: 'attack_helicopter', name: 'Attack Helicopter',
    movementPoints: 5, visionRange: 3, strength: 40,
    canFoundCity: false, canBuildImprovements: false, productionCost: 230,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    // operationalRange also doubles as Air Assault's range (see
    // airborne-system.ts's getAirAssaultTargets, which reads this field
    // directly rather than storing a separate number). A future combat
    // rebalance of this value retunes Air Assault range too -- re-run
    // tests/systems/airborne-balance.test.ts's dominance check if you
    // change it.
    airOperation: { baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'], carrierEligible: false },
    airAssault: { baseKinds: ['helicopter_base'] },
  },
```

- [ ] **Step 5: Add `airAssaultPassengerEligible: true` to the 9 lineage units**

In `src/systems/unit-system.ts`, add `airAssaultPassengerEligible: true,` to each of these existing `UNIT_DEFINITIONS` entries (search each `type: '<name>'` string to locate it — do not change any other field on these entries): `musketeer`, `grenadier`, `rifleman`, `machine_gunner`, `infantry`, `mechanized_infantry`, `exosuit_infantry`, `marine`, `paratrooper`.

Example for `musketeer` (the others follow the same one-line insertion inside their existing object literal):
```typescript
  musketeer: {
    type: 'musketeer', name: 'Musketeer', movementPoints: 2,
    visionRange: 2, strength: 34, canFoundCity: false,
    canBuildImprovements: false, productionCost: 90,
    airAssaultPassengerEligible: true,
  },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts -t "air assault capability wiring"`
Expected: PASS.

- [ ] **Step 7: Run `yarn build` to confirm no exhaustive-map breakage**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — these are optional fields (`?:`), so no `Record<UnitType, X>` map should require an update. If it does fail, record exactly which map and fix it in this task before moving on (do not defer).

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts tests/systems/unit-system.test.ts
git commit -m "feat(#543): add airAssault and airAssaultPassengerEligible capability fields"
```

---

### Task 4: `getAirAssaultLaunchState`, `getAirAssaultTargets`, `canAirAssault`

**Files:**
- Modify: `src/systems/airborne-system.ts`
- Test: `tests/systems/airborne-system.test.ts`

**Interfaces:**
- Consumes: `getAirBaseKind`, `getAirBaseRoster` from `@/systems/air-operations-system`; `isLegalAirborneLandingTile` (Task 1); `UNIT_DEFINITIONS` from `@/systems/unit-system`
- Produces:
  ```typescript
  export type AirAssaultFailureReason =
    | 'not-eligible-passenger' | 'no-launch-base' | 'no-launch-helicopter' | 'already-acted'
    | 'out-of-range' | 'unexplored' | 'impassable-terrain'
    | 'destination-occupied' | 'foreign-city';
  export function getAirAssaultLaunchState(state: GameState, unitId: string): { ok: true; helicopterId: string } | { ok: false; reason: AirAssaultFailureReason };
  export function getAirAssaultTargets(state: GameState, unitId: string): HexCoord[];
  export function canAirAssault(state: GameState, unitId: string, destination: HexCoord): { ok: true; helicopterId: string } | { ok: false; reason: AirAssaultFailureReason };
  ```

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/airborne-system.test.ts`. First add a new fixture builder alongside `makeParadropFixture` (same file, same conventions — a friendly Helicopter Base city with an `attack_helicopter` and an `infantry` unit standing on it, plus a `combat_drone` also based there to prove the roster filter):

```typescript
function makeAirAssaultFixture(): { state: GameState; unitId: string; cityId: string; helicopterId: string } {
  const passenger: Unit = {
    id: 'inf-1', type: 'infantry', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false,
  };
  const helicopter: Unit = {
    id: 'heli-1', type: 'attack_helicopter', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false, airBase: { kind: 'city', cityId: 'city-1' },
  };
  const drone: Unit = {
    id: 'drone-1', type: 'combat_drone', owner: 'civ-a', position: { q: 0, r: 0 },
    movementPointsLeft: 6, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false, airBase: { kind: 'city', cityId: 'city-1' },
  };
  const friendlyBlocker: Unit = {
    id: 'blocker-1', type: 'warrior', owner: 'civ-a', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false,
  };
  const state = {
    units: { 'inf-1': passenger, 'heli-1': helicopter, 'drone-1': drone, 'blocker-1': friendlyBlocker },
    cities: {
      'city-1': { id: 'city-1', owner: 'civ-a', position: { q: 0, r: 0 }, buildings: ['helicopter_base'] },
      'city-2': { id: 'city-2', owner: 'civ-b', position: { q: 2, r: 0 }, buildings: [] },
    },
    civilizations: {
      'civ-a': {
        diplomacy: { atWarWith: [], events: [] },
        units: ['inf-1', 'heli-1', 'drone-1', 'blocker-1'],
        techState: { completed: [], currentResearch: null, researchProgress: 0 },
        visibility: {
          tiles: {
            '0,0': 'visible', '1,1': 'visible', '1,0': 'visible',
            '2,0': 'visible', '-1,2': 'visible',
          },
        },
      },
      'civ-b': {
        diplomacy: { atWarWith: [], events: [] }, units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0 },
        visibility: { tiles: {} },
      },
    },
    map: {
      width: 20, height: 20, wrapsHorizontally: false,
      tiles: {
        '0,0': tile('grassland'), '1,1': tile('grassland'), '1,0': tile('grassland'),
        '2,0': tile('grassland'), '2,2': tile('grassland'), '-1,2': tile('ocean'),
      },
    },
  } as unknown as GameState;

  return { state, unitId: 'inf-1', cityId: 'city-1', helicopterId: 'heli-1' };
}

describe('getAirAssaultLaunchState', () => {
  it('rejects a unit with no airAssaultPassengerEligible flag', () => {
    const { state } = makeAirAssaultFixture();
    const tankState = { ...state, units: { ...state.units, 'inf-1': { ...state.units['inf-1']!, type: 'tank' } } } as unknown as GameState;
    expect(getAirAssaultLaunchState(tankState, 'inf-1')).toEqual({ ok: false, reason: 'not-eligible-passenger' });
  });

  it('rejects a passenger not standing on a helicopter_base city', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const moved = { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, position: { q: 9, r: 9 } } } };
    expect(getAirAssaultLaunchState(moved, unitId)).toEqual({ ok: false, reason: 'no-launch-base' });
  });

  it('rejects when the base has no airAssault-capable roster unit (both roster members are Combat Drones)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    // City is still a valid helicopter_base -- the failure here is
    // capability absence, not the base itself, so the expected reason is
    // 'no-launch-helicopter', not 'no-launch-base'.
    const noHeli = { ...state, units: { ...state.units, [helicopterId]: { ...state.units[helicopterId]!, type: 'combat_drone' } } } as unknown as GameState;
    expect(getAirAssaultLaunchState(noHeli, unitId)).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('rejects when the only airAssault-capable roster helicopter has already acted, even though the Combat Drone sharing the roster has not (never falls back to picking it)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    // 'drone-1' from the fixture remains hasActed: false throughout --
    // this asserts the picker doesn't fall back to it.
    const acted = { ...state, units: { ...state.units, [helicopterId]: { ...state.units[helicopterId]!, hasActed: true } } };
    expect(getAirAssaultLaunchState(acted, unitId)).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('excludes an intercept-stance helicopter from the picker (already hasActed via startIntercept)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    const intercepting = { ...state, units: { ...state.units, [helicopterId]: { ...state.units[helicopterId]!, airMission: 'intercept' as const, hasActed: true, movementPointsLeft: 0, hasMoved: true } } };
    expect(getAirAssaultLaunchState(intercepting, unitId)).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('accepts an eligible passenger with an available roster helicopter, returning its id', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    expect(getAirAssaultLaunchState(state, unitId)).toEqual({ ok: true, helicopterId });
  });

  it('picks the lowest-id available helicopter when two are based at the city', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const secondHeli: Unit = { id: 'heli-0', type: 'attack_helicopter', owner: 'civ-a', position: { q: 0, r: 0 }, movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false, airBase: { kind: 'city', cityId: 'city-1' } };
    const twoHeli = { ...state, units: { ...state.units, 'heli-0': secondHeli } };
    expect(getAirAssaultLaunchState(twoHeli, unitId)).toEqual({ ok: true, helicopterId: 'heli-0' });
  });
});

describe('getAirAssaultTargets / canAirAssault', () => {
  it('includes a plain visible, passable, unoccupied in-range tile', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const targets = getAirAssaultTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 1)).toBe(true);
  });

  it('excludes an occupied tile, matching Paradrop\'s legality rules via the shared helper', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const targets = getAirAssaultTargets(state, unitId);
    expect(targets.some(t => t.q === 1 && t.r === 0)).toBe(false);
  });

  it('excludes a foreign unallied city tile', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const targets = getAirAssaultTargets(state, unitId);
    expect(targets.some(t => t.q === 2 && t.r === 0)).toBe(false);
  });

  it('canAirAssault accepts a legal tile and returns the picked helicopterId', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    expect(canAirAssault(state, unitId, { q: 1, r: 1 })).toEqual({ ok: true, helicopterId });
  });

  it('canAirAssault rejects a tile outside getAirAssaultTargets', () => {
    const { state, unitId } = makeAirAssaultFixture();
    expect(canAirAssault(state, unitId, { q: 99, r: 99 })).toEqual({ ok: false, reason: 'out-of-range' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts -t "getAirAssault"`
Expected: FAIL — the functions don't exist yet.

- [ ] **Step 3: Implement**

Add to `src/systems/airborne-system.ts` (add `getAirBaseRoster` to the existing `air-operations-system` import line):

```typescript
import { getAirBaseKind, getAirBaseRoster, selectInterceptor } from '@/systems/air-operations-system';

export type AirAssaultFailureReason =
  | 'not-eligible-passenger' | 'no-launch-base' | 'no-launch-helicopter' | 'already-acted'
  | 'out-of-range' | 'unexplored' | 'impassable-terrain'
  | 'destination-occupied' | 'foreign-city';

export const AIR_ASSAULT_FAILURE_MESSAGES: Record<AirAssaultFailureReason, string> = {
  'not-eligible-passenger': 'This unit cannot be air-assaulted.',
  'no-launch-base': 'Stand in a friendly city with a Helicopter Base to Air Assault.',
  'no-launch-helicopter': 'Your helicopters here have already acted this turn.',
  'already-acted': 'This unit has already acted this turn.',
  'out-of-range': 'That tile is outside the helicopter\'s operational range.',
  'unexplored': 'You have not explored that tile.',
  'impassable-terrain': 'A unit cannot land there.',
  'destination-occupied': 'That tile is occupied.',
  'foreign-city': 'Move adjacent, then use the city assault action.',
};

function findLaunchCity(state: GameState, unit: Unit) {
  return Object.values(state.cities).find(city =>
    city.owner === unit.owner && hexKey(city.position) === hexKey(unit.position));
}

function pickAirAssaultHelicopter(state: GameState, cityId: string, baseKind: string): Unit | undefined {
  return getAirBaseRoster(state, { kind: 'city', cityId })
    .find(candidate => !candidate.hasActed && UNIT_DEFINITIONS[candidate.type].airAssault?.baseKinds.includes(baseKind as never));
}

export function getAirAssaultLaunchState(state: GameState, unitId: string): { ok: true; helicopterId: string } | { ok: false; reason: AirAssaultFailureReason } {
  const unit = state.units[unitId];
  if (!unit || !UNIT_DEFINITIONS[unit.type].airAssaultPassengerEligible) return { ok: false, reason: 'not-eligible-passenger' };
  if (unit.hasActed || unit.movementPointsLeft <= 0) return { ok: false, reason: 'already-acted' };
  const launchCity = findLaunchCity(state, unit);
  const baseKind = launchCity && getAirBaseKind(state, { kind: 'city', cityId: launchCity.id });
  if (!launchCity || baseKind !== 'helicopter_base') return { ok: false, reason: 'no-launch-base' };
  const helicopter = pickAirAssaultHelicopter(state, launchCity.id, baseKind);
  if (!helicopter) return { ok: false, reason: 'no-launch-helicopter' };
  return { ok: true, helicopterId: helicopter.id };
}

function airAssaultRange(state: GameState, launchCityId: string): number {
  // Callers of this function have already passed through
  // getAirAssaultLaunchState, which only returns ok:true once baseKind is
  // confirmed 'helicopter_base' -- safe to pass the literal directly here
  // rather than re-deriving it from getAirBaseKind a second time.
  const helicopter = pickAirAssaultHelicopter(state, launchCityId, 'helicopter_base');
  return helicopter ? UNIT_DEFINITIONS[helicopter.type].airOperation!.operationalRange : 0;
}

export function getAirAssaultTargets(state: GameState, unitId: string): HexCoord[] {
  const launchState = getAirAssaultLaunchState(state, unitId);
  if (!launchState.ok) return [];
  const unit = state.units[unitId]!;
  const launchCity = findLaunchCity(state, unit)!;
  const range = airAssaultRange(state, launchCity.id);
  const occupancy = buildUnitOccupancy(state.units);
  const candidates = state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, range, state.map.width)
    : hexesInRange(unit.position, range);

  return candidates.filter(coord => isLegalAirborneLandingTile(state, unit, coord, occupancy));
}

export function canAirAssault(state: GameState, unitId: string, destination: HexCoord): { ok: true; helicopterId: string } | { ok: false; reason: AirAssaultFailureReason } {
  const launchState = getAirAssaultLaunchState(state, unitId);
  if (!launchState.ok) return launchState;
  const unit = state.units[unitId]!;
  const launchCity = findLaunchCity(state, unit)!;
  const range = airAssaultRange(state, launchCity.id);
  const visibility = state.civilizations[unit.owner]?.visibility;

  if (paradropDistance(state, unit.position, destination) > range) return { ok: false, reason: 'out-of-range' };
  if (visibility && !isVisible(visibility, destination)) return { ok: false, reason: 'unexplored' };
  const tile = state.map.tiles[hexKey(destination)];
  if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) {
    return { ok: false, reason: 'impassable-terrain' };
  }
  const occupancy = buildUnitOccupancy(state.units);
  if (getUnitIdsAtCoord(occupancy, destination).length > 0) return { ok: false, reason: 'destination-occupied' };
  const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(destination));
  if (city && isBlockingCityFor(state, unit, city)) return { ok: false, reason: 'foreign-city' };

  const inTargets = getAirAssaultTargets(state, unitId).some(t => hexKey(t) === hexKey(destination));
  if (!inTargets) return { ok: false, reason: 'out-of-range' };
  return { ok: true, helicopterId: launchState.helicopterId };
}
```

(`paradropDistance` is the existing wrap-aware distance helper already in this file — reused verbatim, it's generic over any origin/destination pair despite its name; do not rename it as part of this task, that's an unrelated cleanup.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS, entire file.

- [ ] **Step 5: Commit**

```bash
git add src/systems/airborne-system.ts tests/systems/airborne-system.test.ts
git commit -m "feat(#543): add air assault launch and target legality"
```

---

### Task 5: `executeAirAssault`

**Files:**
- Modify: `src/systems/airborne-system.ts`
- Test: `tests/systems/airborne-system.test.ts`

**Interfaces:**
- Consumes: `resolveAirborneLanding` (Task 2), `canAirAssault` (Task 4)
- Produces:
  ```typescript
  export type AirAssaultResult =
    | { ok: true; state: GameState; helicopterId: string; flak?: {...}; interception?: {...} }
    | { ok: false; state: GameState; reason: AirAssaultFailureReason };
  export function executeAirAssault(state: GameState, unitId: string, destination: HexCoord): AirAssaultResult;
  ```
- Also generalizes `notifyParadropOutcome` into `notifyAirborneOutcome(state, droppedUnit, destination, outcome, verb: string)`, updating `executeParadrop`'s one call site to pass `'paradropped'`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/airborne-system.test.ts`:

```typescript
describe('executeAirAssault', () => {
  it('rejects an illegal destination without mutating state', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const result = executeAirAssault(state, unitId, { q: 99, r: 99 });
    expect(result).toEqual({ ok: false, state, reason: 'out-of-range' });
  });

  it('relocates the passenger, applies its landing lockout, and locks out the helicopter, on success', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    const result = executeAirAssault(state, unitId, { q: 1, r: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.helicopterId).toBe(helicopterId);
    const passenger = result.state.units[unitId]!;
    expect(passenger.position).toEqual({ q: 1, r: 1 });
    expect(passenger.movementPointsLeft).toBe(0);
    expect(passenger.hasMoved).toBe(true);
    expect(passenger.hasActed).toBe(true);
    const helicopter = result.state.units[helicopterId]!;
    expect(helicopter.position).toEqual({ q: 0, r: 0 }); // stays at base
    expect(helicopter.hasActed).toBe(true);
    expect(helicopter.movementPointsLeft).toBe(0);
  });

  it('locks out the helicopter even if the passenger is destroyed on landing (flak)', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    // Reuse the same hostile-AA fixture-extension pattern Paradrop's flak
    // tests already use elsewhere in this file -- place hostile Mobile AA
    // (8 defenseModifier) covering (1,1) and wound the passenger to 5 HP
    // first. isHostileOwnerTo requires an explicit bilateral atWarWith
    // entry (verified against owner-hostility.ts and this file's existing
    // flak-fixture convention at its interception/flak describe blocks) --
    // civ-b is not hostile to civ-a by default just by being a different
    // civilization, so this must be set explicitly or getHostileAirDefenseThreat
    // will correctly (and silently) find no threat, making this test a
    // false negative rather than a failure.
    const withHostileAA = {
      ...state,
      units: { ...state.units, [unitId]: { ...state.units[unitId]!, health: 5 }, 'aa-1': { id: 'aa-1', type: 'mobile_aa', owner: 'civ-b', position: { q: 1, r: 1 }, movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false } },
      civilizations: {
        ...state.civilizations,
        'civ-a': { ...state.civilizations['civ-a']!, diplomacy: { atWarWith: ['civ-b'], events: [] } },
        'civ-b': { ...state.civilizations['civ-b']!, diplomacy: { atWarWith: ['civ-a'], events: [] } },
      },
    } as unknown as GameState;
    const result = executeAirAssault(withHostileAA, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.units[unitId]).toBeUndefined();
    expect(result.state.units[helicopterId]!.hasActed).toBe(true);
  });

  it('cannot air-assault twice from the same helicopter in the same turn', () => {
    const { state, unitId, helicopterId } = makeAirAssaultFixture();
    const first = executeAirAssault(state, unitId, { q: 1, r: 1 });
    if (!first.ok) throw new Error('expected ok');
    const secondPassenger: Unit = { id: 'inf-2', type: 'infantry', owner: 'civ-a', position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false };
    const withSecondPassenger = { ...first.state, units: { ...first.state.units, 'inf-2': secondPassenger }, civilizations: { ...first.state.civilizations, 'civ-a': { ...first.state.civilizations['civ-a']!, units: [...first.state.civilizations['civ-a']!.units, 'inf-2'] } } };
    expect(canAirAssault(withSecondPassenger, 'inf-2', { q: 2, r: 2 })).toEqual({ ok: false, reason: 'no-launch-helicopter' });
  });

  it('always logs an outcome notification for the acting civ, worded for a helicopter mission', () => {
    const { state, unitId } = makeAirAssaultFixture();
    const result = executeAirAssault(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-a']?.some(n => /helicopter/i.test(n.message))).toBe(true);
  });
});

describe('Paratrooper dual-eligibility (Paradrop and Air Assault both legal, no special-case code)', () => {
  it('a Paratrooper in a city with both an Airfield and a Helicopter Base can Paradrop OR Air Assault, and using either disables the other via the shared hasActed flag', () => {
    // Build on makeAirAssaultFixture's helicopter_base city, but add
    // 'airfield' to its buildings too and swap the passenger to type
    // 'paratrooper' (airAssaultPassengerEligible includes it per Task 3).
    const { state, unitId, cityId } = makeAirAssaultFixture();
    const dualCity = { ...state, cities: { ...state.cities, [cityId]: { ...state.cities[cityId]!, buildings: ['helicopter_base', 'airfield'] } } };
    const paratrooperState = { ...dualCity, units: { ...dualCity.units, [unitId]: { ...dualCity.units[unitId]!, type: 'paratrooper' } } } as unknown as GameState;

    expect(getParadropLaunchState(paratrooperState, unitId)).toEqual({ ok: true });
    expect(getAirAssaultLaunchState(paratrooperState, unitId).ok).toBe(true);

    const afterParadrop = executeParadrop(paratrooperState, unitId, { q: 1, r: 1 });
    if (!afterParadrop.ok) throw new Error('expected ok');
    expect(getAirAssaultLaunchState(afterParadrop.state, unitId)).toEqual({ ok: false, reason: 'already-acted' });
  });
});

describe('executeParadrop — unaffected by the notifyAirborneOutcome generalization (regression)', () => {
  it('still logs the Paratrooper-specific landing message', () => {
    const { state, unitId } = makeParadropFixture();
    const result = executeParadrop(state, unitId, { q: 1, r: 1 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.state.notificationLog?.['civ-a']?.some(n => /landed/i.test(n.message))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts -t "executeAirAssault"`
Expected: FAIL — `executeAirAssault` is not exported.

- [ ] **Step 3: Generalize `notifyParadropOutcome` into `notifyAirborneOutcome`**

In `src/systems/airborne-system.ts`, rename `notifyParadropOutcome` to `notifyAirborneOutcome` and add a `verb: string` parameter, used in place of the hardcoded `'landed'`/`'was destroyed on the drop'` phrasing:

```typescript
function notifyAirborneOutcome(state: GameState, droppedUnit: Unit, destination: HexCoord, outcome: ParadropOutcome, verb: string): GameState {
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
    message: outcome.destroyed ? `${name} was destroyed ${verb}${suffix}.` : `${name} ${verb}${suffix}. It cannot act again this turn.`,
    type: outcome.destroyed || outcome.flak || outcome.interception ? 'warning' : 'info',
    turn: state.turn,
    target: { kind: 'map', coord: { ...destination }, label: name },
  });

  for (const civId of Object.keys(nextState.civilizations)) {
    if (civId === droppedUnit.owner || !isHostileOwnerTo(nextState, droppedUnit.owner, civId)) continue;
    const visibility = nextState.civilizations[civId]?.visibility;
    if (!visibility || !isVisible(visibility, destination)) continue;
    appendNotification(nextState, civId, {
      message: `An enemy ${name} has landed nearby.`,
      type: 'warning',
      turn: state.turn,
      target: { kind: 'map', coord: { ...destination }, label: name },
    });
  }
  return nextState;
}
```

(Two behavior-preserving generalizations bundled with the rename: `verb` replaces the hardcoded phrasing — passing `'landed'` for Paradrop reproduces its exact original text since `${name} landed${suffix}` matches; the hostile-civ message now says `An enemy ${name} has landed nearby.` instead of the hardcoded `'An enemy Paratrooper has landed nearby.'` — for Paradrop this produces the exact same string since `name` is `'Paratrooper'`, but it now also correctly names whichever unit type was air-assaulted for the new caller. Verify this against the Step 1 regression test for `executeParadrop`.)

Update `executeParadrop`'s two call sites to pass `'landed'` as the new `verb` argument (search for `notifyParadropOutcome(` inside `executeParadrop` — there are two calls, one in the flak-death early return and one at the end — rename both to `notifyAirborneOutcome(...)` and add `, 'landed'` as the final argument).

- [ ] **Step 4: Implement `executeAirAssault`**

Append to `src/systems/airborne-system.ts`:

```typescript
export type AirAssaultResult =
  | { ok: true; state: GameState; helicopterId: string; flak?: { damage: number; providerId: string; providerLabel: string }; interception?: { interceptorId: string; result: CombatResult } }
  | { ok: false; state: GameState; reason: AirAssaultFailureReason };

export function executeAirAssault(state: GameState, unitId: string, destination: HexCoord): AirAssaultResult {
  const check = canAirAssault(state, unitId, destination);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const unit = state.units[unitId]!;
  const helicopterId = check.helicopterId;

  const landing = resolveAirborneLanding(state, unit, destination);
  // The helicopter flew the mission regardless of the passenger's fate --
  // lock it out unconditionally, on top of whatever resolveAirborneLanding
  // already did to the passenger/interceptor.
  const lockedHelicopterState: GameState = {
    ...landing.state,
    units: {
      ...landing.state.units,
      [helicopterId]: { ...landing.state.units[helicopterId]!, movementPointsLeft: 0, hasMoved: true, hasActed: true },
    },
  };

  if (!landing.survived) {
    return {
      ok: true,
      state: notifyAirborneOutcome(lockedHelicopterState, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: true }, 'was flown in by helicopter'),
      helicopterId, flak: landing.flak, interception: landing.interception,
    };
  }

  const survivor = lockedHelicopterState.units[unitId]!;
  const landedState: GameState = {
    ...lockedHelicopterState,
    units: { ...lockedHelicopterState.units, [unitId]: { ...survivor, movementPointsLeft: 0, hasMoved: true, hasActed: true } },
  };
  return {
    ok: true,
    state: notifyAirborneOutcome(landedState, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: false }, 'was flown in by helicopter'),
    helicopterId, flak: landing.flak, interception: landing.interception,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS, entire file, including the `executeParadrop` regression describe block.

- [ ] **Step 6: Add and pass the turn-reset lockout integration test (both units)**

Add to `tests/systems/airborne-system.test.ts` (mirroring Paradrop's existing `processTurn` regression):

```typescript
it('both the passenger landing lockout and the helicopter lockout clear via real next-turn processing', () => {
  const { state, unitId, helicopterId } = makeAirAssaultFixture();
  const result = executeAirAssault(state, unitId, { q: 1, r: 1 });
  if (!result.ok) throw new Error('expected ok');
  const nextTurnState = processTurn(result.state /* match this file's existing processTurn call shape from the Paradrop lockout test above */);
  const passenger = nextTurnState.units[unitId]!;
  const helicopter = nextTurnState.units[helicopterId]!;
  expect(passenger.hasActed).toBe(false);
  expect(passenger.movementPointsLeft).toBeGreaterThan(0);
  expect(helicopter.hasActed).toBe(false);
  expect(helicopter.movementPointsLeft).toBeGreaterThan(0);
});
```

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-system.test.ts`
Expected: PASS.

- [ ] **Step 7: Full-file and full-suite check**

Run: `bash scripts/run-with-mise.sh yarn test`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/airborne-system.ts tests/systems/airborne-system.test.ts
git commit -m "feat(#543): implement executeAirAssault with dual lockout and shared landing resolution"
```

---

### Task 6: AI — `rankAirAssault`

**Files:**
- Modify: `src/ai/ai-tactics.ts`
- Modify: `src/ai/ai-major-turn.ts`
- Test: `tests/ai/ai-tactics.test.ts`

**Interfaces:**
- Consumes: `getAirAssaultTargets`, `canAirAssault`, `executeAirAssault` (Tasks 4-5); `getKnownHostileAirDefenseThreat` (already imported)
- Produces: `AITacticalAction` variant `{ kind: 'air-assault'; unitId: string; destination: HexCoord }`; private `rankAirAssault`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-tactics.test.ts` (open the file first and reuse its existing paradrop-ranking test's fixture/context-building helpers — do not invent new ones):

```typescript
describe('rankAirAssault', () => {
  it('produces no candidates for a unit with no airAssaultPassengerEligible flag', () => {
    // reuse this file's existing context/state builder, substituting a
    // tank in place of an eligible infantry unit at an otherwise-legal
    // helicopter_base city
    const actions = rankUnitTacticalActions(context, tankUnitId);
    expect(actions.some(a => a.action.kind === 'air-assault')).toBe(false);
  });

  it('produces a ranked air-assault candidate for an eligible unit with a legal target', () => {
    const actions = rankUnitTacticalActions(context, infantryUnitId);
    const airAssaultActions = actions.filter(a => a.action.kind === 'air-assault');
    expect(airAssaultActions.length).toBeGreaterThan(0);
  });

  it('never proposes a destination outside getAirAssaultTargets (fog-safe by construction)', () => {
    const actions = rankUnitTacticalActions(context, infantryUnitId);
    const legalTargets = new Set(getAirAssaultTargets(context.state, infantryUnitId).map(hexKey));
    for (const action of actions) {
      if (action.action.kind !== 'air-assault') continue;
      expect(legalTargets.has(hexKey(action.action.destination))).toBe(true);
    }
  });

  it('discounts score when the only roster helicopter would otherwise defend against known nearby enemy armor', () => {
    // Build two otherwise-identical contexts: one with a known hostile
    // tank within the helicopter's operationalRange of the launch city,
    // one without. The with-threat context's top air-assault score must
    // be strictly lower than the without-threat context's.
    const withThreatScore = Math.max(...rankUnitTacticalActions(contextWithNearbyArmor, infantryUnitId).filter(a => a.action.kind === 'air-assault').map(a => a.score), 0);
    const withoutThreatScore = Math.max(...rankUnitTacticalActions(contextWithoutNearbyArmor, infantryUnitId).filter(a => a.action.kind === 'air-assault').map(a => a.score), 0);
    expect(withThreatScore).toBeLessThan(withoutThreatScore);
  });
});
```

Fill in the fixture/context construction using this test file's existing conventions (it already has a `rankParadrop`-equivalent test block to copy the shape from) before running.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts -t "rankAirAssault"`
Expected: FAIL — `'air-assault'` is not a recognized action kind yet.

- [ ] **Step 3: Implement**

In `src/ai/ai-tactics.ts`:

1. Add the import (extend the existing `airborne-system` import line):
```typescript
import { getParadropTargets, executeParadrop, getAirAssaultTargets, executeAirAssault } from '@/systems/airborne-system';
```

2. Add to the `AITacticalAction` union, immediately after the `'paradrop'` variant:
```typescript
  | { kind: 'air-assault'; unitId: string; destination: HexCoord }
```

3. Add a case to `actionId` (find the existing `case 'paradrop':` inside the `case 'move': case 'withdraw': ... case 'paradrop':` group and add `'air-assault'` to that same group — its destination-based id format is identical):
```typescript
    case 'move':
    case 'withdraw':
    case 'found-city':
    case 'unload':
    case 'paradrop':
    case 'air-assault':
      return `${action.kind}:${action.unitId}:${hexKey(action.destination)}`;
```

4. Add `rankAirAssault`, immediately after `rankParadrop`:
```typescript
function rankAirAssault(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  if (!UNIT_DEFINITIONS[unit.type].airAssaultPassengerEligible || unit.hasActed) return [];
  const launchState = getAirAssaultLaunchState(context.state, unit.id);
  if (!launchState.ok) return [];
  const targets = getAirAssaultTargets(context.state, unit.id);
  if (targets.length === 0) return [];

  // Opportunity-cost discount: Paradrop has no equivalent because a
  // Paratrooper's only job is the drop. This spends a real combat piece's
  // turn, so discount when it's the base's only available helicopter and
  // a known hostile armor/siege unit sits within its own operational
  // range (i.e. something it could otherwise strike or that threatens
  // the launch city it's defending by sitting there).
  const helicopter = context.state.units[launchState.helicopterId]!;
  const helicopterDef = UNIT_DEFINITIONS[helicopter.type];
  const roster = getAirBaseRoster(context.state, helicopter.airBase!);
  const isOnlyHelicopter = roster.filter(u => UNIT_DEFINITIONS[u.type].airAssault !== undefined).length <= 1;
  const range = helicopterDef.airOperation!.operationalRange;
  const nearbyKnownArmorThreat = isOnlyHelicopter && Object.values(context.state.units).some(candidate =>
    UNIT_CLASS_BY_TYPE[candidate.type].includes('armor')
    && isAIHostileOwner(context.state, context.actorId, candidate.owner)
    && distance(context.state, candidate.position, helicopter.position) <= range);
  const opportunityCostPenalty = nearbyKnownArmorThreat ? 150 : 0;

  return targets.map(destination => {
    const threat = getKnownHostileAirDefenseThreat(context.state, unit, destination, context.actorId);
    const objectiveDistance = distance(context.state, destination, targetPosition(context.plan));
    const riskDiscount = threat.flatDefenseModifier * 4;
    const objectiveBonus = Math.max(0, 40 - objectiveDistance * 5);
    return ranked({ kind: 'air-assault', unitId: unit.id, destination }, Math.max(0, 320 + objectiveBonus - riskDiscount - opportunityCostPenalty));
  });
  // No canAirAssault re-check here, same reasoning as rankParadrop's
  // comment above it: getAirAssaultTargets IS canAirAssault's own source
  // of truth for these tiles.
}
```

(This needs `getAirAssaultLaunchState`, `getAirBaseRoster`, and `UNIT_CLASS_BY_TYPE` imported — add `getAirAssaultLaunchState` to the `airborne-system` import from Step 3.1 above, add `getAirBaseRoster` to this file's existing `air-operations-system` import, and add `UNIT_CLASS_BY_TYPE` to this file's existing `unit-modifier-definitions` import if not already present — check the file's current imports first, since some of these may already be imported for other rankers.)

5. Add `rankAirAssault(context, unit)` to `rankUnitTacticalActions`'s candidate array, immediately after `...rankParadrop(context, unit),`:
```typescript
    ...rankParadrop(context, unit),
    ...rankAirAssault(context, unit),
```

6. Add a case to the lookahead switch (`applyPredictedAction`, find the existing `case 'paradrop':` block) immediately after it:
```typescript
    case 'air-assault': {
      const result = executeAirAssault(next, action.unitId, action.destination);
      return result.ok ? result.state : next;
    }
```

In `src/ai/ai-major-turn.ts`, add a case to `executeAction` (find the existing `case 'paradrop':` block) immediately after it:
```typescript
    case 'air-assault': {
      const result = executeAirAssault(state, action.unitId, action.destination);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
```
(Add `executeAirAssault` to this file's existing `airborne-system` import.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts`
Expected: PASS, entire file.

- [ ] **Step 5: Add the production-scoring regression test**

Add to whichever test file already covers `ai-production.ts`'s Attack Helicopter candidate weighting (`tests/ai/ai-production.test.ts` — open it first to find the existing per-unit-type scoring test pattern):

```typescript
it('Attack Helicopter production score is unaffected by the airAssault capability (regression for the "no production reweighting" design decision)', () => {
  // Compare the AI's computed production candidate score/weight for
  // attack_helicopter against a snapshot value or an equivalent
  // same-stats unit with no airAssault field, using this file's existing
  // production-scoring helper -- confirms §9 of the design spec's claim
  // holds in code, not just in the doc.
});
```

Fill in using this file's actual scoring-comparison helper (read the file first — do not guess its shape).

- [ ] **Step 6: Run full AI test suite**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ai/ai-tactics.ts src/ai/ai-major-turn.ts tests/ai/ai-tactics.test.ts tests/ai/ai-production.test.ts
git commit -m "feat(#543): add rankAirAssault with opportunity-cost scoring and AI execution wiring"
```

---

### Task 7: UI — button, preview, pending-intent plumbing

**Files:**
- Modify: `src/app/ports.ts`
- Modify: `src/input/map-tap-intent.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/app/controllers/selection-controller.ts`
- Modify: `src/app/controllers/map-interaction-controller.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Test: manual smoke test via `preview_start` (this task has no new automated UI test file — the existing DOM/UI test suite already covers `selected-unit-info.ts`'s button-rendering pattern generically; extend it if you find it doesn't)

- [ ] **Step 1: Widen `PendingMapIntent`**

In `src/app/ports.ts`, find `{ readonly kind: 'paradrop'; readonly unitId: string }` and add immediately after it:
```typescript
  | { readonly kind: 'air-assault'; readonly unitId: string }
```

- [ ] **Step 2: Widen `map-tap-intent.ts`**

In `src/input/map-tap-intent.ts`, change:
```typescript
export type ResolvablePendingIntent = Extract<PendingMapIntent, { kind: 'journey' | 'air-mission' | 'unload' | 'paradrop' }>;
```
to:
```typescript
export type ResolvablePendingIntent = Extract<PendingMapIntent, { kind: 'journey' | 'air-mission' | 'unload' | 'paradrop' | 'air-assault' }>;
```
And change the line:
```typescript
  if (pending.kind === 'journey' || pending.kind === 'air-mission' || pending.kind === 'paradrop') {
```
to:
```typescript
  if (pending.kind === 'journey' || pending.kind === 'air-mission' || pending.kind === 'paradrop' || pending.kind === 'air-assault') {
```

- [ ] **Step 3: Add highlight types**

In `src/renderer/render-loop.ts`, change the `HexHighlight['type']` union:
```typescript
  type: 'move' | 'attack' | 'air-strike' | 'air-recon' | 'air-intercept' | 'zoc-limited' | 'water-recovery' | 'worker-buildable' | 'worker-owned-blocked' | 'worker-foreign-blocked' | 'paradrop-target' | 'paradrop-flak-risk' | 'air-assault-target' | 'air-assault-flak-risk';
```
And add to `HEX_HIGHLIGHT_COLORS`, immediately after the `'paradrop-flak-risk'` entry:
```typescript
  // Distinct hue from paradrop-target (teal vs purple) so the two verbs
  // read as different highlight types when a Paratrooper (eligible for
  // both) is selected in a city with both an Airfield and a Helicopter
  // Base -- matches this file's existing color-plus-text-notification
  // accessibility convention, not a new icon-overlay system.
  'air-assault-target': '#0d9488',
  'air-assault-flak-risk': '#dc2626',
```

- [ ] **Step 4: Wire `selection-controller.ts`**

Add the import (extend the existing `airborne-system` import):
```typescript
import { getParadropTargets, getAirAssaultTargets, getAirAssaultLaunchState, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
```

Add `onStartAirAssault`/`onCancelAirAssault`, immediately after the existing `onCancelParadrop` callback:
```typescript
        onStartAirAssault: uid => {
          selection.setPendingIntent({ kind: 'air-assault', unitId: uid });
          const state = session.getState();
          const unit = state.units[uid]!;
          const launchState = getAirAssaultLaunchState(state, uid);
          const targets = getAirAssaultTargets(state, uid);
          const flakByTile = new Map(targets.map(coord => [
            hexKey(coord),
            getKnownHostileAirDefenseThreat(state, unit, coord, unit.owner).flatDefenseModifier,
          ]));
          selection.setRanges([], []);
          selectUnit(uid);
          renderLoop.setHighlights(targets.map(coord => ({
            coord,
            type: (flakByTile.get(hexKey(coord)) ?? 0) > 0 ? 'air-assault-flak-risk' as const : 'air-assault-target' as const,
          })));
          const worstKnownFlak = Math.max(0, ...flakByTile.values());
          const flakWarning = worstKnownFlak > 0
            ? ` Highlighted red tiles have known anti-aircraft coverage — up to -${worstKnownFlak} HP on landing.`
            : '';
          const helicopterName = launchState.ok ? UNIT_DEFINITIONS[state.units[launchState.helicopterId]!.type].name : 'an Attack Helicopter';
          deps.showNotification(
            `Air Assault range: ${targets.length > 0 ? 'in range' : '0'}. This will use ${helicopterName} — it won't be able to attack this turn. Lands with no movement and cannot act again this turn.${flakWarning}`,
            'info',
          );
        },
        onCancelAirAssault: uid => {
          const intent = selection.getPendingIntent();
          if (intent.kind !== 'air-assault' || intent.unitId !== uid) return;
          selection.setPendingIntent({ kind: 'none' });
          selectUnit(uid);
          deps.showNotification('Air Assault cancelled.', 'info');
        },
```

**Fix the range-in-notification wording before shipping**: the placeholder text above (`'in range' : '0'`) is not acceptable player-facing copy — replace it with the actual numeric range once you've implemented this step, by reading it from `UNIT_DEFINITIONS[state.units[launchState.helicopterId]!.type].airOperation!.operationalRange` when `launchState.ok`, falling back to a disabled-reason message via `AIR_ASSAULT_FAILURE_MESSAGES[launchState.reason]` when not. Do not leave the placeholder in — this note exists because the exact phrasing needs to read naturally with the helicopter name substituted in, which is easier to get right by writing it against the real running UI in Step 7's manual smoke test than by guessing the string in isolation here.

Find `paradropPending: pendingIntent.kind === 'paradrop' && pendingIntent.unitId === unitId,` in the presentation-building code and add immediately after it:
```typescript
        airAssaultPending: pendingIntent.kind === 'air-assault' && pendingIntent.unitId === unitId,
```

- [ ] **Step 5: Wire `map-interaction-controller.ts`**

Add the import (extend the existing `airborne-system` import):
```typescript
import { executeParadrop, executeAirAssault, PARADROP_FAILURE_MESSAGES, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
```

Add a case immediately after the existing `case 'paradrop':` block closes:
```typescript
          case 'air-assault': {
            const pending = intent.pending;
            const result = executeAirAssault(session.getState(), pending.unitId, coord);
            if (!result.ok) {
              deps.showNotification(AIR_ASSAULT_FAILURE_MESSAGES[result.reason], 'warning');
              return;
            }
            selection.setPendingIntent({ kind: 'none' });
            session.commit(result.state);
            selectionController.refreshCurrentPlayerVisibility();
            deps.updateHUD();
            const outcomeParts: string[] = [];
            if (result.flak) outcomeParts.push(`${result.flak.damage} flak damage from ${result.flak.providerLabel}`);
            if (result.interception) outcomeParts.push('intercepted');
            const survived = Boolean(result.state.units[pending.unitId]);
            const outcomeSuffix = outcomeParts.length ? ` (${outcomeParts.join(', ')})` : '';
            deps.showNotification(
              survived
                ? `Unit was flown in by helicopter${outcomeSuffix}. It cannot act again this turn.`
                : `Unit was destroyed on the air assault${outcomeSuffix}.`,
              survived && outcomeParts.length === 0 ? 'info' : 'warning',
            );
            if (result.flak || result.interception) SFX.combat();
            else SFX.transportUnload();
            if (survived) selectionController.selectUnit(pending.unitId);
            return;
          }
```

- [ ] **Step 6: Wire `selected-unit-info.ts`**

Add the import (extend the existing `airborne-system` import):
```typescript
import { getParadropLaunchState, PARADROP_FAILURE_MESSAGES, getAirAssaultLaunchState, AIR_ASSAULT_FAILURE_MESSAGES } from '@/systems/airborne-system';
```

Add `onStartAirAssault`/`onCancelAirAssault`/`airAssaultPending` to the callbacks interface (find `onStartParadrop?: (unitId: string) => void;` and `onCancelParadrop?: (unitId: string) => void;` and add matching declarations immediately after each; find `paradropPending?: boolean;` and add `airAssaultPending?: boolean;` immediately after it).

Add the button block, immediately after the existing Paradrop button block:
```typescript
  if (presentation.airAssaultPending && callbacks.onCancelAirAssault) {
    actionsDiv.appendChild(makeButton('Cancel Air Assault', '#6b7280', () => callbacks.onCancelAirAssault!(unitId)));
  } else if (def.airAssaultPassengerEligible && !unit.hasActed && callbacks.onStartAirAssault) {
    const launchState = getAirAssaultLaunchState(state, unitId);
    if (launchState.ok) {
      actionsDiv.appendChild(makeButton('Air Assault', '#0d9488', () => callbacks.onStartAirAssault!(unitId)));
    } else {
      const btn = makeButton('Air Assault', '#0d9488');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = AIR_ASSAULT_FAILURE_MESSAGES[launchState.reason];
      actionsDiv.appendChild(btn);
    }
  }
```

(`'#0d9488'` matches the teal chosen for the highlight color in Step 3, so the button and the map highlight read as the same verb.)

- [ ] **Step 7: Manual smoke test**

Start the dev server and verify visually:

```bash
bash scripts/run-with-mise.sh yarn dev
```

Using `preview_start`/`navigate`, reach a state with an `infantry` unit standing in a city with a `helicopter_base` and an un-acted `attack_helicopter` based there (fastest path: use the browser console or a debug save-editing flow this project already has, or advance a fresh game far enough — check `docs/superpowers/` for any existing dev-shortcut/scenario convention such as `?scenario=` before hand-editing state). Confirm:
- The "Air Assault" button appears on the eligible infantry, correctly disabled with a title tooltip when no helicopter is available, enabled when one is.
- Clicking it highlights legal tiles in teal, shows the range/lockout/helicopter-name notification text with the real number (not the Step 4 placeholder).
- Tapping a highlighted tile relocates the unit, shows the outcome toast, and the helicopter's own panel now shows the ordinary disabled/"already acted" state.
- A Paratrooper standing in a city with both an Airfield and a Helicopter Base shows both buttons simultaneously, and using either disables the other.

Fix anything broken before proceeding — do not defer visual bugs found here.

- [ ] **Step 8: Run full suite + build**

Run: `bash scripts/run-with-mise.sh yarn test`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/ports.ts src/input/map-tap-intent.ts src/renderer/render-loop.ts src/app/controllers/selection-controller.ts src/app/controllers/map-interaction-controller.ts src/ui/selected-unit-info.ts
git commit -m "feat(#543): wire Air Assault button, preview, and pending-intent flow"
```

---

### Task 8: Content honesty

**Files:**
- Modify: `src/systems/unit-system.ts` (`UNIT_DESCRIPTIONS.attack_helicopter`)
- Modify: `src/systems/combat-role-definitions.ts` (`attack_helicopter` role entry)
- Test: `tests/systems/description-honesty.test.ts` (read only — confirm the denylist doesn't flag the new text), `tests/systems/unit-system.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/unit-system.test.ts`:

```typescript
describe('attack_helicopter air assault description honesty', () => {
  it('describes Air Assault as an action, not persistent cargo/embarkation', () => {
    const description = UNIT_DESCRIPTIONS.attack_helicopter;
    expect(description).toMatch(/air assault/i);
    expect(description).not.toMatch(/load|carries|aboard|embark/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts -t "air assault description honesty"`
Expected: FAIL.

- [ ] **Step 3: Update the description**

In `src/systems/unit-system.ts`, find `attack_helicopter: 'Cold War attack helicopter. Combines close air support with anti-armour missiles; faster than jet fighters but more vulnerable to ground fire. Ranged air unit.',` and change to:

```typescript
  attack_helicopter: 'Cold War attack helicopter. Combines close air support with anti-armour missiles; faster than jet fighters but more vulnerable to ground fire. Ranged air unit. Can also fly one Air Assault mission per turn from its Helicopter Base to reposition an eligible infantry unit — but cannot also attack that turn.',
```

- [ ] **Step 4: Update `combat-role-definitions.ts`**

Find `attack_helicopter: role('anti-armor', 'Mobile air attacker that punishes armored land formations.', ['air-combat', 'ranged'], { counters: ['shock'], vulnerableTo: ['ground-air-defense', 'air-superiority'], upgradeFamily: 'air-support' }),` and change to:

```typescript
  attack_helicopter: role('anti-armor', 'Mobile air attacker that punishes armored land formations.', ['air-combat', 'ranged'], { counters: ['shock'], vulnerableTo: ['ground-air-defense', 'air-superiority'], upgradeFamily: 'air-support', publicFacts: ['Can Air Assault eligible infantry from its Helicopter Base once per turn — but not on the same turn it attacks'] }),
```

- [ ] **Step 5: Run test to verify it passes, plus the existing description-honesty denylist**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts tests/systems/description-honesty.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/unit-system.ts src/systems/combat-role-definitions.ts tests/systems/unit-system.test.ts
git commit -m "docs(#543): honest Air Assault description on Attack Helicopter"
```

---

### Task 9: Hot-seat, save, and solo-play coverage

**Files:**
- Modify: `tests/systems/airborne-hotseat.test.ts`
- Modify: `tests/systems/airborne-save.test.ts`

- [ ] **Step 1: Read both files' existing Paradrop coverage first**

Open both files and identify their existing fixture-building/`describe` conventions for the two-civ discovery-isolation case and the save-round-trip case — reuse those patterns exactly, substituting `makeAirAssaultFixture` (Task 4) for `makeParadropFixture` where the underlying mechanic differs (launch requirement, dual lockout).

- [ ] **Step 2: Write the failing hot-seat test**

Add to `tests/systems/airborne-hotseat.test.ts`, mirroring its existing two-civ Paradrop discovery-isolation test:

```typescript
it('Civ A\'s discovered hostile AA flak preview for an Air Assault target is invisible to Civ B previewing the same tile', () => {
  // Build a fixture where civ-a has discovered civ-c's hostile Mobile AA
  // covering (1,1), civ-b (a different hostile civ, same match) has not.
  // Both civ-a and civ-b have an eligible passenger + available helicopter
  // able to target (1,1). Assert getKnownHostileAirDefenseThreat returns
  // the real 8-damage figure for civ-a's preview and 0/empty for civ-b's,
  // using this file's existing state-construction helpers.
});

it('pendingIntent and highlights clear on seat handoff for the air-assault intent kind', () => {
  // Mirror this file's existing paradrop handoff-clears-pendingIntent test.
});
```

- [ ] **Step 3: Implement the fixture and fill in the test bodies, run, and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-hotseat.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing save test**

Add to `tests/systems/airborne-save.test.ts`, mirroring its existing Paradrop round-trip test:

```typescript
it('Air Assault post-mission state (passenger position + lockout, helicopter lockout) round-trips through save/load', () => {
  // executeAirAssault, serialize via this file's existing save API (not a
  // hand-rolled JSON.stringify), reload, assert passenger position/
  // lockout AND helicopter lockout both survived, then run real
  // processTurn and confirm both clear.
});

it('a pre-feature save (no airAssault/airAssaultPassengerEligible in its saved unit data) loads correctly, since these are definitional not instance fields', () => {
  // Construct a save fixture as if written before this feature existed
  // (no new fields on the Unit records) and confirm getAirAssaultLaunchState
  // etc. work immediately against it once loaded, with no migration step.
});
```

- [ ] **Step 5: Implement and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-save.test.ts`
Expected: PASS.

- [ ] **Step 6: Solo-play parity test**

Add to `tests/systems/airborne-system.test.ts` (this is a parity regression per `end-to-end-wiring.md`'s "shared state mutations must be actor-complete" rule, distinct from the hot-seat human-vs-human cases above):

```typescript
it('AI-triggered Air Assault (via executeAirAssault called from AI code, not the UI) produces the identical notification/state shape a human-triggered call does', () => {
  const { state, unitId } = makeAirAssaultFixture();
  const result = executeAirAssault(state, unitId, { q: 1, r: 1 }); // same function every caller uses -- this test documents that there is no separate AI-only path, not a new behavior
  expect(result.ok).toBe(true);
});
```

- [ ] **Step 7: Run full suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/systems/airborne-hotseat.test.ts tests/systems/airborne-save.test.ts tests/systems/airborne-system.test.ts
git commit -m "test(#543): hot-seat discovery-isolation, save round-trip, and solo-play parity for air assault"
```

---

### Task 10: Balance and statistical validation

**Files:**
- Modify: `tests/systems/airborne-balance.test.ts`

- [ ] **Step 1: Read the file's existing Paradrop statistical/representative-situation tests**

Reuse its existing map/state-generation helpers.

- [ ] **Step 2: Write the dominance-check test**

```typescript
describe('Air Assault vs. Paradrop — neither strictly dominates the other', () => {
  it('at era-11 baseline, Air Assault\'s effective per-use cost (helicopter opportunity cost + Helicopter Base prerequisite) means it is not simply a strictly-better Paradrop', () => {
    // Concretely: construct a scenario where a civ has both a Paratrooper
    // (Airfield city) and an Attack Helicopter + eligible infantry
    // (Helicopter Base city) available to reinforce the same threatened
    // point. Confirm Air Assault materially reduces the civ's available
    // combat power for that turn (the helicopter's own attack/defense
    // capability is spent) in a way Paradrop's use does not (the
    // Paratrooper was never a combat-capable asset being redirected from
    // elsewhere). Assert this via a countable proxy: the number of
    // still-available (!hasActed) combat units immediately after each
    // verb resolves, all else equal, is lower after Air Assault.
  });
});

describe('Air Assault representative situations (per spec §13)', () => {
  it.each([
    'reinforcing a threatened city',
    'crossing a river/mountain chokepoint',
    'dropping near enemy armor',
    'assault under SAM/flak coverage',
    'an island map',
  ])('%s: statistical sampling over N seeded trials stays within expected bounds', (scenario) => {
    // Follow this file's existing statistical-sampling convention (N
    // trials, assert average in expected range) for each named scenario,
    // matching the pattern already used for Paradrop's equivalent cases
    // in this same file.
  });
});
```

- [ ] **Step 3: Implement each scenario using the file's existing helpers, run, and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/airborne-balance.test.ts`
Expected: PASS. If any scenario comes back showing Air Assault is meaningfully unbalanced against Paradrop (strictly better or strictly worse to the point of never being worth using), stop and record the finding — the fix is a number change (most likely narrowing the gap between Attack Helicopter's `operationalRange` and Paratrooper's `paradrop.range`, per the coupling flagged in Task 3's code comment) with the observed data, not a silent tuning decision.

- [ ] **Step 4: Run the full-catalog pacing/balance gate**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pacing-audit.test.ts`
Expected: PASS unchanged — this feature adds no yield/economy effect, so this is a confirmation, not an expected-change gate (per `.claude/rules/game-balance.md`'s pacing-regression-prevention rule, triggered here defensively since Attack Helicopter's definition was touched even though its yields weren't).

- [ ] **Step 5: Commit**

```bash
git add tests/systems/airborne-balance.test.ts
git commit -m "test(#543): balance and statistical validation for air assault vs paradrop"
```

---

### Task 11: Full-suite run and post-implementation review

**Files:** none (validation only)

- [ ] **Step 1: Full suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS, zero failures, including the durable hook smoke tests.

- [ ] **Step 2: Build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS, zero type errors.

- [ ] **Step 3: `git diff --check`**

Run: `git diff --check main...HEAD`
Expected: no whitespace errors.

- [ ] **Step 4: Post-implementation review of the actual landed diff**

Per Phase 1's precedent (its post-implementation review found and fixed 3 real bugs that only showed up once the full diff existed, including the position-before-combat ordering bug this plan explicitly guards against in Task 2/5's tests) — re-read the complete diff against `main` with fresh eyes, specifically checking:
- Gameplay exploit paths: can a single helicopter be used more than once per turn under any code path? Can Air Assault chain into itself faster than Paradrop's own chaining limits?
- AI hot-path performance: does `rankAirAssault`'s new `Object.values(context.state.units).some(...)` armor-threat scan (Task 6) get called once per eligible unit per AI civ per turn in a way that's proportionate to the existing `rankParadrop`'s cost, or does it need memoizing?
- Stale UI intent state: does cancelling an Air Assault mid-selection correctly clear highlights the same way Paradrop's cancel does?
- Real turn-reset behavior and real save/load (re-confirm Task 8/9's tests exercise the actual pipelines, not hand-set flags).
- Viewer-scoped information: re-confirm no code path leaks undiscovered flak/interceptor data through a UI string built outside `getKnownHostileAirDefenseThreat`'s filter.
- Content-description honesty: re-read the final `UNIT_DESCRIPTIONS.attack_helicopter` and `combat-role-definitions.ts` strings against what actually shipped, not what Task 8 planned.
- Role overlap / production balance: confirm Task 6 Step 5's regression actually holds against the final `ai-production.ts` code path.

Fix anything found in a follow-up commit on this same branch before considering the branch complete — do not defer real bugs found here.

- [ ] **Step 5: Final commit (if Step 4 found anything to fix) or summary commit**

If Step 4 required fixes:
```bash
git add -A
git commit -m "fix(#543): post-implementation review — fix N real bugs in shipped code"
```

If Step 4 found nothing to fix, no commit needed for this step — proceed directly to `superpowers:finishing-a-development-branch` to decide how to integrate the work (PR, merge, etc.), per this repo's `feedback_no_direct_commits_main` convention (never commit directly to `main`; this branch already exists as `claude/helicopter-air-assault-f8c911`).
