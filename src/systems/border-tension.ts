import type { HexCoord } from '@/core/types/hex';
import { mapDistance } from './hex-utils';
import { classifyTerritorialRelation } from './territorial-access';
import { UNIT_DEFINITIONS } from './unit-definitions';

// The slice of state this reads, typed structurally so a full `GameState` satisfies it without importing the core
// type barrel (#1361).
interface TensionCity { readonly owner: string; readonly position: HexCoord }
interface TensionUnit { readonly owner: string; readonly type: keyof typeof UNIT_DEFINITIONS; readonly position: HexCoord }
type TensionCivilizations = Parameters<typeof classifyTerritorialRelation>[0]['civilizations'];
interface BorderTensionState {
  readonly civilizations: TensionCivilizations;
  readonly cities: Readonly<Record<string, TensionCity | undefined>>;
  readonly units: Readonly<Record<string, TensionUnit | undefined>>;
  readonly map: Parameters<typeof mapDistance>[0];
}

/** A rival's troops within this many hexes of one of a civ's cities sour that civ's opinion of the rival. */
export const BORDER_TENSION_RADIUS = 3;

/** What a viewer may count, so a player-facing reason never reveals a hidden unit or an undiscovered city. */
export interface BorderTensionKnowledge {
  cityKnown?: (city: TensionCity) => boolean;
  unitKnown?: (unit: TensionUnit) => boolean;
}

/**
 * Does `intruderCivId` have troops close to `hostCivId`'s cities? The host is the civ whose opinion drops.
 *
 * Only armed units count (a passing settler, worker or caravan is not a threat), distance follows the map
 * seam, and a partner the host has let in (alliance, Open Borders, vassalage) is never resented for being
 * there. War is left to the caller: relationship drift already skips civs at war.
 */
export function hasBorderTension(
  state: BorderTensionState,
  hostCivId: string,
  intruderCivId: string,
  knowledge: BorderTensionKnowledge = {},
): boolean {
  if (hostCivId === intruderCivId) return false;
  const host = state.civilizations[hostCivId];
  const intruder = state.civilizations[intruderCivId];
  if (!host || !intruder) return false;
  const relation = classifyTerritorialRelation(state, intruderCivId, hostCivId);
  if (relation === 'alliance' || relation === 'open-borders' || relation === 'vassalage') return false;

  const cities = host.cities
    .map(id => state.cities[id])
    .filter((city): city is TensionCity => !!city && city.owner === hostCivId && (knowledge.cityKnown?.(city) ?? true));
  if (cities.length === 0) return false;

  return intruder.units.some(id => {
    const unit = state.units[id];
    if (!unit || unit.owner !== intruderCivId || (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) <= 0) return false;
    if (knowledge.unitKnown && !knowledge.unitKnown(unit)) return false;
    return cities.some(city => mapDistance(state.map, unit.position, city.position) <= BORDER_TENSION_RADIUS);
  });
}
