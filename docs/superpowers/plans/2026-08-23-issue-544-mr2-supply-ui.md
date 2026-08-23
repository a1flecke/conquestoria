# #544 MR2 — Supply UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. **Do not use subagent-driven-development or
> any other subagent-dispatching approach for this repo** — this project's
> `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task
> inline in the current session. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Build the player-visible UI layer on top of MR1's already-working
land-supply mechanic (merged [#872](https://github.com/a1flecke/conquestoria/pull/872)):
extend the existing unit-panel status line with turns-until-next-stage and
recovery guidance; add a toggleable, viewer-scoped map overlay showing Full
Supply / Stable-but-Unsupported coverage and sources; a live projected-vs-
resolved coverage preview when a naval logistics unit or fort-building Worker
is selected; meaningful-transition-only end-turn warnings with an All/Critical
only/Off preference; and a one-time, skippable, reopenable first-time supply
tutorial. **No new game-state mutation logic** — every number this MR displays
is read from MR1's already-computed `unit.landSupply` and the `supply-*.ts`
helper exports.

**Architecture:** Six additions, each mirroring an existing single-
responsibility precedent in this codebase rather than inventing a new pattern:
one pure UI-formatting extension (`selected-unit-info.ts`), one pure overlay
data-prep module (new `supply-overlay-presentation.ts`, mirrors nothing exactly
but follows the `*ForPlayer`/`*ForViewer` viewer-scoped convention), one
renderer module (`supply-overlay-renderer.ts`, mirrors `fog-renderer.ts`), one
extension to the existing selection-highlight builder
(`selected-unit-highlights.ts`) for live projected coverage, one new warning
system (`supply-warning-system.ts`, mirrors `strategic-warning-system.ts`), and
one new presentation registrar (`register-supply-presentation.ts`, mirrors the
other thirteen `register-*-presentation.ts` files). All read-only consumers of
MR1's `supply-*.ts` exports — no `supply-*.ts` module is modified except to add
the one new pure helper the unit panel needs (`getTurnsUntilNextSupplyStage`).

**Tech Stack:** TypeScript, Vitest, Canvas 2D (`CanvasRenderingContext2D`). No
new dependencies.

## Global Constraints

- No `Math.random()` anywhere — this MR has no randomness (deterministic sorts
  only where ordering matters, matching MR1's convention).
- **Difficulty-invariant.** No function in this plan takes a difficulty
  parameter, reads `GameState.opponentChallenge` / `Civilization.challenge`, or
  branches on it. This is UI, but the warning-transition derivation reads game
  state that could theoretically be difficulty-scoped upstream — Task 13 adds
  an explicit regression proving it isn't, matching MR1's Task 12 precedent.
- **Hot-seat / privacy is the single most important constraint in this MR.**
  Every overlay/highlight/warning/tutorial code path MUST pass
  `state.currentPlayer` (or the active hot-seat viewer) — never a selected or
  hovered entity's own owner id — into any `supply-*.ts` query used for
  rendering. `getLandSupplySourceCoverage` and `getPrimarySupplySource` read
  ground-truth `state.map.tiles` directly (not fogged) — safe today because
  MR1 only calls them with the resolving civ's own id inside `processTurn`;
  MR2 is the first UI-facing caller and must preserve that invariant. Task 5's
  overlay presentation and Task 7's projected highlights both additionally
  intersect their output with the viewer's own `VisibilityMap` (via
  `getVisibility`) so nothing is ever painted over fog the viewer hasn't
  earned. Task 13 adds one consolidated regression proving no code path in
  this MR ever queries supply data for a non-viewing civ — this is the
  MR1-design-spec §8 "Safeguard for MR2," a required test, not a suggestion.
- **Road/rail bounded extension is explicitly out of scope.** MR1.1 (contract
  §9, test-matrix scenarios 11-14) has not landed as of this plan's writing
  (issue #544's checklist confirms it unchecked). The overlay does not attempt
  to render road/rail-extended coverage; this is a documented follow-up for
  whenever MR1.1 ships, not a silent gap (see the design spec's own note that
  MR2 must "skip this bullet and note it as a follow-up" if MR1.1 is absent).
- All new `GameSettings` fields are optional — legacy saves load with **zero**
  migration writes for this MR, matching the `hasRoad?: boolean` precedent at
  `src/core/types.ts:289`. The overlay-enabled flag is **session-only, not
  persisted** (Task 6's design note explains why); the warning preference
  **is** a persisted `GameSettings` field (Task 3).
- Every helper in this plan is called from at least one real, non-test code
  path by the time its task is done — no dead helpers (`.claude/rules/game-systems.md`
  / `end-to-end-wiring.md`).
- Full repo test command: `bash scripts/run-with-mise.sh yarn test`. Full
  build/typecheck: `bash scripts/run-with-mise.sh yarn build`. Both must be run
  before the final commit of this plan.
- Reuse existing helpers, never re-derive: `getCivSupplySourceCandidates`,
  `getLandSupplySourceCoverage`, `getPrimarySupplySource`, `LAND_SUPPLY_RADII`
  (`supply-sources.ts`); `OVEREXTENSION_STAGE_TURNS` (`supply-progression.ts`);
  `getShoreSupplyCapability`, `unitParticipatesInLandSupply` (`supply-participation.ts`);
  `getVisibility` (`fog-of-war.ts`); `mapHexesInRange`, `mapDistance`, `hexKey`
  (`hex-utils.ts`); `getFortificationTier` (`fortification-system.ts`);
  `createGameButton` (`ui-kit.ts`) for any new standalone button outside
  `primary-action-bar.ts`'s own bespoke icon-button convention.

---

## File Structure

- **Modify** `src/systems/supply-progression.ts` — add
  `getTurnsUntilNextSupplyStage`. Task 1.
- **Modify** `src/ui/selected-unit-info.ts` — extend `getLandSupplyStatusText`
  with turns-until-next-stage and recovery guidance. Task 2.
- **Modify** `src/core/types.ts` — add `GameSettings.supplyWarningPreference`;
  add `GameEvents['supply:warning']`. Tasks 3, 8.
- **Modify** `src/core/game-state.ts` — default
  `supplyWarningPreference: 'all'` in `createDefaultSettings`. Task 3.
- **Create** `src/systems/supply-overlay-presentation.ts` —
  `getSupplyOverlayPresentationForViewer(state, viewerId)`, pure, viewer- and
  visibility-scoped. Task 4.
- **Create** `src/renderer/supply-overlay-renderer.ts` — `drawSupplyOverlay`,
  mirrors `fog-renderer.ts`. Task 5.
- **Modify** `src/renderer/render-loop.ts` — `supplyOverlayEnabled` field +
  `setSupplyOverlayEnabled` setter + draw-loop call site. Task 5.
- **Modify** `src/ui/primary-action-bar.ts` — Supply overlay toggle button.
  Task 6.
- **Modify** `src/app/controllers/*` composition wiring (exact controller
  identified in Task 6) — wires the toggle button to
  `renderLoop.setSupplyOverlayEnabled`.
- **Modify** `src/renderer/render-loop.ts` — extend `HexHighlight['type']`
  union with `'supply-projected'`; add its color/outline. Task 7.
- **Modify** `src/input/selected-unit-highlights.ts` — projected-coverage
  highlights for a selected naval logistics unit or fort-building Worker.
  Task 7.
- **Create** `src/systems/supply-warning-system.ts` —
  `deriveSupplyWarningTransitions`, `applySupplyWarningTransitions`. Task 8.
- **Modify** `src/app/controllers/turn-flow-controller.ts` — compose
  `applySupplyWarningTransitions` into the existing `postprocess` call. Task 9.
- **Create** `src/ui/supply-warning-presentation.ts` — `presentSupplyWarning`,
  mirrors `strategic-warning-presentation.ts`. Task 10.
- **Create** `src/presentation/register-supply-presentation.ts` — new
  registrar, filters by `state.settings.supplyWarningPreference`. Task 10.
- **Modify** `src/presentation/register-all.ts` — register the new registrar.
  Task 10.
- **Modify** `src/audio/audio-system.ts` — reuse the existing
  strategic-warning stinger for `supply:warning` events, gated by the "Off"
  preference. Task 10.
- **Modify** `src/ui/pause-menu-panel.ts` — All/Critical only/Off preference
  control. Task 11.
- **Modify** `src/core/types.ts` — add `'supply_intro'` to `TutorialStep`.
  Task 12.
- **Modify** `src/ui/tutorial.ts` — new `TUTORIAL_MESSAGES` entry + reopen
  affordance. Task 12.
- **Create** `tests/systems/supply-overlay-presentation.test.ts`,
  `tests/renderer/supply-overlay-renderer.test.ts`,
  `tests/systems/supply-warning-system.test.ts`,
  `tests/presentation/register-supply-presentation.test.ts` (or the
  equivalent existing presentation-registrar test convention — confirmed in
  Task 10), `tests/systems/supply-mr2-privacy.test.ts`. **Modify**
  `tests/systems/supply-progression.test.ts`, `tests/ui/selected-unit-info.test.ts`,
  `tests/input/selected-unit-highlights.test.ts`, `tests/ui/pause-menu-panel.test.ts`,
  `tests/ui/tutorial.test.ts`, `tests/ui/primary-action-bar.test.ts`,
  `tests/audio/audio-system.test.ts` (path confirmed in Task 10),
  `tests/app/controllers/turn-flow-controller.test.ts` (path confirmed in
  Task 9), `tests/core/game-state.test.ts` (path confirmed in Task 3).

---

### Task 1: Turns-until-next-stage helper — `getTurnsUntilNextSupplyStage`

**Files:**
- Modify: `src/systems/supply-progression.ts`
- Test: `tests/systems/supply-progression.test.ts`

**Interfaces:**
- Consumes: `OVEREXTENSION_STAGE_TURNS` (already exported in the same file),
  `UnitLandSupplyStatus` (already exported).
- Produces: `getTurnsUntilNextSupplyStage(status: UnitLandSupplyStatus): number | null`

Contract §12 example: `Movement penalty in 2 turns`. Only meaningful while a
unit is actively counting hostile-unsupported turns toward a worse stage
(`grace` or `degraded`); returns `null` for `full`, `stable-unsupported`
(nothing is counting down — territory class alone determines that state, not a
turn counter), and `severe` (already at the worst stage, nothing further to
count down to).

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-progression.test.ts, appended
import { getTurnsUntilNextSupplyStage } from '@/systems/supply-progression';

describe('getTurnsUntilNextSupplyStage', () => {
  it('returns null for full supply', () => {
    expect(getTurnsUntilNextSupplyStage({ state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 })).toBeNull();
  });

  it('returns null for stable-unsupported (no counter driving a transition)', () => {
    expect(getTurnsUntilNextSupplyStage({ state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 })).toBeNull();
  });

  it('returns null once severe (worst stage, nothing further to count toward)', () => {
    expect(getTurnsUntilNextSupplyStage({ state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 })).toBeNull();
  });

  it('in grace turn 1, 1 more grace turn remains before degraded (turn 2 is still grace)', () => {
    expect(getTurnsUntilNextSupplyStage({ state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 })).toBe(1);
  });

  it('in grace turn 2 (the last grace turn), 1 turn remains until degraded next turn', () => {
    expect(getTurnsUntilNextSupplyStage({ state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 })).toBe(1);
  });

  it('in degraded turn 3, 1 more degraded turn remains before severe (turn 4 is still degraded)', () => {
    expect(getTurnsUntilNextSupplyStage({ state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 })).toBe(1);
  });

  it('in degraded turn 4 (the last degraded turn), 1 turn remains until severe next turn', () => {
    expect(getTurnsUntilNextSupplyStage({ state: 'degraded', hostileUnsupportedTurns: 4, suppliedTurnsSinceRecovery: 0 })).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: FAIL — `getTurnsUntilNextSupplyStage` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/systems/supply-progression.ts, appended
/**
 * Turns remaining before `status` crosses into the next worse stage (contract
 * §12: "Movement penalty in 2 turns"). `null` when there is no countdown to
 * show: `full` and `stable-unsupported` have no active hostile-turn counter,
 * and `severe` is already the worst stage. Reads the same
 * `OVEREXTENSION_STAGE_TURNS` thresholds `advanceOverextensionStage` uses —
 * never hardcode the `2`/`4` boundary separately here.
 */
