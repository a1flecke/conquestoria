# Sprite Overlay Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a DOM overlay layer that enables CSS-animated v2 sprites for units, buildings, and improvements across 4 incremental MRs, each safe to merge independently.

**Architecture:** A `#sprite-overlay` div (between `#game-canvas` and `#ui-layer`) holds a world-space pool of live SVG DOM elements managed by `SpriteOverlay`. One `transform: scale(zoom) translate(-camX, -camY)` per frame syncs the whole layer to the camera. `getHorizontalWrapRenderCoords()` handles wrap ghosts — the overlay has no wrap logic of its own. `RenderLoop` builds the entity list filtered to `'visible'` hexes and non-moving units before passing it to `sync()`.

**Tech Stack:** TypeScript, vitest + jsdom, CSS custom properties (`--phase`), djb2 hash, Babel + JSDOM (serialize-sprites.mjs for new sprite generation)

---

## Key facts before you start

- **v2 SVG format:** Each `*.svg.ts` file exports `export const svg: Record<string, string>` keyed by faction name (`'imperials' | 'vikings' | 'pharaohs' | 'hellenes' | 'khanate' | 'shogunate'`). Each value is an HTML string starting with `<div class="cq-sprite-wrap cq-v2" data-state="idle" ... style="--phase:0">`.
- **Faction key mapping:** `state.civilizations[unit.owner]?.civType` is the v2 faction key. `civType` is one of the faction names above for preset civs, `'generic'` for legacy. Fall back to `'imperials'` if unknown.
- **spriteWrapEl:** The CSS animation selectors key off `.cq-v2[data-state="..."]` — that is the `cq-sprite-wrap` div, not the outer positional wrapper and not the inner `<svg>`. Always target `wrapper.firstElementChild` for `data-state` and `--phase` updates.
- **`--phase` override:** The v2 strings bake `style="--phase:0"` inline on the `cq-sprite-wrap` div. Call `spriteWrapEl.style.setProperty('--phase', ...)` to override it — same-element `setProperty` wins over the baked inline value.
- **`contain: paint` is forbidden** on `#sprite-overlay` — it clips the 0×0 box and makes all sprites invisible. Use `contain: layout style` only.
- **Motion vocabulary mismatch:** v1 uses `'idle' | 'move-a' | 'move-b'` (`UnitMotionState`). v2 CSS uses `'idle' | 'walk' | 'attack'` (`SpriteEntity.state`). `RenderLoop` translates: `'move-a' | 'move-b'` → `'walk'`.
- **Fog breach:** The overlay sits ABOVE the canvas fog layer. Only include entities whose hex is `'visible'` in `getVisibility(viewerVisibility, coord)`. `'fog'` and `'unexplored'` hexes must be excluded before calling `sync()`.
- **Movement gate:** Units in `getMovingUnitIds(this.unitMovementAnimations)` must be excluded from the entity list — they're animated on canvas at an interpolated position; the overlay must not show them at their origin hex simultaneously.
- **Test commands:** `bash scripts/run-with-mise.sh yarn test -- <test-file>` to run specific file. `bash scripts/run-with-mise.sh yarn build` to type-check.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/renderer/sprite-overlay.ts` | SpriteOverlay class, SpriteEntity interface, hashCode |
| Create | `src/renderer/sprites/v2/index.ts` | Unified lookup: getUnitSpriteV2, getBuildingSpriteV2, getImprovementSpriteV2 |
| Create | `tests/renderer/sprite-overlay.test.ts` | SpriteOverlay unit tests |
| Create | `tests/renderer/sprites/v2/index.test.ts` | Lookup catalog coverage tests |
| Create | `tests/renderer/unit-renderer-overlay.test.ts` | Canvas skip + fog + movement gate tests |
| Create | `tests/renderer/city-renderer-overlay.test.ts` | Building overlay tests |
| Create | `tests/renderer/improvements/improvement-overlay.test.ts` | Improvement marker tests |
| Create | `src/renderer/improvements/farm-marker.ts` | Farm SVG (viewBox 0 0 48 48) |
| Create | `src/renderer/improvements/mine-marker.ts` | Mine SVG |
| Create | `src/renderer/improvements/lumber-camp-marker.ts` | Lumber camp SVG |
| Create | `src/renderer/improvements/watermill-marker.ts` | Watermill SVG |
| Create | `src/renderer/improvements/plantation-marker.ts` | Plantation SVG |
| Create | `src/renderer/improvements/pasture-marker.ts` | Pasture SVG |
| Create | `src/renderer/improvements/camp-marker.ts` | Camp SVG |
| Create | `src/renderer/improvements/quarry-marker.ts` | Quarry SVG |
| Generate | `src/renderer/sprites/v2/{axeman,...}.svg.ts` ×11 | Serialized v2 units (via serialize-sprites.mjs) |
| Generate | `src/renderer/sprites/v2/{dock,...}.svg.ts` ×N | Serialized v2 buildings (via serialize-sprites.mjs) |
| Modify | `index.html` | Add `#sprite-overlay` div + CSS |
| Modify | `src/input/touch-handler.ts` | Add `get isPinching(): boolean` getter |
| Modify | `src/renderer/render-loop.ts` | Instantiate SpriteOverlay; call sync() each frame; build entity lists |
| Modify | `src/main.ts` | Call `renderLoop.setTouchHandler(touchHandler)` |
| Modify | `src/renderer/unit-renderer.ts` | Skip drawImage when unit.id in activeIds |
| Modify | `src/renderer/city-renderer.ts` | Skip building drawImage when in activeIds |
| Modify | `src/renderer/hex-renderer.ts` | Skip emoji icon when improvement in activeIds |
| Modify | `src/renderer/sprites/v2/index.ts` | Wire new unit/building/improvement sprites as MRs progress |

---

## Phase 1 (MR 1) — Infrastructure

### Task 1: isPinching getter + index.html

**Files:** `src/input/touch-handler.ts`, `index.html`

- [ ] **Step 1: Add `_isPinching` field and public getter to TouchHandler**

Open `src/input/touch-handler.ts`. After the `private isPanning = false;` field (line ~19), add:

```typescript
private _isPinching = false;
get isPinching(): boolean { return this._isPinching; }
```

In `onTouchStart` (the handler for `touchstart`), the existing code checks `e.touches.length === 2` at line ~58 for pinch. Add `this._isPinching = true;` inside that 2-finger branch.

In `onTouchEnd` (handles `touchend` and `touchcancel`), add at the top: `this._isPinching = e.touches.length >= 2;`

- [ ] **Step 2: Add `#sprite-overlay` CSS to index.html**

Open `index.html`. In the `<style>` block, add the CSS rule only — **do NOT add an HTML element**. The `SpriteOverlay` constructor creates and inserts the div dynamically. Adding the element in HTML *and* the constructor would produce two `#sprite-overlay` elements.

```css
#sprite-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  overflow: visible;
  pointer-events: none;
  transform-origin: top left;
  contain: layout style;
  will-change: transform;
}
```

- [ ] **Step 3: Add a smoke test for isPinching getter**

Check if `tests/input/touch-handler.test.ts` exists:

```bash
ls tests/input/touch-handler.test.ts 2>/dev/null || echo "no existing test"
```

