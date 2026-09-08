import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { declareWar, makePeace, modifyRelationship, applyVassalageWarConsequences, getActiveVassalIds } from './diplomacy-system';
import { hasAccessibleLuxury } from './quest-objective-system';
import { applyQuestGameplayAction, type ChainTransition } from './quest-chain-system';
import { isMinorCivAtWar, endMinorCivQuestForWar } from './minor-civ-diplomacy';
import { resolveCivilizationEra } from './tech-definitions';
import { reconcileMinorCivLeagues } from './minor-civ-league-system';

const REPARATIONS_BASE_COST = 40;
const REPARATIONS_ERA_COST = 10;
const REPARATIONS_PRESSURE_REDUCTION = 20;
const REPARATIONS_RELATIONSHIP_REPAIR = 8;

export interface MinorCivActionResult {
  state: GameState;
  ok: boolean;
  reason?: string;
  transitions: ChainTransition[];
}

function validatePair(state: GameState, majorCivId: string, minorCivId: string): string | null {
  if (!state.civilizations[majorCivId]) return 'Civilization not found.';
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv || minorCiv.isDestroyed) return 'City-state not found.';
  if (isMinorCivAtWar(state, majorCivId, minorCivId)) return 'This action is unavailable while at war.';
  return null;
}

export function performMinorCivGift(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
): MinorCivActionResult {
  const invalid = validatePair(state, majorCivId, minorCivId);
  if (invalid) return { state, ok: false, reason: invalid, transitions: [] };
  const quest = state.minorCivs[minorCivId].activeQuests[majorCivId];
  const amount = quest?.target.type === 'gift_gold' ? quest.target.amount : 25;
  if (state.civilizations[majorCivId].gold < amount) {
    return { state, ok: false, reason: `Requires ${amount} gold.`, transitions: [] };
  }

  if (quest?.target.type === 'gift_gold') {
    const result = applyQuestGameplayAction(state, {
      type: 'gift_gold', actorCivId: majorCivId, minorCivId, amount, turn: state.turn,
    });
    return { ...result, ok: true };
  }

  const nextState = structuredClone(state);
  nextState.civilizations[majorCivId].gold -= amount;
  const minorCiv = nextState.minorCivs[minorCivId];
  minorCiv.diplomacy = modifyRelationship(minorCiv.diplomacy, majorCivId, 10);
  return { state: nextState, ok: true, transitions: [] };
}

export function performMinorCivFestival(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
): MinorCivActionResult {
  const invalid = validatePair(state, majorCivId, minorCivId);
  if (invalid) return { state, ok: false, reason: invalid, transitions: [] };
  const quest = state.minorCivs[minorCivId].activeQuests[majorCivId];
  if (quest?.target.type !== 'sponsor_festival') {
    return { state, ok: false, reason: 'No festival is currently requested.', transitions: [] };
  }
  if (!hasAccessibleLuxury(state, majorCivId)) {
    return { state, ok: false, reason: 'Requires access to a luxury resource.', transitions: [] };
  }
  if (state.civilizations[majorCivId].gold < quest.target.amount) {
    return { state, ok: false, reason: `Requires ${quest.target.amount} gold.`, transitions: [] };
  }
  const result = applyQuestGameplayAction(state, {
    type: 'sponsor_festival', actorCivId: majorCivId, minorCivId, turn: state.turn,
  });
  return { ...result, ok: true };
}

function grievanceStatusForPressure(pressure: number, era: number) {
  if (era <= 1) return 'wary';
  if (pressure >= 70) return 'coalition-talks';
  if (pressure >= 45) return 'mobilizing';
  return 'wary';
}

export function minorCivReparationsCost(state: GameState, civId: string): number {
  return REPARATIONS_BASE_COST + resolveCivilizationEra(state.civilizations[civId]?.techState.completed ?? []) * REPARATIONS_ERA_COST;
}

