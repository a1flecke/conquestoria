# Carrier Air Wing Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This repo's CLAUDE.md forbids subagents/parallel agents — execute inline, not via subagent-driven-development.**

**Goal:** Give carriers a real strategic identity — a dedicated Naval Strike Aircraft (anti-ship specialist), a Maritime Patrol Aircraft with an active `'patrol'` mission (reconnaissance + submarine detection, integrated with #542), and a Supercarrier deck-progression tier — without inventing fuel/ammo/sortie bookkeeping, without eroding Destroyer's ASW role, and without duplicating #539's basing/range/interception contract.

**Architecture:** Every piece is an extension of an already-shipped system, not a new one: the anti-ship bonus is one row in `unit-modifier-definitions.ts`'s existing counter table; the `'patrol'` mission mirrors `'recon'`'s exact `getLegalAirMissionTargets`/`resolve*Mission`/temporary-reveal-array shape; AI ranking for Naval Strike and Fighter needs zero new code (both are picked up automatically by the existing definition-driven `rankAirStrikes`/`rankAirSupport`); deck capacity becomes one new optional `UnitDefinition` field read generically instead of a hardcoded ternary. The one genuine behavior change is a narrow, user-directed correction to #542's `hasActiveDetectorInRange`: air units stop being implicit adjacency-range submarine detectors merely by existing/being based — only naval units keep that default, and aircraft now detect submarines exclusively through the new active Patrol mission.

**Tech Stack:** TypeScript, Vitest, Canvas 2D renderer, DOM/CSS UI panels. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-carrier-air-wing-design.md` (read this first — this plan does not repeat its rationale, only its concrete requirements).

## Global Constraints

- No `Math.random()` anywhere — nothing in this feature needs RNG; interception (unchanged) reuses `deterministicCombatSeed`.
- Every system function that mutates `GameState` returns a new state via spread-copy; never write through `state.units[id] = ...`.
- `state.currentPlayer`/`unit.owner` for all ownership/visibility checks — never hardcode `'player'`.
- Game-consequence notifications go through `notification-delivery`'s `deliver(civId, ...)`, never `showNotification` (that's for the acting player's own immediate feedback only).
- New buttons in `src/ui/` use the file's existing `makeButton` helper (already compliant with the style.cssText/background+color rule).
- `textContent`/`createTextNode()` for all dynamic UI text — never `innerHTML` with game-generated strings.
- Naval Strike Aircraft: `strength: 38`, `productionCost: 235`, era 10 (`techRequired: 'carrier-warfare'`), `airOperation: { baseKinds: ['airfield','carrier'], operationalRange: 4, ferryRange: 8, missions: ['strike','rebase'], carrierEligible: true }` (no `'intercept'`). Anti-ship modifier: `{ attackerTypes: ['naval_strike_aircraft'], defenderClass: 'naval', multiplier: 1.35, label: 'Naval strike' }`.
- Maritime Patrol Aircraft: `strength: 0`, no `attackProfile`, `productionCost: 210`, era 10 (`techRequired: 'radar-systems'`, `requiredTechs: ['carrier-warfare']`), `airOperation: { baseKinds: ['airfield','carrier'], operationalRange: 5, ferryRange: 10, missions: ['patrol','rebase'], carrierEligible: true }`.
- `'patrol'` mission: legal targets = plain range scan (no terrain filter), matching `'recon'`. `resolvePatrolMission` consumes the aircraft's action and writes to **both** `state.reconReveals` (reused verbatim, range 6) and new `state.patrolReveals` (range 6) from one call.
- `hasActiveDetectorInRange`'s implicit-default branch narrows from `domain !== 'naval' && domain !== 'air'` to `domain !== 'naval'`. This is a deliberate, tested behavior change to existing #542 logic.
- Supercarrier: `strength: 58`, `productionCost: 340`, `movementPoints: 4` (unchanged from Carrier), era 13 (`techRequired: 'ocean-robotics'`), `carrierDeckCapacity: 3`. Carrier gains `upgradesTo: 'supercarrier'`, no `obsoletedByTech`.
- No difficulty tier may change legality, detection range, operational range, attack modifiers, or interception — only AI scoring weights vary.
- Every jargon term ("ASW") in player-facing copy must carry a plain-language gloss in the same string.
- No new persisted field on `Unit` or `City`. New optional `GameState.patrolReveals?: PatrolReveal[]` — absent means empty, matching `reconReveals`'s own zero-migration precedent.

---

## File Structure

| File | Change |
|---|---|
| `src/systems/concealment.ts` | Narrow `hasActiveDetectorInRange`'s implicit-default domain check; add the `patrolReveals` OR-branch |
| `src/core/types.ts` | Add `'naval_strike_aircraft'`, `'maritime_patrol_aircraft'`, `'supercarrier'` to `UnitType`; add `'patrol'` to `AirMission`; add `PatrolReveal` interface + `GameState.patrolReveals?`; add `UnitDefinition.carrierDeckCapacity?: number` |
| `src/systems/unit-system.ts` | Add 3 new `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` entries; add `carrierDeckCapacity: 2` to `carrier`, `carrierDeckCapacity: 3` to new `supercarrier`; fix `carrier`'s stale "fighters and bombers" description |
| `src/systems/unit-modifier-definitions.ts` | Add `naval_strike_aircraft`/`maritime_patrol_aircraft`/`supercarrier` to `UNIT_CLASS_BY_TYPE`; add the anti-ship counter row |
| `src/systems/combat-role-definitions.ts` | Add 3 new role entries; fix `carrier`'s stale "fighters and bombers" description; add `supercarrier`'s `terminalReason`, remove `carrier`'s |
| `src/systems/city-system.ts` | Add 3 `TRAINABLE_UNITS` entries (with `upgradesTo: 'supercarrier'` added to `carrier`'s own entry); add 3 `PRODUCTION_ICONS` entries |
| `src/systems/tech-definitions-eras10.ts` | Add `naval_strike_aircraft`, `maritime_patrol_aircraft` to `carrier-warfare`/`radar-systems`'s `unlocksUnits` |
| `src/systems/tech-definitions-eras13.ts` | Add `supercarrier` to `ocean-robotics`'s `unlocksUnits` |
| `src/systems/air-operations-system.ts` | Widen `getLegalAirMissionTargets`'s `Extract<AirMission,...>` to include `'patrol'`; add `resolvePatrolMission`; generalize `getAirBaseCapacity`'s carrier branch to read `carrierDeckCapacity` |
| `src/ai/ai-tactics.ts` | Add `'patrol'` `AITacticalAction` variant; add `rankPatrol`; wire into `rankUnitTacticalActions`, `actionId`, `applyPredictedAction` |
| `src/ai/ai-major-turn.ts` | Add `case 'patrol':` to `executeAction` |
| `src/ai/ai-production.ts` | Add carrier deck-composition nudging (diversity + patrol-on-submarine-threat) to candidate scoring |
| `src/renderer/render-loop.ts` | Add `'air-patrol'` to `HexHighlight['type']` + color map |
| `src/app/ports.ts` | Widen `'air-mission'`'s `mission` field to `'strike' \| 'recon' \| 'patrol'` |
| `src/app/controllers/selection-controller.ts` | Widen `onStartAirMission` mission-branch logic (highlight type, notification text) for `'patrol'` |
| `src/app/controllers/map-interaction-controller.ts` | Widen the `case 'air-mission':` resolve branch and SFX selection for `'patrol'` |
| `src/ui/selected-unit-info.ts` | Widen `onStartAirMission`/`airMissionPending` types; add Patrol button; add air-wing roster display block for carrier-capable naval hulls |
| `tests/systems/concealment.test.ts` | Flip the Biplane-adjacency test's expectation (documented, deliberate); add `patrolReveals` detector tests |
| `tests/systems/unit-system.test.ts` | New unit definition + description-honesty tests for the 3 new units |
| `tests/systems/unit-modifier-system.test.ts` | Anti-ship modifier tests (positive + explicit negative vs land/city) |
| `tests/systems/air-operations-system.test.ts` | `resolvePatrolMission` tests; `getAirBaseCapacity` byte-identical-before/after-refactor regression + Supercarrier capacity-3 test |
| `tests/ai/ai-tactics.test.ts` | `rankPatrol` tests (legal-only, fog-safe, difficulty-parity, bounded-candidate performance) |
| `tests/ai/ai-production.test.ts` | Deck-composition nudging tests |
| `tests/systems/carrier-air-wing-hotseat.test.ts` | **New.** Two-civ patrol-reveal isolation |
| `tests/systems/carrier-air-wing-save.test.ts` | **New.** Save/load round-trip, pre-feature-save compatibility |
| `tests/systems/carrier-air-wing-balance.test.ts` | **New.** Representative-situation + statistical balance coverage |
| `tests/ui/selected-unit-info.test.ts` | Patrol button tests; air-wing roster display tests |

---

### Task 1: Correct `hasActiveDetectorInRange`'s air-domain default

**Files:**
- Modify: `src/systems/concealment.ts`
- Test: `tests/systems/concealment.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: no signature change — `hasActiveDetectorInRange` stays module-private; only its internal domain check changes

This is the smallest, most foundational change — done first, independently verified, before anything depends on it.

- [ ] **Step 1: Write the failing test proving the corrected behavior**

Open `tests/systems/concealment.test.ts` and find the existing test at (verify against the live file — line numbers shift):
```typescript
it('reveals an enemy submarine adjacent to a viewer air unit', () => {
  const state = setup();
  setTerrain(state, { q: 0, r: 0 }, 'ocean');
  setTerrain(state, { q: 1, r: 0 }, 'ocean');
  const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
  placeUnit(state, 'player', 'biplane', { q: 1, r: 0 });
  expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
});
```

Replace it with the corrected expectation, mirroring the file's own neighboring "does NOT reveal... land unit" test's naming convention:

```typescript
it('does NOT reveal an enemy submarine adjacent to a viewer air unit merely by existing (#582 correction: aircraft only detect via an active Patrol mission, not by being parked nearby)', () => {
  const state = setup();
  setTerrain(state, { q: 0, r: 0 }, 'ocean');
  setTerrain(state, { q: 1, r: 0 }, 'ocean');
  const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
  placeUnit(state, 'player', 'biplane', { q: 1, r: 0 });
  expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
});

it('still reveals an enemy submarine adjacent to a viewer NAVAL unit (regression -- only the air-domain default changed)', () => {
  const state = setup();
  setTerrain(state, { q: 0, r: 0 }, 'ocean');
  setTerrain(state, { q: 1, r: 0 }, 'ocean');
  const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
  placeUnit(state, 'player', 'galley', { q: 1, r: 0 });
  expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
});
```

(The second test proves the fix is scoped to air units only — it should already pass unchanged; keep it as an explicit regression rather than trusting the existing "reveals an enemy submarine adjacent to a viewer naval unit" test elsewhere in the file to cover it, since that test doesn't say "regression" and a future reader needs to see this was deliberately preserved.)

- [ ] **Step 2: Run to verify the first new test fails, the second passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/concealment.test.ts -t "does NOT reveal an enemy submarine adjacent to a viewer air unit"`
Expected: FAIL (current code still returns `false`/concealed=false, i.e. reveals it).

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/concealment.test.ts -t "still reveals an enemy submarine adjacent to a viewer NAVAL unit"`
Expected: PASS (unaffected by the bug this task fixes).

- [ ] **Step 3: Apply the fix**

In `src/systems/concealment.ts`, in `hasActiveDetectorInRange`, change:
```typescript
      const domain = UNIT_DEFINITIONS[candidate.type].domain;
      if (domain !== 'naval' && domain !== 'air') return false;
```
to:
```typescript
      // #582: air units are no longer implicit adjacency-range detectors
      // merely by existing/being based -- a parked aircraft has no more
      // ability to spot a submerged submarine than the ship carrying it.
      // Naval units keep the implicit range-1 default (a ship's basic
      // lookout is plausible regardless of where it's docked). Aircraft
      // detect submarines only through the active Patrol mission (Task 3).
      const domain = UNIT_DEFINITIONS[candidate.type].domain;
      if (domain !== 'naval') return false;
```

- [ ] **Step 4: Run the full concealment test file**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/concealment.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Run the full test suite once here — this changes shared #542 logic**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. If any other test depended on the old air-detection default (grep `tests/` for other Biplane/fighter-adjacent-submarine assertions first if this fails), fix that test's expectation the same documented way, not the production code.

- [ ] **Step 6: Commit**

```bash
git add src/systems/concealment.ts tests/systems/concealment.test.ts
git commit -m "fix(#582): air units no longer passively detect submarines by existing"
```

---

### Task 2: Naval Strike Aircraft — unit, modifier, full end-to-end wiring

**Files:**
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/unit-modifier-definitions.ts`, `src/systems/combat-role-definitions.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras10.ts`
- Test: `tests/systems/unit-system.test.ts`, `tests/systems/unit-modifier-system.test.ts`

**Interfaces:**
- Produces: `UnitType` includes `'naval_strike_aircraft'`; `UNIT_DEFINITIONS.naval_strike_aircraft`; `UNIT_DESCRIPTIONS.naval_strike_aircraft`; a new row in the counter-modifier table

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/unit-system.test.ts`:

```typescript
describe('Naval Strike Aircraft (#582)', () => {
  it('is a carrier-capable, non-intercepting strike aircraft weaker than the era-10 fighters', () => {
    const strike = UNIT_DEFINITIONS.naval_strike_aircraft;
    const jetFighter = UNIT_DEFINITIONS.jet_fighter;
    expect(strike.domain).toBe('air');
    expect(strike.strength).toBeLessThan(jetFighter.strength);
    expect(strike.airOperation).toEqual({
      baseKinds: ['airfield', 'carrier'], operationalRange: 4, ferryRange: 8,
      missions: ['strike', 'rebase'], carrierEligible: true,
    });
  });

  it('has a plain-language, mechanically honest description', () => {
    const description = UNIT_DESCRIPTIONS.naval_strike_aircraft;
    expect(description).toMatch(/ships/i);
    expect(description).not.toMatch(/intercept/i);
  });
});
```

Add to `tests/systems/unit-modifier-system.test.ts` (open it first and reuse its existing combat-strength-calculation fixture helpers):

```typescript
describe('Naval Strike anti-ship modifier (#582)', () => {
  it('applies the 1.35x naval-strike bonus when attacking a naval-class defender', () => {
    // Use this file's existing combat-strength calculation entry point,
    // asserting the strike aircraft's effective strength against e.g. a
    // destroyer is 38 * 1.35, not 38.
  });

  it('does NOT apply any bonus when attacking a land unit or city (explicit negative test)', () => {
    // Same aircraft, a land-unit or city defender: effective strength stays
    // the plain 38.
  });
});
```

Fill in both `unit-modifier-system.test.ts` bodies using that file's real, already-established combat-strength helper (read the file's existing anti-submarine/commerce-raider tests for the exact call shape before writing these).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts -t "Naval Strike Aircraft"`
Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-modifier-system.test.ts -t "Naval Strike anti-ship modifier"`
Expected: FAIL — `naval_strike_aircraft` doesn't exist yet.

- [ ] **Step 3: Add the type**

In `src/core/types.ts`, find the `UnitType` union (search the string containing `'attack_helicopter'`) and add `'naval_strike_aircraft'` near the other era-10/11 air units.

- [ ] **Step 4: Add the unit definition and description**

In `src/systems/unit-system.ts`, add to `UNIT_DEFINITIONS` immediately after the `destroyer` entry (era-10 naval group):

```typescript
  naval_strike_aircraft: {
    type: 'naval_strike_aircraft', name: 'Naval Strike Aircraft',
    movementPoints: 5, visionRange: 3, strength: 38,
    canFoundCity: false, canBuildImprovements: false, productionCost: 235,
    domain: 'air',
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit', 'city'] },
    // No 'intercept' mission -- fighters stay the fleet's sole air-defense
    // answer (design spec §4). Range matches WWII Fighter's so the carrier
    // deck-composition choice (spec §6) is about role, not reach.
    airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 4, ferryRange: 8, missions: ['strike', 'rebase'], carrierEligible: true },
  },
```

Add to `UNIT_DESCRIPTIONS` (near `carrier`/`destroyer`):
```typescript
  naval_strike_aircraft: 'Carrier aircraft built to attack ships. Hits naval targets hard, but has no special advantage against cities or land forces, and cannot intercept enemy aircraft — Fighters remain the fleet\'s air defense.',
```

- [ ] **Step 5: Add to `UNIT_CLASS_BY_TYPE` (required — every `UnitType` must have an entry, compiler-enforced)**

In `src/systems/unit-modifier-definitions.ts`, add near the other air entries:
```typescript
  naval_strike_aircraft: ['air'],
```

- [ ] **Step 6: Add the anti-ship modifier**

In the same file's counter-modifier table (near the existing `destroyer→submarine`/`submarine→civilian` rows), add:
```typescript
  { attackerTypes: ['naval_strike_aircraft'], defenderClass: 'naval', multiplier: 1.35, label: 'Naval strike' },
```

- [ ] **Step 7: Add the combat-role entry**

In `src/systems/combat-role-definitions.ts`, add near `destroyer`/`carrier`:
```typescript
  naval_strike_aircraft: role('siege', 'Carrier-based specialist that punishes enemy warships from the air.', ['air-combat', 'ranged'], { counters: ['capital-ship'], vulnerableTo: ['air-superiority', 'ground-air-defense'], upgradeFamily: 'naval-strike', terminalReason: 'Era 10 naval-strike specialist; later carrier-based offense comes from Combat Drone at era 13.' }),
```

(`primaryRole: 'siege'` matches how Bomber is classified — "a specialist attacker with a typed bonus vs a target category," the closest existing role bucket; verify this against the live `CombatRole` union and adjust if a closer-fitting value exists.)

- [ ] **Step 8: Add to `TRAINABLE_UNITS` and `PRODUCTION_ICONS`**

In `src/systems/city-system.ts`, add immediately after the `destroyer` entry in `TRAINABLE_UNITS`:
```typescript
  { type: 'naval_strike_aircraft', name: 'Naval Strike Aircraft', cost: 235, techRequired: 'carrier-warfare', trainedFromBuilding: 'airfield', pacing: { band: 'power-spike', role: 'naval-strike', impact: 1.4, scope: 'military', snowball: 1.2, urgency: 1.15, situationality: 1.4, unlockBreadth: 1 } },
```

Add to `PRODUCTION_ICONS` (near `carrier`/`destroyer`):
```typescript
  naval_strike_aircraft: '💥',
```

- [ ] **Step 9: Wire the tech unlock**

In `src/systems/tech-definitions-eras10.ts`, find `carrier-warfare`'s entry and add `'naval_strike_aircraft'` to its `unlocksUnits` array (create the array if it doesn't already list one — verify against the live file, since `carrier`/`destroyer` may or may not currently appear there depending on how `unlocksUnits` is populated elsewhere).

