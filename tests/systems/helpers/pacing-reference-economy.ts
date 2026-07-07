import type { City, GameMap, HexCoord, HexTile, ResourceYield } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { BUILDINGS } from '@/systems/city-system';
import { calculateCityYields } from '@/systems/resource-system';
import { getEmpireTechPercents, applyEmpireTechPercents, getEmpireFlatTechYields } from '@/systems/tech-yield-system';

/**
 * Methodology (documented per issue #481's "state who/what justifies the loadout"
 * requirement): a "competent" empire at era N is modeled as having completed every tech from
 * every era strictly before N, and none of era N's own techs yet — this matches what
 * RESEARCH_OUTPUT_BY_ERA conceptually represents: the output a civ has *on arrival* at era N,
 * before that era's own techs compound further. Buildings present are a direct, non-guessed
 * consequence of the tech list (every non-national-project, non-coastal-required building
 * whose techRequired is completed and whose requiresBuildings chain is satisfied) rather than a
 * hand-picked "realistic" building set — this replaces F3's hand-picked constants with a
 * derivation from the actual game-content graph.
 *
 * Deliberately excluded from the pin (documented, not an oversight): trade routes, legendary
 * wonders, luxury resources, and multi-city empire effects. These are per-city/per-route/
 * per-wonder bonuses that a single-city reference fixture cannot represent without inventing
 * numbers.
 *
 * Two profiles, not one (added post-MR13 review): a single city's building count depends
 * entirely on how thoroughly a player builds. Neither extreme is "wrong":
 * - 'bounded': only buildings gated within the last BUILDING_ERA_WINDOW eras count as active
 *   production — models an empire that keeps building new things but doesn't dwell on maxing
 *   out every old city.
 * - 'maximal': every eligible building regardless of era counts — models a completionist player
 *   who builds everything available in every city (a real, common playstyle, not a corner case).
 * `RESEARCH_OUTPUT_BY_ERA` targets 'maximal' (see pacing-model.ts comment) per the project's
 * pacing design intent ("never automatic") — tuning against the lower ('bounded') output would
 * let a completionist empire blow through late-game tech far faster than the target window,
 * which is the failure mode the design doc calls out explicitly. Both profiles are pinned by
 * tests/systems/pacing-reference-economy.test.ts so this tradeoff stays visible in one place.
 */

const REFERENCE_MAP_SIZE = 8;
const BUILDING_ERA_WINDOW = 4;

export type ReferenceEconomyProfile = 'bounded' | 'maximal';

function completedTechsForEra(era: number): string[] {
  return TECH_TREE.filter(tech => tech.era < era).map(tech => tech.id);
}

function techEra(techId: string): number {
  return TECH_TREE.find(tech => tech.id === techId)?.era ?? 1;
}

function eligibleBuildingIds(completedTechs: string[], era: number, profile: ReferenceEconomyProfile): string[] {
  const techSet = new Set(completedTechs);
  const built = new Set<string>();
  let added = true;
  // Fixed-point loop so multi-link requiresBuildings chains resolve regardless of object order.
  while (added) {
    added = false;
    for (const building of Object.values(BUILDINGS)) {
      if (built.has(building.id) || building.nationalProject || building.coastalRequired) continue;
      if (building.techRequired) {
        if (!techSet.has(building.techRequired)) continue;
        if (profile === 'bounded') {
          // Bound: only recently-gated buildings count toward active production, unless a
          // still-eligible newer building's requiresBuildings chain forces an older one in.
          const isRecent = techEra(building.techRequired) > era - BUILDING_ERA_WINDOW;
          const isForcedPrereq = Object.values(BUILDINGS).some(other =>
            (other.requiresBuildings ?? []).includes(building.id));
          if (!isRecent && !isForcedPrereq) continue;
        }
      }
      const prereqsMet = (building.requiresBuildings ?? []).every(id => built.has(id));
      if (!prereqsMet) continue;
      built.add(building.id);
      added = true;
    }
  }
  return [...built];
}

function makeReferenceMap(): GameMap {
  const tiles: Record<string, HexTile> = {};
  for (let q = 0; q < REFERENCE_MAP_SIZE; q++) {
    for (let r = 0; r < REFERENCE_MAP_SIZE; r++) {
      const key = `${q},${r}`;
      // Alternate hills/grassland/plains so a population-N city has a believable mixed worked
      // radius; no resources or rivers to keep the pin resource-RNG-free.
      const terrain = q % 3 === 0 ? 'hills' : q % 3 === 1 ? 'grassland' : 'plains';
      tiles[key] = {
        coord: { q, r },
        terrain,
        elevation: terrain === 'hills' ? 'highland' : 'lowland',
        resource: null,
        improvement: 'none',
        owner: 'reference-civ',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }
  return { width: REFERENCE_MAP_SIZE, height: REFERENCE_MAP_SIZE, tiles, wrapsHorizontally: false, rivers: [] };
}

export function buildReferenceEconomyCity(
  era: number,
  profile: ReferenceEconomyProfile = 'maximal',
): { city: City; map: GameMap; completedTechs: string[] } {
  const completedTechs = completedTechsForEra(era);
  const buildings = eligibleBuildingIds(completedTechs, era, profile);
  const position: HexCoord = { q: 4, r: 4 };
  // Population grows with available infrastructure, capped to the reference map's radius.
  const population = Math.min(12, 2 + Math.floor(buildings.length / 4));
  const workedTiles: HexCoord[] = [position];
  for (let i = 0; i < population && workedTiles.length <= population; i++) {
    const q = 3 + (i % 4);
    const r = 3 + Math.floor(i / 4);
    if (q === position.q && r === position.r) continue;
    workedTiles.push({ q, r });
  }

  const city: City = {
    id: 'reference-city',
    name: 'Reference City',
    owner: 'reference-civ',
    position,
    population,
    food: 0,
    foodNeeded: 9999,
    buildings,
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: workedTiles,
    workedTiles,
    focus: 'balanced',
    maturity: 'outpost',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  };

  return { city, map: makeReferenceMap(), completedTechs };
}

export function getReferenceEconomyOutput(
  era: number,
  profile: ReferenceEconomyProfile = 'maximal',
): Pick<ResourceYield, 'science' | 'production'> {
  const { city, map, completedTechs } = buildReferenceEconomyCity(era, profile);
  const baseYields = calculateCityYields(city, map, undefined, completedTechs, {});
  const percents = getEmpireTechPercents(completedTechs);
  const withPercents = applyEmpireTechPercents(baseYields, percents);
  const flat = getEmpireFlatTechYields(completedTechs);

  return {
    science: Math.round(withPercents.science + flat.science),
    production: Math.round(withPercents.production + flat.production),
  };
}
