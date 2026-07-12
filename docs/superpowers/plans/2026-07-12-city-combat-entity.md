# City As A Combat Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this project's CLAUDE.md forbids subagents — execute inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give cities intrinsic combat strength derived from population + the existing `getCityDefenseBreakdown` (walls/Star Fort/techs), so an ungarrisoned walled city can no longer be captured for free, and give walled cities automatic ranged counter-fire against any attacker (player, barbarian, pirate) that reaches them without a garrison.

**Architecture:** Two new pure calculation functions in `city-siege-system.ts` (`getCityIntrinsicStrength`, `getCityCounterFireDamage`) plus a lightweight win/lose resolver (`resolveCityAssault`) that deliberately does *not* route through `resolveCombat`'s full unit-vs-unit machinery — a city isn't a `Unit`. Three call sites (player capture, barbarian siege, pirate siege) apply the same counter-fire formula; only the player path also gates on win/lose, since barbarian/pirate sieges are already a multi-turn `city.hp` grind that doesn't need a discrete win/lose check.

**Tech Stack:** TypeScript, Vite, Vitest. Canvas 2D renderer, EventBus, single serializable plain-object game state, DOM-based UI panels.

## Global Constraints

- **Commands:** build with `bash scripts/run-with-mise.sh yarn build` (the only path that runs `tsc`); test with `bash scripts/run-with-mise.sh yarn test`. Both must exit 0 before any push.
- **Determinism:** never `Math.random()` — every RNG draw uses a seeded generator, same pattern as `resolveCombat`'s `(rngState * 48271) % 2147483647`.
- **Immutable turn processing:** every state transform returns a new `GameState`; never mutate `state.cities[id]`, `state.units[id]`, `state.civilizations[id]` in place.
- **Spec:** `docs/superpowers/specs/2026-07-11-city-combat-entity-design.md`. Section refs (§1–§6) point there.
- **Tests mirror src:** tests live under `tests/` mirroring `src/`. Use Vitest.
- **`main.ts` has no dedicated *behavioral* unit-test file in this codebase** (confirmed — `tests/main.integration.test.ts` exists but is a static source-regex checker, not a functional test; see Task 9 Step 9). Task 10's UI change is verified via the Browser pane, not a new test file.
- **Commit** after each task's tests pass (30 000 ms timeout for `git commit`).

## File Structure

**Modify:**
- `src/systems/city-siege-system.ts` — add `getCityIntrinsicStrength`, `calculateCityAssaultStrengths`, `resolveCityAssault`, `getCityCounterFireDamage` + their constants. This file already owns the barbarian/pirate siege model; the new functions extend it rather than starting a second file.
- `src/systems/city-capture-system.ts` — new `'repelled-by-city-defense'` failure reason; integrate the new resolution into `beginMajorCityAssault`'s no-preceding-combat branch only.
- `src/core/turn-manager.ts` — barbarian counter-fire, applied after `resolveCitySiegeDamage` in the existing city-attack loop.
- `src/systems/pirate-system.ts` — pirate counter-fire, applied after `resolveCitySiegeDamage` in the existing siege loop.
- `src/input/city-assault-flow.ts` — `beginPlayerCityAssaultChoice`'s return type becomes a discriminated union instead of throwing on failure (found while tracing Task 10's UI change — a losing assault is now a real, expected outcome).
- `src/input/foreign-city-entry-flow.ts` — `beginConfirmedForeignCityEntry` propagates the same union (it currently forwards `city-assault-flow.ts`'s result under a fixed, always-success return type).
- `src/main.ts` — two existing call sites updated to handle the new union (Task 9), plus a new preview panel for the `'assault-city'` tap intent (Task 10), mirroring the existing unit-attack preview panel's exact DOM/style pattern.
- `src/ui/city-panel.ts` — defender-side defense-rating line, always shown for an owned city.
- `src/ai/ai-tactics.ts` — `rankCapture`'s scoring now weights by win probability instead of a flat `600`.

**Test files (modify/create):**
- `tests/systems/city-siege-system.test.ts`, `tests/systems/city-capture-system.test.ts`, `tests/core/turn-manager.test.ts`, `tests/systems/pirate-system.test.ts`, `tests/ai/ai-tactics.test.ts`, `tests/ui/city-panel.test.ts`, `tests/input/city-assault-flow.test.ts`, `tests/input/foreign-city-entry-flow.test.ts`.

---

### Task 1: `getCityIntrinsicStrength`

**Files:**
- Modify: `src/systems/city-siege-system.ts`
- Test: `tests/systems/city-siege-system.test.ts`

**Interfaces:**
- Produces: `CITY_BASE_STRENGTH = 5`, `CITY_STRENGTH_PER_POPULATION = 3` (exported constants); `getCityIntrinsicStrength(city: City, ownerCiv: Civilization, attackerDomain: 'land' | 'naval' | 'air'): number`.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/city-siege-system.test.ts` (the file already has `makeCityAndCiv`/`withTechs` helpers — reuse them):

```ts
import { getCityIntrinsicStrength } from '@/systems/city-siege-system';

describe('getCityIntrinsicStrength (#522)', () => {
  it('scales with population even without walls', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 1, buildings: [] });
    const low = getCityIntrinsicStrength(city, ownerCiv, 'land');
    const { city: cityB, ownerCiv: ownerCivB } = makeCityAndCiv({ population: 10, buildings: [] });
    const high = getCityIntrinsicStrength(cityB, ownerCivB, 'land');

    expect(low).toBe(5 + 1 * 3); // 8
    expect(high).toBe(5 + 10 * 3); // 35
    expect(high).toBeGreaterThan(low);
  });

  it('applies the walls multiplier on top of the population base, matching getCityDefenseBreakdown', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'] });
    // base = 5 + 4*3 = 17; walls -> x1.25 -> 21.25 -> rounds per implementation
    expect(getCityIntrinsicStrength(city, ownerCiv, 'land')).toBeCloseTo(17 * 1.25, 5);
  });

  it('applies Star Fort and Fortification Engineering flat bonuses, same as a garrisoned defender', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls', 'star_fort'] });
    const withEngineering = withTechs(ownerCiv, ['fortification-engineering']);
    const strength = getCityIntrinsicStrength(
      { ...city, buildings: ['walls', 'star_fort'] },
      withEngineering,
      'land',
    );
    // base = 17; walls -> 21.25; +star_fort(5) +fortification-engineering(5) = 31.25
    expect(strength).toBeCloseTo(17 * 1.25 + 5 + 5, 5);
  });

  it('applies Torpedo Warfare only against a naval attacker, matching getCityDefenseBreakdown', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 4, buildings: ['walls'] });
    const withTorpedo = withTechs(ownerCiv, ['torpedo-warfare']);
    const naval = getCityIntrinsicStrength(city, withTorpedo, 'naval');
    const land = getCityIntrinsicStrength(city, withTorpedo, 'land');
    expect(naval).toBeCloseTo(17 * 1.25 + 5, 5);
    expect(land).toBeCloseTo(17 * 1.25, 5);
  });

  it('handles zero population without throwing (a just-founded or fully-unrested city)', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 0, buildings: [] });
    expect(getCityIntrinsicStrength(city, ownerCiv, 'land')).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: FAIL — `getCityIntrinsicStrength is not a function` (or import error).

- [ ] **Step 3: Implement**

In `src/systems/city-siege-system.ts`, add near the top (after the existing imports, before `CitySiegeInput`):

```ts
export const CITY_BASE_STRENGTH = 5;
export const CITY_STRENGTH_PER_POPULATION = 3;

// A city's intrinsic combat strength — used both for a player's single-exchange assault
// (#522, city-capture-system.ts) and for naval/land counter-fire (below). Population
// always contributes a baseline (an unwalled city is not defenseless, just weak); walls
// and defensive techs multiply on top via the SAME getCityDefenseBreakdown a garrisoned
// defender already uses, so a city's own defense and its garrison's defense never
// diverge in formula.
export function getCityIntrinsicStrength(
  city: City,
  ownerCiv: Civilization,
  attackerDomain: 'land' | 'naval' | 'air',
): number {
  const base = CITY_BASE_STRENGTH + city.population * CITY_STRENGTH_PER_POPULATION;
  const breakdown = getCityDefenseBreakdown({
    cityBuildings: city.buildings ?? [],
    defenderCompletedTechs: ownerCiv.techState.completed ?? [],
    attackerDomain,
  });
  return base * breakdown.multiplier + breakdown.flatBonus;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-siege-system.ts tests/systems/city-siege-system.test.ts
git commit -m "feat(city-combat): add getCityIntrinsicStrength (#522)"
```

---

### Task 2: `calculateCityAssaultStrengths` + `resolveCityAssault`

**Files:**
- Modify: `src/systems/city-siege-system.ts`
- Test: `tests/systems/city-siege-system.test.ts`

