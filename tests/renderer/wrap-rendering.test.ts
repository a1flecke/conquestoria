import { describe, expect, it } from 'vitest';
import { Camera } from '@/renderer/camera';
import { getHorizontalWrapRenderCoords, nearestWrappedCoord } from '@/renderer/wrap-rendering';

describe('getHorizontalWrapRenderCoords', () => {
  it('returns the canonical coordinate when wrapping is unavailable', () => {
    const camera = new Camera();
    camera.setViewport(320, 240);

    expect(getHorizontalWrapRenderCoords({ q: 2, r: 1 }, 0, camera)).toEqual([{ q: 2, r: 1 }]);
  });

  it('returns every wrapped copy that overlaps a wide low-zoom viewport', () => {
    const camera = new Camera();
    camera.setViewport(1200, 240);
    camera.zoom = 0.3;
    camera.centerOn({ q: 5, r: 1 });

    const coords = getHorizontalWrapRenderCoords({ q: 0, r: 0 }, 5, camera);
    const renderedColumns = coords.map(coord => coord.q);

    expect(renderedColumns).toContain(-10);
    expect(renderedColumns).toContain(-5);
    expect(renderedColumns).toContain(0);
    expect(renderedColumns).toContain(5);
    expect(renderedColumns).toContain(10);
  });
});

describe('nearestWrappedCoord', () => {
  it('returns the canonical coordinate when it is already the nearest copy', () => {
    expect(nearestWrappedCoord({ q: 1, r: 0 }, { q: 2, r: 0 }, 10)).toEqual({ q: 2, r: 0 });
  });

  it('picks the westward ghost copy across the seam', () => {
    expect(nearestWrappedCoord({ q: 0, r: 2 }, { q: 9, r: 2 }, 10)).toEqual({ q: -1, r: 2 });
  });

  it('picks the eastward ghost copy across the seam', () => {
    expect(nearestWrappedCoord({ q: 9, r: 1 }, { q: 0, r: 1 }, 10)).toEqual({ q: 10, r: 1 });
  });

  it('returns the target unchanged when the map does not wrap', () => {
    expect(nearestWrappedCoord({ q: 0, r: 0 }, { q: 9, r: 0 }, 0)).toEqual({ q: 9, r: 0 });
  });
});
