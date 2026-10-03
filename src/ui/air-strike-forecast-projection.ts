import type { City, GameState, HexCoord, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { resolveCombatEra } from '@/systems/era-resolution';
import { getVisibility } from '@/systems/fog-of-war';
import { isUnitConcealedFrom } from '@/systems/concealment';
import {
  AIR_MISSION_FAILURE_MESSAGES,
  canInterceptIncomingStrike,
  getAirStrikeCityRawDamage,
  getAirStrikeDenial,
  pickStrongestInterceptor,
  resolveAirStrikeTarget,
  type AirMissionFailureReason,
} from '@/systems/air-operations-system';
import { forecastAirStrike, type AirStrikeBranch, type AirStrikeForecast } from '@/systems/air-strike-forecast';
import { resolveCitySiegeDamage } from '@/systems/city-siege-system';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import {
  BAND_PRESENTATION,
  buildBattleForecastView,
  redactCombatContextForViewer,
  type BattleForecastView,
  type BattleInterceptionView,
} from './battle-forecast-projection';
import { hexKey } from '@/systems/hex-utils';

/**
 * The viewer-safe air-strike forecast (#1213). A *forecast*, never a resolver and never an
 * authorisation: it calls no strike executor, mutates nothing, draws no RNG and emits nothing. The
 * controller re-runs the canonical strike on Confirm against the live state.
 *
 * Interception is the hard privacy question. Whether an enemy aircraft is on an intercept stance, which
 * base it flies from, and its readiness are owner-private -- nothing in the UI shows them -- so this
 * projection never consults them. It reasons only about *capability that is already public*: a hostile
 * interceptor-capable aircraft the viewer can currently see, based within range of the target. For the
 * strongest such aircraft it shows a conditional "if it intercepts" exchange, built over a context
 * redacted exactly as #1135 redacts it. A hidden interceptor, a hidden base or hidden SAM cover changes
 * nothing here (held by the differential harness), so the forecast is not radar: a surprise
 * interception stays a surprise.
 */

export type AirStrikeForecastRequest = {
  state: GameState;
  viewerId: string;
  unitId: string;
  target: HexCoord;
  ownerName: string;
};

/**
 * A refusal speaks the executor's own vocabulary (#1223): `reason` is the `AirMissionFailureReason` that
 * `resolveAirStrike` would return for the same command, and `message` is its one copy. The forecast has no
 * failure words of its own.
 */
export type AirStrikeForecastResult =
  | { ok: true; view: BattleForecastView }
  | { ok: false; reason: AirMissionFailureReason; message: string };

function refusal(reason: AirMissionFailureReason): { ok: false; reason: AirMissionFailureReason; message: string } {
  return { ok: false, reason, message: AIR_MISSION_FAILURE_MESSAGES[reason] };
}

function pct(chance: number): string {
  return `${Math.round(chance * 100)}%`;
}

function range(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`;
}

function visibleTo(state: GameState, viewerId: string, unit: Unit): boolean {
  const visibility = state.civilizations[viewerId]?.visibility;
  if (visibility && getVisibility(visibility, unit.position) !== 'visible') return false;
  return !isUnitConcealedFrom(state, unit, viewerId);
}

/** The strongest hostile interceptor-capable aircraft the viewer can see in range of the target, if any. */
function findKnownInterceptCandidate(state: GameState, viewerId: string, striker: Unit, target: HexCoord): Unit | undefined {
  return pickStrongestInterceptor(Object.values(state.units).filter(
    unit => canInterceptIncomingStrike(state, unit, striker, target) && visibleTo(state, viewerId, unit),
  ));
}

function interceptionView(
  striker: Unit,
  targetName: string,
  forecast: AirStrikeForecast,
): BattleInterceptionView | undefined {
  const hit = forecast.ifIntercepted;
  if (!hit) return undefined;
  const youName = UNIT_DEFINITIONS[striker.type]?.name ?? striker.type;
  const theirName = UNIT_DEFINITIONS[hit.stage.interceptor.type]?.name ?? hit.stage.interceptor.type;
  const s = hit.stage;
  const lines = [
    `If it intercepts, it fights your ${youName} first: your ${youName} would lose about ${s.strikerDamage.expected} HP (${range(s.strikerDamage.min, s.strikerDamage.max)}) and the ${theirName} about ${s.interceptorDamage.expected} HP (${range(s.interceptorDamage.min, s.interceptorDamage.max)}).`,
    `Chance your ${youName} is shot down before it reaches the target: ${pct(s.strikerDestroyedChance)}.`,
    `Then the strike on ${targetName}: about ${hit.targetDamage.expected} HP (${range(hit.targetDamage.min, hit.targetDamage.max)}) after interception, against ${forecast.withoutInterception.targetDamage.expected} HP if nothing intercepts.`,
  ];
  return {
    headline: `Interception risk: a ${theirName} you can see is in range and may intercept.`,
    lines,
  };
}

function cityView(
  striker: Unit,
  city: City,
  forecast: AirStrikeForecast,
  ownerName: string,
  garrisonBlocks: boolean,
): BattleForecastView {
  const youName = UNIT_DEFINITIONS[striker.type]?.name ?? striker.type;
  const branch: AirStrikeBranch = forecast.withoutInterception;
  const loss = branch.targetDamage.expected;
  const wasted = loss === 0;
  const band = wasted ? 'risky' as const : 'advantage' as const;
  const after = Math.max(0, (city.hp ?? 100) - loss);
  const headline = wasted
    ? `${BAND_PRESENTATION[band].label} — this strike is not expected to damage ${city.name}${garrisonBlocks ? ': its garrison blocks air strikes' : ''}.`
    : `${BAND_PRESENTATION[band].label} — your ${youName} should wear down ${city.name}. An air strike never captures a city.`;
  const you = {
    name: youName, hp: striker.health, damage: branch.strikerDamage, fate: '',
    summary: `Your ${youName}: not expected to be hurt by the city itself.`,
  };
  const them = {
    name: city.name, hp: city.hp ?? 100, damage: branch.targetDamage, fate: '',
    summary: wasted
      ? `${city.name}: no damage expected.`
      : `${city.name}: about ${loss} HP lost; ${city.hp ?? 100} → ~${after} HP.`,
  };
  const why = garrisonBlocks
    ? 'Why: a garrison absorbs the strike.'
    : 'Why: strike damage is the aircraft\'s strength and health, reduced by the city\'s defences.';
  const warn = !wasted && loss >= (city.hp ?? 100) - 1
    ? ['This strike could reduce the city to 1 HP or worse — it may be sacked or destroyed.']
    : [];
  return {
    band, icon: BAND_PRESENTATION[band].icon, headline, you, them, why,
    workingForYou: [], workingAgainstYou: [], notActive: [],
    tips: warn, ownerName,
    ariaLabel: `Air strike preview. ${headline} ${them.summary}`,
  };
}

/** The one entry the UI/controllers use for an air-strike forecast. Pure given its inputs. */
export function buildAirStrikeForecastView(request: AirStrikeForecastRequest): AirStrikeForecastResult {
  const { state, viewerId, unitId, target, ownerName } = request;
  const striker = state.units[unitId];
  if (!striker || striker.owner !== viewerId) return refusal('ineligible-strike');
  // The executor's own eligibility: what the forecast shows is what Confirm will be allowed to fly.
  const denial = getAirStrikeDenial(state, unitId, target);
  if (denial) return refusal(denial);
  const resolved = resolveAirStrikeTarget(state, striker, target);
  const targetPos = resolved.city?.position ?? resolved.unit?.position;
  if (!targetPos) return refusal('missing-target');

  const candidate = findKnownInterceptCandidate(state, viewerId, striker, target);
  const interception = candidate
    ? {
      interceptor: candidate,
      // Redacted as the viewer sees it: the interceptor's owner-private facts (readiness, tech, SAM cover,
      // tactical claim) are neutralised before any number exists.
      context: redactCombatContextForViewer(
        state, viewerId, candidate, striker,
        buildCombatContextForDefender(state, candidate, striker, { isIntercepting: true }),
      ),
      era: resolveCombatEra(state, candidate, striker),
    }
    : undefined;

  if (resolved.unit) {
    const defender = resolved.unit;
    const base = buildBattleForecastView({ state, viewerId, attacker: striker, defender, ownerName });
    const forecast = forecastAirStrike({
      state, map: state.map, striker,
      leg: {
        kind: 'unit', target: defender, era: resolveCombatEra(state, striker, defender),
        context: redactCombatContextForViewer(state, viewerId, striker, defender, buildCombatContextForDefender(state, striker, defender)),
      },
      interception,
    });
    const targetName = UNIT_DEFINITIONS[defender.type]?.name ?? defender.type;
    const hit = interceptionView(striker, `the enemy ${targetName}`, forecast);
    return {
      ok: true,
      view: {
        ...base,
        ariaLabel: base.ariaLabel.replace('Battle preview.', 'Air strike preview.'),
        ...(hit ? { interception: hit } : {}),
      },
    };
  }

  const city = resolved.city!;
  const ownerCiv = state.civilizations[city.owner];
  if (!ownerCiv) return refusal('missing-target');
  // The garrison counts only if the viewer can see it; the owner's tech never enters the number.
  const cityKey = hexKey(city.position);
  const visibleGarrison = Object.values(state.units).some(
    unit => unit.owner === city.owner && hexKey(unit.position) === cityKey && !isUnitConcealedFrom(state, unit, viewerId),
  );
  const knownOwner = { ...ownerCiv, techState: { ...ownerCiv.techState, completed: [] as string[] } };
  const forecast = forecastAirStrike({
    state, map: state.map, striker,
    leg: {
      kind: 'city', cityHp: city.hp ?? 100,
      hpLossForStriker: shot => resolveCitySiegeDamage({
        city, ownerCiv: knownOwner, rawDamage: getAirStrikeCityRawDamage(shot), attackerDomain: 'air',
        hasGarrison: visibleGarrison, isOwnersLastCity: false, preventDestruction: true,
        era: 1, challenge: resolveChallengeForCiv(state, city.owner),
      }).hpLost,
    },
    interception,
  });
  const view = cityView(striker, city, forecast, ownerName, visibleGarrison);
  const hit = interceptionView(striker, city.name, forecast);
  return { ok: true, view: hit ? { ...view, interception: hit } : view };
}

/**
 * What the player agreed to when they pressed Strike: if the live forecast's signature differs on Confirm
 * the controller shows the new forecast instead of executing on the stale one. Numbers and the interception
 * block only -- never a hidden fact, since the view is already viewer-safe.
 */
export function airForecastSignature(view: BattleForecastView): string {
  return JSON.stringify([view.band, view.you.summary, view.them.summary, view.interception ?? null]);
}
