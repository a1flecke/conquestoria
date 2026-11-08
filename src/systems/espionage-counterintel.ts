import type { DetectedSpyThreat, EspionageCivState, EspionageState, GameState } from '@/core/types';
import type { DiplomacyState } from '@/core/types/diplomacy';
import type { IncidentTracedEvent, OperationIncident, OperationLandedEvent } from '@/core/types/espionage-incident';
import { modifyRelationship } from './diplomacy-state';
import { EXPOSE_SCANDAL_MAX_PARTNERS, EXPOSE_SCANDAL_PENALTY, getScandalPartnerIds } from './espionage-scandal';
import { createRng } from './map-generator';

/**
 * Counterintelligence and capture consequences (#1009): sweeps, CI scores, CI
 * buildings, capture/expel/execute transitions, spy turning, and the bilateral
 * diplomatic-history penalties a caught or expelled spy records.
 *
 * The diplomacy helpers here go through the narrow `diplomacy-state` module,
 * never the diplomacy kitchen sink (#1011).
 */
export function attemptSweep(
  state: EspionageCivState,
  spyId: string,
  seed: string,
  gameState: GameState,
): { state: EspionageCivState; detectedSpyIds: string[] } {
  const spy = state.spies[spyId];
  if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return { state, detectedSpyIds: [] };
  const rng = createRng(seed);
  const detected: string[] = [];
  const baseSweepChance = 0.40 + spy.experience * 0.003;
  for (const [otherId, otherEsp] of Object.entries(gameState.espionage ?? {})) {
    if (otherId === spy.owner) continue;
    for (const enemySpy of Object.values(otherEsp.spies)) {
      if (enemySpy.infiltrationCityId !== spy.targetCityId) continue;
      if (rng() < baseSweepChance) detected.push(enemySpy.id);
    }
  }
  const updatedState = {
    ...state,
    spies: { ...state.spies, [spyId]: { ...spy, lastSweepTurn: gameState.turn } },
  };
  return { state: updatedState, detectedSpyIds: detected };
}

// --- Diplomatic consequences ---

const EXPULSION_RELATIONSHIP_PENALTY = -15;
const CAPTURE_RELATIONSHIP_PENALTY = -40;

export function handleSpyExpelled(
  dipState: DiplomacyState,
  spyOwnerCivId: string,
  turn: number,
): DiplomacyState {
  let updated = modifyRelationship(dipState, spyOwnerCivId, EXPULSION_RELATIONSHIP_PENALTY);
  updated = {
    ...updated,
    events: [...updated.events, {
      type: 'spy_expelled',
      turn,
      otherCiv: spyOwnerCivId,
      weight: 1,
    }],
  };
  return updated;
}

export function handleSpyCaptured(
  dipState: DiplomacyState,
  spyOwnerCivId: string,
  turn: number,
): DiplomacyState {
  let updated = modifyRelationship(dipState, spyOwnerCivId, CAPTURE_RELATIONSHIP_PENALTY);
  updated = {
    ...updated,
    events: [...updated.events, {
      type: 'spy_captured',
      turn,
      otherCiv: spyOwnerCivId,
      weight: 1,
    }],
  };
  return updated;
}

export function setCounterIntelligence(
  state: EspionageCivState,
  cityId: string,
  score: number,
): EspionageCivState {
  return {
    ...state,
    counterIntelligence: {
      ...state.counterIntelligence,
      [cityId]: Math.max(0, Math.min(100, score)),
    },
  };
}

export function applyBuildingCI(
  cityId: string,
  city: { buildings: string[] },
  civEsp: EspionageCivState,
  completedTechs: string[],
): EspionageCivState {
  let ciBonus = 0;
  if (city.buildings.includes('intelligence-agency')) {
    const faded = completedTechs.includes('digital-surveillance');
    ciBonus += faded ? 10 : 20;
  }
  if (city.buildings.includes('security-bureau')) {
    const faded = completedTechs.includes('signals-intelligence');
    ciBonus += faded ? 15 : 30;
  }
  if (ciBonus === 0) return civEsp;
  const current = civEsp.counterIntelligence[cityId] ?? 0;
  return setCounterIntelligence(civEsp, cityId, current + ciBonus);
}

