# Era 5–7 Legendary-Wonder Production Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Repo policy in `CLAUDE.md`: **no subagents** — execute inline.)

**Goal:** Show production art for the six `TODO(art)` wonders (`palace-of-the-sun`, `iron-arsenal`, `merchant-admiralty`, `crystal-palace`, `suez-canal`, `continental-congress`) on the map and in the production/queue/wonder surfaces, keeping today's canvas drawings as the deterministic fallback.

**Architecture:** The art is six generated 128×128 transparent isometric PNGs (Sprite-AI, approved by the owner 2026-10-13) already committed under `public/images/wonders/art/<wonder-id>.png`, with provenance in `design/wonder-art/<id>.provenance.json`. A new loader fetches each PNG (same shape as `wonder-tile-loader` / `png-sprite-canvas.ts`'s `loadImage`) into a cache and calls `notifyCanvasAssetReady()`. `drawLegendaryWonderLandmarkGlyph` draws the cached image when present, else falls through to the unchanged `resolveLegendaryWonderBespokeAsset(...).draw` path. DOM surfaces get a thumbnail helper that returns an `<img>` or the current emoji.

**Tech Stack:** TypeScript, Canvas 2D, PNG assets via Vite `public/`, vitest, Playwright.

**Issue:** https://github.com/a1flecke/conquestoria/issues/613 (no spec doc; the issue body is the spec).

## Status at plan time

Done and uncommitted in this worktree: the six PNGs (verified 128×128 RGBA, transparent corners, 37–49 % opaque), the six provenance records, and this plan + its manifest row. Everything below is still to do.

## Facts verified in the repo (do not re-derive)

- `wonder-tile-loader.ts` is for **natural** wonders only. Legendary wonders have no loader: `drawLegendaryWonderLandmarkGlyph` (`src/renderer/wonders/legendary-wonder-renderer.ts`) calls `resolveLegendaryWonderBespokeAsset(metadata.assetKey)` and draws canvas paths. Wiring is new work.
- On the map each legendary wonder is a small round badge orbiting the tile (`radius = size * 0.16`, art at `radius * 0.72 * metadata.scale`), so the PNGs are drawn at roughly 20–40 px — heavy downscale of a pixel-art source. Draw with `imageSmoothingEnabled = false` only if screenshots show blur is worse than shimmer (decide in Task 6).
- Metadata (`LegendaryWonderLandmarkMetadata`) has `wonderId`, `assetKey`, `palette`, `scale`.
- Queue/chooser icons come from `getProductionIconForItem(itemId)` (`src/systems/city-production-presentation.ts:350`) → one shared emoji. String-templated consumers in `src/ui/city-panel.ts` (~700, 915, 939, 953, 1014, 1075, 1742); the legendary chooser row is ~953 (`entry.queueItemId` = `legendary:<wonderId>`). Wonder panel title: `src/ui/wonder-panel-view.ts:297`. Codex page: `src/ui/wonder-codex-page.ts:98` shows a licensed photo with credit link — leave it and add the game art beside the status chip.
- Existing PNG precedent to follow: `.claude/rules/sprites.md` "PNG Spritesheet Units" — provenance is mandatory per source, art keeps a fallback, base URL comes from `import.meta.env?.BASE_URL ?? '/'` (`appBase()` in `src/renderer/sprites/png/png-sprite-html.ts:36`, **private**; vite `base` is `/conquestoria/` on web, `./` on Tauri). Never hardcode `/images/...`.
- Preloads: `src/app/controllers/game-session-controller.ts:265-268`. Canvas image caches must call `notifyCanvasAssetReady()` (`tests/renderer/canvas-asset-ready.test.ts` scans `src/renderer` for `new Image`).
- The service worker runtime-caches every fetched response, so the PNGs become offline-ready after first fetch without a precache edit (same as SFX). Verify in Task 6 manual QA by going offline after one load.
- Only six of 13 `TODO(art)` blocks in `legendary-wonder-bespoke-assets.ts` are in scope (~798, 832, 872, 913, 957, 990). The other seven stay untouched.

## Known art gaps vs the issue briefs (accepted by owner; recorded, not blocking)

- `iron-arsenal`: no galleys in slips. `crystal-palace`: no visible transept/machinery. `suez-canal`: one small boat, no steamship queue, reads slightly river-like. `merchant-admiralty` and `crystal-palace` are near-monochrome blue; check contrast on ocean tiles (Task 6). Regenerating any is 1 Sprite-AI token (19 left) — do it only if Task 6 QA shows a legibility problem. Record the gaps in `docs/sprite-design-system.md` (Task 7).

## Global Constraints

- Square isometric landmark, transparent background, no text/logos, readable at tile scale (issue + `generate-sprite-prompt` skill).
- Assets: local files under `public/images/wonders/art/`, exactly 128×128 RGBA, transparent corner pixels, ≤ 24 KB each; **no remote runtime URLs**; URLs built through a shared base helper, never hardcoded.
- Every asset has a `design/wonder-art/<id>.provenance.json` (tool, prompt, generation id, date, licence note).
- No `Math.random()`. Art is faction-neutral (not tinted). Hot-seat: no per-player logic.
- Deterministic canvas drawings and `SUPPORTED_BESPOKE_LEGENDARY_LANDMARK_ASSET_KEYS` stay; only the six `TODO(art)` comment lines go.
- Dynamic DOM via `textContent`/DOM APIs; thumbnail `<img>` has `alt=""` + `aria-hidden="true"`, no inline handlers.
- Commands only via `./scripts/dev.sh <task>` or `./scripts/run-with-mise.sh yarn <cmd>`. No save change, no `SAVE_VERSION` bump.

## Review Focus

1. Image fetch fails (offline first load, 404, wrong base path on web vs Tauri) → map draws the canvas fallback, no throw, no blank hole. *(Task 2, 3)*
2. Art finishes loading **after** first paint → canvas repaints on its own while idle (`notifyCanvasAssetReady`). *(Task 2, 3)*
3. `under-construction` still shows the ghost arc, not finished art; `reducedMotion` doesn't change the source. *(Task 3)*
4. A wonder with no art (the other 7 TODO wonders and every other wonder) keeps its exact current drawing and shared emoji. *(Task 3, 4, 5)*
5. Unknown/legacy `legendary:` ids and non-legendary ids never throw or render a broken `<img>`; the thumbnail only appears where the wonder's name is already shown to that viewer (hot-seat privacy). *(Task 4, 5)*
6. Ambient bounds: the image is drawn inside `withAmbientBounds(cx, cy, 3·r·scale)`; its box must stay inside that. *(Task 3)*
7. Dark/light terrain and mobile zoom: blue-on-blue assets keep contrast. *(Task 6)*
8. A missing or malformed provenance record, a file with an opaque corner, or an `UNCONFIRMED` licence note fails CI instead of shipping. *(Task 1)*

## File Structure

- Create `src/renderer/wonders/legendary-wonder-art-catalog.ts` — `LEGENDARY_WONDER_ART_IDS` (readonly tuple of the six ids) and `getLegendaryWonderArtPath(id)` → `images/wonders/art/<id>.png` (no leading slash).
- Create `src/renderer/asset-url.ts` — `resolveAppAssetUrl(path: string): string` (`${import.meta.env?.BASE_URL ?? '/'}${path}`); make `png-sprite-html.ts`'s private `appBase()` call it so there is one base-URL owner.
- Create `src/renderer/wonders/legendary-wonder-art-loader.ts` — preload + `getLegendaryWonderArtImage`.
- Create `src/renderer/wonders/legendary-wonder-art-thumbnail.ts` — DOM thumbnail helper.
- Modify `legendary-wonder-renderer.ts`, `legendary-wonder-bespoke-assets.ts` (comments only), `game-session-controller.ts`, `city-panel.ts`, `wonder-panel-view.ts`, `wonder-codex-page.ts`.
- Tests: `tests/renderer/wonders/legendary-wonder-art.test.ts`, `…/legendary-wonder-art-loader.test.ts`, extend `tests/renderer/legendary-wonder-renderer.test.ts` and `tests/renderer/canvas-asset-ready.test.ts`, `tests/ui/legendary-wonder-thumbnail.test.ts`, `tests/e2e/issue-613-wonder-art.spec.ts`.
- Docs: `docs/sprite-design-system.md`, `.claude/rules/sprites.md`, manifest row (plan deleted in the completing PR).

---

### Task 1: Asset contract test (already-satisfiable except the licence gate)

**Files:**
- Create: `src/renderer/wonders/legendary-wonder-art-catalog.ts`
- Create: `tests/renderer/wonders/legendary-wonder-art.test.ts`

**Interfaces:**
- Produces: `export const LEGENDARY_WONDER_ART_IDS = ['palace-of-the-sun','iron-arsenal','merchant-admiralty','crystal-palace','suez-canal','continental-congress'] as const;` `export type LegendaryWonderArtId`; `export function getLegendaryWonderArtPath(id: string): string | null` (null for any id not in the tuple).

- [ ] **Step 1: Failing test.** Read PNG headers with `node:fs` (no image lib in the repo; parse IHDR for width/height/colour type 6, and inflate the first scanline of IDAT with `node:zlib` to check the corner pixel's alpha is 0 — or, if unfiltered-row handling is awkward, assert colour type 6 plus a reasonable `tRNS`-free RGBA and leave pixel checks to the e2e). Per id assert: file exists at `public/images/wonders/art/<id>.png`; 128×128; RGBA; size ≤ 24 KB; `getLegendaryWonderArtPath(id)` returns `images/wonders/art/<id>.png`; provenance `design/wonder-art/<id>.provenance.json` exists with keys `id`, `file`, `generator`, `sprite_ai_generation_id` (uuid), `generated_on`, `prompt`, `licence_note`; `licence_note` does **not** start with `UNCONFIRMED`; `file` matches the real path. Also: the id tuple equals the set of six `landmark(...)` entries whose bespoke draw carries the superseded-TODO marker (assert the six ids exist in `getLegendaryWonderLandmarkMetadataCatalog()`), and `getLegendaryWonderArtPath('eiffel-tower') === null`, `('') === null`, `('__proto__') === null`.
- [ ] **Step 2:** `./scripts/dev.sh test tests/renderer/wonders/legendary-wonder-art.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the catalog with an `Object.hasOwn`/`Set` membership check (not `in`, so `__proto__` is safe).
- [ ] **Step 4:** Test now fails *only* on the six `UNCONFIRMED` licence notes. **That is intentional**: it is the release gate. Commit with that single test marked via a clearly named `it` (do not skip it); the PR cannot merge until the owner confirms the Sprite-AI terms and the six notes are edited (ask the owner at the start of Task 7; do not guess).
- [ ] **Step 5: Commit** `feat(wonders): art catalog and asset contract test (#613)` including the PNGs and provenance files.

### Task 2: Loader with fallback-safe cache

**Files:**
- Create: `src/renderer/asset-url.ts`; Modify `src/renderer/sprites/png/png-sprite-html.ts` (`appBase` delegates).
- Create: `src/renderer/wonders/legendary-wonder-art-loader.ts`
- Create: `tests/renderer/wonders/legendary-wonder-art-loader.test.ts`
- Modify: `tests/renderer/canvas-asset-ready.test.ts` (list the new loader beside the `wonder-tile-loader` row, ~line 98)

**Interfaces:**
- Consumes: `LEGENDARY_WONDER_ART_IDS`, `getLegendaryWonderArtPath`, `notifyCanvasAssetReady`.
- Produces: `resolveAppAssetUrl(path: string): string`; `preloadLegendaryWonderArt(): Promise<void>` (never rejects); `getLegendaryWonderArtImage(wonderId: string): HTMLImageElement | null`; `resetLegendaryWonderArtForTests(): void`.

- [ ] **Step 1: Failing tests** (stub `Image` as `canvas-asset-ready.test.ts` does): success → `getLegendaryWonderArtImage('crystal-palace')` returns the image, the stub saw `src === resolveAppAssetUrl('images/wonders/art/crystal-palace.png')`, readiness listener fires per loaded image; `onerror` for one id → that id `null`, the other five cached, `preload` resolves; unknown id → `null`; before preload → `null`; a failed id is retried by a second `preloadLegendaryWonderArt()` call (a transient offline start must not poison the cache for the session); `resolveAppAssetUrl` joins `BASE_URL` `/conquestoria/` and `./` correctly (stub `import.meta.env`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/renderer/asset-url.ts
export function resolveAppAssetUrl(path: string): string {
  return `${import.meta.env?.BASE_URL ?? '/'}${path}`;
}
```

```ts
// src/renderer/wonders/legendary-wonder-art-loader.ts
import { notifyCanvasAssetReady } from '@/renderer/canvas-asset-ready';
import { resolveAppAssetUrl } from '@/renderer/asset-url';
import { LEGENDARY_WONDER_ART_IDS, getLegendaryWonderArtPath } from './legendary-wonder-art-catalog';

const cache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Legendary wonder art failed to load: ${url}`));
    img.src = url;
  });
}

export async function preloadLegendaryWonderArt(): Promise<void> {
  await Promise.all(LEGENDARY_WONDER_ART_IDS.filter(id => !cache.has(id)).map(async id => {
    const path = getLegendaryWonderArtPath(id);
    if (!path) return;
    try {
      cache.set(id, await loadImage(resolveAppAssetUrl(path)));
      notifyCanvasAssetReady();
    } catch { /* canvas fallback stays in effect */ }
  }));
}

export function getLegendaryWonderArtImage(wonderId: string): HTMLImageElement | null {
  return cache.get(wonderId) ?? null;
}

export function resetLegendaryWonderArtForTests(): void { cache.clear(); }
```

- [ ] **Step 4:** loader tests + `canvas-asset-ready.test.ts` + `tests/renderer/sprites/png/` PASS (the `appBase` delegation must not change PNG unit behaviour).
- [ ] **Step 5: Commit** `feat(renderer): legendary wonder art loader and shared asset-url helper (#613)`.

### Task 3: Draw art on the map, keep fallback

**Files:**
- Modify: `src/renderer/wonders/legendary-wonder-renderer.ts` (before the `bespokeAsset` block, ~line 163)
- Modify: `tests/renderer/legendary-wonder-renderer.test.ts` (add `drawImage` to `MockCanvasContext`)

**Interfaces:** Consumes `getLegendaryWonderArtImage`.

- [ ] **Step 1: Failing tests** (mock `drawImage(_i, x, y, w, h)` pushes `image:x:y:w:h`; seed the cache with the stub `Image` through the loader; `afterEach` resets): (1) each of the six, art cached + `completed` → exactly one `image:` op and **no** `bespoke:` op; (2) not cached → `bespoke:<id>-bespoke`, no `image:`; (3) `under-construction` with art cached → neither op; (4) `reducedMotion` true/false → same source; (5) `eiffel-tower` with art cached for another id → bespoke draw; (6) image box centred on `(cx, cy)` with half-extent ≤ `radius * 3 * max(1, scale)`; (7) the glyph's `globalAlpha`/`save`/`restore` state is unchanged after drawing.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
const art = getLegendaryWonderArtImage(metadata.wonderId);
if (art) {
  const half = radius * 0.72 * metadata.scale * 1.25; // sprites carry ~15% transparent padding; tune in Task 6
  ctx.drawImage(art, cx - half, cy - half, half * 2, half * 2);
  return;
}
```

No scheduler call (`renderer-invalidation.md`): drawing sits inside `withAmbientBounds`, and static art adds no `markTimeVaryingPaint`. Note: the old motion glints on these six no longer play when art is present — acceptable (static PNG), but say so in the PR body.
- [ ] **Step 4:** PASS; run `./scripts/dev.sh test tests/renderer/` (includes `paint-clock-boundary`, `render-loop-invalidation-boundary`).
- [ ] **Step 5: Commit** `feat(renderer): draw production art for Era 5-7 wonders with canvas fallback (#613)`.

### Task 4: Preload + DOM thumbnails

**Files:**
- Modify: `src/app/controllers/game-session-controller.ts` (add `preloadLegendaryWonderArt().catch(() => {});` after line 268 + import)
- Create: `src/renderer/wonders/legendary-wonder-art-thumbnail.ts`
- Create: `tests/ui/legendary-wonder-thumbnail.test.ts`

**Interfaces:**
- Produces: `legendaryWonderIdFromQueueItem(itemId: string): string | null` (strips exactly one `legendary:` prefix; `null` otherwise); `createLegendaryWonderThumbnail(wonderId: string, sizePx: number): HTMLImageElement | null` (`src = resolveAppAssetUrl(path)`, `alt=""`, `aria-hidden="true"`, `width/height = sizePx`, `dataset.wonderArt = wonderId`, `style.imageRendering = 'pixelated'`, `loading` default; `null` when `getLegendaryWonderArtPath` is null).

- [ ] **Step 1: Failing tests:** six ids → `<img>` with `src` ending `images/wonders/art/<id>.png`, `alt === ''`, `getAttribute('aria-hidden') === 'true'`, no `onload`/`onerror` attributes; `eiffel-tower`, `''`, `'legendary:'`, `'legendary:nope'`, `'warrior'`, `'legendary:legendary:crystal-palace'` → `null` from both helpers' composition; `legendaryWonderIdFromQueueItem('legendary:crystal-palace') === 'crystal-palace'`; `sizePx` ≤ 0 or non-finite → `null`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** `./scripts/dev.sh test tests/app/` (architecture boundaries). If the new controller→renderer import needs a baseline entry, follow the #1456 precedent (commit `d8a3d531`) rather than suppressing.
- [ ] **Step 6: Commit** `feat(ui): legendary wonder thumbnail helper and preload (#613)`.

### Task 5: Use the thumbnail on chooser, queue, wonder panel, Codex

**Files:**
- Modify: `src/ui/city-panel.ts` (chooser ~953; "Producing:" ~1014; queue rows ~1075; locked list ~915/1742), `src/ui/wonder-panel-view.ts` (~297), `src/ui/wonder-codex-page.ts` (~98)
- Modify tests: grep `tests/ui` for the city-panel, wonder-panel and codex test files before editing.

**Interfaces:** Consumes Task 4's helpers. `getProductionIconForItem` keeps returning an emoji string (non-DOM callers use it); thumbnails layer on top in UI code.

- [ ] **Step 1: Player truth table (required by `docs/superpowers/plans/README.md`)**

| Before | Action | Immediate visible result |
|---|---|---|
| Chooser lists Crystal Palace with 🏗️ | Panel opens | Crystal Palace row shows its art; non-art wonders still show 🏗️ |
| Crystal Palace row with art | Tap "add to queue" | Queue row shows the same art; panel rerenders (existing handler) with art intact |
| Queue head is `legendary:suez-canal` | Turn ends, panel rerenders | "Producing:" line keeps the art; no flash back to emoji |
| Wonder with art, completed | Open wonder panel / Codex | Same art beside the title; Codex still shows its attributed photo and credit link |

Misleading-UI check: art appears only where that wonder's name is already shown to `state.currentPlayer`; never for an id the panel is not already listing. Replay path in tests: render → add → rerender → remove → rerender, asserting the thumbnail each time.

- [ ] **Step 2: Failing tests** per surface: in-scope wonder shows exactly one `img[data-wonder-art="<id>"]` and not 🏗️ in that row; out-of-scope wonder shows no `img` and the unchanged emoji (byte-identical row); art survives rerender after add/remove; hot-seat switch to a player who cannot see the wonder shows no thumbnail for it.
- [ ] **Step 3:** Implement. In `city-panel.ts` rows are HTML template strings: emit `<span data-wonder-thumb="${id}"></span>` where the emoji was, and fill it after `innerHTML` is set via `createLegendaryWonderThumbnail`; when it returns `null`, put the existing emoji text node in the span. Do not interpolate ids into attributes beyond catalog-validated ids (`legendaryWonderIdFromQueueItem` then `getLegendaryWonderArtPath` must both accept it).
- [ ] **Step 4:** PASS the three UI test files and `./scripts/dev.sh test tests/ui/`.
- [ ] **Step 5: Commit** `feat(ui): show Era 5-7 wonder art in chooser, queue, wonder panel and Codex (#613)`.

### Task 6: E2E / visual coverage and manual QA

**Files:**
- Create: `tests/e2e/issue-613-wonder-art.spec.ts`
- Edit: remove the six `// TODO(art): …` lines in `legendary-wonder-bespoke-assets.ts`, replacing each with `// Fallback only: production art is public/images/wonders/art/ (#613).`

- [ ] **Step 1:** Re-grep and edit the six comments (lines ~798, 832, 872, 913, 957, 990 at plan time). The other seven stay.
- [ ] **Step 2: E2E** (model on `issue-1439-ambient-paint.spec.ts`): *success* — scenario with all six completed, wait for the asset-ready signal, screenshot the six tiles at normal and 375×812 zoom on grass, desert and dark-ocean terrain, reduced-motion on/off, snapshot compare; assert corner pixels of each drawn glyph box are transparent (art not opaque-boxed). *Fallback* — `page.route('**/images/wonders/art/*.png', r => r.abort())` → all six draw the canvas fallback (assert via the existing `bespoke:` op/snapshot), no uncaught errors. *Idle* — after art loads the loop returns to idle.
- [ ] **Step 3:** `./scripts/dev.sh web-smoke` + the new spec; commit snapshots.
- [ ] **Step 4: Manual QA** in the built-in browser (`preview_start`; **`preview_stop` immediately after** — audio plays through real speakers): each wonder at normal/mobile zoom, light and dark terrain, reduced motion; load once, go offline, reload → art still present (service worker); confirm Admiralty/Crystal Palace contrast on ocean tiles and decide `imageSmoothingEnabled` and the `1.25` scale. If a sprite reads poorly, regenerate it (1 token each, 19 left) and update its provenance record.
- [ ] **Step 5: Commit** `test(e2e): Era 5-7 wonder art success and fallback paths (#613)`.

### Task 7: Licence gate, docs, lifecycle, verification, PR

**Files:**
- Modify: the six `design/wonder-art/*.provenance.json` (`licence_note`), `docs/sprite-design-system.md` (Legendary Wonders section ~263–275; surfaces ~100–110), `.claude/rules/sprites.md` (new "Legendary wonder art" recipe: PNG + id in catalog + provenance + test; canvas draw stays as fallback), `docs/docs-lifecycle-manifest.json`.

- [ ] **Step 1: Ask the owner to confirm Sprite-AI's current terms** (the SpriteCook precedent in `cavalry.provenance.json` shows the expected form), then replace each `UNCONFIRMED…` note with the confirmed statement and date. Do not write a confirmation the owner has not given. Task 1's test goes green.
- [ ] **Step 2:** Docs edits: the six wonders now have art; loader/fallback behaviour; add-another-wonder recipe; the "Known art gaps" list; remove "No map sprites yet" wording that is now false. `./scripts/dev.sh docs-lifecycle` PASS.
- [ ] **Step 3:** `./scripts/dev.sh verify-impact` → run everything it lists.
- [ ] **Step 4:** `./scripts/check-src-rule-violations.sh src/renderer/wonders src/renderer/asset-url.ts src/renderer/sprites/png/png-sprite-html.ts src/ui/city-panel.ts src/ui/wonder-panel-view.ts src/ui/wonder-codex-page.ts src/app/controllers/game-session-controller.ts`
- [ ] **Step 5:** `./scripts/run-wonder-regressions.sh`, `./scripts/dev.sh build`, full tests (`./scripts/dev.sh test-all`, or `yarn test:durable` then `test:durable:status`) all exit 0.
- [ ] **Step 6:** Delete this plan file and its manifest entry (list under `deleted` as `delivered-stale`) in this same PR. `./scripts/sync-main.sh`, `./scripts/push-branch.sh` (timeout 1 800 000 ms), PR body via `./scripts/pr-body.sh` ("Closes #613" is correct here — this PR completes it; mention the lost motion glints and the known art gaps). Then ccd_pr `get_status` / `bind_pr`.

---

## Self-review

- **Spec coverage:** six production assets in the normal path (T2, T3; assets already present); offline fallback kept and tested (T2, T3, T6); chooser/queue/Codex/wonder panel/map coherence (T3, T5); local, optimised, attributed, no active content (T1 contract + provenance + licence gate; PNGs cannot carry script); loader/catalog tests and snapshots for success and fallback (T1, T2, T3, T6); manual QA incl. mobile, dark/light, reduced motion, offline (T6); TODOs and sprite docs (T6, T7); validation commands (T7).
- **Placeholders:** none. One real external dependency is stated explicitly: owner confirmation of Sprite-AI's terms (T7 Step 1), enforced by a failing test until done.
- **Type consistency:** `LEGENDARY_WONDER_ART_IDS`, `getLegendaryWonderArtPath`, `resolveAppAssetUrl`, `preloadLegendaryWonderArt`, `getLegendaryWonderArtImage`, `createLegendaryWonderThumbnail`, `legendaryWonderIdFromQueueItem` are used identically throughout.
- **Risks:** `city-panel.ts` line numbers drift (re-grep `getProductionIconForItem`); UI test file names in T5 must be grep-confirmed; the architecture-boundary test may want a baseline (T4 Step 5); 128 px pixel art downscaled to ~30 px may shimmer — decided in T6 QA.
