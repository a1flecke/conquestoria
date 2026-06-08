# Sprite Rendering Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 DOM sprite rendering bugs (issues #338, #339, #340, #341) tracing to 2 root causes: a hardcoded 128px wrapper size and a faction-name/civType name disconnect.

**Architecture:** Targeted fixes in two renderer files (`sprite-overlay.ts`, `render-loop.ts`), test updates to prevent regression, and new prevention rules in `.claude/rules/sprites.md`. No new files are created. No SVG assets, serialize scripts, or canvas-path code are touched.

**Tech Stack:** TypeScript, Vitest (jsdom environment), Canvas 2D + DOM sprite overlay, Vite

---

## File Map

| Action   | File                                               | Responsibility                                                        |
|----------|----------------------------------------------------|-----------------------------------------------------------------------|
| Modify   | `src/renderer/sprite-overlay.ts`                  | Export sizing constant; derive wrapper size from hexSize; add overflow |
| Modify   | `src/renderer/render-loop.ts`                     | Replace KNOWN_FACTIONS; add CIVTYPE_TO_FACTION; fix building stacking |
| Modify   | `tests/renderer/sprite-overlay.test.ts`           | Add wrapper-size regression catching future hardcoding                |
| Modify   | `tests/renderer/unit-renderer-overlay.test.ts`    | Real civType IDs; faction-mapping coverage; building stacking coverage |
| Modify   | `.claude/rules/sprites.md`                        | Prevention rules for sizing contract and faction↔civType contract      |

---

## Root Cause Reference

