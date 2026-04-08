import type { PersonalityTraits, Tech, TechTrack } from '@/core/types';

const TRACK_WEIGHTS: Record<string, Record<TechTrack, number>> = {
  aggressive:   { military: 3, economy: 1, science: 1, civics: 0.5, exploration: 1.5, agriculture: 1, medicine: 0.5, philosophy: 0.5, arts: 0.5, maritime: 1, metallurgy: 2.5, construction: 1.5, communication: 0.5, espionage: 1.5, spirituality: 0.5 },
  diplomatic:   { military: 0.5, economy: 1.5, science: 1, civics: 3, exploration: 1, agriculture: 1, medicine: 1.5, philosophy: 2, arts: 2, maritime: 1, metallurgy: 0.5, construction: 1, communication: 2, espionage: 0.5, spirituality: 2 },
  expansionist: { military: 1, economy: 2, science: 1, civics: 1, exploration: 2.5, agriculture: 2, medicine: 1, philosophy: 0.5, arts: 0.5, maritime: 2, metallurgy: 1, construction: 2, communication: 1.5, espionage: 1, spirituality: 0.5 },
  trader:       { military: 0.5, economy: 3, science: 1, civics: 1.5, exploration: 1.5, agriculture: 1.5, medicine: 1, philosophy: 1, arts: 1.5, maritime: 2, metallurgy: 0.5, construction: 1, communication: 2, espionage: 1, spirituality: 1 },
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
  currentTurn: number,
  hasMetTarget: boolean,
  hasBorderPressure: boolean,
): boolean {
  if (!hasMetTarget) return false;
  if (relationship > 30) return false;
  if (currentTurn <= 5) {
    return hasBorderPressure
      && relationship <= -80
      && militaryAdvantage >= 2
      && personality.warLikelihood >= 0.8;
  }
  const warScore = personality.warLikelihood * militaryAdvantage;
  const peacePressure = Math.max(0, relationship) / 100;
  return warScore > (0.8 + peacePressure);
}
