import type { GameState } from '@/core/types';
import {
  getStrategicLaunchLegality,
  type StrategicLaunchLegalityFailure,
  type StrategicLaunchPlatform,
} from '@/systems/strategic-launch-system';
import { spendStrategicArsenal } from '@/systems/strategic-arsenal-system';
import {
  applyCitySiegeOutcome,
  getCityGarrisonUnit,
  resolveCitySiegeDamage,
  SACK_GOLD_LOSS_FRACTION,
  type CitySiegeResult,
} from '@/systems/city-siege-system';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

// #545 spec §7: "an overwhelming, deterministic rawDamage value (large enough to
// floor almost any target)". Worst realistic stacked city defense against an 'air'
// attacker (walls x1.25 * professional-army x1.10 = 1.375 multiplier; bunker +8 and
// fortification-engineering +5 = 13 flatBonus; bunker's 0.85 air-bombardment
// mitigation -- see getCityDefenseBreakdown, combat-system.ts) only needs
// rawDamage >= ~183 to floor a full-HP (100) city: mitigatedDamage =
// round(rawDamage * 0.85 / 1.375) - 13 >= 100. 9999 is a wide, legible safety
// margin -- not a tuned combat value, deliberately far from any realistic HP total.
const STRATEGIC_STRIKE_RAW_DAMAGE = 9999;

export type StrategicStrikeFailure = StrategicLaunchLegalityFailure;

export type StrategicStrikeResult =
  | {
    ok: true;
    state: GameState;
    platform: StrategicLaunchPlatform;
    cityResult: CitySiegeResult;
    /** Gold lost by the defending civ, applied by this resolver -- see this file's
     * header comment on resolveStrategicStrike for why this is not cityResult.goldLost. */
    goldLost: number;
  }
  | { ok: false; reason: StrategicStrikeFailure };

/**
 * #545 spec §7: resolves a strategic strike against `targetCityId` on behalf of
 * `actorCivId`. Reuses getStrategicLaunchLegality (MR2) as the sole legality gate --
 * never reimplements any of its four conditions -- then feeds an overwhelming
 * rawDamage through the EXISTING resolveCitySiegeDamage/applyCitySiegeOutcome
 * pipeline with attackerDomain: 'air' and preventDestruction: true forced
 * (product decision: "ruin, never delete" -- the harshest HP outcome is always the
 * 1-HP floor, never 'destroyed', regardless of era or last-city status).
 *
 * Gold loss: resolveCitySiegeDamage's own preventDestruction branch returns
 * goldLost: 0 unconditionally -- verified directly against the function; that is
 * naval-city-bombardment-system.ts's existing, unchanged contract, not something
 * this MR may alter. The design spec locks in a stricter outcome for a strategic
 * strike specifically (1-HP floor AND the same gold loss the normal 'sacked' branch
 * would have applied). This resolver applies that as an explicit extra step, reusing
 * SACK_GOLD_LOSS_FRACTION unchanged, rather than modifying the shared siege pipeline.
 * STRATEGIC_STRIKE_RAW_DAMAGE is overwhelming enough that !hasGarrison always means
 * "the preventDestruction floor was hit" for this caller (see that constant's own
 * comment) -- so gating the extra gold loss on hasGarrison alone is exact, not a
 * heuristic guess at cityResult's shape.
 *
 * Arsenal: spends exactly one warhead via spendStrategicArsenal on every legal
 * strike, whether or not a garrison blocked the HP/gold effects -- the launch itself
 * consumed the warhead regardless of what happened at the target.
 */
export function resolveStrategicStrike(
  state: GameState,
  actorCivId: string,
  targetCityId: string,
): StrategicStrikeResult {
  const legality = getStrategicLaunchLegality(state, actorCivId, targetCityId);
  if (!legality.ok) return { ok: false, reason: legality.reason };

  const targetCity = state.cities[targetCityId]!;
  const targetCiv = state.civilizations[targetCity.owner]!;
  const hasGarrison = getCityGarrisonUnit(state.units, targetCity) !== undefined;

  const cityResult = resolveCitySiegeDamage({
    city: targetCity,
    ownerCiv: targetCiv,
    rawDamage: STRATEGIC_STRIKE_RAW_DAMAGE,
    attackerDomain: 'air',
    hasGarrison,
    preventDestruction: true,
    era: resolveCivilizationEra(targetCiv.techState.completed),
    challenge: resolveChallengeForCiv(state, targetCity.owner),
  });

  let nextState = applyCitySiegeOutcome(state, targetCityId, cityResult);

  const goldLost = hasGarrison ? 0 : Math.round(targetCiv.gold * SACK_GOLD_LOSS_FRACTION);
  if (goldLost > 0) {
    const updatedCiv = nextState.civilizations[targetCiv.id]!;
    nextState = {
      ...nextState,
      civilizations: {
        ...nextState.civilizations,
        [targetCiv.id]: { ...updatedCiv, gold: Math.max(0, updatedCiv.gold - goldLost) },
      },
    };
  }

  nextState = spendStrategicArsenal(nextState, actorCivId);

  return { ok: true, state: nextState, platform: legality.platform, cityResult, goldLost };
}