- [ ] **Step 10: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts tests/systems/unit-modifier-system.test.ts`
Expected: PASS.

- [ ] **Step 11: Run `yarn build` to catch every exhaustive `Record<UnitType, X>` map**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAILS, listing every map needing a `naval_strike_aircraft` entry (e.g. `UNIT_MOTION_STYLES`, `UNIT_SPRITE_CATALOG`, `PRODUCTION_ICONS` if missed in Step 8). Fix each one now, using the closest existing air-unit's fallback pattern for sprite/motion-style entries (matching `mechanized_infantry`'s alias precedent — reuse an existing sprite rather than requiring new art).

- [ ] **Step 12: Run `yarn build` again to confirm clean**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS.

- [ ] **Step 13: Run `tech-unlocks-consistency.test.ts` and `description-honesty.test.ts`**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/tech-unlocks-consistency.test.ts tests/systems/description-honesty.test.ts`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(#582): add Naval Strike Aircraft with anti-ship modifier"
```

---

### Task 3: The `'patrol'` air mission — legality, execution, #542 integration

**Files:**
- Modify: `src/core/types.ts`, `src/systems/air-operations-system.ts`, `src/systems/concealment.ts`
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/concealment.test.ts`

**Interfaces:**
- Consumes: `getLegalAirMissionTargets` (widened), `applyReconReveals`/`state.reconReveals` (reused, unchanged)
- Produces:
  ```typescript
  export interface PatrolReveal { ownerCivId: string; center: HexCoord; range: number; expiresAtTurn: number; }
  // GameState.patrolReveals?: PatrolReveal[]
  export function resolvePatrolMission(state: GameState, unitId: string, center: HexCoord): AirOperationResult;
  ```

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/air-operations-system.test.ts` (open it first, reuse its existing recon-mission fixture builder — do not invent a divergent map/city/unit construction style):

```typescript
import { resolvePatrolMission, getLegalAirMissionTargets } from '@/systems/air-operations-system';

describe('resolvePatrolMission (#582)', () => {
  it('rejects an out-of-range or illegal center', () => {
    const { state, unitId } = makePatrolAircraftFixture(); // new fixture, mirror this file's existing recon-aircraft fixture builder but with a maritime_patrol_aircraft carrier-based or airfield-based unit
    const result = resolvePatrolMission(state, unitId, { q: 99, r: 99 });
    expect(result.ok).toBe(false);
  });

  it('consumes the aircraft action and writes both a reconReveals and a patrolReveals entry with matching center/range', () => {
    const { state, unitId } = makePatrolAircraftFixture();
    const targets = getLegalAirMissionTargets(state, unitId, 'patrol');
    expect(targets.length).toBeGreaterThan(0);
    const center = targets[0]!;
    const result = resolvePatrolMission(state, unitId, center);
    if (!result.ok) throw new Error('expected ok');
    const unit = result.state.units[unitId]!;
    expect(unit.hasActed).toBe(true);
    expect(unit.movementPointsLeft).toBe(0);
    const reconEntry = result.state.reconReveals?.find(r => r.ownerCivId === unit.owner && r.expiresAtTurn === state.turn);
    const patrolEntry = result.state.patrolReveals?.find(r => r.ownerCivId === unit.owner && r.expiresAtTurn === state.turn);
    expect(reconEntry).toBeDefined();
    expect(patrolEntry).toBeDefined();
    expect(reconEntry!.center).toEqual(patrolEntry!.center);
    expect(reconEntry!.range).toBe(patrolEntry!.range);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts -t "resolvePatrolMission"`
Expected: FAIL — the function/fixture don't exist yet. `getLegalAirMissionTargets`/`resolvePatrolMission` read mission eligibility from `UNIT_DEFINITIONS[unit.type].airOperation.missions` — the static catalog, not anything overridable per test-instance — so this task's fixture genuinely needs *some* real catalog unit whose `airOperation.missions` includes `'patrol'`. Rather than inventing a throwaway definition here only to replace it in Task 4, add a minimal `UNIT_DEFINITIONS.maritime_patrol_aircraft` entry as part of *this* task — just enough for the fixture to use (`type`, `domain: 'air'`, `strength: 0`, `airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 5, ferryRange: 10, missions: ['patrol', 'rebase'], carrierEligible: true }`, and add `'maritime_patrol_aircraft'` to `UnitType` in `types.ts`). Task 4 then completes this same entry with its full remaining fields (name, cost, description, etc.) and the rest of its end-to-end wiring — a type introduced where first needed and completed where the issue actually asks for it, the same incremental pattern #543 used for `paratrooper` across its own Tasks 2-3. Implement `makePatrolAircraftFixture` mirroring the file's existing recon-aircraft fixture, swapping in this unit.

- [ ] **Step 3: Add the type-level pieces**

In `src/core/types.ts`:
1. Widen `AirMission`: `export type AirMission = 'strike' | 'intercept' | 'rebase' | 'recon' | 'patrol';`
2. Add near `ReconReveal`:
```typescript
export interface PatrolReveal {
  ownerCivId: string;
  center: HexCoord;
  range: number;
  expiresAtTurn: number;
}
```
3. Find `reconReveals?: ReconReveal[];` on `GameState` and add immediately after: `patrolReveals?: PatrolReveal[];`

- [ ] **Step 4: Widen `getLegalAirMissionTargets` and add `resolvePatrolMission`**

In `src/systems/air-operations-system.ts`, change the signature:
```typescript
export function getLegalAirMissionTargets(state: GameState, unitId: string, mission: Extract<AirMission, 'recon' | 'strike' | 'patrol'>): HexCoord[] {
```
The existing body's `if (mission === 'strike') { ... }` branch is unchanged; the final `return` (the plain range-scan, currently reached for `'recon'`) is now also reached for `'patrol'` with no further change needed, since the condition is just `mission !== 'strike'`.

Add `resolvePatrolMission` immediately after `resolveReconMission`:
```typescript
export function resolvePatrolMission(state: GameState, unitId: string, center: HexCoord): AirOperationResult {
  const unit = state.units[unitId];
  if (!unit || !getLegalAirMissionTargets(state, unitId, 'patrol')
    .some(target => target.q === center.q && target.r === center.r)) {
    return { ok: false, state, reason: 'invalid-patrol-target' };
  }
  const range = 6;
  return {
    ok: true,
    state: {
      ...state,
      units: {
        ...state.units,
        [unitId]: { ...unit, movementPointsLeft: 0, hasMoved: true, hasActed: true },
      },
      // Ordinary reconnaissance half -- reused verbatim, same array and
      // consumer (applyReconReveals) 'recon' missions already use.
      reconReveals: [
        ...(state.reconReveals ?? []).filter(reveal => reveal.expiresAtTurn >= state.turn),
        { ownerCivId: unit.owner, center: { ...center }, range, expiresAtTurn: state.turn },
      ],
      // Submarine-detection half -- separate array, consumed by
      // concealment.ts's hasActiveDetectorInRange (Step 5).
      patrolReveals: [
        ...(state.patrolReveals ?? []).filter(reveal => reveal.expiresAtTurn >= state.turn),
        { ownerCivId: unit.owner, center: { ...center }, range, expiresAtTurn: state.turn },
      ],
    },
  };
}
```

Check `AirOperationResult`'s failure-reason type (verify against the live file) — if it's a closed union of specific reason strings rather than a bare `string`, add `'invalid-patrol-target'` to that union alongside `'invalid-recon-target'`.

- [ ] **Step 5: Add the `patrolReveals` detector branch to `concealment.ts`**

In `hasActiveDetectorInRange` (`src/systems/concealment.ts`), immediately before its `if (detectedByUnit) return true;` line, add:

```typescript
  const patrolledByOwner = (state.patrolReveals ?? []).some(reveal =>
    reveal.ownerCivId === viewerCivId
    && reveal.expiresAtTurn === state.turn
    && distanceFor(state, reveal.center, unit.position) <= reveal.range);
  if (patrolledByOwner) return true;
```

- [ ] **Step 6: Write and pass the concealment-integration tests**

Add to `tests/systems/concealment.test.ts`:

```typescript
describe('patrolReveals detection (#582)', () => {
  it('reveals a submarine within an active patrol radius for the flying civ, for that turn only', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    state.patrolReveals = [{ ownerCivId: 'player', center: { q: 0, r: 0 }, range: 6, expiresAtTurn: state.turn }];
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(false);
  });

  it('does not reveal to a different civ (viewer-scoped)', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    state.patrolReveals = [{ ownerCivId: 'someone-else', center: { q: 0, r: 0 }, range: 6, expiresAtTurn: state.turn }];
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('does not reveal once the reveal has expired (previous turn)', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    state.patrolReveals = [{ ownerCivId: 'player', center: { q: 0, r: 0 }, range: 6, expiresAtTurn: state.turn - 1 }];
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });

  it('does not reveal a submarine outside the patrol radius', () => {
    const state = setup();
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    state.patrolReveals = [{ ownerCivId: 'player', center: { q: 10, r: 10 }, range: 2, expiresAtTurn: state.turn }];
    expect(isSubmarineConcealedFrom(state, sub, 'player')).toBe(true);
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/concealment.test.ts`
Expected: PASS, entire file.

- [ ] **Step 7: Run the air-operations tests from Step 1-2**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts`
Expected: PASS.

- [ ] **Step 8: Run `yarn build`**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS (no new exhaustive-map gaps — `AirMission` isn't a `Record` key type anywhere that would need updating, but verify no `switch (mission)` elsewhere in the codebase is now non-exhaustive; fix any found).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(#582): add the patrol air mission (recon + submarine detection)"
```

---

### Task 4: Maritime Patrol Aircraft — unit, full end-to-end wiring, `rankPatrol` AI

**Files:**
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/unit-modifier-definitions.ts`, `src/systems/combat-role-definitions.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras10.ts`, `src/ai/ai-tactics.ts`, `src/ai/ai-major-turn.ts`
- Test: `tests/systems/unit-system.test.ts`, `tests/ai/ai-tactics.test.ts`

**Interfaces:**
- Consumes: `resolvePatrolMission`, `getLegalAirMissionTargets` (Task 3); `buildMajorCivPerception` (already imported in `ai-tactics.ts`)
- Produces: `UNIT_DEFINITIONS.maritime_patrol_aircraft`; `AITacticalAction` variant `{kind: 'patrol', unitId, center: HexCoord}`; private `rankPatrol`

- [ ] **Step 1: Write the failing unit-definition test**

Add to `tests/systems/unit-system.test.ts`:

```typescript
describe('Maritime Patrol Aircraft (#582)', () => {
  it('is a non-combat, carrier- and airfield-capable patrol aircraft, two-tech gated', () => {
    const patrol = UNIT_DEFINITIONS.maritime_patrol_aircraft;
    expect(patrol.strength).toBe(0);
    expect(patrol.attackProfile).toBeUndefined();
    expect(patrol.airOperation).toEqual({
      baseKinds: ['airfield', 'carrier'], operationalRange: 5, ferryRange: 10,
      missions: ['patrol', 'rebase'], carrierEligible: true,
    });
  });

  it('has a plain-language description that does not claim passive/idle detection', () => {
    const description = UNIT_DESCRIPTIONS.maritime_patrol_aircraft;
    expect(description).toMatch(/searches|patrol/i);
    expect(description).not.toMatch(/passively|automatically detects/i);
  });
});
```

Task 3 already added a minimal `UNIT_DEFINITIONS.maritime_patrol_aircraft` entry (`type`, `domain`, `strength: 0`, `airOperation`) for its own fixture — this step **completes** that same entry with `name`, `visionRange`, `canFoundCity`, `canBuildImprovements`, `productionCost`, matching the full block below exactly, rather than creating a duplicate entry.

- [ ] **Step 2: Run to verify it fails (or already partially passes if Task 3 forward-referenced it) then fill in the definition**

In `src/core/types.ts`, add `'maritime_patrol_aircraft'` to `UnitType`.

In `src/systems/unit-system.ts`, add to `UNIT_DEFINITIONS` immediately after `naval_strike_aircraft`:
```typescript
  maritime_patrol_aircraft: {
    type: 'maritime_patrol_aircraft', name: 'Maritime Patrol Aircraft',
    movementPoints: 5, visionRange: 4, strength: 0,
    canFoundCity: false, canBuildImprovements: false, productionCost: 210,
    domain: 'air',
    // No attackProfile -- non-combat, matching Recon Aircraft's precedent.
    airOperation: { baseKinds: ['airfield', 'carrier'], operationalRange: 5, ferryRange: 10, missions: ['patrol', 'rebase'], carrierEligible: true },
  },
```

Add to `UNIT_DESCRIPTIONS`:
```typescript
  maritime_patrol_aircraft: 'Searches the sea for ships and hidden submarines. Its Patrol mission reveals a wide area for the rest of the turn, but costs the aircraft\'s own turn to fly — it finds enemies, it doesn\'t fight them.',
```

- [ ] **Step 3: Wire `UNIT_CLASS_BY_TYPE`, combat role, `TRAINABLE_UNITS`, `PRODUCTION_ICONS`, tech unlock**

In `src/systems/unit-modifier-definitions.ts`: `maritime_patrol_aircraft: ['air', 'recon'],` (matches `observation_balloon`/`recon_aircraft`'s own `['air', 'recon']` class shape — verify against the live file).

In `src/systems/combat-role-definitions.ts`, add (matching `recon_aircraft`'s own entry shape — read it first for the exact pattern):
```typescript
  maritime_patrol_aircraft: role('recon', 'Non-combat aircraft that searches the sea for ships and hidden submarines.', ['recon'], { terminalReason: 'Non-combat maritime reconnaissance specialist with no later roster replacement.' }),
```

In `src/systems/city-system.ts`'s `TRAINABLE_UNITS`, immediately after `naval_strike_aircraft`:
```typescript
  { type: 'maritime_patrol_aircraft', name: 'Maritime Patrol Aircraft', cost: 210, techRequired: 'radar-systems', requiredTechs: ['carrier-warfare'], trainedFromBuilding: 'airfield', pacing: { band: 'power-spike', role: 'maritime-patrol', impact: 1.3, scope: 'military', snowball: 1.05, urgency: 1.05, situationality: 1.45, unlockBreadth: 1 } },
```

`PRODUCTION_ICONS`: `maritime_patrol_aircraft: '🔍',`.

In `src/systems/tech-definitions-eras10.ts`, add `'maritime_patrol_aircraft'` to `radar-systems`'s `unlocksUnits` array.

- [ ] **Step 4: Run tests, then `yarn build` to catch exhaustive-map gaps, fix, re-run**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts`
Run: `bash scripts/run-with-mise.sh yarn build` (fix every reported gap, same as Task 2 Step 11-12)
Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/tech-unlocks-consistency.test.ts tests/systems/description-honesty.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit the unit (AI comes next, separately verifiable)**

```bash
git add -A
git commit -m "feat(#582): add Maritime Patrol Aircraft unit"
```

- [ ] **Step 6: Write the failing `rankPatrol` tests**

Add to `tests/ai/ai-tactics.test.ts` (reuse this file's existing `makeState`/`addUnit`/`addCity`/`context`/`makePlan` helpers — same conventions as the `rankParadrop`/`rankAirAssault` describe blocks already in this file):

```typescript
describe('rankUnitTacticalActions — patrol (#582)', () => {
  function makePatrolAIFixture() {
    const state = makeState('veteran');
    const capital = addCity(state, 'capital', AI, { q: 0, r: 0 });
    capital.buildings = [...capital.buildings, 'airfield'];
    const patrol = addUnit(state, 'patrol-1', 'maritime_patrol_aircraft', AI, { q: 0, r: 0 }, { airBase: { kind: 'city', cityId: capital.id } });
    return { state, capital, patrol };
  }

  it('produces no patrol candidates for a unit with no patrol capability', () => {
    const { state, capital } = makePatrolAIFixture();
    const jet = addUnit(state, 'jet-1', 'jet_fighter', AI, capital.position, { airBase: { kind: 'city', cityId: capital.id } });
    const plan = makePlan({ kind: 'region', id: 'front', anchor: { q: 3, r: 0 } }, [jet.id], { objective: 'expand', requiredRoles: {} });
    const actions = rankUnitTacticalActions(context(state, plan), jet.id);
    expect(actions.some(a => a.action.kind === 'patrol')).toBe(false);
  });

  it('produces at least one legal patrol candidate for an eligible, based, un-acted patrol aircraft', () => {
    const { state, patrol } = makePatrolAIFixture();
    const plan = makePlan({ kind: 'region', id: 'front', anchor: { q: 3, r: 0 } }, [patrol.id], { objective: 'expand', requiredRoles: {} });
    const actions = rankUnitTacticalActions(context(state, plan), patrol.id).filter(a => a.action.kind === 'patrol');
    expect(actions.length).toBeGreaterThan(0);
  });

  it('never proposes a patrol center outside getLegalAirMissionTargets (fog-safe by construction)', () => {
    const { state, patrol } = makePatrolAIFixture();
    const plan = makePlan({ kind: 'region', id: 'front', anchor: { q: 3, r: 0 } }, [patrol.id], { objective: 'expand', requiredRoles: {} });
    const legal = new Set(getLegalAirMissionTargets(state, patrol.id, 'patrol').map(hexKey));
    const actions = rankUnitTacticalActions(context(state, plan), patrol.id).filter((a): a is typeof a & { action: { kind: 'patrol'; center: HexCoord } } => a.action.kind === 'patrol');
    for (const action of actions) expect(legal.has(hexKey(action.action.center))).toBe(true);
  });

  it('produces a bounded candidate set, not one per legal tile (performance guard, #543-style)', () => {
    const { state, patrol } = makePatrolAIFixture();
    const plan = makePlan({ kind: 'region', id: 'front', anchor: { q: 3, r: 0 } }, [patrol.id], { objective: 'expand', requiredRoles: {} });
    const legalCount = getLegalAirMissionTargets(state, patrol.id, 'patrol').length;
    const actions = rankUnitTacticalActions(context(state, plan), patrol.id).filter(a => a.action.kind === 'patrol');
    expect(legalCount).toBeGreaterThan(5); // sanity: operationalRange 5 covers well more than 5 tiles
    expect(actions.length).toBeLessThanOrEqual(2); // own position, plus at most one remembered-submarine center
  });

  it('produces the identical legal candidate set across difficulty tiers under identical fog', () => {
    const veteran = makeState('veteran');
    const explorer = makeState('explorer');
    for (const state of [veteran, explorer]) {
      const capital = addCity(state, 'capital', AI, { q: 0, r: 0 });
      capital.buildings = [...capital.buildings, 'airfield'];
      addUnit(state, 'patrol-1', 'maritime_patrol_aircraft', AI, { q: 0, r: 0 }, { airBase: { kind: 'city', cityId: capital.id } });
    }
    const plan = makePlan({ kind: 'region', id: 'front', anchor: { q: 3, r: 0 } }, ['patrol-1'], { objective: 'expand', requiredRoles: {} });
    const veteranCenters = rankUnitTacticalActions(context(veteran, plan), 'patrol-1').filter(a => a.action.kind === 'patrol').map(a => a.action.kind === 'patrol' ? hexKey(a.action.center) : '');
    const explorerCenters = rankUnitTacticalActions(context(explorer, plan), 'patrol-1').filter(a => a.action.kind === 'patrol').map(a => a.action.kind === 'patrol' ? hexKey(a.action.center) : '');
    expect(new Set(veteranCenters)).toEqual(new Set(explorerCenters));
  });

  it('never targets a hidden remembered-submarine position the civ has not actually perceived (no hidden information)', () => {
    // Build a fixture with a hostile submarine present in raw GameState but
    // with no corresponding buildMajorCivPerception entry for the AI civ
    // (i.e. genuinely unscouted) -- assert no patrol candidate centers on
    // that submarine's exact tile specifically (it may still legally cover
    // the tile as part of the own-position fallback center's radius, which
    // is fine; the point is the AI isn't *targeting* hidden intel).
  });
});
```

Fill in the last test's body using this file's existing hostile-unit-placement conventions once the fixture pattern is clear from the earlier tests.

- [ ] **Step 7: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts -t "rankUnitTacticalActions — patrol"`
Expected: FAIL — `'patrol'` isn't a recognized action kind yet.

- [ ] **Step 8: Implement**

In `src/ai/ai-tactics.ts`:

1. Add the import: extend the existing `air-operations-system` import to include `resolvePatrolMission`, and the existing `@/core/types`/local import of `getLegalAirMissionTargets` if not already present (verify — it may already be imported for `rankAirSupport`'s recon branch).
2. Add to `AITacticalAction`, immediately after the `'air-assault'` variant:
```typescript
  | { kind: 'patrol'; unitId: string; center: HexCoord }
```
3. Add to `actionId`'s destination-based group (find the `case 'paradrop': case 'air-assault':` group):
```typescript
    case 'move':
    case 'withdraw':
    case 'found-city':
    case 'unload':
    case 'paradrop':
    case 'air-assault':
      return `${action.kind}:${action.unitId}:${hexKey(action.destination)}`;
    case 'patrol':
      return `patrol:${action.unitId}:${hexKey(action.center)}`;
```
(Separate case, not merged into the `destination`-keyed group, since `PatrolAction` uses `center` not `destination` as its field name — TypeScript's discriminated union won't let the shared group reference `.destination` on a variant that has `.center` instead.)

4. Add `rankPatrol`, immediately after `rankAirAssault`:
```typescript
function rankPatrol(
  context: AITacticalContext,
  unit: Unit,
): RankedAITacticalAction[] {
  const operation = UNIT_DEFINITIONS[unit.type].airOperation;
  if (!operation?.missions.includes('patrol') || !unit.airBase || unit.hasActed) return [];
  const legalTargets = getLegalAirMissionTargets(context.state, unit.id, 'patrol');
  if (legalTargets.length === 0) return [];
  const legalTargetKeys = new Set(legalTargets.map(hexKey));

  // Bounded candidate set, not one per legal tile -- avoids an O(legal
  // targets) scan on top of Paradrop/Air Assault's own (#543's own
  // performance lesson, explicitly re-checked per #582's review
  // instruction). Mirrors rankDestroyerEscortMoves' own
  // buildMajorCivPerception usage exactly -- same viewer-scoped,
  // decay-aware "remembered" pattern, not raw GameState positions.
  const perception = buildMajorCivPerception(context.state, context.actorId);
  const remembered = perception.units.find(candidate =>
    (candidate.type === 'submarine' || candidate.type === 'missile_submarine')
    && candidate.confidence !== 'rumored'
    && candidate.position !== null
    && legalTargetKeys.has(hexKey(candidate.position)));

  const candidateCenters = [remembered?.position, unit.position]
    .filter((coord): coord is HexCoord => coord != null && legalTargetKeys.has(hexKey(coord)));
  const uniqueCenters = [...new Map(candidateCenters.map(c => [hexKey(c), c])).values()];

  return uniqueCenters.map(center => {
    const objectiveDistance = distance(context.state, center, targetPosition(context.plan));
    const objectiveBonus = Math.max(0, 40 - objectiveDistance * 5);
    const submarineBonus = remembered && hexKey(center) === hexKey(remembered.position!) ? 80 : 0;
    return ranked({ kind: 'patrol', unitId: unit.id, center }, Math.max(0, 320 + objectiveBonus + submarineBonus));
  });
}
```

5. Add to `rankUnitTacticalActions`'s candidates array, immediately after `...rankAirAssault(context, unit),`:
```typescript
    ...rankPatrol(context, unit),
```

6. Add to `applyPredictedAction`'s lookahead switch, immediately after the `'air-assault'` case:
```typescript
    case 'patrol': {
      const result = resolvePatrolMission(next, action.unitId, action.center);
      return result.ok ? result.state : next;
    }
```

In `src/ai/ai-major-turn.ts`, add `resolvePatrolMission` to the existing `air-operations-system` import, and a case to `executeAction` immediately after `'air-assault'`:
```typescript
    case 'patrol': {
      const result = resolvePatrolMission(state, action.unitId, action.center);
      return { state: result.ok ? result.state : state, succeeded: result.ok, followUps: [] };
    }
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-tactics.test.ts`
Expected: PASS, entire file.

- [ ] **Step 10: Run full AI suite + build**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(#582): add rankPatrol AI with bounded, viewer-scoped candidate centers"
```

---

### Task 5: Deck-capacity generalization

**Files:**
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/air-operations-system.ts`
- Test: `tests/systems/air-operations-system.test.ts`

**Interfaces:**
- Produces: `UnitDefinition.carrierDeckCapacity?: number`; `getAirBaseCapacity`'s carrier branch reads it generically

Pure refactor first (byte-identical for the existing Carrier case), proven before Supercarrier (Task 6) depends on it.

- [ ] **Step 1: Write the regression test proving current behavior, before touching code**

Add to `tests/systems/air-operations-system.test.ts`:
```typescript
it('getAirBaseCapacity returns 2 for a Carrier (baseline, must stay true after the carrierDeckCapacity refactor)', () => {
  const state = /* reuse this file's existing carrier-base fixture, or build a minimal one: a civ-owned unit of type 'carrier' */;
  const capacity = getAirBaseCapacity(state, { kind: 'carrier', unitId: /* the carrier's id */ });
  expect(capacity).toBe(2);
});
```

- [ ] **Step 2: Run to verify it currently passes (baseline)**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts -t "returns 2 for a Carrier"`
Expected: PASS (this is the pre-refactor baseline, not a failing-test step).

- [ ] **Step 3: Add the field and refactor**

In `src/core/types.ts`, on `UnitDefinition`, add near `airOperation?`:
```typescript
  /** Air-base roster slots this naval unit's own deck provides when hosting an AirBaseRef{kind:'carrier'}. Only meaningful on carrier-capable naval hulls. */
  carrierDeckCapacity?: number;
```

In `src/systems/unit-system.ts`, add `carrierDeckCapacity: 2,` to the existing `carrier` entry.

In `src/systems/air-operations-system.ts`, change `getAirBaseCapacity`:
```typescript
export function getAirBaseCapacity(state: GameState, base: AirBaseRef): number {
  if (base.kind === 'carrier') {
    const hostType = state.units[base.unitId]?.type;
    return (hostType ? UNIT_DEFINITIONS[hostType].carrierDeckCapacity : undefined) ?? 0;
  }
  const city = state.cities[base.cityId];
  ...
```

- [ ] **Step 4: Run the regression test again to confirm byte-identical behavior**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts -t "returns 2 for a Carrier"`
Expected: PASS, unchanged.

- [ ] **Step 5: Run full air-operations-system test file + build**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/air-operations-system.test.ts`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(#582): generalize carrier deck capacity to a definition-driven field"
```

---

### Task 6: Supercarrier — unit, Carrier's upgrade path, full end-to-end wiring

**Files:**
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/unit-modifier-definitions.ts`, `src/systems/combat-role-definitions.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras13.ts`
- Test: `tests/systems/unit-system.test.ts`, `tests/systems/air-operations-system.test.ts`

**Interfaces:**
- Produces: `UNIT_DEFINITIONS.supercarrier` (`carrierDeckCapacity: 3`); `carrier.upgradesTo = 'supercarrier'`

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/unit-system.test.ts`:
```typescript
describe('Supercarrier (#582)', () => {
  it('is a bigger-deck naval hull with no speed advantage over Carrier', () => {
    const supercarrier = UNIT_DEFINITIONS.supercarrier;
    const carrier = UNIT_DEFINITIONS.carrier;
    expect(supercarrier.carrierDeckCapacity).toBe(3);
    expect(carrier.carrierDeckCapacity).toBe(2);
    expect(supercarrier.movementPoints).toBe(carrier.movementPoints);
    expect(supercarrier.strength).toBeGreaterThan(carrier.strength);
  });

  it('Carrier upgrades into Supercarrier and is no longer terminal', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'carrier')!;
    expect(entry.upgradesTo).toBe('supercarrier');
    expect(entry.obsoletedByTech).toBeUndefined();
  });
});
```

Add to `tests/systems/air-operations-system.test.ts`:
```typescript
it('getAirBaseCapacity returns 3 for a Supercarrier, and a 3rd aircraft can base there where it would fail at a 2-slot Carrier', () => {
  // Build a fixture with a supercarrier-type unit and 2 already-based
  // aircraft; assert canCompleteAirUnitProduction (or the equivalent
  // rebase-eligibility check) succeeds for a 3rd where the same setup on a
  // plain 'carrier' fails.
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts -t "Supercarrier"`
Expected: FAIL.

- [ ] **Step 3: Add the type and definition**

`src/core/types.ts`: add `'supercarrier'` to `UnitType`.

`src/systems/unit-system.ts`, add to `UNIT_DEFINITIONS` immediately after `carrier`:
```typescript
  supercarrier: {
    type: 'supercarrier', name: 'Supercarrier',
    movementPoints: 4, visionRange: 3, strength: 58,
    canFoundCity: false, canBuildImprovements: false, productionCost: 340,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
    carrierDeckCapacity: 3,
  },
```

- [ ] **Step 4: Wire `carrier.upgradesTo`, `UNIT_CLASS_BY_TYPE`, combat roles, `TRAINABLE_UNITS`, `PRODUCTION_ICONS`, tech unlock**

`src/systems/city-system.ts`: change the existing `carrier` `TRAINABLE_UNITS` entry to add `upgradesTo: 'supercarrier'`. Add a new entry immediately after `destroyer`/`autonomous_frigate` (era-13 group, matching where `autonomous_frigate` already sits):
```typescript
  { type: 'supercarrier', name: 'Supercarrier', cost: 340, techRequired: 'ocean-robotics', coastalRequired: true, pacing: { band: 'marquee', role: 'naval-projection-apex', impact: 1.65, scope: 'military', snowball: 1.5, urgency: 1.15, situationality: 1.4, unlockBreadth: 1 } },
```
`PRODUCTION_ICONS`: `supercarrier: '🚢',`.

`src/systems/unit-modifier-definitions.ts`: `supercarrier: ['naval'],`.

`src/systems/combat-role-definitions.ts`: change `carrier`'s entry to remove its `terminalReason: 'Current top-tier naval projection with no later roster replacement.'` and correct its description (Task 8 handles the exact wording alongside the other content-honesty fixes — for now just remove the stale `terminalReason` and leave a `// terminalReason removed: carrier -> supercarrier now exists` comment so Task 8 finds it). Add:
```typescript
  supercarrier: role('capital-ship', 'Larger carrier with room for a bigger, more varied air wing.', ['naval-combat', 'escort'], { counters: ['capital-ship'], vulnerableTo: ['capital-ship'], upgradeFamily: 'surface-warship', terminalReason: 'Current top-tier naval air projection with no later roster replacement.' }),
```

`src/systems/tech-definitions-eras13.ts`: add `'supercarrier'` to `ocean-robotics`'s `unlocksUnits`.

- [ ] **Step 5: Run tests, `yarn build` (fix exhaustive-map gaps), re-run**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts tests/systems/air-operations-system.test.ts`
Run: `bash scripts/run-with-mise.sh yarn build` (fix gaps)
Run: `bash scripts/run-with-mise.sh yarn build` (confirm clean)
Expected: all PASS.

- [ ] **Step 6: Run unit-upgrade-related tests**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-upgrade-system.test.ts tests/systems/tech-unlocks-consistency.test.ts`
Expected: PASS. If any existing test asserted "Carrier has no upgrade path" as a fixed catalog fact, update it here with a comment explaining the deliberate change (#582).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(#582): add Supercarrier as Carrier's deck-progression upgrade"
```

---

### Task 7: UI — Patrol button, air-mission wiring, air-wing roster display

**Files:**
- Modify: `src/renderer/render-loop.ts`, `src/app/ports.ts`, `src/app/controllers/selection-controller.ts`, `src/app/controllers/map-interaction-controller.ts`, `src/ui/selected-unit-info.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

- [ ] **Step 1: Widen the `mission` type and highlight type**

`src/app/ports.ts`: change `{ readonly kind: 'air-mission'; readonly unitId: string; readonly mission: 'strike' | 'recon' }` to `'strike' | 'recon' | 'patrol'`.

`src/renderer/render-loop.ts`: add `'air-patrol'` to `HexHighlight['type']`, and to `HEX_HIGHLIGHT_COLORS`:
```typescript
  'air-patrol': '#0891b2',
```
(Distinct hue from `air-recon`'s `#38bdf8` and `air-strike`'s `#f97316` — cyan-teal reads as "search/scan," matching Air Assault's own teal-for-a-support-verb precedent from #543.)

- [ ] **Step 2: Widen `selection-controller.ts`'s `onStartAirMission`**

Find the existing handler (search `onStartAirMission: (uid, mission) => {`) and widen its internal branches:
```typescript
        onStartAirMission: (uid, mission) => {
          selection.setPendingIntent({ kind: 'air-mission', unitId: uid, mission });
          const targets = getLegalAirMissionTargets(session.getState(), uid, mission);
          selection.setRanges([], []);
          selectUnit(uid);
          renderLoop.setHighlights(targets.map(coord => ({
            coord,
            type: mission === 'strike' ? 'air-strike' as const : mission === 'recon' ? 'air-recon' as const : 'air-patrol' as const,
          })));
          const noticeText = mission === 'strike'
            ? 'Tap a hostile target within operational range, or cancel.'
            : mission === 'recon'
              ? 'Tap a recon center within operational range, or cancel.'
              : 'Tap a patrol center — reveals ships and hidden submarines in a wide area for the rest of this turn. Uses this aircraft\'s turn, or cancel.';
          deps.showNotification(noticeText, 'info');
        },
```

`onCancelAirMission` needs no change (it's mission-agnostic already).

- [ ] **Step 3: Widen `map-interaction-controller.ts`'s `case 'air-mission':`**

```typescript
          case 'air-mission': {
            const pending = intent.pending;
            const result = pending.mission === 'strike'
              ? resolveAirStrike(session.getState(), pending.unitId, coord)
              : pending.mission === 'recon'
                ? resolveReconMission(session.getState(), pending.unitId, coord)
                : resolvePatrolMission(session.getState(), pending.unitId, coord);
            if (!result.ok) {
              deps.showNotification('That air mission target is no longer legal.', 'warning');
              return;
            }
            selection.setPendingIntent({ kind: 'none' });
            session.commit(result.state);
            selectionController.refreshCurrentPlayerVisibility();
            deps.updateHUD();
            if (pending.mission === 'recon' || pending.mission === 'patrol') SFX.airRecon();
            else SFX.combat();
            selectionController.selectUnit(pending.unitId);
            return;
          }
```

(Add `resolvePatrolMission` to this file's existing `air-operations-system` import.)

- [ ] **Step 4: Widen `selected-unit-info.ts`'s callback type and add the Patrol button**

Widen `onStartAirMission?: (unitId: string, mission: 'strike' | 'recon') => void;` to include `'patrol'`, and `airMissionPending?: 'strike' | 'recon';` likewise.

Find the existing Air Strike/Recon block (search `def.airOperation?.missions.includes('strike')`) and add a third branch immediately after the `'recon'` one:
```typescript
    if (def.airOperation?.missions.includes('patrol')) {
      actionsDiv.appendChild(makeButton('Patrol', '#0891b2', () => callbacks.onStartAirMission!(unitId, 'patrol')));
    }
```
Update the `Cancel` label ternary above it (`presentation.airMissionPending === 'strike' ? 'Air Strike' : 'Recon'`) to a 3-way match:
```typescript
    actionsDiv.appendChild(makeButton(`Cancel ${presentation.airMissionPending === 'strike' ? 'Air Strike' : presentation.airMissionPending === 'recon' ? 'Recon' : 'Patrol'}`, '#6b7280', () => callbacks.onCancelAirMission!(unitId)));
```

- [ ] **Step 5: Add the air-wing roster display block**

In `selected-unit-info.ts`'s render body, for a selected unit whose `UNIT_DEFINITIONS[unit.type].carrierDeckCapacity` is defined, add a new display block (place it near where cargo/transport contents are already rendered for Destroyer-style panels — read that existing block first and mirror its icon+text, non-color-only convention):

```typescript
  if (def.carrierDeckCapacity !== undefined) {
    // AirBaseRef = { kind: 'city'; cityId: string } | { kind: 'carrier'; unitId: string }
    // (verified against src/core/types.ts) -- a carrier host uses the
    // 'carrier' variant keyed by the carrier's own unit id, not a city.
    const roster = getAirBaseRoster(state, { kind: 'carrier', unitId });
    const capacity = def.carrierDeckCapacity;
    const wingHeader = document.createElement('div');
    wingHeader.textContent = `Air Wing ${roster.length} / ${capacity}`;
    actionsDiv.appendChild(wingHeader);
    for (const aircraft of roster) {
      const row = document.createElement('div');
      const status = aircraft.hasActed ? 'Used' : 'Ready';
      row.textContent = `• ${UNIT_DEFINITIONS[aircraft.type].name} — ${status}`;
      actionsDiv.appendChild(row);
    }
    for (let i = roster.length; i < capacity; i++) {
      const emptyRow = document.createElement('div');
      emptyRow.textContent = '• Empty slot';
      actionsDiv.appendChild(emptyRow);
    }
  }
```

(The placeholder comment above is deliberate — fix the `AirBaseRef` construction against the real type before this compiles; do not leave the placeholder in the merged code, this is a note for whoever executes this step to get right the first time by reading `air-operations-system.ts`'s `AirBaseRef` export.)

- [ ] **Step 6: Write the failing UI tests**

Add to `tests/ui/selected-unit-info.test.ts` (mirror this file's existing Air Assault/Paradrop button-test fixture conventions):

```typescript
describe('renderSelectedUnitInfo — Patrol button (#582)', () => {
  it('shows a Patrol button for a based maritime patrol aircraft and calls onStartAirMission with "patrol"', () => {
    // fixture: maritime_patrol_aircraft with unit.airBase set, !hasActed
  });
});

describe('renderSelectedUnitInfo — air wing roster (#582)', () => {
  it('shows "Air Wing N / capacity" and each based aircraft\'s name and Ready/Used status for a selected Carrier', () => {
    // fixture: a carrier unit with 1 based, un-acted fighter and 1 based, acted naval_strike_aircraft aboard
  });

  it('shows an empty-slot line for each unused deck slot', () => {
  });
});
```

- [ ] **Step 7: Run to verify failing, implement fully, re-run to verify passing**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts -t "Patrol button"`
Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts -t "air wing roster"`
Expected: FAIL, then implement Steps 1-5 for real (including fixing the `AirBaseRef` placeholder), then:
Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`
Expected: PASS, entire file.

- [ ] **Step 8: Manual smoke test**

Start the dev server (`bash scripts/run-with-mise.sh yarn dev` via `preview_start`), reach a state with a Carrier hosting a mixed air wing (fastest path: add a `carrier-air-wing-basic` entry to `src/testing/scenarios.ts`, mirroring `helicopter-air-assault-basic`'s exact structure from #543 — a coastal city, a carrier unit with `airBase` set for 1-2 aircraft, `carrier-warfare`/`radar-systems` techs granted). Confirm: Air Wing roster displays correctly with Ready/Used/Empty states; Patrol button appears on the patrol aircraft and is absent on non-patrol aircraft; clicking Patrol highlights legal tiles in the new cyan color and shows the plain-language preview text; executing a patrol reveals a planted submarine within radius and does not reveal one outside it.

- [ ] **Step 9: Run full suite + build**

Run: `bash scripts/run-with-mise.sh yarn test`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(#582): wire Patrol button, air-mission UI, and carrier air-wing roster display"
```

---

### Task 8: AI carrier deck-composition nudging

**Files:**
- Modify: `src/ai/ai-production.ts`
- Test: `tests/ai/ai-production.test.ts`

**Interfaces:**
- Consumes: `getAirBaseRoster`, `hasRememberedHostileSubmarineSighting` (already private in this file — verify still usable in scope)

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-production.test.ts` (reuse this file's existing `setupState`/`demand`/`generateAIProductionCandidates` conventions):

```typescript
describe('AI carrier deck composition nudging (#582)', () => {
  it('discounts a candidate role already well-represented on a specific carrier\'s current air wing', () => {
    // Fixture: a civ-owned carrier already hosting 1 fighter aboard, open
    // deck slot remaining. Compare the AI's fighter-candidate score against
    // an otherwise-identical fixture where the carrier is empty. The
    // already-stacked case should score the same role lower.
  });

  it('boosts patrol-aircraft candidate scoring when a remembered hostile submarine sighting exists near a civ-owned carrier', () => {
  });

  it('does not boost patrol scoring when no submarine has actually been perceived by this civ (no hidden information)', () => {
  });
});
```

- [ ] **Step 2: Run to verify they fail (or trivially pass if the nudge doesn't exist and both sides compute equal scores)**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts -t "AI carrier deck composition nudging"`
Expected: the "discounts"/"boosts" comparisons FAIL (scores currently equal).

- [ ] **Step 3: Implement**

In `src/ai/ai-production.ts`, add a new scoring helper near the existing `submarineThreatScore`:

```typescript
/**
 * #582: nudges carrier-air-wing composition toward diversity and toward
 * Patrol specifically when a real (perceived, not omniscient) submarine
 * threat exists. Reuses hasRememberedHostileSubmarineSighting unchanged --
 * no new confidence threshold, no raw GameState submarine read.
 *
 * Only considers carriers with at least one open deck slot (a full carrier
 * isn't a real destination for a new aircraft yet); "how stacked would this
 * role be" uses the LEAST-stacked such carrier (the best-case destination
 * for a new unit of this type), not a sum across every carrier the civ
 * owns -- an unrelated carrier's composition shouldn't discourage building
 * a role this specific decision has nothing to do with. The submarine-
 * threat bonus applies once (not once per open carrier) -- it answers "is
 * there a real reason to want a patrol aircraft at all," not "how many
 * carriers could it go to."
 */
function carrierCompositionScore(
  state: GameState,
  civId: string,
  unit: TrainableUnitEntry,
): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  if (!definition.airOperation?.carrierEligible) return 0;
  const openCarriers = Object.values(state.units)
    .filter(candidate => candidate.owner === civId && UNIT_DEFINITIONS[candidate.type].carrierDeckCapacity !== undefined)
    .map(carrier => ({
      roster: getAirBaseRoster(state, { kind: 'carrier', unitId: carrier.id }),
      capacity: UNIT_DEFINITIONS[carrier.type].carrierDeckCapacity ?? 0,
    }))
    .filter(({ roster, capacity }) => roster.length < capacity);
  if (openCarriers.length === 0) return 0;

  const leastStackedSameRoleCount = Math.min(...openCarriers.map(({ roster }) =>
    roster.filter(aboard => aboard.type === unit.type).length));
  let score = -leastStackedSameRoleCount * 15; // discourage stacking one role on one deck

  if (definition.airOperation.missions.includes('patrol') && hasRememberedHostileSubmarineSighting(state, civId)) {
    score += 40;
  }
  return score;
}
```

Thread it into the existing candidate-scoring aggregation (find where `submarineThreatScore`'s result is added to a candidate's total score, inside the main unit-scoring loop, and add `carrierCompositionScore(state, civId, unit)` alongside it, matching the same additive pattern — this function doesn't need `cityId`, unlike its sibling scoring helpers, since carrier basing is empire-wide, not city-scoped).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts`
Expected: PASS, entire file.

- [ ] **Step 5: Run full AI suite + build**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(#582): nudge AI carrier deck composition toward diversity and known submarine threats"
```

---

### Task 9: Hot-seat, save, and balance test passes + content-honesty fixes

**Files:**
- Create: `tests/systems/carrier-air-wing-hotseat.test.ts`, `tests/systems/carrier-air-wing-save.test.ts`, `tests/systems/carrier-air-wing-balance.test.ts`
- Modify: `src/systems/unit-system.ts` (Carrier's description), `src/systems/combat-role-definitions.ts` (Carrier's description, finish Task 6 Step 4's placeholder comment)

- [ ] **Step 1: Fix Carrier's stale content**

In `src/systems/unit-system.ts`, find `UNIT_DESCRIPTIONS.carrier` and replace any claim about bombers with an accurate one naming what it now actually hosts:
```typescript
  carrier: 'Mobile airbase for up to 2 aircraft — Fighters, Naval Strike Aircraft, or a Maritime Patrol Aircraft. Requires a coastal city to build.',
```
(Verify the exact current string first and preserve any other accurate detail already in it, e.g. era/stat callouts, only correcting the false "bombers" claim and adding the new roster options.)

In `src/systems/combat-role-definitions.ts`, replace the `carrier` entry's description (the "projects fighters and bombers" string) with equivalent corrected wording, and confirm the `// terminalReason removed` comment from Task 6 Step 4 is now deleted (its job — flagging the removal for this task — is done).

- [ ] **Step 2: Run description-honesty and unit-system tests**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/description-honesty.test.ts tests/systems/unit-system.test.ts tests/systems/combat-role-definitions.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the hot-seat test**

Create `tests/systems/carrier-air-wing-hotseat.test.ts`, mirroring `tests/systems/airborne-hotseat.test.ts`'s exact fixture-building conventions from #543 (same-shaped two-civ fixture, both hostile to a third civ owning a submarine):

```typescript
describe('hot-seat isolation — patrol reveal (#582)', () => {
  it('civ A (who flew a Patrol mission covering a submarine) sees it; civ B (who did not patrol there) does not, for the same tile under the same fog', () => {
    // Two civs, each with visibility of a contested tile a hostile
    // submarine occupies. Only civ A has a patrolReveals entry covering
    // that tile. Assert isSubmarineConcealedFrom differs by viewer.
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/carrier-air-wing-hotseat.test.ts`
Expected: PASS once implemented (this exercises already-shipped Task 3 code, so it should pass on first real implementation, not require further production changes — if it fails, that's a real bug in Task 3 to fix here).

- [ ] **Step 4: Write the save test**

Create `tests/systems/carrier-air-wing-save.test.ts`, mirroring `tests/systems/airborne-save.test.ts`'s `createNewGame`/`serializeSaveFile`/`parseSaveFile`/`processTurn` conventions:

```typescript
describe('carrier air wing save/load round-trip (#582)', () => {
  it('preserves a mixed air wing (fighter + naval strike + patrol) and an active patrol reveal through a same-turn save/load, clearing correctly next turn', () => {
  });

  it('a pre-feature save (no patrolReveals field, no carrierDeckCapacity-dependent state) loads and computes capacity correctly with zero migration', () => {
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/carrier-air-wing-save.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the balance test file**

Create `tests/systems/carrier-air-wing-balance.test.ts`, following `tests/systems/airborne-balance.test.ts`'s statistical-sampling conventions from #543:

```typescript
describe('carrier air wing balance (#582)', () => {
  it('Naval Strike Aircraft\'s 1.35x modifier gives it a real edge over a plain Jet Fighter specifically against a Destroyer, without being overpowered against a land unit', () => {
    // Direct resolveCombat comparison, not just raw strength arithmetic --
    // confirms the spec's §4.1 math holds after era/terrain/veterancy
    // modifiers stack, per the spec's own explicit caveat.
  });

  it('a 2-slot Carrier cannot run all three roles at once; a 3-slot Supercarrier can', () => {
  });

  it('Destroyer remains the only persistent (no-action-cost) submarine detector; Patrol\'s coverage vanishes the turn after it flies', () => {
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/carrier-air-wing-balance.test.ts`
Expected: PASS. If the Naval Strike modifier doesn't produce the intended edge once real combat math is applied, that's a number to revisit (documented in this test's comments), not a silent tuning decision.

- [ ] **Step 6: Run the pacing-audit gate**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pacing-audit.test.ts`
Expected: PASS. This feature adds no yield/economy effects, so this run is a confirmation, not an expected-change gate — but it's triggered defensively since 3 new units' `pacing` metadata was added (per `.claude/rules/game-balance.md`'s pacing-regression-prevention rule). If it fails, adjust the new units' `pacing` band/impact values (not the audit itself) the same way #543's Paratrooper pacing band needed correction during its own review.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(#582): hot-seat isolation, save round-trip, and balance validation for carrier air wing"
```

---

### Task 10: Full-suite run and post-implementation review

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

Re-read the complete diff against `main` with fresh eyes, per #543's precedent (its own post-implementation review found 3 real bugs only visible once the full diff existed) and this task's explicit review checklist:

- **AI hidden-information leaks**: re-confirm `rankPatrol`'s candidate centers and `carrierCompositionScore`'s submarine-threat nudge both derive strictly from `buildMajorCivPerception`, never raw `state.units` submarine positions.
- **Stale deck UI**: does the air-wing roster panel re-render immediately after a Patrol/Strike mission changes `hasActed` on a based aircraft, or does it require a re-select? (Matches `ui-panels.md`'s "if a panel action mutates state the same panel renders, it must refresh immediately" rule.)
- **Capacity bugs**: a full deck correctly rejects a new arrival at both Carrier (2) and Supercarrier (3); an upgrade from Carrier to Supercarrier mid-game with a full 2-aircraft deck doesn't strand or duplicate the based aircraft.
- **Carrier destruction with based aircraft**: confirm existing #539 cascade behavior (based aircraft removed when their carrier is destroyed) still applies correctly to the two new carrier-capable aircraft types and to Supercarrier — this is inherited, unowned logic; just confirm it wasn't accidentally scoped to `type === 'carrier'` literally anywhere instead of the generic `carrierDeckCapacity`/`AirBaseRef{kind:'carrier'}` check.
- **Save/load**: re-confirm Task 9's save tests exercise the real `serializeSaveFile`/`parseSaveFile` pipeline, not hand-constructed state.
- **Hidden submarine leakage**: re-confirm the Task 1 fix and Task 3's `patrolReveals` branch together fully close the "aircraft as free detector" gap — no other code path in `concealment.ts`, `fog-of-war.ts`, or the renderer independently re-derives submarine visibility from air-unit adjacency.
- **Destroyer role erosion**: re-read Task 9's balance test output; confirm Patrol's temporary, larger-but-vanishing coverage never reads as strictly better than Destroyer's smaller-but-persistent one in the tested scenarios.
- **Target-domain mistakes**: re-confirm the anti-ship modifier's `defenderClass: 'naval'` doesn't accidentally also match `civilian`-class targets it shouldn't get bonus credit for beyond what any other naval-vs-naval attacker already would (compare against the existing `destroyer→submarine` row's exact matching behavior).
- **AI hot-path complexity**: re-confirm `rankPatrol`'s candidate set stays bounded (≤2, per Task 4's own test) and `carrierCompositionScore` iterates only the acting civ's own carriers, not every unit in the game.
- **Misleading descriptions**: re-read the final `UNIT_DESCRIPTIONS`/`combat-role-definitions.ts` strings for all 3 new units and the corrected Carrier entry against what actually shipped, not what Task 9 planned.
- **Hot-seat overlay leakage**: confirm cancelling a pending Patrol mission clears its highlight overlay the same way Strike/Recon already do (shared `pendingIntent` clear path, not a parallel one).

Fix anything found in a follow-up commit on this same branch before considering the branch complete — do not defer real bugs found here.

- [ ] **Step 5: Final commit (if Step 4 found anything to fix) or proceed to finishing the branch**

If Step 4 required fixes:
```bash
git add -A
git commit -m "fix(#582): post-implementation review — fix N real bugs in shipped code"
```

If Step 4 found nothing to fix, no commit needed — proceed directly to `superpowers:finishing-a-development-branch`.
