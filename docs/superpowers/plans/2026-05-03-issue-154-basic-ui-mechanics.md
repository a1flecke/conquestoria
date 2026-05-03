# Issue 154 Basic UI Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are explicitly prohibited for this issue by user request. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing player unit controls from GitHub issue 154: skip a unit for the turn, delete a unit only after confirmation, and warn before ending a turn with unmoved units while offering to jump to one.

**Architecture:** Put unit state transitions in a small pure system helper so UI actions, tests, and future input paths share the same mutation semantics. Add two focused DOM panels for destructive unit confirmation and end-turn unmoved-unit warning, then wire `src/main.ts` to call those helpers from the selected-unit panel and end-turn flow.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom tests, Canvas renderer plus DOM UI panels.

---

## Issue Source

GitHub issue: `https://github.com/a1flecke/conquestoria/issues/154`

Issue text:

- `Skip`: player does not want to move this unit this turn.
- `Delete`: player no longer wants this unit; must show an "are you sure" prompt.
- End-turn checks: if not all units have moved, ask "are you sure" and offer an option to go to an unmoved unit.

## Repo Rules Read Before Planning

- `CLAUDE.md`
- `.claude/rules/game-systems.md`
- `.claude/rules/ui-panels.md`
- `.claude/rules/strategy-game-mechanics.md`
- `.claude/rules/end-to-end-wiring.md`
- `docs/superpowers/plans/README.md`

## File Structure

- Modify `src/core/types.ts`: add an optional serializable `skippedTurn` flag to `Unit`.
- Modify `src/systems/unit-system.ts`: make unit cycling ignore skipped units and clear `skippedTurn` on turn reset without changing passive healing semantics.
- Modify `tests/systems/unit-system.test.ts`: prove skipped units leave cycling, still qualify for passive healing, and reset cleanly next turn.
- Create `src/systems/unit-lifecycle-system.ts`: pure state helpers for skip, delete, and end-turn unmoved-unit lookup.
- Create `tests/systems/unit-lifecycle-system.test.ts`: deterministic regression tests for skip, delete, spy cleanup, and current-player unmoved filtering.
- Modify `src/ui/selected-unit-info.ts`: add `Skip Turn` and `Delete Unit` callbacks/buttons to the existing selected-unit info panel.
- Modify `tests/ui/selected-unit-info.test.ts`: assert the selected-unit panel renders both actions and fires callbacks with the selected unit id.
- Create `src/ui/unit-delete-confirmation-panel.ts`: in-app confirmation panel for unit deletion.
- Create `tests/ui/unit-delete-confirmation-panel.test.ts`: visible prompt, confirm callback, cancel callback, and duplicate-panel replacement coverage.
- Create `src/ui/end-turn-warning-panel.ts`: in-app warning panel listing unmoved units with `Go to Unit`, `End Turn Anyway`, and `Cancel`.
- Create `tests/ui/end-turn-warning-panel.test.ts`: visible warning text, listed units, callback behavior, and duplicate-panel replacement coverage.
- Create `src/ui/unit-turn-flow.ts`: testable live-flow seam for selected-unit skip/delete, delete confirmation overlay, end-turn warning overlay, and bypass behavior.
- Create `tests/ui/unit-turn-flow.test.ts`: jsdom tests that click through the real flow seam and assert overlay state, selected unit routing, visibility refresh, and end-turn bypass behavior.
- Modify `src/main.ts`: delegate selected-unit skip/delete actions and end-turn unmoved-unit gating to `src/ui/unit-turn-flow.ts`.

## Player Truth Table

| Before | Action | Internal state change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Selected friendly unit has movement remaining | Click `Skip Turn` | Unit gets `skippedTurn: true`, `movementPointsLeft: 0`, `isResting: false`; `hasMoved` and `hasActed` stay `false` so passive healing still works | Selected panel moves to the next unmoved unit or hides if none remain; Next Unit count updates | Other unmoved units through floating Next Unit button |
| Selected friendly unit is visible in info panel | Click `Delete Unit` | No state change yet | Delete confirmation panel appears; map and selected panel stay behind a blocking overlay | `Cancel` dismisses without changing state |
| Delete confirmation is open | Click `Delete Unit` in confirmation | Unit is removed from `state.units`, current civ roster, and matching spy record if present | Confirmation closes, deleted unit disappears, next unit is selected if one exists, HUD count updates | Remaining units and normal end-turn controls |
| Delete confirmation is open | Click `Cancel` | No state change | Confirmation closes; selected unit panel still shows the unit | Original unit actions |
| Player clicks `End Turn` while required research/production choices remain | Click `End Turn` | No unit-warning state change | Existing required-choice panel opens first | Required production/research flows |
| Player clicks `End Turn` with unmoved units and no required choices | Click `End Turn` | No turn processing yet | End-turn warning opens and lists unmoved units | `Go to Unit`, `End Turn Anyway`, `Cancel` |
| End-turn warning is open | Click `Go to Unit` | No turn processing | Warning closes, first unmoved unit becomes selected, camera centers on it | End Turn button remains usable afterward |
| End-turn warning is open | Click `End Turn Anyway` | Turn processing runs once with unit warning bypassed | Warning closes; normal turn advancement/handoff occurs | Required-choice guard still runs before this panel appears |

## Misleading UI Risks

- `unmoved` must mean current-player units where `!hasMoved && !hasActed && !skippedTurn`; enemy, barbarian, and previous hot-seat player units must stay out.
- A skipped unit must stop appearing in `getUnmovedUnitsForEndTurn` immediately in the same turn.
- A skipped unit must still passively heal if it did not move or act; `skippedTurn` is a cycling/UI flag, not an action flag.
- The end-turn warning must not appear before required research/production choices, because `End Turn Anyway` is not allowed to bypass mandatory choice gating.
- The delete confirmation must not remove a unit on the first `Delete Unit` click in the selected-unit panel; only the confirmation button can mutate state.
- Spy unit deletion must not leave a stale `state.espionage[civId].spies[unitId]` record.
- Unit deletion must refresh current-player visibility immediately because unit vision contributes to fog-of-war.
- Blocking overlays must be set when confirmation/warning panels open and cleared on every close path: delete confirm, delete cancel, `Go to Unit`, `End Turn Anyway`, and warning cancel.

## Interaction Replay Checklist

- Select unit, click `Skip Turn`, verify selected panel advances or hides and Next Unit count changes.
- Select unit, click `Delete Unit`, click `Cancel`, verify the same unit is still in state and visible.
- Select unit, click `Delete Unit`, click confirmation `Delete Unit`, verify the unit is removed and stale spy records are cleaned.
- Click `End Turn` with two unmoved units, click `Go to Unit`, verify the first warning unit becomes selected.
- Click `End Turn` again after returning from `Go to Unit`, verify the warning is recreated with current unmoved units.
- Click `End Turn Anyway`, verify normal turn flow runs once and no stale warning panel remains.
- Reopen delete confirmation or end-turn warning while an older instance exists, verify only one panel is present.

