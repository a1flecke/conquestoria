# Combat, Visibility, And Unit Motion Bug Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents for this plan.

**Goal:** Fix issues #198-#201 by separating movement from attack eligibility, preserving viewer-scoped fog/last-seen truth at every zoom/wrap copy, giving barbarian and minor-civ units clear visual identity, and adding full per-sprite unit motion frames.

**Architecture:** Implement this in two reviewable slices. Slice 1 adds shared attack targeting plus viewer-scoped last-seen tile presentation, then wires player and non-player paths through those helpers. Slice 2 adds a shared unit visual resolver, role markers, sprite motion frames, and movement animation command lockout.

**Tech Stack:** TypeScript, Canvas 2D renderer, Vite, Vitest, custom JSX sprite runtime, existing `./scripts/run-with-mise.sh yarn ...` command wrapper.

---

## Source Spec

- Design spec: `docs/superpowers/specs/2026-05-15-combat-visibility-unit-motion-bug-bundle-design.md`
- Issues: #198, #199, #200, #201

## File Structure

### Slice 1: Attack Rules And Visibility Truth

- Create: `src/systems/attack-targeting.ts`
  - Owns typed attack profiles, attack distance checks, target classification, and attack target collection.
- Create: `tests/systems/attack-targeting.test.ts`
  - Proves melee adjacency, explicit ranged attacks, fog gating, wrapped distance, and no ranged city attack without siege/bombard.
- Create: `src/input/selected-unit-highlights.ts`
  - Converts movement range and attack target data into renderer-facing `HexHighlight[]` records.
- Create: `tests/input/selected-unit-highlights.test.ts`
  - Proves movement and attack highlights do not lie to the player.
- Modify: `src/input/selected-unit-tap-intent.ts`
  - Stops using movement range as the gate for city assault when attack profile disallows it.
- Modify: `tests/input/selected-unit-tap-intent.test.ts`
  - Adds non-adjacent melee and ranged-city negative coverage.
- Modify: `src/main.ts`
  - Stores separate movement and attack target ranges, opens combat preview only for legal attack targets, and revalidates on attack confirmation.
- Create: `src/systems/last-seen-presentation.ts`
  - Owns viewer-scoped serializable last-seen tile presentation snapshots.
- Create: `tests/systems/last-seen-presentation.test.ts`
  - Proves snapshots update only from visible tiles, are viewer-scoped, and do not read live fogged city state.
- Modify: `src/core/types.ts`
  - Adds serializable `LastSeenTilePresentation` and `VisibilityMap.lastSeen`.
- Modify: `src/systems/fog-of-war.ts`
  - Exposes canonical visibility coordinate helpers and refreshes last-seen presentation after visibility updates.
- Modify: `src/systems/unit-movement-system.ts`
  - Refreshes last-seen presentation after player, AI, and automation movement changes visibility.
- Modify: `src/core/game-state.ts`
  - Seeds last-seen presentation after initial visibility is computed for new games and hot-seat starts.
- Modify: `src/core/turn-manager.ts`
  - Refreshes last-seen presentation after per-turn visibility updates and minor-civ shared vision.
- Create: `src/renderer/tile-presentation.ts`
  - Resolves live, last-seen, or unknown tile presentation for rendering.
- Create: `tests/renderer/tile-presentation.test.ts`
  - Proves fogged tiles render from last-seen data and missing last-seen renders as unknown fog.
- Modify: `src/renderer/hex-renderer.ts`
  - Draws visible tiles from live state, fogged tiles from last-seen presentation, and unexplored tiles from hidden presentation.
- Modify: `src/renderer/city-renderer.ts`
  - Draws visible cities from live state, fogged cities from last-seen presentation, and no city at all on unexplored tiles.
- Modify: `tests/renderer/city-renderer.test.ts`
  - Proves fogged city rendering uses stale name/owner/population and does not leak live production, unrest, occupation, or destruction.
- Modify: `src/renderer/fog-renderer.ts`
  - Uses canonical visibility for wrap ghost copies and keeps overlay opacity stable at low zoom.
- Modify: `tests/renderer/fog-renderer.test.ts`
  - Adds low-zoom/wrap canonical overlay coverage.
- Modify: `src/renderer/render-visibility.ts`
  - Allows last-seen ownership presentation for fogged tiles without using live foreign ownership.

### Slice 2: Unit Visual Identity And Motion

- Create: `src/renderer/unit-visual-resolver.ts`
  - Owns owner role, palette/color, fallback icon, role marker, sprite key, and motion state.
- Create: `tests/renderer/unit-visual-resolver.test.ts`
  - Proves major, barbarian, and minor-civ role marker decisions and privacy-safe minor-civ color fallback.
- Modify: `src/renderer/unit-renderer.ts`
  - Draws units through the visual resolver, exposes a single-unit drawing helper for movement animation, draws role markers, and skips units currently rendered as movement animations.
- Modify: `tests/renderer/unit-renderer.test.ts`
  - Proves barbarian chevron, minor-civ diamond, stack count, and hidden moving unit behavior.
- Modify: `src/main.ts`
  - Includes barbarian and active minor-civ palettes when calling `initSprites`.
- Modify: `src/renderer/sprites/units.tsx`
  - Adds full per-sprite moving frame support for every current unit sprite.
- Modify: `src/renderer/sprites/sprite-catalog.ts`
  - Keeps catalog type compatible with motion-capable unit sprite props.
- Modify: `src/renderer/sprites/sprite-loader.ts`
  - Loads/caches idle and motion frame images by civ palette without breaking uncached `null` behavior.
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
  - Proves every unit type has idle and moving output.
- Modify: `tests/renderer/sprites/sprite-loader.test.ts`
  - Proves sprite cache returns motion frames for loaded civs and `null` for uncached civs.
- Create: `src/renderer/unit-movement-animation.ts`
  - Owns interpolation, wrapped route projection, animation duration, moving-unit IDs, and frame choice.
- Create: `tests/renderer/unit-movement-animation.test.ts`
  - Proves short wrapped route, duration clamp, frame selection, and moved-unit hiding.
- Modify: `src/renderer/animation-system.ts`
  - Gives movement animation a typed hook while preserving existing hex reveal and combat flash behavior.
- Modify: `src/renderer/render-loop.ts`
  - Draws moving units after stationary units and before fog overlay, so animation still respects visibility.
- Modify: `src/main.ts`
  - Starts movement animation from `executeUnitMove` results, blocks duplicate commands while a unit is moving, and resumes selection after completion.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Warrior selected, visible enemy two hexes away, tile inside movement range | Player taps enemy | No combat preview opens; enemy tile is not red-highlighted |
| Archer selected, visible enemy unit two hexes away | Player taps enemy | Combat preview opens; Archer stays on original tile when attack is confirmed |
| Archer selected, hostile city two hexes away | Player taps city | No ranged city/capture preview opens |
| Enemy unit position is fogged or unexplored | Player selects ranged unit | Hidden enemy does not get an attack highlight |
| Previously visible tile becomes fogged | Player zooms out or pans across wrap copies | Last-seen tile presentation remains under fog overlay; live unit/city changes stay hidden |
| Barbarian or minor-civ unit is visible | Player looks at map | Unit uses same base sprite as major civ, owner color, and role marker |
| Unit moves | Player watches movement | Unit travels along route and uses per-sprite motion frames while role marker remains visible |
| Unit is mid-animation | Player taps moving unit or destination | No duplicate command is accepted; normal commands resume after animation completes |
| Unit crosses horizontal wrap edge | Player watches movement | Unit takes the short wrapped route instead of sliding across the full map |

## Misleading UI Risks

- **Attackable:** A tile is attackable only if `canUnitAttackTarget()` returns `ok: true`. Movement reach alone must not create an attack highlight.
- **Visible target:** Player-ranged attacks require current visibility. A fogged historical target must not appear attackable.
- **City attack:** Ordinary ranged units attack units only. A city target requires adjacent melee/city assault unless a later siege/bombard profile exists.
- **Fog/stale:** Fogged tiles show viewer-scoped last-seen presentation. They must not read live units, live city ownership, live destruction, live garrisons, or live improvements.
- **Role marker:** Barbarian and minor-civ role markers are identity cues, not diplomacy state. They must not reveal undiscovered minor-civ names or hidden details.
- **Moving unit:** A moving unit is visually busy. Accepting a second command during animation creates stale-state UX and must be blocked.

## Interaction Replay Checklist

- Select Warrior, verify only adjacent hostile targets are red-highlighted.
- Select Archer, verify visible hostile unit at range is red-highlighted and hostile city at range is not.
- Open combat preview, mutate target legality in the test fixture, click `Attack`, and verify execution revalidates before applying combat.
- Move a unit one hex, verify moving visual appears, repeat-click is ignored, animation completes, and normal selection resumes.
- Move one unit out of a stack, verify stack count updates after animation and no duplicate idle copy is drawn.
- Pan/zoom wrapped map at low zoom, verify fog overlays and last-seen presentation are identical for canonical and ghost copies.
- Load a save missing `visibility.lastSeen`, render fogged tile, and verify unknown fog appears without live terrain leak.

---

## Task 1: Shared Attack Targeting Helper

**Files:**
- Create: `src/systems/attack-targeting.ts`
- Create: `tests/systems/attack-targeting.test.ts`
- Modify: `src/systems/unit-system.ts`

- [ ] **Step 1: Write failing attack targeting tests**

