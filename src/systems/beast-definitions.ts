import type { BeastId, TerrainType, UnitType } from '@/core/types';

export interface BeastDefinition {
  id: BeastId;
  unitType: UnitType;
  name: string;
  habitatTerrains: TerrainType[];   // lair may only be placed on these
  awakenEra: number;                // dormant until state.era reaches this
  tier: 1 | 2 | 3 | 4;              // reward scale; 4 = apex
  leashRadius: number;              // beasts never move beyond this distance from the lair
  packSize: number;                 // units spawned on awakening
  hoardGoldBase: number;            // base hoard gold; scaled by era at slay time
  dangerHint: string;               // bestiary riddle shown before first sighting (MR2)
  awakeningFlavor: string;          // map-wide notification on awakening
  sightingFlavor: string;           // first-sighting notification/ceremony text (MR2)
}

export const BEAST_DEFINITIONS: Record<BeastId, BeastDefinition> = {
  giant_boar: {
    id: 'giant_boar',
    unitType: 'beast_boar',
    name: 'Giant Boar',
    habitatTerrains: ['forest'],
    awakenEra: 1,
    tier: 1,
    leashRadius: 3,
    packSize: 1,
    hoardGoldBase: 40,
    dangerHint: 'Trees splinter and the ground is churned in the deep woods. Something heavy lives there.',
    awakeningFlavor: 'A thunder of hooves shakes the forest. The Giant Boar has awoken!',
    sightingFlavor: 'Your scouts lay eyes on the Giant Boar — a beast of legend!',
  },
};

const BY_UNIT_TYPE = new Map(
  Object.values(BEAST_DEFINITIONS).map(def => [def.unitType, def]),
);

export function getBeastDefinitionByUnitType(type: UnitType): BeastDefinition | undefined {
  return BY_UNIT_TYPE.get(type);
}
