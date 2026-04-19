# Issue 60 Visibility Render Leak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix issue `#60` by preventing foreign city-state and civilization presence from visually leaking through renderer layers between turns while preserving legitimate player-owned information and existing wrapped-render behavior.

**Architecture:** Treat this as a renderer-privacy fix, not a fog-opacity tweak. Add one shared viewer-aware visibility policy for foreign-presence overlays, route both tile-ownership strokes and minor-civ territory through it, and lock the contract with focused renderer regression tests plus a full build/test verification pass before opening the implementation MR.

**Tech Stack:** TypeScript, Vitest, Canvas 2D renderer, Vite

---

## Current Branch Baseline

This planning branch intentionally keeps the completed solo-setup plan cleanup:

- Delete: `docs/superpowers/plans/2026-04-18-solo-setup-ui-refresh.md`

Do not drop that cleanup when implementing or opening the plan MR.

---

## Issue Contract

Issue `#60` is still open because the renderer can reveal foreign presence even when the player should not currently see it.

Current evidence on `main`:

- `src/renderer/render-loop.ts` draws `drawMinorCivTerritory(...)` for every living minor civ without any viewer visibility gate.
- `src/renderer/hex-renderer.ts` always draws tile ownership strokes when `tile.owner` is present, even if the tile is only fogged or completely unexplored by the viewer.
- `src/renderer/fog-renderer.ts` uses a semi-transparent fog layer for fogged tiles, so “draw first, dim later” is not a sufficient privacy boundary for foreign-presence art.
- `src/renderer/city-renderer.ts` and `src/renderer/unit-renderer.ts` already gate on `visible` tiles; those protections must stay intact and must not regress during this fix.

The plan below assumes the desired gameplay/UI rule is:

1. Foreign cities, units, territory outlines, and tile-ownership borders are only visible on tiles that are currently `visible` to the viewer.
2. Player-owned information may remain visible on `fog` tiles when that is already part of the local memory model.
3. Fog opacity is presentation only; privacy-sensitive overlays must be gated before drawing.

---

## Success Criteria

The issue is fixed only when all of the following are true:

1. A fogged or unexplored foreign-owned tile does not draw a foreign ownership border.
2. A currently visible foreign-owned tile still draws its ownership border.
3. A player-owned fogged tile still keeps the player’s ownership border.
4. Minor-civ territory only draws on visible tiles, not on fogged or unexplored tiles.
5. A fogged minor-civ city tile does not cause its surrounding territory ring to render.
6. Wrapped rendering still works after the privacy fix; a visible wrapped copy still renders, and a hidden wrapped copy still stays hidden.
7. Existing city/unit visibility behavior does not regress.
8. Targeted renderer tests pass, and the implementation MR also passes `yarn build`.

---

## MR Strategy

This planning branch is the first easy-to-review MR:

- delete the completed solo-setup plan doc
- add this issue-60 implementation plan

The implementation itself should land as one focused follow-up MR. Keep that MR small:

1. renderer privacy tests
2. shared render-visibility helper
3. renderer wiring
4. verification and review

Do not merge a red test checkpoint. Keep every pushed commit and every MR green.

---

## Root-Cause Summary

| Surface | Current problem | Required fix |
| --- | --- | --- |
| Tile ownership borders | `drawHex(...)` draws any `tile.owner` border without checking viewer visibility | Route ownership-border drawing through a shared viewer-aware visibility helper |
| Minor-civ territory | `drawMinorCivTerritory(...)` draws every hex in range once called | Pass viewer visibility into territory rendering and skip non-visible territory hexes before painting |
| Fog layer | Fog is semi-transparent for `fog`, so it visually dims but does not guarantee privacy | Treat fog as presentation only; sensitive overlays must opt in to drawing |
| Regression risk | City/unit rendering already uses `visible` gating; a partial fix could drift from that contract | Add regression tests around foreign-vs-own presence and keep existing visible-only city/unit behavior untouched |

