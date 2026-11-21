import type { EventBus } from '@/core/event-bus';
import type { GameState, PersonalityTraits, MinorCivState } from '@/core/types';
import type { DiplomacyState, DiplomaticAction, WarGoalStatus } from '@/core/types/diplomacy';
import type { CivilizationEra } from '@/systems/era-types';
import { getRelationship, isAtWar } from '@/systems/diplomacy-queries';
import { getAvailableActions } from '@/systems/diplomacy-system';
import { canOfferVassalage } from '@/systems/diplomacy-vassal-rules';
import { shouldDeclareWar } from './ai-personality';
import type { NationalIntentPosture } from './ai-national-intent-posture';
import type { MilitaryStrengthEstimate } from '@/systems/diplomatic-strength';
import { hasDiscoveredMinorCiv } from '@/systems/discovery-system';
import { isMinorCivAtWar } from '@/systems/minor-civ-diplomacy';
import { performMinorCivFestival, performMinorCivGift, setMinorCivWarState } from '@/systems/minor-civ-actions';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { getAiCrisisRemedyReserve } from './ai-crisis-response';
import { hasAICombatRole } from './ai-unit-roles';
import { classifyOwner, majorCivWarOpponentIds } from '@/core/owner-kind';
import { mapDistance } from '@/systems/hex-utils';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';

export interface DiplomaticDecision {
  action: DiplomaticAction;
  targetCiv: string;
}

export interface DiplomaticContext {
  hasMet: boolean;
  hasBorderPressure: boolean;
  // #545 MR5: does this civ know the potential war target has strategic
  // (nuclear) capability -- see hasKnownStrategicCapability.
  targetHasKnownStrategicCapability: boolean;
  /**
   * #870: this civ can currently SEE a border it shares with the target (an owned tile of
   * each side adjacent, both on tiles this civ has in view). Built from the civ's own
   * visibility only -- never from hidden ownership. Open Borders is passage (#871), so it
   * has a real use exactly where two territories touch. Absent = not known to share one.
   */
  sharesKnownBorder?: boolean;
}

/**
 * Minimum relationship for the AI to PROPOSE Open Borders. Deliberately above the target's
 * own consent floor (`evaluateTreatyConsent`: relationship > 20) so a proposal is one the
 * target will usually accept rather than a request spammed against refusal. Not tiered by
 * difficulty: legality and thresholds are identical for Explorer / Standard / Veteran.
 */
export const OPEN_BORDERS_PROPOSAL_MIN_RELATIONSHIP = 25;

/**
 * `civilizationEra` must be the acting civ's own `resolveCivilizationEra(...)`
 * result, never `state.era` (World Age -- the era a *majority* of living civs
 * has reached). #1027: `basic-ai.ts` used to pass World Age here, which could
 * let a laggard AI propose treaties an equally-behind human could not.
 */
