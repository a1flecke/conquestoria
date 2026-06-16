import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, VillageOutcomeType } from '@/core/types';
import { getVisibility, updateVisibility } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { hexKey, wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import {
  moveUnit,
  getMovementCostForUnitInContext,
  getMovementStepCost,
  findPath,
  UNIT_DEFINITIONS,
  type UnitMovementBlockerCode,
} from '@/systems/unit-system';
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery } from '@/systems/wonder-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { isAtWar } from '@/systems/diplomacy-system';
import { removeRouteForUnit } from '@/systems/trade-system';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';
import { syncTransportCargoPositions } from '@/systems/transport-system';

export interface ExecuteUnitMoveOptions {
  actor: 'player' | 'automation' | 'ai';
  civId: string;
  bus?: EventBus;
}

export interface WonderDiscoveryResult {
  wonderId: string;
  position: HexCoord;
  isFirstDiscoverer: boolean;
}

export type ExecuteUnitMoveResult =
  | {
      ok: true;
      from: HexCoord;
      to: HexCoord;
      path: HexCoord[];
      revealedTiles: HexCoord[];
      discoveredWonders: WonderDiscoveryResult[];
      villageOutcome?: {
        outcome: VillageOutcomeType;
        message: string;
        position: HexCoord;
      };
    }
  | {
      ok: false;
      from: HexCoord;
      to: HexCoord;
      path: HexCoord[];
      reason: UnitMovementBlockerCode | 'missing-unit';
      message: string;
      revealedTiles: [];
      discoveredWonders: [];
    };

export function isWorkerBusy(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.type !== 'worker' || !unit.workerTask) return false;
  const taskKey = hexKey(unit.workerTask.coord);
  const tile = state.map.tiles[taskKey];
  return hexKey(unit.position) === taskKey
    && tile?.improvement === unit.workerTask.action
    && tile.improvementTurnsLeft > 0;
}

export function abandonWorkerTask(state: GameState, unitId: string): void {
  const unit = state.units[unitId];
  if (!unit?.workerTask) return;
  const key = hexKey(unit.workerTask.coord);
  const tile = state.map.tiles[key];
  if (tile?.improvement === unit.workerTask.action && tile.improvementTurnsLeft > 0) {
    tile.improvement = 'none';
    tile.improvementTurnsLeft = 0;
  }
  state.units = {
    ...state.units,
    [unitId]: { ...unit, workerTask: undefined },
  };
}

function getCivUnits(state: GameState, civId: string) {
  return state.civilizations[civId]?.units
    .map(id => state.units[id])
    .filter((unit): unit is NonNullable<typeof unit> => unit !== undefined && !unit.transportId) ?? [];
}

function getCivCityPositions(state: GameState, civId: string): HexCoord[] {
  return state.civilizations[civId]?.cities
    .map(id => state.cities[id]?.position)
    .filter((coord): coord is HexCoord => coord !== undefined) ?? [];
}

export function executeUnitMove(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: ExecuteUnitMoveOptions,
): ExecuteUnitMoveResult {
  const validation = validateUnitMove(state, unitId, to, options);
  if (!validation.ok) {
    return validation;
  }

  const unit = state.units[unitId]!;
  const from = { ...unit.position };
  state.units = {
    ...state.units,
    [unitId]: moveUnit(unit, validation.to, validation.cost),
  };
  if (unit.type === 'transport') {
    const synced = syncTransportCargoPositions(state, unitId);
    state.units = synced.units;
  }
  const movePath = validation.path;
  options.bus?.emit('unit:move', { unitId, from, to: validation.to, path: movePath });

  let villageOutcome: Extract<ExecuteUnitMoveResult, { ok: true }>['villageOutcome'];
  const villageAtDestination = Object.values(state.tribalVillages).find(village => hexKey(village.position) === hexKey(validation.to));
  if (villageAtDestination) {
    let rngState = state.turn * 16807 + unit.id.charCodeAt(0);
    const villageRng = () => {
      rngState = (rngState * 48271) % 2147483647;
      return rngState / 2147483647;
    };
    const result = visitVillage(state, villageAtDestination.id, state.units[unitId], villageRng);
    villageOutcome = {
      outcome: result.outcome,
      message: result.message,
      position: villageAtDestination.position,
    };
    options.bus?.emit('village:visited', {
      civId: options.civId,
      position: villageAtDestination.position,
      outcome: result.outcome,
      message: result.message,
    });
  }

  const revealedTiles = updateVisibility(
    state.civilizations[options.civId].visibility,
    getCivUnits(state, options.civId),
    state.map,
    getCivCityPositions(state, options.civId),
  );
  refreshLastSeenPresentationsForCiv(state, options.civId);
  const contacts = syncCivilizationContactsFromVisibility(state, options.civId);
  for (const contact of contacts) {
    options.bus?.emit('civilization:first-contact', contact);
  }
  if (revealedTiles.length > 0) {
    options.bus?.emit('fog:revealed', { tiles: revealedTiles });
  }

  const discoveredWonders: WonderDiscoveryResult[] = [];
  for (const revealedCoord of revealedTiles) {
    const revealedTile = state.map.tiles[hexKey(revealedCoord)];
    if (!revealedTile?.wonder) {
      continue;
    }
    const isFirstDiscoverer = processWonderDiscovery(state, options.civId, revealedTile.wonder);
    const discovery = {
      wonderId: revealedTile.wonder,
      position: revealedCoord,
      isFirstDiscoverer,
    };
    discoveredWonders.push(discovery);
    options.bus?.emit('wonder:discovered', {
      civId: options.civId,
      wonderId: revealedTile.wonder,
      position: revealedCoord,
      isFirstDiscoverer,
    });
  }

  return {
    ok: true,
    from,
    to: validation.to,
    path: movePath,
    revealedTiles,
    discoveredWonders,
    villageOutcome,
  };
}

