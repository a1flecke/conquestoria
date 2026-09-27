import { describe, it, expect } from 'vitest';
import { assertPreviewExecutable } from './preview-execute-parity';

describe('#998 assertPreviewExecutable', () => {
  it('passes when every offered option is accepted', () => {
    expect(() => assertPreviewExecutable([
      { label: 'family-a', offered: [1, 2], attempt: () => ({ ok: true }) },
    ])).not.toThrow();
  });

  it('passes for a case with no offered options at all (vacuously fine, not a false alarm)', () => {
    expect(() => assertPreviewExecutable([
      { label: 'family-a', offered: [], attempt: () => ({ ok: false, reason: 'never called' }) },
    ])).not.toThrow();
  });

  it('throws naming the family, the offered option, and the rejection reason', () => {
    expect(() => assertPreviewExecutable([
      { label: 'family-a', offered: [{ q: 3, r: 4 }], attempt: () => ({ ok: false, reason: 'occupied' }) },
    ])).toThrow(/family-a.*occupied/s);
  });

  it('collects failures across every case rather than stopping at the first', () => {
    let message = '';
    try {
      assertPreviewExecutable([
        { label: 'family-a', offered: ['x'], attempt: () => ({ ok: false, reason: 'reason-a' }) },
        { label: 'family-b', offered: ['y'], attempt: () => ({ ok: false, reason: 'reason-b' }) },
      ]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/family-a/);
    expect(message).toMatch(/reason-a/);
    expect(message).toMatch(/family-b/);
    expect(message).toMatch(/reason-b/);
  });

  it('uses a custom describe() to render the offered option in the failure message', () => {
    expect(() => assertPreviewExecutable([
      {
        label: 'family-a',
        offered: [{ q: 1, r: 2 }],
        attempt: () => ({ ok: false }),
        describe: option => `(${option.q},${option.r})`,
      },
    ])).toThrow(/\(1,2\)/);
  });

  it('evaluates every offered option independently, not stopping after the first success', () => {
    const attempted: number[] = [];
    assertPreviewExecutable([
      { label: 'family-a', offered: [1, 2, 3], attempt: option => { attempted.push(option); return { ok: true }; } },
    ]);
    expect(attempted).toEqual([1, 2, 3]);
  });
});
