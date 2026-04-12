import type {
  CivBonusEffect,
  CivDefinition,
  CustomCivDefinition,
  CustomCivPrimaryTraitId,
  PersonalityTraits,
} from '@/core/types';
import { CIV_DEFINITIONS } from '@/systems/civ-definitions';

export interface CustomCivPrimaryTraitMetadata {
  id: CustomCivPrimaryTraitId;
  label: string;
  description: string;
  bonusName: string;
  bonusDescription: string;
  bonusEffect: CivBonusEffect;
  personalityBase: Omit<PersonalityTraits, 'traits'>;
}

export const CUSTOM_CIV_PRIMARY_TRAITS: CustomCivPrimaryTraitMetadata[] = [
  {
    id: 'trade-dominance',
    label: 'Trade Dominance',
    description: 'Build around richer routes and commercial leverage.',
    bonusName: 'Golden Exchange',
    bonusDescription: 'Trade routes yield additional gold.',
    bonusEffect: { type: 'trade_route_bonus', bonusGold: 2 },
    personalityBase: { warLikelihood: 0.25, diplomacyFocus: 0.75, expansionDrive: 0.45 },
  },
  {
    id: 'naval-supremacy',
    label: 'Naval Supremacy',
    description: 'Project power and scouting reach along the coast.',
    bonusName: 'Sea Dominion',
    bonusDescription: 'Coastal cities see farther and support stronger fleets.',
    bonusEffect: { type: 'naval_bonus', visionBonus: 1 },
    personalityBase: { warLikelihood: 0.4, diplomacyFocus: 0.45, expansionDrive: 0.65 },
  },
  {
    id: 'scholarly',
    label: 'Scholarly',
    description: 'Lean into faster discovery and statecraft.',
    bonusName: 'Academies of State',
    bonusDescription: 'Research speed is moderately increased.',
    bonusEffect: { type: 'extra_tech_speed', speedMultiplier: 1.15 },
    personalityBase: { warLikelihood: 0.2, diplomacyFocus: 0.7, expansionDrive: 0.4 },
  },
  {
    id: 'expansionist',
    label: 'Expansionist',
    description: 'Push outward with stronger frontier momentum.',
    bonusName: 'Frontier Engine',
    bonusDescription: 'Mounted units move farther across the map.',
    bonusEffect: { type: 'mounted_movement', bonus: 1 },
    personalityBase: { warLikelihood: 0.45, diplomacyFocus: 0.35, expansionDrive: 0.85 },
  },
  {
    id: 'stealth',
    label: 'Stealth',
    description: 'Favor covert pressure and sharper spy growth.',
    bonusName: 'Quiet Knives',
    bonusDescription: 'Spies gain additional experience from operations.',
    bonusEffect: { type: 'espionage_growth', experienceBonus: 1 },
    personalityBase: { warLikelihood: 0.3, diplomacyFocus: 0.55, expansionDrive: 0.45 },
  },
  {
    id: 'wonder-craft',
    label: 'Wonder Craft',
    description: 'Chase prestige through amplified wonder rewards.',
    bonusName: 'Legacy Workshops',
    bonusDescription: 'Legendary wonder rewards are modestly amplified.',
    bonusEffect: { type: 'wonder_rewards', rewardMultiplier: 1.15 },
    personalityBase: { warLikelihood: 0.2, diplomacyFocus: 0.6, expansionDrive: 0.5 },
  },
];

