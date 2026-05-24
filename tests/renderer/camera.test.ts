import { describe, it, expect } from 'vitest';
import { Camera } from '@/renderer/camera';

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
