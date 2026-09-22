import type {
  NationalIntent,
  NationalIntentReason,
  NationalIntentState,
  OpponentChallenge,
  PersonalityTraits,
} from '@/core/types';
import { majorCivWarOpponentIds } from '@/core/owner-kind';
import type { MajorCivPerception } from './ai-perception';
import type { AICityThreat } from './ai-plan-portfolio';
import type { DominationDoctrine } from './ai-domination';
import { getExpansionCitySoftCap } from './ai-expansion-sites';

/** #1086: hysteresis/shock constants -- see design doc §3/§5. */
export const NATIONAL_INTENT_MIN_HOLD_TURNS = 15;
export const NATIONAL_INTENT_SWITCH_MARGIN = 12;
export const NATIONAL_INTENT_RECOVERY_STABLE_TURNS = 4;
// #1086 implementation-time correction: AICityThreat.captureRisk (ai-prepared-turn.ts's
// cityThreats()) is `Math.max(0, 100 - travelTurns * 20)` -- a 0-100 scale, not 0-1 as
// the design doc's first draft assumed. Verified directly against the source before
// wiring this in, per .claude/rules/spec-fidelity.md. 50 means the nearest hostile
// combat unit is within ~2.5 travel turns of the civ's only city.
export const SHOCK_CAPTURE_RISK_THRESHOLD = 50;

/** The four intents ordinary ambition-scoring can select. `recover` is shock-only. */
type AmbitionIntent = Exclude<NationalIntent, 'recover'>;

export interface NationalIntentPosture {
  expandBias: number;
  captureBias: number;
  resourceBias: number;
  settlementRoleWeight: number;
  economyRoleWeight: number;
  combatRoleWeight: number;
  /** #1087: multiplies weightTechChoice's military-track score component only. */
  researchMilitaryTrackWeight: number;
  /** #1087: subtracted from shouldDeclareWar's threshold comparison -- positive lowers the bar. */
  warDeclarationBias: number;
  /** #1087: added to evaluateDiplomacy/evaluateMinorCivDiplomacy/evaluateEmbargoResponse/
   *  evaluateLeagueResponse's openness thresholds -- positive makes the civ more diplomatically open. */
  diplomaticOpennessBias: number;
  /** #1087: added to evaluateVassalage's strength-ratio threshold -- positive makes the civ
   *  willing to submit to a relatively stronger neighbor than it otherwise would. */
  vassalageSeekingBias: number;
}

export const NATIONAL_INTENT_POSTURE: Record<NationalIntent, NationalIntentPosture> = {
  expand: { expandBias: 20, captureBias: 0, resourceBias: 8, settlementRoleWeight: 1.4, economyRoleWeight: 1.1, combatRoleWeight: 0.9, researchMilitaryTrackWeight: 1.0, warDeclarationBias: 0, diplomaticOpennessBias: 0, vassalageSeekingBias: 0 },
  develop: { expandBias: 0, captureBias: 0, resourceBias: 5, settlementRoleWeight: 1.0, economyRoleWeight: 1.3, combatRoleWeight: 0.85, researchMilitaryTrackWeight: 0.85, warDeclarationBias: -0.1, diplomaticOpennessBias: 0.1, vassalageSeekingBias: 0 },
  dominate: { expandBias: 0, captureBias: 18, resourceBias: 0, settlementRoleWeight: 0.9, economyRoleWeight: 0.9, combatRoleWeight: 1.3, researchMilitaryTrackWeight: 1.3, warDeclarationBias: 0.2, diplomaticOpennessBias: -0.15, vassalageSeekingBias: -0.15 },
  deter: { expandBias: -5, captureBias: -8, resourceBias: 0, settlementRoleWeight: 0.8, economyRoleWeight: 1.0, combatRoleWeight: 1.25, researchMilitaryTrackWeight: 1.15, warDeclarationBias: 0, diplomaticOpennessBias: -0.05, vassalageSeekingBias: 0.1 },
  recover: { expandBias: -20, captureBias: -20, resourceBias: -10, settlementRoleWeight: 0.5, economyRoleWeight: 1.1, combatRoleWeight: 1.1, researchMilitaryTrackWeight: 0.9, warDeclarationBias: -0.3, diplomaticOpennessBias: 0.15, vassalageSeekingBias: 0.25 },
};

export interface NationalIntentInput {
  turn: number;
  previous: NationalIntentState | null;
  perception: Pick<MajorCivPerception, 'ownCities'>;
  personality: PersonalityTraits;
  doctrine: DominationDoctrine;
  cityThreats: readonly Pick<AICityThreat, 'captureRisk' | 'isLastCity'>[];
  /** the actor's own war list -- self-knowledge, never hidden. */
  atWarWith: readonly string[];
  // Accepted for symmetry with DominationDoctrineInput and because a future knob may
  // need it; unread today -- see design doc §10 for why no branch exists yet.
  challenge: OpponentChallenge;
}