---

## Non-Goals

- do not change save data formats
- do not add new serialized viewer state
- do not redesign fog art, alpha values, or terrain memory
- do not refactor unrelated renderer layers that are not part of foreign-presence leakage

---

### Task 1: Add Red Regression Tests For Render Privacy

**Files:**
- Create: `tests/renderer/hex-renderer.test.ts`
- Modify: `tests/renderer/render-loop-wrap.test.ts`
- Keep: `tests/renderer/city-renderer.test.ts`
- Keep: `tests/renderer/unit-renderer.test.ts`

**Player Truth Table:**
- Visible foreign-owned tile: foreign border is visible
- Fogged foreign-owned tile: foreign border is hidden
- Unexplored foreign-owned tile: foreign border is hidden
- Fogged player-owned tile: player border stays visible
- Visible minor-civ territory hex: territory outline is visible
- Fogged/unexplored minor-civ territory hex: territory outline is hidden
- Wrapped visible copy: still renders
- Wrapped hidden copy: still does not render

**Misleading UI Risks:**
- Semi-transparent fog can make a privacy bug look “almost okay” in screenshots while still leaking information in play.
- Gating only on the city center and not the full territory ring would still leak border shape outside the visible area.
- A test that only asserts `drawMinorCivTerritory` was called is too weak; the issue is about which hexes it actually paints.

**Interaction Replay Checklist:**
- Reveal a foreign border with a scout, then move away and confirm the border disappears under fog.
- Reveal a minor-civ city, keep one ring hex visible and others fogged, and confirm only the visible ring hex paints.
- Reopen the same save state and confirm the same viewer-visible tiles paint the same overlays.
- Check a wrapped-edge city-state and confirm the visible wrapped copy paints while the hidden copy does not.

- [ ] **Step 1: Add ownership-border privacy tests in `tests/renderer/hex-renderer.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { drawHexMap } from '@/renderer/hex-renderer';
import type { Camera } from '@/renderer/camera';
import type { GameMap, VisibilityMap } from '@/core/types';

class MockCanvasContext {
  strokeCalls: string[] = [];
  fillTextCalls: string[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  fill(): void {}
  stroke(): void {
    this.strokeCalls.push(this.strokeStyle);
  }
  fillText(text: string): void {
    this.fillTextCalls.push(text);
  }
}

function makeMap(): GameMap {
  return {
    width: 2,
    height: 1,
    wrapsHorizontally: false,
    rivers: [],
    tiles: {
      '0,0': { coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'flat', movementCost: 1, owner: 'player', improvement: 'none', improvementTurnsLeft: 0 },
      '1,0': { coord: { q: 1, r: 0 }, terrain: 'grassland', elevation: 'flat', movementCost: 1, owner: 'ai-1', improvement: 'none', improvementTurnsLeft: 0 },
    },
  } as unknown as GameMap;
}

function makeCamera(): Camera {
  return {
    hexSize: 48,
    zoom: 1,
    isHexVisible: () => true,
    worldToScreen: (x: number, y: number) => ({ x, y }),
  } as unknown as Camera;
}

describe('hex renderer privacy', () => {
  it('does not draw foreign ownership borders on fogged tiles', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible', '1,0': 'fog' } };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).not.toContain('rgba(217,74,74,0.5)');
  });

  it('keeps player ownership borders on fogged tiles', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const visibility: VisibilityMap = { tiles: { '0,0': 'fog', '1,0': 'unexplored' } };

    drawHexMap(ctx, makeMap(), makeCamera(), undefined, 'player', visibility);

    expect((ctx as unknown as MockCanvasContext).strokeCalls).toContain('rgba(74,144,217,0.5)');
  });
});
```

- [ ] **Step 2: Add territory privacy coverage in `tests/renderer/hex-renderer.test.ts`**

