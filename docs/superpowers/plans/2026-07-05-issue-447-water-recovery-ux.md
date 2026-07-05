# Issue #447 Water-Recovery UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give land units loaded onto water a clear, truthful route back ashore without changing movement rules or mutating saves.

**Architecture:** Add a pure shared recovery classifier that consumes the movement destinations already computed by the selection flow. Feed that result into map highlights, the selected-unit panel, and a testable blocked-movement feedback adapter used by the live tap handler. Keep save loading and canonical movement validation unchanged.

**Tech Stack:** TypeScript, Canvas 2D renderer, DOM UI, Vitest.

---

## File map

- Create `src/systems/unit-water-recovery.ts`: shared recovery classification and exact player-facing copy.
- Create `tests/systems/unit-water-recovery.test.ts`: semantic boundary coverage for the shared classifier and copy.
- Modify `src/input/selected-unit-highlights.ts`: derive recovery from existing movement truth and emit recovery highlights.
- Modify `tests/input/selected-unit-highlights.test.ts`: prove recovery highlights do not change reachability or attack semantics.
- Modify `src/renderer/render-loop.ts`: add the `water-recovery` highlight variant and amber color.
- Modify `tests/renderer/render-loop-wrap.test.ts`: prove the new highlight reaches the Canvas draw path with the intended color.
- Create `src/input/selected-unit-movement-feedback.ts`: testable adapter for blocked-movement notifications and reselection.
- Create `tests/input/selected-unit-movement-feedback.test.ts`: verify contextual and generic feedback through production callbacks.
- Modify `src/ui/selected-unit-info.ts`: render recoverable/blocked guidance supplied by the selection flow.
- Modify `tests/ui/selected-unit-info.test.ts`: assert visible guidance and its negative boundary.
- Modify `src/main.ts`: pass recovery presentation to the panel and delegate blocked movement feedback.
- Modify `tests/main.integration.test.ts`: ensure the live tap path delegates to the tested feedback adapter.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Warrior stands on water with a legal non-combat land exit | Select Warrior | Panel explains recovery; legal land exits are amber |
| Recoverable Warrior is selected | Tap amber land exit | Existing movement executes; warning and amber recovery highlights disappear on rerender |
| Recoverable Warrior is selected | Tap another water tile | Contextual return-ashore warning appears; selection and amber exits remain |
| Warrior stands on water without a legal non-combat land exit | Select Warrior | Panel says no land escape is reachable this turn; no amber exit appears |
| Ordinary Warrior stands on land | Tap water | Existing generic `Land units cannot cross water yet.` warning remains |
| Naval, air, or transported unit is on water | Select unit | Existing presentation remains; no land-recovery guidance appears |

## Misleading UI Risks

- `recoverable` requires at least one destination already accepted by the canonical movement preview.
- Water destinations and hostile attack targets must not become amber recovery exits.
- A water-starting land unit with no legal non-combat land move must be `blocked`, not `recoverable`.
- Cargo with `transportId`, naval units, air units, and land units already on land must remain outside this semantic group.
- Moving ashore must remove all recovery presentation on the next selection render.

## Interaction Replay Checklist

- [ ] Select a recoverable water-starting Warrior.
- [ ] Verify panel guidance and amber exits.
- [ ] Tap invalid water and verify contextual feedback plus reselection.
- [ ] Move through the existing movement path to an amber land exit.
- [ ] Rerender selection and verify recovery guidance is absent.
- [ ] Repeat selection for a normal land unit and verify generic water feedback remains.

---

### Task 1: Shared water-recovery model and copy

**Files:**
- Create: `src/systems/unit-water-recovery.ts`
- Create: `tests/systems/unit-water-recovery.test.ts`

- [ ] **Step 1: Write the failing semantic-boundary tests**

