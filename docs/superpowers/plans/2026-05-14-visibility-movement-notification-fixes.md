# Visibility, Movement, and Notification Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

Execution note: this plan was implemented inline with `superpowers:executing-plans`; no subagents were used.

**Goal:** Address valid issues #134, #135, and #136 by tightening player-visible fog/privacy rules, explaining blocked mountain movement, and making barbarian spotted notifications actionable.

**Architecture:** Add small shared helpers for viewer-safe map inspection and movement blocker reasons, then wire them through the live input, diplomacy, renderer, and notification paths. Notification entries should carry optional focus metadata, while toast/log click handling should use a testable UI helper so focusing an old event does not create duplicate log entries.

**Tech Stack:** TypeScript, Canvas renderer, DOM UI panels, Vitest/jsdom tests, existing `./scripts/run-with-mise.sh yarn ...` wrapper.

---

## Validity Triage

- #134 remains valid: latest `origin/main` masks several surfaces, but diplomacy still enumerates unmet major civ rows as `Unknown Civilization N`, and map/UI inspection lacks one shared viewer-safe helper proving unmet civ/city/barbarian details cannot leak through future caller paths.
- #135 remains valid: mountains are intentionally impassable (`getMovementCost('mountain') === Infinity`), but tapping an unreachable mountain with a scout selected gives no specific explanation or future-facing hint.
- #136 remains valid: `routeBarbarianSpawned()` emits `Barbarian raiders spotted!` without a coordinate target, notification log entries have no focus metadata, and clicking a toast only dismisses it.
- #137 is invalid/stale: the live `foundCityAction()` calls `getCityFoundingBlockers()`, which blocks `ocean`, `coast`, `mountain`, and missing tiles before `foundCity()` is called.

## File Structure

- Modify `src/ui/notification-log.ts`: preserve optional target metadata in entries.
- Create: `src/ui/notification-log-panel.ts`: render log rows, expose target clicks, and keep DOM behavior testable outside `main.ts`.
- Create: `src/ui/notification-targets.ts`: format focus feedback for live versus last-known map targets.
- Modify `src/ui/notification-routing.ts`: include barbarian spawn coordinates and target metadata when routing spotted notices.
- Modify `src/main.ts`: accept notification metadata, make toast/log rows focus the camera when clicked, and show movement blocker text when a selected unit taps an invalid destination.
- Modify `src/systems/unit-system.ts`: add a pure `getMovementBlockerReason()` helper for unexplored targets, impassable terrain, route movement cost, and unknown tiles.
- Create: `src/systems/viewer-intel.ts`: centralize viewer-safe map/civ/city/unit inspectability for #134.
- Modify `src/ui/diplomacy-panel.ts`: hide unmet major civ rows, or render them only if design explicitly wants known-but-unidentified contacts; do not enumerate truly unmet rivals.
- Modify `src/renderer/city-renderer.ts`, `src/renderer/unit-renderer.ts`, and `src/renderer/hex-renderer.ts` only where regression tests reveal a live leak; current visible-only rendering should not be refactored unnecessarily.
- Test `tests/systems/unit-system.test.ts`: movement blocker reason coverage.
- Test `tests/ui/notification-routing.test.ts`: barbarian spotted target metadata and no fog-only notification.
- Test `tests/ui/notification-log.test.ts`: metadata survives log append and trimming.
- Test `tests/ui/notification-log-panel.test.ts`: clicking a target row calls the focus callback and does not append duplicate log entries.
- Test `tests/ui/diplomacy-panel.test.ts`: unmet major civs are not enumerated.
- Test `tests/renderer/city-renderer.test.ts`, `tests/renderer/unit-renderer.test.ts`, and `tests/renderer/hex-renderer.test.ts`: no visible labels/icons/borders for undiscovered or fog-only foreign content.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Scout selected; mountain hex is outside movement highlights | Tap the mountain | Toast says `Mountain too steep to climb.` and selected scout remains selected |
| Scout selected; coast/ocean hex is outside movement highlights | Tap water | Toast says land units cannot cross water yet, and selected unit remains selected |
| Barbarian spawns on a currently visible tile | Click the spotted toast or matching log row | Camera centers on the spotted tile; if still visible, the live barbarian can be inspected |
| Barbarian notification is old and tile is now fogged | Click the log row | Camera centers on the last seen tile and a transient toast says it is a last-known location; the log does not gain a duplicate entry |
| Diplomacy opened before first contact | Open diplomacy panel | Truly unmet major civs are absent; no names, colors, counts, relationship bars, or actions leak |

