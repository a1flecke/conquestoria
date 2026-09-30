import type { Building, City, GameMap, GameState, ResourceType, TrainableUnitEntry, UnitType } from '@/core/types';
import { BUILDINGS } from './city-building-catalog';
import { TRAINABLE_UNITS } from './city-unit-catalog';
import { isCityCoastal } from './city-lifecycle';
import { evaluateProductionPrerequisites } from './production-prerequisites';
import { civilizationEraFromNumber } from './era-types';
import type { CivilizationEra } from './era-types';

/**
 * Availability and obsolescence queries (#1008): what a civilization or city
 * may currently train or build. Pure reads over the catalogs -- no pricing, no
 * turn processing, no presentation.
 */
export function getTrainableUnitsForCiv(
  completedTechs: readonly string[],
  civType?: string,
  availableResources?: ReadonlySet<ResourceType>,
): TrainableUnitEntry[] {
  const replacedForCiv = new Set(
    TRAINABLE_UNITS
      .filter(u => u.civTypeRequired === civType && u.replacesUnit)
      .map(u => u.replacesUnit!),
  );
  return TRAINABLE_UNITS.filter(u => {
    if (evaluateProductionPrerequisites(u, completedTechs).missing.length > 0) return false;
    if (isUnitObsolete(u, completedTechs, availableResources)) return false;
    if (u.civTypeRequired && u.civTypeRequired !== civType) return false;
    if (replacedForCiv.has(u.type)) return false;
    if (availableResources !== undefined && u.resourceRequired?.length) {
      if (!u.resourceRequired.every(r => availableResources.has(r))) return false;
    }
    return true;
  });
}

/**
 * #1113: a unit whose `obsoletedByTech` has fired is normally retired even if
 * its designated `upgradesTo` successor is itself blocked by a strategic
 * resource the civ doesn't have -- e.g. `archer` obsoletes at `tactics`, but
 * `crossbowman` additionally needs `copper`; `chariot` obsoletes at
 * `iron-forging`, but `knight` additionally needs `iron`. Both pairs are
 * gated by the SAME tech, so the moment that tech completes, the civ can lose
 * its only unit in that role with no way to build the replacement until it
 * separately acquires the resource -- for a human player exactly as much as
 * for the AI (`getTrainableUnitsForCiv`/`getTrainableUnitsForCity` are the
 * only production-legality source for both).
 *
 * The check walks the FULL `upgradesTo` chain, not just the immediate
 * successor: `crossbowman` is itself superseded by the resource-free
 * `rifleman` once `rifled-infantry` is researched, so a copper-starved civ
 * that reaches that tech has a genuine modern replacement even though
 * `crossbowman` itself was never reachable -- `archer` must retire there, not
 * stay trainable forever. Only when NO unit anywhere in the chain currently
 * passes its own tech+resource gates does the original stay trainable. This
 * was caught by `tests/simulation/ai-playability.test.ts`'s Era-9 modern-share
 * assertion during #1113: an immediate-successor-only check left a
 * copper-starved civ still fielding archers at Era 9, when `rifleman` had
 * long been a real, resource-free option.
 *
 * `availableResources` is optional to preserve every existing caller that
 * only cares about tech-based obsolescence (e.g. a diagnostic that has no
 * civ/city context to derive resources from) -- omitting it keeps the
 * pre-#1113 tech-only behavior exactly. This does not change obsolescence for
 * a successor blocked by anything else (coastal, civType) -- no demonstrated
 * instance of that shape exists in the current catalog, and a resource is the
 * one requirement a chain can add that an earlier link didn't already need.
 */