export function evaluateDiplomacy(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  completedTechs: string[],
  civilizationEra: CivilizationEra,
  militaryStrengths: Record<string, MilitaryStrengthEstimate>,
  selfStrength: MilitaryStrengthEstimate,
  currentTurn: number,
  contextByCiv: Record<string, DiplomaticContext>,
  strategicDeterrenceCautionWeight: number,
  hasArmsControlTreaty: boolean,
  actorHasKnownCapability: boolean,
  posture: NationalIntentPosture,
  /** #988: this civ's own war-goal status against each opponent it holds a
   * goal for (absent/'none' means "no declared goal" -- keeps every existing
   * caller's legacy relationship-only peace-seeking exactly unchanged). Only
   * `getWarGoalStatus`'s pure result belongs here -- never derive it locally. */
  warGoalStatusByCiv: Record<string, WarGoalStatus> = {},
): DiplomaticDecision[] {
  const decisions: DiplomaticDecision[] = [];

  for (const civId of Object.keys(diplomacy.relationships)) {
    const actions = getAvailableActions(diplomacy, civId, { completedTechs, civilizationEra, hasArmsControlTreaty });
    const relationship = getRelationship(diplomacy, civId);
    const theirStrength = militaryStrengths[civId]?.midpoint ?? 0;
    const ownStrength = selfStrength.midpoint;
    const advantage = ownStrength > 0 && theirStrength > 0
      ? ownStrength / theirStrength
      : 1;

    if (isAtWar(diplomacy, civId)) {
      const goalStatus = warGoalStatusByCiv[civId] ?? 'none';
      const outmatched = advantage < 0.7;
      // A declared goal that is still actively being pursued (and not losing)
      // means "keep fighting" -- the AI stops suing for peace on relationship
      // alone the instant it has something real to fight for (#988). With no
      // declared goal, the legacy relationship-only heuristic is unchanged.
      const seeksPeace = goalStatus === 'none'
        ? (outmatched || relationship > -20)
        : (goalStatus !== 'active' || outmatched);
      if (seeksPeace) {
        decisions.push({ action: 'request_peace', targetCiv: civId });
      }
    } else {
      const context = contextByCiv[civId]
        ?? { hasMet: false, hasBorderPressure: false, targetHasKnownStrategicCapability: false };
      if (!context.hasMet) continue;
      if (actions.includes('declare_war') && shouldDeclareWar(
        personality,
        relationship,
        advantage,
        currentTurn,
        context.hasMet,
        context.hasBorderPressure,
        context.targetHasKnownStrategicCapability,
        strategicDeterrenceCautionWeight,
        posture,
      )) {
        decisions.push({ action: 'declare_war', targetCiv: civId });
        continue;
      }

      if (actions.includes('alliance') && relationship > 50) {
        decisions.push({ action: 'alliance', targetCiv: civId });
      } else if (actions.includes('trade_agreement') && relationship > 10) {
        decisions.push({ action: 'trade_agreement', targetCiv: civId });
      } else if (actions.includes('non_aggression_pact') && relationship > 0 && personality.diplomacyFocus + posture.diplomaticOpennessBias > 0.4) {
        decisions.push({ action: 'non_aggression_pact', targetCiv: civId });
      }

      // #870: Open Borders is real passage now (#871: closed borders stop armed land units), so
      // an AI whose territory visibly touches this civ's proposes it -- bounded to a border it
      // can see, a friendly-enough relationship, and not on top of an alliance proposal (which
      // already includes passage). Consent stays the target's own decision.
      if (
        actions.includes('open_borders')
        && context.sharesKnownBorder === true
        && relationship > OPEN_BORDERS_PROPOSAL_MIN_RELATIONSHIP
        && !decisions.some(decision => decision.targetCiv === civId && decision.action === 'alliance')
      ) {
        decisions.push({ action: 'open_borders', targetCiv: civId });
      }

      // #545 MR6 spec §12: a separate, independent condition -- not part of
      // the else-if chain above, since a civ can reasonably want both an
      // alliance and an arms-control pact with the same target. Same
      // relationship/diplomacyFocus bar as non_aggression_pact (spec's own
      // "a similar...bar" framing), plus two capability checks: the actor's
      // own known capability (self-evident, no visibility gate) and the
      // target's known capability (MR5's hasKnownStrategicCapability, via
      // the already-threaded DiplomaticContext field).
      if (
        actions.includes('arms_control_pact')
        && relationship > 0 && personality.diplomacyFocus + posture.diplomaticOpennessBias > 0.4
        && actorHasKnownCapability
        && context.targetHasKnownStrategicCapability
      ) {
        decisions.push({ action: 'arms_control_pact', targetCiv: civId });
      }
    }
  }

  return decisions;
}

export interface MinorCivDecision {
  mcId: string;
  action: 'gift_gold';
}

export function evaluateMinorCivDiplomacy(
  personality: PersonalityTraits,
  minorCivs: Record<string, MinorCivState>,
  civId: string,
  gold: number,
  posture: NationalIntentPosture,
): MinorCivDecision[] {
  const decisions: MinorCivDecision[] = [];
  const GIFT_COST = 25;

  for (const [mcId, mc] of Object.entries(minorCivs)) {
    if (mc.isDestroyed) continue;

    const rel = mc.diplomacy.relationships[civId] ?? 0;

    // Diplomatic AIs gift gold to improve relations
    if (personality.diplomacyFocus + posture.diplomaticOpennessBias > 0.4 && rel < 40 && gold >= GIFT_COST) {
      decisions.push({ mcId, action: 'gift_gold' });
    }
  }

  return decisions;
}

