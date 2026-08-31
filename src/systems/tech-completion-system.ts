import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { chargeUnitsOnGeneTherapyResearch } from '@/systems/gene-therapy-system';

/** Applies shared consequences after a caller emits `tech:completed`. */
export function applyResearchCompletionConsequences(
  state: GameState,
  civId: string,
  techId: string,
  bus: EventBus,
): GameState {
  let nextState = techId === 'gene-therapy'
    ? chargeUnitsOnGeneTherapyResearch(state, civId)
    : state;
  const obsoletedTypes = TRAINABLE_UNITS
    .filter(unit => unit.obsoletedByTech === techId)
    .map(unit => unit.type);
  if (obsoletedTypes.length === 0) return nextState;

  for (const [unitId, unit] of Object.entries(nextState.units)) {
    if (unit.owner === civId && obsoletedTypes.includes(unit.type)) {
      bus.emit('unit:obsolete', { civId, unitId, unitType: unit.type });
    }
  }

  const civEspionage = nextState.espionage?.[civId];
  if (!civEspionage) return nextState;
  let spies = civEspionage.spies;
  for (const [spyId, spy] of Object.entries(spies)) {
    if (!obsoletedTypes.includes(spy.unitType)) continue;
    if (spy.status !== 'embedded' && spy.status !== 'stationed' && spy.status !== 'on_mission') continue;
    if (spies === civEspionage.spies) spies = { ...civEspionage.spies };
    delete spies[spyId];
    bus.emit('espionage:spy-expired', { civId, spyId, spyName: spy.name, unitType: spy.unitType });
  }
  if (spies === civEspionage.spies) return nextState;
  return {
    ...nextState,
    espionage: { ...nextState.espionage, [civId]: { ...civEspionage, spies } },
  };
}
