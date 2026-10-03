import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { findPath } from '@/systems/unit-pathfinding';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { computeAdministrativeExploreLeash } from '@/ai/ai-exploration';
import { hexKey } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { resolveUnitCityBombardment } from '@/systems/city-bombardment-system';
import { resolveCityInteraction } from '@/systems/city-interaction';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';
import type { CivTurn } from './types';

/**
 * #974 Hold Siege: one turn's worth of a standing bombardment order.
 *
 * Re-resolves legality every turn through the same resolver the player's own tap uses, so a
 * standing order can never do something a manual click could not. Clears itself and tells
 * the player why the moment bombarding stops being possible -- an automation that silently
 * stops is worse than no automation.
 */
export function applyHoldSiegeOrder(
  state: GameState,
  unitId: string,
  cityId: string,
  bus: EventBus,
): GameState {
  let nextState = state;
  const clear = (reason: string) => {
    const current = nextState.units[unitId];
    if (current) {
      nextState = {
        ...nextState,
        units: { ...nextState.units, [unitId]: { ...current, automation: undefined } },
      };
    }
    bus.emit('unit:hold-siege-ended', { unitId, cityId, reason });
  };

  const unit = nextState.units[unitId];
  const city = nextState.cities[cityId];
  if (!unit) return nextState;
  if (!city) {
    clear('The city is gone.');
    return nextState;
  }
  if (city.owner === unit.owner) {
    clear(`${city.name} is yours now.`);
    return nextState;
  }

  const bombard = resolveCityInteraction(nextState, unit, city).available
    .find(action => action.kind === 'bombard');
  if (!bombard) {
    const denial = resolveCityInteraction(nextState, unit, city).denied
      .find(entry => entry.kind === 'bombard');
    clear(denial?.reason ?? `Your unit can no longer bombard ${city.name}.`);
    return nextState;
  }

  const result = resolveUnitCityBombardment(nextState, { attackerUnitId: unitId, cityId, source: 'player' });
  if (!result.ok) {
    clear(`Your unit can no longer bombard ${city.name}.`);
    return nextState;
  }

  nextState = result.state;
  if (result.cityEvent) bus.emit('city:bombarded', result.cityEvent);
  if (result.batteryEvent) bus.emit('city:coastal-battery-fired', result.batteryEvent);

  // Taking return fire ends the order: a standing order must not quietly grind a unit to
  // death while the player is looking elsewhere.
  if (result.counterFireDamage > 0 && nextState.units[unitId]) {
    clear(`Your unit is under fire at ${city.name}.`);
  }
  return nextState;
}

/**
 * Runs each unit's standing automation order: auto-explore, hold-siege, or a step of a journey.
 */
export function applyStandingOrders(state: GameState, turn: CivTurn, completedTechs: string[], bus: EventBus): GameState {
  let newState = state;
  const { civId, civ } = turn;

  for (const unitId of civ.units) {
    const unit = newState.units[unitId];
    if (unit?.automation?.mode === 'auto-explore') {
      const explored = applyAutoExploreOrder(newState, unitId, { bus, leash: computeAdministrativeExploreLeash(newState, unitId) ?? undefined });
      if (explored?.ok) newState = explored.state;
    } else if (unit?.automation?.mode === 'hold-siege') {
      newState = applyHoldSiegeOrder(newState, unitId, unit.automation.cityId, bus);
    } else if (unit?.automation?.mode === 'journey') {
      const destination = unit.automation.destination;
      const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
      const path = findPath(unit.position, destination, newState.map, domain, { unit, completedTechs: completedTechs, deniedOwnerIds: getDeniedTerritoryOwners(newState, unit) });
      if (!path || path.length < 2) {
        newState.units[unitId] = { ...unit, automation: undefined };
        bus.emit('unit:journey-blocked', { unitId, position: { ...unit.position } });
      } else {
        const nextStep = path[1];
        const movement = executeUnitMove(newState, unitId, nextStep, { actor: 'automation', civId, bus });
        if (movement.ok) newState = movement.state;
        if (hexKey(nextStep) === hexKey(destination)) {
          const movedUnit = newState.units[unitId];
          if (movedUnit) {
            newState.units[unitId] = { ...movedUnit, automation: undefined };
          }
        }
      }
    }
  }
  return newState;
}