Create `tests/systems/unit-water-recovery.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, HexCoord, UnitType } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import {
  getLandUnitWaterRecovery,
  getLandUnitWaterRecoveryPanelMessage,
  getLandUnitWaterRecoveryTapMessage,
} from '@/systems/unit-water-recovery';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function tile(coord: HexCoord, terrain: GameState['map']['tiles'][string]['terrain']) {
  return {
    coord,
    terrain,
    elevation: 'lowland' as const,
    resource: null,
    owner: null,
    improvement: 'none' as const,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function recoveryState(type: UnitType = 'warrior'): GameState {
  const state = createNewGame(undefined, `water-recovery-${type}`, 'small');
  const unit = { ...createUnit(type, 'player', { q: 1, r: 1 }, mkC()), id: 'subject' };
  state.currentPlayer = 'player';
  state.units = { subject: unit };
  state.civilizations.player.units = ['subject'];
  state.map.tiles = {
    '1,1': tile({ q: 1, r: 1 }, 'coast'),
    '2,1': tile({ q: 2, r: 1 }, 'plains'),
    '1,2': tile({ q: 1, r: 2 }, 'coast'),
  };
  return state;
}

describe('land-unit water recovery', () => {
  it('is recoverable only through supplied legal land destinations', () => {
    const state = recoveryState();

    const result = getLandUnitWaterRecovery(
      state,
      'subject',
      [{ q: 2, r: 1 }, { q: 1, r: 2 }],
    );

    expect(result).toEqual({
      kind: 'recoverable',
      destinations: [{ q: 2, r: 1 }],
    });
    expect(getLandUnitWaterRecoveryPanelMessage(result)).toBe(
      'This land unit is on water. Move to an amber land tile to return ashore.',
    );
    expect(getLandUnitWaterRecoveryTapMessage(result)).toBe(
      'Move this land unit to an amber land tile to return ashore; it cannot move to another water tile.',
    );
  });

  it('reports blocked when no legal non-combat land destination exists', () => {
    const result = getLandUnitWaterRecovery(recoveryState(), 'subject', []);

    expect(result).toEqual({ kind: 'blocked', destinations: [] });
    expect(getLandUnitWaterRecoveryPanelMessage(result)).toBe(
      'This land unit is stranded on water. No land escape is currently reachable this turn.',
    );
    expect(getLandUnitWaterRecoveryTapMessage(result)).toBe(
      'This land unit is stranded on water with no reachable land escape this turn.',
    );
  });

  it.each([
    ['land unit already on land', 'warrior', false],
    ['naval unit on water', 'galley', true],
    ['air unit on water', 'observation_balloon', true],
  ] as const)('returns none for %s', (_label, type, keepWater) => {
    const state = recoveryState(type);
    if (!keepWater) state.map.tiles['1,1'] = tile({ q: 1, r: 1 }, 'plains');

    const result = getLandUnitWaterRecovery(state, 'subject', [{ q: 2, r: 1 }]);

    expect(result).toEqual({ kind: 'none', destinations: [] });
    expect(getLandUnitWaterRecoveryPanelMessage(result)).toBeNull();
    expect(getLandUnitWaterRecoveryTapMessage(result)).toBeNull();
  });

  it('returns none for transported cargo synchronized onto water', () => {
    const state = recoveryState();
    state.units.subject.transportId = 'transport-1';

    expect(getLandUnitWaterRecovery(state, 'subject', [{ q: 2, r: 1 }]))
      .toEqual({ kind: 'none', destinations: [] });
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-water-recovery.test.ts
```

Expected: FAIL because `@/systems/unit-water-recovery` does not exist.

- [ ] **Step 3: Implement the minimal shared model**

