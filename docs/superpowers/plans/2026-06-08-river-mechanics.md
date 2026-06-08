# River Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire two missing river gameplay mechanics: a tech-gated production bonus for river farms, and a tech-gated movement cost for crossing river edges.

**Architecture:** Feature 1 is a pure yield-calculation change in `city-work-system.ts` — read the tile owner's completed techs to conditionally add +1 production. Feature 2 adds an inline river-edge check in the movement-cost loop in `unit-movement-system.ts`, using the already-in-scope `completedTechs` and a new `bridge-building` tech in `tech-definitions.ts`.

**Tech Stack:** TypeScript, Vitest (TDD throughout)

**Decisions already confirmed with user:**
- Feature 1 gate: `irrigation` (era 2, economy track)
- Feature 2 gate: new `bridge-building` tech (to be added to exploration track)

**Known limitation — pathfinding does not account for river edge costs:** `findPath` in `unit-system.ts` uses per-tile terrain costs only. It cannot see river-edge costs. On multi-step paths that cross multiple rivers without bridge-building, the pathfinder will estimate a lower cost than the validator charges, causing an opaque "insufficient-movement" failure. This is acceptable for a first implementation — single-step forced march covers the common case — but is a follow-up improvement item.

**Pre-existing inconsistency (do not fix here):** `irrigation.unlocks` already contains `'Farms yield +1 food'`, but that food bonus on river farms is currently ungated in the code (always active). This plan adds `'River farms yield +1 production'` to the same `unlocks` array and gates it correctly. Leave the food-bonus wiring inconsistency for a separate cleanup.

---

## File Map

| File | Change |
|------|--------|
| `src/systems/city-work-system.ts` | Add irrigation-gated +1 production on river farms |
| `src/systems/tech-definitions.ts` | (1) Add `'River farms yield +1 production'` to `irrigation.unlocks`; (2) Add `bridge-building` tech |
| `src/systems/unit-movement-system.ts` | Add river-edge cost (+1) in the step-cost loop; import `isRiverBetween` |
| `tests/systems/city-work-system.test.ts` | New `describe('river production bonus')` tests |
| `tests/systems/unit-movement-system.test.ts` | New `describe('river crossing movement cost')` tests |

---

## Task 1: Failing tests — river production bonus

**Files:**
- Modify: `tests/systems/city-work-system.test.ts`

- [ ] **Step 1: Add the failing test suite**

Append to `tests/systems/city-work-system.test.ts` (after the existing `describe` blocks):

```typescript
describe('river production bonus', () => {
  function riverFarmState(completedTechs: string[]): { state: GameState; coord: HexCoord } {
    const state = createNewGame(undefined, 'river-prod');
    const coord: HexCoord = { q: 5, r: 5 };
    state.map.tiles[hexKey(coord)] = {
      coord,
      terrain: 'grassland',
      elevation: 'lowland',
      resource: null,
      improvement: 'farm',
      improvementTurnsLeft: 0,
      owner: 'player',
      hasRiver: true,
      wonder: null,
    };
    state.civilizations['player'].techState.completed = completedTechs;
    return { state, coord };
  }

  it('gives no production bonus without irrigation tech', () => {
    const { state, coord } = riverFarmState([]);
    expect(calculateWorkedTileYield(state, coord).production).toBe(0);
  });

  it('gives +1 production on a river farm with irrigation tech', () => {
    const { state, coord } = riverFarmState(['irrigation']);
    expect(calculateWorkedTileYield(state, coord).production).toBe(1);
  });

  it('gives no river production bonus on a non-farm river tile even with irrigation', () => {
    const { state, coord } = riverFarmState(['irrigation']);
    state.map.tiles[hexKey(coord)]!.improvement = 'none';
    expect(calculateWorkedTileYield(state, coord).production).toBe(0);
  });

  it('gives no production bonus when farm is not yet complete (improvementTurnsLeft > 0)', () => {
    const { state, coord } = riverFarmState(['irrigation']);
    state.map.tiles[hexKey(coord)]!.improvementTurnsLeft = 2;
    expect(calculateWorkedTileYield(state, coord).production).toBe(0);
  });
});
```

Note: `createNewGame` and `calculateWorkedTileYield` are already imported in this file; `GameState` and `HexCoord` types are already imported; `hexKey` is already imported.

