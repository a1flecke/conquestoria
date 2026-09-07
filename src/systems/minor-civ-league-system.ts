import type {
  GameState,
  MinorCivLeague,
  MinorCivLeagueCharter,
  MinorCivLeagueState,
  MinorCivPosture,
} from '@/core/types';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import {
  MINOR_CIV_LEAGUE_NAME_KEYS,
  MINOR_CIV_LEAGUE_RULES,
  MINOR_CIV_LEAGUE_TIMING,
} from './minor-civ-league-definitions';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { mapDistance } from './hex-utils';
import { createRng } from './map-generator';
import { resolveNeutralPressureEra } from './era-resolution';
import { getCivilizationLiveness } from './civilization-liveness';

export type MinorCivLeaguePreference =
  | { kind: 'none'; reason: 'no-compact' | 'own-needs' | 'warning' }
  | { kind: MinorCivLeagueCharter | 'defense'; reason: 'charter' | 'preparation' };

export function createMinorCivLeagueState(state: GameState): MinorCivLeagueState {
  const challenge = resolveOpponentChallenge(state);
  const grace = state.turn + MINOR_CIV_LEAGUE_RULES.admissionGraceTurns;
  return {
    leagues: {},
    nextId: 1,
    nextCheckTurn: Math.max(
      MINOR_CIV_LEAGUE_RULES.minWorldTurn,
      state.turn + MINOR_CIV_LEAGUE_TIMING[challenge].checkInterval,
    ),
    lastProcessedTurn: -1,
    eligibleAfterTurnByMinorCiv: Object.fromEntries(
      Object.entries(state.minorCivs)
        .filter(([, minorCiv]) => !minorCiv.isDestroyed)
        .map(([minorCivId]) => [minorCivId, grace]),
    ),
  };
}

function getLivingIndependentMinor(state: GameState, minorCivId: string) {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv || minorCiv.id !== minorCivId || minorCiv.isDestroyed) return null;
  const city = state.cities[minorCiv.cityId];
  const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minorCiv.definitionId);
  if (!city || city.owner !== minorCivId || !definition) return null;
  return { minorCiv, city, definition };
}

function getLivingIndependentMinorIds(state: GameState): string[] {
  return Object.keys(state.minorCivs)
    .filter(minorCivId => getLivingIndependentMinor(state, minorCivId) !== null)
    .sort();
}

function isCompatibleMemberSet(state: GameState, memberIds: readonly string[]): boolean {
  for (let leftIndex = 0; leftIndex < memberIds.length; leftIndex += 1) {
    const left = getLivingIndependentMinor(state, memberIds[leftIndex]);
    if (!left) return false;
    for (let rightIndex = leftIndex + 1; rightIndex < memberIds.length; rightIndex += 1) {
      const rightId = memberIds[rightIndex];
      const right = getLivingIndependentMinor(state, rightId);
      if (!right) return false;
      const leftWars = left.minorCiv.diplomacy.atWarWith ?? [];
      const rightWars = right.minorCiv.diplomacy.atWarWith ?? [];
      if (leftWars.includes(rightId) || rightWars.includes(left.minorCiv.id)) return false;
      if (mapDistance(state.map, left.city.position, right.city.position) > MINOR_CIV_LEAGUE_RULES.radius) {
        return false;
      }
    }
  }
  return true;
}

function orderedLeagues(leagues: Record<string, MinorCivLeague>): MinorCivLeague[] {
  return Object.values(leagues).sort((left, right) => (
    left.formedTurn - right.formedTurn || left.id.localeCompare(right.id)
  ));
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((memberId, index) => memberId === right[index]);
}

function graceTurn(state: GameState): number {
  return Math.min(Number.MAX_SAFE_INTEGER, state.turn + MINOR_CIV_LEAGUE_RULES.admissionGraceTurns);
}

function hasLiveConcernSource(state: GameState, league: MinorCivLeague): boolean {
  return league.memberIds.some(memberId => {
    const member = getLivingIndependentMinor(state, memberId);
    if (!member) return false;
    const targets = new Set<string>(member.minorCiv.diplomacy.atWarWith ?? []);
    for (const [targetId, grievance] of Object.entries(member.minorCiv.regionalGrievanceByCiv ?? {})) {
      if (grievance.status === 'mobilizing' || grievance.status === 'coalition-talks') targets.add(targetId);
    }
    return [...targets].some(targetId => (
      getCivilizationLiveness(state, targetId).living
      && (resolveNeutralPressureEra(state, member.city.position, targetId) ?? 1) >= 2
    ));
  });
}

