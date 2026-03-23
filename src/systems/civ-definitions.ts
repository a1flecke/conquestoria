import type { CivDefinition } from '@/core/types';

export const CIV_DEFINITIONS: CivDefinition[] = [
  {
    id: 'egypt',
    name: 'Egypt',
    color: '#c4a94d',
    bonusName: 'Master Builders',
    bonusDescription: 'Wonders (Monument, Amphitheater) build 30% faster',
    bonusEffect: { type: 'faster_wonders', speedMultiplier: 0.7 },
    personality: {
      traits: ['diplomatic', 'expansionist'],
      warLikelihood: 0.2,
      diplomacyFocus: 0.7,
      expansionDrive: 0.8,
    },
  },
  {
    id: 'rome',
    name: 'Rome',
    color: '#d94a4a',
    bonusName: 'Roman Roads',
    bonusDescription: 'Roads auto-built between cities (free movement bonus)',
    bonusEffect: { type: 'auto_roads' },
    personality: {
      traits: ['aggressive', 'expansionist'],
      warLikelihood: 0.7,
      diplomacyFocus: 0.3,
      expansionDrive: 0.9,
    },
  },
  {
    id: 'greece',
    name: 'Greece',
    color: '#4a90d9',
    bonusName: 'Diplomatic Influence',
    bonusDescription: 'Relationship scores with AI start at +20',
    bonusEffect: { type: 'diplomacy_start_bonus', bonus: 20 },
    personality: {
      traits: ['diplomatic', 'trader'],
      warLikelihood: 0.15,
      diplomacyFocus: 0.9,
      expansionDrive: 0.4,
    },
  },
  {
    id: 'mongolia',
    name: 'Mongolia',
    color: '#4a9b4a',
    bonusName: 'Horse Lords',
    bonusDescription: 'Mounted units get +1 movement point',
    bonusEffect: { type: 'mounted_movement', bonus: 1 },
    personality: {
      traits: ['aggressive'],
      warLikelihood: 0.8,
      diplomacyFocus: 0.2,
      expansionDrive: 0.6,
    },
  },
  {
    id: 'babylon',
    name: 'Babylon',
    color: '#9b4ad9',
    bonusName: 'Cradle of Knowledge',
    bonusDescription: 'Free tech when entering a new era',
    bonusEffect: { type: 'free_tech_on_era' },
    personality: {
      traits: ['diplomatic'],
      warLikelihood: 0.2,
      diplomacyFocus: 0.6,
      expansionDrive: 0.5,
    },
  },
  {
    id: 'zulu',
    name: 'Zulu',
    color: '#d9944a',
    bonusName: 'Rapid Mobilization',
    bonusDescription: 'Military units train 25% faster',
    bonusEffect: { type: 'faster_military', speedMultiplier: 0.75 },
    personality: {
      traits: ['aggressive'],
      warLikelihood: 0.85,
      diplomacyFocus: 0.1,
      expansionDrive: 0.7,
    },
  },
];

export function getCivDefinition(id: string): CivDefinition | undefined {
  return CIV_DEFINITIONS.find(c => c.id === id);
}
