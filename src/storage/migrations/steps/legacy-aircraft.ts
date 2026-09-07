import type { AirBaseRef, GameState, Unit } from '@/core/types';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

/**
 * Schema 4 — re-home aircraft that were saved without a valid air base, landing
 * each at the nearest compatible friendly base and removing the stranded rest.
 */

function legacyAirBaseCandidates(state: GameState, unit: Unit): AirBaseRef[] {
  const operation = UNIT_DEFINITIONS[unit.type]?.airOperation;
  if (!operation) return [];
  const cityBases = Object.values(state.cities)
    .filter(city => city.owner === unit.owner)
    .filter(city => operation.baseKinds.some(kind => city.buildings.includes(kind)))
    .map(city => ({ kind: 'city' as const, cityId: city.id }));
  const carrierBases = Object.values(state.units)
    .filter(candidate => candidate.owner === unit.owner && candidate.type === 'carrier')
    .filter(() => operation.baseKinds.includes('carrier'))
    .map(candidate => ({ kind: 'carrier' as const, unitId: candidate.id }));
  return [...cityBases, ...carrierBases];
}

function legacyAirBasePosition(state: GameState, base: AirBaseRef) {
  return base.kind === 'city' ? state.cities[base.cityId]?.position : state.units[base.unitId]?.position;
}

function legacyAirBaseCapacity(state: GameState, base: AirBaseRef): number {
  if (base.kind === 'carrier') return state.units[base.unitId]?.type === 'carrier' ? 2 : 0;
  const city = state.cities[base.cityId];
  if (!city) return 0;
  if (city.buildings.includes('airfield')) {
    return Object.entries(state.builtNationalProjects ?? {}).some(([key, project]) => project.civId === city.owner && key === `${city.owner}:air_force_command`) ? 4 : 3;
  }
  if (city.buildings.includes('helicopter_base') || city.buildings.includes('stealth_airbase')) return 2;
  return 0;
}

function isSameLegacyAirBase(left: AirBaseRef | undefined, right: AirBaseRef): boolean {
  if (!left) return false;
  if (left.kind === 'city') return right.kind === 'city' && left.cityId === right.cityId;
  return right.kind === 'carrier' && left.unitId === right.unitId;
}

export function migrateLegacyBasedAircraft(state: GameState): GameState {
  const units = { ...state.units };
  const removedIds = new Set<string>();
  const aircraft = Object.values(units)
    .filter(unit => UNIT_DEFINITIONS[unit.type]?.airOperation && !unit.airBase)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const unit of aircraft) {
    const candidates = legacyAirBaseCandidates({ ...state, units }, unit)
      .map(base => ({ base, position: legacyAirBasePosition({ ...state, units }, base) }))
      .filter((entry): entry is { base: AirBaseRef; position: NonNullable<typeof entry.position> } => entry.position !== undefined)
      .filter(({ base }) => Object.values(units).filter(candidate => isSameLegacyAirBase(candidate.airBase, base)).length < legacyAirBaseCapacity({ ...state, units }, base))
      .sort((left, right) => {
        const distance = (entry: typeof left) => state.map.wrapsHorizontally
          ? wrappedHexDistance(unit.position, entry.position, state.map.width)
          : hexDistance(unit.position, entry.position);
        const baseId = (base: AirBaseRef) => base.kind === 'city' ? `city:${base.cityId}` : `carrier:${base.unitId}`;
        return distance(left) - distance(right) || baseId(left.base).localeCompare(baseId(right.base));
      });
    const destination = candidates[0];
    if (!destination) {
      delete units[unit.id];
      removedIds.add(unit.id);
      continue;
    }
    units[unit.id] = { ...unit, airBase: destination.base, position: { ...destination.position } };
  }
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
    civId,
    removedIds.size > 0 ? { ...civ, units: civ.units.filter(id => !removedIds.has(id)) } : civ,
  ]));
  return { ...state, units, civilizations, reconReveals: state.reconReveals ?? [] };
}