export function getTurnsUntilNextSupplyStage(status: UnitLandSupplyStatus): number | null {
  if (status.state === 'grace') {
    return OVEREXTENSION_STAGE_TURNS.graceEndsAfter - status.hostileUnsupportedTurns + 1;
  }
  if (status.state === 'degraded') {
    return OVEREXTENSION_STAGE_TURNS.degradedEndsAfter - status.hostileUnsupportedTurns + 1;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-progression.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/supply-progression.ts tests/systems/supply-progression.test.ts
git commit -m "feat(#544): add getTurnsUntilNextSupplyStage for the unit panel"
```

---

### Task 2: Unit panel — turns-until-next-stage and recovery guidance

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

**Interfaces:**
- Consumes: `getTurnsUntilNextSupplyStage` (Task 1),
  `getPrimarySupplySource` (already imported in this file).
- Produces: extends the existing (module-private) `getLandSupplyStatusText`
  return value with an appended second line — no new exported function.

`getLandSupplyStatusText` already returns a single string. This task changes
its return type to allow multiple lines (still `string | null`, joined with
`\n`, matching how `descDiv`/other multi-fact panel lines in this file already
render plain multi-line `textContent`) — actually this file renders each fact
as its own `<div>`; to stay consistent with that convention, this task
**returns an array of lines** and updates the one call site to render one
`<div>` per line instead of a single line, rather than concatenating with
`\n` inside a single `textContent` (which would not visually wrap the same way
the rest of this panel's multi-fact blocks do).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/selected-unit-info.test.ts — read the existing "#544 land supply
// status line" describe block first (search for `getLandSupplyStatusText`
// coverage) and extend it in place; this appends new cases to that block.
it('shows turns-until-next-stage in the grace stage', () => {
  const state = makeStateWithSelectedUnit();
  const unit = state.units['u1']!;
  state.units['u1'] = { ...unit, landSupply: { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } };
  const container = document.createElement('div');
  renderSelectedUnitInfo(container, state, 'u1', {});
  expect(container.textContent).toContain('Movement penalty in');
});

it('shows recovery guidance naming the nearest source when stable-unsupported', () => {
  const state = makeStateWithSelectedUnit();
  // makeStateWithSelectedUnit's fixture places a city within LAND_SUPPLY_RADII.city
  // of the unit -- see fixture setup below for the exact coordinates used.
  const unit = state.units['u1']!;
  state.units['u1'] = { ...unit, landSupply: { state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } };
  const container = document.createElement('div');
  renderSelectedUnitInfo(container, state, 'u1', {});
  expect(container.textContent).toContain('Move toward');
});

it('shows "no source in range" recovery guidance when nothing covers the unit', () => {
  const state = makeStateWithSelectedUnit();
  const unit = state.units['u1']!;
  state.units['u1'] = {
    ...unit,
    position: { q: 0, r: 0 }, // fixture's only city/fort source is far away
    landSupply: { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 },
  };
  const container = document.createElement('div');
  renderSelectedUnitInfo(container, state, 'u1', {});
  expect(container.textContent).toContain('No supply source in range');
});
```

Check the file's actual existing fixture helper name (`makeStateWithSelectedUnit`
or equivalent) before writing this — grep
`tests/ui/selected-unit-info.test.ts` for the fixture builder already used by
the existing land-supply describe block and reuse it exactly rather than
introducing a second one.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/selected-unit-info.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/ui/selected-unit-info.ts — replace getLandSupplyStatusText's signature
// and body (keep the existing doc comment's privacy rationale, extend it):
import { getTurnsUntilNextSupplyStage } from '@/systems/supply-progression';

function getLandSupplyStatusLines(state: GameState, unit: Unit): string[] | null {
  if (unit.owner !== state.currentPlayer) return null;
  if (!unitParticipatesInLandSupply(unit)) return null;
  const status = unit.landSupply;
  if (status === undefined || status.state === 'full') {
    const source = getPrimarySupplySource(state, unit.owner, unit.position);
    const sourceLabel = source
      ? (source.kind === 'city' ? state.cities[source.id]?.name ?? 'a city' : 'a Fort')
      : 'territory';
    return [`Full Supply — ${sourceLabel}`];
  }
  const lines: string[] = [];
  if (status.state === 'stable-unsupported') lines.push('Stable but Unsupported — no healing');
  else if (status.state === 'grace') lines.push('Overextended — Stage 1 of 3');
  else if (status.state === 'degraded') lines.push('Overextended — Stage 2 of 3 · -10% Combat');
  else lines.push('Overextended — Stage 3 of 3 · -10% Combat, -1 Movement');

  const turnsUntilNext = getTurnsUntilNextSupplyStage(status);
  if (turnsUntilNext !== null) {
    const nextPenalty = status.state === 'grace' ? '-10% Combat' : '-1 Movement';
    lines.push(`${nextPenalty} in ${turnsUntilNext} turn${turnsUntilNext === 1 ? '' : 's'}`);
  }

  const recoverySource = getPrimarySupplySource(state, unit.owner, unit.position);
  lines.push(recoverySource
    ? `Move toward ${recoverySource.kind === 'city' ? state.cities[recoverySource.id]?.name ?? 'your city' : 'your Fort'} to recover`
    : 'No supply source in range — retreat toward friendly territory');
  return lines;
}
```

```ts
// src/ui/selected-unit-info.ts — update the one call site (~line 310):
  const landSupplyStatusLines = getLandSupplyStatusLines(state, unit);
  if (landSupplyStatusLines) {
    for (const line of landSupplyStatusLines) {
      const supplyLine = document.createElement('div');
      supplyLine.style.cssText = 'font-size:11px;margin-top:2px;color:#c9d6e3;';
      supplyLine.textContent = line;
      wrapper.appendChild(supplyLine);
    }
  }
```

The renamed function is module-private (no `export`), matching the original —
no other file imports it.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/selected-unit-info.test.ts`
Expected: PASS. Also re-run the full file to confirm the rename didn't break
the pre-existing "Full Supply" / "Overextended" line assertions from MR1:

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/selected-unit-info.test.ts`
Expected: PASS, unchanged pass count for the pre-existing cases plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/ui/selected-unit-info.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(#544): show turns-until-next-stage and recovery guidance in the unit panel"
```

---

### Task 3: `GameSettings.supplyWarningPreference`

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/game-state.ts`
- Test: `tests/core/game-state.test.ts` (confirm this file exists; if the
  repo's default-settings test lives elsewhere, grep
  `tests/**/game-state.test.ts` or `tests/**/*settings*.test.ts` for the
  existing `createDefaultSettings` coverage and extend that file instead)

**Interfaces:**
- Produces: `GameSettings.supplyWarningPreference?: 'all' | 'critical' | 'off'`

Persisted because it is a durable player preference, not transient view state
(contract §12: "Warning preference: All / Critical only / Off" — the same
category as `advisorsEnabled`, `councilTalkLevel`). Optional with `'all'` as
the *effective* default (Task 10's filter treats `undefined` as `'all'`) so a
legacy save with no field behaves exactly like a fresh game — matching the
`hasRoad?: boolean` "absence means never resolved" precedent; no migration
needed.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/game-state.test.ts (or the equivalent file — confirm path first), appended
it('new games default supplyWarningPreference to all', () => {
  const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Settings Test', seed: 'supply-warning-default' });
  expect(state.settings.supplyWarningPreference).toBe('all');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the type field**

```ts
// src/core/types.ts — GameSettings, alongside councilTalkLevel:
  /**
   * End-turn supply-warning delivery filter (#544 MR2, contract §12).
   * Presentation-only: never gates `deriveSupplyWarningTransitions`'s own
   * computation, only which already-derived warnings reach the player.
   * `undefined` (legacy saves) is treated identically to `'all'`.
   */
  supplyWarningPreference?: 'all' | 'critical' | 'off';
```

- [ ] **Step 4: Add the default**

```ts
// src/core/game-state.ts — createDefaultSettings, alongside councilTalkLevel:
    councilTalkLevel: 'normal',
    supplyWarningPreference: 'all',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/game-state.ts tests/core/game-state.test.ts
git commit -m "feat(#544): add persisted supplyWarningPreference setting"
```

---

### Task 4: Overlay data prep — `getSupplyOverlayPresentationForViewer`

**Files:**
- Create: `src/systems/supply-overlay-presentation.ts`
- Test: `tests/systems/supply-overlay-presentation.test.ts`

**Interfaces:**
- Consumes: `getCivSupplySourceCandidates`, `getLandSupplySourceCoverage`,
  `LAND_SUPPLY_RADII` (`supply-sources.ts`); `classifyLandSupplyTerritory`
  (`supply-territory.ts`); `getVisibility` (`fog-of-war.ts`); `getNavalShoreSupplyAssignments`
  (`supply-naval.ts`).
- Produces:
  ```ts
  export interface SupplyOverlayTile {
    coord: HexCoord;
    coverage: 'full' | 'stable-unsupported';
  }
  export interface SupplyOverlaySource {
    kind: 'city' | 'fort' | 'ship';
    coord: HexCoord;
  }
  export interface SupplyOverlayPresentation {
    tiles: SupplyOverlayTile[];
    sources: SupplyOverlaySource[];
  }
  export function getSupplyOverlayPresentationForViewer(
    state: GameState,
    viewerId: string,
  ): SupplyOverlayPresentation
  ```

Per contract §12 + the design spec's §8 Safeguard: friendly/allied-only,
never enemy coverage; every tile in the result must currently be `'visible'`
to `viewerId` (own `VisibilityMap`); `getCivSupplySourceCandidates` is called
exactly once for `viewerId`, not per tile (the exact performance bug MR1's own
post-implementation review found and fixed in the backend resolver — the
overlay renderer must not reintroduce it).

**Inline-review fix:** contract §12's overlay bullet list has five layers —
Full Supply, Stable-but-Unsupported, sources, naval shore-supply reach, and
(deferred) road/rail. An earlier draft of this task listed
`getNavalShoreSupplyAssignments` as a dependency but never actually called it,
silently dropping naval shore-supply from the overlay entirely. Naval shore
supply doesn't work like a Fort/City radius — MR1's algorithm assigns Full
Supply directly to specific *units* within range and capacity (closest-ship-
wins), not to a tile-radius area — so the honest representation is: (1) every
one of the viewer's own shore-supply-capable ships appears as a `'ship'`
source marker (contract's "the sources themselves," extended to naval), and
(2) any of the viewer's own units currently in
`getNavalShoreSupplyAssignments(state, viewerId)` has its tile marked `'full'`
coverage, **even if that tile is not owned by the viewer** (shore supply is
specifically for landing forces on foreign/unclaimed shores, so restricting
tile inclusion to `tile.owner === viewerId` would silently drop exactly the
units this feature exists for). Both are folded into Step 3 below.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-overlay-presentation.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { City, GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import * as supplySources from '@/systems/supply-sources';
import { getSupplyOverlayPresentationForViewer } from '@/systems/supply-overlay-presentation';

function makeOverlayState(): GameState {
  const owner = 'rome';
  const map: GameMap = { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 10; q++) {
    for (let r = 0; r < 10; r++) {
      const coord = { q, r };
      map.tiles[hexKey(coord)] = {
        coord, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const cities: GameState['cities'] = { c1: { id: 'c1', owner, name: 'Rome', position: { q: 5, r: 5 } } as City };
  const visibility = { tiles: Object.fromEntries(
    Object.keys(map.tiles).map(key => [key, 'visible' as const]),
  ), lastSeen: {} };
  return {
    map, cities, units: {},
    currentPlayer: owner,
    civilizations: {
      [owner]: { id: owner, techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
      carthage: { id: 'carthage', techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
    },
  } as unknown as GameState;
}

describe('getSupplyOverlayPresentationForViewer', () => {
  it('marks a tile within City range as full coverage and lists the city as a source', () => {
    const state = makeOverlayState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    const covered = result.tiles.find(t => t.coord.q === 5 && t.coord.r === 6);
    expect(covered?.coverage).toBe('full');
    expect(result.sources).toContainEqual({ kind: 'city', coord: { q: 5, r: 5 } });
  });

  it('a tile outside every source radius is stable-unsupported, not full', () => {
    const state = makeOverlayState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    const farTile = result.tiles.find(t => t.coord.q === 0 && t.coord.r === 0);
    expect(farTile?.coverage).toBe('stable-unsupported');
  });

  it('never includes a tile the viewer cannot currently see', () => {
    const state = makeOverlayState();
    state.civilizations.rome!.visibility.tiles[hexKey({ q: 5, r: 6 })] = 'fog';
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.tiles.some(t => t.coord.q === 5 && t.coord.r === 6)).toBe(false);
  });

  it('never includes another civ\'s territory or sources, even in-range and visible', () => {
    const state = makeOverlayState();
    state.map.tiles[hexKey({ q: 5, r: 5 })]!.owner = 'carthage';
    state.cities.c1!.owner = 'carthage';
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources).toHaveLength(0);
    expect(result.tiles.every(t => t.coverage !== 'full')).toBe(true);
  });

  it('calls getCivSupplySourceCandidates exactly once per viewer, not once per tile', () => {
    const state = makeOverlayState();
    const spy = vi.spyOn(supplySources, 'getCivSupplySourceCandidates');
    getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('lists a friendly shore-supply-capable ship as a ship source', () => {
    const state = makeOverlayState();
    state.units.ship1 = {
      id: 'ship1', owner: 'rome', type: 'transport', position: { q: 4, r: 5 },
      health: 100, movementPointsLeft: 3,
    } as GameState['units'][string];
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources).toContainEqual({ kind: 'ship', coord: { q: 4, r: 5 } });
  });

  it('marks a shore-supplied unit\'s tile as full coverage even outside the viewer\'s own territory', () => {
    const state = makeOverlayState();
    // Outside City radius and not owned by the viewer -- would otherwise be
    // excluded from `tiles` entirely (or shown stable-unsupported at best).
    state.map.tiles[hexKey({ q: 0, r: 0 })]!.owner = null;
    state.units.landing1 = {
      id: 'landing1', owner: 'rome', type: 'warrior', position: { q: 0, r: 0 },
      health: 100, movementPointsLeft: 1,
    } as GameState['units'][string];
    vi.spyOn(await import('@/systems/supply-naval'), 'getNavalShoreSupplyAssignments').mockReturnValue(new Set(['landing1']));
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    const entry = result.tiles.find(t => t.coord.q === 0 && t.coord.r === 0);
    expect(entry?.coverage).toBe('full');
    vi.restoreAllMocks();
  });
});
```

The second new test's `vi.spyOn(await import(...))` form requires the test
function to be `async`; adjust the `it(...)` callback to `async () => { ... }`
when implementing (a plan-doc formatting simplification, not a behavior
change).

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-overlay-presentation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/systems/supply-overlay-presentation.ts
import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import {
  getCivSupplySourceCandidates,
  getLandSupplySourceCoverage,
} from '@/systems/supply-sources';
import { getShoreSupplyCapability } from '@/systems/supply-participation';
import { getNavalShoreSupplyAssignments } from '@/systems/supply-naval';

export interface SupplyOverlayTile {
  coord: HexCoord;
  coverage: 'full' | 'stable-unsupported';
}

export interface SupplyOverlaySource {
  kind: 'city' | 'fort' | 'ship';
  coord: HexCoord;
}

export interface SupplyOverlayPresentation {
  tiles: SupplyOverlayTile[];
  sources: SupplyOverlaySource[];
}

/**
 * Viewer-scoped, friendly/allied-territory-only supply overlay data (contract
 * §12). Every returned tile/source is currently `'visible'` to `viewerId`'s
 * own `VisibilityMap` — never rendered from remembered/fogged state, and
 * never computed for any civ other than `viewerId` (design spec §8 Safeguard
 * for MR2: this and `getPrimarySupplySource` read ground-truth
 * `state.map.tiles` directly, so a call with an opponent's civId would leak
 * undiscovered infrastructure). `getCivSupplySourceCandidates` is computed
 * once, not per tile — the exact perf bug MR1's post-implementation review
 * fixed in the backend resolver.
 */
export function getSupplyOverlayPresentationForViewer(
  state: GameState,
  viewerId: string,
): SupplyOverlayPresentation {
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility) return { tiles: [], sources: [] };

  const candidates = getCivSupplySourceCandidates(state, viewerId);
  const shipSources: SupplyOverlaySource[] = Object.values(state.units)
    .filter(unit => unit.owner === viewerId && getShoreSupplyCapability(unit.type) !== null)
    .map(unit => ({ kind: 'ship' as const, coord: unit.position }));
  const sources: SupplyOverlaySource[] = [
    ...candidates.cities.map(city => ({ kind: 'city' as const, coord: city.position })),
    ...candidates.fortCoords.map(coord => ({ kind: 'fort' as const, coord })),
    ...shipSources,
  ].filter(source => getVisibility(visibility, source.coord) === 'visible');

  const tiles: SupplyOverlayTile[] = [];
  const tileByKey = new Map<string, SupplyOverlayTile>();
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.owner !== viewerId) continue;
    if (getVisibility(visibility, tile.coord) !== 'visible') continue;
    const covered = getLandSupplySourceCoverage(state, viewerId, tile.coord, candidates);
    const entry: SupplyOverlayTile = { coord: tile.coord, coverage: covered ? 'full' : 'stable-unsupported' };
    tiles.push(entry);
    tileByKey.set(hexKey(tile.coord), entry);
  }

  // Naval shore supply assigns Full Supply to specific units, not a tile
  // radius (see this task's inline-review note above) -- surface it as a
  // per-unit tile override, including tiles the viewer doesn't own (a
  // landing force on a foreign/unclaimed shore is exactly what this covers).
  for (const unitId of getNavalShoreSupplyAssignments(state, viewerId)) {
    const unit = state.units[unitId];
    if (!unit || unit.owner !== viewerId) continue;
    const key = hexKey(unit.position);
    const existing = tileByKey.get(key);
    if (existing) {
      existing.coverage = 'full';
    } else {
      const entry: SupplyOverlayTile = { coord: unit.position, coverage: 'full' };
      tiles.push(entry);
      tileByKey.set(key, entry);
    }
  }

  return { tiles, sources };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-overlay-presentation.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/systems/supply-overlay-presentation.ts tests/systems/supply-overlay-presentation.test.ts
