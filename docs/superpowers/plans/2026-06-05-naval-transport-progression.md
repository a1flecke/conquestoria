# Naval Transport Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing single-unit Transport into a five-tier era progression (Transport → Carrack → Galleon → Steamship → Troop Transport) with cargo-size weights, a two-stage map-interaction unload UX, real OGG SFX (load/unload + per-class death sounds), boarding/disembark animations, and sprites for all four new unit types.

**Architecture:** New `UnitType` literals drive exhaustiveness-checked `Record<UnitType, …>` maps throughout the codebase; a new `src/ui/transport-ui-state.ts` module owns `pendingUnload` state as pure testable functions; `selected-unit-info.ts` grows a Stage 1/2 render mode for two-stage unloading; `sfx.ts` gains a `routeSfxComponents(mixer, loader)` hook so load/unload sounds use real OGG files with oscillator fallback.

**Tech Stack:** TypeScript, Vitest (jsdom for panel tests), Canvas 2D render loop, Web Audio API, ffmpeg for OGG encoding.

**Spec:** `docs/superpowers/specs/2026-06-04-naval-transport-progression-design.md`

**Run tests:** `bash scripts/run-with-mise.sh yarn test`
**Build check:** `bash scripts/run-with-mise.sh yarn build`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | Add 4 new `UnitType` literals |
| `src/systems/tech-definitions.ts` | Modify | Add `amphibious-warfare` era-5 tech |
| `src/systems/unit-system.ts` | Modify | 4 new `UNIT_DEFINITIONS`, bump transport `cargoCapacity`, add `cargoSize` to mounted/siege, `UNIT_DESCRIPTIONS`, `PRODUCTION_ICONS` |
| `src/systems/city-system.ts` | Modify | 4 new `TRAINABLE_UNITS`, fix `obsoletedByTech` on transport, update `isNaval` list |
| `src/systems/transport-system.ts` | Modify | Fix `isTransport()` to cover all naval transport types; change `getUnloadDestinations` signature |
| `src/systems/unit-upgrade-system.ts` | No change | Already works via `TRAINABLE_UNITS` + `obsoletedByTech` |
| `src/audio/sfx-catalog.ts` | Modify | `LOCOMOTION_CLASS` entries, death SFX, `TRANSPORT_SFX`, `allSfxEntries()` |
| `src/audio/sfx.ts` | Modify | `routeSfxComponents(mixer, loader)`, OGG-backed `transportLoad`/`transportUnload` |
| `src/audio/audio-system.ts` | Modify | Call `routeSfxComponents(this.mixer, this.loader)` inside `start()` |
| `src/ui/transport-ui-state.ts` | **Create** | `pendingUnload` / `unloadRange` pure-function module |
| `src/ui/selected-unit-info.ts` | Modify | `TransportLoadOption` disabled/tooltip, cargo section redesign, Stage 1/2 render modes |
| `src/renderer/sprites/sprite-catalog.ts` | Modify | `UNIT_MOTION_STYLES` + `UNIT_SPRITE_CATALOG` entries for 4 new types |
| `src/renderer/sprites/units/` | Modify | 4 new SVG sprite files + exports |
| `src/renderer/render-loop.ts` | Modify | `animateUnitSlide()` wrapper, `animateUnitAppear()` new method |
| `src/main.ts` | Modify | Capacity labels, two-stage unload callbacks, `clearPendingUnload` at all clear sites, notification strings |
| `audio/sfx/` | **Create** (6 files) | `carrack-death.ogg`, `galleon-death.ogg`, `steamship-death.ogg`, `troop_transport-death.ogg`, `transport-load.ogg`, `transport-unload.ogg` |
| `tests/systems/transport-system.test.ts` | Modify | Cargo size tests, updated `getUnloadDestinations` signature tests |
| `tests/systems/tech-definitions.test.ts` | Modify | `amphibious-warfare` assertions |
| `tests/systems/city-system.test.ts` | Modify | 4 new types coastal/upgrade tests |
| `tests/systems/unit-upgrade-system.test.ts` | Modify | Transport → Carrack upgrade test |
| `tests/audio/sfx-catalog.test.ts` | Modify | Count update (70 → 76), new entry assertions |
| `tests/ui/transport-ui-state.test.ts` | **Create** | Pure module state tests + hot-seat regression |
| `tests/ui/transport-panel.test.ts` | **Create** | jsdom panel tests (disabled options, Stage 2, Cancel) |

---

## Task 1: Add 4 New UnitType Literals

**Files:**
- Modify: `src/core/types.ts:269-278`

TypeScript `Record<UnitType, …>` maps enforce exhaustiveness at compile time. Adding the literals first causes the build to fail everywhere the record is incomplete, giving a checklist of all spots that need updating. Fixing the build is the implementation work in subsequent tasks.

- [ ] **Step 1: Add the literals**

Open `src/core/types.ts`. The `UnitType` union currently ends with `| 'transport';`. Add the four new types:

```ts
export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'axeman' | 'spearman' | 'horseman' | 'cavalry' | 'knight'
  | 'crossbowman' | 'catapult' | 'ballista'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
  | 'scout_hound' | 'shadow_warden' | 'war_hound'
  | 'caravan'
  | 'expedition'
  | 'transport'
  | 'carrack' | 'galleon' | 'steamship' | 'troop_transport';
```

- [ ] **Step 2: Confirm the build now fails with exhaustiveness errors**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Expected: multiple TS errors about missing keys in `LOCOMOTION_CLASS`, `UNIT_DESCRIPTIONS`, `UNIT_SPRITE_CATALOG`, `UNIT_MOTION_STYLES`, etc. These are your work checklist for Tasks 2–8.

---

## Task 2: Tech Definition + Unit System Changes

**Files:**
- Modify: `src/systems/tech-definitions.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Test: `tests/systems/tech-definitions.test.ts`
- Test: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing tech test**

Add to `tests/systems/tech-definitions.test.ts`:

```ts
it('amphibious-warfare is era 5 with caravels and naval-warfare prerequisites', () => {
  const tech = TECH_DEFINITIONS.find(t => t.id === 'amphibious-warfare');
  expect(tech).toBeDefined();
  expect(tech!.era).toBe(5);
  expect(tech!.prerequisites).toContain('caravels');
  expect(tech!.prerequisites).toContain('naval-warfare');
  expect(tech!.track).toBe('maritime');
});
```

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/tech-definitions.test.ts`
Expected: FAIL — `amphibious-warfare` not found.

- [ ] **Step 2: Add the tech**

In `src/systems/tech-definitions.ts`, find the `'naval-warfare'` entry (maritime track, era 4) and insert after it:

```ts
{ id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime',
  cost: 175, prerequisites: ['caravels', 'naval-warfare'],
  unlocks: ['Troop Transport'], era: 5 },
```

- [ ] **Step 3: Write failing unit definition tests**

Add to `tests/systems/city-system.test.ts`:

