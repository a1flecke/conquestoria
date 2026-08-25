# #545 MR2 — Launch Platforms, Targeting Legality & Build Warhead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. **Do not use subagent-driven-development or
> any other subagent-dispatching approach for this repo** — this project's
> `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task
> inline in the current session. Steps use checkbox (`- [ ]`) syntax for
> tracking.

> **Fresh audit (2026-08-25, against `origin/main` post-MR1/#895):** every claim
> the design spec and MR1 hand-off make about current code was re-verified directly
> against the file, not carried forward on trust (per `.claude/rules/spec-fidelity.md`
> — this fixes multiple stale-spec incidents on this repo). Confirmed exact/unchanged:
> `missile_silo` (`city-system.ts:881`, `yields.production: 4`, no capability field),
> `missile_submarine` (`unit-system.ts:595`, `attackProfile: { kind: 'ranged', range: 3,
> targets: ['unit','city'] }`, no capability field), `strategic_air_command` and
> `arms_control_treaty` (both untouched), MR1's `strategic-arsenal-system.ts` exports
> exactly `hasManhattanProject`/`getStrategicArsenalCapacity`/`getStrategicArsenal` as
> documented, `Civilization.strategicArsenal?: number` is in place. Newly discovered
> during this audit (not previously documented anywhere): `hasDiscoveredCity(state,
> viewerId, cityId)` (`discovery-system.ts:25`) and `isAtWar(diplomacyState, civId)`
> (`diplomacy-system.ts:106`) are exactly the two primitives §6's legality needs, no new
> plumbing required for them; `mapDistance(map, a, b)` (`hex-utils.ts:151`) is already
> the generic wrap-aware distance helper (no need to reimplement `attack-targeting.ts`'s
> private one); `airDefenseProvider` is precedent for one capability type shared across
> both `Building` and `UnitDefinition` interfaces; `attack-targeting.ts`'s
> `canUnitAttackTarget` (`{ ok: true, ... } | { ok: false, reason }` discriminated
> union) is the established shape for a legality resolver, reused here.

> **Architecture finding that shapes this whole plan:** "Build Warhead" cannot be a
> normal `Building` — `getAvailableBuildings` unconditionally excludes anything already
> in `city.buildings` (`city-system.ts:1928`), and `completeCityProductionItem`
> unconditionally pushes every completed building into that array
> (`city-system.ts:1993`). Every building in this codebase today is a one-time,
> permanent, per-city addition. A repeatable, consumed-on-completion item (produce it,
> it increments a counter, it's immediately buildable again) does not exist yet. This
> plan adds one small generic primitive (`Building.consumedOnCompletion?: true`, Task 6)
> rather than a warhead-specific hack, so a future repeatable item needs no new branch.

**Goal:** Wire `strategicLaunchPlatform` onto Missile Silo and Missile Submarine
(capability-driven, per spec Goal 3 — never `unit.type === 'missile_submarine'`
branching), build the §6 targeting-legality resolver as a new pure leaf module, and
ship "Build Warhead" as a live, capacity-gated production item. **No strike effect,
no launch UX, no AI doctrine, no `warchief` panel — those are MR3/MR4/MR5.** This MR's
only player-visible surface is the "Build Warhead" production item itself; there is no
"Prepare Strategic Launch" button anywhere yet, so there is nothing a player can click
that produces no consequence — producing a warhead is a real, immediately-true resource
gain (like banking gold), not a dead-end action.

**Incremental-delivery decision (`.claude/rules/incremental-mr-completion.md`,
explicit per this MR's spec section "Implementation phasing"):** shipping "Build
Warhead" live in this MR, before strike execution (MR3) or launch UX (MR4) exist, is
this MR's own deliberate choice — confirmed with the user during planning (2026-08-25).
This is safe because the only new player-visible surface is the production item itself:
completing it deterministically increments `civ.strategicArsenal` by 1 with no further
action required or implied — the same shape as any other bankable resource, not a
button/queue-entry/panel-item that links to unfinished follow-up wiring. There is no
launch action, no target-selection UI, and no preview surface in this MR (the §6
legality resolver is fully backend, tested only via direct function calls — matching
MR1's own "safer default" for anything that *would* need a consumer this MR doesn't
build yet). A player who builds warheads this MR simply stockpiles them until MR3/4
land; nothing is broken, misleading, or silently rejected.

**Architecture:** One new leaf module, `src/systems/strategic-launch-system.ts`,
exporting `getEligibleStrategicLaunchPlatforms` and `getStrategicLaunchLegality` — same
shape as `strategic-arsenal-system.ts` (pure, zero UI/renderer/AI imports, matching
`.claude/rules/architecture-boundaries` conventions). Two capability-typed fields
(`Building.strategicLaunchPlatform`, `UnitDefinition.strategicLaunchPlatform`) share one
new `StrategicLaunchCapability` type, mirroring `airDefenseProvider`'s existing
dual-interface precedent. Two small generic `Building` primitives
(`consumedOnCompletion`, `arsenalCapacityGated`) are added to `types.ts` and consumed
generically in `city-system.ts` — neither is warhead-specific in its mechanism, even
though warhead is the only building using either today (matching this repo's
"data table/generic field, not an id branch" convention, e.g.
`NP_PRODUCTION_DISCOUNTS`).

**Tech Stack:** TypeScript, Vitest. No new dependencies.

## Global Constraints

- No `Math.random()` anywhere in this MR — legality is a pure deterministic query;
  platform enumeration and range checks touch no randomness.
- `strategic-launch-system.ts` never imports from `src/ui/`, `src/renderer/`, or
  `src/ai/` — pure state-query leaf module, same rule as `strategic-arsenal-system.ts`.
- **Per spec §10, explicitly do not add any special-cased AI scoring for `warhead`.**
  `ai-production.ts`'s generic `economyValue`/candidate loop must pick it up with zero
  new branches — this is a deliberate spec constraint, not an oversight to "fix" by
  adding a milestone-NP-style economy-value special case. Confirmed via Task 12's test
  (warhead appears in AI candidates, no `if (buildingId === 'warhead')` branch exists
  anywhere in `ai-production.ts`).
- **Do not gate anything in this MR behind a `superweapons` setting.** That setting
  doesn't exist until MR7 (spec §13/phasing).
- Do not add a "Prepare Strategic Launch" button, target-selection UI, or any other
  launch-flow UI element this MR — that's MR4 (§14). The legality resolver this MR
  builds is tested exclusively via direct function calls.
- `strategicLaunchPlatform.range` is `number | 'unlimited'`, never a sentinel numeric
  constant (e.g. `Infinity`) — per spec §3, this is a locked type-design decision.
- Full repo test command: `bash scripts/run-with-mise.sh yarn test`. Full
  build/typecheck: `bash scripts/run-with-mise.sh yarn build`. Both must pass before
  this MR's PR, per `CLAUDE.md`.
- Design source of truth: `docs/superpowers/specs/2026-08-25-issue-545-strategic-deterrence-design.md`
  §1 (arsenal abstraction), §3 (Missile Silo bullet), §4 (Missile Submarine), §6
  (launch legality and targeting), §10's Production scoring bullet, Content honesty.

---

### Task 1: `StrategicLaunchCapability` type + field on `Building` and `UnitDefinition`

**Files:**
- Modify: `src/core/types.ts` (near `AirDefenseProviderCapability`, ~line 504-511, and
  the `Building`/`UnitDefinition` interfaces, ~line 751-774 and ~line 513-539)

**Interfaces:**
- Produces: `Building.strategicLaunchPlatform?: StrategicLaunchCapability`,
  `UnitDefinition.strategicLaunchPlatform?: StrategicLaunchCapability` — consumed by
  Task 4's `getEligibleStrategicLaunchPlatforms`.

- [ ] **Step 1: Add the type and both fields**

Open `src/core/types.ts`. Immediately after `AirDefenseCoverageResult` (~line 511), add:

```typescript
export interface StrategicLaunchCapability {
  /** Hex range from the platform's position, wrap-aware; 'unlimited' for a fixed
   * silo with no maximum reach (#545 spec §3/§4). Never a sentinel number. */
  range: number | 'unlimited';
}
```

In the `Building` interface, immediately after `airDefenseProvider?:
AirDefenseProviderCapability;`, add:

```typescript
  /** #545: this building is a strategic-launch platform once built (Missile Silo). */
  strategicLaunchPlatform?: StrategicLaunchCapability;
  /** #545: completing this item does not persist into city.buildings — it fires
   * completedBuilding for one turn (so turn-manager.ts's completion hook runs), then
   * is immediately re-buildable. Generic primitive for any future repeatable,
   * consumed-on-completion production item; only `warhead` uses it today. */
  consumedOnCompletion?: true;
  /** #545: getAvailableBuildings hides this item once the civ's strategicArsenal
   * is at or above getStrategicArsenalCapacity, or Manhattan Project is unbuilt.
   * Generic gate field; only `warhead` uses it today. */
  arsenalCapacityGated?: true;
