# #1019 — Canonical owned-city resolution: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repository forbids subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one authoritative owned-city query surface, migrate decision-critical consumers to it, and add a narrow structural rule that prevents new roster-length ownership decisions.

**Architecture:** A new read-only module `src/systems/city-ownership.ts` exposes `getOwnedCities` and `getOwnedCityCount`, both filtering `state.cities` by `city.owner`. Consumers that mean "which cities does X own" migrate to these helpers; consumers that mean "capital order" or "roster maintenance" keep using `civ.cities`. A source-rule check blocks new `.cities.length` ownership decisions outside an explicit allowlist.

**Tech Stack:** TypeScript, Vitest, bash `scripts/check-src-rule-violations.sh`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/systems/city-ownership.ts` (create) | Canonical owned-city queries: `getOwnedCities`, `getOwnedCityCount`. |
| `tests/systems/city-ownership.test.ts` (create) | Unit tests for canonical queries, including corruption shapes. |
| `src/ai/ai-production.ts` (modify) | AI production candidate loop: use canonical owned cities. |
| `src/ai/ai-treasury.ts` (modify) | AI rush-buy loop: use canonical owned cities. |
| `src/systems/diplomacy-system.ts` (modify) | Vassal/overlord existence checks: use canonical count. |
| `src/systems/national-project-system.ts` (modify) | Empire city count for scaling: use canonical count. |
| `src/systems/fortification-system.ts` (modify) | Empire city count for scaling: use canonical count. |
| `src/systems/autonomy-capacity.ts` (modify) | Owned cities for autonomy capacity. |
| `src/systems/supply-sources.ts` (modify) | Owned stabilized cities for supply. |
| `src/systems/wonder-system.ts` (modify) | Wonder effects loop: use canonical owned cities. |
| `src/systems/pirate-actions.ts` (modify) | Rival elimination check: use canonical count. |
| `src/ui/advisor-system.ts` (modify) | Advisor trigger: use canonical count. |
| `src/ui/city-overview-panel.ts` (modify) | Owned cities list. |
| `src/ui/network-panel.ts` (modify) | Owned cities list (preserve id sort). |
| `src/core/hotseat-events.ts` (modify) | Hot-seat city count summary. |
| `scripts/check-src-rule-violations.sh` (modify) | New source rule blocking `.cities.length` ownership decisions. |
| `tests/scripts/check-src-rule-violations.test.ts` (modify) | Self-test for the new source rule. |

---

### Task 1: Canonical module with TDD

**Files:**
- Create: `src/systems/city-ownership.ts`
- Create: `tests/systems/city-ownership.test.ts`

- [ ] **Step 1: Write the first failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { City, GameState } from '@/core/types';
import { getOwnedCities, getOwnedCityCount } from '@/systems/city-ownership';

function makeState(cities: Record<string, City>): GameState {
  return {
    cities,
    civilizations: {},
    minorCivs: {},
    units: {},
  } as unknown as GameState;
}

describe('city-ownership', () => {
  it('returns cities owned by a major civ', () => {
    const cityA: City = { id: 'city-a', owner: 'civ-1', name: 'Alpha', position: { q: 0, r: 0 }, population: 1, buildings: [], productionQueue: [], ownedTiles: [], workedTiles: [], unrestLevel: 0, unrestTurns: 0, maturity: 'village', focus: 'balanced', foodStored: 0, health: 100 } as unknown as City;
    const cityB: City = { id: 'city-b', owner: 'civ-2', name: 'Beta', position: { q: 1, r: 0 }, population: 1, buildings: [], productionQueue: [], ownedTiles: [], workedTiles: [], unrestLevel: 0, unrestTurns: 0, maturity: 'village', focus: 'balanced', foodStored: 0, health: 100 } as unknown as City;
    const state = makeState({ 'city-a': cityA, 'city-b': cityB });
    expect(getOwnedCities(state, 'civ-1').map(c => c.id)).toEqual(['city-a']);
    expect(getOwnedCityCount(state, 'civ-1')).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:
```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-ownership.test.ts
```
Expected: FAIL — module or function not found.

- [ ] **Step 3: Implement the canonical module**

```ts
import type { City, GameState } from '@/core/types';

export function getOwnedCities(state: GameState, ownerId: string): readonly City[] {
  return Object.values(state.cities ?? {}).filter(city => city.owner === ownerId);
}

