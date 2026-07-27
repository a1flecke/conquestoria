# Naval Hull Water-Class Implementation Plan (#751)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do NOT use
> subagent-driven-development or spawn any Agent/Task tool calls for this plan** — this
> repository's `CLAUDE.md` explicitly forbids subagents/parallel agents for all work in this
> codebase; execute every task inline in the current session.

**Goal:** Fix #751 by making ocean access a permanent, per-hull property (`waterAccess: 'coastal'
| 'ocean'`) enforced through one shared helper, instead of the current hardcoded
`unit.type === 'transport'` check duplicated across two movement modules — plus a save migration
for any existing unit now stranded on `ocean`.

**Architecture:** One new field on `UnitDefinition` and `PirateHullDefinition`, one new shared
predicate (`canHullEnterOcean`) consumed by both movement-validation modules, three tech
`prerequisites` edits, one new save migration modeled on the existing `migrateLegacyBasedAircraft`
precedent, and one new consolidated test file for the cross-cutting new behavior.

**Tech Stack:** TypeScript, Vitest, this repo's existing `GameState`/`UnitDefinition` data-driven
catalog conventions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-naval-water-class-design.md` — this plan implements it
  exactly as written (including its two follow-up corrections: the AI escort-assignment claim was
  retracted as unfounded, no task here references it; Trireme is ocean-going).
- Hull classification (final): **coastal-only forever** — `galley`, `transport`. **Ocean-going** —
  `trireme`, `carrack`, `galleon`, `steamship`, `troop_transport`, `frigate`, `ironclad`,
  `pre_dreadnought`, `submarine`, `carrier`, `destroyer`, `missile_submarine`,
  `autonomous_frigate`, `naval_trader`, `steamship_trader`, `cargo_freighter`, `container_ship`.
- Pirate hull classification (final): **coastal** — `pirate_galley`, `pirate_corsair`. **Ocean** —
  `pirate_frigate`, `pirate_ironclad`, `pirate_fast_attack_craft`, `pirate_mothership`.
- NEVER use `Math.random()` — this plan introduces no new randomness, but the migration's coast
  search must stay deterministic (sorted tie-breaks), not incidentally reliant on object key order.
- All game state mutations follow this repo's immutable-update convention: spread-copy, never
  write through `state.units[id] = ...` etc. (`.claude/rules/game-systems.md`).
- Run `bash scripts/run-with-mise.sh yarn test` and `bash scripts/run-with-mise.sh yarn build` at
  the end of every task before committing (fast local loop); the full suite is the final Task 7
  gate.
- **Out of scope for this plan, by design, not oversight:** a coastal-only UI badge on unit
  cards (city production queue, `selected-unit-info.ts`). The spec calls for it as a
  discoverability enhancement, but it requires reading and modifying a large, not-yet-inspected
  render path in `src/ui/city-panel.ts`, and per `.claude/rules/incremental-mr-completion.md` it's
  safe to defer: the existing generic blocked-move notification path
  (`selected-unit-movement-feedback.ts`) already gives real, working player feedback the moment a
  blocked move is attempted — no dead-end UX is introduced by this plan, only a lower-priority
  "before you even try" enhancement that is a reasonable separate follow-up.

---

## Task 1: Data model — `waterAccess` field and full hull classification

**Files:**
- Modify: `src/core/types.ts:409-426` (`UnitDefinition` interface)
- Modify: `src/systems/unit-system.ts` (`UNIT_DEFINITIONS` — 18 naval entries, plus
  `createPirateUnitDefinition`)
- Modify: `src/systems/pirate-definitions.ts` (`PirateHullDefinition` interface,
  `PIRATE_HULL_DEFINITIONS` — 6 entries)
- Test: `tests/systems/naval-water-class.test.ts` (new file)

**Interfaces:**
- Produces: `UnitDefinition.waterAccess?: 'coastal' | 'ocean'`, readable via
  `UNIT_DEFINITIONS[unitType].waterAccess` (existing export, `src/systems/unit-system.ts`).
- Produces: `PirateHullDefinition.waterAccess: 'coastal' | 'ocean'`, readable via
  `PIRATE_HULL_DEFINITIONS[hullType].waterAccess` (existing export,
  `src/systems/pirate-definitions.ts`).

- [ ] **Step 1: Add the field to `UnitDefinition`**

In `src/core/types.ts`, find the `UnitDefinition` interface (currently lines 409-426):

```ts
export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;          // 0 for non-combat units
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
  domain?: 'land' | 'naval' | 'air';
  spyDetectionChance?: number; // 0–1, probability per adjacent spy unit per turn
  attackProfile?: UnitAttackProfile;
  airInterceptionDefense?: AirInterceptionDefense;
  airOperation?: AirOperationDefinition;
  terrainCostOverrides?: Partial<Record<string, number>>;
  cargoCapacity?: number;
  cargoSize?: number;
}
```

Add `waterAccess` right after `domain`:

```ts
export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;          // 0 for non-combat units
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
  domain?: 'land' | 'naval' | 'air';
  waterAccess?: 'coastal' | 'ocean'; // required whenever domain === 'naval' — see #751
  spyDetectionChance?: number; // 0–1, probability per adjacent spy unit per turn
  attackProfile?: UnitAttackProfile;
  airInterceptionDefense?: AirInterceptionDefense;
  airOperation?: AirOperationDefinition;
  terrainCostOverrides?: Partial<Record<string, number>>;
  cargoCapacity?: number;
  cargoSize?: number;
}
```

- [ ] **Step 2: Classify every naval `UNIT_DEFINITIONS` entry in `src/systems/unit-system.ts`**

Add `waterAccess: 'coastal',` or `waterAccess: 'ocean',` to each entry's `domain: 'naval',` line
(same line, right after `domain: 'naval',`). Exact edits, one per unit:

```
galley (line 85):            domain: 'naval',  →  domain: 'naval', waterAccess: 'coastal',
trireme (line 91):           domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
transport (line 97):         domain: 'naval',  →  domain: 'naval', waterAccess: 'coastal',
carrack (line 104):          domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
galleon (line 111):          domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
steamship (line 118):        domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
troop_transport (line 125):  domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
frigate (line 284):          domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
ironclad (line 291):         domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
pre_dreadnought (line 312):  domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
submarine (line 326):        domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
carrier (line 370):          domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
destroyer (line 377):        domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
missile_submarine (line 393):domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
naval_trader (line 428):     domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
steamship_trader (line 434): domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
cargo_freighter (line 440):  domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
container_ship (line 446):   domain: 'naval',  →  domain: 'naval', waterAccess: 'ocean',
```

`autonomous_frigate` (line 397) is a single-line entry — change:

```ts
  autonomous_frigate: { type: 'autonomous_frigate', name: 'Autonomous Frigate', movementPoints: 5, visionRange: 3, strength: 60, canFoundCity: false, canBuildImprovements: false, productionCost: 336, domain: 'naval', attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] } },
```

to:

```ts
  autonomous_frigate: { type: 'autonomous_frigate', name: 'Autonomous Frigate', movementPoints: 5, visionRange: 3, strength: 60, canFoundCity: false, canBuildImprovements: false, productionCost: 336, domain: 'naval', waterAccess: 'ocean', attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] } },
```

- [ ] **Step 3: Classify pirate hulls and wire them into `UNIT_DEFINITIONS`**

In `src/systems/pirate-definitions.ts`, add `waterAccess` to `PirateHullDefinition`:

```ts
export interface PirateHullDefinition {
  type: PirateHullType;
  name: string;
  introducedAtStage: PirateMaritimeStage;
  strength: number;
  movementPoints: number;
  visionRange: number;
  waterAccess: 'coastal' | 'ocean';
  mapIcon: string;
  spriteId: PirateHullType;
  sfxFamily: PirateSfxFamily;
}
```

