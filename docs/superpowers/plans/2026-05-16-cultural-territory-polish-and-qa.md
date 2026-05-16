# Cultural Territory Polish And QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Keep execution inline unless the current user explicitly authorizes parallel agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the post-merge cultural territory work that the original issue #157 plan still implies: capture-path border notifications, a real frontier inspection surface, replay/no-leak coverage, and balance instrumentation.

**Architecture:** Keep `src/systems/city-territory-system.ts` as the canonical ownership module. Capture, AI, turn, UI, and notification layers must consume structured territory events from that module rather than re-deriving border changes ad hoc. Player-facing inspection belongs in focused DOM helpers under `src/ui/`, while gameplay balance constants stay in the territory system and are covered by deterministic fixtures.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright web smoke tests, Canvas renderer highlights, DOM UI panels, existing `./scripts/run-with-mise.sh yarn` command wrapper.

---

## Source Review

- Original plan: `docs/superpowers/plans/2026-05-15-cultural-territory-worker-improvements.md`
- Original design: `docs/superpowers/specs/2026-05-15-cultural-territory-worker-improvements-design.md`
- Merged PR: `https://github.com/a1flecke/conquestoria/pull/204`
- Closed issue: `https://github.com/a1flecke/conquestoria/issues/157`

The merged work covers the main MR1-MR6 ladder, but this follow-up plan closes five gaps from the original plan-wide guardrails:

- Capture and raze paths recalculate territory, but `territory:tile-flipped` notifications are emitted only from turn/frontier processing.
- AI city captures call the shared capture resolver, but they do not fan out capture-result territory events through the event bus.
- Frontier inspection is currently squeezed into long-press notification text; the spec asks for inspectable holder/challenger/trend/reason information.
- Worker guidance has positive coverage, but needs explicit negative coverage for unexplored foreign tiles and replay behavior after territory changes.
- MR6 balance was not a real tuning pass; pressure and frontier thresholds should be named, tested, and replayed.

## File Map

- Modify `src/systems/city-capture-system.ts`: add territory event payloads to capture/raze results.
- Modify `src/input/city-assault-flow.ts`: preserve capture result event payloads through the player assault flow.
- Modify `src/main.ts`: emit capture result territory events and open the new territory inspection panel from long-press.
- Modify `src/ai/basic-ai.ts`: emit territory events when AI city capture resolves through the shared capture resolver.
- Modify `src/systems/city-territory-system.ts`: extract balance constants and reuse event helpers for capture/frontier outcomes.
- Create `src/ui/territory-inspection-panel.ts`: render frontier and ownership inspection without leaking unexplored map information.
- Reuse `src/ui/territory-frontier-info.ts`: keep the compact frontier summary available inside the inspection panel.
- Modify `tests/systems/city-capture-system.test.ts`: assert capture/raze result territory events.
- Modify `tests/input/city-assault-flow.test.ts`: assert player assault flow preserves territory events.
- Modify `tests/ai/basic-ai.test.ts`: assert AI city capture emits territory tile flip events.
- Modify `tests/ui/territory-inspection-panel.test.ts`: assert visible inspection text and fog/unexplored redaction.
- Modify `tests/input/selected-unit-highlights.test.ts`: assert unexplored foreign plausible tiles are not highlighted.
- Modify `tests/ui/selected-unit-info.test.ts`: assert current-tile worker reason updates after ownership changes.
- Modify `tests/e2e/web-smoke.spec.ts`: add a lightweight browser replay smoke that exercises start surface and worker/territory UI without replacing focused unit tests.

## Player Truth Table

| Before | Action | Internal state change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Player occupies a city with improved tiles | Choose `Occupy` | Capture resolver recalculates territory and returns tile-flip events | Notification log receives border shift entries; current player sees a border shift toast when involved | City capture success toast and city panel access still work |
| AI captures a city on its turn | End turn | AI capture resolver recalculates territory and returns tile-flip events | A civ with visibility or direct ownership involvement receives log entries | Combat/capture turn processing continues |
| Player long-presses a visible contested tile | Long-press tile | No gameplay mutation | Territory inspection panel shows owner, holder city, challenger city, trend, progress, and reason | Existing terrain/improvement information remains visible |
| Player long-presses an unexplored contested tile | Long-press tile | No gameplay mutation | No frontier details are shown; player sees unexplored message | Map does not leak owner/challenger names |
| Worker is selected near unexplored foreign buildable terrain | Select worker | No gameplay mutation | No red worker guidance highlight appears on unexplored tile | Visible/fog-known guidance still appears |
| Worker panel is open and border ownership changes | Rerender selected-unit panel | Tile owner changes through canonical territory helper | Current tile reason changes to `Outside your territory` immediately | Valid build buttons stay reachable on owned valid tiles |

