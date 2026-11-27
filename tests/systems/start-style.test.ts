import { describe, expect, it } from 'vitest';
import { LEGACY_START_STYLE_RULES, START_STYLE_RULES, resolveStartStyleRules } from '@/systems/start-style';
import { START_SELECTION, selectStartSites } from '@/systems/start-site-selection';

describe('start style rules (design 2026-11-25, B3)', () => {
  it('a game without a style places starts exactly as before the setting existed', () => {
    expect(resolveStartStyleRules(undefined)).toBe(LEGACY_START_STYLE_RULES);
    expect(LEGACY_START_STYLE_RULES).toEqual({
      band: START_SELECTION.varietyBand, pickNoise: START_SELECTION.pickNoise, preferEven: false, preferenceWeight: 0, topUpWeakStarts: false,
    });
  });

  it('Fair is the tightest band, Wild admits every legal layout, and preferences grow from Fair to Wild', () => {
    const { fair, varied, wild } = START_STYLE_RULES;
    expect(fair.band).toBeLessThan(varied.band);
    expect(varied.band).toBe(START_SELECTION.varietyBand);
    expect(wild.band).toBe(Infinity);
    expect(fair.pickNoise).toBe(START_SELECTION.pickNoise);
    expect(varied.pickNoise).toBe(START_SELECTION.pickNoise);
    expect(wild.pickNoise).toBeGreaterThan(varied.pickNoise);
    expect([fair.preferEven, varied.preferEven, wild.preferEven]).toEqual([true, false, false]);
    expect(fair.preferenceWeight).toBeGreaterThan(0);
    expect(fair.preferenceWeight).toBeLessThan(varied.preferenceWeight);
    expect(varied.preferenceWeight).toBeLessThan(wild.preferenceWeight);
    expect([fair.topUpWeakStarts, varied.topUpWeakStarts, wild.topUpWeakStarts]).toEqual([true, false, false]);
  });

  it('an unbounded band selects a layout even when the best weakest score is zero', () => {
    let draw = 0;
    const result = selectStartSites({
      map: { width: 40 },
      candidates: [0, 10, 20, 30].map(q => ({ coord: { q, r: 0 }, score: 0 })),
      count: 2,
      minSeparation: 9,
      minFromFixed: 9,
      band: Infinity,
      rng: () => ((draw = (draw * 7 + 3) % 11) / 11),
    });
    expect(result.ok).toBe(true);
  });
});