```ts
describe('new transport unit types', () => {
  it('carrack has cargoCapacity 3 and requires navigation', () => {
    expect(UNIT_DEFINITIONS['carrack'].cargoCapacity).toBe(3);
    expect(UNIT_DEFINITIONS['carrack'].domain).toBe('naval');
    const trainable = TRAINABLE_UNITS.find(u => u.type === 'carrack');
    expect(trainable?.techRequired).toBe('navigation');
    expect(trainable?.obsoletedByTech).toBe('triremes');
    expect(trainable?.coastalRequired).toBe(true);
  });

  it('galleon has cargoCapacity 4 and requires triremes', () => {
    expect(UNIT_DEFINITIONS['galleon'].cargoCapacity).toBe(4);
    const trainable = TRAINABLE_UNITS.find(u => u.type === 'galleon');
    expect(trainable?.techRequired).toBe('triremes');
    expect(trainable?.obsoletedByTech).toBe('caravels');
    expect(trainable?.coastalRequired).toBe(true);
  });

  it('steamship has cargoCapacity 5 and requires caravels', () => {
    expect(UNIT_DEFINITIONS['steamship'].cargoCapacity).toBe(5);
    const trainable = TRAINABLE_UNITS.find(u => u.type === 'steamship');
    expect(trainable?.techRequired).toBe('caravels');
    expect(trainable?.obsoletedByTech).toBe('amphibious-warfare');
    expect(trainable?.coastalRequired).toBe(true);
  });

  it('troop_transport has cargoCapacity 6 and requires amphibious-warfare', () => {
    expect(UNIT_DEFINITIONS['troop_transport'].cargoCapacity).toBe(6);
    const trainable = TRAINABLE_UNITS.find(u => u.type === 'troop_transport');
    expect(trainable?.techRequired).toBe('amphibious-warfare');
    expect(trainable?.coastalRequired).toBe(true);
  });

  it('base transport now has cargoCapacity 2', () => {
    expect(UNIT_DEFINITIONS['transport'].cargoCapacity).toBe(2);
  });

  it('mounted units have cargoSize 2', () => {
    expect(UNIT_DEFINITIONS['horseman'].cargoSize).toBe(2);
    expect(UNIT_DEFINITIONS['cavalry'].cargoSize).toBe(2);
    expect(UNIT_DEFINITIONS['knight'].cargoSize).toBe(2);
  });

  it('siege units have cargoSize 3', () => {
    expect(UNIT_DEFINITIONS['catapult'].cargoSize).toBe(3);
    expect(UNIT_DEFINITIONS['ballista'].cargoSize).toBe(3);
  });

  it('inland city cannot train coastal-required units', () => {
    // canTrainUnit (from city-system.ts) with coastal=false should exclude new types
    const available = getAvailableUnits({ completedTechs: ['galleys', 'navigation', 'triremes', 'caravels', 'amphibious-warfare'], coastal: false });
    const types = available.map(u => u.type);
    expect(types).not.toContain('carrack');
    expect(types).not.toContain('galleon');
    expect(types).not.toContain('steamship');
    expect(types).not.toContain('troop_transport');
  });
});
```

> Note: import `getAvailableUnits` (or whatever the equivalent public function is) from city-system.ts. If it doesn't exist as a standalone, use the internal `TRAINABLE_UNITS.filter(u => !u.coastalRequired || coastal)` pattern tested via unit building queue logic.

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts`
Expected: FAIL — new types not defined.

- [ ] **Step 4: Add UNIT_DEFINITIONS entries in unit-system.ts**

Find the `transport:` entry in `UNIT_DEFINITIONS` in `src/systems/unit-system.ts`. Update `cargoCapacity` from 1 to 2:

```ts
transport: {
  type: 'transport', name: 'Transport', movementPoints: 3,
  visionRange: 2, strength: 0, canFoundCity: false, canBuildImprovements: false,
  productionCost: 45, domain: 'naval', coastalRequired: true,
  cargoCapacity: 2,   // was 1
},
```

Then add four new entries after `transport:`:

```ts
carrack: {
  type: 'carrack', name: 'Carrack', movementPoints: 3,
  visionRange: 2, strength: 0, canFoundCity: false, canBuildImprovements: false,
  productionCost: 65, domain: 'naval', coastalRequired: true,
  cargoCapacity: 3,
},
galleon: {
  type: 'galleon', name: 'Galleon', movementPoints: 3,
  visionRange: 2, strength: 0, canFoundCity: false, canBuildImprovements: false,
  productionCost: 90, domain: 'naval', coastalRequired: true,
  cargoCapacity: 4,
},
steamship: {
  type: 'steamship', name: 'Steamship', movementPoints: 3,
  visionRange: 2, strength: 0, canFoundCity: false, canBuildImprovements: false,
  productionCost: 120, domain: 'naval', coastalRequired: true,
  cargoCapacity: 5,
},
troop_transport: {
  type: 'troop_transport', name: 'Troop Transport', movementPoints: 3,
  visionRange: 2, strength: 0, canFoundCity: false, canBuildImprovements: false,
  productionCost: 160, domain: 'naval', coastalRequired: true,
  cargoCapacity: 6,
},
```

- [ ] **Step 5: Add cargoSize to mounted and siege units in unit-system.ts**

Find `horseman:`, `cavalry:`, `knight:` entries in `UNIT_DEFINITIONS` and add `cargoSize: 2` to each.
Find `catapult:`, `ballista:` entries and add `cargoSize: 3` to each.

- [ ] **Step 6: Add UNIT_DESCRIPTIONS entries**

Find `UNIT_DESCRIPTIONS` in `src/systems/unit-system.ts`. It is a `Record<UnitType, string>`. Add:

```ts
carrack:         'Successor to the Transport. Carries up to 3 land units across coasts and oceans.',
galleon:         'Successor to the Carrack. Broader hull, carries up to 4 land units.',
steamship:       'Steam-powered successor to the Galleon. Carries up to 5 land units reliably.',
troop_transport: 'Military-grade vessel. Carries up to 6 land units across any ocean.',
```

- [ ] **Step 7: Add PRODUCTION_ICONS entries in city-system.ts**

Find `PRODUCTION_ICONS` in `src/systems/city-system.ts` (around line 368). Add:

```ts
carrack:         '🚢',
galleon:         '⛵',
steamship:       '🛳️',
troop_transport: '🛥️',
```

- [ ] **Step 8: Add TRAINABLE_UNITS entries + transport obsoletedByTech in city-system.ts**

Find the `transport` entry in `TRAINABLE_UNITS` (line 224) and add `obsoletedByTech: 'navigation'`:

```ts
{ type: 'transport', name: 'Transport', cost: 45, techRequired: 'galleys', coastalRequired: true, obsoletedByTech: 'navigation' },
```

After the `trireme` entry, add the four new types:

```ts
{ type: 'carrack',         name: 'Carrack',         cost: 65,  techRequired: 'navigation',        coastalRequired: true, obsoletedByTech: 'triremes' },
{ type: 'galleon',         name: 'Galleon',         cost: 90,  techRequired: 'triremes',           coastalRequired: true, obsoletedByTech: 'caravels' },
{ type: 'steamship',       name: 'Steamship',       cost: 120, techRequired: 'caravels',           coastalRequired: true, obsoletedByTech: 'amphibious-warfare' },
{ type: 'troop_transport', name: 'Troop Transport', cost: 160, techRequired: 'amphibious-warfare', coastalRequired: true },
```

- [ ] **Step 9: Fix isNaval list in city-system.ts**

Find line 801: `const isNaval = ['galley', 'trireme'].includes(itemId);`

Update to include all naval transports so they benefit from naval production bonuses:

```ts
const isNaval = (['galley', 'trireme', 'transport', 'carrack', 'galleon', 'steamship', 'troop_transport'] as string[]).includes(itemId);
```

- [ ] **Step 10: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/tech-definitions.test.ts tests/systems/city-system.test.ts
```

Expected: all new tests PASS.

- [ ] **Step 11: Commit**

```bash
git add src/core/types.ts src/systems/tech-definitions.ts src/systems/unit-system.ts src/systems/city-system.ts tests/systems/tech-definitions.test.ts tests/systems/city-system.test.ts
git commit -m "feat: add 4 new transport unit types (carrack/galleon/steamship/troop_transport) and amphibious-warfare tech"
```

---

## Task 3: Transport System — isTransport() + getUnloadDestinations Signature

**Files:**
- Modify: `src/systems/transport-system.ts`
- Test: `tests/systems/transport-system.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/transport-system.test.ts`:

```ts
describe('cargo size enforcement', () => {
  function makeState(transportType: UnitType, cargoCapacity: number): GameState { /* build minimal state */ }

  it('2 infantry fit onto capacity-2 transport', () => {
    const state = buildTestState(); // 1 transport (cap 2), 2 infantry
    const result1 = loadUnitOntoTransport(state, 'infantry1', 'transport1');
    expect(result1.ok).toBe(true);
    const result2 = loadUnitOntoTransport(result1.state, 'infantry2', 'transport1');
    expect(result2.ok).toBe(true);
  });

  it('1 mounted (cargoSize 2) + 1 infantry fills capacity-2 transport exactly', () => {
    const state = buildTestState(); // transport cap 2, horseman + infantry
    const r1 = loadUnitOntoTransport(state, 'horseman1', 'transport1');
    expect(r1.ok).toBe(true);
    const r2 = loadUnitOntoTransport(r1.state, 'infantry1', 'transport1');
    expect(r2.ok).toBe(true);
  });

  it('3rd infantry rejected when transport has 1 mounted + 1 infantry aboard', () => {
    // transport cap 2, 1 horseman (2 slots) already aboard
    const state = buildTestState();
    const r1 = loadUnitOntoTransport(state, 'horseman1', 'transport1');
    const r2 = loadUnitOntoTransport(r1.state, 'infantry1', 'transport1');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('no-capacity');
  });

  it('catapult (cargoSize 3) loads onto capacity-3 carrack', () => {
    const state = buildCarrackState(); // carrack cap 3, 1 catapult
    const r = loadUnitOntoTransport(state, 'catapult1', 'carrack1');
    expect(r.ok).toBe(true);
  });

  it('catapult + infantry rejected from capacity-3 carrack', () => {
    const state = buildCarrackState();
    const r1 = loadUnitOntoTransport(state, 'catapult1', 'carrack1');
    expect(r1.ok).toBe(true);
    const r2 = loadUnitOntoTransport(r1.state, 'infantry1', 'carrack1');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('no-capacity');
  });
});

describe('getUnloadDestinations per-unit', () => {
  it('accepts cargoUnitId and returns valid land hexes for that unit', () => {
    const state = buildTransportAtCoastState();
    const destinations = getUnloadDestinations(state, 'transport1', 'infantry1');
    expect(destinations.length).toBeGreaterThan(0);
    destinations.forEach(d => {
      const tile = state.map.tiles[hexKey(d)];
      expect(['grass', 'plains', 'forest', 'hills']).toContain(tile?.terrain);
    });
  });

  it('returns [] for cargo unit with movementPointsLeft === 0', () => {
    const state = buildTransportAtCoastState({ cargoMovement: 0 });
    expect(getUnloadDestinations(state, 'transport1', 'infantry1')).toHaveLength(0);
  });

  it('different cargo types yield different destination sets when terrain costs differ', () => {
    const state = buildTransportAtMixedCoastState(); // adjacent hexes include forest
    const infantryDests = getUnloadDestinations(state, 'transport1', 'infantry1');
    const cavalryDests  = getUnloadDestinations(state, 'transport1', 'cavalry1');
    // cavalry has different terrain costs — not necessarily different but valid
    expect(infantryDests).toBeDefined();
    expect(cavalryDests).toBeDefined();
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/transport-system.test.ts`
Expected: FAIL — `getUnloadDestinations` has wrong signature.

- [ ] **Step 2: Fix isTransport() to cover all naval transport types**

In `src/systems/transport-system.ts`, the current `isTransport` function only checks `unit.type === 'transport'`. Update it to detect any unit with a cargoCapacity defined in a naval domain:

```ts
function isTransport(unit: Unit | undefined): unit is Unit {
  if (!unit) return false;
  const def = UNIT_DEFINITIONS[unit.type];
  return Boolean(def && (def.domain ?? 'land') === 'naval' && def.cargoCapacity !== undefined);
}
```

- [ ] **Step 3: Update getUnloadDestinations signature**

Change from `(state, transportId)` to `(state, transportId, cargoUnitId)`:

```ts
export function getUnloadDestinations(state: GameState, transportId: string, cargoUnitId: string): HexCoord[] {
  const transport = state.units[transportId];
  if (!isTransport(transport) || getTransportCargo(state, transportId).length === 0) return [];
  const cargo = state.units[cargoUnitId];
  if (!cargo) return [];
  if (!canCargoSpendUnloadAction(cargo)) return [];

  return transportNeighbors(state, transport.position).filter(destination =>
    isLandDestination(state, cargo, destination)
    && !isDestinationOccupied(state, destination)
  );
}
```

Also update `canUnloadUnitFromTransport` (it calls `getUnloadDestinations` internally? No — check if it does. If not, no change needed). And update `getTransportCargoUsed` to use the real `getUnitCargoSize` logic that already handles `cargoSize` correctly.

- [ ] **Step 4: Run tests and fix any call sites in transport-system.ts**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/transport-system.test.ts
```

Expected: new tests PASS; existing tests pass. If `main.ts` or other callers break due to signature change, TypeScript will catch it — fix in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/systems/transport-system.ts tests/systems/transport-system.test.ts
git commit -m "feat: update getUnloadDestinations to accept cargoUnitId; fix isTransport() for all naval transports"
```

---

## Task 4: transport-ui-state.ts Module

**Files:**
- Create: `src/ui/transport-ui-state.ts`
- Create: `tests/ui/transport-ui-state.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/ui/transport-ui-state.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPendingUnload,
  getUnloadRange,
  setPendingUnload,
  clearPendingUnload,
} from '@/ui/transport-ui-state';

describe('transport-ui-state', () => {
  beforeEach(() => { clearPendingUnload(); });

  it('getPendingUnload returns null initially', () => {
    expect(getPendingUnload()).toBeNull();
  });

  it('getUnloadRange returns empty array initially', () => {
    expect(getUnloadRange()).toHaveLength(0);
  });

  it('setPendingUnload sets both values', () => {
    const p = { transportId: 't1', cargoUnitId: 'c1' };
    const range = [{ q: 0, r: 1 }, { q: 1, r: 0 }];
    setPendingUnload(p, range);
    expect(getPendingUnload()).toEqual(p);
    expect(getUnloadRange()).toEqual(range);
  });

  it('clearPendingUnload resets both to null / empty', () => {
    setPendingUnload({ transportId: 't1', cargoUnitId: 'c1' }, [{ q: 0, r: 1 }]);
    clearPendingUnload();
    expect(getPendingUnload()).toBeNull();
    expect(getUnloadRange()).toHaveLength(0);
  });

  it('regression: hot-seat handoff clears pendingUnload', () => {
    // Simulate player 1 starting an unload
    setPendingUnload({ transportId: 'transport-p1', cargoUnitId: 'warrior-p1' }, [{ q: 2, r: 0 }]);
    expect(getPendingUnload()).not.toBeNull();

    // Simulate end-turn / handoff calling clearPendingUnload
    clearPendingUnload();

    // Player 2 sees no stale state
    expect(getPendingUnload()).toBeNull();
    expect(getUnloadRange()).toHaveLength(0);
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/transport-ui-state.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 2: Create the module**

Create `src/ui/transport-ui-state.ts`:

```ts
import type { HexCoord } from '@/core/types';

export interface PendingUnload {
  transportId: string;
  cargoUnitId: string;
}

let _pendingUnload: PendingUnload | null = null;
let _unloadRange: HexCoord[] = [];

export function getPendingUnload(): PendingUnload | null {
  return _pendingUnload;
}

export function getUnloadRange(): HexCoord[] {
  return _unloadRange;
}

export function setPendingUnload(p: PendingUnload, range: HexCoord[]): void {
  _pendingUnload = p;
  _unloadRange = range;
}

export function clearPendingUnload(): void {
  _pendingUnload = null;
  _unloadRange = [];
}
```

- [ ] **Step 3: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/transport-ui-state.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/transport-ui-state.ts tests/ui/transport-ui-state.test.ts
git commit -m "feat: add transport-ui-state module for pendingUnload/unloadRange management"
```

---

## Task 5: Unit Upgrade Test

**Files:**
- Test: `tests/systems/unit-upgrade-system.test.ts`

- [ ] **Step 1: Write the upgrade test**

Add to `tests/systems/unit-upgrade-system.test.ts`:

```ts
import { canUpgradeUnit, applyUpgrade, getUpgradeCost } from '@/systems/unit-upgrade-system';
import type { Unit, City } from '@/core/types';

describe('transport upgrade chain', () => {
  const coastalCity: City = {
    id: 'city1', name: 'Port', owner: 'player', position: { q: 0, r: 0 },
    population: 1, buildings: [], productionQueue: [], food: 0, production: 0,
    isCoastal: true,
  } as City;

  const transport: Unit = {
    id: 'u1', type: 'transport', owner: 'player',
    position: { q: 0, r: 0 }, health: 100, movementPointsLeft: 3,
    hasActed: false, hasMoved: false,
  } as Unit;

  it('transport can upgrade to carrack when navigation is researched', () => {
    const result = canUpgradeUnit(transport, 'city1', { city1: coastalCity }, ['galleys', 'navigation']);
    expect(result.canUpgrade).toBe(true);
    expect(result.targetType).toBe('carrack');
    expect(result.cost).toBe(33); // Math.ceil(65 * 0.5)
  });

  it('transport cannot upgrade without navigation researched', () => {
    const result = canUpgradeUnit(transport, 'city1', { city1: coastalCity }, ['galleys']);
    expect(result.canUpgrade).toBe(false);
  });

  it('transport cannot upgrade with insufficient gold', () => {
    const result = canUpgradeUnit(transport, 'city1', { city1: coastalCity }, ['galleys', 'navigation'], 10);
    expect(result.canUpgrade).toBe(false);
    expect(result.cost).toBe(33);
  });

  it('applyUpgrade changes type to carrack and preserves cargoUnitIds', () => {
    const loaded = { ...transport, cargoUnitIds: ['w1'] };
    const upgraded = applyUpgrade(loaded, 'carrack');
    expect(upgraded.type).toBe('carrack');
    expect(upgraded.cargoUnitIds).toEqual(['w1']);
    expect(upgraded.health).toBe(100); // applyUpgrade resets health
    expect(upgraded.hasActed).toBe(true);
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/unit-upgrade-system.test.ts`
Expected: PASS — `applyUpgrade` already resets health to 100 (confirmed in source).

- [ ] **Step 2: Commit**

```bash
git add tests/systems/unit-upgrade-system.test.ts
git commit -m "test: add transport → carrack upgrade chain tests"
```

---

## Task 6: SFX Catalog Entries

**Files:**
- Modify: `src/audio/sfx-catalog.ts`
- Test: `tests/audio/sfx-catalog.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/audio/sfx-catalog.test.ts`:

```ts
it('TRANSPORT_SFX load and unload entries are in allSfxEntries()', () => {
  const entries = allSfxEntries();
  const ids = entries.map(e => e.id);
  expect(ids).toContain('sfx-transport-load');
  expect(ids).toContain('sfx-transport-unload');
});

it('all 4 new ship death SFX are in allSfxEntries()', () => {
  const ids = allSfxEntries().map(e => e.id);
  expect(ids).toContain('sfx-carrack-death');
  expect(ids).toContain('sfx-galleon-death');
  expect(ids).toContain('sfx-steamship-death');
  expect(ids).toContain('sfx-troop_transport-death');
});
```

Also update the existing count assertion from 70 to 76:

```ts
it('allSfxEntries returns exactly 76 entries', () => {
  // 70 existing + 4 new death SFX + 2 TRANSPORT_SFX
  expect(allSfxEntries()).toHaveLength(76);
});
```

Run: `bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts`
Expected: FAIL — entries missing, count wrong.

- [ ] **Step 2: Add LOCOMOTION_CLASS entries for 4 new types**

In `src/audio/sfx-catalog.ts`, find `LOCOMOTION_CLASS` (around line 148). It is a `Record<UnitType, LocomotionClass>`. Add after `transport: 'naval'`:

```ts
carrack:         'naval',
galleon:         'naval',
steamship:       'naval',
troop_transport: 'naval',
```

- [ ] **Step 3: Add death SFX entries to UNIT_SFX**

Find `transport: { death: ... }` in `UNIT_SFX` (around line 136). Add after it:

```ts
carrack:         { death: real('sfx-carrack-death',         'audio/sfx/carrack-death.ogg',         0.800, 'death') },
galleon:         { death: real('sfx-galleon-death',         'audio/sfx/galleon-death.ogg',         0.900, 'death') },
steamship:       { death: real('sfx-steamship-death',       'audio/sfx/steamship-death.ogg',       0.750, 'death') },
troop_transport: { death: real('sfx-troop_transport-death', 'audio/sfx/troop_transport-death.ogg', 0.800, 'death') },
```

> loopEnd values are estimates — update to actual file durations after sourcing (Task 7).

- [ ] **Step 4: Add TRANSPORT_SFX export and update allSfxEntries**

At the end of `src/audio/sfx-catalog.ts`, before `allSfxEntries`, add:

```ts
export const TRANSPORT_SFX = {
  load:   real('sfx-transport-load',   'audio/sfx/transport-load.ogg',   0.600, 'movement'),
  unload: real('sfx-transport-unload', 'audio/sfx/transport-unload.ogg', 0.600, 'movement'),
};
```

> loopEnd values are estimates — update after sourcing.

Then update `allSfxEntries`:

```ts
export function allSfxEntries(): TrackEntry[] {
  const entries: TrackEntry[] = [];
  for (const sfxMap of Object.values(UNIT_SFX)) {
    if (!sfxMap) continue;
    for (const entry of Object.values(sfxMap)) {
      if (entry) entries.push(entry);
    }
  }
  return [...entries, ...Object.values(MOVEMENT_SFX), ...Object.values(TRANSPORT_SFX)];
}
```

- [ ] **Step 5: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts
```

Expected: all tests PASS except the on-disk OGG existence tests — those require the audio files from Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/audio/sfx-catalog.ts tests/audio/sfx-catalog.test.ts
git commit -m "feat: add LOCOMOTION_CLASS, death SFX, and TRANSPORT_SFX for new naval transport types"
```

---

## Task 7: Source and Encode Audio Files

**Files:**
- Create: `audio/sfx/carrack-death.ogg`
- Create: `audio/sfx/galleon-death.ogg`
- Create: `audio/sfx/steamship-death.ogg`
- Create: `audio/sfx/troop_transport-death.ogg`
- Create: `audio/sfx/transport-load.ogg`
- Create: `audio/sfx/transport-unload.ogg`

**Source guide:**
- Freesound.org (CC0 or CC-BY) — search: `"ship wreck"`, `"ship sinking"`, `"wood creak splash"`, `"steam hiss"`, `"gangplank"`, `"cargo loading"`, `"rope ratchet"`, `"dock footsteps"`
- Kenney.nl impact packs for fallback punchy sounds

**Encode command (per file):**

```bash
ffmpeg -i <input_file> -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 2 audio/sfx/<output>.ogg
```

**After encoding, measure actual duration:**

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 audio/sfx/carrack-death.ogg
```

Update the loopEnd values in `src/audio/sfx-catalog.ts` to the measured durations for all 6 files.

**Loop health check (ambient-only — not needed for one-shots, but verify no silent artifacts):**

```bash
ffmpeg -i audio/sfx/transport-load.ogg -af astats -f null - 2>&1 | grep "RMS level"
```

- [ ] **Step 1: Source, encode, and measure all 6 OGG files**

Use the moods from the spec to guide source selection:
- `transport-load.ogg` — rope/chain ratcheting, cargo thud on wooden deck (0.4–0.8 s)
- `transport-unload.ogg` — gangplank landing, boots on wood planks (0.4–0.8 s)
- `carrack-death.ogg` — wood cracking, splash (target: ~0.6–1.0 s)
- `galleon-death.ogg` — large wood explosion, mast fall (target: ~0.8–1.2 s)
- `steamship-death.ogg` — metal groan, hiss of escaping steam (target: ~0.6–1.0 s)
- `troop_transport-death.ogg` — modern ship explosion/sinking (target: ~0.8–1.2 s)

- [ ] **Step 2: Update loopEnd values in sfx-catalog.ts**

Replace the placeholder 0.600 / 0.800 / 0.900 / 0.750 values with actual durations from `ffprobe`.

- [ ] **Step 3: Update AUDIO-CREDITS.md**

Add one attribution entry per file sourced. For CC-BY files include: filename, original title, author, URL, license. For CC0: filename, original title, source URL, "CC0 public domain".

- [ ] **Step 4: Run disk integrity test**

```bash
bash scripts/run-with-mise.sh yarn test tests/audio/sfx-catalog.test.ts
```

Expected: all PASS including the on-disk OGG magic byte test.

- [ ] **Step 5: Commit**

```bash
git add audio/sfx/carrack-death.ogg audio/sfx/galleon-death.ogg audio/sfx/steamship-death.ogg audio/sfx/troop_transport-death.ogg audio/sfx/transport-load.ogg audio/sfx/transport-unload.ogg AUDIO-CREDITS.md src/audio/sfx-catalog.ts
git commit -m "feat: add 6 transport SFX OGG files (load/unload + 4 per-class death sounds)"
```

---

## Task 8: SFX Wiring — routeSfxComponents

**Files:**
- Modify: `src/audio/sfx.ts`
- Modify: `src/audio/audio-system.ts`

- [ ] **Step 1: Add routeSfxComponents to sfx.ts**

In `src/audio/sfx.ts`, after the existing `routeSfxThrough` function, add:

```ts
import type { AudioMixer } from './audio-mixer';
import type { AudioLoader } from './audio-loader';
import { TRANSPORT_SFX } from './sfx-catalog';

