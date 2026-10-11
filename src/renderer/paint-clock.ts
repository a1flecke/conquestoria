/**
 * Tells the frame scheduler whether the paint it just ran drew anything that depends on the
 * wall clock (pulsing wonders, shimmering effects) (#1439).
 *
 * An idle campaign must not repaint, but a visible animated wonder must keep animating when the
 * player allows motion. A renderer that animates from `nowMs` calls `markTimeVaryingPaint()` at
 * the point it actually applies motion (not when it merely receives the clock), so the mark is
 * present exactly when the pixels depend on time. `paint-clock-boundary.test.ts` fails any
 * `src/renderer` module that computes from `nowMs` without importing this module.
 */
let timeVarying = false;

export function markTimeVaryingPaint(): void {
  timeVarying = true;
}

export function beginPaintTracking(): void {
  timeVarying = false;
}

export function paintWasTimeVarying(): boolean {
  return timeVarying;
}
