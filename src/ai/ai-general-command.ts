import type { GameState, HeroicAbilityId, Unit } from '@/core/types';
import { resolveGeneralDefinition, type GeneralDefinition } from '@/systems/great-general-definitions';
import { GENERAL_SPECIALTY_ASSIGNMENTS, resolveGeneralMechanics } from '@/systems/great-general-specialties';
import { mapDistance } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { isAIHostileOwner } from '@/ai/ai-hostility';
import {
  getHeroicCommandEligibility,
  getLastStandPreview,
  getRallyPreview,
  getSeizeTheMomentEligibleUnits,
  issueLastStand,
  issueRally,
  issueSeizeTheMoment,
} from '@/systems/great-general-abilities';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import { hasAICombatRole } from '@/ai/ai-unit-roles';
import { OPPONENT_CHALLENGE_PROFILES, resolveOpponentChallenge } from '@/core/opponent-challenge';

/**
 * #544 MR5: one candidate action a General could take this turn, already
 * scored by its ability-specific evaluator. `execute` is the exact issuance
 * call (issueRally/issueSeizeTheMoment/issueLastStand) bound with whatever
 * arguments that evaluator already resolved (e.g. Last Stand's chosen target
 * hex) -- the shared spend layer never needs to know each ability's own
 * argument shape, only how to compare and call `execute`.
 */
export interface GeneralCommandOpportunity {
  ability: HeroicAbilityId;
  score: number;
  execute: (state: GameState) => GameState;
}

/** Every `great_general` unit `civId` owns with a resolvable definition -- a
 * unit with `generalDefinitionId` pointing at an id no longer in the roster
 * (shouldn't happen, but mirrors this codebase's existing defensive-lookup
 * convention elsewhere in great-general-abilities.ts) is excluded. */
export function getEraGenerals(state: GameState, civId: string): Unit[] {
  const civ = state.civilizations[civId];
  if (!civ) return [];
  return civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.type === 'great_general' && u.generalDefinitionId)
    .filter(u => resolveGeneralDefinition(state, u.generalDefinitionId) !== undefined);
}

const GENERAL_DANGER_RADIUS = 1;

/**
 * contract item 84 (no hidden-info AI): only ever checks units the owning
 * civ can actually see (`getVisibility(...) === 'visible'`), never a raw
 * scan of `state.units`. A General adjacent to a visible, combat-capable
 * hostile unit is "in danger" -- the shared spend layer uses this to
 * discourage (but not forbid) spending a scarce charge while exposed.
 * `hasAICombatRole` excludes non-combat hostiles (workers, settlers,
 * scouts) that cannot actually attack the General, matching MR4's own
 * `isLastStandEligibleUnitType`-style "can this unit fight" convention
 * rather than treating every nearby enemy unit as a threat.
 */
export function isGeneralInDanger(state: GameState, general: Pick<Unit, 'owner' | 'position'>): boolean {
  const visibility = state.civilizations[general.owner]?.visibility;
  if (!visibility) return false;
  return Object.values(state.units).some(candidate =>
    candidate.owner !== general.owner
    && isAIHostileOwner(state, general.owner, candidate.owner)
    && hasAICombatRole(candidate.type)
    && getVisibility(visibility, candidate.position) === 'visible'
    && mapDistance(state.map, general.position, candidate.position) <= GENERAL_DANGER_RADIUS);
}

/**
 * contract §"AI / hot-seat / saves": "Rally evaluator: missing HP,
 * degradation cleanup, survival, future usefulness." getRallyPreview
 * already ranks/selects its own targets by (missing HP + supply-stage
 * severity) -- this evaluator's score is simply the sum of each target's
 * improvement, so a Rally that heals many badly-hurt, badly-supplied units
 * outscores one that barely helps a single near-full-health unit. Returns
 * null (not a zero-score opportunity) when there is genuinely nothing to
 * do, so the shared spend layer never has to special-case "eligible but
 * pointless."
 */
export function evaluateRallyOpportunity(state: GameState, generalUnitId: string): GeneralCommandOpportunity | null {
  const general = state.units[generalUnitId];
  if (!general) return null;
  const eligibility = getHeroicCommandEligibility(state, general);
  if (!eligibility.eligible) return null;

  const preview = getRallyPreview(state, generalUnitId);
  if (preview.targets.length === 0) return null;

  const score = preview.targets.reduce((sum, target) => {
    const healthGain = target.healthAfter - target.healthBefore;
    const stageRelief = target.stageBefore !== target.stageAfter ? 20 : 0;
    return sum + healthGain + stageRelief;
  }, 0);

  return { ability: 'rally', score, execute: s => issueRally(s, generalUnitId) };
}

