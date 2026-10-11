# Renderer idle-redraw audit & phase-1 instrumentation handoff (#1439)

Working notes for the phase-2 invalidation-aware rendering scheduler. Everything
here is code-inspection plus new test/instrumentation evidence on
`opencode-1439-renderer-characterization`; nothing below is a measured CI
result.

## 1. The confirmed problem

`RenderLoop.tick()` (src/renderer/render-loop.ts) runs `camera.applyInertia()`
and then `render()` on **every** animation frame, and `render()` opens with a
full-canvas `clearRect`. There is no idle/pending-work gate: an untouched
campaign repaints ~60 times per second forever, even with reduced motion (the
default e2e context) and no input.

Local opt-in diagnostic (issue-1439-idle-campaign.perf-diagnostic.spec.ts,
crowded fixture, 5s idle window after 1s warm-up, macOS headless Chromium,
software rendering — **not** CI):

| scenario | mount | TaskDuration Δ | Script Δ | Layout Δ | RecalcStyle Δ | redraws/5s | redraws/s | JS heap |
|---|---|---|---|---|---|---|---|---|
| reduced motion (default) | 4929 ms | 4389 ms | 805 ms | 136 ms | 34 ms | 304 | 60.8 | 42.0 MB |
| motion allowed | 4839 ms | 5005 ms | 905 ms | 169 ms | 48 ms | 295 | 59.0 | 50.0 MB |

The renderer owns essentially the entire idle main thread (4.4–5.0s of task
time per 5s wall window) while drawing nothing that changes.

## 2. Invalidation sources (everything that changes what the canvas/overlay must show)

1. **Authoritative state publication** — `setGameState()` (called from
   `session.subscribe` in src/app/bootstrap.ts). Recomputes
   worldPressure/herdRoute/loyaltyPressure/religionBadge presentations,
   air-defense providers, and (only when the viewer has it enabled) the supply
   overlay presentation.
2. **Camera changes**, through three distinct paths:
   - public field writes: `camera.x/y/zoom/vx/vy` (src/input/touch-handler.ts
     sets `vx/vy` for the fling; zoom via `setZoom`), plus `pan`,
     `smoothZoom`, `centerOn`, `setViewport`, `setMinZoomForMap`;
   - `renderLoop.camera.centerOn(...)` from many controllers
     (selection-controller, map-interaction-controller, turn-presentation,
     diplomacy/knowledge panels, player-unit-actions, cross-cutting-helpers,
     game-session-controller mount/keyboard paths);
   - `resizeCanvas()` (window resize listener and hud-controller), and
     `camera.applyInertia()` itself, which mutates position every frame until
     velocity settles.
3. **Renderer presentation setters**: `setSelectedUnitId`,
   `setSelectedPirateFactionId`, `setHighlights`, `clearHighlights`,
   `setJourneyPath`, `setStrategicLaunchPreview`, `setTouchHandler`.
4. **Viewer toggles**: `toggleAirDefenseOverlay`,
   `toggleSupplyOverlay` (the latter recomputes a full-territory-tile
   presentation when enabling).
5. **Animation enrollment**: `requestWonderDiscoveryHighlight` (camera
   centerOn + timed effect), `animateUnitAppear` (disembark flash).
6. **Movement animations**: `animateUnitMove`, `animateUnitSlide`.
7. **Transient visuals**: `applyCombatVisual`, `applyDeliveryVisual`,
   `applyPirateHeadquartersAssaultVisual` (sprite-state transients and death
   snapshots).
8. **Asynchronous sprite readiness**: `SpriteCache` fills its maps after
   `img.onload`; `ensureCiv` is kicked off mid-render from `drawUnitGlyph`
   (src/renderer/unit-renderer.ts) and `initSprites` runs at mount. There is
   **no image-ready invalidation event** — today the continuous repaint hides
   this.

## 3. Rendering is not a pure operation

`render()` has gameplay/lifecycle side effects that must survive frame
skipping:

