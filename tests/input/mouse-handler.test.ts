// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { MouseHandler } from '@/input/mouse-handler';
import type { InputCallbacks } from '@/input/touch-handler';

function makeSpyCamera() {
  const pans: Array<{ dx: number; dy: number }> = [];
  return {
    pans,
    pan: (dx: number, dy: number) => { pans.push({ dx, dy }); },
    smoothZoom: vi.fn(),
    screenToHex: vi.fn((x: number, y: number) => ({ q: x, r: y })),
  } as any;
}

describe('MouseHandler (#1830)', () => {
  it('fires onHexTap for a clean click with minimal jitter', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const callbacks: InputCallbacks = { onHexTap: vi.fn(), onHexLongPress: vi.fn() };
    const mh = new MouseHandler(canvas, camera, callbacks);

    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: 100, clientY: 100 }));
    canvas.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: 102, clientY: 101 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: 102, clientY: 101 }));

    expect(callbacks.onHexTap).toHaveBeenCalledTimes(1);
    expect(callbacks.onHexTap).toHaveBeenCalledWith({ q: 102, r: 101 });
    mh.destroy();
  });

  it('treats a slow drag (small per-event deltas totaling > 3px) as a pan, never a hex tap', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const callbacks: InputCallbacks = { onHexTap: vi.fn(), onHexLongPress: vi.fn() };
    const mh = new MouseHandler(canvas, camera, callbacks);

    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1, clientX: 100, clientY: 100 }));
    for (let step = 1; step <= 10; step++) {
      canvas.dispatchEvent(new MouseEvent('mousemove', {
        button: 0,
        buttons: 1,
        clientX: 100 + step * 2,
        clientY: 100,
      }));
    }
    canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: 120, clientY: 100 }));

    expect(callbacks.onHexTap).not.toHaveBeenCalled();
    expect(camera.pans.reduce((sum: number, p: { dx: number }) => sum + p.dx, 0)).toBe(20);
    mh.destroy();
  });

  it('ignores mousemove and mouseup when the drag started outside the canvas (no stale lastMouse jump)', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const callbacks: InputCallbacks = { onHexTap: vi.fn(), onHexLongPress: vi.fn() };
    const mh = new MouseHandler(canvas, camera, callbacks);

    // No mousedown on canvas — pointer enters with left button already held from an outside drag.
    canvas.dispatchEvent(new MouseEvent('mousemove', { button: 0, buttons: 1, clientX: 350, clientY: 250 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 0, clientX: 350, clientY: 250 }));

    expect(camera.pans).toHaveLength(0);
    expect(callbacks.onHexTap).not.toHaveBeenCalled();
    mh.destroy();
  });
});