const BUILT_IN_IDS = new Set(CIV_DEFINITIONS.map(def => def.id));
const PRIMARY_TRAIT_MAP = new Map(CUSTOM_CIV_PRIMARY_TRAITS.map(trait => [trait.id, trait]));
const VALID_TEMPERAMENT_TRAITS = new Set(['aggressive', 'diplomatic', 'expansionist', 'trader']);
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function trimAndFilter(values: string[]): string[] {
  return values.map(value => value.trim()).filter(Boolean);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildCustomCivId(name: string, existingDefinitions: CustomCivDefinition[]): string {
  const baseSlug = slugify(name) || 'civilization';
  const baseId = `custom-${baseSlug}`;
  const existingIds = new Set(existingDefinitions.map(def => def.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

export function mergeCustomCivDefinitions(...definitionSets: CustomCivDefinition[][]): CustomCivDefinition[] {
  const merged = new Map<string, CustomCivDefinition>();
  for (const definitions of definitionSets) {
    for (const definition of definitions) {
      merged.set(definition.id, definition);
    }
  }
  return Array.from(merged.values());
}

export function customCivDefinitionsEqual(a: CustomCivDefinition, b: CustomCivDefinition): boolean {
  return a.id === b.id
    && a.name === b.name
    && a.color === b.color
    && a.leaderName === b.leaderName
    && a.primaryTrait === b.primaryTrait
    && a.temperamentTraits.length === b.temperamentTraits.length
    && a.temperamentTraits.every((trait, index) => trait === b.temperamentTraits[index])
    && a.cityNames.length === b.cityNames.length
    && a.cityNames.every((name, index) => name === b.cityNames[index]);
}

export function validateCustomCivDefinition(definition: CustomCivDefinition): void {
  if (BUILT_IN_IDS.has(definition.id)) {
    throw new Error('Custom civilization ID collides with a built-in civilization');
  }
  if (!definition.id.startsWith('custom-')) {
    throw new Error('Custom civilization ID must start with "custom-"');
  }
  if (!HEX_COLOR_PATTERN.test(definition.color)) {
    throw new Error('Custom civilization color must be a valid hex color');
  }
  if (!PRIMARY_TRAIT_MAP.has(definition.primaryTrait)) {
    throw new Error(`Unknown primary trait: ${definition.primaryTrait}`);
  }
  if (definition.temperamentTraits.length < 1 || definition.temperamentTraits.length > 2) {
    throw new Error('Custom civilization must choose 1-2 temperament traits');
  }
  for (const trait of definition.temperamentTraits) {
    if (!VALID_TEMPERAMENT_TRAITS.has(trait)) {
      throw new Error(`Unknown temperament trait: ${trait}`);
    }
  }
  const cityNames = trimAndFilter(definition.cityNames);
  if (cityNames.length < 6) {
    throw new Error('Custom civilization requires a city-name pool of at least 6 names');
  }
  if (new Set(cityNames.map(name => name.toLowerCase())).size !== cityNames.length) {
    throw new Error('Custom civilization city-name pool must use unique names');
  }
}

export function normalizeCustomCivDefinition(definition: CustomCivDefinition): CivDefinition {
  validateCustomCivDefinition(definition);
  const primaryTrait = PRIMARY_TRAIT_MAP.get(definition.primaryTrait);
  if (!primaryTrait) {
    throw new Error(`Unknown primary trait: ${definition.primaryTrait}`);
  }

  return {
    id: definition.id.trim(),
    name: definition.name.trim(),
    color: definition.color.trim(),
    leaderName: definition.leaderName.trim(),
    cityNames: trimAndFilter(definition.cityNames),
    bonusName: primaryTrait.bonusName,
    bonusDescription: primaryTrait.bonusDescription,
    bonusEffect: primaryTrait.bonusEffect,
    personality: {
      traits: [...definition.temperamentTraits],
      warLikelihood: primaryTrait.personalityBase.warLikelihood,
      diplomacyFocus: primaryTrait.personalityBase.diplomacyFocus,
      expansionDrive: primaryTrait.personalityBase.expansionDrive,
    },
  };
}

export function normalizeCustomCivDefinitions(definitions: CustomCivDefinition[]): CivDefinition[] {
  const seen = new Set<string>();
  return definitions.map(definition => {
    if (seen.has(definition.id)) {
      throw new Error('Duplicate custom civilization ID');
    }
    seen.add(definition.id);
    return normalizeCustomCivDefinition(definition);
  });
}