export function getSpyCaptureRelationshipPenalty(distanceToNearestCity: number): number {
  if (distanceToNearestCity > 5) return 0;
  if (distanceToNearestCity > 1) return -10;
  if (distanceToNearestCity === 1) return -25;
  return -50; // inside city (distance 0)
}

export function expelSpy(
  state: EspionageCivState,
  spyId: string,
  cooldownTurns: number = 15,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) return state;
  return {
    ...state,
    spies: {
      ...state.spies,
      [spyId]: {
        ...spy,
        status: 'cooldown',
        cooldownTurns,
        infiltrationCityId: null,
        cityVisionTurnsLeft: 0,
        targetCivId: null,
        targetCityId: null,
        position: null,
        currentMission: null,
        stolenTechFrom: {},
        disguiseAs: null,
      },
    },
  };
}

export function executeSpy(
  state: EspionageCivState,
  spyId: string,
): EspionageCivState {
  const { [spyId]: _removed, ...remainingSpies } = state.spies;
  return { ...state, spies: remainingSpies };
}

/**
 * Required, named roles for turning a captured spy (#1022). `captorId` and
 * `spyOwner` are both bare ids and semantically opposite, so a positional call
 * could transpose them and silently hand the spy to the wrong civilization.
 */
export interface TurnCapturedSpyCommand {
  /** The civ that holds the captured spy and turns it. */
  captorId: string;
  /** The civ the spy originally belonged to. */
  spyOwner: string;
  spyId: string;
  /** Absolute turn the turning happens on; defaults to 0 to preserve the old optional argument. */
  turn?: number;
}

export function turnCapturedSpy(
  state: EspionageState,
  command: TurnCapturedSpyCommand,
): EspionageState {
  const { captorId, spyOwner, spyId, turn = 0 } = command;
  const ownerState = state[spyOwner];
  const spy = ownerState?.spies[spyId];
  if (!ownerState || !spy) return state;
  const captorState = state[captorId];
  const detectedThreats = captorState?.detectedThreats ?? {};
  const updatedThreats = spy.targetCityId
    ? {
      ...detectedThreats,
      [spyId]: {
        cityId: spy.targetCityId,
        foreignCivId: spyOwner,
        detectedTurn: turn,
        expiresOnTurn: turn + 5,
      } satisfies DetectedSpyThreat,
    }
    : detectedThreats;

  return {
    ...state,
    [spyOwner]: {
      ...ownerState,
      spies: {
        ...ownerState.spies,
        [spyId]: {
          ...spy,
          status: 'stationed',
          currentMission: null,
          cooldownTurns: 0,
          turnedBy: captorId,
          feedsFalseIntel: true,
        },
      },
    },
    ...(captorState
      ? {
        [captorId]: {
          ...captorState,
          detectedThreats: updatedThreats,
        },
      }
      : {}),
  };
}

// --- Hostile-operation attribution (#419, PR 1) ---
export type OperationAttribution = 'unknown' | 'suspected' | 'confirmed';

/**
 * What the viewer has earned about who did this, from evidence that already exists in `GameState`:
 *  - confirmed: the viewer has an unexpired detected threat naming the actor in that city, or holds a captured spy of the
 *    actor's who was working that city;
 *  - suspected: the viewer has an embedded counter-spy in the struck city;
 *  - unknown: neither.
 * Only the target can have earned anything; never names a wrong civ.
 */