Create `tests/systems/attack-targeting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { canUnitAttackTarget, getAttackTargets, getUnitAttackProfile } from '@/systems/attack-targeting';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';

function grassMap(width = 6, height = 4, wrapsHorizontally = false): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      tiles[hexKey({ q, r })] = {
        coord: { q, r },
        terrain: 'grassland',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }
  return { width, height, wrapsHorizontally, tiles, rivers: [] };
}

function unit(id: string, type: Unit['type'], owner: string, position: HexCoord): Unit {
  return { ...createUnit(type, owner, position), id, owner, position };
}

function stateWithUnits(units: Record<string, Unit>, visibility: Record<string, 'visible' | 'fog' | 'unexplored'> = {}): GameState {
  return {
    turn: 1,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: grassMap(),
    units,
    cities: {},
    civilizations: {
      player: { id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: 'generic', cities: [], units: Object.keys(units).filter(id => units[id].owner === 'player'), techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any }, gold: 0, visibility: { tiles: visibility }, score: 0, diplomacy: { relationships: { 'ai-1': -50 }, treaties: [], events: [], atWarWith: ['ai-1'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } },
      'ai-1': { id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'generic', cities: [], units: Object.keys(units).filter(id => units[id].owner === 'ai-1'), techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any }, gold: 0, visibility: { tiles: {} }, score: 0, diplomacy: { relationships: { player: -50 }, treaties: [], events: [], atWarWith: ['player'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } } },
    },
    barbarianCamps: {},
    minorCivs: {},
    tribalVillages: {},
    resources: {},
    improvements: {},
    settings: { soundEnabled: false, musicEnabled: false, musicVolume: 0.5, sfxVolume: 0.5, tutorialEnabled: false, advisorsEnabled: false, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

describe('attack-targeting', () => {
  it('gives warriors the default melee profile and archers an explicit ranged profile', () => {
    expect(getUnitAttackProfile('warrior')).toEqual({ kind: 'melee', range: 1, targets: ['unit', 'city'] });
    expect(getUnitAttackProfile('archer')).toEqual({ kind: 'ranged', range: 2, targets: ['unit'] });
  });

  it('rejects non-adjacent melee attacks even when the enemy is inside movement range', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });

  it('allows archers to attack visible hostile units at range without moving into the defender hex', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetType: 'unit',
      targetUnitId: 'defender',
      range: 2,
    });
  });

  it('rejects ranged attacks against fogged targets through the player path', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'fog' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'not-visible',
    });
  });

  it('rejects unit attacks against major civs that are not at war', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });
    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'not-hostile',
    });
  });

  it('rejects ordinary archer attacks against cities from range', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const state = stateWithUnits({ attacker }, { '2,0': 'visible' });
    state.cities.enemyCity = { id: 'enemyCity', name: 'Enemy City', owner: 'ai-1', position: { q: 2, r: 0 }, population: 4, buildings: [], productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 10, workedTiles: [], ownedTiles: [{ q: 2, r: 0 }], focus: 'balanced', maturity: 'outpost', grid: [], gridSize: 3, unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 } as any;

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'unsupported-target',
    });
  });

  it('uses wrapped distance for melee adjacency at the horizontal edge', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 1 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 5, r: 1 });
    const state = stateWithUnits({ attacker, defender }, { '5,1': 'visible' });
    state.map = grassMap(6, 4, true);

    expect(canUnitAttackTarget(state, attacker, { q: 5, r: 1 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetUnitId: 'defender',
      range: 1,
    });
  });

  it('collects only legal attack target coordinates', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const visibleDefender = unit('visible-defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const foggedDefender = unit('fogged-defender', 'warrior', 'ai-1', { q: 1, r: 1 });
    const state = stateWithUnits(
      { attacker, 'visible-defender': visibleDefender, 'fogged-defender': foggedDefender },
      { '2,0': 'visible', '1,1': 'fog' },
    );

    expect(getAttackTargets(state, attacker, { viewerId: 'player' }).map(target => hexKey(target.coord))).toEqual(['2,0']);
  });
});
```

- [ ] **Step 2: Run the failing attack targeting tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/attack-targeting.test.ts
```

Expected: FAIL because `src/systems/attack-targeting.ts` does not exist.

- [ ] **Step 3: Add attack profile types to unit definitions**

Modify `src/core/types.ts`:

```ts
export interface UnitAttackProfile {
  kind: 'melee' | 'ranged' | 'siege' | 'bombard';
  range: number;
  targets: Array<'unit' | 'city'>;
}

export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
  spyDetectionChance?: number;
  attackProfile?: UnitAttackProfile;
}
```

Modify only the Archer entry in `src/systems/unit-system.ts`:

```ts
  archer: {
    type: 'archer', name: 'Archer', movementPoints: 2,
    visionRange: 2, strength: 15, canFoundCity: false,
    canBuildImprovements: false, productionCost: 35,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit'] },
  },
```

- [ ] **Step 4: Implement `src/systems/attack-targeting.ts`**

Create `src/systems/attack-targeting.ts`:

```ts
import type { GameState, HexCoord, Unit, UnitAttackProfile, UnitType } from '@/core/types';
import { hexDistance, hexKey, hexesInRange, getWrappedHexesInRange, wrappedHexDistance } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export type AttackTargetFailure =
  | 'missing-attacker'
  | 'no-combat-strength'
  | 'out-of-range'
  | 'not-visible'
  | 'no-target'
  | 'friendly-target'
  | 'not-hostile'
  | 'unsupported-target';

export type AttackTargetResult =
  | { ok: true; targetType: 'unit'; targetUnitId: string; coord: HexCoord; range: number }
  | { ok: true; targetType: 'city'; cityId: string; coord: HexCoord; range: number }
  | { ok: false; reason: AttackTargetFailure };

export interface AttackTargetOptions {
  viewerId?: string;
  requireVisibility?: boolean;
}

export interface AttackTarget {
  coord: HexCoord;
  result: Extract<AttackTargetResult, { ok: true }>;
}

const DEFAULT_ATTACK_PROFILE: UnitAttackProfile = { kind: 'melee', range: 1, targets: ['unit', 'city'] };

export function getUnitAttackProfile(type: UnitType): UnitAttackProfile {
  return UNIT_DEFINITIONS[type].attackProfile ?? DEFAULT_ATTACK_PROFILE;
}

function distanceForMap(state: GameState, from: HexCoord, to: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

function isVisibleToViewer(state: GameState, viewerId: string | undefined, coord: HexCoord): boolean {
  if (!viewerId) return true;
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility) return false;
  return getVisibility(visibility, coord) === 'visible';
}

function unitAt(state: GameState, attacker: Unit, coord: HexCoord): [string, Unit] | null {
  const targetKey = hexKey(coord);
  const entry = Object.entries(state.units).find(([, unit]) =>
    unit.id !== attacker.id
    && hexKey(unit.position) === targetKey,
  );
  return entry ?? null;
}

function hostileCityAt(state: GameState, attacker: Unit, coord: HexCoord): [string, { owner: string; position: HexCoord }] | null {
  const targetKey = hexKey(coord);
  const entry = Object.entries(state.cities).find(([, city]) =>
    city.owner !== attacker.owner
    && hexKey(city.position) === targetKey,
  );
  return entry ? [entry[0], entry[1]] : null;
}

function canAttackUnitOwner(state: GameState, attackerOwner: string, targetOwner: string): boolean {
  if (targetOwner === attackerOwner) return false;
  if (targetOwner === 'barbarian' || targetOwner === 'rebels') return true;
  return state.civilizations[attackerOwner]?.diplomacy?.atWarWith.includes(targetOwner) ?? false;
}

export function canUnitAttackTarget(
  state: GameState,
  attacker: Unit | undefined,
  coord: HexCoord,
  options: AttackTargetOptions = {},
): AttackTargetResult {
  if (!attacker) return { ok: false, reason: 'missing-attacker' };
  if (UNIT_DEFINITIONS[attacker.type].strength <= 0) return { ok: false, reason: 'no-combat-strength' };

  const profile = getUnitAttackProfile(attacker.type);
  const range = distanceForMap(state, attacker.position, coord);
  if (range > profile.range || range === 0) return { ok: false, reason: 'out-of-range' };

  const requireVisibility = options.requireVisibility ?? Boolean(options.viewerId);
  if (requireVisibility && !isVisibleToViewer(state, options.viewerId, coord)) {
    return { ok: false, reason: 'not-visible' };
  }

  const targetUnit = unitAt(state, attacker, coord);
  if (targetUnit) {
    if (targetUnit[1].owner === attacker.owner) return { ok: false, reason: 'friendly-target' };
    if (!canAttackUnitOwner(state, attacker.owner, targetUnit[1].owner)) return { ok: false, reason: 'not-hostile' };
    if (!profile.targets.includes('unit')) return { ok: false, reason: 'unsupported-target' };
    return { ok: true, targetType: 'unit', targetUnitId: targetUnit[0], coord, range };
  }

  const targetCity = hostileCityAt(state, attacker, coord);
  if (targetCity) {
    if (!profile.targets.includes('city')) return { ok: false, reason: 'unsupported-target' };
    return { ok: true, targetType: 'city', cityId: targetCity[0], coord, range };
  }

  return { ok: false, reason: 'no-target' };
}

export function getAttackTargets(
  state: GameState,
  attacker: Unit,
  options: AttackTargetOptions = {},
): AttackTarget[] {
  const profile = getUnitAttackProfile(attacker.type);
  const candidates = state.map.wrapsHorizontally
    ? getWrappedHexesInRange(attacker.position, profile.range, state.map.width)
    : hexesInRange(attacker.position, profile.range);

  return candidates
    .filter(coord => hexKey(coord) !== hexKey(attacker.position))
    .map(coord => ({ coord, result: canUnitAttackTarget(state, attacker, coord, options) }))
    .filter((target): target is AttackTarget => target.result.ok);
}
```

- [ ] **Step 5: Run attack targeting tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/attack-targeting.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/attack-targeting.ts tests/systems/attack-targeting.test.ts
git commit -m "feat(combat): add shared attack targeting"
```

## Task 2: Player Highlights, Tap Intent, And Combat Revalidation

**Files:**
- Create: `src/input/selected-unit-highlights.ts`
- Create: `tests/input/selected-unit-highlights.test.ts`
- Modify: `src/input/selected-unit-tap-intent.ts`
- Modify: `tests/input/selected-unit-tap-intent.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write failing selected-unit highlight tests**

Create `tests/input/selected-unit-highlights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { hexKey } from '@/systems/hex-utils';

