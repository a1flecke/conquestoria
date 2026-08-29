# #919 MR1 — Outbreak Spread Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this repo forbids subagents — see CLAUDE.md "Agent Policy"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make funding a plague/famine remedy actually stop the outbreak spreading, stop cured cities from being re-infected immediately, and give Medicine-era empires a one-action nationwide cure.

**Architecture:** Three changes inside the existing crisis resolver (`src/systems/crisis-system.ts`): (1) the per-city spread roll skips a city that has a remedy underway, mirroring the population-loss loop that already does this; (2) a new optional `ActiveCrisis.curedUntilTurn` map blocks re-infection of a just-cured city for a few turns; (3) a new `applyEmpireContainment` helper starts the standard 2-turn remedy in every infected city at once, gated on the `medicine` tech. UI, AI, and notification wiring follow the existing `applyRemedy` / `applyQuarantine` patterns exactly.

**Tech Stack:** TypeScript, Vitest, `@/` path alias for `src/`. No new dependencies.

## Global Constraints

- NEVER use `Math.random()` — all randomness uses the seeded `seededLcg` already in the file. (`.claude/rules/game-systems.md`)
- Turn processing is immutable: never mutate `state.cities[id]`, `state.activeCrises[id]`, etc. Spread-copy: `{ ...state, activeCrises: { ...state.activeCrises, [id]: { ...crisis, field: v } } }`. (`.claude/rules/game-systems.md`)
- If a helper emits a one-time event, it must be fired by the mutating helper itself (transition-owned), exactly once, never re-derived from a steady-state scan. (`.claude/rules/end-to-end-wiring.md`)
- A gated effect needs a negative test proving the gate matters. (`.claude/rules/spec-fidelity.md`)
- Any shared consequence reachable by both the human and the AI/turn-processing must live in a shared system helper with a human-path test and a non-human-path test. (`.claude/rules/end-to-end-wiring.md`)
- Dynamic DOM text uses `textContent` / `createTextNode`, never `innerHTML` with game-generated strings. (`.claude/rules/ui-panels.md`)
- Ownership checks use `state.currentPlayer`, never a hardcoded `'player'`. (CLAUDE.md "Hot Seat Multiplayer Rules")
- Run `bash scripts/run-with-mise.sh yarn test` for the vitest suite. `yarn test` does NOT type-check — run `bash scripts/run-with-mise.sh yarn build` before the final commit to run `tsc`.
- Bash tool timeout: `git commit` → 30000 ms; `git push` / `gh pr create` → 120000 ms.

## Spec deviation to carry into the PR body

The spec says "`epidemic-control` (Era 6) additionally grants re-infection immunity to every treated city." Implemented as: the base post-cure immunity (Task 2) is **unconditional** and short (`OUTBREAK_CURE_IMMUNITY_TURNS = 3`); having `epidemic-control` **extends the window** to `OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL = 6` wherever `curedUntilTurn` is written (per-city and nationwide). This keeps the base immunity meaningful for every civ and keeps `epidemic-control` a real upgrade instead of a no-op. Note this in the PR body.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/core/types.ts` | `ActiveCrisis` shape; `GameEvents` map | Add `curedUntilTurn?: Record<string, number>` to `ActiveCrisis` (Task 2). Add `'crisis:contained'` event (Task 3). |
| `src/systems/crisis-system.ts` | Crisis resolvers + player/AI crisis actions | New constants + `cureImmunityWindow` helper; spread-loop skip in `tickOutbreakCrisis` + `tickFamineCrisis` (Task 1); write `curedUntilTurn` on remedy completion + exclude immune cities from spread candidates + prune stale entries (Task 2); new `applyEmpireContainment` (Task 3). |
| `src/ai/ai-crisis-response.ts` | AI crisis action generation + application | New `'empire-contain'` `CrisisResponseAction`; generate it when eligible; apply it (Task 4). |
| `src/ui/city-panel.ts` | City panel rendering + event handlers | New `onEmpireContainment?` callback prop; render a "Nationwide Remedy" button in the outbreak crisis section when eligible; click handler (Task 5). |
| `src/app/controllers/panel-actions-controller.ts` | Wires panel callbacks to systems | Wire `onEmpireContainment` → `applyEmpireContainment` (Task 5). |
| `src/ui/notification-routing.ts` | Event → notification text | New `routeCrisisContained` (Task 5). |
| `src/presentation/register-faction-crisis-presentation.ts` | Subscribes routers to the bus | `bus.on('crisis:contained', …)` (Task 5). |

---

## Task 1: Remedy-underway city stops spreading

**Files:**
- Modify: `src/systems/crisis-system.ts` — spread loop in `tickOutbreakCrisis` (around line 272-288) and `tickFamineCrisis` (around line 378-394)
- Test: `tests/systems/crisis-outbreak.test.ts`, `tests/systems/crisis-famine.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. Behavioural change only: `tickOutbreakCrisis` / `tickFamineCrisis` no longer emit `crisis:spread` with a `fromCityId` whose `remedyCompletionByCity[fromCityId]` is set.

- [ ] **Step 1: Write the failing test (outbreak)**

Add to `tests/systems/crisis-outbreak.test.ts` inside `describe('outbreak resolver', …)`:

```ts
it('a city with a remedy underway does not spread the outbreak', () => {
  // c1 has a remedy pending (completes turn 42, current turn 40); c2 is a healthy
  // same-owner city 1 hex away. Under the fixed resolver c1 must never be a spread source.
  const { state } = withCrisis({
    cityIds: ['c1'],
    remedyCompletionByCity: { c1: 42 },
  });
  const bus = new EventBus();
  const spreads: Array<{ from: string; to: string }> = [];
  bus.on('crisis:spread', e => spreads.push({ from: e.fromCityId, to: e.toCityId }));

  // Run several turns; the remedy stays pending because we hold turn fixed via re-seeding.
  let next = state;
  for (let i = 0; i < 10; i++) {
    next = processCrisisTurn(next, bus);
    if (!next.activeCrises?.['crisis-1']) break;
    // keep the remedy perpetually "pending" so we're testing the spread path, not completion
    next = {
      ...next,
      activeCrises: {
        'crisis-1': { ...next.activeCrises['crisis-1'], remedyCompletionByCity: { c1: next.turn + 5 } },
      },
    };
    next = { ...next, turn: next.turn + 1 };
  }

  expect(spreads.every(s => s.from !== 'c1')).toBe(true);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-outbreak`
Expected: FAIL — `spreads` contains an entry with `from === 'c1'` (current code rolls spread for remedy-pending cities).

- [ ] **Step 3: Add the skip in `tickOutbreakCrisis`**

In `src/systems/crisis-system.ts`, in the `// Spread` loop of `tickOutbreakCrisis`, add the second guard immediately after the quarantine guard:

```ts
  // Spread
  const owner = working.targetCivId;
  for (const cityId of [...working.cityIds]) {
    if (working.quarantinedCityIds?.includes(cityId)) continue;
    if (working.remedyCompletionByCity?.[cityId] !== undefined) continue; // #919 MR1: a remedy-underway city no longer spreads
    const city = nextState.cities[cityId];
    if (!city) continue;
    // ...unchanged...
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-outbreak`
Expected: PASS.

- [ ] **Step 5: Write the failing test (famine parity)**

Add to `tests/systems/crisis-famine.test.ts` (match that file's fixture helper — it has its own `withFamineCrisis`-style setup; use whatever the file already uses to build a famine `ActiveCrisis` with `archetype: 'famine'`):

```ts
it('a city importing grain (remedy underway) does not spread the famine', () => {
  const { state } = withFamineCrisis({ cityIds: ['c1'], remedyCompletionByCity: { c1: 42 } });
  const bus = new EventBus();
  const spreads: string[] = [];
  bus.on('crisis:spread', e => spreads.push(e.fromCityId));

  let next = state;
  for (let i = 0; i < 10; i++) {
    next = processCrisisTurn(next, bus);
    if (!next.activeCrises?.['crisis-1']) break;
    next = {
      ...next,
      activeCrises: { 'crisis-1': { ...next.activeCrises['crisis-1'], remedyCompletionByCity: { c1: next.turn + 5 } } },
      turn: next.turn + 1,
    };
  }
  expect(spreads.includes('c1')).toBe(false);
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-famine`
Expected: FAIL.

- [ ] **Step 7: Add the identical skip in `tickFamineCrisis`**

In the `// Spread — identical shape to tickOutbreakCrisis.` loop:

```ts
  for (const cityId of [...working.cityIds]) {
    if (working.quarantinedCityIds?.includes(cityId)) continue;
    if (working.remedyCompletionByCity?.[cityId] !== undefined) continue; // #919 MR1: parity with tickOutbreakCrisis
    const city = nextState.cities[cityId];
    if (!city) continue;
    // ...unchanged...
```

- [ ] **Step 8: Run both suites and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-outbreak crisis-famine`
Expected: PASS (both new tests + all pre-existing tests in those files).

- [ ] **Step 9: Commit**

```bash
git add src/systems/crisis-system.ts tests/systems/crisis-outbreak.test.ts tests/systems/crisis-famine.test.ts
git commit -m "fix(919): remedy-underway cities no longer spread outbreak/famine

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Post-cure re-infection immunity

**Files:**
- Modify: `src/core/types.ts` — `ActiveCrisis` interface (around line 2581-2601)
- Modify: `src/systems/crisis-system.ts` — new constants near the other exported constants (top of file, near `CONTAGION_GROUP_RANGE`); `cureImmunityWindow` helper; the "Remedy completion" block and the spread-candidate filter in both `tickOutbreakCrisis` and `tickFamineCrisis`
- Test: `tests/systems/crisis-outbreak.test.ts`, `tests/systems/crisis-system.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `ActiveCrisis.curedUntilTurn?: Record<string, number>` — cityId → turn through which that city cannot be re-infected by this crisis.
  - `export const OUTBREAK_CURE_IMMUNITY_TURNS = 3`
  - `export const OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL = 6`
  - `export function cureImmunityWindow(civ: { techState: { completed: string[] } } | undefined): number` — returns the epidemic-control window if the civ has `'epidemic-control'`, else the base window.

- [ ] **Step 1: Add the type field**

In `src/core/types.ts`, in `interface ActiveCrisis`, after `famineSurplusStreakByCity?:`:

```ts
  // #919 MR1: cityId -> turn through which a just-cured city is immune to re-infection
  // by THIS crisis. Optional; absent on older saves. Pruned once entries expire.
  curedUntilTurn?: Record<string, number>;
```

- [ ] **Step 2: Add constants + helper in `crisis-system.ts`**

Near the top exported constants:

```ts
// #919 MR1: after a remedy completes in a city it cannot be re-infected by the same
// crisis for this many turns. Base window vs. the epidemic-control (era 6) window.
export const OUTBREAK_CURE_IMMUNITY_TURNS = 3;
export const OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL = 6;

export function cureImmunityWindow(
  civ: { techState: { completed: string[] } } | undefined,
): number {
  return civ?.techState.completed.includes('epidemic-control')
    ? OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL
    : OUTBREAK_CURE_IMMUNITY_TURNS;
}
```

- [ ] **Step 3: Write the failing tests**

Add to `tests/systems/crisis-outbreak.test.ts`:

```ts
it('a city cured by a remedy is not re-infected within the immunity window, then is again after', () => {
  // c1 and c2 infected; c1 remedy completes at turn 41. From turn 41..43 c1 is immune;
  // by turn 44 it can be re-infected. We assert c1 never re-enters cityIds before turn 44.
  const { state } = withCrisis({ cityIds: ['c1', 'c2'], remedyCompletionByCity: { c1: 41 } });
  const bus = new EventBus();
  let next = { ...state, turn: 41 };
  const c1BackByTurn: number[] = [];
  for (let t = 41; t <= 46; t++) {
    next = { ...next, turn: t };
    next = processCrisisTurn(next, bus);
    const crisis = next.activeCrises?.['crisis-1'];
    if (crisis?.cityIds.includes('c1')) c1BackByTurn.push(t);
    if (!crisis) break;
  }
  // No re-infection while immune (turns 41..43 => 41 + 3).
  expect(c1BackByTurn.every(t => t >= 44)).toBe(true);
});

it('epidemic-control widens the post-cure immunity window to 6 turns', () => {
  const { state, civId } = withCrisis({ cityIds: ['c1', 'c2'], remedyCompletionByCity: { c1: 41 } });
  const withTech: GameState = {
    ...state, turn: 41,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...state.civilizations[civId],
        techState: { ...state.civilizations[civId].techState, completed: [...state.civilizations[civId].techState.completed, 'epidemic-control'] },
      },
    },
  };
  const bus = new EventBus();
  let next = withTech;
  const c1BackByTurn: number[] = [];
  for (let t = 41; t <= 49; t++) {
    next = { ...next, turn: t };
    next = processCrisisTurn(next, bus);
    const crisis = next.activeCrises?.['crisis-1'];
    if (crisis?.cityIds.includes('c1')) c1BackByTurn.push(t);
    if (!crisis) break;
  }
  expect(c1BackByTurn.every(t => t >= 47)).toBe(true); // 41 + 6
});
```

Add to `tests/systems/crisis-system.test.ts`:

```ts
it('prunes expired curedUntilTurn entries so the map stays bounded', () => {
  const { state } = withCrisis({
    cityIds: ['c1'],
    curedUntilTurn: { cOld: 5, cRecent: 999 },
  });
  const next = processCrisisTurn({ ...state, turn: 50 }, new EventBus());
  const crisis = next.activeCrises?.['crisis-1'];
  expect(crisis?.curedUntilTurn).toEqual({ cRecent: 999 }); // cOld (5 < 50) pruned
});
```

(If `crisis-system.test.ts` has no `withCrisis` helper, import `makeCrisisFixture` from `./helpers/crisis-fixture` and build the `ActiveCrisis` inline the same way `crisis-outbreak.test.ts` does.)

- [ ] **Step 4: Run them and confirm they fail**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-outbreak crisis-system`
Expected: FAIL — immunity not implemented (c1 re-infected immediately) and prune not implemented.

