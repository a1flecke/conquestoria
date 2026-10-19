import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord } from '@/core/types';
import type { VillageOutcomeType } from '@/core/types/world';
import { updateVisibility } from '@/systems/fog-of-war';
import { getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import { getVisionBonus } from '@/systems/unit-modifier-system';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { cancelInvalidNetworkPlans } from '@/systems/network-plan-system';
import { hexKey } from '@/systems/hex-utils';
import { getFreeStandingOwnedUnits } from '@/systems/unit-ownership';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { moveUnitWithZoneOfControl } from '@/systems/unit-low-level-move';
import { getMovementStepCost } from '@/systems/unit-movement-cost';
import { completeRouteLeg, getRouteRunner, planRouteRunnerRound } from '@/systems/trade-route-runner';
import {
  getOwnerCompletedTechs,
  isWorkerTaskInProgress,
  resolveUnitMoveIntent,
  type ExecuteUnitMoveOptions,
  type MovementRejection,
  type ValidatedUnitMove,
} from '@/systems/unit-movement-validation';

// #1025 MR4: validation moved to its own module so the viewer-scoped explainer can derive
// from it without an import cycle. Re-exported so every existing importer is unchanged.
export {
  isWorkerBusy,
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
import { buildMovePresentationByViewer } from '@/systems/viewer-event-presentation';
import { syncTransportCargoPositions } from '@/systems/transport-system';
import { syncCarrierBasedAircraft } from '@/systems/air-base-state';

export interface WonderDiscoveryResult {
  wonderId: string;
  position: HexCoord;
  isFirstDiscoverer: boolean;
}

export type ExecuteUnitMoveResult =
  | {
      ok: true;
      /** #1199: the resulting state. Until Task 4d this is a new object while,
       *  transitionally, the input state is also written back in place. */
      state: GameState;
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
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unitId]: moved,
    },
  };
  if (unit.type === 'transport') {
    nextState = syncTransportCargoPositions(nextState, unitId);
  }
  // #582: any carrier-family hull, not just plain 'carrier' -- a moving
  // Supercarrier must also carry its based aircraft along with it.
  if (UNIT_DEFINITIONS[unit.type].carrierDeckCapacity != null) {
    nextState = syncCarrierBasedAircraft(nextState, unitId);
  }
  const networkCleanup = cancelInvalidNetworkPlans(nextState);
  nextState.autonomyByCiv = networkCleanup.state.autonomyByCiv;
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
      state: nextState,
      from,
      to: actualTo,
      path: executedPath,
      revealedTiles: [],
      discoveredWonders: [],
      stopReason,
    };
  }

  let villageOutcome: Extract<ExecuteUnitMoveResult, { ok: true }>['villageOutcome'];
  const villageAtDestination = Object.values(nextState.tribalVillages).find(village => hexKey(village.position) === hexKey(actualTo));
  if (villageAtDestination) {
    // #983: was `turn*16807 + unit.id.charCodeAt(0)` -- every normal unit id
    // starts with 'unit-', so charCodeAt(0) was 117 for every unit in the
    // game, and gameId was missing entirely; the village's own identity was
    // never in the seed either. No ordinal is needed: a village is deleted on
    // visit (village-system.ts), so (turn, villageId, unitId) can only ever
    // occur once.
    const villageRng = createSimulationRng(nextState, { domain: 'village-visit', actorId: unit.id, targetId: villageAtDestination.id });
    const result = visitVillage(nextState, villageAtDestination.id, nextState.units[unitId], villageRng);
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

  const movementCompletedTechs = nextState.civilizations[options.civId]?.techState.completed ?? [];
  const movementActiveNPs = getActiveNationalProjectsForCiv(nextState, options.civId);
  const visibilityResult = updateVisibility(
    nextState.civilizations[options.civId].visibility,
    getFreeStandingOwnedUnits(nextState, options.civId),
    nextState.map,
    getCivCityPositions(nextState, options.civId),
    unit => getVisionBonus(unit.type, movementCompletedTechs, movementActiveNPs),
  );
  nextState = {
    ...nextState,
    civilizations: {
      ...nextState.civilizations,
      [options.civId]: {
        ...nextState.civilizations[options.civId],
        visibility: visibilityResult.visibility,
      },
    },
  };
  nextState = refreshLastSeenPresentationsForCiv(nextState, options.civId);
  const revealedTiles = visibilityResult.newlyRevealed;
  const contacts = syncCivilizationContactsFromVisibility(nextState, options.civId);
  for (const contact of contacts) {
    options.bus?.emit('civilization:first-contact', contact);
  }
  if (revealedTiles.length > 0) {
    options.bus?.emit('fog:revealed', { tiles: revealedTiles });
  }

  const discoveredWonders: WonderDiscoveryResult[] = [];
  for (const revealedCoord of revealedTiles) {
    const revealedTile = nextState.map.tiles[hexKey(revealedCoord)];
    if (!revealedTile?.wonder) {
      continue;
    }
    const isFirstDiscoverer = processWonderDiscovery(nextState, options.civId, revealedTile.wonder);
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
    state: nextState,
    from,
    to: actualTo,
    path: executedPath,
    revealedTiles,
    discoveredWonders,
    villageOutcome,
    stopReason,
  };
}

