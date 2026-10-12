// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchHandler } from '@/input/touch-handler';
import type { InputCallbacks } from '@/input/touch-handler';

const noopCallbacks: InputCallbacks = {
  onHexTap: () => {},
  onHexLongPress: () => {},
};

function makeCamera() {
  return {
    zoom: 1, x: 0, y: 0, hexSize: 32, width: 800, height: 600,
    setZoom: () => {}, pan: () => {}, vx: 0, vy: 0,
    screenToHex: () => ({ q: 0, r: 0 }),
  } as any;
}

interface PanCall { dx: number; dy: number }
interface ZoomCall { zoom: number; centerX: number; centerY: number }

/** Camera stub that records every pan/zoom call so gesture math is asserted directly. */
function makeSpyCamera() {
  const pans: PanCall[] = [];
  const zooms: ZoomCall[] = [];
  return {
    pans,
    zooms,
    zoom: 1, x: 0, y: 0, hexSize: 32, width: 800, height: 600,
    vx: 0, vy: 0,
    pan: (dx: number, dy: number) => { pans.push({ dx, dy }); },
    setZoom: (zoom: number, centerX: number, centerY: number) => { zooms.push({ zoom, centerX, centerY }); },
    screenToHex: () => ({ q: 0, r: 0 }),
  } as any;
}

function touchAt(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as Touch;
}

function dispatchTouch(
  canvas: HTMLCanvasElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  options: {
    touches?: Touch[];
    changedTouches?: Touch[];
    timeStamp: number;
  },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: options.touches ?? [] },
    changedTouches: { value: options.changedTouches ?? [] },
    timeStamp: { value: options.timeStamp },
  });
  canvas.dispatchEvent(event);
}

describe('TouchHandler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts false before any touches', () => {
    const canvas = document.createElement('canvas');
    const th = new TouchHandler(canvas, makeCamera(), noopCallbacks);
    expect(th.isPinching).toBe(false);
    th.destroy();
  });

  it('classifies tap duration from event timestamps when handler processing is delayed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const canvas = document.createElement('canvas');
    const onHexTap = vi.fn();
    const th = new TouchHandler(canvas, makeCamera(), {
      onHexTap,
      onHexLongPress: vi.fn(),
    });
    const touch = touchAt(120, 80);

    dispatchTouch(canvas, 'touchstart', {
      touches: [touch],
      changedTouches: [touch],
      timeStamp: 100,
    });
    vi.setSystemTime(new Date(2_000));
    dispatchTouch(canvas, 'touchend', {
      changedTouches: [touch],
      timeStamp: 200,
    });

    expect(onHexTap).toHaveBeenCalledTimes(1);
    th.destroy();
  });

  it('does not turn a canceled touch into a map tap', () => {
    const canvas = document.createElement('canvas');
    const onHexTap = vi.fn();
    const onHexLongPress = vi.fn();
    const th = new TouchHandler(canvas, makeCamera(), { onHexTap, onHexLongPress });
    const touch = touchAt(120, 80);

    dispatchTouch(canvas, 'touchstart', {
      touches: [touch],
      changedTouches: [touch],
      timeStamp: 100,
    });
    dispatchTouch(canvas, 'touchcancel', {
      changedTouches: [touch],
      timeStamp: 150,
    });

    expect(onHexTap).not.toHaveBeenCalled();
    expect(onHexLongPress).not.toHaveBeenCalled();
    expect(th.isPinching).toBe(false);
    th.destroy();
  });
});

