# Tech Era Expansion — PR1: Foundation + Era 5 (Renaissance)

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the National Project mechanic, split `tech-definitions.ts`, add era 1–5 national project definitions, 32 era 5 techs, three era 5 wonders, cannon unit, all era 5 regular/special buildings, and SFX for national project events.

**Architecture:** National Projects are buildings with `uniquePerEmpire: true` that live in one host city but emit empire-wide `civYieldBonus`. New `national-project-system.ts` handles yield computation and expiry. `builtNationalProjects` is a new top-level `GameState` field keyed `${civId}:${buildingId}`. Tech definitions split into `tech-definitions-eras1-4.ts` + `tech-definitions-eras5-7.ts`; `tech-definitions.ts` becomes a re-export shim.

**Tech Stack:** TypeScript, Vitest, `src/core/types.ts`, `src/systems/city-system.ts`, `src/systems/legendary-wonder-system.ts`, `src/ui/tech-panel.ts`, `src/core/turn-manager.ts`, `src/systems/economy-system.ts`, `src/ai/basic-ai.ts`, `src/audio/sfx.ts`, `src/main.ts`.

## Global Constraints

- All commands: `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)"`
- Never `Math.random()` — all RNG via seeded helpers
- `state.currentPlayer` everywhere — never hardcode `'player'`
- Dynamic DOM text via `textContent`/`createTextNode()` — never `innerHTML` with game data
- `TRAINABLE_UNITS` entries use `cost:` (not `productionCost:`) — this is the `TrainableUnitEntry` field name in types.ts
- Unit fallback icons go in `FALLBACK_ICONS` in `src/renderer/unit-visual-resolver.ts` — NOT `unit-renderer.ts`
- Wonder `cityRequirement` is a string literal `'any' | 'river' | 'coastal'` — NOT an object like `{ type: 'any' }`
- Wonder quest steps require a `type:` field from the union: `'discover_wonder' | 'trade_route' | 'research_count' | 'defeat_stronghold' | 'buildings-in-multiple-cities' | 'trade-routes-established' | 'map-discoveries'`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/systems/tech-definitions-eras1-4.ts` | Create | Era 1–4 tech array |
| `src/systems/tech-definitions-eras5-7.ts` | Create | Era 5–7 tech array (stubs + era 5) |
| `src/systems/tech-definitions.ts` | Modify | Re-export shim |
| `src/ui/tech-panel.ts` | Modify | Era name lookup table |
| `src/core/types.ts` | Modify | `Building` new fields, `GameState.builtNationalProjects`, `BuiltNationalProjectRecord`, `GameEvents` |
| `src/systems/national-project-system.ts` | Create | NP yield math + expiry |
| `tests/systems/national-project-system.test.ts` | Create | Full unit test suite |
| `src/systems/economy-system.ts` | Modify | NP gold contribution |
| `src/core/turn-manager.ts` | Modify | NP science, completion write, expiry, dequeue sweep, navigator's compass movement |
| `src/systems/city-system.ts` | Modify | `getAvailableBuildings` NP filter; `processCity` NP dequeue; era 1–5 NP + era 5 building defs; cannon TRAINABLE_UNITS |
| `src/systems/unit-system.ts` | Modify | Cannon UNIT_DEFINITIONS + UNIT_DESCRIPTIONS |
| `src/renderer/unit-visual-resolver.ts` | Modify | Cannon fallback icon in FALLBACK_ICONS |
| `src/ai/basic-ai.ts` | Modify | NP priority; cannon training |
| `src/ui/city-panel.ts` | Modify | National Projects section + `(fading)` badge |
| `src/audio/sfx.ts` | Modify | `nationalProjectBuilt` + `nationalProjectExpired` SFX |
| `src/main.ts` | Modify | Wire `city:national-project-expired` bus handler (SFX + civ log) |
| `src/systems/legendary-wonder-definitions.ts` | Modify | Relocate stubs; add 3 era 5 wonders |
| `src/systems/approved-legendary-wonder-roster.ts` | Modify | Add 3 era 5 wonder IDs |
| `tests/systems/tech-definitions.test.ts` | Create | Stub relocation + era label tests |
| `tests/systems/national-project-balance.test.ts` | Create | Structural invariants + yield ceiling tests |
| `tests/systems/wonder-definitions.test.ts` | Modify | Wonder balance ceiling tests |

---

## Task 1 — File Split + Stub Relocation + Era Label

**Files:**
- Create: `src/systems/tech-definitions-eras1-4.ts`
- Create: `src/systems/tech-definitions-eras5-7.ts`
- Modify: `src/systems/tech-definitions.ts`
- Modify: `src/ui/tech-panel.ts`
- Create: `tests/systems/tech-definitions.test.ts`

- [ ] **Step 1: Copy existing array into eras1-4 file**

```bash
cp src/systems/tech-definitions.ts src/systems/tech-definitions-eras1-4.ts
```

Then edit `tech-definitions-eras1-4.ts`:
- Change the export name from `TECH_TREE` to `TECH_TREE_ERAS_1_4`
- Remove all helper functions (`getEraAdvancementTechs`, `hasReachedEraThreshold`, `resolveCivilizationEra`) — they stay in the shim
- Remove the six stubs that will be relocated: `global-logistics`, `nuclear-theory`, `mass-media`, `digital-surveillance`, `cyber-warfare`, `amphibious-warfare`

Result: `tech-definitions-eras1-4.ts` exports `TECH_TREE_ERAS_1_4: Tech[]` containing only era 1–4 techs.

- [ ] **Step 2: Create `src/systems/tech-definitions-eras5-7.ts`** with relocated stubs and empty ERA_5_TECHS:

```ts
import type { Tech } from '@/core/types';

// Relocated late-era stubs. countsForEraAdvancement: false prevents them
// from gating era 5 progression. Prerequisites reset to [] until high-era
// content is added in later PRs.
const RELOCATED_STUBS: Tech[] = [
  { id: 'global-logistics', name: 'Global Logistics', track: 'economy', cost: 155, prerequisites: [], unlocks: ['Late-era supply chains'], unlocksBuildings: ['stock_exchange'], era: 10, countsForEraAdvancement: false, countsForCityMaturity: true },
  { id: 'nuclear-theory', name: 'Nuclear Theory', track: 'science', cost: 165, prerequisites: [], unlocks: ['Atomic Age research'], era: 11, countsForEraAdvancement: false },
  { id: 'mass-media', name: 'Mass Media', track: 'communication', cost: 150, prerequisites: [], unlocks: ['Global broadcasts'], era: 9, countsForEraAdvancement: false, countsForCityMaturity: true },
  { id: 'digital-surveillance', name: 'Digital Surveillance', track: 'espionage', cost: 175, prerequisites: [], unlocks: ['Satellite Surveillance'], era: 11, countsForEraAdvancement: false },
  { id: 'cyber-warfare', name: 'Cyber Warfare', track: 'espionage', cost: 185, prerequisites: [], unlocks: ['Cyber Attack'], unlocksUnits: ['spy_hacker'], era: 12, countsForEraAdvancement: false },
  { id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime', cost: 175, prerequisites: [], unlocks: ['Beach assaults'], unlocksUnits: ['troop_transport'], era: 9, countsForEraAdvancement: false },
];

// Era 5 techs — filled in by Task 10
const ERA_5_TECHS: Tech[] = [];

export const TECH_TREE_ERAS_5_7: Tech[] = [
  ...RELOCATED_STUBS,
  ...ERA_5_TECHS,
];
```

- [ ] **Step 3: Rewrite `src/systems/tech-definitions.ts` as re-export shim**

Replace the entire file content:

```ts
import type { Tech } from '@/core/types';
import { TECH_TREE_ERAS_1_4 } from './tech-definitions-eras1-4';
import { TECH_TREE_ERAS_5_7 } from './tech-definitions-eras5-7';

export { TECH_TREE_ERAS_1_4 } from './tech-definitions-eras1-4';
export { TECH_TREE_ERAS_5_7 } from './tech-definitions-eras5-7';

export const TECH_TREE: Tech[] = [
  ...TECH_TREE_ERAS_1_4,
  ...TECH_TREE_ERAS_5_7,
];

export function getEraAdvancementTechs(era: number): Tech[] {
  return TECH_TREE.filter(tech => tech.era === era && tech.countsForEraAdvancement !== false);
}

export function hasReachedEraThreshold(completedTechIds: readonly string[], era: number): boolean {
  const advancementTechs = getEraAdvancementTechs(era);
  if (advancementTechs.length === 0) return false;
  const completed = new Set(completedTechIds);
  const completedCount = advancementTechs.filter(tech => completed.has(tech.id)).length;
  return completedCount >= Math.ceil(advancementTechs.length * 0.6);
}

export function resolveCivilizationEra(completedTechIds: readonly string[]): number {
  const maxEra = Math.max(1, ...TECH_TREE.map(tech => tech.era));
  let era = 1;
  for (let candidate = 2; candidate <= maxEra; candidate++) {
    if (!hasReachedEraThreshold(completedTechIds, candidate)) break;
    era = candidate;
  }
  return era;
}
```

- [ ] **Step 4: Fix `getEraLabel` in `src/ui/tech-panel.ts`**

Find the `getEraLabel` function (search for `getEraLabel` in the file) and replace its body with a lookup table. Also export `ERA_NAMES` for tests:

```ts
export const ERA_NAMES: Record<number, string> = {
  1: 'Stone Age',
  2: 'Bronze Age',
  3: 'Iron Age',
  4: 'Classical',
  5: 'Renaissance',
  6: 'Gunpowder Age',
  7: 'Industrial Revolution',
  8: 'Nationalist Era',
  9: 'Modern',
  10: 'Atomic Age',
  11: 'Cold War',
  12: 'Information Age',
};

export function getEraLabel(era: number): string {
  return ERA_NAMES[era] ?? `Era ${era}`;
}
```

- [ ] **Step 5: Write failing tests** — create `tests/systems/tech-definitions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TECH_TREE_ERAS_5_7, getEraAdvancementTechs } from '@/systems/tech-definitions';
import { ERA_NAMES, getEraLabel } from '@/ui/tech-panel';