export function getOperationAttribution(
  state: GameState,
  viewerId: string,
  event: Pick<OperationLandedEvent, 'civId' | 'targetCivId' | 'cityId'>,
): OperationAttribution {
  if (viewerId !== event.targetCivId) return 'unknown';
  const viewerEsp = state.espionage?.[viewerId];
  const threats = Object.values(viewerEsp?.detectedThreats ?? {});
  if (threats.some(t => t.foreignCivId === event.civId && t.cityId === event.cityId && t.expiresOnTurn >= state.turn)) return 'confirmed';
  const actorSpies = Object.values(state.espionage?.[event.civId]?.spies ?? {});
  if (actorSpies.some(s => s.status === 'captured' && s.targetCivId === viewerId && s.targetCityId === event.cityId)) return 'confirmed';
  if (Object.values(viewerEsp?.spies ?? {}).some(s => s.status === 'embedded' && s.targetCityId === event.cityId)) return 'suspected';
  return 'unknown';
}

// --- Caught in the Act: incident ledger and "Go public" (#419, PR 2) ---

/** At most this many incidents are kept per victim; the oldest are dropped first. */
const MAX_INCIDENTS_PER_CIV = 8;

export function getIncidentId(event: Pick<OperationLandedEvent, 'civId' | 'cityId' | 'missionType'>, turn: number): string {
  return `${turn}:${event.civId}:${event.cityId ?? 'empire'}:${event.missionType}`;
}

/**
 * Remember a landed operation on the VICTIM's own record so evidence that arrives later can still be matched to it.
 * The actor is stored but never surfaced until `tracedTurn` is set. Returns a new state; idempotent per incident id.
 */
export function recordOperationIncident(state: GameState, event: OperationLandedEvent): GameState {
  const id = getIncidentId(event, state.turn);
  const victim = state.espionage?.[event.targetCivId] ?? { spies: {}, maxSpies: 0, counterIntelligence: {} };
  if (victim.attributedIncidents?.[id]) return state;
  const confirmedNow = getOperationAttribution(state, event.targetCivId, event) === 'confirmed';
  const incident: OperationIncident = {
    id, actorCivId: event.civId, targetCivId: event.targetCivId, cityId: event.cityId,
    missionType: event.missionType, landedTurn: state.turn,
    ...(confirmedNow ? { tracedTurn: state.turn } : {}),
  };
  const kept = Object.values({ ...(victim.attributedIncidents ?? {}), [id]: incident })
    .sort((a, b) => b.landedTurn - a.landedTurn || a.id.localeCompare(b.id))
    .slice(0, MAX_INCIDENTS_PER_CIV);
  return {
    ...state,
    espionage: {
      ...(state.espionage ?? {}),
      [event.targetCivId]: { ...victim, attributedIncidents: Object.fromEntries(kept.map(i => [i.id, i])) },
    },
  };
}

/**
 * Transition-owned reveal: any incident of `victimId` that has just become confirmed (a spy was caught, a threat
 * detected) is stamped with this turn and returned once. Steady-state calls return no events.
 */
export function traceOperationIncidents(
  state: GameState,
  victimId: string,
): { state: GameState; traced: IncidentTracedEvent[] } {
  const victim = state.espionage?.[victimId];
  const incidents = victim?.attributedIncidents;
  if (!victim || !incidents) return { state, traced: [] };
  const traced: IncidentTracedEvent[] = [];
  const next: Record<string, OperationIncident> = {};
  for (const incident of Object.values(incidents)) {
    const evidence = { civId: incident.actorCivId, targetCivId: victimId, cityId: incident.cityId ?? '' };
    if (incident.tracedTurn === undefined && getOperationAttribution(state, victimId, evidence) === 'confirmed') {
      next[incident.id] = { ...incident, tracedTurn: state.turn };
      traced.push({ civId: victimId, incidentId: incident.id, actorCivId: incident.actorCivId, missionType: incident.missionType, cityId: incident.cityId });
    } else {
      next[incident.id] = incident;
    }
  }
  if (traced.length === 0) return { state, traced };
  return { state: { ...state, espionage: { ...state.espionage, [victimId]: { ...victim, attributedIncidents: next } } }, traced };
}

