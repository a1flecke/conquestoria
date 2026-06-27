import type { Tech } from '@/core/types';
import { TECH_TREE_ERAS_1_4 } from './tech-definitions-eras1-4';
import { TECH_TREE_ERAS_5_7 } from './tech-definitions-eras5-7';
import { TECH_TREE_ERAS_8 } from './tech-definitions-eras8';
import { TECH_TREE_ERAS_9 } from './tech-definitions-eras9';
import { TECH_TREE_ERAS_10 } from './tech-definitions-eras10';
import { TECH_TREE_ERAS_11 } from './tech-definitions-eras11';

export { TECH_TREE_ERAS_1_4 } from './tech-definitions-eras1-4';
export { TECH_TREE_ERAS_5_7 } from './tech-definitions-eras5-7';
export { TECH_TREE_ERAS_8 } from './tech-definitions-eras8';
export { TECH_TREE_ERAS_9 } from './tech-definitions-eras9';
export { TECH_TREE_ERAS_10 } from './tech-definitions-eras10';
export { TECH_TREE_ERAS_11 } from './tech-definitions-eras11';

export const TECH_TREE: Tech[] = [
  ...TECH_TREE_ERAS_1_4,
  ...TECH_TREE_ERAS_5_7,
  ...TECH_TREE_ERAS_8,
  ...TECH_TREE_ERAS_9,
  ...TECH_TREE_ERAS_10,
  ...TECH_TREE_ERAS_11,
];

export function getEraAdvancementTechs(era: number): Tech[] {
  return TECH_TREE.filter(tech => tech.era === era && tech.countsForEraAdvancement !== false);
}

export function hasReachedEraThreshold(completedTechIds: readonly string[], era: number): boolean {
  const advancementTechs = getEraAdvancementTechs(era);
  if (advancementTechs.length === 0) return false;
  const completed = new Set(completedTechIds);
  const completedCount = advancementTechs.filter(tech => completed.has(tech.id)).length;
  return completedCount >= Math.ceil(advancementTechs.length * 0.6);
}

export function resolveCivilizationEra(completedTechIds: readonly string[]): number {
  const maxEra = Math.max(1, ...TECH_TREE.map(tech => tech.era));
  let era = 1;

  for (let candidate = 2; candidate <= maxEra; candidate++) {
    if (!hasReachedEraThreshold(completedTechIds, candidate)) break;
    era = candidate;
  }

  return era;
}
