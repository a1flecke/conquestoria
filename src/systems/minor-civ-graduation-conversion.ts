import type { ChainTransition } from '@/systems/quest-chain-system';
import type { Civilization, GameState } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { hasDiscoveredMinorCiv, recordCivilizationContact } from '@/systems/discovery-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { getMinorCivCompletedTechBand } from '@/systems/minor-civ-economy-system';
import { evaluateMinorCivGraduationEligibility, countGraduatedCivilizations } from '@/systems/minor-civ-graduation';
import {
  GRADUATION_MAX_PER_GAME,
  type MinorCivGraduationIneligibleReason,
} from '@/systems/minor-civ-graduation-rules';
import { reconcileMinorCivLeagues } from '@/systems/minor-civ-league-system';
import { createTechState } from '@/systems/tech-system';

/**
 * City-state graduation (#497), the conversion. One city-state becomes a major civilization in a single
 * step: either every write below happens on a clone and the new state is returned, or nothing changes and a
 * typed denial is returned. Nothing here decides *whether* a city-state should graduate (that is the
 * planner's call) or announces it (the caller emits events from the returned transition). Its one caller is the
 * `minor-civ-graduation` round phase, pinned by `minor-civ-graduation-conversion-has-one-live-caller`.
 *
 * What moves: the city (and its tiles), every living garrison unit (re-owned, never removed or recreated, so
 * no tile's occupancy changes). What is dropped: quests, alliances, regional grievances, coalition membership,
 * league membership, the minor-civ economy record. What the new civilization starts with: exactly the
 * technology the city-state already built with (no windfall), no gold, no research, and a relationship entry
 * with every other civilization, and contact with exactly the majors that had discovered the city-state. A city-state
 * at war never graduates (the evaluator's `at-war` gate), so no war needs carrying over; every stale reference to the
 * old id in a war list is scrubbed anyway. Treaties (a city-state has none) and presentation are later PRs.
 */

export type MinorCivGraduationDenial =
  | MinorCivGraduationIneligibleReason
  | 'graduation-cap-reached'
  | 'civ-id-taken';

export interface MinorCivGraduationTransition {
  minorCivId: string;
  civId: string;
  definitionId: string;
  turn: number;
  /** Alliances the graduating city-state held; each ended with the city-state's independence. */
  allianceTransitions: ChainTransition[];
  /** The garrison and any other living units, by id, that changed owner. */
  transferredUnitIds: string[];
}

export type MinorCivGraduationResult =
  | { ok: true; state: GameState; transition: MinorCivGraduationTransition }
  | { ok: false; reason: MinorCivGraduationDenial };

export const GRADUATION_DENIAL_MESSAGES: Readonly<Record<MinorCivGraduationDenial, string>> = {
  'missing-minor-civ': 'That city-state does not exist.',
  destroyed: 'That city-state has already been conquered or has already graduated.',
  'unknown-definition': 'That city-state has no known definition.',
  'city-missing': 'That city-state no longer has a city.',
  'city-not-owned': 'That city-state no longer owns its city.',
  'age-unknown': 'The founding date of that city-state is not recorded.',
  'too-young': 'That city-state is too young to graduate.',
  'population-below-threshold': 'That city-state has not grown enough to graduate.',
  'too-few-buildings': 'That city-state has not built enough to graduate.',
  'at-war': 'A city-state at war cannot graduate.',
  'coalition-member': 'A city-state in a coalition cannot graduate.',
  'under-threat': 'A city-state under threat cannot graduate.',
  'league-mobilized': 'A city-state whose compact is preparing for a threat cannot graduate.',
  'graduation-cap-reached': 'No more city-states can graduate in this campaign.',
  'civ-id-taken': 'The civilization that city-state would become already exists.',
};

/** The id a graduated city-state's civilization gets. Unprefixed, so it classifies as a major civilization. */
export function getGraduateCivId(definitionId: string): string {
  return `grad-${definitionId}`;
}