/** `warLikelihood` plus the posture's war bias a civ needs before it will attack a city-state. */
export const CITY_STATE_CONQUEST_AGGRESSION = 0.7;
/** The city-state must lie within this many tiles of one of the civ's own cities. */
export const CITY_STATE_CONQUEST_RADIUS = 8;
/** Land combat units the civ must field before it starts such a war. */
export const CITY_STATE_CONQUEST_MIN_ARMY = 4;
/** No city-state wars in the first era: a young city-state would be gone before the game began. */
const CITY_STATE_CONQUEST_MIN_ERA = 2;
/** A city-state that likes the civ this much is a friend, not a target. */
const CITY_STATE_CONQUEST_MAX_RELATIONSHIP = 30;

/**
 * Whether a civ wants to conquer this city-state now. Personality and posture decide the appetite (only a
 * warlike civ, or one set on domination, has it); the rest is opportunity, judged only from what the civ
 * itself knows: a discovered city-state, near one of its cities, not an ally or friend, while the civ is at
 * peace with every major civilization and fields an army. The same test keeps a war going, so a war the AI
 * starts is not undone the next turn while the reasons for it still hold.
 */
export function wantsCityStateConquest(
  state: GameState,
  civId: string,
  minorCivId: string,
  personality: PersonalityTraits,
  posture: NationalIntentPosture,
): boolean {
  const civ = state.civilizations[civId];
  const minorCiv = state.minorCivs?.[minorCivId];
  const target = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!civ || civ.isHuman || !minorCiv || minorCiv.isDestroyed || !target) return false;
  if (personality.warLikelihood + posture.warDeclarationBias < CITY_STATE_CONQUEST_AGGRESSION) return false;
  if (resolveCivilizationEra(civ.techState.completed) < CITY_STATE_CONQUEST_MIN_ERA) return false;
  if (majorCivWarOpponentIds(civ.diplomacy.atWarWith).length > 0) return false;
  if (!hasDiscoveredMinorCiv(state, civId, minorCivId)) return false;
  if (minorCiv.chainStatusByCiv?.[civId]?.status === 'allied') return false;
  if ((minorCiv.diplomacy.relationships[civId] ?? 0) > CITY_STATE_CONQUEST_MAX_RELATIONSHIP) return false;
  const near = civ.cities.some(cityId => {
    const city = state.cities[cityId];
    return city?.owner === civId && mapDistance(state.map, city.position, target.position) <= CITY_STATE_CONQUEST_RADIUS;
  });
  if (!near) return false;
  const army = civ.units.filter(unitId => {
    const unit = state.units[unitId];
    return unit?.owner === civId && !unit.transportId && hasAICombatRole(unit.type)
      && (UNIT_DEFINITIONS[unit.type]?.domain ?? 'land') === 'land';
  }).length;
  return army >= CITY_STATE_CONQUEST_MIN_ARMY;
}

/**
 * Declares war on the nearest city-state the civ wants to conquer, one city-state war at a time, through
 * `setMinorCivWarState` (the player's own command). Its capture plans then treat the city as a target.
 */
export function applyAiCityStateWar(
  state: GameState,
  civId: string,
  personality: PersonalityTraits,
  posture: NationalIntentPosture,
  bus: EventBus,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.diplomacy.atWarWith.some(id => classifyOwner(id) === 'minor')) return state;
  const distanceTo = (minorCivId: string): number => {
    const target = state.cities[state.minorCivs[minorCivId].cityId];
    return Math.min(...civ.cities.map(cityId => state.cities[cityId])
      .filter(city => city?.owner === civId)
      .map(city => mapDistance(state.map, city!.position, target.position)));
  };
  const targetId = Object.keys(state.minorCivs ?? {})
    .filter(minorCivId => wantsCityStateConquest(state, civId, minorCivId, personality, posture))
    .sort((a, b) => distanceTo(a) - distanceTo(b) || a.localeCompare(b))[0];
  if (!targetId) return state;
  const result = setMinorCivWarState(state, civId, targetId, true, bus);
  return result.ok ? result.state : state;
}

