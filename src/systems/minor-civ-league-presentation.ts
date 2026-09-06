import type { GameState } from '@/core/types';
import { MINOR_CIV_LEAGUE_CHARTERS } from './minor-civ-league-definitions';
import { getMinorCivLeagueForMember } from './minor-civ-league-system';
import { getMinorCivPresentationForPlayer } from './minor-civ-presentation';

export interface MinorCivLeaguePresentation {
  name: string;
  charterLabel: string;
  summary: string;
  readinessLabel: string;
  knownMembers: Array<{ minorCivId: string; name: string; color: string; connectedDetail: string | null }>;
  hasUnknownMembers: boolean;
}

function presentationForLeague(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivLeaguePresentation | null {
  const league = getMinorCivLeagueForMember(state, minorCivId);
  if (!league) return null;
  const requested = getMinorCivPresentationForPlayer(state, viewerCivId, minorCivId);
  if (!requested.known) return null;
  const knownMembers = league.memberIds.flatMap(memberId => {
    const member = getMinorCivPresentationForPlayer(state, viewerCivId, memberId);
    return member.known ? [{ minorCivId: memberId, name: member.name, color: member.color, connectedDetail: null }] : [];
  });
  const charter = MINOR_CIV_LEAGUE_CHARTERS[league.charter];
  return {
    name: `${league.nameKey[0].toUpperCase()}${league.nameKey.slice(1)} Compact`,
    charterLabel: `${charter.label} charter`,
    summary: charter.purpose,
    readinessLabel: league.readiness.kind === 'quiet' ? 'Quiet' : 'Concern reported',
    knownMembers,
    hasUnknownMembers: knownMembers.length < league.memberIds.length,
  };
}

export function getMinorCivLeaguePresentationForPlayer(
  state: GameState,
  viewerCivId: string,
  minorCivId: string,
): MinorCivLeaguePresentation | null {
  return presentationForLeague(state, viewerCivId, minorCivId);
}

export function getMinorCivLeaguesForPlayer(
  state: GameState,
  viewerCivId: string,
): MinorCivLeaguePresentation[] {
  const seen = new Set<string>();
  return Object.keys(state.minorCivs).sort().flatMap(minorCivId => {
    const league = getMinorCivLeagueForMember(state, minorCivId);
    if (!league || seen.has(league.id)) return [];
    seen.add(league.id);
    const presentation = presentationForLeague(state, viewerCivId, minorCivId);
    return presentation ? [presentation] : [];
  });
}