Add `waterAccess` to each of the 6 entries in `PIRATE_HULL_DEFINITIONS`:

```ts
export const PIRATE_HULL_DEFINITIONS: Record<PirateHullType, PirateHullDefinition> = {
  pirate_galley: {
    type: 'pirate_galley', name: 'Pirate Galley', introducedAtStage: 1,
    strength: 14, movementPoints: 3, visionRange: 3, waterAccess: 'coastal',
    mapIcon: 'sail', spriteId: 'pirate_galley', sfxFamily: 'oared-raider',
  },
  pirate_corsair: {
    type: 'pirate_corsair', name: 'Corsair Xebec', introducedAtStage: 2,
    strength: 20, movementPoints: 4, visionRange: 3, waterAccess: 'coastal',
    mapIcon: 'lateen-sail', spriteId: 'pirate_corsair', sfxFamily: 'sail-raider',
  },
  pirate_frigate: {
    type: 'pirate_frigate', name: 'Pirate Frigate', introducedAtStage: 3,
    strength: 28, movementPoints: 4, visionRange: 4, waterAccess: 'ocean',
    mapIcon: 'broadside', spriteId: 'pirate_frigate', sfxFamily: 'cannon-raider',
  },
  pirate_ironclad: {
    type: 'pirate_ironclad', name: 'Ironclad Raider', introducedAtStage: 4,
    strength: 36, movementPoints: 4, visionRange: 4, waterAccess: 'ocean',
    mapIcon: 'iron-hull', spriteId: 'pirate_ironclad', sfxFamily: 'iron-raider',
  },
  pirate_fast_attack_craft: {
    type: 'pirate_fast_attack_craft', name: 'Fast Attack Craft', introducedAtStage: 5,
    strength: 40, movementPoints: 5, visionRange: 5, waterAccess: 'ocean',
    mapIcon: 'fast-craft', spriteId: 'pirate_fast_attack_craft', sfxFamily: 'fast-attack-raider',
  },
  pirate_mothership: {
    type: 'pirate_mothership', name: 'Pirate Mothership', introducedAtStage: 5,
    strength: 46, movementPoints: 4, visionRange: 5, waterAccess: 'ocean',
    mapIcon: 'command-ship', spriteId: 'pirate_mothership', sfxFamily: 'command-flotilla',
  },
};
```

Now wire it through into `UNIT_DEFINITIONS` — in `src/systems/unit-system.ts`, find
`createPirateUnitDefinition` (lines 15-32):

```ts
function createPirateUnitDefinition(
  type: PirateHullType,
  attackProfile: UnitDefinition['attackProfile'],
): UnitDefinition {
  const hull = PIRATE_HULL_DEFINITIONS[type];
  return {
    type,
    name: hull.name,
    movementPoints: hull.movementPoints,
    visionRange: hull.visionRange,
    strength: hull.strength,
    canFoundCity: false,
    canBuildImprovements: false,
    productionCost: 0,
    domain: 'naval',
    attackProfile,
  };
}
```

Change the returned object to include `waterAccess: hull.waterAccess`:

```ts
function createPirateUnitDefinition(
  type: PirateHullType,
  attackProfile: UnitDefinition['attackProfile'],
): UnitDefinition {
  const hull = PIRATE_HULL_DEFINITIONS[type];
  return {
    type,
    name: hull.name,
    movementPoints: hull.movementPoints,
    visionRange: hull.visionRange,
    strength: hull.strength,
    canFoundCity: false,
    canBuildImprovements: false,
    productionCost: 0,
    domain: 'naval',
    waterAccess: hull.waterAccess,
    attackProfile,
  };
}
```

This is the critical wiring step — without it, every pirate hull's `waterAccess` on the derived
`UnitDefinition` would be `undefined`, silently defaulting every pirate ship to coastal-only.

**Execution note (found during implementation, not anticipated by this plan or the design
spec):** `beast_sea_serpent` (`src/systems/unit-system.ts:495`) also has `domain: 'naval'` — it's
a legendary aquatic beast, not a player/pirate unit, and neither the design spec's research nor
this plan's file sweep caught it. The Step 4 catalog test below caught it immediately (failing
with `['beast_sea_serpent']` in the "missing waterAccess" list) — exactly what that test exists
for. Classified `waterAccess: 'ocean'` per its own `UNIT_DESCRIPTIONS` text ("A serpent of the
deep ocean").

- [ ] **Step 4: Write the catalog-coverage tests (new file)**

Create `tests/systems/naval-water-class.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { PIRATE_HULL_DEFINITIONS, PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';

describe('naval hull water-class catalog coverage', () => {
  it('every naval UnitDefinition sets waterAccess explicitly', () => {
    const missing = Object.values(UNIT_DEFINITIONS)
      .filter(def => def.domain === 'naval' && def.waterAccess === undefined)
      .map(def => def.type);
    expect(missing).toEqual([]);
  });

  it('every naval UnitDefinition sets a valid waterAccess value', () => {
    const invalid = Object.values(UNIT_DEFINITIONS)
      .filter(def => def.domain === 'naval')
      .filter(def => def.waterAccess !== 'coastal' && def.waterAccess !== 'ocean')
      .map(def => def.type);
    expect(invalid).toEqual([]);
  });

  it('every PirateHullDefinition sets a valid waterAccess value', () => {
    const invalid = PIRATE_HULL_TYPES
      .filter(type => {
        const access = PIRATE_HULL_DEFINITIONS[type].waterAccess;
        return access !== 'coastal' && access !== 'ocean';
      });
    expect(invalid).toEqual([]);
  });

  it('pirate hull waterAccess flows through into UNIT_DEFINITIONS (createPirateUnitDefinition wiring)', () => {
    for (const type of PIRATE_HULL_TYPES) {
      expect(UNIT_DEFINITIONS[type]?.waterAccess).toBe(PIRATE_HULL_DEFINITIONS[type].waterAccess);
    }
  });

  it('matches the final hull classification table from the design spec', () => {
    const coastalOnly: readonly string[] = ['galley', 'transport'];
    const oceanGoing: readonly string[] = [
      'trireme', 'carrack', 'galleon', 'steamship', 'troop_transport', 'frigate', 'ironclad',
      'pre_dreadnought', 'submarine', 'carrier', 'destroyer', 'missile_submarine',
      'autonomous_frigate', 'naval_trader', 'steamship_trader', 'cargo_freighter', 'container_ship',
    ];
    for (const type of coastalOnly) {
      expect(UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS]?.waterAccess).toBe('coastal');
    }
    for (const type of oceanGoing) {
      expect(UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS]?.waterAccess).toBe('ocean');
    }

    const coastalPirates: readonly string[] = ['pirate_galley', 'pirate_corsair'];
    const oceanPirates: readonly string[] = [
      'pirate_frigate', 'pirate_ironclad', 'pirate_fast_attack_craft', 'pirate_mothership',
    ];
    for (const type of coastalPirates) {
      expect(PIRATE_HULL_DEFINITIONS[type as keyof typeof PIRATE_HULL_DEFINITIONS].waterAccess).toBe('coastal');
    }
    for (const type of oceanPirates) {
      expect(PIRATE_HULL_DEFINITIONS[type as keyof typeof PIRATE_HULL_DEFINITIONS].waterAccess).toBe('ocean');
    }
  });
});
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/naval-water-class.test.ts`
Expected: all 5 tests PASS (Steps 1-3 already made the classification real before this test file
was added, so there's no red-then-green cycle here — this is catalog data, not new behavior; the
test exists to guard the catalog going forward).

- [ ] **Step 6: Run the full fast suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS (no regressions yet — Task 2 changes actual movement behavior; this task only added
a field nothing reads yet).

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS (no type errors).

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/pirate-definitions.ts tests/systems/naval-water-class.test.ts
git commit -m "feat(naval): classify every naval hull as coastal or ocean-going

Adds UnitDefinition.waterAccess and PirateHullDefinition.waterAccess, sets
it on every naval unit and pirate hull per the design spec, and wires
createPirateUnitDefinition() to propagate it through — nothing reads the
field yet (see next task)."
```

---

## Task 2: Movement enforcement — `canHullEnterOcean` and both movement modules

**Files:**
- Modify: `src/systems/unit-system.ts` (`getMovementCostForUnitInContext`,
  `getMovementBlockerReason`, `UnitMovementBlockerCode`, `MovementBlockerReason`)
- Modify: `src/systems/unit-movement-system.ts` (`getImpassableReason`)
- Modify: `tests/systems/unit-system.test.ts` (replace stale test at lines 424-434)
- Test: `tests/systems/naval-water-class.test.ts` (append movement tests)

**Interfaces:**
- Consumes: `UNIT_DEFINITIONS[unitType].waterAccess` from Task 1.
- Produces: `export function canHullEnterOcean(unitType: UnitType): boolean` in
  `src/systems/unit-system.ts`, re-exported for `unit-movement-system.ts` to import.
- Produces: new blocker code `'requires-ocean-hull'` on both `UnitMovementBlockerCode` and
  `MovementBlockerReason['code']`.

- [ ] **Step 1: Write the failing movement tests (append to `tests/systems/naval-water-class.test.ts`)**

Add these imports to the top of the file (alongside the existing ones from Task 1):

```ts
import { createUnit, getMovementBlockerReason } from '@/systems/unit-system';
import type { GameMap } from '@/core/types';
```

Add this helper and describe block to the end of the file:

```ts
function createWaterMap(): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < 5; q += 1) {
    for (let r = 0; r < 5; r += 1) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  tiles['0,0'] = { ...tiles['0,0']!, terrain: 'coast' };
  tiles['1,0'] = { ...tiles['1,0']!, terrain: 'coast' };
  tiles['2,0'] = { ...tiles['2,0']!, terrain: 'ocean' };
  return { width: 5, height: 5, tiles, wrapsHorizontally: false, rivers: [] };
}