Create `src/systems/unit-water-recovery.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export type LandUnitWaterRecovery =
  | { kind: 'none'; destinations: [] }
  | { kind: 'recoverable'; destinations: HexCoord[] }
  | { kind: 'blocked'; destinations: [] };

export const NO_LAND_UNIT_WATER_RECOVERY: LandUnitWaterRecovery = {
  kind: 'none',
  destinations: [],
};

export function getLandUnitWaterRecovery(
  state: GameState,
  unitId: string,
  movementDestinations: readonly HexCoord[],
): LandUnitWaterRecovery {
  const unit = state.units[unitId];
  if (!unit || unit.transportId) return { kind: 'none', destinations: [] };
  if ((UNIT_DEFINITIONS[unit.type]?.domain ?? 'land') !== 'land') {
    return { kind: 'none', destinations: [] };
  }
  const currentTerrain = state.map.tiles[hexKey(unit.position)]?.terrain;
  if (currentTerrain !== 'coast' && currentTerrain !== 'ocean') {
    return { kind: 'none', destinations: [] };
  }

  const destinations = movementDestinations.filter(coord => {
    const terrain = state.map.tiles[hexKey(coord)]?.terrain;
    return terrain !== undefined && terrain !== 'coast' && terrain !== 'ocean';
  });
  return destinations.length > 0
    ? { kind: 'recoverable', destinations }
    : { kind: 'blocked', destinations: [] };
}

export function getLandUnitWaterRecoveryPanelMessage(
  recovery: LandUnitWaterRecovery,
): string | null {
  if (recovery.kind === 'recoverable') {
    return 'This land unit is on water. Move to an amber land tile to return ashore.';
  }
  if (recovery.kind === 'blocked') {
    return 'This land unit is stranded on water. No land escape is currently reachable this turn.';
  }
  return null;
}

export function getLandUnitWaterRecoveryTapMessage(
  recovery: LandUnitWaterRecovery,
): string | null {
  if (recovery.kind === 'recoverable') {
    return 'Move this land unit to an amber land tile to return ashore; it cannot move to another water tile.';
  }
  if (recovery.kind === 'blocked') {
    return 'This land unit is stranded on water with no reachable land escape this turn.';
  }
  return null;
}
```

- [ ] **Step 4: Run the shared-model test and verify GREEN**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-water-recovery.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the source-rule checker**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/unit-water-recovery.ts
```

Expected: PASS with no violations.

- [ ] **Step 6: Commit the shared model**

```bash
git add src/systems/unit-water-recovery.ts tests/systems/unit-water-recovery.test.ts
git commit -m "feat(movement): classify stranded land-unit recovery"
```

---

### Task 2: Recovery highlights and Canvas treatment

**Files:**
- Modify: `src/input/selected-unit-highlights.ts`
- Modify: `tests/input/selected-unit-highlights.test.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `tests/renderer/render-loop-wrap.test.ts`

- [ ] **Step 1: Add failing highlight tests**

Append to `tests/input/selected-unit-highlights.test.ts`:

```ts
it('marks legal non-combat land exits as water-recovery without changing movement truth', () => {
  const state = createNewGame(undefined, 'water-recovery-highlight', 'small');
  state.currentPlayer = 'player';
  state.units = {
    warrior: {
      ...createUnit('warrior', 'player', { q: 1, r: 1 }, mkC()),
      id: 'warrior',
      movementPointsLeft: 2,
    },
  };
  state.civilizations.player.units = ['warrior'];
  state.civilizations.player.visibility.tiles = { '1,1': 'visible', '2,1': 'visible' };
  state.map.tiles['1,1'] = {
    ...state.map.tiles['1,1'],
    coord: { q: 1, r: 1 },
    terrain: 'coast',
  };
  state.map.tiles['2,1'] = {
    ...state.map.tiles['2,1'],
    coord: { q: 2, r: 1 },
    terrain: 'plains',
  };

  const result = buildSelectedUnitHighlights(state, 'warrior');

  expect(result.waterRecovery.kind).toBe('recoverable');
  expect(result.movementRange.map(hexKey)).toContain('2,1');
  expect(result.highlights).toContainEqual({
    coord: { q: 2, r: 1 },
    type: 'water-recovery',
  });
});

it('keeps hostile land targets as attack highlights during water recovery', () => {
  const state = createNewGame(undefined, 'water-recovery-attack', 'small');
  state.currentPlayer = 'player';
  state.units = {
    warrior: {
      ...createUnit('warrior', 'player', { q: 1, r: 1 }, mkC()),
      id: 'warrior',
      movementPointsLeft: 2,
    },
    enemy: {
      ...createUnit('warrior', 'ai-1', { q: 2, r: 1 }, mkC()),
      id: 'enemy',
    },
  };
  state.civilizations.player.units = ['warrior'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations.player.visibility.tiles = { '1,1': 'visible', '2,1': 'visible' };
  state.map.tiles['1,1'] = { ...state.map.tiles['1,1'], terrain: 'coast' };
  state.map.tiles['2,1'] = { ...state.map.tiles['2,1'], terrain: 'plains' };

  const result = buildSelectedUnitHighlights(state, 'warrior');

  expect(result.highlights).toContainEqual({
    coord: { q: 2, r: 1 },
    type: 'attack',
  });
  expect(result.highlights).not.toContainEqual({
    coord: { q: 2, r: 1 },
    type: 'water-recovery',
  });
});
```

