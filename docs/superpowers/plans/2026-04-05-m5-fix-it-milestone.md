# M5 Fix-It Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 23 issues identified in the full codebase review — 4 critical determinism violations, 8 major bugs (hot-seat, XSS, performance), and 11 minor quality issues.

**Architecture:** Pure bug-fix milestone. No new features, no refactors beyond what's needed for fixes. Each task targets one category of related issues, ordered so earlier tasks don't break later ones. Tasks 1-4 are critical and must be done first. Tasks 5-9 are major. Tasks 10-14 are minor.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, IndexedDB

**Deliberately deferred issues (out of scope for this milestone):**
- **m1** — `main.ts` is a 1405-line god file. Refactoring is a separate milestone.
- **m6** — `getNextPlayer` only cycles human players; all-AI edge case causes infinite loop. Rare scenario, needs design decision.
- **m7** — Camera double-pan on touch release. Cosmetic, requires physics tuning.
- **m8** — No test coverage for UI panels and `main.ts`. Requires jsdom or browser test runner setup.
- **m11** — Event bus listeners never cleaned up. Only matters if session-reset-without-reload is implemented.

---

## Background & Conventions

Before starting ANY task, read these files:
- `CLAUDE.md` — project conventions, hot-seat rules, seeded RNG rules
- `.claude/rules/game-systems.md` — deterministic RNG, bilateral diplomacy, state mutation rules
- `.claude/rules/ui-panels.md` — innerHTML prohibition, notification rules, HUD rules
- `.claude/rules/end-to-end-wiring.md` — compute-must-render rule

**Critical rules to internalize:**
1. **NEVER use `Math.random()`** — use `createRng()` from `src/systems/map-generator.ts` (mulberry32) or inline LCG
2. **NEVER hardcode `'player'`** — use `state.currentPlayer`
3. **NEVER use `innerHTML` with game-generated strings** — use `document.createElement()` + `textContent`
4. **Seeded RNG pattern** — derive seed from `state.turn` + context string, e.g., `createRng(`wonder-${state.turn}`)`

**Test command:** `eval "$(mise activate bash)" && yarn test --run`
**Build command:** `eval "$(mise activate bash)" && yarn build`
**Single test file:** `eval "$(mise activate bash)" && yarn test --run tests/path/to/file.test.ts`

---

## Task 1: Eliminate All `Math.random()` Usage (C1, C2, C3, C4)

**Why:** Every `Math.random()` call breaks determinism. Games with the same seed must produce identical results for replay, debugging, and hot-seat fairness.

**Files:**
- Modify: `src/core/game-state.ts:42` — AI civ selection
- Modify: `src/systems/wonder-system.ts:131-133` — eruption RNG fallback
- Modify: `src/core/turn-manager.ts:222` — pass RNG to `processWonderEffects`
- Modify: `src/audio/music-generator.ts:138-139,164` — procedural music
- Modify: `src/ui/civ-select.ts:77` — random civ pick
- Test: `tests/systems/determinism.test.ts` (create)

### Steps

- [ ] **Step 1: Write determinism tests**