const mkCounters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('naval hull water-class movement enforcement', () => {
  it('blocks a coastal-only hull (Galley) from entering ocean', () => {
    const map = createWaterMap();
    const galley = createUnit('galley', 'player', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(galley, { q: 2, r: 0 }, map)?.code).toBe('requires-ocean-hull');
  });

  it('allows a coastal-only hull (Transport) to enter coast', () => {
    const map = createWaterMap();
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(transport, { q: 1, r: 0 }, map)).toBeNull();
  });

  it('allows an ocean-going hull (Trireme) to enter ocean', () => {
    const map = createWaterMap();
    const trireme = createUnit('trireme', 'player', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(trireme, { q: 2, r: 0 }, map)).toBeNull();
  });

  it('allows an ocean-going hull (Carrack) to enter ocean', () => {
    const map = createWaterMap();
    const carrack = createUnit('carrack', 'player', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(carrack, { q: 2, r: 0 }, map)).toBeNull();
  });

  it('blocks a coastal-only pirate hull (pirate_galley) from entering ocean', () => {
    const map = createWaterMap();
    const pirate = createUnit('pirate_galley', 'pirates', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(pirate, { q: 2, r: 0 }, map)?.code).toBe('requires-ocean-hull');
  });

  it('allows an ocean-going pirate hull (pirate_frigate) to enter ocean', () => {
    const map = createWaterMap();
    const pirate = createUnit('pirate_frigate', 'pirates', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(pirate, { q: 2, r: 0 }, map)).toBeNull();
  });

  it('uses plain, non-jargon language in the blocked-move message', () => {
    const map = createWaterMap();
    const galley = createUnit('galley', 'player', { q: 1, r: 0 }, mkCounters());
    const reason = getMovementBlockerReason(galley, { q: 2, r: 0 }, map);
    expect(reason?.message.toLowerCase()).not.toContain('waterAccess'.toLowerCase());
    expect(reason?.message.toLowerCase()).not.toContain('hull class');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/naval-water-class.test.ts`
Expected: FAIL — `getMovementBlockerReason` still uses the old `unit.type === 'transport'` check,
so Galley currently returns `null` (not blocked) instead of `'requires-ocean-hull'`, and the
`'requires-ocean-hull'` code doesn't exist yet.

- [ ] **Step 3: Add `canHullEnterOcean` and rewrite the two movement functions in `unit-system.ts`**

Add this function immediately before `getMovementCostForUnitInContext` (currently starting at
line 826):

```ts
export function canHullEnterOcean(unitType: UnitType): boolean {
  return UNIT_DEFINITIONS[unitType]?.waterAccess === 'ocean';
}
```

Replace `getMovementCostForUnitInContext` (current lines 826-849):

```ts
export function getMovementCostForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  const domain = definition?.domain ?? 'land';

  if (domain === 'air') return 1;

  if (domain === 'naval') {
    if (terrain !== 'ocean' && terrain !== 'coast') return Infinity;
    if (unit.type !== 'transport') return 1;
    const completedTechs = context.completedTechs ?? [];
    if (!completedTechs.includes('galleys')) return Infinity;
    if (terrain === 'ocean' && !completedTechs.includes('celestial-navigation')) return Infinity;
    return 1;
  }

  if (definition?.terrainCostOverrides && terrain in definition.terrainCostOverrides) {
    return definition.terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}
```

with:

```ts
export function getMovementCostForUnitInContext(
  unit: Unit,
  terrain: string,
  context: UnitMovementContext = {},
): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  const domain = definition?.domain ?? 'land';

  if (domain === 'air') return 1;

  if (domain === 'naval') {
    if (terrain !== 'ocean' && terrain !== 'coast') return Infinity;
    if (terrain === 'ocean' && !canHullEnterOcean(unit.type)) return Infinity;
    return 1;
  }

  if (definition?.terrainCostOverrides && terrain in definition.terrainCostOverrides) {
    return definition.terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}
```

Update the `UnitMovementBlockerCode` type (current lines 810-820) — remove the two retired codes,
add the new one:

```ts
export type UnitMovementBlockerCode =
  | 'unknown-tile'
  | 'unexplored'
  | 'impassable-water'
  | 'impassable-terrain'
  | 'requires-ocean-hull'
  | 'occupied'
  | 'foreign-city'
  | 'unreachable'
  | 'insufficient-movement';
```

Update the `MovementBlockerReason` interface's `code` union (current lines 902-914) the same way:

```ts
export interface MovementBlockerReason {
  code:
    | 'unexplored'
    | 'unknown-tile'
    | 'impassable-water'
    | 'impassable-terrain'
    | 'requires-ocean-hull'
    | 'occupied'
    | 'unreachable'
    | 'insufficient-movement';
  message: string;
}
```

In `getMovementBlockerReason`, replace this block (current lines 932-947):

```ts
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  if (!isPassableForUnitInContext(unit, tile.terrain, { completedTechs: options.completedTechs })) {
    if (unit.type === 'transport' && (tile.terrain === 'coast' || tile.terrain === 'ocean') && !options.completedTechs?.includes('galleys')) {
      return { code: 'requires-galleys', message: 'Need Galleys to sail a Transport.' };
    }
    if (unit.type === 'transport' && tile.terrain === 'ocean') {
      return { code: 'requires-celestial-navigation', message: 'Need Celestial Navigation to cross ocean.' };
    }
    if (domain === 'naval') {
      return { code: 'impassable-terrain', message: 'Naval units cannot move on land.' };
    }
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
      return { code: 'impassable-water', message: 'Land units cannot cross water yet.' };
    }
    return { code: 'impassable-terrain', message: 'This terrain cannot be entered.' };
  }
```

with:

```ts
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  if (!isPassableForUnitInContext(unit, tile.terrain, { completedTechs: options.completedTechs })) {
    if (domain === 'naval' && tile.terrain === 'ocean' && !canHullEnterOcean(unit.type)) {
      return {
        code: 'requires-ocean-hull',
        message: "This ship can't survive the open sea — upgrade it to go further.",
      };
    }
    if (domain === 'naval') {
      return { code: 'impassable-terrain', message: 'Naval units cannot move on land.' };
    }
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
      return { code: 'impassable-water', message: 'Land units cannot cross water yet.' };
    }
    return { code: 'impassable-terrain', message: 'This terrain cannot be entered.' };
  }
```

- [ ] **Step 4: Rewrite `getImpassableReason` in `unit-movement-system.ts`**

Add `canHullEnterOcean` to the existing import block from `@/systems/unit-system` (currently lines
9-17):

```ts
import {
  moveUnitWithZoneOfControl,
  getMovementCostForUnitInContext,
  getMovementStepCost,
  findPath,
  findPathToCity,
  UNIT_DEFINITIONS,
  canHullEnterOcean,
  type UnitMovementBlockerCode,
} from '@/systems/unit-system';
```

Add `UnitType` to the existing type-only import from `@/core/types` (current line 2):

```ts
import type { GameState, HexCoord, UnitType, VillageOutcomeType } from '@/core/types';
```

`getImpassableReason`'s `unitType` parameter was always typed as bare `string` even though its
only caller (`unit.type`) is always `UnitType` — fixing that properly here instead of casting
around it, since the function body is being rewritten anyway.

Replace `getImpassableReason` (current lines 295-310):

```ts
function getImpassableReason(
  unitType: string,
  terrain: string,
  completedTechs: string[],
): { reason: UnitMovementBlockerCode; message: string } {
  if (unitType === 'transport' && (terrain === 'coast' || terrain === 'ocean') && !completedTechs.includes('galleys')) {
    return { reason: 'requires-galleys', message: 'Need Galleys to sail a Transport.' };
  }
  if (unitType === 'transport' && terrain === 'ocean' && !completedTechs.includes('celestial-navigation')) {
    return { reason: 'requires-celestial-navigation', message: 'Need Celestial Navigation to cross ocean.' };
  }
  if (terrain === 'ocean' || terrain === 'coast') {
    return { reason: 'impassable-water', message: 'Land units cannot cross water yet.' };
  }
  return { reason: 'impassable-terrain', message: 'This terrain cannot be entered.' };
}
```

with:

```ts
function getImpassableReason(
  unitType: UnitType,
  terrain: string,
): { reason: UnitMovementBlockerCode; message: string } {
  const domain = UNIT_DEFINITIONS[unitType]?.domain ?? 'land';
  if (domain === 'naval' && terrain === 'ocean' && !canHullEnterOcean(unitType)) {
    return {
      reason: 'requires-ocean-hull',
      message: "This ship can't survive the open sea — upgrade it to go further.",
    };
  }
  if (terrain === 'ocean' || terrain === 'coast') {
    return { reason: 'impassable-water', message: 'Land units cannot cross water yet.' };
  }
  return { reason: 'impassable-terrain', message: 'This terrain cannot be entered.' };
}
```

Update its call site (current line 355):

```ts
    const blocker = getImpassableReason(unit.type, tile.terrain, completedTechs);
```

to:

```ts
    const blocker = getImpassableReason(unit.type, tile.terrain);
```

(`completedTechs` is still computed on the line above for `getMovementCostForUnitInContext` and
`findPath` — only its use inside `getImpassableReason` is removed, since hull class no longer
depends on tech.)

- [ ] **Step 5: Replace the stale Transport tech-gate test in `tests/systems/unit-system.test.ts`**

Replace this test (current lines 424-434):

```ts
  it('uses distinct Transport tech blocker reasons for coast and ocean', () => {
    const map = createWrappedGrasslandMap(5, 5);
    map.tiles['0,0'] = { ...map.tiles['0,0'], terrain: 'coast' };
    map.tiles['1,0'] = { ...map.tiles['1,0'], terrain: 'coast' };
    map.tiles['2,0'] = { ...map.tiles['2,0'], terrain: 'ocean' };
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkC());

    expect(getMovementBlockerReason(transport, { q: 1, r: 0 }, map)?.code).toBe('requires-galleys');
    expect(getMovementBlockerReason(transport, { q: 2, r: 0 }, map, { completedTechs: ['galleys'] })?.code)
      .toBe('requires-celestial-navigation');
  });
