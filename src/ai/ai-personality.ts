import type { AIStrategicRole, PersonalityTraits, Tech, TechTrack } from '@/core/types';

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

// barracks: +10 XP for land combat units trained here (see turn-manager.ts unit-creation hook);
// walls: real city defense since MR3; stable: real cavalry cost discount since MR12 Task 2.
// This is a flat list, not era-tiered, so late-era items (star_fort, anti_air_battery) are
// covered by the generic AI building-candidate path in ai-production.ts instead of here.
const MILITARY_ITEMS = ['warrior', 'scout', 'barracks', 'walls', 'stable', 'forge'];
const ECONOMY_ITEMS = ['marketplace', 'harbor', 'lumbermill', 'quarry-building'];
const SETTLER_ITEMS = ['settler'];
const NAVAL_WARSHIP_ITEMS = ['galley', 'trireme'];
const NAVAL_TRANSPORT_ITEMS = ['transport', 'carrack', 'galleon', 'steamship', 'troop_transport'];

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
  } else if (NAVAL_WARSHIP_ITEMS.includes(itemId)) {
    weight *= 1 + personality.warLikelihood * 0.5;
  } else if (NAVAL_TRANSPORT_ITEMS.includes(itemId)) {
    weight *= 1 + personality.expansionDrive * 0.4;
  }

  return weight;
}

const COMBAT_PRODUCTION_ROLES = new Set<AIStrategicRole>([
  'capture',
  'frontline',
  'ranged',
  'siege',
  'mobile',
  'air-combat',
  'naval-combat',
  'escort',
]);

export function weightProductionRoles(
  personality: PersonalityTraits,
  roles: readonly AIStrategicRole[],
): number {
  let score = 0;
  if (roles.some(role => COMBAT_PRODUCTION_ROLES.has(role))) {
    score += personality.warLikelihood * 20;
  }
  if (roles.includes('settlement')) {
    score += personality.expansionDrive * 24;
  }
  if (roles.includes('transport') || roles.includes('recon')) {
    score += personality.expansionDrive * 8;
  }
  if (roles.includes('trade')) {
    score += personality.traits.includes('trader') ? 16 : 0;
  }
  if (roles.includes('espionage')) {
    score += personality.diplomacyFocus * 4;
  }
  if (roles.includes('missionary')) {
    score += personality.diplomacyFocus * 6;
  }
  return score;
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
