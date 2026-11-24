import type { EventBus } from '@/core/event-bus';
import type { CombatResult, GameState } from '@/core/types';
import { resolveUnitVsUnitAttack } from '@/systems/attack-targeting';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { resolveCombatEra } from '@/systems/era-resolution';
import {
  beginMajorCityAssault,
  emitMajorCityCaptureEvents,
  recordCityCaptureCareerEvents,
  resolveMajorCityCapture,
} from '@/systems/city-capture-system';
import { hexKey } from '@/systems/hex-utils';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { hasHostileUnitAtCoord, buildUnitOccupancy } from '@/systems/unit-occupancy';
import { buildCombatPresentation, buildCombatSpyIdentifications } from '@/systems/viewer-event-presentation';
import type { AITacticalAction } from './ai-tactics';

/**
 * The one AI major-city occupation (extracted verbatim from `ai-major-turn.ts`, #1807):
 * `beginMajorCityAssault` → `resolveMajorCityCapture('occupy')` → capture events and
 * career attribution, with the #522 rule that a repelled assault still keeps its own
 * mutated state. Lives here so `executeAIUnitAttack`'s capture follow-up and the
 * 'capture-city' tactical action share one implementation.
 */
export function occupyMajorCity(
  state: GameState,
  cityId: string,
  attackerId: string,
  civId: string,
  bus: EventBus,
  precedingCombat?: CombatResult,
  attackerMultiplier?: number,
): { state: GameState; captured: boolean } {
  const city = state.cities[cityId];
  if (!city || !state.civilizations[city.owner]) {
    return { state, captured: false };
  }
  const previousOwnerId = city.owner;
  const assault = beginMajorCityAssault(
    state,
    attackerId,
    cityId,
    {
      actor: 'ai',
      civId,
      bus,
      precedingCombat,
      attackerMultiplier,
    },
  );
  // Return assault.state, NOT the original state, even on failure (#522 pre-merge
  // review fix): a repelled assault still mutates state via counter-fire (attacker
  // damaged or killed) and consumes the attacker's action (hasActed/movementPointsLeft).
  // Discarding that back to the pre-assault state would silently "undo" a repel for
  // the AI actor -- the attacker keeps full health, isn't marked as acted, and could be
  // re-selected to retry the same doomed assault for free in the same turn.
  if (!assault.ok) return { state: assault.state, captured: false };
  const capture = resolveMajorCityCapture(
    assault.state,
    cityId,
    civId,
    'occupy',
    assault.state.turn,
    bus,
  );
  emitMajorCityCaptureEvents(
    state,
    capture,
    cityId,
    civId,
    previousOwnerId,
    bus,
  );
  // #887 MR1: same transition-owned city-captured attribution as the human
  // finalizePlayerCityAssaultChoice path -- here precedingCombat (the
  // garrison-breaking fight) is still in hand. Applied after event emission,
  // which does not depend on careerEvents.
  const withCareerEvents = recordCityCaptureCareerEvents(
    capture.state,
    cityId,
    city.name,
    civId,
    attackerId,
    precedingCombat,
  );
  return { state: withCareerEvents, captured: true };
}

/**
 * The one AI unit-vs-unit attack execution (extracted verbatim from
 * `ai-major-turn.ts`'s local `executeAttack`, #1807): `resolveUnitVsUnitAttack`
 * legality → the seeded combat roll → `applyCombatOutcomeToState`, plus the capture
 * follow-up when the fight clears a hostile city's garrison and the same
 * presentation/reward/quest emissions every AI attack owes the viewer. Extracted so the
 * Seize-grant spending pass (`ai-general-command.ts`) spends a granted attack through
 * this same executor instead of a parallel copy that could drift (caller-discipline.md:
 * a consequence every executor shares lives in the function they all funnel through).
 */
export function executeAIUnitAttack(
  state: GameState,
  attackerId: string,
  targetUnitId: string,
  civId: string,
  bus: EventBus,
  amphibiousAssault = false,
): { state: GameState; followUps: AITacticalAction[] } {
  const next = structuredClone(state);
  const attacker = next.units[attackerId];
  const defender = next.units[targetUnitId];
  if (!attacker || !defender || attacker.owner !== civId) {
    return { state, followUps: [] };
  }
  if (!resolveUnitVsUnitAttack(next, attacker, defender, { viewerId: civId, requireVisibility: true }).ok) {
    return { state, followUps: [] };
  }

  const seed = deterministicCombatSeed(next.gameId, next.turn, attacker.id, defender.id);
  const combat = resolveCombat(
    attacker,
    defender,
    next.map,
    seed,
    buildCombatContextForDefender(next, attacker, defender, { amphibiousAssault }),
    resolveCombatEra(next, attacker, defender),
  );
  const presentation = buildCombatPresentation(next, combat, attacker, defender);
  const applied = applyCombatOutcomeToState(next, combat, seed, bus);
  let working = applied.state;
  emitMinorCivQuestTransitions(bus, applied.questTransitions, working);
  bus.emit('combat:resolved', {
    result: combat,
    ...presentation,
    attackerCaptureKind: applied.attackerCaptureKind,
    defenderCaptureKind: applied.defenderCaptureKind,
    spyIdentifications: buildCombatSpyIdentifications(next, working, attacker, defender),
  });
  for (const reward of applied.rewards) {
    bus.emit('combat:reward-earned', { reward });
  }

  const followUps: AITacticalAction[] = [];
  if (applied.defenderDefeated) {
    const city = Object.values(working.cities).find(candidate =>
      hexKey(candidate.position) === hexKey(defender.position)
      && candidate.owner !== civId);
    const attackerAfterCombat = working.units[attacker.id];
    const occupancy = buildUnitOccupancy(working.units);
    if (
      city
      && attackerAfterCombat
      && !hasHostileUnitAtCoord(occupancy, city.position, civId)
      && working.civilizations[city.owner]
    ) {
      const capture = occupyMajorCity(
        working,
        city.id,
        attacker.id,
        civId,
        bus,
        combat,
      );
      if (capture.captured) {
        working = capture.state;
        followUps.push({
          kind: 'capture-city',
          unitId: attacker.id,
          cityId: city.id,
        });
      }
    }
  }
  return { state: working, followUps };
}