export function getOwnedCityCount(state: GameState, ownerId: string): number {
  return Object.values(state.cities ?? {}).reduce(
    (count, city) => (city.owner === ownerId ? count + 1 : count),
    0,
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run:
```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-ownership.test.ts
```
Expected: PASS.

- [ ] **Step 5: Add the full corruption-shape test suite**

Append to `tests/systems/city-ownership.test.ts`:

```ts
function cityFixture(id: string, owner: string): City {
  return {
    id,
    owner,
    name: id,
    position: { q: 0, r: 0 },
    population: 1,
    buildings: [],
    productionQueue: [],
    ownedTiles: [],
    workedTiles: [],
    unrestLevel: 0,
    unrestTurns: 0,
    maturity: 'village',
    focus: 'balanced',
    foodStored: 0,
    health: 100,
  } as unknown as City;
}

describe('city-ownership corruption semantics', () => {
  it('ignores a ghost roster entry', () => {
    const city = cityFixture('city-1', 'civ-1');
    const state = {
      ...makeState({ 'city-1': city }),
      civilizations: { 'civ-1': { id: 'civ-1', cities: ['city-1', 'city-ghost'] } },
    } as unknown as GameState;
    expect(getOwnedCities(state, 'civ-1').map(c => c.id)).toEqual(['city-1']);
    expect(getOwnedCityCount(state, 'civ-1')).toBe(1);
  });

  it('ignores a rostered city owned by another civ', () => {
    const city = cityFixture('city-1', 'civ-2');
    const state = {
      ...makeState({ 'city-1': city }),
      civilizations: {
        'civ-1': { id: 'civ-1', cities: ['city-1'] },
        'civ-2': { id: 'civ-2', cities: [] },
      },
    } as unknown as GameState;
    expect(getOwnedCities(state, 'civ-1')).toEqual([]);
    expect(getOwnedCities(state, 'civ-2').map(c => c.id)).toEqual(['city-1']);
  });

  it('returns a city whose owner roster omits it', () => {
    const city = cityFixture('city-1', 'civ-1');
    const state = {
      ...makeState({ 'city-1': city }),
      civilizations: { 'civ-1': { id: 'civ-1', cities: [] } },
    } as unknown as GameState;
    expect(getOwnedCities(state, 'civ-1').map(c => c.id)).toEqual(['city-1']);
  });

  it('does not double-count duplicate roster ids', () => {
    const city = cityFixture('city-1', 'civ-1');
    const state = {
      ...makeState({ 'city-1': city }),
      civilizations: { 'civ-1': { id: 'civ-1', cities: ['city-1', 'city-1'] } },
    } as unknown as GameState;
    expect(getOwnedCityCount(state, 'civ-1')).toBe(1);
  });

  it('works for minor civs', () => {
    const city = cityFixture('city-mc', 'mc-1');
    const state = {
      ...makeState({ 'city-mc': city }),
      minorCivs: { 'mc-1': { id: 'mc-1', cityId: 'city-mc' } },
    } as unknown as GameState;
    expect(getOwnedCities(state, 'mc-1').map(c => c.id)).toEqual(['city-mc']);
    expect(getOwnedCityCount(state, 'mc-1')).toBe(1);
  });

  it('returns empty when a minor civ cityId points to a city owned by someone else', () => {
    const city = cityFixture('city-mc', 'civ-1');
    const state = {
      ...makeState({ 'city-mc': city }),
      civilizations: { 'civ-1': { id: 'civ-1', cities: ['city-mc'] } },
      minorCivs: { 'mc-1': { id: 'mc-1', cityId: 'city-mc' } },
    } as unknown as GameState;
    expect(getOwnedCities(state, 'mc-1')).toEqual([]);
  });

  it('returns empty for unsupported owners', () => {
    const city = cityFixture('city-1', 'civ-1');
    const state = makeState({ 'city-1': city });
    for (const ownerId of ['barbarian', 'pirate-1', 'beasts', 'rebels', 'crisis-force']) {
      expect(getOwnedCities(state, ownerId)).toEqual([]);
      expect(getOwnedCityCount(state, ownerId)).toBe(0);
    }
  });
});
```

- [ ] **Step 6: Run the full city-ownership test suite**

Run:
```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-ownership.test.ts
```
Expected: PASS for all cases.

- [ ] **Step 7: Commit**

```bash
git add src/systems/city-ownership.ts tests/systems/city-ownership.test.ts
git commit -m "feat(systems): canonical owned-city query surface (#1019)"
```

---

### Task 2: Migrate AI scheduling consumers

**Files:**
- Modify: `src/ai/ai-production.ts`
- Modify: `src/ai/ai-treasury.ts`
- Test: `tests/ai/ai-production.test.ts`, `tests/ai/ai-treasury.test.ts`

- [ ] **Step 1: Migrate `src/ai/ai-production.ts`**

At the top of the file, add:
```ts
import { getOwnedCities } from '@/systems/city-ownership';
```

Find the function that currently does:
```ts
return civ.cities.flatMap(cityId => {
  const city = state.cities[cityId];
  if (!city) return [];
  // ...
});
```

Replace with:
```ts
return getOwnedCities(state, civId).flatMap(city => {
  // ... existing body using city directly ...
});
```

Remove the now-unused `cityId` lookup and `if (!city) return [];` guard.

- [ ] **Step 2: Migrate `src/ai/ai-treasury.ts`**

At the top of the file, add:
```ts
import { getOwnedCities } from '@/systems/city-ownership';
```

Find:
```ts
for (const cityId of civ.cities) {
  const city = nextState.cities[cityId];
  if (!city) continue;
  // ...
}
```

Replace with:
```ts
for (const city of getOwnedCities(nextState, civId)) {
  // ... existing body using city directly ...
}
```

- [ ] **Step 3: Run AI tests**

Run:
```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ai/ai-treasury.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ai/ai-production.ts src/ai/ai-treasury.ts
git commit -m "refactor(ai): use canonical owned-city queries for scheduling (#1019)"
```

---

### Task 3: Migrate systems consumers

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Modify: `src/systems/national-project-system.ts`
- Modify: `src/systems/fortification-system.ts`
- Modify: `src/systems/autonomy-capacity.ts`
- Modify: `src/systems/supply-sources.ts`
- Modify: `src/systems/wonder-system.ts`
- Modify: `src/systems/pirate-actions.ts`

- [ ] **Step 1: Migrate `src/systems/diplomacy-system.ts`**

Import:
```ts
import { getOwnedCityCount } from './city-ownership';
```

Find the vassal validity check:
```ts
|| !Object.values(state.cities).some(city => city.owner === vassalId)
|| !Object.values(state.cities).some(city => city.owner === overlordId)) {
```

Replace with:
```ts
|| getOwnedCityCount(state, vassalId) === 0
|| getOwnedCityCount(state, overlordId) === 0) {
```

- [ ] **Step 2: Migrate `src/systems/national-project-system.ts`**

Import:
```ts
import { getOwnedCityCount } from './city-ownership';
```

Find each occurrence of:
```ts
const cityCount = Object.values(state.cities).filter(c => c.owner === civId).length;
```

Replace with:
```ts
const cityCount = getOwnedCityCount(state, civId);
```

- [ ] **Step 3: Migrate `src/systems/fortification-system.ts`**

Import:
```ts
import { getOwnedCityCount } from './city-ownership';
```

Find each occurrence of:
```ts
const cityCount = Object.values(state.cities).filter(city => city.owner === ownerId).length;
```

Replace with:
```ts
const cityCount = getOwnedCityCount(state, ownerId);
```

- [ ] **Step 4: Migrate `src/systems/autonomy-capacity.ts`**

Import:
```ts
import { getOwnedCities } from './city-ownership';
```

Find:
```ts
const cities = Object.values(state.cities).filter(city => city.owner === civId);
```

Replace with:
```ts
const cities = getOwnedCities(state, civId);
```

- [ ] **Step 5: Migrate `src/systems/supply-sources.ts`**

Import:
```ts
import { getOwnedCities } from './city-ownership';
```

Find:
```ts
const cities = Object.values(state.cities).filter(city => city.owner === civId && isCityStabilized(state, city));
```

Replace with:
```ts
const cities = getOwnedCities(state, civId).filter(city => isCityStabilized(state, city));
```

- [ ] **Step 6: Migrate `src/systems/wonder-system.ts`**

Import:
```ts
import { getOwnedCities } from './city-ownership';
```

Find the loop:
```ts
for (const cityId of civ.cities) {
  const city = state.cities[cityId];
  if (!city) continue;
  // ...
}
```

Replace with:
```ts
for (const city of getOwnedCities(state, civId)) {
  // ...
}
```

- [ ] **Step 7: Migrate `src/systems/pirate-actions.ts`**

Import:
```ts
import { getOwnedCityCount } from './city-ownership';
```

Find:
```ts
if (!target.cities.some(cityId => state.cities[cityId]?.owner === targetId)) return unavailable('The selected rival has been eliminated.');
```

Replace with:
```ts
if (getOwnedCityCount(state, targetId) === 0) return unavailable('The selected rival has been eliminated.');
```

- [ ] **Step 8: Run systems tests**

Run the mirrored tests for every touched system file:
```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/diplomacy-system.test.ts tests/systems/national-project-system.test.ts tests/systems/fortification-system.test.ts tests/systems/autonomy-capacity.test.ts tests/systems/supply-sources.test.ts tests/systems/wonder-system.test.ts tests/systems/pirate-actions.test.ts
```
Expected: PASS.

If a mirrored test file does not exist for a changed system, run the smallest relevant test in the same domain directory.

- [ ] **Step 9: Commit**

```bash
git add src/systems/diplomacy-system.ts src/systems/national-project-system.ts src/systems/fortification-system.ts src/systems/autonomy-capacity.ts src/systems/supply-sources.ts src/systems/wonder-system.ts src/systems/pirate-actions.ts
git commit -m "refactor(systems): use canonical owned-city queries for decision logic (#1019)"
```

---

### Task 4: Migrate UI consumers

**Files:**
- Modify: `src/ui/advisor-system.ts`
- Modify: `src/ui/city-overview-panel.ts`
- Modify: `src/ui/network-panel.ts`
- Modify: `src/core/hotseat-events.ts`

- [ ] **Step 1: Migrate `src/ui/advisor-system.ts`**

Import:
```ts
import { getOwnedCityCount } from '@/systems/city-ownership';
```

Find each advisor trigger of the form:
```ts
trigger: (state) => Object.values(state.cities).some(c => c.owner === state.currentPlayer),
```

Replace with:
```ts
trigger: (state) => getOwnedCityCount(state, state.currentPlayer) > 0,
```

- [ ] **Step 2: Migrate `src/ui/city-overview-panel.ts`**

Import:
```ts
import { getOwnedCities } from '@/systems/city-ownership';
```

Find:
```ts
return Object.values(state.cities).filter(c => c.owner === state.currentPlayer);
```

Replace with:
```ts
return getOwnedCities(state, state.currentPlayer);
```

- [ ] **Step 3: Migrate `src/ui/network-panel.ts`**

Import:
```ts
import { getOwnedCities } from '@/systems/city-ownership';
```

Find:
```ts
const ownedCities = Object.values(state.cities).filter(candidate => candidate.owner === civId).sort((a, b) => a.id.localeCompare(b.id));
```

Replace with:
```ts
const ownedCities = getOwnedCities(state, civId).slice().sort((a, b) => a.id.localeCompare(b.id));
```

- [ ] **Step 4: Migrate `src/core/hotseat-events.ts`**

Import:
```ts
import { getOwnedCityCount } from '@/systems/city-ownership';
```

Find:
```ts
cities: civ?.cities.length ?? 0,
```

Replace with:
```ts
cities: civ ? getOwnedCityCount(state, civId) : 0,
```

Ensure `civId` is in scope; if not, derive it from the loop variable.

- [ ] **Step 5: Run UI / core tests**

Run the mirrored tests for the changed files:
```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/advisor-system.test.ts tests/ui/city-overview-panel.test.ts tests/ui/network-panel.test.ts tests/core/hotseat-events.test.ts
```
Expected: PASS.

If a mirrored test file does not exist, run the smallest relevant test in the same domain.

- [ ] **Step 6: Commit**

```bash
git add src/ui/advisor-system.ts src/ui/city-overview-panel.ts src/ui/network-panel.ts src/core/hotseat-events.ts
git commit -m "refactor(ui/core): use canonical owned-city queries for summaries (#1019)"
```

---

### Task 5: Add structural source rule and self-test

**Files:**
- Modify: `scripts/check-src-rule-violations.sh`
- Modify: `tests/scripts/check-src-rule-violations.test.ts`

- [ ] **Step 1: Add the `.cities.length` rule to the script**

In `scripts/check-src-rule-violations.sh`, after the existing `.cities[0]` block (around line 74), add:

```bash
  # --- canonical city ownership (#1019): decision code must not use roster length
  # as a proxy for "does this owner have cities". Use getOwnedCityCount instead.
  # Capital/ordering, roster maintenance, turn processing, serialization, and
  # the canonical ownership module are exempt.
  case "$file_path" in
    src/systems/capital-system.ts|src/systems/city-capture-system.ts|src/systems/city-founding-system.ts|src/systems/civilization-elimination-system.ts|src/core/turn-manager.ts|src/systems/city-ownership.ts|src/storage/*|src/storage/**/*|src/testing/*|src/testing/**/*)
      : # sanctioned roster-maintenance/ordering/serialization uses
      ;;
    *)
      if grep -nE '\.cities\.length' "$file_path" >/dev/null; then
        lines="$(grep -nE '\.cities\.length' "$file_path" | head -5)"
        append_match_block "Roster-length ownership decision — use getOwnedCityCount(state, ownerId) instead of civ.cities.length (see src/systems/city-ownership.ts)" "$lines"
      fi
      ;;
  esac
```

- [ ] **Step 2: Add self-tests for the new rule**

In `tests/scripts/check-src-rule-violations.test.ts`, add a new describe block before the final closing brace:

```ts
  describe('#1019 canonical city ownership rule', () => {
    it('blocks a new roster-length ownership decision outside sanctioned files', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ui/rogue-panel.ts',
        [
          'export function isEliminated(civ: { cities: string[] }): boolean {',
          '  return civ.cities.length === 0;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/ui/rogue-panel.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Roster-length ownership decision');
      expect(result.stderr).toContain('getOwnedCityCount');
    });

    it('allows roster-length reads inside turn-manager (ordered processing)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/core/turn-manager.ts',
        'const cityCount = civ.cities.length;\n',
      );

      const result = runScript(workspace, 'src/core/turn-manager.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('allows roster-length reads inside city-capture-system (roster maintenance)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/city-capture-system.ts',
        'const remaining = owner.cities.length;\n',
      );

      const result = runScript(workspace, 'src/systems/city-capture-system.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });
```

- [ ] **Step 3: Run the source-rule tests**

Run:
```bash
./scripts/run-with-mise.sh yarn test --run tests/scripts/check-src-rule-violations.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-src-rule-violations.sh tests/scripts/check-src-rule-violations.test.ts
git commit -m "chore(rules): block roster-length ownership decisions (#1019)"
```

---

### Task 6: Verification

- [ ] **Step 1: Run source-rule checks on all changed `src/` files**

Run:
```bash
scripts/check-src-rule-violations.sh src/systems/city-ownership.ts src/ai/ai-production.ts src/ai/ai-treasury.ts src/systems/diplomacy-system.ts src/systems/national-project-system.ts src/systems/fortification-system.ts src/systems/autonomy-capacity.ts src/systems/supply-sources.ts src/systems/wonder-system.ts src/systems/pirate-actions.ts src/ui/advisor-system.ts src/ui/city-overview-panel.ts src/ui/network-panel.ts src/core/hotseat-events.ts
```
Expected: PASS (no violations).

- [ ] **Step 2: Run all changed-domain tests**

Run:
```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-ownership.test.ts tests/ai/ai-production.test.ts tests/ai/ai-treasury.test.ts tests/systems/diplomacy-system.test.ts tests/systems/national-project-system.test.ts tests/systems/fortification-system.test.ts tests/systems/autonomy-capacity.test.ts tests/systems/supply-sources.test.ts tests/systems/wonder-system.test.ts tests/systems/pirate-actions.test.ts tests/ui/advisor-system.test.ts tests/ui/city-overview-panel.test.ts tests/ui/network-panel.test.ts tests/core/hotseat-events.test.ts tests/scripts/check-src-rule-violations.test.ts
```
Expected: PASS.

- [ ] **Step 3: Type-check with build**

Run:
```bash
./scripts/run-with-mise.sh yarn build
```
Expected: PASS.

- [ ] **Step 4: Run the durable full suite**

Run:
```bash
./scripts/run-with-mise.sh yarn verify:pr
./scripts/run-with-mise.sh yarn verify:pr:status
```
Expected: PASS.

---

### Task 7: Adversarial pre-PR review

- [ ] **Step 1: Inspect the diff**

Run:
```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
```

Review for:
- Any consumer still using `civ.cities` where the semantic question is ownership.
- Any new `.cities.length` decision not caught by the rule.
- Capital/order semantics preserved.
- No save-shape change.
- No duplicate invariant framework.

- [ ] **Step 2: Check status and clean up**

Run:
```bash
git status
git diff --check
```
Expected: No unstaged source changes; no whitespace errors.

---

## Self-review

**Spec coverage:**
- Canonical query surface → Task 1.
- Corruption-shape semantics → Task 1 Step 5.
- Consumer migration → Tasks 2, 3, 4.
- Structural prevention → Task 5.
- Performance statement → Task 6 is verification only; performance claim is in the spec.
- No save migration → no task needed.
- Reuse of `assertCityRosters` → no new invariant task.

**Placeholder scan:** No TBD/TODO/fill-in details.

**Type consistency:** `getOwnedCities` and `getOwnedCityCount` signatures are consistent across all tasks.