## Queue And ETA Checklist

This plan does not add or modify a player-visible queue. No ETA text is introduced.

### Task 1: Unit Lifecycle System Helpers

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Create: `src/systems/unit-lifecycle-system.ts`
- Modify: `tests/systems/unit-system.test.ts`
- Create: `tests/systems/unit-lifecycle-system.test.ts`

- [ ] **Step 1: Write the failing unit-system regression tests**

In `tests/systems/unit-system.test.ts`, update the import from `@/systems/unit-system` to include `getUnmovedUnits` and `healUnit`:

```ts
import {
  createUnit,
  getMovementRange,
  moveUnit,
  findPath,
  resetUnitTurn,
  UNIT_DEFINITIONS,
  getUnmovedUnits,
  healUnit,
} from '@/systems/unit-system';
```

Then append this describe block after the existing `describe('resetUnitTurn', () => { ... })` block:

```ts
describe('skippedTurn cycling flag', () => {
  it('excludes skipped units from unmoved cycling without treating skip as movement or action', () => {
    const skipped = {
      ...createUnit('scout', 'player', { q: 2, r: 2 }),
      id: 'unit-skipped',
      skippedTurn: true,
      movementPointsLeft: 0,
    };
    const fresh = {
      ...createUnit('warrior', 'player', { q: 3, r: 2 }),
      id: 'unit-fresh',
    };

    const unmoved = getUnmovedUnits({ [skipped.id]: skipped, [fresh.id]: fresh }, 'player');

    expect(unmoved.map(unit => unit.id)).toEqual(['unit-fresh']);
    expect(skipped.hasMoved).toBe(false);
    expect(skipped.hasActed).toBe(false);
  });

  it('still allows passive healing for a skipped unit that did not move or act', () => {
    const skipped = {
      ...createUnit('scout', 'player', { q: 2, r: 2 }),
      health: 50,
      skippedTurn: true,
      movementPointsLeft: 0,
    };

    const healed = healUnit(skipped, false, false);

    expect(healed.health).toBe(55);
  });

  it('clears skippedTurn during turn reset', () => {
    const skipped = {
      ...createUnit('scout', 'player', { q: 2, r: 2 }),
      skippedTurn: true,
      movementPointsLeft: 0,
    };

    const reset = resetUnitTurn(skipped);

    expect(reset.skippedTurn).toBeUndefined();
    expect(reset.movementPointsLeft).toBe(UNIT_DEFINITIONS.scout.movementPoints);
  });
});
```

- [ ] **Step 2: Write the failing unit lifecycle tests**

Create `tests/systems/unit-lifecycle-system.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import {
  getUnmovedUnitsForEndTurn,
  removePlayerUnitFromState,
  skipUnitForTurn,
  skipUnitInState,
} from '@/systems/unit-lifecycle-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';

describe('unit-lifecycle-system', () => {
  it('marks a skipped unit as done for the current turn without moving it', () => {
    const unit = createUnit('scout', 'player', { q: 2, r: 3 });

    const skipped = skipUnitForTurn(unit);

    expect(skipped.position).toEqual({ q: 2, r: 3 });
    expect(skipped.hasMoved).toBe(false);
    expect(skipped.hasActed).toBe(false);
    expect(skipped.movementPointsLeft).toBe(0);
    expect(skipped.isResting).toBe(false);
    expect(skipped.skippedTurn).toBe(true);
  });

  it('updates only the current player unit when skipping through state', () => {
    const state = createNewGame(undefined, 'issue-154-skip-state', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];
    const originalUnit = state.units[unitId];

    const next = skipUnitInState(state, playerId, unitId);

    expect(next).not.toBe(state);
    expect(next.units[unitId]).toEqual({
      ...originalUnit,
      movementPointsLeft: 0,
      isResting: false,
      skippedTurn: true,
    });
    expect(next.units[unitId].hasMoved).toBe(false);
    expect(next.units[unitId].hasActed).toBe(false);
    expect(state.units[unitId].skippedTurn).toBeUndefined();
  });

  it('does not skip an enemy unit through the current player path', () => {
    const state = createNewGame(undefined, 'issue-154-skip-enemy', 'small');
    const playerId = state.currentPlayer;
    const enemyId = 'ai-1';
    const enemyUnitId = state.civilizations[enemyId].units[0];
    const originalEnemy = state.units[enemyUnitId];

    const next = skipUnitInState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
    expect(state.units[enemyUnitId]).toEqual(originalEnemy);
  });

  it('removes a current player unit from the map and civilization roster', () => {
    const state = createNewGame(undefined, 'issue-154-delete-unit', 'small');
    const playerId = state.currentPlayer;
    const unitId = state.civilizations[playerId].units[0];

    const next = removePlayerUnitFromState(state, playerId, unitId);

    expect(next.units[unitId]).toBeUndefined();
    expect(next.civilizations[playerId].units).not.toContain(unitId);
    expect(state.units[unitId]).toBeDefined();
    expect(state.civilizations[playerId].units).toContain(unitId);
  });

  it('does not remove units owned by another civilization', () => {
    const state = createNewGame(undefined, 'issue-154-delete-enemy', 'small');
    const playerId = state.currentPlayer;
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    const next = removePlayerUnitFromState(state, playerId, enemyUnitId);

    expect(next).toBe(state);
    expect(state.units[enemyUnitId]).toBeDefined();
  });

  it('cleans up matching spy records when deleting a spy unit', () => {
    const state = createNewGame(undefined, 'issue-154-delete-spy', 'small');
    const playerId = state.currentPlayer;
    const spyUnit = createUnit('spy_scout', playerId, { q: 1, r: 1 });
    state.units[spyUnit.id] = spyUnit;
    state.civilizations[playerId].units.push(spyUnit.id);

    const baseEspionage = { ...createEspionageCivState(), maxSpies: 1 };
    const created = createSpyFromUnit(baseEspionage, spyUnit.id, playerId, 'spy_scout', 'issue-154-spy');
    state.espionage = { [playerId]: created.state };

    const next = removePlayerUnitFromState(state, playerId, spyUnit.id);

    expect(next.units[spyUnit.id]).toBeUndefined();
    expect(next.civilizations[playerId].units).not.toContain(spyUnit.id);
    expect(next.espionage?.[playerId]?.spies[spyUnit.id]).toBeUndefined();
  });

  it('returns only current-player units that still need orders at end turn', () => {
    const state = createNewGame(undefined, 'issue-154-unmoved', 'small');
    const playerId = state.currentPlayer;
    const firstUnitId = state.civilizations[playerId].units[0];
    const secondUnitId = state.civilizations[playerId].units[1];
    const enemyUnitId = state.civilizations['ai-1'].units[0];

    state.units[firstUnitId] = { ...state.units[firstUnitId], hasMoved: true, movementPointsLeft: 0 };
    state.units[secondUnitId] = { ...state.units[secondUnitId], skippedTurn: true, movementPointsLeft: 0 };
    state.units['fresh-player-unit'] = {
      ...createUnit('warrior', playerId, { q: 4, r: 4 }),
      id: 'fresh-player-unit',
    };
    state.civilizations[playerId].units.push('fresh-player-unit');

    const warningUnits = getUnmovedUnitsForEndTurn(state, playerId).map(unit => unit.id);

    expect(warningUnits).toContain('fresh-player-unit');
    expect(warningUnits).not.toContain(firstUnitId);
    expect(warningUnits).not.toContain(secondUnitId);
    expect(warningUnits).not.toContain(enemyUnitId);
  });
});
```

