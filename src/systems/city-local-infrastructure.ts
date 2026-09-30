import type { LocalInfrastructureFamily, UnitType } from '@/core/types';
import { getUnitRoleDefinition } from './combat-role-definitions';

/**
 * Local-infrastructure families (#1008): the buildings that grant a
 * production discount and/or a city healing bonus to units in a matching
 * role family. The table is shared by `city-production-cost.ts` (discount)
 * and the turn-time healing query exported below.
 */
interface LocalInfrastructureBuilding {
  buildingId: string;
  family: LocalInfrastructureFamily;
  productionMultiplier?: number;
  cityHealingBonus?: number;
}

export const LOCAL_INFRASTRUCTURE_BUILDINGS: readonly LocalInfrastructureBuilding[] = [
  { buildingId: 'stable', family: 'mounted-light-support', productionMultiplier: 0.85 },
  { buildingId: 'cavalry-academy', family: 'mounted-heavy', productionMultiplier: 0.85 },
  { buildingId: 'siege-workshop', family: 'classical-siege', productionMultiplier: 0.80 },
  { buildingId: 'tank_depot', family: 'armored', productionMultiplier: 0.90, cityHealingBonus: 5 },
];

export function getLocalCityHealingBonus(unitType: UnitType, cityBuildings: readonly string[]): number {
  const families = getUnitRoleDefinition(unitType)?.localInfrastructureFamilies ?? [];
  return LOCAL_INFRASTRUCTURE_BUILDINGS.reduce((best, infrastructure) => (
    infrastructure.cityHealingBonus
      && families.includes(infrastructure.family)
      && cityBuildings.includes(infrastructure.buildingId)
      ? Math.max(best, infrastructure.cityHealingBonus)
      : best
  ), 0);
}
