# #544 MR1 — Core Supply Data/Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. **Do not use subagent-driven-development or
> any other subagent-dispatching approach for this repo** — this project's
> `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task
> inline in the current session. Steps use checkbox (`- [ ]`) syntax for
> tracking.

> **Revision note (post-inline-review):** This plan was revised after a
> full inline design review across gameplay/UX/architecture/SOLID/TypeScript
> dimensions found two real defects in the first draft: (1) the actual
> `healUnit` call site was never gated — only a dead, uncalled helper existed,
> meaning the original issue's core mechanic ("no passive healing while
> unsupported") would have shipped unfixed; (2) the combat/movement penalty
> would have gone live with zero player-visible explanation, contradicting
> the design contract's own "silent changes read as bugs" principle and
> `.claude/rules/incremental-mr-completion.md`. Both are fixed below (Task 11,
> Task 13). `supply-system.ts` was also split into six focused files — the
> original single-file design mixed ~10 unrelated responsibilities, violating
> this repo's established one-file-one-responsibility convention.

**Goal:** Build the canonical, backend-focused three-state land-supply
resolver (Full Supply / Stable-but-Unsupported / Hostile-and-Unsupported with
its grace→degraded→severe cadence), covering Fort/Citadel/City coverage,
captured-source stabilization, and naval shore supply — plus the minimum
slice of real integration (healing gate, combat/movement penalties, one
unit-panel status line) needed for the mechanic to be real and honest rather
than dead or silent. Full overlay/warnings/tutorial UI is still MR2; no
Great General code is in scope here.

**Architecture:** Six small, single-responsibility pure-function modules
under `src/systems/supply-*.ts` (participation/cost, territory, sources,
naval, progression, combat-effect), composed by one thin resolver
(`supply-system.ts`) called once per civ per round from the existing
`processTurn` loop in `src/core/turn-manager.ts`. The combat -10%, movement
-1, and healing-gate integrations all flow through the existing canonical
sites (`combat-context.ts`, `calculateCombatStrengths`, the per-civ heal
loop and movement-reset in `turn-manager.ts`) — no parallel combat math, no
UI-side recomputation, no dead helpers.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

## Global Constraints

- No `Math.random()` anywhere — this feature has no randomness at all (all
  tie-breaks are deterministic sorts), so this is trivially satisfied, but do
  not introduce any.
- **This entire feature must be difficulty-invariant.** No function in this
  plan takes a difficulty parameter, reads `GameState.opponentChallenge` /
  `Civilization.challenge` (this codebase's actual difficulty representation
  — a top-level `OpponentChallenge = 'explorer' | 'standard' | 'veteran'`
  field, not a `settings.difficulty` field; verify against
  `src/core/types.ts` before assuming otherwise), or branches on it. This is
  directly required by contract §3.3/§25 ("same thresholds across
  difficulty... AI receives no mechanical cheats") and is significant enough
  to get its own regression test (Task 12), not just a code-review habit.
- All new `GameState`/`Unit`/`HexTile`/`UnitDefinition` fields are optional —
  legacy saves must load with **zero** migration writes for this MR. This
  matches the existing precedent at `src/core/types.ts:289`
  (`hasRoad?: boolean // optional: legacy saves default falsy, no migration
  needed`) — a migration is only needed when a field's absence requires an
  *active* default to be computed at load time (e.g. backfilling a
  non-optional `Record`), which none of these fields do; absence already
  means "no supply state resolved yet," treated identically to "Full Supply,
  never degraded."
- Every helper in this plan must be the single source of truth UI (MR2) and
  AI (MR5) will later consume — do not write a helper nothing calls. Every
  function defined in this plan is called from at least one real, non-test
  code path by the time its task is done (verified explicitly in Task 11 and
  Task 13, which were added specifically because the first draft of this
  plan violated this constraint for the healing gate and for player-visible
  feedback).
- **One-way dependency direction:** `supply-*.ts` modules never import from
  `combat-system.ts`, `combat-context.ts`, or `src/ui/`/`src/renderer/`.
  `combat-context.ts`/`combat-system.ts`/`turn-manager.ts`/`selected-unit-info.ts`
  import *from* the supply modules, never the reverse. This keeps the
  dependency graph acyclic and lets MR2's UI work be a pure consumer.
- Full repo test command: `bash scripts/run-with-mise.sh yarn test`. Full
  build/typecheck: `bash scripts/run-with-mise.sh yarn build`. Run both before
  the final commit of this plan.
- Reuse existing helpers, never re-derive: `hasAllianceTreaty` (diplomacy),
  `classifyOwner`/`isMajorCivOwner` (`src/core/owner-kind.ts`),
  `mapDistance`/`mapHexesInRange`/`hexKey` (`src/systems/hex-utils.ts`),
  `getFortificationTier` (`src/systems/fortification-system.ts`),
  `canLoadUnitOntoTransport`/`isLandUnit`/`isTransport` (`src/systems/transport-system.ts`,
  `src/systems/unit-system.ts`), `UNIT_CLASS_BY_TYPE` (`src/systems/unit-modifier-definitions.ts`).

---

## File Structure

Six focused modules replace the original single-file `supply-system.ts` —
each has one job, matching this codebase's established fine-grained
convention (compare: combat's own split into `combat-system.ts` /
`combat-context.ts` / `combat-reward-system.ts` / `combat-role-definitions.ts`).

- **Create** `src/systems/supply-participation.ts` — which units/ships are
  involved, and by how much (`unitParticipatesInLandSupply`,
  `getUnitLandSupplyCost`, `getShoreSupplyCapability`). Task 1, 2.
- **Create** `src/systems/supply-territory.ts` — tile-ownership
  classification for supply purposes (`classifyLandSupplyTerritory`). Task 3.
- **Create** `src/systems/supply-sources.ts` — Fort/Citadel/City coverage
  radii, captured-source stabilization, deterministic primary-source
  explanation. Task 4, 5, 6.
- **Create** `src/systems/supply-naval.ts` — naval shore-supply allocation.
  Task 9.
- **Create** `src/systems/supply-progression.ts` — the per-unit grace/
  degraded/severe state machine and recovery rules. Task 7, 8.
- **Create** `src/systems/supply-combat.ts` — how supply state affects
  combat strength and Rest/healing eligibility. Task 11.
- **Create** `src/systems/supply-system.ts` — thin composition root:
  `resolveLandSupplyForCiv` only, importing from the five modules above.
  This is the *only* supply module `turn-manager.ts` imports directly. Task 10.
- **Create** `tests/systems/supply-participation.test.ts`,
  `supply-territory.test.ts`, `supply-sources.test.ts`, `supply-naval.test.ts`,
  `supply-progression.test.ts`, `supply-combat.test.ts`,
  `supply-system.test.ts` — one test file per module, same naming
  convention as the module it covers.
- **Modify** `src/core/types.ts` — new optional fields (Task 1, 2, 7, 5).
- **Modify** `src/systems/unit-system.ts` — `landSupplyCapacity`/
  `projectsLandSupplyRange` on the transport unit line (Task 2).
- **Modify** `src/systems/transport-system.ts` — extract
  `isLandUnitCompatibleWithShip` (Task 9).
- **Modify** `src/systems/city-territory-system.ts` — stamp fort capture
  timestamp inside the existing ownership-change branch of
  `recalculateTerritory` (Task 5).
- **Modify** `src/systems/combat-system.ts` — `CombatContext` fields +
  `calculateCombatStrengths` multiplier application (Task 11).
- **Modify** `src/systems/combat-context.ts` — compute the new context fields
  in `buildCombatContextForDefender` (Task 11).
- **Modify** `src/core/turn-manager.ts` — call `resolveLandSupplyForCiv` once
  per civ per round (Task 10); gate the existing heal loop's `healUnit` call
  by `getRestAvailability` (Task 11, `turn-manager.ts:624`).
- **Modify** `src/systems/unit-system.ts` — apply the severe -1 movement
  floor inside the shared `resetUnitTurn` (Task 11, corrected during
  implementation from an initial guess of `turn-manager.ts:1104`, which is
  actually the beast-only reset branch — see Task 11 Step 6).
- **Modify** `src/ui/selected-unit-info.ts` — one supply-status line so the
  mechanic is never silently live (Task 13).

---

### Task 1: Typed participation capability — `unitParticipatesInLandSupply`

**Files:**
- Modify: `src/core/types.ts` (add to `UnitDefinition`, ~line 493)
- Create: `src/systems/supply-participation.ts`
- Test: `tests/systems/supply-participation.test.ts`

**Interfaces:**
- Produces: `unitParticipatesInLandSupply(unit: Pick<Unit, 'type' | 'owner'>, definition?: UnitDefinition): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-participation.test.ts
import { describe, expect, it } from 'vitest';
import { unitParticipatesInLandSupply } from '@/systems/supply-participation';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { BEAST_OWNER } from '@/systems/beast-system';

