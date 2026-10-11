/**
 * Tells the frame scheduler whether the paint it just ran drew anything that depends on the
 * wall clock (pulsing wonders, shimmering effects) (#1439).
 *
 * An idle campaign must not repaint, but a visible animated wonder must keep animating when the
 * player allows motion. A renderer that animates from `nowMs` calls `markTimeVaryingPaint()` at
 * the point it actually applies motion (not when it merely receives the clock), so the mark is
 * present exactly when the pixels depend on time. `paint-clock-boundary.test.ts` fails any
 * `src/renderer` module that computes from `nowMs` without importing this module.
 *
 * Where the motion is drawn (#1439 phase 3): a mark made inside `withAmbientBounds` is *bounded* --
 * every pixel the time-varying drawing can touch lies inside the declared circle. When every mark
 * of a paint is bounded, the next frame kept alive only by that motion may repaint just those
 * regions (`RenderLoop` clips the same full paint pipeline to them). A mark made outside any
 * scope is *unbounded* and forces a full repaint, so a forgotten bound can only cost speed, never
 * leave stale pixels.
 */
export interface PaintBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

let timeVarying = false;
let unbounded = false;
let bounds: PaintBounds[] = [];
let scope: { bounds: PaintBounds; marked: boolean } | null = null;

export function markTimeVaryingPaint(): void {
  timeVarying = true;
  if (scope) scope.marked = true;
  else unbounded = true;
}

/**
 * Runs a drawing routine whose time-varying output stays within `radius` CSS pixels of (cx, cy).
 * The radius must be generous: it is the only thing keeping a clipped ambient frame correct.
 */
export function withAmbientBounds(cx: number, cy: number, radius: number, draw: () => void): void {
  const outer = scope;
  const own = { bounds: { x0: cx - radius, y0: cy - radius, x1: cx + radius, y1: cy + radius }, marked: false };
  scope = own;
  try {
    draw();
  } finally {
    scope = outer;
    if (own.marked) bounds.push(own.bounds);
  }
}

export function beginPaintTracking(): void {
  timeVarying = false;
  unbounded = false;
  bounds = [];
  scope = null;
}

export function paintWasTimeVarying(): boolean {
  return timeVarying;
}

/**
 * The regions the finished paint's time-varying content occupies, or null when there are none or
 * any of it was unbounded (the next frame must then be a full repaint).
 */
export function paintAmbientRegion(): readonly PaintBounds[] | null {
  if (!timeVarying || unbounded || bounds.length === 0) return null;
  return bounds;
}
