# Pirate Naval Siege Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this project's CLAUDE.md forbids subagents — execute inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give pirate factions an apex "siege" action that damages coastal-city HP through the same #549 city-siege machinery barbarians use — gated behind a telegraphed blockade, blocked by a garrison, mitigated by walls/techs, and never able to eliminate a civilization.

**Architecture:** Reuse `src/systems/city-siege-system.ts` wholesale via `attackerDomain: 'naval'`. Add a `besieging` behavior tier to the pirate notoriety ladder, track per-(faction, city) consecutive-blockade turns in pirate state, derive sieges from active blockades that have reached the streak threshold, and apply them inside `processPiratesForCompletedRound` (which runs once per completed round — correct for hot-seat). Two latent #549 helper bugs (dropped flat-defense bonuses; zombie-civ on last-city destruction) are fixed in the shared helper, which also corrects the shipped barbarian path.

**Tech Stack:** TypeScript, Vite, Vitest. Canvas 2D renderer, EventBus, single serializable plain-object game state.

## Global Constraints

- **Commands:** build with `bash scripts/run-with-mise.sh yarn build` (the only path that runs `tsc`); test with `bash scripts/run-with-mise.sh yarn test`. Both must exit 0 before any push.
- **Determinism:** never `Math.random()` — this feature needs no new RNG (siege is deterministic given state).
- **Immutable turn processing:** every state transform returns a new `GameState`; never mutate `state.cities[id]`, `state.units[id]`, `state.civilizations[id]`, or `state.pirates.factions[id]` in place. Spread-copy.
- **Once per round:** all siege logic lives in `processPiratesForCompletedRound` (`src/systems/pirate-system.ts`, called from `src/core/turn-manager.ts:1179`), so it fires once per completed round, not once per hot-seat player-turn.
- **Spec:** `docs/superpowers/specs/2026-07-11-pirate-naval-siege-design.md`. Section refs (§3a, §6, etc.) point there.
- **Tests mirror src:** tests live under `tests/` mirroring `src/`. Use Vitest.
- **Dead pirate-fleet code is off-limits:** do not touch or revive `threat-pressure-system.ts`'s `processPirateFleets`/`PirateFleet`.
- **Commit** after each task's tests pass (30 000 ms timeout for `git commit`).

## File Structure

**Create:**
- none (all changes extend existing files)

**Modify:**
- `src/core/pirate-state.ts` — add `'besieging'` to `PirateBehavior`; add `blockadeStreakByCity` to `PirateFactionState`.
- `src/systems/pirate-definitions.ts` — add `besieging` threshold + `besieging` entries to the `Record<PirateBehavior>` maps + new siege constants.
- `src/systems/pirate-ecology.ts` — init `blockadeStreakByCity: {}` at both faction-construction sites.
- `src/systems/city-siege-system.ts` — Fix A (apply `flatBonus`), Fix B (`isOwnersLastCity` → sack).
- `src/core/turn-manager.ts` — barbarian caller passes `isOwnersLastCity`.
- `src/systems/pirate-behavior.ts` — blockade includes `besieging` factions; add `derivePirateSieges`; add `applyBlockadeStreaks`.
- `src/systems/pirate-system.ts` — `advanceBehavior` promotes to `besieging`; round processing updates streaks, derives + applies sieges, emits events.
- `src/systems/pirate-notifications.ts` — `siege` + `city-razed` notification types + drafts.
- `src/core/types.ts` — add `'pirate:city-destroyed'` event.
- `src/main.ts` — civ-log handler for `pirate:city-destroyed`.
- `src/audio/pirate-audio-sources.ts` — `siege` + `city-razed` stinger files.
- `src/ui/city-panel.ts` — (already shows the label; no change unless a test needs it).
- `src/renderer/city-renderer.ts` — on-map under-siege badge.

**Test files (modify/create):**
- `tests/systems/city-siege-system.test.ts`, `tests/systems/pirate-behavior.test.ts`, `tests/systems/pirate-system.test.ts`, `tests/systems/pirate-siege.test.ts` (new integration), `tests/systems/barbarian-system.test.ts`, `tests/renderer/city-renderer.test.ts` (or nearest existing renderer test), `tests/core/turn-manager.test.ts`.

---

### Task 1: Add the `besieging` behavior tier (types, constants, escalation, blockade participation)

**Files:**
- Modify: `src/core/pirate-state.ts` (PirateBehavior union)
- Modify: `src/systems/pirate-definitions.ts` (notoriety + constants + Record maps)
- Modify: `src/systems/pirate-system.ts` (`advanceBehavior`)
- Modify: `src/systems/pirate-behavior.ts` (`derivePirateBlockades` guard)
- Test: `tests/systems/pirate-system.test.ts`, `tests/systems/pirate-behavior.test.ts`

**Interfaces:**
- Produces: `PirateBehavior` now includes `'besieging'`; constants `PIRATE_NOTORIETY.besieging`, `PIRATE_SIEGE_MIN_STAGE`, `PIRATE_SIEGE_DAMAGE`, `PIRATE_SIEGE_BLOCKADE_TURNS`.

- [ ] **Step 1: Write the failing test** (escalation to `besieging`)