const RELOCATED_IDS = new Set([
  'global-logistics', 'nuclear-theory', 'mass-media',
  'digital-surveillance', 'cyber-warfare', 'amphibious-warfare',
]);

describe('stub relocation', () => {
  it('relocated stubs are not era 5 advancement techs', () => {
    const era5 = getEraAdvancementTechs(5);
    for (const tech of era5) {
      expect(RELOCATED_IDS.has(tech.id), `${tech.id} should not be an era 5 advancement tech`).toBe(false);
    }
  });

  it('each relocated stub has countsForEraAdvancement: false', () => {
    const stubs = TECH_TREE_ERAS_5_7.filter(t => RELOCATED_IDS.has(t.id));
    for (const t of stubs) {
      expect(t.countsForEraAdvancement, `${t.id} should have countsForEraAdvancement: false`).toBe(false);
    }
  });
});

describe('getEraLabel', () => {
  it('returns Renaissance for era 5', () => expect(getEraLabel(5)).toBe('Renaissance'));
  it('returns Industrial Revolution for era 7', () => expect(getEraLabel(7)).toBe('Industrial Revolution'));
  it('falls back to Era N for unknown era', () => expect(getEraLabel(99)).toBe('Era 99'));
  it('ERA_NAMES covers eras 1–12', () => expect(Object.keys(ERA_NAMES).length).toBe(12));
});
```

- [ ] **Step 6: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-definitions.test.ts
bash scripts/run-with-mise.sh yarn build
```

Expected: both exit 0. Fix any errors before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/systems/tech-definitions-eras1-4.ts src/systems/tech-definitions-eras5-7.ts src/systems/tech-definitions.ts src/ui/tech-panel.ts tests/systems/tech-definitions.test.ts
git commit -m "feat(tech-tree): split definitions file, relocate stubs, add era name lookup"
```

---

## Task 2 — Type Changes

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add `BuiltNationalProjectRecord` interface** — find `CompletedLegendaryWonder` in `types.ts` and add this interface directly after it:

```ts
export interface BuiltNationalProjectRecord {
  civId: string;
  cityId: string;
  eraBuilt: number;
}
```

- [ ] **Step 2: Add fields to `Building` interface** — find the `Building` interface in `types.ts` and add after the existing optional fields:

```ts
uniquePerEmpire?: boolean;
nationalProject?: { homeEra: number };
requiresBuildings?: string[];
civYieldBonus?: Partial<ResourceYield>;
```

- [ ] **Step 3: Add `builtNationalProjects` to `GameState`** — find `completedLegendaryWonders` in `GameState` and add directly after:

```ts
builtNationalProjects?: Record<string, BuiltNationalProjectRecord>;
```

Key format: `${civId}:${buildingId}` — multiple civs can each build the same project.

- [ ] **Step 4: Add events to `GameEvents`** — find `'city:building-dropped'` in `GameEvents` and add after it:

```ts
'city:national-project-expired': { civId: string; cityId: string; buildingId: string };
'city:national-project-dequeued': { civId: string; cityId: string; buildingId: string };
```

- [ ] **Step 5: Build check**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exits 0. Fix any type errors before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(types): add Building NP fields, BuiltNationalProjectRecord, builtNationalProjects, expiry events"
```

---

## Task 3 — `national-project-system.ts`

**Files:**
- Create: `src/systems/national-project-system.ts`
- Create: `tests/systems/national-project-system.test.ts`

**Interfaces:**
- Consumes: `GameState.builtNationalProjects`, `BUILDINGS` from `city-system.ts`, `BuiltNationalProjectRecord`
- Produces: `getNationalProjectMultiplier`, `getNationalProjectCivYieldBonus`, `expireNationalProjects`, `ExpiredNationalProject`

- [ ] **Step 1: Write failing tests** — create `tests/systems/national-project-system.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import {
  getNationalProjectMultiplier,
  getNationalProjectCivYieldBonus,
  expireNationalProjects,
} from '@/systems/national-project-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 5,
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
    p1: false,
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

describe('getNationalProjectMultiplier', () => {
  it('returns 1 when delta === 0', () => expect(getNationalProjectMultiplier(5, 5)).toBe(1));
  it('returns 1 when delta === 1', () => expect(getNationalProjectMultiplier(6, 5)).toBe(1));
  it('returns 0.5 when delta === 2', () => expect(getNationalProjectMultiplier(7, 5)).toBe(0.5));
  it('returns 0 when delta === 3', () => expect(getNationalProjectMultiplier(8, 5)).toBe(0));
  it('returns 0 when delta > 3', () => expect(getNationalProjectMultiplier(10, 5)).toBe(0));
});

describe('getNationalProjectCivYieldBonus', () => {
  it('returns empty object when no builtNationalProjects', () => {
    expect(getNationalProjectCivYieldBonus(makeState(), 'p1')).toEqual({});
  });

  it('sums civYieldBonus for active projects of this civ (royal_academy: science 4, era delta 0)', () => {
    const state = makeState({
      era: 5,
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').science).toBe(4);
  });

  it('applies 0.5 multiplier for fading projects (era delta 2)', () => {
    const state = makeState({
      era: 7,
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').science).toBe(2); // 4 * 0.5
  });

  it('ignores expired projects (era delta >= 3)', () => {
    const state = makeState({
      era: 8,
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1')).toEqual({});
  });

  it('does not count other civs projects', () => {
    const state = makeState({
      era: 5,
      builtNationalProjects: {
        'p2:royal_academy': { civId: 'p2', cityId: 'city2', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1')).toEqual({});
  });

  it('grand_bazaar: +1 gold per city (1 city = 1 gold)', () => {
    const state = makeState({
      era: 2,
      cities: {
        c1: {
          id: 'c1', owner: 'p1', name: 'A', position: { q: 0, r: 0 },
          population: 1, food: 0, foodNeeded: 10, buildings: [],
          productionQueue: [], productionProgress: 0,
          ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village',
        } as any,
      },
      builtNationalProjects: {
        'p1:grand_bazaar': { civId: 'p1', cityId: 'c1', eraBuilt: 2 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold).toBe(1);
  });

  it('grand_bazaar: scales to 3 cities', () => {
    const state = makeState({
      era: 2,
      cities: {
        c1: { id: 'c1', owner: 'p1', name: 'A', position: { q: 0, r: 0 }, population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village' } as any,
        c2: { id: 'c2', owner: 'p1', name: 'B', position: { q: 1, r: 0 }, population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village' } as any,
        c3: { id: 'c3', owner: 'p1', name: 'C', position: { q: 2, r: 0 }, population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village' } as any,
      },
      builtNationalProjects: {
        'p1:grand_bazaar': { civId: 'p1', cityId: 'c1', eraBuilt: 2 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold).toBe(3);
  });
});

describe('expireNationalProjects', () => {
  it('returns unchanged state when nothing expires', () => {
    const state = makeState({
      era: 6,
      builtNationalProjects: { 'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 } },
    });
    const { expired } = expireNationalProjects(state, 6);
    expect(expired).toHaveLength(0);
  });

  it('removes expired project from builtNationalProjects and city.buildings', () => {
    const state = makeState({
      era: 8,
      cities: {
        city1: {
          id: 'city1', name: 'Rome', owner: 'p1', position: { q: 0, r: 0 },
          population: 3, food: 0, foodNeeded: 10,
          buildings: ['library', 'royal_academy'],
          productionQueue: [], productionProgress: 0,
          ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town',
        } as any,
      },
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    const { state: next, expired } = expireNationalProjects(state, 8);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toEqual({ civId: 'p1', cityId: 'city1', buildingId: 'royal_academy' });
    expect(next.builtNationalProjects?.['p1:royal_academy']).toBeUndefined();
    expect(next.cities['city1'].buildings).not.toContain('royal_academy');
    expect(next.cities['city1'].buildings).toContain('library');
  });
});
```