/**
 * #1502 MR05: one round of automated trade travel. The decision (walk, hold, or complete the leg)
 * lives in `trade-route-runner.ts`; this public entry executes the chosen step through the
 * canonical movement executor, so a route step obeys the same occupancy, hostility,
 * territorial-access and zone-of-control rules — and spends the same real movement allowance — as
 * any other move. A trader that reaches home simply departs again: ordinary routes run indefinitely.
 */
export function advanceRouteRunners(state: GameState, bus?: EventBus): GameState {
  if (!state.marketplace?.tradeRoutes?.length) return state;
  let newState = state;

  /**
   * #1501 MR04: record that this route's trader made validated progress (or completed endpoint
   * service) in the current round. Settlement pays only for rounds with a progress record, so a
   * blocked or waiting trader is never paid for standing still.
   */
  const markProgress = (s: GameState, routeId: string): GameState => {
    if (!s.marketplace) return s;
    return {
      ...s,
      marketplace: {
        ...s.marketplace,
        tradeRoutes: s.marketplace.tradeRoutes.map(route =>
          route.id === routeId ? { ...route, lastProgressTurn: s.turn } : route),
      },
    };
  };

  /** Write back the facts this round discovered (endpoint loss, detour accounting, leg start). */
  const setRoute = (s: GameState, updated: typeof state.marketplace.tradeRoutes[number]): GameState => {
    if (!s.marketplace) return s;
    return {
      ...s,
      marketplace: {
        ...s.marketplace,
        tradeRoutes: s.marketplace.tradeRoutes.map(route => route.id === updated.id ? updated : route),
      },
    };
  };

  for (const routeId of state.marketplace.tradeRoutes.map(candidate => candidate.id)) {
    // Walk as far as this round's allowance allows, one validated step at a time. Re-planning per
    // step is what lets the runner hand the executor the exact tile it chose to walk to.
    let detourChargedThisRound = false;
    for (let step = 0; step < 8; step++) {
      const route = newState.marketplace?.tradeRoutes.find(candidate => candidate.id === routeId);
      if (!route) break;
      const caravan = getRouteRunner(newState, route.id);
      if (!caravan) break;

      const plan = planRouteRunnerRound(newState, route);
      // A detour is charged once per round, however many steps of it the trader walks.
      const plannedRoute = plan.detoured && !detourChargedThisRound
        ? { ...plan.route, detourRoundsUsed: (route.detourRoundsUsed ?? 0) + 1 }
        : plan.route;
      if (plan.detoured) detourChargedThisRound = true;
      newState = setRoute(newState, plannedRoute);

      if (plan.action === 'hold') {
        break;
      }

      const legTarget = plan.legTargetCityId ? newState.cities[plan.legTargetCityId] : undefined;
      if (!legTarget || !plan.target) break;
      const atLegTarget = caravan.position.q === legTarget.position.q && caravan.position.r === legTarget.position.r;

      // Already standing on the leg target: endpoint service with no walk needed.
      if (atLegTarget) {
        newState = markProgress(completeRouteLeg(newState, route.id, caravan.id, bus), route.id);
        break;
      }

      const move = executeUnitMove(newState, caravan.id, plan.target, {
        actor: 'automation',
        civId: caravan.owner,
        bus,
      });
      if (!move.ok) {
        // #1502 MR05: the canonical executor is the authority on whether a step is legal. A rejected
        // step simply ends this round's walk; the settlement phase judges and announces interruption.
        break;
      }
      newState = markProgress(move.state, route.id);

      if (move.to.q === legTarget.position.q && move.to.r === legTarget.position.r) {
        newState = completeRouteLeg(newState, route.id, caravan.id, bus);
        break;
      }
      if ((newState.units[caravan.id]?.movementPointsLeft ?? 0) < 1) break;
    }
  }

  return newState;
}