**Interfaces:**
- Consumes: `getCityIntrinsicStrength` (Task 1); `UNIT_DEFINITIONS` (`@/systems/unit-system`); `getVeterancyCombatModifier` (`@/systems/combat-reward-system`); `getRiverDefensePenalty`, `isRiverBetween` (`@/systems/river-system`).
- Produces: `CityAssaultStrengthBreakdown { attackerStrength: number; intrinsicStrength: number; winProbability: number }`; `calculateCityAssaultStrengths(attacker: Unit, city: City, ownerCiv: Civilization, map: GameMap): CityAssaultStrengthBreakdown`; `resolveCityAssault(attackerStrength: number, intrinsicStrength: number, seed: number): { attackerWins: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
import { calculateCityAssaultStrengths, resolveCityAssault } from '@/systems/city-siege-system';
import { createUnit } from '@/systems/unit-system';

describe('calculateCityAssaultStrengths / resolveCityAssault (#522)', () => {
  it('computes attacker strength the same way calculateCombatStrengths does (health, veterancy, river)', () => {
    const { state, cityId } = makeGameStateWithCity();
    const city = { ...state.cities[cityId]!, population: 1, buildings: [] };
    const ownerCiv = state.civilizations.player;
    const attacker = createUnit('swordsman', 'ai-1', { q: 3, r: 2 }, state.idCounters);

    const breakdown = calculateCityAssaultStrengths(attacker, city, ownerCiv, state.map);

    // swordsman strength 25, full health, no veterancy, no river between (2,2)-(3,2) here
    expect(breakdown.attackerStrength).toBeCloseTo(25, 5);
    expect(breakdown.intrinsicStrength).toBe(8); // 5 + 1*3, no walls
    expect(breakdown.winProbability).toBeGreaterThan(0.5);
  });

  it('gives a weak attacker a low but nonzero win probability against a strong city', () => {
    const { state, cityId } = makeGameStateWithCity();
    const city = { ...state.cities[cityId]!, population: 30, buildings: ['walls', 'star_fort'] };
    const ownerCiv = withTechs(state.civilizations.player, ['fortification-engineering']);
    const attacker = createUnit('warrior', 'ai-1', { q: 3, r: 2 }, state.idCounters);

    const breakdown = calculateCityAssaultStrengths(attacker, city, ownerCiv, state.map);

    expect(breakdown.winProbability).toBeLessThan(0.5);
    expect(breakdown.winProbability).toBeGreaterThan(0);
  });

  it('resolveCityAssault is deterministic for a fixed seed', () => {
    const first = resolveCityAssault(50, 10, 12345);
    const second = resolveCityAssault(50, 10, 12345);
    expect(first).toEqual(second);
  });

  it('an overwhelming attacker wins reliably across seeds', () => {
    const results = Array.from({ length: 20 }, (_, i) => resolveCityAssault(100, 10, i).attackerWins);
    expect(results.every(Boolean)).toBe(true);
  });

  it('an overwhelmed attacker loses reliably across seeds', () => {
    const results = Array.from({ length: 20 }, (_, i) => resolveCityAssault(10, 100, i).attackerWins);
    expect(results.every(win => !win)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement**

In `src/systems/city-siege-system.ts`, add imports at the top:

```ts
import type { GameMap, Unit } from '@/core/types';
import { getVeterancyCombatModifier } from '@/systems/combat-reward-system';
import { getRiverDefensePenalty, isRiverBetween } from '@/systems/river-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
```

> `GameMap` and `Unit` may already be covered by the file's existing `import type { City, Civilization, GameState, HexCoord, Unit } from '@/core/types';` — check first and only add what's missing (`GameMap`).

Add after `getCityIntrinsicStrength`:

```ts
export interface CityAssaultStrengthBreakdown {
  attackerStrength: number;
  intrinsicStrength: number;
  winProbability: number;
}

// Mirrors calculateCombatStrengths' attacker-side formula exactly (combat-system.ts) --
// health-scaled, veterancy-modified, river-penalized -- so the odds shown to the player
// (and used by resolveCityAssault below) are computed the same way real combat odds are.
export function calculateCityAssaultStrengths(
  attacker: Unit,
  city: City,
  ownerCiv: Civilization,
  map: GameMap,
): CityAssaultStrengthBreakdown {
  const attackerDefinition = UNIT_DEFINITIONS[attacker.type];
  const riverAttackPenalty = getRiverDefensePenalty(
    isRiverBetween(map, attacker.position, city.position),
  );
  const attackerStrength = attackerDefinition.strength
    * (attacker.health / 100)
    * (1 + getVeterancyCombatModifier(attacker))
    * (1 + riverAttackPenalty);
  const intrinsicStrength = getCityIntrinsicStrength(city, ownerCiv, 'land');
  const winProbability = attackerStrength / (attackerStrength + intrinsicStrength);
  return { attackerStrength, intrinsicStrength, winProbability };
}

function seededRatio(seed: number): number {
  // Same LCG resolveCombat uses (combat-system.ts) for consistency across all
  // seeded-RNG call sites in this codebase.
  let rngState = seed;
  rngState = (rngState * 48271) % 2147483647;
  return rngState / 2147483647;
}

// Win/lose only -- deliberately does not compute damage. Damage is
// getCityCounterFireDamage's responsibility (unconditional on win/lose, applied by the
// caller) so the same formula serves the player, barbarian, and pirate paths uniformly.
export function resolveCityAssault(
  attackerStrength: number,
  intrinsicStrength: number,
  seed: number,
): { attackerWins: boolean } {
  const totalStrength = attackerStrength + intrinsicStrength;
  if (totalStrength === 0) return { attackerWins: true };
  const atkRatio = attackerStrength / totalStrength;
  const randomFactor = 0.8 + seededRatio(seed) * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));
  return { attackerWins: seededRatio(seed + 1) < adjustedRatio };
}
```

> **Why two `seededRatio` calls with different seeds (`seed`, `seed + 1`):** the first draws the ±20% randomness factor (mirrors `resolveCombat`'s `randomFactor`); the second is the actual win/lose coin-flip against the adjusted ratio. Reusing the same seed for both would correlate them in a way `resolveCombat` doesn't.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-siege-system.ts tests/systems/city-siege-system.test.ts
git commit -m "feat(city-combat): add calculateCityAssaultStrengths + resolveCityAssault (#522)"
```

---

### Task 3: `getCityCounterFireDamage`

**Files:**
- Modify: `src/systems/city-siege-system.ts`
- Test: `tests/systems/city-siege-system.test.ts`

**Interfaces:**
- Consumes: `getCityIntrinsicStrength` (Task 1).
- Produces: `getCityCounterFireDamage(city: City, ownerCiv: Civilization, attackerDomain: 'land' | 'naval' | 'air', attackerStrength: number, hasGarrison: boolean, seed: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { getCityCounterFireDamage } from '@/systems/city-siege-system';

describe('getCityCounterFireDamage (#522)', () => {
  it('is zero without walls', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 10, buildings: [] });
    expect(getCityCounterFireDamage(city, ownerCiv, 'land', 20, false, 1)).toBe(0);
  });

  it('is zero when the city has a garrison', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 10, buildings: ['walls'] });
    expect(getCityCounterFireDamage(city, ownerCiv, 'land', 20, true, 1)).toBe(0);
  });

  it('is nonzero and walls/tech-scaled otherwise', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 10, buildings: ['walls'] });
    const { city: fortifiedCity, ownerCiv: fortifiedCiv } = makeCityAndCiv({ population: 10, buildings: ['walls', 'star_fort'] });
    const base = getCityCounterFireDamage(city, ownerCiv, 'land', 20, false, 1);
    const fortified = getCityCounterFireDamage(fortifiedCity, fortifiedCiv, 'land', 20, false, 1);
    expect(base).toBeGreaterThan(0);
    expect(fortified).toBeGreaterThan(base);
  });

  it('scales inversely with attacker strength -- an overwhelming attacker takes measurably less', () => {
    const { city, ownerCiv } = makeCityAndCiv({ population: 10, buildings: ['walls'] });
    const weakAttacker = getCityCounterFireDamage(city, ownerCiv, 'land', 15, false, 1);
    const strongAttacker = getCityCounterFireDamage(city, ownerCiv, 'land', 200, false, 1);
    expect(strongAttacker).toBeLessThan(weakAttacker);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add after `resolveCityAssault`:

```ts
// Counter-fire damage to a hostile unit attacking a walled, ungarrisoned city (#522) --
// applies uniformly to player, barbarian, and pirate attackers (three call sites: this
// helper, city-capture-system.ts, turn-manager.ts, pirate-system.ts). Deliberately
// scales INVERSELY with attacker strength, mirroring resolveCombat's own
// baseDamage * (1 - adjustedRatio) counter-damage formula -- a much stronger attacker
// already takes proportionally less retaliation there; a flat fraction of intrinsic
// strength would have ignored that convention (caught in design review).
export function getCityCounterFireDamage(
  city: City,
  ownerCiv: Civilization,
  attackerDomain: 'land' | 'naval' | 'air',
  attackerStrength: number,
  hasGarrison: boolean,
  seed: number,
): number {
  if (hasGarrison) return 0;
  if (!(city.buildings ?? []).includes('walls')) return 0;

  const intrinsicStrength = getCityIntrinsicStrength(city, ownerCiv, attackerDomain);
  const totalStrength = attackerStrength + intrinsicStrength;
  if (totalStrength === 0) return 0;
  const atkRatio = attackerStrength / totalStrength;
  const randomFactor = 0.8 + seededRatio(seed) * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));
  const baseDamage = 30 + seededRatio(seed + 1) * 20; // same range as resolveCombat's baseDamage (era 3+ band)
  return Math.round(baseDamage * (1 - adjustedRatio));
}
```

> `seededRatio` is the private helper added in Task 2 — no new export needed, both functions live in the same module.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-siege-system.ts tests/systems/city-siege-system.test.ts
git commit -m "feat(city-combat): add getCityCounterFireDamage, ratio-scaled not flat (#522)"
```

---

### Task 4: Integrate into `beginMajorCityAssault`