- [ ] **Step 2: Run failing test to confirm module not found**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-system.test.ts
```

Expected: FAIL — module `@/systems/national-project-system` not found.

- [ ] **Step 3: Create `src/systems/national-project-system.ts`**

```ts
import type { GameState, ResourceYield } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';

export function getNationalProjectMultiplier(currentEra: number, eraBuilt: number): 0 | 0.5 | 1 {
  const delta = currentEra - eraBuilt;
  if (delta >= 3) return 0;
  if (delta === 2) return 0.5;
  return 1;
}

function addYield(acc: Partial<ResourceYield>, delta: Partial<ResourceYield>): Partial<ResourceYield> {
  return {
    food: (acc.food ?? 0) + (delta.food ?? 0),
    production: (acc.production ?? 0) + (delta.production ?? 0),
    gold: (acc.gold ?? 0) + (delta.gold ?? 0),
    science: (acc.science ?? 0) + (delta.science ?? 0),
  };
}

function scaleYield(y: Partial<ResourceYield>, multiplier: number): Partial<ResourceYield> {
  const result: Partial<ResourceYield> = {};
  for (const [k, v] of Object.entries(y) as [keyof ResourceYield, number][]) {
    result[k] = Math.round((v ?? 0) * multiplier);
  }
  return result;
}

// Per-city-scaling allowlist — see .claude/rules/game-balance.md
function computePerCityGold(buildingId: string, state: GameState, civId: string): number | null {
  if (buildingId === 'grand_bazaar') {
    const cityCount = Object.values(state.cities).filter(c => c.owner === civId).length;
    return cityCount; // +1 gold per city
  }
  if (buildingId === 'colonial_administration') {
    const cityCount = Object.values(state.cities).filter(c => c.owner === civId).length;
    return Math.max(0, cityCount - 4) * 2; // +2 gold per city beyond 4th
  }
  return null;
}

export function getNationalProjectCivYieldBonus(state: GameState, civId: string): Partial<ResourceYield> {
  let totals: Partial<ResourceYield> = {};
  for (const [key, record] of Object.entries(state.builtNationalProjects ?? {})) {
    if (record.civId !== civId) continue;
    const buildingId = key.split(':').slice(1).join(':');
    const building = BUILDINGS[buildingId];
    if (!building) continue;
    const multiplier = getNationalProjectMultiplier(state.era, record.eraBuilt);
    if (multiplier === 0) continue;

    const perCityGold = computePerCityGold(buildingId, state, civId);
    if (perCityGold !== null) {
      totals = addYield(totals, scaleYield({ gold: perCityGold }, multiplier));
      continue;
    }

    if (building.civYieldBonus) {
      totals = addYield(totals, scaleYield(building.civYieldBonus, multiplier));
    }
  }
  return totals;
}

export interface ExpiredNationalProject {
  civId: string;
  cityId: string;
  buildingId: string;
}