describe('selected-unit-highlights', () => {
  it('does not mark non-adjacent melee targets as attack highlights', () => {
    const state = createNewGame(undefined, 'melee-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'warrior', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }), id: 'enemy' },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles['2,0'] = 'visible';

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('2,0');
    expect(result.highlights.filter(h => h.type === 'attack').map(h => hexKey(h.coord))).not.toContain('2,0');
  });

  it('marks visible archer targets as attack and not movement', () => {
    const state = createNewGame(undefined, 'archer-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }), id: 'enemy' },
    };
    state.civilizations.player.units = ['archer'];
    state.civilizations.player.visibility.tiles['2,0'] = 'visible';

    const result = buildSelectedUnitHighlights(state, 'archer');

    expect(result.attackTargets.map(target => hexKey(target.coord))).toContain('2,0');
    expect(result.highlights).toContainEqual({ coord: { q: 2, r: 0 }, type: 'attack' });
  });

  it('does not highlight fogged archer targets', () => {
    const state = createNewGame(undefined, 'archer-fog-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }), id: 'enemy' },
    };
    state.civilizations.player.units = ['archer'];
    state.civilizations.player.visibility.tiles['2,0'] = 'fog';

    const result = buildSelectedUnitHighlights(state, 'archer');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('2,0');
    expect(result.highlights.filter(h => h.type === 'attack')).toHaveLength(0);
  });

  it('leaves adjacent hostile cities on the movement/city-assault path instead of combat-preview attack targets', () => {
    const state = createNewGame(undefined, 'city-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'warrior', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles['1,0'] = 'visible';
    state.cities.enemyCity = { id: 'enemyCity', name: 'Enemy City', owner: 'ai-1', position: { q: 1, r: 0 }, population: 4, buildings: [], productionQueue: [], productionProgress: 0, food: 0, foodNeeded: 10, workedTiles: [], ownedTiles: [{ q: 1, r: 0 }], focus: 'balanced', maturity: 'outpost', grid: [], gridSize: 3, unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 } as any;

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('1,0');
    expect(result.highlights.filter(h => h.type === 'attack').map(h => hexKey(h.coord))).not.toContain('1,0');
  });
});
```

- [ ] **Step 2: Run the failing highlight tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts
```

Expected: FAIL because `src/input/selected-unit-highlights.ts` does not exist.

- [ ] **Step 3: Implement selected-unit highlight projection**

Create `src/input/selected-unit-highlights.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import type { HexHighlight } from '@/renderer/render-loop';
import { getAttackTargets, type AttackTarget } from '@/systems/attack-targeting';
import { hexKey } from '@/systems/hex-utils';
import { buildUnitOccupancy } from '@/systems/unit-occupancy';
import { getMovementRange } from '@/systems/unit-system';

export interface SelectedUnitHighlightResult {
  movementRange: HexCoord[];
  attackTargets: AttackTarget[];
  highlights: HexHighlight[];
}

export function buildSelectedUnitHighlights(state: GameState, unitId: string): SelectedUnitHighlightResult {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== state.currentPlayer) {
    return { movementRange: [], attackTargets: [], highlights: [] };
  }

  const occupancy = buildUnitOccupancy(state.units);
  const movementRange = getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId);
  const attackTargets = getAttackTargets(state, unit, { viewerId: state.currentPlayer })
    .filter(target => target.result.targetType === 'unit');
  const attackKeys = new Set(attackTargets.map(target => hexKey(target.coord)));

  const moveHighlights = movementRange
    .filter(coord => !attackKeys.has(hexKey(coord)))
    .map(coord => ({ coord, type: 'move' as const }));

  const attackHighlights = attackTargets.map(target => ({ coord: target.coord, type: 'attack' as const }));

  return {
    movementRange,
    attackTargets,
    highlights: [...moveHighlights, ...attackHighlights],
  };
}
```

- [ ] **Step 4: Add tap intent tests for non-adjacent melee and ranged city negatives**

Append to `tests/input/selected-unit-tap-intent.test.ts`:

```ts
  it('returns move when a melee unit taps a non-adjacent hostile city inside movement range', () => {
    const state = makeTapAssaultFixture();
    state.cities.enemyCity.position = { q: 2, r: 0 };
    state.cities.enemyCity.ownedTiles = [{ q: 2, r: 0 }];
    state.units['unit-1'] = { ...state.units['unit-1'], movementPointsLeft: 2 };

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 2, r: 0 }, [{ q: 1, r: 0 }, { q: 2, r: 0 }]);

    expect(intent).toEqual({ kind: 'move' });
  });

  it('returns move when an ordinary archer taps a non-adjacent hostile city', () => {
    const state = makeTapAssaultFixture();
    state.units['unit-1'] = { ...createUnit('archer', 'player', { q: 0, r: 0 }), id: 'unit-1', movementPointsLeft: 2 };
    state.cities.enemyCity.position = { q: 2, r: 0 };
    state.cities.enemyCity.ownedTiles = [{ q: 2, r: 0 }];
    state.civilizations.player.visibility.tiles['2,0'] = 'visible';

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 2, r: 0 }, [{ q: 1, r: 0 }, { q: 2, r: 0 }]);

    expect(intent).toEqual({ kind: 'move' });
  });
```

- [ ] **Step 5: Update tap intent to require legal city attack**

Modify `src/input/selected-unit-tap-intent.ts` imports:

```ts
import { canUnitAttackTarget } from '@/systems/attack-targeting';
```

In `resolveSelectedUnitTapIntent`, immediately before returning `assault-minor-civ`, `confirm-war-city`, or `assault-city`, add:

```ts
  const attackResult = canUnitAttackTarget(state, unit, targetCoord, { viewerId: state.currentPlayer });
  if (!attackResult.ok || attackResult.targetType !== 'city') {
    return { kind: 'move' };
  }
```

Keep the existing friendly/alliance branch before this check so allied city entry still returns `move`.

- [ ] **Step 6: Wire `main.ts` selection and combat preview to separate attack targets**

In `src/main.ts`, add import:

```ts
import { canUnitAttackTarget } from '@/systems/attack-targeting';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
```

Near existing `movementRange`, add:

```ts
let attackRange: HexCoord[] = [];
```

In `selectUnit`, replace the manual movement/highlight block with:

```ts
  const highlightResult = buildSelectedUnitHighlights(gameState, unitId);
  movementRange = highlightResult.movementRange;
  attackRange = highlightResult.attackTargets.map(target => target.coord);
  renderLoop.setHighlights(highlightResult.highlights);
```

In `deselectUnit`, clear both arrays:

```ts
  movementRange = [];
  attackRange = [];
```

In the tap handler, split attack from movement:

```ts
  const tappedAttackTarget = selectedUnitId && attackRange.some(h => hexKey(h) === key);
  const tappedMovementTarget = selectedUnitId && movementRange.some(h => hexKey(h) === key);
```

Change the combat preview branch to use `tappedAttackTarget`. In the `attackBtn` listener, revalidate:

```ts
        attackBtn.addEventListener('click', () => {
          const attacker = selectedUnitId ? gameState.units[selectedUnitId] : undefined;
          const legality = canUnitAttackTarget(gameState, attacker, coord, { viewerId: gameState.currentPlayer });
          if (!legality.ok || legality.targetType !== 'unit') {
            showNotification('That target is no longer attackable.', 'warning');
            if (selectedUnitId) selectUnit(selectedUnitId);
            return;
          }
          executeAttack(selectedUnitId!, key);
        });
```

Also revalidate inside `executeAttack` itself so keyboard shortcuts, future automation hooks, or stale closures cannot bypass the shared rule. Add `parseHexKey` to the `hex-utils` import and change the start of `executeAttack` to:

```ts
function executeAttack(attackerId: string, targetKey: string): void {
  const attacker = gameState.units[attackerId];
  const targetCoord = parseHexKey(targetKey);
  const legality = canUnitAttackTarget(gameState, attacker, targetCoord, { viewerId: gameState.currentPlayer });
  if (!attacker || !legality.ok || legality.targetType !== 'unit') {
    showNotification('That target is no longer attackable.', 'warning');
    if (selectedUnitId) selectUnit(selectedUnitId);
    return;
  }

  const defenderId = legality.targetUnitId;
  const defender = gameState.units[defenderId];
  if (!defender) return;

  // Keep the existing combat resolution body from this point onward, using
  // `defenderId` and `defender` from the validated legality result.
}
```

- [ ] **Step 7: Run targeted input tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/attack-targeting.test.ts tests/input/selected-unit-highlights.test.ts tests/input/selected-unit-tap-intent.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add src/input/selected-unit-highlights.ts src/input/selected-unit-tap-intent.ts src/main.ts tests/input/selected-unit-highlights.test.ts tests/input/selected-unit-tap-intent.test.ts
git commit -m "fix(combat): separate attack and movement targeting"
```

## Task 3: Non-Player Attack Parity

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `tests/ai/basic-ai.test.ts`
- Modify: `tests/systems/barbarian-system.test.ts`
- Modify: `tests/systems/minor-civ-system.test.ts`

- [ ] **Step 1: Add parity regression tests**

Add a test to `tests/ai/basic-ai.test.ts` that creates an AI Warrior two hexes from a player unit, runs one AI turn, and asserts no combat event was emitted and both units survive.

```ts
it('does not let AI melee units attack non-adjacent targets', () => {
  const state = createNewGame(undefined, 'ai-melee-range', 'small');
  const attacker = createUnit('warrior', 'ai-1', { q: 0, r: 0 });
  attacker.id = 'ai-warrior';
  const defender = createUnit('warrior', 'player', { q: 2, r: 0 });
  defender.id = 'player-warrior';
  state.units = { [attacker.id]: attacker, [defender.id]: defender };
  state.civilizations['ai-1'].units = [attacker.id];
  state.civilizations.player.units = [defender.id];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  const combatEvents: unknown[] = [];
  const bus = { emit: (type: string, payload: unknown) => { if (type === 'combat:resolved') combatEvents.push(payload); } } as any;

  runBasicAI(state, 'ai-1', bus);

  expect(combatEvents).toHaveLength(0);
  expect(state.units[attacker.id]).toBeDefined();
  expect(state.units[defender.id]).toBeDefined();
});
```

Add equivalent nearest-domain tests:

- `tests/systems/barbarian-system.test.ts`: barbarian Warrior two hexes away must not produce an attack order.
- `tests/systems/minor-civ-system.test.ts`: minor-civ Warrior two hexes away must not resolve a scuffle/combat.

- [ ] **Step 2: Run parity tests to expose current behavior**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai.test.ts tests/systems/barbarian-system.test.ts tests/systems/minor-civ-system.test.ts
```

Expected: At least one new test fails if a non-player path still derives attacks from movement range or loose proximity.

- [ ] **Step 3: Wire non-player paths through `canUnitAttackTarget`**

In each non-player attack selection path, import:

```ts
import { canUnitAttackTarget } from '@/systems/attack-targeting';
```

Use this predicate before resolving combat:

```ts
const legality = canUnitAttackTarget(newState, attacker, defender.position, { requireVisibility: false });
if (!legality.ok || legality.targetType !== 'unit') {
  continue;
}
```

For barbarian system functions that return attack orders without full `GameState`, use the helper only after constructing enough state context. If the existing function cannot receive `GameState` without broad churn, add a narrow helper to `src/systems/attack-targeting.ts`:

```ts
export function canAttackByProfileOnMap(attacker: Unit, target: Unit, map: GameMap): boolean {
  const profile = getUnitAttackProfile(attacker.type);
  const range = map.wrapsHorizontally
    ? wrappedHexDistance(attacker.position, target.position, map.width)
    : hexDistance(attacker.position, target.position);
  return UNIT_DEFINITIONS[attacker.type].strength > 0
    && profile.targets.includes('unit')
    && range > 0
    && range <= profile.range;
}
```

- [ ] **Step 4: Run parity tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai.test.ts tests/systems/barbarian-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/attack-targeting.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/ai/basic-ai.ts src/core/turn-manager.ts src/systems/minor-civ-system.ts src/systems/attack-targeting.ts tests/ai/basic-ai.test.ts tests/systems/barbarian-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/attack-targeting.test.ts
git commit -m "fix(combat): enforce melee range for non-player attacks"
```

## Task 4: Viewer-Scoped Last-Seen Presentation Model

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/last-seen-presentation.ts`
- Create: `tests/systems/last-seen-presentation.test.ts`
- Modify: `src/systems/fog-of-war.ts`
- Modify: `src/systems/unit-movement-system.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/core/turn-manager.ts`

- [ ] **Step 1: Write failing last-seen tests**

Create `tests/systems/last-seen-presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createLastSeenTilePresentation, refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';

describe('last-seen-presentation', () => {
  it('captures serializable tile presentation for visible tiles', () => {
    const state = createNewGame(undefined, 'last-seen-visible', 'small');
    const tile = state.map.tiles['0,0'];
    tile.terrain = 'forest';
    tile.resource = 'deer';
    tile.owner = 'player';
    tile.improvement = 'camp' as any;
    tile.improvementTurnsLeft = 0;

    const snapshot = createLastSeenTilePresentation(state, 'player', tile);

    expect(snapshot).toMatchObject({
      coord: tile.coord,
      terrain: 'forest',
      elevation: tile.elevation,
      resource: 'deer',
      owner: 'player',
      improvement: 'camp',
      improvementTurnsLeft: 0,
      hasRiver: tile.hasRiver,
      wonder: tile.wonder,
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('updates only currently visible tiles for the viewer', () => {
    const state = createNewGame(undefined, 'last-seen-refresh', 'small');
    state.civilizations.player.visibility.tiles = { '0,0': 'visible', '1,0': 'fog' };
    state.map.tiles['0,0'].terrain = 'forest';
    state.map.tiles['1,0'].terrain = 'desert';

    refreshLastSeenPresentationsForCiv(state, 'player');

    expect(state.civilizations.player.visibility.lastSeen?.['0,0']?.terrain).toBe('forest');
    expect(state.civilizations.player.visibility.lastSeen?.['1,0']).toBeUndefined();
  });

  it('keeps hot-seat viewers separate', () => {
    const state = createNewGame(undefined, 'last-seen-hotseat', 'small');
    state.civilizations.player.visibility.tiles = { '0,0': 'visible' };
    state.civilizations['ai-1'].visibility.tiles = { '0,0': 'fog' };

    refreshLastSeenPresentationsForCiv(state, 'player');

    expect(state.civilizations.player.visibility.lastSeen?.['0,0']).toBeDefined();
    expect(state.civilizations['ai-1'].visibility.lastSeen?.['0,0']).toBeUndefined();
  });

  it('does not update fogged city presentation from live city changes', () => {
    const state = createNewGame(undefined, 'last-seen-city', 'small');
    state.cities.enemyCity = { id: 'enemyCity', name: 'Old City', owner: 'ai-1', position: { q: 0, r: 0 }, population: 2, buildings: [], productionQueue: ['warrior'], productionProgress: 0, food: 0, foodNeeded: 10, workedTiles: [], ownedTiles: [{ q: 0, r: 0 }], focus: 'balanced', maturity: 'outpost', grid: [], gridSize: 3, unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0 } as any;
    state.civilizations.player.visibility.tiles = { '0,0': 'visible' };
    refreshLastSeenPresentationsForCiv(state, 'player');

    state.civilizations.player.visibility.tiles = { '0,0': 'fog' };
    state.cities.enemyCity = { ...state.cities.enemyCity, name: 'Live City', owner: 'player', population: 9 };
    refreshLastSeenPresentationsForCiv(state, 'player');

    expect(state.civilizations.player.visibility.lastSeen?.['0,0']?.city).toEqual({
      id: 'enemyCity',
      name: 'Old City',
      owner: 'ai-1',
      population: 2,
    });
  });
});
```

- [ ] **Step 2: Run last-seen tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/last-seen-presentation.test.ts
```

Expected: FAIL because `src/systems/last-seen-presentation.ts` does not exist.

- [ ] **Step 3: Add serializable visibility snapshot types**

Modify `src/core/types.ts`:

```ts
export interface LastSeenCityPresentation {
  id: string;
  name: string;
  owner: string;
  population: number;
}

export interface LastSeenTilePresentation {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: Elevation;
  resource: string | null;
  improvement: ImprovementType;
  improvementTurnsLeft: number;
  owner: string | null;
  hasRiver: boolean;
  wonder: string | null;
  city?: LastSeenCityPresentation;
}

export interface VisibilityMap {
  tiles: Record<string, VisibilityState>;
  lastSeen?: Record<string, LastSeenTilePresentation>;
}
```

- [ ] **Step 4: Implement last-seen system helper**

Create `src/systems/last-seen-presentation.ts`:

```ts
import type { GameState, HexTile, LastSeenTilePresentation } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';

export function createLastSeenTilePresentation(
  state: GameState,
  viewerId: string,
  tile: HexTile,
): LastSeenTilePresentation {
  const tileKey = hexKey(tile.coord);
  const city = Object.values(state.cities).find(candidate => hexKey(candidate.position) === tileKey);
  return {
    coord: { ...tile.coord },
    terrain: tile.terrain,
    elevation: tile.elevation,
    resource: tile.resource,
    improvement: tile.improvement,
    improvementTurnsLeft: tile.improvementTurnsLeft,
    owner: tile.owner,
    hasRiver: tile.hasRiver,
    wonder: tile.wonder,
    city: city
      ? { id: city.id, name: city.name, owner: city.owner, population: city.population }
      : undefined,
  };
}

export function refreshLastSeenPresentationsForCiv(state: GameState, viewerId: string): void {
  const civ = state.civilizations[viewerId];
  if (!civ?.visibility) return;

  civ.visibility.lastSeen ??= {};
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    if (getVisibility(civ.visibility, tile.coord) !== 'visible') continue;
    civ.visibility.lastSeen[key] = createLastSeenTilePresentation(state, viewerId, tile);
  }
}
```

- [ ] **Step 5: Refresh snapshots after movement visibility updates**

Modify `src/systems/unit-movement-system.ts`:

```ts
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
```

After the `updateVisibility(...)` call:

```ts
  refreshLastSeenPresentationsForCiv(state, options.civId);
```

Also call `refreshLastSeenPresentationsForCiv` after any other direct visibility-update call discovered by:

```bash
rg -n "updateVisibility\\(" src
```

For each found call, add a matching targeted test in that file's mirrored test when the call affects player-visible map rendering.

At minimum, wire these existing call sites:

- `src/core/game-state.ts`: after initial `updateVisibility(...)` calls in `createNewGame` and hot-seat setup so turn 1 visible tiles have last-seen snapshots before the first movement.
- `src/core/turn-manager.ts`: after each civilization visibility refresh and after shared minor-civ vision updates so end-turn visibility changes do not leave stale snapshots missing.
- `src/main.ts`: after manual visibility refreshes around turn/startup UI flows, if those calls still exist after the system-level wiring.

- [ ] **Step 6: Run last-seen tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/last-seen-presentation.test.ts tests/systems/unit-movement-system.test.ts tests/systems/fog-of-war.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add src/core/types.ts src/core/game-state.ts src/core/turn-manager.ts src/systems/last-seen-presentation.ts src/systems/unit-movement-system.ts src/systems/fog-of-war.ts tests/systems/last-seen-presentation.test.ts tests/systems/unit-movement-system.test.ts tests/systems/fog-of-war.test.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(visibility): track viewer last-seen tiles"
```

## Task 5: Render Fogged Tiles From Last-Seen Presentation

**Files:**
- Create: `src/renderer/tile-presentation.ts`
- Create: `tests/renderer/tile-presentation.test.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `tests/renderer/city-renderer.test.ts`
- Modify: `src/renderer/fog-renderer.ts`
- Modify: `tests/renderer/fog-renderer.test.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/renderer/render-visibility.ts`

- [ ] **Step 1: Write failing tile presentation tests**

Create `tests/renderer/tile-presentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameMap, VisibilityMap } from '@/core/types';
import { resolveTilePresentationForViewer } from '@/renderer/tile-presentation';

