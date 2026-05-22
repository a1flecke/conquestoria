# S1 Plan 2 — Map Renderer: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread `viewerTechs: ReadonlySet<string>` through the renderer call chain (`drawHexMap` → `drawTileAtScreen` → `drawHex`), draw tech-gated resource icons on hex tiles, and wire `viewerTechs` derivation into `render-loop.ts`.

**Architecture:** `viewerTechs` is a new optional parameter with a default of `new Set()` at every function boundary, so callers that don't pass it (tests that pre-date this plan) continue to compile and pass with no resource icons drawn. The resource icon drawing block checks the presentation tile — unexplored and unknown-fog tiles already have `resource: null` from the `unknownTile()` helper, so no explicit fog guard is needed. Last-seen tiles carry the snapshot resource and draw it when the viewer has the tech (the player remembers what they saw).

**Depends on:** Plan 1 merged first — imports `RESOURCE_ICONS` and `RESOURCE_TECH` from `@/systems/trade-system`.

**Tech Stack:** TypeScript, Canvas 2D, Vitest

---

## Files changed

| File | Change |
|---|---|
| `src/renderer/hex-renderer.ts` | Add import; add `viewerTechs` parameter to `drawHexMap`, `drawTileAtScreen`, and `drawHex`; thread it through; insert resource icon drawing block |
| `src/renderer/render-loop.ts` | Derive `viewerTechs` from `this.state`; pass as 7th arg to `drawHexMap` |
| `tests/renderer/hex-renderer.test.ts` | Extend `MockCanvasContext` to record `fillText` coordinates; add 7 resource-icon test cases |

---

### Task 1: Extend mock and write failing tests

**Files:**
- Modify: `tests/renderer/hex-renderer.test.ts`

- [ ] **Step 1: Extend MockCanvasContext to record fillText calls with coordinates**

The current `MockCanvasContext.fillText(text: string)` only records the text string. The position tests need (text, x, y). Replace the `fillText` method and add `fillTextCalls`:

```ts
class MockCanvasContext {
  strokeCalls: string[] = [];
  textCalls: string[] = [];
  fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha = 1;
  shadowColor = '';
  shadowBlur = 0;

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  arc(): void {}
  closePath(): void {}
  fill(): void {}
  fillText(text: string, x: number = 0, y: number = 0): void {
    this.textCalls.push(text);
    this.fillTextCalls.push({ text, x, y });
  }
  stroke(): void {
    this.strokeCalls.push(this.strokeStyle);
  }
}
```

All existing tests still pass — `textCalls` is unchanged, `fillTextCalls` is additive.

- [ ] **Step 2: Add a makeResourceMap helper and 7 new test cases**

Add `makeResourceMap` after the existing `makeCamera` function, and a new `describe` block:

```ts
function makeResourceMap(opts: {
  resource?: string | null;
  improvement?: string;
  improvementTurnsLeft?: number;
} = {}): GameMap {
  return {
    width: 1,
    height: 1,
    wrapsHorizontally: false,
    rivers: [],
    tiles: {
      '0,0': {
        coord: { q: 0, r: 0 },
        terrain: 'mountain',
        elevation: 'highland',
        movementCost: 2,
        owner: null,
        improvement: opts.improvement ?? 'none',
        improvementTurnsLeft: opts.improvementTurnsLeft ?? 0,
        resource: opts.resource ?? null,
        hasRiver: false,
        wonder: null,
      },
    },
  } as unknown as GameMap;
}

describe('resource icon rendering', () => {
  const visibleAll: VisibilityMap = { tiles: { '0,0': 'visible' } };

  it('draws resource icon when viewer has the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set(['gathering']));

    expect((ctx as unknown as MockCanvasContext).textCalls).toContain('🪨');
  });

  it('does not draw resource icon when viewer lacks the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set());

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });

  it('draws resource icon at top-left corner when a completed improvement is present', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone', improvement: 'mine', improvementTurnsLeft: 0 });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set(['gathering']));

    // For tile at q=0,r=0: hexToPixel gives {x:0,y:0}; worldToScreen is identity.
    // scaledSize = hexSize(48) * zoom(1) = 48.
    // Corner position: cx - size*0.3 = 0 - 14.4 = -14.4
    const mockCtx = ctx as unknown as MockCanvasContext;
    const call = mockCtx.fillTextCalls.find(c => c.text === '🪨');
    expect(call).toBeDefined();
    expect(call!.x).toBeCloseTo(-14.4);
    expect(call!.y).toBeCloseTo(-14.4);
  });

  it('draws resource icon at center when improvement is still under construction', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    // improvementTurnsLeft > 0 means construction in progress — improvement icon is NOT shown
    const map = makeResourceMap({ resource: 'stone', improvement: 'mine', improvementTurnsLeft: 2 });

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', visibleAll, new Set(['gathering']));

    // No completed improvement visible → resource draws centered at cx=0, cy=0
    const mockCtx = ctx as unknown as MockCanvasContext;
    const call = mockCtx.fillTextCalls.find(c => c.text === '🪨');
    expect(call).toBeDefined();
    expect(call!.x).toBeCloseTo(0);
    expect(call!.y).toBeCloseTo(0);
  });

  it('does not draw resource icon for unexplored tiles (presentation layer nullifies resource)', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    const unexplored: VisibilityMap = { tiles: { '0,0': 'unexplored' } };

    // viewerTechs has 'gathering' — but the presentation tile has resource:null from unknownTile()
    drawHexMap(ctx, map, makeCamera(), undefined, 'player', unexplored, new Set(['gathering']));

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });

  it('draws resource icon on last-seen tile when viewer has the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    const fog: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'mountain',
          elevation: 'highland',
          resource: 'stone',
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: null,
        },
      },
    };

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', fog, new Set(['gathering']));

    // Player remembers what they last saw — resource shows if they have the tech
    expect((ctx as unknown as MockCanvasContext).textCalls).toContain('🪨');
  });

  it('does not draw resource icon on last-seen tile when viewer lacks the enabling tech', () => {
    const ctx = new MockCanvasContext() as unknown as CanvasRenderingContext2D;
    const map = makeResourceMap({ resource: 'stone' });
    const fog: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'mountain',
          elevation: 'highland',
          resource: 'stone',
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: null,
        },
      },
    };

    drawHexMap(ctx, map, makeCamera(), undefined, 'player', fog, new Set());

    expect((ctx as unknown as MockCanvasContext).textCalls).not.toContain('🪨');
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/hex-renderer.test.ts
```

