import type { PersonalityTraits, Tech, TechTrack } from '@/core/types';

const TRACK_WEIGHTS: Record<string, Record<TechTrack, number>> = {
  aggressive:   { military: 3, economy: 1, science: 1, civics: 0.5, exploration: 1.5 },
  diplomatic:   { military: 0.5, economy: 1.5, science: 1, civics: 3, exploration: 1 },
  expansionist: { military: 1, economy: 2, science: 1, civics: 1, exploration: 2.5 },
  trader:       { military: 0.5, economy: 3, science: 1, civics: 1.5, exploration: 1.5 },
};

export function weightTechChoice(personality: PersonalityTraits, tech: Tech): number {
  let weight = 1;
  for (const trait of personality.traits) {
    const trackWeights = TRACK_WEIGHTS[trait];
    if (trackWeights) {
      weight *= trackWeights[tech.track] ?? 1;
    }
  }
  return weight;
}

const MILITARY_ITEMS = ['warrior', 'scout', 'barracks', 'walls', 'stable', 'forge'];
const ECONOMY_ITEMS = ['marketplace', 'harbor', 'lumbermill', 'quarry-building'];
const SETTLER_ITEMS = ['settler'];

export function weightProductionChoice(
  personality: PersonalityTraits,
  itemId: string,
  underThreat: boolean,
): number {
  let weight = 1;

  if (MILITARY_ITEMS.includes(itemId)) {
    weight *= 1 + personality.warLikelihood;
    if (underThreat) weight *= 2;
  } else if (ECONOMY_ITEMS.includes(itemId)) {
    weight *= 1 + (1 - personality.warLikelihood);
  } else if (SETTLER_ITEMS.includes(itemId)) {
    weight *= 1 + personality.expansionDrive;
  }

  return weight;
}

export function shouldDeclareWar(
  personality: PersonalityTraits,
  relationship: number,
  militaryAdvantage: number,
): boolean {
  if (relationship > 30) return false;
  const warScore = personality.warLikelihood * militaryAdvantage;
  const peacePressure = Math.max(0, relationship) / 100;
  return warScore > (0.8 + peacePressure);
}