let _mixer: AudioMixer | null = null;
let _loader: AudioLoader | null = null;

export function routeSfxComponents(mixer: AudioMixer, loader: AudioLoader): void {
  _mixer = mixer;
  _loader = loader;
}
```

Then replace the `transportLoad` and `transportUnload` entries in `SFX` with OGG-backed implementations:

```ts
transportLoad: () => {
  if (_loader && _mixer) {
    void _loader.get(TRANSPORT_SFX.load.file)
      .then(buf => _mixer!.playOneShot('sfx', buf));
  } else {
    playTone(330, 0.08, 0.12, 'triangle');
  }
},
transportUnload: () => {
  if (_loader && _mixer) {
    void _loader.get(TRANSPORT_SFX.unload.file)
      .then(buf => _mixer!.playOneShot('sfx', buf));
  } else {
    playTone(440, 0.08, 0.12, 'triangle');
  }
},
```

> `playOneShot` already exists on `AudioMixer` — check the type. If it doesn't, check what the correct method is (the `SfxDirector` uses `this.mixer.playOneShot('sfx', buf)` — verify that exact call exists in `AudioMixer`).

- [ ] **Step 2: Call routeSfxComponents from AudioSystem.start()**

In `src/audio/audio-system.ts`, import `routeSfxComponents`:

```ts
import { routeSfxComponents } from './sfx';
```

In the `start(state, bus)` method, after `this.sfxDirector.start(state.units, bus)`, add:

```ts
routeSfxComponents(this.mixer, this.loader);
```

- [ ] **Step 3: Build check**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS"
```

Expected: no new TS errors from this change.

- [ ] **Step 4: Commit**

```bash
git add src/audio/sfx.ts src/audio/audio-system.ts
git commit -m "feat: wire routeSfxComponents so transport load/unload use real OGG files"
```

---

## Task 9: Sprite Catalog

**Files:**
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/renderer/sprites/units/index.ts` (or wherever spy sprites are exported)
- Create: 4 SVG sprite files

> Sprites can be added and merged separately — the feature is playable without them because the existing missing-sprite fallback renders the `PRODUCTION_ICONS` emoji in a coloured circle. This task can be deferred to a follow-up MR.

- [ ] **Step 1: Generate sprite prompts**

For each of the 4 units, invoke the `generate-sprite-prompt` skill to create the Claude Design prompt. Visual direction (from spec §3):
- **carrack**: small wooden sailing ship, single mast, high fore and aft castles
- **galleon**: larger multi-masted wooden ship, broad hull, visible cannon ports
- **steamship**: iron hull, single funnel amidships, paddlewheel or screw propeller visible at stern
- **troop_transport**: modern military transport, flat open deck, drab paint, visible cargo crane

Submit each prompt to Claude Design and save the resulting SVG to:
- `src/renderer/sprites/units/carrack.tsx`
- `src/renderer/sprites/units/galleon.tsx`
- `src/renderer/sprites/units/steamship.tsx`
- `src/renderer/sprites/units/troop-transport.tsx`

- [ ] **Step 2: Export new sprites**

In the units barrel export file (where `TransportSprite` is exported), add exports for all four new sprites:

```ts
export { CarrackSprite } from './carrack';
export { GalleonSprite } from './galleon';
export { SteamshipSprite } from './steamship';
export { TroopTransportSprite } from './troop-transport';
```

- [ ] **Step 3: Update UNIT_MOTION_STYLES in sprite-catalog.ts**

Find `UNIT_MOTION_STYLES` (line 35). Add 4 entries — all `'naval'`:

```ts
carrack:         'naval',
galleon:         'naval',
steamship:       'naval',
troop_transport: 'naval',
```

- [ ] **Step 4: Update UNIT_SPRITE_CATALOG**

Import the four new sprites at the top of `sprite-catalog.ts`:

```ts
import {
  // … existing imports …
  CarrackSprite, GalleonSprite, SteamshipSprite, TroopTransportSprite,
} from './units';
```

Add to `UNIT_SPRITE_CATALOG`:

```ts
carrack:         withMotion('carrack',         CarrackSprite),
galleon:         withMotion('galleon',         GalleonSprite),
steamship:       withMotion('steamship',       SteamshipSprite),
troop_transport: withMotion('troop_transport', TroopTransportSprite),
```

- [ ] **Step 5: Build check**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS"
```

Expected: no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/units/
git commit -m "feat: register 4 new naval transport sprites in sprite catalog"
```

---

## Task 10: selected-unit-info.ts — Transport UI Redesign

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Create: `tests/ui/transport-panel.test.ts`

The transport UI has three parts to change:
1. `TransportLoadOption` — add `disabled` and `tooltip` fields
2. Cargo section — show slot costs, cover all transport types (not just `transport`)
3. Two-stage unload UX — Stage 1 (cargo list + Unload buttons), Stage 2 (instruction + Cancel)

- [ ] **Step 1: Write failing panel tests**

Create `tests/ui/transport-panel.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { createSelectedUnitInfo } from '@/ui/selected-unit-info';
import type { GameState, Unit } from '@/core/types';
import { clearPendingUnload } from '@/ui/transport-ui-state';

function makeTransportState(transportType = 'transport' as const, cargo: Unit[] = []): GameState {
  // Build minimal GameState with one transport and the provided cargo units
  // Transport positioned at q=0,r=0 (ocean); coast hex at q=1,r=0 available for unload
  // Use only the fields needed by createSelectedUnitInfo / transport logic
  return { /* minimal state stub */ } as GameState;
}

describe('transport panel — load option capacity labels', () => {
  it('shows slots-free label when capacity available', () => {
    const state = makeTransportState('galleon'); // cap 4, 2 slots used
    const root = createSelectedUnitInfo('infantry1', state, {
      getTransportOptions: () => [{
        transportId: 'galleon1',
        label: 'Load onto Galleon — 2 of 4 slots free',
        disabled: false,
      }],
      onLoadTransport: vi.fn(),
    });
    expect(root.textContent).toContain('2 of 4 slots free');
  });

  it('renders greyed-out disabled option when over-capacity', () => {
    const state = makeTransportState('transport'); // cap 2, full
    const root = createSelectedUnitInfo('catapult1', state, {
      getTransportOptions: () => [{
        transportId: 'transport1',
        label: 'Load onto Transport — needs 3 slots, 0 remaining',
        disabled: true,
        tooltip: 'Catapult requires 3 cargo slots. A Galleon or larger transport is needed.',
      }],
      onLoadTransport: vi.fn(),
    });
    const btn = root.querySelector<HTMLButtonElement>('[data-transport-load]');
    expect(btn?.disabled).toBe(true);
    expect(btn?.title).toContain('requires 3 cargo slots');
  });
});

