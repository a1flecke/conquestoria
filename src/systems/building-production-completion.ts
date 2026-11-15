/**
 * #1704 (B1): what a finished building means, in one place.
 *
 * The turn path used to own this inline, and the gold rush-buy only added the building to the city.
 * So a national project bought with gold was never recorded in `builtNationalProjects`: its empire
 * effect never applied, it never expired, a second city could queue it again (the
 * `national-project-uniqueness` invariant), a bought Sacred Council founded no religion and a bought
 * warhead never reached the arsenal. Both paths now call this, like `completeUnitProduction` (#1202)
 * does for units.
 */
import type { EventBus } from '@/core/event-bus';
import { BUILDINGS } from '@/systems/city-building-catalog';
import { chooseCircularManufacturingMaterial } from '@/systems/national-project-system';
import { foundReligion } from '@/systems/religion-system';
import { addWarheadToArsenal } from '@/systems/strategic-arsenal-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

/** The state type of the function this shares a transaction with, without importing the type barrel. */
type GameState = Parameters<typeof foundReligion>[0];

export function completeBuildingProduction(
  state: GameState,
  completion: { civId: string; cityId: string; buildingId: string },
  bus: EventBus,
): GameState {
  const { civId, cityId, buildingId } = completion;
  const civ = state.civilizations[civId];
  let nextState = state;
  bus.emit('city:building-complete', { cityId, buildingId });

  const building = BUILDINGS[buildingId];
  if (building?.nationalProject && building.uniquePerEmpire) {
    const eraBuilt = resolveCivilizationEra(civ?.techState.completed ?? []);
    nextState = {
      ...nextState,
      builtNationalProjects: {
        ...(nextState.builtNationalProjects ?? {}),
        [`${civId}:${buildingId}`]: { civId, cityId, eraBuilt },
      },
    };
    bus.emit('city:national-project-built', { civId, cityId, buildingId, eraBuilt });
    // A human chooses from the city panel and can carry that decision across a hot-seat handoff.
    // AI uses the same canonical choice mutation, with rare-earth elements as the broadest Era-13
    // soft-material coverage.
    if (civ && !civ.isHuman && buildingId === 'circular_manufacturing_network') {
      nextState = chooseCircularManufacturingMaterial(nextState, civId, 'rare-earth-elements');
    }
    if (buildingId === 'sacred_council') {
      nextState = foundReligion(nextState, civId, cityId, bus);
    }
  }
  if (buildingId === 'warhead') {
    nextState = addWarheadToArsenal(nextState, civId);
  }
  return nextState;
}
