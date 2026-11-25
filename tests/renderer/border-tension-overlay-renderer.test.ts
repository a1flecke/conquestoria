import { describe, expect, it, vi } from 'vitest';
import { Camera } from '@/renderer/camera';
import { drawBorderTensionOverlay } from '@/renderer/border-tension-overlay-renderer';

function makeCtx(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe('drawBorderTensionOverlay (#1766)', () => {
  const camera = () => { const c = new Camera(); c.setViewport(800, 600); return c; };

  it('washes every tile and outlines only the boundary ring', () => {
    const ctx = makeCtx();
    drawBorderTensionOverlay(ctx, { tiles: [
      { coord: { q: 1, r: 1 }, edge: false },
      { coord: { q: 2, r: 1 }, edge: true },
    ] }, 10, camera(), false);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('draws nothing, and does not touch the context state, when nothing is disputed', () => {
    const ctx = makeCtx();
    drawBorderTensionOverlay(ctx, { tiles: [] }, 10, camera(), false);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });
});