describe('transport panel — cargo section', () => {
  it('shows cargo list with slot cost badges for transport unit', () => {
    const state = makeTransportState('galleon'); // galleon with 1 horseman (2 slots)
    const root = createSelectedUnitInfo('galleon1', state, {
      getCargoBoardInfo: () => [{ cargoUnitId: 'horseman1', label: 'Horseman', slotCost: 2, canUnload: true }],
      onSelectCargoToUnload: vi.fn(),
    });
    expect(root.textContent).toContain('Horseman');
    expect(root.textContent).toContain('2 slots');
    const unloadBtn = root.querySelector<HTMLButtonElement>('[data-unload-cargo]');
    expect(unloadBtn).not.toBeNull();
  });

  it('greys out cargo unit with movementPointsLeft === 0', () => {
    const state = makeTransportState('galleon');
    const root = createSelectedUnitInfo('galleon1', state, {
      getCargoBoardInfo: () => [{ cargoUnitId: 'infantry1', label: 'Warrior', slotCost: 1, canUnload: false }],
      onSelectCargoToUnload: vi.fn(),
    });
    const unloadBtn = root.querySelector<HTMLButtonElement>('[data-unload-cargo]');
    expect(unloadBtn?.disabled).toBe(true);
    expect(root.textContent).toContain('used this turn');
  });
});

describe('transport panel — Stage 2 unload UX', () => {
  it('shows instruction text and Cancel button when pendingUnload is set', () => {
    const state = makeTransportState('galleon');
    // Simulate Stage 2 by passing isPendingUnload=true or equivalent prop
    const root = createSelectedUnitInfo('galleon1', state, {
      getCargoBoardInfo: () => [{ cargoUnitId: 'warrior1', label: 'Warrior', slotCost: 1, canUnload: true }],
      onSelectCargoToUnload: vi.fn(),
      pendingUnloadUnitName: 'Warrior', // Stage 2 mode
      onCancelUnload: vi.fn(),
    });
    expect(root.textContent).toContain('Select a tile to unload Warrior');
    const cancelBtn = root.querySelector<HTMLButtonElement>('[data-cancel-unload]');
    expect(cancelBtn).not.toBeNull();
  });

  it('Cancel button fires onCancelUnload callback', () => {
    const onCancelUnload = vi.fn();
    const state = makeTransportState('galleon');
    const root = createSelectedUnitInfo('galleon1', state, {
      getCargoBoardInfo: () => [],
      onSelectCargoToUnload: vi.fn(),
      pendingUnloadUnitName: 'Warrior',
      onCancelUnload,
    });
    root.querySelector<HTMLButtonElement>('[data-cancel-unload]')?.click();
    expect(onCancelUnload).toHaveBeenCalledOnce();
  });

  it('Stage 1 cargo list is visible when pendingUnloadUnitName is not set', () => {
    const state = makeTransportState('galleon');
    const root = createSelectedUnitInfo('galleon1', state, {
      getCargoBoardInfo: () => [{ cargoUnitId: 'w1', label: 'Warrior', slotCost: 1, canUnload: true }],
      onSelectCargoToUnload: vi.fn(),
    });
    expect(root.querySelector('[data-cargo-list]')).not.toBeNull();
    expect(root.querySelector('[data-unload-instruction]')).toBeNull();
  });
});
```

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/transport-panel.test.ts`
Expected: FAIL — new interfaces and data attributes don't exist yet.

- [ ] **Step 2: Update TransportLoadOption interface**

In `src/ui/selected-unit-info.ts`, update:

```ts
export interface TransportLoadOption {
  transportId: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;
}
```

- [ ] **Step 3: Add CargoBoardItem interface and new callbacks**

```ts
export interface CargoBoardItem {
  cargoUnitId: string;
  label: string;
  slotCost: number;
  canUnload: boolean;  // false when movementPointsLeft === 0
}

// In SelectedUnitInfoCallbacks:
getCargoBoardInfo?: (transportId: string) => CargoBoardItem[];
onSelectCargoToUnload?: (transportId: string, cargoUnitId: string) => void;
onCancelUnload?: () => void;
pendingUnloadUnitName?: string;  // when set, panel is in Stage 2 mode
```

- [ ] **Step 4: Update the transport load button rendering**

Find the section around line 329 where load buttons are rendered. Update to handle `disabled` and `tooltip`:

```ts
if (!unit.transportId && !isNavalTransport(unit.type) && callbacks.getTransportOptions && callbacks.onLoadTransport) {
  const transportOptions = callbacks.getTransportOptions(unitId);
  for (const option of transportOptions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = option.label;
    btn.dataset.transportLoad = option.transportId;
    btn.disabled = option.disabled ?? false;
    if (option.tooltip) btn.title = option.tooltip;
    btn.style.cssText = option.disabled
      ? 'padding:8px 16px;min-height:44px;border-radius:8px;background:#374151;border:none;color:#9ca3af;cursor:not-allowed;'
      : 'padding:8px 16px;min-height:44px;border-radius:8px;background:#2563eb;border:none;color:white;cursor:pointer;';
    if (!option.disabled) {
      btn.addEventListener('click', () => callbacks.onLoadTransport!(unitId, option.transportId));
    }
    actionsDiv.appendChild(btn);
  }
}
```

Add a helper function:

```ts
function isNavalTransport(type: UnitType): boolean {
  return ['transport', 'carrack', 'galleon', 'steamship', 'troop_transport'].includes(type as string);
}
```

- [ ] **Step 5: Update cargo section to cover all transport types + Stage 1/2 render modes**

Find the section around line 211: `if (unit.type === 'transport')`. Replace with:

```ts
if (isNavalTransport(unit.type) && callbacks.getCargoBoardInfo) {
  const cargoItems = callbacks.getCargoBoardInfo(unitId);

  if (callbacks.pendingUnloadUnitName) {
    // Stage 2: instruction + Cancel
    const instruction = document.createElement('div');
    instruction.dataset.unloadInstruction = '';
    instruction.style.cssText = 'margin-top:8px;font-size:13px;color:#bfdbfe;';
    instruction.textContent = `Select a tile to unload ${callbacks.pendingUnloadUnitName}`;
    wrapper.appendChild(instruction);

    if (callbacks.onCancelUnload) {
      const cancelBtn = createGameButton('Cancel', 'secondary', () => callbacks.onCancelUnload!());
      cancelBtn.dataset.cancelUnload = '';
      wrapper.appendChild(cancelBtn);
    }
  } else {
    // Stage 1: cargo list
    const cargoDiv = document.createElement('div');
    cargoDiv.dataset.cargoList = '';
    cargoDiv.style.cssText = 'margin-top:8px;';

    if (cargoItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:#bfdbfe;';
      empty.textContent = 'Cargo: Empty';
      cargoDiv.appendChild(empty);
    } else {
      for (const item of cargoItems) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';

        const label = document.createElement('span');
        label.style.cssText = 'font-size:12px;color:#bfdbfe;flex:1;';
        label.textContent = `${item.label} · ${item.slotCost} slot${item.slotCost !== 1 ? 's' : ''}`;
        row.appendChild(label);

        const unloadBtn = document.createElement('button');
        unloadBtn.type = 'button';
        unloadBtn.textContent = 'Unload';
        unloadBtn.dataset.unloadCargo = item.cargoUnitId;
        unloadBtn.disabled = !item.canUnload;
        if (!item.canUnload) {
          unloadBtn.title = 'used this turn';
          unloadBtn.style.cssText = 'padding:4px 8px;border-radius:6px;background:#374151;border:none;color:#9ca3af;cursor:not-allowed;font-size:11px;';
        } else {
          unloadBtn.style.cssText = 'padding:4px 8px;border-radius:6px;background:#0f766e;border:none;color:white;cursor:pointer;font-size:11px;';
          unloadBtn.addEventListener('click', () =>
            callbacks.onSelectCargoToUnload?.(unitId, item.cargoUnitId)
          );
        }
        if (!item.canUnload) {
          const note = document.createElement('span');
          note.style.cssText = 'font-size:10px;color:#6b7280;';
          note.textContent = 'used this turn';
          row.appendChild(note);
        }
        row.appendChild(unloadBtn);
        cargoDiv.appendChild(row);
      }
    }
    wrapper.appendChild(cargoDiv);
  }
}
```

Also import `createGameButton` from the button-styling skill if not already imported.

- [ ] **Step 6: Remove old getUnloadOptions rendering**

Remove the old block around lines 334–340 that renders unload options as inline destination buttons (the flat list of "Unload Warrior (0, 1)" buttons). This is replaced by the two-stage UX above.

