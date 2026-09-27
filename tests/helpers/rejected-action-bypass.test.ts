import { describe, it, expect } from 'vitest';
import { assertRejectedByEveryExecutor } from './rejected-action-bypass';

describe('#999 assertRejectedByEveryExecutor', () => {
  it('passes when every named executor refuses', () => {
    expect(() => assertRejectedByEveryExecutor('family-a', [
      { executor: 'exec-1', attempt: () => ({ ok: false, reason: 'blocked' }) },
      { executor: 'exec-2', attempt: () => ({ ok: false, reason: 'blocked' }) },
    ])).not.toThrow();
  });

  it('throws naming the family and the executor that wrongly succeeded', () => {
    expect(() => assertRejectedByEveryExecutor('family-a', [
      { executor: 'exec-1', attempt: () => ({ ok: false, reason: 'blocked' }) },
      { executor: 'exec-2', attempt: () => ({ ok: true }) },
    ])).toThrow(/family-a.*exec-2|exec-2.*family-a/s);
  });

  it('collects every wrongly-succeeding executor, not just the first', () => {
    let message = '';
    try {
      assertRejectedByEveryExecutor('family-a', [
        { executor: 'exec-1', attempt: () => ({ ok: true }) },
        { executor: 'exec-2', attempt: () => ({ ok: true }) },
      ]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/exec-1/);
    expect(message).toMatch(/exec-2/);
  });
});