## Misleading UI Risks

- `worker-buildable` must mean at least one worker action is valid for the selected worker's owner right now.
- `worker-foreign-blocked` must not appear on unexplored tiles, even if the tile object exists in state.
- `likely-to-flip` must be derived from persistent `TerritoryFrontierState.progress`, not a fresh scan that ignores saved progress.
- Territory inspection must not show challenger city, holder city, owner, or progress for unexplored tiles.
- Border shift notifications must not be emitted from load/save normalization or steady-state scans.
- Capture and AI paths must use the same event payload shape as turn/frontier flips so notification routing stays consistent.

## Interaction Replay Checklist

- Select worker on owned valid tile; confirm build action is visible.
- Move or simulate ownership loss; rerender selected-unit panel; confirm build action disappears and reason changes.
- Select worker twice after a failed outside-territory action; confirm stale buttons do not mutate state.
- Long-press visible contested tile; close panel; long-press same tile again; confirm fresh panel renders once.
- End turn where culture flips a tile; confirm map owner, city worked tiles, notification log, and frontier cleanup agree.
- Capture a city through the player choice panel; confirm capture message and territory shift notification both appear.
- Run AI turn with adjacent enemy city; confirm AI capture territory events are emitted without blocking the turn.

---

### Task 1: MR7 Capture And AI Territory Flip Events

**Files:**
- Modify: `src/systems/city-capture-system.ts`
- Modify: `src/input/city-assault-flow.ts`
- Modify: `src/main.ts`
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/systems/city-capture-system.test.ts`
- Test: `tests/input/city-assault-flow.test.ts`
- Test: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Write failing capture result event tests**

Add these imports to `tests/systems/city-capture-system.test.ts`:

```ts
import type { GameEvents } from '@/core/types';
```

Add this test inside `describe('city-capture-system', () => { ... })`:

```ts
it('returns territory tile-flipped events when occupation transfers improved territory', () => {
  const state = makeExposedCityCaptureState({ population: 6, buildings: ['granary'] });
  const farmCoord = { q: 1, r: 1 };
  state.map.tiles[hexKey(farmCoord)] = {
    ...state.map.tiles[hexKey(farmCoord)],
    terrain: 'grassland',
    owner: 'ai-1',
    improvement: 'farm',
    improvementTurnsLeft: 0,
  };

  const result = resolveMajorCityCapture(state, 'athens', 'player', 'occupy', state.turn);

  expect(result.territoryEvents).toContainEqual<GameEvents['territory:tile-flipped']>({
    coord: farmCoord,
    previousOwner: 'ai-1',
    newOwner: 'player',
    improvement: 'farm',
    constructionCancelled: false,
  });
});
```

Add this raze edge test:

```ts
it('returns no territory flip event for razed tiles that become neutral', () => {
  const state = makeExposedCityCaptureState({ population: 4, buildings: ['granary'] });
  const ownedCoord = { q: 1, r: 1 };
  state.cities.athens = {
    ...state.cities.athens,
    ownedTiles: [state.cities.athens.position, ownedCoord],
  };
  state.map.tiles[hexKey(ownedCoord)] = {
    ...state.map.tiles[hexKey(ownedCoord)],
    terrain: 'grassland',
    owner: 'ai-1',
    improvement: 'farm',
    improvementTurnsLeft: 0,
  };

  const result = resolveMajorCityCapture(state, 'athens', 'player', 'raze', state.turn);

  expect(result.outcome).toBe('razed');
  expect(result.territoryEvents).toEqual([]);
});
```

- [ ] **Step 2: Run capture tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts
```

Expected: FAIL with `Property 'territoryEvents' does not exist`.

- [ ] **Step 3: Add capture result event payloads**

In `src/systems/city-capture-system.ts`, replace the import line:

```ts
import type { City, GameState, LegendaryWonderProject } from '@/core/types';
```

with:

```ts
import type { City, GameEvents, GameState, LegendaryWonderProject } from '@/core/types';
```

Replace the territory import:

```ts
import { recalculateTerritory } from '@/systems/city-territory-system';
```

with:

```ts
import {
  buildTerritoryTileFlippedEvents,
  recalculateTerritory,
  type TerritoryRecalculationResult,
} from '@/systems/city-territory-system';
```

Add these types and helper after `export type MajorCityCaptureDisposition = 'occupy' | 'raze';`:

```ts
export interface MajorCityCaptureResult {
  state: GameState;
  outcome: 'occupied' | 'razed';
  goldAwarded: number;
  territoryEvents: GameEvents['territory:tile-flipped'][];
}

function finishCaptureTerritoryResult(
  beforeTerritoryState: GameState,
  territoryResult: TerritoryRecalculationResult,
  outcome: MajorCityCaptureResult['outcome'],
  goldAwarded: number,
): MajorCityCaptureResult {
  return {
    state: territoryResult.state,
    outcome,
    goldAwarded,
    territoryEvents: buildTerritoryTileFlippedEvents(
      beforeTerritoryState,
      territoryResult.state,
      territoryResult.resolutions,
    ),
  };
}

function unchangedCaptureResult(
  state: GameState,
  outcome: MajorCityCaptureResult['outcome'],
  goldAwarded: number,
): MajorCityCaptureResult {
  return { state, outcome, goldAwarded, territoryEvents: [] };
}
```

Change the `resolveMajorCityCapture` return type to:

```ts
): MajorCityCaptureResult {
```

Replace every early return in `resolveMajorCityCapture`:

```ts
return { state, outcome: 'razed', goldAwarded: 0 };
```

with:

```ts
return unchangedCaptureResult(state, 'razed', 0);
```

For each `territoryResult` return in `resolveMajorCityCapture`, replace the object literal return with:

```ts
return finishCaptureTerritoryResult(nextState, territoryResult, 'occupied', 0);
```

or for raze:

```ts
return finishCaptureTerritoryResult(nextState, territoryResult, 'razed', goldAwarded);
```

For the breakaway reconquest branch, use the `nextState` created in that branch:

```ts
return finishCaptureTerritoryResult(nextState, territoryResult, 'occupied', 0);
```

- [ ] **Step 4: Preserve event payloads through player assault flow**

In `src/input/city-assault-flow.ts`, change the import:

```ts
import { computeRazeGold, resolveMajorCityCapture, type MajorCityCaptureDisposition } from '@/systems/city-capture-system';
```

to:

```ts
import {
  computeRazeGold,
  resolveMajorCityCapture,
  type MajorCityCaptureDisposition,
  type MajorCityCaptureResult,
} from '@/systems/city-capture-system';
```

Change the `finalizePlayerCityAssaultChoice` return type:

```ts
): { state: GameState; outcome: 'occupied' | 'razed'; goldAwarded: number } {
```

to:

```ts
): MajorCityCaptureResult {
```

Add this test to `tests/input/city-assault-flow.test.ts`:

```ts
it('preserves territory flip events when finalizing an occupied city', () => {
  const state = makeAssaultState();
  const farmCoord = { q: 1, r: 0 };
  state.map.tiles[hexKey(farmCoord)] = {
    ...state.map.tiles[hexKey(farmCoord)],
    terrain: 'grassland',
    owner: 'ai-1',
    improvement: 'farm',
    improvementTurnsLeft: 0,
  };

  const begun = beginPlayerCityAssaultChoice(state, 'unit-1', 'athens');
  const result = finalizePlayerCityAssaultChoice(begun.state, begun.pending, 'occupy', begun.state.turn);

  expect(result.territoryEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({
      previousOwner: 'ai-1',
      newOwner: 'player',
      improvement: 'farm',
    }),
  ]));
});
```

- [ ] **Step 5: Emit player capture events from main**

In `src/main.ts`, add this helper near `finalizePendingCityCaptureChoice`:

```ts
function emitTerritoryTileFlippedEvents(events: GameEvents['territory:tile-flipped'][]): void {
  for (const event of events) {
    bus.emit('territory:tile-flipped', event);
  }
}
```

In `src/main.ts`, extend the existing type import:

```ts
import type { GameState, HexCoord, Unit, UnitType, DiplomaticAction, CivBonusEffect, WorkerActionType } from '@/core/types';
```

to:

```ts
import type { GameEvents, GameState, HexCoord, Unit, UnitType, DiplomaticAction, CivBonusEffect, WorkerActionType } from '@/core/types';
```

Inside `finalizePendingCityCaptureChoice`, immediately after:

```ts
gameState = result.state;
```

add:

```ts
emitTerritoryTileFlippedEvents(result.territoryEvents);
```

- [ ] **Step 6: Emit AI capture events**

In `src/ai/basic-ai.ts`, after:

```ts
newState = captureResult.state;
```

add:

```ts
for (const event of captureResult.territoryEvents) {
  bus.emit('territory:tile-flipped', event);
}
```

Add this type import to the top of `tests/ai/basic-ai.test.ts`:

```ts
import type { GameEvents } from '@/core/types';
```

Add this test near the existing city capture tests:

```ts
it('emits territory tile-flipped events when AI captures an improved city tile', () => {
  const state = createNewGame(undefined, 'ai-city-capture-territory-event', 'small');
  state.currentPlayer = 'player';
  state.cities = {};
  state.units = {};
  state.civilizations.player.cities = [];
  state.civilizations.player.units = [];
  state.civilizations['ai-1'].cities = [];
  state.civilizations['ai-1'].units = [];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

  state.cities.playerCity = {
    ...foundCity('player', { q: 3, r: 3 }, state.map),
    id: 'playerCity',
    owner: 'player',
    position: { q: 3, r: 3 },
    population: 4,
    ownedTiles: [{ q: 3, r: 3 }],
  };
  state.civilizations.player.cities = ['playerCity'];
  state.map.tiles[hexKey({ q: 3, r: 3 })] = {
    ...state.map.tiles[hexKey({ q: 3, r: 3 })],
    terrain: 'grassland',
    owner: 'player',
    improvement: 'farm',
    improvementTurnsLeft: 0,
  };

  state.units.aiWarrior = {
    ...createUnit('warrior', 'ai-1', { q: 2, r: 3 }),
    id: 'aiWarrior',
    movementPointsLeft: 2,
  };
  state.civilizations['ai-1'].units = ['aiWarrior'];

  const bus = new EventBus();
  const territoryEvents: GameEvents['territory:tile-flipped'][] = [];
  bus.on('territory:tile-flipped', event => territoryEvents.push(event));

  processAITurn(state, 'ai-1', bus);

  expect(territoryEvents).toContainEqual(expect.objectContaining({
    coord: { q: 3, r: 3 },
    previousOwner: 'player',
    newOwner: 'ai-1',
    improvement: 'farm',
    constructionCancelled: false,
  }));
});
```

The file already imports `EventBus`, `foundCity`, `hexKey`, and `createUnit`; add only the `GameEvents` type import shown above.

- [ ] **Step 7: Run checks and commit MR7**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/city-capture-system.ts src/input/city-assault-flow.ts src/main.ts src/ai/basic-ai.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/input/city-assault-flow.test.ts tests/ai/basic-ai.test.ts tests/ui/notification-routing.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/systems/city-capture-system.ts src/input/city-assault-flow.ts src/main.ts src/ai/basic-ai.ts tests/systems/city-capture-system.test.ts tests/input/city-assault-flow.test.ts tests/ai/basic-ai.test.ts
git commit -m "feat(territory): emit capture border notifications"
```

---

### Task 2: MR8 Territory Inspection Panel

**Files:**
- Create: `src/ui/territory-inspection-panel.ts`
- Modify: `src/ui/territory-frontier-info.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/territory-inspection-panel.test.ts`
- Test: `tests/ui/territory-frontier-info.test.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
|---|---|---|
| Visible owned tile without frontier | Long-press tile | Panel shows terrain, owner civ, holder city when known, improvement/resource/wonder |
| Visible contested tile | Long-press tile | Panel shows owner, holder city, challenger city, progress text, trend, and frontier reason |
| Fog-known tile | Long-press tile | Panel shows last-known terrain summary and hides live frontier challenger details |
| Unexplored tile | Long-press tile | Existing unexplored message remains; no panel opens |

**Misleading UI Risks:**

- Do not show frontier progress for fog or unexplored tiles.
- Do not claim a tile is `likely-to-flip` unless `frontier.trend === 'likely-to-flip'`.
- If holder/challenger city records are missing, show civ names and omit city names instead of rendering broken ids as authoritative labels.

- [ ] **Step 1: Create failing territory inspection UI tests**