**Files:**
- Modify: `src/systems/city-capture-system.ts:96-107` (failure reason union), `:225-250` (no-preceding-combat branch)
- Test: `tests/systems/city-capture-system.test.ts`

**Interfaces:**
- Consumes: `getCityIntrinsicStrength`, `calculateCityAssaultStrengths`, `resolveCityAssault`, `getCityCounterFireDamage`, `getCityGarrisonUnit` (all from `@/systems/city-siege-system`).
- Produces: `MajorCityAssaultFailureReason` includes `'repelled-by-city-defense'`.

- [ ] **Step 1: Fix the pre-existing flaky-test risk first**

`tests/systems/city-capture-system.test.ts`'s `makeMajorAssaultState()` fixture uses `population: 4, buildings: []` against a `swordsman` (strength 25) attacker. Under the new mechanic, intrinsic strength there is `5 + 4*3 = 17`, giving a win probability of only `25/(25+17) ≈ 0.60` — not a safe margin against the existing test's unconditional `expect(result.ok).toBe(true)`. Fix the shared fixture to keep a comfortable, effectively-guaranteed margin regardless of RNG:

Find `function makeMajorAssaultState(): GameState {` (~line 67) and change:

```ts
    const state = makeExposedCityCaptureState({
      population: 4,
      buildings: [],
    });
```

to:

```ts
    // population 1 (not 4): with the new intrinsic-strength mechanic (#522), a
    // swordsman (strength 25) needs a comfortable margin over intrinsic strength
    // (5 + population*3) so this fixture's existing unconditional-success assertions
    // stay reliable regardless of the ±20% RNG factor. Tests that specifically exercise
    // low-odds outcomes construct their own city stats instead of using this shared
    // fixture -- see the new describe block below.
    const state = makeExposedCityCaptureState({
      population: 1,
      buildings: [],
    });
```

Run: `bash scripts/run-with-mise.sh yarn test city-capture-system`
Expected: PASS (all pre-existing tests still pass; this is a fixture value change only, no assertions changed).

- [ ] **Step 2: Write the failing tests for the new resolution**

Add a new describe block to `tests/systems/city-capture-system.test.ts`:

```ts
describe('city-capture-system intrinsic defense (#522)', () => {
  function makeUndefendedWalledCityState({
    population,
    buildings,
    attackerType = 'warrior',
  }: {
    population: number;
    buildings: string[];
    attackerType?: 'warrior' | 'swordsman' | 'tank';
  }): GameState {
    const state = makeExposedCityCaptureState({ population, buildings });
    const attacker = createUnit(attackerType, 'player', { q: 0, r: 0 }, state.idCounters);
    attacker.id = 'attacker';
    attacker.movementPointsLeft = 2;
    state.units = { [attacker.id]: attacker };
    state.civilizations.player.units = [attacker.id];
    state.civilizations['ai-1'].units = [];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    state.map.tiles['0,0'].terrain = 'grassland';
    state.map.tiles['1,0'].terrain = 'grassland';
    return state;
  }

  it('captures a weakly-defended (low population, unwalled) city reliably, like today', () => {
    const state = makeUndefendedWalledCityState({ population: 1, buildings: [], attackerType: 'tank' });

    const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
  });

  it('repels a hopelessly outmatched attacker against a strongly walled, populous city', () => {
    const state = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });

    const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

    expect(result).toMatchObject({ ok: false, reason: 'repelled-by-city-defense' });
  });

  it('on repel, the attacker stays in place, takes counter-fire damage, and the action is consumed', () => {
    const state = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });
    const before = state.units.attacker!.health;

    const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(false);
    expect(result.state.units.attacker!.position).toEqual({ q: 0, r: 0 });
    expect(result.state.units.attacker!.health).toBeLessThan(before);
    expect(result.state.units.attacker!.hasActed).toBe(true);
    expect(result.state.units.attacker!.movementPointsLeft).toBe(0);
    expect(result.state.cities.athens).toBeDefined(); // still owned by defender
  });

  it('on a successful assault against walls, the attacker still takes counter-fire damage', () => {
    const state = makeUndefendedWalledCityState({ population: 1, buildings: ['walls'], attackerType: 'tank' });
    const before = state.units.attacker!.health;

    const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units.attacker!.health).toBeLessThan(before);
  });

  it('takes no counter-fire against an unwalled city even on repel (population alone can still repel)', () => {
    const state = makeUndefendedWalledCityState({ population: 30, buildings: [] }); // no walls, still very high intrinsic strength
    const before = state.units.attacker!.health;

    const result = beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'player', civId: 'player' });

    // Regardless of win/lose, no walls means zero counter-fire.
    expect(result.state.units.attacker!.health).toBe(before);
  });

  it('never double-punishes the post-garrison-defeat advance (the double-punishment fix)', () => {
    // Reuses the existing "defeated the final defender, then advances" fixture pattern.
    const state = makeMajorAssaultState();
    const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, state.idCounters);
    defender.id = 'city-defender';
    defender.health = 1;
    state.units[defender.id] = defender;
    state.civilizations['ai-1'].units.push(defender.id);
    // Make the city extremely strong so, if the double-punishment bug existed, this
    // attacker would be repelled by the SECOND (buggy) intrinsic-strength check.
    state.cities.athens = { ...state.cities.athens, population: 50, buildings: ['walls', 'star_fort'] };
    const combat = resolveCombat(state.units.attacker!, defender, state.map, 42, undefined, state.era);
    const afterCombat = applyCombatOutcomeToState(state, combat, 42).state;

    const result = beginMajorCityAssault(afterCombat, 'attacker', 'athens', {
      actor: 'ai',
      civId: 'player',
      precedingCombat: combat,
    });

    expect(result.ok).toBe(true); // proves no second intrinsic-strength check fired
    if (!result.ok) return;
    expect(result.state.units.attacker!.position).toEqual({ q: 1, r: 0 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test city-capture-system`
Expected: FAIL — `'repelled-by-city-defense'` reason doesn't exist yet, and the undefended branch always succeeds today.

- [ ] **Step 4: Implement**

In `src/systems/city-capture-system.ts`, add the import:

```ts
import {
  calculateCityAssaultStrengths,
  getCityCounterFireDamage,
  resolveCityAssault,
} from '@/systems/city-siege-system';
```

Extend the failure-reason union (~line 96):

```ts
export type MajorCityAssaultFailureReason =
  | 'missing-attacker'
  | 'missing-city'
  | 'wrong-owner'
  | 'friendly-city'
  | 'not-major-city'
  | 'not-at-war'
  | 'cannot-capture'
  | 'not-adjacent'
  | 'city-defended'
  | 'illegal-movement'
  | 'invalid-post-combat-advance'
  | 'repelled-by-city-defense';
```

Replace the no-preceding-combat `else` branch (currently ~lines 228-250):

```ts
  } else {
    if (attacker.hasActed || attacker.movementPointsLeft <= 0) {
      return assaultFailure(state, 'illegal-movement');
    }

    // Intrinsic-strength combat exchange (#522) -- ONLY for a city that was already
    // undefended before this action (no precedingCombat). A city defeated via a real
    // combat exchange against a garrison unit (the `if (options.precedingCombat)`
    // branch above) already resolved a complete, walls-boosted fight; running this
    // check again here would double-punish the same turn's action for the same city.
    const ownerCiv = state.civilizations[city.owner];
    if (ownerCiv) {
      const seed = state.turn * 7919 + attackerId.charCodeAt(0) + cityId.charCodeAt(0);
      const strengths = calculateCityAssaultStrengths(attacker, city, ownerCiv, state.map);
      const counterFireDamage = getCityCounterFireDamage(
        city,
        ownerCiv,
        'land',
        strengths.attackerStrength,
        false, // this branch is only reached when the city has no garrison (see the
               // 'city-defended' check above, which already returned for any occupied tile)
        seed,
      );
      if (counterFireDamage > 0) {
        const healthAfter = attacker.health - counterFireDamage;
        if (healthAfter <= 0) {
          const civilizations = { ...nextState.civilizations };
          civilizations[attacker.owner] = {
            ...civilizations[attacker.owner],
            units: civilizations[attacker.owner].units.filter(id => id !== attackerId),
          };
          const units = { ...nextState.units };
          delete units[attackerId];
          nextState = { ...nextState, units, civilizations };
          return assaultFailure(nextState, 'repelled-by-city-defense');
        }
        nextState.units[attackerId] = {
          ...nextState.units[attackerId],
          health: healthAfter,
        };
      }
      const assaultResult = resolveCityAssault(strengths.attackerStrength, strengths.intrinsicStrength, seed);
      if (!assaultResult.attackerWins) {
        nextState.units[attackerId] = {
          ...nextState.units[attackerId],
          hasMoved: true,
          hasActed: true,
          movementPointsLeft: 0,
        };
        return assaultFailure(nextState, 'repelled-by-city-defense');
      }
    }

    const movement = executeUnitMove(
      nextState,
      attackerId,
      city.position,
      {
        actor: options.actor,
        civId: options.civId,
        bus: options.bus,
        foreignCityEntryId: cityId,
      },
    );
    if (!movement.ok) {
      return assaultFailure(state, 'illegal-movement');
    }
    nextState.units[attackerId] = {
      ...nextState.units[attackerId],
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
    };
  }
```

