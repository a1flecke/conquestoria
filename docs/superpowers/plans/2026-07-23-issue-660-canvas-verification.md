# Issue #660 Canvas Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, renderer-aware Canvas 2D verification while eliminating city-badge glyph and layout drift without exposing test controls in production builds.

**Architecture:** Keep production additions narrow: a pure badge-presentation module, sprite metadata, viewer-safe renderer geometry queries, and an e2e runtime dynamically imported behind a literal Vite mode check. Keep fixture mutation and canvas interception in typed Playwright helpers, then migrate the existing browser specs and add one focused production-badge suite. Build-time and source-use sentinels keep the e2e seam and dormant v2 building catalog from becoming accidental production APIs.

**Tech Stack:** TypeScript 5.9, Canvas 2D, Vite 8, Vitest 4, Playwright 1.59, Node.js scripts, Yarn 4.

**Approved design:** `docs/superpowers/specs/2026-07-22-issue-660-canvas-verification-design.md`

---

## File Structure

### Production source

- Create `src/renderer/city-badge-presentation.ts`: semantic badge glyph registry, named slots, normalized bounds, and coexistence rules.
- Modify `src/renderer/city-render-passes.ts`: consume the shared glyph/layout contract and use the generic production fallback.
- Modify `src/renderer/city-renderer.ts`: export viewer-safe render-item geometry queries built from the live renderer projection.
- Modify `src/renderer/sprites/sprite-loader.ts`: attach stable catalog metadata and expose the existing sprite-load promise to startup.
- Create `src/testing/e2e-mode.ts`: pure exact-query predicate.
- Create `src/testing/e2e-runtime.ts`: gated read-only readiness and renderer-geometry diagnostics.
- Modify `src/main.ts`: literal e2e mode branch, canonical autosave entry, readiness reporting, and renderer-owned query closures.
- Modify `src/vite-env.d.ts`: type the read-only e2e diagnostic only; do not add mutation or capture APIs.

### Test harness and browser coverage

- Create `tests/e2e/helpers/save-fixture.ts`: fresh-clone fixture loading, typed transforms, direct/UI installation, and valid production scenarios.
- Create `tests/e2e/helpers/campaign-entry.ts`: direct and live-Continue campaign entry plus named readiness waits.
- Create `tests/e2e/helpers/canvas-ops.ts`: dormant bounded capture probe, typed operations, filtering, frame synchronization, and freeze.
- Create `tests/e2e/helpers/render-geometry.ts`: typed wrappers over renderer-owned visible-copy and badge-slot queries.
- Create `tests/e2e/production-badges.spec.ts`: building, unit, and legendary-wonder Canvas assertions.
- Create `tests/e2e/campaign-entry-smoke.spec.ts`: real Continue-button integration.
- Modify `tests/e2e/issue-365-map-presentation.spec.ts`, `tests/e2e/issue-437-hud-alignment.spec.ts`, and `tests/e2e/issue-447-water-recovery.spec.ts`: remove copied fixture/entry/sleep/hex helpers.

### Unit, architecture, and build tests

- Create `tests/renderer/city-badge-presentation.test.ts`.
- Modify `tests/renderer/city-render-passes.test.ts`, `tests/renderer/city-renderer.test.ts`, and `tests/renderer/camera.test.ts`.
- Modify `tests/renderer/sprites/sprite-loader.test.ts` and `tests/renderer/sprites/sprite-catalog.test.ts`.
- Create `tests/testing/e2e-mode.test.ts`, `tests/testing/e2e-runtime.test.ts`, `tests/e2e/helpers/save-fixture.test.ts`, and `tests/e2e/helpers/canvas-ops.test.ts`.
- Create `tests/architecture/e2e-source-guard.test.ts` and `tests/architecture/v2-building-consumer.test.ts`.
- Modify `tests/platform/playwright-config.test.ts`, `tests/main.integration.test.ts`, and `tests/systems/city-system.test.ts`.
- Create `scripts/assert-no-e2e-runtime.mjs` and `tests/scripts/assert-no-e2e-runtime.test.ts`.
- Modify `playwright.config.ts` and `package.json`.

### Documentation

- Create `docs/testing/canvas-render-verification.md`.
- Modify `.claude/rules/ui-panels.md`.

## Player Truth Table

| Before | Action or transition | Internal result | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Granary is active while its sprite loads | A sprite frame finishes loading | Cache gains the granary image; queue is unchanged | Map changes from `🏗️` to the granary sprite on a later frame | Granary name, icon, progress, order, and ETA in the city panel |
| Warrior is active and the city is under siege | Renderer draws the city | No gameplay state changes | Production sprite or `🏗️` and separate `⚔️` status badge appear in disjoint slots | Full production catalog and existing queue controls |
| Standing Stones is active | Renderer draws an intentionally unsprited item | No gameplay state changes | `🏗️` appears in the production slot | Existing legendary-wonder label and queue details |
| Queue is empty with gold/science idle conversion | Renderer draws the city | No gameplay state changes | Existing idle glyph occupies the production/idle slot | Existing idle-production controls |
| Modern solo autosave is installed | Player clicks real `Continue` | Canonical load/normalization enters the campaign | Save panel closes and canvas campaign is visible | New Game, exact save rows, imports, and legacy challenge flow |

## Misleading UI Risks

- `🏗️` means “city production is active but no catalog sprite is being drawn,” not the identity of the queued item. The city panel must continue to show the specific item identity and timing.
- `sprites-ready` means every requested catalog image load fulfilled. It must not be reported after a rejected load, and campaign entry must remain usable with fallback art after that rejection.
- A badge slot query means the city is actually rendered for the current viewer. Last-seen or hidden richer state must not be exposed as a live city result.
- A captured `drawImage` is evidence only when it completed successfully and has matching stable sprite metadata; blob URLs and arbitrary image identity are not semantic evidence.
- The v2 building catalog remains dormant. Existing assets resolving successfully must not be described as a live map or panel integration.

## Interaction Replay Checklist

- Click the real Continue button once and verify the campaign appears.
- Reopen browser state in a fresh Playwright context and use direct entry; no prior runtime or capture state may leak.
- Start, freeze, and start a second canvas capture; sequence/session state must reset.
- Repeat HUD expand/collapse after helper migration to prove stale locators were not introduced.
- Select a stacked unit, perform blocked recovery, then click the valid recovery tile using renderer-owned geometry.
- Re-run the mobile/reduced-motion entry with viewport and media preferences set before navigation.

## Queue and ETA Checklist

- Active item remains the first visible item in the existing city panel.
- Follow-up items remain in their existing order; this feature performs no queue mutation.
- Existing progress and ETA text must remain visible and unchanged.
- Existing reorder/remove behavior and invalid-item handling remain owned by the city panel and city system.
- The renderer tests must snapshot the queue before and after every badge pass and prove presentation is state-pure.

## Cross-Cutting Regression Matrix

| Concern | Proof required by this plan |
|---|---|
| Balance, pacing, and new mechanics | Renderer tests deep-compare gameplay state before/after badge passes; the committed diff contains no definition, economy, combat, movement, research, crisis, AI-scoring, or turn-processing change. |
| Fun, ages, and play styles | Simultaneous meanings are distinct and non-overlapping; the production browser test opens the real city panel and verifies the specific name and turns remaining remain readable. Full catalog and queue interaction tests stay green. |
| Difficulty | Runtime tests accept `explorer`, `standard`, and `veteran` unchanged; identical visible state produces identical badge operations across the three values. |
| Computer players | AI/rival queue items do not render as player production badges. No `src/ai/**` file changes, and sprite preloading exposes catalog identity only—not AI state. |
| Solo and hot seat | Direct entry covers solo saves only. Unit/integration tests switch hot-seat `currentPlayer`, preserve handoff, and prove production visibility follows the active seat. |
| UI, UX, and reduced motion | Desktop and mobile bounds, reduced motion before navigation, DOM production identity, viewer privacy, and no color/audio-only meaning. |
| Architecture and extensibility | Typed registry/slots, shared loader metadata, viewer-safe serialized geometry, bounded Playwright-owned capture, literal tree-shaken mode gate, and v2 consumer sentinel. |
| Data and saved games | Relationship-based catalog assertions, fresh fixture clones, valid canonical wonder transition, no save schema change, normalized load path, and no write/mutation on rejected direct entry. |
| SFX | New presentation/testing modules import no audio/SFX modules; render and readiness transitions call no audio, notification, event-bus, or state mutation function. Existing `startGame()` remains the sole campaign audio startup path. |

