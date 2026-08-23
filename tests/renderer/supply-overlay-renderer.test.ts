import { describe, expect, it, vi } from 'vitest';
import { Camera } from '@/renderer/camera';
import { drawSupplyOverlay } from '@/renderer/supply-overlay-renderer';
import type { SupplyOverlayPresentation } from '@/systems/supply-overlay-presentation';

function makeCtx(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe('drawSupplyOverlay', () => {
  it('fills one hex per presented tile and draws a source marker per source', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(800, 600);
    const presentation: SupplyOverlayPresentation = {
      tiles: [{ coord: { q: 1, r: 1 }, coverage: 'full' }, { coord: { q: 2, r: 1 }, coverage: 'stable-unsupported' }],
      sources: [{ kind: 'city', coord: { q: 1, r: 1 } }, { kind: 'ship', coord: { q: 3, r: 1 } }],
    };
    drawSupplyOverlay(ctx, presentation, 10, 10, camera, false);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalledTimes(2);
  });

  it('draws nothing for an empty presentation', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(800, 600);
    drawSupplyOverlay(ctx, { tiles: [], sources: [] }, 10, 10, camera, false);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('skips a tile that is off-camera (isHexVisible false)', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(10, 10);
    camera.centerOn({ q: 0, r: 0 });
    const presentation: SupplyOverlayPresentation = {
      tiles: [{ coord: { q: 900, r: 900 }, coverage: 'full' }],
      sources: [],
    };
    drawSupplyOverlay(ctx, presentation, 1000, 1000, camera, false);
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
