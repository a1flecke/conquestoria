import type { GameState } from '@/core/types';
import { processIndependentThreatPressure } from '@/systems/threat-pressure-system';
import { processCrisisScheduler } from '@/systems/crisis-system';
import { processEventChainScheduler } from '@/systems/event-chain-scheduling';
import { getStampedeLifecycleTransition, processStampedeScheduling } from '@/systems/stampede-system';
import { getRogueElephantHostLifecycleTransition, processRogueElephantHostScheduling } from '@/systems/rogue-elephant-host-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Spawns and schedules world threats after the round's movement and combat: independent threat pressure (land
 * resurgence and pirate spawns), then crisis, event-chain, stampede and rogue-elephant-host scheduling. Stampede
 * and host lifecycle transitions that scheduling causes are announced.
 */
function runThreatScheduling(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // --- Threat pressure (spawn phase: land resurgence + pirate spawn) ---
  newState = processIndependentThreatPressure(newState, bus);
  newState = processCrisisScheduler(newState, bus);
  newState = processEventChainScheduler(newState, bus);
  const stampedesBeforeScheduling = newState.stampedes;
  const hostsBeforeScheduling = newState.rogueElephantHosts;
  newState = processStampedeScheduling(newState);
  newState = processRogueElephantHostScheduling(newState);
  for (const civId of Object.keys(newState.stampedes ?? {}).sort()) {
    const transition = getStampedeLifecycleTransition(
      stampedesBeforeScheduling?.[civId],
      newState.stampedes?.[civId],
    );
    if (transition) bus.emit('stampede:lifecycle', transition);
  }
  for (const civId of Object.keys(newState.rogueElephantHosts ?? {}).sort()) {
    const transition = getRogueElephantHostLifecycleTransition(
      hostsBeforeScheduling?.[civId],
      newState.rogueElephantHosts?.[civId],
    );
    if (transition) bus.emit('rogue-elephant-host:lifecycle', transition);
  }
  return newState;
}

export const threatSchedulingPhase: RoundPhase = { id: 'threat-scheduling', run: runThreatScheduling };
