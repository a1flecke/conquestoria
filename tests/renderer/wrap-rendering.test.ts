import { describe, expect, it } from 'vitest';
import { Camera } from '@/renderer/camera';
import { getHorizontalWrapRenderCoords } from '@/renderer/wrap-rendering';

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