> **Note the unit-death-from-counter-fire branch above.** If counter-fire alone kills the attacker (health drops to 0 before the win/lose check even runs), the assault is unconditionally a `'repelled-by-city-defense'` failure — a dead unit cannot advance into the city regardless of what `resolveCityAssault` would have said. This mirrors `pirate-actions.ts`'s `assaultPirateEnclave` (`delete units[unitId]` + filter the owner's `units` roster) — the same minimal unit-removal pattern already used elsewhere in this codebase, not a new one.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test city-capture-system`
Expected: PASS.

- [ ] **Step 6: Fix the same flaky-fixture risk in the two other test files that reach this code path**

`grep -rln "beginMajorCityAssault\|beginPlayerCityAssaultChoice\|beginConfirmedForeignCityEntry" tests/` surfaces two more files with the identical `population: 4` + weak-attacker risk: `tests/input/city-assault-flow.test.ts` (`makePlayerAssaultState`, attacker is a plain `'warrior'`, strength 10 — an *even worse* margin than Task 4 Step 1's `swordsman`) and `tests/input/foreign-city-entry-flow.test.ts` (`makeForeignCityEntryState`, same `'warrior'` + `population: 4`). Fix both now so the full suite stays green at this checkpoint; a later task (Task 9) will separately restructure these two files' *return-type handling*, which is unrelated to this fixture-flakiness fix.

In `tests/input/city-assault-flow.test.ts`, change every `makePlayerAssaultState({ population: 4 })` call to `makePlayerAssaultState({ population: 1 })`, and update the one assertion that depends on the old value:

```ts
    expect(begun.pending.occupiedPopulation).toBe(1); // was toBe(2) with population: 4
```

In `tests/input/foreign-city-entry-flow.test.ts`, change `makeForeignCityEntryState`'s city literal from `population: 4` to `population: 1`.

Run: `bash scripts/run-with-mise.sh yarn test city-assault-flow foreign-city-entry-flow`
Expected: PASS.

- [ ] **Step 7: Run the full suite one more time to catch anything else**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. If any OTHER test file calls `beginMajorCityAssault` (directly or via a wrapper) without `precedingCombat` against a city with nontrivial population/walls, it needs the same fixture adjustment as above.

- [ ] **Step 8: Commit**

```bash
git add src/systems/city-capture-system.ts tests/systems/city-capture-system.test.ts tests/input/city-assault-flow.test.ts tests/input/foreign-city-entry-flow.test.ts
git commit -m "feat(city-combat): resolve ungarrisoned city assault as a single combat exchange (#522)"
```

---

### Task 5: Barbarian counter-fire

**Files:**
- Modify: `src/core/turn-manager.ts:784-823`
- Test: `tests/core/turn-manager.test.ts`

**Interfaces:**
- Consumes: `getCityCounterFireDamage`, `UNIT_DEFINITIONS[unit.type].strength` for `attackerStrength`.

- [ ] **Step 1: Write the failing test**

Search `tests/core/turn-manager.test.ts` for an existing barbarian city-attack fixture to extend (the file already has `processTurn` integration tests per the existing barbarian-siege coverage from #549). Add:

```ts
it('applies counter-fire to a barbarian raider attacking a walled, ungarrisoned city (#522)', () => {
  const state = createNewGame(undefined, 'barbarian-counterfire', 'small');
  state.turn = 30;
  state.era = 3;
  state.barbarianCamps = {
    'camp-a': { id: 'camp-a', position: { q: 5, r: 5 }, strength: 6, spawnCooldown: 4 },
  };
  const raider = createUnit('warrior', 'barbarian', { q: 12, r: 5 }, state.idCounters);
  raider.id = 'raider';
  state.units = { raider };
  state.cities = {
    town: {
      id: 'town', owner: 'player', position: { q: 12, r: 5 }, hp: 100,
      buildings: ['walls'], population: 20,
    } as never,
  };
  state.civilizations.player.cities = ['town'];
  state.civilizations.player.units = [];
  state.opponentAI = undefined;

  const before = raider.health;
  const result = processTurn(state, new EventBus());

  expect(result.units.raider?.health ?? 0).toBeLessThan(before);
});

it('does not counter-fire when the barbarian city order is blocked by a garrison', () => {
  const state = createNewGame(undefined, 'barbarian-counterfire-blocked', 'small');
  state.turn = 30;
  state.era = 3;
  state.barbarianCamps = {
    'camp-a': { id: 'camp-a', position: { q: 5, r: 5 }, strength: 6, spawnCooldown: 4 },
  };
  const raider = createUnit('warrior', 'barbarian', { q: 12, r: 5 }, state.idCounters);
  raider.id = 'raider';
  const garrison = createUnit('warrior', 'player', { q: 12, r: 5 }, state.idCounters);
  garrison.id = 'garrison';
  state.units = { raider, garrison };
  state.cities = {
    town: {
      id: 'town', owner: 'player', position: { q: 12, r: 5 }, hp: 100,
      buildings: ['walls'], population: 20,
    } as never,
  };
  state.civilizations.player.cities = ['town'];
  state.civilizations.player.units = ['garrison'];
  state.opponentAI = undefined;

  const before = raider.health;
  const result = processTurn(state, new EventBus());

  expect(result.units.raider?.health ?? 0).toBe(before);
});
```

> Adapt the state-construction details (map size, tile terrain) to whatever this test file's existing barbarian-integration tests already establish as the minimal working fixture — check an existing `processTurn` + barbarian test above this insertion point for the exact map/state scaffolding this file expects, and reuse it rather than inventing a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test turn-manager`
Expected: FAIL — raider takes no damage today.

- [ ] **Step 3: Implement**

In `src/core/turn-manager.ts`, update the import:

```ts
import { applyCityHpRegeneration, applyCitySiegeOutcome, getCityCounterFireDamage, getCityGarrisonUnit, resolveCitySiegeDamage } from '@/systems/city-siege-system';
```

Add `import { UNIT_DEFINITIONS } from '@/systems/unit-system';` if not already imported in this file (check first with `grep -n "UNIT_DEFINITIONS" src/core/turn-manager.ts`).

In the barbarian city-attack loop (~line 784), after the `if (result.outcome === 'blocked') continue;` line:

```ts
    newState = applyCitySiegeOutcome(newState, order.cityId, result);
    if (result.outcome === 'blocked') continue;

    // Counter-fire (#522): a walled, ungarrisoned city fights back against the raider
    // that's damaging it. Reuses barbSeed the same way real barbarian combat above does.
    const attackerUnit = newState.units[order.attackerUnitId];
    if (attackerUnit) {
      const attackerStrength = UNIT_DEFINITIONS[attackerUnit.type].strength * (attackerUnit.health / 100);
      const counterFireSeed = barbSeed ^ order.attackerUnitId.charCodeAt(0) ^ 0x5a5a;
      const counterFireDamage = getCityCounterFireDamage(
        city, ownerCiv, 'land', attackerStrength, false, counterFireSeed,
      );
      if (counterFireDamage > 0) {
        const healthAfter = attackerUnit.health - counterFireDamage;
        if (healthAfter <= 0) {
          const units = { ...newState.units };
          delete units[order.attackerUnitId];
          const civilizations = { ...newState.civilizations };
          const raiderOwner = civilizations[attackerUnit.owner];
          if (raiderOwner) {
            civilizations[attackerUnit.owner] = {
              ...raiderOwner,
              units: raiderOwner.units.filter(id => id !== order.attackerUnitId),
            };
          }
          newState = { ...newState, units, civilizations };
          // barbarianHomeCampByUnitId self-prunes stale entries for dead units on the
          // next processing pass (barbarian-system.ts) -- no further cleanup needed here.
        } else {
          newState = {
            ...newState,
            units: { ...newState.units, [order.attackerUnitId]: { ...attackerUnit, health: healthAfter } },
          };
        }
      }
    }

    bus.emit('barbarian:city-attacked', { attackerUnitId: order.attackerUnitId, cityId: order.cityId, hpLost: result.hpLost });
```

> `0x5a5a` in the seed XOR just decorrelates counter-fire's randomness from the siege-damage RNG and the unit-combat RNG that also derive from `barbSeed` elsewhere in this function — arbitrary but fixed, matching the existing "derive sub-seeds by XORing a distinguishing value" convention already used for `combatSeed`.

> Barbarian `Civilization` roster note: barbarians are not tracked in `state.civilizations` (they use the special `'barbarian'` owner constant, not a real civ) — check `civilizations[attackerUnit.owner]` for `undefined` before spreading, as shown above (`if (raiderOwner)`), since a raider's "owner" may not have a `civilizations` entry at all.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test turn-manager`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/turn-manager.ts tests/core/turn-manager.test.ts
git commit -m "feat(city-combat): barbarian counter-fire from walled ungarrisoned cities (#522)"
```

---

### Task 6: Pirate counter-fire

**Files:**
- Modify: `src/systems/pirate-system.ts:789-821`
- Test: `tests/systems/pirate-system.test.ts`

**Interfaces:**
- Consumes: `getCityCounterFireDamage`; `hexDistance`/`wrappedHexDistance` (already imported in this file).

- [ ] **Step 1: Write the failing test**

This project's `tests/systems/pirate-system.test.ts` already has a `describe('pirate naval siege (#522)', ...)` block with a `siegeReadyState(cityHp)` helper (from the earlier pirate-siege MR). Add to that block:

```ts
it('applies counter-fire to a besieging ship attacking a walled, ungarrisoned city (#522)', () => {
  const state = siegeReadyState(100);
  state.cities.port = { ...state.cities.port!, buildings: ['walls'], population: 20 };

  const shipBefore = state.units['ship-a']!.health;
  const result = processPiratesForCompletedRound(state, new EventBus());

  const shipAfter = result.state.units['ship-a']?.health ?? 0;
  expect(shipAfter).toBeLessThan(shipBefore);
});

