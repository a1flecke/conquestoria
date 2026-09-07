import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, VillageOutcomeType } from '@/core/types';
import { updateVisibility } from '@/systems/fog-of-war';
import { getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import { getVisionBonus } from '@/systems/unit-modifier-system';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { cancelInvalidNetworkPlans } from '@/systems/network-plan-system';
import { hexKey } from '@/systems/hex-utils';
import {
  moveUnitWithZoneOfControl,
  getMovementStepCost,
  findPathToCity,
  UNIT_DEFINITIONS,
} from '@/systems/unit-system';
import {
  getOwnerCompletedTechs,
  resolveUnitMoveIntent,
  type ExecuteUnitMoveOptions,
  type MovementRejection,
  type ValidatedUnitMove,
} from '@/systems/unit-movement-validation';

// #1025 MR4: validation moved to its own module so the viewer-scoped explainer can derive
// from it without an import cycle. Re-exported so every existing importer is unchanged.
export {
  validateUnitMove,
  resolveUnitMoveIntent,
  getImpassableReason,
  type ValidatedUnitMove,
  type MoveResolution,
  type MovementRejection,
  type ExecuteUnitMoveOptions,
} from '@/systems/unit-movement-validation';
import { visitVillage } from '@/systems/village-system';
import { createSimulationRng } from '@/systems/simulation-rng';
import { processWonderDiscovery } from '@/systems/wonder-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { isAtWar } from '@/systems/diplomacy-system';
import { removeRouteForUnit } from '@/systems/trade-system';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';
import { syncTransportCargoPositions } from '@/systems/transport-system';
import { syncCarrierBasedAircraft } from '@/systems/air-operations-system';
import { buildMovePresentationByViewer } from '@/systems/viewer-event-presentation';

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
      stopReason?: 'zone-of-control';
    }
  | MovementRejection;

function isWorkerTaskInProgress(tile: GameState['map']['tiles'][string] | undefined, task: NonNullable<GameState['units'][string]['workerTask']>): boolean {
  if (!tile) return false;
  if (task.action === 'build_road') return (tile.roadTurnsLeft ?? 0) > 0;
  return tile.improvement === task.action && tile.improvementTurnsLeft > 0;
}

export function isWorkerBusy(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.type !== 'worker' || !unit.workerTask) return false;
  const taskKey = hexKey(unit.workerTask.coord);
  const tile = state.map.tiles[taskKey];
  return hexKey(unit.position) === taskKey && isWorkerTaskInProgress(tile, unit.workerTask);
}