- [ ] **Step 3: Run the unit lifecycle tests to verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/unit-lifecycle-system.test.ts
```

Expected: FAIL because `src/systems/unit-lifecycle-system.ts` does not exist and `Unit`/`getUnmovedUnits` do not yet support `skippedTurn`.

- [ ] **Step 4: Add the `skippedTurn` field to `Unit`**

In `src/core/types.ts`, update `export interface Unit` by adding the optional flag after `isResting`:

```ts
  isResting: boolean;        // player explicitly chose to rest/heal this turn
  skippedTurn?: boolean;     // player chose to hold this unit out of unit cycling this turn
```

- [ ] **Step 5: Update unit reset and unmoved filtering**

In `src/systems/unit-system.ts`, replace `resetUnitTurn` with:

```ts
export function resetUnitTurn(unit: Unit): Unit {
  const { skippedTurn: _skippedTurn, ...rest } = unit;
  return {
    ...rest,
    movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints + (unit.movementBonus ?? 0),
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}
```

In the same file, replace `getUnmovedUnits` with:

```ts
export function getUnmovedUnits(
  units: Record<string, Unit>,
  civId: string,
): Unit[] {
  return Object.values(units).filter(
    u => u.owner === civId && !u.hasMoved && !u.hasActed && !u.skippedTurn,
  );
}
```

- [ ] **Step 6: Create the unit lifecycle helper implementation**

Create `src/systems/unit-lifecycle-system.ts` with:

```ts
import type { GameState, Unit } from '@/core/types';
import { cleanupDeadSpyUnit } from '@/systems/espionage-system';
import { getUnmovedUnits } from '@/systems/unit-system';

export function skipUnitForTurn(unit: Unit): Unit {
  return {
    ...unit,
    movementPointsLeft: 0,
    isResting: false,
    skippedTurn: true,
  };
}

export function skipUnitInState(state: GameState, civId: string, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== civId) {
    return state;
  }

  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: skipUnitForTurn(unit),
    },
  };
}

export function removePlayerUnitFromState(state: GameState, civId: string, unitId: string): GameState {
  const unit = state.units[unitId];
  const civ = state.civilizations[civId];
  if (!unit || unit.owner !== civId || !civ) {
    return state;
  }

  const { [unitId]: _removedUnit, ...remainingUnits } = state.units;
  const nextEspionage = state.espionage
    ? cleanupDeadSpyUnit(state.espionage, civId, unitId)
    : state.espionage;

  return {
    ...state,
    units: remainingUnits,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        units: civ.units.filter(id => id !== unitId),
      },
    },
    espionage: nextEspionage,
  };
}

export function getUnmovedUnitsForEndTurn(state: GameState, civId: string): Unit[] {
  const civ = state.civilizations[civId];
  if (!civ) {
    return [];
  }

  const roster = new Set(civ.units);
  return getUnmovedUnits(state.units, civId).filter(unit => roster.has(unit.id));
}
```

- [ ] **Step 7: Run the unit lifecycle tests to verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/unit-lifecycle-system.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the unit lifecycle helpers**

Run:

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/unit-lifecycle-system.ts tests/systems/unit-system.test.ts tests/systems/unit-lifecycle-system.test.ts
git commit -m "feat(ui): add unit lifecycle helpers"
```

### Task 2: Selected Unit Skip And Delete Actions

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `tests/ui/selected-unit-info.test.ts`

- [ ] **Step 1: Add failing selected-unit action tests**

Append these tests inside `describe('renderSelectedUnitInfo — spy disguise buttons', () => { ... })` in `tests/ui/selected-unit-info.test.ts`:

```ts
  it('renders Skip Turn for a unit with movement remaining and calls onSkipTurn with the unit id', () => {
    const state = makeSpyState([]);
    const container = new MockElement('div');
    let skippedUnitId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSkipTurn: unitId => { skippedUnitId = unitId; },
    });

    const skipButton = findButtons(container).find(button => button.textContent === 'Skip Turn');
    expect(skipButton).toBeDefined();

    skipButton?.click();

    expect(skippedUnitId).toBe('unit-1');
  });

  it('hides Skip Turn once the unit has already acted', () => {
    const state = makeSpyState([]);
    state.units['unit-1'] = { ...state.units['unit-1'], hasActed: true, movementPointsLeft: 0 } as any;
    const container = new MockElement('div');

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onSkipTurn: () => {},
    });

    const buttons = findButtons(container).map(button => button.textContent);
    expect(buttons).not.toContain('Skip Turn');
  });

  it('renders Delete Unit and calls onDeleteUnit with the unit id without deleting immediately', () => {
    const state = makeSpyState([]);
    const container = new MockElement('div');
    let deleteUnitId: string | null = null;

    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'unit-1', {
      onDeleteUnit: unitId => { deleteUnitId = unitId; },
    });

    const deleteButton = findButtons(container).find(button => button.textContent === 'Delete Unit');
    expect(deleteButton).toBeDefined();

    deleteButton?.click();

    expect(deleteUnitId).toBe('unit-1');
    expect(state.units['unit-1']).toBeDefined();
  });
```