const liveTile = {
  coord: { q: 0, r: 0 },
  terrain: 'forest',
  elevation: 'lowland',
  resource: 'deer',
  improvement: 'none',
  owner: 'ai-1',
  improvementTurnsLeft: 0,
  hasRiver: false,
  wonder: null,
} as const;

const map = { width: 4, height: 3, wrapsHorizontally: true, tiles: { '0,0': liveTile }, rivers: [] } as unknown as GameMap;

describe('tile-presentation', () => {
  it('returns live tile presentation for visible tiles', () => {
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 0, r: 0 })).toMatchObject({
      kind: 'live',
      tile: liveTile,
    });
  });

  it('returns last-seen presentation for fogged tiles', () => {
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'farm',
          improvementTurnsLeft: 0,
          owner: 'player',
          hasRiver: true,
          wonder: null,
        },
      },
    };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 0, r: 0 })).toMatchObject({
      kind: 'last-seen',
      tile: expect.objectContaining({ terrain: 'plains', owner: 'player', improvement: 'farm' }),
    });
  });

  it('returns unknown fog when an old save has no last-seen snapshot', () => {
    const visibility: VisibilityMap = { tiles: { '0,0': 'fog' } };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 0, r: 0 })).toMatchObject({
      kind: 'unknown-fog',
      tile: expect.objectContaining({ terrain: 'grassland', owner: null, resource: null }),
    });
  });

  it('canonicalizes wrapped render coordinates before visibility lookup', () => {
    const visibility: VisibilityMap = { tiles: { '0,0': 'fog' }, lastSeen: { '0,0': { coord: { q: 0, r: 0 }, terrain: 'desert', elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0, owner: null, hasRiver: false, wonder: null } } };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 4, r: 0 })).toMatchObject({
      kind: 'last-seen',
      tile: expect.objectContaining({ terrain: 'desert' }),
    });
  });
});
```

- [ ] **Step 2: Run failing tile presentation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/tile-presentation.test.ts
```

