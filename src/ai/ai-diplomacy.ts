import type { EventBus } from '@/core/event-bus';
import type { GameState, PersonalityTraits, MinorCivState } from '@/core/types';
import type { AIStrategicPlan } from '@/core/types/ai';
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
import { performMinorCivFestival, performMinorCivGift, performMinorCivReparations, setMinorCivWarState } from '@/systems/minor-civ-actions';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { getAiCrisisRemedyReserve } from './ai-crisis-response';
import { getAIStrategicRoles, hasAICombatRole } from './ai-unit-roles';
import { createOperationalRouting, getOperationalRoute } from './ai-operational-routing';
import { classifyOwner, majorCivWarOpponentIds } from '@/core/owner-kind';
import { getVisibility } from '@/systems/fog-of-war';
import { mapDistance } from '@/systems/hex-utils';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { OPPONENT_CHALLENGE_PROFILES, resolveOpponentChallenge } from '@/core/opponent-challenge';
import { hasArmsControlTreaty } from '@/systems/diplomacy-treaties';
import { hasMetCivilization } from '@/systems/discovery-system';
import { buildDiplomaticStrengthEstimates } from '@/systems/diplomatic-strength';
import { hasKnownStrategicCapability } from '@/systems/strategic-arsenal-system';
import { getKnownSharedBorderOwners } from './ai-known-borders';
import type { MajorCivPerception } from './ai-perception';

export interface DiplomaticDecision {
  action: DiplomaticAction;
  targetCiv: string;
}

/**
 * Own perceived strength over a rival's, the one ratio `shouldDeclareWar` and the peace check read. 1 when either side
 * is unknown or zero, so a missing estimate never reads as an overwhelming edge.
 */