Create `tests/systems/determinism.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createRng } from '@/systems/map-generator';

describe('seeded RNG determinism', () => {
  it('createRng produces same sequence for same seed', () => {
    const rng1 = createRng('test-seed-42');
    const rng2 = createRng('test-seed-42');
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('createRng produces different sequence for different seed', () => {
    const rng1 = createRng('seed-a');
    const rng2 = createRng('seed-b');
    expect(rng1()).not.toBe(rng2());
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `eval "$(mise activate bash)" && yarn test --run tests/systems/determinism.test.ts`

Expected: PASS (these test existing `createRng` which already works)

- [ ] **Step 3: Fix `game-state.ts` — AI civ selection**

In `src/core/game-state.ts`, line 42, the current code is:

```typescript
const aiCivDef = aiCivDefs[Math.floor(Math.random() * aiCivDefs.length)] ?? CIV_DEFINITIONS[0];
```

Add an import for `createRng` at the top of the file:

```typescript
import { createRng } from '@/systems/map-generator';
```

Replace line 42 with:

```typescript
const civSelectRng = createRng(gameSeed + '-civ-select');
const aiCivDef = aiCivDefs[Math.floor(civSelectRng() * aiCivDefs.length)] ?? CIV_DEFINITIONS[0];
```

The `gameSeed` variable is the string seed parameter already in scope (it's a parameter of the `createNewGame` function at line ~16). Verify this by reading the function signature before editing.

- [ ] **Step 4: Fix `wonder-system.ts` — remove `Math.random()` fallback**

In `src/systems/wonder-system.ts`, lines 131-133, the current code is:

```typescript
export function processWonderEffects(state: GameState, rng?: () => number): EruptionResult[] {
  const eruptions: EruptionResult[] = [];
  const effectRng = rng ?? (() => Math.random());
```

Change to make `rng` required:

```typescript
export function processWonderEffects(state: GameState, rng: () => number): EruptionResult[] {
  const eruptions: EruptionResult[] = [];
  const effectRng = rng;
```

- [ ] **Step 5: Fix `turn-manager.ts` — pass RNG to `processWonderEffects`**

In `src/core/turn-manager.ts`, line 222, the current code is:

```typescript
const eruptions = processWonderEffects(newState);
```

Add a seeded RNG and pass it. Use the inline LCG pattern already used nearby (lines 212-216):

```typescript
const wonderRng = createRng(`wonder-${newState.turn}`);
const eruptions = processWonderEffects(newState, wonderRng);
```

Add `createRng` to the existing import from `@/systems/map-generator` at the top of the file. Check if it's already imported; if not, add it.

- [ ] **Step 6: Fix `music-generator.ts` — replace `Math.random()` with seeded RNG**

In `src/audio/music-generator.ts`, the music generator is cosmetic (doesn't affect game state), but the spec requires no `Math.random()` anywhere.

Find the class or function that contains lines 138-139 and 164. Add a module-level seeded RNG:

```typescript
import { createRng } from '@/systems/map-generator';

let musicRng = createRng('music-default');

export function seedMusicRng(seed: string): void {
  musicRng = createRng(`music-${seed}`);
}
```

Then replace all three `Math.random()` calls with `musicRng()`:
- Line 138: `Math.floor(Math.random() * config.scale.length)` → `Math.floor(musicRng() * config.scale.length)`
- Line 139: `Math.random() > 0.7` → `musicRng() > 0.7`
- Line 164: `Math.random() > 0.4` → `musicRng() > 0.4`

- [ ] **Step 7: Fix `civ-select.ts` — replace `Math.random()` with seeded RNG**

In `src/ui/civ-select.ts`, line 77:

```typescript
const randomIdx = Math.floor(Math.random() * available.length);
```

This is a UI-only random selection (user clicks "Random"). Use `Date.now()` as the seed since this is a user-initiated UI action before any game state exists:

```typescript
import { createRng } from '@/systems/map-generator';

// Inside the handler:
const pickRng = createRng(`civ-pick-${Date.now()}`);
const randomIdx = Math.floor(pickRng() * available.length);
```

Note: `Date.now()` as a seed is acceptable here because this happens BEFORE game creation — there's no game state to be deterministic about. The CLAUDE.md rule targets `Math.random()` during gameplay which breaks replay determinism. Pre-game UI randomness (wrapped in `createRng`) is exempt since there's no game seed yet. This is different from the `Date.now()` problem in `combat-system.ts` (Task 5), where it occurred DURING gameplay.

- [ ] **Step 8: Verify no `Math.random()` remains in src/**

Run: `grep -rn "Math.random" src/`

Expected: Zero results. If any remain, fix them using the same pattern.

- [ ] **Step 9: Run full build and test suite**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: Build succeeds, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/core/game-state.ts src/systems/wonder-system.ts src/core/turn-manager.ts src/audio/music-generator.ts src/ui/civ-select.ts tests/systems/determinism.test.ts
git commit -m "fix(m5): eliminate all Math.random() — use seeded RNG everywhere"
```

---

## Task 2: Fix Hardcoded `'player'` (M1, M2)

**Why:** Hot seat multiplayer uses dynamic player IDs (`'player-1'`, `'player-2'`). Hardcoded `'player'` breaks tutorial triggers, advisor triggers, and ownership rendering for hot seat games.

**Files:**
- Modify: `src/ui/tutorial.ts:22,28,34,40,47,57` — 6 hardcoded `'player'` references
- Modify: `src/ui/advisor-system.ts:80,302,335,348,362` — 5 instances of `state.civilizations.player ?? ...`
- Modify: `src/renderer/hex-renderer.ts:262` — fallback `?? 'player'`
- Test: `tests/ui/tutorial.test.ts` (create)

### Steps

- [ ] **Step 1: Write tutorial hot-seat test**

Create `tests/ui/tutorial.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TutorialSystem } from '@/ui/tutorial';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';

// Minimal state factory for tutorial testing
function makeTutorialState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentPlayer: 'player-2',
    civilizations: {
      'player-2': {
        id: 'player-2',
        name: 'Test Civ',
        color: '#ff0000',
        cities: [],
        units: [],
        gold: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { isVassal: false, isOverlord: false, vassals: [], overlord: null, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        techState: { completed: [], currentResearch: null, researchProgress: 0 },
        visibility: { tiles: {}, sharedVision: [] },
      },
    },
    cities: {},
    units: {},
    turn: 1,
    tutorial: { active: true, currentStep: 'welcome', completedSteps: ['welcome'] },
    ...overrides,
  } as unknown as GameState;
}

describe('tutorial hot-seat support', () => {
  it('found_city trigger uses currentPlayer, not hardcoded player', () => {
    const bus = new EventBus();
    const tutorial = new TutorialSystem(bus);
    let emitted = false;
    bus.on('tutorial:step', () => { emitted = true; });

    const state = makeTutorialState({
      cities: {
        'city-1': { id: 'city-1', owner: 'player-2', name: 'Test', position: { q: 0, r: 0 }, population: 1, buildings: [], productionQueue: [], productionProgress: 0, grid: [], gridSize: 3, food: 0, housing: 5 } as any,
      },
    });

    tutorial.check(state);
    expect(emitted).toBe(true);
  });

  it('tutorial does NOT trigger when city belongs to different player', () => {
    const bus = new EventBus();
    const tutorial = new TutorialSystem(bus);
    let emitted = false;
    bus.on('tutorial:step', () => { emitted = true; });

    const state = makeTutorialState({
      cities: {
        'city-1': { id: 'city-1', owner: 'player-1', name: 'Other', position: { q: 0, r: 0 }, population: 1, buildings: [], productionQueue: [], productionProgress: 0, grid: [], gridSize: 3, food: 0, housing: 5 } as any,
      },
    });

    tutorial.check(state);
    // Should not trigger found_city because the city belongs to player-1, not currentPlayer (player-2)
    expect(emitted).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test --run tests/ui/tutorial.test.ts`

Expected: First test FAILS because tutorial checks `c.owner === 'player'` but the city owner is `'player-2'`.

- [ ] **Step 3: Fix all hardcoded `'player'` in `tutorial.ts`**

In `src/ui/tutorial.ts`, the `TUTORIAL_MESSAGES` array triggers use hardcoded `'player'`. Each trigger function receives `(state: GameState)`, so `state.currentPlayer` is available.

Replace each occurrence:

1. **Line 22:** `c.owner === 'player'` → `c.owner === state.currentPlayer`
2. **Line 28:** `c.owner === 'player'` → `c.owner === state.currentPlayer`
3. **Line 34:** `u.owner === 'player'` → `u.owner === state.currentPlayer`
4. **Line 40:** `state.civilizations.player?.techState` → `state.civilizations[state.currentPlayer]?.techState`
5. **Line 47:** `c.owner === 'player'` → `c.owner === state.currentPlayer`
6. **Line 57:** `state.civilizations.player?.visibility` → `state.civilizations[state.currentPlayer]?.visibility`

Do NOT change line 59 (`u.owner === 'barbarian'`) — that's correct.

- [ ] **Step 4: Run test to verify it passes**

Run: `eval "$(mise activate bash)" && yarn test --run tests/ui/tutorial.test.ts`

Expected: PASS

- [ ] **Step 5: Fix all hardcoded `'player'` in `advisor-system.ts`**

In `src/ui/advisor-system.ts`, lines 80, 302, 335, 348, 362, there is a pattern:

```typescript
const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
```

The primary lookup `state.civilizations.player` uses the hardcoded key `'player'`, which doesn't exist in hot-seat mode (IDs are `'player-1'`, `'player-2'`). The `??` fallback masks the bug in single-player, but the primary lookup is still wrong.

Replace all 5 instances with:

```typescript
const civ = state.civilizations[state.currentPlayer];
```

- [ ] **Step 6: Fix hex-renderer ownership fallback**

In `src/renderer/hex-renderer.ts`, line 262:

```typescript
ctx.strokeStyle = tile.owner === (currentPlayer ?? 'player') ? 'rgba(74,144,217,0.5)' : 'rgba(217,74,74,0.5)';
```

Remove the `?? 'player'` fallback. If `currentPlayer` is undefined, no ownership borders should be drawn:

```typescript
if (tile.owner && currentPlayer) {
  ctx.strokeStyle = tile.owner === currentPlayer ? 'rgba(74,144,217,0.5)' : 'rgba(217,74,74,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
```

Replace the existing block at lines 261-265 (the `if (tile.owner)` block) with this version. The key change is that BOTH `tile.owner` and `currentPlayer` must be truthy.

- [ ] **Step 7: Verify no hardcoded `'player'` remains**

Run: `grep -rn "'player'" src/ | grep -v "currentPlayer" | grep -v "player-" | grep -v "barbarian" | grep -v "// " | grep -v ".test."`

Also run: `grep -rn "civilizations\.player" src/`

Review any remaining matches. Known acceptable uses:
- Default player IDs in single-player game creation (e.g., `createNewGame` using `'player'` as the starting player ID — this is the initial assignment, not a hardcoded check)
- String literals in event names or UI labels (e.g., "Choose your player")

Anything that CHECKS ownership (`.owner === 'player'`, `state.civilizations.player`, `state.civilizations['player']`) must use `state.currentPlayer` instead.

- [ ] **Step 8: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add src/ui/tutorial.ts src/ui/advisor-system.ts src/renderer/hex-renderer.ts tests/ui/tutorial.test.ts
git commit -m "fix(m5): replace hardcoded 'player' with state.currentPlayer"
```

---

## Task 3: Eliminate `innerHTML` with Game Data — UI Panels (M3)

**Why:** `innerHTML` with game-generated strings is an XSS vector per CLAUDE.md. City names, civ names, and tech names could theoretically contain HTML. The rule is absolute: use `document.createElement()` + `textContent` for all dynamic text.

**Important context:** The current panels (`city-panel.ts`, `diplomacy-panel.ts`, `tech-panel.ts`) use `innerHTML` to build entire panels. The data they interpolate comes from game definitions (not user input), so the XSS risk is theoretical. However, `diplomacy-panel.ts` interpolates `civ.name` which IS user-entered in hot-seat mode. The spec is clear: refactor to DOM building.

**Strategy:** These panels are complex HTML structures. A full refactor to `createElement` for every element would be extremely verbose. Instead, use this pattern:
1. Build the structural HTML with ONLY hardcoded strings and numeric values (safe)
2. After setting `innerHTML`, use `querySelectorAll` with data attributes to inject dynamic text via `textContent`

This is the same pattern already used successfully in `city-grid.ts` (building info click handlers at lines 171-192).

**Files:**
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/ui/tech-panel.ts`
- Modify: `src/ui/marketplace-panel.ts`

### Steps

- [ ] **Step 1: Refactor `city-panel.ts`**

Read the full file first. The dynamic game data interpolated via innerHTML:
- Line 27: `${city.name}` — city name (from CITY_NAMES definitions, safe)
- Line 28: `${city.population}` — number (safe)
- Lines 34-37: `${yields.food}`, etc. — numbers (safe)
- Line 58: `${building?.name ?? currentItem}` — from BUILDINGS definitions (safe)
- Line 74: `${b.name}`, `${b.description}` — from BUILDINGS definitions (safe)
- Lines 93-95: `${b.name}`, `${b.description}` — from BUILDINGS definitions (safe)
- Line 106: `${u.name}` — from TRAINABLE_UNITS definitions (safe)

Since ALL data comes from game definitions (not user input), the actual XSS risk is zero. But the CLAUDE.md rule is absolute. Use the placeholder-then-fill pattern:

For each dynamic string that comes from game data, replace the interpolation with an empty `<span>` with a unique `data-text` attribute, then fill it via `textContent` after `innerHTML` is set.

For example, replace:
```typescript
<h2 style="...">${city.name}</h2>
```
With:
```typescript
<h2 style="..."><span data-text="city-name"></span></h2>
```

Then after `panel.innerHTML = html;`, add:
```typescript
const setText = (sel: string, text: string) => {
  const el = panel.querySelector(`[data-text="${sel}"]`);
  if (el) el.textContent = text;
};
setText('city-name', city.name);
```

Apply this pattern to ALL dynamic game-data strings in the file. Numbers from calculations (`yields.food`, `progress`, `turnsLeft`) are safe to interpolate directly since they're always numbers, but for consistency and to satisfy the rule, also use `textContent` for them.

Create a helper at the top of the function:
```typescript
const setText = (sel: string, text: string) => {
  const el = panel.querySelector(`[data-text="${sel}"]`);
  if (el) el.textContent = text;
};
```

Dynamic strings to replace with `data-text` spans:
1. `city.name` → `data-text="city-name"`
2. `city.population` → `data-text="city-pop"` (use `String(city.population)`)
3. Each yield value → `data-text="yield-food"`, etc.
4. Current production name → `data-text="prod-name"`
5. Turns remaining → `data-text="prod-turns"`
6. Progress percent → used in a `width:${progress}%` style — this is a number in a style attribute, which is safe and doesn't need textContent
7. Each building name/description in the loop — these need unique IDs. Use `data-text="bldg-name-${idx}"` pattern
8. Each build-item name/description — same pattern with `data-text="build-name-${idx}"`

For loops (buildings, units), assign index-based data-text attributes and fill them in a loop after innerHTML.

- [ ] **Step 2: Refactor `diplomacy-panel.ts`**

This is the HIGHEST PRIORITY panel because `civ.name` is user-entered in hot-seat mode. Read the full file first.

Dynamic strings to replace:
1. `civ.name` (line 60) — **USER INPUT in hot-seat, actual XSS risk**
2. `civDef?.bonusName` (line 61) — from definitions (safe but must comply)
3. `statusText` (line 61) — computed from game state (safe but must comply)
4. `relationship` number (line 66) — number (safe)
5. Treaty `label` (line 80) — derived from treaty type (safe)
6. Treaty `turns` (line 81) — number/string (safe)
7. Diplomatic action `label` (line 90) — derived from action type (safe)
8. Minor civ `def.name` (line 114) — from definitions (safe)
9. Quest `description` (line 118) — from definitions (safe)

Same pattern: placeholder spans + `textContent` fill after `innerHTML`.

For the civ loop and minor civ loop, use index-based data-text attributes:
```typescript
data-text="civ-name-${civIdx}"
```

Increment `civIdx` in each loop iteration.

- [ ] **Step 3: Refactor `tech-panel.ts`**

Read the full file first. Dynamic strings:
1. `currentTech.name` (line 34) — from TECH_TREE (safe)
2. `currentTech.track` (line 35) — from TECH_TREE (safe)
3. `currentTech.unlocks[0]` (line 35) — from TECH_TREE (safe)
4. Research progress numbers (lines 37, 39) — numbers (safe)
5. Each tech `tech.name` (line 77) — from TECH_TREE (safe)
6. Each tech `tech.unlocks[0]` (line 78) — from TECH_TREE (safe)
7. Tech cost (line 78) — number (safe)

Same pattern.

- [ ] **Step 4: Refactor `marketplace-panel.ts`**

Read `src/ui/marketplace-panel.ts`. Line 31 interpolates `marketplace.fashionable` (a resource name from game state) and `marketplace.fashionTurnsLeft` via innerHTML. The `renderResourceRows` and `renderTradeRoutes` helper functions also return HTML strings with game data.

Apply the same placeholder-then-fill pattern. The key dynamic strings:
1. `marketplace.fashionable` (line 31) — resource name from game state
2. `marketplace.fashionTurnsLeft` (line 31) — number

For the `renderResourceRows` and `renderTradeRoutes` helper functions, read them to identify what game data they interpolate. Apply the same pattern: use `data-text` placeholder spans and fill via `textContent` after innerHTML.

- [ ] **Step 5: Audit all remaining `innerHTML` in src/ui/**

Run: `grep -rn "innerHTML" src/ui/ src/main.ts`

Review each match. For each one that interpolates game-generated strings (civ names, unit names, resource names, etc.), apply the placeholder-then-fill pattern. Files that ONLY use hardcoded literal strings in innerHTML (no `${}` interpolation with game data) are acceptable.

Known files to check:
- `src/ui/civ-select.ts` — likely safe (uses definition names)
- `src/ui/save-panel.ts` — likely safe (hardcoded labels)
- `src/ui/turn-handoff.ts` — may interpolate player names (XSS risk in hot-seat)
- `src/ui/hotseat-setup.ts` — may interpolate player names

Fix any that interpolate user-entered or game-state strings.

- [ ] **Step 6: Run full build and test suite**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass. The panels don't have direct tests, but the build must succeed and no existing tests should break.

- [ ] **Step 7: Commit**

```bash
git add src/ui/city-panel.ts src/ui/diplomacy-panel.ts src/ui/tech-panel.ts src/ui/marketplace-panel.ts
# Also add any other files fixed in the audit step
git commit -m "fix(m5): replace innerHTML game-data interpolation with textContent in UI panels"
```

---

## Task 4: Fix `innerHTML` in HUD and Unit Panel (M4)

**Why:** The HUD in `main.ts` interpolates `civ.name` (user-entered in hot-seat) and unit stats via `innerHTML`. The unit selection panel also uses `innerHTML` with game-data strings.

**Files:**
- Modify: `src/main.ts:160-168` — HUD innerHTML
- Modify: `src/main.ts:481-492` — selectUnit panel innerHTML

### Steps

- [ ] **Step 1: Fix HUD innerHTML in `main.ts`**

Read `src/main.ts` lines 140-180. The `updateHUD()` function sets `hud.innerHTML` with:
- `${totalFood}`, `${totalProd}`, `${totalGold}`, `${totalScience}` — numbers (safe)
- `${civ.gold}` — number (safe)
- `${techName}` — from tech definitions (safe)
- `${nameLabel}` — contains `${civ.name}` which is USER INPUT in hot-seat

Replace the innerHTML block with DOM building:

```typescript
hud.textContent = '';

const yieldsRow = document.createElement('div');
yieldsRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
const yieldItems = [
  `\u{1F33E} ${totalFood}`,
  `\u{2692}\u{FE0F} ${totalProd}`,
  `\u{1F4B0} ${civ.gold} (+${totalGold})`,
];
// Tech name needs textContent treatment since it could theoretically be game data
const techSpan = document.createElement('span');
techSpan.textContent = `\u{1F52C} ${techName !== 'None' ? techName : 'None'} (+${totalScience})`;

for (const text of yieldItems) {
  const span = document.createElement('span');
  span.textContent = text;
  yieldsRow.appendChild(span);
}
yieldsRow.appendChild(techSpan);

const infoRow = document.createElement('div');
infoRow.textContent = `${nameLabel}Turn ${gameState.turn} \u00B7 Era ${gameState.era}`;

hud.appendChild(yieldsRow);
hud.appendChild(infoRow);
```

Wait — the emoji characters in the original code use literal emoji. The DOM building approach can use them directly in `textContent` strings. So:

```typescript
hud.textContent = '';

const yieldsRow = document.createElement('div');
yieldsRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

const items = [
  ['span', `🌾 ${totalFood}`],
  ['span', `⚒️ ${totalProd}`],
  ['span', `💰 ${civ.gold} (+${totalGold})`],
  ['span', `🔬 ${techName !== 'None' ? techName : 'None'} (+${totalScience})`],
] as const;

for (const [, text] of items) {
  const span = document.createElement('span');
  span.textContent = text;
  yieldsRow.appendChild(span);
}

const infoRow = document.createElement('div');
infoRow.textContent = `${nameLabel}Turn ${gameState.turn} · Era ${gameState.era}`;

hud.appendChild(yieldsRow);
hud.appendChild(infoRow);
```

Note: `nameLabel` is `gameState.hotSeat ? `${civ.name} · ` : ''` (line 145). `civ.name` is user input in hot-seat. Using `textContent` makes it safe.

- [ ] **Step 2: Fix selectUnit panel innerHTML in `main.ts`**

Read `src/main.ts` lines 460-498. The `selectUnit()` function builds an `actions` string of button HTML, then sets `panel.innerHTML`.

The `actions` string contains only hardcoded button HTML with no game-data interpolation (button labels like "Found City", "Build Farm" are literal strings). The game data in the panel:
- `${def.name}` — from UNIT_DEFINITIONS (safe, not user input)
- `${unit.health}` — number
- `${unit.movementPointsLeft}` — number
- `${def.movementPoints}` — number
- `${UNIT_DESCRIPTIONS[unit.type]}` — from definitions
- `${civColor}` — hex color string from civ definition
- `${actions}` — contains button HTML built from hardcoded strings

Since `actions` is a string of button HTML (not game data), and the other interpolations are all from game definitions (not user input), the XSS risk here is theoretical. But for compliance:

Refactor to DOM building. Build the panel structure with createElement:

```typescript
panel.style.display = 'block';
panel.textContent = '';

const wrapper = document.createElement('div');
wrapper.style.cssText = `background:rgba(0,0,0,0.85);border-radius:12px;padding:12px 16px;border-left:4px solid ${civColor};`;

const topRow = document.createElement('div');
topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

const infoDiv = document.createElement('div');
const strong = document.createElement('strong');
strong.textContent = def.name;
infoDiv.appendChild(strong);
infoDiv.appendChild(document.createTextNode(` · HP: ${unit.health}/100 · Moves: ${unit.movementPointsLeft}/${def.movementPoints}`));

const closeBtn = document.createElement('span');
closeBtn.id = 'btn-deselect';
closeBtn.style.cssText = 'cursor:pointer;font-size:18px;opacity:0.6;';
closeBtn.textContent = '✕';

topRow.appendChild(infoDiv);
topRow.appendChild(closeBtn);

const descDiv = document.createElement('div');
descDiv.style.cssText = 'font-size:10px;opacity:0.6;margin-top:2px;';
descDiv.textContent = UNIT_DESCRIPTIONS[unit.type] ?? '';

const actionsDiv = document.createElement('div');
actionsDiv.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;';
// Actions are hardcoded button HTML — safe to use innerHTML for these
// since they contain no game-generated strings
actionsDiv.innerHTML = actions;

wrapper.appendChild(topRow);
wrapper.appendChild(descDiv);
wrapper.appendChild(actionsDiv);
panel.appendChild(wrapper);
```

Then attach event listeners the same way as before (lines 494-498), but use the DOM references instead of `getElementById`:

```typescript
closeBtn.addEventListener('click', deselectUnit);
actionsDiv.querySelector('#btn-found-city')?.addEventListener('click', () => foundCityAction());
actionsDiv.querySelector('#btn-build-farm')?.addEventListener('click', () => buildImprovementAction('farm'));
actionsDiv.querySelector('#btn-build-mine')?.addEventListener('click', () => buildImprovementAction('mine'));
actionsDiv.querySelector('#btn-rest')?.addEventListener('click', () => restAction());
```

- [ ] **Step 3: Run full build and test suite**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix(m5): replace innerHTML with DOM building in HUD and unit panel"
```

---

## Task 5: Make Combat RNG Seed Required (M5)

**Why:** `resolveCombat` falls back to `Date.now()` when no seed is provided, silently breaking determinism.

**Files:**
- Modify: `src/systems/combat-system.ts:30` — remove `Date.now()` fallback
- Test: `tests/systems/combat-system.test.ts` (verify existing tests still pass)

### Steps

- [ ] **Step 1: Fix combat-system.ts**

In `src/systems/combat-system.ts`, line 30:

```typescript
let rngState = seed ?? (Date.now() * 16807);
```

Make `seed` required by changing the function signature. Read the function signature first (around line 18-28). Change `seed?: number` to `seed: number`. Then remove the fallback:

```typescript
let rngState = seed;
```

After changing this, TypeScript will flag any call sites that don't pass `seed`. Check the build output for errors and fix any call sites.

Known call sites (verify by reading):
- `src/main.ts` — `executeAttack()` function, should already pass a seed
- `src/ai/basic-ai.ts` — AI combat, should already pass a seed
- `src/core/turn-manager.ts` — turn combat, should already pass a seed

If any call site doesn't pass a seed, add one using the pattern `state.turn * 16807 + parseInt(unitId.replace(/\D/g, ''), 10)` (unit IDs follow the pattern `unit-N`, so stripping non-digits gives a numeric value).

- [ ] **Step 2: Run build to check for type errors**

Run: `eval "$(mise activate bash)" && yarn build 2>&1`

Expected: Build succeeds. If there are type errors from missing `seed` arguments, fix those call sites.

- [ ] **Step 3: Run tests**

Run: `eval "$(mise activate bash)" && yarn test --run`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/combat-system.ts
git commit -m "fix(m5): make combat RNG seed required — no Date.now() fallback"
```

---

## Task 6: Reset ID Counters on New Game (M6)

**Why:** Module-level ID counters (`nextUnitId`, `nextCityId`, `nextCampId`, `nextSpyId`) never reset between games. After playing multiple games in one session, IDs accumulate, making saves inconsistent and potentially causing collisions when loading.

**Files:**
- Modify: `src/core/game-state.ts` — call all reset functions at game creation
- Verify: `src/systems/unit-system.ts` — has `resetUnitId()`
- Verify: `src/systems/city-system.ts` — has `resetCityId()`
- Verify: `src/systems/barbarian-system.ts` — has `resetCampId()`
- Verify: `src/systems/espionage-system.ts` — find reset function name
- Test: `tests/systems/id-reset.test.ts` (create)

### Steps

- [ ] **Step 1: Identify all reset functions**

Read these files and find the exact export names:
- `src/systems/unit-system.ts` — `resetUnitId` (line 74)
- `src/systems/city-system.ts` — `resetCityId` (line 95)
- `src/systems/barbarian-system.ts` — `resetCampId` (line 54)
- `src/systems/espionage-system.ts` — search for reset function (look for `_resetSpyIdCounter` or similar)

Note the exact exported function names. If any reset function is not exported, add `export` to it.

- [ ] **Step 2: Write test**

Create `tests/systems/id-reset.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createUnit, resetUnitId } from '@/systems/unit-system';
import { resetCityId } from '@/systems/city-system';

describe('ID counter reset between games', () => {
  it('resetUnitId resets counter to 1', () => {
    // Create some units to advance the counter
    createUnit('warrior', 'player', { q: 0, r: 0 });
    createUnit('warrior', 'player', { q: 1, r: 0 });
    
    resetUnitId();
    
    const fresh = createUnit('warrior', 'player', { q: 0, r: 0 });
    expect(fresh.id).toBe('unit-1');
  });
});
```

- [ ] **Step 3: Run test**

Run: `eval "$(mise activate bash)" && yarn test --run tests/systems/id-reset.test.ts`

Expected: PASS

- [ ] **Step 4: Call all reset functions in game creation**

In `src/core/game-state.ts`, at the very beginning of `createNewGame()` (before any unit/city creation), add calls to all reset functions:

```typescript
import { resetUnitId } from '@/systems/unit-system';
import { resetCityId } from '@/systems/city-system';
import { resetCampId } from '@/systems/barbarian-system';
// Import the spy reset function (use the actual exported name found in Step 1)
```

At the start of the function body:
```typescript
resetUnitId();
resetCityId();
resetCampId();
// resetSpyId() or whatever the actual name is
```

Also find `createHotSeatGame` (if it exists — search for it in the codebase). If it's a separate function, add the same reset calls there too. If hot-seat games go through `createNewGame`, no additional change needed.

- [ ] **Step 5: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass. Some existing tests may call `resetUnitId()` in `beforeEach` — those are fine.

- [ ] **Step 6: Commit**

```bash
git add src/core/game-state.ts src/systems/espionage-system.ts tests/systems/id-reset.test.ts
git commit -m "fix(m5): reset all ID counters on new game creation"
```

---

## Task 7: Eliminate Double `structuredClone` (M7)

**Why:** `processEspionageTurn` and `processMinorCivTurn` each perform a `structuredClone` of the entire game state, even though `turn-manager.ts` already cloned it. This doubles/triples memory during turn processing, causing lag on mobile.

**Files:**
- Modify: `src/systems/espionage-system.ts:531` — remove `structuredClone`
- Modify: `src/systems/minor-civ-system.ts:138` — remove `structuredClone`
- Test: existing tests should continue to pass

### Steps

- [ ] **Step 1: Fix `processMinorCivTurn`**

In `src/systems/minor-civ-system.ts`, line 138:

```typescript
const newState = structuredClone(state);
```

This function is called from `turn-manager.ts` line 137-138:
```typescript
newState = processMinorCivTurn(newState, bus);
```

The caller already has a cloned state. Change `processMinorCivTurn` to mutate the passed state directly instead of cloning:

```typescript
// Remove: const newState = structuredClone(state);
// Instead, work directly on the passed state
```

Read the full function to understand what it does with `newState`. If it returns `newState` at the end, change it to return the mutated `state` parameter. All internal references to `newState` should become `state`.

**Important:** Check that no code path returns early with the original `state` while other paths return the clone. All return paths must be consistent.

- [ ] **Step 2: Fix `processEspionageTurn`**

In `src/systems/espionage-system.ts`, line 531:

```typescript
let newState = structuredClone(state);
```

Same pattern: remove the `structuredClone`, work on the passed `state` directly. Read the full function body first. Change all `newState` references to `state`. Make sure the return is consistent.

- [ ] **Step 3: Check for other redundant clones**

Run: `grep -rn "structuredClone" src/`

Review results. `src/ai/basic-ai.ts` also does `structuredClone(state)` at the start of `processAITurn`. Check if it's called from `turn-manager.ts` after the initial clone. If so, it's another redundant clone and should be removed the same way.

Do NOT remove the initial clone in `turn-manager.ts` — that's the primary clone that all downstream functions depend on.

- [ ] **Step 4: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass. The behavior should be identical since the caller already provides a clone.

- [ ] **Step 5: Commit**

```bash
git add src/systems/espionage-system.ts src/systems/minor-civ-system.ts
# Also add basic-ai.ts if it was modified
git commit -m "fix(m5): remove redundant structuredClone in espionage and minor-civ turn processing"
```

---

## Task 8: Cache IDB Connection (M8)

**Why:** Every save/load operation opens a new IndexedDB connection. On mobile Safari, accumulated unclosed connections can cause performance issues and storage eviction.

**Files:**
- Modify: `src/storage/db.ts` — cache the IDB connection
- Test: `tests/storage/save-persistence.test.ts` (existing tests should pass)

### Steps

- [ ] **Step 1: Read the full `db.ts` file**

Read `src/storage/db.ts`. It has `openDB()` called by `dbGet`, `dbPut`, `dbDelete`, `dbGetAllKeys`.

- [ ] **Step 2: Add connection caching**

Add a module-level cache variable and modify `openDB()` to reuse it:

```typescript
let cachedDb: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  requestPersistentStorage();
  
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      cachedDb = request.result;
      // Clear cache if connection is closed unexpectedly
      cachedDb.onclose = () => { cachedDb = null; };
      cachedDb.onerror = () => { cachedDb = null; };
      resolve(cachedDb);
    };
    request.onerror = () => reject(request.error);
  });
}
```

The `onclose` and `onerror` handlers ensure the cache is invalidated if the connection dies (e.g., storage eviction on iOS Safari).

- [ ] **Step 3: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass. The existing save-persistence tests use a localStorage mock and don't test IDB directly, so they won't be affected.

- [ ] **Step 4: Commit**

```bash
git add src/storage/db.ts
git commit -m "fix(m5): cache IDB connection — reuse across operations"
```

---

## Task 9: Fix Treaty `civA: 'self'` (m9)

**Why:** `proposeTreaty` stores `civA: 'self'` instead of the actual civ ID, making treaty data ambiguous in save files. When both sides call `proposeTreaty`, each side stores `civA: 'self'`, making it impossible to determine the actual parties from save data.

**Files:**
- Modify: `src/systems/diplomacy-system.ts:119-143` — add `selfId` parameter
- Modify: `src/main.ts` — pass civ ID to `proposeTreaty` calls
- Modify: `src/ai/basic-ai.ts` — pass civ ID to `proposeTreaty` calls
- Test: `tests/systems/diplomacy-system.test.ts` — update existing tests

### Steps

- [ ] **Step 1: Update `proposeTreaty` signature**

In `src/systems/diplomacy-system.ts`, line 119-124, add `selfId` parameter:

```typescript
export function proposeTreaty(
  state: DiplomacyState,
  selfId: string,
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
): DiplomacyState {
```

And change line 128:
```typescript
civA: selfId,
```

- [ ] **Step 2: Find ALL call sites**

Run: `grep -rn "proposeTreaty" src/ tests/`

This will show every call site. The known ones are listed below, but there may be others. Every call site needs the new `selfId` argument inserted as the second parameter.

- [ ] **Step 3: Fix call sites**

The function is called in at least three places. Each needs the `selfId` argument inserted as the second parameter.

**`src/main.ts` lines 325-332:**
```typescript
// Line 325-327 — the current player's side
currentCiv().diplomacy = proposeTreaty(
  currentCiv().diplomacy, gameState.currentPlayer, targetCivId, action,
  action === 'non_aggression_pact' ? 10 : -1, gameState.turn,
);
// Line 330-332 — the other civ's side
gameState.civilizations[targetCivId].diplomacy = proposeTreaty(
  gameState.civilizations[targetCivId].diplomacy, targetCivId, cp, action,
  action === 'non_aggression_pact' ? 10 : -1, gameState.turn,
);
```

Read the actual code to verify `cp` is the current player variable. It might be `gameState.currentPlayer`.

**`src/ai/basic-ai.ts` lines 212-219:**
```typescript
// Line 212-215 — the AI civ's side
newState.civilizations[civId].diplomacy = proposeTreaty(
  civ.diplomacy, civId, decision.targetCiv, decision.action,
  decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
);
// Line 217-219 — the target civ's side
newState.civilizations[decision.targetCiv].diplomacy = proposeTreaty(
  newState.civilizations[decision.targetCiv].diplomacy, decision.targetCiv, civId, decision.action,
  decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
);
```

- [ ] **Step 4: Update existing tests**

In `tests/systems/diplomacy-system.test.ts`, find all `proposeTreaty` calls and add the `selfId` argument. The test uses `'player'` as the self ID (from `createDiplomacyState(civIds, 'player')`).

Replace:
```typescript
state = proposeTreaty(state, 'ai-egypt', 'non_aggression_pact', 10, 15);
```
With:
```typescript
state = proposeTreaty(state, 'player', 'ai-egypt', 'non_aggression_pact', 10, 15);
```

Do this for ALL `proposeTreaty` calls in the test file. Also check for any other test files that call `proposeTreaty` (the grep from Step 2 will show them).

- [ ] **Step 5: Run tests**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/systems/diplomacy-system.ts src/main.ts src/ai/basic-ai.ts tests/systems/diplomacy-system.test.ts
git commit -m "fix(m5): store actual civ ID in treaty civA instead of 'self'"
```

---

## Task 10: Extract Shared Hex Corner Constant (m10)

**Why:** `HEX_CORNERS_POINTY` is computed identically in both `hex-renderer.ts` and `fog-renderer.ts`. Duplication means a fix in one won't propagate to the other.

**Files:**
- Modify: `src/systems/hex-utils.ts` (or `src/renderer/hex-constants.ts`) — shared constant
- Modify: `src/renderer/hex-renderer.ts:49-56` — import shared constant
- Modify: `src/renderer/fog-renderer.ts:6-13` — import shared constant

### Steps

- [ ] **Step 1: Check if `hex-utils.ts` already exports this constant**

Read `src/systems/hex-utils.ts` and check what's exported. If it doesn't have `HEX_CORNERS_POINTY`, that's the best place to add it since both renderer files already import from it (or from `hex-renderer.ts`).

- [ ] **Step 2: Add the shared constant**

Add to `src/systems/hex-utils.ts` (or whichever file makes sense based on existing imports):

```typescript
export const HEX_CORNERS_POINTY = (function () {
  const corners: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ dx: Math.cos(angle), dy: Math.sin(angle) });
  }
  return corners;
})();
```

- [ ] **Step 3: Update both renderer files**

In `src/renderer/hex-renderer.ts`, remove lines 49-56 (the local `HEX_CORNERS_POINTY`), and add it to the import from `hex-utils`:

```typescript
import { hexToPixel, hexesInRange, HEX_CORNERS_POINTY } from '@/systems/hex-utils';
```

In `src/renderer/fog-renderer.ts`, remove lines 6-13, and import:

```typescript
import { HEX_CORNERS_POINTY } from '@/systems/hex-utils';
```

Check what's already imported from `hex-utils` in each file and merge into existing imports.

- [ ] **Step 4: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/hex-utils.ts src/renderer/hex-renderer.ts src/renderer/fog-renderer.ts
git commit -m "fix(m5): deduplicate HEX_CORNERS_POINTY into shared hex-utils"
```

---

## Task 11: Fix Fog-of-War Render Order (m5)

**Why:** Units and cities are drawn before fog of war. Enemy units in fog zones appear as partially visible silhouettes through the semi-transparent fog overlay. Units the player shouldn't see are being rendered.

**Files:**
- Modify: `src/renderer/render-loop.ts:77-144` — cull units/cities in non-visible tiles

### Steps

- [ ] **Step 1: Read the render method**

Read `src/renderer/render-loop.ts` lines 77-144. Current render order:
1. Hex map
2. Rivers
3. Minor civ territory
4. Movement highlights
5. Cities
6. Units
7. Fog of war
8. Animations

The issue: steps 5-6 draw before step 7 applies the fog.

- [ ] **Step 2: Understand the fix**

The cleanest fix is to skip drawing units and cities that are NOT in "visible" tiles. The visibility data is in `playerVis.tiles[key]` which has values `'visible'`, `'fog'`, or `undefined` (unexplored).

For units: `drawUnits` already receives `playerVis` and should filter by visibility. Read `src/renderer/unit-renderer.ts` to check if it already does this.

If `drawUnits` already culls non-visible units, then the render order is fine as-is (the fog overlay is just cosmetic on top of already-culled rendering). In that case, this task is already handled and no change is needed.

If `drawUnits` does NOT cull, then either:
a. Add visibility filtering inside `drawUnits` (preferred — keeps render-loop clean), or
b. Move fog drawing before units/cities (but this would occlude the player's own units)

Read the `drawUnits` function to determine which case applies.

- [ ] **Step 3: Implement fix if needed**

If `drawUnits` draws all units regardless of visibility:

In the unit drawing function (likely `src/renderer/unit-renderer.ts`), add a visibility check:

```typescript
const key = `${unit.position.q},${unit.position.r}`;
const visLevel = visibility.tiles[key];
if (visLevel !== 'visible') continue; // Only draw units in currently visible tiles
```

Similarly for `drawCities` in `src/renderer/city-renderer.ts`, add a visibility check. Player's own cities should always be visible (they're in visible tiles by definition), but enemy cities in fog should not be drawn.

- [ ] **Step 4: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/unit-renderer.ts src/renderer/city-renderer.ts
git commit -m "fix(m5): cull units and cities in non-visible tiles before drawing"
```

---

## Task 12: Wire Marketplace Supply/Demand (m4)

**Why:** `updatePrices` is always called with empty `{}` for supply and demand, meaning marketplace prices never change meaningfully. This is dead computed logic.

**Files:**
- Modify: `src/core/turn-manager.ts:218` — compute actual supply/demand from game state
- Read: `src/systems/marketplace-system.ts` — understand `updatePrices` signature and what supply/demand objects should contain

### Steps

- [ ] **Step 1: Read `marketplace-system.ts`**

Read the `updatePrices` function to understand:
- What type are the supply/demand parameters?
- What keys do they expect?
- How are they used to adjust prices?

- [ ] **Step 2: Compute supply/demand from game state**

In `src/core/turn-manager.ts`, before line 218, compute supply and demand based on the game state. The exact implementation depends on what `updatePrices` expects. Common pattern:

```typescript
// Compute supply from what civs produce
const supply: Record<string, number> = {};
const demand: Record<string, number> = {};
for (const [civId, civ] of Object.entries(newState.civilizations)) {
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (!city) continue;
    // Add city production to supply, population needs to demand
    // (implementation depends on marketplace-system's expected format)
  }
}
newState.marketplace = updatePrices(newState.marketplace, supply, demand);
```

Read the marketplace system to determine the correct implementation. If the system is designed to work with empty objects (prices drift based on fashion cycle only), then this may be intentional and this task should be skipped. Document the decision.

- [ ] **Step 3: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/turn-manager.ts
git commit -m "fix(m5): wire marketplace supply/demand from game state"
```

---

## Task 13: Wonder Discovery Bonus — Target Nearest City (m2)

**Why:** Wonder production bonus always goes to `civ.cities[0]` regardless of which city is closest to the wonder. This is unintuitive.

**Files:**
- Modify: `src/systems/wonder-system.ts:104-109`
- Read: `src/systems/hex-utils.ts` — for `hexDistance`

### Steps

- [ ] **Step 1: Read the wonder bonus code**

Read `src/systems/wonder-system.ts` lines 95-115. Understand the context — is the wonder position available? What does the surrounding code look like?

- [ ] **Step 2: Replace `cities[0]` with nearest city**

```typescript
case 'production': {
  // Find nearest city to the wonder
  let nearestCity = null;
  let nearestDist = Infinity;
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    const dist = hexDistance(wonder.position, city.position);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestCity = city;
    }
  }
  if (nearestCity) {
    nearestCity.productionProgress += wonder.discoveryBonus.amount;
  }
  break;
}
```

Import `hexDistance` from `@/systems/hex-utils` if not already imported. Check if `wonder.position` exists on the wonder object — read the Wonder type to verify.

- [ ] **Step 3: Run build and tests**

Run: `eval "$(mise activate bash)" && yarn build && yarn test --run`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/wonder-system.ts
git commit -m "fix(m5): wonder production bonus targets nearest city, not cities[0]"
```

---

## Final Verification

After all tasks are complete:

- [ ] **Step 1: Verify zero `Math.random()` in src/**

```bash
grep -rn "Math.random" src/
```
Expected: Zero results.

- [ ] **Step 2: Verify zero hardcoded `'player'` ownership checks in src/**

```bash
grep -rn "=== 'player'" src/ | grep -v "currentPlayer" | grep -v ".test." | grep -v "// "
grep -rn "civilizations.player" src/ | grep -v "currentPlayer" | grep -v ".test."
```
Review results carefully. Some may be legitimate (e.g., initial player ID assignment in game creation).

- [ ] **Step 3: Full build and test suite**

```bash
eval "$(mise activate bash)" && yarn build && yarn test --run
```

Expected: Build succeeds, all tests pass.

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git status
# If clean, nothing to do. If changes remain, commit them.
```