describe('unitParticipatesInLandSupply', () => {
  it('a normal major-civ land military unit participates', () => {
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: 'rome' })).toBe(true);
  });

  it('a naval unit does not participate', () => {
    expect(unitParticipatesInLandSupply({ type: 'trireme', owner: 'rome' })).toBe(false);
  });

  it('a settler (civilian land unit) does not participate', () => {
    expect(unitParticipatesInLandSupply({ type: 'settler', owner: 'rome' })).toBe(false);
  });

  it('a barbarian-owned unit does not participate even though the type is a normal land type', () => {
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: 'barbarian' })).toBe(false);
  });

  it('a beast-owned unit does not participate', () => {
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: BEAST_OWNER })).toBe(false);
  });

  it('an explicit participatesInLandSupply: true override wins even for a civilian-classed type', () => {
    // Simulates the future Great General unit (MR3): a non-combat, non-'civilian'-tagged
    // support type that must still participate per contract §4. No General definition
    // exists yet in MR1 — this proves the override mechanism itself works generically.
    // The definition is passed explicitly (function's second parameter) rather than
    // relying on a lookup by type, so the override case is testable without mutating
    // the shared UNIT_DEFINITIONS table.
    expect(UNIT_CLASS_BY_TYPE.worker).toContain('civilian');
    const explicit = { ...UNIT_DEFINITIONS.worker, participatesInLandSupply: true };
    expect(unitParticipatesInLandSupply({ type: 'worker', owner: 'rome' }, explicit)).toBe(true);
  });

  it('an explicit participatesInLandSupply: false override wins even for a land-military type', () => {
    const explicit = { ...UNIT_DEFINITIONS.warrior, participatesInLandSupply: false };
    expect(unitParticipatesInLandSupply({ type: 'warrior', owner: 'rome' }, explicit)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-participation.test.ts`
Expected: FAIL — `supply-participation.ts` does not exist yet.

- [ ] **Step 3: Add the type field**

```ts
// src/core/types.ts — inside `export interface UnitDefinition { ... }`, near
// the other optional capability flags (fortificationPenetration, cargoSize):
  /**
   * Whether this unit type is modeled by the land-supply system (#544).
   * Absent means "derive from domain + unit class" (see
   * `unitParticipatesInLandSupply` in supply-participation.ts) — explicit
   * `true`/`false` here always wins over that derivation, so a future
   * non-civ organized force (or the Great General unit, MR3) can opt in
   * without changing engine logic, and a land-military unit can opt out if
   * a future design needs an exception.
   */
  participatesInLandSupply?: boolean;
```

- [ ] **Step 4: Implement `unitParticipatesInLandSupply`**

```ts
// src/systems/supply-participation.ts
import type { Unit, UnitDefinition } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { UNIT_DEFINITIONS } from './unit-system';
import { UNIT_CLASS_BY_TYPE } from './unit-modifier-definitions';

/**
 * Definition-driven participation check (contract #544 §4). Explicit
 * `definition.participatesInLandSupply` always wins. Otherwise: only
 * major-civ-owned land units with a non-civilian combat class participate.
 * Barbarians, beasts, rebels, pirates, and crisis forces default to `false`
 * regardless of unit type, because a barbarian `warrior` uses the exact same
 * `UnitType` as a player `warrior` — participation cannot be a pure function
 * of type alone.
 */
export function unitParticipatesInLandSupply(
  unit: Pick<Unit, 'type' | 'owner'>,
  definition: UnitDefinition = UNIT_DEFINITIONS[unit.type],
): boolean {
  if (definition.participatesInLandSupply !== undefined) {
    return definition.participatesInLandSupply;
  }
  if (classifyOwner(unit.owner) !== 'major') return false;
  if ((definition.domain ?? 'land') !== 'land') return false;
  const classes = UNIT_CLASS_BY_TYPE[unit.type] ?? [];
  return classes.length > 0 && !classes.includes('civilian');
}
```

(`unit.type` is already narrowed to `UnitType` by the `Pick<Unit, 'type' |
'owner'>` parameter type — no redundant `as UnitType` cast needed when
indexing `UNIT_CLASS_BY_TYPE`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-participation.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/supply-participation.ts tests/systems/supply-participation.test.ts
git commit -m "feat(#544): add definition-driven land-supply participation check"
```

---

### Task 2: Supply cost/capacity typed properties, independent of cargo

**Files:**
- Modify: `src/core/types.ts` (`UnitDefinition` additions)
- Modify: `src/systems/unit-system.ts` (transport-line data)
- Modify: `src/systems/supply-participation.ts`
- Test: `tests/systems/supply-participation.test.ts`

**Interfaces:**
- Produces: `getUnitLandSupplyCost(type: UnitType): number`,
  `getShoreSupplyCapability(type: UnitType): ShoreSupplyCapability | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-participation.test.ts, appended
import { getShoreSupplyCapability, getUnitLandSupplyCost } from '@/systems/supply-participation';

describe('getUnitLandSupplyCost', () => {
  it('defaults a participating land unit to 1, matching its (unset) cargoSize default', () => {
    expect(getUnitLandSupplyCost('warrior')).toBe(1);
  });

  it('does not silently track cargoSize if cargoSize is set on a unit with no landSupplyCost', () => {
    // settler has no explicit cargoSize or landSupplyCost in UNIT_DEFINITIONS —
    // this asserts the two fields are independently authored, not derived from
    // one another at read time (contract §10).
    expect(UNIT_DEFINITIONS.settler.landSupplyCost).toBeUndefined();
    expect(getUnitLandSupplyCost('settler')).toBe(1);
  });
});

describe('getShoreSupplyCapability', () => {
  it('the Transport line has independent landSupplyCapacity matching its cargoCapacity numerically, not derived', () => {
    const cap = getShoreSupplyCapability('transport');
    expect(cap).toEqual({ landSupplyCapacity: 2, projectsLandSupplyRange: 1 });
    expect(UNIT_DEFINITIONS.transport.landSupplyCapacity).toBe(UNIT_DEFINITIONS.transport.cargoCapacity);
  });

  it('a non-shore-capable naval unit (Trireme, pure combat hull) returns null', () => {
    expect(getShoreSupplyCapability('trireme')).toBeNull();
  });

  it('a land unit returns null', () => {
    expect(getShoreSupplyCapability('warrior')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-participation.test.ts`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Add type fields**

```ts
// src/core/types.ts — UnitDefinition, alongside participatesInLandSupply:
  /**
   * How many land-supply "slots" a participating land unit consumes from a
   * naval logistics source (#544 §10). Initialized to the same number as
   * `cargoSize` where applicable, but read independently — never derived
   * from `cargoSize` at runtime, so the two can diverge in a future balance
   * pass without a code change.
   */
  landSupplyCost?: number;
  /** Naval only: total land-supply slots this ship can project (#544 §10). */
  landSupplyCapacity?: number;
  /** Naval only: hex range within which it can shore-supply (#544 §10). */
  projectsLandSupplyRange?: number;
```

- [ ] **Step 4: Flag the Transport progression as shore-supply-capable**

```ts
// src/systems/unit-system.ts — add landSupplyCapacity/projectsLandSupplyRange
// to each entry in the Transport line (lines 99-133). Value copied from
// cargoCapacity at authoring time, per contract §10 — not computed.
  transport: {
    type: 'transport', name: 'Transport', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 45,
    domain: 'naval', waterAccess: 'coastal',
    cargoCapacity: 2,
    landSupplyCapacity: 2, projectsLandSupplyRange: 1,
  },
  carrack: {
    type: 'carrack', name: 'Carrack', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 48,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 3,
    landSupplyCapacity: 3, projectsLandSupplyRange: 1,
  },
  galleon: {
    type: 'galleon', name: 'Galleon', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 80,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 4,
    landSupplyCapacity: 4, projectsLandSupplyRange: 1,
  },
  steamship: {
    type: 'steamship', name: 'Steamship', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 100,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 5,
    landSupplyCapacity: 5, projectsLandSupplyRange: 2,
  },
  troop_transport: {
    type: 'troop_transport', name: 'Troop Transport', movementPoints: 3,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: false, productionCost: 120,
    domain: 'naval', waterAccess: 'ocean',
    cargoCapacity: 6,
    landSupplyCapacity: 6, projectsLandSupplyRange: 2,
  },
```

(Steamship and Troop Transport get `projectsLandSupplyRange: 2` — a small,
conservative era-appropriate bump, documented here rather than silently; all
five values are tunable per contract §29.)

- [ ] **Step 5: Implement the two helpers**

```ts
// src/systems/supply-participation.ts, appended
import type { UnitType } from '@/core/types';

export function getUnitLandSupplyCost(type: UnitType): number {
  const definition = UNIT_DEFINITIONS[type];
  return definition.landSupplyCost ?? 1;
}

export interface ShoreSupplyCapability {
  landSupplyCapacity: number;
  projectsLandSupplyRange: number;
}

export function getShoreSupplyCapability(type: UnitType): ShoreSupplyCapability | null {
  const definition = UNIT_DEFINITIONS[type];
  if (definition.landSupplyCapacity === undefined || definition.projectsLandSupplyRange === undefined) {
    return null;
  }
  return {
    landSupplyCapacity: definition.landSupplyCapacity,
    projectsLandSupplyRange: definition.projectsLandSupplyRange,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-participation.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/supply-participation.ts tests/systems/supply-participation.test.ts
git commit -m "feat(#544): add independent landSupplyCost/landSupplyCapacity typed fields"
```

---

### Task 3: Territory classification — `classifyLandSupplyTerritory`

**Files:**
- Create: `src/systems/supply-territory.ts`
- Test: `tests/systems/supply-territory.test.ts`

**Interfaces:**
- Consumes: `hasAllianceTreaty(state, civA, civB)` (`src/systems/diplomacy-system.ts`)
- Produces: `type LandSupplyTerritoryClass = 'friendly' | 'allied' | 'unclaimed' | 'hostile'`,
  `classifyLandSupplyTerritory(state, viewerCivId, tileOwner): LandSupplyTerritoryClass`

This directly implements Finding 2 from the design spec
(`docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md` §4):
there is no open-borders/military-access concept in this codebase, so every
tile that is not friendly, not allied, and not unclaimed is `'hostile'` —
regardless of literal war state.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-territory.test.ts
import { describe, expect, it } from 'vitest';
import { classifyLandSupplyTerritory } from '@/systems/supply-territory';
import { createDiplomacyState, signTreaty } from '@/systems/diplomacy-system';

describe('classifyLandSupplyTerritory', () => {
  function makeTwoCivState() {
    const romeDiplomacy = createDiplomacyState(['carthage']);
    const carthageDiplomacy = createDiplomacyState(['rome']);
    return {
      civilizations: {
        rome: { diplomacy: romeDiplomacy } as any,
        carthage: { diplomacy: carthageDiplomacy } as any,
      },
    };
  }

  it('the viewer\'s own tile is friendly', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'rome')).toBe('friendly');
  });

  it('an unowned tile is unclaimed', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', null)).toBe('unclaimed');
  });

  it('another major civ\'s tile with no alliance is hostile, even with no war declared', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'carthage')).toBe('hostile');
  });

  it('another major civ\'s tile IS allied once an alliance treaty is signed', () => {
    const state = makeTwoCivState();
    const withTreaty = {
      civilizations: {
        ...state.civilizations,
        rome: {
          diplomacy: signTreaty(state.civilizations.rome.diplomacy, {
            id: 't1', type: 'alliance', civA: 'rome', civB: 'carthage', turn: 1,
          } as any),
        },
      },
    };
    expect(classifyLandSupplyTerritory(withTreaty as any, 'rome', 'carthage')).toBe('allied');
  });

  it('a barbarian- or minor-civ-owned tile is hostile (no access system exists)', () => {
    const state = makeTwoCivState();
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'barbarian')).toBe('hostile');
    expect(classifyLandSupplyTerritory(state as any, 'rome', 'mc-1')).toBe('hostile');
  });
});
```

Check `signTreaty`'s actual parameter shape in
`src/systems/diplomacy-system.ts:185` before finalizing this test — match its
real signature exactly (treaty object fields) rather than guessing; adjust
the test literal if the actual `Treaty` type differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-territory.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/systems/supply-territory.ts
import type { GameState } from '@/core/types';
import { hasAllianceTreaty } from './diplomacy-system';

export type LandSupplyTerritoryClass = 'friendly' | 'allied' | 'unclaimed' | 'hostile';

/**
 * No open-borders/military-access system exists in this codebase (see MR1
 * design-spec §4 Finding 2 / deferred issue H) — every non-friendly,
 * non-allied, non-unclaimed tile is treated as hostile for supply purposes,
 * regardless of whether the two civs are actually at war.
 */
export function classifyLandSupplyTerritory(
  state: Pick<GameState, 'civilizations'>,
  viewerCivId: string,
  tileOwner: string | null,
): LandSupplyTerritoryClass {
  if (tileOwner === null) return 'unclaimed';
  if (tileOwner === viewerCivId) return 'friendly';
  if (hasAllianceTreaty(state as GameState, viewerCivId, tileOwner)) return 'allied';
  return 'hostile';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-territory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/supply-territory.ts tests/systems/supply-territory.test.ts
git commit -m "feat(#544): classify tiles for land-supply purposes (no access-control system exists)"
```