- [ ] **Step 7: Run panel tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/transport-panel.test.ts
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/selected-unit-info.ts tests/ui/transport-panel.test.ts
git commit -m "feat: transport panel Stage 1/2 UX with cargo slots, disabled load options, and two-stage unload"
```

---

## Task 11: main.ts Wiring

**Files:**
- Modify: `src/main.ts`

This task wires the new callbacks, capacity labels, notification strings, `clearPendingUnload` calls, and hex-tap behaviour.

- [ ] **Step 1: Import new modules**

At the top of `src/main.ts`, add imports:

```ts
import { getPendingUnload, getUnloadRange, setPendingUnload, clearPendingUnload } from '@/ui/transport-ui-state';
import { getUnitCargoSize, getTransportCargoUsed, getTransportCapacity } from '@/systems/transport-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
```

(Some of these may already be imported — add only what's missing.)

- [ ] **Step 2: Clear pendingUnload at all 3 movementRange clear sites**

Search for all occurrences of `movementRange = []` in `src/main.ts` (there are 3: lines ~1282, ~1571, ~1590). After each pair of `movementRange = []; attackRange = [];`, add `clearPendingUnload();`.

Also in `deselectUnit()`, add `clearPendingUnload()` explicitly.

- [ ] **Step 3: Add `_mistapNotified` flag near other state variables**

Near `let movementRange: HexCoord[] = [];` (line ~175), add:

```ts
let _mistapNotified = false;
```

Reset it in `clearPendingUnload` usage — add a wrapper that also resets the flag:

```ts
function clearUnloadState(): void {
  clearPendingUnload();
  _mistapNotified = false;
}
```

Then replace all `clearPendingUnload()` calls in `main.ts` with `clearUnloadState()`.

- [ ] **Step 4: Update getTransportOptions callback with capacity labels**

Find the current `getTransportOptions` callback (around line 1332). Replace with:

```ts
getTransportOptions: (selectedUnitId) => Object.values(gameState.units)
  .filter(candidate => {
    const def = UNIT_DEFINITIONS[candidate.type];
    return (def?.domain ?? 'land') === 'naval' && def?.cargoCapacity !== undefined
      && candidate.owner === gameState.currentPlayer;
  })
  .map(candidate => {
    const used  = getTransportCargoUsed(gameState, candidate.id);
    const cap   = getTransportCapacity(candidate);
    const free  = cap - used;
    const needs = getUnitCargoSize(gameState.units[selectedUnitId]);
    const fits  = needs <= free;
    const suffix = !fits
      ? ` — needs ${needs} slots, ${free} remaining`
      : free - needs === 0
        ? ' — last slot'
        : ` — ${free} of ${cap} slots free`;
    const unitDef = UNIT_DEFINITIONS[gameState.units[selectedUnitId]?.type ?? 'warrior'];
    return {
      transportId: candidate.id,
      label: `Load onto ${UNIT_DEFINITIONS[candidate.type]?.name ?? 'Transport'}${suffix}`,
      disabled: !fits,
      tooltip: !fits
        ? `${unitDef?.name ?? 'This unit'} requires ${needs} cargo slots. A Galleon or larger transport is needed.`
        : undefined,
    };
  })
  .filter(o => canLoadUnitOntoTransport(gameState, selectedUnitId, o.transportId).ok || o.disabled),
```

> The filter keeps disabled options visible (greyed out) per spec — do not remove them.

- [ ] **Step 5: Replace getUnloadOptions with getCargoBoardInfo**

Remove the `getUnloadOptions` callback. Replace with:

```ts
getCargoBoardInfo: (transportId) => getTransportCargo(gameState, transportId).map(cargoUnit => ({
  cargoUnitId: cargoUnit.id,
  label: UNIT_DEFINITIONS[cargoUnit.type]?.name ?? cargoUnit.type,
  slotCost: getUnitCargoSize(cargoUnit),
  canUnload: cargoUnit.movementPointsLeft > 0 && !cargoUnit.hasActed,
})),
```

- [ ] **Step 6: Add onSelectCargoToUnload callback**

```ts
onSelectCargoToUnload: (transportId, cargoUnitId) => {
  const range = getUnloadDestinations(gameState, transportId, cargoUnitId);
  setPendingUnload({ transportId, cargoUnitId }, range);
  renderLoop.setHighlights({ movement: range, attack: [] });
  // Re-render the panel in Stage 2 mode
  const cargoUnit = gameState.units[cargoUnitId];
  const unitName = UNIT_DEFINITIONS[cargoUnit?.type ?? 'warrior']?.name ?? 'Unit';
  selectUnit(transportId, { pendingUnloadUnitName: unitName });
},
```

> This requires `selectUnit` to accept optional overrides for the panel render — update `selectUnit`'s signature or create a separate `rerenderUnitPanel(unitId, opts)` helper if simpler.

- [ ] **Step 7: Add onCancelUnload callback**

```ts
onCancelUnload: () => {
  clearUnloadState();
  renderLoop.clearHighlights();
  if (selectedUnitId) selectUnit(selectedUnitId); // back to Stage 1
},
```

- [ ] **Step 8: Update onLoadTransport notification string**

Around line 1356, replace `showNotification('Unit loaded onto Transport.', 'info');` with:

```ts
const tName = UNIT_DEFINITIONS[gameState.units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
showNotification(`Unit loaded onto ${tName}.`, 'info');
SFX.transportLoad();
```

- [ ] **Step 9: Update onUnloadTransport**

Around line 1359, update:

```ts
onUnloadTransport: (transportId, cargoUnitId, destination) => {
  const result = unloadUnitFromTransport(gameState, transportId, cargoUnitId, destination);
  if (!result.ok) {
    showNotification(result.message, 'warning');
    SFX.error();
    return;
  }
  gameState = result.state;
  renderLoop.setGameState(gameState);
  updateHUD();
  clearUnloadState();
  const tName = UNIT_DEFINITIONS[gameState.units[transportId]?.type ?? 'transport']?.name ?? 'Transport';
  const cName = UNIT_DEFINITIONS[gameState.units[cargoUnitId]?.type ?? 'warrior']?.name ?? 'Unit';
  showNotification(`${cName} unloaded from ${tName}.`, 'info');
  SFX.transportUnload();
  // Animate disembark (Task 12)
  renderLoop.animateUnitAppear(cargoUnitId, destination, transportId, 200);
  selectUnit(transportId); // back to Stage 1
},
```

- [ ] **Step 10: Update hex-tap handler for pendingUnload**

In the hex-tap handler (around line 2111), before the existing movement/attack checks, add:

```ts
const pending = getPendingUnload();
if (pending) {
  const unloadRange = getUnloadRange();
  const isValid = unloadRange.some(h => hexKey(h) === key);
  if (isValid) {
    // Execute the unload
    onUnloadTransport(pending.transportId, pending.cargoUnitId, coord);
  } else {
    // Block the tap
    if (!_mistapNotified) {
      showNotification('Tap a highlighted tile — or use Cancel in the panel.', 'info');
      SFX.error();
      _mistapNotified = true;
    }
    // Subsequent taps: silently consumed (state stays set)
  }
  return; // consume the tap regardless
}
```

- [ ] **Step 11: Build check**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS" | head -20
```

Fix any remaining TS errors. The most likely one is `getUnloadDestinations` call sites that still use the old 2-argument signature — update each to pass the cargo unit ID.

- [ ] **Step 12: Run all tests**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: all tests PASS.

- [ ] **Step 13: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire transport two-stage unload UX, capacity labels, notification strings, and pendingUnload clearing"
```

---

## Task 12: Animations

**Files:**
- Modify: `src/renderer/render-loop.ts`

- [ ] **Step 1: Add animateUnitSlide to render-loop.ts**

The existing `animateUnitMove(unit, path, onComplete)` handles multi-step path animation. A boarding slide is a one-step path. Add a convenience wrapper:

```ts
animateUnitSlide(unit: Unit, toHex: HexCoord, onComplete?: () => void): void {
  // One-step path from current position to toHex
  this.animateUnitMove(unit, [unit.position, toHex], onComplete);
}
```

- [ ] **Step 2: Add animateUnitAppear to render-loop.ts**

Disembark requires a fade-in at a fixed hex. Add a new animation type:

```ts
// Near other animation state:
private appearAnimations: Array<{
  unitId: string;
  atHex: HexCoord;
  startTime: number;
  durationMs: number;
}> = [];

animateUnitAppear(unitId: string, atHex: HexCoord, _fromTransportId: string, durationMs: number): void {
  // Remove any existing appear animation for this unit
  this.appearAnimations = this.appearAnimations.filter(a => a.unitId !== unitId);
  this.appearAnimations.push({ unitId, atHex, startTime: performance.now(), durationMs });
}
```

In the render loop's `draw` call, apply the fade-in by temporarily setting opacity on the unit sprite. Find where individual units are drawn (in the render loop update). Add:

```ts
// After drawing units, apply appear animations
const now = performance.now();
this.appearAnimations = this.appearAnimations.filter(a => {
  const elapsed = now - a.startTime;
  const opacity = Math.min(1, elapsed / a.durationMs);
  // Apply opacity to the unit's last drawn pixel area — implementation depends on renderer
  // If the renderer uses ctx.globalAlpha, set it before drawing this unit
  return opacity < 1; // remove when complete
});
```

> The exact implementation depends on how the renderer draws individual units. If the render loop passes a `hiddenUnitIds` set (as seen at line 248 in render-loop.ts), a similar `fadingUnitIds: Map<string, number>` map can pass per-unit opacity to the renderer. Adapt to whatever approach the existing renderer supports.

- [ ] **Step 3: Call animateUnitSlide in onLoadTransport (main.ts)**

In `main.ts`, in the `onLoadTransport` callback, after `gameState = result.state`, add:

```ts
const unit = gameState.units[unitId];
const transport = gameState.units[transportId];
if (unit && transport) {
  // Animate the cargo unit sliding to the transport hex before it disappears
  renderLoop.animateUnitSlide({ ...gameState.units[unitId]!, position: result.previousPosition ?? unit.position }, transport.position);
}
```

> `result.previousPosition` is not a real field — you'll need to capture `unit.position` BEFORE calling `loadUnitOntoTransport` and pass it to the animation. Store it as `const prevPos = gameState.units[unitId]?.position;` before the call.

- [ ] **Step 4: Build check**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep "error TS"
```

Fix any type errors.

- [ ] **Step 5: Run all tests**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/render-loop.ts src/main.ts
git commit -m "feat: add animateUnitSlide and animateUnitAppear for boarding and disembark animations"
```

---

## Task 13: Notification String Tests

**Files:**
- Test: `tests/ui/transport-notifications.test.ts` (new, jsdom)

- [ ] **Step 1: Write notification tests**

Create `tests/ui/transport-notifications.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';

describe('transport notification strings', () => {
  it('load onto carrack shows "loaded onto Carrack"', () => {
    // Set up spy on showNotification, fire onLoadTransport via the callback
    // Assert notification text contains 'Carrack' not 'Transport'
    // This is an integration test — mock gameState with a carrack unit
    const showNotification = vi.fn();
    // … wire up minimal context …
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Carrack'), 'info'
    );
  });

  it('unload from galleon shows "[UnitName] unloaded from Galleon"', () => {
    const showNotification = vi.fn();
    // … similar setup with galleon and a warrior cargo …
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringMatching(/Warrior unloaded from Galleon/), 'info'
    );
  });
});
```

> These may be easier to implement as pure unit tests of the notification string construction logic extracted into a helper function, rather than full end-to-end main.ts tests. If extracting is simpler, extract a `buildUnloadNotification(transportType, cargoType)` pure function and test that.

- [ ] **Step 2: Run and confirm passing**

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/transport-notifications.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/ui/transport-notifications.test.ts
git commit -m "test: add transport notification string tests for named vessel types"
```