**RC1 — Hardcoded 128px wrapper** (affects issues #339, #340, #341):
- `sprite-overlay.ts:124`: wrapper div uses `width:128px;height:128px` unconditionally
- The DOM overlay container applies `scale(camera.zoom) translate(...)`, so child widths are in world coordinates (pre-zoom). At zoom=1: DOM sprites render at 128 screen px; canvas renders units at `hexSize × 0.9 = 28.8` screen px → 4.4× mismatch
- When a moving unit switches from DOM to canvas rendering, the visible size shrinks suddenly (#339)
- Building SVGs embed a `<div class="cq-sprite-label">` div; without `overflow:hidden` the label bleeds below the wrapper (#341)
- `buildBuildingEntities` emits one entity per building, all at `city.position` → unreadable pile (#340)

**RC2 — Faction name/civType disconnect** (issue #338):
- `KNOWN_FACTIONS = new Set(['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate'])` — these are internal sprite palette names, not game civType IDs
- Real CivDefinition ids are `rome`, `egypt`, `england`, etc. — none match KNOWN_FACTIONS
- All civs fall through to the `'imperials'` fallback → every civ renders red regardless of player color
- Existing tests used the legacy names directly, masking the bug

---

## Task 1: Fix sprite wrapper sizing and overflow in sprite-overlay.ts

**Files:**
- Modify: `src/renderer/sprite-overlay.ts` — add export constant + fix wrapper cssText

**Background:** The DOM overlay container is `scale(camera.zoom)`, so child sizes are in world units (not screen pixels). The correct world-space width for a sprite wrapper is `camera.hexSize × FACTOR` — at `hexSize=32` and `FACTOR=2`, this gives a 64 world-unit wrapper, which at the design zoom of ~2× renders at the native 128px sprite width. Adding `overflow:hidden` clips the embedded `.cq-sprite-label` divs in building SVGs.

- [ ] **Step 1: Write the failing wrapper-size regression test first**

Open `tests/renderer/sprite-overlay.test.ts`. Add this import at the top of the file, after the existing imports:

```typescript
import { SPRITE_OVERLAY_WORLD_SIZE_FACTOR } from '@/renderer/sprite-overlay';
```

Add this new `describe` block at the very end of the file (after the `invalidateFaction` block):

```typescript
// ── Wrapper sizing ────────────────────────────────────────────────────────────

describe('sync() wrapper sizing', () => {
  it('wrapper width is hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR, not hardcoded 128px', () => {
    const { overlay, mount } = mountOverlay();
    const hexSize = 32;
    overlay.sync(cam({ zoom: 1, hexSize }), [entity()], MAP, OPTS);
    const wrapper = mount.querySelector('.cq-sprite-wrap')?.parentElement as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    const expectedPx = `${hexSize * SPRITE_OVERLAY_WORLD_SIZE_FACTOR}px`;
    expect(wrapper!.style.width).toBe(expectedPx);
    expect(wrapper!.style.height).toBe(expectedPx);
  });

  it('wrapper has overflow:hidden', () => {
    const { overlay, mount } = mountOverlay();
    overlay.sync(cam({ zoom: 1 }), [entity()], MAP, OPTS);
    const wrapper = mount.querySelector('.cq-sprite-wrap')?.parentElement as HTMLElement | null;
    expect(wrapper!.style.overflow).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/sprite-overlay.test.ts 2>&1 | tail -20
```

Expected: FAIL — `SPRITE_OVERLAY_WORLD_SIZE_FACTOR` not exported yet, wrapper is `128px`, no overflow.

- [ ] **Step 3: Export the sizing constant from sprite-overlay.ts**

Open `src/renderer/sprite-overlay.ts`. After the last import line (line 10, `import type { HexCoord } from '@/core/types';`), add:

```typescript
/**
 * Sprite wrappers live in world-space (sizes are in pre-zoom units).
 * Container: scale(camera.zoom) translate(...) — children sized in world units.
 * At zoom = BUILDING_SPRITE_SIZE / (hexSize * SPRITE_OVERLAY_WORLD_SIZE_FACTOR),
 * building sprites (192px native) render at their design size.
 * Unit sprites (128px native) render closest to native around zoom ≈ 2.
 */
export const SPRITE_OVERLAY_WORLD_SIZE_FACTOR = 2;
```

- [ ] **Step 4: Fix the wrapper cssText to use the constant**

In `src/renderer/sprite-overlay.ts`, find the `// Pool miss — create element` block (around line 114). Replace:

```typescript
          const wrapper = document.createElement('div');
          wrapper.style.cssText =
            `position:absolute;width:128px;height:128px;` +
            `transform:translate(-50%,-50%);left:${px.x}px;top:${px.y}px`;
```

With:

```typescript
          const wrapper = document.createElement('div');
          const wrapSizePx = camera.hexSize * SPRITE_OVERLAY_WORLD_SIZE_FACTOR;
          wrapper.style.cssText =
            `position:absolute;width:${wrapSizePx}px;height:${wrapSizePx}px;overflow:hidden;` +
            `transform:translate(-50%,-50%);left:${px.x}px;top:${px.y}px`;
```

- [ ] **Step 5: Run the sprite-overlay tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/sprite-overlay.test.ts 2>&1 | tail -20
```

Expected: all pass, including the two new wrapper-size tests.

- [ ] **Step 6: Run the build to confirm no type errors**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/sprite-overlay.ts tests/renderer/sprite-overlay.test.ts
git commit -m "fix(renderer): derive DOM sprite wrapper size from hexSize; add overflow:hidden

Fixes #339 (unit shrink when movement ends — DOM→canvas size mismatch).
Fixes #341 (building label text bleeding below sprite wrapper).
SPRITE_OVERLAY_WORLD_SIZE_FACTOR=2 keeps wrappers in world-space units.
Regression test verifies width is never hardcoded."
```

---

## Task 2: Fix render-loop.ts — faction mapping and building stacking

**Files:**
- Modify: `src/renderer/render-loop.ts:22-24` — replace KNOWN_FACTIONS
- Modify: `src/renderer/render-loop.ts:26-48` — fix buildBuildingEntities stacking
- Modify: `src/renderer/render-loop.ts:64-65` — apply civTypeToFaction in buildUnitEntities

**Background:** Both bugs live in `render-loop.ts`. Fix them together to avoid a broken intermediate state where `buildBuildingEntities` references `civTypeToFaction` before it's defined.

- [ ] **Step 8: Write failing tests for CIVTYPE_TO_FACTION and building stacking**

Open `tests/renderer/unit-renderer-overlay.test.ts`.

At line 2, change the import to also bring in `buildBuildingEntities`, `CIVTYPE_TO_FACTION`, and `civTypeToFaction`:

```typescript
import { buildUnitEntities, buildBuildingEntities, CIVTYPE_TO_FACTION, civTypeToFaction } from '@/renderer/render-loop';
```

At line 3, add the CIV_DEFINITIONS import:

```typescript
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import type { City } from '@/core/types';
```

Replace the `makeState` function (lines 11–24) with the following updated version that uses real civType IDs:

```typescript
function makeState(units: Unit[], visMap: VisibilityMap = { tiles: {} }): GameState {
  return {
    currentPlayer: 'player1',
    units: Object.fromEntries(units.map(u => [u.id, u])),
    cities: {},
    civilizations: {
      'player1': { id: 'player1', color: '#b53026', civType: 'rome',    visibility: visMap } as any,
      'player2': { id: 'player2', color: '#1d4a8c', civType: 'england', visibility: { tiles: {} as Record<string, any> } } as any,
      'player3': { id: 'player3', color: '#888888', civType: 'unknown_faction', visibility: { tiles: {} as Record<string, any> } } as any,
    },
    espionage: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false } as any,
    minorCivs: {},
  } as unknown as GameState;
}
```

Add a helper for city-based tests after `makeUnit`:

```typescript
function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'c1', name: 'Rome', owner: 'player1',
    position: { q: 0, r: 0 },
    buildings: [],
    productionQueue: [],
    population: 1, food: 0, production: 0, gold: 0, science: 0,
    ...overrides,
  } as unknown as City;
}

function makeStateWithCities(cities: City[]): GameState {
  return {
    currentPlayer: 'player1',
    units: {},
    cities: Object.fromEntries(cities.map(c => [c.id, c])),
    civilizations: {
      'player1': { id: 'player1', color: '#b53026', civType: 'rome', visibility: { tiles: {} } } as any,
    },
    espionage: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false } as any,
    minorCivs: {},
  } as unknown as GameState;
}
```

Update the comment inside the `'uses owner faction not viewer faction'` test (around line 70):

```typescript
    // player2 civType = 'england' → maps to 'vikings' via CIVTYPE_TO_FACTION
```

(The assertion `expect(entity?.faction).toBe('vikings')` stays the same — just update the comment.)

Now add the two new describe blocks at the bottom of the file:

```typescript
describe('civTypeToFaction', () => {
  it('maps rome to imperials', () => expect(civTypeToFaction('rome')).toBe('imperials'));
  it('maps egypt to pharaohs', () => expect(civTypeToFaction('egypt')).toBe('pharaohs'));
  it('maps greece to hellenes', () => expect(civTypeToFaction('greece')).toBe('hellenes'));
  it('maps england to vikings', () => expect(civTypeToFaction('england')).toBe('vikings'));
  it('maps mongolia to khanate', () => expect(civTypeToFaction('mongolia')).toBe('khanate'));
  it('maps japan to shogunate', () => expect(civTypeToFaction('japan')).toBe('shogunate'));
  it('falls back to imperials for unknown civType', () => expect(civTypeToFaction('atlantis')).toBe('imperials'));

  it('every CivDefinition.id appears explicitly in CIVTYPE_TO_FACTION (no silent fallback for real civs)', () => {
    const missing = CIV_DEFINITIONS.filter(d => !(d.id in CIVTYPE_TO_FACTION));
    expect(missing.map(d => d.id)).toEqual([]);
  });
});

describe('buildBuildingEntities', () => {
  const allVisible: VisibilityMap = { tiles: { '0,0': 'visible' } } as any;

  it('emits at most 1 entity per city even when city has multiple buildings', () => {
    const city = makeCity({ buildings: ['granary', 'barracks', 'library'] });
    const state = makeStateWithCities([city]);
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities.filter(e => e.id.startsWith('c1:')).length).toBe(1);
  });

  it('picks the last completed building', () => {
    const city = makeCity({ buildings: ['granary', 'barracks'] });
    const state = makeStateWithCities([city]);
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities[0]?.subtype).toBe('barracks');
  });

  it('emits 0 entities for a city with no buildings', () => {
    const city = makeCity({ buildings: [] });
    const state = makeStateWithCities([city]);
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities.filter(e => e.id.startsWith('c1:')).length).toBe(0);
  });

  it('skips cities not visible to viewer', () => {
    const city = makeCity({ buildings: ['granary'], position: { q: 5, r: 5 } });
    const state = makeStateWithCities([city]);
    const fogMap: VisibilityMap = { tiles: { '5,5': 'fog' } } as any;
    const entities = buildBuildingEntities(state, fogMap);
    expect(entities.length).toBe(0);
  });

  it('uses civTypeToFaction for city owner', () => {
    const city = makeCity({ buildings: ['granary'] });
    const state = makeStateWithCities([city]); // player1 has civType 'rome'
    const entities = buildBuildingEntities(state, allVisible);
    expect(entities[0]?.faction).toBe('imperials'); // rome → imperials
  });
});
```

- [ ] **Step 9: Run the new tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/unit-renderer-overlay.test.ts 2>&1 | tail -30
```

Expected: FAIL — `CIVTYPE_TO_FACTION`, `civTypeToFaction`, and `buildBuildingEntities` are not yet exported from `render-loop.ts` with the new signatures.

- [ ] **Step 10: Replace KNOWN_FACTIONS with CIVTYPE_TO_FACTION in render-loop.ts**

In `src/renderer/render-loop.ts`, replace lines 22–24:

```typescript
const KNOWN_FACTIONS = new Set([
  'imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate',
]);
```

With:

```typescript
export const CIVTYPE_TO_FACTION: Record<string, string> = {
  // Ancient Mediterranean
  egypt:    'pharaohs',
  greece:   'hellenes',
  rome:     'imperials',
  babylon:  'pharaohs',
  persia:   'pharaohs',
  // Northern European
  england:  'vikings',
  germany:  'imperials',
  france:   'imperials',
  gondor:   'imperials',
  rohan:    'imperials',
  // East / Central Asian
  mongolia: 'khanate',
  china:    'khanate',
  japan:    'shogunate',
  india:    'khanate',
  // Sub-Saharan / Mesoamerican
  zulu:     'imperials',
  aztec:    'imperials',
};

export function civTypeToFaction(civType: string): string {
  return CIVTYPE_TO_FACTION[civType] ?? 'imperials';
}
```

- [ ] **Step 11: Fix buildBuildingEntities to emit at most 1 entity per city**

In `src/renderer/render-loop.ts`, replace the full `buildBuildingEntities` function (currently lines 26–48):

```typescript
export function buildBuildingEntities(
  state: GameState,
  viewerVisibility: VisibilityMap,
): SpriteEntity[] {
  const entities: SpriteEntity[] = [];
  for (const city of Object.values(state.cities)) {
    if (getVisibility(viewerVisibility, city.position) !== 'visible') continue;
    // Use the CITY OWNER's civType — enemy cities use their owner's faction colors
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

With:

```typescript
export function buildBuildingEntities(
  state: GameState,
  viewerVisibility: VisibilityMap,
): SpriteEntity[] {
  const entities: SpriteEntity[] = [];
  for (const city of Object.values(state.cities)) {
    if (getVisibility(viewerVisibility, city.position) !== 'visible') continue;
    if (city.buildings.length === 0) continue;

    // Use the CITY OWNER's civType — enemy cities use their owner's faction colors
    const ownerCivType = state.civilizations[city.owner]?.civType ?? 'generic';
    const faction = civTypeToFaction(ownerCivType);

    // Show only the most recently completed building — stacking all buildings at city.position is unreadable
    const buildingId = city.buildings[city.buildings.length - 1];
    entities.push({
      id: `${city.id}:${buildingId}`,
      kind: 'building',
      subtype: buildingId,
      coord: city.position,
      state: 'idle',
      faction,
    });
  }
  return entities;
}
```

- [ ] **Step 12: Apply civTypeToFaction in buildUnitEntities**

In `src/renderer/render-loop.ts`, find the `.map(u => {...})` inside `buildUnitEntities` (around line 62–74). Change:

```typescript
      const civType = state.civilizations[u.owner]?.civType ?? 'generic';
      const faction = KNOWN_FACTIONS.has(civType) ? civType : 'imperials';
```

To:

```typescript
      const civType = state.civilizations[u.owner]?.civType ?? 'generic';
      const faction = civTypeToFaction(civType);
```

- [ ] **Step 13: Run the renderer tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/renderer/ 2>&1 | tail -30
```

Expected: all pass, including the new `civTypeToFaction` and `buildBuildingEntities` tests.

- [ ] **Step 14: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: all pass, no regressions.

- [ ] **Step 15: Run the build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 16: Commit**

```bash
git add src/renderer/render-loop.ts tests/renderer/unit-renderer-overlay.test.ts
git commit -m "fix(renderer): CIVTYPE_TO_FACTION replaces KNOWN_FACTIONS; 1 building per city

Fixes #338 (all civs showing red imperials palette — real civType IDs now map to
correct faction palette names).
Fixes #340 (building sprites stacking unreadably — max 1 entity per city).
Exports CIVTYPE_TO_FACTION and civTypeToFaction for test coverage.
Tests use real CivDefinition ids (rome, england) not legacy palette names."
```

---

## Task 3: Add prevention rules to .claude/rules/sprites.md

**Files:**
- Modify: `.claude/rules/sprites.md`

**Background:** Both root causes slipped through because no rules prohibited hardcoded wrapper sizes or phantom civType names in faction sets. Adding explicit rules here causes the `check-src-edit` post-edit hook to catch future regressions in the same turn they're introduced.

- [ ] **Step 17: Add the prevention rules**

Open `.claude/rules/sprites.md`. Find the end of the **Hard Rules** section — it ends just before `## Catalog Test Contract`. Insert the following two rule blocks immediately before `## Catalog Test Contract`:

```markdown
**Sprite overlay sizing:**
- NEVER hardcode a pixel size for the DOM sprite wrapper in `sprite-overlay.ts`. Wrapper size MUST be derived from `camera.hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR`.
- Relationship: the container applies `scale(zoom)` and children are in world units. At `zoom = BUILDING_SPRITE_SIZE / (hexSize * SPRITE_OVERLAY_WORLD_SIZE_FACTOR)`, building sprites render at their native 192px design size.
- The `check-src-edit` hook must flag any `width:128px` or `height:128px` literal appearing in `sprite-overlay.ts`.

**Faction ↔ civType contract:**
- `CIVTYPE_TO_FACTION` in `render-loop.ts` MUST use real `CivDefinition.id` values as keys (`rome`, `egypt`, `england`, etc.) — never internal sprite palette names (`imperials`, `vikings`, etc.) as keys.
- When adding a new `CivDefinition` to `civ-definitions.ts`, add a corresponding entry to `CIVTYPE_TO_FACTION` in `render-loop.ts`.
- Tests that exercise faction resolution MUST use real civType IDs. The `every CivDefinition.id appears explicitly in CIVTYPE_TO_FACTION` test must stay passing — never weaken it.
```

- [ ] **Step 18: Run the full test suite one final time**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 19: Run the production build one final time**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | tail -10
```

Expected: exits 0.

- [ ] **Step 20: Commit**

```bash
git add .claude/rules/sprites.md
git commit -m "docs(rules): prevent hardcoded sprite wrapper sizes and civType/faction name confusion

Adds two new Hard Rules to sprites.md:
- Sprite overlay sizing: wrapper width must derive from hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR
- Faction ↔ civType contract: CIVTYPE_TO_FACTION keys must be real CivDefinition ids"
```

---

## Self-Review

**Spec coverage:**
- **#338** (all civs show red): `CIVTYPE_TO_FACTION` covers all 16 real CivDefinition ids; `civTypeToFaction` applied in both `buildUnitEntities` and `buildBuildingEntities`. Test verifies every real id has an explicit entry. ✓
- **#339** (unit shrinks when it stops moving): wrapper is now `hexSize × SPRITE_OVERLAY_WORLD_SIZE_FACTOR` world-units, closing the canvas↔DOM size gap. ✓
- **#340** (unreadable building pile): `buildBuildingEntities` emits ≤1 entity per city (last completed building). ✓
- **#341** (label text below city sprite): `overflow:hidden` on wrapper clips embedded `.cq-sprite-label` div. ✓

**Placeholder scan:** No TODOs, TBDs, or "implement later" in any step. ✓

**Dependency order:** Task 1 (sprite-overlay) is independent. Task 2 defines `civTypeToFaction` before `buildBuildingEntities` uses it in the same file edit — no forward-reference issue. Task 3 (rules) comes last since it's documentation only. ✓

**Type consistency:** `CIVTYPE_TO_FACTION: Record<string, string>` and `civTypeToFaction(civType: string): string` defined in step 10, used in steps 11 and 12, imported in test step 8. Consistent throughout. ✓

**What is NOT changed:**
- `scripts/serialize-sprites.mjs` — out of scope; pre-baked SVG files are correct
- SVG sprite design files in `src/renderer/sprites/v2/`
- `camera.hexSize` (always 32 — constant)
- Canvas rendering path in `unit-renderer.ts`, `city-renderer.ts`, `city-render-passes.ts`
- Building sprite appearance in city panels or production badges (v1 canvas system)
