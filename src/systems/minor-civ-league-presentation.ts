import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { MINOR_CIV_LEAGUE_CHARTERS } from './minor-civ-league-definitions';
import { getMinorCivLeagueForMember, getMinorCivLeaguePreference } from './minor-civ-league-system';
import { evaluateMinorCivEconomyPosture } from './minor-civ-economy-system';
import { isMinorCivAtWar } from './minor-civ-diplomacy';
import { getMinorCivPresentationForPlayer } from './minor-civ-presentation';
import { isMinorCivAllianceActive } from './quest-chain-system';

export interface MinorCivLeaguePresentation {
  name: string;
  charterLabel: string;
  summary: string;
  readinessLabel: string;
  knownMembers: Array<{ minorCivId: string; name: string; color: string; connectedDetail: string | null }>;
  hasUnknownMembers: boolean;
}

export interface MinorCivLeagueNotice {
  recipientCivId: string;
  message: string;
  type: 'info' | 'warning' | 'success';
}

type PublicReadinessPhase = 'quiet' | 'warning' | 'preparing' | 'cooling';

interface PublicLeagueFacts {
  name: string;
  readiness: PublicReadinessPhase;
  knownMemberNames: string[];
  hasUnknownMembers: boolean;
}

function publicReadinessPhase(readinessLabel: string): PublicReadinessPhase {
  if (readinessLabel === 'Preparing local defenses') return 'preparing';
  if (readinessLabel === 'Concern reported') return 'warning';
  if (readinessLabel === 'Tensions easing') return 'cooling';
  return 'quiet';
}

function getPublicLeagueFacts(state: GameState, viewerCivId: string): Map<string, PublicLeagueFacts> {
  return new Map(getMinorCivLeaguesForPlayer(state, viewerCivId).map(presentation => [presentation.name, {
    name: presentation.name,
    readiness: publicReadinessPhase(presentation.readinessLabel),
    knownMemberNames: presentation.knownMembers.map(member => member.name).sort(),
    hasUnknownMembers: presentation.hasUnknownMembers,
  }]));
}

function sameMembers(left: PublicLeagueFacts, right: PublicLeagueFacts): boolean {
  return left.hasUnknownMembers === right.hasUnknownMembers
    && left.knownMemberNames.length === right.knownMemberNames.length
    && left.knownMemberNames.every((member, index) => member === right.knownMemberNames[index]);
}

function readinessNotice(name: string, readiness: PublicReadinessPhase): MinorCivLeagueNotice['message'] | null {
  if (readiness === 'warning') return `${name}: a member reports regional tension.`;
  if (readiness === 'preparing') return `${name}: members may prepare local defenses.`;
  if (readiness === 'cooling') return `${name}: tensions are easing; members choose normal local investments.`;
  return null;
}

/** Produces one recipient-safe notice per changed compact without exposing raw state. */
export function collectMinorCivLeagueNotices(
  before: GameState,
  after: GameState,
): MinorCivLeagueNotice[] {
  const notices: MinorCivLeagueNotice[] = [];
  for (const viewerCivId of Object.keys(after.civilizations).sort()) {
    const beforeFacts = getPublicLeagueFacts(before, viewerCivId);
    const afterFacts = getPublicLeagueFacts(after, viewerCivId);
    for (const [name, next] of afterFacts) {
      const previous = beforeFacts.get(name);
      if (!previous) continue; // Contact/formation is explained by the live panel, never a ceremony toast.
      if (previous.readiness !== next.readiness) {
        const message = readinessNotice(name, next.readiness);
        if (message) notices.push({ recipientCivId: viewerCivId, message, type: next.readiness === 'preparing' ? 'warning' : 'info' });
      } else if (!sameMembers(previous, next)) {
        notices.push({ recipientCivId: viewerCivId, message: `${name}: its known membership has changed.`, type: 'info' });
      }
    }
    for (const [name] of beforeFacts) {
      if (!afterFacts.has(name)) {
        notices.push({ recipientCivId: viewerCivId, message: `${name}: it is no longer available through your current city-state contacts.`, type: 'info' });
      }
    }
  }
  return notices;
}

export function emitMinorCivLeagueNotices(before: GameState, after: GameState, bus: EventBus): void {
  const notices = collectMinorCivLeagueNotices(before, after);
  if (notices.length > 0) bus.emit('minor-civ:league-changed', { happenedTurn: before.turn, notices });
}

function connectedDetailForMember(state: GameState, viewerCivId: string, minorCivId: string): string | null {
  const member = state.minorCivs[minorCivId];
  if (!member || member.isDestroyed) return null;
  const hasAlliance = isMinorCivAllianceActive(state, viewerCivId, minorCivId);
  const hasValidRoute = (state.marketplace?.tradeRoutes ?? []).some(route => {
    const fromCity = state.cities[route.fromCityId];
    const toCity = state.cities[route.toCityId];
    return fromCity?.owner === viewerCivId
      && toCity?.id === member.cityId
      && toCity.owner === minorCivId
      && route.foreignCivId === minorCivId
      && !isMinorCivAtWar(state, viewerCivId, minorCivId)
      && (member.diplomacy.relationships[viewerCivId] ?? 0) >= -25;
  });
  if (!hasAlliance && !hasValidRoute) return null;

  const preference = getMinorCivLeaguePreference(
    state,
    minorCivId,
    evaluateMinorCivEconomyPosture(state, minorCivId),
  );
  if (preference.kind === 'defense') return 'Local priority: defense';
  if (preference.kind === 'commerce') return 'Local priority: trade buildings';
  if (preference.reason === 'warning') return 'Waiting through the warning period';
  return 'Their own needs take priority';
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
    return member.known ? [{
      minorCivId: memberId,
      name: member.name,
      color: member.color,
      connectedDetail: connectedDetailForMember(state, viewerCivId, memberId),
    }] : [];
  });
  const charter = MINOR_CIV_LEAGUE_CHARTERS[league.charter];
  const readinessLabel = league.readiness.kind === 'quiet'
    ? 'Quiet'
    : league.readiness.kind === 'cooling'
      ? 'Tensions easing'
      : league.memberIds.some(memberId => getMinorCivLeaguePreference(state, memberId, 'settled').kind === 'defense')
        ? 'Preparing local defenses'
        : 'Concern reported';
  return {
    name: `${league.nameKey[0].toUpperCase()}${league.nameKey.slice(1)} Compact`,
    charterLabel: `${charter.label} charter`,
    summary: charter.purpose,
    readinessLabel,
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
    const presentation = presentationForLeague(state, viewerCivId, minorCivId);
    if (!presentation) return [];
    seen.add(league.id);
    return [presentation];
  });
}