it('does not counter-fire when the besieged city has no walls', () => {
  const state = siegeReadyState(100);
  state.cities.port = { ...state.cities.port!, buildings: [], population: 20 };

  const shipBefore = state.units['ship-a']!.health;
  const result = processPiratesForCompletedRound(state, new EventBus());

  expect(result.state.units['ship-a']?.health ?? 0).toBe(shipBefore);
});
```

> `siegeReadyState` already places `'ship-a'` and `'ship-b'` adjacent to the city with a besieging faction and a streak already at the threshold (see the existing describe block) — reuse it exactly as the other tests in that block do.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test pirate-system`
Expected: FAIL — ship takes no counter-fire damage today.

- [ ] **Step 3: Implement**

In `src/systems/pirate-system.ts`, update the import:

```ts
import { applyCitySiegeOutcome, getCityCounterFireDamage, getCityGarrisonUnit, resolveCitySiegeDamage } from './city-siege-system';
```

Add `import { UNIT_DEFINITIONS } from './unit-system';` if not already present (check first).

In the siege-application loop (~line 789), after the outcome-branch `if/else` block (after the `// outcome === 'blocked' -> ...` comment, still inside the `for (const siege of derivePirateSieges(...))` loop):

```ts
    // outcome === 'blocked' -> garrison stopped it; no HP change, no alert (silent, by design).

    // Counter-fire (#522): a walled, ungarrisoned city fights back at one ship from the
    // besieging faction -- the nearest to the city, tie-broken by unit id for
    // determinism. A well-defended city can now sink a besieging ship over time.
    if (result.outcome !== 'blocked') {
      const faction = nextState.pirates?.factions[siege.factionId];
      const distanceFn = nextState.map.wrapsHorizontally
        ? (a: HexCoord, b: HexCoord) => wrappedHexDistance(a, b, nextState.map.width)
        : hexDistance;
      const targetShip = (faction?.shipIds ?? [])
        .map(id => nextState.units[id])
        .filter((unit): unit is Unit => Boolean(unit))
        .sort((a, b) => distanceFn(a.position, city.position) - distanceFn(b.position, city.position)
          || a.id.localeCompare(b.id))[0];
      if (targetShip) {
        const attackerStrength = UNIT_DEFINITIONS[targetShip.type].strength * (targetShip.health / 100);
        const counterFireSeed = (nextState.turn * 104729) ^ targetShip.id.charCodeAt(0) ^ 0x5a5a;
        const counterFireDamage = getCityCounterFireDamage(
          city, ownerCiv, 'naval', attackerStrength, false, counterFireSeed,
        );
        if (counterFireDamage > 0) {
          const healthAfter = targetShip.health - counterFireDamage;
          if (healthAfter <= 0) {
            const units = { ...nextState.units };
            delete units[targetShip.id];
            nextState = { ...nextState, units };
            // faction.shipIds self-prunes dead references on the next round's
            // normalizeRoundState pass -- no further cleanup needed here.
          } else {
            nextState = {
              ...nextState,
              units: { ...nextState.units, [targetShip.id]: { ...targetShip, health: healthAfter } },
            };
          }
        }
      }
    }
  }
```

> `HexCoord`/`Unit` types should already be covered by this file's existing `import type { CombatResult, GameState, HexCoord, Unit, UnitType } from '@/core/types';` — verify, don't duplicate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test pirate-system`
Expected: PASS.

- [ ] **Step 5: Run the full suite** (this file's siege loop is exercised by many existing tests from the prior pirate-siege MR)

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. If any existing siege test's city fixture happens to include `'walls'`, its ship-health assertions may need updating to account for the new counter-fire damage — check `grep -n "buildings.*walls" tests/systems/pirate-system.test.ts` for any siege-block fixtures that now also take counter-fire.

- [ ] **Step 6: Commit**

```bash
git add src/systems/pirate-system.ts tests/systems/pirate-system.test.ts
git commit -m "feat(city-combat): pirate counter-fire from walled ungarrisoned cities (#522)"
```

---

### Task 7: AI capture scoring

**Files:**
- Modify: `src/ai/ai-tactics.ts:375-411` (`rankCapture`)
- Test: `tests/ai/ai-tactics.test.ts`

**Interfaces:**
- Consumes: `calculateCityAssaultStrengths` (`@/systems/city-siege-system`).

- [ ] **Step 1: Write the failing test**

Add near the existing `'captures an adjacent exposed enemy city with a capture-capable unit'` test in `tests/ai/ai-tactics.test.ts`:

```ts
it('scores a low-odds capture lower than a high-odds one for the same unit (#522)', () => {
  const weakState = makeState('veteran');
  addUnit(weakState, 'captor', 'warrior', AI, { q: 0, r: 0 });
  const weakCity = addCity(weakState, 'weak-target', HUMAN, { q: 1, r: 0 });
  weakCity.population = 1;
  weakCity.buildings = [];
  const weakPlan = makePlan({ kind: 'city', id: weakCity.id, lastKnownPosition: weakCity.position }, ['captor']);
  const weakScore = rankUnitTacticalActions(context(weakState, weakPlan), 'captor')
    .find(candidate => candidate.action.kind === 'capture-city')?.score;

  const strongState = makeState('veteran');
  addUnit(strongState, 'captor', 'warrior', AI, { q: 0, r: 0 });
  const strongCity = addCity(strongState, 'strong-target', HUMAN, { q: 1, r: 0 });
  strongCity.population = 40;
  strongCity.buildings = ['walls', 'star_fort'];
  const strongPlan = makePlan({ kind: 'city', id: strongCity.id, lastKnownPosition: strongCity.position }, ['captor']);
  const strongScore = rankUnitTacticalActions(context(strongState, strongPlan), 'captor')
    .find(candidate => candidate.action.kind === 'capture-city')?.score;

  expect(weakScore).toBeDefined();
  expect(strongScore).toBeDefined();
  expect(strongScore!).toBeLessThan(weakScore!);
});

