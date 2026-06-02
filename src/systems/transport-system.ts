import type { GameState, HexCoord, Unit } from '@/core/types';
import { hexDistance, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS, getMovementCostForUnit } from '@/systems/unit-system';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';

export type TransportFailureReason =
  | 'missing-unit'
  | 'missing-transport'
  | 'not-land-unit'
  | 'not-transport'
  | 'wrong-owner'
  | 'already-loaded'
  | 'no-action'
  | 'not-adjacent-to-shore'
  | 'no-capacity'
  | 'missing-destination'
  | 'invalid-destination'
  | 'destination-occupied'
  | 'destination-not-land';

export type TransportCheckResult =
  | { ok: true }
  | { ok: false; reason: TransportFailureReason; message: string };

export type TransportActionResult =
  | { ok: true; state: GameState; message: string }
  | { ok: false; state: GameState; reason: TransportFailureReason; message: string };

function failure(reason: TransportFailureReason, message: string): TransportCheckResult {
  return { ok: false, reason, message };
}

function isTransport(unit: Unit | undefined): unit is Unit {
  return Boolean(unit && unit.type === 'transport' && UNIT_DEFINITIONS[unit.type].cargoCapacity !== undefined);
}

function isLandUnit(unit: Unit): boolean {
  return (UNIT_DEFINITIONS[unit.type]?.domain ?? 'land') === 'land';
}

function isCoastalCityShortcut(state: GameState, unit: Unit, transport: Unit): boolean {
  const unitKey = hexKey(unit.position);
  const city = Object.values(state.cities).find(candidate =>
    candidate.owner === unit.owner && hexKey(candidate.position) === unitKey
  );
  if (!city) return false;
  return hexDistance(city.position, transport.position) === 1;
}

function isAdjacentLoad(state: GameState, unit: Unit, transport: Unit): boolean {
  return hexDistance(unit.position, transport.position) === 1
    || isCoastalCityShortcut(state, unit, transport);
}

function isLandDestination(state: GameState, unit: Unit, destination: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(destination)];
  if (!tile) return false;
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  return domain === 'land' && getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type]?.terrainCostOverrides) < Infinity;
}

function isDestinationOccupied(state: GameState, destination: HexCoord): boolean {
  const occupancy = buildUnitOccupancy(state.units);
  return getUnitIdsAtCoord(occupancy, destination).length > 0;
}

function withoutIds(ids: string[], removed: Set<string>): string[] {
  return ids.filter(id => !removed.has(id));
}

export function getUnitCargoSize(unit: Unit): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  if ((definition.domain ?? 'land') === 'naval') return definition.cargoSize ?? 0;
  return definition.cargoSize ?? 1;
}

export function getTransportCapacity(transport: Unit): number {
  return UNIT_DEFINITIONS[transport.type]?.cargoCapacity ?? 0;
}

export function getTransportCargo(state: GameState, transportId: string): Unit[] {
  const transport = state.units[transportId];
  if (!transport) return [];
  return (transport.cargoUnitIds ?? [])
    .map(unitId => state.units[unitId])
    .filter((unit): unit is Unit => unit !== undefined && unit.transportId === transportId);
}

export function getTransportCargoUsed(state: GameState, transportId: string): number {
  return getTransportCargo(state, transportId).reduce((total, unit) => total + getUnitCargoSize(unit), 0);
}

export function canLoadUnitOntoTransport(
  state: GameState,
  unitId: string,
  transportId: string,
): TransportCheckResult {
  const unit = state.units[unitId];
  if (!unit) return failure('missing-unit', 'Unit not found');
  const transport = state.units[transportId];
  if (!transport) return failure('missing-transport', 'Transport not found');
  if (!isTransport(transport)) return failure('not-transport', 'Choose a Transport');
  if (!isLandUnit(unit)) return failure('not-land-unit', 'Only land units can load onto a Transport');
  if (unit.owner !== transport.owner) return failure('wrong-owner', 'Use a friendly Transport');
  if (unit.transportId) return failure('already-loaded', 'Unit is already aboard a Transport');
  if (unit.hasActed || unit.movementPointsLeft <= 0) return failure('no-action', 'Unit needs movement left to load');
  if (!isAdjacentLoad(state, unit, transport)) return failure('not-adjacent-to-shore', 'Load next to a friendly Transport');

  const used = getTransportCargoUsed(state, transportId);
  if (used + getUnitCargoSize(unit) > getTransportCapacity(transport)) {
    return failure('no-capacity', 'No room on this Transport');
  }

  return { ok: true };
}