Expected: FAIL because `src/renderer/tile-presentation.ts` does not exist.

- [ ] **Step 3: Implement tile presentation resolver**

Create `src/renderer/tile-presentation.ts`:

```ts
import type { GameMap, HexCoord, HexTile, LastSeenTilePresentation, VisibilityMap } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, wrapHexCoord } from '@/systems/hex-utils';

export type TilePresentationKind = 'live' | 'last-seen' | 'unknown-fog' | 'unexplored';

export interface TilePresentation {
  kind: TilePresentationKind;
  tile: HexTile;
}

function unknownTile(coord: HexCoord): HexTile {
  return {
    coord,
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function lastSeenToTile(snapshot: LastSeenTilePresentation): HexTile {
  return {
    coord: { ...snapshot.coord },
    terrain: snapshot.terrain,
    elevation: snapshot.elevation,
    resource: snapshot.resource,
    improvement: snapshot.improvement,
    owner: snapshot.owner,
    improvementTurnsLeft: snapshot.improvementTurnsLeft,
    hasRiver: snapshot.hasRiver,
    wonder: snapshot.wonder,
  };
}

export function resolveTilePresentationForViewer(
  map: GameMap,
  visibility: VisibilityMap | undefined,
  renderCoord: HexCoord,
): TilePresentation {
  const coord = map.wrapsHorizontally ? wrapHexCoord(renderCoord, map.width) : renderCoord;
  const key = hexKey(coord);
  const liveTile = map.tiles[key] ?? unknownTile(coord);
  const state = visibility ? getVisibility(visibility, coord) : 'visible';

  if (state === 'visible') return { kind: 'live', tile: liveTile };
  if (state === 'unexplored') return { kind: 'unexplored', tile: unknownTile(coord) };

  const snapshot = visibility?.lastSeen?.[key];
  if (snapshot) return { kind: 'last-seen', tile: lastSeenToTile(snapshot) };
  return { kind: 'unknown-fog', tile: unknownTile(coord) };
}
```

- [ ] **Step 4: Wire `hex-renderer` through tile presentation**

Modify `src/renderer/hex-renderer.ts` imports:

```ts
import { resolveTilePresentationForViewer } from './tile-presentation';
```

In `drawHexMap`, before drawing:

```ts
      const presentation = resolveTilePresentationForViewer(map, viewerVisibility, renderCoord);
      drawTileAtScreen(ctx, screen, scaledSize, presentation.tile, isVillage && presentation.kind === 'live', currentPlayer, viewerVisibility, camera.zoom);
```

Remove the old direct `drawTileAtScreen(..., tile, ...)` call. Do not draw village markers for `last-seen`, `unknown-fog`, or `unexplored` unless a later spec adds village memory.

- [ ] **Step 5: Hide live rivers and territory where tile presentation is hidden**

Modify `src/renderer/hex-renderer.ts` so river and minor-civ territory rendering cannot bypass the same visibility decision as base tiles.

Change `drawRivers` signature:

```ts
export function drawRivers(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  viewerVisibility?: VisibilityMap,
): void {
```

Before drawing each river segment, require at least one endpoint to have a visible or last-seen presentation:

```ts
function canRenderRiverEndpoint(map: GameMap, visibility: VisibilityMap | undefined, coord: HexCoord): boolean {
  const presentation = resolveTilePresentationForViewer(map, visibility, coord);
  return presentation.kind === 'live' || presentation.kind === 'last-seen';
}
```

Use this guard for live river segments and wrap ghost river segments:

```ts
if (
  !canRenderRiverEndpoint(map, viewerVisibility, river.from)
  && !canRenderRiverEndpoint(map, viewerVisibility, river.to)
) {
  continue;
}
```

Update the `drawRivers(...)` call in `src/renderer/render-loop.ts`:

```ts
drawRivers(this.ctx, this.state.map, this.camera, viewerVisibility);
```

Modify `src/renderer/render-visibility.ts` so last-seen owner borders can render without live foreign ownership leaks:

```ts
export function shouldRenderOwnedTileBorderForPresentation(
  presentationKind: 'live' | 'last-seen' | 'unknown-fog' | 'unexplored',
  viewerCivId: string | undefined,
  ownerId: string | null | undefined,
): boolean {
  if (!viewerCivId || !ownerId) return false;
  if (presentationKind === 'unexplored' || presentationKind === 'unknown-fog') return false;
  if (ownerId === viewerCivId) return true;
  return presentationKind === 'live' || presentationKind === 'last-seen';
}
```

Use this helper from `drawHexMap` when drawing the tile presentation. Do not call `shouldRenderOwnedTileBorder` with live visibility state for a last-seen tile, because that hides stale foreign borders and tempts later code to read live ownership.

- [ ] **Step 6: Render fogged cities from last-seen city presentation**

Append to `tests/renderer/city-renderer.test.ts`:

```ts
it('renders fogged cities from last-seen presentation without live production or unrest badges', () => {
  const state = createNewGame(undefined, 'city-last-seen-render', 'small');
  state.cities.enemyCity = { id: 'enemyCity', name: 'Live City', owner: 'player', position: { q: 0, r: 0 }, population: 9, buildings: [], productionQueue: ['warrior'], productionProgress: 0, food: 0, foodNeeded: 10, workedTiles: [], ownedTiles: [{ q: 0, r: 0 }], focus: 'balanced', maturity: 'outpost', grid: [], gridSize: 3, unrestLevel: 2, unrestTurns: 3, spyUnrestBonus: 0 } as any;
  state.civilizations.player.visibility = {
    tiles: { '0,0': 'fog' },
    lastSeen: {
      '0,0': {
        coord: { q: 0, r: 0 },
        terrain: 'plains',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
        owner: 'ai-1',
        hasRiver: false,
        wonder: null,
        city: { id: 'enemyCity', name: 'Old City', owner: 'ai-1', population: 2 },
      },
    },
  };
  const ctx = createContext();
  const camera = createCamera();

  drawCities(ctx, state, camera, 'player');

  expect(ctx.fillText).toHaveBeenCalledWith('Old City (2)', expect.any(Number), expect.any(Number));
  expect(ctx.fillText).not.toHaveBeenCalledWith('Live City (9)', expect.any(Number), expect.any(Number));
});
```

Modify `src/renderer/city-renderer.ts` by importing `getVisibility` and adding a viewer-facing city projection:

```ts
import { getVisibility, isVisible } from '@/systems/fog-of-war';
```

```ts
interface CityRenderProjection {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  isLive: boolean;
}

function getCityRenderProjection(state: GameState, playerCivId: string): CityRenderProjection[] {
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return [];

  const liveCities = Object.values(state.cities)
    .filter(city => getVisibility(vis, city.position) === 'visible')
    .map(city => ({ name: city.name, position: city.position, population: city.population, owner: city.owner, isLive: true }));

  const staleCities = Object.values(vis.lastSeen ?? {})
    .filter(snapshot => getVisibility(vis, snapshot.coord) === 'fog' && snapshot.city)
    .map(snapshot => ({
      name: snapshot.city!.name,
      position: snapshot.coord,
      population: snapshot.city!.population,
      owner: snapshot.city!.owner,
      isLive: false,
    }));

  return [...liveCities, ...staleCities];
}
```

Change `drawCities` to iterate over `getCityRenderProjection(...)`. Only live projections may draw production badges, unrest, occupation, breakaway, idle production, or minor-civ archetype details. Stale projections draw the generic city icon, stale owner color when available, and stale `Name (population)` only.

- [ ] **Step 7: Add fog-renderer canonical visibility regression**

Append to `tests/renderer/fog-renderer.test.ts`:

```ts
  it('uses canonical visibility for wrapped ghost overlays', () => {
    const map = createWrappedMap(5, 3);
    const visibility = createVisibility(map);
    visibility.tiles['0,1'] = 'visible';
    const ctx = createContext();
    const camera = new Camera();
    camera.setViewport(320, 240);
    camera.centerOn({ q: 5, r: 1 });

    drawFogOfWar(ctx, visibility, map.width, map.height, camera, map.wrapsHorizontally);

    const fillCount = (ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(fillCount).toBeLessThan(map.width * map.height + 5);
  });
```

- [ ] **Step 8: Run renderer visibility tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/tile-presentation.test.ts tests/renderer/fog-renderer.test.ts tests/renderer/hex-renderer.test.ts tests/renderer/city-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

Run:

```bash
git add src/renderer/tile-presentation.ts src/renderer/hex-renderer.ts src/renderer/city-renderer.ts src/renderer/fog-renderer.ts src/renderer/render-loop.ts src/renderer/render-visibility.ts tests/renderer/tile-presentation.test.ts tests/renderer/fog-renderer.test.ts tests/renderer/hex-renderer.test.ts tests/renderer/city-renderer.test.ts
git commit -m "fix(renderer): render fog from last-seen state"
```

