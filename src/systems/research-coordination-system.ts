export interface ResearchCityContribution {
  cityId: string;
  science: number;
}

export interface ResearchCoordinationPolicy {
  decayExponent: number;
  minimumWeight: number;
}

export interface CoordinatedResearchCityContribution extends ResearchCityContribution {
  rank: number;
  weight: number;
  weightedScience: number;
}

export interface CoordinatedCityScience {
  contributions: CoordinatedResearchCityContribution[];
  gross: number;
  unroundedTotal: number;
  final: number;
}

export const FULL_CONTRIBUTION_RESEARCH_POLICY: ResearchCoordinationPolicy = {
  decayExponent: 0,
  minimumWeight: 1,
};

export const DIMINISHING_RESEARCH_POLICY: ResearchCoordinationPolicy = {
  decayExponent: 0.85,
  minimumWeight: 0.15,
};

export function getResearchCityWeight(rank: number, policy: ResearchCoordinationPolicy): number {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new RangeError('Research city rank must be a positive integer.');
  }
  return Math.max(policy.minimumWeight, rank ** -policy.decayExponent);
}

function normalizeScience(science: number): number {
  return Number.isFinite(science) ? Math.max(0, science) : 0;
}

export function calculateCoordinatedCityScience(
  cityContributions: readonly ResearchCityContribution[],
  policy: ResearchCoordinationPolicy,
): CoordinatedCityScience {
  const sorted = cityContributions
    .map(contribution => ({
      cityId: contribution.cityId,
      science: normalizeScience(contribution.science),
    }))
    .sort((left, right) => right.science - left.science || left.cityId.localeCompare(right.cityId));

  const contributions = sorted.map((contribution, index) => {
    const rank = index + 1;
    const weight = getResearchCityWeight(rank, policy);
    return {
      ...contribution,
      rank,
      weight,
      weightedScience: contribution.science * weight,
    };
  });
  const gross = contributions.reduce((total, contribution) => total + contribution.science, 0);
  const unroundedTotal = contributions.reduce((total, contribution) => total + contribution.weightedScience, 0);

  return {
    contributions,
    gross,
    unroundedTotal,
    final: Math.floor(unroundedTotal),
  };
}