/**
 * Ends the civ's wars with city-states it no longer wants: those its current plan is not fighting
 * (`keepWarWith`) and it would not start today (`wantsCityStateConquest`). A war declared on the AI by a
 * coalition, or one dragged in as a vassal, used to last the rest of the game: only the player could end
 * one. Peace goes through `setMinorCivWarState`, the player's own command, which refuses a vassal.
 */
export function applyAiMinorCivPeace(
  state: GameState,
  civId: string,
  keepWarWith: ReadonlySet<string>,
  bus: EventBus,
  personality?: PersonalityTraits,
  posture?: NationalIntentPosture,
): GameState {
  let next = state;
  for (const minorCivId of Object.keys(next.minorCivs ?? {}).sort()) {
    if (keepWarWith.has(minorCivId) || !isMinorCivAtWar(next, civId, minorCivId)) continue;
    if (personality && posture && wantsCityStateConquest(next, civId, minorCivId, personality, posture)) continue;
    const result = setMinorCivWarState(next, civId, minorCivId, false, bus);
    if (result.ok) next = result.state;
  }
  return next;
}

/**
 * A major AI's gold spending on city-states: paying their gift and festival quests, then discretionary
 * gifts. Every payment goes through the action the player's buttons use (`performMinorCivGift`,
 * `performMinorCivFestival`), which re-checks legality and the treasury.
 *
 * Neither kind of payment may dip into the gold the civ is saving to cure its own outbreak or famine
 * (`getAiCrisisRemedyReserve`). A quarantined outbreak halves every yield of its city until it is
 * cured, so a city-state's request waits until the cure is paid for.
 */
function keepsCureReserve(next: GameState, civId: string, reserve: number): boolean {
  return next.civilizations[civId].gold >= reserve;
}

/** Pays the civ's assigned city-state gift and festival quests, in a stable order. */
export function applyAiMinorCivQuestPayments(state: GameState, civId: string, bus: EventBus): GameState {
  const reserve = getAiCrisisRemedyReserve(state, civId);
  let next = state;
  for (const minorCivId of Object.keys(next.minorCivs ?? {}).sort()) {
    const quest = next.minorCivs[minorCivId].activeQuests[civId];
    const action = quest?.target.type === 'gift_gold'
      ? performMinorCivGift(next, civId, minorCivId)
      : quest?.target.type === 'sponsor_festival'
        ? performMinorCivFestival(next, civId, minorCivId)
        : null;
    if (!action?.ok || !keepsCureReserve(action.state, civId, reserve)) continue;
    next = action.state;
    emitMinorCivQuestTransitions(bus, action.transitions, next);
  }
  return next;
}

/**
 * Discretionary gold gifts. The AI may only consider a city-state it has discovered (the same fact that
 * puts it in the player's diplomacy panel) and is not at war with. A city-state with an active
 * `gift_gold` quest is left to `applyAiMinorCivQuestPayments`, which pays the quest's own amount.
 */
export function applyAiMinorCivGifts(
  state: GameState,
  civId: string,
  personality: PersonalityTraits,
  posture: NationalIntentPosture,
): GameState {
  const candidates: Record<string, MinorCivState> = {};
  for (const minorCivId of Object.keys(state.minorCivs ?? {}).sort()) {
    const minorCiv = state.minorCivs[minorCivId];
    if (minorCiv.activeQuests[civId]?.target.type === 'gift_gold') continue;
    if (!hasDiscoveredMinorCiv(state, civId, minorCivId)) continue;
    if (isMinorCivAtWar(state, civId, minorCivId)) continue;
    candidates[minorCivId] = minorCiv;
  }

  const reserve = getAiCrisisRemedyReserve(state, civId);
  const decisions = evaluateMinorCivDiplomacy(
    personality, candidates, civId, state.civilizations[civId].gold, posture,
  );
  let next = state;
  for (const decision of decisions) {
    if (decision.action !== 'gift_gold') continue;
    const result = performMinorCivGift(next, civId, decision.mcId);
    if (result.ok && keepsCureReserve(result.state, civId, reserve)) next = result.state;
  }
  return next;
}