- [ ] **Step 2: Run test to confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-work-system.test.ts
```

Expected: The "gives +1 production with irrigation tech" test fails. The other three may pass (production is 0 before the feature is added). Confirm at least 1 new failure.

---

## Task 2: Implement river production bonus

**Files:**
- Modify: `src/systems/city-work-system.ts:36-78`

- [ ] **Step 1: Add the tech-gated production bonus**

In `calculateWorkedTileYield`, replace the river block at lines 45–50:

```typescript
// BEFORE (lines 45-50):
  if (tile.hasRiver) {
    total.gold += 1;
    if (tile.improvement === 'farm' && tile.improvementTurnsLeft === 0) {
      total.food += 1;
    }
  }
```

```typescript
// AFTER:
  const completedTechs = tile.owner != null
    ? (state.civilizations[tile.owner]?.techState.completed ?? [])
    : [];

  if (tile.hasRiver) {
    total.gold += 1;
    if (tile.improvement === 'farm' && tile.improvementTurnsLeft === 0) {
      total.food += 1;
      if (completedTechs.includes('irrigation')) {
        total.production += 1;
      }
    }
  }
```

No new imports needed — `state: GameState` already includes `civilizations`.

- [ ] **Step 2: Run tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-work-system.test.ts
```

Expected: All tests in the file pass.

---

## Task 3: Update irrigation.unlocks text in tech-definitions.ts

**Files:**
- Modify: `src/systems/tech-definitions.ts:18`

- [ ] **Step 1: Add effect text to irrigation.unlocks**

Find the `irrigation` tech entry (line 18) and update its `unlocks` array:

```typescript
// BEFORE:
  { id: 'irrigation', name: 'Irrigation', track: 'economy', cost: 45, prerequisites: ['pottery'], unlocks: ['Farms yield +1 food', 'Reveal Silk resource'], era: 2 },
```

```typescript
// AFTER:
  { id: 'irrigation', name: 'Irrigation', track: 'economy', cost: 45, prerequisites: ['pottery'], unlocks: ['Farms yield +1 food', 'River farms yield +1 production', 'Reveal Silk resource'], era: 2 },
```

- [ ] **Step 2: Run full test suite and build**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Expected: All tests pass, build exits 0.

- [ ] **Step 3: Commit Feature 1**

```bash
git add src/systems/city-work-system.ts src/systems/tech-definitions.ts tests/systems/city-work-system.test.ts
git commit -m "feat(city-work): irrigation-gated +1 production on river farms"
```

---

## Task 4: Add bridge-building tech

**Files:**
- Modify: `src/systems/tech-definitions.ts`

- [ ] **Step 1: Add bridge-building to the exploration track**

In `src/systems/tech-definitions.ts`, insert the new tech into the exploration track section, after `road-building` (currently line 51):

```typescript
// After the road-building entry:
  { id: 'road-building', name: 'Road Building', track: 'exploration', cost: 50, prerequisites: ['wheel', 'pathfinding'], unlocks: ['Workers can build roads'], era: 3 },
  { id: 'bridge-building', name: 'Bridge Building', track: 'exploration', cost: 60, prerequisites: ['road-building'], unlocks: ['River crossings cost no extra movement'], era: 3 },
  { id: 'harbor-tech', name: 'Harbors', track: 'exploration', cost: 70, prerequisites: ['sailing', 'currency'], unlocks: [], unlocksBuildings: ['harbor'], era: 3 },
```

(`harbor-tech` shown for context only; only the `bridge-building` line is new.)

`bridge-building` has no `unlocksUnits` or `unlocksBuildings` — it is an effect-only tech — so the tech-unlocks-consistency tests need no additional wiring.

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: All tests pass.

---

## Task 5: Failing tests — river crossing movement cost

**Files:**
- Modify: `tests/systems/unit-movement-system.test.ts`

- [ ] **Step 1: Add the failing test suite**

Append to `tests/systems/unit-movement-system.test.ts` (inside the outer `describe('unit-movement-system')` block, after the last existing `it`):