export function expireNationalProjects(
  state: GameState,
  newEra: number,
): { state: GameState; expired: ExpiredNationalProject[] } {
  const toExpire: ExpiredNationalProject[] = [];
  for (const [key, record] of Object.entries(state.builtNationalProjects ?? {})) {
    if (newEra - record.eraBuilt >= 3) {
      const buildingId = key.split(':').slice(1).join(':');
      toExpire.push({ civId: record.civId, cityId: record.cityId, buildingId });
    }
  }
  if (toExpire.length === 0) return { state, expired: [] };

  const newBuiltNP = { ...(state.builtNationalProjects ?? {}) };
  let newCities = { ...state.cities };

  for (const item of toExpire) {
    delete newBuiltNP[`${item.civId}:${item.buildingId}`];
    const city = newCities[item.cityId];
    if (city) {
      newCities = {
        ...newCities,
        [item.cityId]: {
          ...city,
          buildings: city.buildings.filter((b: string) => b !== item.buildingId),
        },
      };
    }
  }

  return {
    state: { ...state, builtNationalProjects: newBuiltNP, cities: newCities },
    expired: toExpire,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-system.test.ts
```

Expected: all pass. Then build:

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/systems/national-project-system.ts tests/systems/national-project-system.test.ts
git commit -m "feat(national-projects): add national-project-system with multiplier, yield bonus, expiry"
```

---

## Task 4 — Wire National Projects into Turn Manager + Economy

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/economy-system.ts`

- [ ] **Step 1: Add imports to `turn-manager.ts`** (near the existing legendary-wonder-system import):

```ts
import {
  getNationalProjectCivYieldBonus,
  expireNationalProjects,
  type ExpiredNationalProject,
} from '@/systems/national-project-system';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
```

- [ ] **Step 2: Wire NP science** — find the block where `wonderCivBonuses.science` is added to `totalScience` (search for `getLegendaryWonderCivYieldBonus`). Add the NP science bonus directly after:

```ts
const npCivBonuses = getNationalProjectCivYieldBonus(newState, civId);
totalScience += npCivBonuses.science ?? 0;
// NP gold handled in economy-system.ts to avoid double-counting
```

- [ ] **Step 3: Record `builtNationalProjects` on building completion** — find the `city:building-complete` emit block. Add immediately after the `bus.emit` call:

```ts
const completedBldg = BUILDINGS[result.completedBuilding];
if (completedBldg?.nationalProject && completedBldg.uniquePerEmpire) {
  const npKey = `${civId}:${result.completedBuilding}`;
  newState = {
    ...newState,
    builtNationalProjects: {
      ...(newState.builtNationalProjects ?? {}),
      [npKey]: { civId, cityId, eraBuilt: newState.era },
    },
  };
}
```

- [ ] **Step 4: Add navigator's compass naval movement bonus** — in the unit spawn block (where a completed unit is created), add after computing the new unit:

```ts
if (result.completedUnit) {
  const unitDef = UNIT_DEFINITIONS[result.completedUnit];
  let movementBonus = 0;
  if (
    unitDef?.domain === 'naval' &&
    newState.completedLegendaryWonders?.['navigators-compass']?.ownerId === civId
  ) {
    movementBonus += 1;
  }
  // Pass movementBonus as the fifth arg to createUnit
  const newUnit = createUnit(result.completedUnit, cityHex, civId, idCounters, movementBonus);
  // ... rest of existing unit placement code unchanged ...
}
```

- [ ] **Step 5: Call `expireNationalProjects` on era advancement** — find the era advancement block (search for `era:advanced`). Add BEFORE the `bus.emit('era:advanced', ...)` call:

```ts
const { state: afterExpiry, expired } = expireNationalProjects(newState, newEra);
newState = afterExpiry;
for (const item of expired) {
  bus.emit('city:national-project-expired', item);
}

// Dequeue NPs that are now outside their build window (homeEra to homeEra+1)
for (const cityId of Object.keys(newState.cities)) {
  const city = newState.cities[cityId];
  if (!city) continue;
  const staleNPs = city.productionQueue.filter((item: string) => {
    const bldg = BUILDINGS[item];
    return bldg?.nationalProject && newState.era > bldg.nationalProject.homeEra + 1;
  });
  if (staleNPs.length === 0) continue;
  newState = {
    ...newState,
    cities: {
      ...newState.cities,
      [cityId]: {
        ...city,
        productionQueue: city.productionQueue.filter((item: string) => {
          const bldg = BUILDINGS[item];
          return !(bldg?.nationalProject && newState.era > bldg.nationalProject.homeEra + 1);
        }),
      },
    },
  };
  for (const buildingId of staleNPs) {
    bus.emit('city:national-project-dequeued', { civId: city.owner, cityId, buildingId });
  }
}
```

- [ ] **Step 6: Add NP gold to `economy-system.ts`** — add import at top:

```ts
import { getNationalProjectCivYieldBonus } from './national-project-system';
```

Find where `grossGold += wonderCivBonuses.gold ?? 0` (or equivalent) is computed. Add right after:

```ts
const npCivBonuses = getNationalProjectCivYieldBonus(state, civId);
grossGold += npCivBonuses.gold ?? 0;
```

- [ ] **Step 7: Build + test**

```bash
bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test
```

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/core/turn-manager.ts src/systems/economy-system.ts
git commit -m "feat(national-projects): wire NP yields into turn-manager and economy-system; navigator compass movement"
```

---

## Task 5 — `getAvailableBuildings` + `processCity` NP Filtering

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/core/turn-manager.ts` (caller update)
- Modify: `src/ai/basic-ai.ts` (caller update)

- [ ] **Step 1: Extend `getAvailableBuildings` signature**

Find the existing function signature (search for `export function getAvailableBuildings`). Add three optional parameters at the end:

```ts
export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  map: GameMap,
  availableResources?: Set<ResourceType>,
  era?: number,
  builtNationalProjectKeys?: Set<string>,
  civId?: string,
): Building[]
```

Inside the `.filter()` callback, add these checks after the existing `availableResources` guard:

```ts
// requiresBuildings chain (special buildings)
if (b.requiresBuildings?.length) {
  if (!b.requiresBuildings.every((req: string) => city.buildings.includes(req))) return false;
}
// National project: build-window + uniquePerEmpire dedup
if (b.nationalProject) {
  const currentEra = era ?? 1;
  if (currentEra < b.nationalProject.homeEra || currentEra > b.nationalProject.homeEra + 1) return false;
  if (b.uniquePerEmpire && civId && builtNationalProjectKeys?.has(`${civId}:${b.id}`)) return false;
}
```

- [ ] **Step 2: Update `processCity` signature** — find the function (search for `export function processCity`) and add the optional parameter at the end:

```ts
export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number = 0,
  bonusEffect?: CivBonusEffect,
  completedTechs: string[] = [],
  civType?: string,
  era: number = 1,
  availableResources?: Set<ResourceType>,
  builtNationalProjectKeys?: Set<string>,
): CityProcessResult
```

Inside `processCity`, add NP dequeue after the existing queue-filtering block:

```ts
// Belt-and-suspenders: dequeue NPs outside their build window
if (era) {
  city = {
    ...city,
    productionQueue: city.productionQueue.filter((item: string) => {
      const bldg = BUILDINGS[item];
      if (!bldg?.nationalProject) return true;
      return era >= bldg.nationalProject.homeEra && era <= bldg.nationalProject.homeEra + 1;
    }),
  };
}
```

- [ ] **Step 3: Update the turn-manager caller** — find where `processCity` is called in `turn-manager.ts`. Before the call, compute `npKeysForCiv`:

```ts
const npKeysForCiv = new Set(
  Object.keys(newState.builtNationalProjects ?? {}).filter(k => k.startsWith(`${civId}:`))
);
const result = processCity(
  city,
  newState.map,
  yields.food,
  effectiveProduction,
  civDef?.bonusEffect,
  civ.techState.completed,
  civ.civType,
  newState.era,
  availableResources,
  npKeysForCiv,
);
```

- [ ] **Step 4: Update city-panel caller** — find `getAvailableBuildings` call in `src/ui/city-panel.ts` and update:

```ts
const builtNPKeys = new Set(
  Object.keys(state.builtNationalProjects ?? {}).filter(k => k.startsWith(`${city.owner}:`))
);
const availableBuildings = getAvailableBuildings(
  city,
  civ.techState.completed,
  state.map,
  getAvailableResources(state, city.owner),
  state.era,
  builtNPKeys,
  city.owner,
);
```

- [ ] **Step 5: Update AI caller** — find `getAvailableBuildings` in `src/ai/basic-ai.ts`:

```ts
const builtNPKeys = new Set(
  Object.keys(state.builtNationalProjects ?? {}).filter(k => k.startsWith(`${civId}:`))
);
const availableBuildings = getAvailableBuildings(
  city,
  civ.techState.completed,
  state.map,
  undefined,
  state.era,
  builtNPKeys,
  civId,
);
```

- [ ] **Step 6: Build + test**

```bash
bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/systems/city-system.ts src/core/turn-manager.ts src/ui/city-panel.ts src/ai/basic-ai.ts
git commit -m "feat(national-projects): NP build-window filter in getAvailableBuildings and processCity"
```

---

## Task 6 — City Panel UI: National Projects Section + Fading Badge

**Files:**
- Modify: `src/ui/city-panel.ts`

- [ ] **Step 1: Add import** at top of city-panel.ts:

```ts
import { getNationalProjectMultiplier } from '@/systems/national-project-system';
```

- [ ] **Step 2: Add "National Projects" section in build chooser** — find where available buildings are rendered as buttons. Add a dedicated section ABOVE regular buildings:

```ts
const nationalProjects = availableBuildings.filter(b => b.nationalProject);
const regularBuildings = availableBuildings.filter(b => !b.nationalProject);

if (nationalProjects.length > 0) {
  const npHeader = document.createElement('div');
  npHeader.textContent = 'National Projects';
  npHeader.className = 'np-section-header';
  buildChooser.appendChild(npHeader);

  for (const np of nationalProjects) {
    const btn = createGameButton(`${np.name} — ${np.description}`, 'secondary');
    btn.title = `Available until end of era ${(np.nationalProject?.homeEra ?? 0) + 1}. Empire-wide effect when built.`;
    btn.addEventListener('click', () => onQueueItem(np.id));
    buildChooser.appendChild(btn);
  }
}
// then render regularBuildings as before
```

- [ ] **Step 3: Add `(fading)` badge on active NP in buildings list** — find where `city.buildings` are listed. For each building, check if it's a fading NP:

```ts
const bldg = BUILDINGS[buildingId];
if (bldg?.nationalProject && bldg.uniquePerEmpire) {
  const record = state.builtNationalProjects?.[`${city.owner}:${buildingId}`];
  if (record) {
    const multiplier = getNationalProjectMultiplier(state.era, record.eraBuilt);
    if (multiplier === 0.5) {
      const badge = document.createElement('span');
      badge.textContent = ' ⏳ (fading)';
      badge.className = 'np-fading-badge';
      badge.title = 'This institution is losing relevance and will expire next era.';
      buildingEl.appendChild(badge);
    }
  }
}
```

Note: `badge.textContent` uses `⏳` (⏳) — a static string, safe to assign to `textContent`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/city-panel.ts
git commit -m "feat(city-panel): add National Projects section and (fading) badge"
```

---

## Task 7 — AI National Project Logic

**Files:**
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Add import** at top of basic-ai.ts:

```ts
import { getNationalProjectMultiplier } from '@/systems/national-project-system';
```

- [ ] **Step 2: Add NP priority scoring** — in the build-decision block, after `availableBuildings` is computed, prioritize NPs based on civ personality. Add before the regular building queue logic:

```ts
const availableNPs = availableBuildings.filter(b => b.nationalProject);
if (availableNPs.length > 0 && city.productionQueue.length === 0) {
  const personality = resolveCivDefinition(state, civ.civType ?? '')?.personality;
  const primaryTrait = personality?.traits?.[0];

  const bestNP = availableNPs.find(np => {
    if (primaryTrait === 'scholarly' && (np.civYieldBonus?.science ?? 0) > 0) return true;
    if (primaryTrait === 'aggressive' && (np.civYieldBonus?.production ?? 0) > 0) return true;
    if (primaryTrait === 'trader' && (np.civYieldBonus?.gold ?? 0) > 0) return true;
    return false;
  }) ?? availableNPs[0];

  if (bestNP) {
    newState = {
      ...newState,
      cities: {
        ...newState.cities,
        [cityId]: { ...city, productionQueue: [bestNP.id] },
      },
    };
    continue;
  }
}
```

