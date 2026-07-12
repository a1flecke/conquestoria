# Unrest Pacing + Honest Happiness + Empire City Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task inline (this repo forbids subagents — see
> CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking.
> This plan is written for a fresh Claude Sonnet 4.5 agent with zero prior
> context on this codebase — every file path, current line, and full code
> block is included; do not assume any prior knowledge of the repo.

**Goal:** Fix issue #552 end to end — a 10-turn unrest window, four culture
buildings that genuinely grant happiness (making "build happiness improvements"
true), an itemized pressure breakdown in the city panel, effect text on the
resource legend, honest Concede-vs-Appease copy, and a new empire-wide city
overview panel so the player can see at a glance which cities are in unrest.

**Architecture:** One shared pressure row-builder (`getUnrestPressureBreakdown`)
feeds both `computeUnrestPressure` (used by AI/turn processing) and the city
panel UI. `Building.happiness` is a new optional per-building field summed by
`getCityHappinessFromBuildings`. A shared `getResourceEffectLabel` helper
replaces duplicated effect-text logic across `city-panel.ts` and
`icon-legend.ts`. A new `city-overview-panel.ts` reuses the exact same
Appease/Concede callback functions the existing single city panel uses (both
extracted to named functions in `main.ts`), so there is only one code path
per gameplay action.

**Tech Stack:** TypeScript, vitest, Vite, Canvas 2D + DOM/CSS UI (no framework).

## Global Constraints

- Run all commands via `bash scripts/run-with-mise.sh yarn <cmd>`. `yarn test`
  does NOT type-check — `yarn build` runs `tsc`. Run both green before any
  `git push` / `gh pr create` / `gh pr merge`.
- `git commit` → Bash timeout 30000ms. `git push` / `gh pr create` /
  `gh pr merge` → Bash timeout 120000ms (pre-push hook runs tsc + vitest).
- Use `textContent` / `createTextNode()` for all dynamic strings in `src/ui/`
  — never `innerHTML` with game-generated strings (XSS rule).
- Every `document.createElement('button')` in `src/ui/` must use
  `createGameButton()` from `src/ui/ui-kit.ts` (signature:
  `createGameButton(label: string, variant: 'primary'|'secondary'|'ghost'|'danger'|'close', options?: { disabled?: boolean; type?: 'button'|'submit' })`)
  or otherwise set both `background` and `color` inline, with `min-height: 44px`.
- Never hardcode `'player'` for ownership — always `state.currentPlayer`.
- Never use `civ.cities[0]` for "which city" — filter
  `Object.values(state.cities).filter(c => c.owner === civId)`.
- Content honesty (`.claude/rules/content-description-honesty.md`): every
  description naming a mechanic needs a positive test asserting the mechanic
  is real.
- Any economy-affecting bonus must re-run `tests/systems/pacing-audit.test.ts`
  and confirm `tests/systems/pacing-reference-economy.test.ts` snapshots do
  NOT move (happiness is not a yield — if they move, the change was wired
  into yields by mistake).

---

### Task 1: 10-turn unrest window

**Files:**
- Modify: `src/systems/faction-system.ts:16`
- Modify: `tests/systems/faction-system.test.ts` (any hardcoded `5`
  turn-to-revolt literal)

**Interfaces:**
- Produces: `REVOLT_UNREST_TURNS` (already exported, value changes 5 → 10).

- [ ] **Step 1: Change the constant**

In `src/systems/faction-system.ts`, line 16, change:

```ts
export const REVOLT_UNREST_TURNS = 5;        // turns at unrest before revolt escalates
```

to:

```ts
export const REVOLT_UNREST_TURNS = 10;       // turns at unrest before revolt escalates (#552)
```

`src/ui/notification-routing.ts:88` already interpolates this constant
(`Stabilize within ${REVOLT_UNREST_TURNS} turns...`), so its text self-updates.
No other file needs editing for this step.

- [ ] **Step 2: Find and fix hardcoded literals in tests**

Run: `grep -rn "unrestTurns.*[=><].*5\b\|REVOLT_UNREST_TURNS.*=.*5\|revolt.*5 turn" tests/ | grep -v node_modules`

For any test asserting revolt happens at exactly 5 turns via a literal `5`
(not via the `REVOLT_UNREST_TURNS` import), change the literal to reference
the imported constant instead, e.g. change:

```ts
for (let i = 0; i < 5; i++) { state = processFactionTurn(state, bus); }
expect(state.cities['city-1'].unrestLevel).toBe(2);
```

to:

```ts
for (let i = 0; i < REVOLT_UNREST_TURNS; i++) { state = processFactionTurn(state, bus); }
expect(state.cities['city-1'].unrestLevel).toBe(2);
```

(`REVOLT_UNREST_TURNS` is already imported at the top of
`tests/systems/faction-system.test.ts`.) This is the durable fix — a future
constant change shouldn't require touching test literals again.

- [ ] **Step 3: Run the suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS (no regressions; any test that broke must be fixed per Step 2's
pattern, not by reverting the constant).

- [ ] **Step 4: Commit**

```bash
git add src/systems/faction-system.ts tests/systems/faction-system.test.ts
git commit -m "balance(unrest): 10 turns before revolt escalation (#552)"
```

---

### Task 2: `Building.happiness` field + four real happiness buildings

**Files:**
- Modify: `src/core/types.ts:406-421` (`Building` interface)
- Modify: `src/systems/city-system.ts` (temple, amphitheater, monastery,
  concert_hall entries)
- Modify: `src/systems/faction-system.ts` (new `getCityHappinessFromBuildings`,
  wire into `computeUnrestPressure`)
- Test: `tests/systems/faction-system.test.ts` (extend)

**Interfaces:**
- Produces: `Building.happiness?: number` (new optional field).
- Produces: `getCityHappinessFromBuildings(city: City): number` in
  `src/systems/faction-system.ts` — sums `BUILDINGS[id]?.happiness ?? 0` over
  `city.buildings`.
- Consumes: `BUILDINGS` from `src/systems/city-system.ts` (already imported —
  `faction-system.ts` does not currently import from `city-system.ts`; verify
  no import cycle before adding it — see Step 3).

- [ ] **Step 1: Add the field to the `Building` interface**

In `src/core/types.ts`, the current interface (lines 406-421) reads:

```ts
export interface Building {
  id: string;
  name: string;
  category?: BuildingCategory;
  yields: ResourceYield;
  productionCost: number;
  description: string;
  techRequired?: string | null;
  coastalRequired?: boolean;
  pacing?: PacingMetadata;
  resourceRequired?: ResourceType[];
  routeCapacity?: number;   // trade route slots added to the FROM city; 0 or absent = none
  requiresBuildings?: string[];   // chain of building IDs that must be built first
  uniquePerEmpire?: true;         // only one instance per civ (used by national projects)
  nationalProject?: NationalProject;  // present when this building is a national project
  civYieldBonus?: Partial<ResourceYield>;  // empire-wide yield bonus while active
  obsoletedByTech?: string;  // once this tech completes, building is hidden from queue, silently dequeued, upkeep-free
}
```

Add one field before the closing brace:

```ts
  obsoletedByTech?: string;  // once this tech completes, building is hidden from queue, silently dequeued, upkeep-free
  happiness?: number;  // per-city unrest-pressure reduction while built (#552); NOT for nationalProject buildings — those must be empire-wide, see game-balance.md
}
```

- [ ] **Step 2: Give four buildings a real happiness value**

In `src/systems/city-system.ts`, line 72, change:

```ts
  temple: { id: 'temple', name: 'Temple', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 45, description: 'Spiritual center', techRequired: 'philosophy' },
```

to:

```ts
  temple: { id: 'temple', name: 'Temple', category: 'culture', yields: { food: 0, production: 0, gold: 0, science: 1 }, productionCost: 45, description: 'Spiritual center. +1 happiness in this city (reduces unrest pressure).', techRequired: 'philosophy', happiness: 1 },
```

Line 74, change:

```ts
  amphitheater: { id: 'amphitheater', name: 'Amphitheater', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 85, description: 'Entertainment and culture', techRequired: 'drama-poetry' },
```

to:

```ts
  amphitheater: { id: 'amphitheater', name: 'Amphitheater', category: 'culture', yields: { food: 0, production: 0, gold: 2, science: 1 }, productionCost: 85, description: 'Entertainment and culture. +1 happiness in this city (reduces unrest pressure).', techRequired: 'drama-poetry', happiness: 1 },
```

Find the `monastery` entry (`grep -n "monastery:" src/systems/city-system.ts`),
currently:

```ts
  monastery: {
    id: 'monastery', name: 'Monastery', category: 'culture',
    yields: { food: 0, production: 0, gold: 1, science: 1 }, productionCost: 110,
    description: 'Monastic community of scholars. +1 science, +1 gold.',
    techRequired: 'monastic-orders',
  },
```

change to:

```ts
  monastery: {
    id: 'monastery', name: 'Monastery', category: 'culture',
    yields: { food: 0, production: 0, gold: 1, science: 1 }, productionCost: 110,
    description: 'Monastic community of scholars. +1 science, +1 gold, +1 happiness in this city (reduces unrest pressure).',
    techRequired: 'monastic-orders',
    happiness: 1,
  },
```

Find the `concert_hall` entry (`grep -n "concert_hall:" src/systems/city-system.ts`),
currently:

```ts
  concert_hall: {
    id: 'concert_hall', name: 'Concert Hall', category: 'culture',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 115,
    description: 'Grand music hall draws wealthy patrons. +3 gold. Cultural prestige.',
    techRequired: 'baroque-music',
  },
```

change to:

```ts
  concert_hall: {
    id: 'concert_hall', name: 'Concert Hall', category: 'culture',
    yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 115,
    description: 'Grand music hall draws wealthy patrons. +3 gold, +1 happiness in this city (reduces unrest pressure).',
    techRequired: 'baroque-music',
    happiness: 1,
  },
```

(Do NOT touch `sacred_grove` — it is a national project with
`uniquePerEmpire: true` and `nationalProject: { homeEra: 1 }`; giving it a
per-city `happiness` field would only benefit the one city that happens to
host it, violating the empire-wide-effects contract for national projects.
It is intentionally excluded from this MR.)

- [ ] **Step 3: Check for import cycles, then add `getCityHappinessFromBuildings`**

Run: `grep -n "^import" src/systems/faction-system.ts | grep city-system`
Run: `grep -n "^import" src/systems/city-system.ts | grep faction-system`

If the second grep returns nothing (expected — `city-system.ts` should not
import from `faction-system.ts`), it's safe to import `BUILDINGS` into
`faction-system.ts`. Add to the top of `src/systems/faction-system.ts`,
alongside the existing imports:

```ts
import { BUILDINGS } from './city-system';
```

Then add this function near `getContagionSpread` (after its closing brace,
around line 126):

```ts
// Building happiness (#552): the "build happiness improvements" advice in
// notification-routing.ts is only true because of this — see the four
// buildings with a `happiness` field in city-system.ts. Per-city, unlike
// luxury-resource happiness which is empire-wide.
export function getCityHappinessFromBuildings(city: City): number {
  let total = 0;
  for (const id of city.buildings) {
    total += BUILDINGS[id]?.happiness ?? 0;
  }
  return total;
}
```

- [ ] **Step 4: Wire it into `computeUnrestPressure`**

In `src/systems/faction-system.ts`, line 78-79, currently:

```ts
  // Happiness from luxury resources reduces unrest pressure (2 pressure per happiness point)
  pressure -= ownerHappiness * 2;
```

change to:

```ts
  // Happiness from luxury resources (empire-wide) plus this city's own happiness
  // buildings (per-city) reduces unrest pressure, 2 pressure per happiness point (#552).
  pressure -= (ownerHappiness + getCityHappinessFromBuildings(city)) * 2;
```

- [ ] **Step 5: Write the failing tests, then verify they pass**

Add to `tests/systems/faction-system.test.ts`, after the existing `import`
block, a local helper (there is no `addBuilding` helper in this file yet):

```ts
function addBuilding(state: GameState, cityId: string, buildingId: string): GameState {
  const city = state.cities[cityId];
  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...city, buildings: [...city.buildings, buildingId] },
    },
  };
}
```

Add a new `describe` block (anywhere at the top level of the file, alongside
the other `describe` blocks):

```ts
import { BUILDINGS } from '@/systems/city-system';
import { getCityHappinessFromBuildings } from '@/systems/faction-system';

describe('building happiness (#552)', () => {
  it('a temple reduces its own city\'s pressure by 2', () => {
    const state = makeState({ cityCount: 6 }); // cityCount 6 gives nonzero overextension pressure so the -2 delta is observable above the 0-floor clamp
    const base = computeUnrestPressure('city-1', state, 0);
    const withTemple = computeUnrestPressure('city-1', addBuilding(state, 'city-1', 'temple'), 0);
    expect(base - withTemple).toBe(2);
  });

  it('building happiness is per-city, not empire-wide', () => {
    const state = makeState({ cityCount: 6 });
    const next = addBuilding(state, 'city-1', 'temple');
    expect(computeUnrestPressure('city-2', next, 0)).toBe(computeUnrestPressure('city-2', state, 0));
  });

  it('every building that claims happiness in its description has a happiness value, and vice versa', () => {
    for (const b of Object.values(BUILDINGS)) {
      const claims = /happiness/i.test(b.description);
      const has = (b.happiness ?? 0) > 0;
      expect(claims, `${b.id}: description claims happiness=${claims}, field has happiness=${has}`).toBe(has);
    }
  });

  it('all four designated culture buildings grant +1 happiness', () => {
    for (const id of ['temple', 'amphitheater', 'monastery', 'concert_hall']) {
      expect(BUILDINGS[id].happiness).toBe(1);
    }
  });

  it('sacred_grove (a national project) does not have a per-city happiness field', () => {
    expect(BUILDINGS['sacred_grove'].happiness).toBeUndefined();
  });

  it('getCityHappinessFromBuildings sums multiple happiness buildings', () => {
    const state = makeState({ cityCount: 1 });
    let next = addBuilding(state, 'city-1', 'temple');
    next = addBuilding(next, 'city-1', 'amphitheater');
    expect(getCityHappinessFromBuildings(next.cities['city-1'])).toBe(2);
  });

  it('a pre-MR-4 saved city with temple in buildings gets happiness on load with no migration', () => {
    // load-shaped test: buildings array is id-based, so an old save with
    // 'temple' already in city.buildings picks up the new effect automatically.
    const state = makeState({ cityCount: 6 });
    const legacyCity = addBuilding(state, 'city-1', 'temple').cities['city-1'];
    expect(getCityHappinessFromBuildings(legacyCity)).toBe(1);
  });
});
```

- [ ] **Step 6: Run the suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. If `economyValue` in `ai-production.ts` or any other module
imports `BUILDINGS` from `city-system.ts` and `city-system.ts` in turn ends up
importing `faction-system.ts` transitively, `yarn build` (Step 6b below) will
surface a circular-import warning from Vite/tsc — if that happens, move
`getCityHappinessFromBuildings` into `city-system.ts` instead and import it
from `faction-system.ts`, keeping this task's tests in the same file (they
test the function by name, not by which file it lives in).

- [ ] **Step 6b: Confirm pacing snapshots did not move**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-reference-economy.test.ts tests/systems/pacing-audit.test.ts`
Expected: PASS with no snapshot diffs. Happiness is not a yield type, so
`RESEARCH_OUTPUT_BY_ERA` and the reference-economy snapshots must be
unaffected. If they moved, `happiness` was wired into a yield path by mistake
— re-check Step 4 only touches `computeUnrestPressure`, not
`calculateCityYields`.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/city-system.ts src/systems/faction-system.ts tests/systems/faction-system.test.ts
git commit -m "feat(unrest): culture buildings grant real happiness (#552)"
```

---

### Task 3: Shared pressure-breakdown builder + city panel display

**Files:**
- Modify: `src/systems/faction-system.ts` — refactor `computeUnrestPressure`
  into a row-builder; add `getUnrestPressureBreakdown`.
- Modify: `src/ui/city-panel.ts` — render breakdown rows in the unrest section.
- Test: `tests/systems/faction-system.test.ts`, `tests/ui/city-panel.test.ts`.

**Interfaces:**
- Produces: `getUnrestPressureBreakdown(cityId: string, state: GameState, ownerHappiness?: number): Array<{ label: string; amount: number }>` in
  `src/systems/faction-system.ts`.
- `computeUnrestPressure(cityId, state, ownerHappiness = 0)` signature is
  unchanged; it becomes `clamp(sum of getUnrestPressureBreakdown(...).amount)`.

- [ ] **Step 1: Refactor `computeUnrestPressure` into a row-builder**

In `src/systems/faction-system.ts`, replace the current body (lines 37-84):

```ts
export function computeUnrestPressure(cityId: string, state: GameState, ownerHappiness = 0): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const owner = city.owner;
  const civ = state.civilizations[owner];
  if (!civ) return 0;

  let pressure = 0;

  // Empire overextension: each city over 5 adds 3 pressure
  const cityCount = civ.cities.length;
  pressure += Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - 5) * 3));

  const capital = getCapitalCity(state, owner);
  if (capital && capital.id !== cityId) {
    const dist = hexDistance(city.position, capital.position);
    pressure += Math.min(MAX_PRESSURE_DISTANCE, Math.max(0, (dist - 5) * 2));
  }

  // Recent conquest
  if (city.conquestTurn !== undefined) {
    const turnsSince = state.turn - city.conquestTurn;
    if (turnsSince < CONQUEST_UNREST_DURATION) {
      pressure += 25;
    }
  }

  // War weariness
  const atWarCount = civ.diplomacy.atWarWith?.length ?? 0;
  pressure += Math.min(MAX_PRESSURE_WAR, atWarCount * 8);

  // Spy unrest bonus
  pressure += city.spyUnrestBonus;

  if (state.era >= 3) {
    const economy = getEconomyStatusForCiv(state, owner);
    if (economy.strainLevel === 'critical') {
      pressure += Math.min(MAX_PRESSURE_ECONOMY, 12 + economy.unpaidMaintenance * 2);
    }
  }

  // Happiness from luxury resources (empire-wide) plus this city's own happiness
  // buildings (per-city) reduces unrest pressure, 2 pressure per happiness point (#552).
  pressure -= (ownerHappiness + getCityHappinessFromBuildings(city)) * 2;

  pressure += getContagionSpread(cityId, state).pressure;

  return Math.min(100, Math.max(0, pressure));
}
```

with:

```ts
export interface UnrestPressureRow {
  label: string;
  amount: number;
}

// Single source of truth for unrest pressure (#552): both computeUnrestPressure
// (consumed by AI/turn processing) and the city panel breakdown UI build from
// this row list, so they can never drift apart.
export function getUnrestPressureBreakdown(
  cityId: string,
  state: GameState,
  ownerHappiness = 0,
): UnrestPressureRow[] {
  const city = state.cities[cityId];
  if (!city) return [];
  const owner = city.owner;
  const civ = state.civilizations[owner];
  if (!civ) return [];

  const rows: UnrestPressureRow[] = [];

  // Empire overextension: each city over 5 adds 3 pressure
  const cityCount = civ.cities.length;
  const overextension = Math.min(MAX_PRESSURE_EMPIRE, Math.max(0, (cityCount - 5) * 3));
  if (overextension > 0) rows.push({ label: 'Empire overextension', amount: overextension });

  const capital = getCapitalCity(state, owner);
  if (capital && capital.id !== cityId) {
    const dist = hexDistance(city.position, capital.position);
    const distancePressure = Math.min(MAX_PRESSURE_DISTANCE, Math.max(0, (dist - 5) * 2));
    if (distancePressure > 0) rows.push({ label: 'Distance from capital', amount: distancePressure });
  }

  // Recent conquest
  if (city.conquestTurn !== undefined) {
    const turnsSince = state.turn - city.conquestTurn;
    if (turnsSince < CONQUEST_UNREST_DURATION) {
      rows.push({ label: 'Recent conquest', amount: 25 });
    }
  }

  // War weariness
  const atWarCount = civ.diplomacy.atWarWith?.length ?? 0;
  const warPressure = Math.min(MAX_PRESSURE_WAR, atWarCount * 8);
  if (warPressure > 0) rows.push({ label: 'War weariness', amount: warPressure });

  // Spy unrest bonus
  if (city.spyUnrestBonus > 0) rows.push({ label: 'Enemy espionage', amount: city.spyUnrestBonus });

  if (state.era >= 3) {
    const economy = getEconomyStatusForCiv(state, owner);
    if (economy.strainLevel === 'critical') {
      const economyPressure = Math.min(MAX_PRESSURE_ECONOMY, 12 + economy.unpaidMaintenance * 2);
      rows.push({ label: 'Economic strain', amount: economyPressure });
    }
  }

  if (ownerHappiness > 0) rows.push({ label: 'Luxury resources', amount: -ownerHappiness * 2 });

  const buildingHappiness = getCityHappinessFromBuildings(city);
  if (buildingHappiness > 0) rows.push({ label: 'Happiness buildings', amount: -buildingHappiness * 2 });

  const contagion = getContagionSpread(cityId, state).pressure;
  if (contagion > 0) rows.push({ label: 'Uprising contagion', amount: contagion });

  return rows;
}

export function computeUnrestPressure(cityId: string, state: GameState, ownerHappiness = 0): number {
  const rows = getUnrestPressureBreakdown(cityId, state, ownerHappiness);
  const sum = rows.reduce((total, row) => total + row.amount, 0);
  return Math.min(100, Math.max(0, sum));
}
```

`getContagionSpread` and `getCityHappinessFromBuildings` are both already
defined earlier in this file (the former pre-existing, the latter added in
Task 2) — no new imports needed. Note `getContagionSpread` is called from
inside `getUnrestPressureBreakdown` now instead of `computeUnrestPressure`
directly; `computeUnrestPressure`'s own callers are unaffected since it still
returns the same clamped number.

- [ ] **Step 2: Write the breakdown invariant test**

Add to `tests/systems/faction-system.test.ts`:

```ts
import { getUnrestPressureBreakdown } from '@/systems/faction-system';

describe('unrest pressure breakdown (#552)', () => {
  it('breakdown rows sum to the pressure total (pre-clamp) for varied cities', () => {
    const state = makeState({ cityCount: 6, atWarCount: 2, unrestLevel: 0 });
    for (const cityId of Object.keys(state.cities)) {
      const rows = getUnrestPressureBreakdown(cityId, state, 0);
      const sum = rows.reduce((total, row) => total + row.amount, 0);
      expect(Math.min(100, Math.max(0, sum))).toBe(computeUnrestPressure(cityId, state, 0));
    }
  });

  it('includes an Uprising contagion row when a same-owner city nearby is in revolt', () => {
    const state = makeState({ cityCount: 2, unitPositions: [] });
    const revolting: GameState = {
      ...state,
      cities: {
        ...state.cities,
        'city-2': { ...state.cities['city-2'], unrestLevel: 2 },
      },
    };
    const rows = getUnrestPressureBreakdown('city-1', revolting, 0);
    const contagionRow = rows.find(r => r.label === 'Uprising contagion');
    expect(contagionRow).toBeDefined();
    expect(contagionRow!.amount).toBeGreaterThan(0);
  });

  it('includes a Happiness buildings row with a negative amount when the city has one', () => {
    const state = makeState({ cityCount: 6 });
    const withTemple = addBuilding(state, 'city-1', 'temple');
    const rows = getUnrestPressureBreakdown('city-1', withTemple, 0);
    const row = rows.find(r => r.label === 'Happiness buildings');
    expect(row).toBeDefined();
    expect(row!.amount).toBe(-2);
  });
});
```

(`addBuilding` and `makeState` are the helpers already present from Task 2 and
the top of this test file, respectively.)

- [ ] **Step 3: Run the suite, confirm pass**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 4: Render the breakdown in the city panel**

In `src/ui/city-panel.ts`, find the current unrest section (search
`unrestSectionHtml` — currently around line 276-285):

