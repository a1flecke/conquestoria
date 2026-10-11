/**
 * The one signal for "a canvas-backed image became available" (#1439).
 *
 * Every cache the canvas reads (unit/building/landmark sprites, terrain and wonder tiles, rails,
 * improvement markers, crisis badges) calls `notifyCanvasAssetReady()` at the moment it commits an
 * image, so a frame painted with a fallback repaints when the real art arrives. Bursts (a whole
 * civ's sprite set resolving) coalesce into a single listener call per microtask. The
 * `canvas-asset-ready.test.ts` source scan fails any `src/renderer` module that creates an `Image`
 * without importing this module.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let pending = false;

export function notifyCanvasAssetReady(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    for (const listener of [...listeners]) listener();
  });
}

export function onCanvasAssetReady(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