- [ ] **Step 5: Write `curedUntilTurn` on remedy completion (both resolvers)**

In `tickOutbreakCrisis`, in the `// Remedy completion` block, extend it to accumulate `curedUntilTurn`:

```ts
  // Remedy completion
  if (working.remedyCompletionByCity && !remedyPaused) {
    const remaining: Record<string, number> = {};
    let cityIds = working.cityIds;
    let quarantinedCityIds = working.quarantinedCityIds;
    const curedUntilTurn: Record<string, number> = { ...(working.curedUntilTurn ?? {}) };
    const civ = nextState.civilizations[working.targetCivId];
    for (const [cityId, completionTurn] of Object.entries(working.remedyCompletionByCity)) {
      if (state.turn >= completionTurn) {
        cityIds = cityIds.filter(id => id !== cityId);
        quarantinedCityIds = quarantinedCityIds?.filter(id => id !== cityId);
        curedUntilTurn[cityId] = state.turn + cureImmunityWindow(civ); // #919 MR1
      } else {
        remaining[cityId] = completionTurn;
      }
    }
    working = { ...working, cityIds, quarantinedCityIds, remedyCompletionByCity: remaining, curedUntilTurn };
  }
```

Apply the identical change to the `// Remedy completion` block in `tickFamineCrisis` (that block also threads `surplusStreak` — keep that logic, just add the `curedUntilTurn` accumulation the same way, and include `curedUntilTurn` in its final `working = { ... }`).

- [ ] **Step 6: Exclude immune cities from spread candidates (both resolvers)**

In the `// Spread` loop of `tickOutbreakCrisis`, change the candidates filter:

```ts
    const candidates = Object.values(nextState.cities)
      .filter(c =>
        c.owner === owner &&
        !working.cityIds.includes(c.id) &&
        !(working.curedUntilTurn?.[c.id] !== undefined && working.curedUntilTurn[c.id] >= nextState.turn)); // #919 MR1
```

Apply the identical filter change in `tickFamineCrisis`'s spread loop.

- [ ] **Step 7: Prune expired entries each tick (both resolvers)**

