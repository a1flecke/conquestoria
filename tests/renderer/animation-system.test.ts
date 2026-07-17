import { describe, expect, it, vi } from 'vitest';
import { AnimationSystem } from '@/renderer/animation-system';
import { Camera } from '@/renderer/camera';
import { hexToPixel } from '@/systems/hex-utils';

function mockCtx() {
  return {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D & {
    arc: ReturnType<typeof vi.fn>;
  };
}

function makeCamera(): Camera {
  const camera = new Camera();
  camera.setViewport(320, 240);
  return camera;
}

const FLAT_MAP = { width: 10, wrapsHorizontally: false };
const WRAP_MAP = { width: 10, wrapsHorizontally: true };

function expectedScreen(camera: Camera, coord: { q: number; r: number }): { x: number; y: number } {
  const pixel = hexToPixel(coord, camera.hexSize);
  return camera.worldToScreen(pixel.x, pixel.y);
}

describe('AnimationSystem camera tracking', () => {
  it('draws the combat flash at the hex position under the current camera each frame', () => {
    const animations = new AnimationSystem();
    const camera = makeCamera();
    const coord = { q: 2, r: 1 };
    camera.centerOn(coord);
    const ctx = mockCtx();
    const start = performance.now();
    animations.add('combat-flash', 400, { coord });

    animations.update(ctx, camera, FLAT_MAP, start + 100);
    const first = expectedScreen(camera, coord);
    expect(ctx.arc).toHaveBeenLastCalledWith(first.x, first.y, expect.any(Number), 0, Math.PI * 2);

    camera.pan(-40, -30);
    animations.update(ctx, camera, FLAT_MAP, start + 200);
    const second = expectedScreen(camera, coord);
    expect(second).not.toEqual(first);
    expect(ctx.arc).toHaveBeenLastCalledWith(second.x, second.y, expect.any(Number), 0, Math.PI * 2);
  });

  it('recomputes the effect size when the camera zoom changes mid-animation', () => {
    const animations = new AnimationSystem();
    const camera = makeCamera();
    const coord = { q: 2, r: 1 };
    camera.centerOn(coord);
    const ctx = mockCtx();
    const start = performance.now();
    animations.add('combat-flash', 400, { coord });

    animations.update(ctx, camera, FLAT_MAP, start);
    const radiusAtZoom1 = ctx.arc.mock.lastCall![2] as number;

    camera.setZoom(2, 160, 120);
    camera.centerOn(coord);
    animations.update(ctx, camera, FLAT_MAP, start);
    const radiusAtZoom2 = ctx.arc.mock.lastCall![2] as number;

    expect(radiusAtZoom2).toBeCloseTo(radiusAtZoom1 * 2);
  });

  it('draws the effect at the visible ghost copy when the camera views the wrap seam', () => {
    const animations = new AnimationSystem();
    const camera = makeCamera();
    // Camera centered on the ghost copy (q = -1 side of the seam); the
    // canonical coordinate q = 9 is far off-screen to the east.
    camera.centerOn({ q: -1, r: 1 });
    const coord = { q: 9, r: 1 };
    const ctx = mockCtx();
    animations.add('disembark-flash', 500, { coord });

    animations.update(ctx, camera, WRAP_MAP, performance.now());

    const ghost = expectedScreen(camera, { q: -1, r: 1 });
    expect(ctx.arc).toHaveBeenCalledWith(ghost.x, ghost.y, expect.any(Number), 0, Math.PI * 2);
  });

  it('skips drawing entirely when no wrap copy of the hex is on screen', () => {
    const animations = new AnimationSystem();
    const camera = makeCamera();
    camera.centerOn({ q: 2, r: 1 });
    const ctx = mockCtx();
    animations.add('combat-flash', 400, { coord: { q: 2, r: 200 } });

    animations.update(ctx, camera, FLAT_MAP, performance.now());

    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('renders the wonder pulse with its accent and glow palette', () => {
    const animations = new AnimationSystem();
    const camera = makeCamera();
    const coord = { q: 1, r: 1 };
    camera.centerOn(coord);
    const ctx = mockCtx();
    const strokeStyles: string[] = [];
    Object.defineProperty(ctx, 'strokeStyle', {
      set: value => strokeStyles.push(String(value)),
      get: () => strokeStyles[strokeStyles.length - 1] ?? '',
    });
    animations.add('wonder-discovery-pulse', 900, { coord, accent: '#accent', glow: '#glow' });

    animations.update(ctx, camera, FLAT_MAP, performance.now());

    expect(strokeStyles).toContain('#glow');
  });

  it('removes completed animations and fires onComplete exactly once', () => {
    const animations = new AnimationSystem();
    const camera = makeCamera();
    const coord = { q: 1, r: 1 };
    camera.centerOn(coord);
    const ctx = mockCtx();
    const onComplete = vi.fn();
    const start = performance.now();
    animations.add('combat-flash', 400, { coord }, onComplete);

    animations.update(ctx, camera, FLAT_MAP, start + 500);
    animations.update(ctx, camera, FLAT_MAP, start + 600);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(ctx.arc).toHaveBeenCalledTimes(1);
  });
});