type UnitMoveValidationResult =
  | { ok: true; from: HexCoord; to: HexCoord; path: HexCoord[]; cost: number }
  | Extract<ExecuteUnitMoveResult, { ok: false }>;

function movementFailure(
  from: HexCoord,
  to: HexCoord,
  path: HexCoord[],
  reason: UnitMovementBlockerCode | 'missing-unit',
  message: string,
): Extract<ExecuteUnitMoveResult, { ok: false }> {
  return {
    ok: false,
    from,
    to,
    path,
    reason,
    message,
    revealedTiles: [],
    discoveredWonders: [],
  };
}

function getOwnerCompletedTechs(state: GameState, owner: string): string[] {
  return state.civilizations[owner]?.techState.completed ?? [];
}

function getImpassableReason(
  unitType: string,
  terrain: string,
  completedTechs: string[],
): { reason: UnitMovementBlockerCode; message: string } {
  if (unitType === 'transport' && (terrain === 'coast' || terrain === 'ocean') && !completedTechs.includes('galleys')) {
    return { reason: 'requires-galleys', message: 'Need Galleys to sail a Transport.' };
  }
  if (unitType === 'transport' && terrain === 'ocean' && !completedTechs.includes('celestial-navigation')) {
    return { reason: 'requires-celestial-navigation', message: 'Need Celestial Navigation to cross ocean.' };
  }
  if (terrain === 'ocean' || terrain === 'coast') {
    return { reason: 'impassable-water', message: 'Land units cannot cross water yet.' };
  }
  return { reason: 'impassable-terrain', message: 'This terrain cannot be entered.' };
}

function normalizeDestination(state: GameState, coord: HexCoord): HexCoord {
  if (!state.map.wrapsHorizontally) return { ...coord };
  return { ...coord, q: ((coord.q % state.map.width) + state.map.width) % state.map.width };
}

export function validateUnitMove(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: ExecuteUnitMoveOptions,
): UnitMoveValidationResult {
  const unit = state.units[unitId];
  if (!unit) return movementFailure(to, to, [to], 'missing-unit', 'Unit not found');

  const from = { ...unit.position };
  const target = normalizeDestination(state, to);
  if (unit.transportId) {
    return movementFailure(from, target, [from], 'occupied', 'Loaded units cannot move until they unload.');
  }

  const tile = state.map.tiles[hexKey(target)];
  if (!tile) return movementFailure(from, target, [from], 'unknown-tile', 'Too far away to spot.');

  const completedTechs = getOwnerCompletedTechs(state, unit.owner);
  const targetCost = getMovementCostForUnitInContext(unit, tile.terrain, { completedTechs });
  if (targetCost === Infinity) {
    const blocker = getImpassableReason(unit.type, tile.terrain, completedTechs);
    return movementFailure(from, target, [from, target], blocker.reason, blocker.message);
  }

  const occupancy = buildUnitOccupancy(state.units);
  const occupants = getUnitIdsAtCoord(occupancy, target).filter(id => id !== unitId);
  const hasHostileOccupant = occupants.some(id => occupancy.ownersByUnitId[id] !== unit.owner);
  if (hasHostileOccupant) {
    return movementFailure(from, target, [from, target], 'occupied', 'An enemy unit is blocking the way.');
  }

  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const path = findPath(from, target, state.map, domain, { unit, completedTechs });
  if (!path) return movementFailure(from, target, [from], 'unreachable', 'No passable route to that tile.');

  const visibility = state.civilizations[options.civId]?.visibility;
  const isPlayerControlledMove = options.actor !== 'automation' && options.actor !== 'ai';
  if (
    isPlayerControlledMove
    && visibility
    && path.length > 2
    && path.slice(1).some(coord => getVisibility(visibility, coord) === 'unexplored')
  ) {
    return movementFailure(from, target, path, 'unexplored', 'Move one step at a time into unexplored territory.');
  }

  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    cost += getMovementStepCost(unit, state.map, path[i - 1]!, path[i]!, { completedTechs });
  }

  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(from, target, state.map.width)
    : hexDistance(from, target);
  const forcedMarch = distance === 1 && unit.movementPointsLeft >= 1 && cost > unit.movementPointsLeft;
  if (!forcedMarch && cost > unit.movementPointsLeft) {
    return movementFailure(from, target, path, 'insufficient-movement', 'Not enough movement left this turn.');
  }

  return { ok: true, from, to: target, path, cost };
}