- [ ] **Step 3: Build + test**

```bash
bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test
```

- [ ] **Step 4: Commit**

```bash
git add src/ai/basic-ai.ts
git commit -m "feat(ai): prioritize national projects in build-queue by civ personality"
```

---

## Task 8 — Balance Test Suite

**Files:**
- Create: `tests/systems/national-project-balance.test.ts`

- [ ] **Step 1: Create the balance test file**

```ts
import { describe, it, expect } from 'vitest';
import { BUILDINGS } from '@/systems/city-system';

// Per-city/per-route allowlist — must match .claude/rules/game-balance.md
const PER_CITY_ALLOWLIST = new Set(['grand_bazaar', 'colonial_administration']);

const nationalProjects = Object.values(BUILDINGS).filter(b => b.nationalProject);

describe('national project structural invariants', () => {
  it('every national project has uniquePerEmpire: true', () => {
    for (const np of nationalProjects) {
      expect(np.uniquePerEmpire, `${np.id} missing uniquePerEmpire`).toBe(true);
    }
  });

  it('every national project homeEra is in range 1–12', () => {
    for (const np of nationalProjects) {
      expect(np.nationalProject!.homeEra, `${np.id} homeEra out of range`).toBeGreaterThanOrEqual(1);
      expect(np.nationalProject!.homeEra, `${np.id} homeEra out of range`).toBeLessThanOrEqual(12);
    }
  });

  it('no national project has cityYieldBonus', () => {
    for (const np of nationalProjects) {
      expect((np as any).cityYieldBonus, `${np.id} must not have cityYieldBonus`).toBeUndefined();
    }
  });
});

describe('national project yield ceilings', () => {
  const ERA_CEILINGS: Record<number, number> = { 1: 2, 2: 2, 3: 5, 4: 5, 5: 7, 6: 7, 7: 9 };

  for (const np of nationalProjects) {
    const era = np.nationalProject!.homeEra;
    const ceiling = ERA_CEILINGS[era] ?? 9;
    const bonus = np.civYieldBonus ?? {};
    const values = Object.values(bonus).filter((v): v is number => typeof v === 'number');

    it(`${np.id} (era ${era}) total civYieldBonus <= era ceiling ${ceiling}`, () => {
      if (PER_CITY_ALLOWLIST.has(np.id)) return; // dynamic scaling, exempt from static ceiling
      const total = values.reduce((a, b) => a + b, 0);
      expect(total, `${np.id} total ${total} > era ${era} ceiling ${ceiling}`).toBeLessThanOrEqual(ceiling);
    });

    it(`${np.id} with two keys: neither exceeds 3`, () => {
      if (values.length < 2) return;
      for (const [k, v] of Object.entries(bonus) as [string, number][]) {
        expect(v, `${np.id}.${k} = ${v} exceeds two-key max 3`).toBeLessThanOrEqual(3);
      }
    });
  }
});
```

- [ ] **Step 2: Run balance tests (will fail until Task 9 adds NPs)**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts
```

Expected: FAIL (no NPs yet). Commit the test so it's ready to pass after Task 9.

- [ ] **Step 3: Commit**

```bash
git add tests/systems/national-project-balance.test.ts
git commit -m "test(national-projects): add structural invariant and yield ceiling tests"
```

---

## Task 9 — Era 1–5 National Project Definitions

**Files:**
- Modify: `src/systems/city-system.ts`

Add 15 NP entries to `BUILDINGS` and 15 to `PRODUCTION_ICONS`. Special-effect NPs get proxy `civYieldBonus` values so they show visible benefit in production queue.

- [ ] **Step 1: Add 15 national projects to `BUILDINGS`** (after the existing buildings block, before the closing of the BUILDINGS object):

```ts
// ===== NATIONAL PROJECTS =====

// Era 1 — homeEra: 1
sacred_grove: {
  id: 'sacred_grove', name: 'Sacred Grove', category: 'culture',
  yields: { food: 1, production: 0, gold: 0, science: 0 }, productionCost: 40,
  description: 'Sacred nature sanctuary. +1 food empire-wide. Wounded units heal faster in friendly territory.',
  techRequired: 'animism',
  uniquePerEmpire: true, nationalProject: { homeEra: 1 },
  civYieldBonus: { food: 1 },
},
tribal_muster_ground: {
  id: 'tribal_muster_ground', name: 'Tribal Muster Ground', category: 'military',
  yields: { food: 0, production: 1, gold: 0, science: 0 }, productionCost: 45,
  description: 'Central mustering ground. +1 production empire-wide. Early unit training costs reduced.',
  techRequired: 'stone-weapons',
  uniquePerEmpire: true, nationalProject: { homeEra: 1 },
  civYieldBonus: { production: 1 },
},
communal_stores: {
  id: 'communal_stores', name: 'Communal Stores', category: 'food',
  yields: { food: 2, production: 0, gold: 0, science: 0 }, productionCost: 40,
  description: 'Empire-wide granary network. +2 food all cities.',
  techRequired: 'gathering',
  uniquePerEmpire: true, nationalProject: { homeEra: 1 },
  civYieldBonus: { food: 2 },
},

// Era 2 — homeEra: 2
grand_bazaar: {
  id: 'grand_bazaar', name: 'Grand Bazaar', category: 'economy',
  yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 80,
  description: '+1 gold per city empire-wide (scales dynamically with empire size).',
  techRequired: 'animal-husbandry',
  uniquePerEmpire: true, nationalProject: { homeEra: 2 },
  // No civYieldBonus — per-city computation in national-project-system.ts computePerCityGold()
},
foundry_guild: {
  id: 'foundry_guild', name: 'Foundry Guild', category: 'military',
  yields: { food: 0, production: 1, gold: 0, science: 0 }, productionCost: 85,
  description: 'Bronze-smithing consortium. +1 production empire-wide. Bronze-class units gain combat bonus.',
  techRequired: 'bronze-working',
  uniquePerEmpire: true, nationalProject: { homeEra: 2 },
  civYieldBonus: { production: 1 },
},
scribes_hall: {
  id: 'scribes_hall', name: "Scribes' Hall", category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 2 }, productionCost: 80,
  description: 'Empire-wide scribal tradition. +2 science all cities.',
  techRequired: 'writing',
  uniquePerEmpire: true, nationalProject: { homeEra: 2 },
  civYieldBonus: { science: 2 },
},

// Era 3 — homeEra: 3
philosophers_circle: {
  id: 'philosophers_circle', name: "Philosopher's Circle", category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 120,
  description: 'Great assembly of thinkers. +3 science all cities.',
  techRequired: 'philosophy',
  uniquePerEmpire: true, nationalProject: { homeEra: 3 },
  civYieldBonus: { science: 3 },
},
road_corps: {
  id: 'road_corps', name: 'Road Corps', category: 'production',
  yields: { food: 0, production: 0, gold: 1, science: 0 }, productionCost: 125,
  description: 'Imperial road network. +1 gold all cities. Roads built faster.',
  techRequired: 'road-building',
  uniquePerEmpire: true, nationalProject: { homeEra: 3 },
  civYieldBonus: { gold: 1 },
},
iron_legion: {
  id: 'iron_legion', name: 'Iron Legion', category: 'military',
  yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 120,
  description: 'Elite standing army. +2 production empire-wide. Military units gain combat bonus.',
  techRequired: 'iron-forging',
  uniquePerEmpire: true, nationalProject: { homeEra: 3 },
  civYieldBonus: { production: 2 },
},

// Era 4 — homeEra: 4
imperial_archive: {
  id: 'imperial_archive', name: 'Imperial Archive', category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 3 }, productionCost: 160,
  description: 'Imperial knowledge repository. +3 science all cities.',
  techRequired: 'printing',
  uniquePerEmpire: true, nationalProject: { homeEra: 4 },
  civYieldBonus: { science: 3 },
},
praetorian_legion: {
  id: 'praetorian_legion', name: 'Praetorian Legion', category: 'military',
  yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 165,
  description: 'Elite guard corps. +2 production empire-wide. Units in fortified cities gain strength bonus.',
  techRequired: 'tactics',
  uniquePerEmpire: true, nationalProject: { homeEra: 4 },
  civYieldBonus: { production: 2 },
},
royal_mint: {
  id: 'royal_mint', name: 'Royal Mint', category: 'economy',
  yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 160,
  description: 'Crown coinage monopoly. +3 gold all cities.',
  techRequired: 'banking',
  uniquePerEmpire: true, nationalProject: { homeEra: 4 },
  civYieldBonus: { gold: 3 },
},