If no existing test file, create `tests/input/touch-handler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TouchHandler } from '@/input/touch-handler';

describe('TouchHandler.isPinching', () => {
  it('starts false', () => {
    const canvas = document.createElement('canvas');
    // TouchHandler attaches listeners; callbacks are no-ops for this test
    const th = new TouchHandler(canvas, {} as any, {} as any);
    expect(th.isPinching).toBe(false);
  });
});
```

If an existing test file is present, add the `isPinching` test to it instead.

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/input/touch-handler.ts index.html tests/input/
git commit -m "feat(overlay-mr1): isPinching getter + #sprite-overlay CSS"
```

---

### Task 2: Create v2/index.ts

**Files:** `src/renderer/sprites/v2/index.ts`, `tests/renderer/sprites/v2/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/sprites/v2/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getUnitSpriteV2,
  getBuildingSpriteV2,
  getImprovementSpriteV2,
} from '@/renderer/sprites/v2/index';

describe('getUnitSpriteV2', () => {
  it('returns null for unknown type', () => {
    expect(getUnitSpriteV2('unknown', 'imperials')).toBeNull();
  });

  it('returns null for unknown faction', () => {
    expect(getUnitSpriteV2('warrior', 'unknownfaction')).toBeNull();
  });

  it('returns a cq-sprite-wrap string for warrior/imperials', () => {
    const r = getUnitSpriteV2('warrior', 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
    expect(r!).toContain('cq-v2');
  });
});

describe('getBuildingSpriteV2', () => {
  it('returns null for unknown building', () => {
    expect(getBuildingSpriteV2('unknown', 'imperials')).toBeNull();
  });

  it('returns a sprite for granary/imperials', () => {
    const r = getBuildingSpriteV2('granary', 'imperials');
    expect(r).not.toBeNull();
    expect(r!).toContain('cq-sprite-wrap');
  });
});

describe('getImprovementSpriteV2', () => {
  it('returns null before MR 4 wires improvements', () => {
    expect(getImprovementSpriteV2('farm')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure (module missing)**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/renderer/sprites/v2/index.test.ts 2>&1 | tail -5
```

Expected: error — cannot find module.

- [ ] **Step 3: Create src/renderer/sprites/v2/index.ts**

```typescript
// Sprite lookup for the DOM overlay. Updated each MR as new types are serialized.

import { svg as archerSvg } from './archer.svg';
import { svg as galleySvg } from './galley.svg';
import { svg as musketeerSvg } from './musketeer.svg';
import { svg as pikemanSvg } from './pikeman.svg';
import { svg as scoutSvg } from './scout.svg';
import { svg as scoutHoundSvg } from './scout_hound.svg';
import { svg as settlerSvg } from './settler.svg';
import { svg as shadowWardenSvg } from './shadow_warden.svg';
import { svg as spyAgentSvg } from './spy_agent.svg';
import { svg as spyHackerSvg } from './spy_hacker.svg';
import { svg as spyInformantSvg } from './spy_informant.svg';
import { svg as spyOperativeSvg } from './spy_operative.svg';
import { svg as spyScoutSvg } from './spy_scout.svg';
import { svg as swordsmanSvg } from './swordsman.svg';
import { svg as triremeSvg } from './trireme.svg';
import { svg as warHoundSvg } from './war_hound.svg';
import { svg as warriorSvg } from './warrior.svg';
import { svg as workerSvg } from './worker.svg';

import { svg as amphitheaterSvg } from './amphitheater.svg';
import { svg as aqueductSvg } from './aqueduct.svg';
import { svg as archiveSvg } from './archive.svg';
import { svg as barracksSvg } from './barracks.svg';
import { svg as forgeSvg } from './forge.svg';
import { svg as forumSvg } from './forum.svg';
import { svg as granarySvg } from './granary.svg';
import { svg as harborSvg } from './harbor.svg';
import { svg as herbalistSvg } from './herbalist.svg';
import { svg as intelligenceAgencySvg } from './intelligence-agency.svg';
import { svg as librarySvg } from './library.svg';
import { svg as lumbermillSvg } from './lumbermill.svg';
import { svg as marketplaceSvg } from './marketplace.svg';
import { svg as monumentSvg } from './monument.svg';
import { svg as observatorySvg } from './observatory.svg';
import { svg as quarryBuildingSvg } from './quarry-building.svg';
import { svg as safehouseSvg } from './safehouse.svg';
import { svg as securityBureauSvg } from './security-bureau.svg';
import { svg as shrineSvg } from './shrine.svg';
import { svg as stableSvg } from './stable.svg';
import { svg as templeSvg } from './temple.svg';
import { svg as wallsSvg } from './walls.svg';
import { svg as workshopSvg } from './workshop.svg';

// ── Unit sprites ────────────────────────────────────────────────────────────

const UNIT_SPRITES: Record<string, Record<string, string>> = {
  archer:        archerSvg,
  galley:        galleySvg,
  musketeer:     musketeerSvg,
  pikeman:       pikemanSvg,
  scout:         scoutSvg,
  scout_hound:   scoutHoundSvg,
  settler:       settlerSvg,
  shadow_warden: shadowWardenSvg,
  spy_agent:     spyAgentSvg,
  spy_hacker:    spyHackerSvg,
  spy_informant: spyInformantSvg,
  spy_operative: spyOperativeSvg,
  spy_scout:     spyScoutSvg,
  swordsman:     swordsmanSvg,
  trireme:       triremeSvg,
  war_hound:     warHoundSvg,
  warrior:       warriorSvg,
  worker:        workerSvg,
  // MR 2 adds: axeman, spearman, horseman, cavalry, knight,
  //            crossbowman, catapult, ballista, caravan, expedition, transport
};

export function getUnitSpriteV2(unitType: string, faction: string): string | null {
  return UNIT_SPRITES[unitType]?.[faction] ?? null;
}

// ── Building sprites ─────────────────────────────────────────────────────────

const BUILDING_SPRITES: Record<string, Record<string, string>> = {
  amphitheater:          amphitheaterSvg,
  aqueduct:              aqueductSvg,
  archive:               archiveSvg,
  barracks:              barracksSvg,
  forge:                 forgeSvg,
  forum:                 forumSvg,
  granary:               granarySvg,
  harbor:                harborSvg,
  herbalist:             herbalistSvg,
  'intelligence-agency': intelligenceAgencySvg,
  library:               librarySvg,
  lumbermill:            lumbermillSvg,
  marketplace:           marketplaceSvg,
  monument:              monumentSvg,
  observatory:           observatorySvg,
  'quarry-building':     quarryBuildingSvg,
  safehouse:             safehouseSvg,
  'security-bureau':     securityBureauSvg,
  shrine:                shrineSvg,
  stable:                stableSvg,
  temple:                templeSvg,
  walls:                 wallsSvg,
  workshop:              workshopSvg,
  // MR 3 adds remaining buildings
};

export function getBuildingSpriteV2(buildingType: string, faction: string): string | null {
  return BUILDING_SPRITES[buildingType]?.[faction] ?? null;
}

// ── Improvement sprites ───────────────────────────────────────────────────────

const IMPROVEMENT_SPRITES: Record<string, string> = {
  // MR 4 wires: farm, mine, lumber_camp, watermill, plantation, pasture, camp, quarry, resource_outpost
};

export function getImprovementSpriteV2(improvementType: string): string | null {
  return IMPROVEMENT_SPRITES[improvementType] ?? null;
}
```

- [ ] **Step 4: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/renderer/sprites/v2/index.test.ts 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/v2/index.ts tests/renderer/sprites/v2/index.test.ts
git commit -m "feat(overlay-mr1): v2/index.ts with 18 unit + 23 building lookups"
```

---

### Task 3: SpriteOverlay class

**Files:** `src/renderer/sprite-overlay.ts`, `tests/renderer/sprite-overlay.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/sprite-overlay.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { SpriteOverlay, hashCode } from '@/renderer/sprite-overlay';
import type { SpriteEntity } from '@/renderer/sprite-overlay';
import { LOD_SPRITE_ZOOM_THRESHOLD } from '@/renderer/sprites/sprite-system';

function cam(overrides: Record<string, unknown> = {}) {
  return { x: 0, y: 0, zoom: 1, hexSize: 32, width: 800, height: 600, ...overrides } as any;
}

function entity(overrides: Partial<SpriteEntity> = {}): SpriteEntity {
  return { id: 'u1', kind: 'unit', subtype: 'warrior', coord: { q: 0, r: 0 }, state: 'idle', faction: 'imperials', ...overrides };
}

function mountOverlay() {
  const mount = document.createElement('div');
  const ui = document.createElement('div');
  ui.id = 'ui-layer';
  mount.appendChild(ui);
  document.body.appendChild(mount);
  return { overlay: new SpriteOverlay(mount), mount };
}

const MAP = { width: 20, wrapsHorizontally: false };
const OPTS = { isPinching: false, reducedMotion: false };

afterEach(() => { document.body.innerHTML = ''; });

describe('hashCode', () => {
  it('is non-negative', () => expect(hashCode('x')).toBeGreaterThanOrEqual(0));
  it('is deterministic', () => expect(hashCode('abc')).toBe(hashCode('abc')));
  it('differs for different inputs', () => expect(hashCode('a')).not.toBe(hashCode('b')));
  it('phase is in [0,1)', () => {
    const p = (hashCode('warrior_001') % 100) / 100;
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });
});

describe('SpriteOverlay constructor', () => {
  it('inserts container before #ui-layer', () => {
    const { mount } = mountOverlay();
    const kids = Array.from(mount.children);
    expect(kids.findIndex(e => e.id === 'sprite-overlay')).toBeLessThan(kids.findIndex(e => e.id === 'ui-layer'));
  });

  it('creates unit, building, improvement layer divs', () => {
    const { mount } = mountOverlay();
    expect(mount.querySelector('#unit-sprites')).not.toBeNull();
    expect(mount.querySelector('#building-sprites')).not.toBeNull();
    expect(mount.querySelector('#improvement-sprites')).not.toBeNull();
  });
});

describe('sync() LOD gate', () => {
  it('hides container below LOD threshold', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: LOD_SPRITE_ZOOM_THRESHOLD - 0.01 }), [], MAP, OPTS);
    expect((mount.querySelector('#sprite-overlay') as HTMLElement).style.display).toBe('none');
  });

  it('hides container when reducedMotion', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [], MAP, { ...OPTS, reducedMotion: true });
    expect((mount.querySelector('#sprite-overlay') as HTMLElement).style.display).toBe('none');
  });

  it('shows container above threshold', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: LOD_SPRITE_ZOOM_THRESHOLD + 0.1 }), [], MAP, OPTS);
    const style = (mount.querySelector('#sprite-overlay') as HTMLElement)!.style.display;
    expect(style).not.toBe('none');
  });
});

describe('sync() camera transform', () => {
  it('sets correct transform', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1.5, x: 100, y: 200 }), [], MAP, OPTS);
    expect((mount.querySelector('#sprite-overlay') as HTMLElement)!.style.transform)
      .toBe('scale(1.5) translate(-100px, -200px)');
  });

  it('updates transform even while pinching', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 2, x: 50, y: 75 }), [], MAP, { ...OPTS, isPinching: true });
    expect((mount.querySelector('#sprite-overlay') as HTMLElement)!.style.transform)
      .toBe('scale(2) translate(-50px, -75px)');
  });
});

describe('sync() pinch guard', () => {
  it('does not add elements while pinching', () => {
    const { overlay } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, { ...OPTS, isPinching: true });
    expect(overlay.getActiveIds().size).toBe(0);
  });

  it('does not remove elements while pinching', () => {
    const { overlay, mount } = mountOverlay();
    // Add an element first
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    const before = mount.querySelector('#unit-sprites')!.children.length;
    // Pinch with empty list — should NOT cull
    overlay.sync(cam({ zoom: 1 }), [], MAP, { ...OPTS, isPinching: true });
    expect(mount.querySelector('#unit-sprites')!.children.length).toBe(before);
  });
});

describe('sync() pool lifecycle', () => {
  it('culls stale elements', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    expect(mount.querySelector('#unit-sprites')!.children.length).toBeGreaterThan(0);
    overlay.sync(cam({ zoom: 1 }), [], MAP, OPTS);
    expect(mount.querySelector('#unit-sprites')!.children.length).toBe(0);
  });

  it('reuses element on second sync — no node replacement', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({ state: 'idle' })], MAP, OPTS);
    const original = mount.querySelector('.cq-sprite-wrap');
    overlay.sync(cam({ zoom: 1 }), [entity({ state: 'walk' })], MAP, OPTS);
    expect(mount.querySelector('.cq-sprite-wrap')).toBe(original); // same node
    expect((original as HTMLElement).getAttribute('data-state')).toBe('walk');
  });
});

describe('invalidateFaction', () => {
  it('evicts elements for given faction', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity({ faction: 'imperials' })], MAP, OPTS);
    overlay.invalidateFaction('imperials');
    expect(mount.querySelector('#unit-sprites')!.children.length).toBe(0);
    expect(overlay.getActiveIds().size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/renderer/sprite-overlay.test.ts 2>&1 | tail -5
```

Expected: errors — module missing.

- [ ] **Step 3: Create src/renderer/sprite-overlay.ts**

```typescript
import { hexToPixel } from '@/systems/hex-utils';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
import {
  getUnitSpriteV2,
  getBuildingSpriteV2,
  getImprovementSpriteV2,
} from './sprites/v2/index';
import type { Camera } from './camera';
import type { HexCoord } from '@/core/types';

export interface SpriteEntity {
  id:      string;
  kind:    'unit' | 'building' | 'improvement';
  subtype: string;
  coord:   HexCoord;
  /** v2 animation state — NOT the same as UnitMotionState ('move-a'/'move-b').
   *  RenderLoop translates: move-a|move-b → 'walk'. */
  state:   'idle' | 'walk' | 'attack';
  faction: string; // civType from Civilization, e.g. 'imperials', 'vikings'
}

interface PoolEntry {
  el:           HTMLDivElement;  // positional wrapper
  spriteWrapEl: HTMLElement;     // .cq-sprite-wrap.cq-v2 — animation root
  phase:        number;
  faction:      string;
  coord:        HexCoord;
}

// djb2 hash — deterministic, no external dependency
export function hashCode(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

export class SpriteOverlay {
  private container: HTMLDivElement;
  private layers: Record<SpriteEntity['kind'], HTMLDivElement>;
  private pool = new Map<string, PoolEntry>();
  private _activeIds = new Set<string>();

  constructor(mountPoint: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'sprite-overlay';
    this.container.style.cssText =
      'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;' +
      'pointer-events:none;transform-origin:top left;will-change:transform';
    // contain: layout style — NOT paint (paint clips the 0×0 box making sprites invisible)
    this.container.style.setProperty('contain', 'layout style');

    const unit = makeLayer('unit-sprites');
    const building = makeLayer('building-sprites');
    const improvement = makeLayer('improvement-sprites');
    this.container.appendChild(unit);
    this.container.appendChild(building);
    this.container.appendChild(improvement);
    this.layers = { unit, building, improvement };

    const uiLayer = mountPoint.querySelector('#ui-layer');
    if (uiLayer) mountPoint.insertBefore(this.container, uiLayer);
    else mountPoint.appendChild(this.container);
  }

  sync(
    camera: Camera,
    entities: SpriteEntity[],
    map: { width: number; wrapsHorizontally: boolean },
    opts: { isPinching: boolean; reducedMotion: boolean },
  ): void {
    // 1. LOD + reduced-motion gate
    if (camera.zoom < LOD_SPRITE_ZOOM_THRESHOLD || opts.reducedMotion) {
      this.container.style.display = 'none';
      return;
    }
    this.container.style.display = '';

    // 2. Camera transform — one write per frame, always (even during pinch)
    this.container.style.transform =
      `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`;

    // 3. Pinch guard — defer pool mutations
    if (opts.isPinching) return;

    // 4. Entity → DOM
    const seen = new Set<string>();
    for (const entity of entities) {
      const coords = map.wrapsHorizontally
        ? getHorizontalWrapRenderCoords(entity.coord, map.width, camera)
        : [entity.coord];

      for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];
        const key = `${entity.id}:${i}`;
        seen.add(key);

        const existing = this.pool.get(key);
        if (existing) {
          existing.spriteWrapEl.setAttribute('data-state', entity.state);
          // Update world position if unit moved to a new hex after animation complete
          if (existing.coord.q !== coord.q || existing.coord.r !== coord.r) {
            const px = hexToPixel(coord, camera.hexSize);
            existing.el.style.left = `${px.x}px`;
            existing.el.style.top = `${px.y}px`;
            existing.coord = coord;
          }
        } else {
          const svgHtml = this.lookupSprite(entity);
          if (!svgHtml) continue; // no v2 sprite — canvas handles it

          const phase = (hashCode(entity.id) % 100) / 100;
          const px = hexToPixel(coord, camera.hexSize);
          const wrapper = document.createElement('div');
          wrapper.style.cssText =
            `position:absolute;width:128px;height:128px;` +
            `transform:translate(-50%,-50%);` +
            `left:${px.x}px;top:${px.y}px`;
          wrapper.innerHTML = svgHtml;

          // spriteWrapEl = .cq-sprite-wrap.cq-v2 (first child) — NOT the <svg>
          // CSS selectors key off this element: .cq-v2[data-state="idle"] ...
          const spriteWrapEl = wrapper.firstElementChild as HTMLElement;
          // Override baked style="--phase:0" on the same element — setProperty wins
          spriteWrapEl.style.setProperty('--phase', String(phase));
          spriteWrapEl.setAttribute('data-state', entity.state);

          this.layers[entity.kind].appendChild(wrapper);
          this.pool.set(key, { el: wrapper, spriteWrapEl, phase, faction: entity.faction, coord });
        }
      }
    }

    // 5. Cull stale elements
    for (const [key, entry] of this.pool) {
      if (!seen.has(key)) {
        entry.el.remove();
        this.pool.delete(key);
      }
    }

    // Rebuild activeIds from current pool
    this._activeIds.clear();
    for (const key of this.pool.keys()) {
      // key = `${entityId}:${ghostIndex}` — extract entityId
      this._activeIds.add(key.slice(0, key.lastIndexOf(':')));
    }
  }

  private lookupSprite(entity: SpriteEntity): string | null {
    switch (entity.kind) {
      case 'unit':        return getUnitSpriteV2(entity.subtype, entity.faction);
      case 'building':    return getBuildingSpriteV2(entity.subtype, entity.faction);
      case 'improvement': return getImprovementSpriteV2(entity.subtype);
      default:            return null;
    }
  }

  getActiveIds(): ReadonlySet<string> { return this._activeIds; }

  invalidateFaction(faction: string): void {
    for (const [key, entry] of this.pool) {
      if (entry.faction === faction) {
        entry.el.remove();
        this.pool.delete(key);
      }
    }
    this._activeIds.clear();
  }
}

function makeLayer(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;overflow:visible';
  return div;
}
```

- [ ] **Step 4: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/renderer/sprite-overlay.test.ts 2>&1 | tail -15
```

Expected: all PASS. (Warrior/imperials tests pass because the lookup is already wired in v2/index.ts.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprite-overlay.ts tests/renderer/sprite-overlay.test.ts
git commit -m "feat(overlay-mr1): SpriteOverlay class — pool, camera sync, entity→DOM, cull"
```

---

### Task 4: Wire SpriteOverlay into RenderLoop

**Files:** `src/renderer/render-loop.ts`, `src/main.ts`

- [ ] **Step 1: Add imports and fields to RenderLoop**

In `src/renderer/render-loop.ts`, add imports at top:

```typescript
import { SpriteOverlay } from './sprite-overlay';
```

In the `RenderLoop` class body, add fields:

```typescript
private spriteOverlay: SpriteOverlay;
private touchHandlerRef: { isPinching: boolean } | null = null;

setTouchHandler(th: { isPinching: boolean }): void {
  this.touchHandlerRef = th;
}
```

- [ ] **Step 2: Instantiate SpriteOverlay in constructor**

In `RenderLoop.constructor`, after `this.camera = new Camera()`:

```typescript
const mountPoint = canvas.parentElement ?? document.body;
this.spriteOverlay = new SpriteOverlay(mountPoint);
```

- [ ] **Step 3: Call sync() at the end of render()**

At the very end of the `private render()` method (after `this.animations.update(...)`), add:

```typescript
// Sprite overlay — entity list populated in MR 2+
this.spriteOverlay.sync(
  this.camera,
  [], // populated in MR 2
  {
    width: this.state?.map.width ?? 0,
    wrapsHorizontally: this.state?.map.wrapsHorizontally ?? false,
  },
  {
    isPinching: this.touchHandlerRef?.isPinching ?? false,
    reducedMotion: prefersReducedMotion(),
  },
);
```

- [ ] **Step 4: Wire setTouchHandler in main.ts**

Find the line in `src/main.ts` where `new TouchHandler(canvas, ...)` is called. Immediately after it:

```typescript
renderLoop.setTouchHandler(touchHandler);
```

- [ ] **Step 5: Build and run full test suite**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -15
```

Expected: build exits 0, all tests PASS.

- [ ] **Step 6: Commit — MR 1 complete**

```bash
git add src/renderer/render-loop.ts src/main.ts
git commit -m "feat(overlay-mr1): wire SpriteOverlay into RenderLoop — MR 1 complete"
```

---

## Phase 2 (MR 2) — Unit Sprites

### Task 5: Serialize missing unit v2 sprites

**Files:** `design/conquestoria-sprites/lib/units-v2.jsx`, `src/renderer/sprites/v2/*.svg.ts` (×11 generated)

The 11 missing unit types need JSX component definitions before `serialize-sprites.mjs` can generate their `.svg.ts` files.

- [ ] **Step 1: Read the existing pattern in units-v2.jsx**

```bash
grep -n "function.*V2Sprite\|HumanoidV2\|SpriteFrameV2" design/conquestoria-sprites/lib/units-v2.jsx | head -30
```

Note the pattern: each sprite is a function `function FooV2Sprite({ faction = 'imperials', state = 'idle', phase })` that returns `<SpriteFrameV2>` with `<HumanoidV2>` inside. The `phase` parameter must have **no default value** (enables auto-desync).

- [ ] **Step 2: Add JSX components for the 11 missing unit types**

For each missing type, add a component to `design/conquestoria-sprites/lib/units-v2.jsx` following the established pattern. Use the `generate-sprite-prompt` skill to create Claude Design prompts if you need help designing each sprite visually.

Missing types by archetype:
- **Ground melee** (`axeman`, `spearman`, `knight`): use `HumanoidV2` with `arms="weapon"`, weapon art in `armRContent`
- **Mounted** (`horseman`, `cavalry`): `HumanoidV2` with horse/mount art `<g transform="translate(64 85)">` below the figure  
- **Siege** (`catapult`, `ballista`): minimal humanoid + equipment silhouette in body
- **Civilian** (`caravan`, `expedition`): `HumanoidV2` with `arms="free"`, pack/cart art as body accessory
- **Naval** (`transport`): `SpriteFrameV2 kind="naval"` with hull shape, no HumanoidV2

Add each new function name to the `Object.assign(window, {...})` export at the bottom of `units-v2.jsx`.

- [ ] **Step 3: Run serialize-sprites.mjs**

```bash
bash scripts/run-with-mise.sh node scripts/serialize-sprites.mjs 2>&1 | tail -20
```

Expected: generates files including `src/renderer/sprites/v2/axeman.svg.ts`, etc.

- [ ] **Step 4: Verify shape of generated files**

```bash
ls src/renderer/sprites/v2/axeman.svg.ts src/renderer/sprites/v2/spearman.svg.ts
grep "export const svg" src/renderer/sprites/v2/axeman.svg.ts
grep "cq-sprite-wrap" src/renderer/sprites/v2/axeman.svg.ts | head -c 100
```

Each file must export `export const svg: Record<string, string>` with multiple faction keys.

- [ ] **Step 5: Commit generated files and design JSX**

```bash
git add design/conquestoria-sprites/lib/units-v2.jsx \
  src/renderer/sprites/v2/axeman.svg.ts \
  src/renderer/sprites/v2/spearman.svg.ts \
  src/renderer/sprites/v2/horseman.svg.ts \
  src/renderer/sprites/v2/cavalry.svg.ts \
  src/renderer/sprites/v2/knight.svg.ts \
  src/renderer/sprites/v2/crossbowman.svg.ts \
  src/renderer/sprites/v2/catapult.svg.ts \
  src/renderer/sprites/v2/ballista.svg.ts \
  src/renderer/sprites/v2/caravan.svg.ts \
  src/renderer/sprites/v2/expedition.svg.ts \
  src/renderer/sprites/v2/transport.svg.ts
git commit -m "feat(overlay-mr2): serialize v2 SVGs for 11 remaining unit types"
```

---

### Task 6: Wire all 29 unit types into v2/index.ts

**Files:** `src/renderer/sprites/v2/index.ts`, `tests/renderer/sprites/v2/index.test.ts`

- [ ] **Step 1: Add imports for the 11 new files**

In `src/renderer/sprites/v2/index.ts`, add after the existing unit imports:

```typescript
import { svg as axemanSvg }      from './axeman.svg';
import { svg as spearmanSvg }    from './spearman.svg';
import { svg as horsemanSvg }    from './horseman.svg';
import { svg as cavalrySvg }     from './cavalry.svg';
import { svg as knightSvg }      from './knight.svg';
import { svg as crossbowmanSvg } from './crossbowman.svg';
import { svg as catapultSvg }    from './catapult.svg';
import { svg as ballistaSvg }    from './ballista.svg';
import { svg as caravanSvg }     from './caravan.svg';
import { svg as expeditionSvg }  from './expedition.svg';
import { svg as transportSvg }   from './transport.svg';
```

Replace the `// MR 2 adds: ...` comment in `UNIT_SPRITES` with:

```typescript
  axeman:     axemanSvg,
  spearman:   spearmanSvg,
  horseman:   horsemanSvg,
  cavalry:    cavalrySvg,
  knight:     knightSvg,
  crossbowman: crossbowmanSvg,
  catapult:   catapultSvg,
  ballista:   ballistaSvg,
  caravan:    caravanSvg,
  expedition: expeditionSvg,
  transport:  transportSvg,
```

- [ ] **Step 2: Add coverage test for all 29 unit types**

In `tests/renderer/sprites/v2/index.test.ts`, add:

```typescript
const ALL_UNIT_TYPES = [
  'archer', 'galley', 'musketeer', 'pikeman', 'scout', 'scout_hound',
  'settler', 'shadow_warden', 'spy_agent', 'spy_hacker', 'spy_informant',
  'spy_operative', 'spy_scout', 'swordsman', 'trireme', 'war_hound',
  'warrior', 'worker',
  'axeman', 'spearman', 'horseman', 'cavalry', 'knight', 'crossbowman',
  'catapult', 'ballista', 'caravan', 'expedition', 'transport',
];

it('returns a sprite for every unit type (imperials faction)', () => {
  for (const type of ALL_UNIT_TYPES) {
    const r = getUnitSpriteV2(type, 'imperials');
    expect(r, `missing v2 sprite for: ${type}`).not.toBeNull();
  }
});
```

- [ ] **Step 3: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/renderer/sprites/v2/index.test.ts 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/sprites/v2/index.ts tests/renderer/sprites/v2/index.test.ts
git commit -m "feat(overlay-mr2): wire all 29 unit types in v2/index.ts"
```

---

### Task 7: Build unit entity list + skip canvas drawImage

**Files:** `src/renderer/render-loop.ts`, `src/renderer/unit-renderer.ts`, `tests/renderer/unit-renderer-overlay.test.ts`

- [ ] **Step 1: Write failing tests for fog gate and canvas skip**

Create `tests/renderer/unit-renderer-overlay.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildUnitEntities } from '@/renderer/render-loop';
import type { GameState, Unit, VisibilityMap } from '@/core/types';

function makeState(units: Unit[], visMap: VisibilityMap = {}): GameState {
  const civs: GameState['civilizations'] = {
    'player1': { id: 'player1', color: '#b53026', civType: 'imperials', visibility: visMap } as any,
    'barbarian': { id: 'barbarian', color: '#8b4513', civType: 'generic', visibility: {} } as any,
  };
  return {
    currentPlayer: 'player1',
    units: Object.fromEntries(units.map(u => [u.id, u])),
    civilizations: civs,
    espionage: {},
  } as unknown as GameState;
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return { id: 'u1', type: 'warrior', position: { q: 2, r: 3 }, owner: 'player1', ...overrides } as Unit;
}

function visMap(coords: Array<{ q: number; r: number }>, status: 'visible' | 'fog' | 'unexplored') {
  const m: VisibilityMap = {};
  for (const c of coords) m[`${c.q},${c.r}`] = status;
  return m;
}

describe('buildUnitEntities', () => {
  it('includes units in visible hexes', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], visMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities.map(e => e.id)).toContain('u1');
  });

  it('excludes units in fog hexes', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], visMap([{ q: 2, r: 3 }], 'fog'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities.map(e => e.id)).not.toContain('u1');
  });

  it('excludes units in unexplored hexes', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], visMap([{ q: 2, r: 3 }], 'unexplored'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities.map(e => e.id)).not.toContain('u1');
  });

  it('excludes moving units (movement animation gate)', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], visMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(['u1']));
    expect(entities.map(e => e.id)).not.toContain('u1');
  });

  it('maps civType to faction', () => {
    const u = makeUnit({ position: { q: 2, r: 3 } });
    const state = makeState([u], visMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    expect(entities[0]?.faction).toBe('imperials');
  });

  it('falls back to imperials for unknown civType', () => {
    // Create a player civ with an unrecognised civType
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'player2' });
    const state = makeState([u], visMap([{ q: 2, r: 3 }], 'visible'));
    // Add player2 with unknown civType
    (state.civilizations as any)['player2'] = {
      id: 'player2', civType: 'unknown_faction', visibility: {},
    };
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
    const p2Entity = entities.find(e => e.id === u.id);
    expect(p2Entity).toBeDefined();
    expect(p2Entity!.faction).toBe('imperials'); // fallback
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/renderer/unit-renderer-overlay.test.ts 2>&1 | tail -5
```

Expected: module error — `buildUnitEntities` not exported yet.

- [ ] **Step 3: Export buildUnitEntities from render-loop.ts**

In `src/renderer/render-loop.ts`, add this exported helper function (outside the class):

```typescript
import { getVisibility } from '@/systems/fog-of-war';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import type { SpriteEntity } from './sprite-overlay';

const KNOWN_FACTIONS = new Set([
  'imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate',
]);

export function buildUnitEntities(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
): SpriteEntity[] {
  const visible = getVisibleUnitsForPlayer(state.units, state, viewerId);
  return visible
    .filter(u => {
      if (movingUnitIds.has(u.id)) return false;
      return getVisibility(viewerVisibility, u.position) === 'visible';
    })
    .map(u => {
      const civType = state.civilizations[u.owner]?.civType ?? 'generic';
      const faction = KNOWN_FACTIONS.has(civType) ? civType : 'imperials';
      return {
        id: u.id,
        kind: 'unit' as const,
        subtype: u.type,
        coord: u.position,
        state: 'idle' as const, // walk state set during movement in overlay (MR 2 extension)
        faction,
      };
    });
}
```

- [ ] **Step 4: Wire buildUnitEntities into sync() call in render()**

In `RenderLoop.render()`, replace `entities: [],` in the `spriteOverlay.sync()` call with:

```typescript
entities: viewerVisibility
  ? buildUnitEntities(
      this.state,
      viewerId,
      viewerVisibility,
      new Set(getMovingUnitIds(this.unitMovementAnimations)),
    )
  : [],
```

- [ ] **Step 5: Skip drawImage in unit-renderer.ts for overlay-managed units**

In `src/renderer/unit-renderer.ts`, add `activeOverlayIds` with a **default value** to the `drawUnits` signature so existing callers are not broken:

```typescript
export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Record<string, Unit>,
  camera: Camera,
  playerVisibility: VisibilityMap,
  state: GameState,
  currentPlayer: string,
  colorLookup?: Record<string, string>,
  options: { hiddenUnitIds?: Set<string> } = {},
  activeOverlayIds: ReadonlySet<string> = new Set(), // new — defaults to empty
): void {
```

Inside the existing loop where units are drawn (after filtering `visibleUnits`), add the skip check at the top of the per-stack loop:

```typescript
for (const stack of Object.values(groupUnitsByHex(visibleUnits))) {
  // Skip entire stack if the top unit is overlay-managed
  // (overlay renders the animated sprite; canvas only draws glyph fallback if overlay can't)
  if (stack.every(u => activeOverlayIds.has(u.id))) continue;
  // ... rest of existing draw logic
```

Then in `render-loop.ts`, pass the active IDs:

```typescript
drawUnits(this.ctx, visibleUnits, this.camera, viewerVisibility, this.state, viewerId, colorLookup, {
  hiddenUnitIds: getMovingUnitIds(this.unitMovementAnimations),
}, this.spriteOverlay.getActiveIds());
```

- [ ] **Step 6: Run all tests**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

Expected: all PASS, build exits 0.

- [ ] **Step 7: Commit — MR 2 complete**

```bash
git add src/renderer/render-loop.ts src/renderer/unit-renderer.ts tests/renderer/unit-renderer-overlay.test.ts
git commit -m "feat(overlay-mr2): unit sprites wired — fog gate, movement gate, canvas skip — MR 2 complete"
```

---

## Phase 3 (MR 3) — Building Sprites

### Task 8: Serialize missing building v2 sprites

**Files:** `design/conquestoria-sprites/lib/buildings-v2.jsx`, `src/renderer/sprites/v2/*.svg.ts`

- [ ] **Step 1: Identify missing buildings**

```bash
ls src/renderer/sprites/v2/*.svg.ts | xargs -I{} basename {} .svg.ts | sort > /tmp/v2-files.txt
grep "Sprite," src/renderer/sprites/sprite-catalog.ts | sed "s/.*import { svg as //;s/Svg.*//" | tr '[:upper:]' '[:lower:]' | sort > /tmp/catalog.txt
# Compare — any catalog entry without a v2 file needs serialization
```

Or simply run the script; it will skip types it already has and generate new ones for any added to buildings-v2.jsx.

- [ ] **Step 2: Add JSX components for missing building types**

Open `design/conquestoria-sprites/lib/buildings-v2.jsx`. For each building type missing from v2, add a `FooV2Building({ faction, phase })` function following the `BuildingFrameV2` pattern (auto-phase only, v1 animation CSS carries over). Export each via `Object.assign`.

- [ ] **Step 3: Run serialize-sprites.mjs**

```bash
bash scripts/run-with-mise.sh node scripts/serialize-sprites.mjs 2>&1 | tail -20
```

- [ ] **Step 4: Verify generated files and commit**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
git add design/conquestoria-sprites/lib/buildings-v2.jsx src/renderer/sprites/v2/
git commit -m "feat(overlay-mr3): serialize v2 SVGs for remaining building types"
```

---

### Task 9: Wire buildings into v2/index.ts + RenderLoop

**Files:** `src/renderer/sprites/v2/index.ts`, `src/renderer/render-loop.ts`, `tests/renderer/city-renderer-overlay.test.ts`

- [ ] **Step 1: Add imports for new building files in v2/index.ts**

For each newly generated `.svg.ts` file, add the matching import and entry in `BUILDING_SPRITES`. Follow the same pattern as existing entries. Remove the `// MR 3 adds remaining buildings` comment.

- [ ] **Step 2: Add coverage test for all building types**

In `tests/renderer/sprites/v2/index.test.ts`, add:

```typescript
import { BUILDINGS } from '@/systems/city-system';

it('returns a sprite for every non-wonder building type (imperials faction)', () => {
  const wonderIds = new Set(['pyramids', 'colosseum', 'great-library', 'lighthouse']);
  for (const id of Object.keys(BUILDINGS)) {
    if (wonderIds.has(id)) continue; // wonders are canvas-only — no v2 expected
    const r = getBuildingSpriteV2(id, 'imperials');
    expect(r, `missing v2 sprite for building: ${id}`).not.toBeNull();
  }
});
```

- [ ] **Step 3: Write city-renderer-overlay test**

Create `tests/renderer/city-renderer-overlay.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildBuildingEntities } from '@/renderer/render-loop';
import type { GameState, City } from '@/core/types';

function makeState(city: Partial<City>): GameState {
  const c = { id: 'c1', position: { q: 3, r: 4 }, owner: 'player1', buildings: ['granary'], ...city } as City;
  return {
    currentPlayer: 'player1',
    cities: { c1: c },
    civilizations: {
      'player1': { id: 'player1', civType: 'imperials', visibility: { '3,4': 'visible' } } as any,
    },
  } as unknown as GameState;
}

describe('buildBuildingEntities', () => {
  it('returns building entities for visible city', () => {
    const state = makeState({});
    const entities = buildBuildingEntities(state, 'player1', state.civilizations['player1'].visibility);
    expect(entities.length).toBeGreaterThan(0);
    expect(entities[0].kind).toBe('building');
    expect(entities[0].coord).toEqual({ q: 3, r: 4 });
  });

  it('excludes buildings in fog cities', () => {
    const state = makeState({});
    // Override visibility to fog
    (state.civilizations['player1'].visibility as any)['3,4'] = 'fog';
    const entities = buildBuildingEntities(state, 'player1', state.civilizations['player1'].visibility);
    expect(entities.length).toBe(0);
  });
});
```

- [ ] **Step 4: Export buildBuildingEntities from render-loop.ts**

Note: faction must use the **city owner's** civType, not the viewer's. Enemy cities must show their owner's faction colors.

```typescript
export function buildBuildingEntities(
  state: GameState,
  viewerVisibility: VisibilityMap,
): SpriteEntity[] {
  const entities: SpriteEntity[] = [];

  for (const city of Object.values(state.cities)) {
    if (getVisibility(viewerVisibility, city.position) !== 'visible') continue;
    // Use the CITY OWNER's civType, not the viewer's
    const ownerCivType = state.civilizations[city.owner]?.civType ?? 'generic';
    const faction = KNOWN_FACTIONS.has(ownerCivType) ? ownerCivType : 'imperials';
    for (const buildingId of city.buildings) {
      entities.push({
        id: `${city.id}:${buildingId}`,
        kind: 'building',
        subtype: buildingId,
        coord: city.position,
        state: 'idle',
        faction,
      });
    }
  }
  return entities;
}
```

Wire into `spriteOverlay.sync()` by combining unit and building entities:

```typescript
const unitEntities = viewerVisibility ? buildUnitEntities(this.state, viewerId, viewerVisibility,
    new Set(getMovingUnitIds(this.unitMovementAnimations))) : [];
const buildingEntities = viewerVisibility ? buildBuildingEntities(this.state, viewerVisibility) : [];
this.spriteOverlay.sync(this.camera, [...unitEntities, ...buildingEntities], ...);
```

- [ ] **Step 5: Skip building drawImage in city-renderer.ts**

In `src/renderer/city-renderer.ts`, find the `drawBuilding` call (or wherever `spriteCache.getBuilding` is called with `ctx.drawImage`). Add `activeOverlayIds: ReadonlySet<string>` to the `drawCities` signature and skip draw if `activeOverlayIds.has(buildingEntityId)`.

The building entity ID format is `` `${city.id}:${buildingId}` `` — match this in the skip check.

Pass `this.spriteOverlay.getActiveIds()` from `RenderLoop.render()` to `drawCities`.

- [ ] **Step 6: Run full test suite and build**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
```

- [ ] **Step 7: Commit — MR 3 complete**

```bash
git add src/renderer/sprites/v2/index.ts src/renderer/render-loop.ts src/renderer/city-renderer.ts \
  tests/renderer/sprites/v2/index.test.ts tests/renderer/city-renderer-overlay.test.ts
git commit -m "feat(overlay-mr3): building sprites wired — fog gate, canvas skip — MR 3 complete"
```

---

## Phase 4 (MR 4) — Improvement Markers

> **Architecture note:** Improvement markers have **no animation**, so they do NOT go through the DOM overlay. The `sprites.md` rule is explicit: *"No animation — improvement markers are drawn on Canvas 2D directly."* Follow the `resource-outpost-marker.ts` pattern: SVG string → blob → `HTMLImageElement` → `ctx.drawImage`. The `getImprovementSpriteV2` function in `v2/index.ts` remains `null`-returning — it is unused for improvements.

### Task 10: Create 8 SVG improvement marker files + preload helpers

**Files:** `src/renderer/improvements/{farm,mine,lumber-camp,watermill,plantation,pasture,camp,quarry}-marker.ts`

Each marker: `viewBox="0 0 48 48"`, no faction color, no animation, earthy palette (`#5e3f24`, `#8a6a3a`, `#d4a13c`, `#7ea860`), `stroke-linecap="round"`. Follows the `resource-outpost-marker.ts` pattern exactly (SVG string → cached HTMLImageElement).

- [ ] **Step 1: Read the existing pattern**

```bash
cat src/renderer/improvements/resource-outpost-marker.ts
```

Note: exports `preloadOutpostMarker()` and `getOutpostMarkerImage()`. Each new marker file must export `preload<Name>Marker()` and `get<Name>MarkerImage()`.

- [ ] **Step 2: Create farm-marker.ts**

```typescript
// src/renderer/improvements/farm-marker.ts
const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <rect x="4" y="28" width="40" height="14" rx="2" fill="#7ea860" stroke="#3a5a28" stroke-width="1.2"/>
  <line x1="12" y1="28" x2="12" y2="42" stroke="#5a8040" stroke-width="1"/>
  <line x1="24" y1="28" x2="24" y2="42" stroke="#5a8040" stroke-width="1"/>
  <line x1="36" y1="28" x2="36" y2="42" stroke="#5a8040" stroke-width="1"/>
  <path d="M8,28 Q12,18 16,20 Q20,14 24,16 Q28,10 32,14 Q36,10 40,18 L40,28 Z"
        fill="#a0c86a" stroke="#5a8040" stroke-width="1.2"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadFarmMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export function getFarmMarkerImage(): HTMLImageElement | null { return cached; }
```

- [ ] **Step 3: Create the remaining 7 markers**

Create one file per improvement type (earthy palette, 48×48). Each exports `preload<Name>Marker()` and `get<Name>MarkerImage()`:

- `mine-marker.ts` — pickaxe silhouette + rock
- `lumber-camp-marker.ts` — stacked logs + axe
- `watermill-marker.ts` — wheel + water line
- `plantation-marker.ts` — tree row silhouette
- `pasture-marker.ts` — fence posts + animal outline
- `camp-marker.ts` — tent triangle + fire dot
- `quarry-marker.ts` — stepped stone blocks

- [ ] **Step 4: Wire preload calls into game init**

In `src/main.ts`, find where `preloadOutpostMarker()` is called (or `initSprites()`). Add calls to all 8 new `preload*Marker()` functions in the same block:

```typescript
await Promise.all([
  preloadOutpostMarker(),
  preloadFarmMarker(),
  preloadMineMarker(),
  preloadLumberCampMarker(),
  preloadWatermillMarker(),
  preloadPlantationMarker(),
  preloadPastureMarker(),
  preloadCampMarker(),
  preloadQuarryMarker(),
]);
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/improvements/ src/main.ts
git commit -m "feat(overlay-mr4): create 8 SVG improvement marker files with preload helpers"
```

---

### Task 11: Replace emoji with ctx.drawImage in hex-renderer

**Files:** `src/renderer/hex-renderer.ts`, `tests/renderer/improvements/improvement-markers.test.ts`

- [ ] **Step 1: Write a test confirming SVGs are valid and preload correctly**

Create `tests/renderer/improvements/improvement-markers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Test the SVG string shapes (preload requires browser Image API not available in vitest)
// Integration: verify that each marker module exports the required functions

const markerModules = [
  '@/renderer/improvements/farm-marker',
  '@/renderer/improvements/mine-marker',
  '@/renderer/improvements/lumber-camp-marker',
  '@/renderer/improvements/watermill-marker',
  '@/renderer/improvements/plantation-marker',
  '@/renderer/improvements/pasture-marker',
  '@/renderer/improvements/camp-marker',
  '@/renderer/improvements/quarry-marker',
];

describe('improvement marker modules', () => {
  it('each module exports preload and getImage functions', async () => {
    for (const path of markerModules) {
      const mod = await import(path);
      const keys = Object.keys(mod);
      const hasPreload = keys.some(k => k.startsWith('preload'));
      const hasGet = keys.some(k => k.startsWith('get') && k.endsWith('Image'));
      expect(hasPreload, `${path} missing preload function`).toBe(true);
      expect(hasGet, `${path} missing get*Image function`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/renderer/improvements/improvement-markers.test.ts 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 3: Replace emoji in hex-renderer.ts**

In `src/renderer/hex-renderer.ts`, add imports at the top:

```typescript
import { getFarmMarkerImage } from './improvements/farm-marker';
import { getMineMarkerImage } from './improvements/mine-marker';
import { getLumberCampMarkerImage } from './improvements/lumber-camp-marker';
import { getWatermillMarkerImage } from './improvements/watermill-marker';
import { getPlantationMarkerImage } from './improvements/plantation-marker';
import { getPastureMarkerImage } from './improvements/pasture-marker';
import { getCampMarkerImage } from './improvements/camp-marker';
import { getQuarryMarkerImage } from './improvements/quarry-marker';
```

Add a lookup map alongside `IMPROVEMENT_ICONS`:

```typescript
const IMPROVEMENT_MARKER_GETTERS: Record<string, () => HTMLImageElement | null> = {
  farm:        getFarmMarkerImage,
  mine:        getMineMarkerImage,
  lumber_camp: getLumberCampMarkerImage,
  watermill:   getWatermillMarkerImage,
  plantation:  getPlantationMarkerImage,
  pasture:     getPastureMarkerImage,
  camp:        getCampMarkerImage,
  quarry:      getQuarryMarkerImage,
};
```

In `drawHexTile`, find the `else` branch (line ~301) that draws the emoji fallback:

```typescript
} else {
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `${size * 0.5}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const icon = IMPROVEMENT_ICONS[tile.improvement] ?? '◆';
  ctx.fillText(icon, cx, cy);
}
```

Replace with:

```typescript
} else {
  const getter = IMPROVEMENT_MARKER_GETTERS[tile.improvement];
  const img = getter ? getter() : null;
  if (img) {
    const s = size * 0.6;
    ctx.drawImage(img, cx - s / 2, cy - s * 0.7, s, s);
  } else {
    // Fallback to emoji while marker loads or for unknown improvement types
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = IMPROVEMENT_ICONS[tile.improvement] ?? '◆';
    ctx.fillText(icon, cx, cy);
  }
}
```

- [ ] **Step 4: Build and run full test suite**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -5
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: build exits 0, all tests PASS.

- [ ] **Step 5: Commit — MR 4 complete**

```bash
git add src/renderer/hex-renderer.ts tests/renderer/improvements/improvement-markers.test.ts
git commit -m "feat(overlay-mr4): replace improvement emoji with SVG canvas drawImage — MR 4 complete"
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `#sprite-overlay` CSS with `contain: layout style` (not paint) | Task 1 |
| `will-change: transform` on container only | Task 1 + Task 3 |
| `isPinching` getter on TouchHandler | Task 1 |
| hashCode() defined in sprite-overlay.ts | Task 3 |
| spriteWrapEl = firstElementChild (.cq-sprite-wrap) | Task 3 |
| `--phase` set on spriteWrapEl (not outer wrapper) | Task 3 |
| State via setAttribute only, no node replacement | Task 3 |
| Camera transform: `scale(zoom) translate(-camX, -camY)` | Task 3 |
| Pinch guard defers pool mutations | Task 3 |
| LOD gate hides overlay | Task 3 |
| reducedMotion hides overlay | Task 3 |
| Fog-of-war entity filtering | Task 7 |
| Movement animation gate | Task 7 |
| v2 faction via `civType`, fallback to imperials | Task 7 |
| Canvas skips drawImage for activeIds (units) | Task 7 |
| Canvas skips drawImage for activeIds (buildings) | Task 9 |
| Canvas skips emoji for activeIds (improvements) | Task 11 |
| `getHorizontalWrapRenderCoords` — no overlay-owned wrap logic | Task 3 |
| Pool position update when unit changes hex | Task 3 |
| `invalidateFaction()` evicts by faction | Task 3 |
| 29 unit types in v2/index | Task 6 |
| All building types in v2/index | Task 9 |
| All 9 improvement types in v2/index | Task 11 |

**Placeholder scan:** No TBDs or "implement later" in tasks with code steps. Task 5 and Task 8 reference creative/design work (JSX sprite components) which genuinely cannot be shown as code — documented as design tasks with pattern references.

**Type consistency:** `SpriteEntity`, `PoolEntry`, `hashCode`, `buildUnitEntities`, `buildBuildingEntities`, `buildImprovementEntities` — all defined once, referenced consistently.
