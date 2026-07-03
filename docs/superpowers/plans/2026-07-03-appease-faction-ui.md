# Appease Faction UI (#436) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the player a way to spend gold to reduce city unrest — the mechanic already exists and the AI already uses it, but there is no player-facing entry point anywhere in the UI.

**Architecture:** Extract the AI's existing inline appease logic (`basic-ai.ts:886-901`) into a shared `appeaseFaction()` helper in `faction-system.ts`, matching the `rushBuyActiveProduction`/`RushBuyResult` shape already established in `economy-system.ts` for the closest analogous action (a gold-spending city action with a disabled-reason UI). Add a new conditional section to the city panel's template-string HTML (matching its existing `economy-strain` conditional-section convention), wired the same way the panel's existing `rush-buy` button is wired (`data-*` attribute → `querySelectorAll` → `callbacks.onX(cityId)` → `rerenderPanel(nextState)`). Add a per-turn spam-click guard (`City.appeasedOnTurn`) so a human player can't out-appease the AI's own once-per-turn cadence.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

## Global Constraints
- `appeaseFaction` return shape mirrors `RushBuyResult` exactly: `{ success: boolean; state: GameState; message: string }` — not the `{ applied: boolean }` shape used earlier in planning, for consistency with the codebase's one existing precedent for this exact class of action.
- No `EventBus` parameter on `appeaseFaction` — the AI's existing inline version emits no event, and neither does `rushBuyActiveProduction`'s player path (it reports outcome via the return value only). Preserve that, don't add new event plumbing that wasn't there before.
- The city panel is a destroy-and-rebuild-on-every-interaction architecture (`rerenderPanel` at `city-panel.ts:745` calls `panel.remove()` then re-invokes `createCityPanel(...)`) — every new callback follows the existing `(cityId) => GameState | void` + `rerenderPanel(nextState)` pattern, not a new incremental-DOM-patch approach.
- Buttons in `city-panel.ts` are authored as inline `<button style="...">` markup inside the template-literal HTML string (see the existing `data-rush-buy` button, `city-panel.ts:427`), not via `document.createElement`/`createGameButton()` — this file's established local convention. Match it: `min-height:44px` inline, styled consistently with neighboring action buttons.
- No SFX call for the appease action. Checked during planning: `rush-buy` — the closest existing analog (a city-panel gold-spending action) — has no `SFX.*` call anywhere in `main.ts` either. Adding a sound only for appease, when the nearest sibling action has none, would be an inconsistency, not a fix; leave it silent, matching the established local precedent.
- Balance: `appeaseFaction` spends gold to accelerate an existing recovery mechanic (unrest naturally decays without it) — it does not grant any yield bonus, so `game-balance.md`'s `civYieldBonus`/`cityYieldBonus` ceilings do not apply. The only balance-relevant property is the per-turn guard in Task 1, which keeps the player's use of this mechanic at the same cadence the AI already has (once per city per turn) rather than a strictly better economy.
- Run `bash scripts/run-with-mise.sh yarn test` after each task; all tests must pass before moving to the next task.

---

### Task 1: `appeaseFaction` shared helper + tests

**Files:**
- Modify: `src/systems/faction-system.ts` (add `appeaseFaction` function after `getCityAppeaseCost`, around line 86)
- Modify: `src/core/types.ts:429-436` (add `appeasedOnTurn?: number` to the `City` interface)
- Test: `tests/systems/faction-system.test.ts` (new `describe` block; reuses the existing `makeCity`/`makeState` helpers already defined at the top of the file — do not redefine them)

**Interfaces:**
- Consumes: `City.unrestLevel`, `City.unrestTurns`, `City.spyUnrestBonus`, `GameState.civilizations[civId].gold`, `GameState.turn` (all existing).
- Produces: `export function appeaseFaction(state: GameState, cityId: string, civId: string): { success: boolean; state: GameState; message: string }` — consumed by Task 2 (AI refactor) and Task 4 (UI wiring in main.ts).

- [ ] **Step 1: Add `appeasedOnTurn` to the `City` type**

