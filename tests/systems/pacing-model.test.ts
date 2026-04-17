import { describe, expect, it } from 'vitest';
import { estimateTurnsToComplete, getTargetTurnWindow } from '@/systems/pacing-model';

describe('pacing-model', () => {
  it('gives Era 1 starter items a 2-4 turn target window', () => {
    expect(getTargetTurnWindow({ era: 1, band: 'starter', contentType: 'building' })).toEqual({ min: 2, max: 4 });
  });

  it('rounds ETA values up by turn', () => {
    expect(estimateTurnsToComplete({ cost: 12, outputPerTurn: 4 })).toBe(3);
    expect(estimateTurnsToComplete({ cost: 13, outputPerTurn: 4 })).toBe(4);
  });
});