## Task 6: Unit Visual Resolver And Role Markers

**Files:**
- Create: `src/renderer/unit-visual-resolver.ts`
- Create: `tests/renderer/unit-visual-resolver.test.ts`
- Modify: `src/renderer/unit-renderer.ts`
- Modify: `tests/renderer/unit-renderer.test.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write failing unit visual resolver tests**

Create `tests/renderer/unit-visual-resolver.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { resolveUnitVisual } from '@/renderer/unit-visual-resolver';

describe('unit-visual-resolver', () => {
  it('omits role marker for major civ units', () => {
    const state = createNewGame(undefined, 'major-visual', 'small');
    const unit = { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'warrior' };

    expect(resolveUnitVisual(state, unit, { player: '#4a90d9' })).toMatchObject({
      role: 'major',
      roleMarker: null,
      color: '#4a90d9',
    });
  });

  it('uses hostile chevron marker for barbarian units', () => {
    const state = createNewGame(undefined, 'barbarian-visual', 'small');
    const unit = { ...createUnit('warrior', 'barbarian', { q: 0, r: 0 }), id: 'barb' };

    expect(resolveUnitVisual(state, unit, { barbarian: '#8b4513' })).toMatchObject({
      role: 'barbarian',
      roleMarker: 'chevron',
      color: '#8b4513',
    });
  });

  it('uses city-state diamond marker for minor-civ units', () => {
    const state = createNewGame(undefined, 'minor-visual', 'small');
    state.minorCivs['mc-warriors'] = { id: 'mc-warriors', definitionId: 'warriors', cityId: 'city-1', units: [], diplomacy: {} as any, activeQuests: {}, isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1 };
    const unit = { ...createUnit('warrior', 'mc-warriors', { q: 0, r: 0 }), id: 'mc-unit' };

    expect(resolveUnitVisual(state, unit, { 'mc-warriors': '#8a6f2a' })).toMatchObject({
      role: 'minor',
      roleMarker: 'diamond',
      color: '#8a6f2a',
    });
  });
});
```

- [ ] **Step 2: Run failing resolver tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/unit-visual-resolver.test.ts
```

Expected: FAIL because `src/renderer/unit-visual-resolver.ts` does not exist.

- [ ] **Step 3: Implement unit visual resolver**

Create `src/renderer/unit-visual-resolver.ts`:

```ts
import type { GameState, Unit } from '@/core/types';

export type UnitOwnerRole = 'major' | 'minor' | 'barbarian';
export type UnitRoleMarker = 'chevron' | 'diamond' | null;
export type UnitMotionState = 'idle' | 'move-a' | 'move-b';

const FALLBACK_ICONS: Record<string, string> = {
  settler: '🏕️',
  worker: '👷',
  scout: '🔭',
  warrior: '⚔️',
  archer: '🏹',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  galley: '⛵',
  trireme: '🚢',
  spy_scout: '🕵️',
  spy_informant: '🕵️',
  spy_agent: '🕵️',
  spy_operative: '🕵️',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '🦅',
  war_hound: '🐺',
};

export interface UnitVisual {
  role: UnitOwnerRole;
  roleMarker: UnitRoleMarker;
  color: string;
  fallbackIcon: string;
  spriteOwnerId: string;
  motion: UnitMotionState;
}

function getRole(unit: Unit): UnitOwnerRole {
  if (unit.owner === 'barbarian') return 'barbarian';
  if (unit.owner.startsWith('mc-')) return 'minor';
  return 'major';
}

export function resolveUnitVisual(
  state: GameState,
  unit: Unit,
  colorLookup: Record<string, string> = {},
  motion: UnitMotionState = 'idle',
): UnitVisual {
  const role = getRole(unit);
  const color = colorLookup[unit.owner]
    ?? state.civilizations[unit.owner]?.color
    ?? (role === 'barbarian' ? '#8b4513' : '#888');
  return {
    role,
    roleMarker: role === 'barbarian' ? 'chevron' : role === 'minor' ? 'diamond' : null,
    color,
    fallbackIcon: FALLBACK_ICONS[unit.type] ?? '?',
    spriteOwnerId: unit.owner,
    motion,
  };
}
```

- [ ] **Step 4: Draw role markers in `unit-renderer`**

In `src/renderer/unit-renderer.ts`, import resolver:

```ts
import { resolveUnitVisual, type UnitRoleMarker } from './unit-visual-resolver';
```

Add helper:

```ts
function drawRoleMarker(
  ctx: CanvasRenderingContext2D,
  marker: UnitRoleMarker,
  x: number,
  y: number,
  size: number,
): void {
  if (!marker) return;
  const markerX = x + size * 0.28;
  const markerY = y - size * 0.3;
  ctx.beginPath();
  if (marker === 'chevron') {
    ctx.moveTo(markerX - size * 0.1, markerY - size * 0.06);
    ctx.lineTo(markerX, markerY + size * 0.08);
    ctx.lineTo(markerX + size * 0.1, markerY - size * 0.06);
  } else {
    ctx.moveTo(markerX, markerY - size * 0.11);
    ctx.lineTo(markerX + size * 0.11, markerY);
    ctx.lineTo(markerX, markerY + size * 0.11);
    ctx.lineTo(markerX - size * 0.11, markerY);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.72)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.stroke();
}
```

Inside the unit loop, replace `ownerColor` and `UNIT_ICONS` reads with:

```ts
        const visual = resolveUnitVisual(state, unit, colorLookup);
        const ownerColor = visual.color;
```

After drawing sprite or fallback icon, call:

```ts
        drawRoleMarker(ctx, visual.roleMarker, unitX, unitY, size);
```

Extract the body that draws one unit glyph into an exported helper so stationary units and movement animation share the same owner color, fallback icon, health bar, stack badge, and role marker rules:

```ts
export interface UnitGlyphDrawOptions {
  stackSize: number;
  stackIndex: number;
  motion?: UnitMotionState;
  spriteOverride?: HTMLImageElement | null;
}

export function drawUnitGlyph(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  unit: Unit,
  x: number,
  y: number,
  size: number,
  colorLookup: Record<string, string> | undefined,
  options: UnitGlyphDrawOptions,
): void {
  const visual = resolveUnitVisual(state, unit, colorLookup, options.motion ?? 'idle');
  const ownerColor = visual.color;
  const sprite = options.spriteOverride ?? spriteCache.getUnit(unit.type, visual.spriteOwnerId);
  // The existing sprite, fallback icon, health bar, and fortify badge branches move into this helper.
  // Replace direct `UNIT_ICONS` reads with `visual.fallbackIcon`.
  drawRoleMarker(ctx, visual.roleMarker, x, y, size);
}
```

Update the stack loop to call `drawUnitGlyph(...)` instead of duplicating drawing logic inline.

- [ ] **Step 5: Add marker renderer tests**

Append to `tests/renderer/unit-renderer.test.ts`:

```ts
describe('unit role markers', () => {
  it('draws a chevron marker for barbarian units', () => {
    const ctx = createContext();
    const units = {
      barb: { id: 'barb', owner: 'barbarian', type: 'warrior', position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false },
    } as any;
    const state = { map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] } } as GameState;
    const camera = { zoom: 0.2, hexSize: 48, isHexVisible: () => true, worldToScreen: (x: number, y: number) => ({ x, y }) } as Camera;

    drawUnits(ctx, units, camera, { tiles: { '0,0': 'visible' } }, state, 'player', { barbarian: '#8b4513' });

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('draws a diamond marker for minor-civ units', () => {
    const ctx = createContext();
    const units = {
      minor: { id: 'minor', owner: 'mc-warriors', type: 'warrior', position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false },
    } as any;
    const state = { map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] } } as GameState;
    const camera = { zoom: 0.2, hexSize: 48, isHexVisible: () => true, worldToScreen: (x: number, y: number) => ({ x, y }) } as Camera;

    drawUnits(ctx, units, camera, { tiles: { '0,0': 'visible' } }, state, 'player', { 'mc-warriors': '#8a6f2a' });

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });
});
```

Update `createContext()` in that test to include `moveTo`, `lineTo`, and `closePath` spies.

- [ ] **Step 6: Preload barbarian and active minor-civ sprite palettes**

In `src/main.ts`, find the `initSprites(civColors)` call in `startGame`. Build a palette map that includes major civs, the barbarian owner, and every active minor civ before passing it to `initSprites`:

```ts
  const spriteColors: Record<string, string> = {
    ...civColors,
    barbarian: '#8b4513',
  };
  for (const mc of Object.values(gameState.minorCivs ?? {})) {
    const def = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === mc.definitionId);
    if (def) spriteColors[mc.id] = def.color;
  }
  await initSprites(spriteColors);
```

Remove the older direct `await initSprites(civColors)` call. This does not reveal hidden minor-civ identities by itself; it only prepares sprite images for owners already present in state, and map rendering still gates visibility through `VisibilityMap`.

- [ ] **Step 7: Run visual resolver and renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/unit-visual-resolver.test.ts tests/renderer/unit-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

Run:

```bash
git add src/renderer/unit-visual-resolver.ts src/renderer/unit-renderer.ts src/main.ts tests/renderer/unit-visual-resolver.test.ts tests/renderer/unit-renderer.test.ts
git commit -m "feat(renderer): add unit role markers"
```

## Task 7: Full Per-Sprite Moving Frames

**Files:**
- Modify: `src/renderer/sprites/units.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/renderer/sprites/sprite-loader.ts`
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/renderer/sprites/sprite-loader.test.ts`

- [ ] **Step 1: Add failing moving output catalog tests**

Append to `tests/renderer/sprites/sprite-catalog.test.ts`:

```ts
import { derivePalette } from '@/renderer/sprites/sprite-system';

it('every unit sprite returns distinct moving output', () => {
  const palette = derivePalette('#4a90d9');
  for (const [type, render] of Object.entries(UNIT_SPRITE_CATALOG)) {
    const idle = render({ palette, svgOnly: true, motion: 'idle' });
    const movingA = render({ palette, svgOnly: true, motion: 'move-a' });
    const movingB = render({ palette, svgOnly: true, motion: 'move-b' });
    expect(idle, `${type} idle sprite`).toContain('data-motion="idle"');
    expect(movingA, `${type} move-a sprite`).toContain('data-motion="move-a"');
    expect(movingB, `${type} move-b sprite`).toContain('data-motion="move-b"');
    expect(movingA, `${type} move-a differs from idle`).not.toBe(idle);
    expect(movingB, `${type} move-b differs from move-a`).not.toBe(movingA);
  }
});
```

- [ ] **Step 2: Run failing sprite catalog test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts
```