---

### Task 1: Secure the e2e mode and production-bundle boundary

**Files:**
- Create: `src/testing/e2e-mode.ts`
- Create: `tests/testing/e2e-mode.test.ts`
- Create: `scripts/assert-no-e2e-runtime.mjs`
- Create: `tests/scripts/assert-no-e2e-runtime.test.ts`
- Modify: `playwright.config.ts`
- Modify: `tests/platform/playwright-config.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing exact-gate tests**

```ts
import { describe, expect, it } from 'vitest';
import { isExactAutosaveE2ERequest } from '@/testing/e2e-mode';

describe('isExactAutosaveE2ERequest', () => {
  it.each([
    ['production', '?e2e=autosave'],
    ['development', '?e2e=autosave'],
    ['tauri', '?e2e=autosave'],
    ['e2e', ''],
    ['e2e', '?e2e=true'],
    ['e2e', '?e2e=autosave&state={}'],
  ])('rejects mode %s and query %s', (mode, search) => {
    expect(isExactAutosaveE2ERequest(mode, search)).toBe(false);
  });

  it('accepts only the literal e2e autosave request', () => {
    expect(isExactAutosaveE2ERequest('e2e', '?e2e=autosave')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/testing/e2e-mode.test.ts`

Expected: FAIL because `src/testing/e2e-mode.ts` does not exist.

- [ ] **Step 3: Add the minimal pure gate**

```ts
export function isExactAutosaveE2ERequest(mode: string, search: string): boolean {
  return mode === 'e2e' && search === '?e2e=autosave';
}
```

- [ ] **Step 4: Write the bundle-sentinel script tests**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoE2ERuntime } from '../../scripts/assert-no-e2e-runtime.mjs';

it('accepts emitted assets without the sentinel', () => {
  const root = mkdtempSync(join(tmpdir(), 'cq-e2e-clean-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log("ok")');
  expect(() => assertNoE2ERuntime(root)).not.toThrow();
});

it('rejects a sentinel in emitted JavaScript or source maps', () => {
  const root = mkdtempSync(join(tmpdir(), 'cq-e2e-leak-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'app.js'), 'window.__CONQUESTORIA_E2E_DIAGNOSTICS__');
  expect(() => assertNoE2ERuntime(root)).toThrow(/e2e runtime sentinel/i);
});
```

- [ ] **Step 5: Implement the emitted-file scanner**

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const E2E_SENTINEL = '__CONQUESTORIA_E2E_DIAGNOSTICS__';

export function assertNoE2ERuntime(root) {
  const visit = path => {
    for (const name of readdirSync(path)) {
      const child = resolve(path, name);
      if (statSync(child).isDirectory()) visit(child);
      else if ((name.endsWith('.js') || name.endsWith('.map'))
        && readFileSync(child, 'utf8').includes(E2E_SENTINEL)) {
        throw new Error(`e2e runtime sentinel leaked into ${child}`);
      }
    }
  };
  visit(resolve(root));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertNoE2ERuntime(process.argv[2] ?? 'dist');
}
```

- [ ] **Step 6: Put Playwright in e2e mode and chain both bundle checks**

```ts
export function resolvePlaywrightDevCommand(ci = process.env.CI): string {
  return ci
    ? 'yarn dev --mode e2e --host 127.0.0.1'
    : './scripts/run-with-mise.sh yarn dev --mode e2e --host 127.0.0.1';
}
```

```json
{
  "build": "tsc && vite build && node scripts/version-sw-cache.mjs && node scripts/assert-no-e2e-runtime.mjs dist",
  "build:tauri": "tsc && vite build --mode tauri && node scripts/assert-no-e2e-runtime.mjs dist"
}
```

Update `tests/platform/playwright-config.test.ts` to expect both commands with `--mode e2e`.

- [ ] **Step 7: Run the focused tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/testing/e2e-mode.test.ts tests/scripts/assert-no-e2e-runtime.test.ts tests/platform/playwright-config.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/testing/e2e-mode.ts tests/testing/e2e-mode.test.ts scripts/assert-no-e2e-runtime.mjs tests/scripts/assert-no-e2e-runtime.test.ts playwright.config.ts tests/platform/playwright-config.test.ts package.json
git commit -m "test(e2e): gate canvas diagnostics from production"
```

### Task 2: Centralize city-badge meanings and collision-free geometry

**Files:**
- Create: `src/renderer/city-badge-presentation.ts`
- Create: `tests/renderer/city-badge-presentation.test.ts`
- Modify: `src/renderer/city-render-passes.ts`
- Modify: `tests/renderer/city-render-passes.test.ts`

- [ ] **Step 1: Write failing glyph and coexistence tests**

```ts
import { Camera } from '@/renderer/camera';
import {
  CITY_BADGE_GLYPHS,
  CITY_BADGE_GLYPH_COEXISTENCE,
  CITY_BADGE_SLOT_COEXISTENCE,
  getCityBadgeLayout,
  type BadgeBounds,
} from '@/renderer/city-badge-presentation';

const intersects = (a: BadgeBounds, b: BadgeBounds) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

it('keeps simultaneous text meanings distinct', () => {
  expect(CITY_BADGE_GLYPHS.production).toBe('🏗️');
  expect(CITY_BADGE_GLYPHS.production).not.toBe(CITY_BADGE_GLYPHS.underSiege);
  for (const [left, right] of CITY_BADGE_GLYPH_COEXISTENCE) {
    expect(CITY_BADGE_GLYPHS[left], `${left}/${right}`)
      .not.toBe(CITY_BADGE_GLYPHS[right]);
  }
});

it('keeps every coexistent slot disjoint at normalized and camera zoom sizes', () => {
  const camera = new Camera();
  for (const size of [1, camera.hexSize * camera.minZoom, camera.hexSize * camera.maxZoom]) {
    const layout = getCityBadgeLayout({ x: 0, y: 0 }, size);
    for (const [left, right] of CITY_BADGE_SLOT_COEXISTENCE) {
      expect(intersects(layout[left].bounds, layout[right].bounds), `${left}/${right}@${size}`)
        .toBe(false);
    }
  }
});

it('does not classify production/idle or individual status meanings as coexistent', () => {
  expect(CITY_BADGE_SLOT_COEXISTENCE).not.toContainEqual(['production', 'idle']);
  expect(CITY_BADGE_GLYPH_COEXISTENCE).not.toContainEqual(['underSiege', 'unrest']);
});
```

- [ ] **Step 2: Run the test and verify the missing module fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/city-badge-presentation.test.ts`

Expected: FAIL because the presentation module does not exist.

- [ ] **Step 3: Implement the semantic registry and named layout**

```ts
export const CITY_BADGE_GLYPHS = {
  underSiege: '⚔️',
  breakawaySecession: '⛓',
  breakawayEstablished: '👑',
  occupationSevere: '☹',
  occupation: '⚡',
  unrestSevere: '🔥',
  unrest: '⚡',
  production: '🏗️',
  idleGold: '💰',
  idleScience: '🔬',
  embeddedIntel: '🛡',
  infiltratedIntel: '👁',
  worldPressure: '⚠️',
  loyaltyPressure: '🙏',
} as const;

export type CityBadgeSlot =
  | 'status' | 'production' | 'idle' | 'leftIntel' | 'rightIntel'
  | 'worldPressure' | 'loyaltyPressure' | 'religion';

export type CityBadgeGlyphMeaning = keyof typeof CITY_BADGE_GLYPHS;

export const CITY_BADGE_GLYPH_COEXISTENCE: ReadonlyArray<
  readonly [CityBadgeGlyphMeaning, CityBadgeGlyphMeaning]
> = [
  ['production', 'underSiege'],
  ['production', 'breakawaySecession'],
  ['production', 'breakawayEstablished'],
  ['production', 'occupationSevere'],
  ['production', 'occupation'],
  ['production', 'unrestSevere'],
  ['production', 'unrest'],
  ['production', 'worldPressure'],
  ['production', 'loyaltyPressure'],
];

export const CITY_BADGE_SLOT_COEXISTENCE: ReadonlyArray<readonly [CityBadgeSlot, CityBadgeSlot]> = [
  ['status', 'production'],
  ['status', 'worldPressure'],
  ['status', 'loyaltyPressure'],
  ['production', 'worldPressure'],
  ['production', 'religion'],
  ['worldPressure', 'loyaltyPressure'],
  ['worldPressure', 'religion'],
  ['loyaltyPressure', 'religion'],
];

export function getCityBadgeLayout(screen: { x: number; y: number }, size: number) {
  const bounds = (x: number, y: number, width: number, height: number): BadgeBounds => ({
    x, y, width, height,
    left: x, right: x + width, top: y, bottom: y + height,
  });
  const slot = (dx: number, dy: number, width = 0.28, height = 0.28) => {
    const center = { x: screen.x + size * dx, y: screen.y + size * dy };
    const x = center.x - size * width / 2;
    const y = center.y - size * height / 2;
    return {
      center,
      bounds: bounds(x, y, size * width, size * height),
    };
  };
  return {
    status: slot(0.62, -0.40),
    production: slot(-0.62, -0.40, 0.32, 0.32),
    idle: slot(-0.62, -0.40),
    leftIntel: slot(-0.52, 0.04),
    rightIntel: slot(0.52, 0.04),
    worldPressure: slot(0, -0.70, 0.32, 0.32),
    loyaltyPressure: slot(0.52, -0.70, 0.32, 0.32),
    religion: slot(-0.52, -0.70, 0.32, 0.32),
  } as const;
}
```

```ts
export interface BadgeBounds {
  x: number; y: number; width: number; height: number;
  left: number; right: number; top: number; bottom: number;
}
```

- [ ] **Step 4: Refactor every affected pass to the registry/layout**

```ts
export function getProductionBadgeIcon(
  city: { productionQueue: string[] },
): string | null {
  return city.productionQueue.length > 0 ? CITY_BADGE_GLYPHS.production : null;
}

const layout = getCityBadgeLayout(item.screen, item.size);
const { center } = layout.production;
const queueHead = item.city.productionQueue[0];
const spriteImage = spriteCache.getBuilding(queueHead, item.city.owner)
  ?? spriteCache.getUnit(queueHead as UnitType, item.city.owner);
if (spriteImage) {
  const { x, y, width, height } = layout.production.bounds;
  ctx.drawImage(spriteImage, x, y, width, height);
  return;
}
drawFittedText(
  ctx,
  getProductionBadgeIcon(item.city)!,
  center.x,
  center.y,
  layout.production.bounds.width,
  item.size * 0.28,
);
```

Apply `layout.status`, `layout.idle`, `layout.leftIntel`, `layout.rightIntel`,
`layout.worldPressure`, `layout.loyaltyPressure`, and `layout.religion` in their
respective passes. Preserve the existing mutually exclusive status selection and
all visibility/ownership checks.

- [ ] **Step 5: Update operations-log regressions**

Add cases proving:

```ts
expect(getProductionBadgeIcon({ productionQueue: ['granary'] })).toBe('🏗️');
expect(getProductionBadgeIcon({ productionQueue: ['warrior'] })).toBe('🏗️');
expect(getProductionBadgeIcon({ productionQueue: [] })).toBeNull();
expect(fallback.fillTextCalls[0]?.text).toBe('🏗️');
expect(cached.drawImageCalls).toHaveLength(1);
expect(cached.fillTextCalls).toHaveLength(0);
expect(wonder.fillTextCalls[0]?.text).toBe('🏗️');
expect(state.city.productionQueue).toEqual(queueBefore);
```

Deep-compare the complete input `CityRenderItem` before and after every badge pass.
Retain the existing exact status, world-pressure, loyalty, religion, and idle
assertions. `PRODUCTION_ICONS`, `PRODUCTION_ICON_FALLBACK`, and
`getProductionIconForItem()` remain untouched for the DOM city panel.

- [ ] **Step 6: Run renderer tests and source checks**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/renderer/city-badge-presentation.test.ts tests/renderer/city-render-passes.test.ts tests/renderer/city-renderer.test.ts
scripts/check-src-rule-violations.sh src/renderer/city-badge-presentation.ts src/renderer/city-render-passes.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/city-badge-presentation.ts src/renderer/city-render-passes.ts tests/renderer/city-badge-presentation.test.ts tests/renderer/city-render-passes.test.ts
git commit -m "fix(renderer): separate city badge meanings and bounds"
```

### Task 3: Add stable sprite metadata and observable loading

**Files:**
- Modify: `src/renderer/sprites/sprite-loader.ts`
- Modify: `tests/renderer/sprites/sprite-loader.test.ts`

- [ ] **Step 1: Write failing metadata tests**

```ts
import {
  initSprites,
  SPRITE_DIAGNOSTIC_METADATA_KEY,
  spriteCache,
  type SpriteDiagnosticMetadata,
} from '@/renderer/sprites/sprite-loader';

const readMetadata = (image: HTMLImageElement) =>
  (image as unknown as Record<symbol, Readonly<SpriteDiagnosticMetadata> | undefined>)[
    Symbol.for(SPRITE_DIAGNOSTIC_METADATA_KEY)
  ];

it('attaches stable building catalog metadata before load completion', async () => {
  const promise = initSprites({ civ: '#336699' });
  const created = imageConstructorSpy.mock.results[0]?.value as HTMLImageElement;
  expect(readMetadata(created)).toMatchObject({
    kind: 'building',
    itemId: expect.any(String),
    civilization: 'civ',
  });
  resolveAllImages();
  await promise;
});

it('identifies unit motion and neutral landmarks without state data', async () => {
  const loading = initSprites({ civ: '#336699' });
  resolveAllImages();
  await loading;
  const unit = spriteCache.getUnitMotion('warrior', 'civ', 'move-a');
  const landmark = spriteCache.getLandmark('pirate-headquarters');
  expect(readMetadata(unit!)).toEqual({
    kind: 'unit',
    itemId: 'warrior',
    civilization: 'civ',
    motion: 'move-a',
  });
  expect(readMetadata(landmark!)).toEqual({
    kind: 'landmark',
    itemId: 'pirate-headquarters',
    civilization: 'neutral',
  });
});

it('rejects when a catalog image fails instead of reporting sprites ready', async () => {
  const loading = initSprites({ civ: '#336699' });
  rejectOneImage();
  await expect(loading).rejects.toThrow('SVG image load failed');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-loader.test.ts`

Expected: FAIL because diagnostic metadata access is absent.

- [ ] **Step 3: Attach metadata when each image is created**

```ts
export interface SpriteDiagnosticMetadata {
  kind: 'unit' | 'building' | 'landmark';
  itemId: string;
  civilization: string;
  motion?: UnitSpriteMotion;
}

export const SPRITE_DIAGNOSTIC_METADATA_KEY = 'conquestoria.spriteDiagnostic';
const diagnosticMetadataSymbol = Symbol.for(SPRITE_DIAGNOSTIC_METADATA_KEY);

function svgStringToImage(
  svgString: string,
  size: number,
  metadata: SpriteDiagnosticMetadata,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(size, size);
    Object.defineProperty(img, diagnosticMetadataSymbol, {
      value: Object.freeze({ ...metadata }),
      enumerable: false,
      configurable: false,
      writable: false,
    });
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG image load failed')); };
    img.src = url;
  });
}
```

Pass `{ kind, itemId, civilization, motion }` at each unit, building, pirate,
and landmark call site. Do not attach URLs, owner state, visibility, or game data.

- [ ] **Step 4: Run tests and source checks**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-loader.test.ts
scripts/check-src-rule-violations.sh src/renderer/sprites/sprite-loader.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/sprite-loader.ts tests/renderer/sprites/sprite-loader.test.ts
git commit -m "test(renderer): identify catalog image draws"
```

### Task 4: Expose viewer-safe renderer geometry

**Files:**
- Modify: `src/renderer/city-renderer.ts`
- Modify: `tests/renderer/city-renderer.test.ts`
- Modify: `tests/renderer/camera.test.ts`

- [ ] **Step 1: Write failing geometry tests**

```ts
it('returns every visible wrapped copy through production projection', () => {
  const results = getVisibleHexViewportCopies(state, camera, state.currentPlayer, city.position);
  expect(results).not.toHaveLength(0);
  for (const result of results) {
    expect(wrapHexCoord(
      camera.screenToHex(result.x, result.y),
      state.map.width,
    )).toEqual(city.position);
  }
});

it('returns a named badge slot only for a live city rendered to the viewer', () => {
  expect(getVisibleCityBadgeSlots(state, camera, state.currentPlayer, city.id, 'production'))
    .not.toHaveLength(0);
  expect(getVisibleCityBadgeSlots(state, camera, state.currentPlayer, hiddenCity.id, 'production'))
    .toEqual([]);
});

it.each(['explorer', 'standard', 'veteran'] as const)(
  'keeps city presentation independent of %s difficulty',
  challenge => {
    const challenged = { ...state, opponentChallenge: challenge };
    expect(collectCityOperations(challenged, camera, challenged.currentPlayer))
      .toEqual(collectCityOperations(state, camera, state.currentPlayer));
  },
);

it('keeps rival AI production private', () => {
  const rivalCity = { ...city, owner: 'ai-1', productionQueue: ['warrior'] };
  const rivalState = {
    ...state,
    cities: { ...state.cities, [rivalCity.id]: rivalCity },
  };
  expect(collectProductionOperations(rivalState, camera, state.currentPlayer, rivalCity.id))
    .toEqual([]);
});

it('switches hot-seat production visibility with currentPlayer', () => {
  expect(visibleProductionCityIds(hotSeatState, camera, 'player-1')).toEqual(['city-p1']);
  expect(visibleProductionCityIds(hotSeatState, camera, 'player-2')).toEqual(['city-p2']);
});
```

Include one horizontal-wrap case with a viewport that makes two copies visible.

- [ ] **Step 2: Run focused tests and verify missing exports fail**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/city-renderer.test.ts tests/renderer/camera.test.ts`

Expected: FAIL because the query functions are not exported.

- [ ] **Step 3: Reuse the live projection and transforms**

```ts
export function getVisibleHexViewportCopies(
  state: GameState,
  camera: Camera,
  viewerId: string,
  coord: HexCoord,
): Array<{ x: number; y: number }> {
  if (!state.civilizations[viewerId]?.visibility) return [];
  const coords = state.map.wrapsHorizontally
    ? getHorizontalWrapRenderCoords(coord, state.map.width, camera)
    : [coord];
  return coords
    .filter(copy => camera.isHexVisible(copy))
    .map(copy => {
      const world = hexToPixel(copy, camera.hexSize);
      return camera.worldToScreen(world.x, world.y);
    });
}

export function getVisibleCityBadgeSlots(
  state: GameState,
  camera: Camera,
  viewerId: string,
  cityId: string,
  slot: CityBadgeSlot,
) {
  return createCityRenderItems(state, camera, viewerId, {})
    .filter(item => item.projection.isLive && item.city?.id === cityId)
    .map(item => getCityBadgeLayout(item.screen, item.size)[slot]);
}
```

Keep `createCityRenderItems` private; return serialized coordinates/bounds only.

- [ ] **Step 4: Run tests and source checks**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/renderer/city-renderer.test.ts tests/renderer/camera.test.ts
scripts/check-src-rule-violations.sh src/renderer/city-renderer.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/city-renderer.ts tests/renderer/city-renderer.test.ts tests/renderer/camera.test.ts
git commit -m "test(renderer): expose viewer-safe canvas geometry"
```

### Task 5: Add the read-only direct-entry runtime and readiness phases

**Files:**
- Create: `src/testing/e2e-runtime.ts`
- Create: `tests/testing/e2e-runtime.test.ts`
- Modify: `src/main.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `tests/main.integration.test.ts`

- [ ] **Step 1: Write failing runtime contract tests**

```ts
it('rejects missing challenge and hot-seat autosaves before entry', async () => {
  const hotSeatBefore = structuredClone(hotSeatState);
  await expect(startE2ERuntime(deps({ state: withoutChallenge })))
    .rejects.toThrow(/opponent challenge/i);
  await expect(startE2ERuntime(deps({ state: hotSeatState })))
    .rejects.toThrow(/hot-seat/i);
  expect(enterCampaign).not.toHaveBeenCalled();
  expect(storageWriter).not.toHaveBeenCalled();
  expect(hotSeatState).toEqual(hotSeatBefore);
});

it.each(['explorer', 'standard', 'veteran'] as const)(
  'accepts %s without resolving or rewriting it',
  async challenge => {
    const state = { ...soloState, opponentChallenge: challenge };
    await startE2ERuntime(deps({ state }));
    expect(enterCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ opponentChallenge: challenge }),
    );
  },
);

it('rejects an unknown challenge without entering or writing', async () => {
  const state = { ...soloState, opponentChallenge: 'impossible' as never };
  await expect(startE2ERuntime(deps({ state }))).rejects.toThrow(/valid opponent challenge/i);
  expect(enterCampaign).not.toHaveBeenCalled();
  expect(storageWriter).not.toHaveBeenCalled();
});

it('exposes only frozen readiness and serialized geometry queries', async () => {
  const runtime = await startE2ERuntime(deps({ state: soloState }));
  expect(Object.isFrozen(runtime)).toBe(true);
  expect(Object.keys(runtime).sort()).toEqual([
    'errors', 'getCityBadgeSlots', 'getVisibleHexCopies', 'readiness',
  ]);
  expect(runtime).not.toHaveProperty('gameState');
  expect(runtime).not.toHaveProperty('camera');
  expect(runtime).not.toHaveProperty('renderLoop');
});

it('records sprite rejection without blocking campaign readiness', async () => {
  const runtime = await startE2ERuntime(deps({ spritePromise: Promise.reject(new Error('bad sprite')) }));
  expect(runtime.readiness()).toContain('campaign-ready');
  await Promise.resolve();
  expect(runtime.readiness()).not.toContain('sprites-ready');
  expect(runtime.errors()).toContainEqual(expect.stringContaining('bad sprite'));
});
```

- [ ] **Step 2: Run the test and verify the missing runtime fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/testing/e2e-runtime.test.ts`

Expected: FAIL because `src/testing/e2e-runtime.ts` does not exist.

- [ ] **Step 3: Implement the dependency-injected runtime**

```ts
export interface E2ERuntimeDependencies {
  loadAutosave: () => Promise<LoadedSaveEntry | undefined>;
  enterSoloCampaign: (state: GameState) => Promise<void>;
  getVisibleHexCopies: (coord: HexCoord) => ViewportPoint[];
  getCityBadgeSlots: (cityId: string, slot: CityBadgeSlot) => BadgeSlotResult[];
}

export async function startE2ERuntime(deps: E2ERuntimeDependencies) {
  const loaded = await deps.loadAutosave();
  if (!loaded) throw new Error('E2E direct entry requires an installed autosave.');
  const state = loaded.state;
  if (!isOpponentChallenge(state.opponentChallenge)) {
    throw new Error('E2E autosave requires a valid opponent challenge.');
  }
  if (state.hotSeat) throw new Error('E2E direct entry does not bypass hot-seat handoff.');

  const phases = new Set<string>();
  const errors: string[] = [];
  const sprites = deps.enterSoloCampaign(state);
  phases.add('campaign-ready');
  void sprites.then(
    () => phases.add('sprites-ready'),
    error => errors.push(String(error)),
  );

  return Object.freeze({
    readiness: () => Object.freeze([...phases]),
    errors: () => Object.freeze([...errors]),
    getVisibleHexCopies: deps.getVisibleHexCopies,
    getCityBadgeSlots: deps.getCityBadgeSlots,
  });
}
```

- [ ] **Step 4: Retain sprite readiness and mark campaign readiness after startup**

Change `startGame()` to return the non-blocking sprite promise:

```ts
function startGame(): Promise<void> {
  const spritesReady = initSprites(civColors);
  void spritesReady.catch(() => {});
  renderLoop.start();
  return spritesReady;
}
```

Return that promise from the existing solo branches while leaving hot-seat handoff
as a deferred `null` result:

```ts
function enterCampaign(
  state: GameState,
  message: string,
  persistBeforeReady = false,
): Promise<void> | null {
  document.getElementById('save-panel')?.remove();
  gameState = state;
  migrateLegacySave();
  if (gameState.gameOver) {
    const spritesReady = startGame();
    handleVictoryIfNeeded();
    return spritesReady;
  }
  if (!gameState.hotSeat) {
    const spritesReady = startGame();
    showNotification(message, 'info');
    return spritesReady;
  }
  // Existing handoff controller and persistence code remain unchanged.
  return null;
}

function enterCampaignForE2E(state: GameState): Promise<void> {
  if (state.hotSeat) throw new Error('E2E direct entry does not bypass hot-seat handoff.');
  const spritesReady = enterCampaign(state, `Welcome back! Turn ${state.turn}`);
  if (!spritesReady) throw new Error('E2E direct entry requires a solo campaign.');
  return spritesReady;
}
```

Because `startGame()` remains synchronous until its returned promise is observed,
`campaign-ready` is set only after `renderLoop.setGameState`, camera centering,
and `renderLoop.start()` have occurred. Normal UI callbacks may ignore the return.

- [ ] **Step 5: Add the literal mode/query branch in `init()`**

```ts
if (import.meta.env.MODE === 'e2e') {
  const { isExactAutosaveE2ERequest } = await import('@/testing/e2e-mode');
  if (isExactAutosaveE2ERequest(import.meta.env.MODE, window.location.search)) {
    const { installE2ERuntime } = await import('@/testing/e2e-runtime');
    await installE2ERuntime({
      loadAutosave: loadMostRecentAutoSaveEntry,
      enterSoloCampaign: state => enterCampaignForE2E(state),
      getVisibleHexCopies: coord => getVisibleHexViewportCopies(
        gameState, renderLoop.camera, gameState.currentPlayer, coord,
      ),
      getCityBadgeSlots: (cityId, slot) => getVisibleCityBadgeSlots(
        gameState, renderLoop.camera, gameState.currentPlayer, cityId, slot,
      ),
    });
    return;
  }
}
await showStartSavePanel();
```

`installE2ERuntime` assigns only `window.__CONQUESTORIA_E2E_DIAGNOSTICS__`.
Do not add state payloads, storage writes, capture controls, renderer objects, or
arbitrary callbacks to that object.

- [ ] **Step 6: Add source-wiring assertions**

In `tests/main.integration.test.ts`, assert:

```ts
expect(main).toContain("if (import.meta.env.MODE === 'e2e')");
expect(main).toContain("await import('@/testing/e2e-runtime')");
expect(main.indexOf("import.meta.env.MODE === 'e2e'"))
  .toBeLessThan(main.indexOf('await showStartSavePanel()'));
expect(main).not.toContain('window.gameState');
expect(main).not.toContain('window.renderLoop');
```

- [ ] **Step 7: Run focused tests, build, and source checks**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/testing/e2e-mode.test.ts tests/testing/e2e-runtime.test.ts tests/main.integration.test.ts
scripts/check-src-rule-violations.sh src/testing/e2e-mode.ts src/testing/e2e-runtime.ts src/main.ts
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn build:tauri
```

Expected: all PASS; both builds finish with no e2e sentinel in `dist`.

- [ ] **Step 8: Commit**

```bash
git add src/testing/e2e-runtime.ts tests/testing/e2e-runtime.test.ts src/main.ts src/vite-env.d.ts tests/main.integration.test.ts
git commit -m "test(e2e): enter autosaves through a gated runtime"
```

### Task 6: Build independent, valid save scenarios

**Files:**
- Create: `tests/e2e/helpers/save-fixture.ts`
- Create: `tests/e2e/helpers/save-fixture.test.ts`

- [ ] **Step 1: Write failing clone, ownership, and scenario tests**

```ts
it('returns independent clones and derives the city from currentPlayer', () => {
  const first = createScenarioState('building');
  const second = createScenarioState('building');
  expect(first).not.toBe(second);
  expect(first.cities[selectedCityId(first)].owner).toBe(first.currentPlayer);
  first.turn = 999;
  expect(second.turn).not.toBe(999);
});

it('creates valid building and unit queue heads', () => {
  expect(selectedCity(createScenarioState('building')).productionQueue[0]).toBe('granary');
  expect(selectedCity(createScenarioState('unit')).productionQueue[0]).toBe('warrior');
});

it('uses canonical legendary-wonder transitions', () => {
  const state = createScenarioState('legendary');
  const city = selectedCity(state);
  const project = Object.values(state.legendaryWonderProjects ?? {}).find(candidate =>
    candidate.cityId === city.id && candidate.wonderId === 'standing-stones');
  expect(city.productionQueue[0]).toBe('legendary:standing-stones');
  expect(project?.phase).toBe('building');
});

it('fails when a requested definition or viewer-owned visible city is absent', () => {
  expect(() => transformScenario(baseWithoutGranary, 'building')).toThrow(/granary/i);
  expect(() => transformScenario(baseWithoutVisibleOwnedCity, 'unit')).toThrow(/visible city/i);
});
```

- [ ] **Step 2: Run the test and verify the missing helper fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/e2e/helpers/save-fixture.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement fresh clone and typed transforms**

```ts
const BASE_FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GameState;

export type ProductionScenario = 'building' | 'unit' | 'legendary';

export function createBaseFixture(): GameState {
  return structuredClone(BASE_FIXTURE);
}

export function findVisibleOwnedCity(state: GameState): City {
  const visibility = state.civilizations[state.currentPlayer]?.visibility;
  const city = Object.values(state.cities).find(candidate =>
    candidate.owner === state.currentPlayer
    && visibility
    && getVisibility(visibility, candidate.position) === 'visible');
  if (!city) throw new Error('Fixture requires a visible city owned by currentPlayer.');
  return city;
}

export function createScenarioState(scenario: ProductionScenario): GameState {
  const state = createBaseFixture();
  state.opponentChallenge = 'standard';
  const city = findVisibleOwnedCity(state);
  if (scenario === 'building') setValidatedQueueHead(state, city, 'granary');
  if (scenario === 'unit') setValidatedQueueHead(state, city, 'warrior');
  if (scenario === 'legendary') configureStandingStones(state, city);
  return state;
}
```

```ts
function configureStandingStones(initial: GameState, city: City): GameState {
  const state = structuredClone(initial);
  const civ = state.civilizations[state.currentPlayer];
  civ.techState.completed = [
    ...new Set([...civ.techState.completed, 'animism', 'mud-brick', 'gathering']),
  ];
  if (!state.marketplace) throw new Error('Standing Stones fixture requires marketplace state.');
  state.marketplace = {
    ...state.marketplace,
    purchasedResources: [
      ...(state.marketplace.purchasedResources ?? []),
      { civId: state.currentPlayer, resource: 'stone', expiresOnTurn: state.turn + 10 },
    ],
  };
  const village = Object.values(state.tribalVillages ?? {})[0];
  if (!village) throw new Error('Standing Stones fixture requires an existing village.');
  state.legendaryWonderHistory ??= { destroyedStrongholds: [], discoveredSites: [] };
  state.legendaryWonderHistory.discoveredSites.push({
    civId: state.currentPlayer,
    siteId: village.id,
    siteType: 'tribal-village',
    position: village.position,
    turn: state.turn,
  });
  let next = initializeLegendaryWonderProjectsForCity(state, state.currentPlayer, city.id);
  const ready = Object.values(next.legendaryWonderProjects ?? {}).find(project =>
    project.cityId === city.id && project.wonderId === 'standing-stones');
  if (ready?.phase !== 'ready_to_build') {
    throw new Error('Standing Stones fixture did not reach ready_to_build.');
  }
  next = startLegendaryWonderBuild(next, state.currentPlayer, city.id, 'standing-stones');
  const building = Object.values(next.legendaryWonderProjects ?? {}).find(project =>
    project.cityId === city.id && project.wonderId === 'standing-stones');
  if (building?.phase !== 'building'
    || next.cities[city.id]?.productionQueue[0] !== 'legendary:standing-stones') {
    throw new Error('Standing Stones fixture did not enter its canonical build state.');
  }
  return next;
}
```

- [ ] **Step 4: Add the browser installer**

```ts
export async function installAutosave(page: Page, state: GameState): Promise<void> {
  await page.addInitScript(serialized => {
    localStorage.setItem('conquestoria-autosave', serialized);
  }, JSON.stringify(state));
}
```

- [ ] **Step 5: Run the helper tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/e2e/helpers/save-fixture.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/helpers/save-fixture.ts tests/e2e/helpers/save-fixture.test.ts
git commit -m "test(e2e): build valid production save scenarios"
```

### Task 7: Implement bounded Canvas operation capture

**Files:**
- Create: `tests/e2e/helpers/canvas-ops.ts`
- Create: `tests/e2e/helpers/canvas-ops.test.ts`

- [ ] **Step 1: Write failing parser and normalization tests**

```ts
it.each([
  [[image, 1, 2], { dx: 1, dy: 2 }],
  [[image, 1, 2, 3, 4], { dx: 1, dy: 2, dw: 3, dh: 4 }],
  [[image, 1, 2, 3, 4, 5, 6, 7, 8], { sx: 1, sy: 2, sw: 3, sh: 4, dx: 5, dy: 6, dw: 7, dh: 8 }],
])('parses drawImage overload %j', (args, expected) => {
  expect(parseDrawImage(args)).toMatchObject(expected);
});

it('transforms every image corner through CTM, DPR scale, and canvas offset', () => {
  expect(normalizeImageBounds({
    rect: { x: 1, y: 2, width: 3, height: 4 },
    transform: { a: 2, b: 1, c: 0.5, d: 3, e: 7, f: 11 },
    backing: { width: 200, height: 100 },
    css: { x: 10, y: 20, width: 100, height: 50 },
  }).polygon).toHaveLength(4);
});

it('freezes, overflows, and resets by capture session', () => {
  const recorder = createOperationRecorder({ maxOperations: 2 });
  recorder.start(filter);
  recorder.record(op1);
  recorder.record(op2);
  recorder.record(op3);
  expect(recorder.snapshot()).toMatchObject({ overflowed: true, operations: [op1, op2] });
  recorder.freeze();
  recorder.record(op4);
  expect(recorder.snapshot().operations).toHaveLength(2);
  recorder.start(filter);
  expect(recorder.snapshot()).toMatchObject({ overflowed: false, operations: [] });
});
```

- [ ] **Step 2: Run and verify the helper is missing**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/e2e/helpers/canvas-ops.test.ts`

Expected: FAIL because `canvas-ops.ts` does not exist.

- [ ] **Step 3: Implement serializable operation types and pure helpers**

```ts
export type CapturedCanvasOperation = CapturedTextOperation | CapturedImageOperation;

export interface CapturedOperationBase {
  sessionId: number;
  sequence: number;
  canvasId: string;
  transform: MatrixSnapshot;
  backing: { width: number; height: number };
  cssRect: RectSnapshot;
}

export interface CapturedTextOperation extends CapturedOperationBase {
  kind: 'fillText';
  text: string;
  raw: { x: number; y: number; maxWidth?: number };
  anchor: { x: number; y: number };
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

export interface CapturedImageOperation extends CapturedOperationBase {
  kind: 'drawImage';
  rawDestination: RectSnapshot;
  source?: RectSnapshot;
  polygon: ViewportPoint[];
  bounds: RectSnapshot;
  sprite: SpriteDiagnosticMetadata | null;
}
```

Implement `parseDrawImage`, matrix application, all-four-corner bounds,
backing-to-CSS scaling, filters, maximum buffer, overflow, freeze, and reset as
pure functions/classes so Vitest can cover them without launching a browser.

- [ ] **Step 4: Install dormant native-method wrappers**

```ts
export function installBrowserCanvasProbe(config: {
  maxOperations: number;
  metadataKey: string;
}): void {
  // All recorder, filter, overload, matrix, and normalization helpers are
  // declared inside this function. Playwright serializes this function body;
  // it cannot close over imports or module-local helpers.
  const createBrowserRecorder = (maxOperations: number) => {
    const state = {
      active: false,
      sessionId: 0,
      sequence: 0,
      overflowed: false,
      operations: [] as CapturedCanvasOperation[],
      instrumentationErrors: [] as string[],
      filter: null as CaptureFilter | null,
    };
    return {
      start(filter: CaptureFilter) {
        state.active = true;
        state.sessionId += 1;
        state.sequence = 0;
        state.overflowed = false;
        state.operations = [];
        state.instrumentationErrors = [];
        state.filter = structuredClone(filter);
      },
      freeze() {
        state.active = false;
        return structuredClone(state);
      },
      prepareText(context: CanvasRenderingContext2D, args: unknown[]) {
        return prepareBrowserTextOperation(context, args, state, config);
      },
      prepareImage(context: CanvasRenderingContext2D, args: unknown[]) {
        return prepareBrowserImageOperation(context, args, state, config);
      },
      instrumentationError(error: unknown) {
        state.instrumentationErrors.push(String(error));
      },
      commit(operation: CapturedCanvasOperation) {
        if (!state.active || !matchesBrowserFilter(operation, state.filter)) return;
        if (state.operations.length >= maxOperations) {
          state.overflowed = true;
          state.active = false;
          return;
        }
        state.operations.push({ ...operation, sequence: state.sequence++ });
      },
    };
  };

  // Define prepareBrowserTextOperation, prepareBrowserImageOperation, and
  // matchesBrowserFilter above createBrowserRecorder in the real function body
  // using the pure algorithms from Step 3. They may reference only parameters,
  // local declarations, and browser globals.
  const capture = createBrowserRecorder(config.maxOperations);
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;

  CanvasRenderingContext2D.prototype.fillText = function (...args) {
    let prepared;
    try { prepared = capture.prepareText(this, args); }
    catch (error) { capture.instrumentationError(error); }
    const result = Reflect.apply(originalFillText, this, args);
    if (prepared) capture.commit(prepared);
    return result;
  };

  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    let prepared;
    try { prepared = capture.prepareImage(this, args); }
    catch (error) { capture.instrumentationError(error); }
    const result = Reflect.apply(originalDrawImage, this, args);
    if (prepared) capture.commit(prepared);
    return result;
  };

  Object.defineProperty(window, '__CQ_CANVAS_CAPTURE__', {
    value: Object.freeze({ start: capture.start, freeze: capture.freeze }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export async function installCanvasCapture(page: Page): Promise<void> {
  await page.addInitScript(installBrowserCanvasProbe, {
    maxOperations: 500,
    metadataKey: 'conquestoria.spriteDiagnostic',
  });
}
```

The browser-side implementation reads the non-enumerable value from
`image[Symbol.for('conquestoria.spriteDiagnostic')]`. It contains only the
approved catalog fields and is installed before the image load promise resolves.
Add a unit test that invokes `installBrowserCanvasProbe.toString()` in an isolated
browser-like VM with only the approved Canvas/window globals; it must install and
capture successfully. This fails if the function accidentally closes over a
module import such as `createBrowserRecorder`.

- [ ] **Step 5: Add capture lifecycle and two-frame synchronization**

```ts
export async function captureCompleteFrame(
  page: Page,
  filter: CaptureFilter,
): Promise<CaptureSnapshot> {
  await page.evaluate(value => window.__CQ_CANVAS_CAPTURE__.start(value), filter);
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const snapshot = await page.evaluate(() => window.__CQ_CANVAS_CAPTURE__.freeze());
  if (snapshot.overflowed) throw new Error('Canvas capture overflowed its bounded buffer.');
  if (snapshot.instrumentationErrors.length) {
    throw new Error(snapshot.instrumentationErrors.join('\n'));
  }
  return snapshot;
}
```

The Playwright-owned `__CQ_CANVAS_CAPTURE__` global is installed only by
`page.addInitScript`; never declare or create it in `src/**`.

- [ ] **Step 6: Test native parity explicitly**

Add tests with fake native methods that return a sentinel or throw. Assert the
wrapper returns the same sentinel, rethrows the exact error object, commits only
after success, and still delegates unknown argument shapes.

- [ ] **Step 7: Run focused tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/e2e/helpers/canvas-ops.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/helpers/canvas-ops.ts tests/e2e/helpers/canvas-ops.test.ts
git commit -m "test(e2e): capture bounded canvas operations"
```

### Task 8: Share campaign entry and renderer geometry across browser specs

**Files:**
- Create: `tests/e2e/helpers/campaign-entry.ts`
- Create: `tests/e2e/helpers/render-geometry.ts`
- Create: `tests/e2e/campaign-entry-smoke.spec.ts`
- Modify: `tests/e2e/issue-365-map-presentation.spec.ts`
- Modify: `tests/e2e/issue-437-hud-alignment.spec.ts`
- Modify: `tests/e2e/issue-447-water-recovery.spec.ts`
- Create: `tests/architecture/e2e-source-guard.test.ts`

- [ ] **Step 1: Write the source guard before refactoring**

```ts
it('keeps renderer math and fixed bootstrap sleeps out of e2e specs', () => {
  const sources = e2eSpecSources();
  for (const [path, source] of sources) {
    expect(source, path).not.toMatch(/function pointyHexPixel/);
    expect(source, path).not.toContain('waitForTimeout(');
    expect(source, path).not.toMatch(/Math\.sqrt\(3\).*48/);
  }
});

it('keeps badge and e2e support out of gameplay, AI, audio, and save schemas', () => {
  const presentation = readSource('src/renderer/city-badge-presentation.ts');
  const runtime = readSource('src/testing/e2e-runtime.ts');
  for (const [path, source] of [
    ['city-badge-presentation.ts', presentation],
    ['e2e-runtime.ts', runtime],
  ] as const) {
    expect(source, path).not.toMatch(/@\/(ai|audio|core\/event-bus|systems\/economy)/);
    expect(source, path).not.toMatch(/SFX|EventBus|showNotification/);
  }
  expect(runtime).not.toMatch(/autoSave|rewriteLoadedSaveEntry|localStorage|indexedDB/);
});

```

- [ ] **Step 2: Run the guard and verify it fails on issues 365 and 447**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/architecture/e2e-source-guard.test.ts`

Expected: FAIL, naming the copied helpers and sleeps.

- [ ] **Step 3: Implement direct and UI campaign entry**

```ts
export type CampaignEntryMode = 'direct' | 'ui';
export type ReadinessPhase = 'campaign-ready' | 'sprites-ready';

export async function enterInstalledCampaign(
  page: Page,
  options: { mode: CampaignEntryMode; waitFor: ReadinessPhase },
): Promise<void> {
  if (options.mode === 'direct') {
    await page.goto('/?e2e=autosave');
    await waitForReadiness(page, options.waitFor);
    return;
  }
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await button.click();
  await expect(button).toBeHidden();
  await expect(page.locator('#game-canvas')).toBeVisible();
}
```

`waitForReadiness` uses `expect.poll` over the read-only runtime and includes
`errors()` in its failure message. It never chooses a legacy challenge and never
accepts a hot-seat handoff.

- [ ] **Step 4: Implement geometry wrappers**

```ts
export async function visibleHexCopyNearest(
  page: Page,
  coord: HexCoord,
  anchor: ViewportPoint,
): Promise<ViewportPoint> {
  const copies = await page.evaluate(
    value => window.__CONQUESTORIA_E2E_DIAGNOSTICS__!.getVisibleHexCopies(value),
    coord,
  );
  if (!copies.length) throw new Error(`No visible wrapped copy for ${coord.q},${coord.r}`);
  return copies.reduce((best, candidate) =>
    distance(candidate, anchor) < distance(best, anchor) ? candidate : best);
}

export async function visibleCityBadgeSlots(
  page: Page,
  cityId: string,
  slot: CityBadgeSlot,
) {
  const results = await page.evaluate(
    value => window.__CONQUESTORIA_E2E_DIAGNOSTICS__!
      .getCityBadgeSlots(value.cityId, value.slot),
    { cityId, slot },
  );
  if (!results.length) throw new Error(`City ${cityId} is not rendered for the current viewer.`);
  return results;
}
```

- [ ] **Step 5: Add a real Continue smoke test**

```ts
test('modern solo autosave still enters through the real Continue button', async ({ page }) => {
  await installAutosave(page, createScenarioState('building'));
  await enterInstalledCampaign(page, { mode: 'ui', waitFor: 'campaign-ready' });
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeHidden();
  await expect(page.locator('#game-canvas')).toBeVisible();
});
```

- [ ] **Step 6: Refactor issues 365, 437, and 447**

Use `createBaseFixture`/scenario transforms, `installAutosave`,
`enterInstalledCampaign`, `visibleHexCopyNearest`, and the shared Canvas capture.
In issue 447, click the renderer-owned destination point directly instead of
adding a locally calculated delta. Set viewport and reduced motion before
`page.goto`.

Keep issue 365's v2 assertion and improve its failure message:

```ts
await expect(
  page.locator('#building-sprites > *'),
  'v2 building sprites are intentionally dormant; update #660 observability before activating a consumer',
).toHaveCount(0);
```

- [ ] **Step 7: Run refactored browser specs and the source guard**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/architecture/e2e-source-guard.test.ts
bash scripts/run-with-mise.sh yarn playwright test tests/e2e/campaign-entry-smoke.spec.ts tests/e2e/issue-365-map-presentation.spec.ts tests/e2e/issue-437-hud-alignment.spec.ts tests/e2e/issue-447-water-recovery.spec.ts
```

Expected: PASS with no fixed bootstrap sleep or local renderer math.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/helpers/campaign-entry.ts tests/e2e/helpers/render-geometry.ts tests/e2e/campaign-entry-smoke.spec.ts tests/e2e/issue-365-map-presentation.spec.ts tests/e2e/issue-437-hud-alignment.spec.ts tests/e2e/issue-447-water-recovery.spec.ts tests/architecture/e2e-source-guard.test.ts
git commit -m "test(e2e): share deterministic campaign geometry"
```

### Task 9: Verify building, unit, and wonder production in a real browser

**Files:**
- Create: `tests/e2e/production-badges.spec.ts`

- [ ] **Step 1: Write the building image assertion**

```ts
test('building production draws the identified catalog sprite in its slot', async ({ page }) => {
  const state = createScenarioState('building');
  const city = findVisibleOwnedCity(state);
  await installCanvasCapture(page);
  await installAutosave(page, state);
  await enterInstalledCampaign(page, { mode: 'direct', waitFor: 'sprites-ready' });
  const slots = await visibleCityBadgeSlots(page, city.id, 'production');
  const capture = await captureCompleteFrame(page, {
    canvasIds: ['game-canvas'],
    kinds: ['drawImage', 'fillText'],
    sprite: { kind: 'building', itemId: 'granary', civilization: city.owner },
    textValues: ['🏗️'],
  });
  const image = capture.operations.find(isMatchingBuilding('granary', city.owner));
  expect(image).toBeDefined();
  expect(slots.some(slot => rectsIntersect(image!.bounds, slot.bounds))).toBe(true);
  expect(capture.operations.some(isTextInSlots('🏗️', slots))).toBe(false);

  const cityCenter = await visibleHexCopyNearest(
    page,
    city.position,
    slots[0]!.center,
  );
  await page.mouse.click(cityCenter.x, cityCenter.y);
  const panel = page.locator('#city-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Granary');
  await expect(panel).toContainText('turns remaining');
});
```

- [ ] **Step 2: Run the single test and verify the integrated contract**

Run: `bash scripts/run-with-mise.sh yarn playwright test tests/e2e/production-badges.spec.ts --grep "building production"`

Expected: PASS. A failure must identify one of the already implemented contracts:
sprite readiness, stable metadata, bounded capture, or renderer-owned slot
geometry. Correct that contract in its owning file and rerun its Task 3, 4, 5,
or 7 unit suite before rerunning this browser assertion.

- [ ] **Step 3: Add the unit image assertion**

```ts
test('unit production draws the identified catalog sprite in its slot', async ({ page }) => {
  const state = createScenarioState('unit');
  const city = findVisibleOwnedCity(state);
  await installCanvasCapture(page);
  await installAutosave(page, state);
  await enterInstalledCampaign(page, { mode: 'direct', waitFor: 'sprites-ready' });
  const slots = await visibleCityBadgeSlots(page, city.id, 'production');
  const capture = await captureCompleteFrame(page, {
    canvasIds: ['game-canvas'],
    kinds: ['drawImage', 'fillText'],
    sprite: {
      kind: 'unit',
      itemId: 'warrior',
      civilization: city.owner,
      motion: 'idle',
    },
    textValues: ['🏗️'],
  });
  const image = capture.operations.find(isMatchingUnit('warrior', city.owner, 'idle'));
  expect(image).toBeDefined();
  expect(slots.some(slot => rectsIntersect(image!.bounds, slot.bounds))).toBe(true);
  expect(capture.operations.some(isTextInSlots('🏗️', slots))).toBe(false);
});
```

- [ ] **Step 4: Add the legendary-wonder fallback assertion**

```ts
const state = createScenarioState('legendary');
// Enter after campaign-ready; the item is intentionally unsprited.
expect(capture.operations.some(isTextInSlots('🏗️', slots))).toBe(true);
expect(capture.operations.some(operation =>
  operation.kind === 'drawImage'
  && operation.sprite?.itemId === 'legendary:standing-stones')).toBe(false);
```

- [ ] **Step 5: Run the complete production-badge spec**

Run: `bash scripts/run-with-mise.sh yarn playwright test tests/e2e/production-badges.spec.ts`

Expected: PASS for all three scenarios.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/production-badges.spec.ts
git commit -m "test(e2e): verify city production canvas badges"
```

### Task 10: Lock live catalogs and dormant v2 boundaries

**Files:**
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/systems/city-system.test.ts`
- Create: `tests/architecture/v2-building-consumer.test.ts`

- [ ] **Step 1: Write exact live-catalog relationship tests**

```ts
it('covers every canonical building and only the five retained extras', () => {
  const buildings = new Set(Object.keys(BUILDINGS));
  const sprites = new Set(Object.keys(BUILDING_SPRITE_CATALOG));
  for (const id of buildings) expect(sprites.has(id), `missing sprite: ${id}`).toBe(true);
  expect([...sprites].filter(id => !buildings.has(id)).sort()).toEqual([
    'colosseum',
    'great_library',
    'lighthouse',
    'pyramids',
    'wright-flyer',
  ]);
});

it('keeps canonical buildings inside the broader production-icon catalog', () => {
  for (const id of Object.keys(BUILDINGS)) {
    expect(PRODUCTION_ICONS[id], `missing production icon: ${id}`).toBeTruthy();
  }
});
```

Add an assertion that each retained extra renders a non-empty sprite. Add an
adjacent source comment for each extra in `sprite-catalog.ts` only if an existing
comment does not already explain why it is not a canonical building ID.

- [ ] **Step 2: Write the failing v2 source-use architecture test**

```ts
it('keeps getBuildingSpriteV2 limited to its definition and dormant overlay branch', () => {
  expect(findIdentifierConsumers('src', 'getBuildingSpriteV2', {
    exclude: ['**/*.svg.ts'],
  }).sort()).toEqual([
    'src/renderer/sprite-overlay.ts',
    'src/renderer/sprites/v2/index.ts',
  ]);
});
```

Failure text must direct a future implementer to update #660 catalog consistency
and Canvas/DOM observability before adding a panel, preview, or renderer consumer.

- [ ] **Step 3: Run the catalog and architecture tests**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/systems/city-system.test.ts tests/renderer/sprites/v2/index.test.ts tests/architecture/v2-building-consumer.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/renderer/sprites/sprite-catalog.test.ts tests/systems/city-system.test.ts tests/architecture/v2-building-consumer.test.ts src/renderer/sprites/sprite-catalog.ts
git commit -m "test(renderer): guard live and dormant building catalogs"
```

### Task 11: Document the Canvas verification contract

**Files:**
- Create: `docs/testing/canvas-render-verification.md`
- Modify: `.claude/rules/ui-panels.md`

- [ ] **Step 1: Add the maintainer guide**

The guide must contain these concrete sections and commands:

```md
# Canvas Render Verification

## Choose the smallest proof
- Operations-log unit test for every Canvas render change.
- Playwright capture only for startup, real sprite loading, camera composition, or Canvas/DOM integration.

## Shared helpers
- `save-fixture.ts`: fresh clones and named scenarios.
- `campaign-entry.ts`: `direct` and `ui` entry plus readiness phases.
- `canvas-ops.ts`: install, start, two-frame wait, freeze, assert no overflow.
- `render-geometry.ts`: visible wrapped copies and named city-badge slots.

## Adding a sprite assertion
1. Add stable metadata at image construction.
2. Add an operations-log test.
3. Filter a bounded capture by canvas, operation, and sprite metadata.
4. Compare normalized bounds with a renderer-owned slot.

## Dormant v2 building boundary
`getBuildingSpriteV2` is serialized asset support, not a live surface. Update the
catalog and observability contracts before adding a consumer.

## Operational browser constraints
Screenshots are debugging evidence only. Browser tree omissions, timeouts, and
downscaling are not substitutes for repository assertions.
```

- [ ] **Step 2: Add the scoped renderer rule and link**

Append to `.claude/rules/ui-panels.md`:

```md
## Canvas Verification
- Canvas behavior is invisible to DOM-only assertions.
- Every Canvas rendering change requires an operations-log unit regression.
- Use browser coverage when behavior depends on startup, sprite loading, camera composition, or Canvas/DOM integration.
- Browser assertions must use the shared bounded operation capture and renderer-owned coordinate helpers.
- Screenshots are QA evidence, not regression coverage.
- Treat external browser-tool quirks as operational context, not repository defects.

See `docs/testing/canvas-render-verification.md`.
```

- [ ] **Step 3: Run hook and link checks**

Run:

```bash
bash scripts/run-with-mise.sh yarn test:hooks
test -f docs/testing/canvas-render-verification.md
rg -n "docs/testing/canvas-render-verification.md" .claude/rules/ui-panels.md
```

Expected: PASS and one live documentation link.

- [ ] **Step 4: Commit**

```bash
git add docs/testing/canvas-render-verification.md .claude/rules/ui-panels.md
git commit -m "docs: define canvas render verification"
```

### Task 12: Complete end-to-end verification and review

**Files:**
- Review all files changed by Tasks 1–11.

- [ ] **Step 1: Run source-rule validation for every changed source file**

Run:

```bash
scripts/check-src-rule-violations.sh \
  src/main.ts \
  src/renderer/city-badge-presentation.ts \
  src/renderer/city-render-passes.ts \
  src/renderer/city-renderer.ts \
  src/renderer/sprites/sprite-loader.ts \
  src/testing/e2e-mode.ts \
  src/testing/e2e-runtime.ts
```

Expected: PASS.

- [ ] **Step 2: Run all focused unit suites**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run \
  tests/testing/e2e-mode.test.ts \
  tests/testing/e2e-runtime.test.ts \
  tests/e2e/helpers/save-fixture.test.ts \
  tests/e2e/helpers/canvas-ops.test.ts \
  tests/renderer/city-badge-presentation.test.ts \
  tests/renderer/city-render-passes.test.ts \
  tests/renderer/city-renderer.test.ts \
  tests/renderer/camera.test.ts \
  tests/renderer/sprites/sprite-loader.test.ts \
  tests/renderer/sprites/sprite-catalog.test.ts \
  tests/renderer/sprites/v2/index.test.ts \
  tests/systems/city-system.test.ts \
  tests/platform/playwright-config.test.ts \
  tests/main.integration.test.ts \
  tests/ui/city-panel.test.ts \
  tests/ui/campaign-entry-flow.test.ts \
  tests/ui/turn-handoff.test.ts \
  tests/storage/save-manager.test.ts \
  tests/core/hotseat-events.test.ts \
  tests/integration/hot-seat-unit-persistence.test.ts \
  tests/scripts/assert-no-e2e-runtime.test.ts \
  tests/architecture/e2e-source-guard.test.ts \
  tests/architecture/v2-building-consumer.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused browser coverage**

Run:

```bash
bash scripts/run-with-mise.sh yarn playwright test \
  tests/e2e/production-badges.spec.ts \
  tests/e2e/campaign-entry-smoke.spec.ts \
  tests/e2e/issue-365-map-presentation.spec.ts \
  tests/e2e/issue-437-hud-alignment.spec.ts \
  tests/e2e/issue-447-water-recovery.spec.ts
```

Expected: PASS on desktop and the embedded mobile/reduced-motion cases.

- [ ] **Step 4: Run hook, full browser, build, and full unit verification**

Run:

```bash
bash scripts/run-with-mise.sh yarn test:hooks
bash scripts/run-with-mise.sh yarn test:web-smoke
bash scripts/run-with-mise.sh yarn build
node scripts/assert-no-e2e-runtime.mjs dist
bash scripts/run-with-mise.sh yarn build:tauri
node scripts/assert-no-e2e-runtime.mjs dist
bash scripts/run-with-mise.sh yarn test
```

Expected: every command exits 0. The web build retains `/conquestoria/` asset
paths and the Tauri build retains relative asset paths.

- [ ] **Step 5: Inspect desktop/mobile bounds and both diffs**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --check
git diff --stat
git diff
git status --short --branch
```

Review that:

- production/religion and status/loyalty bounds are disjoint at supported sizes;
- no queue/menu icon, name, order, progress, ETA, or action changed;
- only the map fallback and overlapping anchors visibly changed;
- `explorer`, `standard`, and `veteran` presentation is identical for identical visible state;
- AI scoring/turn code, balance definitions, gameplay systems, and save schemas are absent from the source diff;
- hot-seat production visibility follows `currentPlayer`, while direct entry still rejects handoff bypass;
- no new audio/SFX/event dependency or color/audio-only meaning was introduced;
- no e2e state/capture API exists in normal bundles;
- no `pointyHexPixel`, fixed bootstrap sleep, or copied fixture installer remains;
- v2 building assets and lookups remain intact and dormant.

Expected: no whitespace errors and no unexplained uncommitted delta.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required changes, rerun the narrow failing command first, then
the affected matrix rows. Stage the reviewed paths printed by
`git status --short` one by one, then commit only those corrections:

```bash
git commit -m "test(e2e): complete canvas verification coverage"
```

Do not commit generated `dist/`, screenshots, traces, or Playwright reports.