/**
 * contract §"AI / hot-seat / saves": "Seize evaluator: extra attack, kill
 * potential, capture/denial, reposition, breakthrough." A full
 * kill-probability simulation is out of scope for v1 (YAGNI) --
 * combat-capable acted units get a flat high per-unit value (an extra
 * attack from a real attacker is almost always worth a charge), non-combat
 * acted units (already-moved workers/settlers/etc, repositioning value
 * only) get a much smaller flat value. This is intentionally coarse;
 * contract's "extra attack" and "reposition" cases are exactly the two
 * buckets modeled.
 */
const SEIZE_COMBAT_UNIT_VALUE = 40;
const SEIZE_NONCOMBAT_UNIT_VALUE = 8;

export function evaluateSeizeOpportunity(state: GameState, generalUnitId: string): GeneralCommandOpportunity | null {
  const { eligibility, eligible } = getSeizeTheMomentEligibleUnits(state, generalUnitId);
  if (!eligibility.eligible || eligible.length === 0) return null;

  const score = eligible.reduce((sum, entry) => {
    const unit = state.units[entry.unitId];
    return sum + (unit && hasAICombatRole(unit.type) ? SEIZE_COMBAT_UNIT_VALUE : SEIZE_NONCOMBAT_UNIT_VALUE);
  }, 0);

  return {
    ability: 'seize_the_moment',
    score,
    execute: s => issueSeizeTheMoment(s, generalUnitId, eligible.map(e => e.unitId)),
  };
}

const LAST_STAND_THREAT_SCAN_RADIUS = 2;

function nearbyVisibleThreatScore(state: GameState, civId: string, hex: { q: number; r: number }): number {
  const visibility = state.civilizations[civId]?.visibility;
  if (!visibility) return 0;
  return Object.values(state.units).filter(candidate =>
    candidate.owner !== civId
    && isAIHostileOwner(state, civId, candidate.owner)
    && getVisibility(visibility, candidate.position) === 'visible'
    && mapDistance(state.map, hex, candidate.position) <= LAST_STAND_THREAT_SCAN_RADIUS,
  ).length;
}

/**
 * contract §"AI / hot-seat / saves": "Last Stand evaluator: strategic
 * position, incoming threat, value of units, expected Hold save value,
 * city/Fort/Citadel/chokepoint defense." Candidate hexes are every distinct
 * position occupied by one of the General's own eligible units within
 * commandRange (Last Stand's own area is centered on a hex, not a specific
 * unit -- see getLastStandPreview) -- for each, score = (own unit count
 * at/near that hex, from the preview's own targets) * (1 + threat at that
 * hex, fog-of-war-safe per contract item 84). A hex with a real formation
 * under real incoming threat outscores an empty or safe one; ties broken by
 * hex key for determinism.
 */
export function evaluateLastStandOpportunity(state: GameState, generalUnitId: string): GeneralCommandOpportunity | null {
  const general = state.units[generalUnitId];
  if (!general) return null;
  const eligibility = getHeroicCommandEligibility(state, general);
  if (!eligibility.eligible) return null;
  const definition = resolveGeneralDefinition(state, general.generalDefinitionId);
  const civ = state.civilizations[general.owner];
  if (!definition || !civ) return null;
  const { commandRange } = getEffectiveCommandStats(general, definition);

  const candidateHexes = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => mapDistance(state.map, general.position, u.position) <= commandRange)
    .map(u => u.position);

  let best: { hex: { q: number; r: number }; score: number } | null = null;
  for (const hex of candidateHexes) {
    const preview = getLastStandPreview(state, generalUnitId, hex);
    if (preview.targets.length === 0) continue;
    const score = preview.targets.length * (1 + nearbyVisibleThreatScore(state, general.owner, hex));
    if (!best || score > best.score
      || (score === best.score && `${hex.q},${hex.r}`.localeCompare(`${best.hex.q},${best.hex.r}`) < 0)) {
      best = { hex, score };
    }
  }
  if (!best) return null;

  const chosenHex = best.hex;
  return {
    ability: 'last_stand',
    score: best.score,
    execute: s => issueLastStand(s, generalUnitId, chosenHex),
  };
}

