import { describe, expect, it, vi } from 'vitest';
import { Camera } from '@/renderer/camera';
import { drawStrategicLaunchPreviewOverlay } from '@/renderer/strategic-launch-overlay-renderer';
import type { StrategicLaunchPreviewPresentation } from '@/systems/strategic-launch-preview-presentation';

function makeCtx(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), arc: vi.fn(),
    fillStyle: '', strokeStyle: '', lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe('drawStrategicLaunchPreviewOverlay', () => {
  it('fills and strokes one hex per presented tile', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(800, 600);
    const presentation: StrategicLaunchPreviewPresentation = {
      tiles: [{ coord: { q: 1, r: 1 } }, { coord: { q: 2, r: 1 } }],
    };
    drawStrategicLaunchPreviewOverlay(ctx, presentation, 10, 10, camera, false);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it('draws nothing for an empty presentation', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(800, 600);
    drawStrategicLaunchPreviewOverlay(ctx, { tiles: [] }, 10, 10, camera, false);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('skips a tile that is off-camera (isHexVisible false)', () => {
    const ctx = makeCtx();
    const camera = new Camera();
    camera.setViewport(10, 10);
    camera.centerOn({ q: 0, r: 0 });
    const presentation: StrategicLaunchPreviewPresentation = { tiles: [{ coord: { q: 900, r: 900 } }] };
    drawStrategicLaunchPreviewOverlay(ctx, presentation, 1000, 1000, camera, false);
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
