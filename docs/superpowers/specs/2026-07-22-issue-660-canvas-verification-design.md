# Issue #660 Canvas Verification Design

**Date:** 2026-07-22

**Issue:** [#660 — Harden fragile browser-driven verification of canvas render changes](https://github.com/a1flecke/conquestoria/issues/660)

**Status:** Approved and reviewed design; implementation not started

## Goal

Make Canvas 2D render changes verifiable through deterministic unit and browser tests without replaying the full new-game flow or relying on screenshots and raw canvas coordinates.

The design also closes the drift paths that allowed production and status badges to share a glyph or overlap geometrically, while preserving the intentionally dormant v2 building-sprite catalog for its planned future use.

## Root Cause

The renderer has no shared, renderer-aware browser-test boundary.

- Canvas output is invisible to DOM queries. The existing browser probe captures selected `fillText` calls, but production badges now use `drawImage`.
- Fixture installation, legacy campaign entry, and coordinate conversion are copied between e2e specs.
- The copied coordinate helper uses hex size `48`, while the live `Camera` uses `32`; the test geometry has already drifted from production geometry.
- The sole save fixture contains a city producing a granary, but no browser test can identify the corresponding sprite draw.
- City badge meanings and production fallback glyphs are independently authored. A cached warrior sprite avoids the `⚔️` collision, but the loading fallback still uses `⚔️`, so the collision remains possible before sprite loading completes.
- Badge anchors are independently authored. The production/religion pair and status/loyalty pair occupy overlapping upper-corner bounds at current sizes even though comments claim the badges do not collide.
- `initSprites()` is deliberately non-blocking in `startGame()`. A browser test that merely waits for campaign entry can therefore observe either the text fallback or the final sprite depending on timing.
- The render loop draws continuously. An always-on, unfiltered operation recorder would grow without bound and collect unrelated terrain, unit, and animation operations.
- The issue-365 design history explains why v2 buildings are dormant, but current catalog tests do not encode that boundary or force future integration to update the live consistency/observability contract.

Browser-tool timeouts, downscaled screenshots, intermittent page-tree reads, and missing accessibility nodes for canvas entities are environmental constraints. They are context for the design, not repository defects to repair.

## Scope

### In scope

- Shared Playwright helpers for fixture loading, deterministic campaign entry, canvas-operation capture, and hex coordinate conversion.
- Canonical production-badge scenarios for a building, unit, and legendary wonder.
- An e2e-mode-only direct campaign-entry seam that reuses production normalization and startup behavior.
- Explicit game-ready, sprite-ready, and rendered-frame synchronization without fixed sleeps.
- Bounded, filterable browser assertions for `fillText` and `drawImage` operations.
- Stable metadata that lets a captured image operation identify its sprite kind, item ID, and civilization.
- Unit operations-log coverage as the required first line for canvas render changes.
- Collision-safe city production fallbacks, shared badge layout, and anti-drift coverage for live badge meanings and bounds.
- Consistency tests for the live building catalogs.
- Documentation of the canvas-testing convention and known browser-tool constraints.
- A sentinel that fails when v2 building entities become live, forcing this contract to be revisited.

### Out of scope

- Implementing v2 building entities or choosing their eventual player-visible surface.
- Removing the v2 building assets, lookup, overlay layer, or `SpriteEntity.kind === 'building'` support.
- A screenshot-diff or full visual-regression pipeline.
- Repairing external browser-automation behavior.
- Re-centering the camera on viewport resize. That is useful UX work but independent of render observability and should be handled separately.

## Non-Negotiable Invariants

- Normal web and Tauri builds expose no e2e state-entry or diagnostic API.
- The e2e path accepts no JSON or state payload from the URL or a callable global; it may only enter the autosave already installed in the isolated browser context.
- The live Continue/save-panel path remains wired and retains at least one browser integration test.
- Fixture transforms derive the active civilization and city from `state.currentPlayer`; they never hardcode `player` or `cities[0]`.
- Tests never mutate the shared parsed fixture object. Every scenario starts from a fresh structured clone.
- Capturing canvas operations never changes the result or exception behavior of the native canvas method.
- Production-menu icons, names, queue ordering, progress, and ETA behavior remain unchanged. Only the temporary map fallback and overlapping badge anchors change visibly.

## Architecture

### 1. Shared e2e harness

Create focused modules under `tests/e2e/helpers/`:

- `save-fixture.ts` reads the canonical fixture once, returns a fresh structured clone for every test, applies a typed scenario transform, and installs the result before navigation.
- `campaign-entry.ts` supports explicit `direct` and `ui` entry modes and waits for named readiness phases.
- `canvas-ops.ts` installs dormant canvas probes before application code runs, controls bounded capture sessions, and exposes typed operation queries.
- `render-geometry.ts` asks the e2e runtime for visible screen positions for a canonical hex and rendered bounds for a named city-badge slot. It contains no layout formula or renderer constant.

Issue-365, issue-437, and issue-447 specs move to these helpers. They must not retain local copies of fixture installation, campaign continuation, fixed sleeps, or pointy-hex math. A focused campaign-entry smoke test continues through the real Continue button so extracting the harness does not leave the player path covered only by isolated unit tests.

### 2. E2E-only campaign-entry bridge

Playwright starts Vite with `--mode e2e`; ordinary `yarn dev`, web builds, and Tauri builds do not use that mode. Direct entry requires both conditions:

- `import.meta.env.MODE === 'e2e'`;
- the URL contains the exact opt-in query `?e2e=autosave`.

`main.ts` uses a direct `import.meta.env.MODE === 'e2e'` branch so Vite/Rollup can eliminate the dynamic import from other modes; a pure helper validates the exact query inside that branch. The runtime accepts no state argument. It may only load the autosave already installed by `page.addInitScript` in Playwright's isolated browser context.

The bridge must reuse the canonical load path:

1. `init()` creates the normal UI and loads settings.
2. The e2e runtime calls `loadMostRecentAutoSaveEntry()`, which performs production save normalization.
3. It rejects a missing/invalid opponent challenge or a hot-seat save with a diagnostic; direct entry never chooses a migration value or bypasses the private turn-handoff veil.
4. It calls the same `enterCampaign()` boundary as the live save-panel callbacks.
5. If either e2e gate is absent, initialization continues to `showStartSavePanel()` unchanged.

Implement the pure gate in `src/testing/e2e-mode.ts` and the dynamically loaded runtime in `src/testing/e2e-runtime.ts`, with mirrored unit tests. `main.ts` passes the runtime only the closures it needs for canonical autosave entry, readiness observation, and renderer-owned coordinate queries.

The runtime exposes one frozen, read-only diagnostic object only in e2e mode. It reports readiness/errors and delegates visible-hex and named city-badge-slot geometry queries to the live renderer. Badge geometry is returned only for city render items visible to the current viewer. The runtime does not expose `gameState`, `renderLoop`, `camera`, mutation functions, storage writers, canvas-capture controls, or an arbitrary state loader. Canvas capture is a separate Playwright-owned global installed solely by `page.addInitScript`; it is not production-source functionality.

Normal web and Tauri builds must not contain the diagnostic global's sentinel name. Add one `scripts/assert-no-e2e-runtime.mjs` check over emitted JavaScript and source maps and invoke it from both `build` and `build:tauri` after Vite emits `dist`. Script-level tests prove it fails on a synthetic leaked sentinel and passes without one. Unit coverage separately proves the mode/query predicate rejects `production`, ordinary `development`, missing-query, and wrong-query cases.

### 3. Readiness and sprite loading

The e2e runtime exposes monotonic readiness states:

- `campaign-ready`: normalized state has entered `enterCampaign()`, the renderer owns that state, the camera has been centered, and the render loop has scheduled rendering;
- `sprites-ready`: the `initSprites()` promise for all civilizations has fulfilled;

Production remains non-blocking: the game renders its fallback while sprites load. The implementation retains the `initSprites()` promise so e2e diagnostics can observe completion without delaying player startup. A sprite-load rejection records a diagnostic error and leaves the production fallback visible; it must not prevent campaign entry. Tests expecting `drawImage` require successful `sprites-ready` and fail with the recorded loader error instead of racing the fallback.

After the required state, the capture helper waits through two successive `requestAnimationFrame` callbacks, then freezes the session. Because the game render loop continuously requeues itself, this guarantees at least one complete render opportunity without exposing or modifying its private tick. All helpers use condition-based waits; the existing `waitForTimeout(500)` calls are removed.

### 4. Canvas operation capture

The browser helper patches `CanvasRenderingContext2D.prototype.fillText` and `drawImage` through `page.addInitScript`, before the application creates its rendering context.

The patch is dormant by default. A capture session:

1. clears previous operations and overflow state;
2. selects canvas IDs, operation kinds, text values, and/or sprite metadata of interest;
3. enables capture;
4. waits for a complete frame after the required readiness phase;
5. freezes capture before returning operations.

The buffer has a fixed maximum. Reaching it sets `overflowed: true` and stops recording; assertions fail with an overflow diagnostic rather than silently dropping evidence. Tests assert presence or absence within a captured frame, not an exact total across the continuously running render loop.

Captured operations use a discriminated union:

- shared fields: capture-session ID, sequence, canvas ID, current transform, canvas backing dimensions, and CSS bounding rectangle;
- text operation: text, raw and viewport-normalized anchor position, optional maximum width, font, alignment, and baseline;
- image operation: raw destination rectangle, viewport-normalized destination polygon/bounds, source rectangle when supplied, and sprite metadata when the source is a catalog image.

Viewport normalization applies `ctx.getTransform()` and the backing-store-to-CSS scale, then offsets by the canvas bounding rectangle. This keeps assertions correct under device-pixel ratio, camera zoom, canvas resizing, and future canvas transforms. Image bounds transform all four destination corners rather than assuming scale-only matrices. Text assertions use the normalized anchor and the renderer-owned semantic slot bounds; the browser helper does not guess an emoji's platform-dependent ink box.

The probe delegates with `Reflect.apply()` using the original argument list, thereby preserving the two `fillText` forms and all three standard `drawImage` overloads. Instrumentation parsing is isolated so its own failure records a diagnostic but cannot block the native call. An unknown argument shape is recorded and still delegates unchanged. A prepared operation is committed to the buffer only after the native call succeeds, so failed draws are not reported as rendered. Native return values and thrown errors are preserved exactly.

Catalog images receive stable diagnostic metadata when created by the sprite loader:

- sprite kind: `unit`, `building`, or `landmark`;
- canonical item ID;
- civilization or neutral palette identity;
- motion where applicable.

Metadata is attached to the in-memory `HTMLImageElement` before its load promise resolves. It contains catalog identity only—no game-state or player-secret data. The e2e assertion identifies the production draw from metadata plus its normalized destination near the expected city. It must not depend on a revoked blob URL, opaque object identity across the page boundary, or screenshot pixels.

### 5. Fixture strategy

Keep the existing crowded-map save as the canonical base fixture. A common transform applied to a fresh clone adds a valid `opponentChallenge: 'standard'` for direct-entry scenarios without rewriting or mutating the shared legacy source object. This preserves the fixture's usefulness for the separately tested legacy migration path.

Create small, typed scenario builders rather than copying the full save:

- current-player city producing `granary`;
- current-player city producing `warrior`;
- current-player city validly building `legendary:standing-stones`, which intentionally uses the map construction glyph.

The builder selects a visible city owned by `state.currentPlayer` by ID/predicate, never by `civilization.cities[0]`. Building and unit scenarios validate their definitions before replacing only the queue head and progress required by the test.

The legendary-wonder scenario must be internally valid, not merely a stray queue string. Its builder adds `animism` and `mud-brick`, adds the stone reveal technology `gathering`, grants a non-expired marketplace stone source, and records discovery of one existing fixture village for the current player. It then initializes the city's project through `initializeLegendaryWonderProjectsForCity()`, asserts the project reached `ready_to_build`, transitions it through `startLegendaryWonderBuild()`, and asserts both the `building` project phase and `legendary:standing-stones` queue head before serialization. If the canonical helpers reject the scenario, fixture setup fails rather than bypassing wonder invariants.

This keeps scenarios reviewable while still exercising a real normalized save through the live renderer.

This is an intentional, approved deviation from issue #660's example of separate `city-producing-building.json` and `city-producing-unit.json` files. The named builders are the canonical fixtures and avoid duplicating a roughly 15,000-line save; their output and invariants are directly unit-tested.

### 6. Coordinate ownership

Tests must not maintain pointy-hex constants or layout formulas.

The read-only e2e diagnostic accepts a canonical hex coordinate and returns every visible wrapped copy as viewport CSS coordinates. Inside the renderer closure it composes the production `getHorizontalWrapRenderCoords()`, `hexToPixel()`, and `Camera.worldToScreen()` behavior. A second query accepts a visible city ID and semantic badge slot and composes the same city render-item projection with `getCityBadgeLayout()`. Tests do not receive camera internals and do not reimplement either transform.

Tests that click relative to an already-located DOM sprite may continue to use that sprite as an anchor, but the destination comes from the shared visible-copy query. The helper chooses the copy nearest the anchor when horizontal wrapping produces multiple results. No literal `32`, `48`, `sqrt(3)`, `1.5`, camera offset, or zoom formula belongs in e2e specs.

## Badge Anti-Drift Contract

Production catalog emojis are useful labels in menus and cannot be globally unique; multiple units and buildings intentionally share symbols. The anti-drift rule therefore applies to simultaneous city-map badge meanings, not to every catalog label.

Introduce `src/renderer/city-badge-presentation.ts`, a pure city-badge presentation module with two responsibilities:

- semantic glyph fallbacks for under siege, breakaway, occupation, unrest, idle production, world pressure, loyalty pressure, intel, and production;
- named layout slots and bounds for status, production/idle, left/right intel, world pressure, loyalty pressure, and religion.

Status meanings are mutually exclusive because the status pass selects one branch. Production and idle are mutually exclusive because idle production requires an empty queue. The collision test uses an explicit coexistence matrix so intentional reuse inside mutually exclusive meanings is allowed while simultaneously visible meanings remain distinguishable.

The city production pass follows this decision table:

| Queue head | Sprite ready | Rendered badge |
|---|---:|---|
| Building | Yes | Building sprite |
| Trainable unit | Yes | Unit sprite |
| Building or unit | No | `🏗️`, the generic city-map production/loading glyph |
| Legendary wonder or other intentionally unsprited item | Not applicable | Construction glyph |

`PRODUCTION_ICONS` and `getProductionIconForItem()` remain unchanged for the city panel, chooser, and queue. The map renderer no longer uses an item's catalog emoji as its sprite-loading fallback; it uses the single `🏗️` production meaning. Thus a player retains the specific icon and name in the panel while the map shows an unambiguous temporary construction state.

The generic production glyph must not equal any glyph belonging to a semantically distinct badge that can coexist with production. Separately, the layout resolver must produce non-overlapping bounds for every coexistence combination. Anchors and bounds are expressed as linear factors of `item.size`, so disjointness is proven in normalized space and checked at sizes derived from a real `Camera` instance's minimum and maximum zoom. Image-backed famine/religion badges participate in the bounds test even though they do not participate in glyph uniqueness.

Tests must prove:

- `production !== underSiege`, which fails with the original `⚔️` production fallback;
- all pairs marked as coexistent have distinct semantic glyphs when both are text-backed;
- all coexistent badge bounds are disjoint, including production/religion and status/loyalty;
- mutually exclusive meanings such as production/idle and the individual status branches are not falsely rejected;
- catalog glyph reuse outside simultaneous city-map badge categories remains allowed;
- cached building and unit sprites suppress their text fallback;
- uncached building and unit sprites use the collision-safe production fallback;
- intentionally unsprited wonders still render the production construction glyph.

## Player-Visible Behavior and UX

| Situation | City panel/queue | Strategic-map result |
|---|---|---|
| Granary queued, sprite loading | Specific granary icon, name, progress, order, and ETA remain unchanged | Temporary `🏗️` in the production slot |
| Granary sprite ready | Unchanged | Granary sprite replaces `🏗️` on a later frame |
| Warrior queued while city is under siege | Specific warrior icon and queue details remain unchanged | Warrior sprite or `🏗️` in production slot; distinct `⚔️` in status slot; bounds do not overlap |
| Legendary Standing Stones queued | Existing legendary-wonder name/icon and queue details remain unchanged | `🏗️` in production slot |
| Queue empty with idle conversion | Existing idle-production UI remains unchanged | Existing gold/science idle badge in the mutually exclusive production slot |

There is no queue mutation, new action, panel filtering, or recommendation surface in this change. Existing active item, follow-up order, progress, ETA text, and lower-ranked catalog reachability must remain unchanged. Unit tests verify the state is not mutated by badge presentation, while existing city-panel queue interaction regressions remain green.

Rendering must continue to key sprite lookup and visibility to `state.currentPlayer` and the actual city owner. The new registry/layout helper is presentation-only and receives already viewer-safe `CityRenderItem` data; it must not read richer state or introduce a new privacy path.

## Building Catalog Contract

The live production path currently depends on:

- `BUILDINGS` for canonical building definitions;
- `PRODUCTION_ICONS` through `getProductionIconForItem()` for city-panel and queue labels;
- `BUILDING_SPRITE_CATALOG` for Canvas image generation and production badges.

Existing tests already prove that every `BUILDINGS` key has a production icon and v1 sprite. Consolidate or extend that coverage instead of duplicating it, and add the missing exact-set assertions:

- `Object.keys(BUILDINGS)` is a subset of `Object.keys(PRODUCTION_ICONS)`; additional production-icon keys are expected because that catalog also contains trainable units and non-building production items.
- `Object.keys(BUILDING_SPRITE_CATALOG)` equals `Object.keys(BUILDINGS)` plus the named retained building-scale asset allowlist: `pyramids`, `colosseum`, `great_library`, `lighthouse`, and `wright-flyer`.
- Every allowlisted extra resolves to a non-empty sprite and carries a comment explaining that it is not a canonical `BUILDINGS` ID.

The current audited counts are 158 canonical buildings, 229 production icons, and 163 v1 building-sprite entries. Tests assert relationships and named IDs, not the counts, so legitimate catalog growth does not require updating arbitrary totals.

### Dormant v2 building sentinel

The v2 building sprite catalog is preserved for planned future integration. Issue #365 deliberately removed full-size building entities from the strategic map, so #660 must not revive them indirectly.

The sentinel has two parts:

1. The existing functional e2e assertion that `#building-sprites` has no children after a real campaign render receives an actionable failure message.
2. A narrow source-usage architecture test allows the v2 building lookup only in its defining module and the intentionally dormant `SpriteOverlay` lookup branch. Existing v2 unit tests continue to verify that serialized building assets resolve. A new panel/preview source import fails until the integration updates #660's catalog and observability contract.

Together they detect both ways planned integration can become live: feeding the existing strategic-map `building` entity path or consuming the v2 lookup from a new surface. The failure message documents that:

- v2 building assets and lookups exist;
- no live renderer currently emits building entities;
- when a planned surface starts emitting them, the implementer must update the catalog-consistency boundary and canvas/DOM observability coverage introduced by #660.

The architecture test scans TypeScript source under `src/**` only for the exact `getBuildingSpriteV2` identifier, excluding generated `*.svg.ts` assets; it does not scan documentation, fixtures, build output, or arbitrary file contents. It is a deliberate temporary boundary test and should be removed or rewritten when the planned integration lands.

This sentinel is preferable to a duplicate tracking issue because the v2 overlay plan and the later issue-365 strategic-map decision already document the intended work and its revised presentation boundary.

This is the approved replacement for issue #660's proposed three-way catalog equality test. Treating a deliberately partial, dormant v2 asset set as live would either fail permanently or require a broad allowlist that hides real drift. Live catalogs receive exact relationship tests now; v2 receives a tripwire that forces those relationships to be redesigned when it gains a real consumer.

## Test Strategy

### Unit tests: first line

Operations-log renderer tests remain mandatory for every canvas-render change. The production-badge suite covers the complete decision table without a browser and asserts draw ordering, sprite lookup ownership, draw operation type, and fallback behavior.

Additional unit coverage verifies:

- badge-glyph coexistence and layout-bound collision rules, including negative/mutually-exclusive cases;
- live building-catalog subset and exact-extra relationships without duplicating existing coverage;
- sprite diagnostic metadata for building, unit motion, and neutral landmark images;
- fixture builders return independent states, derive ownership from `currentPlayer`, reject missing definitions, and produce a consistent legendary-wonder project/queue pair;
- Playwright config resolves both CI and local dev-server commands with `--mode e2e`;
- e2e mode/query gating rejects normal development, production, Tauri, missing-query, and wrong-query inputs, and direct entry rejects hot-seat state;
- renderer-owned visible-copy coordinate queries agree with `Camera.screenToHex()` for non-wrapped and horizontally wrapped cases, while badge-slot queries reject cities not rendered for the current viewer;
- a narrow e2e-source guard rejects reintroduced local `pointyHexPixel` helpers and the removed `waitForTimeout(500)` bootstrap pattern;
- capture overload parsing, transform/DPR normalization, filtering, overflow, freeze, return values, and native error propagation;
- the dormant-v2 source-use allowlist.

### Browser integration tests

One focused production-badge spec uses the shared harness and transformed canonical fixture to prove:

- building production emits a metadata-identified building `drawImage` operation;
- unit production emits a metadata-identified unit `drawImage` operation;
- legendary-wonder production emits the expected construction `fillText` operation;
- each image operation's normalized bounds intersect, and each text operation's normalized anchor lies within, the expected production slot for a visible copy of the selected city;
- building/unit sprite frames do not emit a production fallback at that slot, while the wonder frame does not emit a catalog sprite for its queue item;
- the game is entered without save-panel or migration-dialog interaction.

One separate browser smoke test installs the modernized clone, clicks the real Continue button, and proves the live save-panel callback still reaches the game. Legacy challenge choice, cancel/focus restoration, persistence failure/retry, and import ordering remain covered by the existing campaign-entry and prompt interaction tests.

The existing issue-365, issue-437, and issue-447 browser behavior remains covered after helper extraction. Issue-365 retains the functional v2 building sentinel. Mobile/reduced-motion tests set their viewport/media preferences before navigation, use direct entry, and wait for readiness before making final layout assertions; they never depend on desktop coordinates.

Screenshots may remain as debugging artifacts, but no acceptance criterion depends on visual comparison.

## Failure Handling

- Fixture transforms fail before navigation when the selected city, queue item, or canonical definition is missing.
- Direct entry fails before `enterCampaign()` when the e2e mode/query gate, autosave, opponent challenge, or solo-campaign precondition is missing; the diagnostic names the failed precondition.
- Campaign entry waits identify the missing readiness phase and include any recorded startup/sprite error rather than sleeping for a fixed interval.
- Canvas capture reports unsupported overloads and buffer overflow explicitly while still delegating to the browser implementation.
- Sprite loading failures remain visible to players through the collision-safe text fallback. Browser tests requiring image operations fail deterministically at `sprites-ready` with the loader error; they do not accept a timing-dependent fallback.
- Catalog tests identify the missing or unexpected IDs and the catalog responsible.
- The v2 sentinel failure tells the implementer which #660 contracts must be extended when building entities become live.

## Documentation

Add a `Canvas verification` section to `.claude/rules/ui-panels.md`, whose existing path scope covers renderer changes, with these requirements:

1. Canvas-rendered behavior is invisible to DOM assertions.
2. Every canvas render change ships with a unit operations-log regression.
3. Browser coverage is required when the behavior depends on real startup, sprite loading, camera integration, or canvas/DOM composition.
4. Browser canvas assertions use shared operation capture and production coordinate conversion.
5. Manual screenshots are QA evidence, not regression coverage.
6. External browser-tool quirks are documented as operational context and are not repository fix targets.

Add `docs/testing/canvas-render-verification.md` as the user-facing maintainer guide. It documents helper APIs, readiness phases, capture lifecycle and bounds, fixture-builder conventions, how to add a new sprite assertion, the dormant-v2 sentinel, and the browser-tool behaviors from issue #660. Link the guide from the new section in `.claude/rules/ui-panels.md`; because that existing rule is already indexed for both Claude and Codex renderer work, no new rule-file index entry is needed.

## Implementation Boundaries

Keep production changes small and independently testable:

- the exact-query predicate is a pure helper, while `main.ts` keeps the mode comparison literal for reliable dead-code elimination;
- the e2e runtime is dynamically imported behind the compile-time mode gate;
- readiness observation wraps the existing non-blocking sprite promise without delaying normal startup;
- canvas capture and fixture builders remain under `tests/e2e/helpers/`; only readiness, canonical entry, and viewer-safe renderer geometry queries live in the gated source runtime;
- badge glyph/layout computation is a pure renderer presentation helper consumed by every affected city badge pass;
- sprite metadata is assigned at image construction, not inferred later from cache keys or blob URLs;
- no gameplay state shape or save schema changes are introduced.

Do not expose `renderLoop`, `camera`, `gameState`, or sprite-cache mutation through `window`. The e2e diagnostic returns serialized snapshots/results only.

## Verification Matrix

Implementation is not complete until all applicable checks pass:

- `scripts/check-src-rule-violations.sh` for every changed `src/` file;
- mirrored unit tests for renderer, sprite loader, campaign entry, Vite/e2e gating, and any changed UI helper;
- `bash scripts/run-with-mise.sh yarn test:hooks` after changing `.claude/rules/**` or related hook coverage;
- the focused production-badge Playwright spec;
- the refactored issue-365, issue-437, and issue-447 specs plus the live Continue smoke test;
- `bash scripts/run-with-mise.sh yarn test:web-smoke` for the full browser suite;
- `bash scripts/run-with-mise.sh yarn build` and an assertion that the normal web bundle contains no e2e diagnostic sentinel;
- `bash scripts/run-with-mise.sh yarn build:tauri` and the same absence assertion for the Tauri frontend;
- `bash scripts/run-with-mise.sh yarn test` for the complete Vitest and hook suite.

Because the design changes renderer output, final review must inspect both `origin/main...HEAD` and the uncommitted delta and must compare the implemented badge bounds at desktop and mobile city sizes. Screenshot inspection may supplement, but cannot replace, operations assertions.

## Acceptance Criteria

- Shared e2e helpers replace copied fixture, continuation, capture, and coordinate code.
- No e2e spec contains a fixed sleep, duplicated pointy-hex math, hardcoded renderer hex size, camera offset, zoom formula, or wrap formula.
- Browser capture is opt-in, filtered, bounded, transform/DPR-aware, and records both text and image operations without changing native behavior.
- Production sprite draws can be identified by stable, non-sensitive metadata and normalized viewport bounds.
- Building, unit, and internally consistent wonder scenarios start from independent clones of one canonical fixture.
- Direct campaign entry requires e2e mode, the exact query, and a solo save; it cannot bypass hot-seat handoff, and normal web/Tauri bundles expose no diagnostic or state-entry API.
- At least one browser test continues through the real Continue button.
- Game, sprite, and rendered-frame readiness replace timing sleeps; image tests fail deterministically on sprite-load errors.
- Unit and browser tests cover the production-badge decision table.
- The production fallback cannot collide with any simultaneous city-map badge glyph.
- Simultaneous city badges have non-overlapping bounds at supported sizes, including production/religion and status/loyalty.
- Specific production icons remain visible in the city panel while the temporary map fallback is generic.
- Live building catalogs have subset/exact-extra consistency coverage with the five named retained assets.
- V2 building assets remain intact and out of scope.
- The functional and source-use v2 sentinels fail with actionable guidance when building rendering becomes live.
- The canvas-testing convention and browser-tool constraints are documented.
- Targeted, browser, web-build, Tauri-build, hook, and full-suite verification is green.

## Related Design History

- `docs/superpowers/plans/2026-06-06-sprite-overlay-renderer.md` records the planned v2 building integration.
- `docs/superpowers/specs/2026-06-12-issue-365-strategic-map-presentation-design.md` supersedes map-level building piles and preserves full-size building sprites for a future close-up surface such as panels, previews, or catalogs.
