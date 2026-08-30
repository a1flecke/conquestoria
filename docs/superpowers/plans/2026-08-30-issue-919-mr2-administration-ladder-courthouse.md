# Issue #919 MR2 — Administration Ladder Rung 1 (Courthouse + Magistracy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Era-2 wide empire a bought, deliberate counter to sprawl unrest — a `magistracy` civics tech unlocking a `courthouse` building that emits its own negative unrest-pressure row — plus a one-city nudge to the overextension free-city allowance, with the AI valuing both.

**Architecture:** The Courthouse effect is a **dedicated additive relief row**, never an in-place edit of the distance/overextension formulas. A table (`UNREST_RELIEF_SOURCES`) of `{ id, isActive, reliefRows }` entries is flat-mapped after the positive rows are built, so later ladder rungs append an entry instead of adding a branch. AI production scores the relief generically by simulating the pressure drop; AI research gets a new empire-unrest signal threaded into its planning context and a generic term that rewards any tech unlocking a registered relief building when the empire is pressured.

**Tech Stack:** TypeScript, Vitest, Vite. No new deps. Pure functions; immutable turn processing (`.claude/rules/game-systems.md`).

## Global Constraints

- **Worktree:** all work in `/Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/issue-919-mr2-courthouse` on branch `claude/issue-919-mr2-courthouse` (already created off `origin/main` @ `698379d1`). Hooks path `.githooks` set, `mise trust` done, deps installed.
- **NO subagents / parallel agents** (CLAUDE.md "Agent Policy"). Everything inline in one session.
- **Commands:** always `bash scripts/run-with-mise.sh yarn <cmd>`. Fast test loop: `bash scripts/run-with-mise.sh yarn vitest run <file> <file>`. Full gate before push: `bash scripts/run-with-mise.sh yarn build` **and** `bash scripts/run-with-mise.sh yarn test`, both exit 0. `yarn test` does not type-check — only `yarn build` runs `tsc`.
- **Bash tool timeouts:** `git commit` → 30000 ms; `git push` / `gh pr create` / `gh pr merge` → 120000 ms.
- **Issue #919 stays OPEN.** PR body: "Part of #919", never "Closes #919" (MR3 pending). Memory `feedback_pr_body_closes_keyword`.
- **Commit trailer:** `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. PR body trailer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Constant values (proposed; final values ride the pacing gate in Task 7):**
  | Constant | File | Value |
  |---|---|---|
  | `OVEREXTENSION_FREE_CITIES` | `src/systems/faction-system.ts` | `6` |
  | `COURTHOUSE_DISTANCE_RELIEF_FRACTION` | `src/systems/faction-system.ts` | `0.5` |
  | `COURTHOUSE_OVEREXTENSION_RELIEF` | `src/systems/faction-system.ts` | `3` |
  | `COURTHOUSE_SPRAWL_FLOOR` | `src/systems/faction-system.ts` | `2` |
  | `courthouse.productionCost` | `src/systems/city-system.ts` | `55` |
  | `magistracy.cost` | `src/systems/tech-definitions-eras1-4.ts` | `25` |
  | `UNREST_RELIEF_AI_WEIGHT` | `src/ai/ai-production.ts` | `0.75` |
  | `UNREST_RELIEF_AI_URGENCY_MULT` | `src/ai/ai-production.ts` | `2` |
  | `UNREST_RELIEF_TECH_AI_BONUS` | `src/ai/ai-research.ts` | `6` (new; see Task 5) |
  | `UNREST_RELIEF_TECH_AI_PRESSURE_GATE` | `src/ai/ai-research.ts` | `0.6 * 40 = 24` pressure, ≥ 2 cities over it (new; see Task 5) |

## Spec deviations discovered during the live-code audit (carry these into the PR body)

1. **`civil-service` already exists** as an Era-3 civics tech (`src/systems/tech-definitions-eras1-4.ts:40`, cost 60, unlocks `forum`). The spec's parenthetical "leaves 'Civil Service' free for a later ladder rung" is stale. No effect on MR2 — the new tech is still named **Magistracy** — but do not also try to add a `civil-service` tech.
2. **Spec §2.5 / handoff §4.6 AI code snippet is stale.** There is no `buildingScore(...)` taking `state`/`city`/`ownerHappiness`. The real function is `economyValue(buildingId: string)` in `src/ai/ai-production.ts:207` — pure, id-only. The relief term is added at the **candidate-scoring call site** in `generateAIProductionCandidates` (`src/ai/ai-production.ts:~597-651`) as a new helper `unrestReliefScore(state, civId, cityId, buildingId)`, parallel to `defensiveEspionageScore` / `strategicArsenalValueScore`. Task 4 does this.
3. **No "priority civics when unrest is high" research hook exists.** `planAIResearch` (`src/ai/ai-research.ts:147`) has no per-city / pressure signal in `AIResearchPlanningContext` (`:24-33`). Its caller `applyAIResearch` (`:261`) *does* have `state` + `civId`. Task 5 computes an empire-unrest signal there, threads it via a new optional context field, and adds a generic scoring term keyed off `UNREST_RELIEF_SOURCES` building ids appearing in a candidate tech's `unlocksBuildings` — **no `magistracy` id branch**.
4. **Most `cityCount: 21` faction tests are unaffected** by the nudge because overextension caps at `MAX_PRESSURE_EMPIRE = 30` on both sides. The tests that shift use mid-range counts. Known breakage: `tests/systems/faction-system.test.ts:695-703` (`cityCount: 10` → pre-nudge pressure 42, post-nudge 39, crosses the 40 trigger). Task 1 fixes each failure the run surfaces.
5. **Reference-economy `{science, production}` snapshot has no *direct* courthouse exposure** — the courthouse's only yield is `gold`, which is not in the pinned tuple (`tests/systems/helpers/pacing-reference-economy.ts:159-162`). Indirect drift is possible only if the extra eligible building tips `population = min(12, 2 + floor(buildings.length / 4))` across a `/4` boundary in some era. Task 7 runs the gate and records any delta.

---

### Task 1: Era-2 curve nudge (`OVEREXTENSION_FREE_CITIES`)

**Files:**
- Modify: `src/systems/faction-system.ts` (constants block ~`:16-35`; `getUnrestPressureBreakdown` overextension row `:60-63`)
- Test: `tests/systems/faction-system.test.ts` (update existing assertions that pin the old free-city count)

**Interfaces:**
- Produces: `export const OVEREXTENSION_FREE_CITIES = 6;` — consumed by Task 3's worked-example tests and re-exported nowhere else.

- [ ] **Step 1: Write a failing test pinning the new free-city count**

In `tests/systems/faction-system.test.ts`, inside the `describe('unrest pressure breakdown (#552)')` block (near `:986`), add:

```ts
it('MR2 #919: overextension free-city allowance is 6 — a 6-city civ has no overextension row', () => {
  // makeState creates cityCount + 1 civ cities (capital + city-1..city-cityCount).
  // cityCount: 5 -> 6 civ cities -> (6 - 6) * 3 = 0 -> no row.
  const state = makeState({ cityCount: 5 });
  const rows = getUnrestPressureBreakdown('city-1', state, 0);
  expect(rows.find(r => r.label === 'Empire overextension')).toBeUndefined();
});

