import type {
  BuildableImprovementType,
  HexTile,
  ImprovementType,
  ResourceYield,
  TerrainType,
  WorkerActionType,
} from '@/core/types';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import { TECH_TREE } from '@/systems/tech-definitions';

// Improvements that only make sense on tiles with a specific resource.
// Derived from RESOURCE_DEFINITIONS at module load — avoids re-scanning on every call.
const RESOURCE_GATED_IMPROVEMENTS = new Map<BuildableImprovementType, Set<string>>();
for (const rd of RESOURCE_DEFINITIONS) {
  const set = RESOURCE_GATED_IMPROVEMENTS.get(rd.requiredImprovement) ?? new Set<string>();
  set.add(rd.id);
  RESOURCE_GATED_IMPROVEMENTS.set(rd.requiredImprovement, set);
}

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

export interface WorkerActionEligibilityOptions {
  isCityTile?: boolean;
  allowReplacement?: boolean;
}

export type WorkerActionBlockerReason =
  | 'outside-territory'
  | 'city-center'
  | 'already-improved'
  | 'invalid-terrain'
  | 'requires-river'
  | 'requires-tech'
  | 'missing-resource'
  | 'none';

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
    validTerrains: ['hills', 'plains', 'volcanic'],
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
  plantation: {
    type: 'plantation',
    name: 'Plantation',
    buildTurns: 4,
    validTerrains: ['grassland', 'plains', 'jungle', 'desert'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 1, production: 0, gold: 1, science: 0 },
    preservesTerrain: true,
  },
  pasture: {
    type: 'pasture',
    name: 'Pasture',
    buildTurns: 3,
    validTerrains: ['grassland', 'plains', 'hills'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 1, production: 0, gold: 0, science: 0 },
    preservesTerrain: true,
  },
  camp: {
    type: 'camp',
    name: 'Camp',
    buildTurns: 3,
    validTerrains: ['forest', 'tundra'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 1, production: 0, gold: 0, science: 0 },
    preservesTerrain: true,
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    buildTurns: 5,
    validTerrains: ['mountain', 'hills'],
    requiresRiver: false,
    requiredTech: null,
    yieldBonus: { food: 0, production: 1, gold: 0, science: 0 },
    preservesTerrain: true,
  },
};

export const IMPROVEMENT_BUILD_TURNS: Record<ImprovementType, number> = {
  farm: IMPROVEMENT_DEFINITIONS.farm.buildTurns,
  mine: IMPROVEMENT_DEFINITIONS.mine.buildTurns,
  lumber_camp: IMPROVEMENT_DEFINITIONS.lumber_camp.buildTurns,
  watermill: IMPROVEMENT_DEFINITIONS.watermill.buildTurns,
  plantation: IMPROVEMENT_DEFINITIONS.plantation.buildTurns,
  pasture: IMPROVEMENT_DEFINITIONS.pasture.buildTurns,
  camp: IMPROVEMENT_DEFINITIONS.camp.buildTurns,
  quarry: IMPROVEMENT_DEFINITIONS.quarry.buildTurns,
  none: 0,
};

const NO_YIELD: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };

export function canBuildImprovement(
  tile: HexTile,
  type: BuildableImprovementType,
  completedTechs: string[] = [],
  ownerId?: string,
  options: WorkerActionEligibilityOptions = {},
): boolean {
  const definition = IMPROVEMENT_DEFINITIONS[type];
  if (!definition) return false;
  if (options.isCityTile) return false;
  if (ownerId && tile.owner !== ownerId) return false;
  if (tile.improvement !== 'none' && (!options.allowReplacement || tile.improvement === type)) return false;
  if (!definition.validTerrains.includes(tile.terrain)) return false;
  if (definition.requiresRiver && !tile.hasRiver) return false;
  if (definition.requiredTech && !completedTechs.includes(definition.requiredTech)) return false;
  const resourceSet = RESOURCE_GATED_IMPROVEMENTS.get(type);
  if (resourceSet !== undefined) {
    if (!tile.resource || !resourceSet.has(tile.resource)) return false;
  }
  return true;
}

export function canDrainSwamp(
  tile: HexTile,
  ownerId?: string,
  options: WorkerActionEligibilityOptions = {},
): boolean {
  if (options.isCityTile) return false;
  if (ownerId && tile.owner !== ownerId) return false;
  return tile.terrain === 'swamp' && tile.improvement === 'none';
}

export function getAvailableWorkerActions(
  tile: HexTile | undefined,
  completedTechs: string[] = [],
  ownerId?: string,
  options: WorkerActionEligibilityOptions = {},
): WorkerActionType[] {
  if (!tile) return [];
  const actions: WorkerActionType[] = [];
  for (const type of Object.keys(IMPROVEMENT_DEFINITIONS) as BuildableImprovementType[]) {
    if (canBuildImprovement(tile, type, completedTechs, ownerId, options)) actions.push(type);
  }
  if (canDrainSwamp(tile, ownerId, options)) actions.push('drain_swamp');
  return actions;
}

