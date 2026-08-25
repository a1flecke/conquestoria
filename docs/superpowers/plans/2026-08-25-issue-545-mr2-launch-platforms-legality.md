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
- **AI production scoring needs one small, generic, capability-driven value signal
  (Task 10) — this revises this plan's original position after the review pass below.**
  Spec §10 forbids a special-cased *nuclear eagerness branch* (an `if (buildingId ===
  'warhead')` in `ai-production.ts`), not a generic signal. Without any positive score
  input, `warhead` nets `0 (economy) - productionTurns*1.5 - maintenanceRisk*3` —
  reliably negative, identical to every other zero-yield building *except* the ones
  that already get a real signal (`sam_site`'s `airDefenseThreatScore`,
  `defensiveEspionageScore`). Left as pure `economyValue`, the AI would essentially
  never build a warhead across the entire feature's lifetime — no later MR revisits
  production eagerness (MR5's "AI doctrine" is launch/retaliation only, and assumes
  arsenal already exists). That breaks Goal 2 ("a rival's *known* nuclear capability
  measurably affects AI conventional behavior") at the root: the deterrence-caution
  factor (§9), AI retaliation doctrine (§10), and AI arms-control proposals (§12,
  gated on "both sides have known capability") all depend on AI civs sometimes
  actually possessing capability. Every well-regarded 4X's AI treats WMD-class
  production as threat/context-driven, never a flat yield calculation (Civ's
  military-flavor/threat weighting, Stellaris's Colossus tied to empire disposition,
  not economy score) — Task 10 follows that same principle with this codebase's own
  established mechanism (a bounded, capability-driven score, matching
  `airDefenseThreatScore`'s exact shape), not a new AI subsystem.
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

### Task 6: The `warhead` production item — repeatable, capacity-gated

**Files:**
- Modify: `src/systems/city-system.ts:1917-1949` (`getAvailableBuildings`),
  `src/systems/city-system.ts:1976-2024` (`completeCityProductionItem`), `BUILDINGS`
  (era-10 section, after `manhattan_project` ~line 851), `PRODUCTION_ICONS` (~line 1723)
- Test: `tests/systems/strategic-launch-system.test.ts`

**Interfaces:**
- Consumes: `Building.consumedOnCompletion`, `Building.arsenalCapacityGated` (Task 1),
  `hasManhattanProject` + `getStrategicArsenal` + `getStrategicArsenalCapacity`
  (`strategic-arsenal-system.ts`).
- Produces: `BUILDINGS.warhead` (repeatable, gated, zero yields); `getAvailableBuildings(...,
  arsenalStatus?: { hasManhattanProject: boolean; atCapacity: boolean })` — new optional
  trailing param, generic (not warhead-specific in mechanism); `completeCityProductionItem`
  no longer persists a `consumedOnCompletion` building into `city.buildings` but still
  returns `completedBuilding` so `turn-manager.ts`'s completion hook fires every time.

> **Review-pass note:** this task tests the two new generic `Building` primitives
> (`consumedOnCompletion`, `arsenalCapacityGated`) against the real `warhead` entry,
> not a synthetic injected fixture. An earlier draft of this plan tested them via
> `(BUILDINGS as any).__test_x__ = {...}` — that pattern has zero precedent anywhere
> in this repo's test suite (confirmed by grep during the review pass) and deviates
> from this codebase's established convention of testing a new generic mechanism
> against a real catalog entry in the same task that adds it (see MR1 Task 2, which
> added the `milestone` field and updated the real `manhattan_project` definition
> together). Merging what were three separate tasks into this one both fixes that
> and removes an artificial ordering problem (the old Task 6/7 had no real consumer
> to test against yet, since `warhead` didn't exist until the old Task 8).

- [ ] **Step 1: Write the failing tests**

Append to `tests/systems/strategic-launch-system.test.ts`:

```typescript
import { BUILDINGS as CityBuildings, getAvailableBuildings, completeCityProductionItem } from '@/systems/city-system';

describe('warhead production item (#545)', () => {
  it('is gated by nuclear-weapons + uranium, repeatable, arsenal-capacity gated, zero yields', () => {
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
    // incrementing strategicArsenal (Task 8's integration test), not by any yield here.
    expect(warhead.yields).toEqual({ food: 0, production: 0, gold: 0, science: 0 });
  });

  it('getAvailableBuildings: warhead is available when arsenalStatus is omitted (skips the gate)', () => {
    const city = { id: 'c1', owner: 'p1', buildings: [], position: { q: 0, r: 0 } } as any;
    const map = { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] } as any;
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map);
    expect(available.some(b => b.id === 'warhead')).toBe(true);
  });

  it('getAvailableBuildings: warhead is hidden when Manhattan Project is unbuilt', () => {
    const city = { id: 'c1', owner: 'p1', buildings: [], position: { q: 0, r: 0 } } as any;
    const map = { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] } as any;
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: false, atCapacity: false });
    expect(available.some(b => b.id === 'warhead')).toBe(false);
  });

  it('getAvailableBuildings: warhead is hidden when at arsenal capacity', () => {
    const city = { id: 'c1', owner: 'p1', buildings: [], position: { q: 0, r: 0 } } as any;
    const map = { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] } as any;
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: true });
    expect(available.some(b => b.id === 'warhead')).toBe(false);
  });

  it('getAvailableBuildings: warhead is available when Manhattan Project is done and under capacity', () => {
    const city = { id: 'c1', owner: 'p1', buildings: [], position: { q: 0, r: 0 } } as any;
    const map = { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] } as any;
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: false });
    expect(available.some(b => b.id === 'warhead')).toBe(true);
  });

  it('completeCityProductionItem: completing warhead fires completedBuilding but never persists into city.buildings', () => {
    const city = { id: 'c1', owner: 'p1', buildings: [], productionQueue: ['warhead'], productionProgress: 260 } as any;
    const result = completeCityProductionItem(city, 'warhead');
    expect(result.completedBuilding).toBe('warhead');
    expect(result.city.buildings).not.toContain('warhead');
  });

  it('completeCityProductionItem: warhead is immediately re-completable (queue it twice in a row)', () => {
    const city = { id: 'c1', owner: 'p1', buildings: [], productionQueue: ['warhead', 'warhead'], productionProgress: 260 } as any;
    const first = completeCityProductionItem(city, 'warhead');
    const second = completeCityProductionItem(first.city, 'warhead');
    expect(first.completedBuilding).toBe('warhead');
    expect(second.completedBuilding).toBe('warhead');
    expect(second.city.buildings).not.toContain('warhead');
  });
});
```

(If this repo's `City`/`GameMap` test fixtures normally go through a shared helper
rather than an inline `as any` object literal, check
`tests/systems/city-system.test.ts`'s existing `getAvailableBuildings`/
`completeCityProductionItem` tests for that helper's real name and use it instead —
these inline literals are written to be self-contained if no such helper exists.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "warhead production item"`
Expected: FAIL — `BUILDINGS.warhead` is `undefined`; `getAvailableBuildings` doesn't
accept an 8th parameter yet; `completeCityProductionItem` has no `warhead` to complete.

- [ ] **Step 3: Add the `warhead` definition**

Open `src/systems/city-system.ts`, immediately after `manhattan_project` (~line 851,
before `postwar_reconstruction`), add:

```typescript
  warhead: {
    id: 'warhead', name: 'Warhead', category: 'military',
    yields: { food: 0, production: 0, gold: 0, science: 0 }, productionCost: 260,
    // #545: illustrative cost, tunable in the balance-pass MR per spec §1. Repeatable
    // (consumedOnCompletion) -- producing it adds 1 warhead to the empire-wide
    // strategicArsenal (turn-manager.ts's completion hook, Task 8), capped by
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

- [ ] **Step 4: Update `getAvailableBuildings`**

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
   * locked-item-reason diff (see city-panel.ts, Task 9) rely on omitting this. */
  arsenalStatus?: { hasManhattanProject: boolean; atCapacity: boolean },
): Building[] {
  const coastal = isCityCoastal(city, map);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.arsenalCapacityGated && arsenalStatus && (!arsenalStatus.hasManhattanProject || arsenalStatus.atCapacity)) return false;
```

- [ ] **Step 5: Update `completeCityProductionItem`**

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

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "warhead production item"`
Expected: PASS (all 6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/systems/city-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): add the warhead production item (repeatable, capacity-gated)"
```

---

### Task 7: Thread live `arsenalStatus` into every real caller + render current arsenal count

**Files:**
- Modify: `src/ui/city-panel.ts:264` (the real `availableBuildings` call — NOT the
  `allTechUnlockedBuildings` call at line ~643, which must stay without
  `arsenalStatus` so `lockedBuildings`'s diff still picks up `warhead`); plus the
  "available item" rendering loop that shows each buildable item's info line (find
  the exact loop by reading the file — see Step 4)
- Modify: `src/systems/planning-system.ts:139,184` (`getIdleCityIds`,
  `getRecommendedIdleCityChoice`)
- Modify: `src/ai/ai-production.ts:559`

**Interfaces:**
- Consumes: `hasManhattanProject`, `getStrategicArsenal`, `getStrategicArsenalCapacity`
  (`strategic-arsenal-system.ts`).
- Produces: every real production-eligibility computation in the game now correctly
  reflects `warhead`'s live gate — matches the caller-discipline convention
  `.claude/rules/game-balance.md` already documents for `activeNationalProjects`.

> **Review-pass finding:** the original draft of this task only surfaced the arsenal
> count in the *locked*-item reason (shown once a player is already at capacity).
> While under capacity, nothing anywhere renders a player's current warhead count —
> `warhead` never enters `city.buildings` (Task 6's `consumedOnCompletion`), so it
> never shows in a city's built-buildings list either. That violates spec Goal 7
> ("arsenal capacity... always visible to their owner") and
> `.claude/rules/end-to-end-wiring.md`'s "if you calculate data, it must be
> rendered" — MR1 could defer this (the field was dormant, nothing changed it), but
> this MR is what makes the count start moving via a real player action, so it needs
> *some* visible surface now, not just at the cap. This does **not** mean building
> the full MR4 `warchief` "Strategic Arsenal" panel early (that's richer: per-platform
> breakdown by name, arms-control cap display) — just a minimal, always-visible
> "Arsenal: N/M" line wherever `warhead` itself is shown as an available item, so the
> number a player is actively changing is never invisible. Step 4 below adds this.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/strategic-launch-system.test.ts`:

```typescript
import { getIdleCityIds } from '@/systems/planning-system';

describe('arsenalStatus threading (#545)', () => {
  it('getIdleCityIds excludes a city whose only buildable item is a capacity-gated warhead once at capacity, includes it otherwise', () => {
    const baseState = {
      map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] },
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['nuclear_arsenal'], productionQueue: [], idleProduction: null } as any },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    };
    const techState = { completed: ['nuclear-weapons'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any };

    // Under capacity (base 1 + nuclear_arsenal's 2 = 3, arsenal at 0): warhead is
    // buildable, so this city is NOT idle.
    const underCapacityState = makeState({
      ...baseState,
      civilizations: { p1: makeCiv({ cities: ['c1'], techState, strategicArsenal: 0 }) },
    });
    expect(getIdleCityIds(underCapacityState, 'p1')).not.toContain('c1');

    // At capacity (arsenal already at 3, the same 3 computed above): warhead is no
    // longer buildable, and this city has no other buildable item -- it IS idle.
    // This is the behavior Task 7's threading exists to fix; without it, this
    // assertion would fail because the gate would never be checked at all.
    const atCapacityState = makeState({
      ...baseState,
      civilizations: { p1: makeCiv({ cities: ['c1'], techState, strategicArsenal: 3 }) },
    });
    expect(getIdleCityIds(atCapacityState, 'p1')).toContain('c1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "arsenalStatus threading"`
Expected: FAIL — before this task's changes, `getIdleCityIds` never checks arsenal
status at all, so both cases resolve identically (both "not idle," since
`getAvailableBuildings` without `arsenalStatus` always shows `warhead` as buildable) —
the at-capacity assertion (`toContain('c1')`) fails.

- [ ] **Step 3: Update every real `getAvailableBuildings` caller**

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
pre-gate set and Task 9's locked-item diff works.

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

- [ ] **Step 4: Render the current arsenal count wherever `warhead` is shown as available**

Read `src/ui/city-panel.ts`'s "available items" rendering loop — the code that turns
each entry of `availableBuildings` into its HTML card (yields, cost, resource-requirement
line; the same loop that already calls `resourceRequirementLine(itemId, ...)` per item,
per this MR's earlier audit of the file) — to find its exact per-item info-line
insertion point (this plan intentionally does not guess unread code here; locate the
loop, confirm where per-item extra info lines are concatenated, same discipline this
plan already used for the locked-item text in Task 9). Add, for the `warhead` item
specifically, an always-visible line showing current count vs. capacity:

```typescript
  const arsenalStatusLine = (itemId: string): string => {
    if (itemId !== 'warhead') return '';
    const current = getStrategicArsenal(currentCiv);
    const capacity = getStrategicArsenalCapacity(state, city.owner);
    return `<div style="font-size:10px;opacity:0.72;">Arsenal: ${current}/${capacity}</div>`;
  };
```

Call `arsenalStatusLine(building.id)` alongside the existing
`resourceRequirementLine(...)` call in that per-item card template, concatenating its
output the same way the existing optional lines are concatenated there.

- [ ] **Step 5: Run the full test suite for these files**

Run: `bash scripts/run-with-mise.sh yarn test city-panel planning-system ai-production strategic-launch-system`
Expected: all PASS — this is the real verification for this task (no existing test
in any of these files should regress from adding a new optional trailing argument),
plus Task 7's own new test from Step 1.

- [ ] **Step 6: Add a render test for the arsenal count line**

Add to `tests/ui/city-panel.test.ts` (follow this file's existing pattern for
rendering the panel and asserting on its output — the same harness Task 9's
locked-item tests use): render the city panel for a civ with Manhattan Project built
and `strategicArsenal: 2`, `getStrategicArsenalCapacity` resolving to 5 for that civ,
and assert the rendered output contains `Arsenal: 2/5` somewhere in the available
`warhead` item's card.

- [ ] **Step 7: Commit**

```bash
git add src/ui/city-panel.ts src/systems/planning-system.ts src/ai/ai-production.ts tests/systems/strategic-launch-system.test.ts tests/ui/city-panel.test.ts
git commit -m "feat(#545): thread live arsenalStatus into every real caller, render current arsenal count"
```

---

### Task 8: Production-completion hook — increment `strategicArsenal`

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

Open `src/core/turn-manager.ts`. `warhead` is **not** a `uniquePerEmpire`/
`nationalProject` building, so its hook cannot go inside the existing
`if (completedBldg?.nationalProject && completedBldg.uniquePerEmpire) { ... }` block
(~line 386-410) — it needs a separate, sibling check. Find the end of that block
(~line 410-411):

```typescript
          if (result.completedBuilding === 'sacred_council') {
            newState = foundReligion(newState, civId, cityId, bus);
          }
        }
      }
```

Replace with (adding the new `if` as a sibling immediately after the existing
national-project block's closing `}`, still inside the outer
`if (result.completedBuilding) { ... }`):

```typescript
          if (result.completedBuilding === 'sacred_council') {
            newState = foundReligion(newState, civId, cityId, bus);
          }
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

### Task 9: Locked-item reason text for `warhead`

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
imported from Task 7; `state`/`city`/`currentCiv` are already in scope in this
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

### Task 10: `strategicArsenalValueScore` — a generic AI production-value signal

**Files:**
- Modify: `src/ai/ai-production.ts` (near `economyValue`/`airDefenseThreatScore`,
  ~line 205-300; the building-scoring loop ~line 559-618)
- Test: `tests/ai/ai-production.test.ts`

**Interfaces:**
- Produces: `strategicArsenalValueScore(state, civId, buildingId): number` — a bounded,
  capability-driven score folded into the same `score` formula every other building
  candidate already goes through (~line 595).

> **Why this task exists (review-pass finding, see Global Constraints above for the
> full reasoning):** without any positive score input, `warhead` nets a reliably
> negative score under generic `economyValue` scoring (zero yields, only
> `productionTurns`/`maintenanceRisk` penalties) — unlike every other zero-yield
> military building in this catalog, which already gets a real signal
> (`sam_site`'s `airDefenseThreatScore`, defensive buildings' `defensiveEspionageScore`).
> Left unaddressed, AI civs would essentially never build a single warhead across the
> entire feature's lifetime, breaking the deterrence premise multiple later MRs
> depend on (§9's caution factor, §10's retaliation doctrine, §12's AI arms-control
> proposals all require AI civs to sometimes actually have capability). This is a
> generic, capability-driven signal (keyed off `Building.arsenalCapacityGated`, not
> an id) conditioned on real strategic context — the civ must currently be at war —
> mirroring `airDefenseThreatScore`'s exact shape (also threat-conditioned, also
> capability-driven) rather than inventing new AI machinery. It is deliberately
> **not** a full "AI doctrine" module — that's still MR5's job for launch/retaliation/
> existential-threat scoring; this is narrowly the production-eligibility nudge
> needed so the feature's premise is reachable at all before MR5 lands.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ai/ai-production.test.ts`:

```typescript
import { strategicArsenalValueScore } from '@/ai/ai-production';

describe('strategicArsenalValueScore (#545)', () => {
  it('is 0 for a building with no arsenalCapacityGated capability, regardless of war state', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } }) },
    });
    expect(strategicArsenalValueScore(state, 'p1', 'nuclear_arsenal')).toBe(0);
  });

  it('is 0 for warhead when the civ is at peace (no credible threat context)', () => {
    const state = makeState({ civilizations: { p1: makeCiv() } });
    expect(strategicArsenalValueScore(state, 'p1', 'warhead')).toBe(0);
  });

  it('is positive for warhead when the civ is at war with at least one civ', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } }) },
    });
    expect(strategicArsenalValueScore(state, 'p1', 'warhead')).toBeGreaterThan(0);
  });

  it('is bounded: does not keep scaling past 3 simultaneous wars', () => {
    const threeWars = makeCiv({ diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2', 'p3', 'p4'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } });
    const fiveWars = makeCiv({ diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: ['p2', 'p3', 'p4', 'p5', 'p6'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } });
    const scoreAtThree = strategicArsenalValueScore(makeState({ civilizations: { p1: threeWars } }), 'p1', 'warhead');
    const scoreAtFive = strategicArsenalValueScore(makeState({ civilizations: { p1: fiveWars } }), 'p1', 'warhead');
    expect(scoreAtFive).toBe(scoreAtThree);
  });

  it('is high enough to outweigh a typical warhead build\'s productionTurns/maintenanceRisk penalty', () => {
    // Regression against the actual formula in the building-scoring loop
    // (score = economyScore*2 + ... - productionTurns*1.5 - maintenanceRisk*3):
    // a warhead at productionCost 260 and a plausible era-10/11 production rate
    // should net positive overall for an at-war civ, or this signal is too weak to
    // matter in practice. Follow this file's existing pattern for constructing a
    // full candidate-scoring call (not just this function in isolation) and assert
    // the resulting warhead candidate's total score is > 0 for an at-war civ under
    // capacity with Manhattan Project built.
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test ai-production -t "strategicArsenalValueScore"`
Expected: FAIL — function doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Open `src/ai/ai-production.ts`, add near `economyValue` (~line 205):

```typescript
const STRATEGIC_ARSENAL_VALUE_PER_WAR = 12;
const STRATEGIC_ARSENAL_VALUE_MAX_WARS = 3;

/**
 * #545: bounded, capability-driven value signal for any arsenalCapacityGated item
 * (only `warhead` today) -- without this, such an item nets a reliably negative
 * score under generic economyValue scoring (zero yields), and the AI would never
 * build one. Threat-conditioned (scales with current war count, capped) rather than
 * a flat bonus, matching this file's existing airDefenseThreatScore precedent and
 * the general principle (seen across other 4X AI design) that WMD-class production
 * eagerness should be driven by real strategic context, not a flat economic value.
 * Generic via Building.arsenalCapacityGated -- not an id branch; a future similar
 * item is covered automatically.
 */
export function strategicArsenalValueScore(state: GameState, civId: string, buildingId: string): number {
  const building = BUILDINGS[buildingId];
  if (!building?.arsenalCapacityGated) return 0;
  const civ = state.civilizations[civId];
  const warCount = Math.min(civ?.diplomacy.atWarWith.length ?? 0, STRATEGIC_ARSENAL_VALUE_MAX_WARS);
  return warCount * STRATEGIC_ARSENAL_VALUE_PER_WAR;
}
```

Fold it into the building-scoring loop (~line 589-601), alongside the existing
`buildingDefensiveScore`/`buildingAirDefenseScore` calls:

```typescript
    const buildingDefensiveScore = defensiveEspionageScore(state, civId, cityId, building.id);
    const buildingAirDefenseScore = airDefenseThreatScore(
      airDefenseThreatenedCityIds,
      cityId,
      building.id,
    );
    const buildingStrategicArsenalScore = strategicArsenalValueScore(state, civId, building.id);
    const score = economyScore * 2
      + personalityScore
      + citySpecializationScore
      + buildingDefensiveScore
      + buildingAirDefenseScore
      + buildingStrategicArsenalScore
      - productionTurns * 1.5
      - maintenanceRisk * 3;
```

(This candidate object literal has a fixed field set per its existing type — do not
add a new field to it for this score unless that type already has a slot for it;
folding the value directly into `score` is sufficient and matches how
`citySpecializationScore` already contributes without every intermediate always
being independently exposed on the candidate.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test ai-production -t "strategicArsenalValueScore"`
Expected: PASS. If Step 1's last test (the outweigh-the-penalty regression) fails,
tune `STRATEGIC_ARSENAL_VALUE_PER_WAR` up rather than deleting the test — the whole
point of this task is that the net score must actually go positive for a real
warhead build under realistic cost/turns numbers, not just be "greater than zero in
isolation."

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-production.ts tests/ai/ai-production.test.ts
git commit -m "feat(#545): add strategicArsenalValueScore, a bounded threat-conditioned AI production signal"
```

---

### Task 11: AI candidate coverage + content-honesty positive tests

**Files:**
- Test only: `tests/ai/ai-production.test.ts`, `tests/systems/description-honesty.test.ts`
  (or wherever this repo's existing content-honesty positive-assertion tests for
  other #545 buildings live — check `tests/systems/` for a file already covering
  `nuclear_arsenal`/`manhattan_project` description honesty from MR1, and add
  alongside it rather than creating a new file, if one already exists)

**Interfaces:** none new — this task is verification-only, closing out the
content-honesty checklist for this MR's two rewritten descriptions, and confirming
Task 10's generic signal is exactly that (generic), not a disguised id branch.

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

- [ ] **Step 2: Structural no-id-branch assertion**

This confirms Task 10 followed the "generic, not a nuclear-specific branch" rule
literally — it should still pass after Task 10's changes, since
`strategicArsenalValueScore` is keyed off `Building.arsenalCapacityGated`, never off
the literal string `'warhead'`:

```typescript
  it('ai-production.ts building-scoring loop has no warhead-id branch (#545 spec §10)', () => {
    const source = readFileSync(resolve(__dirname, '../../src/ai/ai-production.ts'), 'utf-8');
    expect(source).not.toMatch(/buildingId\s*===\s*['"]warhead['"]/);
    expect(source).not.toMatch(/\.id\s*===\s*['"]warhead['"]/);
  });
```

(If this repo has no existing precedent for a source-grep structural test, check for
one before adding a new pattern — if genuinely novel, a code comment on
`strategicArsenalValueScore` itself already documents the same guarantee, and this
step can be dropped in favor of that comment plus Task 10's own capability-driven
implementation being self-evidently non-branching on read.)

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
git commit -m "test(#545): lock AI candidate coverage + content-honesty positive assertions"
```

(Adjust the exact file path in this commit to whichever content-honesty file Step 3
actually targeted.)

---

### Task 12: Full-suite verification

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
  generic primitives (not warhead-coupled in mechanism — driven by the field, not an
  id check), verified against the real `warhead` entry (Task 6).
- [ ] `warhead` production item: repeatable, gated by Manhattan Project + capacity +
  uranium, zero yields, completion increments `civ.strategicArsenal` via the real
  turn-processing path (Task 8's integration test), never persists into
  `city.buildings`.
- [ ] Every real `getAvailableBuildings` caller (city-panel.ts's real list,
  planning-system.ts ×2, ai-production.ts) passes live `arsenalStatus`; the
  locked-item-diff call in city-panel.ts deliberately does not.
- [ ] Locked-item UI shows the spec-exact "Requires Manhattan Project..." / "Arsenal
  at capacity (N/N)..." text for `warhead`; an always-visible "Arsenal: N/M" line
  shows on the available (buildable) `warhead` item too, so the count is never
  invisible while under capacity (Task 7 — a real Goal 7 gap this review pass found
  and fixed, not in the original plan draft).
- [ ] AI picks up `warhead` via the generic `ai-production.ts` pipeline; it also has a
  real, bounded, threat-conditioned reason to actually build one
  (`strategicArsenalValueScore`, Task 10) — no `if (buildingId === 'warhead')` branch
  anywhere (structural test, Task 11), matching spec §10's letter while closing the
  "AI would never build one across the feature's whole lifetime" gap this review
  pass found (see Global Constraints above for the full reasoning).
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