// Era 5 — homeEra: 5
royal_academy: {
  id: 'royal_academy', name: 'Royal Academy', category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 205,
  description: 'Crown-sponsored institution of learning. +4 science all cities.',
  techRequired: 'scientific-method',
  uniquePerEmpire: true, nationalProject: { homeEra: 5 },
  civYieldBonus: { science: 4 },
},
artillery_corps_hq: {
  id: 'artillery_corps_hq', name: 'Artillery Corps HQ', category: 'military',
  yields: { food: 0, production: 2, gold: 0, science: 0 }, productionCost: 210,
  description: 'Central cannon command. +2 production empire-wide. Cannon units train with bonus strength.',
  techRequired: 'black-powder',
  uniquePerEmpire: true, nationalProject: { homeEra: 5 },
  civYieldBonus: { production: 2 },
},
explorers_guild: {
  id: 'explorers_guild', name: "Explorers' Guild", category: 'economy',
  yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 205,
  description: 'National charter for discovery. +3 gold all cities. Scouts gain +1 vision range.',
  techRequired: 'circumnavigation',
  uniquePerEmpire: true, nationalProject: { homeEra: 5 },
  civYieldBonus: { gold: 3 },
},
```

- [ ] **Step 2: Add `PRODUCTION_ICONS` entries for all 15 NPs**:

```ts
// National Projects
sacred_grove: '🌳',
tribal_muster_ground: '⚔️',
communal_stores: '🏚️',
grand_bazaar: '🪙',
foundry_guild: '⚒️',
scribes_hall: '📜',
philosophers_circle: '🏛️',
road_corps: '🛤️',
iron_legion: '🛡️',
imperial_archive: '📚',
praetorian_legion: '⚔️',
royal_mint: '💰',
royal_academy: '🎓',
artillery_corps_hq: '💣',
explorers_guild: '🧭',
```

- [ ] **Step 3: Run balance tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/national-project-balance.test.ts
```

Expected: all pass. Fix any ceiling violations before continuing.

- [ ] **Step 4: Build + full test suite**

```bash
bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test
```

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts
git commit -m "feat(national-projects): add era 1-5 NP definitions (15 entries)"
```

---

## Task 10 — Era 5 Tech Definitions (32 techs)

**Files:**
- Modify: `src/systems/tech-definitions-eras5-7.ts`

Replace the empty `ERA_5_TECHS` array. The exploration track gains `circumnavigation` and `colonial-charter` as required prereqs for `navigators-compass`, `explorers_guild`, and later era 6 land-survey.

- [ ] **Step 1: Replace `const ERA_5_TECHS: Tech[] = []` with 32 tech entries**:

```ts
const ERA_5_TECHS: Tech[] = [
  // MILITARY (2)
  { id: 'black-powder', name: 'Black Powder', track: 'military', cost: 150,
    prerequisites: ['siege-warfare', 'tactics'],
    unlocks: ['Gunpowder replaces classical siege engines'], unlocksUnits: ['cannon'], era: 5 },
  { id: 'professional-army', name: 'Professional Army', track: 'military', cost: 145,
    prerequisites: ['tactics'],
    unlocks: ['Defending units in cities gain +10% strength'], era: 5 },

  // ECONOMY (2)
  { id: 'guilds', name: 'Guilds', track: 'economy', cost: 150,
    prerequisites: ['banking', 'currency'],
    unlocks: ['+1 gold per active trade route'], unlocksBuildings: ['guildhall'], era: 5 },
  { id: 'colonial-trade', name: 'Colonial Trade', track: 'economy', cost: 145,
    prerequisites: ['trade-routes', 'banking'],
    unlocks: ['Trade routes to foreign civs yield +2 gold'], era: 5 },

  // SCIENCE (2)
  { id: 'scientific-method', name: 'Scientific Method', track: 'science', cost: 155,
    prerequisites: ['astronomy', 'medicine'],
    unlocks: ['+1 science per library empire-wide'], unlocksBuildings: ['university'], era: 5 },
  { id: 'optics', name: 'Optics', track: 'science', cost: 150,
    prerequisites: ['astronomy'],
    unlocks: ['+1 vision range all units'], era: 5 },

  // CIVICS (2)
  { id: 'civic-humanism', name: 'Civic Humanism', track: 'civics', cost: 150,
    prerequisites: ['political-philosophy', 'drama-poetry'],
    unlocks: ['+5% gold empire-wide'], era: 5 },
  { id: 'constitutional-law', name: 'Constitutional Law', track: 'civics', cost: 145,
    prerequisites: ['political-philosophy'],
    unlocks: ['Reduces unrest in newly captured cities'], era: 5 },

  // EXPLORATION (2) — new entries; prereqs for navigators-compass wonder and explorers_guild NP
  { id: 'circumnavigation', name: 'Circumnavigation', track: 'exploration', cost: 155,
    prerequisites: ['exploration-tech', 'celestial-navigation'],
    unlocks: ['Scouts reveal uncharted continents faster'], era: 5 },
  { id: 'colonial-charter', name: 'Colonial Charter', track: 'exploration', cost: 150,
    prerequisites: ['exploration-tech', 'military-logistics'],
    unlocks: ['Settlers founding cities on foreign landmasses receive +5 production bonus'], era: 5 },

  // AGRICULTURE (2)
  { id: 'plantation-farming', name: 'Plantation Farming', track: 'agriculture', cost: 145,
    prerequisites: ['agricultural-science', 'irrigation'],
    unlocks: ['Farms yield +1 food'], era: 5 },
  { id: 'distillation', name: 'Distillation', track: 'agriculture', cost: 140,
    prerequisites: ['fermentation'],
    unlocks: ['+2 gold from luxury resources'], unlocksBuildings: ['distillery'], era: 5 },

  // MEDICINE (2)
  { id: 'anatomy', name: 'Anatomy', track: 'medicine', cost: 145,
    prerequisites: ['herbalism'],
    unlocks: ['Units heal +1 HP faster when idle in friendly territory'], era: 5 },
  { id: 'herbalist-guilds', name: 'Herbalist Guilds', track: 'medicine', cost: 140,
    prerequisites: ['herbalism'],
    unlocks: ['Enables Apothecary House chain building'], unlocksBuildings: ['apothecary_house'], era: 5 },

  // PHILOSOPHY (2)
  { id: 'empiricism', name: 'Empiricism', track: 'philosophy', cost: 145,
    prerequisites: ['natural-philosophy'],
    unlocks: ['+1 science all cities'], era: 5 },
  { id: 'rationalism', name: 'Rationalism', track: 'philosophy', cost: 150,
    prerequisites: ['humanism'],
    unlocks: ['+5% science empire-wide'], era: 5 },

  // ARTS (2)
  { id: 'renaissance-painting', name: 'Renaissance Painting', track: 'arts', cost: 145,
    prerequisites: ['theater'],
    unlocks: ['+1 gold per culture building empire-wide'], unlocksBuildings: ['art_gallery'], era: 5 },
  { id: 'classical-music-form', name: 'Classical Music Form', track: 'arts', cost: 150,
    prerequisites: ['theater'],
    unlocks: ['+1 science per culture building empire-wide'], era: 5 },

  // MARITIME (2)
  { id: 'deep-sea-routes', name: 'Deep-Sea Routes', track: 'maritime', cost: 150,
    prerequisites: ['caravels'],
    unlocks: ['+1 gold per coastal city; naval trade reaches foreign continents'],
    unlocksBuildings: ['harbour_exchange'], era: 5 },
  { id: 'naval-gunnery', name: 'Naval Gunnery', track: 'maritime', cost: 155,
    prerequisites: ['naval-warfare'],
    unlocks: ['Naval combat units gain +5 strength'], era: 5 },

  // METALLURGY (2)
  { id: 'blast-furnace-tech', name: 'Blast Furnace', track: 'metallurgy', cost: 150,
    prerequisites: ['steel-forging'],
    unlocks: ['+1 production all cities'], unlocksBuildings: ['blast_furnace'], era: 5 },
  { id: 'cannon-casting', name: 'Cannon Casting', track: 'metallurgy', cost: 155,
    prerequisites: ['blast-furnace-tech'],
    unlocks: ['Cannon production cost reduced by 15%'], era: 5 },

  // CONSTRUCTION (2)
  { id: 'renaissance-architecture', name: 'Renaissance Architecture', track: 'construction', cost: 145,
    prerequisites: ['engineering', 'marble-working'],
    unlocks: ['+2 production in cities containing a wonder'], era: 5 },
  { id: 'vaulted-ceilings', name: 'Vaulted Ceilings', track: 'construction', cost: 150,
    prerequisites: ['marble-working'],
    unlocks: ['All building costs reduced by 10%'], era: 5 },

  // COMMUNICATION (2)
  { id: 'printing-press', name: 'Printing Press', track: 'communication', cost: 150,
    prerequisites: ['writing', 'paper-making'],
    unlocks: ['+1 science per library empire-wide'], era: 5 },
  { id: 'postal-service', name: 'Postal Service', track: 'communication', cost: 145,
    prerequisites: ['road-building'],
    unlocks: ['+1 gold per road tile in empire'], era: 5 },

  // ESPIONAGE (2)
  { id: 'black-chambers', name: 'Black Chambers', track: 'espionage', cost: 155,
    prerequisites: ['cryptography', 'counter-intelligence'],
    unlocks: ['+1 spy slot empire-wide'], era: 5 },
  { id: 'diplomatic-networks', name: 'Diplomatic Networks', track: 'espionage', cost: 150,
    prerequisites: ['counter-intelligence'],
    unlocks: ['Spy missions in foreign capitals have +20% success rate'], era: 5 },

  // SPIRITUALITY (2)
  { id: 'reformation', name: 'Reformation', track: 'spirituality', cost: 145,
    prerequisites: ['theology-tech', 'pilgrimages'],
    unlocks: ['+2 science in cities with a temple'], era: 5 },
  { id: 'monastic-orders', name: 'Monastic Orders', track: 'spirituality', cost: 150,
    prerequisites: ['theology-tech'],
    unlocks: ['+1 science and +1 gold per city with temple'], unlocksBuildings: ['monastery'], era: 5 },
];
```

- [ ] **Step 2: Run consistency tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
```