```ts
  const unrestSectionHtml = city.unrestLevel > 0 ? `
    <div style="background:rgba(217,80,80,0.12);border:1px solid rgba(217,80,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e88;margin-bottom:4px;">
        ${city.unrestLevel === 2 ? '⚠️ Revolt' : '⚠️ Unrest'} — yields reduced${isCityProductionLocked(city) ? ', production locked' : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" data-appease="${city.id}" ${appeaseDisabled ? 'disabled' : ''} title="${appeaseLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${appeaseDisabled ? 'default' : 'pointer'};background:${appeaseDisabled ? 'rgba(255,255,255,0.08)' : '#d4aa2c'};color:${appeaseDisabled ? 'rgba(255,255,255,0.4)' : '#1a1a1a'};border:none;">${appeaseLabel}</button>
        <button type="button" data-concede="${city.id}" ${concedeDisabled ? 'disabled' : ''} title="${concedeLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${concedeDisabled ? 'default' : 'pointer'};background:${concedeDisabled ? 'rgba(255,255,255,0.08)' : '#4a90d9'};color:${concedeDisabled ? 'rgba(255,255,255,0.4)' : '#fff'};border:none;">${concedeLabel}</button>
      </div>
    </div>` : '';
```

Add the breakdown rows and the Concede/Appease help line (Task 4 handles the
help-line copy itself — this step reserves the DOM slot with a `data-text` id
so Task 4 doesn't need to touch this block again). Just above this block
(still inside the function, after the `contagionSpread`/`spreadWarningHtml`
computation that already exists at lines 264-271), add:

```ts
  const pressureBreakdownRows = city.unrestLevel > 0
    ? getUnrestPressureBreakdown(city.id, state, civHappinessForBreakdown(state, city.owner))
    : [];
```

This calls a small local helper — add it near the top of the file (alongside
other helper functions, e.g. near `resourceDisplayName`):

```ts
function civHappinessForBreakdown(state: GameState, civId: string): number {
  // Mirrors processFactionTurn's per-civ happiness precompute (faction-system.ts)
  // so the panel's breakdown matches what turn processing actually used.
  const civ = state.civilizations[civId];
  const feasting = (civ?.feastUntilTurn ?? 0) > state.turn;
  return getCivHappinessFromResources(state, civId) + (feasting ? 2 : 0);
}
```

Add the import at the top of `city-panel.ts`:

```ts
import { getUnrestPressureBreakdown } from '@/systems/faction-system';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
```

(Check first whether either is already imported — `grep -n "from '@/systems/faction-system'\|from '@/systems/resource-acquisition-system'" src/ui/city-panel.ts` — and merge into the existing import statement rather than duplicating it.)

Now replace the `unrestSectionHtml` block with:

```ts
  const pressureRowsHtml = pressureBreakdownRows
    .map((row, idx) => `<div style="font-size:11px;opacity:0.85;" data-pressure-row="${idx}"></div>`)
    .join('');
  const unrestSectionHtml = city.unrestLevel > 0 ? `
    <div style="background:rgba(217,80,80,0.12);border:1px solid rgba(217,80,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e88;margin-bottom:4px;">
        ${city.unrestLevel === 2 ? '⚠️ Revolt' : '⚠️ Unrest'} — yields reduced${isCityProductionLocked(city) ? ', production locked' : ''}
      </div>
      <div style="margin-bottom:8px;">${pressureRowsHtml}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" data-appease="${city.id}" ${appeaseDisabled ? 'disabled' : ''} title="${appeaseLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${appeaseDisabled ? 'default' : 'pointer'};background:${appeaseDisabled ? 'rgba(255,255,255,0.08)' : '#d4aa2c'};color:${appeaseDisabled ? 'rgba(255,255,255,0.4)' : '#1a1a1a'};border:none;">${appeaseLabel}</button>
        <button type="button" data-concede="${city.id}" ${concedeDisabled ? 'disabled' : ''} title="${concedeLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${concedeDisabled ? 'default' : 'pointer'};background:${concedeDisabled ? 'rgba(255,255,255,0.08)' : '#4a90d9'};color:${concedeDisabled ? 'rgba(255,255,255,0.4)' : '#fff'};border:none;">${concedeLabel}</button>
      </div>
      <div style="opacity:0.7;margin-top:6px;" data-text="concede-appease-help"></div>
    </div>` : '';
```

Then find the `textContent` population block (search for
`// Populate resource bonus rows via textContent` around line 806) and add,
right before it:

```ts
  // Populate unrest pressure breakdown rows via textContent (XSS-safe) (#552)
  pressureBreakdownRows.forEach((row, idx) => {
    const el = panel.querySelector(`[data-pressure-row="${idx}"]`);
    if (el) el.textContent = `${row.label}: ${row.amount > 0 ? '+' : ''}${Math.round(row.amount)}`;
  });
```

- [ ] **Step 5: Write the UI test**

`tests/ui/city-panel.test.ts` already has the exact fixture idiom needed —
see its `'city-panel unrest section — #436'` describe block: a
`makeWonderPanelFixture()` helper returns `{ container, city, state }`;
`createCityPanel(container, city, state, callbacks)` mounts the panel; a
`collectText(panel)` helper (already defined/imported in that file) reads all
rendered text. Add a new describe block using that exact idiom:

```ts
describe('unrest pressure breakdown (#552)', () => {
  it('shows a War weariness row for a city in unrest with an active war', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    state.civilizations[state.currentPlayer].diplomacy.atWarWith = ['enemy'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(collectText(panel)).toContain('War weariness');
  });

  it('shows a Happiness buildings row when the city has a temple', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.buildings = ['temple'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const text = collectText(panel);
    expect(text).toContain('Happiness buildings');
    expect(text).toContain('-2');
  });
});
```

(Verify `state.civilizations[state.currentPlayer].diplomacy.atWarWith` is the
correct path by checking how `atWarCount`/`atWarWith` is read elsewhere in
`faction-system.ts` — Task 3 Step 1's row-builder code reads
`civ.diplomacy.atWarWith?.length`, confirming this path is correct.)

- [ ] **Step 6: Run the suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/faction-system.ts src/ui/city-panel.ts tests/systems/faction-system.test.ts tests/ui/city-panel.test.ts
git commit -m "feat(city-panel): itemized unrest pressure breakdown (#552)"
```

---

### Task 4: Honest Concede vs Appease copy

**Files:**
- Modify: `src/ui/city-panel.ts` (button tooltips + help line populated)

**Interfaces:**
- Consumes: `appeaseLabel`, `concedeLabel`, `appeaseCost`, `concessionCost`,
  `CONCESSION_IMMUNITY_TURNS` (already computed/imported in this file — see
  Task 3 Step 4's surrounding code, lines ~246-263).

- [ ] **Step 1: Import `CONCESSION_IMMUNITY_TURNS`**

Run: `grep -n "CONCESSION_IMMUNITY_TURNS" src/ui/city-panel.ts` — if not
already imported, add it to the existing `from '@/systems/faction-system'`
import statement (merge with the imports added in Task 3 Step 4).

- [ ] **Step 2: Expand the button tooltips**

In `src/ui/city-panel.ts`, find (added around line 253-263, unchanged by
earlier tasks):

```ts
  const appeaseLabel = appeasedThisTurn
    ? 'Already appeased this turn'
    : !canAffordAppease
      ? `Not enough gold (needs ${appeaseCost})`
      : `Appease (${appeaseCost} gold)`;
  const concessionCost = getConcessionCost(state, city);
  const canAffordConcession = civGoldForAppease >= concessionCost;
  const concedeDisabled = !canAffordConcession || isConcessionImmune || !callbacks.onConcedeToMovement;
  const concedeLabel = !canAffordConcession
    ? `Not enough gold (needs ${concessionCost})`
    : `Concede (${concessionCost} gold)`;
```

Leave the button *label* text unchanged (it's already the compact
cost-forward label used elsewhere), but add two new honest tooltip strings
right after `concedeLabel` is defined:

```ts
  const appeaseTooltip = `Appease: pay ${appeaseCost} gold to calm this city right now. Cheap and repeatable, but new pressure can build again next turn.`;
  const concedeTooltip = `Concede: pay ${concessionCost} gold for a charter — clears unrest immediately and makes this city immune to new unrest (including spread from other cities) for ${CONCESSION_IMMUNITY_TURNS} turns. Costs more than Appease, but lasts.`;
```

- [ ] **Step 3: Use the new tooltips on the buttons and add the static help line**

Still in the `unrestSectionHtml` template from Task 3 Step 4, change the two
`title="..."` attributes from `title="${appeaseLabel}"` /
`title="${concedeLabel}"` to `title="${appeaseTooltip}"` /
`title="${concedeTooltip}"` respectively (the button's visible *text* stays
`${appeaseLabel}` / `${concedeLabel}` — only the tooltip attribute changes).

Then, in the `textContent`-population block from Task 3 Step 4, populate the
`concede-appease-help` slot reserved there:

```ts
  const el = panel.querySelector('[data-text="concede-appease-help"]');
  if (el) el.textContent = 'Appease is cheap and repeatable but unrest can return. Concede costs more but grants long immunity to new unrest.';
```

(Add this alongside the other `setText(...)` / direct-`el.textContent` calls
already in that block — follow whichever exact idiom the surrounding lines
use, `setText('id', value)` helper vs. direct `querySelector`.)

- [ ] **Step 4: Write a render test**

Add to `tests/ui/city-panel.test.ts`, using the same `makeWonderPanelFixture()`
/ `createCityPanel(...)` idiom as Task 3's test:

```ts
describe('concede vs appease copy (#552)', () => {
  it('gives Appease and Concede distinct explanatory tooltips', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const appeaseBtn = panel.querySelector('[data-appease]') as HTMLButtonElement;
    const concedeBtn = panel.querySelector('[data-concede]') as HTMLButtonElement;
    expect(appeaseBtn.title).toContain('repeatable');
    expect(concedeBtn.title).toContain('immune');
  });

  it('shows a static help line summarizing the trade-off', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(collectText(panel)).toContain('Concede costs more but grants long immunity');
  });
});
```

- [ ] **Step 5: Run the suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "fix(ui): explain concede vs appease trade-off in city panel (#552)"
```

---

### Task 5: Resource effect text (shared helper + icon legend)

**Files:**
- Modify: `src/systems/resource-definitions.ts` — new
  `getResourceEffectLabel(effect: ResourceEffect | null): string`.
- Modify: `src/ui/city-panel.ts` — replace inline `yieldLabel`/happiness-string
  logic with the shared helper (no behavior change).
- Modify: `src/ui/icon-legend.ts` — add effect text to the existing resource
  rows.
- Test: `tests/systems/resource-definitions.test.ts` (create if it doesn't
  exist — check first: `ls tests/systems/resource-definitions.test.ts`),
  `tests/ui/icon-legend.test.ts` (extend).

**Interfaces:**
- Produces: `getResourceEffectLabel(effect: ResourceEffect | null): string` in
  `src/systems/resource-definitions.ts`.

- [ ] **Step 1: Add the shared helper**

In `src/systems/resource-definitions.ts`, after the `ResourceEffect` interface
(lines 3-6), add:

```ts
// Shared by city-panel.ts (owned-resource bonus rows) and icon-legend.ts
// (tech-revealed resource reference) so effect text can never drift between
// the two surfaces (#552).
export function getResourceEffectLabel(effect: ResourceEffect | null): string {
  if (!effect) return '';
  switch (effect.type) {
    case 'happiness': return `+${effect.amount} happiness (reduces unrest in all your cities)`;
    case 'gold': return `+${effect.amount} gold/turn on the worked tile`;
    case 'production': return `+${effect.amount} production/turn on the worked tile`;
    case 'food': return `+${effect.amount} food/turn on the worked tile`;
    case 'science': return `+${effect.amount} science/turn on the worked tile`;
    default: {
      const exhaustive: never = effect.type;
      return exhaustive;
    }
  }
}
```

(The `case default` exhaustiveness check will fail `tsc` at build time — not
just at test time — if a new `ResourceEffect.type` union member is ever added
without a matching case here, which is the intended guardrail.)

- [ ] **Step 2: Replace the inline logic in `city-panel.ts` with the shared helper**

In `src/ui/city-panel.ts`, the current inline logic (lines 156-169):

```ts
  function resourceDisplayName(defId: string, defName: string): string {
    // The "gold" resource name collides with the currency name in context like "+1 gold/turn"
    return defId === 'gold' ? 'Gold deposits' : defName;
  }

  function yieldLabel(effectType: string): string {
    switch (effectType) {
      case 'gold': return '+1 gold/turn';
      case 'production': return '+1 production/turn';
      case 'food': return '+1 food/turn';
      case 'science': return '+1 science/turn';
      default: return '';
    }
  }
```

Keep `resourceDisplayName` (it's a different, city-panel-specific concern —
avoiding a name collision with the currency word "gold"), but delete
`yieldLabel` entirely, and change every call site that used it. There is
exactly one call site (line 813):

```ts
  for (const def of yieldResources) {
    const el = panel.querySelector(`[data-res-yield="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → ${yieldLabel(def.effect!.type)}`;
  }
```

change to:

```ts
  for (const def of yieldResources) {
    const el = panel.querySelector(`[data-res-yield="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → ${getResourceEffectLabel(def.effect)}`;
  }
```

Also change the happiness row population (line 809, no `yieldLabel` involved,
but for consistency now route it through the same helper):

```ts
  for (const def of happinessResources) {
    const el = panel.querySelector(`[data-res-happiness="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → +1 happiness`;
  }
```

change to:

```ts
  for (const def of happinessResources) {
    const el = panel.querySelector(`[data-res-happiness="${def.id}"]`);
    if (el) el.textContent = `${def.icon} ${resourceDisplayName(def.id, def.name)} → ${getResourceEffectLabel(def.effect)}`;
  }
```

Note the shared helper's happiness text is `"+1 happiness (reduces unrest in
all your cities)"`, longer than the old inline `"+1 happiness"` — this is an
intentional improvement (the old text didn't say the bonus is empire-wide,
which was part of the confusion in the issue). Update any existing test in
`tests/ui/city-panel.test.ts` that asserts the exact old string
`'+1 happiness'` to instead assert the substring `'+1 happiness'` is
*contained* (it still is, as a prefix) rather than an exact match — run
`grep -n "'+1 happiness'\|toBe.*happiness" tests/ui/city-panel.test.ts` to
find any such assertion first.

Add the import at the top of `city-panel.ts`:

```ts
import { getResourceEffectLabel } from '@/systems/resource-definitions';
```

(Merge with any existing import from that path if one already exists.)

- [ ] **Step 3: Add effect text to the icon legend's resource rows**

In `src/ui/icon-legend.ts`, the current per-resource row (lines 64-76):

```ts
      for (const r of group) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;color:#d7dce6;font-size:12px;padding:3px 0;';

        const iconSpan = document.createElement('span');
        iconSpan.textContent = r.icon;
        iconSpan.style.cssText = 'display:inline-flex;width:20px;justify-content:center;';
        row.appendChild(iconSpan);

        const labelSpan = document.createElement('span');
        labelSpan.textContent = r.name;
        row.appendChild(labelSpan);

        overlay.appendChild(row);
      }
```

change to:

```ts
      for (const r of group) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:1px;color:#d7dce6;font-size:12px;padding:3px 0;';

        const nameLine = document.createElement('div');
        nameLine.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const iconSpan = document.createElement('span');
        iconSpan.textContent = r.icon;
        iconSpan.style.cssText = 'display:inline-flex;width:20px;justify-content:center;';
        nameLine.appendChild(iconSpan);
        const labelSpan = document.createElement('span');
        labelSpan.textContent = r.name;
        nameLine.appendChild(labelSpan);
        row.appendChild(nameLine);

        const effectText = getResourceEffectLabel(r.effect);
        if (effectText) {
          const effectSpan = document.createElement('span');
          effectSpan.textContent = effectText;
          effectSpan.style.cssText = 'padding-left:28px;opacity:0.65;font-size:10px;';
          row.appendChild(effectSpan);
        }

        overlay.appendChild(row);
      }
```

Add a trailing static line after the resource groups loop but still inside
the `if (unlockedResources.length > 0)` block, right before its closing
brace (the `}` that follows the `for (const [groupLabel, group] of groups)`
loop):

```ts
    const moreNote = document.createElement('div');
    moreNote.textContent = 'More resources are revealed by future technologies.';
    moreNote.style.cssText = 'font-size:10px;color:rgba(244,241,232,0.45);margin-top:6px;font-style:italic;';
    overlay.appendChild(moreNote);
```

Add the import at the top of `icon-legend.ts`:

```ts
import { getResourceEffectLabel } from '@/systems/resource-definitions';
```

`RESOURCE_DEFINITIONS` is already imported from `@/systems/trade-system` in
this file (a re-export of `resource-definitions.ts`) — leave that import as
is; `ResourceDefinition.effect` is already the field being read (`r.effect`),
no new field access needed.

- [ ] **Step 4: Write tests**

Check whether `tests/systems/resource-definitions.test.ts` exists
(`ls tests/systems/resource-definitions.test.ts`). If not, create it:

```ts
import { describe, it, expect } from 'vitest';
import { getResourceEffectLabel } from '@/systems/resource-definitions';

describe('getResourceEffectLabel (#552)', () => {
  it('describes happiness effects as empire-wide', () => {
    expect(getResourceEffectLabel({ type: 'happiness', amount: 1 })).toContain('all your cities');
  });

  it('describes yield effects as tile-scoped', () => {
    expect(getResourceEffectLabel({ type: 'gold', amount: 1 })).toBe('+1 gold/turn on the worked tile');
    expect(getResourceEffectLabel({ type: 'production', amount: 1 })).toBe('+1 production/turn on the worked tile');
    expect(getResourceEffectLabel({ type: 'food', amount: 1 })).toBe('+1 food/turn on the worked tile');
    expect(getResourceEffectLabel({ type: 'science', amount: 1 })).toBe('+1 science/turn on the worked tile');
  });

  it('returns empty string for null effect', () => {
    expect(getResourceEffectLabel(null)).toBe('');
  });
});
```

In `tests/ui/icon-legend.test.ts`, find its existing fixture idiom
(`grep -n "describe(\|function\|viewerTechs" tests/ui/icon-legend.test.ts`)
and add:

```ts
it('lists effect text for each tech-revealed resource', () => {
  const viewerTechs = new Set(['irrigation']); // reveals silk, a happiness resource
  const overlay = createIconLegendOverlay(viewerTechs);
  expect(overlay.textContent).toContain('Silk');
  expect(overlay.textContent).toContain('+1 happiness');
});

it('shows the future-resources note when at least one resource is listed', () => {
  const viewerTechs = new Set(['irrigation']);
  const overlay = createIconLegendOverlay(viewerTechs);
  expect(overlay.textContent).toContain('More resources are revealed by future technologies.');
});

it('does not list a resource whose tech is not yet researched', () => {
  const viewerTechs = new Set(['irrigation']); // silk only, not the aluminum/mining-tech chain
  const overlay = createIconLegendOverlay(viewerTechs);
  expect(overlay.textContent).not.toContain('Aluminum');
});
```

(Verify `'irrigation'` is in fact `silk`'s `tech` field —
`grep -n "id: 'silk'" src/systems/resource-definitions.ts` — and that
`'aluminum'`'s gating tech is genuinely different, per the earlier grep of
`RESOURCE_DEFINITIONS` in this plan's research phase; adjust the tech id used
in the test if the codebase has since changed either resource's `tech` field.)

- [ ] **Step 5: Run the suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/resource-definitions.ts src/ui/city-panel.ts src/ui/icon-legend.ts tests/systems/resource-definitions.test.ts tests/ui/icon-legend.test.ts
git commit -m "feat(ui): resource effect text in icon legend + shared label helper (#552)"
```

---

### Task 6: AI values happiness buildings

**Files:**
- Modify: `src/ai/ai-production.ts` — `economyValue`
- Test: `tests/ai/ai-production.test.ts`

**Interfaces:**
- Consumes: `Building.happiness` (Task 2), `BUILDINGS` (already imported in
  this file).

- [ ] **Step 1: Add a happiness term to `economyValue`**

In `src/ai/ai-production.ts`, the current function (lines 181-191):

```ts
function economyValue(buildingId: string): number {
  const building = BUILDINGS[buildingId];
  const yields = building?.nationalProject
    ? building.civYieldBonus ?? building.yields
    : building?.yields;
  if (!yields) return 0;
  return (yields.food ?? 0)
    + (yields.production ?? 0) * 1.25
    + (yields.gold ?? 0) * 1.5
    + (yields.science ?? 0) * 1.25;
}
```

change to:

```ts
function economyValue(buildingId: string): number {
  const building = BUILDINGS[buildingId];
  const yields = building?.nationalProject
    ? building.civYieldBonus ?? building.yields
    : building?.yields;
  const yieldScore = yields
    ? (yields.food ?? 0)
      + (yields.production ?? 0) * 1.25
      + (yields.gold ?? 0) * 1.5
      + (yields.science ?? 0) * 1.25
    : 0;
  // Happiness (#552): weighted flat, same scalar as +1 gold — there is no
  // per-city "need" signal already threaded through this scoring function to
  // condition on (e.g. current unrest pressure), so a flat weight is the
  // simplest change that makes the AI value the same buildings players do,
  // without inventing a new signal path. Revisit if a future MR adds one.
  const happinessScore = (building?.happiness ?? 0) * 1.5;
  return yieldScore + happinessScore;
}
```

- [ ] **Step 2: Write the test**

This file already has everything needed: `setupState(completed, cityIds)`
builds a real `GameState` with civ id `'ai-1'` and city `'city-a'`
pre-founded, and `generateAIProductionCandidates(state, civId, cityId, demands, personality)`
is the real exported entry point (`src/ai/ai-production.ts:380`) that
internally calls `economyValue` for every eligible building via
`generateWithResidual`. Add:

```ts
describe('happiness building AI scoring (#552)', () => {
  it('a temple candidate scores higher than an otherwise-identical zero-happiness building', () => {
    // temple: yields { science: 1 }, happiness: 1 → economyValue = 1*1.25 + 1*1.5 = 2.75
    // shrine: yields { science: 1 }, no happiness → economyValue = 1*1.25 = 1.25
    // Both are culture-adjacent, techRequired: null-or-early, identical science
    // yield, isolating the happiness term as the only scoring difference.
    const state = setupState(['philosophy']); // unlocks temple; shrine has techRequired: null
    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    const temple = candidates.find(c => c.itemId === 'temple');
    const shrine = candidates.find(c => c.itemId === 'shrine');
    expect(temple).toBeDefined();
    expect(shrine).toBeDefined();
    expect(temple!.score).toBeGreaterThan(shrine!.score);
  });
});
```

If either `temple` or `shrine` is missing from `candidates` (e.g. because
`getAvailableBuildings` also gates on `requiresBuildings` chains or resource
availability not accounted for above), read `getAvailableBuildings` in
`src/systems/city-system.ts` to find the actual gating condition and adjust
`setupState`'s `completed` techs or `grantResources` calls accordingly — do
not weaken the assertion to work around a missing candidate.

- [ ] **Step 3: Run the suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ai/ai-production.ts tests/ai/ai-production.test.ts
git commit -m "feat(ai): value happiness buildings in production scoring (#552)"
```

---

### Task 7: Balance docs — happiness inventory table

**Files:**
- Modify: `.claude/rules/game-balance.md`

- [ ] **Step 1: Append the inventory table**

Add a new section to `.claude/rules/game-balance.md` (anywhere after the
existing "Movement Bonus Stacking Policy" section, following the same table
convention already used there):

```markdown
## Happiness Inventory

Happiness reduces unrest pressure at 2 pressure per point
(`computeUnrestPressure` / `getUnrestPressureBreakdown` in
`faction-system.ts`). Unlike yields, happiness has no MR12-style ceiling rule
of its own yet — this table exists so future additions stay legible and
proportionate to what's already here.

| Source | Scope | Amount | Era active |
|---|---|---|---|
| Temple building | city | +1 | era 3+ (`philosophy`) |
| Amphitheater building | city | +1 | era 4+ (`drama-poetry`) |
| Monastery building | city | +1 | era 5+ (`monastic-orders`) |
| Concert Hall building | city | +1 | era 6+ (`baroque-music`) |
| Luxury resources (each type owned) | empire | +1 each | varies by resource |
| Beast-slayer's feast (Hunt crisis reward) | empire | +2 | temporary, 5 turns |

**Rule:** any new happiness source (building, wonder, tech, resource) must add
a row here and stay at +1 per single source unless a documented gameplay
reason requires more (matching the spirit of the wonder/national-project yield
ceilings above, applied to happiness).
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/game-balance.md
git commit -m "docs(balance): happiness source inventory table (#552)"
```

---

### Task 8: Empire city overview panel — extract shared Appease/Concede handlers

**Files:**
- Modify: `src/main.ts` — extract `handleAppeaseFaction` and
  `handleConcedeToMovement` as named functions so both the single city panel
  and the new overview panel call the identical code path.

**Interfaces:**
- Produces: `handleAppeaseFaction(cityId: string): GameState`,
  `handleConcedeToMovement(cityId: string): GameState` — both defined at
  module scope in `main.ts`, both mutate the module-level `gameState` and call
  `renderLoop.setGameState` / `updateHUD` / `showNotification` exactly as the
  current inline callbacks do.

- [ ] **Step 1: Extract the two handlers**

In `src/main.ts`, find the current inline callbacks inside
`openCityPanelForCity` (around lines 1259-1292):

```ts
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
    onConcedeToMovement: (cityId) => {
      const targetCity = gameState.cities[cityId];
      if (!targetCity) return gameState;
      const result = concedeToMovement(gameState, cityId, gameState.currentPlayer);
      if (!result.success) {
        showNotification(result.message, 'warning');
        return gameState;
      }
      gameState = result.state;
      // concedeToMovement clears unrestLevel immediately, bypassing the normal
      // processFactionTurn scan that would emit faction:unrest-resolved — without this,
      // the music director's unrestCityCount (incremented on faction:unrest-started)
      // never decrements for this city, leaving the unrest music layer stuck on.
      bus.emit('faction:unrest-resolved', { cityId, owner: gameState.currentPlayer });
      bus.emit('faction:concession-made', { cityId, owner: gameState.currentPlayer, concessionType: 'charter' });
      renderLoop.setGameState(gameState);
      updateHUD();
      showNotification(result.message, 'success');
      return gameState;
    },
```

Above `function openCityPanelForCity(...)` (which starts at line 1142), add
two new module-scope functions with the exact same bodies:

```ts
function handleAppeaseFaction(cityId: string): typeof gameState {
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
}

function handleConcedeToMovement(cityId: string): typeof gameState {
  const targetCity = gameState.cities[cityId];
  if (!targetCity) return gameState;
  const result = concedeToMovement(gameState, cityId, gameState.currentPlayer);
  if (!result.success) {
    showNotification(result.message, 'warning');
    return gameState;
  }
  gameState = result.state;
  bus.emit('faction:unrest-resolved', { cityId, owner: gameState.currentPlayer });
  bus.emit('faction:concession-made', { cityId, owner: gameState.currentPlayer, concessionType: 'charter' });
  renderLoop.setGameState(gameState);
  updateHUD();
  showNotification(result.message, 'success');
  return gameState;
}
```

(`typeof gameState` resolves to `GameState` since `gameState` is already
declared with that type earlier in the file — if `tsc` complains about using
`typeof` on a variable declared later in the same module scope, replace it
with the literal `GameState` type instead, imported from `@/core/types`,
which is almost certainly already imported in this file.)

Then replace the two inline callback bodies with one-line delegations:

```ts
    onAppeaseFaction: (cityId) => handleAppeaseFaction(cityId),
    onConcedeToMovement: (cityId) => handleConcedeToMovement(cityId),
```

- [ ] **Step 2: Run the suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS — this step is a pure extraction, no behavior change, so
no existing test should need modification. (`main.ts` itself has no direct
unit tests per the existing repo convention — confirm with
`ls tests/*.test.ts tests/**/*.test.ts 2>/dev/null | xargs grep -l "from '@/main'" 2>/dev/null`;
if that returns nothing, this step's only verification is the build/test
suite staying green plus Task 9's overview-panel parity test.)

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "refactor(main): extract handleAppeaseFaction/handleConcedeToMovement (#552)"
```

---

### Task 9: Empire city overview panel

**Files:**
- Create: `src/ui/city-overview-panel.ts`
- Modify: `src/main.ts` — `togglePanel`'s `'city'` branch opens the new panel;
  wire callbacks.
- Test: `tests/ui/city-overview-panel.test.ts` (create)

**Interfaces:**
- Produces: `createCityOverviewPanel(container: HTMLElement, state: GameState, callbacks: CityOverviewPanelCallbacks): HTMLDivElement`
  in `src/ui/city-overview-panel.ts`.
- `CityOverviewPanelCallbacks`: `{ onOpenCity: (cityId: string) => void; onAppeaseFaction: (cityId: string) => void; onConcedeToMovement: (cityId: string) => void; onClose: () => void; }`
- Consumes: `getUnrestPressureBreakdown`, `getCityAppeaseCost`,
  `getConcessionCost` from `faction-system.ts` (Task 3, pre-existing);
  `handleAppeaseFaction`/`handleConcedeToMovement` from `main.ts` (Task 8).

- [ ] **Step 1: Write the panel module**

Create `src/ui/city-overview-panel.ts`:

```ts
import type { GameState, City } from '@/core/types';
import { getCityAppeaseCost, getConcessionCost, computeUnrestPressure } from '@/systems/faction-system';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import { calculateProjectedCityYields } from '@/systems/city-system';
import { createGameButton } from '@/ui/ui-kit';

export interface CityOverviewPanelCallbacks {
  onOpenCity: (cityId: string) => void;
  onAppeaseFaction: (cityId: string) => void;
  onConcedeToMovement: (cityId: string) => void;
  onClose: () => void;
}

type SortKey = 'name' | 'population' | 'unrest';

// New for #552: the bottom-bar "City" button opens this list first instead of
// jumping straight to one city — replaces clicking through cities one at a
// time to find which are in unrest. Reuses the exact same Appease/Concede
// code path as the single city panel (main.ts's handleAppeaseFaction /
// handleConcedeToMovement) so there is only one implementation of each
// gameplay mutation.
export function createCityOverviewPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: CityOverviewPanelCallbacks,
): HTMLDivElement {
  let sortKey: SortKey = 'unrest';
  const panel = document.createElement('div');
  panel.id = 'city-overview-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:30;background:rgba(8,12,20,0.96);overflow-y:auto;padding:16px;';

  function ownedCities(): City[] {
    return Object.values(state.cities).filter(c => c.owner === state.currentPlayer);
  }

  function unrestPressureFor(city: City): number {
    const civ = state.civilizations[city.owner];
    const feasting = (civ?.feastUntilTurn ?? 0) > state.turn;
    const ownerHappiness = getCivHappinessFromResources(state, city.owner) + (feasting ? 2 : 0);
    return computeUnrestPressure(city.id, state, ownerHappiness);
  }

  function sortedCities(): City[] {
    const cities = ownedCities();
    return cities.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'population') return b.population - a.population;
      // 'unrest': revolt (2) first, then unrest (1), then stable (0); within a
      // tier, higher current pressure first so the worst cities lead the list.
      if (a.unrestLevel !== b.unrestLevel) return b.unrestLevel - a.unrestLevel;
      return unrestPressureFor(b) - unrestPressureFor(a);
    });
  }

  function render(): void {
    panel.textContent = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    const title = document.createElement('h2');
    title.textContent = 'Cities';
    title.style.cssText = 'font-size:18px;color:#e8c170;margin:0;';
    header.appendChild(title);
    const closeBtn = createGameButton('✕', 'close');
    closeBtn.addEventListener('click', callbacks.onClose);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const sortRow = document.createElement('div');
    sortRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';
    (['unrest', 'name', 'population'] as SortKey[]).forEach(key => {
      const label = key === 'unrest' ? 'Sort: Unrest' : key === 'name' ? 'Sort: Name' : 'Sort: Population';
      const btn = createGameButton(label, sortKey === key ? 'primary' : 'secondary');
      btn.addEventListener('click', () => { sortKey = key; render(); });
      sortRow.appendChild(btn);
    });
    panel.appendChild(sortRow);

    const cities = sortedCities();
    if (cities.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No cities founded yet!';
      empty.style.cssText = 'opacity:0.7;font-size:13px;';
      panel.appendChild(empty);
      return;
    }

    for (const city of cities) {
      panel.appendChild(renderCityRow(city));
    }
  }

  function renderCityRow(city: City): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;margin-bottom:8px;cursor:pointer;';
    row.dataset.cityRow = city.id;

    const yields = calculateProjectedCityYields(state, city.id);
    const statusLabel = city.unrestLevel === 2 ? '⚠️ Revolt' : city.unrestLevel === 1 ? '⚠️ Unrest' : '';
    const statusColor = city.unrestLevel === 2 ? '#e88' : city.unrestLevel === 1 ? '#d9a25c' : '#9bd97b';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const nameLine = document.createElement('div');
    nameLine.style.cssText = 'font-weight:bold;';
    nameLine.textContent = `${city.name} (pop ${city.population})`;
    top.appendChild(nameLine);
    if (statusLabel) {
      const status = document.createElement('div');
      status.textContent = statusLabel;
      status.style.cssText = `color:${statusColor};font-weight:bold;font-size:12px;`;
      top.appendChild(status);
    }
    row.appendChild(top);

    const yieldsLine = document.createElement('div');
    yieldsLine.style.cssText = 'display:flex;gap:12px;font-size:12px;opacity:0.85;margin-top:4px;';
    yieldsLine.textContent = `🌾+${yields.food} ⚒️+${yields.production} 💰+${yields.gold} 🔬+${yields.science}`;
    row.appendChild(yieldsLine);

    if (city.unrestLevel > 0) {
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

      const appeaseCost = getCityAppeaseCost(city);
      const appeaseBtn = createGameButton(`Appease (${appeaseCost}g)`, 'secondary');
      appeaseBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        callbacks.onAppeaseFaction(city.id);
      });
      actions.appendChild(appeaseBtn);

      const concessionCost = getConcessionCost(state, city);
      const concedeBtn = createGameButton(`Concede (${concessionCost}g)`, 'secondary');
      concedeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        callbacks.onConcedeToMovement(city.id);
      });
      actions.appendChild(concedeBtn);

      row.appendChild(actions);
    }

    row.addEventListener('click', () => callbacks.onOpenCity(city.id));

    return row;
  }

  render();
  container.appendChild(panel);
  return panel;
}
```

`calculateProjectedCityYields(state, city.id)` — the exact 2-argument form
used above — is already called this way in `src/ui/city-panel.ts`
(`const baseYields = calculateProjectedCityYields(state, city.id);`, near the
top of `createCityPanel`), so the call in this new panel matches an existing,
proven call site. Note the city panel additionally applies an unrest/occupation/crisis
yield multiplier and `Math.floor`s each value before display
(`yieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city)) * getCrisisYieldMultiplier(state, city.id)`)
— the overview panel's row intentionally shows the unmultiplied base yields
for row-to-row comparability across cities in different states; this is a
deliberate simplification for this MR, not an oversight.

- [ ] **Step 2: Wire it into `main.ts`**

In `src/main.ts`, find the `togglePanel` function's `'city'` branch (currently,
per the earlier research in this plan):

```ts
  } else if (panel === 'city') {
    const playerCities = currentCiv().cities;
    if (playerCities.length === 0) {
      showNotification('No cities founded yet!', 'info');
      return;
    }
    if (currentCityIndex >= playerCities.length) currentCityIndex = 0;
    const cityId = playerCities[currentCityIndex];
    const city = gameState.cities[cityId];
    if (!city) return;
    openCityPanelForCity(city);
  } else if (panel === 'espionage') {
```

change to:

```ts
  } else if (panel === 'city') {
    openCityOverviewPanel();
  } else if (panel === 'espionage') {
```

Add the import at the top of `main.ts`:

```ts
import { createCityOverviewPanel } from '@/ui/city-overview-panel';
```

Add a new function near `openCityPanelForCity` (e.g. directly above it):

```ts
function openCityOverviewPanel(): void {
  drawer?.close();
  const existing = document.getElementById('city-overview-panel');
  if (existing) existing.remove();
  createCityOverviewPanel(uiLayer, gameState, {
    onOpenCity: (cityId) => {
      const overview = document.getElementById('city-overview-panel');
      overview?.remove();
      const city = gameState.cities[cityId];
      if (city) openCityPanelForCity(city);
    },
    onAppeaseFaction: (cityId) => {
      handleAppeaseFaction(cityId);
      openCityOverviewPanel(); // re-render with updated unrest/gold state
    },
    onConcedeToMovement: (cityId) => {
      handleConcedeToMovement(cityId);
      openCityOverviewPanel(); // re-render with updated unrest/gold state
    },
    onClose: () => {
      document.getElementById('city-overview-panel')?.remove();
    },
  });
}
```

(`uiLayer` is the same container element already used by every other panel in
this file — confirm with `grep -n "uiLayer" src/main.ts | head -5` and use
whatever that variable is actually named/typed as, in case it differs from
this assumption.)

This preserves every other existing entry point that opens a specific city
directly (map tap, wonder panel's city link, notification jump-to-city) —
none of those call sites go through `togglePanel('city')`, they call
`openCityPanelForCity(city)` directly, so they are unaffected by this change.

- [ ] **Step 3: Write tests**

Create `tests/ui/city-overview-panel.test.ts`. First read
`tests/ui/city-panel.test.ts`'s fixture-construction idiom
(`sed -n '1,50p' tests/ui/city-panel.test.ts`) to build a consistent
`GameState` fixture with multiple owned cities, at least one in unrest, and
adapt the pattern below to match:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createCityOverviewPanel } from '@/ui/city-overview-panel';
// import whatever fixture-builder this repo's UI tests already use
// (mirror tests/ui/city-panel.test.ts's imports and helper functions).

describe('city overview panel (#552)', () => {
  it('renders no cities founded yet when the civ owns no cities', () => {
    const state = makeFixtureState({ cities: [] }); // adapt to real fixture helper
    const container = document.createElement('div');
    const callbacks = { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() };
    createCityOverviewPanel(container, state, callbacks);
    expect(container.textContent).toContain('No cities founded yet!');
  });

  it('lists every owned city and none owned by another civ', () => {
    const state = makeFixtureState({
      cities: [
        { id: 'city-1', owner: 'player', name: 'Alpha' },
        { id: 'city-2', owner: 'player', name: 'Beta' },
        { id: 'city-3', owner: 'enemy', name: 'EnemyCity' },
      ],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Beta');
    expect(container.textContent).not.toContain('EnemyCity');
  });

  it('defaults to sorting cities in unrest/revolt first', () => {
    const state = makeFixtureState({
      cities: [
        { id: 'city-1', owner: 'player', name: 'Stable', unrestLevel: 0 },
        { id: 'city-2', owner: 'player', name: 'Boiling', unrestLevel: 2 },
      ],
    });
    const container = document.createElement('div');
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const rows = Array.from(container.querySelectorAll('[data-city-row]'));
    expect(rows[0].getAttribute('data-city-row')).toBe('city-2');
  });

  it('clicking Appease on a row calls onAppeaseFaction with the row\'s city id, not onOpenCity', () => {
    const state = makeFixtureState({ cities: [{ id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 1 }] });
    const container = document.createElement('div');
    const onOpenCity = vi.fn();
    const onAppeaseFaction = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity, onAppeaseFaction, onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const appeaseBtn = container.querySelector('button') as HTMLButtonElement; // adjust selector to the actual rendered button if multiple buttons exist — prefer a text-content match, e.g. Array.from(container.querySelectorAll('button')).find(b => b.textContent?.startsWith('Appease'))
    appeaseBtn.click();
    expect(onAppeaseFaction).toHaveBeenCalledWith('city-1');
    expect(onOpenCity).not.toHaveBeenCalled();
  });

  it('clicking the row body (not an action button) calls onOpenCity', () => {
    const state = makeFixtureState({ cities: [{ id: 'city-1', owner: 'player', name: 'Alpha', unrestLevel: 0 }] });
    const container = document.createElement('div');
    const onOpenCity = vi.fn();
    createCityOverviewPanel(container, state, { onOpenCity, onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const row = container.querySelector('[data-city-row="city-1"]') as HTMLDivElement;
    row.click();
    expect(onOpenCity).toHaveBeenCalledWith('city-1');
  });
});

describe('city overview panel hot-seat isolation (#552)', () => {
  it('never shows civ B\'s cities when civ A is currentPlayer, and vice versa', () => {
    const stateA = makeFixtureState({
      currentPlayer: 'civ-a',
      cities: [
        { id: 'a-city', owner: 'civ-a', name: 'AlphaCity' },
        { id: 'b-city', owner: 'civ-b', name: 'BetaCity' },
      ],
    });
    const containerA = document.createElement('div');
    createCityOverviewPanel(containerA, stateA, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    expect(containerA.textContent).toContain('AlphaCity');
    expect(containerA.textContent).not.toContain('BetaCity');

    const stateB = { ...stateA, currentPlayer: 'civ-b' };
    const containerB = document.createElement('div');
    createCityOverviewPanel(containerB, stateB, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    expect(containerB.textContent).toContain('BetaCity');
    expect(containerB.textContent).not.toContain('AlphaCity');
  });
});
```

Replace every `makeFixtureState` call with this test suite's real fixture
helper (name and shape taken from `tests/ui/city-panel.test.ts`), filling in
whatever additional required `GameState` fields that helper needs beyond what
is shown above (map, civilizations, units, etc.) — do not invent a partial
`GameState` object by hand if a fixture helper already exists.

- [ ] **Step 4: Run the suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Run: `bash scripts/run-with-mise.sh yarn build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-overview-panel.ts src/main.ts tests/ui/city-overview-panel.test.ts
git commit -m "feat(ui): empire city overview panel with unrest-first sort (#552)"
```

---

### Task 10: Final full-suite verification

- [ ] **Step 1:** Run `bash scripts/run-with-mise.sh yarn build` — expect
  exit 0 (this is the only command that runs `tsc`; do not skip it even
  though every prior task already ran `yarn test`).
- [ ] **Step 2:** Run `bash scripts/run-with-mise.sh yarn test` — expect
  exit 0.
- [ ] **Step 3:** Run
  `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts`
  one more time on the fully-combined branch (not just after Task 2) — expect
  no snapshot movement, confirming the AI happiness-scoring change in Task 6
  and the building-happiness change in Task 2 together did not leak into any
  yield path.
- [ ] **Step 4:** Manually re-read the diff for every `title=` and
  `textContent` string touched in Tasks 3-5 against
  `.claude/rules/content-description-honesty.md`'s checklist — confirm each
  claimed mechanic (happiness buildings, resource effects, concede/appease
  trade-off) is backed by a passing positive test from this plan, not just
  prose.
- [ ] **Step 5:** No commit for this task — it's a verification gate before
  opening a PR, not a code change.

---

## Inline Dimension Review

- **Gameplay balance:** Unchanged from the design's original math — happiness
  buildings are a −2-pressure mitigation tool (not immunity), Concede/Appease
  costs and the contagion formula are untouched (this plan only documents and
  explains them, per Task 4/7). Swapping `sacred_grove` for `monastery` in the
  four-building set avoids accidentally creating a national-project happiness
  precedent that would need new ceiling rules; `monastery` is a strictly
  regular per-city building, so no new balance surface is introduced.
- **Fun:** Builders get a real happiness toolkit across four real eras (3, 4,
  5, 6) instead of one oddly-timed era-1 national project; the overview panel
  turns "which city is unhappy" from a memory-and-clicking exercise into a
  glance. The AI (Task 6) gets the same toolkit, so players don't gain an
  asymmetric advantage the AI can't replicate.
- **New mechanics:** None — every task rides an existing lever
  (`computeUnrestPressure`, `Building` catalog, `icon-legend`'s resource
  section, the single city panel's existing Appease/Concede actions). The
  overview panel is a second render surface over existing state and existing
  callbacks, not new game logic.
- **Ages 7–43:** The overview panel's plain-language unrest badges and
  sort-worst-first default answer "which city needs help" without requiring
  the player to remember city names or click through each one — this serves
  a 7-year-old directly. The Concede/Appease help line (Task 4) answers
  "which do I pick" in one sentence for a first-time player, while the
  itemized pressure breakdown (Task 3) gives the numbers-minded adult player
  exact deltas to optimize against.
- **Play styles:** Wide empires (many cities) get the most value from the
  overview panel — they're the ones most likely to lose track of a city
  slipping into unrest. Builders get a genuine per-city happiness toolkit.
  Warmongers and turtlers are unaffected in their own domains (war-weariness,
  garrisons) but now have accurate Concede/Appease guidance when unrest does
  hit.
- **Difficulty modes:** Unchanged — Task 1's 10-turn window is flat across
  challenge levels by design (the challenge system already scales pressure
  severity via `crisisSeverityMultiplier`; this plan does not touch that
  scaling).
- **AI usage:** Task 6 is specifically here so the AI doesn't ignore the new
  happiness buildings — without it, only human players would have a
  happiness toolkit, which is the "dead mechanic for one side" failure mode
  the repo's rules warn against. The AI does not use the overview panel (it's
  UI, not an AI-visible state) — the AI's behavior is driven entirely by
  `computeUnrestPressure`/`economyValue`, both of which Task 2/3/6 keep as the
  single source of truth also consumed by the player-visible UI.
- **UI:** The overview panel follows the existing panel idiom exactly
  (`createGameButton`, `textContent`, absolute-positioned full-screen overlay
  matching how other full panels in this codebase render). No new icon added
  to the already-full 7-icon bottom bar — the existing "City" button is
  repurposed, per user decision.
- **UX:** Every open item in issue #552 is now covered: 5-turn window (Task
  1), which buildings help happiness (Task 2 description text + Task 3
  breakdown row + Task 6 AI parity), which resources help happiness (Task 5),
  which cities are in unrest (Task 9), and concede vs appease (Task 4).