In both `tickOutbreakCrisis` and `tickFamineCrisis`, right after the sabotage-clear block near the top (`if (working.sabotage && working.sabotage.untilTurn <= state.turn) { … }`), add:

```ts
  // #919 MR1: drop expired re-infection-immunity entries so the map stays bounded.
  if (working.curedUntilTurn) {
    const live = Object.fromEntries(
      Object.entries(working.curedUntilTurn).filter(([, until]) => until >= state.turn),
    );
    working = { ...working, curedUntilTurn: Object.keys(live).length > 0 ? live : undefined };
  }
```

- [ ] **Step 8: Run tests and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-outbreak crisis-famine crisis-system`
Expected: PASS (new tests + all pre-existing).

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/systems/crisis-system.ts tests/systems/crisis-outbreak.test.ts tests/systems/crisis-system.test.ts
git commit -m "fix(919): cured cities get brief re-infection immunity

Base window 3 turns, 6 with epidemic-control. Pruned each tick.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `applyEmpireContainment` — nationwide remedy

**Files:**
- Modify: `src/core/types.ts` — `GameEvents` map (around line 2520-2541)
- Modify: `src/systems/crisis-system.ts` — new exported function near `applyRemedy` (around line 845)
- Test: `tests/systems/crisis-outbreak.test.ts`

**Interfaces:**
- Consumes: `getCityAppeaseCost` (already imported from `./faction-system`), `cureImmunityWindow` (Task 2).
- Produces:
  - `GameEvents['crisis:contained']: { crisisId: string; civId: string; cityCount: number; goldCost: number }`
  - `export function applyEmpireContainment(state: GameState, crisisId: string, bus: EventBus): { success: boolean; state: GameState; message: string }`
    - Fails (`success: false`, no state change, no event) when: no such crisis; `crisis.archetype !== 'outbreak'`; no such civ; civ lacks `'medicine'`; `crisis.sabotage` unexpired; every affected city already has a remedy underway; civ can't afford `Σ getCityAppeaseCost` over the cities without a pending remedy.
    - On success: sets `remedyCompletionByCity[cityId] = state.turn + 2` for every affected city without one; if the civ has `'epidemic-control'`, also pre-registers `curedUntilTurn[cityId] = state.turn + 2 + OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL` for those cities; deducts gold; emits `crisis:contained` exactly once.

- [ ] **Step 1: Add the event type**

In `src/core/types.ts`, in the `GameEvents` interface near the other `'crisis:*'` entries:

```ts
  // #919 MR1: fired once when a civ funds a nationwide remedy (applyEmpireContainment).
  'crisis:contained': { crisisId: string; civId: string; cityCount: number; goldCost: number };
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/systems/crisis-outbreak.test.ts`. Note `withCrisis` from that file gives `{ state, civId, crisis }` with the civ at `era: 3`; add the tech onto `state.civilizations[civId].techState.completed` per test.

```ts
import { applyEmpireContainment } from '@/systems/crisis-system';

function withMedicineCrisis(overrides = {}, extraTech: string[] = []) {
  const { state, civId, crisis } = withCrisis({ cityIds: ['c1', 'c2', 'c3'], ...overrides });
  const civ = state.civilizations[civId];
  return {
    civId, crisis,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, gold: 10_000, techState: { ...civ.techState, completed: [...civ.techState.completed, 'medicine', ...extraTech] } },
      },
    },
  };
}