export function abandonWorkerTask(state: GameState, unitId: string): void {
  const unit = state.units[unitId];
  if (!unit?.workerTask) return;
  const key = hexKey(unit.workerTask.coord);
  const tile = state.map.tiles[key];
  if (isWorkerTaskInProgress(tile, unit.workerTask)) {
    if (unit.workerTask.action === 'build_road') {
      tile!.roadTurnsLeft = 0;
    } else {
      tile!.improvement = 'none';
      tile!.improvementTurnsLeft = 0;
    }
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
  const resolution = resolveUnitMoveIntent(state, unitId, to, options);
  if (!resolution.ok) return resolution;
  return executeValidatedUnitMove(state, resolution.command);
}

/**
 * The raw executor. Accepts only a `ValidatedUnitMove` produced by
 * `resolveUnitMoveIntent`, so a caller structurally cannot execute an
 * unvalidated move. Every other movement executor in the codebase either calls
 * this or is a documented, source-rule-exempt special case
 * (`.claude/rules/movement-actions.md`).
 */
export function executeValidatedUnitMove(
  state: GameState,
  command: ValidatedUnitMove,
): ExecuteUnitMoveResult {
  const { unitId, options } = command;
  const unit = state.units[unitId]!;
  const from = { ...unit.position };
  const movePath = command.path;
  let moved = unit;
  let stopReason: 'zone-of-control' | undefined;
  const executedPath = [from];
  for (const step of movePath.slice(1)) {
    const cost = getMovementStepCost(moved, state.map, moved.position, step, {
      completedTechs: getOwnerCompletedTechs(state, unit.owner),
    });
    const movement = moveUnitWithZoneOfControl(state, moved, step, cost);
    moved = movement.unit;
    executedPath.push(step);
    if (movement.stopped) {
      stopReason = 'zone-of-control';
      break;
    }
  }
  const actualTo = moved.position;
  const presentationByViewer = buildMovePresentationByViewer(state, unit, executedPath);
  state.units = {
    ...state.units,
    [unitId]: moved,
  };
  if (unit.type === 'transport') {
    const synced = syncTransportCargoPositions(state, unitId);
    state.units = synced.units;
  }
  // #582: any carrier-family hull, not just plain 'carrier' -- a moving
  // Supercarrier must also carry its based aircraft along with it.
  if (UNIT_DEFINITIONS[unit.type].carrierDeckCapacity != null) {
    const synced = syncCarrierBasedAircraft(state, unitId);
    state.units = synced.units;
  }
  const networkCleanup = cancelInvalidNetworkPlans(state);
  state.autonomyByCiv = networkCleanup.state.autonomyByCiv;
  options.bus?.emit('unit:move', {
    unitId,
    from,
    to: actualTo,
    path: executedPath,
    presentationByViewer,
  });

  if (options.actor === 'world') {
    return {
      ok: true,
      from,
      to: actualTo,
      path: executedPath,
      revealedTiles: [],
      discoveredWonders: [],
      stopReason,
    };
  }

  let villageOutcome: Extract<ExecuteUnitMoveResult, { ok: true }>['villageOutcome'];
  const villageAtDestination = Object.values(state.tribalVillages).find(village => hexKey(village.position) === hexKey(actualTo));
  if (villageAtDestination) {
    // #983: was `turn*16807 + unit.id.charCodeAt(0)` -- every normal unit id
    // starts with 'unit-', so charCodeAt(0) was 117 for every unit in the
    // game, and gameId was missing entirely; the village's own identity was
    // never in the seed either. No ordinal is needed: a village is deleted on
    // visit (village-system.ts), so (turn, villageId, unitId) can only ever
    // occur once.
    const villageRng = createSimulationRng(state, { domain: 'village-visit', actorId: unit.id, targetId: villageAtDestination.id });
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

  const movementCompletedTechs = state.civilizations[options.civId]?.techState.completed ?? [];
  const movementActiveNPs = getActiveNationalProjectsForCiv(state, options.civId);
  const revealedTiles = updateVisibility(
    state.civilizations[options.civId].visibility,
    getCivUnits(state, options.civId),
    state.map,
    getCivCityPositions(state, options.civId),
    unit => getVisionBonus(unit.type, movementCompletedTechs, movementActiveNPs),
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
    to: actualTo,
    path: executedPath,
    revealedTiles,
    discoveredWonders,
    villageOutcome,
    stopReason,
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
    bus?.emit('trade:route-delivered', { unitId: caravanId, routeId: route.id, toCityId: route.toCityId });
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

    // Trade Routes Overhaul (#553 MR1/4): route runners must move in the unit's own
    // domain, same root-cause fix as canEstablishRoute/resolveFromCity in trade-system.ts.
    const runnerDomain = UNIT_DEFINITIONS[caravan.type]?.domain ?? 'land';
    // #1042: thread the caravan + owner techs so the drawn route follows roads,
    // matching the canonical cost model the executor uses.
    const path = findPathToCity(caravan.position, targetCity.position, newState.map, runnerDomain, {
      unit: caravan,
      completedTechs: newState.civilizations[caravan.owner]?.techState.completed ?? [],
    });
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
    bus?.emit('unit:move', {
      unitId: caravan.id,
      from,
      to: nextStep,
      path: [from, nextStep],
      presentationByViewer: buildMovePresentationByViewer(
        newState,
        { ...caravan, position: from },
        [from, nextStep],
      ),
    });

    if (nextStep.q === targetCity.position.q && nextStep.r === targetCity.position.r) {
      const movedCaravan = newState.units[caravan.id];
      if (movedCaravan) {
        newState = processCaravanArrival(newState, caravan.id, route, isOutbound, bus);
      }
    }
  }

  return newState;
}