- **Architecture:** `getUnrestPressureBreakdown` (Task 3) is the single row
  builder consumed by both `computeUnrestPressure` (AI/turn processing) and
  the city panel UI. `getResourceEffectLabel` (Task 5) is the single label
  source consumed by both `city-panel.ts` and `icon-legend.ts`.
  `handleAppeaseFaction`/`handleConcedeToMovement` (Task 8) are the single
  gameplay-mutation entry points consumed by both the single city panel and
  the new overview panel — Task 9's parity test (Step 3, the
  "Appease...not onOpenCity" and hot-seat-isolation tests) is designed to
  catch any future divergence between the two panels' wiring.
- **Extensibility:** A future happiness building just needs `happiness: N`
  and a matching description phrase — it's picked up by pressure math, the
  breakdown row, the AI scorer, and the honesty test automatically (Task 2's
  catalog-wide consistency test is generic over `Object.values(BUILDINGS)`,
  not a hardcoded list). A future resource effect type requires updating
  `getResourceEffectLabel`'s switch, and the `never`-exhaustiveness check
  (Task 5) makes the compiler catch the omission at `tsc` time, not at
  runtime. The overview panel's column set can grow (trade routes, garrison
  status) without changing its row/sort architecture — explicitly a
  non-goal for this MR per the design doc, not a limitation of the code.