Expected: FAIL because `UnitSpriteProps` has no `motion` field and sprites do not emit `data-motion`.

- [ ] **Step 3: Add motion prop and helper transforms**

Modify `src/renderer/sprites/units.tsx`:

```ts
export type UnitSpriteMotion = 'idle' | 'move-a' | 'move-b';
export type UnitSpriteProps = { palette: FactionPalette; svgOnly?: boolean; motion?: UnitSpriteMotion };

function motionData(motion: UnitSpriteMotion = 'idle'): { attr: UnitSpriteMotion; humanoid: string; animal: string; naval: string } {
  if (motion === 'move-a') {
    return {
      attr: motion,
      humanoid: 'translate(0 -2) rotate(-2 64 70)',
      animal: 'translate(-3 -2) rotate(-2 64 70)',
      naval: 'translate(-2 1) rotate(-1 64 82)',
    };
  }
  if (motion === 'move-b') {
    return {
      attr: motion,
      humanoid: 'translate(0 1) rotate(2 64 70)',
      animal: 'translate(3 1) rotate(2 64 70)',
      naval: 'translate(2 -1) rotate(1 64 82)',
    };
  }
  return { attr: 'idle', humanoid: '', animal: '', naval: '' };
}
```

For each sprite, accept `motion = 'idle'`, compute `const m = motionData(motion);`, and put all visible moving parts inside a `<g data-motion={m.attr} transform={m.humanoid}>`, `<g data-motion={m.attr} transform={m.animal}>`, or `<g data-motion={m.attr} transform={m.naval}>`.

Example for Warrior:

```tsx
export function WarriorSprite({ palette, svgOnly = false, motion = 'idle' }: UnitSpriteProps): string {
  const m = motionData(motion);
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-motion={m.attr} transform={m.humanoid}>
        <Shadow />
        <Humanoid cx={64} cy={70} scale={1} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} hair="#3a2a1a" />
        <g transform="translate(42 64)">
          <circle r="14" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
          <circle r="14" fill={palette.mid} opacity="0.85" />
          <circle r="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <path d="M-12,0 L12,0 M0,-12 L0,12" stroke={palette.dark} strokeWidth="1.2" />
        </g>
        <g transform="translate(86 38) rotate(15)">
          <rect x="-1.2" y="0" width="2.4" height="42" fill={P.wood.dark} />
          <path d="M-7,-6 L7,-6 L9,6 L-9,6 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <path d="M-7,-6 L7,-6 L7,-2 L-7,-2 Z" fill={P.metal.shine} opacity="0.5" />
        </g>
      </g>
    </SpriteFrame>
  );
}
```

Apply this pattern to every current unit sprite. Use `humanoid` for Settler, Worker, Scout, Shadow Warden, Warrior, Swordsman, Pikeman, Archer, Musketeer, and all spy sprites. Use `animal` for Scout Hound and War Hound. Use `naval` for Galley and Trireme.

- [ ] **Step 4: Load motion frames in sprite cache**

Modify `src/renderer/sprites/sprite-loader.ts`:

```ts
import type { UnitSpriteMotion } from './units';

const UNIT_MOTIONS: UnitSpriteMotion[] = ['idle', 'move-a', 'move-b'];
```

Inside `loadCiv`, replace unit loading with:

```ts
    const unitWork = Object.entries(UNIT_SPRITE_CATALOG).flatMap(([type, fn]) =>
      UNIT_MOTIONS.map(async (motion) => {
        const svg = fn({ palette, svgOnly: true, motion });
        if (!svg) return;
        const img = await svgStringToImage(svg, UNIT_SPRITE_SIZE);
        this.units.set(`${type}:${civId}:${motion}`, img);
        if (motion === 'idle') {
          this.units.set(`${type}:${civId}`, img);
        }
      }),
    );
```

Add:

```ts
  getUnitMotion(type: UnitType, civId: string, motion: UnitSpriteMotion): HTMLImageElement | null {
    return this.units.get(`${type}:${civId}:${motion}`) ?? null;
  }
```

- [ ] **Step 5: Add sprite loader motion tests**

Append to `tests/renderer/sprites/sprite-loader.test.ts`:

```ts
  it('getUnitMotion returns moving frames for a loaded civ', () => {
    expect(spriteCache.getUnitMotion('warrior', 'player', 'move-a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnitMotion('warrior', 'player', 'move-b')).toBeInstanceOf(HTMLImageElement);
  });

  it('getUnitMotion returns null for an uncached civ', () => {
    expect(spriteCache.getUnitMotion('warrior', 'uncached-civ', 'move-a')).toBeNull();
  });
```

- [ ] **Step 6: Run sprite tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-loader.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

Run:

```bash
git add src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/sprites/sprite-loader.ts tests/renderer/sprites/sprite-catalog.test.ts tests/renderer/sprites/sprite-loader.test.ts
git commit -m "feat(sprites): add moving unit frames"
```

## Task 8: Movement Animation, Wrapped Route, Stack Coherency, And Command Lockout

**Files:**
- Create: `src/renderer/unit-movement-animation.ts`
- Create: `tests/renderer/unit-movement-animation.test.ts`
- Modify: `src/renderer/animation-system.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/renderer/unit-renderer.ts`
- Modify: `src/main.ts`
- Modify: `tests/renderer/render-loop-wrap.test.ts`
- Modify: `tests/renderer/unit-renderer.test.ts`

- [ ] **Step 1: Write failing movement animation tests**

Create `tests/renderer/unit-movement-animation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameMap, Unit } from '@/core/types';
import { createMovementAnimation, getMovementAnimationPosition, getMovementDurationMs, getMovingUnitIds } from '@/renderer/unit-movement-animation';
import { createUnit } from '@/systems/unit-system';

const map = { width: 6, height: 4, wrapsHorizontally: true, tiles: {}, rivers: [] } as GameMap;

function unit(id: string): Unit {
  return { ...createUnit('warrior', 'player', { q: 0, r: 1 }), id };
}

describe('unit-movement-animation', () => {
  it('uses a short wrapped route across the horizontal edge', () => {
    const animation = createMovementAnimation(unit('u1'), { q: 0, r: 1 }, { q: 5, r: 1 }, map);

    expect(animation.renderFrom.q).toBe(0);
    expect(animation.renderTo.q).toBe(-1);
  });

  it('clamps normal movement duration to a responsive range', () => {
    expect(getMovementDurationMs([{ q: 0, r: 0 }, { q: 1, r: 0 }])).toBe(250);
    expect(getMovementDurationMs([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }])).toBeLessThanOrEqual(600);
  });

  it('interpolates position and alternates moving frames', () => {
    const animation = createMovementAnimation(unit('u1'), { q: 0, r: 1 }, { q: 1, r: 1 }, map);
    const halfway = getMovementAnimationPosition(animation, 0.5);

    expect(halfway.coord.q).toBeCloseTo(0.5);
    expect(halfway.motion).toBe('move-b');
  });

  it('tracks moving unit ids for stationary renderer hiding', () => {
    const animation = createMovementAnimation(unit('u1'), { q: 0, r: 1 }, { q: 1, r: 1 }, map);

    expect(getMovingUnitIds([animation])).toEqual(new Set(['u1']));
  });
});
```

- [ ] **Step 2: Run failing movement animation tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/unit-movement-animation.test.ts
```

Expected: FAIL because `src/renderer/unit-movement-animation.ts` does not exist.

- [ ] **Step 3: Implement movement animation helper**

Create `src/renderer/unit-movement-animation.ts`:

```ts
import type { GameMap, HexCoord, Unit } from '@/core/types';
import type { UnitMotionState } from '@/renderer/unit-visual-resolver';

export interface UnitMovementAnimation {
  unit: Unit;
  from: HexCoord;
  to: HexCoord;
  renderFrom: HexCoord;
  renderTo: HexCoord;
  duration: number;
}

export interface UnitMovementFrame {
  coord: HexCoord;
  motion: UnitMotionState;
}

export function getMovementDurationMs(path: HexCoord[]): number {
  const steps = Math.max(1, path.length - 1);
  return Math.min(600, 250 + Math.max(0, steps - 1) * 120);
}

function wrappedRenderDestination(from: HexCoord, to: HexCoord, map: GameMap): HexCoord {
  if (!map.wrapsHorizontally) return to;
  const directDelta = to.q - from.q;
  const westDelta = to.q - map.width - from.q;
  const eastDelta = to.q + map.width - from.q;
  const bestDelta = [directDelta, westDelta, eastDelta].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  return { q: from.q + bestDelta, r: to.r };
}

export function createMovementAnimation(unit: Unit, from: HexCoord, to: HexCoord, map: GameMap): UnitMovementAnimation {
  const renderTo = wrappedRenderDestination(from, to, map);
  return {
    unit,
    from,
    to,
    renderFrom: from,
    renderTo,
    duration: getMovementDurationMs([from, to]),
  };
}

export function getMovementAnimationPosition(animation: UnitMovementAnimation, progress: number): UnitMovementFrame {
  const clamped = Math.max(0, Math.min(1, progress));
  const motion: UnitMotionState = Math.floor(clamped * 6) % 2 === 0 ? 'move-a' : 'move-b';
  return {
    coord: {
      q: animation.renderFrom.q + (animation.renderTo.q - animation.renderFrom.q) * clamped,
      r: animation.renderFrom.r + (animation.renderTo.r - animation.renderFrom.r) * clamped,
    },
    motion,
  };
}

