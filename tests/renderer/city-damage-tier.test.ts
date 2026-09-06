import { describe, expect, it } from 'vitest';
import { resolveCityDamageTier } from '@/renderer/city-map-presentation';

// #974: `underSiege` is binary, so a city at 92 HP and one at 4 HP looked identical on the
// map. With bombardment now a multi-turn loop, the player needs to see progress at a glance.
describe('#974 city damage tiers', () => {
  it('shows no damage on a healthy city', () => {
    expect(resolveCityDamageTier(100)).toBe('none');
    expect(resolveCityDamageTier(85)).toBe('none');
  });

  // The per-turn bombardment cap is 20 HP, so `scarred` appears after roughly one full turn
  // of shelling rather than at an arbitrary threshold.
  it('shows scarring once about a turn of bombardment has landed', () => {
    expect(resolveCityDamageTier(84)).toBe('scarred');
    expect(resolveCityDamageTier(40)).toBe('scarred');
  });

  it('shows burning around the point a city is nearly ready to storm', () => {
    expect(resolveCityDamageTier(35)).toBe('burning');
    expect(resolveCityDamageTier(1)).toBe('burning');
  });

  it('is monotonic — more damage never reads as healthier', () => {
    const order = { none: 0, scarred: 1, burning: 2 };
    let previous = 0;
    for (let hp = 100; hp >= 1; hp -= 1) {
      const tier = order[resolveCityDamageTier(hp)];
      expect(tier).toBeGreaterThanOrEqual(previous);
      previous = tier;
    }
  });
});