- **Data:** `Building.happiness` is optional, id-based lookup — no save
  migration (Task 2's load-shaped test proves this explicitly). The overview
  panel introduces no new persisted state; it reads existing `GameState`
  fields only.
- **SFX:** None — no new events fire in this plan. `faction:unrest-resolved`
  and `faction:concession-made` (Task 8) are pre-existing events from #354,
  preserved verbatim during the extraction, not new.
- **Saved games:** Old saves gain building happiness automatically on load
  (id-based `city.buildings` lookup). In-flight unrest cities retroactively
  get the longer 10-turn window (favorable to the player). No migration
  script needed anywhere in this plan.
- **Testing:** Every task pairs a positive test with the mechanic it claims
  (pressure deltas, breakdown-sum invariant including the new contagion row,
  catalog-wide description⇔field consistency, resource-label unit tests,
  render tests for both panels, an AI-scoring comparison test, and — the one
  most specific to this plan's architecture — a same-result-either-panel
  parity check for Appease/Concede so the shared-handler extraction in Task 8
  is provably load-bearing, not just refactoring for its own sake).
- **Solo regressions:** Full `faction-system`, `city-panel`, `icon-legend`,
  `resource-definitions`, and `ai-production` suites re-run after every task;
  Task 1's constant-derived test fix prevents a repeat of hardcoded-turn-count
  drift; Task 10 re-runs the pacing gates on the fully combined branch, not
  just after the task that touched yields.
- **Hot-seat regressions:** Task 9's dedicated hot-seat test asserts civ A's
  cities never appear in the overview panel when civ B is `currentPlayer`,
  and vice versa — the panel filters exclusively via
  `state.currentPlayer`, never a literal `'player'` or `cities[0]`, matching
  the single city panel's existing pattern.
- **Implementation correctness:** The description⇔field consistency test
  (Task 2) makes it structurally impossible to reintroduce the MR12 honesty
  bug for happiness buildings specifically. The breakdown-sum invariant test
  (Task 3) keeps the shared row-builder and the raw pressure number in
  permanent lockstep. The `never`-exhaustiveness switch (Task 5) turns a
  missed resource-effect-type case into a compile error. The two-panel parity
  test (Task 9) turns "the overview panel quietly diverges from the detail
  panel" into a failing test instead of a silent bug.