function reconcileReadiness(state: GameState, league: MinorCivLeague): MinorCivLeague['readiness'] {
  const hasSource = hasLiveConcernSource(state, league);
  if (hasSource) {
    return league.readiness.kind === 'concern'
      ? league.readiness
      : { kind: 'concern', sinceTurn: state.turn };
  }
  if (league.readiness.kind === 'concern') return { kind: 'cooling', sinceTurn: state.turn };
  if (league.readiness.kind === 'cooling') {
    const coolingTurns = MINOR_CIV_LEAGUE_TIMING[resolveOpponentChallenge(state)].coolingTurns;
    return state.turn - league.readiness.sinceTurn >= coolingTurns ? { kind: 'quiet' } : league.readiness;
  }
  return league.readiness;
}

function sameReadiness(
  left: MinorCivLeague['readiness'],
  right: MinorCivLeague['readiness'],
): boolean {
  return left.kind === right.kind
    && (left.kind === 'quiet' || (right.kind !== 'quiet' && left.sinceTurn === right.sinceTurn));
}

/**
 * Repairs only live compact membership. It deliberately does not form new
 * groups, register new minors, or advance the scheduler.
 */
export function reconcileMinorCivLeagues(state: GameState): GameState {
  const current = state.minorCivLeagues;
  if (!current) return state;

  const leagues: Record<string, MinorCivLeague> = {};
  const claimedMembers = new Set<string>();
  const removedLivingMembers = new Set<string>();
  let changed = false;

  for (const league of orderedLeagues(current.leagues)) {
    const originalMembers = [...new Set(league.memberIds)].sort();
    const livingMembers = originalMembers.filter(memberId => (
      !claimedMembers.has(memberId) && getLivingIndependentMinor(state, memberId) !== null
    ));
    const survives = livingMembers.length >= MINOR_CIV_LEAGUE_RULES.minMembers
      && isCompatibleMemberSet(state, livingMembers);
    if (!survives) {
      changed = true;
      for (const memberId of originalMembers) {
        if (getLivingIndependentMinor(state, memberId) !== null && !claimedMembers.has(memberId)) {
          removedLivingMembers.add(memberId);
        }
      }
      continue;
    }
    if (!sameMembers(league.memberIds, livingMembers)) changed = true;
    const readiness = reconcileReadiness(state, league);
    const readinessChanged = !sameReadiness(readiness, league.readiness);
    if (readinessChanged) changed = true;
    const reconciled = sameMembers(league.memberIds, livingMembers) && !readinessChanged
      ? league
      : { ...league, memberIds: livingMembers, readiness };
    leagues[league.id] = reconciled;
    for (const memberId of livingMembers) claimedMembers.add(memberId);
  }

  const eligibleAfterTurnByMinorCiv = Object.fromEntries(
    Object.entries(current.eligibleAfterTurnByMinorCiv)
      .filter(([minorCivId]) => getLivingIndependentMinor(state, minorCivId) !== null),
  );
  if (Object.keys(eligibleAfterTurnByMinorCiv).length
    !== Object.keys(current.eligibleAfterTurnByMinorCiv).length) {
    changed = true;
  }
  for (const memberId of removedLivingMembers) {
    const nextGraceTurn = graceTurn(state);
    if (eligibleAfterTurnByMinorCiv[memberId] !== nextGraceTurn) {
      eligibleAfterTurnByMinorCiv[memberId] = nextGraceTurn;
      changed = true;
    }
  }

  if (!changed) return state;
  return {
    ...state,
    minorCivLeagues: { ...current, leagues, eligibleAfterTurnByMinorCiv },
  };
}

function getMemberIds(leagues: Record<string, MinorCivLeague>): Set<string> {
  return new Set(Object.values(leagues).flatMap(league => league.memberIds));
}

function isAdmissionEligible(state: GameState, minorCivId: string): boolean {
  const minor = getLivingIndependentMinor(state, minorCivId);
  const eligibleAfterTurn = state.minorCivLeagues?.eligibleAfterTurnByMinorCiv[minorCivId];
  return Boolean(
    minor
    && minor.city.population >= MINOR_CIV_LEAGUE_RULES.minPopulation
    && minor.city.buildings.length >= MINOR_CIV_LEAGUE_RULES.minBuildings
    && typeof eligibleAfterTurn === 'number'
    && eligibleAfterTurn <= state.turn,
  );
}