Add to `tests/renderer/render-loop-wrap.test.ts`:

```ts
it('draws water-recovery highlights with the amber recovery color', () => {
  rendererMocks.drawHexHighlight.mockReset();
  const loop = new RenderLoop(createCanvas());
  const state = {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: {},
    civilizations: {
      player: { color: '#4a90d9', visibility: { tiles: {} } },
    },
  } as unknown as GameState;

  loop.setGameState(state);
  loop.setHighlights([{ coord: { q: 0, r: 0 }, type: 'water-recovery' }]);
  loop.camera.isHexVisible = () => true;

  (loop as unknown as { render: () => void }).render();

  expect(rendererMocks.drawHexHighlight).toHaveBeenCalledWith(
    expect.anything(),
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
    'rgba(245, 184, 73, 0.55)',
  );
});
```

- [ ] **Step 2: Run highlight tests and verify RED**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: FAIL because `waterRecovery` and `water-recovery` are not defined.

- [ ] **Step 3: Integrate recovery into selection highlights**

In `src/input/selected-unit-highlights.ts`:

```ts
import {
  getLandUnitWaterRecovery,
  NO_LAND_UNIT_WATER_RECOVERY,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';
```

Extend the result:

```ts
export interface SelectedUnitHighlightResult {
  movementRange: HexCoord[];
  attackTargets: AttackTarget[];
  highlights: HexHighlight[];
  waterRecovery: LandUnitWaterRecovery;
}
```

Return `waterRecovery: NO_LAND_UNIT_WATER_RECOVERY` from the missing/foreign-unit branch.
After computing `attackKeys`, derive and apply recovery:

```ts
const nonCombatMovementRange = movementRange
  .filter(coord => !attackKeys.has(hexKey(coord)));
const waterRecovery = getLandUnitWaterRecovery(
  state,
  unitId,
  nonCombatMovementRange,
);
const recoveryKeys = new Set(
  waterRecovery.destinations.map(coord => hexKey(coord)),
);

const moveHighlights = nonCombatMovementRange.map(coord => ({
  coord,
  type: recoveryKeys.has(hexKey(coord))
    ? 'water-recovery' as const
    : 'move' as const,
}));
const workerHighlights = buildWorkerGuidanceHighlights(
  state,
  unitId,
  movementRange,
).filter(highlight => !recoveryKeys.has(hexKey(highlight.coord)));
```

Return `waterRecovery` with the existing fields.

- [ ] **Step 4: Add the renderer variant**

In `src/renderer/render-loop.ts`, extend `HexHighlight['type']` with
`'water-recovery'` and add:

```ts
'water-recovery': 'rgba(245, 184, 73, 0.55)',
```

to `HEX_HIGHLIGHT_COLORS`.

- [ ] **Step 5: Run highlight tests and verify GREEN**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run source-rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/input/selected-unit-highlights.ts src/renderer/render-loop.ts
```

Expected: PASS.

- [ ] **Step 7: Commit recovery highlights**

```bash
git add src/input/selected-unit-highlights.ts src/renderer/render-loop.ts tests/input/selected-unit-highlights.test.ts tests/renderer/render-loop-wrap.test.ts
git commit -m "feat(ui): highlight stranded-unit land exits"
```

---

### Task 3: Panel guidance and live invalid-tap feedback

**Files:**
- Create: `src/input/selected-unit-movement-feedback.ts`
- Create: `tests/input/selected-unit-movement-feedback.test.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `tests/ui/selected-unit-info.test.ts`
- Modify: `src/main.ts`
- Modify: `tests/main.integration.test.ts`

- [ ] **Step 1: Add failing feedback-adapter tests**

