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
  concealedInHabitat?: boolean;     // hidden on habitat terrain unless a viewer unit is adjacent
  navalOnly?: boolean;              // only naval-domain or ranged units may attack this beast
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
  dire_wolf: {
    id: 'dire_wolf',
    unitType: 'beast_wolf',
    name: 'Dire Wolf Pack',
    habitatTerrains: ['tundra', 'snow'],
    awakenEra: 1,
    tier: 1,
    leashRadius: 4,
    packSize: 3,
    hoardGoldBase: 50,
    dangerHint: 'Howls echo across the frozen wastes at night. They hunt as one.',
    awakeningFlavor: 'Howls rise from the frozen north. The Dire Wolves are hunting!',
    sightingFlavor: 'Your scouts spot the Dire Wolf Pack prowling the snows!',
  },
  emerald_basilisk: {
    id: 'emerald_basilisk',
    unitType: 'beast_basilisk',
    name: 'Emerald Basilisk',
    habitatTerrains: ['jungle'],
    awakenEra: 2,
    tier: 2,
    leashRadius: 3,
    packSize: 1,
    hoardGoldBase: 80,
    concealedInHabitat: true,
    dangerHint: 'Expeditions vanish in the green depths. Survivors speak of unblinking emerald eyes.',
    awakeningFlavor: 'Something ancient stirs beneath the canopy. Travelers, beware the green depths.',
    sightingFlavor: 'The Emerald Basilisk reveals itself — eyes like cold gems in the gloom!',
  },
  sea_serpent: {
    id: 'sea_serpent',
    unitType: 'beast_sea_serpent',
    name: 'Sea Serpent',
    habitatTerrains: ['ocean'],
    awakenEra: 3,
    tier: 3,
    leashRadius: 5,
    packSize: 1,
    hoardGoldBase: 150,
    navalOnly: true,
    dangerHint: 'Ships vanish on the deep crossing. Sailors whisper of coils vast as harbor walls.',
    awakeningFlavor: 'The deep water churns. Captains report a vast shadow beneath the waves.',
    sightingFlavor: 'The Sea Serpent breaches — coils glinting above the waves!',
  },
  dune_wurm: {
    id: 'dune_wurm',
    unitType: 'beast_wurm',
    name: 'Dune Wurm',
    habitatTerrains: ['desert'],
    awakenEra: 2,
    tier: 2,
    leashRadius: 3,
    packSize: 1,
    hoardGoldBase: 80,
    concealedInHabitat: true,
    dangerHint: 'Caravans tell of dunes that ripple and shift where no wind blows.',
    awakeningFlavor: 'The sands tremble. Something colossal moves beneath the dunes.',
    sightingFlavor: 'The Dune Wurm erupts from the sand in a storm of grit and teeth!',
  },
};

const BY_UNIT_TYPE = new Map(
  Object.values(BEAST_DEFINITIONS).map(def => [def.unitType, def]),
);

export function getBeastDefinitionByUnitType(type: UnitType): BeastDefinition | undefined {
  return BY_UNIT_TYPE.get(type);
}