function candidateRank(state: GameState, candidateId: string, memberIds: readonly string[]): [number, number, string] {
  const candidate = getLivingIndependentMinor(state, candidateId)!;
  let matchingArchetypes = 0;
  let distanceSum = 0;
  for (const memberId of memberIds) {
    const member = getLivingIndependentMinor(state, memberId)!;
    if (member.definition.archetype === candidate.definition.archetype) matchingArchetypes += 1;
    distanceSum += mapDistance(state.map, candidate.city.position, member.city.position);
  }
  return [-matchingArchetypes, distanceSum, candidateId];
}

function compareRank(left: [number, number, string], right: [number, number, string]): number {
  return left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2]);
}

function selectCompatibleCandidate(
  state: GameState,
  memberIds: readonly string[],
  availableIds: readonly string[],
): string | null {
  const candidates = availableIds
    .filter(candidateId => isCompatibleMemberSet(state, [...memberIds, candidateId]))
    .sort((left, right) => compareRank(candidateRank(state, left, memberIds), candidateRank(state, right, memberIds)));
  return candidates[0] ?? null;
}

function charterForFoundingMembers(state: GameState, memberIds: readonly string[]): MinorCivLeagueCharter {
  const counts: Record<MinorCivLeagueCharter, number> = {
    commerce: 0,
    learning: 0,
    security: 0,
    cooperation: 0,
  };
  for (const memberId of memberIds) {
    const archetype = getLivingIndependentMinor(state, memberId)!.definition.archetype;
    if (archetype === 'mercantile') counts.commerce += 1;
    if (archetype === 'cultural') counts.learning += 1;
    if (archetype === 'militaristic') counts.security += 1;
  }
  const majority = (['commerce', 'learning', 'security'] as const)
    .find(charter => counts[charter] > memberIds.length / 2);
  return majority ?? 'cooperation';
}

function chooseNameKey(state: GameState, compactId: string, usedNames: ReadonlySet<string>): string | null {
  const rng = createRng(`${state.gameId ?? 'legacy-game'}${compactId}`);
  const firstIndex = Math.floor(rng() * MINOR_CIV_LEAGUE_NAME_KEYS.length);
  for (let offset = 0; offset < MINOR_CIV_LEAGUE_NAME_KEYS.length; offset += 1) {
    const nameKey = MINOR_CIV_LEAGUE_NAME_KEYS[(firstIndex + offset) % MINOR_CIV_LEAGUE_NAME_KEYS.length];
    if (!usedNames.has(nameKey)) return nameKey;
  }
  return null;
}

function formOrJoinCompacts(state: GameState): GameState {
  const current = state.minorCivLeagues!;
  const leagues: Record<string, MinorCivLeague> = { ...current.leagues };
  const memberIds = getMemberIds(leagues);

  for (const league of orderedLeagues(leagues)) {
    const grownLeague: MinorCivLeague = { ...league, memberIds: [...league.memberIds] };
    leagues[grownLeague.id] = grownLeague;
    while (grownLeague.memberIds.length < MINOR_CIV_LEAGUE_RULES.maxMembers) {
      const availableIds = getLivingIndependentMinorIds(state)
        .filter(candidateId => !memberIds.has(candidateId) && isAdmissionEligible(state, candidateId));
      const candidateId = selectCompatibleCandidate(state, grownLeague.memberIds, availableIds);
      if (!candidateId) break;
      grownLeague.memberIds = [...grownLeague.memberIds, candidateId].sort();
      memberIds.add(candidateId);
    }
  }

  let nextId = current.nextId;
  const usedNames = new Set(Object.values(leagues).map(league => league.nameKey));
  while (Object.keys(leagues).length < MINOR_CIV_LEAGUE_RULES.maxLeagues && nextId < Number.MAX_SAFE_INTEGER) {
    const availableIds = getLivingIndependentMinorIds(state)
      .filter(candidateId => !memberIds.has(candidateId) && isAdmissionEligible(state, candidateId));
    const pairs = availableIds.flatMap((leftId, leftIndex) => (
      availableIds.slice(leftIndex + 1)
        .filter(rightId => isCompatibleMemberSet(state, [leftId, rightId]))
        .map(rightId => {
          const [firstId, secondId] = [leftId, rightId].sort();
          const first = getLivingIndependentMinor(state, firstId)!;
          const second = getLivingIndependentMinor(state, secondId)!;
          return {
            memberIds: [firstId, secondId],
            sameArchetype: first.definition.archetype === second.definition.archetype,
            distance: mapDistance(state.map, first.city.position, second.city.position),
          };
        })
    )).sort((left, right) => (
      Number(right.sameArchetype) - Number(left.sameArchetype)
      || left.distance - right.distance
      || left.memberIds.join(':').localeCompare(right.memberIds.join(':'))
    ));
    const pair = pairs[0];
    if (!pair) break;

    const foundingMemberIds = [...pair.memberIds];
    while (foundingMemberIds.length < MINOR_CIV_LEAGUE_RULES.maxMembers) {
      const candidateId = selectCompatibleCandidate(
        state,
        foundingMemberIds,
        availableIds.filter(availableId => !foundingMemberIds.includes(availableId)),
      );
      if (!candidateId) break;
      foundingMemberIds.push(candidateId);
      foundingMemberIds.sort();
    }

    const id = `minor-compact-${nextId}`;
    const nameKey = chooseNameKey(state, id, usedNames);
    if (!nameKey) break;
    leagues[id] = {
      id,
      nameKey,
      charter: charterForFoundingMembers(state, foundingMemberIds),
      memberIds: foundingMemberIds,
      formedTurn: state.turn,
      readiness: { kind: 'quiet' },
    };
    nextId += 1;
    usedNames.add(nameKey);
    for (const memberId of foundingMemberIds) memberIds.add(memberId);
  }

  return {
    ...state,
    minorCivLeagues: { ...current, leagues, nextId },
  };
}

