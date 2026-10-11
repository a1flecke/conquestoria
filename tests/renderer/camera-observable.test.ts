import { describe, expect, it, vi } from 'vitest';
import { Camera } from '@/renderer/camera';

function observed(camera: Camera) {
  const listener = vi.fn();
  const unsubscribe = camera.onChange(listener);
  return { listener, unsubscribe };
}

describe('Camera observable mutations (#1439)', () => {
  it.each([
    ['pan', (c: Camera) => c.pan(10, 5)],
    ['centerOn', (c: Camera) => c.centerOn({ q: 3, r: 2 })],
    ['setZoom', (c: Camera) => c.setZoom(1.5, 10, 10)],
    ['smoothZoom', (c: Camera) => c.smoothZoom(-1, 10, 10)],
    ['setViewport', (c: Camera) => c.setViewport(800, 600)],
    ['direct x write', (c: Camera) => { c.x = 42; }],
    ['direct zoom write', (c: Camera) => { c.zoom = 2; }],
    ['fling velocity write', (c: Camera) => { c.vx = 5; }],
  ])('%s publishes exactly one change', (_name, mutate) => {
    const camera = new Camera();
    camera.setViewport(400, 300);
    const { listener } = observed(camera);
    mutate(camera);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not publish when nothing changed', () => {
    const camera = new Camera();
    camera.setViewport(400, 300);
    const { listener } = observed(camera);
    camera.pan(0, 0);
    camera.x = camera.x;
    camera.setViewport(400, 300);
    camera.applyInertia();
    expect(listener).not.toHaveBeenCalled();
  });

  it('publishes each inertia step and the final settle that zeroes velocity', () => {
    const camera = new Camera();
    camera.vx = 0.105;
    const { listener } = observed(camera);
    camera.applyInertia(); // moves, velocity decays below the threshold
    expect(listener).toHaveBeenCalledTimes(1);
    camera.applyInertia(); // settles velocity to 0 (state change, no movement)
    expect(listener).toHaveBeenCalledTimes(2);
    expect(camera.vx).toBe(0);
    camera.applyInertia();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reports whether it still has motion to advance', () => {
    const camera = new Camera();
    expect(camera.isMoving()).toBe(false);
    camera.vy = 3;
    expect(camera.isMoving()).toBe(true);
  });

  it('publishes a minZoom constraint that clamps the zoom', () => {
    const camera = new Camera();
    camera.setViewport(400, 300);
    camera.zoom = 0.4;
    const { listener } = observed(camera);
    camera.setMinZoomForMap(400); // minZoom 1 -> zoom clamped up
    expect(listener).toHaveBeenCalled();
    expect(camera.zoom).toBe(1);
  });

  it('unsubscribes cleanly', () => {
    const camera = new Camera();
    const { listener, unsubscribe } = observed(camera);
    unsubscribe();
    camera.pan(5, 5);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps screen/world math unchanged', () => {
    const camera = new Camera();
    camera.x = 10;
    camera.y = 20;
    camera.zoom = 2;
    expect(camera.worldToScreen(15, 30)).toEqual({ x: 10, y: 20 });
    expect(camera.screenToWorld(10, 20)).toEqual({ x: 15, y: 30 });
  });
});