const GENERAL_DANGER_SCORE_PENALTY = 15;
// #544 MR5 review fix: the raw floor an opportunity's own (unweighted)
// score must clear before difficulty eagerness is even consulted. Without
// this, heroicCommandEagernessWeight was nearly inert -- multiplying an
// already-positive score by any positive weight is still positive, so
// every difficulty accepted every non-null opportunity regardless of how
// marginal it was (e.g. a Last Stand bracing a single unit with zero
// visible threat). Divided by eagerness below so low-eagerness (explorer)
// requires a clearly-worthwhile opportunity while high-eagerness (veteran)
// acts on thinner margins -- this is what actually makes "how eagerly the
// AI spends a scarce Command Charge" (opponent-challenge.ts's doc comment
// for this field) true, rather than only affecting the danger-penalty case.
const MINIMUM_OPPORTUNITY_VALUE = 3;

/**
 * contract §"AI / hot-seat / saves": "shared layer considers: charges left,
 * cooldown, General safety, objective importance, tactical swing." Charges/
 * cooldown are already the eligibility gate each evaluator checks via
 * getHeroicCommandEligibility (an ineligible ability simply returns null and
 * is never a candidate here -- this function only ever compares
 * opportunities that already passed that gate, so "charges left"/"cooldown"
 * are satisfied structurally, not by extra logic in this function).
 * "General safety" is applied here as a flat score penalty (scaled by
 * profile.generalSafetyWeight) when isGeneralInDanger is true -- discourages
 * (but does not forbid) spending a charge while exposed, rather than
 * hard-blocking it, since sometimes using the charge anyway (e.g. Last
 * Stand to brace against the very threat endangering the General) is
 * correct. "Objective importance"/"tactical swing" are represented by each
 * evaluator's own score (Rally's healing total, Seize's unit-value sum,
 * Last Stand's formation-size*threat product) -- this function's only job
 * is comparing those already-computed scores, weighted by difficulty
 * eagerness, and picking the best past both the danger penalty and the
 * MINIMUM_OPPORTUNITY_VALUE floor.
 */
export function chooseGeneralCommandAction(state: GameState, generalUnitId: string): GeneralCommandOpportunity | null {
  const general = state.units[generalUnitId];
  if (!general) return null;
  const profile = OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)];
  const dangerPenalty = isGeneralInDanger(state, general)
    ? GENERAL_DANGER_SCORE_PENALTY * profile.generalSafetyWeight
    : 0;

  const opportunities = [
    evaluateRallyOpportunity(state, generalUnitId),
    evaluateSeizeOpportunity(state, generalUnitId),
    evaluateLastStandOpportunity(state, generalUnitId),
  ].filter((o): o is GeneralCommandOpportunity => o !== null);
  if (opportunities.length === 0) return null;

  const scored = opportunities
    .map(o => ({ opportunity: o, adjustedScore: o.score * profile.heroicCommandEagernessWeight - dangerPenalty }))
    .sort((a, b) => b.adjustedScore - a.adjustedScore || a.opportunity.ability.localeCompare(b.opportunity.ability));

  const winner = scored[0]!;
  if (winner.adjustedScore <= 0) return null;
  const requiredScore = MINIMUM_OPPORTUNITY_VALUE / profile.heroicCommandEagernessWeight;
  return winner.opportunity.score >= requiredScore ? winner.opportunity : null;
}

/**
 * Per-civ dispatch entry (called twice per round by the AI round
 * scheduler). 'pre-tactical' runs Rally and Last Stand (both should be
 * active before this civ's own combat and before the next turn's incoming
 * attacks); 'post-tactical' runs only Seize the Moment (requires hasActed
 * units, which only exist after this civ's tactical plan has actually
 * moved/attacked). A General that issues nothing this phase is left in
 * place -- Generals are civilian-classed and are never assigned into the
 * plan/role tactical system, so a General with nothing useful to do simply
 * holds rather than being repositioned.
 */