// #901: `evaluateProposal` used to live here -- a per-treaty acceptance policy
// with zero callers anywhere in src/ (the bug this issue tracked). Its logic
// now lives, wired in and extended to arms control + peace, in
// `evaluateTreatyConsent` / `evaluatePeaceConsent`
// (`src/ai/ai-treaty-consent.ts`), invoked by `proposeTreatyAgreement`.

/**
 * `civilizationEra` must be the acting civ's own `resolveCivilizationEra(...)` result, never
 * World Age. #1087: the strength-ratio acceptance test is the correct place for `posture`,
 * not raw personality traits -- this used to take an unused `personality` parameter (a real
 * Phase-0-audit finding: vassalage-seeking had zero personality/intent differentiation).
 */
export function evaluateVassalage(
  diplomacy: DiplomacyState,
  civilizationEra: CivilizationEra,
  selfStrength: MilitaryStrengthEstimate,
  currentCities: number,
  currentMilitary: number,
  otherStrengths: Record<string, MilitaryStrengthEstimate>,
  posture: NationalIntentPosture,
): DiplomaticDecision | null {
  if (!canOfferVassalage(
    currentCities, diplomacy.vassalage.peakCities,
    currentMilitary, diplomacy.vassalage.peakMilitary, civilizationEra,
  )) return null;

  // Find strongest non-enemy civ
  let bestTarget: string | null = null;
  let bestStrength = 0;
  for (const [civId, estimate] of Object.entries(otherStrengths)) {
    if (diplomacy.atWarWith.includes(civId)) continue;
    const strength = estimate.midpoint;
    if (strength > bestStrength) {
      bestStrength = strength;
      bestTarget = civId;
    }
  }

  if (bestTarget && selfStrength.midpoint < bestStrength * (0.4 + posture.vassalageSeekingBias)) {
    return { action: 'offer_vassalage', targetCiv: bestTarget };
  }
  return null;
}

export function evaluateEmbargoResponse(
  personality: PersonalityTraits,
  relationships: Record<string, number>,
  proposerId: string,
  targetCivId: string,
  posture: NationalIntentPosture,
): boolean {
  const relWithProposer = relationships[proposerId] ?? 0;
  const relWithTarget = relationships[targetCivId] ?? 0;
  const baseThreshold = personality.traits.includes('aggressive') ? 10 :
                    personality.traits.includes('diplomatic') ? 30 : 20;
  // #1087: unlike evaluateLeagueResponse below, a HIGHER threshold here means LESS likely
  // to join (the 'diplomatic' trait already gets the highest base threshold of the three --
  // diplomatic civs are the most reluctant to join a punitive embargo). So a positive
  // diplomaticOpennessBias must RAISE this threshold, the opposite sign from every other
  // reconciled surface in this file, to stay consistent with the trait's own existing
  // direction rather than contradicting it. Caught in #1087's own mandatory review pass --
  // the naive same-sign-everywhere version made a more diplomatically open civ MORE eager
  // to join embargoes, which inverted the trait table's established meaning.
  const threshold = baseThreshold + posture.diplomaticOpennessBias * 20;
  return relWithProposer > relWithTarget + threshold;
}

export function evaluateLeagueResponse(
  personality: PersonalityTraits,
  relationships: Record<string, number>,
  leagueMembers: string[],
  posture: NationalIntentPosture,
): boolean {
  if (leagueMembers.length === 0) return false;
  const avgRel = leagueMembers.reduce((sum, m) => sum + (relationships[m] ?? 0), 0) / leagueMembers.length;
  const baseThreshold = personality.traits.includes('aggressive') ? 30 :
                    personality.traits.includes('diplomatic') ? 5 : 10;
  const threshold = baseThreshold - posture.diplomaticOpennessBias * 20;
  return avgRel > threshold;
}