## Misleading UI Risks

- `Unknown Civilization N` is misleading because it reveals the exact number of unmet rivals. Only civs with first-contact memory or current evidence should appear.
- `Barbarian raiders spotted!` is misleading without a target when the player cannot locate the sighting. Every spotted message must carry the seen coordinate from the event source.
- `Mountain too steep to climb` must only appear for impassable mountain terrain, not for a passable tile that is merely too far this turn.
- Fogged old sightings must be labeled as last-known, not rendered as if the barbarian is guaranteed still there.
- Notification focus feedback must be transient. If clicking log rows appends more log rows, the UI becomes noisy and the same historical event appears to happen repeatedly.

## Interaction Replay Checklist

- Select scout, tap mountain twice: both taps show the reason; selection and movement highlights remain stable.
- Select scout, tap passable but too-expensive tile: shows movement budget reason, not mountain reason.
- Spawn barbarian in visible range, click toast, reopen log, click log row: both focus the same coordinate, and the log entry count stays stable.
- Move vision away after a spotted event, click log row: camera centers on coordinate and the text remains last-known.
- Open diplomacy before and after first contact: unmet civ absent before contact, discovered civ present after contact.

## Task 1: Movement Blocker Reasons (#135)

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/unit-system.test.ts`

- [x] **Step 1: Write failing movement reason tests**

Add tests near the movement range/path tests in `tests/systems/unit-system.test.ts`:

```ts
it('explains why a scout cannot enter a mountain tile', () => {
  const map = generateMap(5, 5, 'mountain-blocker');
  map.tiles['2,2'] = { ...map.tiles['2,2'], coord: { q: 2, r: 2 }, terrain: 'mountain' };
  const scout = createUnit('scout', 'player', { q: 2, r: 1 });

  expect(getMovementBlockerReason(scout, { q: 2, r: 2 }, map)).toEqual({
    code: 'impassable-mountain',
    message: 'Mountain too steep to climb.',
  });
});

it('uses a distinct reason for land units tapping water', () => {
  const map = generateMap(5, 5, 'water-blocker');
  map.tiles['2,2'] = { ...map.tiles['2,2'], coord: { q: 2, r: 2 }, terrain: 'coast' };
  const scout = createUnit('scout', 'player', { q: 2, r: 1 });

  expect(getMovementBlockerReason(scout, { q: 2, r: 2 }, map)?.code).toBe('impassable-water');
});

it('explains a passable destination that costs more movement than remains', () => {
  const map = generateMap(5, 5, 'movement-budget-blocker');
  for (const key of Object.keys(map.tiles)) {
    map.tiles[key] = { ...map.tiles[key], terrain: 'grassland' };
  }
  const scout = createUnit('scout', 'player', { q: 0, r: 0 });
  scout.movementPointsLeft = 1;

  expect(getMovementBlockerReason(scout, { q: 2, r: 0 }, map)?.code).toBe('insufficient-movement');
});

