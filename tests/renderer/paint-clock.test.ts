import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginPaintTracking,
  markTimeVaryingPaint,
  paintAmbientRegion,
  paintWasTimeVarying,
  withAmbientBounds,
} from '@/renderer/paint-clock';

describe('paint clock ambient regions (#1439 phase 3)', () => {
  beforeEach(() => beginPaintTracking());

  it('reports nothing for a paint without time-varying content', () => {
    withAmbientBounds(10, 10, 5, () => { /* draws, but nothing animated */ });
    expect(paintWasTimeVarying()).toBe(false);
    expect(paintAmbientRegion()).toBeNull();
  });

  it('reports the bounds of every scope that marked motion, and only those', () => {
    withAmbientBounds(10, 20, 5, () => markTimeVaryingPaint());
    withAmbientBounds(100, 100, 7, () => { /* static wonder */ });
    withAmbientBounds(50, 60, 2, () => { markTimeVaryingPaint(); markTimeVaryingPaint(); });
    expect(paintWasTimeVarying()).toBe(true);
    expect(paintAmbientRegion()).toEqual([
      { x0: 5, y0: 15, x1: 15, y1: 25 },
      { x0: 48, y0: 58, x1: 52, y1: 62 },
    ]);
  });

  it('an unbounded mark anywhere forces a full repaint (no region)', () => {
    withAmbientBounds(10, 20, 5, () => markTimeVaryingPaint());
    markTimeVaryingPaint(); // outside any scope: nobody declared where it draws
    expect(paintWasTimeVarying()).toBe(true);
    expect(paintAmbientRegion()).toBeNull();
  });

  it('keeps bounds of a scope that throws, and does not leak the scope to later marks', () => {
    expect(() => withAmbientBounds(0, 0, 1, () => { markTimeVaryingPaint(); throw new Error('draw failed'); })).toThrow();
    expect(paintAmbientRegion()).toEqual([{ x0: -1, y0: -1, x1: 1, y1: 1 }]);
    markTimeVaryingPaint(); // scope must have been closed
    expect(paintAmbientRegion()).toBeNull();
  });

  it('starts every paint clean', () => {
    markTimeVaryingPaint();
    beginPaintTracking();
    expect(paintWasTimeVarying()).toBe(false);
    expect(paintAmbientRegion()).toBeNull();
  });
});