Create `tests/ui/territory-inspection-panel.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { createTerritoryInspectionPanel } from '@/ui/territory-inspection-panel';

describe('createTerritoryInspectionPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function makeInspectionState(): GameState {
    const state = createNewGame(undefined, 'territory-inspection-panel', 'small');
    state.cities = {};
    state.civilizations.player.cities = [];
    state.civilizations['ai-1'].cities = [];

    const holder = foundCity('player', { q: 5, r: 5 }, state.map);
    holder.id = 'holder-city';
    holder.name = 'Rome';
    const challenger = foundCity('ai-1', { q: 8, r: 5 }, state.map);
    challenger.id = 'challenger-city';
    challenger.name = 'Athens';
    state.cities[holder.id] = holder;
    state.cities[challenger.id] = challenger;
    state.civilizations.player.cities = [holder.id];
    state.civilizations['ai-1'].cities = [challenger.id];

    const coord = { q: 6, r: 5 };
    state.map.tiles[hexKey(coord)] = {
      ...state.map.tiles[hexKey(coord)],
      coord,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
      resource: 'wheat',
    };
    state.civilizations.player.visibility.tiles[hexKey(coord)] = 'visible';
    state.territoryFrontiers = {
      [hexKey(coord)]: {
        coord,
        holderCivId: 'player',
        challengerCivId: 'ai-1',
        holderCityId: holder.id,
        challengerCityId: challenger.id,
        progress: 8,
        trend: 'likely-to-flip',
        reason: 'ai-1 cultural pressure is challenging player.',
      },
    };
    return state;
  }

  it('renders visible frontier holder, challenger, progress, trend, and reason', () => {
    const state = makeInspectionState();
    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.dataset.territoryInspection).toBe('visible');
    expect(panel.textContent).toContain('Grassland');
    expect(panel.textContent).toContain('Owner: Player');
    expect(panel.textContent).toContain('Held by: Rome');
    expect(panel.textContent).toContain('Challenger: Athens');
    expect(panel.textContent).toContain('Progress: 8/10');
    expect(panel.textContent).toContain('Border likely to shift');
    expect(panel.textContent).toContain('cultural pressure');
  });

  it('redacts frontier details for fog-known tiles', () => {
    const state = makeInspectionState();
    state.civilizations.player.visibility.tiles['6,5'] = 'fog';

    const panel = createTerritoryInspectionPanel(state, { q: 6, r: 5 }, 'player');

    expect(panel.dataset.territoryInspection).toBe('fog');
    expect(panel.textContent).toContain('Grassland');
    expect(panel.textContent).toContain('Last seen');
    expect(panel.textContent).not.toContain('Challenger: Athens');
    expect(panel.textContent).not.toContain('Progress: 8/10');
  });
});
```

- [ ] **Step 2: Run UI test to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/territory-inspection-panel.test.ts
```

Expected: FAIL because `src/ui/territory-inspection-panel.ts` does not exist.

- [ ] **Step 3: Create territory inspection panel**

Create `src/ui/territory-inspection-panel.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { renderTerritoryFrontierInfo } from '@/ui/territory-frontier-info';

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/_/g, ' ')}`;
}

function addLine(parent: HTMLElement, label: string, value: string): void {
  const line = document.createElement('div');
  line.dataset.territoryInspectionLine = label.toLowerCase().replace(/\s+/g, '-');
  line.textContent = `${label}: ${value}`;
  parent.appendChild(line);
}

export function createTerritoryInspectionPanel(
  state: GameState,
  coord: HexCoord,
  viewerId: string,
  onClose?: () => void,
): HTMLElement {
  const key = hexKey(coord);
  const tile = state.map.tiles[key];
  const visibility = state.civilizations[viewerId]?.visibility
    ? getVisibility(state.civilizations[viewerId].visibility, coord)
    : 'unexplored';

  const panel = document.createElement('section');
  panel.id = 'territory-inspection-panel';
  panel.dataset.territoryInspection = visibility;

  const header = document.createElement('div');
  header.textContent = visibility === 'fog' ? 'Last seen territory' : 'Territory';
  panel.appendChild(header);

  if (!tile || visibility === 'unexplored') {
    const hidden = document.createElement('p');
    hidden.textContent = 'Unexplored territory';
    panel.appendChild(hidden);
    return panel;
  }

  addLine(panel, 'Terrain', titleCase(tile.terrain));
  addLine(panel, 'Elevation', titleCase(tile.elevation));
  if (tile.resource) addLine(panel, 'Resource', titleCase(tile.resource));
  if (tile.improvement !== 'none') addLine(panel, 'Improvement', getImprovementDisplayName(tile.improvement));
  if (tile.wonder) addLine(panel, 'Wonder', getWonderDefinition(tile.wonder)?.name ?? tile.wonder);

  if (visibility === 'fog') {
    const fogNotice = document.createElement('p');
    fogNotice.textContent = 'Last seen information only. Current border pressure is unknown.';
    panel.appendChild(fogNotice);
    return panel;
  }

  const owner = tile.owner ? state.civilizations[tile.owner] : undefined;
  addLine(panel, 'Owner', owner?.name ?? tile.owner ?? 'Unclaimed');

  const frontier = state.territoryFrontiers?.[key];
  if (frontier) {
    const holderCity = state.cities[frontier.holderCityId];
    const challengerCity = state.cities[frontier.challengerCityId];
    addLine(panel, 'Held by', holderCity?.name ?? state.civilizations[frontier.holderCivId]?.name ?? frontier.holderCivId);
    addLine(panel, 'Challenger', challengerCity?.name ?? state.civilizations[frontier.challengerCivId]?.name ?? frontier.challengerCivId);
    addLine(panel, 'Progress', `${frontier.progress}/10`);
    panel.appendChild(renderTerritoryFrontierInfo(frontier));
  }

  if (onClose) {
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', onClose);
    panel.appendChild(close);
  }

  return panel;
}
```