In `tests/systems/pirate-system.test.ts`, add (adapt imports/fixtures to the file's existing helpers for building a pirate faction):

```ts
import { PIRATE_NOTORIETY, PIRATE_SIEGE_MIN_STAGE } from '@/systems/pirate-definitions';
import { processPiratesForCompletedRound } from '@/systems/pirate-system';

it('promotes a faction to besieging when notoriety >= threshold and stage >= floor', () => {
  const state = makeStateWithPirateFaction({
    notoriety: PIRATE_NOTORIETY.besieging,       // already at the threshold
    maritimeStage: PIRATE_SIEGE_MIN_STAGE,
    behavior: 'blockading',
    spawnedRound: 0,
  });
  // advanceBehavior recomputes behavior from notoriety every round, so one round is enough.
  const { state: advanced } = processPiratesForCompletedRound(state, makeTestBus());
  const faction = Object.values(advanced.pirates!.factions)[0]!;
  expect(faction.behavior).toBe('besieging');
});

it('does NOT promote to besieging below the siege stage floor', () => {
  const state = makeStateWithPirateFaction({
    notoriety: PIRATE_NOTORIETY.besieging + 5,
    maritimeStage: PIRATE_SIEGE_MIN_STAGE - 1,
    behavior: 'blockading',
  });
  const { state: advanced } = processPiratesForCompletedRound(state, makeTestBus());
  const faction = Object.values(advanced.pirates!.factions)[0]!;
  expect(faction.behavior).not.toBe('besieging');
});
```

> Drive escalation through the **public** `processPiratesForCompletedRound` (its return shape carries `state`; match the existing pirate tests' destructuring). `advanceBehavior` is private — don't test it directly. If the suite has no `makeStateWithPirateFaction`/`makeTestBus` helper, build the faction inline using `createEmptyPirateState()` + a literal `PirateFactionState` (copy the shape from `src/core/pirate-state.ts`, including `blockadeStreakByCity: {}`) and the bus helper the other tests in the file use. Keep the fixture minimal. Note: setting `notoriety` at the threshold means the test does not depend on the fragile survival-tick timing.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test pirate-system`
Expected: FAIL — `'besieging'` is not assignable / behavior stays `'blockading'`.

- [ ] **Step 3: Add the type + constants**

In `src/core/pirate-state.ts`:

```ts
export type PirateBehavior = 'patrolling' | 'raiding' | 'blockading' | 'besieging';
```

In `src/systems/pirate-definitions.ts`, extend `PIRATE_NOTORIETY` and add siege constants:

```ts
export const PIRATE_NOTORIETY = {
  raiding: 2,
  blockading: 5,
  besieging: 9,
  survivalInterval: 8,
} as const;

// Siege capability floor: stage 3 == the `triremes` tech (see getPirateMaritimeStage).
export const PIRATE_SIEGE_MIN_STAGE = 3;
// Naval siege HP damage per round, indexed by maritimeStage (0..5). 0 below the floor.
export const PIRATE_SIEGE_DAMAGE = [0, 0, 0, 8, 12, 16] as const;
// Consecutive rounds a city must be blockaded (including the current round) before a
// besieging faction can start damaging its HP. The telegraphed warning window.
export const PIRATE_SIEGE_BLOCKADE_TURNS = 3;
```

Add `besieging` to every map that `satisfies Record<PirateBehavior, ...>` (TypeScript will error otherwise). In the same file:

```ts
export const PIRATE_FLEET_SIZE_BY_BEHAVIOR = {
  patrolling: { min: 1, max: 2 },
  raiding: { min: 2, max: 3 },
  blockading: { min: 3, max: 4 },
  besieging: { min: 3, max: 4 },
} as const satisfies Record<PirateBehavior, { min: number; max: number }>;

export const PIRATE_TRIBUTE_BASE = { patrolling: 15, raiding: 30, blockading: 50, besieging: 60 } as const;
export const PIRATE_BOUNTY_BASE = { patrolling: 10, raiding: 25, blockading: 45, besieging: 55 } as const;
```

> **tsc will fail unless every `PirateBehavior` consumer handles `besieging`.** Grep the whole `src/` tree for `PirateBehavior`, and specifically for (a) any other `satisfies Record<PirateBehavior` / `[behavior]` map (add a `besieging` entry), (b) any `switch (…behavior)` with an exhaustive `never` default (add a `case 'besieging'`), and (c) any behavior→label map in the pirate UI panel / intel display (add a human-readable `'besieging'` label such as "Besieging"). Run `bash scripts/run-with-mise.sh yarn build` after this step and fix every exhaustiveness error before moving on.

- [ ] **Step 4: Update `advanceBehavior` to compute the new tier**

In `src/systems/pirate-system.ts`, inside `advanceBehavior`, replace the `behavior` computation:

```ts
const behavior = notoriety >= PIRATE_NOTORIETY.besieging && faction.maritimeStage >= PIRATE_SIEGE_MIN_STAGE
  ? 'besieging' as const
  : notoriety >= PIRATE_NOTORIETY.blockading && faction.maritimeStage >= 2
  ? 'blockading' as const
  : notoriety >= PIRATE_NOTORIETY.raiding ? 'raiding' as const : 'patrolling' as const;
```

- [ ] **Step 5: Let besieging factions still blockade (streak on-ramp)**

In `src/systems/pirate-behavior.ts`, `derivePirateBlockades`, widen the behavior guard so a besieging faction keeps producing the blockade its siege depends on:

```ts
if ((faction.behavior !== 'blockading' && faction.behavior !== 'besieging') || faction.maritimeStage < 2) continue;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test pirate-system pirate-behavior`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/pirate-state.ts src/systems/pirate-definitions.ts src/systems/pirate-system.ts src/systems/pirate-behavior.ts tests/systems/pirate-system.test.ts tests/systems/pirate-behavior.test.ts
git commit -m "feat(pirates): add besieging apex behavior tier + siege constants (#522)"
```

---

### Task 2: Fix A — city-siege damage must apply flat defense bonuses

**Files:**
- Modify: `src/systems/city-siege-system.ts:41-47`
- Test: `tests/systems/city-siege-system.test.ts`, `tests/systems/barbarian-system.test.ts`

**Interfaces:**
- Consumes: `getCityDefenseBreakdown` (already returns `{ multiplier, flatBonus, parts }`).
- Produces: `resolveCitySiegeDamage` now subtracts `flatBonus` after dividing by `multiplier`.

- [ ] **Step 1: Write the failing test**

In `tests/systems/city-siege-system.test.ts`:

```ts
it('applies flat defense bonuses (Star Fort) to reduce siege damage', () => {
  const base = resolveCitySiegeDamage(makeSiegeInput({ buildings: ['walls'], rawDamage: 30 }));
  const fortified = resolveCitySiegeDamage(makeSiegeInput({ buildings: ['walls', 'star_fort'], rawDamage: 30 }));
  expect(fortified.hpLost).toBeLessThan(base.hpLost);
});

it('applies Torpedo Warfare only on the naval attacker domain', () => {
  const naval = resolveCitySiegeDamage(makeSiegeInput({
    buildings: ['walls'], techs: ['torpedo-warfare'], attackerDomain: 'naval', rawDamage: 30,
  }));
  const navalNoTech = resolveCitySiegeDamage(makeSiegeInput({
    buildings: ['walls'], techs: [], attackerDomain: 'naval', rawDamage: 30,
  }));
  const land = resolveCitySiegeDamage(makeSiegeInput({
    buildings: ['walls'], techs: ['torpedo-warfare'], attackerDomain: 'land', rawDamage: 30,
  }));
  const landNoTech = resolveCitySiegeDamage(makeSiegeInput({
    buildings: ['walls'], techs: [], attackerDomain: 'land', rawDamage: 30,
  }));
  expect(naval.hpLost).toBeLessThan(navalNoTech.hpLost); // torpedo-warfare helps vs naval
  expect(land.hpLost).toBe(landNoTech.hpLost);           // and is inert vs land
});
```

> Add a small `makeSiegeInput(partial)` helper at the top of the test file if one doesn't exist, defaulting `hasGarrison:false`, `era:1`, `challenge:'standard'`, `attackerDomain:'land'`, and building a minimal `city`/`ownerCiv` from `buildings`/`techs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: FAIL — `fortified.hpLost` equals `base.hpLost` (flat bonus ignored today).

- [ ] **Step 3: Apply the fix**

In `src/systems/city-siege-system.ts`, replace the damage computation:

```ts
  const breakdown = getCityDefenseBreakdown({
    cityBuildings: input.city.buildings ?? [],
    defenderCompletedTechs: input.ownerCiv.techState.completed ?? [],
    attackerDomain: input.attackerDomain,
  });
  const mitigatedDamage = Math.max(
    0,
    Math.round(input.rawDamage / breakdown.multiplier) - breakdown.flatBonus,
  );
  const newHp = Math.max(0, currentHp - mitigatedDamage);
```

- [ ] **Step 4: Add a barbarian-path regression**

In `tests/systems/barbarian-system.test.ts` (or wherever the barbarian siege integration lives), add a test that a walled + Star Fort city takes strictly less HP loss from a barbarian city order than a walls-only city, proving the shipped path benefits. Use the existing barbarian-siege test harness in that file.

- [ ] **Step 5: Run tests to verify they pass; check for value-assertion breakage**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system barbarian-system`
Expected: PASS. If any pre-existing test asserted an exact `hpLost`/`newHp` on a city that has `star_fort`/`fortification-engineering`/`torpedo-warfare`, update its expected number to reflect the now-applied flat bonus (this is a correctness fix, not a regression — note it in the commit).

- [ ] **Step 6: Commit**

```bash
git add src/systems/city-siege-system.ts tests/systems/city-siege-system.test.ts tests/systems/barbarian-system.test.ts
git commit -m "fix(city-siege): apply flat defense bonuses to siege damage, fixes dropped Star Fort/Torpedo Warfare (#522)"
```

---

### Task 3: Fix B — a siege never destroys a civ's last city

**Files:**
- Modify: `src/systems/city-siege-system.ts` (`CitySiegeInput`, `resolveCitySiegeDamage`)
- Modify: `src/core/turn-manager.ts:792` (barbarian caller passes `isOwnersLastCity`)
- Test: `tests/systems/city-siege-system.test.ts`, `tests/core/turn-manager.test.ts`

**Interfaces:**
- Produces: `CitySiegeInput.isOwnersLastCity?: boolean` (optional, defaults to `false`). When `true`, a 0-HP outcome is `sacked`, never `destroyed`.

- [ ] **Step 1: Write the failing test**

In `tests/systems/city-siege-system.test.ts`:

```ts
it('sacks (never destroys) a civ\'s last remaining city even past the destruction era', () => {
  const result = resolveCitySiegeDamage(makeSiegeInput({
    hp: 5, rawDamage: 100, era: 12, challenge: 'veteran', isOwnersLastCity: true,
  }));
  expect(result.outcome).toBe('sacked');
  expect(result.newHp).toBe(1);
});

it('still destroys a non-last city past the destruction era (regression: guard is scoped)', () => {
  const result = resolveCitySiegeDamage(makeSiegeInput({
    hp: 5, rawDamage: 100, era: 12, challenge: 'veteran', isOwnersLastCity: false,
  }));
  expect(result.outcome).toBe('destroyed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: FAIL — first test currently returns `'destroyed'`.

- [ ] **Step 3: Apply the fix**

In `src/systems/city-siege-system.ts`, add the field and gate the destroy branch:

```ts
export interface CitySiegeInput {
  city: City;
  ownerCiv: Civilization;
  rawDamage: number;
  attackerDomain: 'land' | 'naval' | 'air';
  hasGarrison: boolean;
  isOwnersLastCity?: boolean; // a siege never eliminates a civ — last city sacks, never destroys
  era: number;
  challenge: OpponentChallenge;
}
```

Then, in `resolveCitySiegeDamage`, change the 0-HP branch:

```ts
  const destructionEra = OPPONENT_CHALLENGE_PROFILES[input.challenge].citySiegeDestructionEra;
  if (input.era > destructionEra && !input.isOwnersLastCity) {
    return { hpLost: currentHp, newHp: 0, outcome: 'destroyed', goldLost: 0 };
  }

  const goldLost = Math.round(input.ownerCiv.gold * SACK_GOLD_LOSS_FRACTION);
  return { hpLost: currentHp - 1, newHp: 1, outcome: 'sacked', goldLost };
```

- [ ] **Step 4: Barbarian caller passes the flag**

In `src/core/turn-manager.ts`, the barbarian siege call (~line 792), add the field:

```ts
    const result = resolveCitySiegeDamage({
      city,
      ownerCiv,
      rawDamage: order.damage,
      attackerDomain: 'land',
      hasGarrison: getCityGarrisonUnit(newState.units, city) !== undefined,
      isOwnersLastCity: ownerCiv.cities.length <= 1,
      era: newState.era,
      challenge: resolveChallengeForCiv(newState, city.owner),
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system turn-manager`
Expected: PASS. Existing tests at `city-siege-system.test.ts:81,98` that assert `'destroyed'` still pass because `isOwnersLastCity` defaults to `false`.

- [ ] **Step 6: Commit**

```bash
git add src/systems/city-siege-system.ts src/core/turn-manager.ts tests/systems/city-siege-system.test.ts tests/core/turn-manager.test.ts
git commit -m "fix(city-siege): a siege never destroys a civ's last city, fixes zombie-civ (#522)"
```

---

### Task 4: Blockade-streak tracking in pirate state

**Files:**
- Modify: `src/core/pirate-state.ts` (`PirateFactionState`)
- Modify: `src/systems/pirate-ecology.ts` (both faction-construction sites, ~line 399 and ~455)
- Modify: `src/systems/pirate-behavior.ts` (add `applyBlockadeStreaks`)
- Test: `tests/systems/pirate-behavior.test.ts`

**Interfaces:**
- Produces: `PirateFactionState.blockadeStreakByCity: Record<string, number>`; `applyBlockadeStreaks(state, blockades): GameState`.

- [ ] **Step 1: Write the failing test**

In `tests/systems/pirate-behavior.test.ts`:

```ts
import { applyBlockadeStreaks } from '@/systems/pirate-behavior';

it('increments a faction\'s blockade streak for each currently-blockaded city', () => {
  const state = makeStateWithPirateFaction({ id: 'pirate-0' });
  const once = applyBlockadeStreaks(state, [{ factionId: 'pirate-0', cityId: 'city-a', victimCivId: 'civ-1' }]);
  const twice = applyBlockadeStreaks(once, [{ factionId: 'pirate-0', cityId: 'city-a', victimCivId: 'civ-1' }]);
  expect(twice.pirates!.factions['pirate-0']!.blockadeStreakByCity['city-a']).toBe(2);
});

it('resets the streak for a city that is no longer blockaded', () => {
  const state = makeStateWithPirateFaction({ id: 'pirate-0' });
  const once = applyBlockadeStreaks(state, [{ factionId: 'pirate-0', cityId: 'city-a', victimCivId: 'civ-1' }]);
  const broken = applyBlockadeStreaks(once, []); // blockade broke this round
  expect(broken.pirates!.factions['pirate-0']!.blockadeStreakByCity['city-a']).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test pirate-behavior`
Expected: FAIL — `applyBlockadeStreaks` is not exported / field missing.

- [ ] **Step 3: Add the state field + init**

In `src/core/pirate-state.ts`, add to `PirateFactionState` (after `transitionGuards`):

```ts
  transitionGuards: PirateTransitionGuards;
  // Per-city consecutive-blockade round counter; drives the siege on-ramp (#522).
  // Rebuilt each round from the active blockade set — a city that drops out resets to 0.
  blockadeStreakByCity: Record<string, number>;
```

In `src/systems/pirate-ecology.ts`, at both faction-construction sites (search for `transitionGuards: { emittedEventKeys: [] }`), add:

```ts
    transitionGuards: { emittedEventKeys: [] },
    blockadeStreakByCity: {},
```

- [ ] **Step 4: Add `applyBlockadeStreaks`**

In `src/systems/pirate-behavior.ts`:

```ts
import type { PirateBlockade } from './pirate-behavior'; // (already declared in-file; skip if same module)

// Rebuild every faction's per-city blockade streak from the current round's blockade set.
// A (faction, city) pair present this round increments; any pair absent resets to 0 (dropped).
// This single rebuild handles every reset cause: ship leaves, garrison irrelevant to blockade,
// faction de-escalates below blockading, or victim becomes ineligible.
export function applyBlockadeStreaks(state: GameState, blockades: PirateBlockade[]): GameState {
  if (!state.pirates) return state;
  const byFaction = new Map<string, Set<string>>();
  for (const b of blockades) {
    if (!byFaction.has(b.factionId)) byFaction.set(b.factionId, new Set());
    byFaction.get(b.factionId)!.add(b.cityId);
  }
  const factions: Record<string, PirateFactionState> = {};
  for (const [id, faction] of Object.entries(state.pirates.factions)) {
    const cities = byFaction.get(id) ?? new Set<string>();
    const prevStreak = faction.blockadeStreakByCity ?? {}; // tolerate old saves missing the field
    const nextStreak: Record<string, number> = {};
    for (const cityId of cities) {
      nextStreak[cityId] = (prevStreak[cityId] ?? 0) + 1;
    }
    factions[id] = { ...faction, blockadeStreakByCity: nextStreak };
  }
  return { ...state, pirates: { ...state.pirates, factions } };
}
```

> Import `PirateFactionState` from `@/core/pirate-state` if not already imported in this file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test pirate-behavior`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/pirate-state.ts src/systems/pirate-ecology.ts src/systems/pirate-behavior.ts tests/systems/pirate-behavior.test.ts
git commit -m "feat(pirates): track per-city blockade streaks for siege on-ramp (#522)"
```

---

### Task 5: Derive and apply pirate sieges

**Files:**
- Modify: `src/systems/pirate-behavior.ts` (add `derivePirateSieges` + `PirateSiege` type)
- Modify: `src/systems/pirate-system.ts` (round processing: streaks → sieges → apply)
- Modify: `src/core/types.ts` (add `'pirate:city-destroyed'` event)
- Test: `tests/systems/pirate-siege.test.ts` (new)

**Interfaces:**
- Consumes: `resolveCitySiegeDamage`, `applyCitySiegeOutcome`, `getCityGarrisonUnit` (`@/systems/city-siege-system`); `resolveChallengeForCiv` (`@/core/opponent-challenge`); `PIRATE_SIEGE_DAMAGE`, `PIRATE_SIEGE_MIN_STAGE`, `PIRATE_SIEGE_BLOCKADE_TURNS`.
- Produces: `PirateSiege { factionId; cityId; victimCivId; rawDamage }`; `derivePirateSieges(state, blockades): PirateSiege[]`; new event `'pirate:city-destroyed': { cityId; ownerId; factionId }`.

- [ ] **Step 1: Write the failing tests** (new file `tests/systems/pirate-siege.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { derivePirateSieges } from '@/systems/pirate-behavior';
import { PIRATE_SIEGE_BLOCKADE_TURNS, PIRATE_SIEGE_MIN_STAGE } from '@/systems/pirate-definitions';

// Build a state with one besieging faction, a ship adjacent to one coastal enemy city,
// and a pre-set blockade streak. Reuse the fixtures the other pirate tests use.
function siegeReadyState(overrides = {}) { /* ...construct per existing helpers... */ }

describe('derivePirateSieges', () => {
  it('produces a siege for a besieging faction on a city blockaded >= the threshold', () => {
    const state = siegeReadyState({ behavior: 'besieging', maritimeStage: PIRATE_SIEGE_MIN_STAGE, streak: PIRATE_SIEGE_BLOCKADE_TURNS });
    const blockades = [{ factionId: 'pirate-0', cityId: 'city-a', victimCivId: 'civ-1' }];
    expect(derivePirateSieges(state, blockades)).toHaveLength(1);
  });

  it('produces no siege below the streak threshold (blockade-first warning window)', () => {
    const state = siegeReadyState({ behavior: 'besieging', maritimeStage: PIRATE_SIEGE_MIN_STAGE, streak: PIRATE_SIEGE_BLOCKADE_TURNS - 1 });
    const blockades = [{ factionId: 'pirate-0', cityId: 'city-a', victimCivId: 'civ-1' }];
    expect(derivePirateSieges(state, blockades)).toHaveLength(0);
  });

  it('produces no siege for a merely blockading (not besieging) faction', () => {
    const state = siegeReadyState({ behavior: 'blockading', maritimeStage: PIRATE_SIEGE_MIN_STAGE, streak: PIRATE_SIEGE_BLOCKADE_TURNS });
    const blockades = [{ factionId: 'pirate-0', cityId: 'city-a', victimCivId: 'civ-1' }];
    expect(derivePirateSieges(state, blockades)).toHaveLength(0);
  });

  it('produces no siege below the siege stage floor', () => {
    const state = siegeReadyState({ behavior: 'besieging', maritimeStage: PIRATE_SIEGE_MIN_STAGE - 1, streak: PIRATE_SIEGE_BLOCKADE_TURNS });
    const blockades = [{ factionId: 'pirate-0', cityId: 'city-a', victimCivId: 'civ-1' }];
    expect(derivePirateSieges(state, blockades)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test pirate-siege`
Expected: FAIL — `derivePirateSieges` undefined.

- [ ] **Step 3: Add `derivePirateSieges`**

In `src/systems/pirate-behavior.ts`:

```ts
import { PIRATE_SIEGE_DAMAGE, PIRATE_SIEGE_MIN_STAGE, PIRATE_SIEGE_BLOCKADE_TURNS } from './pirate-definitions';

export interface PirateSiege {
  factionId: PirateFactionId;
  cityId: string;
  victimCivId: string;
  rawDamage: number;
}

// A siege is an ACTIVE blockade (from derivePirateBlockades) that has reached the streak
// threshold under a besieging, high-stage faction. Tying siege to the blockade set makes
// the blockade-first warning window structural: no blockade this round -> no siege.
export function derivePirateSieges(state: GameState, blockades: PirateBlockade[]): PirateSiege[] {
  const sieges: PirateSiege[] = [];
  for (const blockade of blockades) {
    const faction = state.pirates?.factions[blockade.factionId];
    if (!faction) continue;
    if (faction.behavior !== 'besieging') continue;
    if (faction.maritimeStage < PIRATE_SIEGE_MIN_STAGE) continue;
    if (((faction.blockadeStreakByCity ?? {})[blockade.cityId] ?? 0) < PIRATE_SIEGE_BLOCKADE_TURNS) continue;
    sieges.push({
      factionId: faction.id,
      cityId: blockade.cityId,
      victimCivId: blockade.victimCivId,
      rawDamage: PIRATE_SIEGE_DAMAGE[faction.maritimeStage] ?? 0,
    });
  }
  return sieges;
}
```

- [ ] **Step 4: Add the event type**

In `src/core/types.ts`, next to `'barbarian:city-destroyed'` (line ~1648):

```ts
  'pirate:city-destroyed': { cityId: string; ownerId: string; factionId: string };
```

- [ ] **Step 5: Wire streaks + sieges into the round**

In `src/systems/pirate-system.ts`, locate where `derivePirateBlockades` results are consumed (~line 761). After computing `blockades`, thread streaks and apply sieges. Add imports at the top:

```ts
import { applyBlockadeStreaks, derivePirateSieges } from './pirate-behavior';
import { resolveCitySiegeDamage, applyCitySiegeOutcome, getCityGarrisonUnit } from './city-siege-system';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
```

Then, right after `const blockades = derivePirateBlockades(nextState);`:

```ts
  // Update per-city blockade streaks from this round's blockades (the siege on-ramp),
  // then resolve any siege that has reached the threshold. Streaks must be applied
  // BEFORE deriving sieges so the current round counts toward the threshold.
  nextState = applyBlockadeStreaks(nextState, blockades);
  for (const siege of derivePirateSieges(nextState, blockades)) {
    const city = nextState.cities[siege.cityId];
    if (!city) continue;
    const ownerCiv = nextState.civilizations[city.owner];
    if (!ownerCiv) continue;
    const beforeHp = city.hp ?? 100;
    const result = resolveCitySiegeDamage({
      city,
      ownerCiv,
      rawDamage: siege.rawDamage,
      attackerDomain: 'naval',
      hasGarrison: getCityGarrisonUnit(nextState.units, city) !== undefined,
      isOwnersLastCity: ownerCiv.cities.length <= 1,
      era: nextState.era,
      challenge: resolveChallengeForCiv(nextState, city.owner),
    });
    nextState = applyCitySiegeOutcome(nextState, siege.cityId, result);

    // One-time "under siege" alert ONLY on the transition from full HP into damage.
    // The notification de-dup key is per-turn, so pushing every damaging round would
    // re-alert each round — this transition guard makes it fire once per siege episode.
    if (result.outcome === 'damaged' && beforeHp >= 100) {
      events.push({ type: 'siege', factionId: siege.factionId, civId: siege.victimCivId, cityId: siege.cityId });
    }
    if (result.outcome === 'sacked') {
      bus.emit('city:sacked', { cityId: siege.cityId, source: 'pirate', goldLost: result.goldLost });
    } else if (result.outcome === 'destroyed') {
      bus.emit('pirate:city-destroyed', { cityId: siege.cityId, ownerId: city.owner, factionId: siege.factionId });
      events.push({ type: 'city-razed', factionId: siege.factionId, civId: city.owner, cityId: siege.cityId });
    }
    // outcome === 'blocked' → garrison stopped it; no HP change, no alert (silent, by design).
  }
```

> **Extend the local `events` union type.** The `events` array here is the same one the surrounding function pushes `raid`/`blockade` onto — find its element type (the local `PirateTransitionEvent`-style union near the top of `processPiratesForCompletedRound` or its helpers) and add `'siege' | 'city-razed'` to it, plus optional `civId?`/`cityId?` fields if not already present, so these `events.push(...)` calls type-check. Match the exact field names the existing `raid`/`blockade` pushes use (`{ type, factionId, civId?, cityId?, amount? }`).

- [ ] **Step 6: Add a siege-application integration test**

Append to `tests/systems/pirate-siege.test.ts` a test that runs `processPiratesForCompletedRound` on a siege-ready state and asserts: garrisoned city HP unchanged (`blocked`); undefended city HP drops by the stage's `PIRATE_SIEGE_DAMAGE` (minus wall mitigation); a last-city at low HP resolves to `sacked` (city survives at 1 HP, not removed); a non-last city at 0 HP past the destruction era is removed and `pirate:city-destroyed` fires.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test pirate-siege`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/pirate-behavior.ts src/systems/pirate-system.ts src/core/types.ts tests/systems/pirate-siege.test.ts
git commit -m "feat(pirates): derive and apply naval sieges via shared city-siege helpers (#522)"
```

---

### Task 6: Siege + city-razed notifications and civ-log

**Files:**
- Modify: `src/systems/pirate-notifications.ts` (types + drafts + routing)
- Modify: `src/systems/pirate-system.ts` (map `siege`/`city-razed` events → notification events + audio-cue filter)
- Modify: `src/main.ts` (civ-log handler for `pirate:city-destroyed`)
- Test: `tests/systems/pirate-notifications.test.ts`, `tests/systems/pirate-siege.test.ts`

**Interfaces:**
- Produces: `PirateNotificationEvent.type` includes `'siege' | 'city-razed'`; drafts for both; `bus.on('pirate:city-destroyed')` civ-log.

- [ ] **Step 1: Write the failing test**

In `tests/systems/pirate-notifications.test.ts`:

```ts
it('drafts a plain-language siege warning linked to the city', () => {
  const state = applyPirateNotifications(makeNotifState(), [
    { type: 'siege', factionId: 'pirate-0', viewerId: 'civ-1', cityId: 'city-a' },
  ]);
  const entry = state.notificationLog!['civ-1']!.at(-1)!;
  expect(entry.message).toMatch(/besieg/i);
  expect(entry.type).toBe('warning');
});

it('drafts a city-razed notice distinct from a faction-destroyed notice', () => {
  const state = applyPirateNotifications(makeNotifState(), [
    { type: 'city-razed', factionId: 'pirate-0', viewerId: 'civ-1', cityId: 'city-a' },
  ]);
  const entry = state.notificationLog!['civ-1']!.at(-1)!;
  expect(entry.message).toMatch(/razed|destroyed by pirates/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test pirate-notifications`
Expected: FAIL — `'siege'`/`'city-razed'` not assignable.

- [ ] **Step 3: Extend notification types + drafts**

In `src/systems/pirate-notifications.ts`, extend the union:

```ts
export type PirateNotificationEvent = {
  type: 'sighting' | 'raid' | 'relocated' | 'behavior-changed'
    | 'demand' | 'blockade' | 'contract-exposed' | 'destroyed'
    | 'siege' | 'city-razed';
  factionId: string;
  viewerId: string;
  amount?: number;
  cost?: number;
  cityId?: string;
  historyId?: string;
};
```

Add cases to `individualDraft` (keep them OUT of `ROUTINE_TYPES` so they render individually, not grouped):

```ts
    case 'siege':
      return {
        message: 'Pirates are besieging a coastal city! Station a unit there or sink their ships.',
        type: 'warning', review: activeReview,
        ...(event.cityId ? { linkedCityId: event.cityId } : {}),
      };
    case 'city-razed':
      return {
        message: 'A coastal city has been razed by pirates!',
        type: 'warning', review: activeReview,
        ...(event.cityId ? { linkedCityId: event.cityId } : {}),
      };
```

- [ ] **Step 4: Route the new events + audio cue in pirate-system**

In `src/systems/pirate-system.ts`, find the loop that converts `events` to `notificationEvents` (~line 805). Add `siege`/`city-razed` alongside `raid`/`blockade`:

```ts
      } else if (event.type === 'siege') {
        notificationEvents.push({ type: 'siege', factionId: event.factionId, viewerId, cityId: event.cityId });
      } else if (event.type === 'city-razed') {
        notificationEvents.push({ type: 'city-razed', factionId: event.factionId, viewerId, cityId: event.cityId });
      }
```

And in the `pirate:audio-cue` emit filter (~line 816), add the new cue types:

```ts
    if (event.type === 'sighting' || event.type === 'raid' || event.type === 'blockade'
        || event.type === 'contract-exposed' || event.type === 'siege' || event.type === 'city-razed') {
```

> Confirm the `events`/`notificationEvents` object shapes match what the surrounding code uses (some carry `civId`, some `viewerId`). Follow the existing `blockade` branch as the template — it already threads `cityId`.

- [ ] **Step 5: Civ-log handler in main.ts**

In `src/main.ts`, next to the `barbarian:city-destroyed` handler (~line 3864):

```ts
bus.on('pirate:city-destroyed', ({ cityId, ownerId }) => {
  if (!gameState.civilizations[ownerId]?.isHuman) return;
  const cityName = gameState.cities[cityId]?.name ?? 'A coastal city';
  appendToCivLog(ownerId, `${cityName} was razed by pirates!`, 'warning');
});
```

- [ ] **Step 6: One-time-alert regression**

In `tests/systems/pirate-siege.test.ts`, add a test that running two consecutive besieging rounds against the same city produces exactly **one** `siege` notification in the victim's log (the `emittedEventKeys` transition guard prevents a per-round spam), and that a `city-razed` notification appears when the city is destroyed.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test pirate-notifications pirate-siege`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/pirate-notifications.ts src/systems/pirate-system.ts src/main.ts tests/systems/pirate-notifications.test.ts tests/systems/pirate-siege.test.ts
git commit -m "feat(pirates): siege + city-razed notifications and civ-log (#522)"
```

---

### Task 7: Siege + city-razed SFX cues

**Files:**
- Modify: `src/audio/pirate-audio-sources.ts`
- Test: `tests/audio/pirate-audio-sources.test.ts` (or nearest existing audio coverage)

**Interfaces:**
- Produces: `audio/stinger/pirates/siege.ogg` and `audio/stinger/pirates/city-razed.ogg` in `PIRATE_AUDIO_FILES`.

- [ ] **Step 1: Write the failing test**

In the audio test file (mirror an existing assertion that a cue file is listed):

```ts
it('lists siege and city-razed pirate stingers', () => {
  expect(PIRATE_AUDIO_FILES).toContain('audio/stinger/pirates/siege.ogg');
  expect(PIRATE_AUDIO_FILES).toContain('audio/stinger/pirates/city-razed.ogg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test pirate-audio`
Expected: FAIL.

- [ ] **Step 3: Add the cues**

In `src/audio/pirate-audio-sources.ts`, extend the stinger list:

```ts
  ...['sighting', 'raid', 'blockade', 'tribute', 'contract-accepted', 'contract-exposed', 'siege', 'city-razed']
    .map(cue => `audio/stinger/pirates/${cue}.ogg`),
```

> If the repo requires the OGG asset to physically exist (check whether an existing audio test asserts file presence on disk), add placeholder OGGs following the convention in `project_ffmpeg_pending`/`docs` — a wired placeholder, not a missing file. If tests only assert the manifest list, the string entry is sufficient for this MR.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test pirate-audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/pirate-audio-sources.ts tests/audio/pirate-audio-sources.test.ts
git commit -m "feat(audio): siege + city-razed pirate stingers (#522)"
```

---

### Task 8: On-map under-siege badge

**Files:**
- Modify: `src/renderer/city-renderer.ts` (badge draw)
- Test: `tests/renderer/city-renderer.test.ts` (or nearest existing city-render test)

**Interfaces:**
- Consumes: `isCityHpRegenerating` / an "under siege" predicate (a city is under siege when `hp < 100` and not regenerating). Reuse the same predicate the city panel uses (`isCityHpRegenerating` from `@/systems/city-siege-system`) so map and panel never disagree.

- [ ] **Step 1: Write the failing test**

In the city-renderer test file, add a test that a city with `hp < 100` and an adjacent hostile pirate ship draws the under-siege badge, and a full-HP city does not. If the renderer is canvas-based and hard to assert pixel output, assert the badge-decision helper instead — extract a pure `shouldDrawSiegeBadge(state, city): boolean` and test that:

```ts
import { shouldDrawSiegeBadge } from '@/renderer/city-renderer';

it('flags an under-siege city for the on-map badge', () => {
  expect(shouldDrawSiegeBadge(siegedState, siegedState.cities['city-a']!)).toBe(true);
});
it('does not flag a full-HP city', () => {
  expect(shouldDrawSiegeBadge(healthyState, healthyState.cities['city-a']!)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-renderer`
Expected: FAIL — `shouldDrawSiegeBadge` undefined.

- [ ] **Step 3: Implement the predicate + draw**

In `src/renderer/city-renderer.ts`, add:

```ts
import { isCityHpRegenerating } from '@/systems/city-siege-system';

// A city is visibly "under siege" when it has taken damage and cannot currently regen
// (a hostile unit — barbarian or pirate — is adjacent). Shared with the city panel label.
export function shouldDrawSiegeBadge(state: GameState, city: City): boolean {
  const hp = city.hp ?? 100;
  return hp < 100 && hp > 0 && !isCityHpRegenerating(state, city);
}
```

Then, in the city draw path, when `shouldDrawSiegeBadge(state, city)` is true, draw a small crossed-swords / warning badge over the city marker (follow the existing marker-drawing conventions in this file — icon glyph or sprite, positioned at the marker corner).

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test city-renderer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/city-renderer.ts tests/renderer/city-renderer.test.ts
git commit -m "feat(renderer): on-map under-siege city badge (#522)"
```

---

### Task 9: Cross-cutting regressions — balance, save-compat, hot-seat, actor-parity

**Files:**
- Test: `tests/systems/pirate-siege.test.ts` (extend), `tests/systems/pirate-save-compat.test.ts` (or nearest save/serialization test)

- [ ] **Step 1: Balance-sampling test**

In `tests/systems/pirate-siege.test.ts`, add a sampling test: for each stage in `[3,4,5]` and a representative era, assert (a) a walled + garrisoned coastal city loses **0** HP over 5 besieging rounds (garrison blocks), and (b) an undefended, unwalled coastal city takes **more than 1 round but survives at least 2 rounds** before reaching sack/destroy at that stage's damage — i.e. no one-shot. Assert the multi-round window explicitly with the `PIRATE_SIEGE_DAMAGE` values.

- [ ] **Step 2: Save-compat test**

In the save/serialization test, construct a `PirateFactionState` **without** `blockadeStreakByCity` (simulating an old save), run it through the load/normalize path, and assert the loaded faction has `blockadeStreakByCity === {}` (or that the round processing tolerates its absence — whichever the load path guarantees). Also assert an old save with a faction whose `behavior` is `'blockading'` loads unchanged (no faction is stuck in an invalid behavior).

> If the load path does not already normalize new pirate fields, add the default in the same place other pirate-state fields are back-filled on load (grep for `PIRATE_STATE_VERSION` / the pirate migration/normalize function) and cover it here.

- [ ] **Step 3: Hot-seat once-per-round test**

Add a test that, in a state with two human civs, advancing one full round applies siege damage to a besieged city **once**, not once per human. Drive the same completed-round entrypoint the #549 regen once-per-round test uses (search `tests/` for the existing "once per round" regen assertion and mirror its structure).

- [ ] **Step 4: Actor-parity test**

Add a test that a **non-player** (AI) civ's coastal city is besieged and sacked by the same path (assert `hp` drops / `city:sacked` fires with `source: 'pirate'` for an AI-owned city), and — critically — that an AI civ's **last** city is sacked, not destroyed, so pirates never eliminate a civ.

- [ ] **Step 5: Run the full suite + build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS (all suites).
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 (tsc clean).

- [ ] **Step 6: Commit**

```bash
git add tests/systems/pirate-siege.test.ts tests/systems/pirate-save-compat.test.ts
git commit -m "test(pirates): balance, save-compat, hot-seat, actor-parity siege regressions (#522)"
```

---

## Known edges & follow-ups (not bugs to fix in this MR)

- **Repeated-sack economic drain on a garrison-less last city.** Because the last-city
  guard floors HP at 1 and never destroys, a besieging fleet parked on a player's (or AI's)
  last coastal city with **no garrison** re-sacks it every round (−15% gold each time),
  pinning it at 1 HP indefinitely. This is pre-existing #549 sack behavior, not new to
  pirates, but pirates make a coastal capital reachable. **Counterplay is cheap and taught:**
  one land unit garrisoned in the city fully blocks it, or sink the fleet. Acceptable for
  this MR; if playtesting shows it feels punishing, a follow-up can add a short "recently
  sacked" gold-loss cooldown in `resolveCitySiegeDamage` (a new field, applied to both
  raider paths). Flagged so it is a conscious choice, not an oversight.
- **AI does not actively relieve a besieged city** (see spec §6) — bounded by the last-city
  guard; a lightweight AI garrison-priority is a reasonable separate issue.

## Self-Review

**Spec coverage:**
- §1 besieging tier → Task 1 ✓
- §2 blockade-first streak → Task 4 (state) + Task 5 (gate via `derivePirateSieges`) ✓
- §3 siege resolution (garrison/walls/sack-destroy/damage table) → Task 5, reusing helper fixed in Tasks 2–3 ✓
- §3a Fix A (flat bonuses) → Task 2 ✓; Fix B (last-city) → Task 3 ✓
- §4 counterplay (garrison block, sink fleet → regen, break blockade, de-escalate) → covered by helper behavior + streak reset (Task 4) + regen already in #549; tested in Tasks 5 & 9 ✓
- §5 visibility (siege alert, city:sacked source:pirate, city-razed + pirate:city-destroyed, on-map badge) → Tasks 5, 6, 8 ✓
- §5a SFX → Task 7 ✓
- §6 guards/difficulty/AI-scope → last-city guard (Task 3), difficulty via existing knob (no code), AI-defense out of scope (no code) ✓
- §7 testing (all bullets) → Tasks 2,3,5,6,8,9 ✓

**Placeholder scan:** The `siegeReadyState`/`makeStateWithPirateFaction`/`makeSiegeInput`/`makeNotifState` fixtures are described by their required shape and defer to existing suite helpers — acceptable because every referenced field is concrete and named; the implementer wires them to the file's existing fixture style. No "TBD"/"handle edge cases"/"add validation" placeholders remain.

**Type consistency:** `PirateBehavior` gains `'besieging'` (Task 1) and every `Record<PirateBehavior>` map is updated in the same task. `CitySiegeInput.isOwnersLastCity?` (Task 3) is optional so existing direct-construction tests still compile. `derivePirateSieges(state, blockades)` and `applyBlockadeStreaks(state, blockades)` both take the `PirateBlockade[]` produced by `derivePirateBlockades`. `PirateSiege`/`PirateNotificationEvent`/`'pirate:city-destroyed'` names are consistent across Tasks 5–8.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-11-pirate-naval-siege.md`.

**This project's CLAUDE.md forbids subagents**, so execution is **inline** via superpowers:executing-plans — batch execution with a review checkpoint after each task's commit.
