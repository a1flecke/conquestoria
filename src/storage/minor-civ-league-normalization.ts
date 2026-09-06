import type {
  GameState,
  MinorCivLeague,
  MinorCivLeagueCharter,
  MinorCivLeagueReadiness,
  MinorCivLeagueState,
} from '@/core/types';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import {
  MINOR_CIV_LEAGUE_NAME_KEYS,
  MINOR_CIV_LEAGUE_RULES,
  MINOR_CIV_LEAGUE_TIMING,
} from '@/systems/minor-civ-league-definitions';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { mapDistance } from '@/systems/hex-utils';

const CHARTERS = new Set<MinorCivLeagueCharter>([
  'commerce', 'learning', 'security', 'cooperation',
]);
const NAME_KEYS = new Set<string>(MINOR_CIV_LEAGUE_NAME_KEYS);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function currentTurn(state: GameState): number {
  return isSafeIntegerInRange(state.turn, 0, Number.MAX_SAFE_INTEGER) ? state.turn : 0;
}

function isFiniteCoord(value: unknown): value is { q: number; r: number } {
  return isPlainRecord(value) && Number.isFinite(value.q) && Number.isFinite(value.r);
}

function isLivingIndependentMinor(state: GameState, minorCivId: string): boolean {
  const minorCiv = state.minorCivs?.[minorCivId];
  if (!minorCiv || minorCiv.id !== minorCivId || minorCiv.isDestroyed) return false;
  if (!MINOR_CIV_DEFINITIONS.some(definition => definition.id === minorCiv.definitionId)) return false;
  const city = state.cities?.[minorCiv.cityId];
  return Boolean(city && city.owner === minorCivId && isFiniteCoord(city.position));
}

function livingIndependentMinorIds(state: GameState): string[] {
  return Object.keys(state.minorCivs ?? {})
    .filter(minorCivId => isLivingIndependentMinor(state, minorCivId))
    .sort();
}

function createDefaultMinorCivLeagueState(state: GameState): MinorCivLeagueState {
  const challenge = resolveOpponentChallenge(state);
  const turn = currentTurn(state);
  const eligibleAfterTurn = Math.min(
    Number.MAX_SAFE_INTEGER,
    turn + MINOR_CIV_LEAGUE_RULES.admissionGraceTurns,
  );
  return {
    leagues: {},
    nextId: 1,
    nextCheckTurn: Math.max(
      MINOR_CIV_LEAGUE_RULES.minWorldTurn,
      turn + MINOR_CIV_LEAGUE_TIMING[challenge].checkInterval,
    ),
    lastProcessedTurn: -1,
    eligibleAfterTurnByMinorCiv: Object.fromEntries(
      livingIndependentMinorIds(state).map(minorCivId => [minorCivId, eligibleAfterTurn]),
    ),
  };
}

function parseLeagueId(id: unknown, recordKey: string): number | null {
  if (typeof id !== 'string' || id !== recordKey) return null;
  const match = /^minor-compact-(\d+)$/.exec(id);
  if (!match) return null;
  const suffix = Number(match[1]);
  return Number.isSafeInteger(suffix) && suffix > 0 && suffix < Number.MAX_SAFE_INTEGER
    ? suffix
    : null;
}

function normalizeReadiness(state: GameState, value: unknown): MinorCivLeagueReadiness {
  if (!isPlainRecord(value)) return { kind: 'quiet' };
  if (value.kind === 'quiet') return { kind: 'quiet' };
  if ((value.kind === 'concern' || value.kind === 'cooling')
    && isSafeIntegerInRange(value.sinceTurn, 0, currentTurn(state))) {
    return { kind: value.kind, sinceTurn: value.sinceTurn };
  }
  return { kind: 'quiet' };
}

function membersAreCompatible(state: GameState, memberIds: readonly string[]): boolean {
  for (let leftIndex = 0; leftIndex < memberIds.length; leftIndex += 1) {
    const leftId = memberIds[leftIndex];
    const left = state.minorCivs[leftId];
    const leftCity = state.cities[left.cityId];
    for (let rightIndex = leftIndex + 1; rightIndex < memberIds.length; rightIndex += 1) {
      const rightId = memberIds[rightIndex];
      const right = state.minorCivs[rightId];
      const rightCity = state.cities[right.cityId];
      const leftWars = Array.isArray(left.diplomacy?.atWarWith) ? left.diplomacy.atWarWith : [];
      const rightWars = Array.isArray(right.diplomacy?.atWarWith) ? right.diplomacy.atWarWith : [];
      if (leftWars.includes(rightId) || rightWars.includes(leftId)) return false;
      if (mapDistance(state.map, leftCity.position, rightCity.position) > MINOR_CIV_LEAGUE_RULES.radius) {
        return false;
      }
    }
  }
  return true;
}

interface LeagueCandidate {
  league: MinorCivLeague;
  suffix: number;
}

function normalizeEligibleAfterTurns(
  state: GameState,
  value: unknown,
  removedMinorIds: ReadonlySet<string>,
  acceptedMinorIds: ReadonlySet<string>,
): Record<string, number> {
  const raw = isPlainRecord(value) ? value : {};
  const turn = currentTurn(state);
  const graceTurn = Math.min(Number.MAX_SAFE_INTEGER, turn + MINOR_CIV_LEAGUE_RULES.admissionGraceTurns);
  return Object.fromEntries(livingIndependentMinorIds(state).map(minorCivId => {
    const persisted = raw[minorCivId];
    const valid = isSafeIntegerInRange(persisted, 0, graceTurn) ? persisted : graceTurn;
    const removed = removedMinorIds.has(minorCivId) && !acceptedMinorIds.has(minorCivId);
    return [minorCivId, removed ? graceTurn : valid];
  }));
}