Expected: passes for all techs with `unlocksUnits`/`unlocksBuildings` once Task 11–12 add the buildings and units. Note remaining failures (cannon, guildhall, etc.) to be fixed in those tasks.

- [ ] **Step 3: Build**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/systems/tech-definitions-eras5-7.ts
git commit -m "feat(tech-tree): add 32 era 5 tech definitions (Renaissance, all 16 tracks)"
```

---

## Task 11 — Cannon Unit (Full Wiring)

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/renderer/unit-visual-resolver.ts` ← icons live here, NOT unit-renderer.ts
- Modify: `src/ai/basic-ai.ts`

- [ ] **Step 1: Add `'cannon'` to `UnitType`** union in `types.ts` — find the `UnitType` union and add `| 'cannon'` after `'ballista'`.

- [ ] **Step 2: Add to `UNIT_DEFINITIONS`** in `src/systems/unit-system.ts`, after the `ballista` entry:

```ts
cannon: {
  type: 'cannon',
  name: 'Cannon',
  movementPoints: 2,
  visionRange: 2,
  strength: 35,
  canFoundCity: false,
  canBuildImprovements: false,
  productionCost: 120,
  domain: 'land',
  attackProfile: { kind: 'bombard', range: 2, targets: ['unit', 'city'] },
},
```

Add to `UNIT_DESCRIPTIONS`:

```ts
cannon: 'Gunpowder siege weapon. High bombard damage against cities and fortifications at range 2. Slow movement.',
```

- [ ] **Step 3: Add cannon to `TRAINABLE_UNITS`** in `src/systems/city-system.ts` — note `cost:` NOT `productionCost:`:

```ts
{ type: 'cannon', cost: 120, techRequired: 'black-powder' },
```

Also add `obsoletedByTech: 'black-powder'` to catapult and ballista entries:

```ts
{ type: 'catapult', cost: 110, techRequired: 'siege-warfare', obsoletedByTech: 'black-powder' },
{ type: 'ballista', cost: 75, techRequired: 'siege-warfare', obsoletedByTech: 'black-powder' },
```

- [ ] **Step 4: Add `PRODUCTION_ICONS` entry** in `src/systems/city-system.ts`:

```ts
cannon: '💣',
```

- [ ] **Step 5: Add cannon to `FALLBACK_ICONS`** in `src/renderer/unit-visual-resolver.ts` — find the `FALLBACK_ICONS` record (it is typed `Record<UnitType, string>` so TypeScript will error if cannon is missing after adding it to UnitType):

```ts
cannon: '💣',
```

- [ ] **Step 6: Add AI cannon training** in `src/ai/basic-ai.ts` — in the section where AI trains units, add:

```ts
if (
  civ.techState.completed.includes('black-powder') &&
  !civUnits.some(u => u.type === 'cannon') &&
  city.productionQueue.length === 0
) {
  newState = {
    ...newState,
    cities: { ...newState.cities, [cityId]: { ...city, productionQueue: ['cannon'] } },
  };
}
```

- [ ] **Step 7: Run consistency + build**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-unlocks-consistency.test.ts
bash scripts/run-with-mise.sh yarn build
```

Expected: cannon consistency check passes. Build exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/renderer/unit-visual-resolver.ts src/ai/basic-ai.ts
git commit -m "feat(units): add cannon — full wiring, obsoletes catapult/ballista on black-powder"
```

---

## Task 12 — Era 5 Buildings (Regular + Special)

**Files:**
- Modify: `src/systems/city-system.ts`

- [ ] **Step 1: Add 6 regular + 2 special buildings to `BUILDINGS`** (after the NPs block from Task 9):

```ts
// ERA 5 REGULAR BUILDINGS
guildhall: {
  id: 'guildhall', name: 'Guildhall', category: 'economy',
  yields: { food: 0, production: 2, gold: 1, science: 0 }, productionCost: 150,
  description: 'Merchants and craftspeople guild. +2 production, +1 gold.',
  techRequired: 'guilds',
},
university: {
  id: 'university', name: 'University', category: 'science',
  yields: { food: 0, production: 0, gold: 0, science: 4 }, productionCost: 165,
  description: 'Advanced centre of learning. +4 science.',
  techRequired: 'scientific-method',
},
art_gallery: {
  id: 'art_gallery', name: 'Art Gallery', category: 'culture',
  yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 155,
  description: 'Gallery of renaissance masterworks. +2 gold.',
  techRequired: 'renaissance-painting',
},
blast_furnace: {
  id: 'blast_furnace', name: 'Blast Furnace', category: 'production',
  yields: { food: 0, production: 3, gold: 0, science: 0 }, productionCost: 160,
  description: 'High-temperature iron smelter. +3 production.',
  techRequired: 'blast-furnace-tech',
},
distillery: {
  id: 'distillery', name: 'Distillery', category: 'economy',
  yields: { food: 0, production: 0, gold: 2, science: 0 }, productionCost: 140,
  description: 'Spirit and medicine distillery. +2 gold.',
  techRequired: 'distillation',
},
monastery: {
  id: 'monastery', name: 'Monastery', category: 'culture',
  yields: { food: 0, production: 0, gold: 1, science: 1 }, productionCost: 150,
  description: 'Monastic community of scholars. +1 science, +1 gold.',
  techRequired: 'monastic-orders',
},

// ERA 5 SPECIAL BUILDINGS
harbour_exchange: {
  id: 'harbour_exchange', name: 'Harbour Exchange', category: 'economy',
  yields: { food: 0, production: 0, gold: 3, science: 0 }, productionCost: 160,
  description: 'Coastal trade exchange. +3 gold. Requires coastal city.',
  techRequired: 'deep-sea-routes', coastalRequired: true,
},
apothecary_house: {
  id: 'apothecary_house', name: 'Apothecary House', category: 'science',
  yields: { food: 2, production: 0, gold: 0, science: 1 }, productionCost: 145,
  description: 'Advanced herbalist practice. +2 food, +1 science. Requires Herbalist.',
  techRequired: 'herbalist-guilds', requiresBuildings: ['herbalist'],
},
```

- [ ] **Step 2: Add `PRODUCTION_ICONS` entries**:

```ts
guildhall: '🏛️',
university: '🎓',
art_gallery: '🖼️',
blast_furnace: '🔩',
distillery: '🍶',
monastery: '⛪',
harbour_exchange: '⚓',
apothecary_house: '🌿',
```