/** Go public is available through the end of the victim's next turn after the evidence arrived. */
export function getGoPublicExpiryTurn(incident: OperationIncident): number | null {
  return incident.tracedTurn === undefined ? null : incident.tracedTurn + 1;
}

export type GoPublicDenialReason = 'not-found' | 'not-owner' | 'not-confirmed' | 'already-used' | 'expired' | 'no-partners';

export const GO_PUBLIC_DENIAL_MESSAGES: Record<GoPublicDenialReason, string> = {
  'not-found': 'There is no such incident on your record.',
  'not-owner': 'That incident was not committed against you.',
  'not-confirmed': 'You do not have proof of who was behind it yet.',
  'already-used': 'You have already gone public about this incident.',
  'expired': 'The moment has passed; the story is old news.',
  'no-partners': 'They have no treaty partners whose opinion this could change.',
};

/**
 * Public rules of the Go public response, safe to show before the player commits. Deliberately does not expose how
 * many treaties the culprit actually holds or who they are with: that would reveal unmet civilizations.
 */
export interface GoPublicPreview {
  penaltyPerPartner: number;
  maxPartners: number;
}

export function getGoPublicPreview(): GoPublicPreview {
  return {
    penaltyPerPartner: EXPOSE_SCANDAL_PENALTY,
    maxPartners: EXPOSE_SCANDAL_MAX_PARTNERS,
  };
}

/** The one eligibility source for Go public; the panel's offer and the executor both ask it. */
export function getGoPublicDenial(state: GameState, victimId: string, incidentId: string): GoPublicDenialReason | null {
  const incident = state.espionage?.[victimId]?.attributedIncidents?.[incidentId];
  if (!incident) return 'not-found';
  if (incident.targetCivId !== victimId) return 'not-owner';
  if (incident.usedTurn !== undefined) return 'already-used';
  const expiry = getGoPublicExpiryTurn(incident);
  if (expiry === null) return 'not-confirmed';
  if (state.turn > expiry) return 'expired';
  if (getScandalPartnerIds(state, incident.actorCivId, victimId).length === 0) return 'no-partners';
  return null;
}

export type GoPublicResult =
  | { ok: true; state: GameState; culpritCivId: string; partnerCivIds: string[]; missionType: OperationIncident['missionType'] }
  | { ok: false; reason: GoPublicDenialReason };

/**
 * Tell the world who struck you. Reuses expose_scandal's penalty and partner cap exactly (no new numbers), once per
 * confirmed incident. Re-checks `getGoPublicDenial` before its first write. Human and AI use this same function.
 */
export function goPublicAboutIncident(state: GameState, victimId: string, incidentId: string): GoPublicResult {
  const denial = getGoPublicDenial(state, victimId, incidentId);
  if (denial) return { ok: false, reason: denial };
  const victim = state.espionage![victimId];
  const incident = victim.attributedIncidents![incidentId];
  const partnerCivIds = getScandalPartnerIds(state, incident.actorCivId, victimId);
  const civilizations = { ...state.civilizations };
  for (const partnerId of partnerCivIds) {
    civilizations[incident.actorCivId] = {
      ...civilizations[incident.actorCivId],
      diplomacy: modifyRelationship(civilizations[incident.actorCivId].diplomacy, partnerId, EXPOSE_SCANDAL_PENALTY),
    };
    civilizations[partnerId] = {
      ...civilizations[partnerId],
      diplomacy: modifyRelationship(civilizations[partnerId].diplomacy, incident.actorCivId, EXPOSE_SCANDAL_PENALTY),
    };
  }
  return {
    ok: true,
    culpritCivId: incident.actorCivId,
    partnerCivIds,
    missionType: incident.missionType,
    state: {
      ...state,
      civilizations,
      espionage: {
        ...state.espionage,
        [victimId]: {
          ...victim,
          attributedIncidents: { ...victim.attributedIncidents, [incidentId]: { ...incident, usedTurn: state.turn } },
        },
      },
    },
  };
}