```

with:

```ts
  it('blocks a coastal-only Transport from ocean regardless of completed techs', () => {
    const map = createWrappedGrasslandMap(5, 5);
    map.tiles['0,0'] = { ...map.tiles['0,0'], terrain: 'coast' };
    map.tiles['1,0'] = { ...map.tiles['1,0'], terrain: 'coast' };
    map.tiles['2,0'] = { ...map.tiles['2,0'], terrain: 'ocean' };
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkC());

    expect(getMovementBlockerReason(transport, { q: 1, r: 0 }, map)).toBeNull();
    expect(
      getMovementBlockerReason(transport, { q: 2, r: 0 }, map, { completedTechs: ['galleys', 'celestial-navigation'] })?.code,
    ).toBe('requires-ocean-hull');
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/naval-water-class.test.ts tests/systems/unit-system.test.ts`
Expected: all PASS.

- [ ] **Step 7: Run the fast suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. If any other existing test fails referencing `'requires-galleys'` or
`'requires-celestial-navigation'`, note it — Task 6 (regression sweep) is the dedicated pass for
finding every such fixture, but fix any that block this task's own test run now rather than
deferring a build-breaking failure.

**Execution note (found during implementation):** the fast suite surfaced 15 failures across 5
files on the first run, all from the same root cause — fixtures placing a now-coastal-only hull
(`transport`, `galley`, or `pirate_corsair`) on an all-ocean or ocean-only test map, so the unit
could no longer move at all. Fixed each by swapping to an ocean-going hull (`trireme` or
`pirate_ironclad`) where the test's actual intent didn't depend on the specific hull, and by
rewriting the two tests that directly asserted the old tech-gate blocker codes
(`tests/systems/unit-movement-system.test.ts`'s "gates Transport coast and ocean movement by owner
tech" and `tests/input/selected-unit-highlights.test.ts`'s Transport highlight test) to assert the
new hull-class behavior instead. One subtlety worth flagging for future readers:
`getPirateFleetLeader` (`pirate-behavior.ts:271`) picks the fleet leader by highest strength, with
alphabetical unit-id as a tie-break — swapping a weaker coastal hull for an equal- or
lower-strength ocean-going hull can silently flip which unit becomes "leader" in a test that
asserts a specific `leaderUnitId`, so the substitute hull's strength relative to its fleet-mates
matters, not just its `waterAccess`.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/systems/unit-system.ts src/systems/unit-movement-system.ts tests/systems/unit-system.test.ts tests/systems/naval-water-class.test.ts
git commit -m "fix(naval): enforce ocean access via hull class, not unit-type string checks

Replaces the two duplicated unit.type === 'transport' checks (unit-system.ts
and unit-movement-system.ts) with one shared canHullEnterOcean() predicate
reading UnitDefinition.waterAccess. Drops the galleys/celestial-navigation
movement-time tech gate entirely — hull class is now permanent. Fixes #751."
```

---

## Task 3: Tech tree — repurpose `celestial-navigation`

**Files:**
- Modify: `src/systems/tech-definitions-eras1-4.ts` (`celestial-navigation`, `navigation`,
  `triremes`)
- Modify: `src/systems/tech-definitions-eras5-7.ts` (`colonial-trade`)
- Test: `tests/systems/naval-water-class.test.ts` (append tech-tree test)

**Interfaces:**
- Consumes: `Tech` interface (`src/core/types.ts:610-624`), `TECH_TREE` export
  (`src/systems/tech-definitions.ts`).

- [ ] **Step 1: Write the failing tech-tree test (append to `tests/systems/naval-water-class.test.ts`)**

Add this import:

```ts
import { TECH_TREE } from '@/systems/tech-definitions';
```

Add this describe block:

```ts
describe('celestial-navigation repurposed as an ocean-going production prerequisite', () => {
  function techPrereqs(id: string): string[] {
    return TECH_TREE.find(tech => tech.id === id)?.prerequisites ?? [];
  }

  it('is a prerequisite of navigation (first ocean-going cargo hull, Carrack)', () => {
    expect(techPrereqs('navigation')).toContain('celestial-navigation');
  });

  it('is a prerequisite of triremes (first ocean-going combat hull, Trireme)', () => {
    expect(techPrereqs('triremes')).toContain('celestial-navigation');
  });

  it('is a prerequisite of colonial-trade (first ocean-going trade hull, Naval Trader)', () => {
    expect(techPrereqs('colonial-trade')).toContain('celestial-navigation');
  });

  it('no longer claims to be a movement unlock', () => {
    const tech = TECH_TREE.find(t => t.id === 'celestial-navigation')!;
    expect(tech.unlocks).not.toContain('Units can cross ocean');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/naval-water-class.test.ts`
Expected: FAIL — the three `prerequisites` arrays don't include `celestial-navigation` yet, and
`celestial-navigation`'s `unlocks` still says `'Units can cross ocean'`.

- [ ] **Step 3: Edit `src/systems/tech-definitions-eras1-4.ts`**

Change (current line 47-48):

```ts
  { id: 'sailing', name: 'Sailing', track: 'exploration', cost: 10, prerequisites: ['pathfinding'], unlocks: ['Units can embark on coast'], era: 2 },
  { id: 'celestial-navigation', name: 'Celestial Navigation', track: 'exploration', cost: 30, prerequisites: ['sailing', 'fire'], unlocks: ['Units can cross ocean'], era: 2 },
```

to:

```ts
  { id: 'sailing', name: 'Sailing', track: 'exploration', cost: 10, prerequisites: ['pathfinding'], unlocks: ['Units can embark on coast'], era: 2 },
  { id: 'celestial-navigation', name: 'Celestial Navigation', track: 'exploration', cost: 30, prerequisites: ['sailing', 'fire'], unlocks: ['Unlocks construction of ocean-going ship hulls'], era: 2 },
```

Change (current line 98-100):

```ts
  { id: 'galleys', name: 'Galleys', track: 'maritime', cost: 30, prerequisites: ['fishing', 'sailing'], unlocks: [], unlocksUnits: ['galley', 'transport'], era: 2 },
  { id: 'navigation', name: 'Navigation', track: 'maritime', cost: 25, prerequisites: ['galleys'], unlocks: [], unlocksUnits: ['carrack'], era: 2 },
  { id: 'triremes', name: 'Triremes', track: 'maritime', cost: 55, prerequisites: ['navigation'], unlocks: [], unlocksUnits: ['trireme', 'galleon'], era: 3 },
```

to:

```ts
  { id: 'galleys', name: 'Galleys', track: 'maritime', cost: 30, prerequisites: ['fishing', 'sailing'], unlocks: [], unlocksUnits: ['galley', 'transport'], era: 2 },
  { id: 'navigation', name: 'Navigation', track: 'maritime', cost: 25, prerequisites: ['galleys', 'celestial-navigation'], unlocks: [], unlocksUnits: ['carrack'], era: 2 },
  { id: 'triremes', name: 'Triremes', track: 'maritime', cost: 55, prerequisites: ['navigation', 'celestial-navigation'], unlocks: [], unlocksUnits: ['trireme', 'galleon'], era: 3 },
```

(`triremes` already has `navigation` as a prerequisite, and `navigation` now requires
`celestial-navigation`, so `celestial-navigation` is already transitively required before
`triremes` — the explicit second entry is intentional belt-and-suspenders, matching this file's
existing style of listing every real dependency explicitly rather than relying on transitivity,
and it's what the test in Step 1 checks directly.)

- [ ] **Step 4: Edit `src/systems/tech-definitions-eras5-7.ts`**

Find `colonial-trade` (current lines 31-33):

```ts
  { id: 'colonial-trade', name: 'Colonial Trade', track: 'economy', cost: 185,
    prerequisites: ['trade-routes', 'banking'],
    unlocks: ['Trade routes to foreign civs yield +2 gold'], unlocksUnits: ['naval_trader'], era: 5 },
```

to:

```ts
  { id: 'colonial-trade', name: 'Colonial Trade', track: 'economy', cost: 185,
    prerequisites: ['trade-routes', 'banking', 'celestial-navigation'],
    unlocks: ['Trade routes to foreign civs yield +2 gold'], unlocksUnits: ['naval_trader'], era: 5 },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/naval-water-class.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the fast suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. Watch specifically for `tech-unlocks-consistency.test.ts` and any tech-tree
cycle/reachability test — adding a new prerequisite edge can't create a cycle here
(`celestial-navigation` has no dependency on `navigation`, `triremes`, or `colonial-trade`), but
run the suite rather than assuming.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/tech-definitions-eras1-4.ts src/systems/tech-definitions-eras5-7.ts tests/systems/naval-water-class.test.ts
git commit -m "feat(naval): repurpose celestial-navigation as ocean-hull production gate

celestial-navigation no longer gates movement (hull class does that now,
see previous commit). It becomes a prerequisite of the first tech that
unlocks an ocean-going hull in each naval line: navigation (Carrack),
triremes (Trireme + Galleon), colonial-trade (Naval Trader). Rewrites its
unlocks text so it stops claiming a movement effect it no longer has."
```

---

## Task 4: Content honesty — descriptions and denylist

**Files:**
- Modify: `src/systems/unit-system.ts` (`UNIT_DESCRIPTIONS['galley']`, `['trireme']`)
- Modify: `tests/systems/description-honesty.test.ts` (`DENYLIST_PATTERNS`)

**Interfaces:**
- Consumes: `UNIT_DESCRIPTIONS` export (`src/systems/unit-system.ts:651`).

- [ ] **Step 1: Edit `UNIT_DESCRIPTIONS` in `src/systems/unit-system.ts`**

Change (current lines 661-662):

```ts
  galley: 'Coastal vessel for exploration and early naval patrols',
  trireme: 'Warship with strong naval combat capabilities',
```

to:

```ts
  galley: 'Coastal vessel for exploration and early naval patrols. Cannot enter open ocean.',
  trireme: 'Warship with strong naval combat capabilities. Ocean-capable — can sail beyond the coast.',
```

- [ ] **Step 2: Add the retired tech text to the description-honesty denylist**

In `tests/systems/description-honesty.test.ts`, add one entry to `DENYLIST_PATTERNS` (current
lines 11-25), with a comment explaining why (matching this file's existing comment convention for
each entry's provenance):

```ts
const DENYLIST_PATTERNS: RegExp[] = [
  /enables air support/i,
  /decisive edge/i,
  /acts as strategic deterrent/i,
  /eliminates maintenance costs/i,
  /market manipulation/i,
  /2-hex protection bubble/i,
  /gunpowder units train faster/i,
  /units train with bonus strength/i,
  /early unit training costs reduced/i,
  // #524 MR2: air_force_command's +4 strength modifier only applies when the air
  // unit is attacking (unit-modifier-definitions.ts: when: 'attacking') — the old
  // "in combat" wording implied it also applied on defense, which it never has.
  /air units gain \+4 strength in combat/i,
  // #751: celestial-navigation used to be the only thing that gated ocean movement
  // (and only for Transport, via a hardcoded check) — now ocean access is a permanent
  // per-hull property (UnitDefinition.waterAccess) and celestial-navigation is a
  // production prerequisite instead. This phrase claimed a universal movement unlock
  // that was never true for any unit except Transport, and isn't true for anyone now.
  /units can cross ocean/i,
];
```

- [ ] **Step 3: Run the description-honesty test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/description-honesty.test.ts`
Expected: PASS — the new denylist pattern doesn't match anything currently in
`UNIT_DESCRIPTIONS`/`Tech.unlocks`/`Building.description`, since Task 3 already rewrote the only
string that used to match it.

- [ ] **Step 4: Run the fast suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-system.ts tests/systems/description-honesty.test.ts
git commit -m "docs(naval): make Galley/Trireme descriptions state their water access

Galley's description already implied coastal-only but didn't say so
directly; Trireme's said nothing about water at all despite gaining a real
new capability (ocean crossing) in this change. Also denylists the retired
'Units can cross ocean' phrase so it can't silently resurface elsewhere."
```

---

## Task 5: Save migration — relocate coastal hulls stranded on ocean

**Files:**
- Modify: `src/storage/save-migrations.ts` (new `nearestCoastTile`,
  `migrateCoastalHullsOffOcean`, schema version bump, registration)
- Modify: `tests/storage/save-migrations.test.ts` (new describe block)

**Interfaces:**
- Consumes: `UNIT_DEFINITIONS` (already imported in `save-migrations.ts`), `appendNotification`
  from `@/core/notification-log`, `syncTransportCargoPositions` from
  `@/systems/transport-system`, `hexKey`/`hexNeighbors`/`getWrappedHexNeighbors` from
  `@/systems/hex-utils`.
- Produces: `CURRENT_SAVE_SCHEMA_VERSION` bumped from `8` to `9`; `SAVE_MIGRATIONS[9]`.

- [ ] **Step 1: Write the failing migration tests (append to `tests/storage/save-migrations.test.ts`)**

Add this describe block at the end of the file:

```ts
describe('#751 — migrateCoastalHullsOffOcean (schema 9)', () => {
  it('relocates a coastal-only hull stranded on ocean to the nearest coast tile', () => {
    const save = createNewGame('rome', 'naval-migration-relocate', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;

    const coastEntry = Object.entries(save.map.tiles).find(([, tile]) => tile.terrain === 'coast');
    if (!coastEntry) throw new Error('fixture map has no coast tile — regenerate with a different seed');
    const [, coastTile] = coastEntry;
    const oceanNeighborKey = Object.keys(save.map.tiles).find(key => {
      const tile = save.map.tiles[key]!;
      if (tile.terrain !== 'ocean') return false;
      const dq = Math.abs(tile.coord.q - coastTile.coord.q);
      const dr = Math.abs(tile.coord.r - coastTile.coord.r);
      return dq <= 1 && dr <= 1;
    });
    if (!oceanNeighborKey) throw new Error('fixture map has no ocean tile adjacent to a coast tile — regenerate with a different seed');
    const oceanTile = save.map.tiles[oceanNeighborKey]!;

    const galley = { ...Object.values(save.units)[0]!, id: 'stranded-galley', type: 'galley' as const, owner: civ.id, position: { ...oceanTile.coord } };
    save.units = { [galley.id]: galley };
    civ.units = [galley.id];

    const migrated = migrateSaveToCurrent(save);
    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    const relocated = migrated.units[galley.id]!;
    const relocatedTile = migrated.map.tiles[`${relocated.position.q},${relocated.position.r}`]!;
    expect(relocatedTile.terrain).not.toBe('ocean');
  });

  it('moves loaded cargo along with a relocated Transport', () => {
    const save = createNewGame('rome', 'naval-migration-cargo', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;

    const coastEntry = Object.entries(save.map.tiles).find(([, tile]) => tile.terrain === 'coast');
    if (!coastEntry) throw new Error('fixture map has no coast tile — regenerate with a different seed');
    const [, coastTile] = coastEntry;
    const oceanNeighborKey = Object.keys(save.map.tiles).find(key => {
      const tile = save.map.tiles[key]!;
      if (tile.terrain !== 'ocean') return false;
      const dq = Math.abs(tile.coord.q - coastTile.coord.q);
      const dr = Math.abs(tile.coord.r - coastTile.coord.r);
      return dq <= 1 && dr <= 1;
    });
    if (!oceanNeighborKey) throw new Error('fixture map has no ocean tile adjacent to a coast tile — regenerate with a different seed');
    const oceanTile = save.map.tiles[oceanNeighborKey]!;

    const transport = { ...Object.values(save.units)[0]!, id: 'stranded-transport', type: 'transport' as const, owner: civ.id, position: { ...oceanTile.coord }, cargoUnitIds: ['cargo-warrior'] };
    const cargo = { ...Object.values(save.units)[0]!, id: 'cargo-warrior', type: 'warrior' as const, owner: civ.id, position: { ...oceanTile.coord }, transportId: transport.id };
    save.units = { [transport.id]: transport, [cargo.id]: cargo };
    civ.units = [transport.id, cargo.id];

    const migrated = migrateSaveToCurrent(save);
    const relocatedTransport = migrated.units[transport.id]!;
    const relocatedCargo = migrated.units[cargo.id]!;
    expect(relocatedCargo.position).toEqual(relocatedTransport.position);
  });

  it('removes a coastal-only unit with no reachable coast (deletion fallback)', () => {
    const save = createNewGame('rome', 'naval-migration-no-coast', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;

    const oceanTiles: GameState['map']['tiles'] = {};
    for (let q = 0; q < 3; q += 1) {
      for (let r = 0; r < 3; r += 1) {
        oceanTiles[`${q},${r}`] = {
          coord: { q, r }, terrain: 'ocean', elevation: 'lowland', resource: null,
          improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        };
      }
    }
    save.map = { width: 3, height: 3, tiles: oceanTiles, wrapsHorizontally: false, rivers: [] };

    const galley = { ...Object.values(save.units)[0]!, id: 'unreachable-galley', type: 'galley' as const, owner: civ.id, position: { q: 1, r: 1 } };
    save.units = { [galley.id]: galley };
    civ.units = [galley.id];
    // The synthetic 3x3 map above doesn't contain createNewGame's original starting-city
    // position, so both save.cities and civ.cities must be cleared together here — leaving
    // civ.cities pointing at a city id no longer present in save.cities would dangle through
    // this migration pipeline's unconditional passes exactly the way a stale diplomacy
    // reference would (see game-systems.md's Diplomacy Lifecycle rule for the general pattern).
    save.cities = {};
    civ.cities = [];

    const migrated = migrateSaveToCurrent(save);
    expect(migrated.units[galley.id]).toBeUndefined();
    expect(migrated.civilizations.player.units).not.toContain(galley.id);
  });

  it('logs a per-owner notification and does not leak it to other civs (hot-seat privacy)', () => {
    const save = createNewGame('rome', 'naval-migration-notify', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;
    const otherCivId = Object.keys(save.civilizations).find(id => id !== civ.id)!;

    const coastEntry = Object.entries(save.map.tiles).find(([, tile]) => tile.terrain === 'coast');
    if (!coastEntry) throw new Error('fixture map has no coast tile — regenerate with a different seed');
    const [, coastTile] = coastEntry;
    const oceanNeighborKey = Object.keys(save.map.tiles).find(key => {
      const tile = save.map.tiles[key]!;
      if (tile.terrain !== 'ocean') return false;
      const dq = Math.abs(tile.coord.q - coastTile.coord.q);
      const dr = Math.abs(tile.coord.r - coastTile.coord.r);
      return dq <= 1 && dr <= 1;
    });
    if (!oceanNeighborKey) throw new Error('fixture map has no ocean tile adjacent to a coast tile — regenerate with a different seed');
    const oceanTile = save.map.tiles[oceanNeighborKey]!;

    const galley = { ...Object.values(save.units)[0]!, id: 'stranded-galley', type: 'galley' as const, owner: civ.id, position: { ...oceanTile.coord } };
    save.units = { [galley.id]: galley };
    civ.units = [galley.id];

    const migrated = migrateSaveToCurrent(save);
    const ownerNotifications = migrated.notificationLog?.[civ.id] ?? [];
    const otherNotifications = migrated.notificationLog?.[otherCivId] ?? [];
    expect(ownerNotifications.some(entry => entry.message.includes('Galley'))).toBe(true);
    expect(otherNotifications.some(entry => entry.message.includes('Galley'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/storage/save-migrations.test.ts`
Expected: FAIL — `saveSchemaVersion: 8` currently migrates cleanly to `8` (already current), so no
relocation happens and the stranded Galley stays on `ocean`.

- [ ] **Step 3: Implement the migration in `src/storage/save-migrations.ts`**

Update the top-of-file imports. Current line 1:

```ts
import type { ActiveCrisis, AirBaseRef, GameState, Unit } from '@/core/types';
```

to:

```ts
import type { ActiveCrisis, AirBaseRef, GameState, HexCoord, Unit } from '@/core/types';
```

Add these two new imports after the existing `import { UNIT_DEFINITIONS } from '@/systems/unit-system';` (current line 9):

```ts
import { hexKey, hexNeighbors, getWrappedHexNeighbors } from '@/systems/hex-utils';
import { appendNotification } from '@/core/notification-log';
import { syncTransportCargoPositions } from '@/systems/transport-system';
```

Add these two new functions right before `export const SAVE_MIGRATIONS` (current line 354):

```ts
/**
 * BFS outward from `start` over ocean/coast tiles only, returning the nearest coast tile.
 * Deterministic (neighbors visited in sorted hexKey order) so migration output doesn't depend
 * on map object iteration order. Returns null if the connected water body has no coast tile at
 * all (only possible on a pathological all-ocean map).
 */
function nearestCoastTile(map: GameState['map'], start: HexCoord): HexCoord | null {
  const visited = new Set<string>([hexKey(start)]);
  let frontier: HexCoord[] = [start];
  while (frontier.length > 0) {
    const next: HexCoord[] = [];
    for (const coord of frontier) {
      const neighbors = map.wrapsHorizontally
        ? getWrappedHexNeighbors(coord, map.width)
        : hexNeighbors(coord);
      const sorted = [...neighbors].sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
      for (const neighbor of sorted) {
        const key = hexKey(neighbor);
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = map.tiles[key];
        if (!tile || (tile.terrain !== 'ocean' && tile.terrain !== 'coast')) continue;
        if (tile.terrain === 'coast') return neighbor;
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * #751: coastal-only hulls (Galley, Transport, and their pirate equivalents) used to be able to
 * enter ocean tiles due to the bug this MR fixes. Any existing save may have one of those units
 * sitting on `ocean` right now, which is no longer a legal position for its hull. Relocate to
 * the nearest coast tile (deterministic BFS); if no coast is reachable at all (pathological
 * landlocked-ocean map), remove the unit rather than leave it permanently stranded and
 * unselectable — mirrors the deletion fallback in migrateLegacyBasedAircraft above.
 */
function migrateCoastalHullsOffOcean(state: GameState): GameState {
  const units = { ...state.units };
  const removedIds = new Set<string>();
  const relocatedIds: string[] = [];

  const strandedIds = Object.values(state.units)
    .filter(unit => {
      const def = UNIT_DEFINITIONS[unit.type];
      if (!def || def.waterAccess === 'ocean') return false;
      const tile = state.map.tiles[hexKey(unit.position)];
      return tile?.terrain === 'ocean';
    })
    .map(unit => unit.id)
    .sort();

  for (const unitId of strandedIds) {
    const unit = units[unitId];
    if (!unit) continue;
    const destination = nearestCoastTile(state.map, unit.position);
    if (!destination) {
      delete units[unitId];
      removedIds.add(unitId);
      continue;
    }
    units[unitId] = { ...unit, position: { ...destination } };
    relocatedIds.push(unitId);
  }

  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
    civId,
    removedIds.size > 0 ? { ...civ, units: civ.units.filter(id => !removedIds.has(id)) } : civ,
  ]));

  let working: GameState = { ...state, units, civilizations };
  for (const unitId of relocatedIds) {
    working = syncTransportCargoPositions(working, unitId);
    const unit = working.units[unitId]!;
    const name = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
    appendNotification(working, unit.owner, {
      message: `Your ${name} couldn't survive the open ocean and put in near shore.`,
      type: 'warning',
      turn: working.turn,
    });
  }
  return working;
}
```

Update `CURRENT_SAVE_SCHEMA_VERSION` (current line 14):

```ts
export const CURRENT_SAVE_SCHEMA_VERSION = 8;
```

to:

```ts
export const CURRENT_SAVE_SCHEMA_VERSION = 9;
```

Register the new migration in `SAVE_MIGRATIONS` (current lines 354-363):

```ts
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
  2: migrateLateResources,
  3: migrateAutonomyNetwork,
  4: migrateLegacyBasedAircraft,
  5: migrateDualEraWorldAge,
  6: migrateAutonomyNetworkPostures,
  7: migrateCircularManufacturingChoices,
  8: migrateCombatNotificationDetails,
};
```

to:

```ts
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
  2: migrateLateResources,
  3: migrateAutonomyNetwork,
  4: migrateLegacyBasedAircraft,
  5: migrateDualEraWorldAge,
  6: migrateAutonomyNetworkPostures,
  7: migrateCircularManufacturingChoices,
  8: migrateCombatNotificationDetails,
  9: migrateCoastalHullsOffOcean,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/storage/save-migrations.test.ts`
Expected: all PASS, including the pre-existing tests in this file (double-check none of them
hardcode `CURRENT_SAVE_SCHEMA_VERSION` as a literal `8` instead of importing the constant — if one
does, it needs updating to `9` as part of this step, not deferred).

**Execution note (real bug found during implementation):** the first pass at `strandedIds`'
filter — `if (!def || def.waterAccess === 'ocean') return false;` — is wrong. `waterAccess` is
only meaningful on naval units; every non-naval unit (aircraft, land units) has
`waterAccess: undefined`, which is `!== 'ocean'` and so incorrectly passed the filter. Any
non-naval unit that happened to be positioned on an `ocean` tile (a legacy aircraft in the
existing `migrateLegacyBasedAircraft` test fixture, in this case) got swept up and relocated by
this migration, silently corrupting a completely unrelated, already-passing test one migration
step later in the pipeline. Fixed by requiring `def.domain === 'naval'` explicitly:
`if (!def || def.domain !== 'naval' || def.waterAccess === 'ocean') return false;`. This is
exactly the kind of bug the full-suite run (not just the new tests in isolation) exists to catch —
running only `naval-water-class.test.ts` or only the new describe block in
`save-migrations.test.ts` would never have surfaced it.

- [ ] **Step 5: Run the fast suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

**Execution note (second real bug found via the full suite, not the targeted test run):** even
after the domain-check fix above, the full suite surfaced one more failure —
`tests/storage/save-manager.test.ts`'s "migrates legacy pirate fleets into distinct active v2
flotillas" test placed a legacy `galley` unit (which normalizes to `pirate_galley`, coastal-only)
directly on a real ocean tile from the generated map, then asserted its position stayed exactly at
that tile through migration. That assertion predates hull classes and is simply wrong now — the
migration correctly relocates it. Fixed by asserting the unit's new tile isn't `ocean` instead of
pinning the exact original coordinate, with a comment explaining why. This is the second instance
in this task of "the new migration works correctly and an old test's fixture just happened to
already be sitting in the exact scenario it targets" — both were only found by running the full
suite, not the isolated new-test files.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/storage/save-migrations.ts tests/storage/save-migrations.test.ts
git commit -m "feat(naval): migrate coastal-only hulls off ocean tiles on save load

Schema bump 8 -> 9. Any unit whose hull is coastal-only but is sitting on
an ocean tile (only possible in a pre-#751 save, since that placement is
no longer reachable through normal play) is relocated to the nearest
coast tile via deterministic BFS, with a deletion fallback if none is
reachable. Loaded cargo follows its Transport via the existing
syncTransportCargoPositions helper. Logs a per-owner notification, scoped
so it never appears on another civ's screen in hot-seat."
```