---

### Task 4: Fort/Citadel/City source coverage — `getLandSupplySourceCoverage`

**Files:**
- Create: `src/systems/supply-sources.ts`
- Test: `tests/systems/supply-sources.test.ts`

**Interfaces:**
- Consumes: `getFortificationTier` (`src/systems/fortification-system.ts`),
  `mapDistance` (`src/systems/hex-utils.ts`)
- Produces: `LAND_SUPPLY_RADII` constant, `getLandSupplySourceCoverage(state, civId, coord): boolean`

Per design-spec §4 Finding 1: Fort and Citadel are the *same* `fort` tile
improvement; the radius used is keyed by the owning civ's current
`FortificationTier`, not by a separately-built structure.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-sources.test.ts
import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { LAND_SUPPLY_RADII, getLandSupplySourceCoverage } from '@/systems/supply-sources';

function makeStateWithSource(opts: {
  sourceCoord: HexCoord;
  sourceKind: 'city' | 'fort';
  citadelTech?: boolean;
  ownerId?: string;
}): GameState {
  const owner = opts.ownerId ?? 'rome';
  const map: GameMap = { width: 20, height: 20, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 20; q++) {
    for (let r = 0; r < 20; r++) {
      const coord = { q, r };
      map.tiles[hexKey(coord)] = {
        coord, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const cities: GameState['cities'] = {};
  if (opts.sourceKind === 'city') {
    cities.c1 = { id: 'c1', owner, position: opts.sourceCoord } as City;
  } else {
    map.tiles[hexKey(opts.sourceCoord)] = {
      ...map.tiles[hexKey(opts.sourceCoord)]!,
      improvement: 'fort', improvementTurnsLeft: 0,
    };
  }
  return {
    map, cities,
    civilizations: { [owner]: { techState: { completed: opts.citadelTech ? ['fortification-engineering'] : [] } } as any },
  } as unknown as GameState;
}

describe('getLandSupplySourceCoverage', () => {
  it('City radius covers a farther tile than Fort radius', () => {
    const cityState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'city' });
    const fortState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort' });
    const farCoord = { q: 10 + LAND_SUPPLY_RADII.fort + 1, r: 10 };
    expect(getLandSupplySourceCoverage(cityState, 'rome', farCoord)).toBe(true);
    expect(getLandSupplySourceCoverage(fortState, 'rome', farCoord)).toBe(false);
  });

  it('Citadel tier (fortification-engineering researched) covers farther than base Fort tier, same tile', () => {
    const fortState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort', citadelTech: false });
    const citadelState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort', citadelTech: true });
    const midCoord = { q: 10 + LAND_SUPPLY_RADII.fort + 1, r: 10 };
    expect(getLandSupplySourceCoverage(fortState, 'rome', midCoord)).toBe(false);
    expect(getLandSupplySourceCoverage(citadelState, 'rome', midCoord)).toBe(true);
  });

  it('a tile outside every source\'s radius is not covered', () => {
    const cityState = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city' });
    expect(getLandSupplySourceCoverage(cityState, 'rome', { q: 19, r: 19 })).toBe(false);
  });

  it('an enemy-owned Fort does not cover the viewer, even if in range', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort', ownerId: 'carthage' });
    expect(getLandSupplySourceCoverage(state, 'rome', { q: 10, r: 10 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-sources.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement (with Task 5's stabilization checks stubbed for now)**

```ts
// src/systems/supply-sources.ts
import type { City, GameState, HexCoord } from '@/core/types';
import { hexKey, mapDistance } from './hex-utils';
import { getFortificationTier } from './fortification-system';

/**
 * Conservative initial values (contract §29 — intentionally not locked,
 * tunable). Chosen relative to the existing city cultural-territory radius
 * scale (2-3 hexes, see `getCulturalTerritoryRadius` in
 * city-territory-system.ts) so City supply reach reads as "a bit more than
 * your territory," not "the whole continent."
 */
export const LAND_SUPPLY_RADII = {
  fort: 1,
  citadel: 2,
  city: 3,
} as const;

// Task 5 replaces both of these with real captured-source-stabilization
// checks. Stubbed here (always mature) only so Task 4's tests are green in
// isolation before Task 5 lands in the same file a few steps later.
function isCityStabilized(_state: Pick<GameState, 'turn'>, _city: Pick<City, 'conquestTurn'>): boolean { return true; }
function isFortStabilized(_state: GameState, _coord: HexCoord): boolean { return true; }

function isMatureFortAt(state: GameState, ownerId: string, coord: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || tile.owner !== ownerId || tile.improvement !== 'fort' || tile.improvementTurnsLeft > 0) return false;
  return isFortStabilized(state, coord);
}

/** True if `coord` is within Full Supply range of any friendly City or Fort/Citadel. */
export function getLandSupplySourceCoverage(
  state: GameState,
  civId: string,
  coord: HexCoord,
): boolean {
  for (const city of Object.values(state.cities)) {
    if (city.owner !== civId) continue;
    if (isCityStabilized(state, city) && mapDistance(state.map, city.position, coord) <= LAND_SUPPLY_RADII.city) {
      return true;
    }
  }
  const tier = getFortificationTier(state.civilizations[civId]?.techState.completed ?? []);
  const fortRadius = LAND_SUPPLY_RADII[tier.id];
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.improvement !== 'fort' || tile.owner !== civId) continue;
    if (isMatureFortAt(state, civId, tile.coord) && mapDistance(state.map, tile.coord, coord) <= fortRadius) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-sources.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/supply-sources.ts tests/systems/supply-sources.test.ts
git commit -m "feat(#544): Fort/Citadel/City land-supply radius coverage"
```

---

### Task 5: Captured-source stabilization

**Files:**
- Modify: `src/core/types.ts` (`HexTile.fortStabilizationSinceTurn`)
- Modify: `src/systems/city-territory-system.ts` (stamp on ownership change)
- Modify: `src/systems/supply-sources.ts` (replace Task 4's stubs)
- Test: `tests/systems/supply-sources.test.ts`

**Interfaces:**
- Consumes: `City.conquestTurn` (already exists, `src/core/types.ts:666`,
  cleared 15 turns after capture by existing occupation logic — city
  stabilization reuses this field rather than adding a duplicate).
- Produces: `isCityStabilized`, `isFortStabilized`,
  `CAPTURED_SOURCE_STABILIZATION_TURNS` constant.

Cities reuse the existing `conquestTurn` field — no new City field needed.
Forts need a new field because nothing currently timestamps a tile's last
ownership change.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-sources.test.ts, appended
import { CAPTURED_SOURCE_STABILIZATION_TURNS, isCityStabilized, isFortStabilized } from '@/systems/supply-sources';

describe('isCityStabilized', () => {
  it('a freshly captured city (conquestTurn === current turn) is not yet stabilized', () => {
    const state = { turn: 10 } as GameState;
    const city = { conquestTurn: 10 } as City;
    expect(isCityStabilized(state, city)).toBe(false);
  });

  it('a city becomes stabilized after CAPTURED_SOURCE_STABILIZATION_TURNS.city owner-turns', () => {
    const state = { turn: 10 + CAPTURED_SOURCE_STABILIZATION_TURNS.city } as GameState;
    const city = { conquestTurn: 10 } as City;
    expect(isCityStabilized(state, city)).toBe(true);
  });

  it('a city that was never captured (no conquestTurn) is always stabilized', () => {
    const state = { turn: 1 } as GameState;
    const city = {} as City;
    expect(isCityStabilized(state, city)).toBe(true);
  });
});

describe('isFortStabilized', () => {
  it('a freshly captured fort is not yet stabilized, and matures faster than a city', () => {
    const state = {
      turn: 5 + CAPTURED_SOURCE_STABILIZATION_TURNS.fort,
      map: { tiles: { [hexKey({ q: 1, r: 1 })]: { coord: { q: 1, r: 1 }, fortStabilizationSinceTurn: 5 } } },
    } as unknown as GameState;
    expect(isFortStabilized(state, { q: 1, r: 1 })).toBe(true);
    expect(CAPTURED_SOURCE_STABILIZATION_TURNS.fort).toBeLessThan(CAPTURED_SOURCE_STABILIZATION_TURNS.city);
  });

  it('a fort with no stabilization timestamp (never captured) is always stabilized', () => {
    const state = { turn: 1, map: { tiles: { k: { coord: { q: 0, r: 0 } } } } } as unknown as GameState;
    expect(isFortStabilized(state, { q: 0, r: 0 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-sources.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the tile field**

```ts
// src/core/types.ts — HexTile, alongside improvementOwner:
  /**
   * Turn a completed Fort improvement most recently changed owner (#544).
   * `undefined` means "never captured" — always stabilized. Reset on every
   * ownership change (contract §7), mirroring `City.conquestTurn`'s
   * existing pattern for cities.
   */
  fortStabilizationSinceTurn?: number;
```

- [ ] **Step 4: Stamp it in `recalculateTerritory`**

```ts
// src/systems/city-territory-system.ts — inside the `if (winner)` branch of
// the ownership-resolution loop (~line 270), where `nextTile` is already
// built from `{ ...tile, owner: winner.civId }`:
      let nextTile = { ...tile, owner: winner.civId };
      if (previousOwner !== winner.civId && tile.improvement !== 'none' && tile.improvementTurnsLeft > 0) {
        nextTile = { ...nextTile, improvement: 'none', improvementTurnsLeft: 0 };
        nextUnits = clearWorkerTasksForCoord(nextUnits, tile.coord);
      }
      // #544: a completed Fort survives ownership change (unlike an
      // in-progress improvement, cleared above) but must restart
      // stabilization under its new owner.
      if (previousOwner !== winner.civId && tile.improvement === 'fort' && tile.improvementTurnsLeft === 0) {
        nextTile = { ...nextTile, fortStabilizationSinceTurn: state.turn };
      }
      nextTiles[key] = nextTile;
```

- [ ] **Step 5: Implement stabilization checks, replacing Task 4's stubs**

```ts
// src/systems/supply-sources.ts — replace the two Task 4 stub functions
// entirely with:
export const CAPTURED_SOURCE_STABILIZATION_TURNS = {
  city: 5,
  fort: 2,
} as const;

export function isCityStabilized(state: Pick<GameState, 'turn'>, city: Pick<City, 'conquestTurn'>): boolean {
  if (city.conquestTurn === undefined) return true;
  return state.turn - city.conquestTurn >= CAPTURED_SOURCE_STABILIZATION_TURNS.city;
}

export function isFortStabilized(state: GameState, coord: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || tile.fortStabilizationSinceTurn === undefined) return true;
  return state.turn - tile.fortStabilizationSinceTurn >= CAPTURED_SOURCE_STABILIZATION_TURNS.fort;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-sources.test.ts`
Expected: PASS. Also re-run the full `city-territory-system.test.ts` suite to
confirm the new stamping branch doesn't change any existing territory-
resolution assertion:

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-territory-system.test.ts`
Expected: PASS, unchanged pass count.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/city-territory-system.ts src/systems/supply-sources.ts tests/systems/supply-sources.test.ts
git commit -m "feat(#544): captured-source stabilization for cities and forts"
```

---

### Task 6: Deterministic primary-source explanation — `getPrimarySupplySource`

**Files:**
- Modify: `src/systems/supply-sources.ts`
- Test: `tests/systems/supply-sources.test.ts`

**Interfaces:**
- Produces: `type SupplySourceRef = { kind: 'city' | 'fort'; id: string; coord: HexCoord }`,
  `getPrimarySupplySource(state, civId, coord): SupplySourceRef | null`

Contract §6: "Overlapping land sources do not stack... choose one
deterministic primary source: nearest valid source, then stable tie-breaker."
This is UI-facing (Task 13's unit-panel line, and MR2's fuller overlay) but
built here per this plan's Global Constraints — it is pure and trivially
testable alongside the coverage logic it mirrors.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-sources.test.ts, appended
import { getPrimarySupplySource } from '@/systems/supply-sources';

describe('getPrimarySupplySource', () => {
  it('picks the nearer of two in-range sources', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'city' });
    state.cities.c2 = { id: 'c2', owner: 'rome', position: { q: 11, r: 10 } } as City;
    const result = getPrimarySupplySource(state, 'rome', { q: 11, r: 11 });
    expect(result?.id).toBe('c2');
  });

  it('breaks ties deterministically by sorted hex key', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'city' });
    state.cities.c2 = { id: 'c2', owner: 'rome', position: { q: 9, r: 10 } } as City; // closer to target below
    const target = { q: 9, r: 10 };
    const result = getPrimarySupplySource(state, 'rome', target);
    expect(result?.id).toBe('c2');
  });

  it('returns null when nothing covers the tile', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city' });
    expect(getPrimarySupplySource(state, 'rome', { q: 19, r: 19 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-sources.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/systems/supply-sources.ts, appended
export interface SupplySourceRef {
  kind: 'city' | 'fort';
  id: string;
  coord: HexCoord;
}

export function getPrimarySupplySource(
  state: GameState,
  civId: string,
  coord: HexCoord,
): SupplySourceRef | null {
  const tier = getFortificationTier(state.civilizations[civId]?.techState.completed ?? []);
  const fortRadius = LAND_SUPPLY_RADII[tier.id];
  const candidates: Array<SupplySourceRef & { distance: number }> = [];

  for (const city of Object.values(state.cities)) {
    if (city.owner !== civId || !isCityStabilized(state, city)) continue;
    const distance = mapDistance(state.map, city.position, coord);
    if (distance <= LAND_SUPPLY_RADII.city) candidates.push({ kind: 'city', id: city.id, coord: city.position, distance });
  }
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.improvement !== 'fort' || tile.owner !== civId || !isFortStabilized(state, tile.coord)) continue;
    const distance = mapDistance(state.map, tile.coord, coord);
    if (distance <= fortRadius) candidates.push({ kind: 'fort', id: hexKey(tile.coord), coord: tile.coord, distance });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance || hexKey(a.coord).localeCompare(hexKey(b.coord)));
  const { distance: _distance, ...ref } = candidates[0]!;
  return ref;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-sources.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/supply-sources.ts tests/systems/supply-sources.test.ts
git commit -m "feat(#544): deterministic primary-supply-source explanation for UI"
```

---

### Task 7: Overextension stage state machine — `advanceOverextensionStage`

**Files:**
- Modify: `src/core/types.ts` (`Unit.landSupply`)
- Create: `src/systems/supply-progression.ts`
- Test: `tests/systems/supply-progression.test.ts`

**Interfaces:**
- Produces: `type LandSupplyState = 'full' | 'stable-unsupported' | 'grace' | 'degraded' | 'severe'`,
  `interface UnitLandSupplyStatus`, `advanceOverextensionStage(current, territoryClass, isSupplied): UnitLandSupplyStatus`

Implements the contract §3.3 cadence table exactly: hostile-unsupported turns
1-2 grace, 3-4 degraded (-10%), 5+ severe (-10% and -1 move, min move 1 — the
min-move floor itself is applied at the movement-reset site in Task 11, not
here; this function only tracks *stage*).

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-progression.test.ts
import { describe, expect, it } from 'vitest';
import { advanceOverextensionStage, type UnitLandSupplyStatus } from '@/systems/supply-progression';

describe('advanceOverextensionStage', () => {
  const start: UnitLandSupplyStatus = { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };

  it('full supply resets the hostile counter to 0', () => {
    const result = advanceOverextensionStage({ ...start, hostileUnsupportedTurns: 3, state: 'degraded' }, 'friendly', true);
    expect(result).toEqual({ state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  });

  it('friendly/allied/unclaimed territory without a source is stable-unsupported, no degradation', () => {
    for (const territoryClass of ['friendly', 'allied', 'unclaimed'] as const) {
      const result = advanceOverextensionStage(start, territoryClass, false);
      expect(result.state).toBe('stable-unsupported');
      expect(result.hostileUnsupportedTurns).toBe(0);
    }
  });

  it('hostile+unsupported turns 1-2 are grace (no penalty)', () => {
    let status = advanceOverextensionStage(start, 'hostile', false);
    expect(status).toEqual({ state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status).toEqual({ state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
  });

  it('hostile+unsupported turns 3-4 are degraded (-10% combat)', () => {
    let status: UnitLandSupplyStatus = { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 };
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('degraded');
    expect(status.hostileUnsupportedTurns).toBe(3);
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('degraded');
    expect(status.hostileUnsupportedTurns).toBe(4);
  });

  it('hostile+unsupported turn 5+ is severe (-10% combat and -1 move)', () => {
    let status: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 4, suppliedTurnsSinceRecovery: 0 };
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('severe');
    expect(status.hostileUnsupportedTurns).toBe(5);
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('severe');
    expect(status.hostileUnsupportedTurns).toBe(6);
  });

  it('leaving hostile territory (even without gaining a source) resets the hostile counter to 0', () => {
    const degraded: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };
    const result = advanceOverextensionStage(degraded, 'unclaimed', false);
    expect(result).toEqual({ state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the type and constant**

```ts
// src/core/types.ts
export type LandSupplyState = 'full' | 'stable-unsupported' | 'grace' | 'degraded' | 'severe';

export interface UnitLandSupplyStatus {
  state: LandSupplyState;
  /** Consecutive owner-turns ending in hostile territory with no covering source. Resets to 0 the instant either condition is false. */
  hostileUnsupportedTurns: number;
  /** Consecutive owner-turns at Full Supply without attacking — drives field-recovery clearing (Task 8). */
  suppliedTurnsSinceRecovery: number;
}

// Unit interface — near geneTherapyReady:
  /** #544 land-supply progression. Absent means "never resolved" — treated identically to Full Supply. */
  landSupply?: UnitLandSupplyStatus;
```

- [ ] **Step 4: Implement**

```ts
// src/systems/supply-progression.ts
import type { UnitLandSupplyStatus, LandSupplyState } from '@/core/types';
import type { LandSupplyTerritoryClass } from './supply-territory';

export type { UnitLandSupplyStatus, LandSupplyState };

export const OVEREXTENSION_STAGE_TURNS = {
  graceEndsAfter: 2,   // turns 1-2 grace
  degradedEndsAfter: 4, // turns 3-4 degraded, 5+ severe
} as const;

function stageForHostileTurns(turns: number): LandSupplyState {
  if (turns <= OVEREXTENSION_STAGE_TURNS.graceEndsAfter) return 'grace';
  if (turns <= OVEREXTENSION_STAGE_TURNS.degradedEndsAfter) return 'degraded';
  return 'severe';
}

export function advanceOverextensionStage(
  current: UnitLandSupplyStatus,
  territoryClass: LandSupplyTerritoryClass,
  isSupplied: boolean,
): UnitLandSupplyStatus {
  if (isSupplied) {
    return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: current.suppliedTurnsSinceRecovery };
  }
  if (territoryClass !== 'hostile') {
    return { state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
  }
  const hostileUnsupportedTurns = current.hostileUnsupportedTurns + 1;
  return { state: stageForHostileTurns(hostileUnsupportedTurns), hostileUnsupportedTurns, suppliedTurnsSinceRecovery: 0 };
}
```

**Extensibility seam, not implemented now:** MR4's Great General passive
command stabilization (contract §16) "pauses degradation" for nearby units
*without* making them Full Supply — a third input this function doesn't
accept yet. `advanceOverextensionStage` will gain a `stabilizedByGeneral:
boolean` parameter in MR4 (defaulting to `false` so MR1-MR3 callers are
unaffected). Documented here so that future signature change reads as a
planned extension point, not a surprise.

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/supply-progression.ts tests/systems/supply-progression.test.ts
git commit -m "feat(#544): grace/degraded/severe overextension state machine"
```

---

### Task 8: Base and field recovery — `resolveSupplyRecoveryForUnit`

**Files:**
- Modify: `src/systems/supply-progression.ts`
- Test: `tests/systems/supply-progression.test.ts`

**Interfaces:**
- Produces: `resolveSupplyRecoveryForUnit(status, isSupplied, justEnteredBaseTile, attackedThisTurn): UnitLandSupplyStatus`

Contract §8 rules covered: immediate clearing only by physically occupying a
base tile (not merely being in radius); field recovery clears all penalties
after one full supplied owner-turn without attacking; combat reward HP is
explicitly untouched by this function (contract: "do not collapse all HP
gain into one global supply gate" — HP restoration stays in
`combat-reward-system.ts`, entirely separate from this state machine).

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-progression.test.ts, appended
import { resolveSupplyRecoveryForUnit } from '@/systems/supply-progression';

describe('resolveSupplyRecoveryForUnit', () => {
  const degraded: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };

  it('physically entering a base tile clears penalties immediately, same turn', () => {
    const result = resolveSupplyRecoveryForUnit(degraded, true, true, false);
    expect(result).toEqual({ state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  });

  it('gaining Full Supply in the field (not on a base tile) does not clear penalties the same turn', () => {
    const result = resolveSupplyRecoveryForUnit(degraded, true, false, false);
    expect(result.state).toBe('full'); // stops worsening immediately
    expect(result.suppliedTurnsSinceRecovery).toBe(1); // counts toward the 1-turn field-recovery requirement
  });

  it('a second consecutive full-supply owner-turn in the field, without attacking, clears remaining penalties', () => {
    const oneturn: UnitLandSupplyStatus = { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 1 };
    const result = resolveSupplyRecoveryForUnit(oneturn, true, false, false);
    expect(result.suppliedTurnsSinceRecovery).toBe(2);
  });

  it('attacking resets the field-recovery counter even while supplied', () => {
    const oneturn: UnitLandSupplyStatus = { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 1 };
    const result = resolveSupplyRecoveryForUnit(oneturn, true, false, true);
    expect(result.suppliedTurnsSinceRecovery).toBe(0);
  });

  it('losing supply while not on a base tile does not clear penalties', () => {
    const result = resolveSupplyRecoveryForUnit(degraded, false, false, false);
    expect(result).toBe(degraded); // unchanged reference — caller's advanceOverextensionStage handles this branch instead
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/systems/supply-progression.ts, appended
export const FIELD_RECOVERY_OWNER_TURNS = 1;

/**
 * Called only when `isSupplied` is true (caller: `resolveLandSupplyForCiv`,
 * Task 10) — `advanceOverextensionStage` already handles the "still not
 * supplied" branch. Physically occupying a base tile clears immediately;
 * otherwise penalties clear only after `FIELD_RECOVERY_OWNER_TURNS`
 * consecutive supplied owner-turns without attacking (contract §8).
 */
export function resolveSupplyRecoveryForUnit(
  current: UnitLandSupplyStatus,
  isSupplied: boolean,
  justEnteredBaseTile: boolean,
  attackedThisTurn: boolean,
): UnitLandSupplyStatus {
  if (!isSupplied) return current;
  if (justEnteredBaseTile) {
    return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
  }
  const suppliedTurnsSinceRecovery = attackedThisTurn ? 0 : current.suppliedTurnsSinceRecovery + 1;
  return { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/supply-progression.ts tests/systems/supply-progression.test.ts
git commit -m "feat(#544): base and field supply-penalty recovery rules"
```

---

### Task 9: Naval shore supply — `getNavalShoreSupplyAssignments`

**Files:**
- Create: `src/systems/supply-naval.ts`
- Modify: `src/systems/transport-system.ts` (extract `isLandUnitCompatibleWithShip`)
- Test: `tests/systems/supply-naval.test.ts`

**Interfaces:**
- Consumes: `getShoreSupplyCapability`, `getUnitLandSupplyCost`
  (`supply-participation.ts`), `unitParticipatesInLandSupply`,
  `isLandUnitCompatibleWithShip` (new, `transport-system.ts`), `mapDistance`
- Produces: `getNavalShoreSupplyAssignments(state, civId): Set<string>` (unit
  ids that receive naval shore supply this round)

Contract §10 allocation algorithm: each ship independently allocates
capacity to compatible, in-range, deployed (not embarked) land units,
closest-first, stable tie-break, skip-if-doesn't-fit-continue, no pooling
across ships, one unit supplied by at most one source, full recompute every
round.

**Compatibility note:** `canLoadUnitOntoTransport` cannot be called directly
here — it requires the unit to be *adjacent and able to load this turn*
(action-state checks like `hasActed`/`movementPointsLeft`), which is the
wrong question for "is this unit's type transportable by this ship's type at
all." Reuse only the type-compatibility half of that logic
(`isLandUnit(unit) && isTransport(ship) && unit.owner === ship.owner`) via a
new, narrower shared predicate `isLandUnitCompatibleWithShip` factored out of
`canLoadUnitOntoTransport` in the same change, so both call sites stay
provably in sync instead of duplicating the ownership/domain checks.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-naval.test.ts
import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { getNavalShoreSupplyAssignments } from '@/systems/supply-naval';

describe('getNavalShoreSupplyAssignments', () => {
  function makeUnit(id: string, overrides: Partial<Unit> = {}): Unit {
    return { id, type: 'warrior', owner: 'rome', position: { q: 0, r: 0 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false, ...overrides } as Unit;
  }

  it('a compatible unit within range and capacity is supplied', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 5, r: 5 } });
    const soldier = makeUnit('u1', { position: { q: 5, r: 6 } }); // adjacent, in range 1
    const state = { units: { s1: ship, u1: soldier }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(true);
  });

  it('an incompatible unit type (naval) is never assigned shore supply', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 5, r: 5 } });
    const otherShip = makeUnit('u1', { type: 'trireme', position: { q: 5, r: 6 } });
    const state = { units: { s1: ship, u1: otherShip }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(false);
  });

  it('a unit outside projectsLandSupplyRange is skipped even if capacity remains', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const farUnit = makeUnit('u1', { position: { q: 10, r: 10 } });
    const state = { units: { s1: ship, u1: farUnit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(false);
  });

  it('closest-first, skip-and-continue: a Transport (capacity 2) supplies both of two cost-1 units at the same distance', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } }); // capacity 2
    const first = makeUnit('u1', { position: { q: 0, r: 1 } }); // cost 1
    const second = makeUnit('u2', { position: { q: 0, r: 1 } }); // cost 1, same tile/distance
    const state = { units: { s1: ship, u1: first, u2: second }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    const result = getNavalShoreSupplyAssignments(state, 'rome');
    expect(result.has('u1')).toBe(true);
    expect(result.has('u2')).toBe(true); // capacity 2 fits both cost-1 units
  });

  it('multiple ships do not pool capacity; closest ship wins for a given unit', () => {
    const near = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const far = makeUnit('s2', { type: 'transport', position: { q: 5, r: 5 } });
    const unit = makeUnit('u1', { position: { q: 0, r: 1 } });
    const state = { units: { s1: near, s2: far, u1: unit }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(true);
  });

  it('embarked units (transportId set) never consume shore-supply capacity', () => {
    const ship = makeUnit('s1', { type: 'transport', position: { q: 0, r: 0 } });
    const embarked = makeUnit('u1', { position: { q: 0, r: 1 }, transportId: 's1' });
    const state = { units: { s1: ship, u1: embarked }, map: { width: 20, wrapsHorizontally: false } } as unknown as GameState;
    expect(getNavalShoreSupplyAssignments(state, 'rome').has('u1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-naval.test.ts`
Expected: FAIL

- [ ] **Step 3: Factor out the shared compatibility predicate**

```ts
// src/systems/transport-system.ts — extract from canLoadUnitOntoTransport's
// existing checks (isTransport(transport), isLandUnit(unit), unit.owner ===
// transport.owner) into a standalone export used by both callers:
export function isLandUnitCompatibleWithShip(unit: Unit, ship: Unit): boolean {
  return isTransport(ship) && isLandUnit(unit) && unit.owner === ship.owner;
}
```

Update `canLoadUnitOntoTransport` to call this instead of repeating the three
checks inline:

```ts
export function canLoadUnitOntoTransport(
  state: GameState,
  unitId: string,
  transportId: string,
): TransportCheckResult {
  const unit = state.units[unitId];
  if (!unit) return failure('missing-unit', 'Unit not found');
  const transport = state.units[transportId];
  if (!transport) return failure('missing-transport', 'Transport not found');
  if (!isTransport(transport)) return failure('not-transport', 'Choose a Transport');
  if (!isLandUnit(unit)) return failure('not-land-unit', 'Only land units can load onto a Transport');
  if (unit.owner !== transport.owner) return failure('wrong-owner', 'Use a friendly Transport');
  // ... rest unchanged (already-loaded, no-action, adjacency, capacity checks)
```

(Only the compatibility triple is extracted; the rest of the function's
action-state checks are untouched.)

- [ ] **Step 4: Implement the allocator**

```ts
// src/systems/supply-naval.ts
import type { GameState } from '@/core/types';
import { hexKey, mapDistance } from './hex-utils';
import { getShoreSupplyCapability, getUnitLandSupplyCost, unitParticipatesInLandSupply } from './supply-participation';
import { isLandUnitCompatibleWithShip } from './transport-system';

export function getNavalShoreSupplyAssignments(state: GameState, civId: string): Set<string> {
  const assigned = new Set<string>();
  const ships = Object.values(state.units)
    .filter(unit => unit.owner === civId && getShoreSupplyCapability(unit.type) !== null)
    .sort((a, b) => hexKey(a.position).localeCompare(hexKey(b.position)));

  const candidateUnits = Object.values(state.units).filter(unit =>
    unit.owner === civId && !unit.transportId && unitParticipatesInLandSupply(unit),
  );

  for (const ship of ships) {
    const capability = getShoreSupplyCapability(ship.type)!;
    const inRange = candidateUnits
      .filter(unit => !assigned.has(unit.id) && isLandUnitCompatibleWithShip(unit, ship))
      .filter(unit => mapDistance(state.map, ship.position, unit.position) <= capability.projectsLandSupplyRange)
      .sort((a, b) =>
        mapDistance(state.map, ship.position, a.position) - mapDistance(state.map, ship.position, b.position)
        || hexKey(a.position).localeCompare(hexKey(b.position)),
      );

    let remainingCapacity = capability.landSupplyCapacity;
    for (const unit of inRange) {
      const cost = getUnitLandSupplyCost(unit.type);
      if (cost > remainingCapacity) continue; // skip, don't stop — contract §10 step 4
      assigned.add(unit.id);
      remainingCapacity -= cost;
    }
  }
  return assigned;
}
```

`isLandUnitCompatibleWithShip` deliberately does not check `domain: 'naval'`
on the ship itself beyond `isTransport` — that mirrors
`canLoadUnitOntoTransport`'s existing behavior exactly (no drift between the
two compatibility checks, per this task's stated goal).

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-naval.test.ts`
Expected: PASS. Also re-run transport tests to confirm the extraction didn't
change behavior:

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/transport-system.test.ts`
Expected: PASS, unchanged pass count.

- [ ] **Step 6: Commit**

```bash
git add src/systems/transport-system.ts src/systems/supply-naval.ts tests/systems/supply-naval.test.ts
git commit -m "feat(#544): geography-first naval shore supply allocation"
```

---

### Task 10: Compose the resolver and wire it into `processTurn`

**Files:**
- Create: `src/systems/supply-system.ts`
- Modify: `src/core/turn-manager.ts`
- Test: `tests/systems/supply-system.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 1-9.
- Produces: `resolveLandSupplyForCiv(state: GameState, civId: string): GameState`
  (immutable, per `.claude/rules/game-systems.md` — returns a new `GameState`
  with `units` patched, never mutates `state.units[id] = ...`).

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/systems/supply-system.test.ts
import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { resolveLandSupplyForCiv } from '@/systems/supply-system';
// reuse the same makeStateWithSource helper pattern as supply-sources.test.ts
// (duplicated locally per-file rather than shared, matching this repo's
// existing convention of small self-contained test fixtures per test file)

describe('resolveLandSupplyForCiv (integration)', () => {
  it('a participating land unit sitting in hostile territory with no source starts accumulating overextension', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    state.units = {
      u1: { id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit,
    };
    state.map.tiles[hexKey({ q: 19, r: 19 })] = { ...state.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    const next = resolveLandSupplyForCiv(state, 'rome');
    expect(next.units.u1!.landSupply).toEqual({ state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    expect(next).not.toBe(state); // immutability — new object, per game-systems.md
    expect(state.units.u1!.landSupply).toBeUndefined(); // input untouched
  });

  it('a non-participating unit (settler) is left completely untouched', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    state.units = { s1: { id: 's1', type: 'settler', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit };
    const next = resolveLandSupplyForCiv(state, 'rome');
    expect(next.units.s1!.landSupply).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-system.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the composition function**

```ts
// src/systems/supply-system.ts
import type { GameState, UnitLandSupplyStatus } from '@/core/types';
import { hexKey } from './hex-utils';
import { unitParticipatesInLandSupply } from './supply-participation';
import { classifyLandSupplyTerritory } from './supply-territory';
import { getLandSupplySourceCoverage } from './supply-sources';
import { getNavalShoreSupplyAssignments } from './supply-naval';
import { advanceOverextensionStage, resolveSupplyRecoveryForUnit } from './supply-progression';

export function resolveLandSupplyForCiv(state: GameState, civId: string): GameState {
  const shoreAssignments = getNavalShoreSupplyAssignments(state, civId);
  let units = state.units;
  let changed = false;

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId || unit.transportId) continue;
    if (!unitParticipatesInLandSupply(unit)) continue;

    const tile = state.map.tiles[hexKey(unit.position)];
    const territoryClass = classifyLandSupplyTerritory(state, civId, tile?.owner ?? null);
    const coveredByLandSource = getLandSupplySourceCoverage(state, civId, unit.position);
    const isSupplied = coveredByLandSource || shoreAssignments.has(unit.id);

    const current: UnitLandSupplyStatus = unit.landSupply ?? { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };
    const justEnteredBaseTile = tile?.owner === civId && (tile.improvement === 'fort' || Object.values(state.cities).some(city => city.owner === civId && hexKey(city.position) === hexKey(unit.position)));
    const attackedThisTurn = unit.hasActed === true; // conservative proxy for MR1 — see Task 11's review note

    const next = isSupplied
      ? resolveSupplyRecoveryForUnit(current, true, justEnteredBaseTile, attackedThisTurn)
      : advanceOverextensionStage(current, territoryClass, false);

    if (next !== current || unit.landSupply === undefined) {
      units = units === state.units ? { ...state.units } : units;
      units[unit.id] = { ...unit, landSupply: next };
      changed = true;
    }
  }

  return changed ? { ...state, units } : state;
}
```

**Known simplification flagged for Task 11's review:** `attackedThisTurn`
uses `unit.hasActed` as a proxy, which is true for *any* completed action
(including a non-attack move that exhausts the unit), not only attacking.
This over-resets the field-recovery counter in a small number of cases
(a unit that moved but didn't attack loses one turn of field-recovery
progress it should have kept) — safe-by-default (never *under*-resets, so it
can't let a unit recover early), but not exactly the contract's "without
attacking" wording. Task 11 revisits this once actual combat resolution data
is available to check; accept the conservative proxy if that review finds no
observable player-facing difference across the scenario matrix.

- [ ] **Step 4: Wire into `processTurn`**

```ts
// src/core/turn-manager.ts — inside the existing
// `for (const [civId, civ] of Object.entries(newState.civilizations))` loop
// (starts at line 184), add near the top of each iteration, before the
// existing heal loop at line ~600 (Task 11 depends on running *after* this
// call, in the same iteration, so `unit.landSupply` is fresh before healing
// is decided):
    newState = resolveLandSupplyForCiv(newState, civId);
```

Add the import at the top of `turn-manager.ts`:

```ts
import { resolveLandSupplyForCiv } from '@/systems/supply-system';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-system.test.ts tests/core/turn-manager.test.ts`
Expected: PASS, and no existing `turn-manager.test.ts` assertion changes
(supply resolution is additive — it only ever writes a new `landSupply`
field, never touches existing fields other systems in that loop read).

- [ ] **Step 6: Commit**

```bash
git add src/systems/supply-system.ts src/core/turn-manager.ts tests/systems/supply-system.test.ts
git commit -m "feat(#544): wire land-supply resolution into end-of-round turn processing"
```

---

### Task 11: Combat -10%, movement -1, and the real healing gate

**Files:**
- Create: `src/systems/supply-combat.ts`
- Modify: `src/systems/combat-system.ts` (`CombatContext`, `calculateCombatStrengths`)
- Modify: `src/systems/combat-context.ts` (`buildCombatContextForDefender`)
- Modify: `src/core/turn-manager.ts` (heal-loop gate at `~line 624`)
- Modify: `src/systems/unit-system.ts` (`resetUnitTurn`, movement floor — corrected site, see Step 6)
- Test: `tests/systems/supply-combat.test.ts`, `tests/systems/combat-system.test.ts`, `tests/core/turn-manager.test.ts`

**Why this task exists (and why it's not optional):** the design contract's
July addendum is explicit — *"the no-heal rule must be visible where the
player looks... Silent healing changes read as bugs"* — and this repo's own
`.claude/rules/end-to-end-wiring.md` states *"if you create a utility
function, it MUST be called from at least one code path — dead code is a
bug."* A first draft of this plan built `getRestAvailability` but never
called it from the actual healing code path (`healUnit` at
`src/systems/unit-system.ts:806`, called from `src/core/turn-manager.ts:624`)
— meaning the *original, oldest, most basic ask in issue #544* ("no passive
healing while unsupported") would have shipped completely unfixed while a
brand-new, unrelated -10%/-1-move penalty went live instead. This task wires
all three real effects into their real call sites.

**Interfaces:**
- Produces: `resolveLandSupplyCombatPenalty(unit): { multiplier: number; label?: string }`
  (mirrors `resolveFortificationDefense`'s exact shape — `fortification-system.ts:111`),
  `getRestAvailability(status): { canRest: boolean; reason?: string }` — the
  **single** predicate both the real heal-loop gate (this task) and MR2's
  Rest-button disabled state will consume, so the two can never drift.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/systems/supply-combat.test.ts
import { describe, expect, it } from 'vitest';
import type { Unit } from '@/core/types';
import { getRestAvailability, resolveLandSupplyCombatPenalty } from '@/systems/supply-combat';

describe('resolveLandSupplyCombatPenalty', () => {
  it('full supply and stable-unsupported and grace all apply no penalty', () => {
    for (const state of ['full', 'stable-unsupported', 'grace'] as const) {
      const unit = { landSupply: { state, hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } } as Unit;
      expect(resolveLandSupplyCombatPenalty(unit).multiplier).toBe(1);
    }
  });

  it('degraded and severe both apply exactly -10%', () => {
    for (const state of ['degraded', 'severe'] as const) {
      const unit = { landSupply: { state, hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 } } as Unit;
      const result = resolveLandSupplyCombatPenalty(unit);
      expect(result.multiplier).toBeCloseTo(0.9);
      expect(result.label).toContain('Overextended');
    }
  });

  it('a unit with no landSupply status (never resolved) applies no penalty', () => {
    expect(resolveLandSupplyCombatPenalty({} as Unit).multiplier).toBe(1);
  });
});

describe('getRestAvailability', () => {
  it('stable-unsupported, grace, degraded, and severe all cannot heal via Rest', () => {
    for (const state of ['stable-unsupported', 'grace', 'degraded', 'severe'] as const) {
      const result = getRestAvailability({ state, hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
      expect(result.canRest).toBe(false);
      expect(result.reason).toBe('Cannot recover while unsupported — restore supply first.');
    }
  });

  it('full supply can Rest normally', () => {
    const result = getRestAvailability({ state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    expect(result.canRest).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('a unit with no landSupply status (never resolved) can Rest normally', () => {
    expect(getRestAvailability(undefined).canRest).toBe(true);
  });
});
```

```ts
// tests/systems/combat-system.test.ts — add a new describe block alongside
// the existing "Fortification combat context" block (~line 436), reusing
// this file's own real fixtures (createUnit/generateMap/mkC — do NOT invent
// new fixture names; grep this file's top-of-file helpers first, which is
// exactly how this test was written):
describe('land-supply combat context (#544)', () => {
  it('applies a separate land-supply multiplier supplied by the shared context, symmetric on both sides', () => {
    const map = generateMap(30, 30, 'land-supply-context');
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC());
    const base = calculateCombatStrengths(attacker, defender, map);
    const attackerPenalized = calculateCombatStrengths(attacker, defender, map, { attackerLandSupplyMultiplier: 0.9 });
    const defenderPenalized = calculateCombatStrengths(attacker, defender, map, { defenderLandSupplyMultiplier: 0.9 });
    expect(attackerPenalized.attackerStrength).toBeCloseTo(base.attackerStrength * 0.9, 5);
    expect(defenderPenalized.defenderStrength).toBeCloseTo(base.defenderStrength * 0.9, 5);
  });

  it('buildCombatContextForDefender computes the penalty from each unit\'s own landSupply state', () => {
    const state = createNewGame(undefined, 'land-supply-hot-seat-context', 'small');
    const attacker = { ...createUnit('warrior', 'player', { q: 4, r: 4 }, mkC()), id: 'attacker', landSupply: { state: 'severe' as const, hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 } };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 5, r: 4 }, mkC()), id: 'defender' };
    state.currentPlayer = 'player';
    state.units = { attacker, defender };
    state.civilizations.player.units = [attacker.id];
    state.civilizations['ai-1'].units = [defender.id];

    const context = buildCombatContextForDefender(state, attacker, defender);

    expect(context.attackerLandSupplyMultiplier).toBeCloseTo(0.9);
    expect(context.defenderLandSupplyMultiplier).toBe(1);
    expect(context.attackerLandSupplyFact).toMatchObject({ label: 'Overextended -10%', outcome: 'applied' });
  });
});
```

```ts
// tests/core/turn-manager.test.ts — add a new test proving the real
// healing gate, in the same file/style as the existing "heals qualifying
// armor only in each two-human hot-seat player's own Tank Depot city" test
// (~line 126):
describe('land-supply healing gate (#544)', () => {
  it('a degraded unit does not receive passive healing even when idle', () => {
    const state = createNewGame('rome', 'land-supply-heal-gate', 'small');
    const unitId = state.civilizations.rome.units[0]!;
    state.units[unitId] = {
      ...state.units[unitId]!,
      health: 50,
      hasMoved: false,
      hasActed: false,
      landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    };
    const next = processTurn(state, new EventBus());
    expect(next.units[unitId]!.health).toBe(50);
  });

  it('a fully-supplied idle unit still receives normal passive healing (no regression)', () => {
    const state = createNewGame('rome', 'land-supply-heal-gate-control', 'small');
    const unitId = state.civilizations.rome.units[0]!;
    state.units[unitId] = { ...state.units[unitId]!, health: 50, hasMoved: false, hasActed: false };
    const next = processTurn(state, new EventBus());
    expect(next.units[unitId]!.health).toBeGreaterThan(50);
  });
});
```

Check `EventBus`'s real constructor/import path and `processTurn`'s exact
export path against this same test file's existing imports before finalizing
— reuse whatever it already imports rather than guessing a new path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-combat.test.ts tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `resolveLandSupplyCombatPenalty` and `getRestAvailability`**

```ts
// src/systems/supply-combat.ts
import type { Unit, UnitLandSupplyStatus } from '@/core/types';

export const OVEREXTENDED_COMBAT_MULTIPLIER = 0.9; // contract §29: -10%, data-driven

export interface LandSupplyCombatPenalty {
  multiplier: number;
  label?: string;
}

/** Mirrors resolveFortificationDefense's { multiplier, label? } shape (fortification-system.ts) so combat-context.ts wires both identically. */
export function resolveLandSupplyCombatPenalty(unit: Pick<Unit, 'landSupply'>): LandSupplyCombatPenalty {
  const state = unit.landSupply?.state;
  if (state !== 'degraded' && state !== 'severe') return { multiplier: 1 };
  return { multiplier: OVEREXTENDED_COMBAT_MULTIPLIER, label: `Overextended -${Math.round((1 - OVEREXTENDED_COMBAT_MULTIPLIER) * 100)}%` };
}

export interface RestAvailability {
  canRest: boolean;
  reason?: string;
}

/**
 * Single source of truth for "can this unit heal by any passive/Rest means
 * right now" — consumed both by the real heal-loop gate
 * (turn-manager.ts:624, this task) and by MR2's Rest-button disabled state,
 * so the two surfaces can never drift apart.
 */
export function getRestAvailability(status: UnitLandSupplyStatus | undefined): RestAvailability {
  if (status === undefined || status.state === 'full') return { canRest: true };
  return { canRest: false, reason: 'Cannot recover while unsupported — restore supply first.' };
}
```

- [ ] **Step 4: Wire into `CombatContext`/`calculateCombatStrengths`**

```ts
// src/systems/combat-system.ts — CombatContext, alongside defenderFortificationMultiplier:
  attackerLandSupplyMultiplier?: number;
  attackerLandSupplyFact?: CombatModifierFact;
  defenderLandSupplyMultiplier?: number;
  defenderLandSupplyFact?: CombatModifierFact;
```

```ts
// src/systems/combat-system.ts — calculateCombatStrengths, alongside the
// existing attackerCombinedArmsMultiplier / defenderCombinedArmsMultiplier lines:
  attackerStrength *= context?.attackerLandSupplyMultiplier ?? 1;
  defenderStrength *= context?.defenderLandSupplyMultiplier ?? 1;
```

```ts
// src/systems/combat-system.ts — calculateCombatStrengths' return statement,
// append to the existing fact arrays (keep every pre-existing entry exactly
// as-is; only append the new conditional entry, same pattern as
// defenderFortificationFact already does):
    attackerModifierFacts: [...(context?.attackerModifiers?.facts ?? []), ...(context?.attackerInterceptionFact ? [context.attackerInterceptionFact] : []), ...(context?.attackerCombinedArmsFact ? [context.attackerCombinedArmsFact] : []), ...(context?.attackerLandSupplyFact ? [context.attackerLandSupplyFact] : [])],
    defenderModifierFacts: [...(context?.defenderModifiers?.facts ?? []), ...(airDefenseApplies ? airDefenseCoverage.facts : []), ...(context?.defenderCombinedArmsFact ? [context.defenderCombinedArmsFact] : []), ...(context?.defenderFortificationFact ? [context.defenderFortificationFact] : []), ...(context?.defenderLandSupplyFact ? [context.defenderLandSupplyFact] : [])],
```

```ts
// src/systems/combat-context.ts — buildCombatContextForDefender, add near
// the existing `const fortification = resolveFortificationDefense(...)` line:
  const attackerSupplyPenalty = resolveLandSupplyCombatPenalty(attacker);
  const defenderSupplyPenalty = resolveLandSupplyCombatPenalty(defender);
```

```ts
// same function's return object, add:
    attackerLandSupplyMultiplier: attackerSupplyPenalty.multiplier,
    attackerLandSupplyFact: attackerSupplyPenalty.label
      ? { key: 'land-supply', label: attackerSupplyPenalty.label, sourceVisibility: 'owner', operation: 'multiplier', value: attackerSupplyPenalty.multiplier, outcome: 'applied' }
      : undefined,
    defenderLandSupplyMultiplier: defenderSupplyPenalty.multiplier,
    defenderLandSupplyFact: defenderSupplyPenalty.label
      ? { key: 'land-supply', label: defenderSupplyPenalty.label, sourceVisibility: 'owner', operation: 'multiplier', value: defenderSupplyPenalty.multiplier, outcome: 'applied' }
      : undefined,
```

Add the import:

```ts
// src/systems/combat-context.ts
import { resolveLandSupplyCombatPenalty } from './supply-combat';
```

- [ ] **Step 5: Wire the real healing gate — the fix for the original issue's core mechanic**

```ts
// src/core/turn-manager.ts — the existing heal loop, ~line 602-624. Replace
// the unconditional healUnit call:
      newState.units[unitId] = healUnit(unit, inFriendlyCity, inFriendlyTerritory, healingBonus);
// with:
      if (getRestAvailability(unit.landSupply).canRest) {
        newState.units[unitId] = healUnit(unit, inFriendlyCity, inFriendlyTerritory, healingBonus);
      }
```

Add the import:

```ts
// src/core/turn-manager.ts
import { getRestAvailability } from '@/systems/supply-combat';
```

**This is the actual fix for issue #544's original, oldest complaint** —
"`healUnit` grants +5/turn passive healing to any idle unit anywhere,
including deep in enemy territory." Grep
`tests/core/turn-manager.test.ts` for any *existing* test asserting a unit
heals while sitting in unsupported/foreign territory (there is no such test
as of this plan's writing — confirmed by grep during planning — but check
again at implementation time in case another MR landed one first) and update
it to reflect the new, intentional rule rather than treating it as a
regression to preserve.

- [ ] **Step 6: Wire the -1 movement floor into the per-unit turn reset**

**Corrected during implementation:** the line this plan originally pointed
at (`turn-manager.ts:1104`) is the *beast*-only reset branch
(`unit.owner === BEAST_OWNER`), not the general per-civ reset — beasts don't
participate in land supply anyway (Task 1), so that site would have been a
no-op. The real per-owner-turn movement reset for every civ's own units is
the shared `resetUnitTurn` function in `src/systems/unit-system.ts:783`
(called from `turn-manager.ts:639` for each civ's units, and again at
`turn-manager.ts:885` for barbarians) — apply the floor there instead, since
`unit.landSupply` is already available on the unit passed in:

```ts
// src/systems/unit-system.ts — resetUnitTurn, replace:
  const base: Unit = {
    ...rest,
    movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints + (unit.movementBonus ?? 0),
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
// with:
  // #544: severe overextension reduces movement by 1, never below 1 (contract §3.3/§29).
  const severeSupplyPenalty = unit.landSupply?.state === 'severe' ? 1 : 0;
  const base: Unit = {
    ...rest,
    movementPointsLeft: Math.max(
      1,
      UNIT_DEFINITIONS[unit.type].movementPoints + (unit.movementBonus ?? 0) - severeSupplyPenalty,
    ),
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
```

Add regression tests to `tests/systems/unit-system.test.ts`'s existing
`describe('resetUnitTurn', ...)` block: severe reduces movement by exactly
1, the floor holds at 1 even for an already-1-movement unit (e.g.
`catapult`), and `degraded` does **not** reduce movement (only `severe`
does).

- [ ] **Step 7: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-combat.test.ts tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts`
Expected: PASS. Then run the full suite to catch any snapshot/regression
ripple in existing combat/heal tests:

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS, 0 unrelated failures. If `tests/systems/pacing-audit.test.ts`
or `tests/systems/pacing-reference-economy.test.ts` newly fail, investigate
per `.claude/rules/game-balance.md`'s "Pacing Regression Prevention" in
Task 14 rather than suppressing the failure here — the healing gate in
particular is more likely to shift war-length pacing than the -10%/-1-move
penalty alone, since it directly changes how fast units recover between
fights.

- [ ] **Step 8: Commit**

```bash
git add src/systems/combat-system.ts src/systems/combat-context.ts src/systems/supply-combat.ts src/core/turn-manager.ts tests/systems/supply-combat.test.ts tests/systems/combat-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(#544): wire overextension combat -10%, severe -1 movement, and the real no-heal-while-unsupported rule"
```

---

### Task 12: Difficulty-invariance regression test

**Files:**
- Test: `tests/systems/supply-system.test.ts`

Contract §3.3/§25 make difficulty-invariance a first-class product
requirement, not an implementation detail — "same thresholds across
difficulty," "AI receives no mechanical cheats." Every function built in
Tasks 1-11 already happens to take no difficulty parameter, but nothing
proves that stays true as MR3-MR7 add more surface area to this system. Add
an explicit regression now, while the pipeline is small enough to assert on
end-to-end.

- [ ] **Step 1: Write the test**

```ts
// tests/systems/supply-system.test.ts, appended
//
// This codebase's actual difficulty representation is `OpponentChallenge =
// 'explorer' | 'standard' | 'veteran'` (src/core/types.ts:1529), surfaced as
// GameState.opponentChallenge — not a `settings.difficulty` field (verified
// during planning; `GameSettings` has no such field at all).
describe('difficulty invariance (#544 contract §3.3/§25)', () => {
  it('resolveLandSupplyForCiv produces identical output for two states differing only in opponentChallenge', () => {
    const explorerState = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    explorerState.units = {
      u1: { id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit,
    };
    explorerState.map.tiles[hexKey({ q: 19, r: 19 })] = { ...explorerState.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    explorerState.opponentChallenge = 'explorer';

    const veteranState = structuredClone(explorerState);
    veteranState.opponentChallenge = 'veteran';

    const explorerResult = resolveLandSupplyForCiv(explorerState, 'rome');
    const veteranResult = resolveLandSupplyForCiv(veteranState, 'rome');
    expect(explorerResult.units.u1!.landSupply).toEqual(veteranResult.units.u1!.landSupply);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (this should pass immediately
since nothing in Tasks 1-11 reads `opponentChallenge`, `Civilization.challenge`,
or any other difficulty representation at all — a passing test on first run
confirms the invariant, it does not indicate a missed red-green-refactor
cycle for this particular task)

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-system.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/systems/supply-system.test.ts
git commit -m "test(#544): lock in difficulty-invariance for the land-supply pipeline"
```

---

### Task 13: Minimal unit-panel supply status line

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

**Why this task exists:** Task 11 makes the -10%/-1-move penalty and the
no-heal-while-unsupported rule *real* — they now affect actual games. But
with zero visible indicator, a player would just see their units mysteriously
get weaker and stop healing, with no way to find out why. That is precisely
the failure mode the design contract's July addendum calls out by name
("silent healing changes read as bugs") and that
`.claude/rules/incremental-mr-completion.md` prohibits ("shipping a
player-facing [change] that does nothing [to explain itself] is not
incremental delivery; it is shipping a bug"). Full MR2 (overlay, live
preview, tutorial, end-turn warnings) is deliberately still out of scope —
this task adds only the smallest possible truthful indicator, reusing the
already-existing unit-info panel rather than building any new UI surface.

**Interfaces:**
- Consumes: `unit.landSupply` (`Unit`, `core/types.ts`), `getPrimarySupplySource`
  (`supply-sources.ts`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/selected-unit-info.test.ts — find this file's existing render-
// and-inspect-DOM pattern (it already exists for other unit-panel lines;
// reuse its helper functions rather than inventing new DOM-query helpers)
// and add:
describe('land-supply status line (#544)', () => {
  it('shows Full Supply with the primary source name when fully supplied', () => {
    // Arrange a unit sitting on/near its own city, landSupply undefined
    // (never resolved defaults to full) or explicitly { state: 'full', ... }.
    // Render the panel, then assert the rendered text contains
    // "Full Supply — <city name>".
  });

  it('shows the active combat penalty text when degraded', () => {
    // unit.landSupply.state = 'degraded' — assert rendered text contains
    // "-10% Combat" per contract §12's example text.
  });

  it('shows the movement penalty text when severe', () => {
    // unit.landSupply.state = 'severe' — assert rendered text contains a
    // movement-penalty indicator (contract §12 gives "Movement penalty in 2
    // turns" as the *warning-before* text, which is MR2 scope; MR1's line
    // states the penalty as already active, e.g. "-10% Combat, -1 Movement").
  });

  it('shows no supply line at all for a unit that does not participate in land supply (e.g. a Trireme)', () => {
    // naval unit selected — assert the panel does NOT render any supply
    // status line, since participatesInLandSupply is false for it.
  });
});
```

Write these against `selected-unit-info.ts`'s actual existing render
function signature and DOM structure — read the file first (it already
renders several similar conditional status lines for other systems) and
match its exact pattern for building/appending a text node, per this
project's `textContent`/`createTextNode()`-only rule (never `innerHTML`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/selected-unit-info.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the status line**

Read `src/ui/selected-unit-info.ts` in full before writing this step — find
where it already renders a conditional single-line status (health bar
label, veterancy tier, or similar) and add a new block immediately after it,
following the exact same DOM-construction idiom (a labeled `<div>`/`<span>`
built with `document.createElement` + `textContent`, appended to the same
parent the other status lines append to). The line's text content, derived
from `unit.landSupply` and `getPrimarySupplySource`, must be exactly one of:

- Not rendered at all, if `!unitParticipatesInLandSupply(unit)`.
- `Full Supply — <primary source name or "territory">` when `state` is
  `'full'` or `undefined`.
- `Stable but Unsupported — no healing` when `'stable-unsupported'`.
- `Overextended — Stage 1 of 3` when `'grace'`.
- `Overextended — Stage 2 of 3 · -10% Combat` when `'degraded'`.
- `Overextended — Stage 3 of 3 · -10% Combat, -1 Movement` when `'severe'`.

These strings match contract §12's example vocabulary
(`Full Supply — Memphis`, `Stable but Unsupported — no healing`,
`Overextended — Stage 2 of 3`, `-10% Combat`) exactly, so MR2's fuller
overlay/tutorial text can reuse the same vocabulary without introducing a
second, inconsistent set of labels later.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/selected-unit-info.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/selected-unit-info.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(#544): show land-supply status in the unit panel — closes the silent-penalty gap"
```

---

### Task 14: Deferred issues C & H, full-suite verification, spec coverage check

**Files:** none (process task)

- [ ] **Step 1: File deferred issue C**

```bash
gh issue create --repo a1flecke/conquestoria \
  --title "Treaty-gated logistics / military access system" \
  --body "$(cat <<'EOF'
Deferred from #544 (design contract §33.C).

MR1's re-audit found a `TreatyType` value literally called `'open_borders'`
already exists (src/core/types.ts) — it's proposable, trackable, and both
basic-ai.ts and ai-diplomacy.ts reason about accepting/proposing it. But
nothing in diplomacy-system.ts or unit-movement-system.ts ever consumes it
for movement purposes — only hasAllianceTreaty gates whether a foreign city
blocks entry (isBlockingCityFor, unit-system.ts). A unit can walk through
any other civ's territory regardless of treaty state, subject only to
occupied-city/barbarian-camp blocking (getBlockingMapEntityAt).

#544's land-supply logistics therefore treats every non-friendly,
non-allied tile as hostile for supply purposes — including territory
covered by an Open Borders treaty — without a distinct "legal access, no
supply" middle state (see
docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md §4
Finding 2).

Explore: wiring the existing open_borders treaty into actual movement/
territory-access logic (it currently does nothing mechanical), and
whether/how it should soften the supply-hostile classification once it's
real.
EOF
)"
```

- [ ] **Step 2: File deferred issue H**

```bash
gh issue create --repo a1flecke/conquestoria \
  --title "Diplomacy/movement mismatch: no border enforcement for foreign territory entry" \
  --body "$(cat <<'EOF'
Deferred from #544 (design contract §33.H), same root cause as the
treaty-gated-access issue this references.

Confirmed during MR1: getBlockingMapEntityAt (unit-system.ts) only blocks
movement onto occupied enemy cities and barbarian camps. Plain foreign-owned
tiles are never blocked by ownership or diplomatic state — a unit can walk
into any civ's territory today regardless of war/peace/alliance status, and
regardless of whether an open_borders treaty (which does already exist as a
TreatyType) is in effect.

This is a design gap independent of #544: most 4X/Civ-likes gate open
foreign movement behind a treaty or war state. Right now this game has a
treaty literally named Open Borders that AI civs already negotiate, but it
has no mechanical effect — foreign movement is always unconditionally open
whether or not that treaty exists.

Decide whether to: (a) leave movement fully open and accept that supply
logistics (#544) is the only system that reacts to this, or (b) introduce
real border enforcement, which would also address the treaty-gated-access
issue above.
EOF
)"
```

- [ ] **Step 3: Full-suite verification**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests pass, including the full
`tests/systems/pacing-audit.test.ts` outlier gate and
`tests/systems/pacing-reference-economy.test.ts` snapshot pins per
`.claude/rules/game-balance.md`. If either fails because the new combat
penalty or (more likely) the healing-gate fix measurably shifted a
reference-economy snapshot, update the pinned numbers with a one-line
justification in that test file's comments — do not change
`RESEARCH_OUTPUT_BY_ERA`'s target profile to paper over it.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0, no type errors.

- [ ] **Step 4: Self-review against the design-spec's MR1 scope**

Re-read `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md`
§10's MR1 bullet and the source contract's §30 test matrix items 1-28.
Confirm each of the following has at least one passing test written in this
plan (cross-reference, do not re-derive):

| Contract scenario | Covered by |
|---|---|
| 1-3 (unsupported states, min move 1) | Task 7 (state machine), Task 11 Step 6 (movement floor) |
| 4-7 (recovery, base entry, start-in-base) | Task 8 |
| 8 (combat reward HP unaffected) | Architectural — combat-reward-system.ts is untouched by this MR; no new test needed since nothing changed there |
| 9 (Rest disabled) | Task 11 (`getRestAvailability`, now called from the real heal loop) + Task 13 (visible in the unit panel) |
| 10 (Fort < Citadel < City radii) | Task 4 |
| 11-14 (road/rail bounded extension) | **Explicitly deferred to MR1.1** — decided at implementation time, documented in the design spec's §10 phasing table with the reason (needs its own tech-gated-tier design decision, small enough to be its own quick MR rather than growing MR1 further). Not a silent gap: the spec names MR1.1 as required before #544 is considered complete. |
| 15-18 (captured sources) | Task 5 |
| 19-28 (naval shore supply) | Task 9 |
| Difficulty invariance (contract §3.3/§25, not separately numbered in §30) | Task 12 |
| "Silent changes read as bugs" (contract, July addendum) | Task 13 |

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs(#544): file deferred issues C/H, confirm MR1 full-suite green"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Task 10's `attackedThisTurn` proxy** (comment in Task 10's implementation
  step) is a known simplification — resolve properly during Task 14's review
  rather than carrying it silently into MR2+.
- **Road/rail bounded extension (contract scenarios 11-14)** is named in the
  design spec's MR1 description but has no task in this plan — Task 14 Step 4
  is written to force this gap to be caught and closed (or explicitly
  deferred) rather than silently merged as "done."
- **File split (SRP fix):** the original draft of this plan put all eleven
  functions in one `supply-system.ts` file. It is now six focused modules
  (`supply-participation.ts`, `supply-territory.ts`, `supply-sources.ts`,
  `supply-naval.ts`, `supply-progression.ts`, `supply-combat.ts`) plus a
  seventh thin composition root. Every module takes plain data (`GameState`,
  `Unit`, `HexCoord`) and returns plain data — none of them import from
  `src/ui/` or `src/renderer/`, and `supply-*.ts` modules never import from
  `combat-system.ts`/`combat-context.ts` (dependency direction is strictly
  `combat-*.ts` / `turn-manager.ts` / `selected-unit-info.ts` → `supply-*.ts`,
  never the reverse) — keeping MR2 (UI) and MR5 (AI) pure consumers with no
  circular-dependency risk.
- **The two most important fixes from the inline review are Tasks 11 and 13**
  — without them, this plan would have shipped a silent, incomplete version
  of the feature: the original bug (unrestricted passive healing) would have
  stayed broken, and a brand-new combat/movement penalty would have gone
  live invisibly. Do not skip or defer either task to "a later cleanup pass."