Create `tests/input/selected-unit-movement-feedback.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, HexCoord } from '@/core/types';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import { createUnit } from '@/systems/unit-system';
import { getLandUnitWaterRecovery } from '@/systems/unit-water-recovery';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function tile(coord: HexCoord, terrain: GameState['map']['tiles'][string]['terrain']) {
  return {
    coord,
    terrain,
    elevation: 'lowland' as const,
    resource: null,
    owner: null,
    improvement: 'none' as const,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

function feedbackState(onWater: boolean): GameState {
  const state = createNewGame(undefined, `water-feedback-${onWater}`, 'small');
  const unit = { ...createUnit('warrior', 'player', { q: 1, r: 1 }, mkC()), id: 'warrior' };
  state.currentPlayer = 'player';
  state.units = { warrior: unit };
  state.civilizations.player.units = ['warrior'];
  state.map.tiles = {
    '1,1': tile({ q: 1, r: 1 }, onWater ? 'coast' : 'plains'),
    '2,1': tile({ q: 2, r: 1 }, 'plains'),
    '1,2': tile({ q: 1, r: 2 }, 'coast'),
  };
  state.civilizations.player.visibility.tiles = {
    '1,1': 'visible',
    '2,1': 'visible',
    '1,2': 'visible',
  };
  return state;
}

describe('selected-unit blocked movement feedback', () => {
  it('shows contextual recovery copy and reselects after a water tap', () => {
    const state = feedbackState(true);
    const recovery = getLandUnitWaterRecovery(
      state,
      'warrior',
      [{ q: 2, r: 1 }],
    );
    const showNotification = vi.fn();
    const reselectUnit = vi.fn();

    const handled = handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 1, r: 2 },
      recovery,
      { showNotification, reselectUnit },
    );

    expect(handled).toBe(true);
    expect(showNotification).toHaveBeenCalledWith(
      'Move this land unit to an amber land tile to return ashore; it cannot move to another water tile.',
      'warning',
    );
    expect(reselectUnit).toHaveBeenCalledWith('warrior');
  });

  it('keeps generic water copy for an ordinary land unit on land', () => {
    const state = feedbackState(false);
    const recovery = getLandUnitWaterRecovery(state, 'warrior', []);
    const showNotification = vi.fn();

    handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 1, r: 2 },
      recovery,
      { showNotification, reselectUnit: vi.fn() },
    );

    expect(showNotification).toHaveBeenCalledWith(
      'Land units cannot cross water yet.',
      'warning',
    );
  });

  it('uses blocked recovery copy when no land exit is reachable', () => {
    const state = feedbackState(true);
    const recovery = getLandUnitWaterRecovery(state, 'warrior', []);
    const showNotification = vi.fn();

    handleSelectedUnitMovementBlocker(
      state,
      'warrior',
      { q: 1, r: 2 },
      recovery,
      { showNotification, reselectUnit: vi.fn() },
    );

    expect(showNotification).toHaveBeenCalledWith(
      'This land unit is stranded on water with no reachable land escape this turn.',
      'warning',
    );
  });
});
```

- [ ] **Step 2: Add failing selected-unit panel tests**

Append to `tests/ui/selected-unit-info.test.ts` using the file's existing
`installMockDocument`, `collectAllText`, and `createNewGame` fixtures:

```ts
describe('land-unit water recovery guidance', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  it('renders recoverable guidance supplied by the live selection presentation', () => {
    const state = createNewGame(undefined, 'water-panel-recoverable', 'small');
    const unit = {
      ...createUnit('warrior', 'player', { q: 1, r: 1 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'warrior',
    };
    state.currentPlayer = 'player';
    state.units = { warrior: unit };
    state.civilizations.player.units = ['warrior'];
    const container = new MockElement('div');

    renderSelectedUnitInfo(
      container as unknown as HTMLElement,
      state,
      'warrior',
      {},
      {
        waterRecovery: {
          kind: 'recoverable',
          destinations: [{ q: 2, r: 1 }],
        },
      },
    );

    expect(collectAllText(container).join(' ')).toContain(
      'This land unit is on water. Move to an amber land tile to return ashore.',
    );
  });

  it('renders blocked guidance and omits guidance for none', () => {
    const state = createNewGame(undefined, 'water-panel-blocked', 'small');
    const unit = {
      ...createUnit('warrior', 'player', { q: 1, r: 1 }, {
        nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1,
      }),
      id: 'warrior',
    };
    state.currentPlayer = 'player';
    state.units = { warrior: unit };
    state.civilizations.player.units = ['warrior'];
    const blocked = new MockElement('div');
    const normal = new MockElement('div');

    renderSelectedUnitInfo(
      blocked as unknown as HTMLElement,
      state,
      'warrior',
      {},
      { waterRecovery: { kind: 'blocked', destinations: [] } },
    );
    renderSelectedUnitInfo(
      normal as unknown as HTMLElement,
      state,
      'warrior',
      {},
      { waterRecovery: { kind: 'none', destinations: [] } },
    );

    expect(collectAllText(blocked).join(' ')).toContain(
      'This land unit is stranded on water. No land escape is currently reachable this turn.',
    );
    expect(collectAllText(normal).join(' ')).not.toContain('return ashore');
    expect(collectAllText(normal).join(' ')).not.toContain('stranded on water');
  });
});
```

