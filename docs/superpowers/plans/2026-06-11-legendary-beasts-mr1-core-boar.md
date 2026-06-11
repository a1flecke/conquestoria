# Legendary Beasts MR1 — Core System + Giant Boar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Every code block is real code grounded in the current codebase — do not improvise APIs. If a referenced symbol is missing, stop and re-read the named file rather than inventing a replacement.

**Goal:** Ship the Legendary Beasts foundation end-to-end with one playable beast — the Giant Boar — including lair placement at map generation, era-gated awakening, territorial behavior, combat, slay rewards, a setup toggle, sprite, and notifications.

**Architecture:** Beasts are regular `Unit` records owned by the constant `'beasts'` (mirroring the `'barbarian'` owner pattern). A new `beast-system.ts` produces orders the same way `processBarbarians` does, and `turn-manager.ts` applies them. Lairs live in a new optional `GameState.beasts` slice (optional = old saves keep working). Beasts are deliberately **territorial**: they never leave a leash radius around their lair and never attack cities.

**Tech Stack:** TypeScript, vitest, Canvas 2D, JSX→SVG sprite pipeline. All commands run through `bash scripts/run-with-mise.sh yarn <cmd>`.

**Dependencies:** None. Branches from `main`.

**Index:** This is MR1 of 8 — see `2026-06-11-legendary-beasts-index.md`.

---

## Design contract (shared across all 8 MRs — do not rename)

- Owner string: `BEAST_OWNER = 'beasts'`
- `BeastId` union grows one MR at a time (MR1 ships only `'giant_boar'`), so every `Record<BeastId, …>` stays exhaustive.
- New `UnitType` values are prefixed `beast_`. Adding one forces TypeScript errors in exactly six exhaustive maps; fixing all six is part of the task:
  1. `UNIT_DEFINITIONS` — `src/systems/unit-system.ts:12`
  2. `UNIT_DESCRIPTIONS` — `src/systems/unit-system.ts:308`
  3. `FALLBACK_ICONS` — `src/renderer/unit-visual-resolver.ts:7`
  4. `UNIT_MOTION_STYLES` — `src/renderer/sprites/sprite-catalog.ts:36`
  5. `UNIT_SPRITE_CATALOG` — `src/renderer/sprites/sprite-catalog.ts:103`
  6. `LOCOMOTION_CLASS` — `src/audio/sfx-catalog.ts:152`
- Beast unit types are **not** trainable. This is a deliberate, documented exemption from the "every UnitType must be in TRAINABLE_UNITS" rule (Task 10 updates the rule file).

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | `BeastId`, `BeastsMode`, `BeastLair`, `BeastsState`, `GameState.beasts`, `GameSettings.beastsMode`, `'beast_boar'` UnitType, beast events |
| `src/systems/beast-definitions.ts` | Create | Static metadata per beast (habitat, tier, leash, flavor) |
| `src/systems/beast-system.ts` | Create | Lair placement, awakening, territorial orders, slay rewards |
| `src/systems/unit-system.ts` | Modify | `beast_boar` definition + description |
| `src/systems/attack-targeting.ts` | Modify | Beasts attackable without war declaration |
| `src/systems/combat-reward-system.ts` | Modify | Beasts can't receive gold; slain beasts give no per-kill gold (hoard instead) |
| `src/core/turn-manager.ts` | Modify | Wire `processBeasts` after the barbarian block |
| `src/core/game-state.ts` | Modify | Place lairs at game creation, honor `beastsMode` |
| `src/main.ts` | Modify | Slay handling on player kills, awakening/slay notifications |
| `src/renderer/sprites/beasts.tsx` | Create | `GiantBoarSprite` |
| `src/renderer/sprites/sprite-catalog.ts` | Modify | Register boar sprite + motion style |
| `src/renderer/unit-visual-resolver.ts` | Modify | `'beast'` owner role, fixed color, fallback icon |
| `src/renderer/hex-renderer.ts` | Modify | Lair glyph on explored tiles |
| `src/renderer/render-loop.ts` | Modify | Pass lair glyph map into `drawHexMap` |
| `src/audio/sfx-catalog.ts` | Modify | `LOCOMOTION_CLASS` entry for `beast_boar` |
| `src/ui/campaign-setup.ts` | Modify | Legendary Beasts mode selector |
| `.claude/rules/game-systems.md` | Modify | Document the beast trainability exemption |
| `tests/systems/beast-system.test.ts` | Create | Placement, awakening, leash, slay tests |
| `tests/systems/beast-definitions.test.ts` | Create | Definition invariants |
| `tests/core/turn-manager-beasts.test.ts` | Create | Turn wiring + actor-parity regression |

---

### Task 1: Types — the beast state slice

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add beast types to `src/core/types.ts`**

Insert after the `BarbarianCamp` interface (around line 796, before `// --- Minor Civilizations ---`):

```typescript
// --- Legendary Beasts ---

export type BeastId = 'giant_boar';   // union grows one MR at a time — see beasts index plan

export type BeastsMode = 'off' | 'calm' | 'wild';

export type BeastLairStatus = 'dormant' | 'awake' | 'slain' | 'claimed';

export interface BeastLair {
  id: string;                 // `lair-${beastId}`
  beastId: BeastId;
  position: HexCoord;
  status: BeastLairStatus;
  strength: number;           // bonus experience fed to beast units while the lair is ignored
  awakenedTurn?: number;
  slainBy?: string;           // civ id that landed the killing blow
  slainTurn?: number;
  unitIds: string[];          // live beast unit ids leashed to this lair
}

export interface BeastsState {
  mode: BeastsMode;
  lairs: Record<string, BeastLair>;
  sightingsByCiv: Record<string, BeastId[]>;   // per-civ bestiary sightings (MR2 populates)
}
```

- [ ] **Step 2: Extend `UnitType`, `GameState`, `GameSettings`, and `GameEvents`**

In the `UnitType` union (line 284), append a new line before the closing `;`:

```typescript
  | 'beast_boar';
```

In `GameState` (line 1104), after `tribalVillages: Record<string, TribalVillage>;`:

```typescript
  beasts?: BeastsState;       // optional: legacy saves have no beasts
```

In `GameSettings` (line 1141), after `tutorialEnabled: boolean;`:

```typescript
  beastsMode?: BeastsMode;    // default 'wild' for new games; undefined on legacy saves
```

In the `GameEvents` interface, next to `'barbarian:spawned'` (line 1202):

```typescript
  'beast:awakened': { lairId: string; beastId: BeastId; position: HexCoord };
  'beast:slain': { lairId: string; beastId: BeastId; slayerCivId: string; slayerUnitId: string; goldAwarded: number };
```

- [ ] **Step 3: Compile to find the six exhaustive-map errors**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAIL with TS2741/TS2739 errors in `unit-system.ts`, `unit-visual-resolver.ts`, `sprite-catalog.ts` (×2), `sfx-catalog.ts` — these are the maps Tasks 2 and 5 fill in. If you see errors in OTHER files, fix those too before proceeding (they are also exhaustive over `UnitType`).