In `src/core/types.ts`, modify the `City` interface (the block containing `unrestLevel`/`unrestTurns`, currently lines 429-436):

```typescript
  unrestLevel: 0 | 1 | 2;     // 0=stable, 1=unrest, 2=revolt
  unrestTurns: number;         // turns spent at current unrest level (>= 1 when unrestLevel > 0)
  conquestTurn?: number;       // turn this city was captured; cleared after 15 turns
  occupation?: OccupiedCityState;
  spyUnrestBonus: number;      // bonus pressure injected by enemy espionage; decays 5/turn
  productionDisabledTurns?: number; // late-game sabotage/cyber effect timer
  appeasedOnTurn?: number;     // turn appeaseFaction last succeeded on this city; blocks a second appease the same turn
  idleProduction?: 'gold' | 'science' | null; // conversion mode when queue is empty
  hp?: number;               // city hit points for pirate siege (default 100)
```

(Only the new `appeasedOnTurn?: number;` line is added — everything else is unchanged context to locate the insertion point.)

- [ ] **Step 2: Write the failing tests**

In `tests/systems/faction-system.test.ts`, add this new `describe` block after the existing `describe('faction-system', ...)` block closes (check the file for where that block ends, currently around line 513, right before `describe('faction-system constant exports and era-gating', ...)`):

```typescript
describe('appeaseFaction', () => {
  it('deducts gold, resets spyUnrestBonus, reduces unrestTurns by 2 (floor 0), downgrades unrestLevel 2→1', () => {
    const state = makeState({ unrestLevel: 2, unrestTurns: 1, spyUnrestBonus: 8 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(true);
    const city = result.state.cities['city-1'];
    expect(city.unrestLevel).toBe(1);
    expect(city.unrestTurns).toBe(0);
    expect(city.spyUnrestBonus).toBe(0);
    expect(result.state.civilizations['player'].gold).toBe(100 - getCityAppeaseCost(city));
  });

  it('does not downgrade unrestLevel below 1 (matches existing AI behavior: 2→1 only, never →0)', () => {
    const state = makeState({ unrestLevel: 1, unrestTurns: 3 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(true);
    expect(result.state.cities['city-1'].unrestLevel).toBe(1);
  });

  it('fails and returns unchanged state when city has no unrest', () => {
    const state = makeState({ unrestLevel: 0 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(false);
    expect(result.state).toBe(state);
  });

  it('fails and returns unchanged state when civ cannot afford the cost', () => {
    const state = makeState({ unrestLevel: 1, unrestTurns: 2 });
    state.civilizations['player'].gold = 10; // cost is 60 at default population 4
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.success).toBe(false);
    expect(result.state).toBe(state);
  });

  it('fails on a second call the same turn (spam-click guard) even though unrest and gold both still qualify', () => {
    const state = makeState({ unrestLevel: 2, unrestTurns: 5 });
    const first = appeaseFaction(state, 'city-1', 'player');
    expect(first.success).toBe(true);
    const second = appeaseFaction(first.state, 'city-1', 'player');
    expect(second.success).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('sets appeasedOnTurn to the current turn on success', () => {
    const state = makeState({ unrestLevel: 1, unrestTurns: 2 });
    const result = appeaseFaction(state, 'city-1', 'player');
    expect(result.state.cities['city-1'].appeasedOnTurn).toBe(state.turn);
  });

  it('allows appeasing again on a later turn', () => {
    const state = makeState({ unrestLevel: 2, unrestTurns: 5 });
    const first = appeaseFaction(state, 'city-1', 'player');
    const laterState = { ...first.state, turn: first.state.turn + 1 };
    const second = appeaseFaction(laterState, 'city-1', 'player');
    expect(second.success).toBe(true);
  });
});
```