describe('TouchHandler pinch transitions', () => {
  it('re-bases the pan origin to the remaining finger after a pinch ends', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const th = new TouchHandler(canvas, camera, noopCallbacks);
    const first = touchAt(100, 100);
    const second = touchAt(300, 100);

    dispatchTouch(canvas, 'touchstart', { touches: [first], changedTouches: [first], timeStamp: 100 });
    dispatchTouch(canvas, 'touchstart', { touches: [first, second], changedTouches: [second], timeStamp: 150 });
    dispatchTouch(canvas, 'touchend', { touches: [first], changedTouches: [second], timeStamp: 200 });

    const remaining = touchAt(102, 100);
    dispatchTouch(canvas, 'touchmove', { touches: [remaining], changedTouches: [remaining], timeStamp: 250 });

    expect(camera.pans).toHaveLength(1);
    expect(camera.pans[0].dx).toBeCloseTo(2);
    expect(camera.pans[0].dy).toBeCloseTo(0);
    expect(camera.vx).toBeCloseTo(2);
    th.destroy();
  });

  it('clears stale fling velocity when a pinch ends with one finger remaining', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    camera.vx = 50;
    camera.vy = -30;
    const th = new TouchHandler(canvas, camera, noopCallbacks);
    const first = touchAt(100, 100);
    const second = touchAt(300, 100);

    dispatchTouch(canvas, 'touchstart', { touches: [first], changedTouches: [first], timeStamp: 100 });
    dispatchTouch(canvas, 'touchstart', { touches: [first, second], changedTouches: [second], timeStamp: 150 });
    dispatchTouch(canvas, 'touchend', { touches: [first], changedTouches: [second], timeStamp: 200 });

    expect(camera.vx).toBe(0);
    expect(camera.vy).toBe(0);
    th.destroy();
  });

  it('does not fire a tap or long press from a pinch that lifts one finger', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onHexTap = vi.fn();
    const onHexLongPress = vi.fn();
    const th = new TouchHandler(canvas, makeSpyCamera(), { onHexTap, onHexLongPress });
    const first = touchAt(100, 100);
    const second = touchAt(300, 100);

    dispatchTouch(canvas, 'touchstart', { touches: [first], changedTouches: [first], timeStamp: 100 });
    dispatchTouch(canvas, 'touchstart', { touches: [first, second], changedTouches: [second], timeStamp: 150 });
    dispatchTouch(canvas, 'touchend', { touches: [first], changedTouches: [second], timeStamp: 200 });
    vi.advanceTimersByTime(1_000);
    dispatchTouch(canvas, 'touchend', { touches: [], changedTouches: [first], timeStamp: 220 });

    expect(onHexTap).not.toHaveBeenCalled();
    expect(onHexLongPress).not.toHaveBeenCalled();
    th.destroy();
  });

  it('stays stable across a second finger joining again (1->2->1->2)', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const th = new TouchHandler(canvas, camera, noopCallbacks);
    const a = touchAt(100, 100);
    const b = touchAt(300, 100);
    const c = touchAt(400, 100);

    dispatchTouch(canvas, 'touchstart', { touches: [a], changedTouches: [a], timeStamp: 100 });
    dispatchTouch(canvas, 'touchstart', { touches: [a, b], changedTouches: [b], timeStamp: 150 });
    dispatchTouch(canvas, 'touchend', { touches: [a], changedTouches: [b], timeStamp: 200 });

    const a2 = touchAt(102, 100);
    dispatchTouch(canvas, 'touchmove', { touches: [a2], changedTouches: [a2], timeStamp: 250 });

    dispatchTouch(canvas, 'touchstart', { touches: [a2, c], changedTouches: [c], timeStamp: 300 });
    const a3 = touchAt(112, 100);
    const c3 = touchAt(410, 100);
    dispatchTouch(canvas, 'touchmove', { touches: [a3, c3], changedTouches: [a3, c3], timeStamp: 350 });

    dispatchTouch(canvas, 'touchend', { touches: [a3], changedTouches: [c3], timeStamp: 400 });
    const a4 = touchAt(114, 100);
    dispatchTouch(canvas, 'touchmove', { touches: [a4], changedTouches: [a4], timeStamp: 450 });

    for (const call of camera.pans) {
      expect(Math.abs(call.dx)).toBeLessThanOrEqual(10);
      expect(Math.abs(call.dy)).toBeLessThanOrEqual(10);
    }
    expect(camera.pans[camera.pans.length - 1].dx).toBeCloseTo(2);
    th.destroy();
  });

  it('re-bases to the remaining finger after a touchcancel', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const th = new TouchHandler(canvas, camera, noopCallbacks);
    const first = touchAt(100, 100);
    const second = touchAt(300, 100);

    dispatchTouch(canvas, 'touchstart', { touches: [first], changedTouches: [first], timeStamp: 100 });
    dispatchTouch(canvas, 'touchstart', { touches: [first, second], changedTouches: [second], timeStamp: 150 });
    dispatchTouch(canvas, 'touchcancel', { touches: [first], changedTouches: [second], timeStamp: 200 });

    const remaining = touchAt(103, 100);
    dispatchTouch(canvas, 'touchmove', { touches: [remaining], changedTouches: [remaining], timeStamp: 250 });

    expect(camera.pans).toHaveLength(1);
    expect(camera.pans[0].dx).toBeCloseTo(3);
    th.destroy();
  });

  it('still pans and flings for an ordinary single-finger drag', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const th = new TouchHandler(canvas, camera, noopCallbacks);
    const a = touchAt(100, 100);

    dispatchTouch(canvas, 'touchstart', { touches: [a], changedTouches: [a], timeStamp: 100 });
    const moved = touchAt(140, 100);
    dispatchTouch(canvas, 'touchmove', { touches: [moved], changedTouches: [moved], timeStamp: 150 });
    dispatchTouch(canvas, 'touchend', { touches: [], changedTouches: [moved], timeStamp: 200 });

    expect(camera.pans).toHaveLength(1);
    expect(camera.pans[0].dx).toBeCloseTo(40);
    expect(camera.vx).toBeCloseTo(40);
    th.destroy();
  });

  it('still fires a tap for an ordinary quick single-finger touch', () => {
    const canvas = document.createElement('canvas');
    const onHexTap = vi.fn();
    const th = new TouchHandler(canvas, makeSpyCamera(), { onHexTap, onHexLongPress: vi.fn() });
    const a = touchAt(120, 80);

    dispatchTouch(canvas, 'touchstart', { touches: [a], changedTouches: [a], timeStamp: 100 });
    dispatchTouch(canvas, 'touchend', { touches: [], changedTouches: [a], timeStamp: 180 });

    expect(onHexTap).toHaveBeenCalledTimes(1);
    th.destroy();
  });

  it('pans by the moving center of a two-finger gesture', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const th = new TouchHandler(canvas, camera, noopCallbacks);
    const a = touchAt(100, 100);
    const b = touchAt(300, 100);

    dispatchTouch(canvas, 'touchstart', { touches: [a], changedTouches: [a], timeStamp: 100 });
    dispatchTouch(canvas, 'touchstart', { touches: [a, b], changedTouches: [b], timeStamp: 150 });
    const a2 = touchAt(120, 100);
    const b2 = touchAt(320, 100);
    dispatchTouch(canvas, 'touchmove', { touches: [a2, b2], changedTouches: [a2, b2], timeStamp: 200 });

    expect(camera.pans).toHaveLength(1);
    expect(camera.pans[0].dx).toBeCloseTo(20);
    expect(camera.pans[0].dy).toBeCloseTo(0);
    th.destroy();
  });

  it('reports pinch start and end once across 1->2->1', () => {
    const canvas = document.createElement('canvas');
    const camera = makeSpyCamera();
    const th = new TouchHandler(canvas, camera, noopCallbacks);
    const a = touchAt(100, 100);
    const b = touchAt(300, 100);
    const changes: boolean[] = [];
    th.onPinchChange(() => changes.push(th.isPinching));

    dispatchTouch(canvas, 'touchstart', { touches: [a], changedTouches: [a], timeStamp: 100 });
    dispatchTouch(canvas, 'touchstart', { touches: [a, b], changedTouches: [b], timeStamp: 150 });
    dispatchTouch(canvas, 'touchend', { touches: [a], changedTouches: [b], timeStamp: 200 });

    expect(changes).toEqual([true, false]);
    expect(th.isPinching).toBe(false);
    th.destroy();
  });
});
