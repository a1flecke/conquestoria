# Issue #919 MR3 — Actionable Unrest Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the city-panel unrest pressure breakdown into specific, availability-checked "do this" advice — a shared string-free helper (`src/systems/unrest-guidance.ts`), one-line "top lever" in the cities overview, per-row recommendation sub-lines in the per-city panel, and an honesty fix to the two "build happiness improvements" dead promises.

**Status:** ✅ all 6 tasks implemented on branch `claude/issue-919-mr3-guidance` (2026-08-30). Self-review fix: `CONQUEST_RESOLVER` now returns `await-conquest-settle` (now) as the primary lever instead of `research-constitutional-law` (an Era 5-7 tech). Full `yarn build` + `yarn test` green (549 files, 9347 tests).

**Architecture:** A **table-driven** resolver in `unrest-guidance.ts` maps each positive pressure row to a typed `UnrestRecommendation` (no display strings) using the existing availability helpers. The UI layer owns all copy/icons/screen names in one shared module `src/ui/unrest-guidance-copy.ts` consumed by both panels. Recommendation sub-lines are **read-only text**, not new interactive controls.

**Tech Stack:** TypeScript, Vitest (`jsdom` for UI tests), Vite. No new deps. Pure functions; `textContent` / `createTextNode` for all dynamic UI text.

## Global Constraints

- **Worktree:** all work in `/Users/aaronfleckenstein/development/github/conquestoria/.claude/worktrees/issue-919-mr3-guidance` on branch `claude/issue-919-mr3-guidance` (created off `origin/main` @ `3180e3d0`, which contains MR1 + MR2). Hooks path `.githooks` set, `mise trust` done, deps installed.
- **NO subagents / parallel agents** (CLAUDE.md "Agent Policy"). Everything inline in one session.
- **Commands:** always `bash scripts/run-with-mise.sh yarn <cmd>`. Fast loop: `bash scripts/run-with-mise.sh yarn vitest run <file>`. Full gate before push: `bash scripts/run-with-mise.sh yarn build` **and** `bash scripts/run-with-mise.sh yarn test`, both exit 0.
- **Bash tool timeouts:** `git commit` → 30000 ms; `git push` / `gh pr create` / `gh pr merge` → 240000 ms.
- **Issue #919 is the last MR of the arc.** PR body may say "Closes #919" only if the user confirms the arc is complete; default to "Part of #919" and let the user close the issue. (memory: `feedback_pr_body_closes_keyword`.)
- **Commit trailer:** `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. PR body trailer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **`.claude/rules/ui-panels.md`:** `textContent`/`createTextNode` only for game-generated strings (never `innerHTML`); compute for `state.currentPlayer` not `cities[0]`; `createGameButton` for any button (none added here). **`.claude/rules/spec-fidelity.md`:** UI contract words (`show`, `surface`, `greyed`, `render`) are real requirements with DOM assertions; semantic terms (`recommended`, `available now`) need a negative test.
- **`.claude/rules/content-description-honesty.md`:** no advice text may promise an action the player cannot take in their current era/tech state.

## Row-label reference (verified against `src/systems/faction-system.ts` on this branch)

Positive pressure rows emitted by `getUnrestPressureBreakdown`, by exact label:
`'Empire overextension'`, `'Distance from capital'`, `'Recent conquest'`, `'War weariness'`, `'Enemy espionage'`, `'Economic strain'` (era ≥ 3 only), `'Uprising contagion'`, `'Foreign faith pressure'` (human cities only), and — from MR2 — the negative `'Courthouse'` relief row.
Negative offset rows (not pressure, no resolver): `'Luxury resources'`, `'Happiness buildings'`, `'Religious serenity'`, `'Courthouse'`.

## Spec deviations found in the live-code audit (carry into the PR body)

1. **`advisor-system.ts:257` is already honest.** The spec's §current-main audit says the advisor promises "build happiness improvements"; the live `chancellor_unrest_warning.message` is `'Discontent is spreading through one of our cities. Garrison it, end the war, or reduce pressure before unrest hardens into revolt.'` — no happiness-building promise. The two real dead promises are in `notification-routing.ts` **line 118** (`faction:unrest-started`) and **line 462** (Era-2 onset). This plan fixes those two and additionally makes the advisor message era-aware (points at the Courthouse once `magistracy` is done) via a small `AdvisorMessage.message` type widening — spec-directed ("era-aware text derived from the same availability logic").
2. **`constitutional-law` is an Era 5-7 tech** (`tech-definitions-eras5-7.ts`, cost 100), not early. The `research-constitutional-law` sub-recommendation for the `Recent conquest` row is therefore almost always `research-first`, rarely `now`. Correct per spec; just noting the era.
3. **`AdvisorMessage.message` is a plain `string`** (`advisor-system.ts:31`), consumed at `:797` and `:804`. Widening to `string | ((state: GameState) => string)` is a 3-line change at those two call sites plus the interface.

---

### Task 1: `src/systems/unrest-guidance.ts` — typed, string-free recommendation helper

**Files:**
- Create: `src/systems/unrest-guidance.ts`
- Test: `tests/systems/unrest-guidance.test.ts`

**Interfaces:**
- Consumes: `getUnrestPressureBreakdown`, `UnrestPressureRow`, `computeUnrestPressure`, `canGarrisonCity`, `getContagionSpread` (`faction-system.ts`); `getAvailableBuildings`, `getTrainableUnitsForCity` (`city-system.ts`); `getEconomyStatusForCiv` (`economy-system.ts`); `getCivHappinessFromResources`, `getCivAvailableResources` (`resource-acquisition-system.ts`); `resolveCivilizationEra` (`tech-definitions.ts`); `getForeignFaithPressure` (`religion-loyalty-system.ts`).
- Produces:
  ```ts
  export type UnrestRecommendationKind =
    | 'build-courthouse' | 'research-magistracy'
    | 'garrison-unit' | 'train-garrison-unit'
    | 'make-peace' | 'await-conquest-settle' | 'research-constitutional-law'
    | 'fix-economy' | 'counter-espionage' | 'stabilise-contagion-source'
    | 'build-faith-building' | 'acquire-luxury' | 'build-happiness-building'
    | 'appease-or-concede';

  export interface UnrestRecommendation {
    kind: UnrestRecommendationKind;
    rowLabel: string;          // '' only for the appease-or-concede fallback
    amount: number;            // that row's current contribution (0 for the fallback)
    availability: 'now' | 'research-first' | 'blocked';
    params?: Record<string, unknown>;
  }

  export function getUnrestRecommendations(cityId: string, state: GameState): UnrestRecommendation[];
  export function getTopUnrestLever(cityId: string, state: GameState): UnrestRecommendation | null;
  ```
  Consumed by Tasks 3, 4, 5 and `src/ui/unrest-guidance-copy.ts` (Task 3 Step 3).

- [ ] **Step 1: Write the failing test file**

Create `tests/systems/unrest-guidance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { GameState, City, HexCoord } from '@/core/types';
import { getUnrestRecommendations, getTopUnrestLever } from '@/systems/unrest-guidance';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';