/**
 * Adds the persisted container without advancing lifecycle state. Record repair is
 * deliberately kept structural: loading a save never forms a compact or emits an event.
 */
export function normalizeMinorCivLeagueState(state: GameState): GameState {
  const rawState = state.minorCivLeagues;
  if (!isPlainRecord(rawState)) {
    return { ...state, minorCivLeagues: createDefaultMinorCivLeagueState(state) };
  }

  const turn = currentTurn(state);
  const rawLeagues = isPlainRecord(rawState.leagues) ? rawState.leagues : {};
  const removedMinorIds = new Set<string>();
  const candidates: LeagueCandidate[] = [];

  for (const [recordKey, value] of Object.entries(rawLeagues)) {
    if (!isPlainRecord(value)) continue;
    const rawMemberIds = Array.isArray(value.memberIds)
      ? value.memberIds.filter((memberId): memberId is string => (
        typeof memberId === 'string' && isLivingIndependentMinor(state, memberId)
      ))
      : [];
    for (const memberId of rawMemberIds) removedMinorIds.add(memberId);

    const suffix = parseLeagueId(value.id, recordKey);
    if (suffix === null
      || typeof value.nameKey !== 'string' || !NAME_KEYS.has(value.nameKey)
      || typeof value.charter !== 'string' || !CHARTERS.has(value.charter as MinorCivLeagueCharter)
      || !isSafeIntegerInRange(value.formedTurn, 0, turn)) {
      continue;
    }

    const memberIds = [...new Set(rawMemberIds)].sort().slice(0, MINOR_CIV_LEAGUE_RULES.maxMembers);
    if (memberIds.length < MINOR_CIV_LEAGUE_RULES.minMembers || !membersAreCompatible(state, memberIds)) {
      continue;
    }

    candidates.push({
      suffix,
      league: {
        id: recordKey,
        nameKey: value.nameKey,
        charter: value.charter as MinorCivLeagueCharter,
        memberIds,
        formedTurn: value.formedTurn,
        readiness: normalizeReadiness(state, value.readiness),
      },
    });
  }

  candidates.sort((left, right) => (
    left.league.formedTurn - right.league.formedTurn
    || left.league.id.localeCompare(right.league.id)
  ));

  const acceptedMinorIds = new Set<string>();
  const usedNames = new Set<string>();
  const leagues: Record<string, MinorCivLeague> = {};
  let highestSuffix = 0;

  for (const candidate of candidates) {
    if (Object.keys(leagues).length >= MINOR_CIV_LEAGUE_RULES.maxLeagues) break;
    const memberIds = candidate.league.memberIds.filter(memberId => !acceptedMinorIds.has(memberId));
    if (memberIds.length < MINOR_CIV_LEAGUE_RULES.minMembers) continue;

    let nameKey = candidate.league.nameKey;
    if (usedNames.has(nameKey)) {
      const replacement = MINOR_CIV_LEAGUE_NAME_KEYS.find(key => !usedNames.has(key));
      if (!replacement) continue;
      nameKey = replacement;
    }

    const league: MinorCivLeague = { ...candidate.league, nameKey, memberIds };
    leagues[league.id] = league;
    highestSuffix = Math.max(highestSuffix, candidate.suffix);
    usedNames.add(nameKey);
    for (const memberId of memberIds) acceptedMinorIds.add(memberId);
  }

  const rawNextId = rawState.nextId;
  const minimumNextId = highestSuffix + 1;
  const nextId = isSafeIntegerInRange(rawNextId, minimumNextId, Number.MAX_SAFE_INTEGER)
    ? rawNextId
    : minimumNextId;
  const challenge = resolveOpponentChallenge(state);
  const interval = MINOR_CIV_LEAGUE_TIMING[challenge].checkInterval;
  const defaultNextCheckTurn = Math.max(MINOR_CIV_LEAGUE_RULES.minWorldTurn, turn + interval);
  const rawNextCheckTurn = rawState.nextCheckTurn;
  const nextCheckTurn = (
    isSafeIntegerInRange(rawNextCheckTurn, 0, Math.min(Number.MAX_SAFE_INTEGER, turn + 6))
    || rawNextCheckTurn === defaultNextCheckTurn
  ) ? rawNextCheckTurn as number : defaultNextCheckTurn;
  const rawLastProcessedTurn = rawState.lastProcessedTurn;
  const lastProcessedTurn = rawLastProcessedTurn === -1
    || isSafeIntegerInRange(rawLastProcessedTurn, 0, turn)
    ? rawLastProcessedTurn as number
    : -1;

  return {
    ...state,
    minorCivLeagues: {
      leagues,
      nextId,
      nextCheckTurn,
      lastProcessedTurn,
      eligibleAfterTurnByMinorCiv: normalizeEligibleAfterTurns(
        state,
        rawState.eligibleAfterTurnByMinorCiv,
        removedMinorIds,
        acceptedMinorIds,
      ),
    },
  };
}