Expected: the 7 new resource-icon tests fail (`drawHexMap` signature now accepts 7 args but implementation still has 6, and no resource icon logic exists yet). Existing tests pass.

---

### Task 2: Update hex-renderer.ts

**Files:**
- Modify: `src/renderer/hex-renderer.ts`

- [ ] **Step 4: Add the import for RESOURCE_ICONS and RESOURCE_TECH**

At the top of `src/renderer/hex-renderer.ts`, add after the existing imports:

```ts
import { RESOURCE_ICONS, RESOURCE_TECH } from '@/systems/trade-system';
```

- [ ] **Step 5: Add viewerTechs parameter to drawHexMap**

`drawHexMap` currently has 6 parameters. Add `viewerTechs` as the 7th optional parameter with a default:

Replace the current signature:
```ts
export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
  currentPlayer?: string,
  viewerVisibility?: VisibilityMap,
): void {
```

with:
```ts
export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  villagePositions?: Set<string>,
  currentPlayer?: string,
  viewerVisibility?: VisibilityMap,
  viewerTechs: ReadonlySet<string> = new Set(),
): void {
```

- [ ] **Step 6: Thread viewerTechs into the drawTileAtScreen call inside drawHexMap**

Inside `drawHexMap`, the `drawTileAtScreen` call currently passes 11 arguments. Add `viewerTechs` as the 12th:

Replace:
```ts
      drawTileAtScreen(
        ctx,
        screen,
        scaledSize,
        presentation.tile,
        isVillage && presentation.kind === 'live',
        currentPlayer,
        viewerVisibility,
        camera.zoom,
        presentation.kind,
        nowMs,
        reducedMotion,
      );
```

with:
```ts
      drawTileAtScreen(
        ctx,
        screen,
        scaledSize,
        presentation.tile,
        isVillage && presentation.kind === 'live',
        currentPlayer,
        viewerVisibility,
        camera.zoom,
        presentation.kind,
        nowMs,
        reducedMotion,
        viewerTechs,
      );
```

- [ ] **Step 7: Add viewerTechs parameter to drawTileAtScreen**

`drawTileAtScreen` currently has 11 parameters. Add `viewerTechs` as the 12th:

Replace the current signature:
```ts
function drawTileAtScreen(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  scaledSize: number,
  tile: HexTile,
  isVillage: boolean,
  currentPlayer: string | undefined,
  viewerVisibility: VisibilityMap | undefined,
  zoom: number,
  presentationKind: TilePresentationKind,
  nowMs: number,
  reducedMotion: boolean,
): void {
```

with:
```ts
function drawTileAtScreen(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  scaledSize: number,
  tile: HexTile,
  isVillage: boolean,
  currentPlayer: string | undefined,
  viewerVisibility: VisibilityMap | undefined,
  zoom: number,
  presentationKind: TilePresentationKind,
  nowMs: number,
  reducedMotion: boolean,
  viewerTechs: ReadonlySet<string> = new Set(),
): void {
```

- [ ] **Step 8: Thread viewerTechs into the drawHex call inside drawTileAtScreen**

Inside `drawTileAtScreen`, the `drawHex` call currently passes 11 arguments. Add `viewerTechs` as the 12th:

Replace:
```ts
  drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer, viewerVisibility, presentationKind, nowMs, reducedMotion);
```

with:
```ts
  drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer, viewerVisibility, presentationKind, nowMs, reducedMotion, viewerTechs);
```

- [ ] **Step 9: Add viewerTechs parameter to drawHex**

`drawHex` currently has 11 parameters. Add `viewerTechs` as the 12th optional parameter after `reducedMotion`:

Replace the current signature:
```ts
function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tile: HexTile,
  isVillage: boolean = false,
  currentPlayer?: string,
  viewerVisibility?: VisibilityMap,
  presentationKind: TilePresentationKind = 'live',
  nowMs: number = 0,
  reducedMotion: boolean = false,
): void {
```

with:
```ts
function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tile: HexTile,
  isVillage: boolean = false,
  currentPlayer?: string,
  viewerVisibility?: VisibilityMap,
  presentationKind: TilePresentationKind = 'live',
  nowMs: number = 0,
  reducedMotion: boolean = false,
  viewerTechs: ReadonlySet<string> = new Set(),
): void {
```

- [ ] **Step 10: Insert the resource icon drawing block in drawHex**

In `drawHex`, the current drawing order is:
1. Terrain fill + border
2. Completed-improvement block (`if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0)`)
3. In-progress construction block (`if (tile.improvement !== 'none' && tile.improvementTurnsLeft > 0)`)
4. Wonder block (`if (tile.wonder)`)
5. Village block (`if (isVillage && !tile.wonder)`)
6. Ownership border

Insert the resource icon block between the construction block and the wonder block. Find this exact section (the end of the construction block):

```ts
    ctx.fillText(`${tile.improvementTurnsLeft}t`, cx, cy + size * 0.25);
  }

  // Draw wonder indicator
  if (tile.wonder) {
```

Replace it with:

```ts
    ctx.fillText(`${tile.improvementTurnsLeft}t`, cx, cy + size * 0.25);
  }

  // Draw resource icon (tech-gated).
  // No explicit visibility guard needed: drawHex receives presentation.tile, which
  // already has resource: null for unexplored/unknown-fog tiles (via unknownTile()).
  // Last-seen tiles carry the resource from the snapshot — showing it is correct
  // (the player remembers what they saw). Tech gate still applies.
  if (tile.resource && viewerTechs.has(RESOURCE_TECH[tile.resource] ?? '')) {
    const icon = RESOURCE_ICONS[tile.resource] ?? '◆';
    const hasVisibleImprovement =
      tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (hasVisibleImprovement) {
      // Option B: small icon at top-left corner; improvement stays centered
      ctx.font = `${size * 0.3}px system-ui`;
      ctx.fillText(icon, cx - size * 0.3, cy - size * 0.3);
    } else {
      // No improvement competing — centered at full icon size
      ctx.font = `${size * 0.5}px system-ui`;
      ctx.fillText(icon, cx, cy);
    }
  }

  // Draw wonder indicator
  if (tile.wonder) {
```

- [ ] **Step 11: Run the renderer tests to confirm they pass**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/hex-renderer.test.ts
```

Expected: all 7 new resource-icon tests pass; all existing tests still pass.

---

### Task 3: Wire viewerTechs in render-loop.ts

**Files:**
- Modify: `src/renderer/render-loop.ts`

- [ ] **Step 12: Derive viewerTechs and pass to drawHexMap**

In `render-loop.ts`, the `render()` method currently starts with:

```ts
  private render(): void {
    if (!this.state) return;
    const viewerId = this.state.currentPlayer;
    const viewerVisibility = this.state.civilizations[viewerId]?.visibility;
```

Add `viewerTechs` derivation immediately after `viewerVisibility`:

```ts
    const viewerTechs = new Set<string>(
      this.state.civilizations[viewerId]?.techState.completed ?? []
    );
```

Then update the `drawHexMap` call (currently 6 args) to pass `viewerTechs` as the 7th:

Replace:
```ts
    drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, viewerId, viewerVisibility);
```

with:
```ts
    drawHexMap(this.ctx, this.state.map, this.camera, villagePositions, viewerId, viewerVisibility, viewerTechs);
```

- [ ] **Step 13: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: exits 0. All tests pass.

- [ ] **Step 14: Run the full build to check for type errors**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exits 0. No TypeScript errors.

- [ ] **Step 15: Commit**

```bash
git add src/renderer/hex-renderer.ts src/renderer/render-loop.ts tests/renderer/hex-renderer.test.ts
git commit -m "$(cat <<'EOF'
feat(S1): draw tech-gated resource icons on hex tiles

Thread viewerTechs through drawHexMap→drawTileAtScreen→drawHex;
insert resource icon block (Option B: corner overlap, center solo);
derive viewerTechs in render-loop.ts.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```