- [ ] **Step 4: Wire long-press to the inspection panel**

In `src/main.ts`, replace:

```ts
import { renderTerritoryFrontierInfo } from '@/ui/territory-frontier-info';
```

with:

```ts
import { createTerritoryInspectionPanel } from '@/ui/territory-inspection-panel';
```

Add this helper near `handleHexLongPress`:

```ts
function openTerritoryInspectionPanel(coord: HexCoord): void {
  document.getElementById('territory-inspection-panel')?.remove();
  const panel = createTerritoryInspectionPanel(gameState, coord, gameState.currentPlayer, () => {
    document.getElementById('territory-inspection-panel')?.remove();
  });
  uiLayer.appendChild(panel);
}
```

In `handleHexLongPress`, replace the final notification block:

```ts
const wonderInfo = tile.wonder ? ` · ⭐ ${getWonderDefinition(tile.wonder)?.name ?? tile.wonder}` : '';
const frontier = gameState.territoryFrontiers?.[hexKey(coord)];
const frontierInfo = frontier ? ` · ${renderTerritoryFrontierInfo(frontier).textContent ?? ''}` : '';
showNotification(`${tile.terrain} · ${tile.elevation}${tile.improvement !== 'none' ? ' · ' + getImprovementDisplayName(tile.improvement) : ''}${tile.resource ? ' · ' + tile.resource : ''}${wonderInfo}${frontierInfo}`);
```

with:

```ts
openTerritoryInspectionPanel(coord);
```

- [ ] **Step 5: Run checks and commit MR8**

Run:

```bash
scripts/check-src-rule-violations.sh src/ui/territory-inspection-panel.ts src/ui/territory-frontier-info.ts src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/ui/territory-inspection-panel.test.ts tests/ui/territory-frontier-info.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/ui/territory-inspection-panel.ts src/ui/territory-frontier-info.ts src/main.ts tests/ui/territory-inspection-panel.test.ts tests/ui/territory-frontier-info.test.ts
git commit -m "feat(territory): add border inspection panel"
```

---

### Task 3: MR9 Worker Guidance No-Leak And Replay Regressions

**Files:**
- Modify: `tests/input/selected-unit-highlights.test.ts`
- Modify: `tests/ui/selected-unit-info.test.ts`
- Modify: `tests/e2e/web-smoke.spec.ts`

**Player Truth Table:**

| Before | Action | Immediate visible result |
|---|---|---|
| Worker selected near unexplored foreign terrain | Select worker | Unexplored tile gets no worker guidance highlight |
| Worker panel rendered on owned valid tile | Border state changes and panel rerenders | Build action disappears; reason says `Outside your territory` |
| Web app opens | Browser smoke starts game surface | Canvas and UI layer remain visible; New Game entry remains usable |

**Misleading UI Risks:**

- Red worker guidance on unexplored terrain leaks terrain ownership and must never appear.
- A rerendered selected-unit panel must not preserve stale build buttons from the previous owner state.

- [ ] **Step 1: Add no-leak worker highlight test**

Append this test to `tests/input/selected-unit-highlights.test.ts`:

```ts
it('does not add foreign-blocked worker guidance on unexplored plausible terrain', () => {
  const state = createNewGame(undefined, 'worker-guidance-unexplored-no-leak', 'small');
  state.currentPlayer = 'player';
  state.units = {
    worker: { ...createUnit('worker', 'player', { q: 0, r: 0 }), id: 'worker', movementPointsLeft: 2 },
  };
  state.civilizations.player.units = ['worker'];
  state.civilizations.player.visibility.tiles = {
    '0,0': 'visible',
    '1,0': 'visible',
  };
  state.map.tiles['1,-1'] = {
    coord: { q: 1, r: -1 },
    terrain: 'plains',
    elevation: 'lowland',
    resource: null,
    owner: 'ai-1',
    improvement: 'none',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };

  const result = buildSelectedUnitHighlights(state, 'worker');

  expect(result.highlights).not.toContainEqual({ coord: { q: 1, r: -1 }, type: 'worker-foreign-blocked' });
});
```

- [ ] **Step 2: Add selected-unit rerender reason test**

Append this test to `tests/ui/selected-unit-info.test.ts`, using the existing render helper patterns in that file:

```ts
it('updates worker current-tile reason after territory ownership changes', () => {
  const state = makeWorkerState({ terrain: 'plains', owner: 'player', improvement: 'none' });
  const first = new MockElement('div');
  renderSelectedUnitInfo(first as unknown as HTMLElement, state, 'worker-1', {
    onWorkerAction: () => {},
  });
  expect(collectAllText(first).join(' ')).not.toContain('Outside your territory');
  expect(findButtons(first).map(button => button.textContent)).toContain('Build Farm');

  const changed: GameState = {
    ...state,
    map: {
      ...state.map,
      tiles: {
        ...state.map.tiles,
        '0,0': { ...state.map.tiles['0,0'], owner: 'ai-1' },
      },
    },
  };
  const second = new MockElement('div');
  renderSelectedUnitInfo(second as unknown as HTMLElement, changed, 'worker-1', {
    onWorkerAction: () => {},
  });

  expect(collectAllText(second).join(' ')).toContain('Outside your territory');
  expect(findButtons(second).map(button => button.textContent)).not.toContain('Build Farm');
});
```

- [ ] **Step 3: Extend web smoke with a stable replay check**

In `tests/e2e/web-smoke.spec.ts`, append:

```ts
test('web build can open and dismiss the new-game path without blanking the map UI', async ({ page }) => {
  await page.goto('/');

  const newGame = page.getByRole('button', { name: 'New Game' });
  await expect(newGame).toBeVisible();
  await newGame.click();

  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#ui-layer')).toBeVisible();
  const canvasBox = await page.locator('#game-canvas').boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(200);
  expect(canvasBox?.height).toBeGreaterThan(200);
});
```

- [ ] **Step 4: Run checks and commit MR9**

Run:

```bash
scripts/check-src-rule-violations.sh src/input/selected-unit-highlights.ts src/ui/selected-unit-info.ts
./scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts
./scripts/run-with-mise.sh yarn test:web-smoke
```

Expected: PASS.

Commit:

```bash
git add tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts tests/e2e/web-smoke.spec.ts
git commit -m "test(territory): cover worker replay guardrails"
```

---

### Task 4: MR10 Territory Balance Constants And Characterization

**Files:**
- Modify: `src/systems/city-territory-system.ts`
- Test: `tests/systems/city-territory-system.test.ts`

- [ ] **Step 1: Add balance characterization tests**

Add these tests to `tests/systems/city-territory-system.test.ts`:

```ts
it('keeps frontier progress below flip threshold after one marginal pressure turn', () => {
  const state = createNewGame(undefined, 'territory-balance-marginal-frontier');
  state.cities = {};
  const holder = addCity(state, 'player', 10, 10);
  const challenger = addCity(state, 'ai-1', 13, 10);
  const coord = { q: 12, r: 10 };
  state.map.tiles[hexKey(coord)] = { ...state.map.tiles[hexKey(coord)], terrain: 'grassland', owner: 'player' };
  state.cities[holder.id] = { ...holder, population: 2, maturity: 'outpost', ownedTiles: [coord] };
  state.cities[challenger.id] = { ...challenger, population: 3, maturity: 'outpost', ownedTiles: [] };

  const result = processTerritoryFrontiers(state);
  const frontier = result.territoryFrontiers?.[hexKey(coord)];

  expect(frontier?.progress).toBeGreaterThan(0);
  expect(frontier?.progress).toBeLessThan(TERRITORY_PRESSURE_BALANCE.frontierFlipProgress);
  expect(result.map.tiles[hexKey(coord)].owner).toBe('player');
});

it('uses named balance thresholds for likely-to-flip and final frontier flips', () => {
  expect(TERRITORY_PRESSURE_BALANCE.softTrimMargin).toBe(2);
  expect(TERRITORY_PRESSURE_BALANCE.likelyToFlipProgress).toBe(8);
  expect(TERRITORY_PRESSURE_BALANCE.frontierFlipProgress).toBe(10);
});
```

Add `TERRITORY_PRESSURE_BALANCE` to the existing import from `@/systems/city-territory-system`.