- [ ] **Step 2: Run selected-unit tests to verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/selected-unit-info.test.ts
```

Expected: FAIL because `onSkipTurn` and `onDeleteUnit` are not in `SelectedUnitInfoCallbacks`, and the buttons do not render.

- [ ] **Step 3: Add callbacks and buttons to selected-unit info**

In `src/ui/selected-unit-info.ts`, update `SelectedUnitInfoCallbacks` to:

```ts
export interface SelectedUnitInfoCallbacks {
  onClose?: () => void;
  onFoundCity?: () => void;
  onBuildFarm?: () => void;
  onBuildMine?: () => void;
  onRest?: () => void;
  onSkipTurn?: (unitId: string) => void;
  onDeleteUnit?: (unitId: string) => void;
  onCancelAutoExplore?: () => void;
  onSetDisguise?: (unitId: string, disguise: DisguiseType | null) => void;
  onInfiltrate?: (unitId: string) => void;
  onEmbed?: (unitId: string) => void;
  onUpgradeUnit?: (unitId: string, cityId: string) => void;
}
```

After the existing `Rest (+15 HP)` button block, add:

```ts
  if (unit.movementPointsLeft > 0 && !unit.hasActed && callbacks.onSkipTurn) {
    actionsDiv.appendChild(makeButton('Skip Turn', '#5b6472', () => callbacks.onSkipTurn!(unitId)));
  }

  if (callbacks.onDeleteUnit) {
    actionsDiv.appendChild(makeButton('Delete Unit', '#b91c1c', () => callbacks.onDeleteUnit!(unitId)));
  }
```

- [ ] **Step 4: Run selected-unit tests to verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/selected-unit-info.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit selected-unit actions**

Run:

```bash
git add src/ui/selected-unit-info.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(ui): expose unit skip and delete actions"
```

### Task 3: Unit Delete Confirmation Panel

**Files:**
- Create: `src/ui/unit-delete-confirmation-panel.ts`
- Create: `tests/ui/unit-delete-confirmation-panel.test.ts`

- [ ] **Step 1: Write failing delete confirmation panel tests**

Create `tests/ui/unit-delete-confirmation-panel.test.ts` with:

```ts
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';

function clickButtonWithText(container: ParentNode, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text);
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('unit-delete-confirmation-panel', () => {
  it('shows the target unit and waits for explicit confirmation', () => {
    const onConfirm = vi.fn();

    const panel = createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Scout',
      onConfirm,
      onCancel: vi.fn(),
    });

    expect(panel.textContent).toContain('Delete Scout?');
    expect(panel.textContent).toContain('This removes the unit permanently.');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm only when the confirmation delete button is clicked', () => {
    const onConfirm = vi.fn();

    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Warrior',
      onConfirm,
      onCancel: vi.fn(),
    });

    clickButtonWithText(document.body, 'Delete Unit');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();

    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Worker',
      onConfirm: vi.fn(),
      onCancel,
    });

    clickButtonWithText(document.body, 'Cancel');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('replaces a stale confirmation panel when reopened', () => {
    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Scout',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });
    createUnitDeleteConfirmationPanel(document.body, {
      unitName: 'Warrior',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.querySelectorAll('#unit-delete-confirmation-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Delete Warrior?');
    expect(document.body.textContent).not.toContain('Delete Scout?');
  });
});
```

- [ ] **Step 2: Run delete confirmation tests to verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/unit-delete-confirmation-panel.test.ts
```

Expected: FAIL because `src/ui/unit-delete-confirmation-panel.ts` does not exist.

- [ ] **Step 3: Create the delete confirmation panel implementation**

Create `src/ui/unit-delete-confirmation-panel.ts` with:

```ts
export interface UnitDeleteConfirmationConfig {
  unitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function createButton(label: string, styles: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = styles;
  button.addEventListener('click', onClick);
  return button;
}

export function createUnitDeleteConfirmationPanel(
  container: HTMLElement,
  config: UnitDeleteConfirmationConfig,
): HTMLElement {
  container.querySelector('#unit-delete-confirmation-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'unit-delete-confirmation-panel';
  panel.style.cssText = 'position:absolute;inset:0;z-index:45;background:rgba(9,10,16,0.86);display:flex;align-items:center;justify-content:center;padding:16px;';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'max-width:360px;width:100%;background:#171923;border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:16px;color:white;box-shadow:0 18px 60px rgba(0,0,0,0.45);';

  const title = document.createElement('h2');
  title.textContent = `Delete ${config.unitName}?`;
  title.style.cssText = 'font-size:18px;margin:0 0 8px;color:#fca5a5;';
  dialog.appendChild(title);

  const body = document.createElement('p');
  body.textContent = 'This removes the unit permanently.';
  body.style.cssText = 'font-size:13px;line-height:1.4;margin:0 0 16px;opacity:0.85;';
  dialog.appendChild(body);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
  buttons.appendChild(createButton(
    'Cancel',
    'padding:9px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;cursor:pointer;',
    config.onCancel,
  ));
  buttons.appendChild(createButton(
    'Delete Unit',
    'padding:9px 14px;border-radius:8px;border:0;background:#b91c1c;color:white;cursor:pointer;font-weight:bold;',
    config.onConfirm,
  ));
  dialog.appendChild(buttons);

  panel.appendChild(dialog);
  container.appendChild(panel);
  return panel;
}
```

- [ ] **Step 4: Run delete confirmation tests to verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/unit-delete-confirmation-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit delete confirmation panel**

Run:

```bash
git add src/ui/unit-delete-confirmation-panel.ts tests/ui/unit-delete-confirmation-panel.test.ts
git commit -m "feat(ui): add unit delete confirmation"
```

### Task 4: End-Turn Unmoved Unit Warning Panel

**Files:**
- Create: `src/ui/end-turn-warning-panel.ts`
- Create: `tests/ui/end-turn-warning-panel.test.ts`

- [ ] **Step 1: Write failing end-turn warning panel tests**

Create `tests/ui/end-turn-warning-panel.test.ts` with:

```ts
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createEndTurnWarningPanel } from '@/ui/end-turn-warning-panel';

function clickButtonWithText(container: ParentNode, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text);
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('end-turn-warning-panel', () => {
  it('shows the unmoved unit count and unit list', () => {
    const panel = createEndTurnWarningPanel(document.body, {
      unmovedUnits: [
        { unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' },
        { unitId: 'unit-2', label: 'Warrior', positionLabel: '4, 1' },
      ],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(panel.textContent).toContain('2 units still need orders');
    expect(panel.textContent).toContain('Scout at 2, 3');
    expect(panel.textContent).toContain('Warrior at 4, 1');
  });

  it('sends the first unmoved unit id when Go to Unit is clicked', () => {
    const onGoToUnit = vi.fn();

    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [
        { unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' },
        { unitId: 'unit-2', label: 'Warrior', positionLabel: '4, 1' },
      ],
      onGoToUnit,
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });

    clickButtonWithText(document.body, 'Go to Unit');

    expect(onGoToUnit).toHaveBeenCalledWith('unit-1');
  });

  it('calls onEndTurnAnyway only when the bypass button is clicked', () => {
    const onEndTurnAnyway = vi.fn();

    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway,
      onCancel: vi.fn(),
    });

    clickButtonWithText(document.body, 'End Turn Anyway');

    expect(onEndTurnAnyway).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();

    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel,
    });

    clickButtonWithText(document.body, 'Cancel');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('replaces a stale warning panel when recreated', () => {
    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-1', label: 'Scout', positionLabel: '2, 3' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });
    createEndTurnWarningPanel(document.body, {
      unmovedUnits: [{ unitId: 'unit-2', label: 'Worker', positionLabel: '5, 5' }],
      onGoToUnit: vi.fn(),
      onEndTurnAnyway: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.querySelectorAll('#end-turn-warning-panel')).toHaveLength(1);
    expect(document.body.textContent).toContain('Worker at 5, 5');
    expect(document.body.textContent).not.toContain('Scout at 2, 3');
  });
});
```

