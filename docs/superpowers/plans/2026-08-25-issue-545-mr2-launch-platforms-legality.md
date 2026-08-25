# #545 MR2 — Launch Platforms, Targeting Legality & Build Warhead Implementation Plan

✅ executed 2026-08-25 (pre-merge; PR not yet opened). All 12 tasks complete, full
suite green (532 files / 8988 tests), `yarn build` clean. Execution surfaced and
fixed several real gaps this plan's two review passes missed — see each task's
commit message for specifics: broken test fixtures (wrong helper names, missing
`nuclear-physics` tech gate for uranium, a fabricated `Civilization.visibility`
field), a genuine `getLockedItemReason` logic bug (unconditional early-return that
would have shown "Arsenal at capacity" even when the real blocker was missing
uranium), `getIdleCityIds`/`getRecommendedIdleCityChoice` turning out unable to
behaviorally isolate `warhead`'s gate at all (baseline units have no tech gate),
`STRATEGIC_ARSENAL_VALUE_PER_WAR` needing empirical tuning against the real
formula (12 → 35), a `pacing-audit.test.ts` outlier requiring `warhead`'s band to
move from `power-spike` to `marquee`, a missing `nuclear-weapons.unlocksBuildings`
entry, and a missing `BUILDING_SPRITE_CATALOG` entry. None of these changed the
plan's scope or design — all fixes stayed within what each task already set out
to build.

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

- [x] **Step 1: Add the type and both fields**

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

- [x] **Step 2: Typecheck**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: succeeds — all new fields are optional.

- [x] **Step 3: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — field is `undefined`.

- [x] **Step 3: Wire the field + honest description**

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

- [x] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing test**

Append to `tests/systems/strategic-launch-system.test.ts`:

```typescript
  it('missile_submarine has range-4 strategicLaunchPlatform, existing attackProfile untouched', () => {
    const def = UNIT_DEFINITIONS.missile_submarine;
    expect(def.strategicLaunchPlatform).toEqual({ range: 4 });
    expect(def.attackProfile).toEqual({ kind: 'ranged', range: 3, targets: ['unit', 'city'] });
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — field is `undefined`.

- [x] **Step 3: Wire the field**

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

- [x] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — `@/systems/strategic-launch-system` doesn't exist yet.

- [x] **Step 3: Write the minimal implementation**

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

- [x] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS (all platform-enumeration tests + the two wiring tests from Tasks 2/3)

- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: FAIL — `getStrategicLaunchLegality` doesn't exist yet.

- [x] **Step 3: Write the minimal implementation**

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

- [x] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system`
Expected: PASS (all tests in the file)

- [x] **Step 5: Commit**

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

> **Third review-pass finding:** the original draft of this task's tests used
> inline `{ id: 'c1', owner: 'p1', ... } as any` city/map literals. Checking
> `tests/systems/city-system.test.ts` (the file that owns `getAvailableBuildings`/
> `completeCityProductionItem` and already has extensive real coverage of both)
> shows its established convention is real fixtures: `generateMap(width, height,
> seed)` (`@/systems/map-generator`) + `foundCity(civId, coord, map, idCounters)`
> (`@/systems/city-system`, already exported) + a local `mkC()` idCounters helper
> (`const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1
> })`). The steps below use that same real-fixture pattern instead.

- [x] **Step 1: Write the failing tests**

Append to `tests/systems/strategic-launch-system.test.ts`:

