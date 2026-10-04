/**
 * #988: AI selection of a war goal at the moment war is declared. Deliberately
 * cheap and belief-only -- like `ai-expansion-sites.ts`, this reads only what
 * the acting civ has actually perceived (`knownEnemyCities`, matching
 * `MajorCivPerception.knownCities` filtered to the target civ) plus its own
 * public diplomatic knowledge of the opponent (`opponentHasOverlord` -- an
 * existing overlord relationship is visible diplomatic state, not hidden
 * military intelligence). Legality is re-validated for real by
 * `canDeclareWarGoal` at the call site; this only picks *which* goal to try.
 * No RNG: ties are always broken by ascending city id.
 */
import type { HexCoord } from '@/core/types';
import type { NationalIntentPosture } from './ai-national-intent-posture';
import type { WarGoalKind } from '@/core/types';
import { hexDistance } from '@/systems/hex-utils';

export interface WarGoalCandidateInput {
  posture: NationalIntentPosture;
  /** Does the opponent already have an overlord? Public diplomatic knowledge, not hidden intel. */
  opponentHasOverlord: boolean;
  /** A vassal's foreign policy belongs to its overlord (#1054) -- never propose a goal for one. */
  actorIsVassal: boolean;
  ownCapitalPosition: HexCoord | null;
  knownEnemyCities: ReadonlyArray<{ id: string; position: HexCoord | null }>;
  /** #989: has the actor's OWN recorded history with this opponent (repeated
   * wars, lost cities/capitals, broken treaties, etc. -- see
   * `rivalry-system.ts`) crossed the `'rival'` threshold? This is the one
   * measurable AI behaviour change #989 requires: a recognized rival is
   * pursued more punitively than a first-time opponent at the same posture. */
  isRecognizedRival: boolean;
}

export interface WarGoalChoice {
  kind: WarGoalKind;
  targetCityId?: string;
}

/** A posture aggressive enough to prefer imposing vassalage over ordinary conquest. */
const DOMINATE_CAPTURE_BIAS_THRESHOLD = 10;

/** #989: a recognized rival earns force-vassalage at a much lower capture
 * bias than a stranger would -- the AI does not need to be in an all-out
 * dominate posture to want to finally settle an old score. */
const RIVAL_CAPTURE_BIAS_THRESHOLD = 4;

export function chooseWarGoal(input: WarGoalCandidateInput): WarGoalChoice | null {
  if (input.actorIsVassal) return null;

  const captureBiasThreshold = input.isRecognizedRival ? RIVAL_CAPTURE_BIAS_THRESHOLD : DOMINATE_CAPTURE_BIAS_THRESHOLD;
  if (!input.opponentHasOverlord && input.posture.captureBias >= captureBiasThreshold) {
    return { kind: 'force_vassalage' };
  }

  if (!input.ownCapitalPosition) return null;
  const known = input.knownEnemyCities.filter(
    (city): city is { id: string; position: HexCoord } => city.position !== null,
  );
  if (known.length === 0) return null;

  const nearest = [...known].sort((a, b) => {
    const distanceDelta = hexDistance(input.ownCapitalPosition!, a.position) - hexDistance(input.ownCapitalPosition!, b.position);
    return distanceDelta !== 0 ? distanceDelta : a.id.localeCompare(b.id);
  })[0];
  return { kind: 'conquer_city', targetCityId: nearest.id };
}