git commit -m "feat(#544): viewer-scoped supply overlay data prep, computed once per civ"
```

---

### Task 5: Overlay renderer + toggle

**Files:**
- Create: `src/renderer/supply-overlay-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/renderer/supply-overlay-renderer.test.ts`

**Interfaces:**
- Consumes: `SupplyOverlayPresentation` (Task 4).
- Produces: `drawSupplyOverlay(ctx, presentation, mapWidth, mapHeight, camera, wrapsHorizontally): void`,
  `RenderLoop.setSupplyOverlayEnabled(enabled: boolean): void`.

Mirrors `fog-renderer.ts`'s `drawFogOfWar` shape (closest existing precedent
per the design contract), but iterates the (already viewer/visibility-
filtered, already-computed) `presentation.tiles`/`presentation.sources` arrays
instead of scanning every map coordinate — cheaper than fog's full-grid scan
because Task 4 already did the filtering once, off the per-frame hot path is
still respected since `getSupplyOverlayPresentationForViewer` itself is called
once per `setGameState`, not once per animation frame (see Step 3's `RenderLoop`
wiring, which caches the presentation the same way `worldPressurePresentation`
is already cached — grep `worldPressurePresentation` in `render-loop.ts` for
the exact caching convention to follow).

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/supply-overlay-renderer.test.ts
import { describe, expect, it, vi } from 'vitest';
import { Camera } from '@/renderer/camera';
import { drawSupplyOverlay } from '@/renderer/supply-overlay-renderer';
import type { SupplyOverlayPresentation } from '@/systems/supply-overlay-presentation';

function makeCtx(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe('drawSupplyOverlay', () => {
  it('fills one hex per presented tile and draws a source marker per source', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(800, 600);
    camera.isHexVisible = () => true;
    const presentation: SupplyOverlayPresentation = {
      tiles: [{ coord: { q: 1, r: 1 }, coverage: 'full' }, { coord: { q: 2, r: 1 }, coverage: 'stable-unsupported' }],
      sources: [{ kind: 'city', coord: { q: 1, r: 1 } }],
    };
    drawSupplyOverlay(ctx, presentation, 10, 10, camera, false);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for an empty presentation', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(800, 600);
    drawSupplyOverlay(ctx, { tiles: [], sources: [] }, 10, 10, camera, false);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });
});
```

`Camera` has no explicit constructor (bare field defaults); `setViewport(width, height)`
sets `width`/`height` after construction, and `isHexVisible` is a plain
prototype method (safely instance-overridable for the stub above) — verified
against `src/renderer/camera.ts` directly, not assumed.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/renderer/supply-overlay-renderer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the renderer**

```ts
// src/renderer/supply-overlay-renderer.ts
import { hexToPixel, HEX_CORNERS_POINTY } from '@/systems/hex-utils';
import type { SupplyOverlayPresentation } from '@/systems/supply-overlay-presentation';
import type { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

const COVERAGE_FILL: Record<'full' | 'stable-unsupported', string> = {
  full: 'rgba(80, 200, 120, 0.28)',
  'stable-unsupported': 'rgba(232, 193, 112, 0.22)',
};

export function drawSupplyOverlay(
  ctx: CanvasRenderingContext2D,
  presentation: SupplyOverlayPresentation,
  mapWidth: number,
  mapHeight: number,
  camera: Camera,
  wrapsHorizontally: boolean,
): void {
  const size = camera.hexSize;
  for (const tile of presentation.tiles) {
    const renderCoords = wrapsHorizontally
      ? getHorizontalWrapRenderCoords(tile.coord, mapWidth, camera)
      : [tile.coord];
    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;
      const pixel = hexToPixel(renderCoord, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const corner = HEX_CORNERS_POINTY[i];
        const x = screen.x + corner.dx * scaledSize;
        const y = screen.y + corner.dy * scaledSize;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = COVERAGE_FILL[tile.coverage];
      ctx.fill();
    }
  }

  const SOURCE_COLOR: Record<'city' | 'fort' | 'ship', string> = {
    city: '#f8d28a',
    fort: '#8b7355',
    ship: '#5dd5ff',
  };
  for (const source of presentation.sources) {
    const pixel = hexToPixel(source.coord, size);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * camera.zoom * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = SOURCE_COLOR[source.kind];
    ctx.fill();
  }
}
```