Add `appeaseFaction` to the existing import block at the top of the test file (it currently imports `getCityAppeaseCost`, `getUnrestYieldMultiplier`, etc. from `@/systems/faction-system` — add `appeaseFaction` to that same list).

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts -t "appeaseFaction"`
Expected: FAIL — `appeaseFaction` doesn't exist yet (import/type error).

- [ ] **Step 4: Implement `appeaseFaction`**

In `src/systems/faction-system.ts`, add this function immediately after `getCityAppeaseCost` (after line 86):

```typescript
export function appeaseFaction(
  state: GameState,
  cityId: string,
  civId: string,
): { success: boolean; state: GameState; message: string } {
  const city = state.cities[cityId];
  if (!city || city.unrestLevel === 0) {
    return { success: false, state, message: 'This city has no unrest to appease.' };
  }
  if (city.appeasedOnTurn === state.turn) {
    return { success: false, state, message: 'This city has already been appeased this turn.' };
  }
  const cost = getCityAppeaseCost(city);
  const civ = state.civilizations[civId];
  if (!civ || civ.gold < cost) {
    return { success: false, state, message: `Not enough gold — appeasing ${city.name} costs ${cost}.` };
  }
  return {
    success: true,
    message: `${city.name} appeased for ${cost} gold.`,
    state: {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...civ, gold: civ.gold - cost },
      },
      cities: {
        ...state.cities,
        [cityId]: {
          ...city,
          spyUnrestBonus: 0,
          unrestTurns: Math.max(0, city.unrestTurns - 2),
          unrestLevel: city.unrestLevel === 2 ? 1 : city.unrestLevel,
          appeasedOnTurn: state.turn,
        },
      },
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts`
Expected: all tests PASS (both the new ones and every pre-existing test in the file).

- [ ] **Step 6: Commit**

```bash
git add src/systems/faction-system.ts src/core/types.ts tests/systems/faction-system.test.ts
git commit -m "feat(faction): add appeaseFaction shared helper with per-turn guard (#436)"
```

---

### Task 2: Refactor AI to call the shared helper

**Files:**
- Modify: `src/ai/basic-ai.ts:885-901` (replace the inline appease block with a call to `appeaseFaction`)
- Test: `tests/ai/basic-ai.test.ts` (or wherever existing AI-turn tests live — locate via `grep -rn "unrestLevel" tests/ai/` before writing; add a parity test there)

**Interfaces:**
- Consumes: `appeaseFaction` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Confirmed during planning — no pre-existing appease-specific test exists**

`grep -n "appease" tests/ai/basic-ai.test.ts tests/ai/basic-ai-pirates.test.ts tests/ai/basic-ai-beasts.test.ts tests/ai/ai-espionage.test.ts` returns nothing. `unrestLevel: 2` does appear in a fixture in `basic-ai.test.ts` (around line 96), but that fixture's civ has `gold: 0` and the fixture is used for a rebel-spawn-adjacent scenario, not an appease assertion — there is no existing behavior to preserve here beyond "the AI still resolves unrest the same way," which Step 2's new test covers directly. No baseline-preservation step is needed; proceed straight to writing new coverage.

- [ ] **Step 2: Add a parity regression test**

`tests/ai/basic-ai.test.ts` builds most of its fixtures via `createNewGame(civType?, seed?, mapSize?, gameTitle?)` (`src/core/game-state.ts:114`) and then mutates specific fields directly — e.g. the "AI attack targeting" tests (`tests/ai/basic-ai.test.ts:138+`) call `createNewGame(undefined, 'ai-melee-range', 'small')` then set `state.civilizations['ai-1'].diplomacy.atWarWith = [...]` directly. Follow that same pattern. Add this test near the end of the file, in its own `describe` block:

```typescript
describe('#436 — AI appease uses the shared helper', () => {
  it('AI appeasing unrest produces the same city/gold result as a direct appeaseFaction call', () => {
    const state = createNewGame(undefined, '436-ai-appease', 'small');
    const aiCityId = state.civilizations['ai-1'].cities[0];
    state.cities[aiCityId] = {
      ...state.cities[aiCityId],
      unrestLevel: 2,
      unrestTurns: 5,
      spyUnrestBonus: 10,
    };
    state.civilizations['ai-1'].gold = 1000;

    // Compute the expected result via the shared helper directly, on an
    // untouched clone of the same starting state.
    const expected = appeaseFaction(structuredClone(state), aiCityId, 'ai-1');

    const bus = new EventBus();
    const afterAiTurn = processAITurn(state, 'ai-1', bus);

    expect(afterAiTurn.cities[aiCityId].unrestLevel).toBe(expected.state.cities[aiCityId].unrestLevel);
    expect(afterAiTurn.cities[aiCityId].unrestTurns).toBe(expected.state.cities[aiCityId].unrestTurns);
    expect(afterAiTurn.cities[aiCityId].spyUnrestBonus).toBe(expected.state.cities[aiCityId].spyUnrestBonus);
    expect(afterAiTurn.civilizations['ai-1'].gold).toBe(expected.state.civilizations['ai-1'].gold);
  });

  it('AI does not appease when it cannot afford the cost (unchanged unrest)', () => {
    const state = createNewGame(undefined, '436-ai-appease-poor', 'small');
    const aiCityId = state.civilizations['ai-1'].cities[0];
    state.cities[aiCityId] = { ...state.cities[aiCityId], unrestLevel: 2, unrestTurns: 5 };
    state.civilizations['ai-1'].gold = 0;

    const bus = new EventBus();
    const afterAiTurn = processAITurn(state, 'ai-1', bus);

    expect(afterAiTurn.cities[aiCityId].unrestLevel).toBe(2);
    expect(afterAiTurn.civilizations['ai-1'].gold).toBe(0);
  });
});
```

Add `appeaseFaction` to a new import line: `import { appeaseFaction } from '@/systems/faction-system';` (placed alongside the other `@/systems/*` imports at the top of the file, e.g. next to the existing `import { foundCity } from '@/systems/city-system';`).

- [ ] **Step 3: Run the new tests now, before the refactor**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/basic-ai.test.ts -t "436"`
Expected: PASS. This isn't a red-green TDD step — it's a characterization/parity test whose entire point is that it stays green across the refactor. It should already pass here because Task 1's `appeaseFaction` implementation is a faithful extraction of the AI's current inline math (same formulas, same order of operations), so the "expected" value computed via a direct `appeaseFaction` call already matches what the still-unrefactored `processAITurn` produces. If it fails here, stop — it means Task 1's extraction doesn't actually match the AI's current behavior, and that must be fixed before proceeding (do not proceed to Step 5's refactor on top of a mismatched baseline).

- [ ] **Step 4: Run the full existing AI test suite to confirm nothing else broke**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/`
Expected: PASS — this is the pre-refactor baseline for the rest of the AI suite.

- [ ] **Step 5: Replace the inline block with a call to `appeaseFaction`**

In `src/ai/basic-ai.ts`, replace:

```typescript
  // --- Handle city production (personality-driven) ---
  const isUnderThreat = militaryUnits.length < civ.cities.length;
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (!city || city.unrestLevel === 0) continue;

    const appeaseCost = getCityAppeaseCost(city);
    if (newState.civilizations[civId].gold >= appeaseCost) {
      newState.civilizations[civId].gold -= appeaseCost;
      newState.cities[cityId] = {
        ...city,
        spyUnrestBonus: 0,
        unrestTurns: Math.max(0, city.unrestTurns - 2),
        unrestLevel: city.unrestLevel === 2 ? 1 : city.unrestLevel,
      };
    }
  }
```

with:

```typescript
  // --- Handle city production (personality-driven) ---
  const isUnderThreat = militaryUnits.length < civ.cities.length;
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (!city || city.unrestLevel === 0) continue;
    const appeaseResult = appeaseFaction(newState, cityId, civId);
    if (appeaseResult.success) {
      newState = appeaseResult.state;
    }
  }
```

Update the import at the top of `basic-ai.ts` — change:
```typescript
import { getCityAppeaseCost } from '@/systems/faction-system';
```
to:
```typescript
import { appeaseFaction } from '@/systems/faction-system';
```
(Check first whether `getCityAppeaseCost` is used anywhere else in `basic-ai.ts` via `grep -n "getCityAppeaseCost" src/ai/basic-ai.ts` — if it has other call sites, keep it in the import list alongside `appeaseFaction` rather than removing it.)

Note: `appeaseFaction`'s per-turn guard (`appeasedOnTurn === state.turn`) is a no-op for the AI here, since this loop runs at most once per civ per turn already — it only ever matters for the player's repeated-click case in Task 4.

- [ ] **Step 6: Run the AI suite to verify no behavior change**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/`
Expected: all tests PASS, including the new parity tests from Step 2 (still green, proving the refactor is behavior-preserving) and everything else in the suite.

- [ ] **Step 7: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/*.test.ts
git commit -m "refactor(ai): use shared appeaseFaction helper instead of inline logic (#436)"
```

---

### Task 3: City panel UI — unrest section + appease button

**Files:**
- Modify: `src/ui/city-panel.ts` (add `onAppeaseFaction` to `CityPanelCallbacks`, add the unrest section to the HTML template around line 525, wire the click handler near the existing `data-rush-buy` handler around line 886, import `getCityAppeaseCost` and `isCityProductionLocked`)
- Test: `tests/ui/city-panel.test.ts` (locate existing rush-buy click-through test as the pattern to mirror — `grep -n "data-rush-buy\|onRushBuyActiveProduction" tests/ui/city-panel.test.ts`)

**Interfaces:**
- Consumes: `appeaseFaction`'s shape indirectly via the `onAppeaseFaction?: (cityId: string) => GameState | void` callback contract (the callback itself is implemented in Task 4's `main.ts` wiring; this task only needs the *contract*, matching `onRushBuyActiveProduction`'s existing shape exactly).
- Produces: `onAppeaseFaction` field on `CityPanelCallbacks`, consumed by Task 4.

- [ ] **Step 1: Confirmed during planning — the pattern to mirror**

`tests/ui/city-panel.test.ts:385-406` ("shows maintenance, net treasury, and rush buy for active production") is the closest analog: it uses `makeMultiCityFixture()` → `{ container, city, state }`, sets `state.civilizations[state.currentPlayer].gold = 100`, passes `onRushBuyActiveProduction: vi.fn(() => state)` into `createCityPanel(...)`, asserts rendered text via `collectText(panel)`, then calls the module-level `clickElement(panel.querySelector('[data-rush-buy]'))` helper (defined at `tests/ui/city-panel.test.ts:19`) and asserts the mock was called with `city.id`. `makeMultiCityFixture` itself is scoped to the `describe('city-panel navigation', ...)` block — for a single-city unrest test, use the lower-level `makeWonderPanelFixture()` (imported at the top of the file from `./helpers/wonder-panel-fixture`) directly instead, which returns the same `{ container, city, state }` shape without the second-city wrapper.

- [ ] **Step 2: Write the failing tests**

Add a new `describe` block to `tests/ui/city-panel.test.ts` (anywhere at the top level, alongside the other `describe('city-panel ...', ...)` blocks):

```typescript
describe('city-panel unrest section — #436', () => {
  it('renders no unrest section when the city has no unrest', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 0;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-appease]')).toBeNull();
  });

  it('shows the unrest level and appease cost when the city has unrest', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 2;
    city.unrestTurns = 3;
    city.population = 4;
    state.civilizations[state.currentPlayer].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction: vi.fn(() => state),
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Revolt');
    expect(rendered).toContain('60'); // getCityAppeaseCost: population(4) * 15
    expect(rendered).toContain('production locked'); // isCityProductionLocked: true at unrestLevel 2
  });

  it('clicking appease (affordable, not yet used this turn) calls onAppeaseFaction with the city id, and does not claim production is locked at unrestLevel 1', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.unrestTurns = 2;
    city.population = 4;
    city.appeasedOnTurn = undefined;
    city.productionDisabledTurns = 0;
    state.civilizations[state.currentPlayer].gold = 1000;
    const onAppeaseFaction = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction,
    });

    expect(collectText(panel)).not.toContain('production locked'); // isCityProductionLocked: false at unrestLevel 1 with no sabotage timer
    clickElement(panel.querySelector('[data-appease]'));
    expect(onAppeaseFaction).toHaveBeenCalledWith(city.id);
  });

  it('disables the button and shows a gold-specific reason when unaffordable', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.unrestTurns = 2;
    city.population = 4;
    state.civilizations[state.currentPlayer].gold = 5; // cost is 60, well short
    const onAppeaseFaction = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction,
    });

    const btn = panel.querySelector<HTMLButtonElement>('[data-appease]');
    expect(btn?.disabled).toBe(true);
    expect(collectText(panel)).toContain('Not enough gold');
    clickElement(btn);
    expect(onAppeaseFaction).not.toHaveBeenCalled();
  });

  it('disables the button and shows a turn-specific reason when already appeased this turn', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.unrestTurns = 2;
    city.population = 4;
    city.appeasedOnTurn = state.turn; // already used this turn
    state.civilizations[state.currentPlayer].gold = 1000; // affordable, but blocked anyway
    const onAppeaseFaction = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction,
    });

    const btn = panel.querySelector<HTMLButtonElement>('[data-appease]');
    expect(btn?.disabled).toBe(true);
    expect(collectText(panel)).toContain('Already appeased this turn');
    clickElement(btn);
    expect(onAppeaseFaction).not.toHaveBeenCalled();
  });
});
```

The `vi`, `collectText`, `clickElement`, and `makeWonderPanelFixture` names used above are all already imported/defined at the top of this test file (`vitest`'s `vi`, `./helpers/wonder-panel-fixture`'s `collectText`/`makeWonderPanelFixture`, and the module-level `clickElement` helper at line 19) — no new imports needed for this step.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts -t "unrest"`
Expected: FAIL — the unrest section doesn't exist in the template yet.

- [ ] **Step 4: Add `onAppeaseFaction` to `CityPanelCallbacks`**

In `src/ui/city-panel.ts`, in the `CityPanelCallbacks` interface (starts at line 38), add after `onRushBuyActiveProduction`:

```typescript
  onRushBuyActiveProduction?: (cityId: string) => GameState | void;
  onAppeaseFaction?: (cityId: string) => GameState | void;
```

- [ ] **Step 5: Add the imports**

Change:
```typescript
import { getUnrestYieldMultiplier } from '@/systems/faction-system';
```
to:
```typescript
import { getUnrestYieldMultiplier, getCityAppeaseCost, isCityProductionLocked } from '@/systems/faction-system';
```

- [ ] **Step 6: Build the unrest section HTML and insert it**

Near the top of `createCityPanel` (where `rushBuyQuote`/`rushBuyReason` are computed, around line 202-203), add:

```typescript
  const appeaseCost = getCityAppeaseCost(city);
  const civGold = state.civilizations[city.owner]?.gold ?? 0;
  const appeasedThisTurn = city.appeasedOnTurn === state.turn;
  const canAffordAppease = civGold >= appeaseCost;
  const appeaseDisabled = !canAffordAppease || appeasedThisTurn || !callbacks.onAppeaseFaction;
  const appeaseLabel = appeasedThisTurn
    ? 'Already appeased this turn'
    : !canAffordAppease
      ? `Not enough gold (needs ${appeaseCost})`
      : `Appease (${appeaseCost} gold)`;
  const unrestSectionHtml = city.unrestLevel > 0 ? `
    <div style="background:rgba(217,80,80,0.12);border:1px solid rgba(217,80,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e88;margin-bottom:4px;">
        ${city.unrestLevel === 2 ? '⚠️ Revolt' : '⚠️ Unrest'} — yields reduced${isCityProductionLocked(city) ? ', production locked' : ''}
      </div>
      <button type="button" data-appease="${city.id}" ${appeaseDisabled ? 'disabled' : ''} title="${appeaseLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${appeaseDisabled ? 'default' : 'pointer'};background:${appeaseDisabled ? 'rgba(255,255,255,0.08)' : '#d4aa2c'};color:${appeaseDisabled ? 'rgba(255,255,255,0.4)' : '#1a1a1a'};border:none;">${appeaseLabel}</button>
    </div>` : '';
```

Then insert `${unrestSectionHtml}` into the template right after the maintenance/economy row and before the tabs row — in the existing template (around line 525-527):

```typescript
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;font-size:12px;color:#d9d3c0;">
      <span title="" data-maintenance-summary>Free support: ${cityFreeBuildings} buildings, ${economyStatus.breakdown.freeUnits} units</span>
      <span title="" data-maintenance-summary>Paid upkeep: -${cityMaintenance.upkeep} city / -${economyStatus.unitMaintenance} empire</span>
      <span>Net treasury: ${economyStatus.netGoldPerTurn >= 0 ? '+' : ''}${economyStatus.netGoldPerTurn}/turn</span>
      ${economyStatus.strainLevel !== 'none' ? '<span style="color:#d9a25c;" data-text="economy-strain"></span>' : ''}
    </div>
    ${unrestSectionHtml}

    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
```

(Only the `${unrestSectionHtml}` line is new — the surrounding lines are shown for exact placement.)

- [ ] **Step 7: Wire the click handler**

Near the existing rush-buy handler (`city-panel.ts:886-891`), add:

```typescript
  panel.querySelectorAll<HTMLElement>('[data-appease]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextState = callbacks.onAppeaseFaction?.(city.id);
      rerenderPanel(nextState);
    });
  });
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(ui): add unrest section + appease button to city panel (#436)"
```

---

### Task 4: Wire `onAppeaseFaction` in main.ts

**Files:**
- Modify: `src/main.ts` (add `onAppeaseFaction` to the `createCityPanel` callbacks object, mirroring `onRushBuyActiveProduction` at line 1144)

**Interfaces:**
- Consumes: `appeaseFaction` (Task 1), `onAppeaseFaction` contract (Task 3).
- Produces: nothing new — this is the final wiring step that makes the button actually work end-to-end.

- [ ] **Step 1: Add the import**

In `src/main.ts`, find the existing import from `@/systems/faction-system` (if one exists) or add a new one near the other system imports:

```typescript
import { appeaseFaction } from '@/systems/faction-system';
```

(If `faction-system` is already imported for something else in `main.ts`, add `appeaseFaction` to that existing import list instead of creating a duplicate import line — check with `grep -n "from '@/systems/faction-system'" src/main.ts` first.)

- [ ] **Step 2: Add the callback**

In `src/main.ts`, in the `createCityPanel` callbacks object, add after `onRushBuyActiveProduction` (after line 1157's closing `},`):

```typescript
    onAppeaseFaction: (cityId) => {
      const targetCity = gameState.cities[cityId];
      if (!targetCity) return gameState;
      const result = appeaseFaction(gameState, cityId, gameState.currentPlayer);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return gameState;
      }
      gameState = result.state;
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(result.message, 'success');
      return gameState;
    },
```

This mirrors `onRushBuyActiveProduction` exactly, including the `updateHUD()` call — appeasing spends gold, so the HUD's gold display must refresh, same as rush-buying does.

- [ ] **Step 3: Run the build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0 (this is the only command that runs `tsc` — confirms the new callback's types line up end-to-end).

- [ ] **Step 4: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests PASS project-wide.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): wire onAppeaseFaction callback in main.ts (#436)

Closes the loop end-to-end: appeaseFaction (shared helper) -> city
panel unrest section -> this callback -> gold/HUD/notification."
```

---

## Final verification checklist (run after all tasks complete)

- [ ] `bash scripts/run-with-mise.sh yarn build` exits 0.
- [ ] `bash scripts/run-with-mise.sh yarn test` exits 0.
- [ ] Manually trace the flow once more by reading the final diff: `appeaseFaction` (faction-system.ts) is called from exactly two places — `basic-ai.ts` (AI path) and `main.ts`'s `onAppeaseFaction` (player path) — confirming the "shared state mutations must be actor-complete" rule is satisfied with both an AI and a human path exercising the same helper.
- [ ] Confirm no other file in `src/` still references the old inline appease pattern (`grep -rn "spyUnrestBonus: 0" src/` should only match inside `appeaseFaction` itself now, not a second inline copy in `basic-ai.ts`).
