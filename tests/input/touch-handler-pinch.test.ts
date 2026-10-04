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