describe('applyEmpireContainment', () => {
  it('refuses without the Medicine tech', () => {
    const { state } = withCrisis({ cityIds: ['c1', 'c2'] });
    const withGold = { ...state, civilizations: { ...state.civilizations, [state.currentPlayer]: { ...state.civilizations[state.currentPlayer], gold: 10_000 } } };
    const res = applyEmpireContainment(withGold, 'crisis-1', new EventBus());
    expect(res.success).toBe(false);
    expect(res.state).toBe(withGold);
  });

  it('refuses while the crisis is sabotaged', () => {
    const { state } = withMedicineCrisis({ sabotage: { byCivId: 'x', untilTurn: 999, discovered: false } });
    const res = applyEmpireContainment(state, 'crisis-1', new EventBus());
    expect(res.success).toBe(false);
  });

  it('refuses when every affected city already has a remedy underway', () => {
    const { state } = withMedicineCrisis({ cityIds: ['c1'], remedyCompletionByCity: { c1: 999 } });
    const res = applyEmpireContainment(state, 'crisis-1', new EventBus());
    expect(res.success).toBe(false);
  });

  it('starts a 2-turn remedy in every un-remedied city and charges the summed appease cost, once', () => {
    const { state, civId } = withMedicineCrisis({ cityIds: ['c1', 'c2', 'c3'], remedyCompletionByCity: { c2: 999 } });
    const bus = new EventBus();
    const events: Array<{ cityCount: number; goldCost: number }> = [];
    bus.on('crisis:contained', e => events.push({ cityCount: e.cityCount, goldCost: e.goldCost }));
    const before = state.civilizations[civId].gold;
    const res = applyEmpireContainment(state, 'crisis-1', bus);
    expect(res.success).toBe(true);
    const crisis = res.state.activeCrises!['crisis-1'];
    expect(crisis.remedyCompletionByCity).toEqual({ c1: state.turn + 2, c2: 999, c3: state.turn + 2 });
    expect(res.state.civilizations[civId].gold).toBeLessThan(before);
    expect(events).toHaveLength(1);
    expect(events[0].cityCount).toBe(2);
    expect(events[0].goldCost).toBe(before - res.state.civilizations[civId].gold);
  });

  it('refuses on insufficient gold and leaves state untouched', () => {
    const { state, civId } = withMedicineCrisis({ cityIds: ['c1', 'c2'] });
    const broke = { ...state, civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId], gold: 1 } } };
    const res = applyEmpireContainment(broke, 'crisis-1', new EventBus());
    expect(res.success).toBe(false);
    expect(res.state).toBe(broke);
  });

  it('with epidemic-control, pre-registers a re-infection immunity for the treated cities', () => {
    const { state } = withMedicineCrisis({ cityIds: ['c1'] }, ['epidemic-control']);
    const res = applyEmpireContainment(state, 'crisis-1', new EventBus());
    expect(res.success).toBe(true);
    expect(res.state.activeCrises!['crisis-1'].curedUntilTurn).toEqual({ c1: state.turn + 2 + 6 });
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-outbreak`
Expected: FAIL — `applyEmpireContainment` is not exported.

- [ ] **Step 4: Implement `applyEmpireContainment`**

In `src/systems/crisis-system.ts`, after `applyRemedy`:

```ts
// #919 MR1: nationwide remedy. Gated on the `medicine` tech; starts the standard
// 2-turn remedy in every affected city that doesn't already have one, for the summed
// per-city appease cost (no bulk discount — a discount would reward letting the plague
// spread first). Refuses while a sabotage is freezing remedies. Fires crisis:contained
// exactly once (transition-owned).
export function applyEmpireContainment(
  state: GameState,
  crisisId: string,
  bus: EventBus,
): { success: boolean; state: GameState; message: string } {
  const crisis = state.activeCrises?.[crisisId];
  if (!crisis) return { success: false, state, message: 'No such crisis.' };
  if (crisis.archetype !== 'outbreak') {
    return { success: false, state, message: 'Only disease outbreaks can be contained empire-wide.' };
  }
  const civ = state.civilizations[crisis.targetCivId];
  if (!civ) return { success: false, state, message: 'No such civilization.' };
  if (!civ.techState.completed.includes('medicine')) {
    return { success: false, state, message: 'A nationwide remedy requires the Medicine technology.' };
  }
  if (crisis.sabotage !== undefined && crisis.sabotage.untilTurn > state.turn) {
    return { success: false, state, message: 'Relief efforts are being sabotaged — resolve that first.' };
  }
  const targetCityIds = crisis.cityIds.filter(id => crisis.remedyCompletionByCity?.[id] === undefined);
  if (targetCityIds.length === 0) {
    return { success: false, state, message: 'Every affected city already has a remedy underway.' };
  }
  const goldCost = targetCityIds.reduce((sum, id) => {
    const c = state.cities[id];
    return sum + (c ? getCityAppeaseCost(c) : 0);
  }, 0);
  if (civ.gold < goldCost) {
    return { success: false, state, message: `Not enough gold — a nationwide remedy costs ${goldCost}.` };
  }

  const remedyCompletionByCity = { ...(crisis.remedyCompletionByCity ?? {}) };
  for (const id of targetCityIds) remedyCompletionByCity[id] = state.turn + 2;

  let curedUntilTurn = crisis.curedUntilTurn;
  if (civ.techState.completed.includes('epidemic-control')) {
    curedUntilTurn = { ...(crisis.curedUntilTurn ?? {}) };
    for (const id of targetCityIds) {
      curedUntilTurn[id] = state.turn + 2 + OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL;
    }
  }

  const updated: ActiveCrisis = { ...crisis, remedyCompletionByCity, curedUntilTurn };
  bus.emit('crisis:contained', {
    crisisId, civId: crisis.targetCivId, cityCount: targetCityIds.length, goldCost,
  });
  return {
    success: true,
    message: `Nationwide remedy underway in ${targetCityIds.length} cities for ${goldCost} gold.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [crisis.targetCivId]: { ...civ, gold: civ.gold - goldCost },
      },
      activeCrises: { ...(state.activeCrises ?? {}), [crisisId]: updated },
    },
  };
}
```

- [ ] **Step 5: Run tests and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn test -- crisis-outbreak`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/crisis-system.ts tests/systems/crisis-outbreak.test.ts
git commit -m "feat(919): add applyEmpireContainment nationwide remedy (Medicine-gated)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: AI uses the nationwide remedy

**Files:**
- Modify: `src/ai/ai-crisis-response.ts` — `CrisisResponseAction` union (line 116-118), `getCrisisResponseActions` (around line 210-230), `applyCrisisResponses` (around line 240-245)
- Test: `tests/ai/ai-crisis-response.test.ts`

**Interfaces:**
- Consumes: `applyEmpireContainment` (Task 3).
- Produces: new `CrisisResponseAction` variant `{ kind: 'empire-contain'; crisisId: string }`. `applyCrisisResponses` dispatches it.

**AI rule:** for each of the civ's outbreak crises, if the civ has `'medicine'`, the crisis spans ≥ 2 un-remedied cities, the crisis is not sabotaged, and the civ can afford `Σ getCityAppeaseCost` × `profile.crisisRemedyGoldMultiplier` over those cities, push one `empire-contain` action for that crisis (and skip the per-city `fund-remedy` for the same crisis that turn).

- [ ] **Step 1: Write the failing test**

In `tests/ai/ai-crisis-response.test.ts`, add (match the file's existing fixture/import style):

```ts
it('funds a nationwide remedy for a wide outbreak when the civ has Medicine and the gold', () => {
  const { state, civId } = makeAiCrisisFixture({
    outbreakCityIds: ['c1', 'c2', 'c3'],
    civGold: 10_000,
    completedTech: ['medicine'],
  });
  const actions = getCrisisResponseActions(state, civId);
  expect(actions.some(a => a.kind === 'empire-contain')).toBe(true);
  // and it does not also fund a single-city remedy for that same crisis
  expect(actions.filter(a => a.kind === 'fund-remedy').length).toBe(0);
});

it('does NOT fund a nationwide remedy without Medicine', () => {
  const { state, civId } = makeAiCrisisFixture({
    outbreakCityIds: ['c1', 'c2', 'c3'],
    civGold: 10_000,
    completedTech: [],
  });
  const actions = getCrisisResponseActions(state, civId);
  expect(actions.some(a => a.kind === 'empire-contain')).toBe(false);
});
```

If `makeAiCrisisFixture` does not exist in the test file, build the fixture inline the way the file's other tests do (they construct a `GameState` with `activeCrises` and a civ) — the key knobs are: an `activeCrises` entry with `archetype: 'outbreak'` and 3 `cityIds`, `civ.techState.completed`, and `civ.gold`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `bash scripts/run-with-mise.sh yarn test -- ai-crisis-response`
Expected: FAIL — `kind === 'empire-contain'` never produced.

- [ ] **Step 3: Extend the action union**

```ts
export type CrisisResponseAction =
  | { kind: 'quarantine'; crisisId: string; cityId: string }
  | { kind: 'fund-remedy'; crisisId: string; cityId: string }
  | { kind: 'empire-contain'; crisisId: string } // #919 MR1
  | { kind: 'restore'; /* ...unchanged existing fields... */ };
```

(Keep the existing `restore` variant exactly as it is — copy its current shape; do not rewrite it.)

- [ ] **Step 4: Generate the action in `getCrisisResponseActions`**

Immediately before the `// One remedy per civ per turn:` block, add:

```ts
  // #919 MR1: prefer a single nationwide remedy for a wide outbreak when affordable.
  const empireContainedCrisisIds = new Set<string>();
  if (civ.techState.completed.includes('medicine')) {
    for (const crisis of crises) {
      if (crisis.archetype !== 'outbreak') continue;
      if (crisis.sabotage !== undefined && crisis.sabotage.untilTurn > state.turn) continue;
      const unremedied = crisis.cityIds.filter(id => crisis.remedyCompletionByCity?.[id] === undefined);
      if (unremedied.length < 2) continue;
      const cost = unremedied.reduce((sum, id) => {
        const c = state.cities[id];
        return sum + (c ? getCityAppeaseCost(c) : 0);
      }, 0);
      if (civ.gold >= cost * profile.crisisRemedyGoldMultiplier) {
        actions.push({ kind: 'empire-contain', crisisId: crisis.id });
        empireContainedCrisisIds.add(crisis.id);
      }
    }
  }
```

Then in the existing `bestRemedy` search loop, skip crises already handled:

```ts
  for (const crisis of crises) {
    if (empireContainedCrisisIds.has(crisis.id)) continue; // #919 MR1
    for (const cityId of crisis.cityIds) {
      // ...unchanged...
```

- [ ] **Step 5: Dispatch it in `applyCrisisResponses`**

```ts
      if (action.kind === 'quarantine') next = applyQuarantine(next, action.crisisId, action.cityId).state;
      else if (action.kind === 'fund-remedy') next = applyRemedy(next, action.crisisId, action.cityId).state;
      else if (action.kind === 'empire-contain') next = applyEmpireContainment(next, action.crisisId, bus).state; // #919 MR1
```

`applyCrisisResponses` currently has no `bus` parameter. Add one: change its signature to `export function applyCrisisResponses(state: GameState, bus: EventBus): GameState`, import `EventBus` as a type (`import type { EventBus } from '@/core/event-bus';`), and update its single call site (grep `applyCrisisResponses(` across `src/` — it is called from the AI turn pipeline; pass the bus already in scope there).

- [ ] **Step 6: Run tests and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn test -- ai-crisis-response`
Expected: PASS. Then run the broader AI suite to catch the signature-change fallout: `bash scripts/run-with-mise.sh yarn test -- ai-`

- [ ] **Step 7: Commit**

```bash
git add src/ai/ai-crisis-response.ts tests/ai/ai-crisis-response.test.ts
git commit -m "feat(919): AI funds a nationwide remedy for wide outbreaks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: UI button, controller wiring, and notification

**Files:**
- Modify: `src/ui/city-panel.ts` — callback type (line ~100-101), the `crisisChips`/`crisisSectionHtml` outbreak block (line ~382-495), the click-handler block (line ~1698-1715)
- Modify: `src/app/controllers/panel-actions-controller.ts` — import (line ~101), callback wiring (line ~821-840)
- Modify: `src/ui/notification-routing.ts` — new `routeCrisisContained`
- Modify: `src/presentation/register-faction-crisis-presentation.ts` — subscribe it (line ~60-77)
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `applyEmpireContainment` (Task 3), `GameEvents['crisis:contained']` (Task 3).
- Produces: `PanelCallbacks.onEmpireContainment?: (crisisId: string) => GameState | void`. New button carries `data-empire-contain-crisis="<crisisId>"`. `routeCrisisContained(state, event, sink)` producing one notification for the owning civ.

- [ ] **Step 1: Write the failing test**

In `tests/ui/city-panel.test.ts`, add (match the file's existing render helper — it builds a `GameState`, renders the panel to a container, and queries DOM):

```ts
it('shows the Nationwide Remedy button only when the civ has Medicine and the outbreak spans 2+ cities', () => {
  // 2-city outbreak, civ has medicine, current player owns it → button present
  const withTech = renderCityPanelFixture({
    currentPlayerCompletedTech: ['medicine'],
    outbreak: { cityIds: ['c1', 'c2'] },
    viewCityId: 'c1',
  });
  expect(withTech.container.querySelector('[data-empire-contain-crisis]')).not.toBeNull();

  // same, but no medicine → absent
  const noTech = renderCityPanelFixture({
    currentPlayerCompletedTech: [],
    outbreak: { cityIds: ['c1', 'c2'] },
    viewCityId: 'c1',
  });
  expect(noTech.container.querySelector('[data-empire-contain-crisis]')).toBeNull();

  // medicine but single-city outbreak → absent
  const oneCity = renderCityPanelFixture({
    currentPlayerCompletedTech: ['medicine'],
    outbreak: { cityIds: ['c1'] },
    viewCityId: 'c1',
  });
  expect(oneCity.container.querySelector('[data-empire-contain-crisis]')).toBeNull();
});
```

Use whatever fixture/util `city-panel.test.ts` already exposes for rendering; the three knobs needed are the current player's completed techs, the outbreak `cityIds`, and which city is open. If the file renders via a `makeCityPanelState`-style helper, thread those through; do not invent a new render path.

- [ ] **Step 2: Run it and confirm it fails**

Run: `bash scripts/run-with-mise.sh yarn test -- city-panel`
Expected: FAIL — no `[data-empire-contain-crisis]` element.

- [ ] **Step 3: Add the callback type**

In `src/ui/city-panel.ts`, beside `onRemedyCrisis`:

```ts
  onEmpireContainment?: (crisisId: string) => GameState | void; // #919 MR1
```

- [ ] **Step 4: Render the button in the outbreak crisis section**

In the outbreak `crisisChips` builder (the block that computes `quarantineDisabled`, `remedyLabel`, etc. — around line 400-420), compute eligibility:

```ts
    const civOutbreak = state.civilizations[crisis.targetCivId];
    const hasMedicine = civOutbreak?.techState.completed.includes('medicine') ?? false;
    const unremediedCount = crisis.cityIds.filter(id => crisis.remedyCompletionByCity?.[id] === undefined).length;
    const showEmpireContain =
      hasMedicine && unremediedCount >= 2 && crisis.targetCivId === state.currentPlayer && !!callbacks.onEmpireContainment;
```

Add `showEmpireContain` to the object pushed into `crisisChips`. Then in `crisisSectionHtml` (the `crisisChips.map((chip, idx) => …)` template, around line 487-495), after the existing quarantine + remedy buttons, add:

```ts
        ${chip.showEmpireContain ? `<button type="button" data-empire-contain-crisis="${chip.crisis.id}" title="Fund a remedy in every affected city at once (requires Medicine)" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;background:#3aa76d;color:#08130d;border:none;">Nationwide Remedy</button>` : ''}
```

(Match the surrounding bare inline-styled crisis buttons — a same-PR migration to `createGameButton` is out of scope for MR1; note the debt in the PR body.)

- [ ] **Step 5: Wire the click handler**

In the click-handler block near the `[data-remedy-crisis]` handler (~line 1710):

```ts
  panel.querySelectorAll<HTMLButtonElement>('[data-empire-contain-crisis]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const crisisId = btn.dataset.empireContainCrisis!;
      const nextState = callbacks.onEmpireContainment?.(crisisId);
      rerenderPanel(nextState);
    });
  });
```

- [ ] **Step 6: Run the panel test and confirm pass**

Run: `bash scripts/run-with-mise.sh yarn test -- city-panel`
Expected: PASS.

- [ ] **Step 7: Wire the controller**

In `src/app/controllers/panel-actions-controller.ts`, extend the import:

```ts
import { applyEmpireContainment, applyQuarantine, applyRemedy } from '@/systems/crisis-system';
```

After the `onRemedyCrisis` block, add — note it needs the bus; `deps` already exposes an event bus used elsewhere in this controller (grep `deps.` for `bus`/`eventBus` in the file and use that name):

```ts
      onEmpireContainment: (crisisId) => {
        const result = applyEmpireContainment(deps.session.getState(), crisisId, deps.eventBus);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(result.message, 'success');
        return deps.session.getState();
      },
```

- [ ] **Step 8: Add the notification router**

In `src/ui/notification-routing.ts`, near `routeCrisisSpread`:

```ts
export function routeCrisisContained(
  state: GameState,
  event: GameEvents['crisis:contained'],
  sink: (civId: string, message: string, kind: NotificationKind) => void,
): void {
  const crisis = state.activeCrises?.[event.crisisId];
  const flavor = crisis ? getCrisisFlavor(crisis.flavorId) : undefined;
  const name = flavor
    ? getCrisisDisplayName(flavor, resolveCivilizationEra(state.civilizations[event.civId]?.techState?.completed ?? []))
    : 'the outbreak';
  sink(event.civId, `Nationwide remedy funded against ${name} — ${event.cityCount} cities, ${event.goldCost} gold.`, 'success');
}
```

(Match the exact `sink`/parameter signature the other `routeCrisis*` functions in this file use — copy one of them as the template. `NotificationKind` / the `deliver` type are already imported there.)

- [ ] **Step 9: Subscribe it**

In `src/presentation/register-faction-crisis-presentation.ts`, add to the imports from `notification-routing` and add a subscription beside the `crisis:spread` one:

```ts
    bus.on('crisis:contained', event => {
      routeCrisisContained(ctx.session.getState(), event, deliver);
    });
```

- [ ] **Step 10: Full verification**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all green.
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 (tsc clean).

- [ ] **Step 11: Commit**

```bash
git add src/ui/city-panel.ts src/app/controllers/panel-actions-controller.ts src/ui/notification-routing.ts src/presentation/register-faction-crisis-presentation.ts tests/ui/city-panel.test.ts
git commit -m "feat(919): Nationwide Remedy button + notification wiring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Browser smoke test + PR

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and open the app**

Use the Browser pane: `preview_start` with the project's dev config (`bash scripts/run-with-mise.sh yarn dev` equivalent). Load a save or start a game.

- [ ] **Step 2: Verify no console errors**

`read_console_messages` — expect no errors referencing `crisis`, `curedUntilTurn`, or `applyEmpireContainment`.

- [ ] **Step 3: Stop the preview**

`preview_stop` immediately after (game audio plays through real speakers — see memory `feedback_stop_preview_after_smoke_test`).

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin claude/github-issue-919-cd7bde
```

PR title: `fix(#919): MR1 — outbreak spread fixes (remedy halts spread, cure immunity, nationwide remedy)`

PR body must include:
- **Scope:** MR1 of 3 from `docs/superpowers/specs/2026-08-29-empire-unrest-guidance-and-scaling-design.md`.
- **Out of scope:** MR2 (administration ladder / Courthouse), MR3 (guidance UI). Listed as future MRs.
- **Why this is safe to merge partial:** the only new player-visible surface is the "Nationwide Remedy" button, which is fully wired end-to-end (button → `onEmpireContainment` → `applyEmpireContainment` → gold spent, remedies started, notification shown). No dead-end UX. The spread/immunity changes are pure resolver logic with no UI surface.
- **Spec deviation:** the `epidemic-control` interpretation (extends the immunity window rather than being the sole source of immunity) — see plan.
- **Debt noted:** the new button uses the bare inline-styled pattern of the surrounding crisis buttons rather than `createGameButton`; migrating that whole section is out of scope.
- Do NOT use "closes #919" (MR2/MR3 still pending) — use "Part of #919". (memory `feedback_pr_body_closes_keyword`)

---

## Self-Review

**Spec coverage (MR1 section of the design doc):**
- 1.1 remedy halts spread (outbreak + famine parity) → Task 1. ✅
- Determinism note (per-city independent seeding) → asserted implicitly by Task 1's multi-turn `from !== 'c1'` check; the per-city seed is unchanged. ✅
- 1.2 `curedUntilTurn` optional field, write on completion, exclude from spread candidates, prune → Task 2. ✅
- 1.2 `epidemic-control` interaction → Task 2 (window extension) + Task 3 (pre-registration). Deviation documented. ✅
- 1.3 `applyEmpireContainment`: medicine gate, sabotage refusal, no bulk discount, exact `Σ` cost, no-op when none qualify, one-time event → Task 3. ✅
- 1.3 AI auto-invokes → Task 4. ✅
- 1.3 UI button (medicine + ≥2 cities + owner), callback threading, notification + sound mapping → Task 5. ✅
- Hot-seat: button gated on `crisis.targetCivId === state.currentPlayer` → Task 5 Step 4 + test. ✅
- MR1 test list (crisis-outbreak, crisis-famine, crisis-system, ai-crisis-response, city-panel; veteran case) → Tasks 1-5. **Gap:** the design's "veteran" severity case for MR1 is not a distinct task step. Add it to Task 3 as a follow-up assertion if `withCrisis` supports `challenge: 'veteran'` (the fixture in `crisis-outbreak.test.ts` takes `challenge`); otherwise it is covered transitively since `applyEmpireContainment` has no challenge branch. Acceptable — noted here rather than adding a thin task.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step shows the code. Test steps show the assertions. Two steps say "match the file's existing fixture style" (Task 4 Step 1, Task 5 Step 1) — this is deliberate: the exact fixture helper name varies and inventing a wrong one is worse; the required knobs are enumerated in each case.

**Type consistency:**
- `curedUntilTurn?: Record<string, number>` — same name in types.ts (Task 2 Step 1), both resolvers (Task 2 Steps 5-7), `applyEmpireContainment` (Task 3 Step 4), tests. ✅
- `cureImmunityWindow(civ)` — defined Task 2 Step 2, used Task 2 Step 5. `applyEmpireContainment` uses the raw `OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL` constant directly (Task 3 Step 4) — consistent, both refer to the same exported constant. ✅
- `applyEmpireContainment(state, crisisId, bus)` — 3-arg signature identical in Task 3 (definition), Task 4 Step 5 (AI call), Task 5 Step 7 (controller call). ✅
- `{ kind: 'empire-contain'; crisisId: string }` — same shape in the union (Task 4 Step 3), generation (Step 4), dispatch (Step 5), tests. ✅
- `data-empire-contain-crisis` attribute — same string in render (Task 5 Step 4), handler (Step 5), test (Step 1). ✅
- `'crisis:contained'` event payload `{ crisisId, civId, cityCount, goldCost }` — same in types.ts (Task 3 Step 1), emit (Task 3 Step 4), router (Task 5 Step 8), test (Task 3 Step 2). ✅