Colorblind note: the two tile-coverage fill colors (`full` green vs.
`stable-unsupported` amber) are hue-distinct but both read as muted
yellow-green under deuteranopia, matching this renderer's own established
`paradrop-target`/`air-assault-target` precedent of relying on an
accompanying text surface (here: Task 2's unit-panel status line, which
spells out "Full Supply" vs. "Stable but Unsupported" in words) rather than
color alone — not a new gap this task introduces, and out of scope to solve
generically here (it would need a per-highlight-type icon-overlay rendering
feature this codebase doesn't have anywhere yet).

- [ ] **Step 4: Wire into `RenderLoop`**

```ts
// src/renderer/render-loop.ts — imports:
import { drawSupplyOverlay } from './supply-overlay-renderer';
import { getSupplyOverlayPresentationForViewer, type SupplyOverlayPresentation } from '@/systems/supply-overlay-presentation';

// class RenderLoop — alongside worldPressurePresentation's own caching field:
  private supplyOverlayEnabled = false;
  private supplyOverlayPresentation: SupplyOverlayPresentation = { tiles: [], sources: [] };

  setSupplyOverlayEnabled(enabled: boolean): void {
    this.supplyOverlayEnabled = enabled;
    if (enabled && this.state) {
      this.supplyOverlayPresentation = getSupplyOverlayPresentationForViewer(this.state, this.state.currentPlayer);
    }
  }

  /**
   * Lets a UI element (Task 6's toggle button) read the current state instead
   * of assuming it starts `false` — matters if that element is ever
   * reconstructed mid-session (e.g. a future panel-refresh path) while the
   * overlay is already on; a hardcoded initial value would visually desync
   * from `RenderLoop`'s actual state.
   */
  isSupplyOverlayEnabled(): boolean {
    return this.supplyOverlayEnabled;
  }
```

```ts
// src/renderer/render-loop.ts — inside setGameState, alongside where
// worldPressurePresentation is recomputed (grep the exact line — this must
// run in the same place so the overlay refreshes every time state changes,
// not just when the toggle is flipped):
    if (this.supplyOverlayEnabled) {
      this.supplyOverlayPresentation = getSupplyOverlayPresentationForViewer(state, state.currentPlayer);
    }
```

```ts
// src/renderer/render-loop.ts — draw loop, immediately before the existing
// `if (viewerVisibility) { drawFogOfWar(...) }` block:
    if (this.supplyOverlayEnabled && viewerVisibility) {
      drawSupplyOverlay(
        this.ctx,
        this.supplyOverlayPresentation,
        this.state.map.width,
        this.state.map.height,
        this.camera,
        this.state.map.wrapsHorizontally,
      );
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/renderer/supply-overlay-renderer.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/supply-overlay-renderer.ts src/renderer/render-loop.ts tests/renderer/supply-overlay-renderer.test.ts
git commit -m "feat(#544): render the toggleable supply overlay"
```

---

### Task 6: Overlay toggle button

**Files:**
- Modify: `src/ui/primary-action-bar.ts`
- Modify: the controller that constructs `PrimaryActionBarCallbacks` (grep
  `createPrimaryActionBar(` for the real call site — likely a
  `src/app/controllers/*` composition file or `src/main.ts`; confirm before
  writing this step, per `.claude/rules/spec-fidelity.md`)
- Test: `tests/ui/primary-action-bar.test.ts`

**Design decision (session-only, not persisted):** `supplyOverlayEnabled`
lives only on `RenderLoop` (Task 5), the same category as
`selectedPirateFactionId` — transient view state, not a durable preference.
Rationale: toggling it back on is a single tap, and persisting "the overlay
was on" risks a returning player being confused why the map looks different
with no visible cause. This differs from the warning preference (Task 3),
which *is* persisted because forgetting a chosen notification level would be
actively annoying, not just a one-tap fix.

`primary-action-bar.ts` is one of the two files exempted from
`createGameButton` (`.claude/rules/ui-panels.md`, "No Bare Buttons") because it
already has its own custom icon+label icon-bar design — this task extends that
existing bespoke pattern rather than introducing `createGameButton` into it.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/primary-action-bar.test.ts, appended — read the existing file's
// fixture/callback-stub convention first and match it exactly.
it('renders a Supply toggle button that calls onToggleSupplyOverlay with the flipped state', () => {
  const onToggleSupplyOverlay = vi.fn();
  const bar = createPrimaryActionBar({ ...baseCallbacks(), supplyOverlayEnabled: false, onToggleSupplyOverlay });
  const supplyButton = bar.querySelector('button[aria-label="Supply"]') as HTMLButtonElement;
  expect(supplyButton).toBeTruthy();
  supplyButton.dispatchEvent(new Event('click'));
  expect(onToggleSupplyOverlay).toHaveBeenCalledWith(true);
});

it('shows the Supply button in its active visual state when supplyOverlayEnabled is true', () => {
  const bar = createPrimaryActionBar({ ...baseCallbacks(), supplyOverlayEnabled: true, onToggleSupplyOverlay: vi.fn() });
  const icon = bar.querySelector('button[aria-label="Supply"] span') as HTMLSpanElement;
  expect(icon.style.background).not.toBe('');
});
```

Replace `baseCallbacks()` with however the existing test file already
constructs a full `PrimaryActionBarCallbacks` fixture (grep the file for its
existing pattern — do not invent a second one).

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/primary-action-bar.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/ui/primary-action-bar.ts
export interface PrimaryActionBarCallbacks {
  onOpenCouncil: () => void;
  onOpenTech: () => void;
  onOpenCity: () => void;
  onOpenEspionage: () => void;
  onOpenDiplomacy: () => void;
  onOpenMarketplace: () => void;
  onEndTurn: () => void;
  /** #544 MR2: current toggle state, read at bar-construction time. */
  supplyOverlayEnabled: boolean;
  /** #544 MR2: called with the new (flipped) state on tap. */
  onToggleSupplyOverlay: (enabled: boolean) => void;
}

function createToggleActionButton(
  label: string,
  icon: string,
  initialActive: boolean,
  onToggle: (active: boolean) => void,
): HTMLButtonElement {
  let active = initialActive;
  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:0;background:none;border:0;color:white;font-size:10px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;';
  button.setAttribute('aria-label', label);

  const iconEl = document.createElement('span');
  iconEl.textContent = icon;
  const paint = () => {
    iconEl.style.cssText = `width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;color:white;background:${active ? 'rgba(80,200,120,0.55)' : 'rgba(255,255,255,0.15)'};`;
  };
  paint();
  button.appendChild(iconEl);

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  button.appendChild(labelEl);

  button.addEventListener('click', () => {
    active = !active;
    paint();
    onToggle(active);
  });

  return button;
}

export function createPrimaryActionBar(callbacks: PrimaryActionBarCallbacks): HTMLDivElement {
  const bar = document.createElement('div');
  bar.id = 'bottom-bar';
  bar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:8px 12px 24px;background:rgba(0,0,0,0.8);display:flex;justify-content:space-around;z-index:10;';

  const buttons: ActionButtonDefinition[] = [
    { label: 'Council', icon: '🪑', onClick: callbacks.onOpenCouncil },
    { label: 'Tech', icon: '🔬', onClick: callbacks.onOpenTech },
    { label: 'City', icon: '🏛️', onClick: callbacks.onOpenCity },
    { label: 'Intel', icon: '🕵️', onClick: callbacks.onOpenEspionage },
    { label: 'Diplo', icon: '🤝', onClick: callbacks.onOpenDiplomacy },
    { label: 'Trade', icon: '💰', onClick: callbacks.onOpenMarketplace },
    { label: 'End Turn', icon: '⏭️', accent: '#e8c170', onClick: callbacks.onEndTurn },
  ];

  for (const definition of buttons) {
    bar.appendChild(createActionButton(definition));
  }
  bar.appendChild(createToggleActionButton('Supply', '🚚', callbacks.supplyOverlayEnabled, callbacks.onToggleSupplyOverlay));

  return bar;
}
```

- [ ] **Step 4: Wire the callback to `RenderLoop`**

Locate the real call site (Step 0's grep). Add:

```ts
supplyOverlayEnabled: renderLoop.isSupplyOverlayEnabled(),
onToggleSupplyOverlay: (enabled) => renderLoop.setSupplyOverlayEnabled(enabled),
```

to the `PrimaryActionBarCallbacks` object literal at that call site. **Read
the value from `RenderLoop.isSupplyOverlayEnabled()` (Task 5's getter),
never hardcode `false`** — an earlier draft of this task assumed the bar is
only ever constructed once at session start and hardcoded the initial paint
to `false`, but that assumption isn't verified anywhere in this codebase; if
the bar is ever rebuilt mid-session (e.g. a future panel-refresh path) while
the overlay is already on, a hardcoded `false` would show the button in the
wrong visual state even though `RenderLoop`'s actual toggle is correct.
Reading the getter costs nothing and removes the assumption entirely.

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/primary-action-bar.test.ts`
Expected: PASS. Re-run the full build to catch any other `PrimaryActionBarCallbacks`
construction site the interface change affects:

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — if any other call site fails to typecheck, add the two new
fields there too (there should be exactly one production call site plus this
test file's fixtures).

- [ ] **Step 6: Commit**

```bash
git add src/ui/primary-action-bar.ts tests/ui/primary-action-bar.test.ts
git commit -m "feat(#544): add Supply overlay toggle to the primary action bar"
```

---

### Task 7: Live projected coverage on selection

**Files:**
- Modify: `src/renderer/render-loop.ts` (extend `HexHighlight['type']`)
- Modify: `src/input/selected-unit-highlights.ts`
- Test: `tests/input/selected-unit-highlights.test.ts`

**Interfaces:**
- Consumes: `getShoreSupplyCapability` (`supply-participation.ts`),
  `LAND_SUPPLY_RADII`, `getFortificationTier` (already used elsewhere in this
  file's neighbors), `mapHexesInRange` (`hex-utils.ts`).
- Produces: extends `SelectedUnitHighlightResult.highlights` with
  `type: 'supply-projected'` entries.

**Design decision (documented, not a spec requirement):** this codebase is
mobile-first and tap-based — there is no mouse-hover/drag concept for ship
placement (confirmed: no `hoveredHex`/drag state exists anywhere in
`render-loop.ts` or the controllers). The contract's "moving/hovering naval
logistics sources" and "placing Fort/Citadel where practical" are implemented
here as: **while a friendly naval logistics-capable unit is the selected
unit**, show its projected shore-supply-style radius at its current position;
**while a friendly Worker that could build a Fort here is selected**, show the
Fort/Citadel radius at its current tile. This reuses the exact mechanism
(`buildSelectedUnitHighlights`, feeding `renderLoop.setHighlights`) this
codebase already uses for every other "preview before you commit" surface
(movement range, attack targets, water-recovery) — selection is this
codebase's closest analog to hover. Visual distinction from the resolved
overlay: a dashed outline (`HEX_HIGHLIGHT_OUTLINES`), reusing the existing
outline mechanism `HexHighlight` already has for `zoc-limited`/`water-recovery`,
rather than inventing a second rendering pipeline.

- [ ] **Step 1: Write the failing test**

```ts
// tests/input/selected-unit-highlights.test.ts, appended — read the existing
// file's state-fixture builder first and reuse it.
it('a selected naval transport shows projected supply highlights around its position', () => {
  const state = makeStateWithUnit({ type: 'transport', position: { q: 5, r: 5 } });
  const result = buildSelectedUnitHighlights(state, 'u1');
  const projected = result.highlights.filter(h => h.type === 'supply-projected');
  expect(projected.length).toBeGreaterThan(0);
  expect(projected.every(h => hexDistance(h.coord, { q: 5, r: 5 }) <= 1)).toBe(true); // transport's projectsLandSupplyRange is 1
});

it('a selected Warrior (non-logistics, non-Worker) shows no projected supply highlights', () => {
  const state = makeStateWithUnit({ type: 'warrior', position: { q: 5, r: 5 } });
  const result = buildSelectedUnitHighlights(state, 'u1');
  expect(result.highlights.some(h => h.type === 'supply-projected')).toBe(false);
});

it('a selected Worker standing on a tile eligible to build a Fort shows the Fort-tier projected radius', () => {
  const state = makeStateWithUnit({ type: 'worker', position: { q: 5, r: 5 } });
  // fixture must satisfy getFortificationPlacement's ok: true path -- match
  // the existing worker-highlight test fixture in this same file if one
  // already exercises Build Fort eligibility, rather than re-deriving the
  // placement preconditions here.
  const result = buildSelectedUnitHighlights(state, 'u1');
  const projected = result.highlights.filter(h => h.type === 'supply-projected');
  expect(projected.length).toBeGreaterThan(0);
});
```

Adapt `makeStateWithUnit` to whatever this test file's real fixture helper is
named — grep the file first rather than assuming this name.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/input/selected-unit-highlights.test.ts`
Expected: FAIL

- [ ] **Step 3: Extend `HexHighlight`**

```ts
// src/renderer/render-loop.ts
export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack' | /* ...existing... */ 'air-assault-flak-risk' | 'supply-projected';
}

const HEX_HIGHLIGHT_COLORS: Record<HexHighlight['type'], string> = {
  // ...existing entries unchanged...
  'supply-projected': 'rgba(80, 200, 120, 0.18)',
};

const HEX_HIGHLIGHT_OUTLINES: Partial<Record<HexHighlight['type'], string>> = {
  'zoc-limited': '#fff0a8',
  'water-recovery': '#fff0a8',
  'supply-projected': '#8fe8b0',
};
```

Note: `drawHexHighlight`'s existing signature only strokes a *solid* outline
(no native dash support in the current call — see `hex-renderer.ts:588-613`).
A true dashed stroke would require adding `ctx.setLineDash([...])` to
`drawHexHighlight` and threading a `dashed?: boolean` flag through
`HexHighlight`. Given the projected-vs-resolved fill colors are already
visually distinct (green resolved overlay fill vs. this lighter,
outline-emphasized projected fill, drawn as a `setHighlights` layer that
never coexists with the resolved overlay's own fill on the *same* tile
render call), a solid distinct outline color satisfies "visually distinct...
never mixed into the same layer indistinguishably" without a renderer change
outside this task's scope. If a future pass wants literal dashing, extend
`drawHexHighlight` then — not required here.

- [ ] **Step 4: Implement the projected-highlight builder**

```ts
// src/input/selected-unit-highlights.ts
import { getShoreSupplyCapability } from '@/systems/supply-participation';
import { LAND_SUPPLY_RADII } from '@/systems/supply-sources';
import { getFortificationTier, getFortificationPlacement } from '@/systems/fortification-system';
import { mapHexesInRange } from '@/systems/hex-utils';

function buildSupplyProjectionHighlights(state: GameState, unitId: string): HexHighlight[] {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== state.currentPlayer) return [];

  const shoreCapability = getShoreSupplyCapability(unit.type);
  if (shoreCapability) {
    return mapHexesInRange(state.map, unit.position, shoreCapability.projectsLandSupplyRange)
      .map(coord => ({ coord, type: 'supply-projected' as const }));
  }

  if (unit.type === 'worker') {
    const placement = getFortificationPlacement(state, unit.owner, unit.position);
    if (placement.ok) {
      const tier = getFortificationTier(state.civilizations[unit.owner]?.techState.completed ?? []);
      return mapHexesInRange(state.map, unit.position, LAND_SUPPLY_RADII[tier.id])
        .map(coord => ({ coord, type: 'supply-projected' as const }));
    }
  }

  return [];
}
```

- [ ] **Step 5: Wire it into the existing highlight aggregation**

```ts
// src/input/selected-unit-highlights.ts — inside buildSelectedUnitHighlights,
// append to the returned `highlights` array (find the existing return
// statement / array-spread that assembles `highlights` from
// buildWorkerGuidanceHighlights and the other builders, and add this
// alongside them):
  highlights: [
    ...movementHighlights,
    ...attackHighlights,
    // ...whatever the existing spreads are...
    ...buildSupplyProjectionHighlights(state, unitId),
  ],
```

Confirm the exact existing return-statement shape in
`buildSelectedUnitHighlights` before editing — this plan shows the addition,
not a full rewrite of the surrounding function.

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/input/selected-unit-highlights.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/render-loop.ts src/input/selected-unit-highlights.ts tests/input/selected-unit-highlights.test.ts
git commit -m "feat(#544): live projected supply coverage for selected logistics units/Workers"
```

---

### Task 8: End-turn supply warnings — derive/apply

**Files:**
- Modify: `src/core/types.ts` (new `GameEvents['supply:warning']`)
- Create: `src/systems/supply-warning-system.ts`
- Test: `tests/systems/supply-warning-system.test.ts`

**Interfaces:**
- Consumes: `unitParticipatesInLandSupply` (`supply-participation.ts`).
- Produces:
  ```ts
  export interface SupplyWarning {
    viewerId: string;
    unitIds: string[];
    kind: 'losing-full' | 'entering-combat-penalty' | 'entering-movement-penalty';
    /** At most one `true` per `deriveSupplyWarningTransitions` call (Task 10's audio wiring). */
    playAudio: boolean;
  }
  export function deriveSupplyWarningTransitions(
    beforeRound: Readonly<GameState>,
    finalState: GameState,
    viewerId: string,
  ): SupplyWarning[]
  export function applySupplyWarningTransitions(
    beforeRound: Readonly<GameState>,
    finalState: GameState,
    bus: EventBus,
  ): void
  ```

Unlike `strategic-warning-system.ts`, **no dedup ledger is needed.** AI-plan
warnings need a ledger because the same "plan is mobilizing" condition can
still be true many rounds in a row without a new transition; a per-unit
`landSupply.state` only changes when something actually changes, so comparing
`before.units[id].landSupply?.state` to `after.units[id].landSupply?.state`
naturally fires exactly once per real transition with no persisted state
required — simpler than the pattern it mirrors, and correct because the
underlying data shape differs (a value-comparison, not a still-true
condition). Only three transitions are "meaningful" per contract §12: leaving
`full` for anything else (`losing-full`), entering `degraded` from `grace`
(`entering-combat-penalty`), and entering `severe` from `degraded`
(`entering-movement-penalty`) — not every stage change (e.g., re-entering
`full` after recovery is not itself a warning; it's good news, not something
to warn about).

**Inline-review fix — grouped by `(viewerId, kind)` per round, not per unit.**
An earlier draft emitted one `SupplyWarning` per transitioning unit. A large
overextended offensive stack (exactly the scenario this feature exists to
discourage) can have many units cross the same threshold in the same round —
e.g. 8 units all losing Full Supply together when a push outruns its Fort's
radius — which would have flooded the notification log with 8 near-identical
lines in one turn (`.claude/rules/ui-panels.md`'s "Notifications must
queue — never overwrite" prevents them from being silently dropped, which
makes the flood *worse*, not better). Grouping by `(viewerId, kind)` within
one `deriveSupplyWarningTransitions` call collapses that into one warning
carrying every affected `unitId`, and Task 10's presentation pluralizes the
message by count.

- [ ] **Step 1: Write the failing test**

```ts
// tests/systems/supply-warning-system.test.ts
import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { deriveSupplyWarningTransitions, applySupplyWarningTransitions } from '@/systems/supply-warning-system';
import type { GameState } from '@/core/types';

function withUnitSupply(state: GameState, unitId: string, landSupply: GameState['units'][string]['landSupply']): GameState {
  return { ...state, units: { ...state.units, [unitId]: { ...state.units[unitId]!, landSupply } } };
}

describe('deriveSupplyWarningTransitions', () => {
  function fixture() {
    const base = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Supply Warning Test', seed: 'supply-warning' });
    const unitId = base.civilizations.player!.units[0]!;
    return { base, unitId };
  }

  it('warns when a unit transitions from full to grace (losing Full Supply)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'losing-full', playAudio: true }]);
  });

  it('warns when a unit transitions from grace to degraded (entering combat penalty)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 });
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'entering-combat-penalty', playAudio: true }]);
  });

  it('warns when a unit transitions from degraded to severe (entering movement penalty)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'degraded', hostileUnsupportedTurns: 4, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 });
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'entering-movement-penalty', playAudio: true }]);
  });

  it('groups multiple units crossing the same threshold in one round into one warning', () => {
    const { base, unitId } = fixture();
    const secondUnitId = 'grouped-unit-2';
    const withSecondUnit: GameState = {
      ...base,
      units: {
        ...base.units,
        [secondUnitId]: { ...base.units[unitId]!, id: secondUnitId },
      },
    };
    const before = withUnitSupply(
      withUnitSupply(withSecondUnit, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 },
    );
    const after = withUnitSupply(
      withUnitSupply(before, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 },
    );
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.unitIds.sort()).toEqual([secondUnitId, unitId].sort());
  });

  it('assigns playAudio to only the first warning when multiple kinds fire in one round', () => {
    const { base, unitId } = fixture();
    const secondUnitId = 'audio-unit-2';
    const withSecondUnit: GameState = {
      ...base,
      units: { ...base.units, [secondUnitId]: { ...base.units[unitId]!, id: secondUnitId } },
    };
    const before = withUnitSupply(
      withUnitSupply(withSecondUnit, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 },
    );
    const after = withUnitSupply(
      withUnitSupply(before, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 }),
      secondUnitId, { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    );
    const warnings = deriveSupplyWarningTransitions(before, after, 'player');
    expect(warnings).toHaveLength(2);
    expect(warnings.filter(w => w.playAudio)).toHaveLength(1);
  });

  it('does not warn when returning to full (recovery is not a warning)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'severe', hostileUnsupportedTurns: 6, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    expect(deriveSupplyWarningTransitions(before, after, 'player')).toEqual([]);
  });

  it('does not warn again next round if the state is unchanged (no repeat spam)', () => {
    const { base, unitId } = fixture();
    const before = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
    expect(deriveSupplyWarningTransitions(before, after, 'player')).toEqual([]);
  });

  it('never derives a warning for a non-viewing civ\'s units', () => {
    const { base, unitId } = fixture();
    const aiId = Object.keys(base.civilizations).find(id => id !== 'player')!;
    const aiUnitId = base.civilizations[aiId]!.units[0]!;
    const before = withUnitSupply(base, aiUnitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(before, aiUnitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    // Asking for the AI civ's own warnings is legitimate (each civ gets its own
    // supply warnings); the safeguard is that requesting warnings *as* 'player'
    // never surfaces the AI's unit transition.
    expect(deriveSupplyWarningTransitions(before, after, 'player')).toEqual([]);
  });
});

