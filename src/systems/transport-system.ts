import type { GameState, HexCoord, Unit } from '@/core/types';
import {
  canUnitAttackTarget,
  type AttackTargetOptions,
  type AttackTargetResult,
} from '@/systems/attack-targeting';
import { getWrappedHexNeighbors, hexDistance, hexKey, hexNeighbors, wrapHexCoord, wrappedHexDistance } from '@/systems/hex-utils';
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
  if (!unit) return false;
  const def = UNIT_DEFINITIONS[unit.type];
  return Boolean(def && (def.domain ?? 'land') === 'naval' && def.cargoCapacity !== undefined);
}

function normalizeDestination(state: GameState, coord: HexCoord): HexCoord {
  return state.map.wrapsHorizontally ? wrapHexCoord(coord, state.map.width) : { ...coord };
}

function transportDistance(state: GameState, a: HexCoord, b: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(a, b, state.map.width)
    : hexDistance(a, b);
}

function transportNeighbors(state: GameState, coord: HexCoord): HexCoord[] {
  return state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(coord, state.map.width)
    : hexNeighbors(coord);
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
  return transportDistance(state, city.position, transport.position) === 1;
}

function isAdjacentLoad(state: GameState, unit: Unit, transport: Unit): boolean {
  return transportDistance(state, unit.position, transport.position) === 1
    || isCoastalCityShortcut(state, unit, transport);
}

function isLandDestination(state: GameState, unit: Unit, destination: HexCoord): boolean {
  const normalized = normalizeDestination(state, destination);
  const tile = state.map.tiles[hexKey(normalized)];
  if (!tile) return false;
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  return domain === 'land' && getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type]?.terrainCostOverrides) < Infinity;
}

function isDestinationOccupied(state: GameState, destination: HexCoord): boolean {
  const normalized = normalizeDestination(state, destination);
  const occupancy = buildUnitOccupancy(state.units);
  return getUnitIdsAtCoord(occupancy, normalized).length > 0;
}

function canCargoSpendUnloadAction(cargo: Unit): boolean {
  return !cargo.hasActed && cargo.movementPointsLeft > 0;
}

export type EmbarkedAssaultTarget = Extract<AttackTargetResult, { ok: true }> & {
  transportId: string;
};

function isCoastalLandDestination(state: GameState, cargo: Unit, destination: HexCoord): boolean {
  const normalized = normalizeDestination(state, destination);
  if (!isLandDestination(state, cargo, normalized)) return false;
  return transportNeighbors(state, normalized).some(neighbor => {
    const terrain = state.map.tiles[hexKey(normalizeDestination(state, neighbor))]?.terrain;
    return terrain === 'coast' || terrain === 'ocean';
  });
}

export function getEmbarkedAssaultTarget(
  state: GameState,
  cargoUnitId: string,
  coord: HexCoord,
  options: AttackTargetOptions = {},
): EmbarkedAssaultTarget | AttackTargetResult {
  const cargo = state.units[cargoUnitId];
  if (!cargo || !cargo.transportId || !canCargoSpendUnloadAction(cargo)) return { ok: false, reason: 'no-target' };
  const transport = state.units[cargo.transportId];
  if (!isTransport(transport) || transport.owner !== cargo.owner || !(transport.cargoUnitIds ?? []).includes(cargo.id)) {
    return { ok: false, reason: 'no-target' };
  }
  const destination = normalizeDestination(state, coord);
  if (transportDistance(state, transport.position, destination) !== 1 || !isCoastalLandDestination(state, cargo, destination)) {
    return { ok: false, reason: 'no-target' };
  }
  const effectiveAttacker = { ...cargo, position: { ...transport.position }, transportId: undefined };
  const target = canUnitAttackTarget(state, effectiveAttacker, destination, options);
  return target.ok ? { ...target, transportId: transport.id } : target;
}

/**
 * Return every legal adjacent coastal target for cargo attacking directly from its
 * transport. Keeping enumeration beside validation prevents UI and AI callers from
 * accidentally applying different shoreline rules.
 */
export function getEmbarkedAssaultTargets(
  state: GameState,
  cargoUnitId: string,
  options: AttackTargetOptions = {},
): Array<{ coord: HexCoord; result: EmbarkedAssaultTarget }> {
  const cargo = state.units[cargoUnitId];
  const transport = cargo?.transportId ? state.units[cargo.transportId] : undefined;
  if (!cargo || !transport) return [];

  return transportNeighbors(state, transport.position)
    .map(coord => ({ coord: normalizeDestination(state, coord), result: getEmbarkedAssaultTarget(state, cargoUnitId, coord, options) }))
    .filter((target): target is { coord: HexCoord; result: EmbarkedAssaultTarget } => target.result.ok);
}

export type EmbarkedAssaultDetachResult =
  | { ok: true; state: GameState; attacker: Unit; transportId: string }
  | { ok: false; state: GameState };

export function detachCargoForEmbarkedAssault(
  state: GameState,
  cargoUnitId: string,
): EmbarkedAssaultDetachResult {
  const cargo = state.units[cargoUnitId];
  const transport = cargo?.transportId ? state.units[cargo.transportId] : undefined;
  if (!cargo || !transport || !isTransport(transport) || transport.owner !== cargo.owner || !(transport.cargoUnitIds ?? []).includes(cargo.id)) {
    return { ok: false, state };
  }
  const { transportId: _transportId, ...attacker } = cargo;
  const detachedAttacker = { ...attacker, position: { ...transport.position } };
  return {
    ok: true,
    transportId: transport.id,
    attacker: detachedAttacker,
    state: {
      ...state,
      units: {
        ...state.units,
        [transport.id]: { ...transport, cargoUnitIds: (transport.cargoUnitIds ?? []).filter(id => id !== cargo.id) },
        [cargo.id]: detachedAttacker,
      },
    },
  };
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

export function getUnloadDestinations(state: GameState, transportId: string, cargoUnitId: string): HexCoord[] {
  const transport = state.units[transportId];
  if (!isTransport(transport) || getTransportCargo(state, transportId).length === 0) return [];
  const cargo = state.units[cargoUnitId];
  if (!cargo || cargo.transportId !== transportId) return [];
  if (!canCargoSpendUnloadAction(cargo)) return [];

  return transportNeighbors(state, transport.position).filter(destination =>
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
  if (!canCargoSpendUnloadAction(cargo)) return failure('no-action', 'Unit needs movement left to unload');
  const normalizedDestination = normalizeDestination(state, destination);
  if (!isLandDestination(state, cargo, normalizedDestination)) return failure('destination-not-land', 'Unload onto land');
  if (transportDistance(state, transport.position, normalizedDestination) !== 1) return failure('invalid-destination', 'Unload next to land');
  if (isDestinationOccupied(state, normalizedDestination)) return failure('destination-occupied', 'Unload tile is occupied');
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
  const normalizedDestination = normalizeDestination(state, destination);

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
          position: normalizedDestination,
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