export function performMinorCivReparations(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
): MinorCivActionResult {
  const invalid = validatePair(state, majorCivId, minorCivId);
  if (invalid) return { state, ok: false, reason: invalid, transitions: [] };
  const grievance = state.minorCivs[minorCivId].regionalGrievanceByCiv?.[majorCivId];
  if (!grievance || grievance.pressure < 20) {
    return { state, ok: false, reason: 'No active regional grievance.', transitions: [] };
  }
  const cost = minorCivReparationsCost(state, majorCivId);
  if (state.civilizations[majorCivId].gold < cost) {
    return { state, ok: false, reason: `Requires ${cost} gold.`, transitions: [] };
  }

  const nextState = structuredClone(state);
  nextState.civilizations[majorCivId].gold -= cost;
  const nextMinor = nextState.minorCivs[minorCivId];
  const nextPressure = Math.max(0, grievance.pressure - REPARATIONS_PRESSURE_REDUCTION);
  nextMinor.diplomacy = modifyRelationship(nextMinor.diplomacy, majorCivId, REPARATIONS_RELATIONSHIP_REPAIR);
  nextMinor.regionalGrievanceByCiv ??= {};
  const reparationsCause = {
    type: 'reparations' as const,
    turn: nextState.turn,
    actorCivId: majorCivId,
    pressure: -REPARATIONS_PRESSURE_REDUCTION,
  };
  nextMinor.regionalGrievanceByCiv[majorCivId] = {
    ...grievance,
    pressure: nextPressure,
    status: grievanceStatusForPressure(nextPressure, resolveCivilizationEra(nextState.civilizations[majorCivId].techState.completed)),
    lastUpdatedTurn: nextState.turn,
    causes: [...grievance.causes, reparationsCause].slice(-8),
  };
  return { state: reconcileMinorCivLeagues(nextState), ok: true, transitions: [] };
}

export function setMinorCivWarState(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
  atWar: boolean,
  bus?: EventBus,
): MinorCivActionResult {
  const majorCiv = state.civilizations[majorCivId];
  const minorCiv = state.minorCivs[minorCivId];
  if (!majorCiv || !minorCiv || minorCiv.isDestroyed) {
    return { state, ok: false, reason: 'Diplomatic party not found.', transitions: [] };
  }
  if (majorCiv.diplomacy.vassalage.overlord) return { state, ok: false, reason: 'Your overlord controls war and peace.', transitions: [] };
  const majorAtWar = majorCiv.diplomacy.atWarWith.includes(minorCivId);
  const minorAtWar = minorCiv.diplomacy.atWarWith.includes(majorCivId);
  if ((atWar && majorAtWar && minorAtWar) || (!atWar && !majorAtWar && !minorAtWar)) {
    return { state, ok: true, transitions: [] };
  }

  const nextState = structuredClone(state);
  const nextMajor = nextState.civilizations[majorCivId];
  const nextMinor = nextState.minorCivs[minorCivId];
  if (atWar) {
    if (!majorAtWar) nextMajor.diplomacy = declareWar(nextMajor.diplomacy, minorCivId, state.turn);
    if (!minorAtWar) nextMinor.diplomacy = declareWar(nextMinor.diplomacy, majorCivId, state.turn);
  } else {
    if (majorAtWar) nextMajor.diplomacy = makePeace(nextMajor.diplomacy, minorCivId, state.turn);
    if (minorAtWar) nextMinor.diplomacy = makePeace(nextMinor.diplomacy, majorCivId, state.turn);
    // #1054: the war branch below runs applyVassalageWarConsequences, which drags
    // this civ's vassals into its city-state wars. The peace branch has to undo
    // that or they are stranded — a vassal is blocked from setMinorCivWarState
    // too ("Your overlord controls war and peace"), so it can never sue itself.
    for (const vassalId of getActiveVassalIds(state, majorCivId)) {
      const vassal = nextState.civilizations[vassalId];
      if (!vassal?.diplomacy.atWarWith.includes(minorCivId)) continue;
      vassal.diplomacy = makePeace(vassal.diplomacy, minorCivId, state.turn);
      if (nextMinor.diplomacy.atWarWith.includes(vassalId)) {
        nextMinor.diplomacy = makePeace(nextMinor.diplomacy, vassalId, state.turn);
      }
      bus?.emit('diplomacy:vassal-auto-peace', { vassalId, overlordId: majorCivId, targetCivId: minorCivId });
    }
    return { state: reconcileMinorCivLeagues(nextState), ok: true, transitions: [] };
  }

  const ended = endMinorCivQuestForWar(nextMinor, majorCivId, state.turn);
  nextState.minorCivs[minorCivId] = ended.minor;
  const transitions: ChainTransition[] = ended.brokenChainId
    ? [{ type: 'alliance-broken', majorCivId, minorCivId, chainId: ended.brokenChainId }] : [];
  return { state: reconcileMinorCivLeagues(applyVassalageWarConsequences(state, nextState, bus)), ok: true, transitions };
}
