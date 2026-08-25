# #545 MR1 — Strategic Arsenal Data Model & Capacity Resolver Implementation Plan

✅ merged ([#895](https://github.com/a1flecke/conquestoria/pull/895)), 2026-08-25

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. **Do not use subagent-driven-development or
> any other subagent-dispatching approach for this repo** — this project's
> `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task
> inline in the current session. Steps use checkbox (`- [ ]`) syntax for
> tracking.

> **Spec correction folded in here:** while drafting this plan, `manhattan_project`
> was verified against `national-project-system.ts`/`city-system.ts` and found to be a
> **regular** (non-milestone) national project today — meaning it would expire at
> era 13 under the existing fade contract and silently revoke the "permanent unlock"
> this feature depends on. This plan makes it a milestone NP (Task 2), matching
> Sacred Council's exact precedent, and moves its now-disallowed `civYieldBonus` onto
> Nuclear Arsenal (Task 3) so era-10's combined production output is unchanged. See
> `docs/superpowers/specs/2026-08-25-issue-545-strategic-deterrence-design.md` §2/§3/
> Balance review for the full reasoning — this plan implements the corrected spec, not
> the original draft.

**Goal:** Build the pure backend data model for the shared per-civ strategic
arsenal: the `Civilization.strategicArsenal` field, Manhattan Project's
corrected milestone-NP definition (the permanent "can produce warheads" flag),
and a small capacity resolver (`strategic-arsenal-system.ts`) computing the
warhead-capacity ceiling live from built buildings. **No player-visible
surface lands in this MR** — no production catalog item, no UI panel, no
launch anything. This mirrors #544 MR1's shape exactly: a pure, fully-tested
resolver layer that later MRs (MR2+) build player-visible behavior on top of,
so this MR cannot introduce a dead-end button (there is no button yet).

**Architecture:** One new leaf module, `src/systems/strategic-arsenal-system.ts`,
exporting three pure functions (`hasManhattanProject`, `getStrategicArsenalCapacity`,
`getStrategicArsenal`) with zero side effects and zero UI/renderer imports —
matching this repo's existing `national-project-system.ts` shape (see
`getReservedNationalProjectKeys`/`getActiveNationalProjectsForCiv` for the
established pattern this module follows). Two existing building definitions
in `city-system.ts` change shape (Manhattan Project → milestone NP with no
yield; Nuclear Arsenal absorbs the yield Manhattan Project can no longer
carry). Capacity is never stored on `GameState` — always recomputed from
`civ.cities` → `state.cities[id].buildings`, so there is nothing to migrate,
invalidate, or drift out of sync later when a building is captured/lost or a
setting is toggled.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

## Global Constraints

- No `Math.random()` anywhere in this MR — every function here is a pure,
  deterministic query over already-resolved state.
- **This MR is difficulty-invariant by construction.** No function added here
  takes an `OpponentChallenge`/difficulty parameter or reads
  `GameState.opponentChallenge`/`Civilization.challenge` — capacity and the
  Manhattan Project unlock are identical for every difficulty, per spec Goal
  8. This is enforced structurally (the signatures below have no such
  parameter to begin with), not by a separate runtime test.
- All new fields are optional (`Civilization.strategicArsenal?: number`) —
  legacy saves load with **zero** migration writes. Absence means "no
  warheads produced yet," identical in behavior to an explicit `0`.
- **Do not gate anything in this MR behind the `superweapons` setting.** That
  setting doesn't exist until MR7 (per the design spec's phasing). This MR's
  functions are pure data queries with no gameplay effect yet — there is
  nothing for a setting to disable.
- `strategic-arsenal-system.ts` never imports from `src/ui/`, `src/renderer/`,
  or `src/ai/` — it is a pure state-query leaf module, consumed by those
  layers in later MRs, never the reverse.
- Every function this MR adds must be called by at least one real test in
  this MR (trivially true here since nothing else calls them yet — but every
  later MR that starts consuming them must import the *exact* exported names
  below, not reimplement the logic).
- Full repo test command: `bash scripts/run-with-mise.sh yarn test`. Full
  build/typecheck: `bash scripts/run-with-mise.sh yarn build`. Both must pass
  before this MR's PR, per `CLAUDE.md`.
- Design source of truth for this MR:
  `docs/superpowers/specs/2026-08-25-issue-545-strategic-deterrence-design.md`
  §1 (Arsenal abstraction), §2 (Manhattan Project), §3 (Nuclear Arsenal
  bullet), Balance review.

---

### Task 1: Add `Civilization.strategicArsenal` field

**Files:**
- Modify: `src/core/types.ts:1286-1322` (the `Civilization` interface)

**Interfaces:**
- Produces: `Civilization.strategicArsenal?: number` — read by Task 6's
  `getStrategicArsenal`.

- [x] **Step 1: Add the field**

Open `src/core/types.ts` and find the `Civilization` interface (currently
ends with `generalHistory?: GeneralHistoryEntry[];` right before its closing
brace, around line 1321). Add the new field immediately after it:

```typescript
  /** #544 MR3: every General this civ has ever spawned, alive or dead. A
   * generalDefinitionId in here is never redrawn as a candidate again
   * (contract §13: "a used General never appears again"). */
  generalHistory?: GeneralHistoryEntry[];
  /** #545: shared empire-wide warhead count. Absent (legacy saves, or a
   * civ that has never produced one) means zero — see
   * strategic-arsenal-system.ts's getStrategicArsenal. Never exceeds
   * getStrategicArsenalCapacity in normal play; MR1's capacity resolver
   * intentionally does not clamp this field itself (see spec §1's
   * "capacity is a production-eligibility gate, not a live clamp"). */
  strategicArsenal?: number;
}
```

- [x] **Step 2: Typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: succeeds (an unused optional field cannot break any existing call
site — nothing constructs a `Civilization` with exhaustive required fields
via a type error for a new optional property).

- [x] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(#545): add Civilization.strategicArsenal field"
```

---

### Task 2: Correct Manhattan Project to a milestone national project

**Files:**
- Modify: `src/systems/city-system.ts:835-844` (the `manhattan_project` building
  definition)

**Interfaces:**
- Produces: `BUILDINGS.manhattan_project` with `nationalProject: { homeEra: 10,
  milestone: true }` and no `civYieldBonus` — consumed by Task 6's
  `hasManhattanProject` (via `state.builtNationalProjects`, unchanged
  mechanism) and by `expireNationalProjects` (existing function, already
  skips any building with `nationalProject?.milestone` — see
  `src/systems/national-project-system.ts:170`).

- [x] **Step 1: Write the failing tests first**

Open `tests/systems/national-project-balance.test.ts` and find the existing
test at (approximately) line 102:

```typescript
  it('manhattan_project has single production civYieldBonus', () => {
    const np = era10NPs.find(np => np.id === 'manhattan_project');
    expect(np?.civYieldBonus).toEqual({ production: 6 });
  });
```

Replace it with:

```typescript
  it('manhattan_project is a milestone NP with no civYieldBonus (#545)', () => {
    const np = era10NPs.find(np => np.id === 'manhattan_project');
    expect(np?.nationalProject?.milestone).toBe(true);
    expect(np?.civYieldBonus).toBeUndefined();
  });
```

Open `tests/systems/era-10.test.ts` and find the existing test at
(approximately) line 117:

```typescript
  it('manhattan_project total civYieldBonus <= 9', () => {
    const np = BUILDINGS.manhattan_project;
    const total = Object.values(np.civYieldBonus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeLessThanOrEqual(9);
  });
```

Replace it with:

```typescript
  it('manhattan_project is a milestone NP: buildable with no upper era window, no civYieldBonus (#545)', () => {
    const np = BUILDINGS.manhattan_project;
    expect(np.nationalProject?.milestone).toBe(true);
    expect(np.civYieldBonus).toBeUndefined();
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test national-project-balance era-10`
Expected: FAIL — `manhattan_project`'s `nationalProject.milestone` is
currently `undefined`, not `true`, and `civYieldBonus` is currently
`{ production: 6 }`, not `undefined`.

- [x] **Step 3: Fix the building definition**

Open `src/systems/city-system.ts` and find the `manhattan_project` entry
(around line 835):

```typescript
  manhattan_project: {
    id: 'manhattan_project', name: 'Atomic Weapons Program', category: 'military',
    // Single key: production 6 ≤ 9 (era 7+ ceiling) ✓
    yields: { food: 0, production: 6, gold: 0, science: 0 }, productionCost: 310,
    description: 'Total war weapons programme. +6 production empire-wide.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 10 },
    civYieldBonus: { production: 6 },
  },
```

Replace it with:

```typescript
  manhattan_project: {
    id: 'manhattan_project', name: 'Atomic Weapons Program', category: 'military',
    // #545: milestone NP (permanent, one-time trigger) — no civYieldBonus per
    // .claude/rules/game-balance.md's "Milestone National Projects" (matches
    // sacred_council's exact pattern). The +6 production this building used to
    // carry moved to nuclear_arsenal (see that definition below) so era-10's
    // combined production total across the two buildings is unchanged.
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 310,
    description: 'One-time atomic weapons program. Permanent effect, never fades — establishes your empire\'s capacity to develop a strategic arsenal.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
    pacing: { band: 'marquee', role: 'national-project', impact: 1.6, scope: 'empire', snowball: 1.5, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 },
    uniquePerEmpire: true, nationalProject: { homeEra: 10, milestone: true },
  },
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test national-project-balance era-10`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/national-project-balance.test.ts tests/systems/era-10.test.ts
git commit -m "fix(#545): correct Manhattan Project to a milestone national project"
```

**Note on this commit in isolation:** this commit alone removes +6 production
from Manhattan Project without yet restoring it anywhere — if you run the
*full* `pacing-reference-economy.test.ts` suite against this commit by
itself (rather than the scoped test command in Step 4), it will show a real
diff. That is expected and does not need investigating at this point in the
sequence; Task 3 restores the total in the very next commit, and Task 5 is
where the full pacing gate actually gets verified. Do not treat a mid-sequence
full-suite run as a signal something is wrong here.

---

### Task 3: Move Manhattan Project's yield onto Nuclear Arsenal

**Files:**
- Modify: `src/systems/city-system.ts:748-754` (the `nuclear_arsenal` building
  definition)

**Interfaces:**
- Produces: `BUILDINGS.nuclear_arsenal.yields.production === 9` — consumed by
  no new code this MR (production math already sums `Building.yields` for
  non-NP buildings via the existing, unmodified `calculateCityYields`), but
  the change must not shift `pacing-reference-economy.test.ts`'s snapshot at
  the aggregate level (see Task 5).

- [x] **Step 1: Write the failing test**

Add a new test to `tests/systems/production-costs.test.ts` (the file that
already asserts `nuclear_arsenal`'s `resourceRequired`, per its existing test
at line 16) — add this `it` block in the same `describe` that contains that
existing assertion:

```typescript
  it('nuclear_arsenal absorbs the production Manhattan Project can no longer carry (#545)', () => {
    expect(BUILDINGS.nuclear_arsenal.yields.production).toBe(9);
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test production-costs`
Expected: FAIL — current value is `3`, not `9`.

- [x] **Step 3: Update the building definition**

Open `src/systems/city-system.ts` and find the `nuclear_arsenal` entry
(around line 748):

```typescript
  nuclear_arsenal: {
    id: 'nuclear_arsenal', name: 'Nuclear Arsenal', category: 'military',
    yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 195,
    description: 'Atomic weapon stockpile. +3 production per turn.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
    pacing: { band: 'power-spike', role: 'late-military-production', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.1, situationality: 1.1, unlockBreadth: 1 },
  },
```

Replace it with:

```typescript
  nuclear_arsenal: {
    id: 'nuclear_arsenal', name: 'Nuclear Arsenal', category: 'military',
    // #545: raised 3 -> 9, absorbing the +6 Manhattan Project can no longer
    // carry now that it's a milestone NP (Task 2) — era-10's combined
    // production total across the two buildings is unchanged, just sourced
    // from this one building instead of two.
    yields: { food: 0, production: 9, gold: 0, science: 0 }, productionCost: 195,
    description: 'Atomic weapon stockpile. +9 production per turn.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
    pacing: { band: 'power-spike', role: 'late-military-production', impact: 1.4, scope: 'city', snowball: 1.3, urgency: 1.1, situationality: 1.1, unlockBreadth: 1 },
  },
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test production-costs`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/production-costs.test.ts
git commit -m "feat(#545): move Manhattan Project's yield onto Nuclear Arsenal"
```

**Known, accepted consequence for existing saves (not a bug to fix here):**
the redistribution in Tasks 2+3 makes the *catalog's* era-10 production total
unchanged, but an individual **existing save** that already has Manhattan
Project built without also having built Nuclear Arsenal anywhere will see a
net -6 production after this patch — the compensating +6 only reaches a civ
that has actually built Nuclear Arsenal. This is an unavoidable property of
redistributing a bonus between two independently-buildable buildings (no
different in kind from any other yield-rebalance patch); it is called out
here so it's a documented, deliberate tradeoff rather than a silent surprise
discovered later. New games are unaffected in expectation — a player who
wants the production simply builds Nuclear Arsenal, same as today.

---

### Task 4: Regression test — Manhattan Project never expires

**Files:**
- Modify: `tests/systems/national-project-system.test.ts`

**Interfaces:**
- Consumes: `expireNationalProjects` (existing, `src/systems/national-project-system.ts:163`),
  `BUILDINGS.manhattan_project` (Task 2's corrected definition).

- [x] **Step 1: Write the test**

Open `tests/systems/national-project-system.test.ts`. Using the file's
existing `makeState` helper (top of the file), add a new `describe` block:

```typescript
describe('manhattan_project milestone permanence (#545)', () => {
  it('is never expired by expireNationalProjects, even many eras after homeEra', () => {
    const state = makeState({
      era: 13, // homeEra (10) + 3 -- would expire a regular NP under the fade contract
      civilizations: {
        p1: {
          id: 'p1', name: 'P1', color: '#fff', isHuman: true, civType: 'generic',
          cities: [], units: [], gold: 0, visibility: {}, score: 0,
          techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
          diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        },
      },
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 },
      },
    });

    const { state: nextState, expired } = expireNationalProjects(state);

    expect(expired).toHaveLength(0);
    expect(nextState.builtNationalProjects?.['p1:manhattan_project']).toBeDefined();
  });
});
```

- [x] **Step 2: Run the test**

Run: `bash scripts/run-with-mise.sh yarn test national-project-system`
Expected: PASS immediately — Task 2 already made `manhattan_project` a
milestone NP, and `expireNationalProjects` already skips milestone NPs
unconditionally (`src/systems/national-project-system.ts:170`, pre-existing
code from #591 MR4). This step is a **regression lock**, not new behavior —
if it fails, Task 2 was reverted or the milestone flag was lost.

- [x] **Step 3: Commit**

```bash
git add tests/systems/national-project-system.test.ts
git commit -m "test(#545): lock Manhattan Project's milestone permanence"
```

---

### Task 5: Confirm zero pacing/reference-economy regression

**Files:**
- Read-only check against: `tests/systems/pacing-audit.test.ts`,
  `tests/systems/pacing-reference-economy.test.ts`

**Interfaces:** none (verification task, no new code).

- [x] **Step 1: Run the full pacing gate**

Run: `bash scripts/run-with-mise.sh yarn test pacing-audit pacing-reference-economy`
Expected: PASS with no snapshot diff, per the design spec's Balance review
("the implementation MR must confirm — not merely assert — that
`pacing-audit.test.ts`'s full-catalog outlier gate and the reference-economy
snapshot produce zero diffs from this change").

- [x] **Step 2: If it fails**

Do not "fix" a failure by editing the reference-economy snapshot without
understanding why first — a diff here means the era-10 production total
*did* shift, which would mean Task 2/3's redistribution math was wrong (e.g.
a second building somewhere else also referenced the old `manhattan_project`
yield in a way this plan didn't anticipate). Grep for `manhattan_project`
and `nuclear_arsenal` across `src/systems/` to find the discrepancy before
touching any snapshot value. Only update a snapshot with the one-line
justification `.claude/rules/game-balance.md`'s Pacing Regression Prevention
section requires, and only after confirming the shift is the expected
same-total redistribution, not a new bug.

- [x] **Step 3: Commit (only if a snapshot update was genuinely needed)**

```bash
git add tests/systems/pacing-reference-economy.test.ts
git commit -m "test(#545): update reference-economy snapshot for Manhattan Project/Nuclear Arsenal redistribution"
```

If Step 1 passed clean, skip this commit entirely — there is nothing to
commit.

---

### Task 6: `hasManhattanProject` — the permanent capability query

**Files:**
- Create: `src/systems/strategic-arsenal-system.ts`
- Test: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Produces: `hasManhattanProject(state: GameState, civId: string): boolean` —
  consumed by Task 7's `getStrategicArsenalCapacity`, and by every later MR
  that gates arsenal-related production/UI on "can this civ build warheads."

- [x] **Step 1: Write the failing test**

Create `tests/systems/strategic-arsenal-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { hasManhattanProject } from '@/systems/strategic-arsenal-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 10,
    currentPlayer: 'p1',
    civilizations: {},
    cities: {},
    units: {},
    map: { width: 1, height: 1, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {},
    techDiscoveries: {},
    completedLegendaryWonders: {},
    legendaryWonderProjects: {},
    legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} },
    pirateState: null,
    tradeRoutes: {},
    espionage: {},
    embargoes: [],
    defensiveLeagues: [],
    gameOver: false,
    winner: null,
    settings: {} as any,
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

describe('hasManhattanProject', () => {
  it('is false when nothing has been built', () => {
    expect(hasManhattanProject(makeState(), 'p1')).toBe(false);
  });

  it('is true once p1:manhattan_project is in builtNationalProjects', () => {
    const state = makeState({
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(true);
  });

  it('is civ-scoped -- p2 having it does not make it true for p1', () => {
    const state = makeState({
      builtNationalProjects: {
        'p2:manhattan_project': { civId: 'p2', cityId: 'c2', eraBuilt: 10 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(false);
  });

  it('is false for an unrelated built national project', () => {
    const state = makeState({
      builtNationalProjects: {
        'p1:sacred_council': { civId: 'p1', cityId: 'c1', eraBuilt: 3 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system`
Expected: FAIL — `@/systems/strategic-arsenal-system` doesn't exist yet.

- [x] **Step 3: Write the minimal implementation**

Create `src/systems/strategic-arsenal-system.ts`:

```typescript
import type { GameState } from '@/core/types';

const MANHATTAN_PROJECT_ID = 'manhattan_project';

/**
 * Manhattan Project is a milestone national project (#545 -- see this
 * building's definition in city-system.ts) -- once built it never expires,
 * so "has it" is a thin, permanent query against builtNationalProjects, not
 * a separate persisted flag that could drift out of sync.
 */
export function hasManhattanProject(state: GameState, civId: string): boolean {
  return state.builtNationalProjects?.[`${civId}:${MANHATTAN_PROJECT_ID}`] !== undefined;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "feat(#545): add hasManhattanProject capability query"
```

---

### Task 7: `getStrategicArsenalCapacity` — the capacity resolver

**Files:**
- Modify: `src/systems/strategic-arsenal-system.ts`
- Modify: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Consumes: `hasManhattanProject` (Task 6, same file).
- Produces: `getStrategicArsenalCapacity(state: GameState, civId: string):
  number` — consumed by MR2's production-eligibility gate for "Build
  Warhead" and by the MR4 "Strategic Arsenal" advisor panel.

- [x] **Step 1: Write the failing tests**

Append to `tests/systems/strategic-arsenal-system.test.ts`:

```typescript
import { getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';

function makeCiv(overrides: Partial<import('@/core/types').Civilization> = {}) {
  return {
    id: 'p1', name: 'P1', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 0, visibility: {}, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
    ...overrides,
  } as import('@/core/types').Civilization;
}

function makeCity(id: string, buildings: string[]) {
  return {
    id, name: id, owner: 'p1', position: { q: 0, r: 0 }, population: 1,
    food: 0, foodNeeded: 10, buildings, productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
  } as any;
}

describe('getStrategicArsenalCapacity', () => {
  it('is 0 without Manhattan Project, even with capacity-shaped buildings present', () => {
    // Proves capacity-granting buildings are genuinely inert without the
    // unlock -- not just "usually" gated -- per spec §2's conjunction.
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1'] }) },
      cities: { c1: makeCity('c1', ['nuclear_arsenal', 'missile_silo']) },
    });
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(0);
  });

  it('is 1 (base) with Manhattan Project and no other capacity buildings', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: [] }) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c0', eraBuilt: 10 } },
    });
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(1);
  });

  it('adds +2 per nuclear_arsenal, summed across multiple cities', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1', 'c2'] }) },
      cities: {
        c1: makeCity('c1', ['nuclear_arsenal']),
        c2: makeCity('c2', ['nuclear_arsenal']),
      },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base 1 + 2 + 2 = 5
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(5);
  });

  it('adds +1 per missile_silo, summed across multiple cities', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1', 'c2'] }) },
      cities: {
        c1: makeCity('c1', ['missile_silo']),
        c2: makeCity('c2', ['missile_silo']),
      },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base 1 + 1 + 1 = 3
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(3);
  });

  it('combines base + nuclear_arsenal + missile_silo in one city', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1'] }) },
      cities: { c1: makeCity('c1', ['nuclear_arsenal', 'missile_silo']) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base 1 + 2 + 1 = 4
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(4);
  });

  it('is 0 for an unknown civ', () => {
    expect(getStrategicArsenalCapacity(makeState(), 'nobody')).toBe(0);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system`
Expected: FAIL — `getStrategicArsenalCapacity` doesn't exist yet.

- [x] **Step 3: Write the minimal implementation**

Append to `src/systems/strategic-arsenal-system.ts`. This uses a data table
rather than one `if` per building — the same "append a row, never add
another branch" pattern this repo already established for
`NP_PRODUCTION_DISCOUNTS` in `city-system.ts` (see
`.claude/rules/game-balance.md`'s National Project Production Discounts
section) — so a future capacity-granting building (MR2+, or a later
follow-up) is a one-line table addition, not a new `if` in this function:

```typescript
const MANHATTAN_PROJECT_BASE_CAPACITY = 1;

/**
 * Every building that contributes to the shared arsenal capacity ceiling.
 * Add a new capacity source by appending a row here -- never by adding
 * another `if (city.buildings.includes(...))` branch to the resolver below.
 */
const ARSENAL_CAPACITY_SOURCES: ReadonlyArray<{ buildingId: string; capacity: number }> = [
  { buildingId: 'nuclear_arsenal', capacity: 2 },
  { buildingId: 'missile_silo', capacity: 1 },
];

/**
 * Shared empire-wide warhead capacity ceiling (#545 spec §1). Zero until
 * Manhattan Project is complete -- capacity-granting buildings are inert
 * without it, proven by the "0 with buildings present but no Manhattan
 * Project" test above. Computed live from current buildings every call;
 * never stored on GameState, so there is nothing to invalidate when a
 * building is lost or the superweapons setting (MR7) is toggled.
 */
export function getStrategicArsenalCapacity(state: GameState, civId: string): number {
  if (!hasManhattanProject(state, civId)) return 0;

  const civ = state.civilizations[civId];
  if (!civ) return 0;

  let capacity = MANHATTAN_PROJECT_BASE_CAPACITY;
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    for (const source of ARSENAL_CAPACITY_SOURCES) {
      if (city.buildings.includes(source.buildingId)) capacity += source.capacity;
    }
  }
  return capacity;
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system`
Expected: PASS (all 4 `hasManhattanProject` tests + 6 `getStrategicArsenalCapacity`
tests)

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "feat(#545): add getStrategicArsenalCapacity resolver"
```

---

### Task 8: `getStrategicArsenal` — the legacy-safe accessor

**Files:**
- Modify: `src/systems/strategic-arsenal-system.ts`
- Modify: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Produces: `getStrategicArsenal(civ: Civilization): number` — the one
  canonical read of `civ.strategicArsenal`, so no later caller reads the raw
  field directly and has to remember the `?? 0` fallback itself.

- [x] **Step 1: Write the failing tests**

Append to `tests/systems/strategic-arsenal-system.test.ts`:

```typescript
import { getStrategicArsenal } from '@/systems/strategic-arsenal-system';

describe('getStrategicArsenal', () => {
  it('is 0 when strategicArsenal is undefined (legacy save)', () => {
    expect(getStrategicArsenal(makeCiv())).toBe(0);
  });

  it('returns the stored value when present', () => {
    expect(getStrategicArsenal(makeCiv({ strategicArsenal: 3 }))).toBe(3);
  });

  it('returns 0 when explicitly 0', () => {
    expect(getStrategicArsenal(makeCiv({ strategicArsenal: 0 }))).toBe(0);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system`
Expected: FAIL — `getStrategicArsenal` doesn't exist yet.

- [x] **Step 3: Write the minimal implementation**

Append to `src/systems/strategic-arsenal-system.ts`:

```typescript
import type { Civilization } from '@/core/types';

/**
 * The one canonical read of a civ's warhead count. Legacy saves (and any
 * civ that has never produced a warhead) have no strategicArsenal field --
 * absent means zero, never undefined-propagates to a caller.
 */
export function getStrategicArsenal(civ: Civilization): number {
  return civ.strategicArsenal ?? 0;
}
```

(Note: `Civilization` is now imported alongside `GameState` at the top of the
file — combine the two type imports into one `import type { Civilization,
GameState } from '@/core/types';` line rather than two separate import
statements.)

- [x] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system`
Expected: PASS (all 13 tests in the file)

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "feat(#545): add getStrategicArsenal legacy-safe accessor"
```

---

### Task 9: Full-suite verification

**Files:** none (verification only).

- [x] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests pass, including the hook smoke tests.

- [x] **Step 2: Run the production build (includes typecheck)**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: succeeds with no TypeScript errors.

- [x] **Step 3: Confirm architecture boundaries**

Run: `bash scripts/run-with-mise.sh yarn test tests/app/architecture-boundaries.test.ts`
Expected: PASS — `strategic-arsenal-system.ts` lives in `src/systems/` and
imports nothing from `src/ui/`/`src/renderer/`/`src/app/`, so it should not
trip any existing boundary rule. If it does, the failure message will name
the violated rule directly — read it before changing anything.

- [x] **Step 4: No commit needed**

This task is verification-only; nothing here should have produced new
changes. If any of the above steps required a fix, that fix belongs in the
task it corrects, with its own commit — go back and amend that task's
commit message context rather than creating a generic "fix tests" commit
here.

---

## Definition of Done

- [x] `Civilization.strategicArsenal?: number` exists, optional, no migration.
- [x] `manhattan_project` is a milestone NP: `nationalProject: { homeEra: 10,
  milestone: true }`, no `civYieldBonus`, honest zero-fades description.
- [x] `nuclear_arsenal` yields `production: 9` (era-10 total unchanged from
  before this MR).
- [x] `strategic-arsenal-system.ts` exports `hasManhattanProject`,
  `getStrategicArsenalCapacity`, `getStrategicArsenal` — all pure, all
  tested, all civ-scoped, all correctly return 0/false for an unknown or
  unlicensed civ.
- [x] `pacing-audit.test.ts` and `pacing-reference-economy.test.ts` pass with
  no unexplained snapshot diff.
- [x] `yarn test` and `yarn build` both pass.
- [x] **No player-visible surface was added this MR** — no production catalog
  entry, no new panel, no new button. This is intentional (see Goal above)
  and is what makes this MR safe to merge on its own without triggering
  `.claude/rules/incremental-mr-completion.md`'s dead-end-UX concern: there
  is nothing on screen yet for a player to click that does nothing.

## Next MR

MR2 will add the `strategicLaunchPlatform` capability to Missile Silo/Missile
Submarine, targeting legality (spec §6), and the "Build Warhead" production
item — the first MR with any player-visible surface, gated by everything
this MR built. Per the spec's incremental-delivery constraint, MR2 must not
ship "Build Warhead" as a live production option unless MR3/MR4 (strike
resolution + launch UX) land in the same PR, or it must sit behind a
not-yet-player-facing flag until they do — decide which at MR2 planning
time, informed by how large MR2+3+4 actually are once scoped in detail.