```ts
it('draws only visible minor-civ territory hexes', () => {
  const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
  const visibility: VisibilityMap = {
    tiles: {
      '0,0': 'visible',
      '1,0': 'visible',
      '-1,0': 'fog',
      '0,1': 'fog',
      '0,-1': 'unexplored',
    },
  };

  drawMinorCivTerritory(
    ctx,
    { q: 0, r: 0 },
    '#ccaa44',
    makeCamera(),
    10,
    false,
    visibility,
    'player',
    'mc-sparta',
  );

  expect((ctx as unknown as MockCanvasContext).strokeCalls.length).toBeGreaterThan(0);
  expect((ctx as unknown as MockCanvasContext).strokeCalls.length).toBeLessThan(19);
});
```

- [ ] **Step 3: Strengthen `tests/renderer/render-loop-wrap.test.ts` so it covers visibility, not just helper wiring**

```ts
it('passes player visibility into wrapped minor-civ territory rendering', () => {
  rendererMocks.drawMinorCivTerritory.mockReset();
  const loop = new RenderLoop(createCanvas());
  const state = {
    turn: 1,
    currentPlayer: 'player',
    map: { width: 5, height: 3, wrapsHorizontally: true, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {
      'mc-sparta': { id: 'mc-sparta', cityId: 'city-1', definitionId: 'sparta', isDestroyed: false },
    },
    cities: {
      'city-1': { id: 'city-1', position: { q: 0, r: 0 } },
    },
    units: {},
    civilizations: {
      player: {
        color: '#4a90d9',
        visibility: { tiles: { '0,0': 'visible' } },
      },
    },
  } as unknown as GameState;

  loop.setGameState(state);
  (loop as unknown as { render: () => void }).render();

  expect(rendererMocks.drawMinorCivTerritory).toHaveBeenCalledWith(
    expect.anything(),
    { q: 0, r: 0 },
    expect.any(String),
    expect.anything(),
    5,
    true,
    state.civilizations.player.visibility,
    'player',
    'mc-sparta',
  );
});
```

- [ ] **Step 4: Run targeted tests and confirm the current branch fails for the right reason**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/hex-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
```

Expected:

- `hex-renderer` tests fail because ownership borders and minor-civ territory are still drawn without visibility gating
- the strengthened render-loop test fails because the current territory renderer signature does not accept viewer visibility inputs

- [ ] **Step 5: Commit only after the branch is green later**

```bash
git add tests/renderer/hex-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
git commit -m "test(renderer): add visibility leak regressions"
```

Do not actually create this commit until Task 2 makes the branch green.

---

### Task 2: Add One Shared Viewer-Aware Render Visibility Policy

**Files:**
- Create: `src/renderer/render-visibility.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/renderer/hex-renderer.test.ts`
- Test: `tests/renderer/render-loop-wrap.test.ts`

**Player Truth Table:**
- Own territory on `visible`: draw
- Own territory on `fog`: draw
- Own territory on `unexplored`: hide
- Foreign territory on `visible`: draw
- Foreign territory on `fog`: hide
- Foreign territory on `unexplored`: hide

**Misleading UI Risks:**
- A helper named too broadly like `isVisibleToPlayer` may tempt future code to reuse it for city/unit rules that are already correct.
- Returning `true` when no visibility map exists would silently reintroduce leaks in tests or future callers.

**Interaction Replay Checklist:**
- Scout a rival border, end turn, and verify the border stays only while the tile is currently visible.
- Let a city-state sit just outside visibility and confirm no ring appears.
- Pan to the horizontal seam and confirm visible wrapped copies still render.

- [ ] **Step 1: Create `src/renderer/render-visibility.ts` with narrow renderer-only helpers**

```ts
import type { HexCoord, VisibilityMap } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';

export function shouldRenderOwnedTileBorder(
  visibility: VisibilityMap | undefined,
  viewerCivId: string | undefined,
  ownerId: string | undefined,
  coord: HexCoord,
): boolean {
  if (!visibility || !viewerCivId || !ownerId) return false;

  const state = getVisibility(visibility, coord);
  if (ownerId === viewerCivId) {
    return state === 'visible' || state === 'fog';
  }

  return state === 'visible';
}