```typescript
import { BUILDINGS as CityBuildings, foundCity, getAvailableBuildings, completeCityProductionItem } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeTestCity(seed: string) {
  const map = generateMap(30, 30, seed);
  const landTile = Object.values(map.tiles).find(tile => tile.terrain === 'grassland')!;
  const city = foundCity('p1', landTile.coord, map, mkC());
  return { map, city };
}

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
    const { map, city } = makeTestCity('warhead-gate-omitted');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map);
    expect(available.some(b => b.id === 'warhead')).toBe(true);
  });

  it('getAvailableBuildings: warhead is hidden when Manhattan Project is unbuilt', () => {
    const { map, city } = makeTestCity('warhead-no-manhattan');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: false, atCapacity: false });
    expect(available.some(b => b.id === 'warhead')).toBe(false);
  });

  it('getAvailableBuildings: warhead is hidden when at arsenal capacity', () => {
    const { map, city } = makeTestCity('warhead-at-capacity');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: true });
    expect(available.some(b => b.id === 'warhead')).toBe(false);
  });

  it('getAvailableBuildings: warhead is available when Manhattan Project is done and under capacity', () => {
    const { map, city } = makeTestCity('warhead-under-capacity');
    const available = getAvailableBuildings(city, ['nuclear-weapons'], map, undefined, undefined, undefined, undefined, { hasManhattanProject: true, atCapacity: false });
    expect(available.some(b => b.id === 'warhead')).toBe(true);
  });

  it('completeCityProductionItem: completing warhead fires completedBuilding but never persists into city.buildings', () => {
    const { city } = makeTestCity('warhead-complete');
    city.productionQueue = ['warhead'];
    city.productionProgress = 260;
    const result = completeCityProductionItem(city, 'warhead');
    expect(result.completedBuilding).toBe('warhead');
    expect(result.city.buildings).not.toContain('warhead');
  });

  it('completeCityProductionItem: warhead is immediately re-completable (queue it twice in a row)', () => {
    const { city } = makeTestCity('warhead-complete-twice');
    city.productionQueue = ['warhead', 'warhead'];
    city.productionProgress = 260;
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

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "warhead production item"`
Expected: FAIL — `BUILDINGS.warhead` is `undefined`; `getAvailableBuildings` doesn't
accept an 8th parameter yet; `completeCityProductionItem` has no `warhead` to complete.

- [x] **Step 3: Add the `warhead` definition**

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

- [x] **Step 4: Update `getAvailableBuildings`**

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

- [x] **Step 5: Update `completeCityProductionItem`**

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

- [x] **Step 6: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "warhead production item"`
Expected: PASS (all 6 tests)

- [x] **Step 7: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test strategic-launch-system -t "arsenalStatus threading"`
Expected: FAIL — before this task's changes, `getIdleCityIds` never checks arsenal
status at all, so both cases resolve identically (both "not idle," since
`getAvailableBuildings` without `arsenalStatus` always shows `warhead` as buildable) —
the at-capacity assertion (`toContain('c1')`) fails.

- [x] **Step 3: Update every real `getAvailableBuildings` caller**

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

- [x] **Step 4: Render the current arsenal count wherever `warhead` is shown as available**

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

- [x] **Step 5: Run the full test suite for these files**

Run: `bash scripts/run-with-mise.sh yarn test city-panel planning-system ai-production strategic-launch-system`
Expected: all PASS — this is the real verification for this task (no existing test
in any of these files should regress from adding a new optional trailing argument),
plus Task 7's own new test from Step 1.

- [x] **Step 6: Add a render test for the arsenal count line**

Add to `tests/ui/city-panel.test.ts`, using the same `makeWonderPanelFixture()` +
`createCityPanel` harness Task 9's locked-item tests use:

```typescript
  it('#545: available warhead item shows an always-visible Arsenal: N/M line', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed.push('nuclear-weapons');
    // Base capacity (1, from Manhattan Project) + nuclear_arsenal (+2) + missile_silo
    // (+1) = 4; arsenal at 2 -- comfortably under capacity, so warhead is available
    // (not locked), and the count must still be visible per this review's Goal 7 fix.
    city.buildings.push('nuclear_arsenal', 'missile_silo');
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 2;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).toContain('Arsenal: 2/4');
  });
```

(`collectText` is this file's existing helper, already imported at the top from
`./helpers/wonder-panel-fixture`, used by other tests in this file for whole-panel
text assertions.)

- [x] **Step 7: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system -t "addWarheadToArsenal"`
Expected: FAIL — function doesn't exist yet.

- [x] **Step 3: Write the implementation**

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

- [x] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test strategic-arsenal-system -t "addWarheadToArsenal"`
Expected: PASS

- [x] **Step 5: Add an integration test proving the real completion path fires it**