// Minimal state builder — mirrors tests/systems/faction-system.test.ts's makeState shape
// closely enough for getUnrestPressureBreakdown + the guidance helpers. Copy that file's
// makeState/makeCity helpers verbatim into a local `helpers/unrest-state.ts` if it is
// cleaner than re-deriving; they already produce a valid map + civ + capital.

function completedTechsForEra(era: number): string[] {
  return Array.from({ length: Math.max(0, era - 1) }, (_, i) => i + 2)
    .flatMap(e => {
      const techs = getEraAdvancementTechs(e);
      const need = Math.ceil(techs.length * (e <= 3 ? 0.5 : e <= 8 ? 0.6 : 0.55));
      return techs.slice(0, need).map(t => t.id);
    });
}

// ... build helpers here (see faction-system.test.ts makeState) ...

describe('unrest-guidance', () => {
  it('Empire overextension → research-magistracy (research-first) when code-of-laws done but magistracy not', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] });
    const recs = getUnrestRecommendations('city-1', state);
    const rec = recs.find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).toBe('research-magistracy');
    expect(rec?.availability).toBe('research-first');
  });

  it('NEGATIVE: Empire overextension does NOT yield build-courthouse before magistracy', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).not.toBe('build-courthouse');
  });

  it('Empire overextension → build-courthouse (now) when magistracy done and city lacks one', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws', 'magistracy'] });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).toBe('build-courthouse');
    expect(rec?.availability).toBe('now');
  });

  it('Empire overextension → garrison-unit when magistracy not researchable (no code-of-laws) and a spare military unit exists', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council'], spareMilitaryUnitAt: { q: 20, r: 20 } });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).toBe('garrison-unit');
    expect(rec?.availability).toBe('now');
  });

  it('garrison-unit vs train-garrison-unit flips on whether a spare unit exists', () => {
    const withUnit = makeState({ cityCount: 12, era: 2, completed: ['tribal-council'], spareMilitaryUnitAt: { q: 20, r: 20 } });
    const without = makeState({ cityCount: 12, era: 2, completed: ['tribal-council'] });
    expect(getUnrestRecommendations('city-1', withUnit).find(r => r.rowLabel === 'Empire overextension')?.kind).toBe('garrison-unit');
    expect(getUnrestRecommendations('city-1', without).find(r => r.rowLabel === 'Empire overextension')?.kind).toBe('train-garrison-unit');
  });

  it('War weariness → make-peace (now) with params.warCivIds', () => {
    const state = makeState({ cityCount: 1, era: 2, atWarCount: 2 });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'War weariness');
    expect(rec?.kind).toBe('make-peace');
    expect(rec?.availability).toBe('now');
    expect(Array.isArray((rec?.params as any)?.warCivIds)).toBe(true);
  });

  it('Recent conquest → await-conquest-settle (now) with params.turnsLeft', () => {
    const state = makeState({ cityCount: 1, era: 2, conquestTurn: 0 });
    state.turn = 5;
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Recent conquest');
    expect(rec?.kind).toBe('await-conquest-settle');
    expect(typeof (rec?.params as any)?.turnsLeft).toBe('number');
  });

  it('Economic strain → fix-economy (now); only appears at era ≥ 3', () => {
    const state = makeState({ cityCount: 1, era: 3, criticalEconomy: true });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Economic strain');
    expect(rec?.kind).toBe('fix-economy');
  });

  it('Enemy espionage → counter-espionage (now)', () => {
    const state = makeState({ cityCount: 1, era: 2, spyUnrestBonus: 10 });
    expect(getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Enemy espionage')?.kind).toBe('counter-espionage');
  });

  it('Uprising contagion → stabilise-contagion-source (now) with params.sourceCityId', () => {
    const state = makeState({ cityCount: 1, era: 2, revoltingNeighborAt: { q: 2, r: 0 } });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Uprising contagion');
    expect(rec?.kind).toBe('stabilise-contagion-source');
    expect(typeof (rec?.params as any)?.sourceCityId).toBe('string');
  });

  it('NEGATIVE: no build-happiness-building for an Era-2 civ', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] });
    expect(getUnrestRecommendations('city-1', state).some(r => r.kind === 'build-happiness-building')).toBe(false);
  });

  it('POSITIVE: build-happiness-building appears for an Era-3 civ with philosophy and no happiness building', () => {
    const state = makeState({ cityCount: 12, era: 3, completed: [...completedTechsForEra(3), 'philosophy'] });
    expect(getUnrestRecommendations('city-1', state).some(r => r.kind === 'build-happiness-building' && r.availability === 'now')).toBe(true);
  });

  it('getTopUnrestLever picks the largest row that is now-actionable', () => {
    // overextension 18 (research-first) + war 24 (now) → make-peace wins over the bigger-but-not-now row.
    const state = makeState({ cityCount: 12, era: 2, atWarCount: 3, completed: ['tribal-council', 'code-of-laws'] });
    expect(getTopUnrestLever('city-1', state)?.kind).toBe('make-peace');
  });

  it('getTopUnrestLever falls through to the largest row when none are now-actionable', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] }); // only overextension, research-first
    expect(getTopUnrestLever('city-1', state)?.kind).toBe('research-magistracy');
  });

  it('getTopUnrestLever falls back to appease-or-concede with no positive rows', () => {
    const state = makeState({ cityCount: 1, era: 2 }); // 2 cities, no distance, no war → no positive rows
    const top = getTopUnrestLever('city-1', state);
    expect(top?.kind).toBe('appease-or-concede');
    expect(top?.rowLabel).toBe('');
  });

  it('a courthoused city surfaces a different top lever than the same city un-courthoused', () => {
    const base = makeState({ cityCount: 8, era: 2, cityPosition: { q: 9, r: 0 }, completed: ['tribal-council', 'code-of-laws', 'magistracy'] });
    const withCh: GameState = { ...base, cities: { ...base.cities, 'city-1': { ...base.cities['city-1'], buildings: ['courthouse'] } } };
    expect(getTopUnrestLever('city-1', base)?.kind).toBe('build-courthouse');
    // With the courthouse built, the overextension/distance rows are relieved below other rows
    // (or gone) so the top lever changes — assert it is no longer build-courthouse.
    expect(getTopUnrestLever('city-1', withCh)?.kind).not.toBe('build-courthouse');
  });
});
```

Extend the local `makeState` with the extra knobs the tests use (`completed`, `spareMilitaryUnitAt`, `criticalEconomy`, `revoltingNeighborAt`, `conquestTurn`, `cityPosition`) — copy the base from `tests/systems/faction-system.test.ts` and add fields. If `criticalEconomy` is hard to force via `getEconomyStatusForCiv`, drive it by adding enough unpaid-maintenance buildings/units, or skip that one assertion's strict `now` and assert only the `kind`.

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unrest-guidance.test.ts`
Expected: FAIL — `Cannot find module '@/systems/unrest-guidance'`.