export function shouldRenderForeignPresenceHex(
  visibility: VisibilityMap | undefined,
  coord: HexCoord,
): boolean {
  if (!visibility) return false;
  return getVisibility(visibility, coord) === 'visible';
}
```

- [ ] **Step 2: Route ownership-border drawing through the new helper in `src/renderer/hex-renderer.ts`**

Update signatures:

```ts
export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
  currentPlayer?: string,
  viewerVisibility?: VisibilityMap,
): void
```

Use the helper in `drawHex(...)`:

```ts
if (
  tile.owner
  && currentPlayer
  && shouldRenderOwnedTileBorder(viewerVisibility, currentPlayer, tile.owner, tile.coord)
) {
  ctx.strokeStyle = tile.owner === currentPlayer ? 'rgba(74,144,217,0.5)' : 'rgba(217,74,74,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
```

Keep every non-privacy behavior the same: terrain fill, improvements, wonders, villages, and labels must not change.

- [ ] **Step 3: Make `drawMinorCivTerritory(...)` skip hidden hexes instead of painting first and relying on fog later**

Update the signature:

```ts
export function drawMinorCivTerritory(
  ctx: CanvasRenderingContext2D,
  center: HexCoord,
  color: string,
  camera: Camera,
  mapWidth?: number,
  wrapsHorizontally = false,
  viewerVisibility?: VisibilityMap,
  viewerCivId?: string,
  territoryOwnerId?: string,
): void
```

Use the helper before each hex paint:

```ts
for (const hex of hexesInRange(center, 2)) {
  if (
    territoryOwnerId
    && viewerCivId
    && !shouldRenderOwnedTileBorder(viewerVisibility, viewerCivId, territoryOwnerId, hex)
  ) {
    continue;
  }

  const renderCoords = wrapsHorizontally && mapWidth
    ? getHorizontalWrapRenderCoords(hex, mapWidth, camera)
    : [hex];

  for (const renderCoord of renderCoords) {
    if (!camera.isHexVisible(renderCoord)) continue;
    // existing draw code unchanged
  }
}
```

For this issue, minor-civ territory should follow the same visibility rule as any other foreign territorial signal: visible-only for non-player owners.

- [ ] **Step 4: Wire the new visibility inputs from `src/renderer/render-loop.ts`**

Use one local `viewerId` / `viewerVisibility` pair and pass it consistently:

```ts
const viewerId = this.state.currentPlayer;
const viewerVisibility = this.state.civilizations[viewerId]?.visibility;

drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, viewerId, viewerVisibility);

if (this.state.minorCivs) {
  for (const mc of Object.values(this.state.minorCivs)) {
    if (mc.isDestroyed) continue;
    const city = this.state.cities[mc.cityId];
    if (!city) continue;
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def) continue;
    drawMinorCivTerritory(
      this.ctx,
      city.position,
      def.color,
      this.camera,
      this.state.map.width,
      this.state.map.wrapsHorizontally,
      viewerVisibility,
      viewerId,
      mc.id,
    );
  }
}
```

Do not add a new serialized `viewerId` to game state. This issue is renderer privacy, not a save-schema change.

- [ ] **Step 5: Run targeted verification and make the branch green**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/hex-renderer.test.ts tests/renderer/render-loop-wrap.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts
scripts/check-src-rule-violations.sh src/renderer/render-visibility.ts src/renderer/hex-renderer.ts src/renderer/render-loop.ts
```

Expected:

- all listed tests pass
- rule-check script passes with no violations

- [ ] **Step 6: Commit the implementation**

```bash
git add src/renderer/render-visibility.ts src/renderer/hex-renderer.ts src/renderer/render-loop.ts tests/renderer/hex-renderer.test.ts tests/renderer/render-loop-wrap.test.ts
git commit -m "fix(renderer): stop leaking foreign presence through fog"
```