```typescript
  describe('river crossing movement cost', () => {
    it('charges +1 MP when crossing a river without bridge-building', () => {
      const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
      mover.id = 'mover';
      // warrior has 2 MP by default; plains costs 1 + river costs 1 = 2 total → 0 remaining
      const state = movementState(mover, [
        tile({ q: 0, r: 0 }, 'plains'),
        tile({ q: 1, r: 0 }, 'plains'),
      ]);
      state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

      const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected move to succeed');
      expect(state.units.mover.movementPointsLeft).toBe(0);
    });

    it('bridge-building saves 1 MP — warrior ends with 1 MP instead of 0 after crossing', () => {
      // This test is meaningful only after the river penalty is implemented (Task 6).
      // Before implementation: both with/without bridge-building cost 1 MP (plains only).
      // After implementation: without bridge-building costs 2 MP; with bridge-building costs 1 MP.
      // The "charges +1 MP" test above is the RED/GREEN TDD gate. This test confirms removal works.
      const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
      mover.id = 'mover';
      // warrior default 2 MP; plains 1 + no river penalty (bridge-building) = 1 total → 1 remaining
      const state = movementState(mover, [
        tile({ q: 0, r: 0 }, 'plains'),
        tile({ q: 1, r: 0 }, 'plains'),
      ], { completedTechs: ['bridge-building'] });
      state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

      const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected bridge-building to allow crossing');
      expect(state.units.mover.movementPointsLeft).toBe(1);
    });

    it('forced march applies: warrior with 1 MP can still cross a river (adjacent, single step)', () => {
      // Forced march rule: distance === 1 && movementPointsLeft >= 1 && cost > movementPointsLeft
      // River crossing: cost = plains(1) + river(1) = 2 > movementPointsLeft(1), distance = 1 → forced march ✓
      const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
      mover.id = 'mover';
      mover.movementPointsLeft = 1;
      const state = movementState(mover, [
        tile({ q: 0, r: 0 }, 'plains'),
        tile({ q: 1, r: 0 }, 'plains'),
      ]);
      state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

      const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected forced march to allow 1-MP river crossing');
      expect(state.units.mover.movementPointsLeft).toBe(0);
    });

    it('naval units pay no river crossing penalty', () => {
      const galley = createUnit('galley', 'player', { q: 0, r: 0 }, mkC());
      galley.id = 'galley';
      // galley has 3 MP; coast costs 1; river edge present but domain === 'naval' → exempt
      const state = movementState(galley, [
        tile({ q: 0, r: 0 }, 'coast'),
        tile({ q: 1, r: 0 }, 'coast'),
      ]);
      state.map.rivers = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }];

      const result = executeUnitMove(state, 'galley', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected naval unit to cross without river penalty');
      expect(state.units.galley.movementPointsLeft).toBe(2); // 3 MP - 1 coast step = 2 remaining
    });

    it('no crossing cost when no river segment exists between the two tiles', () => {
      // Control case: rivers array is empty, no penalty should be charged
      const mover = createUnit('warrior', 'player', { q: 0, r: 0 }, mkC());
      mover.id = 'mover';
      mover.movementPointsLeft = 1;
      const state = movementState(mover, [
        tile({ q: 0, r: 0 }, 'plains'),
        tile({ q: 1, r: 0 }, 'plains'),
      ]);
      // state.map.rivers defaults to [] in movementState; no segment added

      const result = executeUnitMove(state, 'mover', { q: 1, r: 0 }, { actor: 'player', civId: 'player' });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected 1-MP plains move to succeed without river');
      expect(state.units.mover.movementPointsLeft).toBe(0);
    });
  });
```

- [ ] **Step 2: Run tests to confirm the TDD gate is red**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/unit-movement-system.test.ts
```

Expected results **before Task 6 implementation**:
- "charges +1 MP without bridge-building" → **FAIL** (no penalty yet: warrior costs 1 MP, ends at 1, test expects 0)
- "bridge-building saves 1 MP" → PASS (no penalty yet: warrior costs 1 MP, ends at 1, test expects 1 — this test is a regression guard, not a TDD gate)
- "forced march with 1 MP" → PASS (no penalty yet: cost = 1 = movementPointsLeft, succeeds normally, ends at 0)
- "naval units exempt" → PASS (galley costs 1 MP regardless)
- "no crossing cost when no river" → PASS (no river, no penalty, warrior costs 1 MP with 1 MP, ends at 0)

Confirm exactly 1 failure before proceeding.

---

## Task 6: Implement river crossing movement cost

**Files:**
- Modify: `src/systems/unit-movement-system.ts:1-19` (imports)
- Modify: `src/systems/unit-movement-system.ts:283-287` (cost loop)

- [ ] **Step 1: Import isRiverBetween**

Add to the imports at the top of `src/systems/unit-movement-system.ts`. Find the last existing import line and add after it:

```typescript
import { isRiverBetween } from './river-system';
```

- [ ] **Step 2: Add river-edge cost to the step loop**

Replace the cost loop at lines 283–287:

```typescript
// BEFORE:
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const stepTile = state.map.tiles[hexKey(path[i])];
    cost += stepTile ? getMovementCostForUnitInContext(unit, stepTile.terrain, { completedTechs }) : Infinity;
  }
