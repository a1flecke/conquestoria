import type { BuildableImprovementType, ResourceType } from '@/core/types';

export interface ResourceEffect {
  type: 'happiness' | 'gold' | 'production' | 'food';
  amount: number;
}

export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string | string[];
  basePrice: number;
  tech: string;
  icon: string;
  requiredImprovement: BuildableImprovementType;
  effect: ResourceEffect | null;
}

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  { id: 'silk', name: 'Silk', type: 'luxury', terrain: 'grassland', basePrice: 8, tech: 'irrigation', icon: '🧵', requiredImprovement: 'plantation', effect: { type: 'happiness', amount: 1 } },
  { id: 'wine', name: 'Wine', type: 'luxury', terrain: 'plains', basePrice: 7, tech: 'pottery', icon: '🍇', requiredImprovement: 'plantation', effect: { type: 'happiness', amount: 1 } },
  { id: 'ivory', name: 'Ivory', type: 'luxury', terrain: 'forest', basePrice: 9, tech: 'foraging', icon: '🐘', requiredImprovement: 'camp', effect: { type: 'happiness', amount: 1 } },
  { id: 'furs', name: 'Furs', type: 'luxury', terrain: ['forest', 'tundra'], basePrice: 9, tech: 'foraging', icon: '🦊', requiredImprovement: 'camp', effect: { type: 'happiness', amount: 1 } },
  { id: 'incense', name: 'Incense', type: 'luxury', terrain: 'desert', basePrice: 6, tech: 'currency', icon: '🕯️', requiredImprovement: 'plantation', effect: { type: 'happiness', amount: 1 } },
  { id: 'gems', name: 'Gems', type: 'luxury', terrain: 'hills', basePrice: 12, tech: 'mining-tech', icon: '💎', requiredImprovement: 'mine', effect: { type: 'gold', amount: 1 } },
  { id: 'gold', name: 'Gold', type: 'luxury', terrain: 'hills', basePrice: 15, tech: 'currency', icon: '⭐', requiredImprovement: 'mine', effect: { type: 'gold', amount: 1 } },
  { id: 'silver', name: 'Silver', type: 'luxury', terrain: 'hills', basePrice: 11, tech: 'mining-tech', icon: '🥈', requiredImprovement: 'mine', effect: { type: 'gold', amount: 1 } },
  { id: 'spices', name: 'Spices', type: 'luxury', terrain: 'jungle', basePrice: 10, tech: 'cartography', icon: '🌶️', requiredImprovement: 'plantation', effect: { type: 'gold', amount: 1 } },
  { id: 'sheep', name: 'Sheep', type: 'luxury', terrain: ['hills', 'plains'], basePrice: 7, tech: 'animal-husbandry', icon: '🐑', requiredImprovement: 'pasture', effect: { type: 'production', amount: 1 } },
  { id: 'cattle', name: 'Cattle', type: 'strategic', terrain: ['grassland', 'plains'], basePrice: 5, tech: 'domestication', icon: '🐄', requiredImprovement: 'pasture', effect: { type: 'food', amount: 1 } },
  { id: 'salt', name: 'Salt', type: 'strategic', terrain: 'hills', basePrice: 5, tech: 'pottery', icon: '🧂', requiredImprovement: 'mine', effect: { type: 'gold', amount: 1 } },
  { id: 'copper', name: 'Copper', type: 'strategic', terrain: 'hills', basePrice: 5, tech: 'stone-weapons', icon: '🪙', requiredImprovement: 'mine', effect: null },
  { id: 'iron', name: 'Iron', type: 'strategic', terrain: 'hills', basePrice: 8, tech: 'bronze-working', icon: '⚙️', requiredImprovement: 'mine', effect: null },
  { id: 'horses', name: 'Horses', type: 'strategic', terrain: 'plains', basePrice: 7, tech: 'animal-husbandry', icon: '🐎', requiredImprovement: 'pasture', effect: null },
  { id: 'stone', name: 'Stone', type: 'strategic', terrain: 'mountain', basePrice: 4, tech: 'gathering', icon: '🪨', requiredImprovement: 'quarry', effect: null },
];