- [ ] **Step 3: Run the new feedback and panel tests and verify RED**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-movement-feedback.test.ts tests/ui/selected-unit-info.test.ts
```

Expected: FAIL because the feedback adapter and fifth panel argument do not exist.

- [ ] **Step 4: Implement the blocked-movement feedback adapter**

Create `src/input/selected-unit-movement-feedback.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { getMovementBlockerReason } from '@/systems/unit-system';
import {
  getLandUnitWaterRecoveryTapMessage,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';

export interface SelectedUnitMovementFeedbackCallbacks {
  showNotification: (message: string, type: 'info' | 'warning') => void;
  reselectUnit: (unitId: string) => void;
}

export function handleSelectedUnitMovementBlocker(
  state: GameState,
  unitId: string,
  target: HexCoord,
  waterRecovery: LandUnitWaterRecovery,
  callbacks: SelectedUnitMovementFeedbackCallbacks,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  const civ = state.civilizations[state.currentPlayer];
  const visibilityState = civ?.visibility
    ? getVisibility(civ.visibility, target)
    : undefined;
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const reason = getMovementBlockerReason(
    unit,
    target,
    state.map,
    { visibilityState, completedTechs },
  );
  if (!reason) return false;

  const recoveryMessage = reason.code === 'impassable-water'
    ? getLandUnitWaterRecoveryTapMessage(waterRecovery)
    : null;
  const type = reason.code === 'unexplored' || reason.code === 'unknown-tile'
    ? 'info'
    : 'warning';
  callbacks.showNotification(recoveryMessage ?? reason.message, type);
  callbacks.reselectUnit(unitId);
  return true;
}
```

- [ ] **Step 5: Render panel guidance**

In `src/ui/selected-unit-info.ts`, import the recovery type and panel formatter:

```ts
import {
  getLandUnitWaterRecoveryPanelMessage,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';
```

Add:

```ts
export interface SelectedUnitInfoPresentation {
  waterRecovery?: LandUnitWaterRecovery;
}
```

Extend `renderSelectedUnitInfo` with a defaulted fifth argument:

```ts
export function renderSelectedUnitInfo(
  container: HTMLElement,
  state: GameState,
  unitId: string,
  callbacks: SelectedUnitInfoCallbacks,
  presentation: SelectedUnitInfoPresentation = {},
): void {
```

After the description, render the exact guidance when present:

```ts
const waterRecoveryMessage = presentation.waterRecovery
  ? getLandUnitWaterRecoveryPanelMessage(presentation.waterRecovery)
  : null;
if (waterRecoveryMessage) {
  const recoveryLine = document.createElement('div');
  recoveryLine.style.cssText = 'margin-top:8px;padding:8px;border-radius:8px;background:rgba(245,184,73,0.16);color:#f5b849;font-size:11px;font-weight:600;';
  recoveryLine.textContent = waterRecoveryMessage;
  wrapper.appendChild(recoveryLine);
}
```

- [ ] **Step 6: Wire the live selection and tap paths**

In `src/main.ts`:

1. import `handleSelectedUnitMovementBlocker`;
2. remove the now-unused `getMovementBlockerReason` import from `@/systems/unit-system`;
3. pass `{ waterRecovery: highlightResult.waterRecovery }` as the fifth argument to
   `renderSelectedUnitInfo`;
4. replace only the generic `getMovementBlockerReason` notification tail in
   `handleHexTap` with:

```ts
const nonCombatMovementRange = movementRange.filter(coord =>
  !attackRange.some(target => hexKey(target) === hexKey(coord)));
const waterRecovery = getLandUnitWaterRecovery(
  gameState,
  selectedUnitId,
  nonCombatMovementRange,
);
if (handleSelectedUnitMovementBlocker(
  gameState,
  selectedUnitId,
  coord,
  waterRecovery,
  {
    showNotification,
    reselectUnit: selectUnit,
  },
)) {
  return;
}
```

Import `getLandUnitWaterRecovery` from the shared system module. Keep committed-route and
naval-only beast feedback ahead of this adapter exactly as they are.

- [ ] **Step 7: Add live-wiring coverage**

Append to `tests/main.integration.test.ts`:

```ts
describe('land-unit water recovery wiring', () => {
  it('routes the live selected-unit panel and blocked-tap path through recovery helpers', () => {
    const main = readFileSync(resolve(PROJECT_ROOT, 'src/main.ts'), 'utf8');
    const selectFlow = main.slice(
      main.indexOf('function selectUnit('),
      main.indexOf('function deselectUnit('),
    );
    const tapFlow = main.slice(
      main.indexOf('const selectedUnitCanMoveToTappedHex'),
      main.indexOf('const defenderEntryAtHex'),
    );

    expect(selectFlow).toContain('waterRecovery: highlightResult.waterRecovery');
    expect(tapFlow).toContain('handleSelectedUnitMovementBlocker(');
    expect(tapFlow).toContain('reselectUnit: selectUnit');
  });
});
```

This source-level assertion is only the delegation check. Behavioral coverage lives in
the production feedback-adapter, selection-highlight, and panel-render tests above.

- [ ] **Step 8: Run all Task 3 tests and verify GREEN**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-movement-feedback.test.ts tests/ui/selected-unit-info.test.ts tests/main.integration.test.ts
```

Expected: PASS.

- [ ] **Step 9: Replay the full focused interaction test set**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-water-recovery.test.ts tests/input/selected-unit-highlights.test.ts tests/renderer/render-loop-wrap.test.ts tests/input/selected-unit-movement-feedback.test.ts tests/ui/selected-unit-info.test.ts tests/main.integration.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run source-rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/unit-water-recovery.ts src/input/selected-unit-highlights.ts src/renderer/render-loop.ts src/input/selected-unit-movement-feedback.ts src/ui/selected-unit-info.ts src/main.ts
```

Expected: PASS.

- [ ] **Step 11: Commit the player-visible recovery flow**

```bash
git add src/input/selected-unit-movement-feedback.ts src/ui/selected-unit-info.ts src/main.ts tests/input/selected-unit-movement-feedback.test.ts tests/ui/selected-unit-info.test.ts tests/main.integration.test.ts
git commit -m "fix(ui): guide stranded land units back ashore"
```

---

### Task 4: Final verification and review

**Files:**
- Verify all changed source, tests, spec, and plan files.

- [ ] **Step 1: Run TypeScript and production build verification**

Run:

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 2: Run the full test and hook suite**

Run:

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: PASS.

- [ ] **Step 3: Inspect committed and uncommitted deltas**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
git status --short --branch
```

Expected:

- committed delta contains only the issue #447 design, plan, implementation, and tests;
- uncommitted delta is empty;
- branch is ahead of `origin/main`;
- no unrelated main-worktree changes appear.

- [ ] **Step 4: Confirm the design contract line by line**

Verify:

- no save-load mutation was added;
- land-on-water movement rules remain unchanged;
- recoverable, blocked, ordinary land, naval, air, and cargo cases are covered;
- recovery exits use amber and attack targets remain red;
- invalid taps preserve selection through the tested reselection callback;
- moving ashore removes recovery presentation because the shared predicate returns `none`.