function isShocked(input: Pick<NationalIntentInput, 'perception' | 'cityThreats'>): boolean {
  return input.perception.ownCities.length === 0
    || input.cityThreats.some(threat =>
      threat.isLastCity && threat.captureRisk >= SHOCK_CAPTURE_RISK_THRESHOLD);
}

export function scoreIntents(
  input: Pick<NationalIntentInput, 'perception' | 'personality' | 'doctrine' | 'cityThreats' | 'atWarWith'>,
): Record<AmbitionIntent, number> {
  const softCap = getExpansionCitySoftCap(input.personality.expansionDrive);
  const ownCities = input.perception.ownCities.length;
  const activeWars = majorCivWarOpponentIds(input.atWarWith).length;
  const nonExistentialThreats = input.cityThreats.filter(threat =>
    threat.captureRisk > 0 && !threat.isLastCity).length;

  return {
    expand: ownCities >= softCap
      ? 0
      : Math.min(100, 40 + (softCap - ownCities) * 12 + input.personality.expansionDrive * 30),
    develop: Math.max(
      0,
      45
      + (input.personality.traits.includes('trader') ? 15 : 0)
      - activeWars * 10,
    ),
    dominate: input.doctrine.pursuit ? 55 + input.doctrine.captureValueBonus : 15,
    deter: Math.min(
      100,
      30
      + nonExistentialThreats * 18
      + (input.personality.traits.includes('diplomatic') ? 15 : 0),
    ),
  };
}

/**
 * #1086: resolves this round's NationalIntentState from perception-safe inputs only --
 * no raw GameState, no hidden enemy facts. See design doc §3-§5 for the full contract.
 */
export function resolveNationalIntent(input: NationalIntentInput): NationalIntentState {
  const shocked = isShocked(input);
  const previous = input.previous;

  if (shocked) {
    if (previous?.current === 'recover') {
      return { ...previous, shockActive: true, shockFreeStreak: 0 };
    }
    return {
      current: 'recover',
      previous: previous?.current ?? null,
      selectedTurn: input.turn,
      reconsiderAfterTurn: input.turn + NATIONAL_INTENT_MIN_HOLD_TURNS,
      shockActive: true,
      shockFreeStreak: 0,
      reasonCodes: ['intent-shock-recover'],
    };
  }

  if (previous?.current === 'recover') {
    const shockFreeStreak = previous.shockFreeStreak + 1;
    if (shockFreeStreak < NATIONAL_INTENT_RECOVERY_STABLE_TURNS) {
      return { ...previous, shockActive: false, shockFreeStreak };
    }
    return reselect(input, previous, ['intent-shock-resolved']);
  }

  if (previous && input.turn < previous.reconsiderAfterTurn) {
    return { ...previous, shockActive: false, shockFreeStreak: 0, reasonCodes: ['intent-hysteresis-retained'] };
  }

  return reselect(input, previous, []);
}

function reselect(
  input: NationalIntentInput,
  previous: NationalIntentState | null,
  extraReasons: readonly NationalIntentReason[],
): NationalIntentState {
  const scores = scoreIntents(input);
  const ranked = (Object.keys(scores) as AmbitionIntent[])
    .sort((left, right) => scores[right] - scores[left] || left.localeCompare(right));
  const best = ranked[0]!;

  const previousAmbition = previous && previous.current !== 'recover' ? previous.current : null;
  const winner = previousAmbition
    && scores[previousAmbition] + NATIONAL_INTENT_SWITCH_MARGIN >= scores[best]
    ? previousAmbition
    : best;
  const genuineSwitch = winner !== previousAmbition;

  const reasonCodes: NationalIntentReason[] = genuineSwitch
    ? [...extraReasons, 'intent-sustained-evidence']
    : [...extraReasons, 'intent-hysteresis-retained'];
  if (genuineSwitch) {
    const runnerUp = ranked.find(candidate => candidate !== winner);
    // Would the personality-free score order have picked someone else? If so, a trait
    // term was the deciding factor for this round's winner -- computed directly rather
    // than guessed, and only for the switch case (an affirmed incumbent's reason is
    // always hysteresis/evidence, never re-attributed to personality).
    const neutralScores = scoreIntents({ ...input, personality: { ...input.personality, traits: [] } });
    if (runnerUp !== undefined && neutralScores[winner] < neutralScores[runnerUp]) {
      reasonCodes.push('intent-personality-bias');
    }
  }
  if (winner === 'dominate' && input.doctrine.pursuit) reasonCodes.push('intent-domination-pursuit');

  return {
    current: winner,
    previous: genuineSwitch ? (previous?.current ?? null) : (previous?.previous ?? null),
    // An affirmed incumbent keeps its original dwell-time start; a genuine switch (or
    // the very first selection) starts counting from now. Either way the reconsideration
    // window always advances, so an unchanged winner does not force full rescoring next
    // round too.
    selectedTurn: genuineSwitch || !previous ? input.turn : previous.selectedTurn,
    reconsiderAfterTurn: input.turn + NATIONAL_INTENT_MIN_HOLD_TURNS,
    shockActive: false,
    shockFreeStreak: 0,
    reasonCodes,
  };
}