/** Runs at most one deterministic compact admission check per world turn. */
export function processMinorCivLeagueTurn(state: GameState): GameState {
  let nextState = state.minorCivLeagues
    ? state
    : { ...state, minorCivLeagues: createMinorCivLeagueState(state) };
  const current = nextState.minorCivLeagues!;
  const eligibleAfterTurnByMinorCiv = { ...current.eligibleAfterTurnByMinorCiv };
  let registeredNewMinor = false;
  for (const minorCivId of getLivingIndependentMinorIds(nextState)) {
    if (eligibleAfterTurnByMinorCiv[minorCivId] === undefined) {
      eligibleAfterTurnByMinorCiv[minorCivId] = graceTurn(nextState);
      registeredNewMinor = true;
    }
  }
  if (registeredNewMinor) {
    nextState = {
      ...nextState,
      minorCivLeagues: { ...current, eligibleAfterTurnByMinorCiv },
    };
  }

  nextState = reconcileMinorCivLeagues(nextState);
  const reconciled = nextState.minorCivLeagues!;
  if (reconciled.lastProcessedTurn === nextState.turn
    || nextState.turn < MINOR_CIV_LEAGUE_RULES.minWorldTurn
    || nextState.turn < reconciled.nextCheckTurn) {
    return nextState;
  }

  nextState = formOrJoinCompacts(nextState);
  const challenge = resolveOpponentChallenge(nextState);
  return {
    ...nextState,
    minorCivLeagues: {
      ...nextState.minorCivLeagues!,
      nextCheckTurn: nextState.turn + MINOR_CIV_LEAGUE_TIMING[challenge].checkInterval,
      lastProcessedTurn: nextState.turn,
    },
  };
}

export function getMinorCivLeagueForMember(state: GameState, minorCivId: string): MinorCivLeague | null {
  return orderedLeagues(state.minorCivLeagues?.leagues ?? {})
    .find(league => league.memberIds.includes(minorCivId)) ?? null;
}

export function getMinorCivLeaguePreference(
  state: GameState,
  minorCivId: string,
  ownPosture: MinorCivPosture,
): MinorCivLeaguePreference {
  const league = getMinorCivLeagueForMember(state, minorCivId);
  if (!league) return { kind: 'none', reason: 'no-compact' };
  if (ownPosture !== 'settled') return { kind: 'none', reason: 'own-needs' };
  if (league.readiness.kind === 'concern') {
    const warningTurns = MINOR_CIV_LEAGUE_TIMING[resolveOpponentChallenge(state)].warningTurns;
    if (hasLiveConcernSource(state, league)
      && state.turn >= MINOR_CIV_LEAGUE_RULES.minWorldTurn
      && state.turn - league.readiness.sinceTurn >= warningTurns) {
      return { kind: 'defense', reason: 'preparation' };
    }
    return { kind: 'none', reason: 'warning' };
  }
  return { kind: league.charter, reason: 'charter' };
}
