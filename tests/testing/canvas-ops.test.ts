import { describe, expect, it } from 'vitest';
import {
  createOperationRecorder,
  normalizeImageBounds,
  parseDrawImage,
} from '../e2e/helpers/canvas-ops';

describe('Canvas operation helpers', () => {
  it.each([
    [[{}, 1, 2], { dx: 1, dy: 2 }],
    [[{}, 1, 2, 3, 4], { dx: 1, dy: 2, dw: 3, dh: 4 }],
    [[{}, 1, 2, 3, 4, 5, 6, 7, 8], { sx: 1, sy: 2, sw: 3, sh: 4, dx: 5, dy: 6, dw: 7, dh: 8 }],
  ])('parses drawImage overload %#', (args, expected) => {
    expect(parseDrawImage(args)).toMatchObject(expected);
  });

  it('transforms every image corner through CTM, DPR scale, and canvas offset', () => {
    const result = normalizeImageBounds({
      rect: { x: 1, y: 2, width: 3, height: 4 },
      transform: { a: 2, b: 1, c: 0.5, d: 3, e: 7, f: 11 },
      backing: { width: 200, height: 100 },
      css: { x: 10, y: 20, width: 100, height: 50 },
    });
    expect(result.polygon).toHaveLength(4);
    expect(result.bounds).toMatchObject({ x: expect.any(Number), width: expect.any(Number) });
  });

  it('freezes, overflows, and resets by capture session', () => {
    const recorder = createOperationRecorder({ maxOperations: 2 });
    const filter = { canvasId: 'game-canvas' };
    const operation = { kind: 'fillText' as const, canvasId: 'game-canvas', text: '🏗️' };
    recorder.start(filter);
    recorder.record(operation);
    recorder.record(operation);
    recorder.record(operation);
    expect(recorder.snapshot()).toMatchObject({ overflowed: true, operations: [operation, operation] });
    recorder.freeze();
    recorder.record(operation);
    expect(recorder.snapshot().operations).toHaveLength(2);
    recorder.start(filter);
    expect(recorder.snapshot()).toMatchObject({ overflowed: false, operations: [] });
  });
});