export function isUnitObsolete(
  unit: TrainableUnitEntry,
  completedTechs: readonly string[],
  availableResources?: ReadonlySet<ResourceType>,
): boolean {
  const techObsolete = (unit.obsoletedByTech !== undefined && completedTechs.includes(unit.obsoletedByTech))
    || (unit.obsoletedWhenAllTechs !== undefined
      && unit.obsoletedWhenAllTechs.every(techId => completedTechs.includes(techId)));
  if (!techObsolete) return false;
  if (availableResources !== undefined && unit.upgradesTo) {
    let successorType: UnitType | undefined = unit.upgradesTo;
    const visited = new Set<UnitType>();
    let chainHasBuildableUnit = false;
    while (successorType !== undefined && !visited.has(successorType)) {
      visited.add(successorType);
      const successor = TRAINABLE_UNITS.find(candidate => candidate.type === successorType);
      if (!successor) break;
      const techOk = evaluateProductionPrerequisites(successor, completedTechs).missing.length === 0;
      const resourceOk = !successor.resourceRequired?.length
        || successor.resourceRequired.every(r => availableResources.has(r));
      if (techOk && resourceOk) {
        chainHasBuildableUnit = true;
        break;
      }
      successorType = successor.upgradesTo;
    }
    if (!chainHasBuildableUnit) return false;
  }
  return true;
}

// #592 MR5: single source of truth for missionary's "city follows owner's own faith" gate,
// so every getTrainableUnitsForCity call site computes it the same way.
export function cityFollowsOwnFaith(state: GameState, city: City): boolean {
  const faith = state.cityFaith?.[city.id];
  if (!faith) return false;
  const religion = state.religions?.[faith.religionId];
  return !!religion && religion.ownerCivId === city.owner;
}

export function getTrainableUnitsForCity(
  city: City,
  completedTechs: string[],
  map: GameMap,
  civType?: string,
  availableResources?: Set<ResourceType>,
  followsOwnFaith: boolean = false,
): TrainableUnitEntry[] {
  const coastal = isCityCoastal(city, map);
  return getTrainableUnitsForCiv(completedTechs, civType, availableResources)
    .filter(unit => !unit.coastalRequired || coastal)
    .filter(unit => !unit.trainedFromBuilding || (city.buildings ?? []).includes(unit.trainedFromBuilding))
    .filter(unit => unit.type !== 'missionary' || followsOwnFaith);
}

export function getDetectionUnitTypeForCiv(civType?: string): UnitType {
  return TRAINABLE_UNITS.find(u => u.civTypeRequired === civType && u.replacesUnit === 'scout_hound')?.type ?? 'scout_hound';
}

export function isBuildingObsolete(building: Building | undefined, completedTechs: string[]): boolean {
  return !!building?.obsoletedByTech && completedTechs.includes(building.obsoletedByTech);
}

export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  map: GameMap,
  availableResources?: Set<ResourceType>,
  /** The acting civilization's own era. Never World Age (`state.era`). */
  era?: CivilizationEra,
  builtNationalProjectKeys?: Set<string>,
  civId?: string,
  /** #545: omit to skip this gate entirely (matches every other optional filter
   * here) -- callers that intentionally want the pre-gate "tech unlocked" set for a
   * locked-item-reason diff (see city-panel.ts) rely on omitting this. */
  arsenalStatus?: { hasManhattanProject: boolean; atCapacity: boolean },
  capitalCityId?: string | null,
): Building[] {
  const coastal = isCityCoastal(city, map);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.cannotBuildInCapital && capitalCityId === city.id) return false;
    if (b.arsenalCapacityGated && arsenalStatus && (!arsenalStatus.hasManhattanProject || arsenalStatus.atCapacity)) return false;
    if (evaluateProductionPrerequisites(b, completedTechs).missing.length > 0) return false;
    if (isBuildingObsolete(b, completedTechs)) return false;
    if (b.coastalRequired && !coastal) return false;
    if (availableResources !== undefined && b.resourceRequired?.length) {
      if (!b.resourceRequired.every(r => availableResources.has(r))) return false;
    }
    if (b.requiresBuildings?.length) {
      if (!b.requiresBuildings.every((req: string) => city.buildings.includes(req))) return false;
    }
    if (b.nationalProject) {
      const currentEra = era ?? civilizationEraFromNumber(1);
      const belowWindow = currentEra < b.nationalProject.homeEra;
      // Milestone NPs (#591 MR4) have no upper build-window bound -- they're buildable
      // from homeEra onward forever, unlike a normal NP's homeEra..homeEra+1 window.
      const aboveWindow = !b.nationalProject.milestone && currentEra > b.nationalProject.homeEra + 1;
      if (belowWindow || aboveWindow) return false;
      if (b.uniquePerEmpire && civId && builtNationalProjectKeys?.has(`${civId}:${b.id}`)) return false;
    }
    return true;
  });
}
