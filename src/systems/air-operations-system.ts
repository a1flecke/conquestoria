import type { AirBaseRef, GameState, Unit } from '@/core/types';

export function isBasedAirUnit(unit: Unit): boolean {
  return unit.airBase !== undefined;
}

export function getAirBaseRoster(state: GameState, base: AirBaseRef): Unit[] {
  return Object.values(state.units)
    .filter(unit => unit.airBase?.kind === base.kind
      && (base.kind === 'city'
        ? unit.airBase.cityId === base.cityId
        : unit.airBase.unitId === base.unitId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function hasAirForceCommand(state: GameState, civId: string): boolean {
  return Object.values(state.builtNationalProjects ?? {})
    .some(project => project.civId === civId && project.buildingId === 'air_force_command');
}

export function getAirBaseCapacity(state: GameState, base: AirBaseRef): number {
  if (base.kind === 'carrier') return state.units[base.unitId]?.type === 'carrier' ? 2 : 0;
  const city = state.cities[base.cityId];
  if (!city) return 0;
  if (city.buildings.includes('airfield')) return hasAirForceCommand(state, city.owner) ? 4 : 3;
  if (city.buildings.includes('helicopter_base')) return 2;
  if (city.buildings.includes('stealth_airbase')) return 2;
  return 0;
}