- [ ] **Step 2: Run balance tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts
```

Expected: FAIL because `TERRITORY_PRESSURE_BALANCE` is not exported.

- [ ] **Step 3: Extract named territory pressure constants**

In `src/systems/city-territory-system.ts`, replace the current `MATURITY_PRESSURE_BONUS` declaration with:

```ts
export const TERRITORY_PRESSURE_BALANCE = {
  basePressure: 6,
  softTrimMargin: 2,
  cultureBuildingCap: 3,
  likelyToFlipProgress: 8,
  frontierFlipProgress: 10,
  maturityBonus: {
    outpost: 0,
    village: 1,
    town: 2,
    city: 3,
    metropolis: 4,
  } satisfies Record<City['maturity'], number>,
} as const;
```

Update `calculateCityPressureForTile` to:

```ts
export function calculateCityPressureForTile(state: GameState, city: City, coord: HexCoord): number {
  return TERRITORY_PRESSURE_BALANCE.basePressure
    + TERRITORY_PRESSURE_BALANCE.maturityBonus[city.maturity]
    + Math.floor(city.population / 2)
    + Math.min(TERRITORY_PRESSURE_BALANCE.cultureBuildingCap, countCultureBuildings(city))
    - cityDistance(city.position, coord, state.map);
}
```

Update `chooseTerritoryWinner` to replace:

```ts
strongest.pressure - holderClaim.pressure < 2
```

with:

```ts
strongest.pressure - holderClaim.pressure < TERRITORY_PRESSURE_BALANCE.softTrimMargin
```

Update frontier trend and flip checks to use:

```ts
if (progress >= TERRITORY_PRESSURE_BALANCE.frontierFlipProgress) {
```

and:

```ts
trend: progress >= TERRITORY_PRESSURE_BALANCE.likelyToFlipProgress ? 'likely-to-flip' : 'contested',
```

- [ ] **Step 4: Run checks and commit MR10**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/city-territory-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/city-territory-system.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/systems/city-territory-system.ts tests/systems/city-territory-system.test.ts
git commit -m "refactor(territory): name cultural pressure balance constants"
```

---

### Task 5: Final Verification And PR

**Files:**
- Review all changed files from Tasks 1-4.
- No new production files beyond those named above.

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/city-capture-system.ts src/input/city-assault-flow.ts src/main.ts src/ai/basic-ai.ts src/ui/territory-inspection-panel.ts src/ui/territory-frontier-info.ts src/systems/city-territory-system.ts
```

Expected: PASS with no output.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/input/city-assault-flow.test.ts tests/ai/basic-ai.test.ts tests/ui/territory-inspection-panel.test.ts tests/ui/territory-frontier-info.test.ts tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts tests/systems/city-territory-system.test.ts tests/ui/notification-routing.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build, full suite, and web smoke**

Run:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
./scripts/run-with-mise.sh yarn test:web-smoke
```

Expected: all commands exit 0.

- [ ] **Step 4: Review diffs**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff --check origin/main...HEAD
```

Expected: branch diff contains only territory polish, UI inspection, replay tests, and balance constant changes; uncommitted diff is empty after final commit; `git diff --check` exits 0.

- [ ] **Step 5: Open PR**

Use this PR title:

```text
feat(territory): polish border inspection and capture notifications
```

Use this PR body:

```markdown
## Summary
- Routes territory tile-flipped notifications through player and AI city capture paths.
- Adds a dedicated territory inspection panel for visible frontier/owner/challenger state without leaking fogged details.
- Adds worker guidance replay/no-leak regressions and names cultural pressure balance constants.

## Test Plan
- [ ] scripts/check-src-rule-violations.sh src/systems/city-capture-system.ts src/input/city-assault-flow.ts src/main.ts src/ai/basic-ai.ts src/ui/territory-inspection-panel.ts src/ui/territory-frontier-info.ts src/systems/city-territory-system.ts
- [ ] ./scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/input/city-assault-flow.test.ts tests/ai/basic-ai.test.ts tests/ui/territory-inspection-panel.test.ts tests/ui/territory-frontier-info.test.ts tests/input/selected-unit-highlights.test.ts tests/ui/selected-unit-info.test.ts tests/systems/city-territory-system.test.ts tests/ui/notification-routing.test.ts
- [ ] ./scripts/run-with-mise.sh yarn build
- [ ] ./scripts/run-with-mise.sh yarn test
- [ ] ./scripts/run-with-mise.sh yarn test:web-smoke
```

## Self-Review

- **Spec coverage:** This plan maps the remaining original plan gaps to explicit tasks: capture/AI notifications, frontier inspection, no-leak worker UI coverage, replay smoke, and balance constants.
- **Placeholder scan:** This plan contains no placeholder markers, no empty "write tests" steps, and no deferred implementation labels.
- **Type consistency:** `MajorCityCaptureResult`, `territoryEvents`, `GameEvents['territory:tile-flipped']`, `createTerritoryInspectionPanel`, and `TERRITORY_PRESSURE_BALANCE` are introduced before use.
- **UI guardrails:** Player truth table, misleading UI risks, and interaction replay checklist are included; UI tasks assert visible DOM/text changes.