```

```typescript
// AFTER:
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const stepTile = state.map.tiles[hexKey(path[i])];
    cost += stepTile ? getMovementCostForUnitInContext(unit, stepTile.terrain, { completedTechs }) : Infinity;
    if (
      domain !== 'naval' &&
      !completedTechs.includes('bridge-building') &&
      isRiverBetween(state.map, path[i - 1]!, path[i]!)
    ) {
      cost += 1;
    }
  }
```

`domain` is already declared at line 268 (before the loop). `completedTechs` is declared at line 255. Both are in scope. `path[i - 1]!` is safe — the loop starts at `i = 1` so `i - 1 >= 0`, and `path` always includes the start tile.

- [ ] **Step 3: Run all tests**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: All tests pass, including the full river crossing suite.

- [ ] **Step 4: Build to type-check**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: Build exits 0.

---

## Task 7: Commit and open PR

- [ ] **Step 1: Commit Feature 2**

```bash
git add src/systems/unit-movement-system.ts src/systems/tech-definitions.ts tests/systems/unit-movement-system.test.ts
git commit -m "feat(movement): river crossing costs +1 MP; bridge-building tech removes penalty"
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: river mechanics — irrigation farm bonus & river crossing cost" --body "$(cat <<'EOF'
## Summary
- River farms yield +1 production when the tile owner has completed Irrigation (era 2, economy track)
- Crossing a river edge costs +1 movement; the new Bridge Building tech (era 3, exploration track, requires Road Building) removes the penalty
- Naval units are exempt from the crossing cost (domain check)

## Wiring
- `calculateWorkedTileYield` reads `state.civilizations[tile.owner].techState.completed` to gate the farm bonus; falls back to `[]` for unowned tiles
- River edge check is inline in `validateUnitMove`'s step-cost loop using the already-in-scope `completedTechs` and `isRiverBetween` (imported from `river-system.ts`)
- `bridge-building` tech added to exploration track; no `unlocksUnits`/`unlocksBuildings` needed (effect-only)

## Known limitations
- Pathfinder (`findPath`) does not account for river edge costs — multi-step paths through multiple rivers may fail with "insufficient-movement" because the path estimator sees a lower cost than the validator charges. Single-step forced march covers the common case. This is a follow-up item.

## Test plan
- [ ] `yarn test` exits 0
- [ ] `yarn build` exits 0
- [ ] River farm with irrigation tech shows +1 production in city yield panel
- [ ] River farm without irrigation shows no production from river bonus
- [ ] Warrior crossing river edge on a fresh turn (2 MP) lands at 0 MP remaining
- [ ] Warrior with Bridge Building researched ends with 1 MP after the same crossing
- [ ] Naval unit crossing coast-to-coast with river edge pays no extra MP

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Feature 1: +1 production, gated behind irrigation, only on completed farms on river tiles
- ✅ Feature 2: +1 crossing cost, gated behind bridge-building, naval exempt
- ✅ New `bridge-building` tech: exploration track, era 3, cost 60, prereq road-building, effect-only unlocks text
- ✅ `isRiverBetween` reused from `river-system.ts` — not rewritten
- ✅ Existing `+1 gold` and `+1 food` on river tiles preserved (modification is additive)
- ✅ `getRiverDefensePenalty` untouched

**Negative tests present:**
- ✅ No irrigation tech → no production bonus
- ✅ Non-farm river tile with irrigation → no production bonus
- ✅ In-progress farm with irrigation → no production bonus
- ✅ No river segment between tiles → no crossing cost
- ✅ Naval unit → no crossing cost

**TDD gate validity:**
- ✅ "charges +1 MP without bridge-building" is genuinely RED before Task 6 (no penalty → ends at 1, test expects 0)
- ✅ "bridge-building saves 1 MP" is a regression guard, not a TDD gate — documented explicitly in the test comment
- ✅ "charges +1 production with irrigation" is RED before Task 2 (production = 0, test expects 1)

**Type consistency:**
- `completedTechs: string[]` matches everywhere it's used
- `isRiverBetween(map: GameMap, from: HexCoord, to: HexCoord): boolean` matches the signature in `river-system.ts:125`
- `path[i - 1]!` is safe — loop starts at `i = 1`
- Member access follows existing test conventions: `state.units.mover`, `state.units.galley` (dot notation)