it('MR2 #919: a 7-city civ pays exactly one extra-city slope of overextension', () => {
  // cityCount: 6 -> 7 civ cities -> (7 - 6) * 3 = 3.
  const state = makeState({ cityCount: 6 });
  const rows = getUnrestPressureBreakdown('city-1', state, 0);
  expect(rows.find(r => r.label === 'Empire overextension')?.amount).toBe(3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts -t "MR2 #919"`
Expected: FAIL — the 6-city case currently produces `amount: 3` (row present), the 7-city case currently produces `amount: 6`.

- [ ] **Step 3: Add the constant and use it**

In `src/systems/faction-system.ts`, in the thresholds block just after `const CONQUEST_UNREST_DURATION = 15;` (`:20`):

```ts
// #919 MR2: the Era-2 administration-ladder nudge. One extra "free" city before
// empire overextension pressure starts, so a modest early empire that has not yet
// teched `magistracy` is not instantly in revolt. Slope (3) and cap
// (MAX_PRESSURE_EMPIRE) are unchanged — the Courthouse does the real work.
export const OVEREXTENSION_FREE_CITIES = 6;
```

Then change the overextension row (`:60-63`) from:

```ts
  // Empire overextension: each city over 5 adds 3 pressure
  const cityCount = civ.cities.length;
  const overextension = Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - 5) * 3));
  if (overextension > 0) rows.push({ label: 'Empire overextension', amount: overextension });
```

to:

```ts
  // Empire overextension: each city over OVEREXTENSION_FREE_CITIES adds 3 pressure
  const cityCount = civ.cities.length;
  const overextension = Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - OVEREXTENSION_FREE_CITIES) * 3));
  if (overextension > 0) rows.push({ label: 'Empire overextension', amount: overextension });
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts -t "MR2 #919"`
Expected: PASS.

- [ ] **Step 5: Run the whole faction test file and fix every shifted assertion**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts`