function relationshipFor(state: GameState, minorCivId: string, otherCivId: string): number {
  const value = state.minorCivs[minorCivId]?.diplomacy.relationships[otherCivId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Convert one eligible city-state into a major civilization. Preconditions are re-checked here, before the
 * first write, from the same evaluator the planner uses, so a caller cannot graduate a city-state the planner
 * would refuse. The input state is never modified.
 */
export function graduateMinorCiv(state: GameState, minorCivId: string): MinorCivGraduationResult {
  const evaluation = evaluateMinorCivGraduationEligibility(state, minorCivId);
  if (!evaluation.eligible) return { ok: false, reason: evaluation.reason };
  if (countGraduatedCivilizations(state) >= GRADUATION_MAX_PER_GAME) return { ok: false, reason: 'graduation-cap-reached' };

  const minorCiv = state.minorCivs[minorCivId]!;
  const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minorCiv.definitionId)!;
  const civId = getGraduateCivId(definition.id);
  if (state.civilizations[civId] || state.minorCivs[minorCivId]?.graduation) return { ok: false, reason: 'civ-id-taken' };

  const next = structuredClone(state);
  const mc = next.minorCivs[minorCivId]!;
  const city = next.cities[mc.cityId]!;

  const allianceTransitions: ChainTransition[] = [];
  for (const [majorCivId, status] of Object.entries(mc.chainStatusByCiv)) {
    if (status.status === 'allied') {
      allianceTransitions.push({ type: 'alliance-broken', majorCivId, minorCivId, chainId: status.chainId });
    }
  }

  const transferredUnitIds = mc.units.filter(unitId => next.units[unitId] !== undefined);
  for (const unitId of transferredUnitIds) next.units[unitId]!.owner = civId;

  city.owner = civId;
  for (const coord of city.ownedTiles) {
    const tile = next.map.tiles[`${coord.q},${coord.r}`];
    if (tile && tile.owner === minorCivId) tile.owner = civId;
  }

  // The city-state's own bookkeeping becomes history: independent in name only, holding nothing.
  mc.isDestroyed = true;
  mc.graduation = { turn: state.turn, civId };
  mc.units = [];
  mc.activeQuests = {};
  mc.chainStatusByCiv = {};
  mc.questCooldownUntilByCiv = {};
  mc.lastNotifiedStatusByCiv = {};
  delete mc.regionalGrievanceByCiv;
  delete mc.economy;

  for (const [coalitionId, coalition] of Object.entries(next.minorCivCoalitions ?? {})) {
    if (!coalition.memberIds.includes(minorCivId)) continue;
    const memberIds = coalition.memberIds.filter(memberId => memberId !== minorCivId);
    if (memberIds.length === 0) delete next.minorCivCoalitions![coalitionId];
    else next.minorCivCoalitions![coalitionId] = { ...coalition, memberIds };
  }

  const otherCivIds = Object.keys(next.civilizations);
  const diplomacy = createDiplomacyState([...otherCivIds, civId], civId, 0);
  for (const otherId of otherCivIds) {
    const value = relationshipFor(state, minorCivId, otherId);
    diplomacy.relationships[otherId] = value;
    const other = next.civilizations[otherId]!;
    other.diplomacy.relationships[civId] = value;
    // A war with the city-state ends with its independence; carrying it over is a later PR (#497 PR 4).
    other.diplomacy.atWarWith = other.diplomacy.atWarWith.filter(id => id !== minorCivId);
  }

  const techState = createTechState();
  techState.completed = getMinorCivCompletedTechBand(state, minorCivId);
  const civilization: Civilization = {
    id: civId,
    name: definition.name,
    color: definition.color,
    isHuman: false,
    civType: 'generic',
    cities: [mc.cityId],
    units: transferredUnitIds,
    techState,
    gold: 0,
    visibility: { tiles: {}, lastSeen: {} },
    score: 0,
    diplomacy,
    graduatedFrom: { minorCivId, definitionId: definition.id, turn: state.turn },
  };
  next.civilizations[civId] = civilization;

  // First contact (#497 PR 4): a living major that had already discovered the city-state keeps knowing it under
  // its new identity, in both directions, and nobody else gains contact from the change. Judged on the state
  // BEFORE conversion, because discovery is defined for a living city-state; later contact comes from sight, as
  // for any civilization. Recorded without a first-contact event: those civilizations already knew the place, and
  // telling them who it became is the presentation PR's job.
  for (const [otherId, other] of Object.entries(state.civilizations)) {
    if (other.isEliminated) continue;
    if (hasDiscoveredMinorCiv(state, otherId, minorCivId)) recordCivilizationContact(next, civId, otherId);
  }

  return {
    ok: true,
    state: reconcileMinorCivLeagues(next),
    transition: {
      minorCivId,
      civId,
      definitionId: definition.id,
      turn: state.turn,
      allianceTransitions,
      transferredUnitIds,
    },
  };
}
