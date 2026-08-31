import { describe, expect, it } from 'vitest';
import {
  calculateCoordinatedCityScience,
  DIMINISHING_RESEARCH_POLICY,
  FULL_CONTRIBUTION_RESEARCH_POLICY,
  getResearchCityWeight,
} from '@/systems/research-coordination-system';

const issue917 = [9, 8, 8, 8, 7, 5, 5, 4, 1, 1, 1, 1].map((science, index) => ({
  cityId: `city-${index + 1}`,
  science,
}));

describe('research coordination policy', () => {
  it('reduces the #917 city distribution to 24 final science under the diminishing policy', () => {
    expect(calculateCoordinatedCityScience(issue917, DIMINISHING_RESEARCH_POLICY).final).toBe(24);
  });

  it('keeps the strongest city whole and floors the twelfth-city contribution at 15%', () => {
    expect(getResearchCityWeight(1, DIMINISHING_RESEARCH_POLICY)).toBe(1);
    expect(getResearchCityWeight(12, DIMINISHING_RESEARCH_POLICY)).toBeCloseTo(0.15, 8);
  });

  it('is deterministic, monotonic, and does not round individual city contributions', () => {
    const permuted = [...issue917].reverse();
    const baseline = calculateCoordinatedCityScience(issue917, DIMINISHING_RESEARCH_POLICY);
    const withAdditionalCity = calculateCoordinatedCityScience(
      [...issue917, { cityId: 'city-13', science: 1 }],
      DIMINISHING_RESEARCH_POLICY,
    );
    const withStrongerCity = calculateCoordinatedCityScience(
      issue917.map(city => city.cityId === 'city-12' ? { ...city, science: city.science + 1 } : city),
      DIMINISHING_RESEARCH_POLICY,
    );

    expect(calculateCoordinatedCityScience(permuted, DIMINISHING_RESEARCH_POLICY)).toEqual(baseline);
    expect(withAdditionalCity.final).toBeGreaterThanOrEqual(baseline.final);
    expect(withStrongerCity.final).toBeGreaterThanOrEqual(baseline.final);
    expect(baseline.unroundedTotal).not.toBe(Math.floor(baseline.unroundedTotal));
  });

  it('clamps malformed contributions to zero while retaining the identity policy total', () => {
    expect(calculateCoordinatedCityScience([
      { cityId: 'valid', science: 3 },
      { cityId: 'negative', science: -4 },
      { cityId: 'nan', science: Number.NaN },
      { cityId: 'infinite', science: Number.POSITIVE_INFINITY },
    ], FULL_CONTRIBUTION_RESEARCH_POLICY)).toMatchObject({
      gross: 3,
      final: 3,
    });
  });
});