- **Movement completion callbacks** fire inside
  `drawUnitMovementAnimations()` (they are awaited by
  turn-round-replay.ts `replayAIMoves` and drive unit focus in
  selection-controller). They also fire when the authoritative unit vanished
  or the destination is unexplored (#1039) so a finished animation never
  strands a caller.
- **Timed effect completion** fires in `AnimationSystem.update()`.
- **Pirate death snapshots** (unit + landmark) are expired and deleted from
  their maps *during* render.
- `PirateSpriteStateController.resolve()` clears expired transients on read —
  documented non-pure; must run at most once per paint.
- `SpriteOverlay.sync()` mutates the DOM pool, culls stale elements, rebuilds
  `activeIds`, and its `activeIds` feed back into canvas draws (entities the
  DOM overlay owns are skipped by the canvas pass). Below the LOD zoom
  threshold it hides/clears; while pinching it defers pool mutations but still
  writes the camera transform.
- `spriteCache.ensureCiv()` starts async loads from inside the draw path.

So a "skip the frame" scheduler must keep a lifecycle/advance pass running
whenever time-based work (movement tweens, timed effects, transient/death
expiries, in-flight sprite loads) is active, even if it skips the paint.

## 4. Phase-2 invariants (what the new tests already pin down)

Characterization tests added in this phase (all passing, and mutation-checked):

- tests/renderer/render-loop.test.ts — start/stop lifecycle (immediate first
  frame, idempotent start, stop cancels the queued frame and a post-stop frame
  is inert, resume re-schedules), inertia applied before each paint, state
  publication (latest `setGameState` drives the next paint), resize →
  camera viewport + DPR transform reset, strategic-launch preview overlay
  drawn only while set, disembark flash suppressed/allowed per reduced-motion,
  timed-effect callback exactly once, movement callback exactly once across
  repeated renders, immediate callback when no state is published, cached
  motion sprite vs `spriteOverride: null` fallback wiring.
- tests/renderer/camera.test.ts — pan zoom-scaling, centerOn viewport
  centering, zoom clamping + `targetZoom` tracking, anchor-preserving
  `setZoom`, `smoothZoom` step factors (1.1/0.9 — not exact inverses),
  screen↔world and screen→hex round-trips, inertia decay-to-zero through
  zoom, sub-threshold zeroing.
- tests/renderer/render-loop-combat-sprite-state.test.ts — pirate unit death
  snapshot renders the collapse after the unit leaves authoritative state and
  disappears past `DEATH_STATE_MS`; pirate headquarters landmark snapshot
  behaves the same after the viewer's intel no longer lists it.

Phase-2 tests should additionally assert: idle-with-no-pending-work produces
zero redraws; each setter produces exactly one follow-up redraw; active
movement/inertia produces continued redraws (do **not** assert exactly one
redraw during movement); image-ready produces a redraw; resize/DPR produces a
redraw; no callback is stranded and no transient outlives its clock under
skipping.

## 5. Measurement harness

`tests/e2e/helpers/renderer-idle-perf.ts` +
`tests/e2e/issue-1439-idle-campaign.perf-diagnostic.spec.ts`, opt-in via
`CONQUESTORIA_PERF_DIAGNOSTICS=1` (excluded from default web-smoke discovery
through playwright.config.ts `testIgnore`; no thresholds, sanity assertions
only). Run with `yarn test:web-smoke:perf`. Mount span + CDP
`Performance.getMetrics` deltas (TaskDuration/Script/Layout/RecalcStyle) + a
prototype-patched `clearRect` counter on `#game-canvas` (render() issues
exactly one clearRect per frame) over a fixed 5s window. It touches no
production code, needs no GPU, and runs on ubuntu-latest runners. For a
credible before/after claim, run both variants several times on comparable
runners and report dispersion (see issue #1439 phase C).

## 6. Architectural concerns the implementation agent must resolve first

1. **Camera mutation surface.** `x/y/zoom/vx/vy` are public and written
   directly by input handlers; an invalidation scheme that only hooks methods
   will miss writes. Either migrate writers behind methods or keep a cheap
   per-tick field-delta backstop (three float compares).
2. **Advance must be separable from paint.** Callback firing and expiry
   cleanup currently live inside the paint. Split them so a skipped frame
   still completes time-based work, and keep `pirateSpriteState.resolve()`
   single-read per paint.
3. **Sprite readiness has no event.** Expose an in-flight-load signal from
   `SpriteCache` (it already tracks `civLoads`/`pirateLoad`) and treat
   in-flight loads as active work, or emit an invalidation on load resolve.
4. **Input depends on the animation window.** `hasMovingUnit` gates input
   (map-tap-intent `isAnimationLocked`); skipping must not change when a unit
   becomes interactive.
5. **Sync-side LOD/pinch decisions** are made against live camera and touch
   state inside `SpriteOverlay.sync()`; keep calling sync on camera changes
   even when the entity set is unchanged (the container transform is written
   there).
6. **Test seams.** If phase 2 needs a production seam, follow the existing
   `import.meta.env.MODE === 'e2e'` + `__CONQUESTORIA_E2E_DIAGNOSTICS__`
   sentinel pattern (guarded by scripts/assert-no-e2e-runtime.mjs). This phase
   needed none.

## 7. Smallest safe implementation sketch

Track a `dirty` flag set by every public mutator in section 2; in `tick()`,
run a fixed **advance pass** (applyInertia, expire animations/effects/
snapshots, fire callbacks, remove finished movement) and paint only when
`dirty || cameraChangedSinceLastPaint || advanceDidTimeWork ||
spriteLoadsInFlight`. Clear `dirty` after the paint. This preserves every
callback and expiry on the time-derived clock while eliminating ~60
idle repaints per second — measurable directly with the diagnostic's
`redrawCountDelta` and `taskDurationMsDelta`.

## 8. Phase 2, PR A — observable renderer inputs (#1439)

Rendering is still continuous in this change; what moved is *who knows the canvas is stale*. Every
input below now publishes a signal from inside its owner, so no controller needs to call a refresh.
`RenderLoop.renderGeneration` is the read-only counter the scheduler (PR B) repaints against.

| Input | Owner / API | Signal | Direct writers (after this PR) | Regression guard |
|---|---|---|---|---|
| Camera position, zoom, bounds, viewport, fling velocity | `Camera` accessors + methods (`src/renderer/camera.ts`) | `camera.onChange` → `RenderLoop.invalidate` | `touch-handler` (`vx/vy`, via setter), `mouse-handler`/`touch-handler` (`pan`, `setZoom`, `smoothZoom`), controllers (`centerOn`), `resizeCanvas`/`setMinZoomForMap` | `camera-observable.test.ts` — every write path publishes exactly once, no-ops publish nothing |
| Authoritative game state | `RenderLoop.setGameState` (called from the `GameSession` subscriber in `bootstrap.ts`) | `invalidate` | `bootstrap.ts` only | `render-loop-invalidation.test.ts` |
| Selection, highlights, journey path, launch preview, overlay toggles, touch handler ref | private fields on `RenderLoop`, mutated only through its setters | `invalidate` in each setter | the setters themselves (fields are private) | `render-loop-invalidation.test.ts` (table-driven) |
| Timed effects | `RenderLoop.playEffect` (the `AnimationSystem` is private) | `invalidate` on enrolment | `animateUnitAppear`, `requestWonderDiscoveryHighlight`, `player-combat-actions` | no `animations` property exists (`render-loop-invalidation.test.ts`) |
| Unit movement, combat/delivery/HQ transients | `animateUnitMove/Slide`, `applyCombatVisual`, `applyDeliveryVisual`, `applyPirateHeadquartersAssaultVisual` | `invalidate` on enrolment | those methods | `render-loop-invalidation.test.ts` |
| Canvas-backed images (sprites, terrain, wonders, rails, improvement markers, badges) | `src/renderer/canvas-asset-ready.ts` | coalesced `onCanvasAssetReady` → `invalidate` | each loader calls `notifyCanvasAssetReady()` where it commits to its cache | `canvas-asset-ready.test.ts` — source scan fails any `src/renderer` module that creates an `Image` without importing the signal |
| Canvas size / DPR | `RenderLoop.resizeCanvas` | `invalidate` | window resize listener, hud-controller | `render-loop-invalidation.test.ts` |

`TouchHandler.isPinching` is observable through `onPinchChange` (PR B); the wall-clock expiry of
pirate transients and death snapshots is handled by the scheduler's deadline wake (section 9).

New canvas-visible input? Pick one of the owners above. Do not add a free-floating `markDirty()`.

## 9. Phase 2, PR B — idle-aware scheduler (#1439)

`RenderLoop` now owns one scheduler. `start()` paints once; after every paint it queues another
frame only if (a) the generation moved during the paint (reentrant invalidation is never lost),
(b) the camera still has fling velocity, (c) a movement tween or timed effect is live, or (d) the
paint reported `markTimeVaryingPaint()`. Otherwise the RAF chain ends and the loop is dormant until
the next `invalidate()` (camera, state, presentation setter, asset-ready, resize, pinch change,
effect/movement enrolment, deadline wake).

| Concern | Owner | Notes |
|---|---|---|
| Time-driven lifecycle, separate from drawing | `RenderLoop.advance(nowMs)` | Completes movement tweens (exactly once, also for orphaned/unexplored ones, #1039), timed effects (`AnimationSystem.advance`), retires death snapshots. Runs at the top of every `render()` and from the wake timer. |
| Completion without a frame | wake timer (`armWakeTimer`) | One `setTimeout` to the earliest of movement end, effect end, death-snapshot expiry, `PirateSpriteStateController.nextExpiryMs()`. Fires `advance` then `invalidate`. Armed from `invalidate` and after every paint; cleared by `stop()`. |
| Ambient canvas animation (wonder pulse, shimmer) | `paint-clock.ts` | A renderer that applies motion from `nowMs` calls `markTimeVaryingPaint()`; reduced motion marks nothing. `paint-clock-boundary.test.ts` fails any `src/renderer` module that does arithmetic on `nowMs` without importing it. |
| DOM sprite overlay | `render()` `syncOverlay` | Re-synced when the generation moved, a movement is live, or time-bound sprite state is pending; frames kept alive only by an ambient animation reuse the last sync (cuts layout/style work ~10x in the motion-allowed fixture). |
| Pinch | `TouchHandler.onPinchChange` | Pinch start/end invalidates; `SpriteOverlay.sync` reads it. |

New canvas-visible input: pick an owner from section 8. New animation driven by the clock: import
`markTimeVaryingPaint` and call it where the motion is applied, or the boundary test fails.

Local result (macOS, headless Chromium, software rendering; crowded fixture, 5s idle window): reduced
motion 304 -> 0 redraws and ~4390 ms -> ~70 ms TaskDuration. Motion allowed still repaints ~60/s
because a visible animated wonder is a genuine time-varying visual; layout/style work fell from
~150 ms/5 s to ~17 ms. A frame-rate cap or culling for ambient frames is a separate, measured
follow-up (it changes how smooth the animation looks).

## 10. Phase 2, PR C — enforcement and CI evidence (#1439)

Enforced by the codebase, not just this document: `.claude/rules/renderer-invalidation.md` has the
new-feature recipe and the table of mechanisms. Added in PR C: an AST guard that every `RenderLoop`
method changing a canvas input calls `invalidate()`, single-owner checks for the camera and effect
queue, the `effect-timeline-has-one-importer` architecture rule, and the always-on browser regression
`tests/e2e/issue-1439-renderer-idle.spec.ts` (settled campaign repaints 0 times; zoom, drag, unit
selection and a unit move each repaint and return to rest; motion allowed still repaints on input).

### web-smoke job duration on GitHub `ubuntu-latest` (seconds)

Measured with `gh api .../jobs`; the same job was re-run on each commit (re-runs of one commit share
code, so they measure runner variance). Pre = renderer code unchanged from `main` before #1445;
post = `5f41b501` (#1446, includes #1445).

| Code | Samples (s) | n | Median | Range |
|---|---|---:|---:|---|
| Pre (`c809cb1e`, original + 4 re-runs) | 224, 357, 224, 280, 288 | 5 | 280 | 224–357 |
| Pre (earlier mains, unchanged renderer: `0a756a67` 360, `61a057e6` 348, `ebc6c0c4` 371, `17b93261` 356, `b9bd3ccc` 360) | 348–371 | 5 | 360 | 348–371 |
| Post #1445 only (`1555c324`) | 220 | 1 | 220 | — |
| Post #1446 (`5f41b501`, original + 3 re-runs) | 230, 230, 304, 191 | 4 | 230 | 191–304 |

Reading: post-change runs are lower (median 230 s vs 280 s on the same-commit controls, ~50 s or
about 18%), but the ranges overlap (a pre-change run took 224 s; a post-change run took 304 s), n is
small and runner speed varies by about 100 s on identical code. This is suggestive, not proof. The
former 340–370 s band is not seen after the change, but it was not seen on every pre-change run
either. Local, deterministic evidence is stronger: idle redraws 304 -> 0 and idle TaskDuration
~4.4 s -> ~70 ms per 5 s under reduced motion (the e2e default), and the full 24-test web-smoke
suite runs in about 1.1 minutes locally.

### Unresolved

- Mount of the crowded campaign is still ~4.2 s locally (and 14–35 s on slow CI per the issue): the
  scheduler does not change mount cost. Any mount bottleneck is a separate follow-up.
- Motion allowed keeps repainting ~60 fps while an animated wonder is on screen (genuine
  time-varying content); phase 3 (section 11) clips those frames to the animated region.

## 11. Phase 3 — ambient-only frames repaint only the animated region (#1439)

**Diagnosis** (local macOS, headless Chromium, software rendering; crowded fixture, 5 s idle window,
motion allowed, n=2): TaskDuration 4461 / 4675 ms, but ScriptDuration only 869 / 882 ms and
layout+style ~50 ms, so roughly 80% of the cost was canvas rasterisation of a full repaint at 60/s for
one animated wonder, not JavaScript or the DOM overlay.

**Change.** `paint-clock` gained `withAmbientBounds(cx, cy, radius, draw)`; the two wonder entry points
(`drawNaturalWonderLandmark`, `drawLegendaryWonderLandmarkGlyph`) declare their reach. A mark made inside
a scope is bounded; any unscoped mark is unbounded. When the previous paint's marks were all bounded and
nothing else changed since (same generation, no fling, movement, timed effect or pirate transient),
`RenderLoop.paintFrame` runs the unchanged full pipeline under a canvas clip of those regions
(`renderAmbientRegion`). Every pixel outside the clip is left as is; every pixel inside is produced by the
same z-ordered draw sequence, so the result equals a full paint. Any input still goes through
`invalidate()`, bumps the generation and forces a full paint, so viewer handoff, fog changes, camera,
resize and late assets all take the old path.

**Alternatives.** (1) A cached static world canvas plus a separate animated layer: cheapest per frame
but the wonders are interleaved with fog, cities and units in one z-order, so it needs a layered
renderer, a cache keyed on viewer/fog/camera/assets, and mobile memory for a second full-size canvas.
Rejected as too large and too risky for a hot-seat game. (2) A 15/30 FPS cap on ambient-only frames:
trivial, halves the cost, but visibly changes every animation's smoothness. Rejected. (3) Clip the
existing pipeline (chosen): no cache and no second canvas, correct by construction, and any forgotten
bound can only fall back to a full paint.

**Result** (same machine and fixture, n=2 per mode): see the PR for the table. Motion allowed:
TaskDuration 4461 / 4675 ms -> 2416 / 2388 ms; redraws unchanged at ~302 per 5 s but 301 of them are
clipped ambient paints; reduced motion unchanged (0 redraws, ~60-80 ms).

**Remaining.** ~2.4 s / 5 s still goes to the same JS draw pipeline running under the clip (script
~0.8 s) plus recording and compositing the full-size canvas each frame. Culling draw passes by the clip
rectangle would cut the JS and recording cost but needs every pass's overdraw extent proven; it is a
separate, measured follow-up.
