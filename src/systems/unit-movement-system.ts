import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, VillageOutcomeType } from '@/core/types';
import { updateVisibility } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { hexKey, wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import { moveUnit, getMovementCostForUnit, findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery } from '@/systems/wonder-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { isAtWar } from '@/systems/diplomacy-system';
import { removeRouteForUnit } from '@/systems/trade-system';

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

export interface ExecuteUnitMoveResult {
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
    .filter((unit): unit is NonNullable<typeof unit> => unit !== undefined) ?? [];
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
  const unit = state.units[unitId];
  if (!unit) {
    return {
      from: to,
      to,
      path: [to],
      revealedTiles: [],
      discoveredWonders: [],
    };
  }

  const from = { ...unit.position };
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';

  // Calculate total path cost
  let cost = 0;
  const path = findPath(from, to, state.map, domain);
  if (path) {
    for (let i = 1; i < path.length; i++) {
      const tile = state.map.tiles[hexKey(path[i])];
      cost += tile ? getMovementCostForUnit(tile.terrain, domain) : 1;
    }
  } else {
    // Fallback for single-step moves or if pathfinding fails unexpectedly
    const tile = state.map.tiles[hexKey(to)];
    cost = tile ? getMovementCostForUnit(tile.terrain, domain) : 1;
  }
  state.units = {
    ...state.units,
    [unitId]: moveUnit(unit, to, cost),
  };
  const movePath = path ?? [from, to];
  options.bus?.emit('unit:move', { unitId, from, to, path: movePath });

  let villageOutcome: ExecuteUnitMoveResult['villageOutcome'];
  const villageAtDestination = Object.values(state.tribalVillages).find(village => hexKey(village.position) === hexKey(to));
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
    from,
    to,
    path: movePath,
    revealedTiles,
    discoveredWonders,
    villageOutcome,
  };
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
