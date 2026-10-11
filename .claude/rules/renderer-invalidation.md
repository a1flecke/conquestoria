# Renderer Invalidation (#1439)

The campaign canvas is **idle-aware**: `RenderLoop` paints once, then queues frames only while something
needs them. A new visual feature must reach the canvas through a known observable owner, never through a
free-floating "refresh" call the author has to remember. Background and measurements:
[`docs/renderer-idle-redraw-audit.md`](../../docs/renderer-idle-redraw-audit.md).

## Pick one owner for a new canvas-visible input

| The input is… | Use | What wakes the renderer |
|---|---|---|
| Authoritative game state | `GameSession` `commit`/`update`/`batch` (the bootstrap subscriber calls `RenderLoop.setGameState`) | `setGameState` → `invalidate` |
| Selection, highlights, journey path, overlay or preview state | a `RenderLoop` setter (the field is private) | the setter calls `invalidate` |
| Camera position, zoom, viewport, fling | a `Camera` method or accessor | `camera.onChange` |
| A timed visual (flash, pulse, movement) | `RenderLoop.playEffect` / `animateUnitMove` | enrolment invalidates; the wake timer completes it on time |
| An image the canvas draws | call `notifyCanvasAssetReady()` where the loader commits the image | coalesced `onCanvasAssetReady` |
| Canvas size / DPR | `RenderLoop.resizeCanvas` | `invalidate` |
| Motion driven by the wall clock (a pulse, a shimmer) | call `markTimeVaryingPaint()` where the motion is applied, only when motion is allowed | the paint keeps frames alive while it is drawn |

## What enforces it

| Contract | Mechanism |
|---|---|
| Every camera write publishes | `Camera` fields are accessors; `camera-observable.test.ts` |
| A `RenderLoop` method that changes a canvas input calls `this.invalidate()` | AST scan in `tests/renderer/render-loop-invalidation-boundary.test.ts` |
| Only `RenderLoop` constructs the camera and the effect queue | same file, plus the `effect-timeline-has-one-importer` rule in `tests/app/architecture/rules.ts` |
| Every canvas image cache announces readiness | `canvas-asset-ready.test.ts` fails any `src/renderer` module that creates an `Image` without importing the signal |
| Time-varying visuals report to the scheduler | `paint-clock-boundary.test.ts` fails any `src/renderer` module that does arithmetic on `nowMs` without importing `paint-clock` |
| The loop really is idle, and wakes on input | `tests/e2e/issue-1439-renderer-idle.spec.ts` (deterministic redraw counts, no CPU thresholds) |

## Rules

- Do not call a scheduler or "mark dirty" method from a controller. If a controller needs the canvas to
  change, the state it changes must live behind one of the owners above.
- Time-bound work (movement end, effect end, death-snapshot or transient expiry) must complete from
  `RenderLoop.advance()`, never from inside a draw routine, so a skipped or hidden frame cannot strand a
  callback. Add its deadline to `nextDeadlineMs()`.
- An invalidation raised during a paint or a completion callback must survive it: the scheduler compares the
  generation read before painting, never a cleared dirty flag.
- Do not weaken animation to make idle numbers look better. Ambient motion (e.g. an animated wonder) is a
  genuine time-varying visual; a frame-rate cap is a separate, measured product decision.
