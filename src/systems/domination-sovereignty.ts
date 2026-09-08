import type { GameState } from '@/core/types';
import { isMajorCivOwner } from '@/core/owner-kind';
import { getCivilizationLiveness } from './civilization-liveness';
import type { DominationActorFact } from './domination-types';

interface SovereigntyContext {
  readonly ids: string[];
  readonly cityCounts: ReadonlyMap<string, number>;
  readonly livenessById: ReadonlyMap<string, boolean>;
  readonly validOverlordByVassal: ReadonlyMap<string, string>;
}

export function getDominationActorFact(
  state: GameState,
  civId: string,
): DominationActorFact | null {
  if (!isMajorCivOwner(civId) || !state.civilizations[civId]) return null;
  return classifyActor(state, civId, buildContext(state));
}

export function buildDominationActorFacts(state: GameState): DominationActorFact[] {
  const context = buildContext(state);
  return context.ids.map(civId => classifyActor(state, civId, context));
}

function buildContext(state: GameState): SovereigntyContext {
  const ids = Object.keys(state.civilizations)
    .filter(isMajorCivOwner)
    .sort(compareIds);
  const cityCounts = new Map<string, number>(ids.map(civId => [civId, 0]));
  for (const city of Object.values(state.cities)) {
    if (cityCounts.has(city.owner)) cityCounts.set(city.owner, cityCounts.get(city.owner)! + 1);
  }
  const livenessById = new Map<string, boolean>(
    ids.map(civId => [civId, getCivilizationLiveness(state, civId).living]),
  );

  const validOverlordByVassal = new Map<string, string>();
  for (const vassalId of ids) {
    const overlordId = state.civilizations[vassalId].diplomacy.vassalage.overlord;
    if (overlordId && isValidDirectVassalage(state, vassalId, overlordId, livenessById)) {
      validOverlordByVassal.set(vassalId, overlordId);
    }
  }

  return { ids, cityCounts, livenessById, validOverlordByVassal };
}

function isValidDirectVassalage(
  state: GameState,
  vassalId: string,
  overlordId: string,
  livenessById: ReadonlyMap<string, boolean>,
): boolean {
  const vassal = state.civilizations[vassalId];
  const overlord = state.civilizations[overlordId];
  if (!vassal || !overlord || !isMajorCivOwner(vassalId) || !isMajorCivOwner(overlordId)
    || vassalId === overlordId
    || !livenessById.get(vassalId)
    || !livenessById.get(overlordId)
    || vassal.diplomacy.vassalage.overlord !== overlordId
    || vassal.diplomacy.vassalage.vassals.length !== 0
    || overlord.diplomacy.vassalage.overlord !== null
    || overlord.diplomacy.vassalage.vassals.filter(id => id === vassalId).length !== 1) {
    return false;
  }

  return hasSingleActiveVassalageTreaty(vassal.diplomacy.treaties, vassalId, overlordId)
    && hasSingleActiveVassalageTreaty(overlord.diplomacy.treaties, vassalId, overlordId);
}

function hasSingleActiveVassalageTreaty(
  treaties: readonly { type: string; civA: string; civB: string; turnsRemaining: number }[],
  vassalId: string,
  overlordId: string,
): boolean {
  const pairTreaties = treaties.filter(treaty => treaty.type === 'vassalage'
    && ((treaty.civA === vassalId && treaty.civB === overlordId)
      || (treaty.civA === overlordId && treaty.civB === vassalId)));
  return pairTreaties.length === 1
    && pairTreaties[0]!.civA === vassalId
    && pairTreaties[0]!.civB === overlordId
    && Number.isInteger(pairTreaties[0]!.turnsRemaining)
    && (pairTreaties[0]!.turnsRemaining === -1 || pairTreaties[0]!.turnsRemaining > 0);
}

function classifyActor(
  state: GameState,
  civId: string,
  context: SovereigntyContext,
): DominationActorFact {
  if (!context.livenessById.get(civId)) {
    return { civId, disposition: 'eliminated', overlordId: null };
  }

  const overlordId = context.validOverlordByVassal.get(civId);
  if (overlordId) return { civId, disposition: 'vassal', overlordId };

  if (isProvisionalSecession(state, civId, context)) {
    return { civId, disposition: 'provisional', overlordId: null };
  }
  return { civId, disposition: 'independent', overlordId: null };
}

function isProvisionalSecession(
  state: GameState,
  civId: string,
  context: SovereigntyContext,
): boolean {
  const civ = state.civilizations[civId];
  const breakaway = civ.breakaway;
  if (!breakaway || breakaway.status !== 'secession'
    || state.turn >= breakaway.establishesOnTurn
    || context.cityCounts.get(civId) !== 1) return false;

  const origin = state.civilizations[breakaway.originOwnerId];
  if (!origin || !context.livenessById.get(origin.id)
    || context.cityCounts.get(origin.id) === 0
    || context.validOverlordByVassal.has(origin.id)) return false;

  const originBreakaway = origin.breakaway;
  return !originBreakaway
    || originBreakaway.status === 'established'
    || state.turn >= originBreakaway.establishesOnTurn;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