it('uses the scouting message for an unexplored tapped tile', () => {
  const map = generateMap(5, 5, 'unexplored-blocker');
  map.tiles['2,2'] = { ...map.tiles['2,2'], coord: { q: 2, r: 2 }, terrain: 'grassland' };
  const scout = createUnit('scout', 'player', { q: 2, r: 1 });

  expect(getMovementBlockerReason(scout, { q: 2, r: 2 }, map, { visibilityState: 'unexplored' })).toEqual({
    code: 'unexplored',
    message: 'Too far away to spot.',
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts
```

Expected: FAIL because `getMovementBlockerReason` is not exported.

- [x] **Step 3: Add the pure helper**

In `src/systems/unit-system.ts`, export:

```ts
import type { VisibilityState } from '@/core/types';
import { wrapHexCoord } from './hex-utils';

export interface MovementBlockerReason {
  code:
    | 'unexplored'
    | 'unknown-tile'
    | 'impassable-mountain'
    | 'impassable-water'
    | 'impassable-terrain'
    | 'unreachable'
    | 'insufficient-movement';
  message: string;
}

export function getMovementBlockerReason(
  unit: Unit,
  to: HexCoord,
  map: GameMap,
  options: { visibilityState?: VisibilityState } = {},
): MovementBlockerReason | null {
  if (options.visibilityState === 'unexplored') {
    return { code: 'unexplored', message: 'Too far away to spot.' };
  }

  const target = map.wrapsHorizontally ? wrapHexCoord(to, map.width) : to;
  const tile = map.tiles[hexKey(target)];
  if (!tile) return { code: 'unknown-tile', message: 'Too far away to spot.' };
  const cost = getMovementCost(tile.terrain);
  if (cost === Infinity) {
    if (tile.terrain === 'mountain') return { code: 'impassable-mountain', message: 'Mountain too steep to climb.' };
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') return { code: 'impassable-water', message: 'Land units cannot cross water yet.' };
    return { code: 'impassable-terrain', message: 'This terrain cannot be entered.' };
  }

  const path = findPath(unit.position, target, map);
  if (!path) return { code: 'unreachable', message: 'No passable route to that tile.' };
  const pathCost = path.slice(1).reduce((total, coord) => {
    const stepTile = map.tiles[hexKey(coord)];
    return total + (stepTile ? getMovementCost(stepTile.terrain) : Infinity);
  }, 0);
  if (pathCost > unit.movementPointsLeft) return { code: 'insufficient-movement', message: 'Not enough movement left this turn.' };
  return null;
}
```

- [x] **Step 4: Wire live tap feedback**

In `src/main.ts`, import `getMovementBlockerReason` and `getVisibility`. In `handleHexTap()`, keep friendly stack handling first so tapping another friendly unit still opens the stack picker. Immediately after that friendly-stack branch returns false, add selected-unit feedback when the tapped tile is not in `movementRange`:

```ts
if (selectedUnitId && !selectedUnitCanMoveToTappedHex) {
  const selected = gameState.units[selectedUnitId];
  if (selected) {
    const visibilityState = currentCiv()?.visibility
      ? getVisibility(currentCiv().visibility, coord)
      : undefined;
    const reason = getMovementBlockerReason(selected, coord, gameState.map, { visibilityState });
    if (reason) {
      showNotification(reason.message, reason.code === 'unknown-tile' ? 'info' : 'warning');
      selectUnit(selectedUnitId);
      return;
    }
  }
}
```

Do not run this branch before `handleFriendlyUnitStackTap()`. A player tapping a friendly stack outside the selected unit's movement range should still get stack selection, not a misleading movement warning.

- [x] **Step 5: Run verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/input/selected-unit-tap-intent.test.ts
scripts/check-src-rule-violations.sh src/systems/unit-system.ts src/main.ts
```

Expected: PASS.

## Task 2: Actionable Barbarian Spotted Notifications (#136)

**Files:**
- Modify: `src/ui/notification-log.ts`
- Create: `src/ui/notification-log-panel.ts`
- Create: `src/ui/notification-targets.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/notification-routing.test.ts`
- Test: `tests/ui/notification-log.test.ts`
- Test: `tests/ui/notification-log-panel.test.ts`

- [x] **Step 1: Write failing routing and log tests**

Add to `tests/ui/notification-routing.test.ts`:

```ts
it('barbarian-spawned includes a focus target for visible sightings', () => {
  const state = makeState();
  (state.civilizations.p1 as any).visibility = { tiles: { '0,0': 'visible' } };
  const dedup = new Map<string, Set<string>>();
  const calls: any[] = [];

  routeBarbarianSpawned(
    state,
    { q: 0, r: 0 },
    'camp-1',
    dedup,
    (civId, message, type, target) => calls.push({ civId, message, type, target }),
    (vis: any, pos) => vis.tiles[`${pos.q},${pos.r}`] === 'visible',
  );

  expect(calls[0].target).toEqual({
    kind: 'map-coordinate',
    coord: { q: 0, r: 0 },
    label: 'Barbarian raiders spotted',
    lastSeen: false,
  });
});
```

Create `tests/ui/notification-log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendNotification, createNotificationLog, getNotificationsForPlayer } from '@/ui/notification-log';

describe('notification log target metadata', () => {
  it('preserves map focus metadata on entries', () => {
    const log = createNotificationLog();
    appendNotification(log, 'player', {
      message: 'Barbarian raiders spotted!',
      type: 'warning',
      turn: 4,
      target: {
        kind: 'map-coordinate',
        coord: { q: 3, r: 2 },
        label: 'Barbarian raiders spotted',
        lastSeen: false,
      },
    });

    expect(getNotificationsForPlayer(log, 'player')[0]?.target?.coord).toEqual({ q: 3, r: 2 });
  });
});
```

Create `tests/ui/notification-log-panel.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import type { NotificationEntry } from '@/ui/notification-log';

describe('notification log panel', () => {
  it('calls onFocusTarget when a map-target row is clicked without mutating entries', () => {
    const entries: NotificationEntry[] = [{
      message: 'Barbarian raiders spotted!',
      type: 'warning',
      turn: 7,
      target: {
        kind: 'map-coordinate',
        coord: { q: 3, r: 2 },
        label: 'Barbarian raiders spotted',
        lastSeen: false,
      },
    }];
    const onFocusTarget = vi.fn();

    const panel = createNotificationLogPanel(entries, {
      onClose: () => {},
      onFocusTarget,
    });

    panel.querySelector<HTMLElement>('[data-notification-target="0"]')?.click();

    expect(onFocusTarget).toHaveBeenCalledWith(entries[0]!.target, entries[0]);
    expect(entries).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/notification-routing.test.ts tests/ui/notification-log.test.ts tests/ui/notification-log-panel.test.ts
```

Expected: FAIL because `NotificationSink`, `NotificationEntry`, and `createNotificationLogPanel` do not carry target metadata yet.

- [x] **Step 3: Add notification target types**

In `src/ui/notification-log.ts`, define:

```ts
import type { HexCoord } from '@/core/types';

export interface NotificationMapTarget {
  kind: 'map-coordinate';
  coord: HexCoord;
  label: string;
  lastSeen: boolean;
}
```

Then extend `NotificationEntry` in `src/ui/notification-log.ts`:

```ts
target?: NotificationMapTarget;
```

Keep these UI notification types in `src/ui/notification-log.ts`; do not add them to `src/core/types.ts` unless game-state persistence starts storing notifications.

- [x] **Step 4: Thread target metadata through routing**

Change `NotificationSink` in `src/ui/notification-routing.ts`:

```ts
export type NotificationSink = (
  civId: string,
  message: string,
  type: NotificationEntry['type'],
  target?: NotificationEntry['target'],
) => void;
```

In `routeBarbarianSpawned()`, call:

```ts
sink(civId, 'Barbarian raiders spotted!', 'warning', {
  kind: 'map-coordinate',
  coord: { ...unitPosition },
  label: 'Barbarian raiders spotted',
  lastSeen: false,
});
```

- [x] **Step 5: Add target formatting and a testable log panel**

Create `src/ui/notification-targets.ts`:

```ts
import type { NotificationMapTarget } from '@/ui/notification-log';

export function formatNotificationTargetFocusMessage(
  target: NotificationMapTarget,
  currentlyVisible: boolean,
): string {
  return currentlyVisible && !target.lastSeen
    ? target.label
    : `${target.label} (last known location)`;
}
```

Create `src/ui/notification-log-panel.ts`:

```ts
import type { NotificationEntry } from '@/ui/notification-log';

export interface NotificationLogPanelCallbacks {
  onClose: () => void;
  onFocusTarget: (target: NonNullable<NotificationEntry['target']>, entry: NotificationEntry) => void;
}

const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };

export function createNotificationLogPanel(
  entries: NotificationEntry[],
  callbacks: NotificationLogPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'notification-log';
  panel.style.cssText = 'position:absolute;top:70px;right:12px;width:280px;max-height:300px;overflow-y:auto;background:rgba(10,10,30,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:10px;z-index:25;padding:12px;';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:8px;display:flex;justify-content:space-between;';
  const headerTitle = document.createElement('span');
  headerTitle.textContent = 'Message Log';
  const closeBtn = document.createElement('span');
  closeBtn.id = 'close-log';
  closeBtn.style.cssText = 'cursor:pointer;opacity:0.6;';
  closeBtn.textContent = 'X';
  header.appendChild(headerTitle);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;opacity:0.5;text-align:center;';
    empty.textContent = 'No messages yet';
    panel.appendChild(empty);
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    const row = document.createElement('div');
    row.style.cssText = 'font-size:11px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
    const turnSpan = document.createElement('span');
    turnSpan.style.cssText = `color:${colors[entry.type]};opacity:0.7;margin-right:4px;`;
    turnSpan.textContent = `T${entry.turn}`;
    row.appendChild(turnSpan);
    row.appendChild(document.createTextNode(entry.message));

    if (entry.target) {
      row.dataset.notificationTarget = String(i);
      row.style.cursor = 'pointer';
      row.title = 'Center map on this event';
      row.addEventListener('click', event => {
        event.stopPropagation();
        callbacks.onFocusTarget(entry.target!, entry);
      });
    }

    panel.appendChild(row);
  }

  closeBtn.addEventListener('click', callbacks.onClose);
  return panel;
}
```

- [x] **Step 6: Make toasts and log rows focus the camera**

In `src/main.ts`, update queue and log plumbing:

```ts
const notificationQueue: Array<{ message: string; type: NotificationEntry['type']; target?: NotificationEntry['target'] }> = [];

function enqueueToast(message: string, type: NotificationEntry['type'], target?: NotificationEntry['target']): void {
  notificationQueue.push({ message, type, target });
  if (!isShowingNotification) displayNextNotification();
}

function showNotification(message: string, type: NotificationEntry['type'] = 'info', target?: NotificationEntry['target']): void {
  enqueueToast(message, type, target);
  if (gameState) {
    appendNotification(notificationLog, gameState.currentPlayer, {
      message,
      type,
      turn: gameState.turn,
      target,
    });
  }
}

function focusNotificationTarget(target?: NotificationEntry['target'], currentlyVisible = true): boolean {
  if (!target || target.kind !== 'map-coordinate') return false;
  renderLoop.camera.centerOn(target.coord);
  enqueueToast(formatNotificationTargetFocusMessage(target, currentlyVisible), 'info');
  return true;
}
```

`enqueueToast()` intentionally does not append to `notificationLog`. Clicking a historical log row should focus the map and provide transient feedback, not create a new historical event.

In `displayNextNotification()`, change the click handler so target clicks focus before dismiss:

```ts
notif.addEventListener('click', () => {
  const currentlyVisible = next.target && currentCiv()?.visibility
    ? getVisibility(currentCiv().visibility, next.target.coord) === 'visible'
    : false;
  focusNotificationTarget(next.target, currentlyVisible);
  dismiss();
});
```

In `toggleNotificationLog()`, add a click handler per entry with a target:

```ts
let panel: HTMLElement;
panel = createNotificationLogPanel(entries, {
  onClose: () => panel.remove(),
  onFocusTarget: target => {
    const currentlyVisible = currentCiv()?.visibility
      ? getVisibility(currentCiv().visibility, target.coord) === 'visible'
      : false;
    focusNotificationTarget(target, currentlyVisible);
  },
});
```

- [x] **Step 7: Run verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/ui/notification-routing.test.ts tests/ui/notification-log.test.ts tests/ui/notification-log-panel.test.ts
scripts/check-src-rule-violations.sh src/ui/notification-log.ts src/ui/notification-log-panel.ts src/ui/notification-targets.ts src/ui/notification-routing.ts src/main.ts
```

Expected: PASS.

## Task 3: Viewer-Safe Visibility and Unmet Entity Surfaces (#134)

**Files:**
- Create: `src/systems/viewer-intel.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/unit-renderer.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Test: `tests/systems/viewer-intel.test.ts`
- Test: `tests/ui/diplomacy-panel.test.ts`
- Test: `tests/renderer/city-renderer.test.ts`
- Test: `tests/renderer/unit-renderer.test.ts`

- [x] **Step 1: Write failing viewer-intel tests**

Create `tests/systems/viewer-intel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canInspectCityForViewer, canInspectUnitForViewer, shouldListMajorCivForViewer } from '@/systems/viewer-intel';

describe('viewer intel boundaries', () => {
  it('does not list a major civ before contact or current visible evidence', () => {
    const state = makeViewerIntelFixture();
    expect(shouldListMajorCivForViewer(state, 'player', 'ai-1')).toBe(false);
  });

  it('allows a major civ row after first contact is recorded', () => {
    const state = makeViewerIntelFixture();
    state.civilizations.player.knownCivilizations = ['ai-1'];
    expect(shouldListMajorCivForViewer(state, 'player', 'ai-1')).toBe(true);
  });

  it('does not inspect foreign city or unit details from fog-only memory', () => {
    const state = makeViewerIntelFixture();
    state.civilizations.player.visibility.tiles['4,4'] = 'fog';
    expect(canInspectCityForViewer(state, 'player', 'city-ai')).toBe(false);
    expect(canInspectUnitForViewer(state, 'player', 'unit-ai')).toBe(false);
  });

  it('does not list a major civ from fog-only owned tile memory', () => {
    const state = makeViewerIntelFixture();
    state.map.tiles['4,4'].owner = 'ai-1';
    state.civilizations.player.visibility.tiles['4,4'] = 'fog';

    expect(shouldListMajorCivForViewer(state, 'player', 'ai-1')).toBe(false);
  });
});
```

Use local fixture helpers in the same file with one player, one AI city/unit at `{ q: 4, r: 4 }`, a `map.tiles['4,4']` entry, and player visibility initially empty. Include diplomacy stubs with empty `atWarWith`, `relationships`, and `treaties` arrays so helper behavior is not accidentally driven by undefined fields.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/viewer-intel.test.ts
```

Expected: FAIL because `viewer-intel.ts` does not exist.

- [x] **Step 3: Add shared helper**

Create `src/systems/viewer-intel.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';

function isCurrentlyVisible(state: GameState, viewerCivId: string, coord: HexCoord): boolean {
  const visibility = state.civilizations[viewerCivId]?.visibility;
  return visibility ? getVisibility(visibility, coord) === 'visible' : false;
}

function hasContactMemory(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  const viewer = state.civilizations[viewerCivId];
  const target = state.civilizations[targetCivId];
  if (!viewer || !target) return false;
  if ((viewer.knownCivilizations ?? []).includes(targetCivId)) return true;
  if ((target.knownCivilizations ?? []).includes(viewerCivId)) return true;
  if (viewer.diplomacy?.atWarWith?.includes(targetCivId)) return true;
  if (viewer.diplomacy?.treaties?.some(t => t.civA === targetCivId || t.civB === targetCivId)) return true;
  if (target.breakaway?.originOwnerId === viewerCivId) return true;
  if (viewer.breakaway?.originOwnerId === targetCivId) return true;
  return false;
}

function hasCurrentVisibleMajorCivEvidence(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  const target = state.civilizations[targetCivId];
  if (!target) return false;

  for (const cityId of target.cities ?? []) {
    const city = state.cities[cityId];
    if (city && isCurrentlyVisible(state, viewerCivId, city.position)) return true;
  }

  for (const unitId of target.units ?? []) {
    const unit = state.units[unitId];
    if (unit && isCurrentlyVisible(state, viewerCivId, unit.position)) return true;
  }

  return Object.values(state.map.tiles).some(tile =>
    tile.owner === targetCivId && isCurrentlyVisible(state, viewerCivId, tile.coord),
  );
}

export function canInspectCityForViewer(state: GameState, viewerCivId: string, cityId: string): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  if (city.owner === viewerCivId) return true;
  return isCurrentlyVisible(state, viewerCivId, city.position);
}

export function canInspectUnitForViewer(state: GameState, viewerCivId: string, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (unit.owner === viewerCivId) return true;
  return isCurrentlyVisible(state, viewerCivId, unit.position);
}

export function shouldListMajorCivForViewer(state: GameState, viewerCivId: string, targetCivId: string): boolean {
  if (viewerCivId === targetCivId) return false;
  return hasContactMemory(state, viewerCivId, targetCivId)
    || hasCurrentVisibleMajorCivEvidence(state, viewerCivId, targetCivId);
}
```

- [x] **Step 4: Hide truly unmet major civ rows**

In `src/ui/diplomacy-panel.ts`, replace the unconditional row push with:

```ts
if (!shouldListMajorCivForViewer(state, state.currentPlayer, civId)) {
  continue;
}
```

Keep existing relationship/action logic for listed civs. Once a civ is listed by contact memory or current visible evidence, it may show the actual civ name; do not keep the old `Unknown Civilization N` placeholder for truly unmet civs because it leaks rival count.

- [x] **Step 5: Add UI regression for no unmet row count leak**

Update `tests/ui/diplomacy-panel.test.ts`:

```ts
it('does not enumerate truly unmet major civs', () => {
  const { container, state } = makeDiplomacyFixture({
    currentPlayer: 'player',
    includeThirdCiv: true,
  });
  state.civilizations.player.knownCivilizations = [];
  state.civilizations.player.visibility = { tiles: {} };

  const panel = createDiplomacyPanel(container, state, { onAction: () => {}, onClose: () => {} });

  expect(panel.textContent).not.toContain('Unknown Civilization');
  expect(panel.textContent).not.toContain('Outsider');
});
```

Remove or update the older expectation that unmet major civs render as placeholders.

- [x] **Step 6: Guard renderer and inspection surfaces**

Use `canInspectCityForViewer()` and `canInspectUnitForViewer()` in any live caller that opens a detail panel for a foreign city or unit. Keep drawing base map terrain/fog as-is, but do not draw foreign city/unit labels or allow detail panels unless the relevant helper returns true.

Add renderer regressions. Some may already pass on latest `origin/main`; keep them as guard coverage and only change renderer files where a regression fails.

```ts
it('does not draw a foreign city label from fog-only memory', () => {
  const state = createNewGame(undefined, 'fog-city-label');
  const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
  const city = foundCity('ai-1', aiSettler.position, state.map);
  state.cities[city.id] = city;
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'fog';

  const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
  drawCities(ctx, state, makeCamera(), 'player');

  const texts = (ctx as unknown as MockCanvasContext).fillTextCalls.map(call => call.text);
  expect(texts).not.toContain(`${city.name} (${city.population})`);
});
```

Add a unit renderer guard:

```ts
it('does not draw a foreign unit from fog-only memory', () => {
  const ctx = createContext();
  const units: Record<string, Unit> = {
    enemy: {
      id: 'enemy',
      owner: 'ai-1',
      type: 'warrior',
      position: { q: 1, r: 1 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    },
  };
  const visibility: VisibilityMap = { tiles: { '1,1': 'fog' } };

  drawUnits(ctx, units, makeCamera(), visibility, makeState(), 'player', { 'ai-1': '#d94a4a' });

  expect(ctx.fillText).not.toHaveBeenCalledWith('⚔️', expect.any(Number), expect.any(Number));
});
```

Add a hex-renderer guard for foreign ownership:

```ts
it('does not draw foreign ownership borders on unexplored tiles', () => {
  const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
  const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'unexplored' } };

  drawHexMap(ctx, makeMap(), makeCamera(), undefined, 'player', visibility);

  expect((ctx as unknown as MockCanvasContext).strokeCalls).not.toContain('rgba(217,74,74,0.5)');
});
```

- [x] **Step 7: Run verification**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/viewer-intel.test.ts tests/ui/diplomacy-panel.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/hex-renderer.test.ts tests/ui/fog-leak.test.ts
scripts/check-src-rule-violations.sh src/systems/viewer-intel.ts src/ui/diplomacy-panel.ts src/renderer/city-renderer.ts src/renderer/unit-renderer.ts src/renderer/hex-renderer.ts
```

Expected: PASS.

## Final Verification

- [x] Run targeted tests:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/viewer-intel.test.ts tests/ui/notification-routing.test.ts tests/ui/notification-log.test.ts tests/ui/notification-log-panel.test.ts tests/ui/diplomacy-panel.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/hex-renderer.test.ts tests/ui/fog-leak.test.ts
```

- [x] Run source rule check:

```bash
scripts/check-src-rule-violations.sh src/systems/unit-system.ts src/systems/viewer-intel.ts src/ui/notification-log.ts src/ui/notification-log-panel.ts src/ui/notification-targets.ts src/ui/notification-routing.ts src/ui/diplomacy-panel.ts src/renderer/city-renderer.ts src/renderer/unit-renderer.ts src/renderer/hex-renderer.ts src/main.ts
```

- [x] Run full required checks before PR/push:

```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test
```

- [x] Review diffs:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff
```

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-05-14-visibility-movement-notification-fixes.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.

Wait for approval before implementation.
