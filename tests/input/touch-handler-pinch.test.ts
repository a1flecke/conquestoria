// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
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

describe('TouchHandler.isPinching', () => {
  it('starts false before any touches', () => {
    const canvas = document.createElement('canvas');
    const th = new TouchHandler(canvas, makeCamera(), noopCallbacks);
    expect(th.isPinching).toBe(false);
    th.destroy();
  });
});
