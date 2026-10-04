// src/systems/world-actor-queries.ts
// #1248: read-only facts about the crisis world-actors (the Rogue Elephant host, the Stampede) that code
// outside them needs — combat's handler command bonus and production's discount eligibility. Pure functions of
// GameState: no state is changed here, and the actors' turns, spawning and consumption stay in
// rogue-elephant-host-system.ts and stampede-system.ts, which import these back. A leaf, so combat resolution
// and production pricing no longer import the world-actor turns (movement, pathfinding, combat) to ask a question.
import type { GameState } from '@/core/types';
import { hexDistance } from './hex-utils';

/** One viewer-independent combat fact; callers may present it only after visibility checks. */
export function getRogueElephantCommandFact(
  state: GameState,
  elephantUnitId: string,
): { percent: 20; handlerUnitId: string } | undefined {
  const elephant = state.units[elephantUnitId];
  if (!elephant || elephant.type !== 'rogue_elephant') return undefined;
  for (const host of Object.values(state.rogueElephantHosts ?? {})) {
    if (host.phase !== 'active' || !host.forceId) continue;
    const force = state.crisisForces?.[host.forceId];
    if (!force?.unitIds.includes(elephantUnitId)) continue;
    const handler = force.unitIds.map(unitId => state.units[unitId])
      .find((unit): unit is NonNullable<typeof unit> => unit?.type === 'rogue_handler' && unit.health > 0);
    if (handler && hexDistance(handler.position, elephant.position) <= 2) return { percent: 20, handlerUnitId: handler.id };
  }
  return undefined;
}

export function hasActiveRecoveredHarnesses(state: GameState, targetCivId: string): boolean {
  const charge = state.rogueElephantHosts?.[targetCivId]?.recoveredHarnesses;
  return Boolean(charge && !charge.consumed && state.turn < charge.expiresTurn);
}

/** A charge is usable before its expiry turn and exactly once. */
export function hasActiveHerdingInsight(state: GameState, targetCivId: string): boolean {
  const insight = state.stampedes?.[targetCivId]?.herdingInsight;
  return Boolean(insight && !insight.consumed && state.turn < insight.expiresTurn);
}