- [ ] **Step 3: Implement `src/systems/unrest-guidance.ts`**

```ts
import type { GameState, City } from '@/core/types';
import {
  getUnrestPressureBreakdown,
  canGarrisonCity,
  getContagionSpread,
  type UnrestPressureRow,
} from './faction-system';
import { getAvailableBuildings, getTrainableUnitsForCity, BUILDINGS } from './city-system';
import { getEconomyStatusForCiv } from './economy-system';
import { getCivHappinessFromResources, getCivAvailableResources } from './resource-acquisition-system';
import { resolveCivilizationEra } from './tech-definitions';
import { hexDistance } from './hex-utils';

export type UnrestRecommendationKind =
  | 'build-courthouse' | 'research-magistracy'
  | 'garrison-unit' | 'train-garrison-unit'
  | 'make-peace' | 'await-conquest-settle' | 'research-constitutional-law'
  | 'fix-economy' | 'counter-espionage' | 'stabilise-contagion-source'
  | 'build-faith-building' | 'acquire-luxury' | 'build-happiness-building'
  | 'appease-or-concede';

export interface UnrestRecommendation {
  kind: UnrestRecommendationKind;
  rowLabel: string;
  amount: number;
  availability: 'now' | 'research-first' | 'blocked';
  params?: Record<string, unknown>;
}

const CONQUEST_UNREST_DURATION = 15; // mirror faction-system.ts (not exported)

// --- shared availability helpers (thin wrappers, no reimplementation) ---

function techDone(state: GameState, civId: string, techId: string): boolean {
  return state.civilizations[civId]?.techState.completed.includes(techId) ?? false;
}

function hasSpareMilitaryUnit(state: GameState, city: City): boolean {
  // a friendly military unit that is NOT already sitting on this city tile
  return Object.values(state.units).some(u =>
    u.owner === city.owner
    && hexDistance(u.position, city.position) !== 0
    && MILITARY_UNIT_TYPES.has(u.type));
}

// Derive from typed unit metadata, not a hand list. `UNIT_DEFINITIONS[type].strength > 0`
// and not a civilian type (settler/worker/missionary/spy_*). Import UNIT_DEFINITIONS from
// unit-system and build this set once at module load.
import { UNIT_DEFINITIONS } from './unit-system';
const CIVILIAN_TYPES = new Set(['settler', 'worker', 'missionary']);
const MILITARY_UNIT_TYPES = new Set(
  Object.entries(UNIT_DEFINITIONS)
    .filter(([type, def]) => (def?.strength ?? 0) > 0 && !CIVILIAN_TYPES.has(type) && !type.startsWith('spy_'))
    .map(([type]) => type),
);

function courthouseBuildableHere(state: GameState, city: City): boolean {
  const civ = state.civilizations[city.owner];
  if (!civ) return false;
  if (city.buildings.includes('courthouse')) return false;
  const era = resolveCivilizationEra(civ.techState.completed);
  const resources = getCivAvailableResources(state, city.owner);
  return getAvailableBuildings(city, civ.techState.completed, state.map, resources, era, undefined, city.owner)
    .some(b => b.id === 'courthouse');
}

// --- resolvers: one per row family, table-driven (mirrors NP_PRODUCTION_DISCOUNTS) ---

interface GuidanceResolver {
  matchesRow(label: string): boolean;
  resolve(ctx: { city: City; state: GameState; row: UnrestPressureRow }): UnrestRecommendation | null;
}

const SPRAWL_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Empire overextension' || label === 'Distance from capital',
  resolve: ({ city, state, row }) => {
    const base = { rowLabel: row.label, amount: row.amount };
    if (courthouseBuildableHere(state, city)) {
      return { ...base, kind: 'build-courthouse', availability: 'now' };
    }
    if (!city.buildings.includes('courthouse') && techDone(state, city.owner, 'code-of-laws')
        && !techDone(state, city.owner, 'magistracy')) {
      return { ...base, kind: 'research-magistracy', availability: 'research-first', params: { techId: 'magistracy' } };
    }
    if (hasSpareMilitaryUnit(state, city)) {
      return { ...base, kind: 'garrison-unit', availability: 'now' };
    }
    return { ...base, kind: 'train-garrison-unit', availability: 'now' };
  },
};

const WAR_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'War weariness',
  resolve: ({ city, state, row }) => ({
    rowLabel: row.label, amount: row.amount, kind: 'make-peace', availability: 'now',
    params: { warCivIds: [...(state.civilizations[city.owner]?.diplomacy.atWarWith ?? [])] },
  }),
};

const CONQUEST_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Recent conquest',
  resolve: ({ city, state, row }) => {
    const turnsLeft = city.conquestTurn !== undefined
      ? Math.max(0, CONQUEST_UNREST_DURATION - (state.turn - city.conquestTurn))
      : 0;
    // constitutional-law halves the row; recommend researching it only if it isn't done and would help.
    if (!techDone(state, city.owner, 'constitutional-law')) {
      return {
        rowLabel: row.label, amount: row.amount, kind: 'research-constitutional-law',
        availability: 'research-first', params: { turnsLeft, techId: 'constitutional-law', canGarrison: canGarrisonCity(city.id, state) },
      };
    }
    return {
      rowLabel: row.label, amount: row.amount, kind: 'await-conquest-settle', availability: 'now',
      params: { turnsLeft, canGarrison: canGarrisonCity(city.id, state) },
    };
  },
};

const ECONOMY_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Economic strain',
  resolve: ({ city, state, row }) => {
    const status = getEconomyStatusForCiv(state, city.owner);
    return {
      rowLabel: row.label, amount: row.amount, kind: 'fix-economy', availability: 'now',
      params: { unpaidMaintenance: status.unpaidMaintenance },
    };
  },
};

const ESPIONAGE_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Enemy espionage',
  resolve: ({ row }) => ({ rowLabel: row.label, amount: row.amount, kind: 'counter-espionage', availability: 'now' }),
};

const CONTAGION_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Uprising contagion',
  resolve: ({ city, state, row }) => ({
    rowLabel: row.label, amount: row.amount, kind: 'stabilise-contagion-source', availability: 'now',
    params: { sourceCityId: getContagionSpread(city.id, state).nearestCityId ?? undefined },
  }),
};

const FAITH_RESOLVER: GuidanceResolver = {
  matchesRow: label => label === 'Foreign faith pressure',
  resolve: ({ city, state, row }) => {
    const canBuild = techDone(state, city.owner, 'philosophy');
    return {
      rowLabel: row.label, amount: row.amount, kind: 'build-faith-building',
      availability: canBuild ? 'now' : 'blocked',
      params: canBuild ? undefined : { needsTech: 'philosophy' },
    };
  },
};

const RESOLVERS: GuidanceResolver[] = [
  SPRAWL_RESOLVER, WAR_RESOLVER, CONQUEST_RESOLVER, ECONOMY_RESOLVER,
  ESPIONAGE_RESOLVER, CONTAGION_RESOLVER, FAITH_RESOLVER,
];

function resolveRow(city: City, state: GameState, row: UnrestPressureRow): UnrestRecommendation | null {
  for (const r of RESOLVERS) if (r.matchesRow(row.label)) return r.resolve({ city, state, row });
  return null;
}

// Rows with no per-row resolver but an empire-state opportunity (luxury / happiness building).
function emptyStateRecommendations(city: City, state: GameState): UnrestRecommendation[] {
  const civ = state.civilizations[city.owner];
  if (!civ) return [];
  const out: UnrestRecommendation[] = [];
  const era = resolveCivilizationEra(civ.techState.completed);
  const resources = getCivAvailableResources(state, city.owner);

  if (getCivHappinessFromResources(state, city.owner) === 0) {
    out.push({ kind: 'acquire-luxury', rowLabel: '', amount: 0, availability: 'now' });
  }

  const hasHappinessBuildingTech = getAvailableBuildings(city, civ.techState.completed, state.map, resources, era, undefined, city.owner)
    .some(b => (b.happiness ?? 0) > 0);
  if (hasHappinessBuildingTech) {
    out.push({ kind: 'build-happiness-building', rowLabel: '', amount: 0, availability: 'now' });
  }
  return out;
}

export function getUnrestRecommendations(cityId: string, state: GameState): UnrestRecommendation[] {
  const city = state.cities[cityId];
  if (!city) return [];
  const rows = getUnrestPressureBreakdown(cityId, state, getCivHappinessFromResources(state, city.owner));
  const positiveRows = rows.filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);

  const recs: UnrestRecommendation[] = [];
  for (const row of positiveRows) {
    const rec = resolveRow(city, state, row);
    if (rec) recs.push(rec);
  }
  recs.push(...emptyStateRecommendations(city, state));

  if (recs.length === 0) {
    recs.push({ kind: 'appease-or-concede', rowLabel: '', amount: 0, availability: 'now' });
  }
  return recs;
}

export function getTopUnrestLever(cityId: string, state: GameState): UnrestRecommendation | null {
  const city = state.cities[cityId];
  if (!city) return null;
  const rows = getUnrestPressureBreakdown(cityId, state, getCivHappinessFromResources(state, city.owner));
  const positiveRows = rows.filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);
  if (positiveRows.length === 0) {
    return { kind: 'appease-or-concede', rowLabel: '', amount: 0, availability: 'now' };
  }
  const resolved = positiveRows.map(row => resolveRow(city, state, row)).filter((r): r is UnrestRecommendation => r != null);
  const firstNow = resolved.find(r => r.availability === 'now');
  return firstNow ?? resolved[0] ?? { kind: 'appease-or-concede', rowLabel: '', amount: 0, availability: 'now' };
}
```