describe('applySupplyWarningTransitions', () => {
  it('emits one supply:warning event per meaningful transition, for humans only', () => {
    const base = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Supply Warning Apply Test', seed: 'supply-warning-apply' });
    const unitId = base.civilizations.player!.units[0]!;
    const before = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    const bus = new EventBus();
    const received: unknown[] = [];
    bus.on('supply:warning', event => received.push(event));
    applySupplyWarningTransitions(before, after, bus);
    expect(received).toEqual([{ viewerId: 'player', unitIds: [unitId], kind: 'losing-full', playAudio: true }]);
  });
});
```

Check `createNewGame`'s real return shape for `civilizations.player.units`
(array of ids, per MR1's own fixture convention already used in
`strategic-warning-system.test.ts`) before finalizing — mirror that file's
exact fixture pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-warning-system.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the event type**

```ts
// src/core/types.ts — GameEvents, alongside 'ai:strategic-warning':
  'supply:warning': {
    viewerId: string;
    unitIds: string[];
    kind: 'losing-full' | 'entering-combat-penalty' | 'entering-movement-penalty';
    playAudio: boolean;
  };
```

- [ ] **Step 4: Implement**

```ts
// src/systems/supply-warning-system.ts
import type { EventBus } from '@/core/event-bus';
import type { GameState, LandSupplyState } from '@/core/types';
import { unitParticipatesInLandSupply } from '@/systems/supply-participation';

export interface SupplyWarning {
  viewerId: string;
  unitIds: string[];
  kind: 'losing-full' | 'entering-combat-penalty' | 'entering-movement-penalty';
  playAudio: boolean;
}

const WARNING_KINDS: SupplyWarning['kind'][] = [
  'losing-full', 'entering-combat-penalty', 'entering-movement-penalty',
];

function classifyTransition(before: LandSupplyState, after: LandSupplyState): SupplyWarning['kind'] | null {
  if (before === after) return null;
  if (before === 'full') return 'losing-full';
  if (before === 'grace' && after === 'degraded') return 'entering-combat-penalty';
  if (before === 'degraded' && after === 'severe') return 'entering-movement-penalty';
  return null;
}

/**
 * Meaningful-transition-only supply warnings for `viewerId` (contract §12),
 * grouped by `(viewerId, kind)` so a stack of units crossing the same
 * threshold in one round produces one warning, not a flood (plan Task 8's
 * inline-review note). No ledger — a value-comparison of `landSupply.state`
 * before/after already fires exactly once per real transition. Only ever
 * reads `viewerId`'s own units (design spec §8 Safeguard for MR2).
 */
export function deriveSupplyWarningTransitions(
  beforeRound: Readonly<GameState>,
  finalState: GameState,
  viewerId: string,
): SupplyWarning[] {
  const viewer = finalState.civilizations[viewerId];
  if (!viewer?.isHuman || viewer.isEliminated) return [];

  const unitIdsByKind = new Map<SupplyWarning['kind'], string[]>();
  for (const unit of Object.values(finalState.units)) {
    if (unit.owner !== viewerId) continue;
    if (!unitParticipatesInLandSupply(unit)) continue;
    const beforeUnit = beforeRound.units[unit.id];
    const beforeState = beforeUnit?.landSupply?.state ?? 'full';
    const afterState = unit.landSupply?.state ?? 'full';
    const kind = classifyTransition(beforeState, afterState);
    if (!kind) continue;
    const existing = unitIdsByKind.get(kind);
    if (existing) existing.push(unit.id);
    else unitIdsByKind.set(kind, [unit.id]);
  }

  let audioAssigned = false;
  const warnings: SupplyWarning[] = [];
  for (const kind of WARNING_KINDS) {
    const unitIds = unitIdsByKind.get(kind);
    if (!unitIds || unitIds.length === 0) continue;
    const playAudio = !audioAssigned;
    audioAssigned = true;
    warnings.push({ viewerId, unitIds: unitIds.sort(), kind, playAudio });
  }
  return warnings;
}

