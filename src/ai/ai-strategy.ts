import type { PersonalityTraits, Tech, HexCoord } from '@/core/types';
import { weightTechChoice, weightProductionChoice } from './ai-personality';
import { NATIONAL_INTENT_POSTURE } from './ai-national-intent';

// #1087 Phase 0 audit: `chooseTech` has zero callers outside its own test file --
// `ai-research.ts` calls `weightTechChoice` directly through its real candidate pipeline.
// Left as dead code (not this issue's scope to remove); the neutral `develop` posture below
// keeps this compiling without pretending a real intent flows through an unused function.
export function chooseTech(personality: PersonalityTraits, availableTechs: Tech[]): Tech {
  if (availableTechs.length === 0) {
    throw new Error('No available techs');
  }

  const posture = NATIONAL_INTENT_POSTURE.develop;
  let bestTech = availableTechs[0];
  let bestWeight = weightTechChoice(personality, bestTech, posture);

  for (let i = 1; i < availableTechs.length; i++) {
    const w = weightTechChoice(personality, availableTechs[i], posture);
    if (w > bestWeight) {
      bestWeight = w;
      bestTech = availableTechs[i];
    }
  }

  return bestTech;
}

export function chooseProduction(
  personality: PersonalityTraits,
  availableItems: string[],
  underThreat: boolean,
  cityCount: number,
): string {
  if (availableItems.length === 0) return 'warrior';

  let bestItem = availableItems[0];
  let bestWeight = weightProductionChoice(personality, bestItem, underThreat);

  for (let i = 1; i < availableItems.length; i++) {
    let w = weightProductionChoice(personality, availableItems[i], underThreat);

    if (availableItems[i] === 'settler' && cityCount >= 4) {
      w *= 0.3;
    }

    if (w > bestWeight) {
      bestWeight = w;
      bestItem = availableItems[i];
    }
  }

  return bestItem;
}

export function evaluateExpansionTarget(
  _position: HexCoord,
  terrainCounts: Record<string, number>,
): number {
  let score = 0;

  score += (terrainCounts['grassland'] ?? 0) * 3;
  score += (terrainCounts['plains'] ?? 0) * 2.5;
  score += (terrainCounts['forest'] ?? 0) * 2;
  score += (terrainCounts['hills'] ?? 0) * 2;
  score += (terrainCounts['jungle'] ?? 0) * 1.5;

  score -= (terrainCounts['ocean'] ?? 0) * 2;
  score -= (terrainCounts['mountain'] ?? 0) * 1;

  score += (terrainCounts['desert'] ?? 0) * 0.5;
  score += (terrainCounts['tundra'] ?? 0) * 0.5;

  return score;
}