export function loadUnitOntoTransport(
  state: GameState,
  unitId: string,
  transportId: string,
): TransportActionResult {
  const check = canLoadUnitOntoTransport(state, unitId, transportId);
  if (!check.ok) return { ...check, state };

  const unit = state.units[unitId]!;
  const transport = state.units[transportId]!;
  const cargoIds = [...(transport.cargoUnitIds ?? [])];
  if (!cargoIds.includes(unitId)) cargoIds.push(unitId);

  return {
    ok: true,
    state: {
      ...state,
      units: {
        ...state.units,
        [transportId]: {
          ...transport,
          cargoUnitIds: cargoIds,
        },
        [unitId]: {
          ...unit,
          transportId,
          position: { ...transport.position },
          movementPointsLeft: 0,
          hasMoved: true,
          hasActed: true,
          isFortified: undefined,
          isResting: false,
        },
      },
    },
    message: `${UNIT_DEFINITIONS[unit.type].name} loaded onto Transport`,
  };
}

export function getUnloadDestinations(state: GameState, transportId: string): HexCoord[] {
  const transport = state.units[transportId];
  if (!isTransport(transport) || getTransportCargo(state, transportId).length === 0) return [];
  const cargo = getTransportCargo(state, transportId)[0];
  if (!cargo) return [];

  return hexNeighbors(transport.position).filter(destination =>
    isLandDestination(state, cargo, destination)
    && !isDestinationOccupied(state, destination)
  );
}

export function canUnloadUnitFromTransport(
  state: GameState,
  transportId: string,
  cargoUnitId: string,
  destination: HexCoord,
): TransportCheckResult {
  const transport = state.units[transportId];
  if (!transport) return failure('missing-transport', 'Transport not found');
  if (!isTransport(transport)) return failure('not-transport', 'Choose a Transport');
  const cargo = state.units[cargoUnitId];
  if (!cargo) return failure('missing-unit', 'Cargo unit not found');
  if (cargo.transportId !== transportId || !(transport.cargoUnitIds ?? []).includes(cargoUnitId)) {
    return failure('missing-unit', 'Unit is not aboard this Transport');
  }
  if (!destination) return failure('missing-destination', 'Choose where to unload');
  if (!isLandDestination(state, cargo, destination)) return failure('destination-not-land', 'Unload onto land');
  if (hexDistance(transport.position, destination) !== 1) return failure('invalid-destination', 'Unload next to land');
  if (isDestinationOccupied(state, destination)) return failure('destination-occupied', 'Unload tile is occupied');
  return { ok: true };
}

export function unloadUnitFromTransport(
  state: GameState,
  transportId: string,
  cargoUnitId: string,
  destination: HexCoord,
): TransportActionResult {
  const check = canUnloadUnitFromTransport(state, transportId, cargoUnitId, destination);
  if (!check.ok) return { ...check, state };

  const transport = state.units[transportId]!;
  const cargo = state.units[cargoUnitId]!;
  const { transportId: _transportId, ...cargoWithoutTransport } = cargo;

  return {
    ok: true,
    state: {
      ...state,
      units: {
        ...state.units,
        [transportId]: {
          ...transport,
          cargoUnitIds: (transport.cargoUnitIds ?? []).filter(unitId => unitId !== cargoUnitId),
        },
        [cargoUnitId]: {
          ...cargoWithoutTransport,
          position: { ...destination },
          movementPointsLeft: 0,
          hasMoved: true,
          hasActed: true,
          isFortified: undefined,
          isResting: false,
        },
      },
    },
    message: `${UNIT_DEFINITIONS[cargo.type].name} unloaded from Transport`,
  };
}

export function syncTransportCargoPositions(state: GameState, transportId: string): GameState {
  const transport = state.units[transportId];
  if (!isTransport(transport) || !(transport.cargoUnitIds ?? []).length) return state;

  let changed = false;
  const nextUnits = { ...state.units };
  for (const cargoUnitId of transport.cargoUnitIds ?? []) {
    const cargo = nextUnits[cargoUnitId];
    if (!cargo || cargo.transportId !== transportId) continue;
    if (hexKey(cargo.position) === hexKey(transport.position)) continue;
    nextUnits[cargoUnitId] = { ...cargo, position: { ...transport.position } };
    changed = true;
  }

  return changed ? { ...state, units: nextUnits } : state;
}

export function removeTransportAndCargo(state: GameState, transportId: string): GameState {
  const transport = state.units[transportId];
  if (!transport) return state;
  const removedIds = new Set([transportId, ...(transport.cargoUnitIds ?? [])]);
  const nextUnits: GameState['units'] = {};
  for (const [unitId, unit] of Object.entries(state.units)) {
    if (!removedIds.has(unitId)) nextUnits[unitId] = unit;
  }

  const civilizations = { ...state.civilizations };
  for (const [civId, civ] of Object.entries(civilizations)) {
    const units = withoutIds(civ.units, removedIds);
    if (units.length !== civ.units.length) {
      civilizations[civId] = { ...civ, units };
    }
  }

  return {
    ...state,
    units: nextUnits,
    civilizations,
  };
}
