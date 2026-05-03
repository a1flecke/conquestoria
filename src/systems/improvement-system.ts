import type {
  BuildableImprovementType,
  HexTile,
  ImprovementType,
  ResourceYield,
  TerrainType,
  WorkerActionType,
} from '@/core/types';

export interface ImprovementDefinition {
  type: BuildableImprovementType;
  name: string;
  buildTurns: number;
  validTerrains: TerrainType[];
  requiresRiver: boolean;
  requiredTech: string | null;
  yieldBonus: ResourceYield;
  preservesTerrain: boolean;
}

export const IMPROVEMENT_DEFINITIONS: Record<BuildableImprovementType, ImprovementDefinition> = {
  farm: {
    type: 'farm',
    name: 'Farm',
    buildTurns: 4,
    validTerrains: ['grassland', 'plains', 'desert', 'forest', 'jungle'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 2, production: 0, gold: 0, science: 0 },
    preservesTerrain: false,
  },
  mine: {
    type: 'mine',
    name: 'Mine',
    buildTurns: 5,
    validTerrains: ['hills', 'plains', 'mountain', 'volcanic'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 0, production: 2, gold: 1, science: 0 },
    preservesTerrain: true,
  },
  lumber_camp: {
    type: 'lumber_camp',
    name: 'Lumber Camp',
    buildTurns: 5,
    validTerrains: ['forest', 'jungle'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 0, production: 2, gold: 0, science: 0 },
    preservesTerrain: true,
  },
  watermill: {
    type: 'watermill',
    name: 'Watermill',
    buildTurns: 5,
    validTerrains: ['grassland', 'plains', 'forest', 'jungle', 'swamp'],
    requiresRiver: true,
    requiredTech: null,
    yieldBonus: { food: 1, production: 1, gold: 0, science: 0 },
    preservesTerrain: true,
  },
};

export const IMPROVEMENT_BUILD_TURNS: Record<ImprovementType, number> = {
  farm: IMPROVEMENT_DEFINITIONS.farm.buildTurns,
  mine: IMPROVEMENT_DEFINITIONS.mine.buildTurns,
  lumber_camp: IMPROVEMENT_DEFINITIONS.lumber_camp.buildTurns,
  watermill: IMPROVEMENT_DEFINITIONS.watermill.buildTurns,
  none: 0,
};

const NO_YIELD: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };

export function canBuildImprovement(
  tile: HexTile,
  type: BuildableImprovementType,
  completedTechs: string[] = [],
  ownerId?: string,
): boolean {
  const definition = IMPROVEMENT_DEFINITIONS[type];
  if (!definition) return false;
  if (ownerId && tile.owner !== ownerId) return false;
  if (tile.improvement !== 'none') return false;
  if (!definition.validTerrains.includes(tile.terrain)) return false;
  if (definition.requiresRiver && !tile.hasRiver) return false;
  if (definition.requiredTech && !completedTechs.includes(definition.requiredTech)) return false;
  return true;
}

export function canDrainSwamp(tile: HexTile, ownerId?: string): boolean {
  if (ownerId && tile.owner !== ownerId) return false;
  return tile.terrain === 'swamp' && tile.improvement === 'none';
}

export function getAvailableWorkerActions(
  tile: HexTile | undefined,
  completedTechs: string[] = [],
  ownerId?: string,
): WorkerActionType[] {
  if (!tile) return [];
  const actions: WorkerActionType[] = [];
  for (const type of Object.keys(IMPROVEMENT_DEFINITIONS) as BuildableImprovementType[]) {
    if (canBuildImprovement(tile, type, completedTechs, ownerId)) actions.push(type);
  }
  if (canDrainSwamp(tile, ownerId)) actions.push('drain_swamp');
  return actions;
}

export function getImprovementYieldBonus(type: ImprovementType): ResourceYield {
  if (type === 'none') return { ...NO_YIELD };
  return { ...IMPROVEMENT_DEFINITIONS[type].yieldBonus };
}

export function getWorkerActionLabel(action: WorkerActionType): string {
  if (action === 'drain_swamp') return 'Drain Swamp (20% worker risk)';
  return `Build ${IMPROVEMENT_DEFINITIONS[action].name}`;
}