export function getWorkerActionBlockerReason(
  tile: HexTile | undefined,
  action: WorkerActionType,
  completedTechs: string[] = [],
  ownerId?: string,
  options: WorkerActionEligibilityOptions = {},
): WorkerActionBlockerReason {
  if (!tile) return 'invalid-terrain';
  if (ownerId && tile.owner !== ownerId) return 'outside-territory';
  if (options.isCityTile) return 'city-center';
  if (tile.improvement !== 'none' && (!options.allowReplacement || tile.improvement === action)) return 'already-improved';

  if (action === 'drain_swamp') {
    return tile.terrain === 'swamp' ? 'none' : 'invalid-terrain';
  }

  const definition = IMPROVEMENT_DEFINITIONS[action];
  if (!definition.validTerrains.includes(tile.terrain)) return 'invalid-terrain';
  if (definition.requiresRiver && !tile.hasRiver) return 'requires-river';
  if (definition.requiredTech && !completedTechs.includes(definition.requiredTech)) return 'requires-tech';
  const resourceSet = RESOURCE_GATED_IMPROVEMENTS.get(action as BuildableImprovementType);
  if (resourceSet !== undefined) {
    if (!tile.resource || !resourceSet.has(tile.resource)) return 'missing-resource';
  }
  return 'none';
}

export function formatWorkerActionBlockerReason(reason: WorkerActionBlockerReason): string {
  switch (reason) {
    case 'outside-territory': return 'Outside your territory';
    case 'city-center': return 'City centers cannot be improved';
    case 'already-improved': return 'Already improved';
    case 'invalid-terrain': return 'No worker improvement fits this terrain';
    case 'requires-river': return 'Requires river';
    case 'requires-tech': return 'Requires technology';
    case 'missing-resource': return 'No matching resource on this tile';
    case 'none': return '';
  }
}

export function getImprovementYieldBonus(type: ImprovementType): ResourceYield {
  if (type === 'none') return { ...NO_YIELD };
  return { ...IMPROVEMENT_DEFINITIONS[type].yieldBonus };
}

export function getImprovementDisplayName(type: ImprovementType): string {
  if (type === 'none') return 'None';
  return IMPROVEMENT_DEFINITIONS[type].name;
}

export function formatImprovementYieldLabel(type: ImprovementType): string {
  if (type === 'none') return '';
  const bonus = IMPROVEMENT_DEFINITIONS[type as BuildableImprovementType].yieldBonus;
  const parts: string[] = [];
  if (bonus.food) parts.push(`+${bonus.food} Food`);
  if (bonus.production) parts.push(`+${bonus.production} Prod`);
  if (bonus.gold) parts.push(`+${bonus.gold} Gold`);
  if (bonus.science) parts.push(`+${bonus.science} Science`);
  return parts.length ? `(${parts.join(', ')})` : '';
}

export function getWorkerActionLabel(action: WorkerActionType): string {
  if (action === 'drain_swamp') return 'Drain Swamp (20% worker risk)';
  return `Build ${getImprovementDisplayName(action)}`;
}

export function getWorkerBlockerHints(
  tile: HexTile | undefined,
  completedTechs: string[] = [],
  ownerId?: string,
  options: WorkerActionEligibilityOptions = {},
): string[] {
  if (!tile) return [];
  if (getAvailableWorkerActions(tile, completedTechs, ownerId, options).length > 0) return [];

  const hints: string[] = [];
  for (const type of Object.keys(IMPROVEMENT_DEFINITIONS) as BuildableImprovementType[]) {
    const reason = getWorkerActionBlockerReason(tile, type, completedTechs, ownerId, options);
    if (reason === 'missing-resource') {
      const resourceSet = RESOURCE_GATED_IMPROVEMENTS.get(type);
      if (resourceSet && resourceSet.size > 0) {
        const names = RESOURCE_DEFINITIONS
          .filter(rd => resourceSet.has(rd.id))
          .map(rd => rd.name);
        hints.push(`${IMPROVEMENT_DEFINITIONS[type].name} requires ${names.join(', ')}`);
      }
    } else if (reason === 'requires-tech') {
      const def = IMPROVEMENT_DEFINITIONS[type];
      if (def.requiredTech) {
        const tech = TECH_TREE.find(t => t.id === def.requiredTech);
        hints.push(`${def.name} requires ${tech?.name ?? def.requiredTech}`);
      }
    }
  }
  return hints;
}