For each failure, recompute the expected value with the new formula and update the assertion **and its explanatory comment**:
- Overextension row for a civ with `N` cities (`N = cityCount + 1` in `makeState`; `N = cityCount + 1` in `faction-happiness.test.ts`'s `makeMinimalState`): `min(30, max(0, (N - 6) * 3))`.
- Distance row (unchanged): `min(20, max(0, (hexDistance(city, capital) - 5) * 2))`.
- Known specific fix: `tests/systems/faction-system.test.ts:695-703` — bump `cityCount: 10` to `cityCount: 12` (→ 13 civ cities → `(13 - 6) * 3 = 21`; `21 + 24` war `= 45 > 40`) and update the inline comment to `cityCount:12 -> 13 total cities -> empire pressure (13-6)*3=21; 3 wars -> 24; total 45 > 40`.
- Do **not** change any test's *intent* — only the numeric expectation and comment. If a test's premise ("nonzero overextension so the delta is observable") still holds at the new value, leave its structure alone.
- Record every changed `(test name → old value → new value)` in a scratch note for the PR body.

- [ ] **Step 6: Commit**

```bash
git add src/systems/faction-system.ts tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts
git commit -m "feat(#919): MR2 curve nudge — overextension free-city allowance 5 -> 6

Part of #919. Replaces the literal 5 in the empire-overextension formula
with OVEREXTENSION_FREE_CITIES = 6. Slope (3) and cap (30) unchanged.
Updates faction-system / faction-happiness assertions that pinned the old
count; #919 MR2 administration-ladder rung 1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `magistracy` tech + `courthouse` building (definitions, icon, unlock wiring)

**Files:**
- Modify: `src/systems/tech-definitions-eras1-4.ts` (civics track, after `early-empire` at `:37`)
- Modify: `src/systems/city-system.ts` (`BUILDINGS`, after `forum` at `:79`; `PRODUCTION_ICONS`, after `forum: '📢'` at `:1525`)
- Test: `tests/systems/city-system.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts`, `tests/systems/pacing-model.test.ts` (rely on existing generic coverage; add one explicit assertion each)

**Interfaces:**
- Produces: tech id `'magistracy'` (track `civics`, era 2, cost 25, prereq `['code-of-laws']`, `unlocksBuildings: ['courthouse']`); building id `'courthouse'` (`category: 'culture'`, `techRequired: 'magistracy'`, `productionCost: 55`, `yields.gold: 1`, no `happiness` field). Consumed by Task 3 (`COURTHOUSE_RELIEF` keys on `city.buildings.includes('courthouse')`), Task 4, Task 5.

- [ ] **Step 1: Write failing explicit assertions**

In `tests/systems/city-system.test.ts`, find the building icon-coverage / well-formed-entry describe block (search for `PRODUCTION_ICONS`) and add:

```ts
it('#919 MR2: courthouse is a well-formed culture building with an icon', () => {
  const c = BUILDINGS['courthouse'];
  expect(c).toBeDefined();
  expect(c.category).toBe('culture');
  expect(c.techRequired).toBe('magistracy');
  expect(c.productionCost).toBe(55);
  expect(c.yields).toEqual({ food: 0, production: 0, gold: 1, science: 0 });
  expect(c.happiness ?? 0).toBe(0); // relief is a targeted row, not happiness
  expect(PRODUCTION_ICONS['courthouse']).toBe('⚖️');
});
```

In `tests/systems/tech-unlocks-consistency.test.ts`, in the `describe('tech structured unlock arrays')` block add:

```ts
it('#919 MR2: magistracy unlocks courthouse and its unlocks text names no bare entity', () => {
  const magistracy = TECH_TREE.find(t => t.id === 'magistracy');
  expect(magistracy?.unlocksBuildings).toContain('courthouse');
  expect(magistracy?.era).toBe(2);
  expect(magistracy?.prerequisites).toEqual(['code-of-laws']);
  const buildingNames = new Set(Object.values(BUILDINGS).map(b => b.name));
  const unitNames = new Set(TRAINABLE_UNITS.map(u => u.name));
  for (const u of magistracy?.unlocks ?? []) {
    expect(buildingNames.has(u)).toBe(false);
    expect(unitNames.has(u)).toBe(false);
  }
});
```

In `tests/systems/pacing-model.test.ts`, near the era-relative-band tests add:

```ts
it('#919 MR2: magistracy and courthouse resolve to the infrastructure band', () => {
  const magistracy = TECH_TREE.find(t => t.id === 'magistracy')!;
  expect(resolveTechPacingBand(magistracy)).toBe('infrastructure');
  expect(BUILDINGS['courthouse'].pacing?.band).toBe('infrastructure');
});
```

(`BUILDINGS` and `resolveTechPacingBand` are already imported in that file — add `BUILDINGS` to the import from `@/systems/city-system` if missing.)

- [ ] **Step 2: Run to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/pacing-model.test.ts -t "#919 MR2"`
Expected: FAIL — `BUILDINGS['courthouse']` undefined, `magistracy` not found.

- [ ] **Step 3: Add the tech**

In `src/systems/tech-definitions-eras1-4.ts`, immediately after the `early-empire` line (`:37`):

```ts
  { id: 'magistracy', name: 'Magistracy', track: 'civics', cost: 25, prerequisites: ['code-of-laws'], era: 2, unlocks: ['Provincial courts reduce unrest from distance and overextension'], unlocksBuildings: ['courthouse'], pacing: { band: 'infrastructure', role: 'stability-civics', impact: 1.05, scope: 'empire', snowball: 1.0, urgency: 1.1, situationality: 1.2, unlockBreadth: 1 } },
```

Note (comment not required in the file, but be aware): its Era-2 civics peers `early-empire` / `state-workforce` carry no `pacing` block; `magistracy` gets an explicit one because the spec pins it to `infrastructure` (a cost-25 era-2 tech would otherwise heuristically resolve to `core`, giving it a `[4,7]`-turn window that a 25/4 ≈ 7-turn estimate sits on the edge of). The explicit block is a deliberate, spec-directed deviation from the peers.

- [ ] **Step 4: Add the building and icon**

In `src/systems/city-system.ts`, in `BUILDINGS` immediately after the `forum` line (`:79`):

```ts
  courthouse: { id: 'courthouse', name: 'Courthouse', category: 'culture', yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 55, techRequired: 'magistracy', description: "Seat of provincial law. Cuts this city's unrest pressure from distance to the capital and from empire overextension (a courthoused city still carries a little).", pacing: { band: 'infrastructure', role: 'stability', impact: 1.05, scope: 'city', snowball: 1.05, urgency: 1.1, situationality: 1.3, unlockBreadth: 1 } },
```

In `PRODUCTION_ICONS`, immediately after `forum: '📢',` (`:1525`):

```ts
  courthouse: '⚖️',
```

- [ ] **Step 5: Run the targeted tests + the generic consistency suites**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/pacing-model.test.ts tests/systems/tech-definitions.test.ts tests/systems/description-honesty.test.ts`
Expected: PASS. The generic `tech-unlocks-consistency` completeness tests (`every tech-gated building appears in its tech unlocksBuildings`, and the reverse) now cover the new pair automatically; `description-honesty` denylist has no new hits (the description only claims distance + overextension relief, which Task 3 makes real).

- [ ] **Step 6: Commit**

```bash
git add src/systems/tech-definitions-eras1-4.ts src/systems/city-system.ts tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/pacing-model.test.ts
git commit -m "feat(#919): MR2 add Magistracy tech + Courthouse building

Part of #919. New Era-2 civics tech \`magistracy\` (cost 25, prereq
code-of-laws) unlocking the \`courthouse\` culture building (cost 55,
+1 gold, no happiness field). Adds the ⚖️ production icon. Effect wiring
lands in the next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Courthouse effect — the `UNREST_RELIEF_SOURCES` table and its `Courthouse` row

**Files:**
- Modify: `src/systems/faction-system.ts` (new interface + table + `getUnrestReliefRows` after `UnrestPressureRow` at `:39-42`; call it inside `getUnrestPressureBreakdown` just before `return rows;` at `:121`)
- Test: `tests/systems/faction-system.test.ts`, `tests/systems/faction-happiness.test.ts`

**Interfaces:**
- Consumes: `OVEREXTENSION_FREE_CITIES` (Task 1); `UnrestPressureRow` (`{ label: string; amount: number }`, already exported).
- Produces:
  - `export interface UnrestReliefSource { id: string; isActive(city: City, state: GameState): boolean; reliefRows(city: City, state: GameState, positiveRows: UnrestPressureRow[]): UnrestPressureRow[]; }`
  - `export const UNREST_RELIEF_SOURCES: UnrestReliefSource[]` (contains exactly `COURTHOUSE_RELIEF`)
  - `export function getUnrestReliefRows(city: City, state: GameState, positiveRows: UnrestPressureRow[]): UnrestPressureRow[]`
  - Constants `COURTHOUSE_DISTANCE_RELIEF_FRACTION = 0.5`, `COURTHOUSE_OVEREXTENSION_RELIEF = 3`, `COURTHOUSE_SPRAWL_FLOOR = 2` (exported — Task 4 and the game-balance doc reference them).
  - Consumed by Task 4 (`UNREST_RELIEF_SOURCES` imported into `ai-production.ts`) and Task 5 (imported into `ai-research.ts`).

- [ ] **Step 1: Write the failing tests (worked examples + negatives + invariants)**

In `tests/systems/faction-system.test.ts`, add a new describe block after `describe('unrest pressure breakdown (#552)')`:

```ts
describe('#919 MR2 — Courthouse unrest relief row', () => {
  // makeState: civ has (cityCount + 1) cities. city-1 at cityPosition, capital at capitalPosition.
  // Post-nudge positive rows: overext = min(30, max(0, (cityCount + 1 - 6) * 3));
  //                           dist   = min(20, max(0, (hexDistance(city, capital) - 5) * 2)).
  // Courthouse row formula (from the already-built positive rows):
  //   rawSprawl = distRow + overextRow
  //   uncapped  = round(0.5 * distRow) + min(3, overextRow)
  //   relief    = min(uncapped, max(0, rawSprawl - 2))
  //   row       = { label: 'Courthouse', amount: -relief }  (omitted if relief === 0)

  function courthouseRow(state: GameState, cityId = 'city-1') {
    const rows = getUnrestPressureBreakdown(cityId, addBuilding(state, cityId, 'courthouse').cities[cityId]
      ? addBuilding(state, cityId, 'courthouse') : state, 0);
    return rows.find(r => r.label === 'Courthouse');
  }

  it('8 cities, city 9 hexes out -> Courthouse -7', () => {
    // cityCount 7 -> 8 civ cities -> overext (8-6)*3 = 6.
    // hexDistance 9 from capital -> dist (9-5)*2 = 8. rawSprawl 14.
    // uncapped round(4) + min(3,6) = 7. relief min(7, 14-2) = 7.
    const state = makeState({ cityCount: 7, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const withCh = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'), 0);
    expect(withCh.find(r => r.label === 'Courthouse')?.amount).toBe(-7);
  });

  it('12 cities, city 6 hexes out -> Courthouse -4', () => {
    // cityCount 11 -> 12 civ cities -> overext (12-6)*3 = 18.
    // hexDistance 6 -> dist (6-5)*2 = 2. rawSprawl 20.
    // uncapped round(1) + min(3,18) = 4. relief min(4, 18) = 4.
    const state = makeState({ cityCount: 11, cityPosition: { q: 6, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const withCh = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'), 0);
    expect(withCh.find(r => r.label === 'Courthouse')?.amount).toBe(-4);
  });

  it('20 cities, city 12 hexes out -> Courthouse -10 (overext row capped at 30)', () => {
    // cityCount 19 -> 20 civ cities -> overext min(30, (20-6)*3=42) = 30.
    // hexDistance 12 -> dist min(20, (12-5)*2=14) = 14. rawSprawl 44.
    // uncapped round(7) + min(3,30) = 10. relief min(10, 42) = 10.
    const state = makeState({ cityCount: 19, cityPosition: { q: 12, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const withCh = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'), 0);
    expect(withCh.find(r => r.label === 'Courthouse')?.amount).toBe(-10);
  });

  it('7 cities, city <=5 hexes out -> Courthouse -1 (residual floor leaves net sprawl 2)', () => {
    // cityCount 6 -> 7 civ cities -> overext (7-6)*3 = 3. dist row absent (<=5 hexes). rawSprawl 3.
    // uncapped round(0) + min(3,3) = 3. relief min(3, max(0, 3-2)) = 1. net sprawl 3 - 1 = 2.
    const state = makeState({ cityCount: 6, cityPosition: { q: 3, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const withCh = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'), 0);
    expect(withCh.find(r => r.label === 'Courthouse')?.amount).toBe(-1);
  });

  it('NEGATIVE: the same city without a courthouse gets no Courthouse row and full sprawl pressure', () => {
    const state = makeState({ cityCount: 7, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const rows = getUnrestPressureBreakdown('city-1', state, 0);
    expect(rows.find(r => r.label === 'Courthouse')).toBeUndefined();
    const sprawl = (rows.find(r => r.label === 'Empire overextension')?.amount ?? 0)
      + (rows.find(r => r.label === 'Distance from capital')?.amount ?? 0);
    expect(sprawl).toBe(14); // 6 + 8, unrelieved
  });

  it('NEGATIVE: a courthouse in a <=OVEREXTENSION_FREE_CITIES-city civ with no distance row emits no Courthouse row', () => {
    // cityCount 5 -> 6 civ cities -> overext 0. city at capital -> no dist row. rawSprawl 0 -> relief 0 -> row omitted.
    const state = makeState({ cityCount: 5, cityPosition: { q: 0, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const withCh = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'), 0);
    expect(withCh.find(r => r.label === 'Courthouse')).toBeUndefined();
  });

  it('residual floor: a courthoused city that had sprawl pressure never nets below COURTHOUSE_SPRAWL_FLOOR', () => {
    for (let cityCount = 6; cityCount <= 25; cityCount++) {
      for (const dist of [0, 6, 9, 12, 20]) {
        const state = makeState({ cityCount, cityPosition: { q: dist, r: 0 }, capitalPosition: { q: 0, r: 0 } });
        const rows = getUnrestPressureBreakdown('city-1', addBuilding(state, 'city-1', 'courthouse'), 0);
        const overext = rows.find(r => r.label === 'Empire overextension')?.amount ?? 0;
        const distRow = rows.find(r => r.label === 'Distance from capital')?.amount ?? 0;
        const relief = -(rows.find(r => r.label === 'Courthouse')?.amount ?? 0);
        const rawSprawl = overext + distRow;
        if (rawSprawl > 0) expect(rawSprawl - relief).toBeGreaterThanOrEqual(2);
        expect(relief).toBeLessThanOrEqual(rawSprawl); // never relieve more than exists
      }
    }
  });

  it('computeUnrestPressure stays within [0,100] when the Courthouse row would otherwise drive a city negative', () => {
    // Small empire, big luxury happiness, courthouse -> sum well below 0 pre-clamp.
    const state = makeState({ cityCount: 7, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const p = computeUnrestPressure('city-1', addBuilding(state, 'city-1', 'courthouse'), 40);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});
```

If `addBuilding` is not already imported/defined in this file, reuse the helper the `describe('building happiness (#552)')` block uses (`addBuilding(state, cityId, buildingId)` — search the file; it exists near the top helpers).

In `tests/systems/faction-happiness.test.ts`, add:

```ts
describe('#919 MR2 — Courthouse row composes additively with happiness offsets', () => {
  it('Courthouse relief and a temple / luxury / serenity offset stack without double-counting', () => {
    // 8 civ cities, city 9 hexes out: overext 6, dist 8, rawSprawl 14, courthouse relief 7.
    const base = makeMinimalState({ cityCount: 7, cityPosition: { q: 9, r: 0 }, era: 2 });
    const withCh = addBuilding(base, 'city-1', 'courthouse');
    const withChTemple = addBuilding(withCh, 'city-1', 'temple');

    const pBase = computeUnrestPressure('city-1', base, 2);       // 2 luxury happiness -> -4 row
    const pCh = computeUnrestPressure('city-1', withCh, 2);
    const pChTemple = computeUnrestPressure('city-1', withChTemple, 2);

    expect(pBase - pCh).toBe(7);          // courthouse alone removes 7
    expect(pCh - pChTemple).toBe(2);      // temple adds a further -2, independent of the courthouse row
  });
});
```

Adjust `makeMinimalState` call params to whatever that file's helper accepts (`cityPosition` may need to be a large-q coord to force a distance row; check the helper — it takes `cityPosition`). If `addBuilding` isn't in that file, add a local `function addBuilding(state, cityId, id) { return { ...state, cities: { ...state.cities, [cityId]: { ...state.cities[cityId], buildings: [...state.cities[cityId].buildings, id] } } }; }`.

- [ ] **Step 2: Run to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts -t "#919 MR2"`
Expected: FAIL — no `Courthouse` row is produced yet.

- [ ] **Step 3: Implement the relief table**

In `src/systems/faction-system.ts`, immediately after the `UnrestPressureRow` interface (`:42`):

```ts
// #919 MR2 — administration ladder. Each entry emits zero or more NEGATIVE rows
// from the positive pressure rows already computed for a city. Later ladder rungs
// (roads-cut-distance, second seat of government, civil-service bureaucracy,
// governors) append an entry here — never a branch in getUnrestPressureBreakdown.
// `id` is the building id the source is gated on, so ai-production.ts can score it
// generically. Keep every entry registered in .claude/rules/game-balance.md's
// "Unrest Relief Inventory" table.
export interface UnrestReliefSource {
  id: string;
  isActive(city: City, state: GameState): boolean;
  reliefRows(city: City, state: GameState, positiveRows: UnrestPressureRow[]): UnrestPressureRow[];
}

// Civ IV Courthouse: halves the distance-to-capital row and shaves a flat slice off
// the empire-overextension row, but a city that HAD sprawl pressure still pays at
// least COURTHOUSE_SPRAWL_FLOOR ("scale always costs something"), and the relief
// never exceeds the sprawl that actually exists.
export const COURTHOUSE_DISTANCE_RELIEF_FRACTION = 0.5;
export const COURTHOUSE_OVEREXTENSION_RELIEF = 3;
export const COURTHOUSE_SPRAWL_FLOOR = 2;

const COURTHOUSE_RELIEF: UnrestReliefSource = {
  id: 'courthouse',
  isActive: city => city.buildings.includes('courthouse'),
  reliefRows: (_city, _state, positiveRows) => {
    const distanceRow = positiveRows.find(r => r.label === 'Distance from capital')?.amount ?? 0;
    const overextensionRow = positiveRows.find(r => r.label === 'Empire overextension')?.amount ?? 0;
    const rawSprawl = distanceRow + overextensionRow;
    const uncapped = Math.round(COURTHOUSE_DISTANCE_RELIEF_FRACTION * distanceRow)
      + Math.min(COURTHOUSE_OVEREXTENSION_RELIEF, overextensionRow);
    const relief = Math.min(uncapped, Math.max(0, rawSprawl - COURTHOUSE_SPRAWL_FLOOR));
    return relief === 0 ? [] : [{ label: 'Courthouse', amount: -relief }];
  },
};

export const UNREST_RELIEF_SOURCES: UnrestReliefSource[] = [COURTHOUSE_RELIEF];

export function getUnrestReliefRows(
  city: City,
  state: GameState,
  positiveRows: UnrestPressureRow[],
): UnrestPressureRow[] {
  return UNREST_RELIEF_SOURCES.flatMap(source =>
    source.isActive(city, state) ? source.reliefRows(city, state, positiveRows) : []);
}
```

Then, in `getUnrestPressureBreakdown`, replace the final `return rows;` (`:121`) with:

```ts
  return [...rows, ...getUnrestReliefRows(city, state, rows)];
```

(`rows` at that point holds every positive row *and* the existing happiness/luxury/serenity negative rows — the Courthouse math only reads the two positive sprawl rows by label, so pre-existing negative rows do not perturb it.)

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts -t "#919 MR2"`
Expected: PASS.

- [ ] **Step 5: Run both full files + the breakdown-sum invariant**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts`
Expected: PASS. In particular the existing `breakdown rows sum to the pressure total (pre-clamp)` test must still hold — the Courthouse row is a normal row in the returned list, so `rows.reduce(sum) === computeUnrestPressure(...)` (pre-clamp) is preserved by construction.

- [ ] **Step 6: Commit**

```bash
git add src/systems/faction-system.ts tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts
git commit -m "feat(#919): MR2 Courthouse emits its own unrest-relief row

Part of #919. Adds UNREST_RELIEF_SOURCES (a table, not a branch) and the
COURTHOUSE_RELIEF entry: halves the Distance-from-capital row, shaves a
flat 3 off Empire-overextension, with a residual floor of 2 and never more
relief than sprawl exists. getUnrestPressureBreakdown concatenates the
relief rows after the positive rows.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: AI production valuation of unrest relief

**Files:**
- Modify: `src/ai/ai-production.ts` (import `UNREST_RELIEF_SOURCES` + `computeUnrestPressure` from `@/systems/faction-system`; import `getCivHappinessFromResources` from `@/systems/resource-acquisition-system`; new `withBuilding` + `unrestReliefScore` helpers near the other score helpers ~`:277-289`; wire into `generateAIProductionCandidates` scoring ~`:597-651`; add field to the candidate object + the `AIProductionCandidate` interface at `:40-56`)
- Test: `tests/ai/ai-production.test.ts`

**Interfaces:**
- Consumes: `UNREST_RELIEF_SOURCES` (Task 3), `computeUnrestPressure(cityId, state, ownerHappiness)`, `UNREST_TRIGGER_PRESSURE` — note `UNREST_TRIGGER_PRESSURE` is **not currently exported** from `faction-system.ts` (`:17`). Export it in this task (`export const UNREST_TRIGGER_PRESSURE = 40;`).
- Produces: `unrestReliefScore(state: GameState, civId: string, cityId: string, buildingId: string): number`; new `unrestReliefScore: number` field on `AIProductionCandidate`.

- [ ] **Step 1: Write the failing tests**

In `tests/ai/ai-production.test.ts`, add:

```ts
describe('#919 MR2 — AI values unrest relief (Courthouse)', () => {
  it('a wide, high-pressure AI city ranks courthouse above a same-cost zero-need building', () => {
    // Build a civ with enough cities + distance that city-1 pressure is well over the trigger,
    // magistracy researched, courthouse eligible.
    const state = /* setup: ~12 cities, city-1 far from capital, techs include 'magistracy',
                     era 2, at war x2 to push pressure high */;
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-1', [], aggressive);
    const courthouse = candidates.find(c => c.itemId === 'courthouse');
    const forum = candidates.find(c => c.itemId === 'forum'); // if eligible; else pick monument
    expect(courthouse).toBeDefined();
    expect(courthouse!.unrestReliefScore).toBeGreaterThan(0);
    if (forum) expect(courthouse!.score).toBeGreaterThan(forum.score);
  });

  it('a tall, low-pressure AI city assigns courthouse zero relief score', () => {
    const state = /* setup: 3 cities, all near capital, magistracy researched, no wars, era 2 */;
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-1', [], aggressive);
    const courthouse = candidates.find(c => c.itemId === 'courthouse');
    expect(courthouse?.unrestReliefScore ?? 0).toBe(0);
  });
});
```

Model the `state` setup on the existing helpers in that file (`setupState`, the `AI strategic production` describe block's state builders). The wide-empire state must: put `'magistracy'` in `state.civilizations['ai-1'].techState.completed`, give `ai-1` ~12 cities with `city-1` ≥ 9 hexes from the capital, set `era` 2, and add 2 entries to `atWarWith` — enough that `computeUnrestPressure('city-1', state, ownerHappiness)` returns > 40 before the courthouse.

- [ ] **Step 2: Run to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts -t "#919 MR2"`
Expected: FAIL — `unrestReliefScore` is not a field on the candidate.

- [ ] **Step 3: Export the trigger constant**

In `src/systems/faction-system.ts:17`, add `export` to `const UNREST_TRIGGER_PRESSURE = 40;`.

- [ ] **Step 4: Add the helpers and wire the score**

In `src/ai/ai-production.ts`:

Imports (extend existing import blocks):

```ts
import {
  UNREST_RELIEF_SOURCES,
  UNREST_TRIGGER_PRESSURE,
  computeUnrestPressure,
} from '@/systems/faction-system';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
```

Constants near the top-of-file scoring constants:

```ts
// #919 MR2: 2 unrest pressure ≈ 1 happiness in faction-system's maths; the happiness
// AI scalar is 1.5, so 1.5 / 2 = 0.75 per point of simulated pressure drop.
const UNREST_RELIEF_AI_WEIGHT = 0.75;
// Scale the relief score up when the city is already meaningfully pressured — a
// Courthouse in a calm tall empire genuinely is near-worthless (unlike the flat
// happiness term, conditioning on real pressure here is defensible).
const UNREST_RELIEF_AI_URGENCY_MULT = 2;
```

Helpers next to `defensiveEspionageScore` (~`:277`):

```ts
// Pure: a copy of `state` with `buildingId` appended to that city's buildings.
function withBuilding(state: GameState, cityId: string, buildingId: string): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...city, buildings: [...city.buildings, buildingId] },
    },
  };
}

// #919 MR2: generic — scores any building registered in UNREST_RELIEF_SOURCES by the
// unrest-pressure drop it would produce in THIS city, scaled up when the city is
// already pressured. No courthouse id branch; a future ladder-rung building with a
// UNREST_RELIEF_SOURCES entry is covered automatically.
function unrestReliefScore(
  state: GameState,
  civId: string,
  cityId: string,
  buildingId: string,
): number {
  if (!UNREST_RELIEF_SOURCES.some(source => source.id === buildingId)) return 0;
  const ownerHappiness = getCivHappinessFromResources(state, civId);
  const before = computeUnrestPressure(cityId, state, ownerHappiness);
  const after = computeUnrestPressure(cityId, withBuilding(state, cityId, buildingId), ownerHappiness);
  const drop = Math.max(0, before - after);
  if (drop === 0) return 0;
  const urgent = before >= 0.6 * UNREST_TRIGGER_PRESSURE;
  return drop * UNREST_RELIEF_AI_WEIGHT * (urgent ? UNREST_RELIEF_AI_URGENCY_MULT : 1);
}
```

In `generateAIProductionCandidates`, in the `getAvailableBuildings` loop (~`:618-651`), add after `buildingStrategicArsenalScore`:

```ts
    const buildingUnrestReliefScore = unrestReliefScore(state, civId, cityId, building.id);
```

Add `+ buildingUnrestReliefScore` to the `score` sum (`:625-632`), and `unrestReliefScore: buildingUnrestReliefScore,` to the pushed candidate object (`:633-651`).

In the `AIProductionCandidate` interface (`:40-56`) add `unrestReliefScore: number;`. Set `unrestReliefScore: 0` in the two non-building candidate constructions that spell out every field (`:513-522`, `:570-579`).

- [ ] **Step 5: Run targeted + full AI production suite**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-production.test.ts`
Expected: PASS, including the pre-existing generic `for (const building of available) expect(generated).toContain(building.id)` test — `courthouse` flows through `getAvailableBuildings` unchanged, so it is already covered once the AI civ has `magistracy`.

- [ ] **Step 6: Commit**

```bash
git add src/ai/ai-production.ts src/systems/faction-system.ts tests/ai/ai-production.test.ts
git commit -m "feat(#919): MR2 AI production values unrest relief generically

Part of #919. unrestReliefScore() scores any UNREST_RELIEF_SOURCES-backed
building by its simulated pressure drop in that city (weight 0.75/pt,
x2 when the city is already pressured). withBuilding() is a pure state
copy. No courthouse id branch. Exports UNREST_TRIGGER_PRESSURE.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: AI research valuation — pull `magistracy` in for a pressured wide empire

**Files:**
- Modify: `src/ai/ai-research.ts` (new optional field on `AIResearchPlanningContext` `:24-33`; new scoring term in `planAIResearch` `:196-228`; compute + pass the signal from `applyAIResearch` `:286-304`; new `AIResearchScoreComponents` field `:36-50`)
- Test: `tests/ai/ai-research.test.ts`

**Interfaces:**
- Consumes: `UNREST_RELIEF_SOURCES` (Task 3), `computeUnrestPressure`, `UNREST_TRIGGER_PRESSURE` (exported in Task 4).
- Produces: `AIResearchPlanningContext.pressuredReliefCityCount?: number` (count of the civ's cities whose current unrest pressure is ≥ `0.6 * UNREST_TRIGGER_PRESSURE`); scoring bonus `UNREST_RELIEF_TECH_AI_BONUS` applied once when a candidate tech's `unlocksBuildings` contains any `UNREST_RELIEF_SOURCES` id **and** `pressuredReliefCityCount >= 2`.

- [ ] **Step 1: Write the failing tests**

In `tests/ai/ai-research.test.ts`, add:

```ts
describe('#919 MR2 — pressured wide AI prioritises magistracy', () => {
  it('a wide, high-pressure civ researches magistracy within a few turns', () => {
    // state: ai-1 has ~12 cities, several far from capital, at war x2, era 2, code-of-laws done,
    // magistracy NOT done. Drive applyAIResearch until currentResearch or queue holds 'magistracy'.
    const state = /* wide high-pressure setup */;
    let s = state;
    let picked = false;
    for (let i = 0; i < 6 && !picked; i++) {
      const r = applyAIResearch(s, 'ai-1', prepared, neutral);
      s = r.state;
      const ts = s.civilizations['ai-1'].techState;
      picked = ts.currentResearch === 'magistracy' || ts.researchQueue.includes('magistracy');
      if (!picked) {
        // simulate completing whatever it started so the next call picks again
        s = completeCurrentResearch(s, 'ai-1'); // small local helper: move currentResearch -> completed
      }
    }
    expect(picked).toBe(true);
  });

  it('a tall, low-pressure civ does NOT beeline magistracy', () => {
    const state = /* 3 cities near capital, no wars, era 2, code-of-laws done */;
    const r = applyAIResearch(state, 'ai-1', prepared, neutral);
    const ts = r.state.civilizations['ai-1'].techState;
    expect(ts.currentResearch === 'magistracy' || ts.researchQueue.includes('magistracy')).toBe(false);
  });
});
```

Use the file's existing `context(...)`, `prepared`, `neutral` fixtures as the base; extend the state builder to attach cities + wars. If the file's `planAIResearch` tests use a lighter `context()` helper without a full `GameState`, add the `pressuredReliefCityCount` directly to that helper's output for the unit-level test and keep the `applyAIResearch` integration test for the end-to-end path.

- [ ] **Step 2: Run to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-research.test.ts -t "#919 MR2"`
Expected: FAIL — no unrest signal influences the pick.

- [ ] **Step 3: Thread the signal**

In `src/ai/ai-research.ts`:

Imports:

```ts
import { BUILDINGS } from '@/systems/city-system';
import {
  UNREST_RELIEF_SOURCES,
  UNREST_TRIGGER_PRESSURE,
  computeUnrestPressure,
} from '@/systems/faction-system';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
```

Constant:

```ts
// #919 MR2: flat, one-shot bonus that makes a pressured wide AI pull in a tech
// unlocking any UNREST_RELIEF_SOURCES building (Magistracy -> Courthouse today).
// Generic: keyed off the relief-source table, not a tech id.
const UNREST_RELIEF_TECH_AI_BONUS = 6;
```

`AIResearchPlanningContext` — add:

```ts
  /** #919 MR2: count of this civ's cities whose current unrest pressure is at or
   *  above 0.6 * UNREST_TRIGGER_PRESSURE. >= 2 turns on the relief-tech bonus. */
  pressuredReliefCityCount?: number;
```

`AIResearchScoreComponents` — add `unrestReliefTechBonus: number;`.

In `planAIResearch`, inside the `.map(entry => { ... })` (after `unlockBreadth` is computed, ~`:192`):

```ts
    const reliefSourceIds = new Set(UNREST_RELIEF_SOURCES.map(s => s.id));
    const unlocksReliefBuilding = (entry.target.unlocksBuildings ?? [])
      .some(id => reliefSourceIds.has(id) && BUILDINGS[id]);
    const unrestReliefTechBonus = unlocksReliefBuilding && (context.pressuredReliefCityCount ?? 0) >= 2
      ? UNREST_RELIEF_TECH_AI_BONUS
      : 0;
```

Add `unrestReliefTechBonus,` to `scoreComponents` and `+ unrestReliefTechBonus` to the `score` sum (`:210-218`). Add `...(unrestReliefTechBonus > 0 ? ['unrest-relief'] : [])` to `reasonCodes`.

In `applyAIResearch`, after `sciencePerTurn` is computed (~`:295`):

```ts
  const reliefPressureGate = 0.6 * UNREST_TRIGGER_PRESSURE;
  const ownerHappiness = getCivHappinessFromResources(state, civId);
  const pressuredReliefCityCount = civ.cities.reduce((count, cityId) =>
    count + (computeUnrestPressure(cityId, state, ownerHappiness) >= reliefPressureGate ? 1 : 0), 0);
```

Pass `pressuredReliefCityCount` in the `planAIResearch({ ... })` object (`:296-304`).

- [ ] **Step 4: Run targeted + full research suite**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-research.test.ts`
Expected: PASS. Existing `planAIResearch` tests pass a `context()` without `pressuredReliefCityCount` → defaults to `0` → bonus never fires → their expectations are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-research.ts tests/ai/ai-research.test.ts
git commit -m "feat(#919): MR2 pressured wide AI prioritises unrest-relief tech

Part of #919. applyAIResearch counts the civ's cities at/above
0.6*UNREST_TRIGGER_PRESSURE and threads it into planAIResearch, which adds
a flat bonus to any tech unlocking a UNREST_RELIEF_SOURCES building when
>= 2 cities are pressured. Generic — no magistracy id branch.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `.claude/rules/game-balance.md` — Unrest Relief Inventory

**Files:**
- Modify: `.claude/rules/game-balance.md` (new section after "Happiness Inventory")
- Test: none (docs)

- [ ] **Step 1: Add the section**

After the "Happiness Inventory" section's closing `**Rule:** ...` paragraph, insert:

```markdown
## Unrest Relief Inventory

Distance-from-capital and empire-overextension pressure
(`getUnrestPressureBreakdown` in `faction-system.ts`) are deliberate,
permanent pressures. Every era where they bite needs a **bought** counter —
the administration ladder (#919). Each counter emits its own negative
breakdown row via an entry in `UNREST_RELIEF_SOURCES`; it never edits the
positive-row formulas in place.

| Source | Building id | Rows it relieves | Formula | Era active |
|---|---|---|---|---|
| Courthouse | `courthouse` | Distance from capital, Empire overextension | `min( round(0.5·distRow) + min(3, overextRow),  max(0, (distRow + overextRow) − 2) )`; per city | era 2+ (`magistracy`) |

**Rule:** any new distance / overextension / unrest-relief source (a future
ladder rung — roads-cut-distance, second seat of government, civil-service
bureaucracy, governors — or anything else) MUST (a) add a row to this table
and (b) register an `UnrestReliefSource` entry in `UNREST_RELIEF_SOURCES` in
`src/systems/faction-system.ts`. It must keep a residual floor
(`COURTHOUSE_SPRAWL_FLOOR` pattern — scale always costs something) and must
never relieve more than the sprawl that exists on that city.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/game-balance.md
git commit -m "docs(#919): MR2 add Unrest Relief Inventory to game-balance rules

Part of #919.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Pacing gate, save regression, hot-seat, full green

**Files:**
- Test: `tests/systems/pacing-audit.test.ts`, `tests/systems/pacing-reference-economy.test.ts`, `tests/systems/pacing-model.test.ts` (run; patch snapshots only if they shift, with justification)
- Test: `tests/systems/faction-system.test.ts` (add save-regression + hot-seat cases)
- Possibly modify: `tests/systems/helpers/pacing-reference-economy.ts` snapshot pins **only if** the run shows a real shift

- [ ] **Step 1: Run the full pacing gate**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts tests/systems/pacing-model.test.ts tests/systems/pacing-production-budget.test.ts`

Expected: PASS. Predicted, from the audit:
- `courthouse` era 2 / `infrastructure` band → target `[6,10]` turns; era-2 production 6/turn → `ceil(55/6) = 10` → within window, not an outlier.
- `magistracy` era 2 / `infrastructure` band → target `[6,10]`; era-2 completionist science 4/turn → `ceil(25/4) = 7` → within window.
- Reference-economy `{science, production}` snapshot: courthouse contributes only `gold` (not pinned). Only risk is `population = min(12, 2 + floor(buildings.length / 4))` tipping across a `/4` boundary in some era from the one extra eligible building.

If a `pacing-reference-economy` snapshot **does** shift: update the pinned numbers in the test/helper, and write a one-line justification for the PR body of the form: *"era N science/production snapshot moved X→Y because the courthouse becomes an eligible building at era N, tipping the reference city's `buildings.length` past a population `/4` boundary; the courthouse itself adds no science/production, only gold."* If nothing shifts, state that explicitly in the PR body.

If `courthouse` or `magistracy` **is** flagged as an outlier: adjust `courthouse.productionCost` down toward the window (never below `monument`'s 30) or the `magistracy` pacing block, re-run, and note the final value differs from the spec's proposal.

- [ ] **Step 2: Write the save-regression test**

In `tests/systems/faction-system.test.ts`, add:

```ts
describe('#919 MR2 — save compatibility', () => {
  it('an existing city at unrestLevel 1 de-escalates after the retune with no migration', () => {
    // Pre-retune this civ (cityCount 8 -> 9 cities, no wars, mid distance) sat at pressure
    // just over 40; post-retune overext drops and it should fall back under the trigger.
    const state = makeState({ cityCount: 8, unrestLevel: 1, unrestTurns: 3, cityPosition: { q: 7, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const result = processFactionTurn(state, bus);
    expect(result.cities['city-1'].unrestLevel).toBe(0);
  });

  it("adding 'courthouse' to an existing city.buildings needs no migration and de-escalates further", () => {
    const state = makeState({ cityCount: 12, unrestLevel: 1, unrestTurns: 3, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
    const withCh = addBuilding(state, 'city-1', 'courthouse');
    expect(() => processFactionTurn(withCh, bus)).not.toThrow();
    const before = computeUnrestPressure('city-1', state, 0);
    const after = computeUnrestPressure('city-1', withCh, 0);
    expect(after).toBeLessThan(before);
  });
});
```

Tune the first case's `cityCount` / `cityPosition` so the pre-retune pressure genuinely crossed 40 and the post-retune value is `<= 40` — verify by temporarily logging `computeUnrestPressure` if needed, then delete the log.

- [ ] **Step 3: Write the hot-seat test**

```ts
it('#919 MR2: a courthoused city owned by the active player 2 shows the Courthouse relief row', () => {
  // makeState uses a single civ 'player'. Extend: set state.currentPlayer to a second civ id,
  // reassign city-1..capital to that civ, give it cities + distance, add 'courthouse' to city-1.
  // The breakdown is computed per city regardless of currentPlayer, but assert explicitly.
  const base = makeState({ cityCount: 12, cityPosition: { q: 9, r: 0 }, capitalPosition: { q: 0, r: 0 } });
  const p2 = /* rebind base so its cities belong to 'ai-1' and state.currentPlayer = 'ai-1' */;
  const rows = getUnrestPressureBreakdown('city-1', addBuilding(p2, 'city-1', 'courthouse'), 0);
  expect(rows.find(r => r.label === 'Courthouse')?.amount).toBeLessThan(0);
});
```

If rebinding ownership in `makeState`'s output is awkward, add a `civId` param to `makeState` (defaulting to `'player'`) and thread it through — a mechanical change, keep it minimal.

- [ ] **Step 4: Run the faction file again**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: exit 0.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 (this is the only `tsc` pass — fixes any type error from the new `AIProductionCandidate` / `AIResearchScoreComponents` fields or imports).

Run: `bash scripts/run-with-mise.sh yarn test:durable` then `bash scripts/run-with-mise.sh yarn test:durable:status`
Expected: durable status accepts (passed, current HEAD).

- [ ] **Step 6: `git diff --check` and commit**

```bash
git diff --check
git add -A
git commit -m "test(#919): MR2 pacing gate, save-regression, hot-seat coverage

Part of #919. Save-regression: an existing unrest city de-escalates after
the retune with no migration; 'courthouse' is a plain new city.buildings
value. Hot-seat: the Courthouse row renders for a city owned by the active
player 2. Pacing outlier gate + reference-economy snapshots re-run.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Finish the branch

**Files:** none (process)

- [ ] **Step 1: Sync with `main`**

```bash
git fetch origin
git rebase origin/main
```

Resolve any conflict (unlikely — the touched files are narrow). Re-run `bash scripts/run-with-mise.sh yarn test` and `yarn build` after a rebase that pulled anything.

- [ ] **Step 2: Assemble the PR body**

Per `.claude/rules/incremental-mr-completion.md`. Sections:
- **Title:** `feat(#919): MR2 — administration ladder rung 1 (Courthouse + Magistracy)`
- **Summary:** the curve nudge, the tech, the building, the relief-source table, the AI production + research valuation, the game-balance inventory.
- **Updated test expectations:** the `(test name → old value → new value)` list from Task 1 Step 5, plus the `cityCount: 10 → 12` fixture change at `faction-system.test.ts:695`.
- **Pacing:** state whether any `pacing-reference-economy` snapshot moved; if so, the numbers + the one-line justification from Task 7 Step 1. If not: "no reference-economy snapshot shifted — the Courthouse's only yield is gold, which is not in the pinned `{science, production}` tuple."
- **Spec deviations:** the 5-item list from the top of this plan.
- **Out of scope (roadmap only — no code in MR2):** later ladder rungs (roads-cut-distance, second seat of government, civil-service bureaucracy, federalism/autonomy stance, governors); the war-weariness / recent-conquest / occupation-unrest lever (separate arc); MR3 (actionable unrest guidance in the cities overview + per-city panels, advisor honesty fix) which depends on this MR being merged.
- **Why this is safe to merge partial:** MR2 introduces exactly two player-visible surfaces — (1) the **Courthouse** build-queue entry, a complete usable building on its own (costs 55, +1 gold, cuts this city's sprawl unrest); (2) the **`Courthouse` row** in the city-panel unrest pressure breakdown, which only appears when the building exists in that city. Neither links to unbuilt wiring. No dead-end UX. `magistracy` is a normal researchable tech with a real unlock.
- Trailers: `Part of #919` and `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: Hand off via `superpowers:finishing-a-development-branch`**

Invoke that skill and present merge/PR options to the user. Do **not** push or open the PR without the user's say-so unless they state the flow up front. (For MR1 the user asked for: fetch main, rebase, open PR, watch CI, rebase-merge with `--admin` — offer the same.)

---

## Self-Review

**Spec coverage:**
- §2.1 curve nudge → Task 1. ✅
- §2.2 `magistracy` tech → Task 2. ✅
- §2.3 `courthouse` building + icon + unlock pairing → Task 2. ✅
- §2.4 relief row, table-driven, exact formula, worked examples, residual floor, `[0,100]` clamp, negative tests → Task 3. ✅
- §2.5 AI production valuation, generic, `withBuilding`, urgency mult → Task 4. ✅
- §2.5 AI tech valuation ("if the hook does not exist, add generically") → Task 5 (with the audit note that it did not exist). ✅
- §2.6 game-balance.md inventory → Task 6. ✅
- MR2 tests: `faction-system` / `faction-happiness` / `city-system` / `tech-unlocks-consistency` / `pacing-model` / AI catalog + behavior / `pacing-audit` + `pacing-reference-economy` / save-regression / hot-seat → Tasks 1–7. ✅
- `check-src-edit` hook to zero → the planned edits trip none of its patterns (`withBuilding` uses spread, not `state.cities[id] =`; no `Math.random`, no `=== 'player'`, no `innerHTML`, no UI/buttons). Confirm the hook stays silent as each `src/` file is edited. ✅

**Placeholder scan:** the AI-test `state` setups in Tasks 4–5 are described by construction requirements (city count, distance, techs, wars, era) rather than literal code because they must be built on that file's existing state helpers, which the executor has in front of them; every non-test code change is given in full. Acceptable per "follow established patterns," but the executor must not leave a `/* setup */` comment in the committed test — it must be real.

**Type consistency:** `UnrestReliefSource` / `UNREST_RELIEF_SOURCES` / `getUnrestReliefRows` names are identical across Tasks 3, 4, 5. `unrestReliefScore` (function and candidate field) consistent in Task 4. `pressuredReliefCityCount` / `unrestReliefTechBonus` consistent in Task 5. `UNREST_TRIGGER_PRESSURE` is exported once (Task 4 Step 3) and imported in Tasks 4 and 5. `computeUnrestPressure(cityId, state, ownerHappiness)` signature matches its definition. `withBuilding(state, cityId, buildingId)` matches both call sites.