export function getMovingUnitIds(animations: UnitMovementAnimation[]): Set<string> {
  return new Set(animations.map(animation => animation.unit.id));
}
```

- [ ] **Step 4: Hide moving units from stationary `drawUnits`**

Modify `drawUnits` signature in `src/renderer/unit-renderer.ts`:

```ts
  colorLookup?: Record<string, string>,
  options: { hiddenUnitIds?: Set<string> } = {},
): void {
```

Update visible unit filter:

```ts
  const visibleUnits = Object.values(units).filter(unit =>
    !options.hiddenUnitIds?.has(unit.id)
    && isVisible(playerVisibility, unit.position)
    && !isForestConcealedUnit(state, currentPlayer, unit),
  );
```

- [ ] **Step 5: Add movement animation support to render loop**

Modify `src/renderer/render-loop.ts` to import helpers:

```ts
import type { VisibilityMap } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { createMovementAnimation, getMovementAnimationPosition, getMovingUnitIds, type UnitMovementAnimation } from './unit-movement-animation';
import { resolveUnitVisual } from './unit-visual-resolver';
import { drawUnitGlyph } from './unit-renderer';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
```

Add class field and methods:

```ts
  private unitMovementAnimations: Array<UnitMovementAnimation & { startTime: number; onComplete?: () => void }> = [];

  animateUnitMove(unit: Unit, from: HexCoord, to: HexCoord, onComplete?: () => void): void {
    if (!this.state) return;
    this.unitMovementAnimations.push({
      ...createMovementAnimation(unit, from, to, this.state.map),
      startTime: performance.now(),
      onComplete,
    });
  }

  hasMovingUnit(unitId: string): boolean {
    return this.unitMovementAnimations.some(animation => animation.unit.id === unitId);
  }
```

When calling `drawUnits`, pass hidden IDs:

```ts
      drawUnits(this.ctx, visibleUnits, this.camera, viewerVisibility, this.state, viewerId, colorLookup, {
        hiddenUnitIds: getMovingUnitIds(this.unitMovementAnimations),
      });
```

Add a private `drawUnitMovementAnimations(now: number)` method that:

- computes progress from `now - startTime`
- uses `getMovementAnimationPosition`
- draws sprite cache motion frame with `spriteCache.getUnitMotion(unit.type, visual.spriteOwnerId, frame.motion)`
- calls `drawUnitGlyph(...)` with `motion: frame.motion` and `spriteOverride` so fallback icon, health, owner color, and role marker stay identical to stationary rendering
- removes completed animations and calls `onComplete`

Use this implementation shape:

```ts
  private drawUnitMovementAnimations(now: number, colorLookup: Record<string, string>, viewerVisibility: VisibilityMap): void {
    if (!this.state) return;
    const remaining: typeof this.unitMovementAnimations = [];
    for (const animation of this.unitMovementAnimations) {
      const elapsed = now - animation.startTime;
      const progress = Math.min(1, elapsed / animation.duration);
      const frame = getMovementAnimationPosition(animation, progress);
      if (getVisibility(viewerVisibility, animation.to) === 'unexplored') {
        if (progress < 1) remaining.push(animation);
        continue;
      }
      const renderCoords = this.state.map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(frame.coord, this.state.map.width, this.camera)
        : [frame.coord];
      const visual = resolveUnitVisual(this.state, animation.unit, colorLookup, frame.motion);
      const sprite = this.camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD
        ? spriteCache.getUnitMotion(animation.unit.type, visual.spriteOwnerId, frame.motion)
        : null;
      for (const renderCoord of renderCoords) {
        if (!this.camera.isHexVisible(renderCoord)) continue;
        const pixel = hexToPixel(renderCoord, this.camera.hexSize);
        const screen = this.camera.worldToScreen(pixel.x, pixel.y);
        drawUnitGlyph(this.ctx, this.state, animation.unit, screen.x, screen.y, this.camera.hexSize * this.camera.zoom, colorLookup, {
          stackSize: 1,
          stackIndex: 0,
          motion: frame.motion,
          spriteOverride: sprite,
        });
      }
      if (progress < 1) {
        remaining.push(animation);
      } else {
        animation.onComplete?.();
      }
    }
    this.unitMovementAnimations = remaining;
  }
```

Call it after stationary units and before fog overlay:

```ts
    this.drawUnitMovementAnimations(performance.now());
```

- [ ] **Step 6: Wire movement animation and command lockout in `main.ts`**

Add helper near movement functions:

```ts
function isUnitAnimationLocked(unitId: string | null): boolean {
  return Boolean(unitId && renderLoop.hasMovingUnit(unitId));
}
```

At the start of `selectUnit`:

```ts
  if (renderLoop.hasMovingUnit(unitId)) {
    showNotification('Unit is moving.', 'info');
    return;
  }
```

In the tap handler, before acting on selected unit:

```ts
  if (isUnitAnimationLocked(selectedUnitId)) {
    showNotification('Unit is moving.', 'info');
    return;
  }
```

After `executeUnitMove(...)`, capture result:

```ts
      const moveResult = executeUnitMove(gameState, selectedUnitId, coord, {
        actor: 'player',
        civId: gameState.currentPlayer,
        bus,
      });
      const movedUnit = gameState.units[selectedUnitId];
      if (movedUnit) {
        renderLoop.animateUnitMove({ ...movedUnit, position: moveResult.from }, moveResult.from, moveResult.to, () => {
          renderLoop.setGameState(gameState);
          updateHUD();
        });
      }
```

Do the same in busy-worker confirmed moves and minor-civ city assault moves. Do not animate combat attacks in this task.

- [ ] **Step 7: Add renderer tests for hidden moving units**

Append to `tests/renderer/unit-renderer.test.ts`:

```ts
it('does not draw stationary copy for hidden moving unit ids', () => {
  const ctx = createContext();
  const units = {
    mover: { id: 'mover', owner: 'player', type: 'warrior', position: { q: 0, r: 0 }, movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false },
  } as any;
  const state = { map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] } } as GameState;
  const camera = { zoom: 0.2, hexSize: 48, isHexVisible: () => true, worldToScreen: (x: number, y: number) => ({ x, y }) } as Camera;

  drawUnits(ctx, units, camera, { tiles: { '0,0': 'visible' } }, state, 'player', { player: '#4a90d9' }, { hiddenUnitIds: new Set(['mover']) });

  expect(ctx.fillText).not.toHaveBeenCalledWith('⚔️', expect.any(Number), expect.any(Number));
});
```

- [ ] **Step 8: Run movement renderer tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/unit-movement-animation.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 8**

Run:

```bash
git add src/renderer/unit-movement-animation.ts src/renderer/animation-system.ts src/renderer/render-loop.ts src/renderer/unit-renderer.ts src/main.ts tests/renderer/unit-movement-animation.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
git commit -m "feat(renderer): animate unit movement"
```

## Task 9: Final Verification And Rule Checks

**Files:**
- Verify changed files from Tasks 1-8.

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh \
  src/core/types.ts \
  src/core/game-state.ts \
  src/core/turn-manager.ts \
  src/systems/unit-system.ts \
  src/systems/attack-targeting.ts \
  src/systems/last-seen-presentation.ts \
  src/systems/fog-of-war.ts \
  src/systems/unit-movement-system.ts \
  src/input/selected-unit-highlights.ts \
  src/input/selected-unit-tap-intent.ts \
  src/renderer/tile-presentation.ts \
  src/renderer/hex-renderer.ts \
  src/renderer/city-renderer.ts \
  src/renderer/fog-renderer.ts \
  src/renderer/render-visibility.ts \
  src/renderer/unit-visual-resolver.ts \
  src/renderer/unit-renderer.ts \
  src/renderer/sprites/units.tsx \
  src/renderer/sprites/sprite-catalog.ts \
  src/renderer/sprites/sprite-loader.ts \
  src/renderer/unit-movement-animation.ts \
  src/renderer/animation-system.ts \
  src/renderer/render-loop.ts \
  src/main.ts
```

Expected: exit 0.

- [ ] **Step 2: Run all targeted tests from this plan**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run \
  tests/systems/attack-targeting.test.ts \
  tests/input/selected-unit-highlights.test.ts \
  tests/input/selected-unit-tap-intent.test.ts \
  tests/ai/basic-ai.test.ts \
  tests/systems/barbarian-system.test.ts \
  tests/systems/minor-civ-system.test.ts \
  tests/systems/last-seen-presentation.test.ts \
  tests/systems/unit-movement-system.test.ts \
  tests/systems/fog-of-war.test.ts \
  tests/core/game-state.test.ts \
  tests/core/turn-manager.test.ts \
  tests/renderer/tile-presentation.test.ts \
  tests/renderer/fog-renderer.test.ts \
  tests/renderer/hex-renderer.test.ts \
  tests/renderer/city-renderer.test.ts \
  tests/renderer/unit-visual-resolver.test.ts \
  tests/renderer/unit-renderer.test.ts \
  tests/renderer/sprites/sprite-catalog.test.ts \
  tests/renderer/sprites/sprite-loader.test.ts \
  tests/renderer/unit-movement-animation.test.ts \
  tests/renderer/render-loop-wrap.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Run full test suite before push or PR**

Run:

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 5: Inspect diffs before completion**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff
```

Expected: diff contains only planned source, test, and plan/spec changes. No `.superpowers/` scratch files are staged.

## Self-Review Checklist

- [ ] Every spec acceptance criterion maps to one or more tasks above.
- [ ] Attack profile model separates movement and attack reach.
- [ ] Ranged unit attacks are visible-unit attacks only, and ordinary ranged city attacks are blocked.
- [ ] Player highlights, tap intent, preview, confirmation, and non-player attack selection use shared targeting.
- [ ] Last-seen presentation is viewer-scoped, serializable, and safe for old saves.
- [ ] Fogged rendering never reads live units or live city state.
- [ ] Wrap rendering uses canonical visibility and short movement routes.
- [ ] Barbarian and minor-civ unit visuals use same base sprites with owner color and role marker.
- [ ] Every current unit sprite has intentional moving output.
- [ ] Movement animation hides duplicate stationary copies, handles stacks, and blocks repeat commands.
- [ ] Tests assert rendered/player-visible behavior, not only internal state.
- [ ] Required rule checks, targeted tests, build, and full test suite are listed.

## Inline Execution Notes

The user requested inline execution with no subagents. When executing this plan, use `superpowers:executing-plans` and work task-by-task in this session. Pause after each task commit for a short checkpoint summary that includes commands run and any changed assumptions.
