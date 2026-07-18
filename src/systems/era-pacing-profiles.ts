/**
 * Explicit pacing anchors for every authored era. The Era 13 science values come from the
 * deterministic bounded/maximal reference-economy fixture; later unauthored frontiers reuse
 * the final authored profile rather than pretending that new content exists.
 */
export interface EraPacingProfile {
  era: number;
  advancementFraction: number;
  productionPerTurn: number;
  boundedSciencePerTurn: number;
  completionistSciencePerTurn: number;
}

export const ERA_PACING_PROFILES: ReadonlyMap<number, EraPacingProfile> = new Map([
  [1, { era: 1, advancementFraction: 1, productionPerTurn: 4, boundedSciencePerTurn: 2, completionistSciencePerTurn: 1 }],
  [2, { era: 2, advancementFraction: 0.5, productionPerTurn: 6, boundedSciencePerTurn: 6, completionistSciencePerTurn: 4 }],
  [3, { era: 3, advancementFraction: 0.5, productionPerTurn: 8, boundedSciencePerTurn: 8, completionistSciencePerTurn: 7 }],
  [4, { era: 4, advancementFraction: 0.6, productionPerTurn: 10, boundedSciencePerTurn: 9, completionistSciencePerTurn: 10 }],
  [5, { era: 5, advancementFraction: 0.6, productionPerTurn: 12, boundedSciencePerTurn: 9, completionistSciencePerTurn: 13 }],
  [6, { era: 6, advancementFraction: 0.6, productionPerTurn: 14, boundedSciencePerTurn: 24, completionistSciencePerTurn: 16 }],
  [7, { era: 7, advancementFraction: 0.6, productionPerTurn: 16, boundedSciencePerTurn: 29, completionistSciencePerTurn: 19 }],
  [8, { era: 8, advancementFraction: 0.6, productionPerTurn: 18, boundedSciencePerTurn: 46, completionistSciencePerTurn: 22 }],
  [9, { era: 9, advancementFraction: 0.55, productionPerTurn: 20, boundedSciencePerTurn: 59, completionistSciencePerTurn: 25 }],
  [10, { era: 10, advancementFraction: 0.55, productionPerTurn: 22, boundedSciencePerTurn: 66, completionistSciencePerTurn: 135 }],
  [11, { era: 11, advancementFraction: 0.55, productionPerTurn: 24, boundedSciencePerTurn: 93, completionistSciencePerTurn: 170 }],
  [12, { era: 12, advancementFraction: 0.55, productionPerTurn: 26, boundedSciencePerTurn: 103, completionistSciencePerTurn: 198 }],
  [13, { era: 13, advancementFraction: 1, productionPerTurn: 28, boundedSciencePerTurn: 102, completionistSciencePerTurn: 236 }],
]);

export function requireEraPacingProfile(era: number): EraPacingProfile {
  const profile = ERA_PACING_PROFILES.get(era);
  if (!profile) throw new Error(`Missing authored pacing profile for era ${era}`);
  return profile;
}

export function getEraAdvancementFraction(era: number): number {
  return requireEraPacingProfile(era).advancementFraction;
}

export function getFrontierPacingProfile(era: number): EraPacingProfile {
  const normalizedEra = Number.isFinite(era) ? Math.max(1, Math.floor(era)) : 1;
  const availableEra = [...ERA_PACING_PROFILES.keys()]
    .filter(candidate => candidate <= normalizedEra)
    .at(-1) ?? 1;
  return requireEraPacingProfile(availableEra);
}