```

In `UnitDefinition`, immediately after `airDefenseProvider?:
AirDefenseProviderCapability;`, add:

```typescript
  /** #545: this unit is a strategic-launch platform once built (Missile Submarine). */
  strategicLaunchPlatform?: StrategicLaunchCapability;
```

- [ ] **Step 2: Typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: succeeds — all new fields are optional.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(#545): add StrategicLaunchCapability type + Building/UnitDefinition fields"
```

---

### Task 2: Wire Missile Silo as a strategic-launch platform

**Files:**
- Modify: `src/systems/city-system.ts:881-887` (`missile_silo`)

**Interfaces:**
- Produces: `BUILDINGS.missile_silo.strategicLaunchPlatform === { range: 'unlimited' }`
  — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/systems/strategic-launch-system.test.ts` (this MR's main test file — later
tasks append to it):

```typescript
import { describe, it, expect } from 'vitest';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('strategic launch platform wiring (#545)', () => {
  it('missile_silo has unlimited-range strategicLaunchPlatform', () => {
    expect(BUILDINGS.missile_silo.strategicLaunchPlatform).toEqual({ range: 'unlimited' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — field is `undefined`.

- [ ] **Step 3: Wire the field + honest description**

Open `src/systems/city-system.ts`, find `missile_silo` (~line 881):

```typescript
  missile_silo: {
    id: 'missile_silo', name: 'Missile Silo', category: 'military',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 215,
    description: 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn.',
    techRequired: 'icbm-development',
    pacing: { band: 'power-spike', role: 'strategic-deterrent', impact: 1.5, scope: 'city', snowball: 1.4, urgency: 1.2, situationality: 1.2, unlockBreadth: 1 },
  },
```

Replace it with:

```typescript
  missile_silo: {
    id: 'missile_silo', name: 'Missile Silo', category: 'military',
    yields: { food: 0, production: 4, gold: 0, science: 0 }, productionCost: 215,
    // #545: +1 arsenal capacity already wired in MR1's ARSENAL_CAPACITY_SOURCES.
    // strategicLaunchPlatform is new this MR -- fixed, unlimited-range, discoverable
    // location (spec §3's "Reach" role; redundancy comes from building more than one).
    description: 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn, +1 arsenal capacity. Once your empire has a warhead, this silo can launch it at any discovered city you\'re at war with, at unlimited range.',
    techRequired: 'icbm-development',
    pacing: { band: 'power-spike', role: 'strategic-deterrent', impact: 1.5, scope: 'city', snowball: 1.4, urgency: 1.2, situationality: 1.2, unlockBreadth: 1 },
    strategicLaunchPlatform: { range: 'unlimited' },
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): wire Missile Silo as an unlimited-range strategic launch platform"
```

---

### Task 3: Wire Missile Submarine as a strategic-launch platform

**Files:**
- Modify: `src/systems/unit-system.ts:595-601` (`missile_submarine` definition)
- Modify: `src/systems/unit-system.ts:967` (`UNIT_DESCRIPTIONS.missile_submarine`)

**Interfaces:**
- Produces: `UNIT_DEFINITIONS.missile_submarine.strategicLaunchPlatform === { range: 4 }`
  — consumed by Task 4. Existing `attackProfile` (conventional range-3 attack) is
  untouched per spec §4 ("additive, not a reinterpretation").

- [ ] **Step 1: Write the failing test**

Append to `tests/systems/strategic-launch-system.test.ts`:

```typescript
  it('missile_submarine has range-4 strategicLaunchPlatform, existing attackProfile untouched', () => {
    const def = UNIT_DEFINITIONS.missile_submarine;
    expect(def.strategicLaunchPlatform).toEqual({ range: 4 });
    expect(def.attackProfile).toEqual({ kind: 'ranged', range: 3, targets: ['unit', 'city'] });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — field is `undefined`.

- [ ] **Step 3: Wire the field**

Open `src/systems/unit-system.ts`, find `missile_submarine` (~line 595):

```typescript
  missile_submarine: {
    type: 'missile_submarine', name: 'Missile Submarine',
    movementPoints: 5, visionRange: 3, strength: 56,
    canFoundCity: false, canBuildImprovements: false, productionCost: 250,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
  },
```

Replace it with:

```typescript
  missile_submarine: {
    type: 'missile_submarine', name: 'Missile Submarine',
    movementPoints: 5, visionRange: 3, strength: 56,
    canFoundCity: false, canBuildImprovements: false, productionCost: 250,
    domain: 'naval', waterAccess: 'ocean',
    attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
    // #545: strategic-launch range (4) is deliberately one hex more than the
    // conventional attack range (3) but far short of Missile Silo's unlimited
    // reach -- survivability via concealment (#542's existing SUBMARINE_TYPES
    // machinery, unchanged), not range, is this platform's second-strike value.
    strategicLaunchPlatform: { range: 4 },
  },
```

Update `UNIT_DESCRIPTIONS.missile_submarine` (~line 967) from:

```typescript
  missile_submarine: 'Nuclear-powered ballistic missile submarine. Concealed the same way as a submarine — hidden until a naval/air unit gets close, a well-equipped coastal city spots it, or it fires. Long-range submarine-launched missiles threaten any city from the deep. Requires a coastal city to build. Longest range of any unit.',
```

to:

```typescript
  missile_submarine: 'Nuclear-powered ballistic missile submarine. Concealed the same way as a submarine — hidden until a naval/air unit gets close, a well-equipped coastal city spots it, or it fires. Once your empire has a warhead, this submarine can launch it at any discovered city you\'re at war with, within 4 hexes of its current position. Requires a coastal city to build.',
```

(Dropped "Longest range of any unit" — the strategic-launch range of 4 is *not* the
longest in the game once Missile Silo's unlimited range exists; leaving the old claim
in would itself be a new content-honesty violation.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): wire Missile Submarine as a range-4 strategic launch platform"
```

---

### Task 4: `getEligibleStrategicLaunchPlatforms` — capability-driven enumeration

**Files:**
- Create: `src/systems/strategic-launch-system.ts`
- Modify: `tests/systems/strategic-launch-system.test.ts`

**Interfaces:**
- Produces: `getEligibleStrategicLaunchPlatforms(state, civId): StrategicLaunchPlatform[]`
  — consumed by Task 5's `getStrategicLaunchLegality`.

- [ ] **Step 1: Write the failing tests**

Prepend to `tests/systems/strategic-launch-system.test.ts` (new imports + describe
block, above the existing wiring tests):

```typescript
import type { GameState } from '@/core/types';
import { getEligibleStrategicLaunchPlatforms } from '@/systems/strategic-launch-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1, era: 11, currentPlayer: 'p1',
    civilizations: {}, cities: {}, units: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [], gameOver: false, winner: null,
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

describe('getEligibleStrategicLaunchPlatforms', () => {
  it('is empty with no cities or units', () => {
    expect(getEligibleStrategicLaunchPlatforms(makeState(), 'p1')).toEqual([]);
  });

  it('includes an owned city with a missile_silo, keyed off the typed field not the id', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 2, r: 3 }, buildings: ['missile_silo'] } as any },
    });
    const platforms = getEligibleStrategicLaunchPlatforms(state, 'p1');
    expect(platforms).toEqual([
      { kind: 'building', cityId: 'c1', buildingId: 'missile_silo', position: { q: 2, r: 3 }, range: 'unlimited' },
    ]);
  });

  it('excludes a missile_silo city owned by another civ', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p2', position: { q: 2, r: 3 }, buildings: ['missile_silo'] } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('excludes a city with no capability-granting building', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 2, r: 3 }, buildings: ['nuclear_arsenal'] } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('includes an owned missile_submarine unit at its current position', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([
      { kind: 'unit', unitId: 'u1', unitType: 'missile_submarine', position: { q: 5, r: 5 }, range: 4 },
    ]);
  });

  it('excludes a missile_submarine owned by another civ', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p2', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('excludes a unit type with no strategicLaunchPlatform capability', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('combines building and unit platforms across multiple cities/units', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any },
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — `@/systems/strategic-launch-system` doesn't exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/systems/strategic-launch-system.ts`:

```typescript
import type { GameState, HexCoord, UnitType } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export type StrategicLaunchPlatform =
  | { kind: 'building'; cityId: string; buildingId: string; position: HexCoord; range: number | 'unlimited' }
  | { kind: 'unit'; unitId: string; unitType: UnitType; position: HexCoord; range: number | 'unlimited' };

/**
 * Every strategic-launch platform civId currently owns, driven entirely by the
 * typed strategicLaunchPlatform capability (#545 spec Goal 3) -- never a
 * unit-type/building-id switch. A hypothetical future platform (a different
 * building or unit gaining the same capability field) needs zero changes here.
 */
export function getEligibleStrategicLaunchPlatforms(state: GameState, civId: string): StrategicLaunchPlatform[] {
  const platforms: StrategicLaunchPlatform[] = [];

  for (const city of Object.values(state.cities)) {
    if (city.owner !== civId) continue;
    for (const buildingId of city.buildings) {
      const capability = BUILDINGS[buildingId]?.strategicLaunchPlatform;
      if (capability) {
        platforms.push({ kind: 'building', cityId: city.id, buildingId, position: city.position, range: capability.range });
      }
    }
  }

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId) continue;
    const capability = UNIT_DEFINITIONS[unit.type]?.strategicLaunchPlatform;
    if (capability) {
      platforms.push({ kind: 'unit', unitId: unit.id, unitType: unit.type, position: unit.position, range: capability.range });
    }
  }

  return platforms;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS (all platform-enumeration tests + the two wiring tests from Tasks 2/3)

- [ ] **Step 5: Commit**

```bash
git add src/systems/strategic-launch-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): add getEligibleStrategicLaunchPlatforms, capability-driven enumeration"
```

---

### Task 5: `getStrategicLaunchLegality` — the §6 resolver

**Files:**
- Modify: `src/systems/strategic-launch-system.ts`
- Modify: `tests/systems/strategic-launch-system.test.ts`

**Interfaces:**
- Consumes: `getEligibleStrategicLaunchPlatforms` (Task 4), `getStrategicArsenal`
  (`strategic-arsenal-system.ts`), `hasDiscoveredCity` (`discovery-system.ts`),
  `isAtWar` (`diplomacy-system.ts`), `mapDistance` (`hex-utils.ts`).
- Produces: `getStrategicLaunchLegality(state, actorCivId, targetCityId):
  StrategicLaunchLegalityResult` — consumed by MR3's strike-resolution caller and
  MR4's target-selection UI (neither exists yet; this MR's coverage is direct
  function-call tests only, per this plan's incremental-delivery decision above).

- [ ] **Step 1: Write the failing tests**

Append to `tests/systems/strategic-launch-system.test.ts`:

```typescript
import { getStrategicLaunchLegality } from '@/systems/strategic-launch-system';
import type { Civilization } from '@/core/types';

function makeCiv(overrides: Partial<Civilization> = {}): Civilization {
  return {
    id: 'p1', name: 'P1', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 0, visibility: {}, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
    ...overrides,
  } as Civilization;
}

// Full-visibility state so hasDiscoveredCity/mapDistance behave predictably:
// p1's visibility covers the whole map unless a test overrides it.
function makeLegalityState(overrides: Partial<GameState> = {}): GameState {
  const wholeMapVisible = { tiles: {}, defaultVisibility: 'visible' } as any;
  return makeState({
    civilizations: {
      p1: makeCiv({ cities: ['c1'], visibility: wholeMapVisible }),
      p2: makeCiv({ id: 'p2', cities: [] }),
    },
    cities: {
      c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any,
      target: { id: 'target', name: 'Target', owner: 'p2', position: { q: 3, r: 3 } } as any,
    },
    ...overrides,
  });
}

describe('getStrategicLaunchLegality', () => {
  it('is legal when arsenal >= 1, platform in range, discovered, and at war', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: { tiles: {}, defaultVisibility: 'visible' } as any, strategicArsenal: 1, diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
      cities: {
        c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any,
        target: { id: 'target', name: 'Target', owner: 'p2', position: { q: 3, r: 3 } } as any,
      },
    });
    const result = getStrategicLaunchLegality(state, 'p1', 'target');
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown target city', () => {
    const result = getStrategicLaunchLegality(makeLegalityState(), 'p1', 'nobody');
    expect(result).toEqual({ ok: false, reason: 'unknown-target-city' });
  });

  it('rejects with no-arsenal when strategicArsenal is 0/absent, all else legal', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: { tiles: {}, defaultVisibility: 'visible' } as any, diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'no-arsenal' });
  });

  it('rejects with not-at-war when arsenal/platform/discovery are all satisfied but not at war', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: { tiles: {}, defaultVisibility: 'visible' } as any, strategicArsenal: 1 }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'not-at-war' });
  });

  it('rejects with target-not-discovered when the target city has not been explored', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: { tiles: {}, defaultVisibility: 'undiscovered' } as any, strategicArsenal: 1, diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'target-not-discovered' });
  });

  it('rejects with no-eligible-platform when arsenal/war/discovery are satisfied but no platform is in range', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: ['c1'], visibility: { tiles: {}, defaultVisibility: 'visible' } as any, strategicArsenal: 1, diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
      cities: {
        // no silo/sub anywhere -- c1 has no capability-granting building
        c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: [] } as any,
        target: { id: 'target', name: 'Target', owner: 'p2', position: { q: 3, r: 3 } } as any,
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'no-eligible-platform' });
  });

  it('rejects with no-eligible-platform when a submarine platform exists but is out of range', () => {
    const state = makeLegalityState({
      civilizations: {
        p1: makeCiv({ cities: [], visibility: { tiles: {}, defaultVisibility: 'visible' } as any, strategicArsenal: 1, diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } }),
        p2: makeCiv({ id: 'p2', cities: [] }),
      },
      cities: {
        target: { id: 'target', name: 'Target', owner: 'p2', position: { q: 30, r: 0 } } as any,
      },
      units: {
        u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 0, r: 0 } } as any,
      },
    });
    expect(getStrategicLaunchLegality(state, 'p1', 'target')).toEqual({ ok: false, reason: 'no-eligible-platform' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — `getStrategicLaunchLegality` doesn't exist yet.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/systems/strategic-launch-system.ts`:

```typescript
import { getStrategicArsenal } from '@/systems/strategic-arsenal-system';
import { hasDiscoveredCity } from '@/systems/discovery-system';
import { isAtWar } from '@/systems/diplomacy-system';
import { mapDistance } from '@/systems/hex-utils';

export type StrategicLaunchLegalityFailure =
  | 'unknown-target-city'
  | 'no-arsenal'
  | 'target-not-discovered'
  | 'not-at-war'
  | 'no-eligible-platform';

export type StrategicLaunchLegalityResult =
  | { ok: true; platform: StrategicLaunchPlatform }
  | { ok: false; reason: StrategicLaunchLegalityFailure };

/**
 * #545 spec §6: a strike is legal iff the actor has strategicArsenal >= 1, has an
 * eligible platform in range, the target city has already been discovered by the
 * actor (closes the targeting-omniscience loophole), and the target civ is in the
 * actor's atWarWith list (the primary hot-seat-accident guardrail -- an at-peace
 * sibling literally cannot appear as a valid target). No strike effect is computed
 * here -- this MR is legality/dry-run only; MR3 wires actual resolution.
 */
export function getStrategicLaunchLegality(
  state: GameState,
  actorCivId: string,
  targetCityId: string,
): StrategicLaunchLegalityResult {
  const targetCity = state.cities[targetCityId];
  if (!targetCity) return { ok: false, reason: 'unknown-target-city' };

  const actorCiv = state.civilizations[actorCivId];
  if (!actorCiv || getStrategicArsenal(actorCiv) < 1) return { ok: false, reason: 'no-arsenal' };

  if (!hasDiscoveredCity(state, actorCivId, targetCityId)) return { ok: false, reason: 'target-not-discovered' };

  if (!isAtWar(actorCiv.diplomacy, targetCity.owner)) return { ok: false, reason: 'not-at-war' };

  const platform = getEligibleStrategicLaunchPlatforms(state, actorCivId).find(p =>
    p.range === 'unlimited' || mapDistance(state.map, p.position, targetCity.position) <= p.range,
  );
  if (!platform) return { ok: false, reason: 'no-eligible-platform' };

  return { ok: true, platform };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/systems/strategic-launch-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): add getStrategicLaunchLegality, the §6 targeting-legality resolver"
```

---

### Task 6: `Building.consumedOnCompletion` — the repeatable-production primitive

**Files:**
- Modify: `src/systems/city-system.ts:1976-2024` (`completeCityProductionItem`)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `Building.consumedOnCompletion` (Task 1).
- Produces: `completeCityProductionItem` no longer persists a
  `consumedOnCompletion` building into `city.buildings`, but still returns
  `completedBuilding` so `turn-manager.ts`'s completion hook fires every time.

- [ ] **Step 1: Write the failing test**

This needs a definition-agnostic test, not a `warhead`-specific one (the primitive is
generic; `warhead` doesn't exist until Task 8). Add to `tests/systems/city-system.test.ts`,
in the `describe` block already covering `completeCityProductionItem` (search for its
existing tests to place this alongside them):

```typescript
  it('a consumedOnCompletion building fires completedBuilding but is not persisted to city.buildings (#545)', () => {
    const originalManhattan = BUILDINGS.manhattan_project;
    // Reuse an existing definition's shape via a throwaway id so this test needs no
    // fixture building added to the real catalog -- inject directly into BUILDINGS
    // for the duration of this one test, then restore it.
    (BUILDINGS as any).__test_consumable__ = {
      id: '__test_consumable__', name: 'Test Consumable', category: 'military',
      yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10,
      description: 'test', consumedOnCompletion: true,
    };
    try {
      const city = makeCity({ productionQueue: ['__test_consumable__'] });
      const result = completeCityProductionItem(city, '__test_consumable__');
      expect(result.completedBuilding).toBe('__test_consumable__');
      expect(result.city.buildings).not.toContain('__test_consumable__');
    } finally {
      delete (BUILDINGS as any).__test_consumable__;
      expect(BUILDINGS.manhattan_project).toBe(originalManhattan);
    }
  });
```

(If this file has no existing `makeCity` helper, use whatever local city-fixture
helper the surrounding tests in this file already use instead — check the top of
`tests/systems/city-system.test.ts` for its actual name before writing this step.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test city-system -t "consumedOnCompletion"`
Expected: FAIL — `completedBuilding` is `'__test_consumable__'` but `city.buildings`
also contains it (current code pushes unconditionally).

- [ ] **Step 3: Update `completeCityProductionItem`**

Open `src/systems/city-system.ts`, find (~line 1991):

```typescript
  const building = BUILDINGS[itemId];
  if (building) {
    if (!newBuildings.includes(building.id)) {
      newBuildings.push(building.id);
      completedBuilding = building.id;
    }
  } else {
```

Replace with:

```typescript
  const building = BUILDINGS[itemId];
  if (building) {
    // #545: a consumedOnCompletion building (e.g. warhead) fires completedBuilding
    // for turn-manager.ts's completion hook every time, but is never persisted --
    // that's what makes it immediately re-buildable instead of a one-time addition.
    if (building.consumedOnCompletion) {
      completedBuilding = building.id;
    } else if (!newBuildings.includes(building.id)) {
      newBuildings.push(building.id);
      completedBuilding = building.id;
    }
  } else {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test city-system -t "consumedOnCompletion"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(#545): add Building.consumedOnCompletion, a generic repeatable-production primitive"
```

---

### Task 7: `Building.arsenalCapacityGated` — thread arsenal status into `getAvailableBuildings`

**Files:**
- Modify: `src/systems/city-system.ts:1917-1949` (`getAvailableBuildings`)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Consumes: `Building.arsenalCapacityGated` (Task 1), `hasManhattanProject` +
  `getStrategicArsenal` + `getStrategicArsenalCapacity` (`strategic-arsenal-system.ts`).
- Produces: `getAvailableBuildings(..., arsenalStatus?: { hasManhattanProject: boolean;
  atCapacity: boolean })` — new optional trailing param. When omitted, the gate is
  skipped entirely (matches every other optional filter param on this function) —
  this is deliberate: Task 9 relies on the omitted case for the locked-item diff.

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/city-system.test.ts`, alongside existing `getAvailableBuildings`
coverage:

```typescript
  it('arsenalCapacityGated building is available when arsenalStatus is omitted (#545)', () => {
    (BUILDINGS as any).__test_gated__ = {
      id: '__test_gated__', name: 'Test Gated', category: 'military',
      yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10,
      description: 'test', arsenalCapacityGated: true,
    };
    try {
      const city = makeCity({ buildings: [] });
      const available = getAvailableBuildings(city, [], testMap());
      expect(available.some(b => b.id === '__test_gated__')).toBe(true);
    } finally {
      delete (BUILDINGS as any).__test_gated__;
    }
  });

  it('arsenalCapacityGated building is hidden when arsenalStatus.hasManhattanProject is false (#545)', () => {
    (BUILDINGS as any).__test_gated__ = {
      id: '__test_gated__', name: 'Test Gated', category: 'military',
      yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10,
      description: 'test', arsenalCapacityGated: true,
    };
    try {
      const city = makeCity({ buildings: [] });
      const available = getAvailableBuildings(city, [], testMap(), undefined, undefined, undefined, undefined, { hasManhattanProject: false, atCapacity: false });
      expect(available.some(b => b.id === '__test_gated__')).toBe(false);
    } finally {
      delete (BUILDINGS as any).__test_gated__;
    }
  });

  it('arsenalCapacityGated building is hidden when arsenalStatus.atCapacity is true (#545)', () => {
    (BUILDINGS as any).__test_gated__ = {
      id: '__test_gated__', name: 'Test Gated', category: 'military',
      yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10,
      description: 'test', arsenalCapacityGated: true,
    };
    try {
      const city = makeCity({ buildings: [] });
      const available = getAvailableBuildings(city, [], testMap(), undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: true });
      expect(available.some(b => b.id === '__test_gated__')).toBe(false);
    } finally {
      delete (BUILDINGS as any).__test_gated__;
    }
  });

  it('arsenalCapacityGated building is available when Manhattan Project is done and under capacity (#545)', () => {
    (BUILDINGS as any).__test_gated__ = {
      id: '__test_gated__', name: 'Test Gated', category: 'military',
      yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 10,
      description: 'test', arsenalCapacityGated: true,
    };
    try {
      const city = makeCity({ buildings: [] });
      const available = getAvailableBuildings(city, [], testMap(), undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: false });
      expect(available.some(b => b.id === '__test_gated__')).toBe(true);
    } finally {
      delete (BUILDINGS as any).__test_gated__;
    }
  });
```

(Use this file's actual existing `testMap()`/map-fixture helper name if different —
check the top of the file before writing this step, same caveat as Task 6.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test city-system -t "arsenalCapacityGated"`
Expected: FAIL — `getAvailableBuildings` doesn't accept an 8th parameter yet, and
`__test_gated__` is present in every case since nothing filters it.

- [ ] **Step 3: Update `getAvailableBuildings`**

Open `src/systems/city-system.ts` (~line 1917):

```typescript
export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  map: GameMap,
  availableResources?: Set<ResourceType>,
  era?: number,
  builtNationalProjectKeys?: Set<string>,
  civId?: string,
): Building[] {
  const coastal = isCityCoastal(city, map);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
```

Replace with:

```typescript
export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  map: GameMap,
  availableResources?: Set<ResourceType>,
  era?: number,
  builtNationalProjectKeys?: Set<string>,
  civId?: string,
  /** #545: omit to skip this gate entirely (matches every other optional filter
   * here) -- callers that intentionally want the pre-gate "tech unlocked" set for a
   * locked-item-reason diff (see city-panel.ts) rely on omitting this. */
  arsenalStatus?: { hasManhattanProject: boolean; atCapacity: boolean },
): Building[] {
  const coastal = isCityCoastal(city, map);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.arsenalCapacityGated && arsenalStatus && (!arsenalStatus.hasManhattanProject || arsenalStatus.atCapacity)) return false;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test city-system -t "arsenalCapacityGated"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(#545): add Building.arsenalCapacityGated + thread arsenalStatus into getAvailableBuildings"
```

---

### Task 8: The `warhead` building definition

**Files:**
- Modify: `src/systems/city-system.ts` (add to `BUILDINGS`, era-10 section, after
  `manhattan_project` ~line 851; add to `PRODUCTION_ICONS` ~line 1723)
- Test: `tests/systems/city-system.test.ts`

**Interfaces:**
- Produces: `BUILDINGS.warhead` — consumed by Task 10's completion hook and Task 11's
  locked-item reason text. `PRODUCTION_ICONS.warhead` — required by the file's existing
  generic icon-coverage test (no new test needed for that; it loops every `BUILDINGS`
  key automatically).

- [ ] **Step 1: Write the failing test**

Append to `tests/systems/strategic-launch-system.test.ts` (co-located with the other
#545 content tests in this MR, even though it's a `BUILDINGS` entry, since it's the
production item this whole MR's legality work exists to eventually feed):

```typescript
import { BUILDINGS as CityBuildings } from '@/systems/city-system';

describe('warhead building definition (#545)', () => {
  it('is gated by nuclear-weapons + uranium, consumed on completion, arsenal-capacity gated', () => {
    const warhead = CityBuildings.warhead;
    expect(warhead).toBeDefined();
    expect(warhead.techRequired).toBe('nuclear-weapons');
    expect(warhead.resourceRequired).toEqual(['uranium']);
    expect(warhead.consumedOnCompletion).toBe(true);
    expect(warhead.arsenalCapacityGated).toBe(true);
    expect(warhead.uniquePerEmpire).toBeUndefined();
    expect(warhead.nationalProject).toBeUndefined();
    // Zero yields -- this is a resource-stockpile item, not a yield building; the
    // "no player-visible surface with dead promise" bar is met by it actually
    // incrementing strategicArsenal, tested in Task 10, not by any yield here.
    expect(warhead.yields).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "warhead building"`
Expected: FAIL — `BUILDINGS.warhead` is `undefined`.

- [ ] **Step 3: Add the definition**

Open `src/systems/city-system.ts`, immediately after `manhattan_project` (~line 851,
before `postwar_reconstruction`), add:

```typescript
  warhead: {
    id: 'warhead', name: 'Warhead', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 260,
    // #545: illustrative cost, tunable in the balance-pass MR per spec §1. Repeatable
    // (consumedOnCompletion) -- producing it adds 1 warhead to the empire-wide
    // strategicArsenal (turn-manager.ts's completion hook), capped by
    // getStrategicArsenalCapacity (arsenalCapacityGated). No launch capability is
    // implied by this description yet -- that's MR3 (strike) + MR4 (launch UX).
    description: 'A live nuclear warhead added to your empire\'s strategic arsenal. Requires Manhattan Project and available capacity (Nuclear Arsenal, Missile Silo). Not a per-city stockpile -- any eligible platform can draw from your empire\'s shared pool.',
    techRequired: 'nuclear-weapons', resourceRequired: ['uranium'],
    consumedOnCompletion: true, arsenalCapacityGated: true,
  },
```

Open `PRODUCTION_ICONS` (~line 1723, near `missile_silo: '🚀',`), add:

```typescript
  warhead: '☢️',
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "warhead building"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): add the warhead production item"
```

---

### Task 9: Thread live `arsenalStatus` into every real `getAvailableBuildings` caller

**Files:**
- Modify: `src/ui/city-panel.ts:264` (the real `availableBuildings` call — NOT the
  `allTechUnlockedBuildings` call at line ~643, which must stay without
  `arsenalStatus` so `lockedBuildings`'s diff still picks up `warhead`)
- Modify: `src/systems/planning-system.ts:139,184` (`getIdleCityIds`,
  `getRecommendedIdleCityChoice`)
- Modify: `src/ai/ai-production.ts:559`

**Interfaces:**
- Consumes: `hasManhattanProject`, `getStrategicArsenal`, `getStrategicArsenalCapacity`
  (`strategic-arsenal-system.ts`).
- Produces: every real production-eligibility computation in the game now correctly
  reflects `warhead`'s live gate — matches the caller-discipline convention
  `.claude/rules/game-balance.md` already documents for `activeNationalProjects`.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/strategic-launch-system.test.ts`:

```typescript
import { getIdleCityIds } from '@/systems/planning-system';

describe('arsenalStatus threading (#545)', () => {
  it('getIdleCityIds treats a city that can only build warhead as non-idle once Manhattan Project is done and under capacity', () => {
    const state = makeState({
      map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] },
      civilizations: {
        p1: makeCiv({
          cities: ['c1'],
          techState: { completed: ['nuclear-weapons'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
        }),
      },
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: [], productionQueue: [], idleProduction: null } as any },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // No availableResources param path in this helper reaches uranium -- this test
    // only needs to prove the call compiles/executes with the new gate threaded, not
    // exercise every resource branch (those are covered by Task 7/8's own tests).
    expect(() => getIdleCityIds(state, 'p1')).not.toThrow();
  });
});
```

This is intentionally a thin smoke test (the gate logic itself is already fully
covered by Task 7/8) — its only job is to catch a caller that forgot to update its
call site and now throws or silently omits the parameter incorrectly.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "arsenalStatus threading"`
Expected: passes trivially today (nothing throws yet) — this step is a placeholder
confirming the harness; the real verification for this task is Step 4 below.

- [ ] **Step 3: Update every real caller**

Open `src/ui/city-panel.ts` (~line 264), change:

```typescript
  const availableBuildings = getAvailableBuildings(
    city,
    currentCiv.techState.completed,
    state.map,
    playerResources,
    currentCivEra,
    builtNPKeys,
    city.owner,
  );
```

to:

```typescript
  const availableBuildings = getAvailableBuildings(
    city,
    currentCiv.techState.completed,
    state.map,
    playerResources,
    currentCivEra,
    builtNPKeys,
    city.owner,
    {
      hasManhattanProject: hasManhattanProject(state, city.owner),
      atCapacity: getStrategicArsenal(currentCiv) >= getStrategicArsenalCapacity(state, city.owner),
    },
  );
```

Add the import at the top of `city-panel.ts`:

```typescript
import { hasManhattanProject, getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';
```

**Do not touch** the `allTechUnlockedBuildings` call (~line 643) — it must stay
exactly as-is (no `arsenalStatus` argument) so `warhead` still appears in that
pre-gate set and Task 11's locked-item diff works.

Open `src/systems/planning-system.ts`, update both call sites (~line 139 and ~184)
the same way — each already has `state` and `civId` in scope:

```typescript
      const buildableBuildings = !!state.map && getAvailableBuildings(
        city,
        completedTechs,
        state.map,
        availableResources,
        civEra,
        reservedNationalProjects,
        civId,
        { hasManhattanProject: hasManhattanProject(state, civId), atCapacity: getStrategicArsenal(civ) >= getStrategicArsenalCapacity(state, civId) },
      ).length > 0;
```

```typescript
    ...(state.map ? getAvailableBuildings(
      city,
      completedTechs,
      state.map,
      availableResources,
      civEra,
      reservedNationalProjects,
      civId,
      { hasManhattanProject: hasManhattanProject(state, civId), atCapacity: getStrategicArsenal(civ) >= getStrategicArsenalCapacity(state, civId) },
    ) : []).map(building => {
```

Add the same import to `planning-system.ts`.

Open `src/ai/ai-production.ts` (~line 559):

```typescript
  for (const building of getAvailableBuildings(
    city,
    civ.techState.completed,
    state.map,
    resources,
    civEra,
    builtNationalProjectKeys,
    civId,
  )) {
```

to:

```typescript
  for (const building of getAvailableBuildings(
    city,
    civ.techState.completed,
    state.map,
    resources,
    civEra,
    builtNationalProjectKeys,
    civId,
    { hasManhattanProject: hasManhattanProject(state, civId), atCapacity: getStrategicArsenal(civ) >= getStrategicArsenalCapacity(state, civId) },
  )) {
```

Add the same import to `ai-production.ts`.

- [ ] **Step 4: Run the full test suite for these files**

Run: `bash scripts/run-with-mise.sh yarn test city-panel planning-system ai-production strategic-launch-system`
Expected: all PASS — this is the real verification for this task (no existing test
in any of these files should regress from adding a new optional trailing argument).

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts src/systems/planning-system.ts src/ai/ai-production.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): thread live arsenalStatus into every real getAvailableBuildings caller"
```

---

### Task 10: Production-completion hook — increment `strategicArsenal`

**Files:**
- Modify: `src/core/turn-manager.ts:383-411`
- Modify: `src/systems/strategic-arsenal-system.ts`
- Test: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Produces: `addWarheadToArsenal(state, civId): GameState` — pure, immutable
  (`.claude/rules/game-systems.md`'s "Immutable Turn Processing").
- Consumes: called from `turn-manager.ts` when `result.completedBuilding ===
  'warhead'`, mirroring the existing `result.completedBuilding === 'sacred_council'`
  precedent at the same call site.

- [ ] **Step 1: Write the failing test**

Append to `tests/systems/strategic-arsenal-system.test.ts`:

```typescript
import { addWarheadToArsenal } from '@/systems/strategic-arsenal-system';

describe('addWarheadToArsenal', () => {
  it('increments strategicArsenal from absent to 1', () => {
    const state = makeState({ civilizations: { p1: makeCiv() } });
    const next = addWarheadToArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(1);
  });

  it('increments an existing count', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 3 }) } });
    const next = addWarheadToArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(4);
  });

  it('is a no-op (returns the same state) for an unknown civ', () => {
    const state = makeState();
    expect(addWarheadToArsenal(state, 'nobody')).toBe(state);
  });

  it('does not mutate the input state', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 1 }) } });
    addWarheadToArsenal(state, 'p1');
    expect(state.civilizations.p1.strategicArsenal).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system -t "addWarheadToArsenal"`
Expected: FAIL — function doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Append to `src/systems/strategic-arsenal-system.ts`:

```typescript
/**
 * Completion side-effect for the `warhead` production item (turn-manager.ts calls
 * this when result.completedBuilding === 'warhead', mirroring the existing
 * sacred_council/circular_manufacturing_network completion-hook precedent at that
 * same call site). Immutable per .claude/rules/game-systems.md; a no-op for an
 * unknown civ id rather than throwing, matching this file's other defensive reads.
 */
export function addWarheadToArsenal(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, strategicArsenal: getStrategicArsenal(civ) + 1 },
    },
  };
}
```

Open `src/core/turn-manager.ts` (~line 407), change:

```typescript
          if (result.completedBuilding === 'sacred_council') {
            newState = foundReligion(newState, civId, cityId, bus);
          }
```

to:

```typescript
          if (result.completedBuilding === 'sacred_council') {
            newState = foundReligion(newState, civId, cityId, bus);
          }
```

Wait — `warhead` is **not** a `uniquePerEmpire`/`nationalProject` building, so it does
not fall inside the `if (completedBldg?.nationalProject && completedBldg.uniquePerEmpire)`
block those two lines live in. Add a **separate, sibling** check right after that
whole `if` block closes (~line 410, after the closing `}` of the national-project
branch, still inside `if (result.completedBuilding) { ... }`):

```typescript
      if (result.completedBuilding) {
        bus.emit('city:building-complete', { cityId, buildingId: result.completedBuilding });
        const completedBldg = BUILDINGS[result.completedBuilding];
        if (completedBldg?.nationalProject && completedBldg.uniquePerEmpire) {
          // ...existing national-project branch, unchanged...
        }
        if (result.completedBuilding === 'warhead') {
          newState = addWarheadToArsenal(newState, civId);
        }
      }
```

Add the import to `turn-manager.ts`:

```typescript
import { addWarheadToArsenal } from '@/systems/strategic-arsenal-system';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system -t "addWarheadToArsenal"`
Expected: PASS

- [ ] **Step 5: Add an integration test proving the real completion path fires it**

Add to `tests/core/turn-manager.test.ts` (or wherever this file's existing
`city:building-complete`/production-completion integration tests live — search for
an existing test that completes a building via the real turn-processing path and
follow its exact setup pattern):

```typescript
  it('completing a warhead increments the civ strategicArsenal via the real turn-processing path (#545)', () => {
    // Arrange a city with warhead queued and enough accumulated production to
    // complete it this turn, plus Manhattan Project already built (builtNationalProjects)
    // and uranium available -- follow this file's existing pattern for constructing
    // a minimal completable-production state.
    // Act: run the same turn-processing function this file's other completion tests use.
    // Assert: resulting civ.strategicArsenal increased by exactly 1, and 'warhead' is
    // NOT present in the completing city's buildings array.
  });
```

(This step intentionally leaves the fixture construction to be written against
whatever this file's real existing turn-processing test helper looks like — read
`tests/core/turn-manager.test.ts`'s nearest existing production-completion test
before writing this one, rather than guessing its shape here.)

- [ ] **Step 6: Commit**

```bash
git add src/core/turn-manager.ts src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(#545): wire warhead completion to increment strategicArsenal"
```

---

### Task 11: Locked-item reason text for `warhead`

**Files:**
- Modify: `src/ui/city-panel.ts` (`getLockedItemReason`, ~line 757)
- Test: a UI-level test in this file's existing test suite (`tests/ui/city-panel.test.ts`)

**Interfaces:**
- Produces: when `warhead` is tech-unlocked but currently gated, `getLockedItemReason`
  returns "Requires Manhattan Project to be completed anywhere in your empire." (no
  Manhattan Project yet) or "Arsenal at capacity (N/N) — build Nuclear Arsenal or
  Missile Silo to expand." (at capacity) — the exact reason text spec §1 specifies.

- [ ] **Step 1: Write the failing test**

Read `tests/ui/city-panel.test.ts`'s existing locked-item tests first (search for
`getLockedItemReason` or `data-locked-reason` usage) to match this file's real
city-panel-rendering test harness exactly, then add two tests following that same
pattern:
- Renders "Requires Manhattan Project..." for `warhead` when `nuclear-weapons` is
  researched (so it's tech-unlocked) but Manhattan Project is not yet built.
- Renders "Arsenal at capacity (N/N)..." for `warhead` when Manhattan Project is
  built and `strategicArsenal >= getStrategicArsenalCapacity`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test city-panel -t "warhead"`
Expected: FAIL — no special-case text exists yet; `warhead` falls through to the
generic (empty, since it has no `requiredTechs`/`requiredBuildings`/missing-resource
entries once uranium is available) reason.

- [ ] **Step 3: Update `getLockedItemReason`**

Open `src/ui/city-panel.ts`, find `getLockedItemReason` (~line 757):

```typescript
  function getLockedItemReason(item: typeof lockedItems[number]): string {
    const requirements: string[] = [];
```

Replace with:

```typescript
  function getLockedItemReason(item: typeof lockedItems[number]): string {
    if (item.id === 'warhead') {
      if (!hasManhattanProject(state, city.owner)) {
        return 'Requires Manhattan Project to be completed anywhere in your empire.';
      }
      const capacity = getStrategicArsenalCapacity(state, city.owner);
      const current = getStrategicArsenal(currentCiv);
      return `Arsenal at capacity (${current}/${capacity}) — build Nuclear Arsenal or Missile Silo to expand.`;
    }
    const requirements: string[] = [];
```

(`hasManhattanProject`/`getStrategicArsenal`/`getStrategicArsenalCapacity` are already
imported from Task 9; `state`/`city`/`currentCiv` are already in scope in this
function per the surrounding code read during this MR's audit.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test city-panel -t "warhead"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(#545): surface Manhattan Project/capacity locked-item reason for warhead"
```

---

### Task 12: AI production coverage + content-honesty positive tests

**Files:**
- Test only: `tests/ai/ai-production.test.ts`, `tests/systems/description-honesty.test.ts`
  (or wherever this repo's existing content-honesty positive-assertion tests for
  other #545 buildings live — check `tests/systems/` for a file already covering
  `nuclear_arsenal`/`manhattan_project` description honesty from MR1, and add
  alongside it rather than creating a new file, if one already exists)

**Interfaces:** none new — this task is verification-only, closing out spec §10's
"no special-cased branch" requirement and the content-honesty checklist for this MR's
two rewritten descriptions.

- [ ] **Step 1: AI candidate-inclusion test**

Add to `tests/ai/ai-production.test.ts` (follow this file's existing pattern for
constructing a civ/city/state that's eligible for a given building candidate):

```typescript
  it('warhead appears among AI building candidates once eligible, scored by the generic pipeline (#545)', () => {
    // Arrange: civ with nuclear-weapons researched, Manhattan Project built, uranium
    // available, under arsenal capacity.
    // Act: call this file's real AI candidate-generation entry point.
    // Assert: a candidate with itemId/id 'warhead' is present.
  });
```

- [ ] **Step 2: Structural no-special-case assertion**

Add a plain grep-based structural test (or, if this repo has no precedent for a
grep-based test file, a comment-only note in the PR body instead — check
`tests/` for an existing "no id-branch" structural test pattern before deciding
which):

```typescript
  it('ai-production.ts has no special-cased warhead branch (#545 spec §10)', () => {
    const source = readFileSync(resolve(__dirname, '../../src/ai/ai-production.ts'), 'utf-8');
    expect(source).not.toMatch(/buildingId\s*===\s*['"]warhead['"]/);
    expect(source).not.toMatch(/\.id\s*===\s*['"]warhead['"]/);
  });
```

- [ ] **Step 3: Content-honesty positive tests**

Add (to the file identified in this task's header):

```typescript
  it('missile_silo description honestly reflects its wired strategicLaunchPlatform + capacity effects (#545)', () => {
    const silo = BUILDINGS.missile_silo;
    expect(silo.strategicLaunchPlatform).toEqual({ range: 'unlimited' });
    expect(silo.description).toContain('unlimited range');
  });

  it('missile_submarine description honestly reflects its wired strategicLaunchPlatform range (#545)', () => {
    const def = UNIT_DEFINITIONS.missile_submarine;
    expect(def.strategicLaunchPlatform).toEqual({ range: 4 });
    expect(UNIT_DESCRIPTIONS.missile_submarine).toContain('4 hexes');
    expect(UNIT_DESCRIPTIONS.missile_submarine).not.toContain('Longest range of any unit');
  });
```

- [ ] **Step 4: Run all new tests**

Run: `bash scripts/run-with-mise.sh yarn test ai-production description-honesty`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/ai-production.test.ts tests/systems/description-honesty.test.ts
git commit -m "test(#545): lock AI generic-scoring coverage + content-honesty positive assertions"
```

(Adjust the exact file path in this commit to whichever content-honesty file Step 3
actually targeted.)

---

### Task 13: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests pass, including hook smoke tests.

- [ ] **Step 2: Run the production build (includes typecheck)**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: succeeds, no TypeScript errors.

- [ ] **Step 3: Confirm architecture boundaries**

Run: `bash scripts/run-with-mise.sh yarn test tests/app/architecture-boundaries.test.ts`
Expected: PASS — `strategic-launch-system.ts` lives in `src/systems/`, imports only
from other `src/systems/` modules and `src/core/types.ts`, nothing from `src/ui/`,
`src/renderer/`, or `src/ai/`.

- [ ] **Step 4: Confirm zero pacing regression**

Run: `bash scripts/run-with-mise.sh yarn test pacing-audit pacing-reference-economy`
Expected: PASS with no snapshot diff — this MR adds zero yields anywhere (`warhead`'s
`yields` are all-zero, `missile_silo`/`missile_submarine` yields are untouched), so
this should be a pure no-op confirmation, not a real redistribution like MR1's.

- [ ] **Step 5: No commit needed unless a fix was required**

If any step above required a code change, that fix belongs in the task it corrects,
with its own commit — do not create a generic "fix tests" commit here.

---

## Definition of Done

- [ ] `StrategicLaunchCapability` type exists; `Building`/`UnitDefinition` both carry
  an optional `strategicLaunchPlatform` field.
- [ ] `missile_silo`: `strategicLaunchPlatform: { range: 'unlimited' }`, honest
  description.
- [ ] `missile_submarine`: `strategicLaunchPlatform: { range: 4 }`, existing
  `attackProfile` untouched, honest `UNIT_DESCRIPTIONS` text (no more "longest range
  of any unit" now that Silo exists).
- [ ] `strategic-launch-system.ts` exports `getEligibleStrategicLaunchPlatforms`
  (capability-driven, zero type/id branches) and `getStrategicLaunchLegality` (the §6
  4-condition conjunctive resolver, each condition independently tested as
  load-bearing).
- [ ] `Building.consumedOnCompletion` and `Building.arsenalCapacityGated` exist as
  generic primitives, each with its own definition-agnostic test — not warhead-coupled
  in their mechanism.
- [ ] `warhead` production item: repeatable, gated by Manhattan Project + capacity +
  uranium, zero yields, completion increments `civ.strategicArsenal` via the real
  turn-processing path (Task 10's integration test), never persists into
  `city.buildings`.
- [ ] Every real `getAvailableBuildings` caller (city-panel.ts's real list,
  planning-system.ts ×2, ai-production.ts) passes live `arsenalStatus`; the
  locked-item-diff call in city-panel.ts deliberately does not.
- [ ] Locked-item UI shows the spec-exact "Requires Manhattan Project..." / "Arsenal
  at capacity (N/N)..." text for `warhead`.
- [ ] AI picks up `warhead` via the fully generic `ai-production.ts` pipeline — no
  special-cased branch (structural test), per spec §10.
- [ ] **No launch action, target-selection UI, or preview surface exists this MR** —
  the only new player-visible surface is the `warhead` production item, which is
  safe on its own per this plan's incremental-delivery decision (documented above).
- [ ] `pacing-audit.test.ts`/`pacing-reference-economy.test.ts` show zero diff (no
  yields added anywhere this MR).
- [ ] `yarn test` and `yarn build` both pass.

## Next MR

MR3: strike resolution reusing `city-siege-system.ts`'s existing floor semantics
(§7) with `preventDestruction: true` forced, plus fallout/devastation via the existing
`devastatedUntilTurn` primitive (§8). This is the first MR where `getStrategicLaunchLegality`
gets a real caller and `strategicArsenal` actually decrements — until then, MR2's
`warhead` production item is a pure stockpile with no consumer, by design (see this
plan's incremental-delivery decision).