- [ ] **Step 4: Commit (types only — build is red, that's expected mid-stack; do not push)**

```bash
git add src/core/types.ts
git commit -m "feat(beasts): add beast state types, settings mode, and events"
```

---

### Task 2: Unit definition, description, audio + visual map entries

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`

- [ ] **Step 1: Add the boar to `UNIT_DEFINITIONS` (`src/systems/unit-system.ts:12`)**

Add at the end of the map, before the closing `};`:

```typescript
  beast_boar: {
    type: 'beast_boar', name: 'Giant Boar', movementPoints: 2,
    visionRange: 2, strength: 18, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
```

(`productionCost: 0` is fine — beasts are never trainable, so no production path reads it.)

- [ ] **Step 2: Add to `UNIT_DESCRIPTIONS` (`src/systems/unit-system.ts:308`)**

```typescript
  beast_boar: 'A legendary boar of monstrous size. Territorial — it defends its forest den but never wanders far. Slay it to claim its hoard.',
```

- [ ] **Step 3: Add to `LOCOMOTION_CLASS` (`src/audio/sfx-catalog.ts:152`)**

Find the locomotion class used by `scout_hound` / `war_hound` in that map and use the same value for `beast_boar` (it is a quadruped). Example, if hounds use `'paws'`:

```typescript
  beast_boar: 'paws',
```

Use the literal value the hounds use — do not invent a new `LocomotionClass` member.

- [ ] **Step 4: Add the fallback icon (`src/renderer/unit-visual-resolver.ts:7`)**

```typescript
  beast_boar: '🐗',
```

- [ ] **Step 5: Add the `'beast'` owner role to `unit-visual-resolver.ts`**

Line 3 currently reads:

```typescript
export type UnitOwnerRole = 'major' | 'minor' | 'barbarian';
```

Change to:

```typescript
export type UnitOwnerRole = 'major' | 'minor' | 'barbarian' | 'beast';
```

In the role-resolution function (line 56 area) add **above** the barbarian check:

```typescript
  if (unit.owner === 'beasts') return 'beast';
```

In the color fallback (line 70 area), extend so beasts get a fixed dark-crimson accent:

```typescript
    ?? (role === 'barbarian' ? '#8b4513' : role === 'beast' ? '#7a1f2b' : '#888');
```

In the `roleMarker` expression (line 73), beasts get no chevron/diamond — extend the ternary so `'beast'` maps to `null` (the existing `null` fallback already does this if you only matched `'barbarian'`/`'minor'` explicitly; verify by reading the line).

- [ ] **Step 6: Commit**

```bash
git add src/systems/unit-system.ts src/audio/sfx-catalog.ts src/renderer/unit-visual-resolver.ts
git commit -m "feat(beasts): boar unit definition, description, icon, audio class, owner role"
```

---

### Task 3: Beast definitions module

**Files:**
- Create: `src/systems/beast-definitions.ts`
- Test: `tests/systems/beast-definitions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/systems/beast-definitions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BEAST_DEFINITIONS, getBeastDefinitionByUnitType } from '@/systems/beast-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

