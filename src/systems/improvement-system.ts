import type { HexTile, ImprovementType, ResourceYield } from '@/core/types';

export const IMPROVEMENT_BUILD_TURNS: Record<ImprovementType, number> = {
  farm: 4,
  mine: 5,
  none: 0,
};

const VALID_TERRAIN: Record<ImprovementType, string[]> = {
  farm: ['grassland', 'plains', 'desert', 'forest', 'jungle'],
  mine: ['hills', 'plains', 'mountain', 'volcanic'],
  none: [],
};

const YIELD_BONUSES: Record<ImprovementType, ResourceYield> = {
  farm: { food: 2, production: 0, gold: 0, science: 0 },
  mine: { food: 0, production: 2, gold: 1, science: 0 },
  none: { food: 0, production: 0, gold: 0, science: 0 },
};

export function canBuildImprovement(tile: HexTile, type: ImprovementType): boolean {
  if (type === 'none') return false;
  if (tile.improvement !== 'none') return false;
  return VALID_TERRAIN[type].includes(tile.terrain);
}

export function getImprovementYieldBonus(type: ImprovementType): ResourceYield {
  return { ...YIELD_BONUSES[type] };
}