- [ ] **Step 3: Run full tests + build**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Expected: all pass including tech-unlocks-consistency.

- [ ] **Step 4: Commit**

```bash
git add src/systems/city-system.ts
git commit -m "feat(buildings): add 8 era 5 regular and special buildings"
```

---

## Task 13 — Era 5 Wonders + SFX

**Files:**
- Modify: `src/systems/legendary-wonder-definitions.ts`
- Modify: `src/systems/approved-legendary-wonder-roster.ts`
- Modify: `src/audio/sfx.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/wonder-definitions.test.ts`

- [ ] **Step 1: Relocate three stubs** in `legendary-wonder-definitions.ts` — find and update `era` field:
  - `storm-signal-spire`: set `era: 9`
  - `manhattan-project`: set `era: 11`
  - `internet`: set `era: 12`

- [ ] **Step 2: Add three era 5 wonders** to `LEGENDARY_WONDER_DEFINITIONS_BY_ID` (or equivalent export):

```ts
'sistine-vault': {
  id: 'sistine-vault',
  name: 'Sistine Vault',
  era: 5,
  productionCost: 220,
  requiredTechs: ['renaissance-painting', 'monastic-orders'],
  requiredResources: ['stone'],
  cityRequirement: 'any',   // <-- string literal, not { type: 'any' }
  questSteps: [
    {
      id: 'arts-techs',
      type: 'research_count',   // <-- required type field
      track: 'arts',
      targetCount: 4,
      description: 'Complete 4 arts or spirituality technologies.',
    },
    {
      id: 'city-depth',
      type: 'buildings-in-multiple-cities',
      targetCount: 3,
      cityScope: 'empire',
      minimumBuildingsPerCity: 3,
      description: 'Develop 3 cities with at least 3 buildings each.',
    },
  ],
  reward: {
    summary: '+3 science and +1 gold empire-wide each turn.',
    civYieldBonus: { science: 3, gold: 1 },  // spec value: science 3, gold 1
  },
},
'codex-eternal': {
  id: 'codex-eternal',
  name: 'Codex Eternal',
  era: 5,
  productionCost: 220,
  requiredTechs: ['printing-press', 'scientific-method'],
  requiredResources: [],
  cityRequirement: 'any',
  questSteps: [
    {
      id: 'science-techs',
      type: 'research_count',
      track: 'science',
      targetCount: 4,
      description: 'Complete 4 science technologies.',
    },
    {
      id: 'libraries',
      type: 'buildings-in-multiple-cities',
      targetCount: 3,
      cityScope: 'empire',
      minimumBuildingsPerCity: 2,
      description: 'Build at least 2 buildings (including a library) in 3 separate cities.',
    },
  ],
  reward: {
    summary: '+4 science empire-wide each turn.',
    civYieldBonus: { science: 4 },
  },
},
'navigators-compass': {
  id: 'navigators-compass',
  name: "Navigator's Compass",
  era: 5,
  productionCost: 220,
  requiredTechs: ['circumnavigation', 'deep-sea-routes'],
  requiredResources: [],
  cityRequirement: 'coastal',
  questSteps: [
    {
      id: 'foreign-discoveries',
      type: 'map-discoveries',
      targetCount: 3,
      discoveryTypes: ['natural-wonder', 'tribal-village'],
      description: 'Discover 3 natural wonders or tribal villages.',
    },
    {
      id: 'coastal-trade',
      type: 'trade-routes-established',
      targetCount: 2,
      routeRequirement: 'coastal',
      description: 'Establish 2 coastal trade routes.',
    },
  ],
  reward: {
    summary: '+4 gold empire-wide each turn. All newly trained naval units gain +1 movement permanently.',
    civYieldBonus: { gold: 4 },
    // Naval movement wired in turn-manager.ts Task 4 Step 4
  },
},
```

- [ ] **Step 3: Add to approved roster** in `src/systems/approved-legendary-wonder-roster.ts`:

```ts
'sistine-vault',
'codex-eternal',
'navigators-compass',
```

- [ ] **Step 4: Add wonder balance tests** — add to `tests/systems/wonder-definitions.test.ts`:

```ts
const RELOCATED_STUB_IDS = new Set([
  'global-logistics', 'nuclear-theory', 'mass-media',
  'digital-surveillance', 'cyber-warfare', 'amphibious-warfare',
]);

describe('era <= 7 wonders do not reference relocated tech stubs', () => {
  const activeWonders = ALL_WONDER_DEFINITIONS.filter(w => w.era <= 7);
  for (const w of activeWonders) {
    it(`${w.id} uses no relocated tech IDs`, () => {
      for (const techId of w.requiredTechs) {
        expect(RELOCATED_STUB_IDS.has(techId), `${w.id} references relocated ${techId}`).toBe(false);
      }
    });
  }
});

describe('wonder yield ceilings', () => {
  for (const w of ALL_WONDER_DEFINITIONS) {
    it(`${w.id} civYieldBonus single key <= 6`, () => {
      for (const [k, v] of Object.entries(w.reward.civYieldBonus ?? {}) as [string, number][]) {
        expect(v, `${w.id}.${k} = ${v} > 6`).toBeLessThanOrEqual(6);
      }
    });
    it(`${w.id} civYieldBonus has <= 2 keys`, () => {
      expect(Object.keys(w.reward.civYieldBonus ?? {}).length).toBeLessThanOrEqual(2);
    });
    it(`${w.id} cityYieldBonus single key <= 4`, () => {
      for (const [k, v] of Object.entries(w.reward.cityYieldBonus ?? {}) as [string, number][]) {
        expect(v, `${w.id}.${k} = ${v} > 4`).toBeLessThanOrEqual(4);
      }
    });
  }
});
```

- [ ] **Step 5: Add SFX to `src/audio/sfx.ts`** — add to the `SFX` object:

```ts
nationalProjectBuilt: () => {
  // Rising fanfare: four ascending tones
  playTone(523, 0.12, 0.2);
  setTimeout(() => playTone(659, 0.12, 0.2), 120);
  setTimeout(() => playTone(784, 0.2, 0.25), 240);
  setTimeout(() => playTone(1047, 0.25, 0.2), 360);
},
nationalProjectExpired: () => {
  // Descending minor chord: institution fading
  playTone(523, 0.15, 0.2);
  setTimeout(() => playTone(415, 0.15, 0.2), 150);
  setTimeout(() => playTone(349, 0.25, 0.15), 300);
},
```

- [ ] **Step 6: Wire SFX in `src/main.ts`** — find the `bus.on('city:building-complete', ...)` handler and add the NP check inside it:

```ts
bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (!city) return;
  const bldg = BUILDINGS[buildingId];
  const buildingName = bldg?.name ?? buildingId;
  appendToCivLog(city.owner, `${city.name}: ${buildingName} completed!`, 'success');
  if (bldg?.nationalProject) {
    SFX.nationalProjectBuilt();
  }
});
```

Add a new handler after it:

```ts
bus.on('city:national-project-expired', ({ civId, cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  const bldg = BUILDINGS[buildingId];
  if (!bldg || !city) return;
  const msg = document.createTextNode(
    `${city.name}: ${bldg.name} has expired — your civilization has grown beyond this era's institutions.`
  );
  appendToCivLog(civId, msg.textContent ?? '', 'warning');
  SFX.nationalProjectExpired();
});
```

- [ ] **Step 7: Run full tests + build**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Expected: all pass. 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add src/systems/legendary-wonder-definitions.ts src/systems/approved-legendary-wonder-roster.ts src/audio/sfx.ts src/main.ts tests/systems/wonder-definitions.test.ts
git commit -m "feat(wonders): add 3 era 5 wonders; NP SFX (built + expired); relocate late stubs"
```

---

## PR1 Verification Gate

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
```

Both must exit 0.

**Manual smoke test:**
1. New game → advance to era 5 → tech panel shows "Renaissance" label
2. Research `black-powder` → cannon appears in production queue; catapult/ballista disappear
3. Research `scientific-method` → Royal Academy appears in "National Projects" section of city panel
4. Build Royal Academy → +4 science in per-turn yields; `⏳ (fading)` badge appears two eras later
5. Advance to era 8 → Royal Academy removed from city, expiry civ-log message shown, SFX plays
6. Build Navigator's Compass → train a galley → verify its movement is base+1

**Create PR:**
```
Title: feat(tech-tree): PR1 — Foundation + Era 5 (Renaissance)
Target: main
```