describe('beast definitions', () => {
  it('every beast has a real unit definition with positive strength', () => {
    for (const def of Object.values(BEAST_DEFINITIONS)) {
      const unitDef = UNIT_DEFINITIONS[def.unitType];
      expect(unitDef, `${def.id} missing UNIT_DEFINITIONS entry`).toBeDefined();
      expect(unitDef.strength).toBeGreaterThan(0);
    }
  });

  it('every beast has habitat terrains, a leash radius, and player-facing flavor', () => {
    for (const def of Object.values(BEAST_DEFINITIONS)) {
      expect(def.habitatTerrains.length).toBeGreaterThan(0);
      expect(def.leashRadius).toBeGreaterThanOrEqual(2);
      expect(def.packSize).toBeGreaterThanOrEqual(1);
      expect(def.dangerHint.length).toBeGreaterThan(10);
      expect(def.awakeningFlavor.length).toBeGreaterThan(10);
      expect(def.sightingFlavor.length).toBeGreaterThan(10);
    }
  });

  it('resolves a beast definition from its unit type', () => {
    expect(getBeastDefinitionByUnitType('beast_boar')?.id).toBe('giant_boar');
    expect(getBeastDefinitionByUnitType('warrior')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-definitions.test.ts`
Expected: FAIL — cannot resolve `@/systems/beast-definitions`.

- [ ] **Step 3: Create `src/systems/beast-definitions.ts`**

```typescript
import type { BeastId, TerrainType, UnitType } from '@/core/types';

export interface BeastDefinition {
  id: BeastId;
  unitType: UnitType;
  name: string;
  habitatTerrains: TerrainType[];   // lair may only be placed on these
  awakenEra: number;                // dormant until state.era reaches this
  tier: 1 | 2 | 3 | 4;              // reward scale; 4 = apex
  leashRadius: number;              // beasts never move beyond this distance from the lair
  packSize: number;                 // units spawned on awakening
  hoardGoldBase: number;            // base hoard gold; scaled by era at slay time
  dangerHint: string;               // bestiary riddle shown before first sighting (MR2)
  awakeningFlavor: string;          // map-wide notification on awakening
  sightingFlavor: string;           // first-sighting notification/ceremony text (MR2)
}

export const BEAST_DEFINITIONS: Record<BeastId, BeastDefinition> = {
  giant_boar: {
    id: 'giant_boar',
    unitType: 'beast_boar',
    name: 'Giant Boar',
    habitatTerrains: ['forest'],
    awakenEra: 1,
    tier: 1,
    leashRadius: 3,
    packSize: 1,
    hoardGoldBase: 40,
    dangerHint: 'Trees splinter and the ground is churned in the deep woods. Something heavy lives there.',
    awakeningFlavor: 'A thunder of hooves shakes the forest. The Giant Boar has awoken!',
    sightingFlavor: 'Your scouts lay eyes on the Giant Boar — a beast of legend!',
  },
};

const BY_UNIT_TYPE = new Map(
  Object.values(BEAST_DEFINITIONS).map(def => [def.unitType, def]),
);

export function getBeastDefinitionByUnitType(type: UnitType): BeastDefinition | undefined {
  return BY_UNIT_TYPE.get(type);
}
```

If `TerrainType` is not exported from `@/core/types`, check its actual export site with `grep -n "TerrainType" src/core/types.ts` and import from there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-definitions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/beast-definitions.ts tests/systems/beast-definitions.test.ts
git commit -m "feat(beasts): beast definition metadata module"
```

---

### Task 4: Beast system — lair placement

**Files:**
- Create: `src/systems/beast-system.ts`
- Test: `tests/systems/beast-system.test.ts`

Model placement on `placeVillages` in `src/systems/village-system.ts` (read it first — same shuffle-candidates pattern).

- [ ] **Step 1: Write failing placement tests**

Create `tests/systems/beast-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { placeBeastLairs, BEAST_OWNER, LAIR_COUNTS } from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { generateMap } from '@/systems/map-generator';
import { hexDistance, hexKey } from '@/systems/hex-utils';

describe('placeBeastLairs', () => {
  const map = generateMap(40, 30, 'beast-test-seed');
  const starts = [{ q: 5, r: 5 }, { q: 30, r: 20 }];

  it('places lairs only on matching habitat terrain, away from starts', () => {
    const lairs = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    for (const lair of Object.values(lairs)) {
      const def = BEAST_DEFINITIONS[lair.beastId];
      const tile = map.tiles[hexKey(lair.position)];
      expect(def.habitatTerrains).toContain(tile.terrain);
      expect(tile.wonder).toBeNull();
      for (const start of starts) {
        expect(hexDistance(lair.position, start)).toBeGreaterThanOrEqual(6);
      }
      expect(lair.status).toBe('dormant');
      expect(lair.unitIds).toEqual([]);
      expect(lair.strength).toBe(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    const b = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    expect(a).toEqual(b);
  });

  it('never places more lairs than the map-size budget', () => {
    const lairs = placeBeastLairs(map, starts, 'small', 'beast-test-seed');
    expect(Object.keys(lairs).length).toBeLessThanOrEqual(LAIR_COUNTS.small);
  });

  it('exports the beasts owner constant', () => {
    expect(BEAST_OWNER).toBe('beasts');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: FAIL — cannot resolve `@/systems/beast-system`.

- [ ] **Step 3: Create `src/systems/beast-system.ts` with placement**

```typescript
import type { BeastId, BeastLair, BeastsMode, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { BEAST_DEFINITIONS, getBeastDefinitionByUnitType, type BeastDefinition } from '@/systems/beast-definitions';
import { hexKey, hexDistance, hexNeighbors } from '@/systems/hex-utils';
import { createRng } from '@/systems/map-generator';

export const BEAST_OWNER = 'beasts';

export const LAIR_COUNTS = { small: 3, medium: 5, large: 7 } as const;

const MIN_DISTANCE_FROM_START = 6;
const MIN_DISTANCE_BETWEEN_LAIRS = 5;

export function placeBeastLairs(
  map: GameMap,
  startPositions: HexCoord[],
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): Record<string, BeastLair> {
  const rng = createRng(seed + '-beasts');
  const budget = LAIR_COUNTS[mapSize];
  const lairs: Record<string, BeastLair> = {};
  const placed: HexCoord[] = [];

  // Deterministic beast order: shuffle the roster, then take up to budget
  const roster: BeastDefinition[] = Object.values(BEAST_DEFINITIONS);
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }

  for (const def of roster) {
    if (placed.length >= budget) break;
    const candidates = Object.values(map.tiles).filter(tile =>
      def.habitatTerrains.includes(tile.terrain)
      && tile.wonder === null
      && startPositions.every(s => hexDistance(tile.coord, s) >= MIN_DISTANCE_FROM_START)
      && placed.every(p => hexDistance(tile.coord, p) >= MIN_DISTANCE_BETWEEN_LAIRS),
    );
    if (candidates.length === 0) continue;   // no valid habitat — skip this beast, never force-place
    const tile = candidates[Math.floor(rng() * candidates.length)];
    const lair: BeastLair = {
      id: `lair-${def.id}`,
      beastId: def.id,
      position: { ...tile.coord },
      status: 'dormant',
      strength: 0,
      unitIds: [],
    };
    lairs[lair.id] = lair;
    placed.push(tile.coord);
  }
  return lairs;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS (4 tests). Note: with only one beast in the MR1 roster, at most 1 lair places — the budget test still passes.

- [ ] **Step 5: Commit**

```bash
git add src/systems/beast-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): deterministic lair placement"
```

---

### Task 5: Beast system — awakening + territorial turn processing

**Files:**
- Modify: `src/systems/beast-system.ts`
- Test: `tests/systems/beast-system.test.ts`

This mirrors `processBarbarians` (`src/systems/barbarian-system.ts:133`): pure function in, orders out; `turn-manager.ts` applies the orders. Read that function before writing this one.

- [ ] **Step 1: Write failing behavior tests (append to `tests/systems/beast-system.test.ts`)**

```typescript
import { processBeasts } from '@/systems/beast-system';
import type { BeastLair, Unit } from '@/core/types';

function makeLair(overrides: Partial<BeastLair> = {}): BeastLair {
  return {
    id: 'lair-giant_boar', beastId: 'giant_boar',
    position: { q: 10, r: 10 }, status: 'dormant',
    strength: 0, unitIds: [], ...overrides,
  };
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1', type: 'warrior', owner: 'player', position: { q: 12, r: 10 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

describe('processBeasts', () => {
  const map = generateMap(40, 30, 'beast-test-seed');

  it('awakens a dormant lair once the era requirement is met (seeded chance)', () => {
    // 25%/turn: across 40 seeds at era 1, the boar must awaken at least once and not always
    let awakened = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const result = processBeasts([makeLair()], map, [], [], 1, 'wild', seed);
      if (result.awakenings.length > 0) awakened++;
    }
    expect(awakened).toBeGreaterThan(0);
    expect(awakened).toBeLessThan(40);
  });

  it('never awakens before the awaken era', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const result = processBeasts([makeLair()], map, [], [], 0, 'wild', seed);
      expect(result.awakenings).toEqual([]);
    }
  });

  it('does nothing in off mode', () => {
    const result = processBeasts([makeLair()], map, [], [], 3, 'off', 7);
    expect(result.awakenings).toEqual([]);
    expect(result.spawnOrders).toEqual([]);
  });

  it('orders an attack when an intruder is adjacent, in wild mode only', () => {
    const lair = makeLair({ status: 'awake', unitIds: ['beast-1'] });
    const beast = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const intruder = makeUnit({ id: 'u1', position: { q: 11, r: 10 } });
    const wild = processBeasts([lair], map, [intruder], [beast], 1, 'wild', 7);
    expect(wild.attackOrders).toEqual([{ attackerUnitId: 'beast-1', defenderUnitId: 'u1' }]);
    const calm = processBeasts([lair], map, [intruder], [beast], 1, 'calm', 7);
    expect(calm.attackOrders).toEqual([]);
  });

  it('never moves a beast beyond its leash radius', () => {
    const lair = makeLair({ status: 'awake', unitIds: ['beast-1'] });
    const beast = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 13, r: 10 } }); // at leash edge (3)
    const farIntruder = makeUnit({ id: 'u1', position: { q: 17, r: 10 } });
    const result = processBeasts([lair], map, [farIntruder], [beast], 1, 'wild', 7);
    for (const order of result.moveOrders) {
      expect(hexDistance(order.toCoord, lair.position)).toBeLessThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: FAIL — `processBeasts` is not exported.

- [ ] **Step 3: Implement awakening + territorial orders (append to `src/systems/beast-system.ts`)**

```typescript
function lcg(seed: number): () => number {
  let s = seed === 0 ? 1 : seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

const AWAKEN_CHANCE_PER_TURN = 0.25;
// Growth-while-ignored: applied by turn-manager (it owns the turn counter)
export const LAIR_GROWTH_INTERVAL_TURNS = 10;
export const LAIR_GROWTH_CAP = 5;
export const LAIR_GROWTH_EXPERIENCE = 16;   // one veterancy tier worth per growth tick

export interface BeastMoveOrder { unitId: string; toCoord: HexCoord }
export interface BeastAttackOrder { attackerUnitId: string; defenderUnitId: string }
export interface BeastSpawnOrder { lairId: string; beastId: BeastId; position: HexCoord }
export interface BeastAwakening { lairId: string; beastId: BeastId; position: HexCoord }

export interface BeastProcessResult {
  updatedLairs: BeastLair[];
  spawnOrders: BeastSpawnOrder[];
  moveOrders: BeastMoveOrder[];
  attackOrders: BeastAttackOrder[];
  awakenings: BeastAwakening[];
}

const IMPASSABLE_FOR_BEASTS = new Set(['ocean', 'coast', 'mountain']);

export function processBeasts(
  lairs: BeastLair[],
  map: GameMap,
  intruderUnits: Unit[],   // every non-beast, non-barbarian unit on the map
  beastUnits: Unit[],
  era: number,
  mode: BeastsMode,
  seed: number,
): BeastProcessResult {
  const empty: BeastProcessResult = { updatedLairs: lairs, spawnOrders: [], moveOrders: [], attackOrders: [], awakenings: [] };
  if (mode === 'off') return empty;

  const rng = lcg(seed ^ 0xbea57);
  const updatedLairs: BeastLair[] = [];
  const spawnOrders: BeastSpawnOrder[] = [];
  const awakenings: BeastAwakening[] = [];
  const moveOrders: BeastMoveOrder[] = [];
  const attackOrders: BeastAttackOrder[] = [];

  const occupied = new Map<string, string>();
  for (const u of [...beastUnits, ...intruderUnits]) occupied.set(hexKey(u.position), u.id);

  for (const lair of lairs) {
    const def = BEAST_DEFINITIONS[lair.beastId];
    if (lair.status === 'dormant' && era >= def.awakenEra && rng() < AWAKEN_CHANCE_PER_TURN) {
      awakenings.push({ lairId: lair.id, beastId: lair.beastId, position: lair.position });
      // Spawn packSize beasts: first on the lair tile, rest on free passable neighbors
      const spawnTiles: HexCoord[] = [];
      if (!occupied.has(hexKey(lair.position))) spawnTiles.push(lair.position);
      for (const n of hexNeighbors(lair.position)) {
        if (spawnTiles.length >= def.packSize) break;
        const tile = map.tiles[hexKey(n)];
        if (tile && !IMPASSABLE_FOR_BEASTS.has(tile.terrain) && !occupied.has(hexKey(n))) spawnTiles.push(n);
      }
      for (const pos of spawnTiles.slice(0, def.packSize)) {
        spawnOrders.push({ lairId: lair.id, beastId: lair.beastId, position: { ...pos } });
        occupied.set(hexKey(pos), 'pending-spawn');
      }
      updatedLairs.push({ ...lair, status: 'awake' });
    } else {
      updatedLairs.push(lair);
    }
  }

  if (mode === 'calm') {
    // Calm: beasts exist and defend themselves, but never initiate movement or attacks
    return { updatedLairs, spawnOrders, moveOrders: [], attackOrders: [], awakenings };
  }

  const lairByUnitId = new Map<string, BeastLair>();
  for (const lair of updatedLairs) for (const id of lair.unitIds) lairByUnitId.set(id, lair);

  for (const beast of beastUnits) {
    if (beast.movementPointsLeft <= 0) continue;
    const lair = lairByUnitId.get(beast.id);
    if (!lair) continue;
    const def = BEAST_DEFINITIONS[lair.beastId];

    const inLeash = (c: HexCoord) => hexDistance(c, lair.position) <= def.leashRadius;
    const targets = intruderUnits
      .filter(u => inLeash(u.position))
      .sort((a, b) => hexDistance(a.position, beast.position) - hexDistance(b.position, beast.position));
    const target = targets[0];

    if (target && hexDistance(target.position, beast.position) === 1) {
      attackOrders.push({ attackerUnitId: beast.id, defenderUnitId: target.id });
      continue;
    }

    const goal = target ? target.position : lair.position;
    if (hexKey(goal) === hexKey(beast.position)) continue;
    const step = hexNeighbors(beast.position)
      .filter(n => {
        const tile = map.tiles[hexKey(n)];
        return tile && !IMPASSABLE_FOR_BEASTS.has(tile.terrain) && !occupied.has(hexKey(n)) && inLeash(n);
      })
      .sort((a, b) => hexDistance(a, goal) - hexDistance(b, goal))[0];
    if (step && hexDistance(step, goal) < hexDistance(beast.position, goal)) {
      occupied.delete(hexKey(beast.position));
      occupied.set(hexKey(step), beast.id);
      moveOrders.push({ unitId: beast.id, toCoord: step });
    }
  }

  return { updatedLairs, spawnOrders, moveOrders, attackOrders, awakenings };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS. If the leash test fails because hex coords `{q:13,r:10}` aren't distance 3 from `{q:10,r:10}` in axial math, recompute the test coordinates with `hexDistance` semantics from `src/systems/hex-utils.ts` — adjust the test, not the leash logic.

- [ ] **Step 5: Commit**

```bash
git add src/systems/beast-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): era-gated awakening and territorial turn orders"
```

---

### Task 6: Slay rewards (shared, actor-complete)

**Files:**
- Modify: `src/systems/beast-system.ts`
- Modify: `src/systems/combat-reward-system.ts`
- Modify: `src/systems/attack-targeting.ts`
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Write failing slay tests (append to the beast-system test file)**

```typescript
import { recordBeastSlain, getBeastHoardGold } from '@/systems/beast-system';
import { createNewGame } from '@/core/game-state';

describe('recordBeastSlain', () => {
  function stateWithSlainBoar() {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Beast Test');
    const beast: Unit = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const victor: Unit = makeUnit({ id: 'hero-1', owner: state.currentPlayer, health: 40, position: { q: 11, r: 10 } });
    state.units[beast.id] = beast;
    state.units[victor.id] = victor;
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-giant_boar': makeLair({ status: 'awake', unitIds: ['beast-1'] }) },
      sightingsByCiv: {},
    };
    return { state, beast, victor };
  }

  it('marks the lair slain, awards hoard gold, and fully heals the victor', () => {
    const { state, beast, victor } = stateWithSlainBoar();
    const goldBefore = state.civilizations[victor.owner].gold;
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeDefined();
    expect(next.beasts!.lairs['lair-giant_boar'].status).toBe('slain');
    expect(next.beasts!.lairs['lair-giant_boar'].slainBy).toBe(victor.owner);
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore + slain!.goldAwarded);
    expect(next.units['hero-1'].health).toBe(100);
    // immutability: input state untouched
    expect(state.beasts!.lairs['lair-giant_boar'].status).toBe('awake');
  });

  it('returns no slain payload for non-beast defenders', () => {
    const { state, victor } = stateWithSlainBoar();
    const barb = makeUnit({ id: 'barb-1', owner: 'barbarian' });
    expect(recordBeastSlain(state, barb, victor).slain).toBeUndefined();
  });

  it('only marks the lair slain when its last unit dies', () => {
    const { state, beast, victor } = stateWithSlainBoar();
    state.beasts!.lairs['lair-giant_boar'].unitIds = ['beast-1', 'beast-2'];
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeUndefined();
    expect(next.beasts!.lairs['lair-giant_boar'].status).toBe('awake');
    expect(next.beasts!.lairs['lair-giant_boar'].unitIds).toEqual(['beast-2']);
  });

  it('scales hoard gold with era', () => {
    const def = BEAST_DEFINITIONS.giant_boar;
    expect(getBeastHoardGold(def, 1)).toBe(40);
    expect(getBeastHoardGold(def, 3)).toBeGreaterThan(getBeastHoardGold(def, 1));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: FAIL — `recordBeastSlain` not exported.

- [ ] **Step 3: Implement (append to `src/systems/beast-system.ts`)**

```typescript
export function isBeastUnit(unit: Pick<Unit, 'owner'>): boolean {
  return unit.owner === BEAST_OWNER;
}

export function getBeastHoardGold(def: BeastDefinition, era: number): number {
  // Tier base, +50% per era past the awaken era — late kills stay worthwhile
  const eraBonus = Math.max(0, era - def.awakenEra);
  return Math.round(def.hoardGoldBase * (1 + 0.5 * eraBonus));
}

export interface BeastSlainPayload {
  lairId: string;
  beastId: BeastId;
  slayerCivId: string;
  slayerUnitId: string;
  goldAwarded: number;
}

/**
 * Shared slay consequence — MUST be called from every path that kills a beast
 * (player attack in main.ts, AI/beast combat in turn-manager.ts).
 * Returns a new GameState; never mutates the input.
 */
export function recordBeastSlain(
  state: GameState,
  defeated: Unit,
  victor: Unit,
): { state: GameState; slain?: BeastSlainPayload } {
  if (!isBeastUnit(defeated) || !state.beasts) return { state };

  const lair = Object.values(state.beasts.lairs).find(l => l.unitIds.includes(defeated.id));
  if (!lair) return { state };

  const remaining = lair.unitIds.filter(id => id !== defeated.id);
  if (remaining.length > 0) {
    const updatedLair: BeastLair = { ...lair, unitIds: remaining };
    return {
      state: { ...state, beasts: { ...state.beasts, lairs: { ...state.beasts.lairs, [lair.id]: updatedLair } } },
    };
  }

  const def = BEAST_DEFINITIONS[lair.beastId];
  const gold = getBeastHoardGold(def, state.era);
  const slayerCiv = state.civilizations[victor.owner];
  const updatedLair: BeastLair = {
    ...lair, unitIds: [], status: 'slain', slainBy: victor.owner, slainTurn: state.turn,
  };

  let next: GameState = {
    ...state,
    beasts: { ...state.beasts, lairs: { ...state.beasts.lairs, [lair.id]: updatedLair } },
  };
  if (slayerCiv) {
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        [victor.owner]: { ...slayerCiv, gold: slayerCiv.gold + gold },
      },
    };
  }
  // Victory Feast: the slaying unit is fully healed (if it survived and still exists)
  const victorUnit = next.units[victor.id];
  if (victorUnit) {
    next = { ...next, units: { ...next.units, [victor.id]: { ...victorUnit, health: 100 } } };
  }

  return {
    state: next,
    slain: slayerCiv
      ? { lairId: lair.id, beastId: lair.beastId, slayerCivId: victor.owner, slayerUnitId: victor.id, goldAwarded: gold }
      : undefined,
  };
}
```

Check the `Civilization` interface for the gold field name with `grep -n "gold" src/core/types.ts | head` — if the civ treasury field is not literally `gold`, use the real field name in both code and test.

- [ ] **Step 4: Attack targeting + gold-reward gating**

In `src/systems/attack-targeting.ts` (lines 54–55), extend the early-allow block:

```typescript
  if (attackerOwner === 'barbarian' || attackerOwner === 'rebels') return true;
  if (targetOwner === 'barbarian' || targetOwner === 'rebels') return true;
  if (attackerOwner === 'beasts' || targetOwner === 'beasts') return true;
```

In `src/systems/combat-reward-system.ts:65` (`canReceiveGoldReward`):

```typescript
  return owner !== 'barbarian' && owner !== 'rebels' && owner !== 'beasts' && !owner.startsWith('mc-');
```

In `calculateDefeatReward` (line 95), beasts must NOT grant per-kill gold (the hoard replaces it). Change the baseGold ternary so a `'beasts'` defeated-owner yields `0`:

```typescript
  const defeatedIsHorde = input.defeated.owner === 'barbarian' || input.defeated.owner === 'rebels';
  const baseGold = canReceiveGold
    ? (input.defeated.owner === 'beasts' ? 0 : (defeatedCanFight ? (defeatedIsHorde ? 8 : 4) : 1))
    : 0;
```

- [ ] **Step 5: Run the full suites for the touched systems**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/attack-targeting.test.ts`
Expected: PASS (if the latter two test files have different names, find them with `ls tests/systems | grep -E "reward|targeting"`).

- [ ] **Step 6: Commit**

```bash
git add src/systems/beast-system.ts src/systems/attack-targeting.ts src/systems/combat-reward-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): shared slay rewards, hoard gold, targeting and gold-gating rules"
```

---

### Task 7: Turn-manager wiring (awakening, spawns, moves, beast attacks)

**Files:**
- Modify: `src/core/turn-manager.ts`
- Test: `tests/core/turn-manager-beasts.test.ts`

- [ ] **Step 1: Write the failing wiring test**

Create `tests/core/turn-manager-beasts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { BEAST_OWNER } from '@/systems/beast-system';

describe('turn-manager beast wiring', () => {
  it('eventually spawns a beast unit from an awakened lair and emits beast:awakened', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Beast Turn Test');
    if (!state.beasts || Object.keys(state.beasts.lairs).length === 0) {
      // Map seed produced no forest lair candidates — regenerate with a different seed until one places.
      // If this trips repeatedly, loosen MIN_DISTANCE_FROM_START in the test by picking a larger map.
      throw new Error('test seed produced no lairs; pick a seed that places a lair');
    }
    const bus = new EventBus();
    let awakened = 0;
    bus.on('beast:awakened', () => { awakened++; });
    let s = state;
    for (let i = 0; i < 60 && awakened === 0; i++) s = processTurn(s, bus);
    expect(awakened).toBeGreaterThan(0);
    const beastUnits = Object.values(s.units).filter(u => u.owner === BEAST_OWNER);
    expect(beastUnits.length).toBeGreaterThan(0);
    const lair = Object.values(s.beasts!.lairs).find(l => l.status === 'awake')!;
    expect(lair.unitIds).toContain(beastUnits[0].id);
  });

  it('does not process beasts when mode is off', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Beast Off Test');
    if (state.beasts) state.beasts.mode = 'off';
    const bus = new EventBus();
    let s = state;
    for (let i = 0; i < 30; i++) s = processTurn(s, bus);
    expect(Object.values(s.units).some(u => u.owner === BEAST_OWNER)).toBe(false);
  });
});
```

Check `EventBus` construction first: `grep -n "export class EventBus\|export function createEventBus" src/core/event-bus.ts` — use whichever factory exists; mirror an existing turn-manager test's setup (see `ls tests/core/`). Note this test depends on Task 9 (game-state seeding); write it now, expect failure until Task 9, but the wiring below is testable through the second test immediately.

- [ ] **Step 2: Wire into `processTurn` (`src/core/turn-manager.ts`)**

Add imports at the top:

```typescript
import {
  processBeasts, recordBeastSlain, BEAST_OWNER,
  LAIR_GROWTH_INTERVAL_TURNS, LAIR_GROWTH_CAP, LAIR_GROWTH_EXPERIENCE,
} from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
```

First, fix the barbarian intruder filter at line 496 so barbarians ignore beasts:

```typescript
  const playerUnits = Object.values(newState.units).filter(u => u.owner !== 'barbarian' && u.owner !== BEAST_OWNER && !u.owner.startsWith('mc-'));
```

Then insert a beast block **after** the barbarian block (after the camp-evolution handling around line 561), following the same style as the barbarian code (this file works on a `structuredClone`, so local mutation of `newState` is the established convention here):

```typescript
  // --- Process legendary beasts ---
  if (newState.beasts && newState.beasts.mode !== 'off') {
    for (const unit of Object.values(newState.units)) {
      if (unit.owner === BEAST_OWNER) {
        unit.movementPointsLeft = UNIT_DEFINITIONS[unit.type].movementPoints;
        unit.hasMoved = false;
      }
    }
    const beastUnits = Object.values(newState.units).filter(u => u.owner === BEAST_OWNER);
    const intruders = Object.values(newState.units).filter(u => u.owner !== BEAST_OWNER && u.owner !== 'barbarian');
    const beastResult = processBeasts(
      Object.values(newState.beasts.lairs),
      newState.map,
      intruders,
      beastUnits,
      newState.era,
      newState.beasts.mode,
      newState.turn * 7919 + 13,
    );
    newState.beasts.lairs = {};
    for (const lair of beastResult.updatedLairs) newState.beasts.lairs[lair.id] = lair;

    for (const spawn of beastResult.spawnOrders) {
      const def = BEAST_DEFINITIONS[spawn.beastId];
      const beast = createUnit(def.unitType, BEAST_OWNER, spawn.position, newState.idCounters);
      newState.units[beast.id] = beast;
      newState.beasts.lairs[spawn.lairId].unitIds.push(beast.id);
    }
    for (const awakening of beastResult.awakenings) {
      newState.beasts.lairs[awakening.lairId].awakenedTurn = newState.turn;
      bus.emit('beast:awakened', awakening);
    }
    // Growth while ignored: every N turns an awake lair hardens and its beasts gain veterancy.
    // An unhunted boar is a real fight three eras later — and its hoard grew too (era-scaled).
    if (newState.turn % LAIR_GROWTH_INTERVAL_TURNS === 0) {
      for (const lair of Object.values(newState.beasts.lairs)) {
        if (lair.status !== 'awake' || lair.strength >= LAIR_GROWTH_CAP) continue;
        lair.strength += 1;
        for (const unitId of lair.unitIds) {
          const beast = newState.units[unitId];
          if (beast) beast.experience += LAIR_GROWTH_EXPERIENCE;
        }
      }
    }
    for (const move of beastResult.moveOrders) {
      const beast = newState.units[move.unitId];
      if (beast) { beast.position = { ...move.toCoord }; beast.movementPointsLeft -= 1; }
    }
    for (const order of beastResult.attackOrders) {
      const attacker = newState.units[order.attackerUnitId];
      const defender = newState.units[order.defenderUnitId];
      if (!attacker || !defender) continue;
      // Reuse the exact combat-resolution call pattern the barbarian attack block uses
      // a few lines above this code (resolveCombat + damage application + death cleanup).
      // Beasts attacking units never produces a hoard; if the BEAST dies on counterattack,
      // route through recordBeastSlain:
      // const { state: afterSlay, slain } = recordBeastSlain(newState, attacker, defender);
      // newState = afterSlay as typeof newState;
      // if (slain) bus.emit('beast:slain', slain);
    }
  }
```

For the attack block: read how the barbarian attack orders are applied (the code directly below `// Move barbarian units`, lines ~518–560) and replicate it exactly for beasts, adding the `recordBeastSlain` counterattack branch shown in the comment. Since `recordBeastSlain` returns a fresh state, change `let newState` handling accordingly (the function head already declares `let newState` at line 67, so reassignment is legal).

- [ ] **Step 3: Run the off-mode test**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/turn-manager-beasts.test.ts -t "off"`
Expected: PASS (the awakening test still fails until Task 9 seeds lairs — that's expected).

- [ ] **Step 4: Commit**

```bash
git add src/core/turn-manager.ts tests/core/turn-manager-beasts.test.ts
git commit -m "feat(beasts): turn-manager processing for awakening, movement, and attacks"
```

---

### Task 8: Player combat path — slay on player kills (actor parity)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Find the player-attack death branches**

Run: `grep -n "isBarbarian" src/main.ts`
Expected hits at ~2101, ~2337, ~2433 — these are the combat-resolution paths where a defender (or attacker) dies.

- [ ] **Step 2: Add the slay hook to each defender-death branch**

In each branch where a defeated unit is removed from `gameState.units` after combat, add **before** the deletion (so `recordBeastSlain` can still find the lair membership):

```typescript
      const slayResult = recordBeastSlain(gameState, defender, attacker);
      gameState = slayResult.state;
      if (slayResult.slain) {
        bus.emit('beast:slain', slayResult.slain);
      }
```

Adapt local variable names (`defender`/`attacker`) to each branch's actual names. Import at top of `main.ts`:

```typescript
import { recordBeastSlain } from '@/systems/beast-system';
```

If `gameState` is not reassignable in that scope (check how the existing code updates state after combat — main.ts may mutate in place), then instead apply the returned state's changed slices: `gameState.beasts = slayResult.state.beasts; gameState.civilizations = slayResult.state.civilizations; gameState.units = slayResult.state.units;` — match whichever pattern the surrounding code uses.

- [ ] **Step 3: Add notification listeners (near the `'barbarian:spawned'` listener at main.ts:3211)**

```typescript
bus.on('beast:awakened', ({ beastId, position }) => {
  const def = BEAST_DEFINITIONS[beastId];
  for (const civId of Object.keys(gameState.civilizations)) {
    appendNotification(notificationLog, civId, {
      message: def.awakeningFlavor,
      type: 'warning',
      turn: gameState.turn,
      target: { kind: 'map', coord: position, label: `${def.name} lair` },
    });
  }
});

bus.on('beast:slain', ({ beastId, slayerCivId, goldAwarded }) => {
  const def = BEAST_DEFINITIONS[beastId];
  const slayerName = gameState.civilizations[slayerCivId]?.name ?? slayerCivId;
  for (const civId of Object.keys(gameState.civilizations)) {
    appendNotification(notificationLog, civId, {
      message: civId === slayerCivId
        ? `Your forces have slain the ${def.name}! Hoard claimed: +${goldAwarded} gold.`
        : `${slayerName} has slain the ${def.name}!`,
      type: civId === slayerCivId ? 'success' : 'info',
      turn: gameState.turn,
    });
  }
});
```

Import `BEAST_DEFINITIONS` from `@/systems/beast-definitions`. Check the `Civilization` display-name field (`grep -n "interface Civilization" -A 10 src/core/types.ts`) and use the real field.

- [ ] **Step 4: Build to verify wiring compiles**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: remaining errors only in `sprite-catalog.ts` / `UNIT_SPRITE_CATALOG` and `UNIT_MOTION_STYLES` (fixed in Task 11). If main.ts shows errors, fix them now.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(beasts): player slay path and beast notifications"
```

---

### Task 9: Game creation — seed lairs + settings default

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `src/core/types.ts` (none — already done)

- [ ] **Step 1: Default the mode in `createDefaultSettings` (`src/core/game-state.ts:38`)**

Add to the returned settings object:

```typescript
    beastsMode: 'wild',
```

- [ ] **Step 2: Seed lairs in BOTH game constructors**

In `createNewGame` (line 109 implementation) and `createHotSeatGame` (line 306), find where `tribalVillages` is assigned from `placeVillages(...)` and add immediately after (reusing the same `startPositions`/`seed` variables in scope):

```typescript
  const beastsMode = settings.beastsMode ?? 'wild';
  const beastLairs = beastsMode === 'off'
    ? {}
    : placeBeastLairs(map, startPositions, mapSize, seed);
```

And in the returned `GameState` object literal, alongside `tribalVillages`:

```typescript
    beasts: { mode: beastsMode, lairs: beastLairs, sightingsByCiv: {} },
```

Import at top:

```typescript
import { placeBeastLairs } from '@/systems/beast-system';
```

Adapt local variable names (`settings`, `map`, `startPositions`, `mapSize`, `seed`) to what each constructor actually has in scope — read both functions first.

- [ ] **Step 3: Run the full turn-manager beast test**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/turn-manager-beasts.test.ts`
Expected: PASS (both tests). If the awakening test throws `'test seed produced no lairs'`, change the test's seed string until placement succeeds (forest tiles within constraints), and note the working seed in the test.

- [ ] **Step 4: Commit**

```bash
git add src/core/game-state.ts tests/core/turn-manager-beasts.test.ts
git commit -m "feat(beasts): seed lairs at game creation with beastsMode setting"
```

---

### Task 10: Rules doc — trainability exemption

**Files:**
- Modify: `.claude/rules/game-systems.md`

- [ ] **Step 1: Amend the Unit Types rule**

In `.claude/rules/game-systems.md`, under `## Unit Types`, append:

```markdown
- **Exception — beast units:** `UnitType` values prefixed `beast_` are legendary-beast units spawned exclusively by `beast-system.ts`. They are intentionally NOT in `TRAINABLE_UNITS`, have `productionCost: 0`, and are owned by the `'beasts'` owner constant. Do not add them to city production, AI training, or tech `unlocksUnits`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/game-systems.md
git commit -m "docs(rules): document beast unit trainability exemption"
```

---

### Task 11: Giant Boar sprite + catalog registration

**Files:**
- Create: `src/renderer/sprites/beasts.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`

Read `.claude/rules/sprites.md` and one existing quadruped sprite (`ScoutHoundSprite` in `src/renderer/sprites/units.tsx`) before writing. The boar reuses the existing `hound` animation rig (`data-kind="hound"`, `cq-leg-l/r` classes) — no new CSS needed in MR1.

- [ ] **Step 1: Create `src/renderer/sprites/beasts.tsx`**

```tsx
import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  Shadow,
  SpriteFrame,
} from './sprite-system';
import type { UnitSpriteProps } from './units';

/**
 * Legendary beasts use fixed palettes — they have no faction owner, so the
 * `palette` prop is accepted (catalog contract) but intentionally unused.
 * No <Banner> — beasts fly no flag.
 */

const BOAR = {
  hide: '#6b4a32',
  hideDark: '#4d3422',
  belly: '#8a6a4e',
  tusk: '#e8e0cc',
  eye: '#c43b2e',
};

export function GiantBoarSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g data-kind="hound" className="cq-sprite-figure">
        {/* hind + front legs (hound rig classes drive the walk cycle) */}
        <rect className="cq-leg-l" x="44" y="84" width="7" height="16" rx="3" fill={BOAR.hideDark} />
        <rect className="cq-leg-r" x="56" y="84" width="7" height="16" rx="3" fill={BOAR.hide} />
        <rect className="cq-leg-l" x="74" y="84" width="7" height="16" rx="3" fill={BOAR.hideDark} />
        <rect className="cq-leg-r" x="84" y="84" width="7" height="16" rx="3" fill={BOAR.hide} />
        {/* massive body */}
        <ellipse cx="66" cy="72" rx="30" ry="20" fill={BOAR.hide} stroke={P.ink.line} strokeWidth="1.5" />
        <ellipse cx="66" cy="80" rx="26" ry="11" fill={BOAR.belly} opacity="0.7" />
        {/* bristle ridge */}
        <path d="M40,62 Q50,50 66,52 Q82,50 92,60" fill="none" stroke={BOAR.hideDark} strokeWidth="5" strokeLinecap="round" />
        {/* head, snout, tusks */}
        <ellipse cx="92" cy="68" rx="14" ry="12" fill={BOAR.hide} stroke={P.ink.line} strokeWidth="1.5" />
        <rect x="100" y="66" width="12" height="9" rx="4" fill={BOAR.hideDark} />
        <path d="M102,76 Q108,84 114,78" fill="none" stroke={BOAR.tusk} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M100,74 Q105,81 110,76" fill="none" stroke={BOAR.tusk} strokeWidth="3" strokeLinecap="round" />
        {/* glowing eye */}
        <circle cx="94" cy="64" r="2.5" fill={BOAR.eye} />
        {/* ears + tail */}
        <path d="M86,56 L90,48 L95,56 Z" fill={BOAR.hideDark} />
        <path d="M37,68 Q30,64 32,58" fill="none" stroke={BOAR.hideDark} strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </SpriteFrame>
  );
}
```

Note: if `SpriteFrame` requires `<HexBase />` per the sprite rules, check how `ScoutHoundSprite` does it and match exactly — copy its frame skeleton (Shadow/HexBase order) and keep the boar art.

- [ ] **Step 2: Register in `src/renderer/sprites/sprite-catalog.ts`**

Add the import:

```typescript
import { GiantBoarSprite } from './beasts';
```

In `UNIT_MOTION_STYLES` (line 36):

```typescript
  beast_boar: 'animal',
```

In `UNIT_SPRITE_CATALOG` (line 103):

```typescript
  beast_boar: GiantBoarSprite,
```

- [ ] **Step 3: Build + sprite-catalog tests**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts`
Expected: build PASSES now (all six exhaustive maps complete); sprite-catalog tests PASS. If the catalog test asserts every sprite renders, the boar must produce non-empty SVG — debug by importing and logging `GiantBoarSprite({ palette: <any existing palette>, svgOnly: true })` in a scratch test.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/sprites/beasts.tsx src/renderer/sprites/sprite-catalog.ts
git commit -m "feat(beasts): Giant Boar sprite with hound walk rig"
```

---

### Task 12: Lair rendering (explored tiles show the den)

**Files:**
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/renderer/render-loop.ts`

Lairs render exactly like tribal-village glyphs: a `Set`/`Map` keyed by `"q,r"` passed into `drawHexMap`, drawn only on explored tiles (visibility filtering already happens inside `drawHexMap` for villages — mirror it).

- [ ] **Step 1: Extend `drawHexMap` (`src/renderer/hex-renderer.ts:117`)**

Add a parameter after `villagePositions`:

```typescript
  villagePositions?: Set<string>,
  beastLairGlyphs?: Map<string, string>,   // "q,r" -> glyph; built by render-loop from state.beasts
```

Inside the per-tile loop where `isVillage` is computed (line 136):

```typescript
    const lairGlyph = beastLairGlyphs?.get(`${tile.coord.q},${tile.coord.r}`);
```

Where the village indicator is drawn (line ~394), add an equivalent block after it, drawing the glyph at the same anchor with the same font sizing the village glyph uses:

```typescript
      if (lairGlyph) {
        // same canvas setup as the village glyph above — copy its ctx.font / fillText pattern
        ctx.fillText(lairGlyph, /* same x */ 0, /* same y */ 0);
      }
```

Copy the literal coordinates/offsets from the village-drawing code three lines above — do not guess; the two glyphs should be visually consistent. **Callers must update**: search all `drawHexMap(` call sites (`grep -rn "drawHexMap(" src/ tests/`) and pass `undefined` where no lairs are available.

- [ ] **Step 2: Build the glyph map in `src/renderer/render-loop.ts` (call site line 294)**

Above the `drawHexMap` call:

```typescript
    const beastLairGlyphs = new Map<string, string>();
    if (this.state.beasts) {
      for (const lair of Object.values(this.state.beasts.lairs)) {
        const glyph = lair.status === 'slain' || lair.status === 'claimed' ? '🏆' : '🐾';
        beastLairGlyphs.set(`${lair.position.q},${lair.position.r}`, glyph);
      }
    }
```

And pass it as the new argument in the `drawHexMap(...)` call.

- [ ] **Step 3: Build + visual smoke**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS.
Then: `bash scripts/run-with-mise.sh yarn dev`, start a new medium game, and pan the map: an explored forest tile far from spawn should show 🐾. (If no lair placed on this seed, start a couple of new games.) Stop the dev server after checking.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hex-renderer.ts src/renderer/render-loop.ts
git commit -m "feat(beasts): render lair glyphs on explored tiles"
```

---

### Task 13: Setup toggle (campaign setup UI)

**Files:**
- Modify: `src/ui/campaign-setup.ts`

#### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Setup screen shows map-size selector; beasts row shows "Wild" preselected | Player taps "Calm" | "Calm" highlights; help text below updates to the calm description |
| Beasts row shows "Off" | Player starts the game | New game has `beasts.mode === 'off'`, zero lairs, zero 🐾 glyphs |

#### Misleading-UI risks

- The three mode labels must describe behavior, not just names ("self-explanatory UI" rule). Each option carries one help sentence (below).
- The control must reflect the actual default (`wild`) on first render — never render unselected.

- [ ] **Step 1: Read the existing setup controls**

Run: `grep -n "mapSize\|select\|createGameButton" src/ui/campaign-setup.ts | head -30` and read the surrounding code. Mirror whichever control pattern the map-size selector uses (buttons or `<select>`).

- [ ] **Step 2: Add the Legendary Beasts control**

Insert a labeled control after the map-size control, following its exact DOM/style pattern, with these three options and help texts (use `textContent`, never `innerHTML`):

- `Wild` (default): "Legendary beasts roam near their lairs and attack intruders."
- `Calm`: "Beasts appear and can be hunted, but never attack first."
- `Off`: "No legendary beasts this game."

Wire the selection into the config the Start button builds: set `settingsOverrides = { ...existing, beastsMode: selected }` on the `SoloSetupConfig` (field exists at `src/core/types.ts:923`). If hotseat setup (`src/ui/hotseat-setup.ts`) shares the same settings panel, add it there identically; if it has no settings section, defer hot-seat UI to the existing shared default (`wild`) and note that in the PR body.

- [ ] **Step 3: Manual verification**

Run: `bash scripts/run-with-mise.sh yarn dev` — create one game with each mode; confirm Off ⇒ no 🐾 anywhere (check several explored forests), Wild ⇒ lairs appear. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/ui/campaign-setup.ts src/ui/hotseat-setup.ts
git commit -m "feat(beasts): legendary beasts mode selector in game setup"
```

---

### Task 14: Final verification + PR

- [ ] **Step 1: Full gates**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0. Fix anything red before proceeding (the `require-green-before-push` hook will block otherwise).

- [ ] **Step 2: Combat-preview check (strategy-game-mechanics rule)**

Run: `bash scripts/run-with-mise.sh yarn dev`, awaken a boar (play ~10 turns near a lair with a warrior — or temporarily set `AWAKEN_CHANCE_PER_TURN = 1` locally, verify, then revert). Tap-attack the boar: the combat preview must show "Giant Boar", the beast description, and odds. This works for free if previews read `UNIT_DEFINITIONS`/`UNIT_DESCRIPTIONS` — verify visually, fix if the preview panel special-cases owners.

- [ ] **Step 3: Create the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(beasts): MR1 — legendary beast core system + Giant Boar" --body "$(cat <<'EOF'
## Summary
- New legendary-beast system: deterministic lair placement, era-gated awakening, territorial (leashed) behavior — beasts never attack cities and never leave their lair radius
- One beast ships fully playable: the Giant Boar (forest, era 1, tier 1)
- Slaying awards a hoard (era-scaled gold) + full-heal "Victory Feast"; shared `recordBeastSlain` covers player, AI, and counterattack paths
- Setup toggle: Wild / Calm / Off
- Lair glyphs render on explored tiles; boar sprite rides the existing hound animation rig

## Out of scope (future MRs — see docs/superpowers/plans/2026-06-11-legendary-beasts-index.md)
- Bestiary panel + sighting ceremonies (MR2)
- Remaining 7 beasts (MR3, MR5–MR7), hoard choice rewards + lair trophies (MR4), audio/AI/balance (MR8)

## Why this is safe to merge partial
Player-visible surfaces introduced: lair glyphs, beast units with combat preview, slay notifications with gold, and the setup toggle. Each is fully wired end-to-end — there are no dead buttons or half-built panels. The bestiary is not referenced anywhere yet, so no dead-end UX exists.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (executor: verify before opening the PR)

- [ ] All six exhaustive `Record<UnitType, …>` maps have `beast_boar` entries
- [ ] `recordBeastSlain` is called from BOTH main.ts player path and turn-manager counterattack path (actor-complete rule)
- [ ] `processBeasts` uses only seeded RNG — `grep -n "Math.random" src/systems/beast-system.ts` returns nothing
- [ ] No mutation of input state in `beast-system.ts` exports (turn-manager's clone-mutation is the only mutation site)
- [ ] Barbarian `playerUnits` filter excludes `BEAST_OWNER` (barbarians must not chase beasts)
- [ ] Old saves load: a save without `state.beasts` plays normally (`beasts?` optional + every read guarded)
