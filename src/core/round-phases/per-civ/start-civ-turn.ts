import type { GameState, Civilization } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { appendLegendaryWonderNetworkPlanResolutions } from '@/systems/legendary-wonder-history';
import { resolveLandSupplyForCiv } from '@/systems/supply-system';
import { resolveNavalOperationsForCiv } from '@/systems/naval-operations';
import { resolveAirReadinessForCiv } from '@/systems/air-readiness';
import { advanceAutonomySurge, applyPendingAutonomyPosture } from '@/systems/autonomy-postures';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { beginNetworkPlansForVictimTurn, resolveStableNetworkPlansForOwnerTurn } from '@/systems/network-plan-system';
import { getStampedeLifecycleTransition, processStampedeTurn } from '@/systems/stampede-system';
import {
  getRogueElephantHostLifecycleTransition,
  processRogueElephantHostTurn,
} from '@/systems/rogue-elephant-host-system';
import type { CivTurn } from './types';

/**
 * Land supply, naval endurance and air readiness for the civ, resolved before anything else this round.
 */
export function resolveSupplyAndReadiness(state: GameState, civId: string): GameState {
  let newState = state;
  newState = resolveLandSupplyForCiv(newState, civId);
  newState = resolveNavalOperationsForCiv(newState, civId);
  newState = resolveAirReadinessForCiv(newState, civId);
  return newState;
}

/**
 * The civ's stampede and rogue-elephant-host turns, announcing each lifecycle transition they cause.
 */
export function advanceWorldPressureTurns(state: GameState, civId: string, bus: EventBus): GameState {
  let newState = state;
  const stampedeBefore = newState.stampedes?.[civId];
  newState = processStampedeTurn(newState, civId);
  const hostBefore = newState.rogueElephantHosts?.[civId];
  newState = processRogueElephantHostTurn(newState, civId);
  const stampedeTransition = getStampedeLifecycleTransition(
    stampedeBefore,
    newState.stampedes?.[civId],
  );
  if (stampedeTransition) bus.emit('stampede:lifecycle', stampedeTransition);
  const hostTransition = getRogueElephantHostLifecycleTransition(hostBefore, newState.rogueElephantHosts?.[civId]);
  if (hostTransition) bus.emit('rogue-elephant-host:lifecycle', hostTransition);
  return newState;
}

/**
 * Applies a pending autonomy posture and advances the surge; a surge recovery that just ended is announced.
 */
export function advanceAutonomy(state: GameState, civId: string, bus: EventBus): GameState {
  let newState = state;
  const recoveringBeforeAdvance = newState.autonomyByCiv?.[civId]?.surgeRecoveryUntilTurn;
  newState = applyPendingAutonomyPosture(newState, civId);
  newState = advanceAutonomySurge(newState, civId);
  if (recoveringBeforeAdvance !== null && recoveringBeforeAdvance !== undefined
    && newState.autonomyByCiv?.[civId]?.surgeRecoveryUntilTurn === null) {
    bus.emit('network:audio-cue', { cue: 'recovery', viewerIds: [civId] });
  }
  return newState;
}

/**
 * Resolves the network plans this civ owns that have become stable, and records them in the wonder history.
 */
export function resolveOwnerNetworkPlans(state: GameState, civId: string, bus: EventBus): GameState {
  let newState = state;
  const resolutionCountBefore = (newState.legendaryWonderHistory?.networkPlanResolutions ?? [])
    .filter(record => record.civId === civId).length;
  const ownerTurnResolution = resolveStableNetworkPlansForOwnerTurn(newState, civId);
  newState = appendLegendaryWonderNetworkPlanResolutions(ownerTurnResolution.state, ownerTurnResolution.resolutions);
  const resolutionCountAfter = (newState.legendaryWonderHistory?.networkPlanResolutions ?? [])
    .filter(record => record.civId === civId).length;
  if (resolutionCountBefore < 3 && resolutionCountAfter >= 3) {
    bus.emit('network:audio-cue', { cue: 'constructive-resolution', viewerIds: [civId] });
  }
  return newState;
}

/**
 * AI civs are warned of network plans targeting their cities (a human gets this from the panel).
 */
export function warnNetworkVictim(state: GameState, civId: string, civ: Civilization, bus: EventBus): GameState {
  let newState = state;
  if (!civ.isHuman) {
    const warningResult = beginNetworkPlansForVictimTurn(newState, civId);
    newState = warningResult.state;
    for (const warning of warningResult.warnings) {
      const plan = Object.values(newState.autonomyByCiv ?? {})
        .map(autonomy => autonomy.plans[warning.planId])
        .find(Boolean);
      if (plan?.target.kind === 'city') {
        bus.emit('network:exploit-warning', {
          planId: warning.planId,
          victimCivId: civId,
          cityId: plan.target.cityId,
        });
      }
    }
  }
  return newState;
}

/**
 * Everything that happens to a civ before its cities produce: supply, naval and air readiness, world-pressure turns,
 * autonomy, and network plans. Returns the state and the facts every later step of this civ's visit reads.
 */
export function startCivTurn(
  state: GameState,
  civId: string,
  civ: Civilization,
  bus: EventBus,
): { state: GameState; turn: CivTurn } {
  let newState = state;
  newState = resolveSupplyAndReadiness(newState, civId);
  newState = advanceWorldPressureTurns(newState, civId, bus);
  newState = advanceAutonomy(newState, civId, bus);
  newState = resolveOwnerNetworkPlans(newState, civId, bus);
  newState = warnNetworkVictim(newState, civId, civ, bus);
  const currentCivState = newState.civilizations[civId];
  const civDef = resolveCivDefinition(newState, civ.civType ?? '');
  // Snapshot before production creates new units this turn — geneTherapyReady recharge
  // must only consider units that already existed at turn start (see gene-therapy-system.ts).
  const unitIdsAtTurnStart = [...civ.units];
  return { state: newState, turn: { civId, civ, currentCivState, civDef, unitIdsAtTurnStart } };
}