export function militaryAdvantage(ownStrength: number, theirStrength: number): number {
  return ownStrength > 0 && theirStrength > 0 ? ownStrength / theirStrength : 1;
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
    const advantage = militaryAdvantage(selfStrength.midpoint, theirStrength);

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
/** Give a recorded settlement time to hold before committing another attack. */
const CITY_STATE_RECONSIDER_PEACE_ROUNDS = 6;

/**
 * Whether a civ wants to conquer this city-state now. Personality and posture decide the appetite (only a
 * warlike civ, or one set on domination, has it); the rest is opportunity, judged only from what the civ
 * itself knows: a discovered city-state, near one of its cities, not an ally or friend, while the civ is at
 * peace with every major civilization and fields an army. The planner separately evaluates whether it can
 * commit a force, and tactical progress decides whether the war is worth continuing.
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

export function canStartAiCityStateConquest(
  state: GameState,
  civId: string,
  minorCivId: string,
  personality: PersonalityTraits,
  posture: NationalIntentPosture,
): boolean {
  const civ = state.civilizations[civId];
  if (!civ || civ.diplomacy.vassalage.overlord
    || civ.diplomacy.atWarWith.some(id => classifyOwner(id) === 'minor')
    || civ.diplomacy.events.some(event =>
      event.type === 'peace_made' && event.otherCiv === minorCivId
      && state.turn - event.turn < CITY_STATE_RECONSIDER_PEACE_ROUNDS)) return false;
  return wantsCityStateConquest(state, civId, minorCivId, personality, posture);
}

function minorCivPlanTarget(state: GameState, plan: AIStrategicPlan): string | undefined {
  const owner = plan.objective === 'capture' && plan.target.kind === 'city' ? state.cities[plan.target.id]?.owner
    : (plan.objective === 'repel' || plan.objective === 'raid') && plan.target.kind === 'unit' ? state.units[plan.target.id]?.owner
      : undefined;
  return owner && classifyOwner(owner) === 'minor' ? owner : undefined;
}

function hasRoutedCaptureUnit(state: GameState, plan: AIStrategicPlan, requireStaging = false): boolean {
  if (plan.target.kind !== 'city') return false;
  const destination = plan.target.lastKnownPosition;
  const visibility = state.civilizations[plan.actorId].visibility;
  if (requireStaging && getVisibility(visibility, destination) !== 'visible') return false;
  const routing = createOperationalRouting();
  return plan.assignedUnitIds.some(unitId => {
    const unit = state.units[unitId];
    if (unit?.owner !== plan.actorId || unit.transportId || !getAIStrategicRoles(unit.type).includes('capture')
      || (requireStaging && mapDistance(state.map, unit.position, destination) !== 1)) return false;
    const route = getOperationalRoute(state, unit, destination, routing);
    return route !== null && (!requireStaging || route.length === 2);
  });
}

/**
 * Open a city-state war only when the selected capture plan has mobilized a unit that can reach the city.
 */
export function applyAiCityStateWar(
  state: GameState,
  civId: string,
  personality: PersonalityTraits,
  posture: NationalIntentPosture,
  bus: EventBus,
): GameState {
  const plan = state.opponentAI?.majorCivs[civId]?.primaryPlan;
  if (!plan || plan.objective !== 'capture' || !['advancing', 'attacking'].includes(plan.phase)
    || (state.opponentAI?.migrationGraceRoundsRemaining ?? 0) > 0) return state;
  const targetId = minorCivPlanTarget(state, plan);
  if (!targetId || !canStartAiCityStateConquest(state, civId, targetId, personality, posture)) return state;
  // After a settlement, another route from afar is the same bet. Wait until an
  // assigned capture unit has reached the approach and can see the way into the city.
  const settledBefore = state.civilizations[civId].diplomacy.events.some(event =>
    event.type === 'peace_made' && event.otherCiv === targetId);
  if (!hasRoutedCaptureUnit(state, plan, settledBefore)) return state;
  const result = setMinorCivWarState(state, civId, targetId, true, bus);
  return result.ok ? result.state : state;
}

function activeCityStateWar(state: GameState, civId: string, madeProgress: boolean): string | undefined {
  const plan = state.opponentAI?.majorCivs[civId]?.primaryPlan;
  if (!plan || !['scouting', 'mobilizing', 'advancing', 'attacking'].includes(plan.phase)) return undefined;
  const targetId = minorCivPlanTarget(state, plan);
  if (!targetId || !isMinorCivAtWar(state, civId, targetId)) return undefined;

  // Use the plan's existing reconsideration window. Recreating a plan seeds a
  // new lastProgressTurn, but only tactical execution can report real progress.
  const reconsideration = plan.reconsiderAfterTurn - plan.createdTurn;
  if (madeProgress || (plan.lastProgressTurn > plan.createdTurn
    && state.turn - plan.lastProgressTurn < reconsideration)) return targetId;
  const recentlyDeclared = state.civilizations[civId].diplomacy.events.some(event =>
    event.type === 'war_declared' && event.otherCiv === targetId
    && state.turn - event.turn < reconsideration);
  if (recentlyDeclared && hasRoutedCaptureUnit(state, plan)) return targetId;
  return undefined;
}

/**
 * Reconcile city-state wars with the operation the AI actually executed. The
 * shared command also handles bilateral state, leagues and vassal authority.
 */
export function applyAiMinorCivPeace(
  state: GameState,
  civId: string,
  bus: EventBus,
  primaryPlanMadeProgress: boolean,
): GameState {
  const keepWarWith = activeCityStateWar(state, civId, primaryPlanMadeProgress);
  let next = state;
  for (const minorCivId of Object.keys(next.minorCivs ?? {}).sort()) {
    if (keepWarWith === minorCivId || !isMinorCivAtWar(next, civId, minorCivId)) continue;
    const result = setMinorCivWarState(next, civId, minorCivId, false, bus);
    if (result.ok) next = result.state;
  }
  return next;
}

/**
 * Pays reparations to one city-state a turn whose grievance against the civ has reached 'mobilizing' or
 * 'coalition-talks', so its neighbours do not band together and declare war. Skips a city-state the civ
 * itself wants to conquer, and never dips into the gold saved for the civ's own crisis cure. The payment
 * goes through `performMinorCivReparations`, the player's own command.
 */
export function applyAiMinorCivReparations(
  state: GameState,
  civId: string,
  personality: PersonalityTraits,
  posture: NationalIntentPosture,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman) return state;
  const reserve = getAiCrisisRemedyReserve(state, civId);
  const targetId = Object.keys(state.minorCivs ?? {})
    .filter(minorCivId => {
      const status = state.minorCivs[minorCivId].regionalGrievanceByCiv?.[civId]?.status;
      return (status === 'mobilizing' || status === 'coalition-talks')
        && !wantsCityStateConquest(state, civId, minorCivId, personality, posture);
    })
    .sort((a, b) => (state.minorCivs[b].regionalGrievanceByCiv![civId]!.pressure - state.minorCivs[a].regionalGrievanceByCiv![civId]!.pressure)
      || a.localeCompare(b))[0];
  if (!targetId) return state;
  const result = performMinorCivReparations(state, civId, targetId);
  return result.ok && keepsCureReserve(result.state, civId, reserve) ? result.state : state;
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

// ---- #1693: personality war intent, shared by the planner and diplomacy ----
/*
 * #1693: whom this AI's personality would go to war with, derived once and read by both the strategic planner and
 * diplomacy.
 *
 * Before this, `shouldDeclareWar` ran only inside `evaluateDiplomacy`, and `basic-ai.ts` threw its `declare_war`
 * verdicts away unless a prepared capture plan already pointed at that civ. The planner admitted a peaceful major
 * civ as a capture target only through the domination doctrine's freshly-observed gate, which never asked the
 * personality. So an aggressive AI that wanted war never got a plan, and with no plan it never declared: in a
 * 250-round late-era campaign no AI went to war with anyone, a defenceless one-city neighbour included. The planner
 * now offers a capture objective against exactly the civs returned here, and a war is still declared only by the
 * prepared plan once it is advancing (`canDeclareWarForPreparedPlan`), so no war ever starts without a force.
 *
 * Everything read is the actor's own perception: its relationships and treaties, strength estimates built from what
 * it has observed, and border pressure from units and cities it can see. Thresholds are the personality's own and
 * identical at every difficulty, as `shouldDeclareWar` always was.
 */
/** A rival unit within this many hexes of one of our cities (or ours of theirs) is border pressure. */
const BORDER_PRESSURE_RADIUS = 3;

/** The per-rival facts `evaluateDiplomacy` and the war-intent check both read, from the actor's own perception. */
export function buildDiplomacyContexts(
  state: GameState,
  civId: string,
  perception: MajorCivPerception,
): Record<string, Required<DiplomaticContext>> {
  const civ = state.civilizations[civId];
  if (!civ) return {};
  const sharedKnownBorders = getKnownSharedBorderOwners(state, civId);
  const ownCities = civ.cities.flatMap(id => state.cities[id] ? [state.cities[id]!] : []);
  const ownUnits = civ.units.flatMap(id => state.units[id] ? [state.units[id]!] : []);
  const contexts: Record<string, Required<DiplomaticContext>> = {};
  for (const otherId of perception.knownCivIds) {
    const otherCities = perception.knownCities.filter(city => city.owner === otherId && city.position !== null);
    const otherUnits = perception.units.filter(unit => unit.owner === otherId && unit.position !== null);
    const hasBorderPressure = ownUnits.some(unit =>
      otherCities.some(city => mapDistance(state.map, unit.position, city.position!) <= BORDER_PRESSURE_RADIUS))
      || otherUnits.some(unit =>
        ownCities.some(city => mapDistance(state.map, unit.position!, city.position) <= BORDER_PRESSURE_RADIUS));
    contexts[otherId] = {
      hasMet: hasMetCivilization(state, civId, otherId),
      hasBorderPressure,
      targetHasKnownStrategicCapability: hasKnownStrategicCapability(state, civId, otherId),
      sharesKnownBorder: sharedKnownBorders.has(otherId),
    };
  }
  return contexts;
}

/**
 * The major civilizations at peace with `civId` that its personality would declare war on this turn, by the same
 * `shouldDeclareWar` rule diplomacy applies, and only where declaring is currently a legal diplomatic action.
 */
export function getPersonalityWarTargets(
  state: GameState,
  civId: string,
  perception: MajorCivPerception,
  personality: PersonalityTraits,
  posture: NationalIntentPosture,
): ReadonlySet<string> {
  const civ = state.civilizations[civId];
  const targets = new Set<string>();
  if (!civ?.diplomacy) return targets;
  const civilizationEra = resolveCivilizationEra(civ.techState.completed);
  const { self, others } = buildDiplomaticStrengthEstimates(perception, civilizationEra);
  const contexts = buildDiplomacyContexts(state, civId, perception);
  const cautionWeight = OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)].strategicDeterrenceCautionWeight;
  const armsControl = hasArmsControlTreaty(state, civId);
  for (const otherId of perception.knownCivIds) {
    if (classifyOwner(otherId) !== 'major' || isAtWar(civ.diplomacy, otherId)) continue;
    const context = contexts[otherId];
    if (!context?.hasMet) continue;
    const actions = getAvailableActions(civ.diplomacy, otherId, {
      completedTechs: civ.techState.completed,
      civilizationEra,
      hasArmsControlTreaty: armsControl,
    });
    if (!actions.includes('declare_war')) continue;
    if (shouldDeclareWar(
      personality,
      getRelationship(civ.diplomacy, otherId),
      militaryAdvantage(self.midpoint, others[otherId]?.midpoint ?? 0),
      state.turn,
      context.hasMet,
      context.hasBorderPressure,
      context.targetHasKnownStrategicCapability,
      cautionWeight,
      posture,
    )) {
      targets.add(otherId);
    }
  }
  return targets;
}