---

## Task 6: Regression sweep

**Files:**
- Read-only investigation across `tests/`, fixing whatever it finds.

- [ ] **Step 1: Search for other references to the retired blocker codes**

Run: `grep -rn "requires-galleys\|requires-celestial-navigation" src tests`
Expected output: no results, OR results only inside files already edited in Tasks 2/4/5 above. If
any other file (test or source) still references either retired code string, open it, and:
- If it's a test asserting the old behavior, update it to assert `'requires-ocean-hull'` (or
  `null`, if the unit involved is actually ocean-going per the Task 1 classification table) using
  the same pattern as Task 2 Step 5's replacement test.
- If it's source code (not test) still branching on either string, that's a second duplicate
  implementation this plan's research didn't find — stop and re-run Task 2's grep methodology
  (`grep -rn "unit.type === 'transport'" src`) before proceeding, since it means the root cause
  from the design spec's Problem section wasn't fully addressed.

- [ ] **Step 2: Search for fixtures asserting the old Galley/Transport-can-enter-ocean bug**

Run: `grep -rln "'galley'" tests/systems tests/ai tests/renderer tests/input tests/ui 2>/dev/null`
For each file found, read the surrounding test and check whether it places a Galley or Transport
on an `'ocean'` tile and asserts a successful move, non-null path, or non-blocked result. If so,
that assertion now describes the bug this plan fixes — update it to assert the move is blocked
(`getMovementBlockerReason(...)?.code === 'requires-ocean-hull'`) or move the fixture's ocean tile
to `'coast'` instead, whichever better matches what the test is actually trying to verify (read
the test's surrounding `describe` block name for intent before choosing).

- [ ] **Step 3: Confirm Trireme is not accidentally caught by a broad "early naval unit" test assumption**

Run: `grep -rln "'trireme'" tests/systems tests/ai tests/renderer tests/input tests/ui 2>/dev/null`
For each file found, check whether it groups Trireme with Galley/Transport under a shared
"coastal early-game ship" assumption (e.g., a loop asserting a property for "all era-2/3 naval
units" that would now incorrectly include Trireme). Per the design spec, Trireme is ocean-going —
if such a test exists, split it so Trireme is tested separately from the genuinely coastal-only
pair.

- [ ] **Step 4: Run the fast suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS with zero remaining references to retired blocker codes and no fixture asserting
the pre-fix bug as correct behavior.

- [ ] **Step 5: Commit (only if Steps 1-3 found and fixed anything)**

```bash
git add -A
git commit -m "test(naval): fix fixtures left asserting pre-#751 ocean-access bug

Regression sweep found and corrected [describe what was found — e.g.
'N fixtures in <file> asserting Galley could enter ocean']."
```

If Steps 1-3 found nothing to fix, skip this commit — there's nothing to commit, and an empty
commit would misrepresent this task as having changed something it didn't.

**Execution result:** Steps 1-3 found nothing left to fix. `grep -rn "requires-galleys\|requires-
celestial-navigation" src tests` returned zero hits, `grep -rn "unit.type === 'transport'" src`
returned one hit (`unit-movement-system.ts:153`, unrelated cargo-position-sync logic, not a
duplicate water-access check), and every fixture referencing `'galley'`/`'trireme'` across
`tests/systems`, `tests/ai`, `tests/renderer`, `tests/input`, `tests/ui` was already exercised by
the full suite run in Tasks 2 and 5 — both of which found and fixed every real instance of this
class of bug at the time (the pirate/AI fixtures placing a now-coastal-only hull on an all-ocean
map, and the two save-migration test position assertions). No commit made for this task.

---

## Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the complete test suite (not just the fast tier)**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. Note this repo's fast/slow test-tier split
(`.claude/rules/hooks-and-tooling.md`) — `yarn test` here is the full suite including slow-tier
files; that's intentional for this final gate, matching what CI's required check runs.

- [ ] **Step 2: Targeted rerun of the three tests flagged as worth a specific check in the design spec**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts tests/systems/world-pressure-fairness.test.ts`
Expected: PASS. This change touches no yield or production-cost value, so none of these should be
directly affected — but AI naval-expansion timing on archipelago-style maps is close enough to
what `world-pressure-fairness.test.ts` guards that it's worth confirming directly rather than
inferring from the general suite pass in Step 1.

- [ ] **Step 3: Production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS, zero TypeScript errors.

- [ ] **Step 4: Manual sanity check of the map-generator connectivity risk flagged in the spec (read-only, no code change)**

The spec flags an unverified risk: no invariant guarantees a coastal path exists between every
pair of landmasses, which combined with coastal-only hulls could soft-lock an explorer-style
player. This step is a check, not a fix — if it finds a real problem, stop and report to the user
rather than silently expanding this plan's scope.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/map-generator.test.ts 2>&1 | tail -30`
to confirm no existing test already covers this (expected: it doesn't — the spec's `grep` already
established this). Then, as a one-off check (not a new permanent test unless the finding warrants
one): generate a handful of maps at different seeds and confirm every landmass has at least one
`coast` tile adjacent to a `grassland`/`plains`/similar land tile reachable from every other
landmass's coast via an all-`coast` path (not crossing `ocean`). If this check reveals a real
soft-lock case, report it to the user as a separate follow-up rather than fixing it inline here —
it's explicitly out of scope for this plan per the spec.

**Execution result: the risk is real.** A throwaway check (landmass connected-component
detection + coast-only BFS between landmasses' coastal fringes, generated via `generateMap` at 5
seeds × 3 map sizes, run once via a temporary test file and deleted afterward — not committed, not
a permanent test) found that in 19 of the ~19 multi-landmass map/seed combinations tested, at
least one pair of landmasses had **no** coast-only path between them at all. The map generator
gives no connectivity guarantee between separate landmasses. Combined with coastal-only hulls
(Galley, Transport), this means an explorer-style player can very plausibly be unable to reach a
second landmass until an ocean-going hull exists (Carrack at era 2, at the earliest) — not a rare
edge case, but close to the generator's normal output. Per this step's own instruction, this is
reported to the user rather than fixed here; it needs its own separate decision (accept as
intentional pacing, or file a map-generator follow-up issue) before any code response.

- [ ] **Step 5: Report final status**

Summarize for the user: all tasks complete, full suite green, build green, and the map-connectivity
check's outcome from Step 4 (clean, or a follow-up issue is warranted).

---

## Self-Review Notes (completed during plan authoring, not a step to execute)

- **Spec coverage:** every numbered section of the spec (Problem, Decision, Data model, Hull
  classification, Movement enforcement, Tech tree, Content updates, Save migration, Testing) maps
  to a task above. UI/UX and the retracted AI section are explicitly out of scope per the Global
  Constraints note, not silently dropped.
- **Placeholder scan:** no task step below contains TBD/TODO/"handle appropriately" — Task 6 is
  the one inherently investigative task (a regression sweep can't enumerate unknown fixtures in
  advance), and its steps give exact grep commands and exact decision criteria rather than vague
  instructions.
- **Type consistency:** `canHullEnterOcean(unitType: UnitType): boolean` (Task 2) matches its use
  in both `unit-system.ts` and `unit-movement-system.ts` — `getImpassableReason`'s `unitType`
  parameter is retyped from bare `string` to `UnitType` as part of this task (its only caller
  always passed a `UnitType` anyway), so no cast is needed at either call site.
  `waterAccess: 'coastal' | 'ocean'` (Task 1) is used identically in every later task that reads
  it.
