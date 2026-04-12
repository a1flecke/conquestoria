import { describe, it, expect } from 'vitest';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';
import { getNamingPoolForCiv, DEFAULT_CITY_NAMES } from '@/systems/city-name-system';

describe('city name rosters', () => {
  it('every civ defines its own cityNames (no default fallback in live play)', () => {
    const missing = CIV_DEFINITIONS.filter(c => !c.cityNames || c.cityNames.length === 0).map(c => c.id);
    expect(missing).toEqual([]);
  });

  it('Zulu cities use Zulu names, not Egyptian', () => {
    const pool = getNamingPoolForCiv('zulu');
    expect(pool).not.toBe(DEFAULT_CITY_NAMES);
    expect(pool[0]).not.toBe('Alexandria');
  });

  it('France cities use French names, not Alexandria', () => {
    const pool = getNamingPoolForCiv('france');
    expect(pool).not.toBe(DEFAULT_CITY_NAMES);
    expect(pool[0]).not.toBe('Alexandria');
    expect(pool).toContain('Paris');
  });

  it('each civ has at least 6 unique city names', () => {
    for (const civ of CIV_DEFINITIONS) {
      expect(civ.cityNames?.length ?? 0, `${civ.id}`).toBeGreaterThanOrEqual(6);
      const uniq = new Set(civ.cityNames);
      expect(uniq.size, `${civ.id} has duplicates`).toBe(civ.cityNames!.length);
    }
  });
});