**Third review-pass finding:** this step was originally left as an unwritten
placeholder. `tests/core/turn-manager.test.ts` already has the exact analogous test
for this MR to mirror — `"#591 MR4: completing Sacred Council founds a religion at
the building city"` (~line 1829): `createNewGame` + a hand-placed tile + `foundCity`
+ queueing the item with `productionProgress` one short of cost + `processTurn`. The
one addition warhead's version needs beyond that template: `resourceRequired:
['uranium']` is enforced by `processCity`'s dequeue filter whenever
`availableResources` is defined and doesn't contain the resource — this file's
existing marketplace-purchase mechanism (`state.marketplace.purchasedResources`,
same `{ civId, resource, expiresOnTurn }` shape used at ~line 1286 of this same
file) is how to grant it, or the item would be silently dropped from the queue
before ever completing.

Add to `tests/core/turn-manager.test.ts`, near the Sacred Council test:

```typescript
  it('#545: completing a warhead increments strategicArsenal via the real turn-processing path, never persists into city.buildings', () => {
    const state = createNewGame(undefined, 'warhead-completion', 'small');
    const civId = 'player';
    const pos = { q: 0, r: 0 };
    state.map.tiles[hexKey(pos)] = {
      coord: pos, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: civId, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    const city = foundCity(civId, pos, state.map, state.idCounters);
    city.workedTiles = [];
    city.productionQueue = ['warhead'];
    city.productionProgress = 259; // 1 short of the 260 cost -- completes this turn
    state.cities = { [city.id]: city };
    state.civilizations[civId].cities = [city.id];
    state.civilizations[civId].techState.completed = ['nuclear-weapons'];
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.marketplace = {
      ...(state.marketplace ?? { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [] }),
      purchasedResources: [{ civId, resource: 'uranium', expiresOnTurn: state.turn + 10 }],
    };
    state.units = {};
    state.barbarianCamps = {};

    const next = processTurn(state, new EventBus());

    expect(next.civilizations[civId].strategicArsenal).toBe(1);
    expect(next.cities[city.id]!.buildings).not.toContain('warhead');
  });
```

- [x] **Step 6: Run the integration test**

Run: `bash scripts/run-with-mise.sh yarn test turn-manager -t "#545: completing a warhead"`
Expected: PASS.

- [x] **Step 7: Commit**

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

> **Third review-pass finding, correctness bug:** the original draft's
> `getLockedItemReason` special case for `warhead` returned unconditionally
> whenever `item.id === 'warhead'` — meaning if Manhattan Project *is* built and
> the civ is *under* capacity, but `warhead` is still locked for the ordinary reason
> (missing `uranium`, already handled generically via `item.missingResources`), the
> function would have wrongly reported `"Arsenal at capacity (0/1)"` even though
> there is capacity to spare — actively misleading, not just uninformative. Fixed
> below: the special case only returns early for the two conditions it actually
> knows about; otherwise it falls through to the existing generic reason builder
> (which already computes `missingResources` for every locked item generically, no
> `warhead`-specific code needed there).
>
> This task's test also now uses the real fixture this file already has for exactly
> this scenario class — `makeLockedMR4Fixture({ completedTechs })` (~line 2135,
> returns `{ container, city, state, civId }`) — instead of an unwritten
> placeholder, and queries `[data-locked-reason="warhead"]` specifically (the file's
> existing locked-item tests query the bare `[data-locked-reason]` attribute, which
> only works when there's exactly one locked item in the fixture — `warhead` may not
> be the only one, so this test targets it by id to avoid an ambiguous match).

- [x] **Step 1: Write the failing tests**

Add to `tests/ui/city-panel.test.ts`, alongside the existing locked-item tests
(~line 2261):

```typescript
  it('#545: locked warhead shows "Requires Manhattan Project..." when unbuilt', () => {
    const { container, city, state, civId } = makeLockedMR4Fixture({
      completedTechs: ['nuclear-weapons'],
    });
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason="warhead"]');
    expect(reasonEl?.textContent).toContain('Requires Manhattan Project');
  });

  it('#545: locked warhead shows "Arsenal at capacity (N/N)..." when Manhattan Project is built and arsenal is full', () => {
    const { container, city, state, civId } = makeLockedMR4Fixture({
      completedTechs: ['nuclear-weapons'],
    });
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 1; // base capacity with only Manhattan Project built is 1 -- exactly at cap
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason="warhead"]');
    expect(reasonEl?.textContent).toContain('Arsenal at capacity (1/1)');
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test city-panel -t "#545: locked warhead"`
Expected: FAIL — no special-case text exists yet; `warhead` falls through to the
generic (empty, since it has no `requiredTechs`/`requiredBuildings` entries, and
`missingResources` would be empty too since `makeLockedMR4Fixture` doesn't restrict
resources) reason, so `reasonEl?.textContent` is empty or missing.

- [x] **Step 3: Update `getLockedItemReason`**

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
      if (current >= capacity) {
        return `Arsenal at capacity (${current}/${capacity}) — build Nuclear Arsenal or Missile Silo to expand.`;
      }
      // Manhattan Project built and under capacity -- if still locked, it's for an
      // ordinary reason (e.g. missing uranium), handled generically below.
    }
    const requirements: string[] = [];
```

(`hasManhattanProject`/`getStrategicArsenal`/`getStrategicArsenalCapacity` are already
imported from Task 7; `state`/`city`/`currentCiv` are already in scope in this
function per the surrounding code read during this MR's audit.)

- [x] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test city-panel -t "#545: locked warhead"`
Expected: PASS

- [x] **Step 5: Add the always-under-capacity generic-fallthrough regression**

Add one more test confirming the fallthrough (the exact bug this review pass found):

```typescript
  it('#545: locked warhead falls through to the generic missing-resource reason when Manhattan Project is built and under capacity', () => {
    const { container, city, state, civId } = makeLockedMR4Fixture({
      completedTechs: ['nuclear-weapons'],
    });
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    // strategicArsenal left undefined (0) -- well under the base capacity of 1, so
    // the only real reason warhead could still be locked here is missing uranium.
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason="warhead"]');
    expect(reasonEl?.textContent).not.toContain('Arsenal at capacity');
    expect(reasonEl?.textContent).not.toContain('Requires Manhattan Project');
  });
```

- [x] **Step 6: Run all three tests**

Run: `bash scripts/run-with-mise.sh yarn test city-panel -t "#545: locked warhead"`
Expected: PASS (all three)

- [x] **Step 7: Commit**

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

> **Second review-pass finding:** the original draft of this task invented
> `makeState`/`makeCiv` test helpers that do not exist in
> `tests/ai/ai-production.test.ts` — that file's real, established fixture is
> `setupState(completedTechs, cityIds)` (built on the real `createNewGame`, with a
> real civ id `'ai-1'`), and its existing threat-conditioned test for `sam_site`
> (`'scores typed air defense only against a visible hostile strike threat...'`,
> ~line 142) is the exact pattern to mirror. It was also wrong that
> `AIProductionCandidate` "doesn't have a slot" for a new score — `airDefenseThreatScore`/
> `submarineThreatScore`/`carrierCompositionScore` are all real, named, always-present
> fields on that interface (`ai-production.ts:37-55`), each set at every one of the
> **three** candidate-construction sites (`candidates.push(...)` at lines 481, 537,
> and 602 — the general unit loop, the missionary branch, and the building loop). The
> corrected steps below follow both of those real conventions instead.

- [x] **Step 1: Write the failing tests**

Add to `tests/ai/ai-production.test.ts`, in the `describe('AI strategic production', ...)`
block, alongside the existing SAM Site threat-conditioned tests (~line 142):

```typescript
  it('scores warhead 0 with no strategic arsenal signal at peace, positive once at war (#545)', () => {
    const state = setupState(['nuclear-weapons']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);

    const atPeace = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;
    expect(atPeace.strategicArsenalValueScore).toBe(0);

    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    const atWar = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;
    expect(atWar.strategicArsenalValueScore).toBeGreaterThan(0);
    expect(atWar.score).toBeGreaterThan(atPeace.score);
  });

  it('bounds strategicArsenalValueScore at 3 simultaneous wars', () => {
    const state = setupState(['nuclear-weapons']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player', 'civ-c', 'civ-d'];

    const atThreeWars = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;

    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player', 'civ-c', 'civ-d', 'civ-e', 'civ-f'];
    const atFiveWars = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;

    expect(atFiveWars.strategicArsenalValueScore).toBe(atThreeWars.strategicArsenalValueScore);
  });

  it('is 0 for a building with no arsenalCapacityGated capability, even at war', () => {
    const state = setupState(['nuclear-weapons']);
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];
    const nuclearArsenal = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'nuclear_arsenal')!;
    expect(nuclearArsenal.strategicArsenalValueScore).toBe(0);
  });

  it('nets a positive total score for warhead when at war, unlike the reliably-negative score it would get with no signal', () => {
    const state = setupState(['nuclear-weapons']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player'];

    const warhead = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .find(candidate => candidate.itemId === 'warhead')!;
    // Regression against the real formula (score = economyScore*2 + ... +
    // strategicArsenalValueScore - productionTurns*1.5 - maintenanceRisk*3): this is
    // the whole point of Task 10 -- the net score must actually go positive for a
    // real at-war civ, not just be "greater than the at-peace case."
    expect(warhead.score).toBeGreaterThan(0);
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test ai-production -t "strategic arsenal"`
Expected: FAIL — `strategicArsenalValueScore` is `undefined` on every candidate (no
such field exists on `AIProductionCandidate` yet).

- [x] **Step 3: Add the field to `AIProductionCandidate`**

Open `src/ai/ai-production.ts` (~line 37-55), add the new field next to its closest
sibling:

```typescript
export interface AIProductionCandidate {
  itemId: string;
  kind: 'unit' | 'building';
  roles: readonly AIStrategicRole[];
  productionTurns: number;
  maintenanceImpact: number;
  roleDemandScore: number;
  economyScore: number;
  personalityScore: number;
  emergencyDefenseScore: number;
  citySpecializationScore: number;
  maintenanceRisk: number;
  defensiveEspionageScore: number;
  airDefenseThreatScore: number;
  submarineThreatScore: number;
  carrierCompositionScore: number;
  strategicArsenalValueScore: number;
  fulfilledRole?: AIStrategicRole;
  score: number;
}
```

- [x] **Step 4: Write `strategicArsenalValueScore` and set it at all three candidate sites**

Add near `economyValue` (~line 205):

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
 * item is covered automatically. Buildings only (units never carry
 * arsenalCapacityGated), so the two unit-candidate call sites always pass 0.
 */
function strategicArsenalValueScore(state: GameState, civId: string, buildingId: string): number {
  const building = BUILDINGS[buildingId];
  if (!building?.arsenalCapacityGated) return 0;
  const civ = state.civilizations[civId];
  const warCount = Math.min(civ?.diplomacy.atWarWith.length ?? 0, STRATEGIC_ARSENAL_VALUE_MAX_WARS);
  return warCount * STRATEGIC_ARSENAL_VALUE_PER_WAR;
}
```

At the general unit-candidate site (~line 481-499), add the field with value `0`:

```typescript
    candidates.push({
      itemId: unit.type,
      kind: 'unit',
      roles,
      productionTurns,
      maintenanceImpact,
      roleDemandScore,
      economyScore: 0,
      personalityScore,
      emergencyDefenseScore,
      citySpecializationScore,
      maintenanceRisk,
      defensiveEspionageScore: 0,
      airDefenseThreatScore: 0,
      submarineThreatScore: unitSubmarineThreatScore,
      carrierCompositionScore: unitCarrierCompositionScore,
      strategicArsenalValueScore: 0,
      fulfilledRole: fulfilled.role,
      score,
    });
```

At the missionary-candidate site (~line 537-554), same addition:

```typescript
        candidates.push({
          itemId: 'missionary',
          kind: 'unit',
          roles: ['missionary'],
          productionTurns,
          maintenanceImpact,
          roleDemandScore: 0,
          economyScore: 0,
          personalityScore,
          emergencyDefenseScore: 0,
          citySpecializationScore: 0,
          maintenanceRisk: maintenanceImpact,
          defensiveEspionageScore: 0,
          airDefenseThreatScore: 0,
          submarineThreatScore: 0,
          carrierCompositionScore: 0,
          strategicArsenalValueScore: 0,
          score,
        });
```

At the building-candidate site (~line 589-619), compute the real value and fold it
into `score`:

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
    candidates.push({
      itemId: building.id,
      kind: 'building',
      roles: [],
      productionTurns,
      maintenanceImpact,
      roleDemandScore: 0,
      economyScore,
      personalityScore,
      emergencyDefenseScore: 0,
      citySpecializationScore,
      maintenanceRisk,
      defensiveEspionageScore: buildingDefensiveScore,
      airDefenseThreatScore: buildingAirDefenseScore,
      submarineThreatScore: 0,
      carrierCompositionScore: 0,
      strategicArsenalValueScore: buildingStrategicArsenalScore,
      score,
```

(The closing of this literal and the rest of the loop are unchanged — only the two
new lines shown above are added to it.)

- [x] **Step 5: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test ai-production -t "strategic arsenal"`
Expected: PASS. If the "nets a positive total score" test fails, tune
`STRATEGIC_ARSENAL_VALUE_PER_WAR` up rather than deleting the test — the whole point
of this task is that the net score must actually go positive for a real warhead
build under realistic cost/turns numbers, not just be "greater than the at-peace
case."

- [x] **Step 6: Run the full `ai-production` suite to confirm no regression**

Run: `bash scripts/run-with-mise.sh yarn test ai-production`
Expected: PASS — adding a required field to `AIProductionCandidate` touches every
existing candidate assertion that does a full-object `toEqual`/`toMatchObject`
comparison rather than checking individual fields; if any such test exists in this
file, it needs `strategicArsenalValueScore: 0` (or `expect.objectContaining(...)`)
added to its expected shape. Fix those in this same commit, not a follow-up one.

- [x] **Step 7: Commit**

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

- [x] **Step 1: AI candidate-inclusion test**

Add to `tests/ai/ai-production.test.ts`, using the same real `setupState`/
`generateAIProductionCandidates` harness Task 10 used (not a hand-rolled fixture):

```typescript
  it('warhead appears among AI building candidates once eligible, scored by the generic pipeline (#545)', () => {
    const state = setupState(['nuclear-weapons']);
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };
    grantResources(state, ['uranium']);

    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'warhead')).toBe(true);

    state.civilizations['ai-1']!.techState.completed = [];
    expect(generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive)
      .some(candidate => candidate.itemId === 'warhead')).toBe(false);
  });
```

- [x] **Step 2: Structural no-id-branch assertion**

This confirms Task 10 followed the "generic, not a nuclear-specific branch" rule
literally — it should still pass after Task 10's changes, since
`strategicArsenalValueScore` is keyed off `Building.arsenalCapacityGated`, never off
the literal string `'warhead'`. This repo already has precedent for a
`readFileSync`-based source-grep structural test
(`tests/app/architecture-boundaries.test.ts`), so this follows an established
pattern, not a novel one:

```typescript
  it('ai-production.ts building-scoring loop has no warhead-id branch (#545 spec §10)', () => {
    const source = readFileSync(resolve(__dirname, '../../src/ai/ai-production.ts'), 'utf-8');
    expect(source).not.toMatch(/buildingId\s*===\s*['"]warhead['"]/);
    expect(source).not.toMatch(/\.id\s*===\s*['"]warhead['"]/);
  });
```

(Add `import { readFileSync } from 'node:fs';` and `import { resolve } from 'node:path';`
to the top of `tests/ai/ai-production.test.ts` if not already present.)

- [x] **Step 3: Content-honesty positive tests**

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

- [x] **Step 4: Run all new tests**

Run: `bash scripts/run-with-mise.sh yarn test ai-production description-honesty`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add tests/ai/ai-production.test.ts tests/systems/description-honesty.test.ts
git commit -m "test(#545): lock AI candidate coverage + content-honesty positive assertions"
```

(Adjust the exact file path in this commit to whichever content-honesty file Step 3
actually targeted.)

---

### Task 12: Full-suite verification

**Files:** none (verification only).

- [x] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests pass, including hook smoke tests.

- [x] **Step 2: Run the production build (includes typecheck)**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: succeeds, no TypeScript errors.

- [x] **Step 3: Confirm architecture boundaries (manual check — no automated test covers this)**

**Third review-pass correction:** an earlier draft of this step claimed
`tests/app/architecture-boundaries.test.ts` would verify this. It does not —
that file (read in full during this review pass) only checks `main.ts` composition-root
rules and `src/app/controllers`/`src/app/presentation` boundaries; it never inspects
`src/systems/*.ts` at all, so running it proves nothing about this MR's new files.
There is no automated test anywhere in this repo enforcing "`src/systems/*.ts` must
not import `src/ui/`/`src/renderer/`/`src/ai/`" (confirmed by search during this
review pass) — this is a convention this plan's Global Constraints commit to, checked
by hand:

Run: `grep -n "^import" src/systems/strategic-launch-system.ts`
Expected: every import line targets `@/core/types`, `@/systems/*`, or `@/systems/hex-utils`
— none from `@/ui/`, `@/renderer/`, or `@/ai/`.

- [x] **Step 4: Confirm zero pacing regression**

Run: `bash scripts/run-with-mise.sh yarn test pacing-audit pacing-reference-economy`
Expected: PASS with no snapshot diff — this MR adds zero yields anywhere (`warhead`'s
`yields` are all-zero, `missile_silo`/`missile_submarine` yields are untouched), so
this should be a pure no-op confirmation, not a real redistribution like MR1's.

- [x] **Step 5: No commit needed unless a fix was required**

If any step above required a code change, that fix belongs in the task it corrects,
with its own commit — do not create a generic "fix tests" commit here.

---

## Definition of Done

- [x] `StrategicLaunchCapability` type exists; `Building`/`UnitDefinition` both carry
  an optional `strategicLaunchPlatform` field.
- [x] `missile_silo`: `strategicLaunchPlatform: { range: 'unlimited' }`, honest
  description.
- [x] `missile_submarine`: `strategicLaunchPlatform: { range: 4 }`, existing
  `attackProfile` untouched, honest `UNIT_DESCRIPTIONS` text (no more "longest range
  of any unit" now that Silo exists).
- [x] `strategic-launch-system.ts` exports `getEligibleStrategicLaunchPlatforms`
  (capability-driven, zero type/id branches) and `getStrategicLaunchLegality` (the §6
  4-condition conjunctive resolver, each condition independently tested as
  load-bearing).
- [x] `Building.consumedOnCompletion` and `Building.arsenalCapacityGated` exist as
  generic primitives (not warhead-coupled in mechanism — driven by the field, not an
  id check), verified against the real `warhead` entry (Task 6).
- [x] `warhead` production item: repeatable, gated by Manhattan Project + capacity +
  uranium, zero yields, completion increments `civ.strategicArsenal` via the real
  turn-processing path (Task 8's integration test), never persists into
  `city.buildings`.
- [x] Every real `getAvailableBuildings` caller (city-panel.ts's real list,
  planning-system.ts ×2, ai-production.ts) passes live `arsenalStatus`; the
  locked-item-diff call in city-panel.ts deliberately does not.
- [x] Locked-item UI shows the spec-exact "Requires Manhattan Project..." / "Arsenal
  at capacity (N/N)..." text for `warhead`; an always-visible "Arsenal: N/M" line
  shows on the available (buildable) `warhead` item too, so the count is never
  invisible while under capacity (Task 7 — a real Goal 7 gap this review pass found
  and fixed, not in the original plan draft).
- [x] AI picks up `warhead` via the generic `ai-production.ts` pipeline; it also has a
  real, bounded, threat-conditioned reason to actually build one
  (`strategicArsenalValueScore`, Task 10) — no `if (buildingId === 'warhead')` branch
  anywhere (structural test, Task 11), matching spec §10's letter while closing the
  "AI would never build one across the feature's whole lifetime" gap this review
  pass found (see Global Constraints above for the full reasoning).
- [x] **No launch action, target-selection UI, or preview surface exists this MR** —
  the only new player-visible surface is the `warhead` production item, which is
  safe on its own per this plan's incremental-delivery decision (documented above).
- [x] `pacing-audit.test.ts`/`pacing-reference-economy.test.ts` show zero diff (no
  yields added anywhere this MR).
- [x] `yarn test` and `yarn build` both pass.

## Next MR

MR3: strike resolution reusing `city-siege-system.ts`'s existing floor semantics
(§7) with `preventDestruction: true` forced, plus fallout/devastation via the existing
`devastatedUntilTurn` primitive (§8). This is the first MR where `getStrategicLaunchLegality`
gets a real caller and `strategicArsenal` actually decrements — until then, MR2's
`warhead` production item is a pure stockpile with no consumer, by design (see this
plan's incremental-delivery decision).