function processCaravanArrival(
  state: GameState,
  caravanId: string,
  route: { id: string; fromCityId: string; toCityId: string },
  arrivedAtToCity: boolean,
  bus?: EventBus,
): GameState {
  if (arrivedAtToCity) {
    return {
      ...state,
      units: {
        ...state.units,
        [caravanId]: { ...state.units[caravanId]!, routeDirection: 'inbound' },
      },
    };
  }

  // Arrived at fromCity (inbound leg complete) — decrement trips
  const caravan = state.units[caravanId]!;
  const tripsRemaining = (caravan.tripsRemaining ?? 1) - 1;

  if (tripsRemaining <= 0) {
    const { [caravanId]: _removed, ...remainingUnits } = state.units;
    const ownerCiv = state.civilizations[caravan.owner];
    const newCivs = ownerCiv
      ? {
          ...state.civilizations,
          [caravan.owner]: {
            ...ownerCiv,
            units: ownerCiv.units.filter((id: string) => id !== caravanId),
          },
        }
      : state.civilizations;
    const stateWithoutCaravan = { ...state, units: remainingUnits, civilizations: newCivs };
    return removeRouteForUnit(stateWithoutCaravan, caravanId, bus, 'trips-exhausted', route.id);
  }

  return {
    ...state,
    units: {
      ...state.units,
      [caravanId]: { ...state.units[caravanId]!, routeDirection: 'outbound', tripsRemaining },
    },
  };
}

export function advanceRouteRunners(state: GameState, bus?: EventBus): GameState {
  if (!state.marketplace?.tradeRoutes?.length) return state;
  let newState = state;

  for (const route of state.marketplace.tradeRoutes) {
    const caravan = Object.values(newState.units).find(u => u.committedToRouteId === route.id);
    if (!caravan) continue;

    const isOutbound = (caravan.routeDirection ?? 'outbound') === 'outbound';
    const targetCity = newState.cities[isOutbound ? route.toCityId : route.fromCityId];
    if (!targetCity) continue;

    const path = findPath(caravan.position, targetCity.position, newState.map, 'land');
    if (!path || path.length === 0) continue;

    if (path.length === 1) {
      newState = processCaravanArrival(newState, caravan.id, route, isOutbound, bus);
      continue;
    }

    const nextStep = path[1]!;
    const ownerCiv = newState.civilizations[caravan.owner];
    const blocked = ownerCiv != null && Object.values(newState.units).some(u =>
      u.id !== caravan.id &&
      u.position.q === nextStep.q && u.position.r === nextStep.r &&
      isAtWar(ownerCiv.diplomacy, u.owner),
    );

    if (blocked) {
      const toCity = newState.cities[route.toCityId];
      bus?.emit('notification:show', {
        message: `Trade route to ${toCity?.name ?? route.toCityId} is blocked by enemy forces.`,
        type: 'warning',
      });
      continue;
    }

    // Move caravan via spread-copy — NOT moveUnit() (movementPointsLeft is already 0)
    const from = { ...caravan.position };
    newState = {
      ...newState,
      units: {
        ...newState.units,
        [caravan.id]: { ...newState.units[caravan.id]!, position: nextStep },
      },
    };
    bus?.emit('unit:move', { unitId: caravan.id, from, to: nextStep, path: [from, nextStep] });

    if (nextStep.q === targetCity.position.q && nextStep.r === targetCity.position.r) {
      const movedCaravan = newState.units[caravan.id];
      if (movedCaravan) {
        newState = processCaravanArrival(newState, caravan.id, route, isOutbound, bus);
      }
    }
  }

  return newState;
}