Notes for the implementer:
- If `CONQUEST_UNREST_DURATION` should not be duplicated, export it from `faction-system.ts` (it currently isn't) and import it — prefer that.
- The `emptyStateRecommendations` `acquire-luxury` `params.luxuryIds` is left empty (spec: "reachable if cheap to compute" — the copy layer can say "trade for a luxury" without listing ids). Keep it minimal.
- `getTrainableUnitsForCity` import is only needed if the `train-garrison-unit` path wants to name a unit/cost — keep the recommendation kind-only for now (copy layer says "train a soldier"); drop the import if unused.

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unrest-guidance.test.ts`
Expected: PASS. Iterate on the resolver logic and the test `makeState` until green. If the "courthoused city surfaces a different top lever" test is flaky because the relieved rows still lead, adjust the fixture (more war/spy pressure so a non-sprawl row is clearly largest post-courthouse).

- [ ] **Step 5: Commit**

```bash
git add src/systems/unrest-guidance.ts tests/systems/unrest-guidance.test.ts
git commit -m "feat(#919): MR3 unrest-guidance — typed, string-free recommendation helper

Part of #919. Table-driven resolver maps each positive pressure row to a
typed UnrestRecommendation (kind + availability + params, no display
strings). getUnrestRecommendations / getTopUnrestLever. Reuses existing
availability helpers; no new eligibility logic.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `src/ui/unrest-guidance-copy.ts` — UI-layer copy mapping

**Files:**
- Create: `src/ui/unrest-guidance-copy.ts`
- Test: `tests/ui/unrest-guidance-copy.test.ts`

**Interfaces:**
- Consumes: `UnrestRecommendation`, `UnrestRecommendationKind` (Task 1).
- Produces: `export function unrestRecommendationCopy(rec: UnrestRecommendation): { icon: string; text: string };` — plain-language, jargon-free, names the destination screen. Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/unrest-guidance-copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { unrestRecommendationCopy } from '@/ui/unrest-guidance-copy';
import type { UnrestRecommendation } from '@/systems/unrest-guidance';

const rec = (p: Partial<UnrestRecommendation>): UnrestRecommendation =>
  ({ kind: 'appease-or-concede', rowLabel: '', amount: 0, availability: 'now', ...p });

describe('unrestRecommendationCopy', () => {
  it('build-courthouse names the City screen', () => {
    const { icon, text } = unrestRecommendationCopy(rec({ kind: 'build-courthouse', rowLabel: 'Empire overextension', amount: 18 }));
    expect(icon).toBe('⚖️');
    expect(text).toMatch(/courthouse/i);
    expect(text).toMatch(/city screen/i);
  });

  it('research-magistracy names the Tech screen and says "first"', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'research-magistracy', availability: 'research-first' }));
    expect(text).toMatch(/magistracy/i);
    expect(text).toMatch(/tech screen/i);
    expect(text).toMatch(/first/i);
  });

  it('make-peace states the number of enemies from params.warCivIds', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'make-peace', rowLabel: 'War weariness', amount: 24, params: { warCivIds: ['a', 'b'] } }));
    expect(text).toMatch(/2/);
    expect(text).toMatch(/diplomacy/i);
  });

  it('await-conquest-settle states the turns left from params.turnsLeft', () => {
    const { text } = unrestRecommendationCopy(rec({ kind: 'await-conquest-settle', params: { turnsLeft: 6 } }));
    expect(text).toMatch(/6/);
  });

  it('every kind returns a non-empty icon and text', () => {
    const kinds: UnrestRecommendation['kind'][] = [
      'build-courthouse', 'research-magistracy', 'garrison-unit', 'train-garrison-unit',
      'make-peace', 'await-conquest-settle', 'research-constitutional-law', 'fix-economy',
      'counter-espionage', 'stabilise-contagion-source', 'build-faith-building',
      'acquire-luxury', 'build-happiness-building', 'appease-or-concede',
    ];
    for (const kind of kinds) {
      const { icon, text } = unrestRecommendationCopy(rec({ kind }));
      expect(icon.length, kind).toBeGreaterThan(0);
      expect(text.length, kind).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/unrest-guidance-copy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/unrest-guidance-copy.ts`**

```ts
import type { UnrestRecommendation } from '@/systems/unrest-guidance';

// Plain-language, jargon-free, names where to go. Written for the 7-year-old end of
// the audience as much as the 43-year-old. The systems layer owns eligibility; this
// module owns every player-visible string for a recommendation.
export function unrestRecommendationCopy(rec: UnrestRecommendation): { icon: string; text: string } {
  const p = rec.params ?? {};
  switch (rec.kind) {
    case 'build-courthouse':
      return { icon: '⚖️', text: 'Build a Courthouse here (City screen) — it calms a city that is big or far from your capital.' };
    case 'research-magistracy':
      return { icon: '🔬', text: 'Research Magistracy first (Tech screen), then you can build a Courthouse here.' };
    case 'garrison-unit':
      return { icon: '⚔️', text: 'Move one of your soldiers into this city to keep order.' };
    case 'train-garrison-unit':
      return { icon: '⚔️', text: 'Train a soldier here and keep it in the city to hold order.' };
    case 'make-peace': {
      const n = Array.isArray(p.warCivIds) ? (p.warCivIds as unknown[]).length : 0;
      return { icon: '🕊️', text: `Make peace — you're at war with ${n} ${n === 1 ? 'empire' : 'empires'} (Diplomacy screen).` };
    }
    case 'await-conquest-settle': {
      const t = typeof p.turnsLeft === 'number' ? p.turnsLeft : 0;
      return { icon: '⏳', text: `Newly taken city — it settles down on its own in ${t} turn${t === 1 ? '' : 's'}. A soldier inside helps.` };
    }
    case 'research-constitutional-law':
      return { icon: '🔬', text: 'Research Constitutional Law (Tech screen) to soften unrest in newly conquered cities.' };
    case 'fix-economy':
      return { icon: '💰', text: "Your treasury is in the red — cut unit upkeep or raise gold so buildings aren't shut off." };
    case 'counter-espionage':
      return { icon: '🕵️', text: 'An enemy spy is stirring trouble here — station a spy or build counter-espionage to stop it.' };
    case 'stabilise-contagion-source':
      return { icon: '🔥', text: 'A nearby city of yours is in revolt and the anger is spreading — calm that city first.' };
    case 'build-faith-building':
      return rec.availability === 'blocked'
        ? { icon: '🛕', text: 'A foreign religion is unsettling this city — you need Philosophy before you can build a Temple to counter it.' }
        : { icon: '🛕', text: 'Build a Temple here (City screen) to blunt the foreign religion pulling at this city.' };
    case 'acquire-luxury':
      return { icon: '💎', text: 'Get a luxury resource — trade for one or settle near one; each new kind makes every city happier.' };
    case 'build-happiness-building':
      return { icon: '🎭', text: 'Build a happiness building here (Temple / Amphitheater — City screen) to lower unrest.' };
    case 'appease-or-concede':
      return { icon: '🪙', text: 'Use Appease (quick, cheap) or Concede (costs more, lasts longer) below for now.' };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/unrest-guidance-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/unrest-guidance-copy.ts tests/ui/unrest-guidance-copy.test.ts
git commit -m "feat(#919): MR3 unrest-guidance-copy — UI-layer plain-language mapping

Part of #919. One shared kind→{icon,text} map for both guidance surfaces;
jargon-free, names the destination screen. Systems layer stays string-free.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Cities overview panel — one-line "top lever" per unrest city

**Files:**
- Modify: `src/ui/city-overview-panel.ts` (`renderCityRow`, inside the `if (city.unrestLevel > 0)` block, before `actions`)
- Test: `tests/ui/city-overview-panel.test.ts`

**Interfaces:**
- Consumes: `getTopUnrestLever` (Task 1), `unrestRecommendationCopy` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `tests/ui/city-overview-panel.test.ts`, add a describe block:

```ts
describe('city overview panel — #919 MR3 top-lever line', () => {
  it('an unrest city renders exactly one top-lever line with the expected copy for its kind', () => {
    const container = document.createElement('div');
    // 12 cities for the current player, city-1 in unrest, era 2, no magistracy → research-magistracy lever.
    const state = /* makeFixtureState: 12 owned cities, city-1 unrestLevel:1, civ techState.completed
                     = ['tribal-council','code-of-laws'], era resolves to 2 */;
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const row = container.querySelector('[data-city-row="city-1"]')!;
    const levers = row.querySelectorAll('[data-top-lever]');
    expect(levers).toHaveLength(1);
    expect(levers[0].textContent).toMatch(/Magistracy/);
    expect(levers[0].textContent).toMatch(/Tech screen/);
  });

  it('a calm city renders no top-lever line', () => {
    const container = document.createElement('div');
    const state = /* makeFixtureState: city-1 unrestLevel:0 */;
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    expect(container.querySelectorAll('[data-top-lever]')).toHaveLength(0);
  });

  it('the top-lever line is computed for state.currentPlayer (hot-seat: correct when player 2 is active)', () => {
    const container = document.createElement('div');
    // Two civs; player-2 owns the wide unrest empire and is currentPlayer.
    const state = /* makeFixtureState({ currentPlayer: 'player-2', cities: [...12 owned by player-2, one at war...] }) */;
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const lever = container.querySelector('[data-top-lever]');
    expect(lever).not.toBeNull();
    expect(lever!.textContent!.length).toBeGreaterThan(0);
  });

  it('uses textContent — the line has no child elements from string interpolation', () => {
    const container = document.createElement('div');
    const state = /* unrest city */;
    createCityOverviewPanel(container, state, { onOpenCity: vi.fn(), onAppeaseFaction: vi.fn(), onConcedeToMovement: vi.fn(), onClose: vi.fn() });
    const lever = container.querySelector('[data-top-lever]')!;
    expect(lever.children).toHaveLength(0);
  });
});
```

Fill the fixture states from the file's existing `makeFixtureState` (it already accepts `cities`, `currentPlayer`, `civGold`). You will need the fixture civ's `techState.completed` set — extend `makeFixtureState` to accept a `completed?: string[]` and thread it onto the per-owner civ object (default to a broad era-2 set). Position the 12 cities so `getUnrestPressureBreakdown` yields an `Empire overextension` row (12 cities ⇒ `(12-6)*3 = 18`).

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-overview-panel.test.ts -t "#919 MR3"`
Expected: FAIL — no `[data-top-lever]` element.

- [ ] **Step 3: Add the line**

In `src/ui/city-overview-panel.ts`:

Imports (top of file):
```ts
import { getTopUnrestLever } from '@/systems/unrest-guidance';
import { unrestRecommendationCopy } from '@/ui/unrest-guidance-copy';
```

In `renderCityRow`, inside `if (city.unrestLevel > 0) {`, immediately before `const actions = document.createElement('div');`:
```ts
      const lever = getTopUnrestLever(city.id, state);
      if (lever) {
        const { icon, text } = unrestRecommendationCopy(lever);
        const leverLine = document.createElement('div');
        leverLine.dataset.topLever = lever.kind;
        leverLine.style.cssText = `margin-top:8px;font-size:12px;color:${lever.availability === 'now' ? '#cfe6ff' : 'rgba(255,255,255,0.6)'};`;
        leverLine.textContent = `${icon} ${text}${lever.availability === 'research-first' ? '  (research first)' : ''}`;
        row.appendChild(leverLine);
      }
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-overview-panel.test.ts`
Expected: PASS (existing tests + new). If an existing test that counts elements in a row breaks, it is because the new line is a legitimate addition — update that assertion, do not remove the line.

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-overview-panel.ts tests/ui/city-overview-panel.test.ts
git commit -m "feat(#919): MR3 cities-overview top-lever line

Part of #919. One plain-language 'do this next' line per unrest city,
above Appease/Concede, greyed when the lever needs research first.
textContent only; computed for state.currentPlayer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Per-city panel — recommendation sub-line per positive row

**Files:**
- Modify: `src/ui/city-panel.ts` (unrest section HTML build ~`:346-363`; populate phase ~`:1250-1254`)
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `getUnrestRecommendations` (Task 1), `unrestRecommendationCopy` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `tests/ui/city-panel.test.ts`, add:

```ts
describe('city panel — #919 MR3 unrest recommendations', () => {
  it('renders a recommendation sub-line for each positive pressure row', () => {
    const container = document.createElement('div');
    const state = /* fixture: city in unrest with an Empire overextension row + a War weariness row */;
    createCityPanel(container, state.cities['city-1'], state, callbacks, 'list');
    const subs = container.querySelectorAll('[data-recommendation-row]');
    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(Array.from(subs).map(s => s.textContent).join(' ')).toMatch(/→/);
  });

  it('greys the sub-line when availability !== "now"', () => {
    const container = document.createElement('div');
    const state = /* city with Empire overextension, era 2, code-of-laws done, magistracy not → research-first */;
    createCityPanel(container, state.cities['city-1'], state, callbacks, 'list');
    const sub = Array.from(container.querySelectorAll('[data-recommendation-row]'))
      .find(s => /Magistracy/.test(s.textContent ?? ''))! as HTMLElement;
    expect(sub.style.opacity === '0.6' || sub.style.color.includes('rgba')).toBe(true);
    expect(sub.dataset.availability).toBe('research-first');
  });

  it('no innerHTML with generated strings — sub-lines are plain text nodes', () => {
    const container = document.createElement('div');
    const state = /* unrest city */;
    createCityPanel(container, state.cities['city-1'], state, callbacks, 'list');
    for (const sub of container.querySelectorAll('[data-recommendation-row]')) {
      expect(sub.children).toHaveLength(0);
    }
  });

  it('a calm city renders no recommendation sub-lines', () => {
    const container = document.createElement('div');
    const state = /* city-1 unrestLevel 0 */;
    createCityPanel(container, state.cities['city-1'], state, callbacks, 'list');
    expect(container.querySelectorAll('[data-recommendation-row]')).toHaveLength(0);
  });
});
```

Reuse the file's existing city-panel fixture/`callbacks` setup (grep for `createCityPanel(` in that test file for the established pattern).

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts -t "#919 MR3"`
Expected: FAIL — no `[data-recommendation-row]`.

- [ ] **Step 3: Add the sub-lines**

In `src/ui/city-panel.ts`:

Imports:
```ts
import { getUnrestRecommendations } from '@/systems/unrest-guidance';
import { unrestRecommendationCopy } from '@/ui/unrest-guidance-copy';
```

Replace the `pressureRowsHtml` build (`:349-351`) so each row div is followed by its matching recommendation placeholders. Compute recommendations once:
```ts
  const unrestRecommendations = city.unrestLevel > 0
    ? getUnrestRecommendations(city.id, state)
    : [];
  const pressureRowsHtml = pressureBreakdownRows
    .map((row, idx) => {
      const recIdxs = unrestRecommendations
        .map((rec, ri) => ({ rec, ri }))
        .filter(({ rec }) => rec.rowLabel === row.label);
      const subs = recIdxs
        .map(({ ri }) => `<div style="font-size:11px;margin-left:10px;" data-recommendation-row="${ri}"></div>`)
        .join('');
      return `<div style="font-size:11px;opacity:0.85;" data-pressure-row="${idx}"></div>${subs}`;
    })
    .join('');
  // Fallback / empty-state recommendations (rowLabel === '') render once under the list.
  const fallbackRecsHtml = unrestRecommendations
    .map((rec, ri) => rec.rowLabel === '' ? `<div style="font-size:11px;margin-left:10px;" data-recommendation-row="${ri}"></div>` : '')
    .join('');
```
Insert `${fallbackRecsHtml}` right after `${pressureRowsHtml}` in the section markup (`:357`).

In the populate phase, right after the existing `pressureBreakdownRows.forEach(...)` block (`:1251-1254`):
```ts
  unrestRecommendations.forEach((rec, ri) => {
    const el = panel.querySelector(`[data-recommendation-row="${ri}"]`);
    if (!el) return;
    const { icon, text } = unrestRecommendationCopy(rec);
    (el as HTMLElement).dataset.availability = rec.availability;
    if (rec.availability !== 'now') (el as HTMLElement).style.opacity = '0.6';
    el.textContent = `→ ${icon} ${text}`;
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(#919): MR3 per-city panel unrest recommendation sub-lines

Part of #919. Under each positive pressure-breakdown row, a '→ {advice}'
sub-line from getUnrestRecommendations, greyed when it needs research
first. Empty-state recs (luxury / happiness building / appease fallback)
render once beneath the list. textContent only.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Advisor + notification honesty fix

**Files:**
- Modify: `src/ui/advisor-system.ts` (`AdvisorMessage.message` type `:31`; consume sites `:797`, `:804`; `chancellor_unrest_warning` `:254-261`)
- Modify: `src/ui/notification-routing.ts` (line 118 `faction:unrest-started`; line 462 Era-2 onset)
- Test: `tests/ui/advisor-system.test.ts` (or wherever advisor triggers are tested), `tests/ui/notification-routing.test.ts`

**Interfaces:**
- Consumes: `resolveCivilizationEra` (`tech-definitions.ts`), `REVOLT_UNREST_TURNS` (already imported in notification-routing).

- [ ] **Step 1: Write the failing tests**

Find the existing advisor + notification-routing test files (`grep -rl "chancellor_unrest\|faction:unrest-started\|Era 2 begins" tests/`). Add:

```ts
// notification-routing:
it('#919 MR3: the unrest-started notification does not promise happiness improvements before that tech exists', () => {
  // era-2 civ, no philosophy → the message must not contain "happiness improvements"
  const msgs = /* route a faction:unrest-started event for an era-2 civ */;
  expect(msgs.join(' ')).not.toMatch(/happiness improvement/i);
  expect(msgs.join(' ')).toMatch(/garrison|appease|courthouse/i);
});

it('#919 MR3: an era-3 civ with philosophy DOES get happiness-building advice', () => {
  const msgs = /* route the same event for an era-3 civ with philosophy */;
  expect(msgs.join(' ')).toMatch(/happiness/i);
});

it('#919 MR3: the Era-2 onset message names only era-appropriate levers', () => {
  const msg = /* the Era 2 begins notification text */;
  expect(msg).not.toMatch(/happiness improvement/i);
});

// advisor-system:
it('#919 MR3: chancellor_unrest_warning mentions the Courthouse once magistracy is researched', () => {
  const state = /* currentPlayer civ has magistracy, one city unrestLevel 1 */;
  const msg = resolveChancellorUnrestMessage(state); // exercise the dynamic message
  expect(msg).toMatch(/courthouse/i);
});
it('#919 MR3: chancellor_unrest_warning does NOT mention the Courthouse before magistracy', () => {
  const state = /* no magistracy, one city unrestLevel 1 */;
  expect(resolveChancellorUnrestMessage(state)).not.toMatch(/courthouse/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/advisor-system.test.ts tests/ui/notification-routing.test.ts -t "#919 MR3"`
Expected: FAIL.

- [ ] **Step 3: Widen `AdvisorMessage.message` and make the unrest one dynamic**

`src/ui/advisor-system.ts`:
- Interface `:31`: `message: string | ((state: GameState) => string);`
- Consume `:797`: `message: typeof msg.message === 'function' ? msg.message(state) : msg.message,`
- Consume `:804`: same.
- `chancellor_unrest_warning` entry: replace `message:` with:
  ```ts
  message: (state: GameState) => {
    const civ = state.civilizations[state.currentPlayer];
    const hasMagistracy = civ?.techState.completed.includes('magistracy') ?? false;
    const courthouseClause = hasMagistracy ? ' Build a Courthouse in your largest or most distant cities.' : '';
    return `Discontent is spreading through one of our cities. Garrison it, end a war, or ease the pressure before unrest hardens into revolt.${courthouseClause}`;
  },
  ```

`src/ui/notification-routing.ts`:
- **Line 118** — replace the literal with era-aware text. In that block `state`, `city`, `appeaseCost` are in scope; add `resolveCivilizationEra` import and:
  ```ts
  const civTechs = state.civilizations[event.owner]?.techState.completed ?? [];
  const hasHappinessBuilding = civTechs.includes('philosophy'); // temple is the first
  const hasMagistracy = civTechs.includes('magistracy');
  const options = [
    'garrison a military unit',
    `spend ${appeaseCost}🪙 to appease`,
    ...(hasMagistracy ? ['build a Courthouse'] : []),
    ...(hasHappinessBuilding ? ['build a happiness building'] : []),
  ];
  sink(event.owner,
    `${city.name} is slipping into unrest. Stabilize within ${REVOLT_UNREST_TURNS} turns or rebels will spawn. Options: ${options.join(', ')}.`,
    'warning');
  ```
- **Line 462** — Era-2 onset. Same treatment; at the moment Era 2 begins `magistracy`/`philosophy` are not yet researched, so the honest list is garrison / appease / luxuries / (Courthouse once you research Magistracy):
  ```ts
  `Era 2 begins — cities can now feel unrest. Overcrowding, distance from your capital, and war all add pressure. Garrison units, spend gold to appease, trade for luxuries, or research Magistracy to build Courthouses.`
  ```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/advisor-system.test.ts tests/ui/notification-routing.test.ts`
Expected: PASS. Run `bash scripts/run-with-mise.sh yarn vitest run tests/systems/description-honesty.test.ts` too — the phrase changes must not trip any denylist.

- [ ] **Step 5: Commit**

```bash
git add src/ui/advisor-system.ts src/ui/notification-routing.ts tests/ui/advisor-system.test.ts tests/ui/notification-routing.test.ts
git commit -m "fix(#919): MR3 advisor + notification unrest honesty

Part of #919. The faction:unrest-started and Era-2-onset notifications no
longer promise 'build happiness improvements' before that tech exists —
the options list is now era-aware (garrison / appease / luxuries /
Courthouse once Magistracy / happiness building from Era 3). Widens
AdvisorMessage.message to allow a (state)=>string form; chancellor_unrest_
warning names the Courthouse only once magistracy is researched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wiring audit, plan-doc sync, full green, finish

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-issue-919-mr3-actionable-unrest-guidance.md` (tick boxes / add status), and the MR3 section of `docs/superpowers/specs/2026-08-29-empire-unrest-guidance-and-scaling-design.md` if it carries phase annotations.
- Test: full suite.

- [ ] **Step 1: Dead-computed-data / layering audit**

Confirm every new helper is consumed on a live path:
- `getUnrestRecommendations` → used by `city-panel.ts` (Task 4). ✓
- `getTopUnrestLever` → used by `city-overview-panel.ts` (Task 3). ✓
- `unrestRecommendationCopy` → both panels. ✓
- `unrest-guidance.ts` exports no display strings (grep the file for quoted sentences — only `kind` literals and `techId`/label constants allowed). ✓
- `city-overview-panel.ts` and `city-panel.ts` still compute for `state.currentPlayer` / `city.owner`, never `cities[0]` (the `check-src-edit` hook enforces this — treat any feedback as a required fix).

- [ ] **Step 2: Run the full pacing/econ-adjacent nets** (guidance is read-only, so this is a sanity check, not expected to move anything)

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts tests/ui/city-panel.test.ts tests/ui/city-overview-panel.test.ts tests/systems/unrest-guidance.test.ts tests/ui/unrest-guidance-copy.test.ts`
Expected: all PASS.

- [ ] **Step 3: Full gate**

Run: `bash scripts/run-with-mise.sh yarn build` — expect exit 0 (only `tsc` path; fix any type error).
Run: `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
Run: `bash scripts/run-with-mise.sh yarn test:durable` then `... yarn test:durable:status` — durable evidence for the current HEAD.

- [ ] **Step 4: Sync plan/spec docs**

Tick this plan's checkboxes. In the spec's MR3 section, add `✅ merged (#PR)` to the `## MR3 — Actionable unrest guidance` header once the PR number is known (do it in the PR that merges, per `.claude/rules/spec-fidelity.md`).

- [ ] **Step 5: `git diff --check`, commit doc sync**

```bash
git diff --check
git add docs/superpowers/plans/2026-08-30-issue-919-mr3-actionable-unrest-guidance.md docs/superpowers/specs/2026-08-29-empire-unrest-guidance-and-scaling-design.md
git commit -m "docs(#919): MR3 sync plan + spec status

Part of #919.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Finish the branch**

Rebase on `origin/main`, re-run `yarn build` + `yarn test` if anything came down. Assemble the PR body per `.claude/rules/incremental-mr-completion.md`:
- **Title:** `feat(#919): MR3 — actionable unrest guidance (recommendations + advisor honesty)`
- **Spec deviations:** the 3-item list at the top of this plan.
- **Player-visible surfaces:** (1) the cities-overview top-lever line, (2) the per-city panel recommendation sub-lines, (3) the reworded unrest-started + Era-2-onset notifications + Courthouse-aware chancellor advice. All read-only text pointing at actions that exist; no dead-end UX.
- **Out of scope:** the deferred administration-ladder rungs and the war-weariness / occupation arc (unchanged from MR2's roadmap); no new AI behavior (`unrest-guidance.ts` is a pure read the AI *could* reuse later — noted, not wired).
- **"Part of #919"** unless the user says to close the issue. Trailer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Then `superpowers:finishing-a-development-branch` → present merge/PR options. For MR1/MR2 the user chose: rebase-merge with `--admin` after CI is green.

---

## Self-Review

**Spec coverage:**
- §3.1 shared string-free helper, table-driven resolver, all row→kind mappings, `getTopUnrestLever` ordering rules → Task 1. ✅
- §3.2 cities overview top-lever line, `textContent`, `currentPlayer`, calm city renders none → Task 3. ✅
- §3.3 per-city panel sub-line per row, greyed when not `now`, no `innerHTML`, panel re-renders via existing path → Task 4. ✅
- §3.4 advisor + notification honesty, era-aware, no happiness promise before the tech → Task 5. ✅
- MR3 tests (row→kind, both negatives, garrison flip, `getTopUnrestLever` three cases, courthoused-vs-not, overview copy + hot-seat, panel sub-line + greyed + no-innerHTML, advisor era-gating) → Tasks 1/3/4/5. ✅

**Placeholder scan:** the UI test fixtures in Tasks 3–5 are described (`/* ... */`) rather than fully written because they must be built on each test file's existing fixture builder, which the implementer has in front of them; all non-test code is given in full. The implementer must replace every `/* ... */` with a real fixture — no `/* ... */` may survive into a commit.

**Type consistency:** `UnrestRecommendation` / `UnrestRecommendationKind` identical across Tasks 1–5. `unrestRecommendationCopy(rec): { icon, text }` consistent in Tasks 2/3/4. `getTopUnrestLever` returns `UnrestRecommendation | null`; both panels null-check. `AdvisorMessage.message` widened once (Task 5) with both consume sites updated.

**Layering (review defect B3 / `.claude/rules/ui-panels.md`):** `unrest-guidance.ts` contains zero display strings (only `kind` enum literals + tech-id/label constants); every player-visible sentence lives in `unrest-guidance-copy.ts`. Task 6 Step 1 grep-verifies this.