it('still offers a low-odds capture as a candidate, never refuses outright (#522)', () => {
  const state = makeState('veteran');
  addUnit(state, 'captor', 'warrior', AI, { q: 0, r: 0 });
  const city = addCity(state, 'strong-target', HUMAN, { q: 1, r: 0 });
  city.population = 50;
  city.buildings = ['walls', 'star_fort'];
  const plan = makePlan({ kind: 'city', id: city.id, lastKnownPosition: city.position }, ['captor']);

  const candidates = rankUnitTacticalActions(context(state, plan), 'captor');

  expect(candidates.some(candidate => candidate.action.kind === 'capture-city')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test ai-tactics`
Expected: FAIL — both scores are currently the flat `600`.

- [ ] **Step 3: Implement**

In `src/ai/ai-tactics.ts`, add the import:

```ts
import { calculateCityAssaultStrengths } from '@/systems/city-siege-system';
```

Replace the return of `rankCapture` (~line 407-410):

```ts
  const reachable = movementRange(context.state, context.actorId, unit)
    .some(coord => hexKey(coord) === hexKey(city.position));
  if (!reachable) return [];

  // Score by win probability (#522) -- previously a flat 600 regardless of the city's
  // walls/population, because capture was unconditionally guaranteed. Left unweighted,
  // the AI would blindly send units to die against a heavily-defended city with no way
  // to tell that apart from a free capture. Never fully excludes the action (a 0% odds
  // city still appears as a low-scoring candidate) so a cornered AI with no better
  // option still attempts it.
  const ownerCiv = context.state.civilizations[city.owner];
  const winProbability = ownerCiv
    ? calculateCityAssaultStrengths(unit, city, ownerCiv, context.state.map).winProbability
    : 1;
  return [ranked({ kind: 'capture-city', unitId: unit.id, cityId: city.id }, Math.round(winProbability * 600))];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test ai-tactics`
Expected: PASS.

- [ ] **Step 5: Run the full suite** (other AI tests may assert the exact `600` score)

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. Search `grep -n "'capture-city'.*600\|600.*capture-city" tests/ai/*.test.ts` for any test asserting the old flat score literally, and update it to compute the expected win-probability-scaled value instead (or assert `> 0` / relative ordering if the exact number isn't the point of that test).

- [ ] **Step 6: Commit**

```bash
git add src/ai/ai-tactics.ts tests/ai/ai-tactics.test.ts
git commit -m "feat(ai): weight city-capture scoring by win probability (#522)"
```

---

### Task 8: Defender-side city-panel defense rating

**Files:**
- Modify: `src/ui/city-panel.ts:648-662`
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `getCityIntrinsicStrength` (`@/systems/city-siege-system`).

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/city-panel.test.ts`'s existing `describe('city-panel HP status (#522)', ...)` block (reuse `makeWonderPanelFixture`, `createUnit` already imported there):

```ts
it('shows a static defense-rating line for every owned city, not just damaged ones (#522)', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.cities[city.id] = { ...city, hp: 100, population: 10, buildings: ['walls'] };

  const panel = createCityPanel(container, state.cities[city.id]!, state, {
    onBuild: () => {},
    onOpenWonderPanel: () => {},
    onClose: () => {},
  });

  expect(panel.textContent).toMatch(/Defense/i);
});

it('defense rating changes when walls are built', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.cities[city.id] = { ...city, hp: 100, population: 10, buildings: [] };
  const unwalledPanel = createCityPanel(container, state.cities[city.id]!, state, {
    onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
  });
  const unwalledText = unwalledPanel.textContent ?? '';

  state.cities[city.id] = { ...state.cities[city.id]!, buildings: ['walls'] };
  const walledPanel = createCityPanel(container, state.cities[city.id]!, state, {
    onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
  });
  const walledText = walledPanel.textContent ?? '';

  expect(walledText).not.toBe(unwalledText);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-panel`
Expected: FAIL — no "Defense" text exists today.

- [ ] **Step 3: Implement**

In `src/ui/city-panel.ts`, update the import (~line 39):

```ts
import { getCityIntrinsicStrength, isCityHpRegenerating } from '@/systems/city-siege-system';
```

After the existing `siegeBarHtml` block (~line 662), add:

```ts
  const ownerCivForDefense = state.civilizations[city.owner];
  const defenseRating = ownerCivForDefense
    ? Math.round(getCityIntrinsicStrength(city, ownerCivForDefense, 'land'))
    : 0;
  const defenseRatingHtml = `
    <div style="font-size:11px;opacity:0.7;margin-top:4px;">
      🛡️ Defense: ${defenseRating}
    </div>`;
```

Then find where `siegeBarHtml` is interpolated into the main `html` template literal (search for `${siegeBarHtml}` in the file) and add `${defenseRatingHtml}` immediately after it — always rendered, unlike `siegeBarHtml` which stays conditional on damage.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test city-panel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): show a city's defense rating to its owner, not just the attacker (#522)"
```

---

### Task 9: Propagate the assault-result type through the existing capture-flow call chain

**Found while writing Task 10 below, and pulled into its own task**: `beginPlayerCityAssaultChoice` (`city-assault-flow.ts`) currently throws on any failure (`if (!result.ok) throw new Error(...)`). Once `beginMajorCityAssault` can legitimately return `'repelled-by-city-defense'` (Task 4), that throw fires on every repelled assault — a real outcome, not a caller bug. This function has **three** existing consumers, all of which assume unconditional success today; all three need updating together, or the build won't compile once the return type changes (a discriminated union's `ok: false` branch has no `.pending` property, so every unguarded `begun.pending` access becomes a type error). This task fixes the plumbing only — no new UI. Task 10 adds the preview panel on top of it.

**Files:**
- Modify: `src/input/city-assault-flow.ts` — `beginPlayerCityAssaultChoice`'s return type.
- Modify: `src/input/foreign-city-entry-flow.ts` — `beginConfirmedForeignCityEntry` propagates the same union (it currently declares a fixed `{ state; pending }` return type and just forwards the inner call's result).
- Modify: `src/main.ts` — **two** existing call sites: `beginPlayerCityAssault`'s body (~line 2401) and the `'confirm-war-city'` tap-intent's `onConfirm` handler (~line 2991). Per the design spec, only the `'assault-city'` intent gets the new odds-preview UI (Task 10) — `'confirm-war-city'` keeps its existing "declare war?" confirmation panel unchanged and just needs to not crash on a repelled outcome. Extending it to also show combat odds would be additional scope beyond what was approved; not done here.
- Test: `tests/input/city-assault-flow.test.ts`, `tests/input/foreign-city-entry-flow.test.ts`.

**Interfaces:**
- Produces: `PlayerCityAssaultChoiceResult = { ok: true; state: GameState; pending: PendingCityCaptureChoice } | { ok: false; state: GameState; reason: MajorCityAssaultFailureReason }`, exported from `city-assault-flow.ts`. `beginConfirmedForeignCityEntry` returns the same union.

- [ ] **Step 1: Verify the fixture fix from Task 4 Step 6 is in place**

Task 4 Step 6 already changed both `tests/input/city-assault-flow.test.ts`'s `makePlayerAssaultState` calls and `tests/input/foreign-city-entry-flow.test.ts`'s `makeForeignCityEntryState` city literal from `population: 4` to `population: 1` (needed so the plain `'warrior'` attacker, strength 10, has a safe margin against intrinsic strength — that fixture-flakiness fix is unrelated to this task's type-propagation work, which is why it lived in Task 4 instead of being duplicated here). Confirm with:

```bash
grep -n "population: 4" tests/input/city-assault-flow.test.ts tests/input/foreign-city-entry-flow.test.ts
```

Expected: no matches. If Task 4 Step 6 was skipped or missed a call site, fix it now before proceeding — this task's remaining steps assume every `beginPlayerCityAssaultChoice`/`beginConfirmedForeignCityEntry` call in both files succeeds deterministically.

- [ ] **Step 2: Rewrite the test that asserts the old throwing behavior**

In `tests/input/city-assault-flow.test.ts`, find:

```ts
  it('rejects a city assault when war has not been declared', () => {
    const state = makePlayerAssaultState({ population: 1 });
    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];

    expect(() => beginPlayerCityAssaultChoice(
      state,
      'unit-1',
      'athens',
      new EventBus(),
    )).toThrow('Cannot begin city assault: not-at-war');
  });
```

Replace with:

```ts
  it('rejects a city assault when war has not been declared', () => {
    const state = makePlayerAssaultState({ population: 1 });
    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];

    const result = beginPlayerCityAssaultChoice(
      state,
      'unit-1',
      'athens',
      new EventBus(),
    );

    expect(result).toMatchObject({ ok: false, reason: 'not-at-war' });
  });
```

- [ ] **Step 3: Guard every other unconditional `begun.pending`/`result.pending` access in both test files**

TypeScript will not allow property access on the `ok: false` branch of a discriminated union without narrowing first — every remaining test in both files that does `beginPlayerCityAssaultChoice(...)` or `beginConfirmedForeignCityEntry(...)` and then reads `.pending` needs an `expect(result.ok).toBe(true); if (!result.ok) return;` guard immediately after the call (or, for tests using `const begun = ...`, `if (!begun.ok) throw new Error('expected success');`). Add this guard to every remaining `it(...)` in `tests/input/city-assault-flow.test.ts` (four tests still reference `begun.pending` after the fixture fix in Step 1) and both tests in `tests/input/foreign-city-entry-flow.test.ts`. Example for the first one:

```ts
  it('begins a pending player choice by moving onto a size-2 city and finalizes occupy in place', () => {
    const state = makePlayerAssaultState({ population: 1 });
    const bus = new EventBus();
    const moved = vi.fn();
    bus.on('unit:move', moved);

    const begun = beginPlayerCityAssaultChoice(
      state,
      'unit-1',
      'athens',
      bus,
    );
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const result = finalizePlayerCityAssaultChoice(begun.state, begun.pending, 'occupy', begun.state.turn);

    expect(moved).toHaveBeenCalledOnce();
    expect(begun.pending.occupiedPopulation).toBe(1);
    expect(begun.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
    expect(begun.state.units['unit-1'].movementPointsLeft).toBe(0);
    expect(result.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
    expect(result.state.units['unit-1'].movementPointsLeft).toBe(0);
    expect(result.state.cities.athens.owner).toBe('player');
  });
```

> `occupiedPopulation` is `1` here (not the pre-Task-4 fixture's old `2`) because Task 4 Step 6 already dropped the fixture population from 4 to 1 (`Math.max(1, Math.floor(population / 2))` — see `computeRazeGold`'s sibling logic in `city-capture-system.ts`). If any remaining assertion in either file still expects the old `2`, that's a sign Task 4 Step 6 was incomplete — go back and finish it rather than patching the number here.

- [ ] **Step 4: Run tests to verify they fail against the current (unfixed) source**

Run: `bash scripts/run-with-mise.sh yarn test city-assault-flow foreign-city-entry-flow`
Expected: FAIL — `beginPlayerCityAssaultChoice` still throws and returns the old shape; `result.ok` doesn't exist yet.

- [ ] **Step 5: Implement — `city-assault-flow.ts`**

Replace the whole file:

```ts
import type { EventBus } from '@/core/event-bus';
import type { CombatResult, GameState } from '@/core/types';
import {
  beginMajorCityAssault,
  resolveMajorCityCapture,
  type MajorCityAssaultFailureReason,
  type MajorCityCaptureDisposition,
  type MajorCityCaptureResult,
  type PendingMajorCityCapture,
} from '@/systems/city-capture-system';

export type PendingCityCaptureChoice = PendingMajorCityCapture;

export type PlayerCityAssaultChoiceResult =
  | { ok: true; state: GameState; pending: PendingCityCaptureChoice }
  | { ok: false; state: GameState; reason: MajorCityAssaultFailureReason };

export function shouldPromptForPlayerCityCapture(
  city: { population: number },
): boolean {
  return city.population >= 1;
}

export function beginPlayerCityAssaultChoice(
  state: GameState,
  attackerId: string,
  cityId: string,
  bus?: EventBus,
  precedingCombat?: CombatResult,
): PlayerCityAssaultChoiceResult {
  return beginMajorCityAssault(
    state,
    attackerId,
    cityId,
    {
      actor: 'player',
      civId: state.currentPlayer,
      bus,
      precedingCombat,
    },
  );
}

export function finalizePlayerCityAssaultChoice(
  state: GameState,
  pending: PendingCityCaptureChoice,
  disposition: MajorCityCaptureDisposition,
  turn: number,
  bus?: EventBus,
): MajorCityCaptureResult {
  return resolveMajorCityCapture(state, pending.cityId, state.currentPlayer, disposition, turn, bus);
}
```

- [ ] **Step 6: Implement — `foreign-city-entry-flow.ts`**

Change the return type and the final `return` statement (the war-declaration logic in the middle of the function is untouched):

```ts
import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { beginPlayerCityAssaultChoice, type PlayerCityAssaultChoiceResult } from '@/input/city-assault-flow';
import { declareWar, resolveOpponentKind } from '@/systems/diplomacy-system';

export function beginConfirmedForeignCityEntry(
  state: GameState,
  attackerId: string,
  cityId: string,
  bus?: EventBus,
): PlayerCityAssaultChoiceResult {
  const city = state.cities[cityId];
  if (!city) {
    throw new Error(`Cannot enter missing city ${cityId}`);
  }

  let nextState = state;
  const attackerCivId = state.currentPlayer;
  const defenderId = city.owner;
  const attacker = nextState.civilizations[attackerCivId];
  const defender = nextState.civilizations[defenderId];
  const alreadyAtWar = attacker?.diplomacy.atWarWith.includes(defenderId) ?? false;

  if (attacker && defender && !alreadyAtWar) {
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [attackerCivId]: {
          ...attacker,
          diplomacy: declareWar(attacker.diplomacy, defenderId, nextState.turn),
        },
        [defenderId]: {
          ...defender,
          diplomacy: declareWar(defender.diplomacy, attackerCivId, nextState.turn),
        },
      },
    };
    bus?.emit('diplomacy:war-declared', { attackerId: attackerCivId, defenderId, opponentKind: resolveOpponentKind(defenderId) });
  }

  return beginPlayerCityAssaultChoice(
    nextState,
    attackerId,
    cityId,
    bus,
  );
}
```

> `PendingCityCaptureChoice` is no longer imported here since the return type is now the shared union re-exported from `city-assault-flow.ts` — remove the old `type PendingCityCaptureChoice` import if TypeScript flags it as unused.

- [ ] **Step 7: Implement — `main.ts`'s two call sites**

First, `beginPlayerCityAssault`'s body (~line 2401), find:

```ts
  ensurePlayerWarState(city.owner);
  const begun = beginPlayerCityAssaultChoice(
    gameState,
    attackerId,
    cityId,
    bus,
    precedingCombat,
  );
  gameState = begun.state;

  pendingCityCaptureChoice = begun.pending;
```

Replace with:

```ts
  ensurePlayerWarState(city.owner);
  const begun = beginPlayerCityAssaultChoice(
    gameState,
    attackerId,
    cityId,
    bus,
    precedingCombat,
  );
  gameState = begun.state;

  if (!begun.ok) {
    showNotification(
      begun.reason === 'repelled-by-city-defense'
        ? "Your attack was repelled by the city's defenses!"
        : 'The attack could not proceed.',
      'warning',
    );
    renderLoop.setGameState(gameState);
    updateHUD();
    return 'resolved';
  }

  pendingCityCaptureChoice = begun.pending;
```

Second, the `'confirm-war-city'` tap intent's `onConfirm` handler (~line 2991), find:

```ts
          onConfirm: () => {
            const begun = beginConfirmedForeignCityEntry(gameState, selectedId, tapIntent.cityId, bus);
            gameState = begun.state;
            pendingCityCaptureChoice = begun.pending;
            const captureCity = gameState.cities[tapIntent.cityId];
            if (captureCity) {
              createCityCapturePanel(uiLayer, {
                cityName: captureCity.name,
                occupiedPopulation: begun.pending.occupiedPopulation,
                razeGold: begun.pending.razeGold,
                onOccupy: () => finalizePendingCityCaptureChoice('occupy'),
                onRaze: () => finalizePendingCityCaptureChoice('raze'),
              });
            }
            SFX.tap();
            renderLoop.setGameState(gameState);
            updateHUD();
          },
```

Replace with:

```ts
          onConfirm: () => {
            const begun = beginConfirmedForeignCityEntry(gameState, selectedId, tapIntent.cityId, bus);
            gameState = begun.state;
            if (!begun.ok) {
              showNotification(
                begun.reason === 'repelled-by-city-defense'
                  ? "Your attack was repelled by the city's defenses!"
                  : 'The attack could not proceed.',
                'warning',
              );
              renderLoop.setGameState(gameState);
              updateHUD();
              return;
            }
            pendingCityCaptureChoice = begun.pending;
            const captureCity = gameState.cities[tapIntent.cityId];
            if (captureCity) {
              createCityCapturePanel(uiLayer, {
                cityName: captureCity.name,
                occupiedPopulation: begun.pending.occupiedPopulation,
                razeGold: begun.pending.razeGold,
                onOccupy: () => finalizePendingCityCaptureChoice('occupy'),
                onRaze: () => finalizePendingCityCaptureChoice('raze'),
              });
            }
            SFX.tap();
            renderLoop.setGameState(gameState);
            updateHUD();
          },
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test city-assault-flow foreign-city-entry-flow`
Expected: PASS.

- [ ] **Step 9: Run the static-wiring integration test — verify it still matches**

`tests/main.integration.test.ts`'s `describe('shared city assault wiring', ...)` regex-matches `main.ts`'s SOURCE TEXT for the exact call-site shape `beginPlayerCityAssaultChoice(\s*gameState,\s*attackerId,\s*cityId,\s*bus,\s*precedingCombat,\s*\)` and `beginPlayerCityAssault(\s*attackerId,\s*cityAtTarget\.id,\s*attackerBonus,\s*result,\s*\)`. This plan's Step 7 edit does not change either call's argument list (only what happens with the return value, several lines below the call), so these regexes should still match. Confirm:

Run: `bash scripts/run-with-mise.sh yarn test main.integration`
Expected: PASS. If it fails, the call-site text was reformatted in a way that broke the regex — restore the exact original call-argument formatting shown in Step 7 above.

- [ ] **Step 10: Full suite + build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 — this is the step that catches any remaining unguarded `.pending` access across the codebase as a compile error, since `PlayerCityAssaultChoiceResult` is now a real discriminated union everywhere it flows.
Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/input/city-assault-flow.ts src/input/foreign-city-entry-flow.ts src/main.ts tests/input/city-assault-flow.test.ts tests/input/foreign-city-entry-flow.test.ts
git commit -m "refactor(city-combat): propagate assault-result union through the capture-flow call chain (#522)"
```

---

### Task 10: UI preview panel for `'assault-city'` tap intent

**Files:**
- Modify: `src/main.ts:2971-2982` (the `else` branch handling `tapIntent`)

**Interfaces:**
- Consumes: `calculateCityAssaultStrengths` (`@/systems/city-siege-system`); `beginPlayerCityAssault` (already defined in this file, ~line 2401, and already handles `ok: false` gracefully as of Task 9).

**No dedicated unit test** — `main.ts` has no unit-test file in this codebase for behavioral coverage (`tests/main.integration.test.ts` exists but is a static source-regex checker, not a functional test — see Task 9 Step 9). Verified via the Browser pane instead (Step 3 below).

- [ ] **Step 1: Add the import**

In `src/main.ts`, add near the other `city-siege-system` or `combat-system` imports (search `grep -n "from '@/systems/combat-system'" src/main.ts` for a nearby import block to extend):

```ts
import { calculateCityAssaultStrengths } from '@/systems/city-siege-system';
```

- [ ] **Step 2: Replace the immediate-resolve branch with a preview panel**

Find the `'assault-city'` branch (~line 2973):

```ts
      if (tapIntent.kind === 'assault-city') {
        const assaultStatus = beginPlayerCityAssault(selectedUnitId, tapIntent.cityId);
        SFX.tap();
        renderLoop.setGameState(gameState);
        updateHUD();
        if (assaultStatus === 'resolved') {
          setTimeout(() => selectNextUnit(), 400);
        }
        return;
      }
```

Replace with a preview panel mirroring the existing unit-attack preview panel's exact DOM/style pattern (raw `document.createElement`, not `createGameButton` — this file's established local convention, verified against the adjacent unit-attack branch):

```ts
      if (tapIntent.kind === 'assault-city') {
        const attackerUnit = gameState.units[selectedUnitId];
        const targetCity = gameState.cities[tapIntent.cityId];
        const ownerCiv = targetCity ? gameState.civilizations[targetCity.owner] : undefined;
        if (!attackerUnit || !targetCity || !ownerCiv) return;

        const strengths = calculateCityAssaultStrengths(attackerUnit, targetCity, ownerCiv, gameState.map);
        const atkStr = Math.round(strengths.attackerStrength);
        const cityStr = Math.round(strengths.intrinsicStrength);
        const odds = strengths.winProbability > 0.55 ? 'Favorable' : strengths.winProbability > 0.45 ? 'Even' : 'Risky';
        const oddsColor = strengths.winProbability > 0.55 ? '#6b9b4b' : strengths.winProbability > 0.45 ? '#e8c170' : '#d94a4a';

        const panel = document.getElementById('info-panel');
        if (panel) {
          panel.style.display = 'block';
          const previewDiv = document.createElement('div');
          previewDiv.style.cssText = 'background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;';

          const title = document.createElement('div');
          title.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:6px;';
          title.textContent = 'Assault Preview';
          previewDiv.appendChild(title);

          const stats = document.createElement('div');
          stats.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;';
          const atkSpan = document.createElement('span');
          atkSpan.textContent = `${UNIT_DEFINITIONS[attackerUnit.type].name} (${atkStr})`;
          const oddsSpan = document.createElement('span');
          oddsSpan.style.cssText = `color:${oddsColor};font-weight:bold;`;
          oddsSpan.textContent = odds;
          const defSpan = document.createElement('span');
          defSpan.textContent = `${targetCity.name} defenses (${cityStr})`;
          stats.appendChild(atkSpan);
          stats.appendChild(oddsSpan);
          stats.appendChild(defSpan);
          previewDiv.appendChild(stats);

          const info = document.createElement('div');
          info.style.cssText = 'font-size:10px;opacity:0.6;margin-bottom:8px;';
          info.textContent = 'A walled city fights back if it has no garrison.';
          previewDiv.appendChild(info);

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;';
          const attackBtn = document.createElement('button');
          attackBtn.id = 'btn-assault-confirm';
          attackBtn.textContent = 'Attack';
          attackBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;';
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'btn-cancel-assault';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;';
          btnRow.appendChild(attackBtn);
          btnRow.appendChild(cancelBtn);
          previewDiv.appendChild(btnRow);

          panel.innerHTML = '';
          panel.appendChild(previewDiv);

          cancelBtn.addEventListener('click', deselectUnit);
          attackBtn.addEventListener('click', () => {
            const assaultStatus = beginPlayerCityAssault(selectedUnitId, tapIntent.cityId);
            SFX.combat();
            renderLoop.setGameState(gameState);
            updateHUD();
            if (assaultStatus === 'resolved') {
              setTimeout(() => selectNextUnit(), 400);
            }
          });
        }
        return;
      }
```

> `UNIT_DEFINITIONS` should already be imported in `main.ts` (it's used extensively elsewhere) — verify with `grep -n "^import.*UNIT_DEFINITIONS" src/main.ts` rather than adding a duplicate import.

> `beginPlayerCityAssault` already shows a "repelled" notification and returns `'resolved'` on `ok: false` as of Task 9 — this task's `attackBtn` click handler needs no additional failure handling of its own.

- [ ] **Step 3: Browser verification**

Start the dev server and drive a real assault against a walled, ungarrisoned enemy city to confirm the preview renders, Attack/Cancel both work, and a repelled outcome shows the Task 9 notification instead of throwing:

```
preview_start (name: dev, or whatever this project's launch.json defines)
```

Navigate to a game state with an adjacent enemy walled city (or construct one via the in-game console / a fresh game with tech to reach walls), select an attacking unit, tap the city, confirm the preview panel appears with odds text and two buttons, click Attack, confirm either the capture-disposition panel opens (win) or a "repelled" notification appears with the unit's HP reduced (loss) — check `read_console_messages` for zero errors throughout.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): odds preview panel for city assault (#522)"
```

---

### Task 11: Cross-cutting regressions — balance sampling, hot-seat, actor parity

**Files:**
- Test: `tests/systems/city-siege-system.test.ts` (extend), `tests/systems/city-capture-system.test.ts` (extend)

- [ ] **Step 1: Balance-sampling test**

In `tests/systems/city-siege-system.test.ts`, add:

```ts
describe('city assault balance sampling (#522)', () => {
  it('an unwalled, low-population outpost reliably favors an era-appropriate attacker', () => {
    // Today this capture is 100% guaranteed; the new mechanic must not turn routine
    // early expansion into a frequent failure.
    const { city, ownerCiv } = makeCityAndCiv({ population: 1, buildings: [] });
    const attacker = createUnit('warrior', 'ai-1', { q: 3, r: 2 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
    const strengths = calculateCityAssaultStrengths(attacker, city, ownerCiv, {
      width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {},
    });
    const wins = Array.from({ length: 50 }, (_, i) => resolveCityAssault(
      strengths.attackerStrength, strengths.intrinsicStrength, i,
    ).attackerWins);
    const winRate = wins.filter(Boolean).length / wins.length;
    expect(winRate).toBeGreaterThan(0.9);
  });

  it('a walled, high-population, fully-teched city meaningfully raises attacker losses without being unbeatable', () => {
    const { city, ownerCiv: baseCiv } = makeCityAndCiv({ population: 20, buildings: ['walls', 'star_fort'] });
    const ownerCiv = withTechs(baseCiv, ['fortification-engineering', 'professional-army']);
    const attacker = createUnit('tank', 'ai-1', { q: 3, r: 2 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
    const strengths = calculateCityAssaultStrengths(attacker, city, ownerCiv, {
      width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {},
    });
    const wins = Array.from({ length: 50 }, (_, i) => resolveCityAssault(
      strengths.attackerStrength, strengths.intrinsicStrength, i,
    ).attackerWins);
    const winRate = wins.filter(Boolean).length / wins.length;
    // An era-appropriate strong attacker (tank) should still be capable of winning,
    // just not trivially -- not >0.95 (city offers zero real resistance) and not <0.05
    // (city becomes practically uncapturable even to a strong, teched attacker).
    expect(winRate).toBeLessThan(0.95);
    expect(winRate).toBeGreaterThan(0.05);
  });
});
```

If either bound fails, adjust `CITY_BASE_STRENGTH`/`CITY_STRENGTH_PER_POPULATION` (Task 1) — they are explicitly provisional per the spec, not fixed by this plan.

- [ ] **Step 2: Run and verify**

Run: `bash scripts/run-with-mise.sh yarn test city-siege-system`
Expected: PASS. If a bound fails, adjust the constants in `city-siege-system.ts` (Task 1) and re-run — do not weaken the test bounds to fit bad constants.

- [ ] **Step 3: Hot-seat / actor-parity test**

In `tests/systems/city-capture-system.test.ts`, add:

```ts
it('the AI-actor capture path uses the identical resolution as the player path (#522)', () => {
  const playerState = makeUndefendedWalledCityState({ population: 30, buildings: ['walls', 'star_fort'] });
  const aiState = structuredClone(playerState);

  const playerResult = beginMajorCityAssault(playerState, 'attacker', 'athens', { actor: 'player', civId: 'player' });
  const aiResult = beginMajorCityAssault(aiState, 'attacker', 'athens', { actor: 'ai', civId: 'player' });

  // Same state, same seed inputs (turn/attackerId/cityId) -> identical outcome,
  // regardless of the 'actor' field, which is purely for event/bookkeeping purposes.
  expect(playerResult.ok).toBe(aiResult.ok);
});
```

> This function is defined inside the `describe('city-capture-system intrinsic defense (#522)', ...)` block from Task 4 — add this test there, not at file scope.

- [ ] **Step 4: Run and verify**

Run: `bash scripts/run-with-mise.sh yarn test city-capture-system`
Expected: PASS.

- [ ] **Step 5: Run the full suite + build one final time**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 (tsc clean).
Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add tests/systems/city-siege-system.test.ts tests/systems/city-capture-system.test.ts
git commit -m "test(city-combat): balance sampling + actor-parity regressions (#522)"
```

---

## Self-Review

**Spec coverage:**
- §1 Intrinsic strength formula → Task 1 ✓
- §2 `resolveCityAssault` + integration (double-punishment fix) → Tasks 2, 4 ✓
- §3 `getCityCounterFireDamage` (ratio-scaled) + three call sites → Tasks 3, 4, 5, 6 ✓
- §3 SFX (no new cue, reuse `SFX.combat()`) → Task 10 (reused at the existing call site) ✓
- §4 UI preview panel + defender-side visibility → Tasks 10, 8 ✓
- §5 Scope guard: major-civ only (no code needed, `beginMajorCityAssault`'s existing `not-major-city` gate untouched), hot-seat/actor parity → Task 11 ✓, AI scoring fix → Task 7 ✓, difficulty (no new knob, no code) ✓
- §6 All testing bullets → Tasks 1, 2, 3, 4, 5, 6, 7, 8, 11 ✓

**Placeholder scan:** No TBD/TODO. The one deliberately-flagged "adapt to this file's existing fixture" note in Task 5 Step 1 names exactly what to look for (an existing `processTurn` + barbarian test) rather than leaving the shape undefined.

**Type consistency:** `getCityIntrinsicStrength(city, ownerCiv, attackerDomain)` (Task 1) is the base every other function calls through — `calculateCityAssaultStrengths` (Task 2), `getCityCounterFireDamage` (Task 3), the city-panel display (Task 8), and the AI scorer (Task 7) all call it with the same three-argument shape. `resolveCityAssault(attackerStrength, intrinsicStrength, seed)` (Task 2) and `getCityCounterFireDamage(..., attackerStrength, hasGarrison, seed)` (Task 3) both consume the `attackerStrength` number `calculateCityAssaultStrengths` produces — no call site recomputes it differently. `'repelled-by-city-defense'` (Task 4) is the one new failure reason, referenced identically through `PlayerCityAssaultChoiceResult` (Task 9) and Task 10's UI handling.

**Found during self-review, fixed by restructuring:** the original single "Task 9: UI preview panel" assumed `beginPlayerCityAssault`'s existing `throw new Error` on failure could stay as-is. Tracing the actual call chain surfaced three existing consumers of `beginPlayerCityAssaultChoice` (`city-assault-flow.ts` itself, `foreign-city-entry-flow.ts`, and two separate call sites in `main.ts`) that all assume unconditional success today, plus two existing test files (`city-assault-flow.test.ts`, `foreign-city-entry-flow.test.ts`) with the same flaky-fixture risk already found in Task 4, one of which explicitly asserts the old throwing behavior via `.toThrow(...)`. This was too large and too separable a concern to fold into the UI task silently — split into a dedicated Task 9 (type propagation + fixture/test fixes, no new UI) that Task 10 (the actual preview panel) now depends on and builds on top of.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-city-combat-entity.md`.

**This project's CLAUDE.md forbids subagents**, so execution is **inline** via superpowers:executing-plans — batch execution with a review checkpoint after each task's commit.
