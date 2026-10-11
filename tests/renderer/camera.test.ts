import { describe, it, expect } from 'vitest';
import { Camera } from '@/renderer/camera';
import { hexToPixel } from '@/systems/hex-utils';

describe('Camera.setMinZoomForMap', () => {
  it('sets minZoom to camera.width / mapWidthPx', () => {
    const cam = new Camera();
    cam.setViewport(800, 600); // width = 800
    cam.setMinZoomForMap(2000); // minZoom → 800/2000 = 0.4
    expect(cam.minZoom).toBeCloseTo(0.4);
  });

  it('clamps current zoom down to the computed minZoom if it was below', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 0.1;
    cam.targetZoom = 0.1;
    cam.setMinZoomForMap(2000); // minZoom = 0.4
    expect(cam.zoom).toBeCloseTo(0.4);
    expect(cam.targetZoom).toBeCloseTo(0.4);
  });

  it('leaves current zoom unchanged if it already exceeds the computed minZoom', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 1.0;
    cam.setMinZoomForMap(2000); // minZoom = 0.4 — zoom stays at 1.0
    expect(cam.zoom).toBeCloseTo(1.0);
  });

  it('is a no-op when mapWidthPx is 0', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    const before = cam.minZoom;
    cam.setMinZoomForMap(0);
    expect(cam.minZoom).toBe(before);
  });

  it('is a no-op when camera.width is 0 (viewport not yet set)', () => {
    const cam = new Camera(); // width defaults to 0
    const before = cam.minZoom;
    cam.setMinZoomForMap(2000);
    expect(cam.minZoom).toBe(before);
  });
});

describe('Camera pan, zoom, and centering (#1439 characterization)', () => {
  it('pan moves the world by the screen delta divided by the zoom', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 2;

    cam.pan(100, 40);

    expect(cam.x).toBe(-50);
    expect(cam.y).toBe(-20);
  });

  it('centerOn places the hex at the viewport center through the zoom transform', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 1;
    const coord = { q: 3, r: 2 };

    cam.centerOn(coord);

    const pixel = hexToPixel(coord, cam.hexSize);
    expect(cam.worldToScreen(pixel.x, pixel.y)).toEqual({ x: 400, y: 300 });
  });

  it('setZoom clamps to the configured zoom range and tracks targetZoom', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.minZoom = 0.5;
    cam.maxZoom = 2;

    cam.setZoom(4, 0, 0);
    expect(cam.zoom).toBe(2);
    expect(cam.targetZoom).toBe(2);

    cam.setZoom(0.1, 0, 0);
    expect(cam.zoom).toBe(0.5);
    expect(cam.targetZoom).toBe(0.5);
  });

  it('setZoom zooms toward the requested center point', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 1;
    const before = cam.screenToWorld(700, 500);

    cam.setZoom(2, 700, 500);

    // The world point under the cursor must stay (approximately) anchored.
    const after = cam.screenToWorld(700, 500);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('smoothZoom multiplies the current zoom by the 0.9/1.1 step factors', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 1;

    cam.smoothZoom(-1, 400, 300); // wheel up = zoom in
    expect(cam.zoom).toBeCloseTo(1.1);

    cam.smoothZoom(1, 400, 300); // wheel down = zoom out
    // 1.1 * 0.9 = 0.99 -- the step factors are not exact inverses.
    expect(cam.zoom).toBeCloseTo(0.99);
  });

  it('round-trips screenToWorld and worldToScreen', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 1.5;
    cam.pan(120, 90);

    const world = cam.screenToWorld(310, 210);
    const screen = cam.worldToScreen(world.x, world.y);

    expect(screen.x).toBeCloseTo(310);
    expect(screen.y).toBeCloseTo(210);
  });

  it('round-trips screenToHex against hexToPixel', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 1;

    const coord = { q: 4, r: 3 };
    const pixel = hexToPixel(coord, cam.hexSize);
    const screen = cam.worldToScreen(pixel.x, pixel.y);

    expect(cam.screenToHex(screen.x, screen.y)).toEqual(coord);
  });
});

describe('Camera inertia (#1439 characterization)', () => {
  it('keeps moving the camera frame by frame until velocity settles', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.vx = 100;
    cam.vy = 100;
    const startX = cam.x;
    const startY = cam.y;
    const positions: Array<{ x: number; y: number }> = [];

    // applyInertia() mutates position and decays velocity each call; a
    // frame-skipping scheduler must keep ticking while inertia is in flight.
    for (let frame = 0; frame < 200 && (cam.vx !== 0 || cam.vy !== 0); frame++) {
      cam.applyInertia();
      positions.push({ x: cam.x, y: cam.y });
    }

    expect(positions.length).toBeGreaterThan(1);
    expect(cam.x).toBeLessThan(startX);
    expect(cam.y).toBeLessThan(startY);
    // friction 0.9 exponential decay settles to exactly zero, never a crawl.
    expect(cam.vx).toBe(0);
    expect(cam.vy).toBe(0);
    const finalStep = positions[positions.length - 1]!;
    const previousStep = positions[positions.length - 2]!;
    expect(Math.abs(finalStep.x - previousStep.x)).toBeLessThan(1);
  });

  it('zeroes sub-threshold velocity in a single call without moving the camera', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.vx = 0.05;
    cam.vy = -0.05;
    const startX = cam.x;
    const startY = cam.y;

    cam.applyInertia();

    expect(cam.vx).toBe(0);
    expect(cam.vy).toBe(0);
    expect(cam.x).toBe(startX);
    expect(cam.y).toBe(startY);
  });

  it('applies inertia through the current zoom', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.zoom = 2;
    cam.vx = 200;

    cam.applyInertia();

    expect(cam.x).toBe(-100);
    expect(cam.vx).toBe(180);
  });
});