- [ ] **Step 2: Run end-turn warning tests to verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/end-turn-warning-panel.test.ts
```

Expected: FAIL because `src/ui/end-turn-warning-panel.ts` does not exist.

- [ ] **Step 3: Create the end-turn warning panel implementation**

Create `src/ui/end-turn-warning-panel.ts` with:

```ts
export interface EndTurnWarningUnit {
  unitId: string;
  label: string;
  positionLabel: string;
}

export interface EndTurnWarningConfig {
  unmovedUnits: EndTurnWarningUnit[];
  onGoToUnit: (unitId: string) => void;
  onEndTurnAnyway: () => void;
  onCancel: () => void;
}

function createButton(label: string, styles: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = styles;
  button.addEventListener('click', onClick);
  return button;
}

export function createEndTurnWarningPanel(
  container: HTMLElement,
  config: EndTurnWarningConfig,
): HTMLElement {
  container.querySelector('#end-turn-warning-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'end-turn-warning-panel';
  panel.style.cssText = 'position:absolute;inset:0;z-index:44;background:rgba(9,10,16,0.86);display:flex;align-items:center;justify-content:center;padding:16px;';

  const dialog = document.createElement('div');
  dialog.style.cssText = 'max-width:420px;width:100%;background:#171923;border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:16px;color:white;box-shadow:0 18px 60px rgba(0,0,0,0.45);';

  const count = config.unmovedUnits.length;
  const title = document.createElement('h2');
  title.textContent = `${count} ${count === 1 ? 'unit still needs' : 'units still need'} orders`;
  title.style.cssText = 'font-size:18px;margin:0 0 8px;color:#e8c170;';
  dialog.appendChild(title);

  const body = document.createElement('p');
  body.textContent = 'End the turn anyway, or jump to an unmoved unit first?';
  body.style.cssText = 'font-size:13px;line-height:1.4;margin:0 0 12px;opacity:0.85;';
  dialog.appendChild(body);

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0 0 16px;padding-left:18px;font-size:12px;line-height:1.5;';
  for (const unit of config.unmovedUnits.slice(0, 6)) {
    const item = document.createElement('li');
    item.textContent = `${unit.label} at ${unit.positionLabel}`;
    list.appendChild(item);
  }
  if (config.unmovedUnits.length > 6) {
    const item = document.createElement('li');
    item.textContent = `${config.unmovedUnits.length - 6} more`;
    list.appendChild(item);
  }
  dialog.appendChild(list);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
  buttons.appendChild(createButton(
    'Cancel',
    'padding:9px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:white;cursor:pointer;',
    config.onCancel,
  ));
  buttons.appendChild(createButton(
    'Go to Unit',
    'padding:9px 14px;border-radius:8px;border:1px solid rgba(232,193,112,0.6);background:rgba(232,193,112,0.12);color:#f8e5b8;cursor:pointer;font-weight:bold;',
    () => config.onGoToUnit(config.unmovedUnits[0].unitId),
  ));
  buttons.appendChild(createButton(
    'End Turn Anyway',
    'padding:9px 14px;border-radius:8px;border:0;background:#b45309;color:white;cursor:pointer;font-weight:bold;',
    config.onEndTurnAnyway,
  ));
  dialog.appendChild(buttons);

  panel.appendChild(dialog);
  container.appendChild(panel);
  return panel;
}
```

- [ ] **Step 4: Run end-turn warning tests to verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/end-turn-warning-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit end-turn warning panel**

Run:

```bash
git add src/ui/end-turn-warning-panel.ts tests/ui/end-turn-warning-panel.test.ts
git commit -m "feat(ui): warn before ending with unmoved units"
```

### Task 5: Unit Turn Flow Controller And Main Wiring

**Files:**
- Create: `src/ui/unit-turn-flow.ts`
- Create: `tests/ui/unit-turn-flow.test.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Test: `tests/systems/unit-lifecycle-system.test.ts`
- Test: `tests/systems/unit-system.test.ts`
- Test: `tests/ui/selected-unit-info.test.ts`
- Test: `tests/ui/unit-delete-confirmation-panel.test.ts`
- Test: `tests/ui/end-turn-warning-panel.test.ts`
- Test: `tests/ui/unit-turn-flow.test.ts`
- Test: `tests/integration/end-turn-gating.test.ts`

- [ ] **Step 1: Write failing live-flow seam tests**

Create `tests/ui/unit-turn-flow.test.ts` with:

```ts
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { GameState, HexCoord } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { createUnitTurnFlow, type UnitTurnFlowDeps } from '@/ui/unit-turn-flow';

function clickButtonWithText(container: ParentNode, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text);
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function makeState(): GameState {
  const scout = { ...createUnit('scout', 'player', { q: 2, r: 3 }), id: 'unit-scout', health: 50 };
  const warrior = { ...createUnit('warrior', 'player', { q: 4, r: 3 }), id: 'unit-warrior' };
  const enemy = { ...createUnit('warrior', 'ai-1', { q: 7, r: 7 }), id: 'unit-enemy' };
  return {
    turn: 1,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {} },
    units: {
      [scout.id]: scout,
      [warrior.id]: warrior,
      [enemy.id]: enemy,
    },
    cities: {},
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        civType: 'rome',
        color: '#fff',
        cities: [],
        units: [scout.id, warrior.id],
        gold: 0,
        score: 0,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [] },
        visibility: { tiles: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], tradeRoutes: [], diplomaticCapital: 0 },
      },
      'ai-1': {
        id: 'ai-1',
        name: 'AI',
        civType: 'greece',
        color: '#f00',
        cities: [],
        units: [enemy.id],
        gold: 0,
        score: 0,
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [] },
        visibility: { tiles: {} },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], tradeRoutes: [], diplomaticCapital: 0 },
      },
    },
    minorCivs: {},
    barbarianCamps: {},
    villages: {},
    pendingEvents: undefined,
    settings: {
      soundEnabled: false,
      musicEnabled: false,
      musicVolume: 0,
      sfxVolume: 0,
      tutorialEnabled: false,
      advisorsEnabled: false,
      councilTalkLevel: 'minimal',
    },
  } as unknown as GameState;
}

function makeFlow(initialState: GameState) {
  let state = initialState;
  let selectedUnitId: string | null = 'unit-scout';
  const overlayStates: Array<string | null> = [];
  const calls = {
    selectUnit: vi.fn((unitId: string) => { selectedUnitId = unitId; }),
    deselectUnit: vi.fn(() => { selectedUnitId = null; }),
    selectNextUnit: vi.fn(),
    centerOn: vi.fn(),
    refreshVisibility: vi.fn(),
    setRenderState: vi.fn(),
    updateHUD: vi.fn(),
    showNotification: vi.fn(),
    endTurn: vi.fn(),
  };
  const deps: UnitTurnFlowDeps = {
    uiLayer: document.body,
    getState: () => state,
    setState: next => { state = next; },
    getSelectedUnitId: () => selectedUnitId,
    selectUnit: calls.selectUnit,
    deselectUnit: calls.deselectUnit,
    selectNextUnit: calls.selectNextUnit,
    centerOn: calls.centerOn,
    refreshVisibility: calls.refreshVisibility,
    setRenderState: calls.setRenderState,
    updateHUD: calls.updateHUD,
    showNotification: calls.showNotification,
    setBlockingOverlay: id => { overlayStates.push(id); },
    endTurn: calls.endTurn,
  };

  return {
    flow: createUnitTurnFlow(deps),
    getState: () => state,
    calls,
    overlayStates,
  };
}

describe('unit-turn-flow', () => {
  it('skips the selected unit, updates render/HUD, and advances unit cycling', () => {
    const { flow, getState, calls } = makeFlow(makeState());

    flow.skipUnitAction('unit-scout');

    expect(getState().units['unit-scout'].skippedTurn).toBe(true);
    expect(getState().units['unit-scout'].hasMoved).toBe(false);
    expect(getState().units['unit-scout'].hasActed).toBe(false);
    expect(calls.setRenderState).toHaveBeenCalledWith(getState());
    expect(calls.updateHUD).toHaveBeenCalledTimes(1);
    expect(calls.selectNextUnit).toHaveBeenCalledTimes(1);
  });

  it('opens delete confirmation without mutating state and clears overlay on cancel', () => {
    const { flow, getState, overlayStates } = makeFlow(makeState());

    flow.showDeleteUnitConfirmation('unit-scout');

    expect(document.querySelector('#unit-delete-confirmation-panel')).toBeTruthy();
    expect(getState().units['unit-scout']).toBeDefined();
    expect(overlayStates).toEqual(['unit-delete-confirmation']);

    clickButtonWithText(document.body, 'Cancel');

    expect(getState().units['unit-scout']).toBeDefined();
    expect(document.querySelector('#unit-delete-confirmation-panel')).toBeNull();
    expect(overlayStates).toEqual(['unit-delete-confirmation', null]);
  });

  it('confirms deletion, refreshes visibility, clears overlay, and advances unit cycling', () => {
    const { flow, getState, calls, overlayStates } = makeFlow(makeState());

    flow.showDeleteUnitConfirmation('unit-scout');
    clickButtonWithText(document.body, 'Delete Unit');

    expect(getState().units['unit-scout']).toBeUndefined();
    expect(getState().civilizations.player.units).not.toContain('unit-scout');
    expect(calls.refreshVisibility).toHaveBeenCalledTimes(1);
    expect(calls.setRenderState).toHaveBeenCalledWith(getState());
    expect(calls.updateHUD).toHaveBeenCalledTimes(1);
    expect(calls.deselectUnit).toHaveBeenCalledTimes(1);
    expect(calls.selectNextUnit).toHaveBeenCalledTimes(1);
    expect(overlayStates).toEqual(['unit-delete-confirmation', null]);
  });

  it('opens an end-turn warning and routes Go to Unit through selection and camera centering', () => {
    const { flow, calls, overlayStates } = makeFlow(makeState());

    const blocked = flow.showEndTurnUnitWarningIfNeeded();

    expect(blocked).toBe(true);
    expect(document.body.textContent).toContain('units still need orders');
    expect(overlayStates).toEqual(['end-turn-warning']);

    clickButtonWithText(document.body, 'Go to Unit');

    expect(document.querySelector('#end-turn-warning-panel')).toBeNull();
    expect(calls.selectUnit).toHaveBeenCalledWith('unit-scout');
    expect(calls.centerOn).toHaveBeenCalledWith({ q: 2, r: 3 });
    expect(overlayStates).toEqual(['end-turn-warning', null]);
  });

  it('bypasses only the unit warning when End Turn Anyway is clicked', () => {
    const { flow, calls, overlayStates } = makeFlow(makeState());

    flow.showEndTurnUnitWarningIfNeeded();
    clickButtonWithText(document.body, 'End Turn Anyway');

    expect(document.querySelector('#end-turn-warning-panel')).toBeNull();
    expect(calls.endTurn).toHaveBeenCalledWith({ allowUnmovedUnits: true });
    expect(overlayStates).toEqual(['end-turn-warning', null]);
  });

  it('does not show an end-turn warning when all current-player units are moved, acted, or skipped', () => {
    const state = makeState();
    state.units['unit-scout'] = { ...state.units['unit-scout'], skippedTurn: true, movementPointsLeft: 0 };
    state.units['unit-warrior'] = { ...state.units['unit-warrior'], hasMoved: true, movementPointsLeft: 0 };
    const { flow, overlayStates } = makeFlow(state);

    const blocked = flow.showEndTurnUnitWarningIfNeeded();

    expect(blocked).toBe(false);
    expect(document.querySelector('#end-turn-warning-panel')).toBeNull();
    expect(overlayStates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run live-flow seam tests to verify they fail**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/unit-turn-flow.test.ts
```

Expected: FAIL because `src/ui/unit-turn-flow.ts` does not exist.

- [ ] **Step 3: Create the unit turn flow implementation**

Create `src/ui/unit-turn-flow.ts` with:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { getUnmovedUnitsForEndTurn, removePlayerUnitFromState, skipUnitInState } from '@/systems/unit-lifecycle-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { createEndTurnWarningPanel } from '@/ui/end-turn-warning-panel';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';

export interface UnitTurnFlowDeps {
  uiLayer: HTMLElement;
  getState: () => GameState;
  setState: (state: GameState) => void;
  getSelectedUnitId: () => string | null;
  selectUnit: (unitId: string) => void;
  deselectUnit: () => void;
  selectNextUnit: () => void;
  centerOn: (coord: HexCoord) => void;
  refreshVisibility: () => void;
  setRenderState: (state: GameState) => void;
  updateHUD: () => void;
  showNotification: (message: string, type: 'info' | 'success' | 'warning') => void;
  setBlockingOverlay: (id: string | null) => void;
  endTurn: (options: { allowUnmovedUnits?: boolean }) => void;
}

export interface UnitTurnFlow {
  skipUnitAction(unitId: string): void;
  showDeleteUnitConfirmation(unitId: string): void;
  showEndTurnUnitWarningIfNeeded(): boolean;
}

export function createUnitTurnFlow(deps: UnitTurnFlowDeps): UnitTurnFlow {
  const closeUnitDeleteConfirmation = (): void => {
    deps.uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
    deps.setBlockingOverlay(null);
  };

  const closeEndTurnWarningPanel = (): void => {
    deps.uiLayer.querySelector('#end-turn-warning-panel')?.remove();
    deps.setBlockingOverlay(null);
  };

  const skipUnitAction = (unitId: string): void => {
    const state = deps.getState();
    const unit = state.units[unitId];
    if (!unit || unit.owner !== state.currentPlayer) return;

    const nextState = skipUnitInState(state, state.currentPlayer, unitId);
    deps.setState(nextState);
    deps.showNotification(`${UNIT_DEFINITIONS[unit.type].name} will hold position this turn.`, 'info');
    deps.setRenderState(deps.getState());
    deps.updateHUD();

    if (deps.getSelectedUnitId() === unitId) {
      deps.selectNextUnit();
    }
  };

  const showDeleteUnitConfirmation = (unitId: string): void => {
    const state = deps.getState();
    const unit = state.units[unitId];
    if (!unit || unit.owner !== state.currentPlayer) return;

    deps.setBlockingOverlay('unit-delete-confirmation');
    createUnitDeleteConfirmationPanel(deps.uiLayer, {
      unitName: UNIT_DEFINITIONS[unit.type].name,
      onConfirm: () => {
        const currentState = deps.getState();
        const currentUnit = currentState.units[unitId];
        const deletedName = currentUnit ? UNIT_DEFINITIONS[currentUnit.type].name : UNIT_DEFINITIONS[unit.type].name;
        closeUnitDeleteConfirmation();
        deps.setState(removePlayerUnitFromState(currentState, currentState.currentPlayer, unitId));
        if (deps.getSelectedUnitId() === unitId) {
          deps.deselectUnit();
        }
        deps.refreshVisibility();
        deps.setRenderState(deps.getState());
        deps.updateHUD();
        deps.showNotification(`${deletedName} deleted.`, 'warning');
        deps.selectNextUnit();
      },
      onCancel: () => {
        closeUnitDeleteConfirmation();
        if (deps.getState().units[unitId]) {
          deps.selectUnit(unitId);
        }
      },
    });
  };

  const showEndTurnUnitWarningIfNeeded = (): boolean => {
    const state = deps.getState();
    const unmovedUnits = getUnmovedUnitsForEndTurn(state, state.currentPlayer);
    if (unmovedUnits.length === 0) {
      return false;
    }

    deps.setBlockingOverlay('end-turn-warning');
    createEndTurnWarningPanel(deps.uiLayer, {
      unmovedUnits: unmovedUnits.map(unit => ({
        unitId: unit.id,
        label: UNIT_DEFINITIONS[unit.type].name,
        positionLabel: `${unit.position.q}, ${unit.position.r}`,
      })),
      onGoToUnit: unitId => {
        closeEndTurnWarningPanel();
        const target = deps.getState().units[unitId];
        if (!target) return;
        deps.selectUnit(unitId);
        deps.centerOn(target.position);
        deps.updateHUD();
      },
      onEndTurnAnyway: () => {
        closeEndTurnWarningPanel();
        deps.endTurn({ allowUnmovedUnits: true });
      },
      onCancel: () => {
        closeEndTurnWarningPanel();
      },
    });

    return true;
  };

  return {
    skipUnitAction,
    showDeleteUnitConfirmation,
    showEndTurnUnitWarningIfNeeded,
  };
}
```

- [ ] **Step 4: Run live-flow seam tests to verify they pass**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/unit-turn-flow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update imports in `src/main.ts`**

Add these imports near the existing UI/system imports:

```ts
import { createUnitTurnFlow } from '@/ui/unit-turn-flow';
```

- [ ] **Step 6: Add a current-player visibility refresh helper in `src/main.ts`**

Add this helper after `selectNextUnit()` and before `foundCityAction()`:

```ts
function refreshCurrentPlayerVisibility(): void {
  const civ = currentCiv();
  if (!civ?.visibility) return;

  const playerUnits = civ.units
    .map(id => gameState.units[id])
    .filter((unit): unit is Unit => unit !== undefined);
  const cityPositions = civ.cities
    .map(id => gameState.cities[id]?.position)
    .filter((position): position is HexCoord => position !== undefined);

  updateVisibility(civ.visibility, playerUnits, gameState.map, cityPositions);
  syncCivilizationContactsFromVisibility(gameState, gameState.currentPlayer);
}
```

- [ ] **Step 7: Add a flow factory in `src/main.ts`**

Add this helper after `refreshCurrentPlayerVisibility()`:

```ts
function getUnitTurnFlow() {
  return createUnitTurnFlow({
    uiLayer,
    getState: () => gameState,
    setState: nextState => { gameState = nextState; },
    getSelectedUnitId: () => selectedUnitId,
    selectUnit,
    deselectUnit,
    selectNextUnit,
    centerOn: coord => renderLoop.camera.centerOn(coord),
    refreshVisibility: refreshCurrentPlayerVisibility,
    setRenderState: state => renderLoop.setGameState(state),
    updateHUD,
    showNotification,
    setBlockingOverlay: id => uiInteractions.setBlockingOverlay(id),
    endTurn: options => { void endTurn(options); },
  });
}

```

- [ ] **Step 8: Add selected-unit callbacks**

Inside the `renderSelectedUnitInfo(panel, gameState, unitId, { ... })` callback object in `selectUnit`, add these callbacks after `onRest`:

```ts
      onSkipTurn: uid => getUnitTurnFlow().skipUnitAction(uid),
      onDeleteUnit: uid => getUnitTurnFlow().showDeleteUnitConfirmation(uid),
```

- [ ] **Step 9: Change the end-turn signature and insert the guard**

Change:

```ts
async function endTurn(): Promise<void> {
```

to:

```ts
async function endTurn(options: { allowUnmovedUnits?: boolean } = {}): Promise<void> {
```

Then, immediately after the existing required-choice guard:

```ts
    if (showRequiredChoicesIfNeeded()) {
      showNotification('Choose production and research before ending the turn.', 'info');
      return;
    }
```

add:

```ts
    if (!options.allowUnmovedUnits && getUnitTurnFlow().showEndTurnUnitWarningIfNeeded()) {
      return;
    }
```

- [ ] **Step 10: Run focused tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/unit-lifecycle-system.test.ts tests/ui/selected-unit-info.test.ts tests/ui/unit-delete-confirmation-panel.test.ts tests/ui/end-turn-warning-panel.test.ts tests/ui/unit-turn-flow.test.ts tests/integration/end-turn-gating.test.ts
```

Expected: PASS.

- [ ] **Step 11: Run source rule checks for changed source files**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/unit-lifecycle-system.ts src/ui/selected-unit-info.ts src/ui/unit-delete-confirmation-panel.ts src/ui/end-turn-warning-panel.ts src/ui/unit-turn-flow.ts src/main.ts
```

Expected: PASS with no rule violations.

- [ ] **Step 12: Build to catch TypeScript errors in `src/main.ts` wiring**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 13: Commit main wiring**

Run:

```bash
git add src/ui/unit-turn-flow.ts tests/ui/unit-turn-flow.test.ts src/main.ts
git commit -m "feat(ui): gate end turn on unmoved units"
```

### Task 6: Manual Browser Smoke Test

**Files:**
- No file edits.

- [ ] **Step 1: Start the dev server**

Run:

```bash
./scripts/run-with-mise.sh yarn dev
```

Expected: Vite prints a local URL, usually `http://localhost:5173/`.

- [ ] **Step 2: Verify skip flow in the browser**

Open the local URL. Start or continue a solo game. Select a friendly unit with movement remaining, click `Skip Turn`.

Expected:

- The unit panel no longer shows that same unit as needing orders.
- The floating Next Unit count decreases by one.
- If another unmoved unit exists, it becomes selected and centered.
- If the skipped unit was wounded and did not move or act, it still receives normal passive healing on the next turn.

- [ ] **Step 3: Verify delete cancel flow in the browser**

Select a friendly unit, click `Delete Unit`, then click `Cancel`.

Expected:

- The confirmation panel closes.
- The unit remains visible on the map.
- The selected-unit panel remains usable for that unit.

- [ ] **Step 4: Verify delete confirm flow in the browser**

Select a friendly unit that is not essential to the current smoke run, click `Delete Unit`, then click confirmation `Delete Unit`.

Expected:

- The unit disappears from the map.
- The confirmation panel closes.
- The Next Unit count updates.
- A deletion notification appears.
- Fog-of-war refreshes immediately; tiles visible only because of the deleted unit downgrade to fog without waiting for the next turn.

- [ ] **Step 5: Verify end-turn warning flow in the browser**

Select no unit, leave at least one current-player unit unmoved, and click `End Turn`.

Expected:

- The end-turn warning appears.
- The warning lists unmoved units.
- `Go to Unit` closes the warning and centers/selects the first listed unit.
- Clicking `End Turn` again recreates the warning if units still need orders.
- `End Turn Anyway` closes the warning and advances the turn after required research/production choices are already resolved.
- After `Go to Unit`, `End Turn Anyway`, or `Cancel`, the map accepts normal taps/clicks again, proving the blocking overlay was cleared.

### Task 7: Final Verification

**Files:**
- No file edits.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/unit-lifecycle-system.test.ts tests/ui/selected-unit-info.test.ts tests/ui/unit-delete-confirmation-panel.test.ts tests/ui/end-turn-warning-panel.test.ts tests/ui/unit-turn-flow.test.ts tests/integration/end-turn-gating.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/unit-lifecycle-system.ts src/ui/selected-unit-info.ts src/ui/unit-delete-confirmation-panel.ts src/ui/end-turn-warning-panel.ts src/ui/unit-turn-flow.ts src/main.ts
```

Expected: PASS with no rule violations.

- [ ] **Step 3: Run production build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

- [ ] **Step 4: Review local diff**

Run:

```bash
git diff --stat
git diff -- src/core/types.ts src/systems/unit-system.ts tests/systems/unit-system.test.ts src/systems/unit-lifecycle-system.ts tests/systems/unit-lifecycle-system.test.ts src/ui/selected-unit-info.ts tests/ui/selected-unit-info.test.ts src/ui/unit-delete-confirmation-panel.ts tests/ui/unit-delete-confirmation-panel.test.ts src/ui/end-turn-warning-panel.ts tests/ui/end-turn-warning-panel.test.ts src/ui/unit-turn-flow.ts tests/ui/unit-turn-flow.test.ts src/main.ts
```

Expected: Diff contains only issue 154 unit lifecycle, skip-turn flag, confirmation, warning, selected-unit, live-flow seam, visibility refresh, and main wiring changes.

- [ ] **Step 5: Commit remaining test and panel files if not already committed**

Run:

```bash
git add src/core/types.ts src/systems/unit-system.ts tests/systems/unit-system.test.ts src/systems/unit-lifecycle-system.ts tests/systems/unit-lifecycle-system.test.ts src/ui/selected-unit-info.ts tests/ui/selected-unit-info.test.ts src/ui/unit-delete-confirmation-panel.ts tests/ui/unit-delete-confirmation-panel.test.ts src/ui/end-turn-warning-panel.ts tests/ui/end-turn-warning-panel.test.ts src/ui/unit-turn-flow.ts tests/ui/unit-turn-flow.test.ts src/main.ts
git commit -m "feat(ui): add basic unit turn controls"
```

Expected: commit succeeds if there are remaining staged changes. If earlier task commits already captured every file, `git status --short` should be clean except for unrelated pre-existing files.

## Self-Review

**Spec coverage:** The plan covers all issue 154 bullets. `Skip` is covered by Tasks 1, 2, and 5, including the gameplay requirement that skip removes the unit from cycling without suppressing passive healing. `Delete` with confirmation is covered by Tasks 1, 2, 3, and 5, including spy cleanup, visibility refresh, and blocking-overlay close paths. End-turn unmoved checks with "are you sure" and a way to go to an unmoved unit are covered by Tasks 1, 4, and 5, including jsdom click-through coverage for `Go to Unit` and `End Turn Anyway`.

**Placeholder scan:** This plan contains concrete file paths, test code, implementation code, commands, and expected outcomes. It does not contain deferred implementation markers.

**Type consistency:** The plan consistently uses `skippedTurn`, `skipUnitForTurn`, `skipUnitInState`, `removePlayerUnitFromState`, `getUnmovedUnitsForEndTurn`, `createUnitDeleteConfirmationPanel`, `createEndTurnWarningPanel`, and `createUnitTurnFlow`. Callback names are consistent between UI interfaces, flow tests, and `src/main.ts` wiring.