export function applySupplyWarningTransitions(
  beforeRound: Readonly<GameState>,
  finalState: GameState,
  bus: EventBus,
): void {
  for (const viewerId of Object.values(finalState.civilizations)
    .filter(civ => civ.isHuman && !civ.isEliminated)
    .map(civ => civ.id)
    .sort()) {
    for (const warning of deriveSupplyWarningTransitions(beforeRound, finalState, viewerId)) {
      bus.emit('supply:warning', warning);
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-warning-system.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/supply-warning-system.ts tests/systems/supply-warning-system.test.ts
git commit -m "feat(#544): derive meaningful-transition-only end-turn supply warnings"
```

---

### Task 9: Wire supply warnings into round postprocessing

**Files:**
- Modify: `src/app/controllers/turn-flow-controller.ts`
- Test: find the existing test file covering `runCurrentCompletedRound`'s
  `postprocess` composition (grep `applyStrategicWarningTransitions` across
  `tests/app/controllers/*.test.ts` — likely
  `tests/app/controllers/turn-flow-controller.test.ts`; confirm the exact path
  before writing this task's test, per `.claude/rules/spec-fidelity.md`)

**Interfaces:**
- Consumes: `applySupplyWarningTransitions` (Task 8), `applyStrategicWarningTransitions`
  (already imported in this file).

`runCompletedRound`'s `postprocess` option accepts exactly one function
(confirmed in `src/core/completed-round-orchestrator.ts`) — this task composes
both postprocess steps in sequence inside the existing lambda rather than
changing `runCompletedRound`'s signature to accept an array (smaller diff, and
`completed-round-orchestrator.ts` is shared infrastructure this MR should not
otherwise touch).

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/controllers/turn-flow-controller.test.ts, appended (adapt to the
// file's existing setup/fixture helpers — read the file first for the exact
// pattern used to construct a controller instance and a bus spy)
it('runCurrentCompletedRound also applies supply warning transitions', () => {
  // Arrange a controller + state where a participating unit's landSupply
  // transitions from full to grace during the round (drive this via the
  // same processTurn-triggering setup the file's other postprocess tests
  // already use for strategic warnings, adapted to a hostile-unsupported
  // unit instead of an AI plan).
  // Act: call runCurrentCompletedRound(state).
  // Assert: a 'supply:warning' event was emitted on the bus, using the same
  // spy-on-bus.emit pattern this file's existing strategic-warning
  // postprocess test already uses.
});
```

Because the exact existing test's state-setup helpers are file-specific and
this plan has not read that test file's fixtures in full, this step is
intentionally a structural sketch: **before implementing, read
`tests/app/controllers/turn-flow-controller.test.ts`'s existing
`applyStrategicWarningTransitions` coverage in full and write this test to the
same concrete pattern** (same fixture builder, same bus-spy mechanism, same
assertion style) rather than inventing a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/app/controllers/turn-flow-controller.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/app/controllers/turn-flow-controller.ts
import { applySupplyWarningTransitions } from '@/systems/supply-warning-system';

// ...

  function runCurrentCompletedRound(state: GameState): CompletedRoundResult {
    return runCompletedRound(state, bus, {
      improvements: (current, eventBus) => processImprovementTurns(current, eventBus),
      majors: (current, eventBus) => processNonHumanMajorRound(current, eventBus).state,
      world: (current, eventBus) => processTurn(current, eventBus),
      postprocess: (beforeRound, current, eventBus) => {
        const afterStrategic = applyStrategicWarningTransitions(beforeRound, current, eventBus);
        applySupplyWarningTransitions(beforeRound, afterStrategic, eventBus);
        return afterStrategic;
      },
    });
  }
```

`applySupplyWarningTransitions` returns `void` (Task 8) — unlike
`applyStrategicWarningTransitions`, it has no `GameState` mutation to thread
through (no ledger field to write back), so `afterStrategic` is the correct
final state to return unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/app/controllers/turn-flow-controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/controllers/turn-flow-controller.ts tests/app/controllers/turn-flow-controller.test.ts
git commit -m "feat(#544): apply supply warning transitions during round postprocessing"
```

---

### Task 10: Presentation + preference-filtered delivery

**Files:**
- Create: `src/ui/supply-warning-presentation.ts`
- Create: `src/presentation/register-supply-presentation.ts`
- Modify: `src/presentation/register-all.ts`
- Test: `tests/ui/supply-warning-presentation.test.ts`,
  `tests/presentation/register-supply-presentation.test.ts` (confirm the real
  test directory for presentation registrars — grep
  `tests/**/register-general-presentation.test.ts` for the existing
  convention and mirror its path exactly)

**Interfaces:**
- Consumes: `SupplyWarning` (Task 8), `NotificationSink` (`notification-routing.ts`),
  `state.settings.supplyWarningPreference` (Task 3).
- Produces: `presentSupplyWarning(warning: SupplyWarning): { message: string; type: NotificationEntry['type'] }`,
  `registerSupplyPresentation: PresentationRegistrar`.

The All/Critical-only/Off filter lives here, in the registrar — never inside
`deriveSupplyWarningTransitions` (contract §12: "presentation-only; never
changes mechanics"). "Critical" = `entering-combat-penalty` and
`entering-movement-penalty` (the two that carry an active game-mechanical
penalty); `losing-full` (a heads-up before any penalty applies) is filtered
out under "Critical only" but shown under "All".

**Inline-review fix — `losing-full` is `'info'`, not `'warning'`.** An
earlier draft delivered all three kinds as `NotificationEntry['type']:
'warning'`. That flattens the actual severity gradient the All/Critical/Off
preference exists to let players tune: `losing-full` is a heads-up with no
mechanical effect yet, while the other two kinds mean an active combat or
movement penalty just started. Presenting all three identically undermines
the preference itself — a player who sets "Critical only" specifically
because they want to be bothered only by real penalties would still see the
non-critical kind rendered with the same alarming color as the critical ones
whenever "All" is selected. `losing-full` → `'info'`; the other two →
`'warning'`.

- [ ] **Step 1: Write the failing test — presentation formatting**

```ts
// tests/ui/supply-warning-presentation.test.ts
import { describe, expect, it } from 'vitest';
import { presentSupplyWarning } from '@/ui/supply-warning-presentation';

describe('presentSupplyWarning', () => {
  it('formats losing-full as an info-level notification, not a warning', () => {
    const result = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
    expect(result.type).toBe('info');
    expect(result.message).toContain('Full Supply');
  });

  it('formats entering-combat-penalty as a warning naming the -10% effect', () => {
    const result = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'entering-combat-penalty', playAudio: true });
    expect(result.type).toBe('warning');
    expect(result.message).toContain('-10%');
  });

  it('formats entering-movement-penalty as a warning naming the -1 movement effect', () => {
    const result = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'entering-movement-penalty', playAudio: true });
    expect(result.type).toBe('warning');
    expect(result.message).toContain('Movement');
  });

  it('pluralizes the message when more than one unit is grouped into the warning', () => {
    const single = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1'], kind: 'losing-full', playAudio: true });
    const grouped = presentSupplyWarning({ viewerId: 'player', unitIds: ['u1', 'u2', 'u3'], kind: 'losing-full', playAudio: true });
    expect(single.message).toContain('A unit');
    expect(grouped.message).toContain('3 units');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/supply-warning-presentation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement presentation**

```ts
// src/ui/supply-warning-presentation.ts
import type { NotificationEntry } from '@/core/notification-log';
import type { SupplyWarning } from '@/systems/supply-warning-system';

const MESSAGES: Record<SupplyWarning['kind'], (count: number) => string> = {
  'losing-full': (count) => count === 1
    ? 'A unit is about to lose Full Supply.'
    : `${count} units are about to lose Full Supply.`,
  'entering-combat-penalty': (count) => count === 1
    ? 'A unit is entering the -10% Combat overextension stage.'
    : `${count} units are entering the -10% Combat overextension stage.`,
  'entering-movement-penalty': (count) => count === 1
    ? 'A unit is entering the -1 Movement overextension stage.'
    : `${count} units are entering the -1 Movement overextension stage.`,
};

/** `losing-full` is informational (no penalty yet); the other two kinds carry
 * an active combat/movement penalty and are presented as real warnings. */
export function presentSupplyWarning(warning: SupplyWarning): { message: string; type: NotificationEntry['type'] } {
  return {
    message: MESSAGES[warning.kind](warning.unitIds.length),
    type: warning.kind === 'losing-full' ? 'info' : 'warning',
  };
}
```

- [ ] **Step 4: Implement the registrar**

```ts
// src/presentation/register-supply-presentation.ts
import type { PresentationRegistrar } from '@/presentation/register-all';
import type { SupplyWarning } from '@/systems/supply-warning-system';
import { presentSupplyWarning } from '@/ui/supply-warning-presentation';

const CRITICAL_KINDS: SupplyWarning['kind'][] = ['entering-combat-penalty', 'entering-movement-penalty'];

export const registerSupplyPresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribe = bus.on('supply:warning', (warning) => {
    const preference = ctx.session.getState().settings.supplyWarningPreference ?? 'all';
    if (preference === 'off') return;
    if (preference === 'critical' && !CRITICAL_KINDS.includes(warning.kind)) return;
    const presentation = presentSupplyWarning(warning);
    ctx.notifier.deliver(warning.viewerId, presentation.message, presentation.type);
  });

  return () => unsubscribe();
};
```

Confirm `GameSession`'s exact `getState()` accessibility from
`PresentationContext.session` (already used elsewhere in this file's sibling
registrars — grep another registrar for `ctx.session.getState()` to confirm
the exact call shape before finalizing).

- [ ] **Step 5: Register it**

```ts
// src/presentation/register-all.ts
import { registerSupplyPresentation } from '@/presentation/register-supply-presentation';

const ALL_REGISTRARS: readonly PresentationRegistrar[] = [
  // ...existing entries...
  registerGeneralPresentation,
  registerSupplyPresentation,
];
```

- [ ] **Step 6: Write and run the registrar test**

Mirror the existing `register-general-presentation.test.ts` (or whichever file
covers a comparable registrar) fixture/bus-emit pattern exactly:

```ts
// tests/presentation/register-supply-presentation.test.ts — sketch, adapt to
// the real fixture convention found in Step 5's grep
it('delivers a warning when preference is all', () => { /* ... */ });
it('filters out losing-full when preference is critical', () => { /* ... */ });
it('delivers nothing when preference is off', () => { /* ... */ });
it('treats an undefined preference identically to all', () => { /* ... */ });
```

Run: `bash scripts/run-with-mise.sh yarn test tests/presentation/register-supply-presentation.test.ts tests/ui/supply-warning-presentation.test.ts`
Expected: PASS

- [ ] **Step 7: SFX — reuse the existing strategic-warning stinger**

**Inline-review fix — supply warnings previously had no sound at all.**
`AudioSystem` already has a bespoke, dedup'd audio path for
`ai:strategic-warning` (`src/audio/audio-system.ts`'s `wireEvents`, calling
the private `playStrategicWarning(viewerId, turn)`, gated by the event's own
`playAudio` field and deduped per `viewerId:turn`). Rather than commissioning
a new sound asset (this repo's audio content goes through a separate,
carefully-managed curation pipeline — see `project_audio_curation_progress`
context; adding new assets casually is out of scope here), this step reuses
that exact same stinger and dedup logic for supply warnings, and additionally
respects the "Off" warning preference so muting warnings also mutes their
sound (strategic warnings have no equivalent preference to check, so this is
new logic, not copied).

```ts
// src/audio/audio-system.ts — wireEvents, alongside the existing
// 'ai:strategic-warning' listener:
      bus.on('supply:warning', warning => {
        if (!warning.playAudio) return;
        const state = this.stateProvider?.();
        if (!state) return;
        if ((state.settings.supplyWarningPreference ?? 'all') === 'off') return;
        const turn = state.turn;
        if (!Number.isFinite(turn)) return;
        this.playStrategicWarning(warning.viewerId, turn);
      }),
```

Find the real test file covering `AudioSystem`'s `ai:strategic-warning`
wiring (grep `playStrategicWarning` under `tests/audio/`) and mirror its
exact fixture/spy pattern for two new cases:

```ts
// tests/audio/audio-system.test.ts (confirm real path), appended — sketch,
// adapt to the file's real AudioSystem construction/stateProvider fixture
it('plays the strategic-warning stinger for a supply:warning with playAudio true', () => { /* ... */ });
it('does not play any sound when supplyWarningPreference is off', () => { /* ... */ });
```

- [ ] **Step 8: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/audio/audio-system.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/ui/supply-warning-presentation.ts src/presentation/register-supply-presentation.ts src/presentation/register-all.ts src/audio/audio-system.ts tests/ui/supply-warning-presentation.test.ts tests/presentation/register-supply-presentation.test.ts tests/audio/audio-system.test.ts
git commit -m "feat(#544): deliver supply warnings filtered by preference, with reused warning-stinger audio"
```

---

### Task 11: Warning preference UI

**Files:**
- Modify: `src/ui/pause-menu-panel.ts`
- Test: `tests/ui/pause-menu-panel.test.ts`

**Interfaces:**
- Consumes: `state.settings.supplyWarningPreference` (Task 3).
- Produces: a 3-way control (All / Critical only / Off), wired to a new
  `onChangeSupplyWarningPreference` callback in `PauseMenuCallbacks`.

Mirrors this file's existing audio-toggle-row pattern (`buildAudioSettings`,
already read for Tasks above) — same visual language, new section.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/pause-menu-panel.test.ts, appended — read the existing
// buildAudioSettings-row test coverage first and mirror its DOM-query style.
it('renders the supply warning preference control and calls onChangeSupplyWarningPreference on selection', () => {
  const onChangeSupplyWarningPreference = vi.fn();
  const panel = renderPauseMenu({ ...baseCallbacks(), supplyWarningPreference: 'all', onChangeSupplyWarningPreference });
  const criticalOption = panel.querySelector('[data-supply-warning-option="critical"]') as HTMLElement;
  criticalOption.click();
  expect(onChangeSupplyWarningPreference).toHaveBeenCalledWith('critical');
});
```

Adapt to this test file's real render-entry-point name and `PauseMenuCallbacks`
fixture builder (grep the file — do not assume `renderPauseMenu`/`baseCallbacks`
are the real names without checking).

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/pause-menu-panel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/ui/pause-menu-panel.ts
export interface PauseMenuCallbacks {
  // ...existing fields...
  supplyWarningPreference: 'all' | 'critical' | 'off';
  onChangeSupplyWarningPreference: (preference: 'all' | 'critical' | 'off') => void;
}

function buildSupplyWarningSettings(callbacks: PauseMenuCallbacks): HTMLElement {
  const section = document.createElement('div');
  Object.assign(section.style, {
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: '12px', marginTop: '12px',
  });

  const heading = document.createElement('div');
  heading.textContent = 'Supply Warnings';
  heading.style.cssText = 'font-size:12px;opacity:0.7;margin-bottom:6px;';
  section.appendChild(heading);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;';
  const options: Array<{ value: 'all' | 'critical' | 'off'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'critical', label: 'Critical only' },
    { value: 'off', label: 'Off' },
  ];
  for (const option of options) {
    const button = createGameButton(option.label, option.value === callbacks.supplyWarningPreference ? 'primary' : 'secondary');
    button.dataset.supplyWarningOption = option.value;
    button.addEventListener('click', () => callbacks.onChangeSupplyWarningPreference(option.value));
    row.appendChild(button);
  }
  section.appendChild(row);
  return section;
}
```

Wire `buildSupplyWarningSettings(callbacks)` into the pause menu's existing
assembly point — find where `buildAudioSettings(callbacks)` is appended to the
panel's root element and append this section immediately after it, matching
the file's existing section-ordering convention.

- [ ] **Step 4: Wire the callback to `session.setSettings`/equivalent**

Find the real pause-menu construction call site (search for
`PauseMenuCallbacks` object literal construction, likely in a
`src/app/controllers/*` file) and add:

```ts
supplyWarningPreference: session.getState().settings.supplyWarningPreference ?? 'all',
onChangeSupplyWarningPreference: (preference) => {
  session.setState({
    ...session.getState(),
    settings: { ...session.getState().settings, supplyWarningPreference: preference },
  });
},
```

adapting the exact state-update call to whatever this codebase's real
settings-mutation helper is (grep how `advisorsEnabled` or `councilTalkLevel`
gets updated from this same panel for the established pattern — likely a
narrower helper than a raw `session.setState` spread; match it exactly rather
than introducing a new one).

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/pause-menu-panel.test.ts`
Expected: PASS. Re-run the full build to catch other `PauseMenuCallbacks`
construction sites:

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/pause-menu-panel.ts tests/ui/pause-menu-panel.test.ts
git commit -m "feat(#544): add All/Critical/Off supply warning preference control"
```

---

### Task 12: First-time supply tutorial

**Files:**
- Modify: `src/core/types.ts` (`TutorialStep` union)
- Modify: `src/ui/tutorial.ts`
- Test: `tests/ui/tutorial.test.ts`

**Interfaces:**
- Consumes: `unitParticipatesInLandSupply` (`supply-participation.ts`).
- Produces: `'supply_intro'` added to `TutorialStep`; a new
  `TUTORIAL_MESSAGES` entry; a `TutorialSystem.reopen(step: TutorialStep): void`
  method for the "reopenable" requirement.

**Reopenable, concretely:** `TutorialSystem`'s existing `check()` only ever
shows a step once (`shownSteps`/`completedSteps` gating, by design, matching
every other tutorial step's current behavior). Contract §12 calls out
"reopenable" as a MR2-specific requirement (no other existing tutorial step
has this requirement stated). This task adds a minimal, honest reopen path: a
new `TutorialSystem.reopen(step)` method that re-emits `tutorial:step` for an
already-completed step, bypassing the `shownSteps`/`completedSteps` gate —
and a small "ℹ️ How supply works" link inside the unit panel's supply-status
block (added in Task 2) that calls it. This is scoped to supply only, per the
contract's actual ask, not a general tutorial-reopen system for all 8 existing
steps (out of scope for this MR).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/tutorial.test.ts, appended — mirror this file's existing
// TutorialSystem construction/bus-spy pattern.
it('fires supply_intro the first time a participating unit is not full supply', () => {
  const bus = new EventBus();
  const system = new TutorialSystem(bus);
  const received: unknown[] = [];
  bus.on('tutorial:step', event => received.push(event));
  const state = makeTutorialState(); // existing fixture helper in this file
  state.tutorial.active = true;
  const unitId = state.civilizations[state.currentPlayer]!.units[0]!;
  state.units[unitId] = { ...state.units[unitId]!, landSupply: { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } };
  system.check(state);
  expect(received.some((e: any) => e.step === 'supply_intro')).toBe(true);
});

it('does not fire supply_intro again after it is completed', () => {
  const bus = new EventBus();
  const system = new TutorialSystem(bus);
  const received: unknown[] = [];
  bus.on('tutorial:step', event => received.push(event));
  const state = makeTutorialState();
  state.tutorial.active = true;
  state.tutorial.completedSteps = ['supply_intro'];
  const unitId = state.civilizations[state.currentPlayer]!.units[0]!;
  state.units[unitId] = { ...state.units[unitId]!, landSupply: { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } };
  system.check(state);
  expect(received.some((e: any) => e.step === 'supply_intro')).toBe(false);
});

it('reopen() re-emits tutorial:step for an already-completed step', () => {
  const bus = new EventBus();
  const system = new TutorialSystem(bus);
  const received: unknown[] = [];
  bus.on('tutorial:step', event => received.push(event));
  system.reopen('supply_intro');
  expect(received).toHaveLength(1);
  expect((received[0] as any).step).toBe('supply_intro');
});
```

Confirm `makeTutorialState`/equivalent is this file's real fixture name — grep
before writing.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/tutorial.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the step to the type union**

```ts
// src/core/types.ts — TutorialStep, append:
export type TutorialStep =
  | 'welcome'
  // ...existing entries...
  | 'complete'
  | 'supply_intro';
```

- [ ] **Step 4: Implement**

```ts
// src/ui/tutorial.ts
import { unitParticipatesInLandSupply } from '@/systems/supply-participation';

// TUTORIAL_MESSAGES, appended:
  {
    step: 'supply_intro',
    advisor: 'builder',
    message: 'Units far from home lose supply over time: Full Supply, then Stable but Unsupported, then Overextended (worsening combat and movement penalties). Toggle the Supply overlay (bottom bar) to see your coverage, and watch the unit panel for stage and recovery guidance.',
    trigger: (state) => Object.values(state.units).some(
      unit => unit.owner === state.currentPlayer
        && unitParticipatesInLandSupply(unit)
        && unit.landSupply !== undefined
        && unit.landSupply.state !== 'full',
    ),
  },
```

```ts
// src/ui/tutorial.ts — TutorialSystem, new method:
  /** Re-shows a tutorial message on demand, bypassing the one-time gate (contract §12: "reopenable"). */
  reopen(step: TutorialStep): void {
    const msg = TUTORIAL_MESSAGES.find(candidate => candidate.step === step);
    if (!msg) return;
    this.bus.emit('tutorial:step', { step: msg.step, message: msg.message, advisor: msg.advisor });
  }
```

- [ ] **Step 5: Add the reopen affordance to the unit panel**

```ts
// src/ui/selected-unit-info.ts — SelectedUnitInfoCallbacks, add:
  onReopenSupplyTutorial?: () => void;
```

```ts
// src/ui/selected-unit-info.ts — inside the `if (landSupplyStatusLines)`
// block from Task 2, after appending the line divs:
  if (callbacks.onReopenSupplyTutorial) {
    const helpLink = document.createElement('button');
    helpLink.type = 'button';
    helpLink.textContent = 'ℹ️ How supply works';
    helpLink.style.cssText = 'margin-top:2px;background:none;border:none;color:#8fe8b0;font-size:10px;text-decoration:underline;cursor:pointer;padding:0;';
    helpLink.addEventListener('click', () => callbacks.onReopenSupplyTutorial!());
    wrapper.appendChild(helpLink);
  }
```

Wire `onReopenSupplyTutorial: () => tutorialSystem.reopen('supply_intro')` at
`renderSelectedUnitInfo`'s real call site in `selection-controller.ts`
(confirm `TutorialSystem`'s instance is already reachable there — if not
already threaded through `SelectionControllerDeps`, add it following the same
narrow-`Pick`-typed-dependency convention this file already uses for its other
services).

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/tutorial.test.ts tests/ui/selected-unit-info.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/ui/tutorial.ts src/ui/selected-unit-info.ts tests/ui/tutorial.test.ts
git commit -m "feat(#544): first-time supply tutorial, one-time/skippable/reopenable"
```

---

### Task 13: Privacy safeguard + difficulty invariance regressions

**Files:**
- Create: `tests/systems/supply-mr2-privacy.test.ts`
- Test: (this task *is* the test)

**Interfaces:**
- Consumes: `getSupplyOverlayPresentationForViewer` (Task 4),
  `deriveSupplyWarningTransitions` (Task 8), `buildSelectedUnitHighlights`
  (Task 7).

This is the design spec's §8-named "required MR2 test" consolidated into one
file so a future reader finds every MR2 privacy guarantee in one place, rather
than scattered across each task's own test file (which already cover the
mechanism-level cases — this file covers the cross-cutting property).

- [ ] **Step 1: Write the test**

```ts
// tests/systems/supply-mr2-privacy.test.ts
import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getSupplyOverlayPresentationForViewer } from '@/systems/supply-overlay-presentation';
import { deriveSupplyWarningTransitions } from '@/systems/supply-warning-system';

function makeTwoCivState(): GameState {
  const map: GameMap = { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 10; q++) {
    for (let r = 0; r < 10; r++) {
      const coord = { q, r };
      const owner = q < 5 ? 'rome' : 'carthage';
      map.tiles[hexKey(coord)] = {
        coord, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(key => [key, 'visible' as const])), lastSeen: {} };
  return {
    map, units: {}, turn: 1,
    currentPlayer: 'rome',
    cities: {
      cRome: { id: 'cRome', owner: 'rome', name: 'Rome', position: { q: 2, r: 5 } } as City,
      cCarthage: { id: 'cCarthage', owner: 'carthage', name: 'Carthage', position: { q: 8, r: 5 } } as City,
    },
    civilizations: {
      rome: { id: 'rome', isHuman: true, techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
      carthage: { id: 'carthage', isHuman: false, techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
    },
  } as unknown as GameState;
}

describe('#544 MR2 privacy safeguard (design spec §8)', () => {
  it('the overlay for the human viewer never includes the enemy city as a source', () => {
    const state = makeTwoCivState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources.some(s => s.coord.q === 8 && s.coord.r === 5)).toBe(false);
  });

  it('the overlay for the human viewer never marks enemy territory as covered', () => {
    const state = makeTwoCivState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.tiles.every(t => t.coord.q < 5)).toBe(true);
  });

  it('never lists an enemy ship as a supply source, even a shore-supply-capable one', () => {
    const state = makeTwoCivState();
    state.units.enemyShip = {
      id: 'enemyShip', owner: 'carthage', type: 'transport', position: { q: 8, r: 5 },
      health: 100, movementPointsLeft: 3,
    } as GameState['units'][string];
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources.some(s => s.kind === 'ship')).toBe(false);
  });

  it('deriving warnings "as" the human viewer never surfaces the AI civ\'s own unit transitions', () => {
    const state = makeTwoCivState();
    const aiUnit = { id: 'aiUnit1', owner: 'carthage', type: 'warrior', position: { q: 8, r: 5 }, health: 100, movementPointsLeft: 1 } as GameState['units'][string];
    const before = { ...state, units: { aiUnit1: { ...aiUnit, landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } } } };
    const after = { ...before, units: { aiUnit1: { ...aiUnit, landSupply: { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } } } };
    expect(deriveSupplyWarningTransitions(before, after, 'rome')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it passes against the already-implemented Tasks 4-8**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-mr2-privacy.test.ts`
Expected: PASS. If anything fails here, the failure means a Task 4-8
implementation has a real privacy leak — stop and fix that task's
implementation before continuing; do not weaken this test to make it pass.

- [ ] **Step 3: Add the difficulty-invariance regression**

```ts
// tests/systems/supply-warning-system.test.ts, appended
it('produces identical warnings regardless of opponentChallenge (difficulty-invariant)', () => {
  const base = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Supply Difficulty Test', seed: 'supply-difficulty' });
  const unitId = base.civilizations.player!.units[0]!;
  const before = withUnitSupply(base, unitId, { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  const after = withUnitSupply(base, unitId, { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
  const explorer = deriveSupplyWarningTransitions({ ...before, opponentChallenge: 'explorer' }, { ...after, opponentChallenge: 'explorer' }, 'player');
  const veteran = deriveSupplyWarningTransitions({ ...before, opponentChallenge: 'veteran' }, { ...after, opponentChallenge: 'veteran' }, 'player');
  expect(explorer).toEqual(veteran);
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/supply-warning-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/systems/supply-mr2-privacy.test.ts tests/systems/supply-warning-system.test.ts
git commit -m "test(#544): consolidated MR2 privacy safeguard and difficulty-invariance regressions"
```

---

### Task 14: Full-suite verification, self-review, and issue checklist

**Files:** none new — verification and documentation only.

- [ ] **Step 1: Full suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS, full suite, no regressions in any pre-existing file this MR
touched (`selected-unit-info.test.ts`, `render-loop`-adjacent tests,
`turn-flow-controller.test.ts`, `pause-menu-panel.test.ts`, `tutorial.test.ts`,
`primary-action-bar.test.ts`, `selected-unit-highlights.test.ts`).

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS — no TypeScript errors.

- [ ] **Step 2: Check pacing gates**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts`
Expected: PASS, unchanged — this MR is pure UI/presentation and touches no
yield, healing, or combat math (MR1 already shipped the combat/movement
integration). If either test's snapshot changed, something in this plan leaked
into mechanics — stop and find the leak rather than updating the snapshot.

- [ ] **Step 3: Self-review against contract §12 and §30 items 29-32**

| Contract requirement | Covered by |
|---|---|
| Unit panel: turns until next stage | Task 1, 2 |
| Unit panel: recovery guidance | Task 2 |
| Overlay: Full Supply / Stable-but-Unsupported / sources, friendly/allied-only | Task 4, 5 |
| Overlay: naval shore-supply reach | Task 4 (ship sources + shore-supplied-unit tile override) |
| Overlay: never reveal enemy coverage | Task 4 (viewer-scoped query), Task 13 (regression, incl. ship sources) |
| Overlay: toggleable | Task 5, 6 |
| Overlay: road/rail extension | Explicitly deferred — MR1.1 not landed (see Global Constraints) |
| Live projected coverage, visually distinct from resolved | Task 7 |
| §30 scenario 29 (projected vs resolved) | Task 7 |
| End-turn warnings, meaningful-transition-only | Task 8 |
| §30 scenario 30 (meaningful transitions only) | Task 8 |
| Warning preference All/Critical/Off | Task 3, 10, 11 |
| §30 scenario 31 (warning settings presentation-only) | Task 10 (filter lives outside `derive*`) |
| §30 scenario 32 (enemy coverage hidden) | Task 13 |
| First-time supply tutorial, one-time/skippable/reopenable | Task 12 |
| Hot-seat privacy safeguard (design spec §8) | Task 4, 5, 7, 8, 13 |
| Difficulty invariance | Task 13 |
| SFX (inline-review finding) | Task 10 (reused strategic-warning stinger, "Off"-preference-aware) |
| Notification flood prevention (inline-review finding) | Task 8 (grouped by viewer+kind per round) |
| Warning severity calibration (inline-review finding) | Task 10 (`losing-full` → `info`, penalty kinds → `warning`) |

- [ ] **Step 4: Update the tracking issue**

```bash
gh issue view 544 --json body -q .body > /tmp/issue-544-body.md
```

Edit the checkbox for "MR2 — Supply UI" to `[x]` and append the merged PR link
(`✅ [#<PR number>](https://github.com/a1flecke/conquestoria/pull/<PR number>)`),
matching the exact format MR1's entry already uses. Then:

```bash
gh issue edit 544 --body-file /tmp/issue-544-body.md
```

Do this only after the PR is actually open (need the real PR number) — if a
same-day follow-up is more practical than blocking the PR on this, that is
explicitly allowed per the issue's own handoff instructions (#10), but do not
let the issue drift unfixed past that PR's merge.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs(#544): MR2 self-review against contract §12/§30, confirm full-suite green"
```

---

## Self-Review Notes (for whoever executes this plan)

- **No ledger for supply warnings (Task 8) is a deliberate simplification, not
  a shortcut** — the reasoning is in Task 8's own note. If a future MR adds a
  "re-warn every N turns while still severe" nag feature, that would need a
  ledger; this MR's contract only asks for transition-triggered warnings.
- **The overlay toggle IS read back from `RenderLoop.isSupplyOverlayEnabled()`
  into the primary action bar's initial paint** (Task 5/6) — an earlier draft
  hardcoded `false` on the (unverified) assumption the bar is only ever built
  once per session; the getter removes that assumption entirely at zero cost.
- **`drawHexHighlight`'s outline is solid, not literally dashed** (Task 7) —
  a deliberate scope cut, documented in that task, because the fill-color
  distinction between the persistent overlay and the projected highlight
  already satisfies "visually distinct... never mixed indistinguishably"
  without a renderer signature change. Revisit only if a future design pass
  specifically wants dash patterns.
- **Two tasks (9, 11) contain a test-writing step that intentionally defers to
  reading an existing test file's fixtures before writing new assertions**,
  rather than inventing fixture code this plan cannot verify against the real
  file without having read it in full. This is not a placeholder in the
  "No Placeholders" sense (the *behavior* to test and the *real* production
  code changes are fully specified) — it is an explicit instruction to match
  existing test infrastructure rather than duplicate or diverge from it.
- **Implementation-time deviation (Task 5/6):** while implementing Task 5, a
  better existing precedent was found than this plan's original flat
  `supplyOverlayEnabled: boolean` + `setSupplyOverlayEnabled(enabled)`
  sketch: `RenderLoop` already has `airDefenseOverlayEnabledByViewer` (a
  per-viewer `Map<string, boolean>`) with `toggleAirDefenseOverlay(): boolean`
  / `isAirDefenseOverlayEnabled(viewerId?)`. Implemented supply's toggle the
  same way (`supplyOverlayEnabledByViewer`, `toggleSupplyOverlay()`,
  `isSupplyOverlayEnabled(viewerId?)`) instead of the plan's flat boolean —
  this is strictly better for hot-seat (each player's preference persists
  independently across handoffs, rather than one shared flag leaking between
  players) and follows "reuse before you build" more faithfully than the
  original draft did. Task 6's button was adjusted to call
  `renderLoop.toggleSupplyOverlay()` and repaint from its returned value
  (rather than tracking its own local `active` boolean and calling
  `onToggle(enabled)`), which also removes the toggle-target computation from
  the button entirely — one less place a bug could hide.
- **Every helper this plan adds has exactly one real caller by the end of its
  task** (`getTurnsUntilNextSupplyStage` ← unit panel; overlay presentation ←
  renderer; projected highlights ← selection controller; warning
  derive/apply ← turn-flow-controller; presentation ← registrar; tutorial
  step ← `TutorialSystem.check`/`reopen`) — no task in this plan produces a
  helper nothing calls.
- **Notification `target` navigation (tap-to-jump-to-unit) is intentionally
  NOT added to supply warnings** — a deliberate scope cut, not an oversight.
  `SupplyWarning.unitIds` can name several units in one grouped warning
  (Task 8's flood fix), and picking one to jump to would be an arbitrary,
  under-specified UX decision this MR's contract doesn't ask for. Revisit if
  a future pass wants it, informed by which unit the player actually cares
  about (nearest? first alphabetically? — genuinely unclear without product
  input).

### Findings from this plan's own inline review pass (fixed before implementation)

Per this repo's process (`.claude/rules` + issue #544's handoff instructions:
"perform an inline review before *and* after implementing"), this plan was
reviewed across gameplay/fun/mechanics/ages 7-43/play styles/difficulty/AI/
UI/UX/architecture/extensibility/data/SFX/save-migration/testing/solo and
hot-seat regressions before any code was written. Four real issues were found
and fixed in the plan itself (not deferred to the post-implementation pass):

1. **Contract violation, Task 4** — an earlier draft listed
   `getNavalShoreSupplyAssignments` as a dependency but never called it,
   silently dropping contract §12's "Naval shore-supply reach" overlay layer
   entirely. Fixed: ships now appear as a `'ship'` source, and shore-supplied
   units' tiles are marked `'full'` even outside the viewer's own territory
   (see Task 4's inline-review note for why that exclusion would have been
   wrong — shore supply exists specifically for foreign/unclaimed shores).
2. **Hot-seat/state-desync risk, Task 6** — the toggle button's initial paint
   hardcoded `false` on an unverified "the bar is only built once" assumption.
   Fixed with `RenderLoop.isSupplyOverlayEnabled()` (Task 5).
3. **Notification-flood risk, Task 8** — one warning event per transitioning
   unit would flood the log when a whole overextended stack crosses a
   threshold together. Fixed by grouping into one `SupplyWarning` per
   `(viewerId, kind)` per round, with a pluralized message (Task 10).
4. **Severity miscalibration + missing SFX, Task 10** — all three warning
   kinds were delivered as `'warning'`-type with no sound, which (a) makes
   the "Critical only" preference meaningless (a non-critical heads-up looked
   identical to a real penalty) and (b) means the feature is completely
   silent unlike every comparable system in this codebase. Fixed:
   `losing-full` is now `'info'`; the other two stay `'warning'`; and supply
   warnings now reuse the *existing* strategic-warning stinger/dedup path
   (no new audio asset commissioned) gated by the "Off" preference.

Two dimensions were reviewed and found to need no change, documented rather
than silently passed over: **colorblind accessibility** of the overlay's two
fill colors (Task 5 — relies on the same "text carries the distinction"
precedent this renderer already uses elsewhere) and **file placement** of
`supply-overlay-presentation.ts` under `src/systems/` (verified against
`getMinorCivPresentationForPlayer`'s real location in
`src/systems/minor-civ-presentation.ts` — the `*ForPlayer`/`*ForViewer`
convention `.claude/rules/ui-panels.md` names does live in `src/systems/`,
not `src/ui/`, so this task's placement is correct as originally written).