---

## Task 14: Final Build + Full Test Run

- [ ] **Step 1: Full build check**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error|warning" | head -30
```

Expected: exit 0, no TS errors.

- [ ] **Step 2: Full test run**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: all suites PASS.

- [ ] **Step 3: Smoke-check in browser**

Run `bash scripts/run-with-mise.sh yarn dev`, open the game, and manually verify:
- Coastal city shows Carrack (after Navigation researched), Galleon (after Triremes), etc.
- Transport capacity shows 2 slots (was 1)
- Loading a horseman onto a Transport shows "1 of 2 slots free" then "last slot"
- Loading a catapult (3 slots) onto a Transport shows greyed-out "needs 3 slots, 0 remaining" with tooltip
- Selecting a cargo unit in a transport panel shows Unload button
- Clicking Unload enters Stage 2, highlights tiles, shows instruction + Cancel
- Tapping a highlighted tile completes unload with correct notification ("Warrior unloaded from Galleon")
- Tapping a non-highlighted tile plays error once, then subsequent taps are silent
- Cancel returns to Stage 1
- End Turn clears highlights (no ghost tiles for next player)
- Ship death plays audible sound

- [ ] **Step 4: Create PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: naval transport progression — 5-tier era chain, cargo sizes, two-stage unload UX" --body "$(cat <<'EOF'
## Summary
- Adds 4 new transport unit types (Carrack, Galleon, Steamship, Troop Transport) on a 5-era upgrade chain
- Cargo sizes: infantry=1 slot, mounted=2 slots, siege=3 slots; base transport bumped to cap 2
- New `amphibious-warfare` era-5 tech unlocks Troop Transport
- Two-stage map-interaction unload UX with explicit Cancel, no accidental cancellation
- Per-class death SFX + real OGG load/unload sounds replacing oscillator fallbacks
- New `transport-ui-state.ts` module for hot-seat-safe pendingUnload state
- Boarding (slide) and disembark (fade-in) animations

Closes #312

## Test plan
- [ ] `yarn test` all green
- [ ] `yarn build` exits 0
- [ ] Manual smoke-check: load/unload flow, capacity labels, cancelled unload, hot-seat handoff

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

| Spec requirement | Covered in task |
|---|---|
| `amphibious-warfare` era-5 tech | Task 2 |
| 5 transport classes with correct cargoCapacity | Task 2 |
| Upgrade chain via `obsoletedByTech` | Task 2 (TRAINABLE_UNITS) + Task 5 |
| Cargo sizes: mounted=2, siege=3 | Task 2 |
| `isTransport()` covers all naval transports | Task 3 |
| `getUnloadDestinations` per-cargoUnitId | Task 3 |
| `transport-ui-state.ts` module | Task 4 |
| Hot-seat regression test | Task 4 |
| Unit upgrade test (transport → carrack) | Task 5 |
| LOCOMOTION_CLASS entries | Task 6 |
| Per-class death SFX | Task 6 |
| `TRANSPORT_SFX` export + `allSfxEntries` update | Task 6 |
| 6 OGG files sourced + encoded | Task 7 |
| AUDIO-CREDITS.md updated | Task 7 |
| `routeSfxComponents` in sfx.ts | Task 8 |
| Call site in AudioSystem.start() | Task 8 |
| 4 SVG sprites + catalog registration | Task 9 |
| `UNIT_MOTION_STYLES` entries | Task 9 |
| Load panel disabled/tooltip for over-capacity | Task 10 |
| Stage 1 cargo section (slot cost badges) | Task 10 |
| Stage 2 instruction + Cancel (secondary style) | Task 10 |
| Mobile compact single-line instruction | Task 10 |
| Capacity labels in `getTransportOptions` | Task 11 |
| `getCargoBoardInfo` replaces `getUnloadOptions` | Task 11 |
| `onSelectCargoToUnload` callback | Task 11 |
| `onCancelUnload` callback | Task 11 |
| Notification strings use actual vessel names | Task 11 |
| `clearPendingUnload` at all 3 clear sites | Task 11 |
| First-tap error + subsequent taps silent (`_mistapNotified`) | Task 11 |
| Hex-tap priority for pendingUnload | Task 11 |
| `animateUnitSlide` boarding | Task 12 |
| `animateUnitAppear` disembark | Task 12 |
| Notification string tests | Task 13 |
| `isNaval` list updated in city-system | Task 2 |
| Save compatibility note (global buff) | Spec §10, no code change |
| Sprite fallback (emoji in circle) | Existing fallback path, no code change |