---

### Task 3: Audit For Adjacent Leaks And Close The CI Loop

**Files:**
- Review: `src/renderer/city-renderer.ts`
- Review: `src/renderer/unit-renderer.ts`
- Review: `src/renderer/fog-renderer.ts`
- Review: `tests/renderer/city-renderer.test.ts`
- Review: `tests/renderer/unit-renderer.test.ts`

**Player Truth Table:**
- Visible foreign city/unit: still visible
- Hidden foreign city/unit: still hidden
- Fog overlay: still dims fog tiles and fully masks unexplored tiles

**Misleading UI Risks:**
- A successful ownership/territory fix can hide a remaining city/unit regression if only the new tests are run.
- A build-only pass is not enough; this issue is behavioral and needs renderer test evidence.

**Interaction Replay Checklist:**
- Reveal then lose sight of a rival city
- Reveal then lose sight of a rival unit
- Check a minor-civ at the seam
- Verify fogged own land still looks like remembered land, not unexplored void

- [ ] **Step 1: Add any missing focused regression if the audit finds another foreign-presence leak in touched renderer files**

Allowed additions in this MR:

- a small follow-up assertion in `tests/renderer/city-renderer.test.ts`
- a small follow-up assertion in `tests/renderer/unit-renderer.test.ts`

Not allowed in this MR:

- unrelated renderer redesign
- save/load changes
- diplomacy/UI panel changes

If the audit reveals another player-visible privacy bug in the same renderer path, fix it in this MR instead of deferring it.

- [ ] **Step 2: Run the full renderer slice plus build**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/hex-renderer.test.ts tests/renderer/render-loop-wrap.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/fog-renderer.test.ts
./scripts/run-with-mise.sh yarn build
```

Expected:

- targeted renderer suite passes
- production build passes

- [ ] **Step 3: Review the branch delta before opening the implementation MR**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
```

Required review outcome:

- source changes are limited to the renderer privacy fix
- no unrelated files slipped into the branch
- the current branch tip is green

- [ ] **Step 4: Commit any final audit/test adjustments**

```bash
git add src/renderer/hex-renderer.ts src/renderer/render-loop.ts src/renderer/render-visibility.ts tests/renderer/hex-renderer.test.ts tests/renderer/render-loop-wrap.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts
git commit -m "test(renderer): lock foreign presence privacy contract"
```

If Step 1 adds no new file changes, skip this extra commit and keep the previous implementation commit.

---

## Final Verification Commands

Before push / MR creation for the implementation branch, run exactly:

```bash
./scripts/run-with-mise.sh yarn test --run tests/renderer/hex-renderer.test.ts tests/renderer/render-loop-wrap.test.ts tests/renderer/city-renderer.test.ts tests/renderer/unit-renderer.test.ts tests/renderer/fog-renderer.test.ts
scripts/check-src-rule-violations.sh src/renderer/render-visibility.ts src/renderer/hex-renderer.ts src/renderer/render-loop.ts
./scripts/run-with-mise.sh yarn build
git diff --stat origin/main...HEAD
git diff --stat
```

If any command fails, do not push. Fix the branch first.

---

## Self-Review

Spec coverage check for this plan:

- foreign ownership border leakage: covered by Task 1 and Task 2
- minor-civ territory leakage: covered by Task 1 and Task 2
- wrapped-render parity: covered by Task 1 and Task 3
- regression safety for existing city/unit visibility: covered by Task 2 and Task 3
- green-branch / green-MR requirement: covered by MR Strategy, Task 2, Task 3, and Final Verification Commands

Placeholder scan:

- no `TODO`
- no `TBD`
- no “write tests” without explicit test targets

Type consistency check:

- helper name is consistently `shouldRenderOwnedTileBorder(...)`
- helper file is consistently `src/renderer/render-visibility.ts`
- visibility parameter name is consistently `viewerVisibility`