export function processAIGeneralCommand(
  state: GameState,
  civId: string,
  phase: 'pre-tactical' | 'post-tactical',
): GameState {
  let working = state;
  for (const general of getEraGenerals(working, civId)) {
    const chosen = chooseGeneralCommandAction(working, general.id);
    if (!chosen) continue;
    if (phase === 'pre-tactical' && chosen.ability === 'seize_the_moment') continue;
    if (phase === 'post-tactical' && chosen.ability !== 'seize_the_moment') continue;
    working = chosen.execute(working);
  }
  return working;
}

// ---------------------------------------------------------------------------
// #885: AI candidate valuation over resolved specialties
// ---------------------------------------------------------------------------

/** Small, ~equalised base weights so every specialty is a live pick; the
 * situational term below is a lean, not a landslide. */
const CANDIDATE_BASE_WEIGHTS = { charges: 2, range: 2, capacity: 2 } as const;
/** Cap the situational term at this fraction of the base so a hot war can't
 * landslide the choice — Swift / Tireless must stay live picks. */
const CANDIDATE_SITUATIONAL_CAP_FRACTION = 0.3;
const MOBILE_FRONTLINE_DISTANCE = 4;

function ownFieldUnits(state: GameState, civId: string): Unit[] {
  const civ = state.civilizations[civId];
  return (civ?.units ?? [])
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u) && u.type !== 'great_general');
}

/**
 * How badly this civ currently needs a given specialty, from owned units and
 * fog-of-war-safe visible hostiles only (contract item 84 — no hidden info).
 * Never reads difficulty.
 */
function specialtyNeed(state: GameState, civId: string, specialtyId: string): number {
  const civ = state.civilizations[civId];
  const units = ownFieldUnits(state, civId);
  const visibility = civ?.visibility;
  switch (specialtyId) {
    case 'defensive':
      return units.filter(u => u.health <= 60).length;
    case 'logistician':
      return units.filter(u => u.landSupply?.state === 'degraded' || u.landSupply?.state === 'severe').length;
    case 'initiative': {
      if (!visibility) return 0;
      return units.filter(u => u.hasActed && Object.values(state.units).some(e =>
        e.owner !== civId
        && isAIHostileOwner(state, civId, e.owner)
        && getVisibility(visibility, e.position) === 'visible'
        && mapDistance(state.map, u.position, e.position) <= 1)).length;
    }
    case 'mobile': {
      const capital = civ?.cities?.[0] ? state.cities[civ.cities[0]] : undefined;
      if (!capital) return 0;
      const far = units.filter(u => hasAICombatRole(u.type)
        && mapDistance(state.map, capital.position, u.position) >= MOBILE_FRONTLINE_DISTANCE).length;
      return Math.min(far, 4);
    }
    case 'endurance':
      return Math.min((civ?.diplomacy?.atWarWith?.length ?? 0) * 2, 4);
    default: // generalist — no situational lean (its value is the base stat term
      // only). Returning >0 here would give generated officers a standing edge
      // over a situationally-quiet specialist and break #888's authored-preferred
      // tiebreak.
      return 0;
  }
}

/**
 * #885: the AI's deterministic candidate pick among the 2-3 offered
 * `GeneralDefinition`s. Replaces the pre-#885 raw stat-sum that lived in
 * great-general-system.ts. NO General-ID branches — keyed only on the resolved
 * specialty id. Non-omniscient (owned units + fog-safe hostiles), difficulty-
 * invariant (never reads `state.opponentChallenge` — candidate acquisition is a
 * one-time pick among roughly-equal options, contract item 83), deterministic
 * (id tiebreak).
 */
export function chooseBestGeneralCandidate(
  state: GameState,
  civId: string,
  candidates: GeneralDefinition[],
): GeneralDefinition {
  const scored = candidates.map(def => {
    const mech = resolveGeneralMechanics(def);
    const base = CANDIDATE_BASE_WEIGHTS.charges * mech.maxCommandCharges
      + CANDIDATE_BASE_WEIGHTS.range * mech.commandRange
      + CANDIDATE_BASE_WEIGHTS.capacity * mech.commandCapacity;
    const specialtyId = GENERAL_SPECIALTY_ASSIGNMENTS[def.id] ?? 'generalist';
    const situational = Math.min(
      specialtyNeed(state, civId, specialtyId),
      base * CANDIDATE_SITUATIONAL_CAP_FRACTION,
    );
    return { def, score: base + situational };
  });
  scored.sort((a, b) => b.score - a.score || a.def.id.localeCompare(b.def.id));
  return scored[0]!.def;
}
