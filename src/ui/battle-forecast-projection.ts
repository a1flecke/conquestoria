import type { GameState, Unit } from '@/core/types';
import type { CombatModifierFact } from '@/core/types/combat';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { buildObservedCombatContext, type CombatContextOptions } from '@/systems/combat-context';
import { estimateCombatEraForViewer } from '@/systems/era-resolution';
import { forecastCombat, type BattleOutcomeBand, type CombatForecast, type DamageRange } from '@/systems/battle-forecast';

/**
 * The viewer-safe battle forecast (#1135). The omniscient forecast (`systems/battle-forecast.ts`,
 * numbers from the real combat math) is projected here into what *this viewer* may be told.
 *
 * - The forecast is computed from the canonical combat math over a *viewer-known* context
 *   (`buildObservedCombatContext`): facts the viewer has not earned -- an enemy's tech, hidden
 *   buildings' techs, supply/readiness state, a concealed supporter -- are neutralised before the
 *   numbers are produced, so no number can encode them. Same formula, only the inputs are what the
 *   viewer may know. A constant note says unseen factors are not included; whether any exist is
 *   itself never revealed (the differential harness holds this invariant).
 * - Numbers are expectations, bounded ranges and kill chances -- never a roll.
 * - Nothing here mutates state, draws RNG or emits events.
 *
 * UI and controllers must reach the forecast only through this module (source rule
 * `raw-battle-forecast` in `tests/helpers/viewer-safety-boundaries.ts`).
 */

export interface BattleSideView {
  name: string;
  hp: number;
  /** HP expected to be lost, with the bounded range. */
  damage: DamageRange;
  /** Plain-language fate: "likely destroyed", "could be destroyed", or ''. */
  fate: string;
  /** One line a child can read: "Knight: about 28 HP lost (22–35); 100 → ~72 HP." */
  summary: string;
}

/** The "what if it is intercepted" block of an air-strike forecast (#1213). Absent for ordinary attacks. */
export interface BattleInterceptionView {
  headline: string;
  lines: string[];
}

export interface BattleForecastView {
  band: BattleOutcomeBand;
  icon: string;
  /** First line, plain language. */
  headline: string;
  you: BattleSideView;
  them: BattleSideView;
  /** One-line "why": the biggest knowable factors. */
  why: string;
  workingForYou: string[];
  workingAgainstYou: string[];
  notActive: string[];
  tips: string[];
  ownerName: string;
  ariaLabel: string;
  /** Air strikes only: the conditional interception exchange that would precede the target strike. */
  interception?: BattleInterceptionView;
}

export const BAND_PRESENTATION: Record<BattleOutcomeBand, { icon: string; label: string }> = {
  'strong-advantage': { icon: '✅', label: 'Strong advantage' },
  advantage: { icon: '👍', label: 'Advantage' },
  even: { icon: '⚖️', label: 'Even fight' },
  risky: { icon: '⚠️', label: 'Risky' },
  'severe-risk': { icon: '🛑', label: 'Severe risk' },
};

function pct(multiplier: number): string {
  const delta = Math.round((multiplier - 1) * 100);
  return `${delta >= 0 ? '+' : '−'}${Math.abs(delta)}%`;
}

function factText(fact: CombatModifierFact): string {
  if (/\d%|[+\-−×]\s?\d/.test(fact.label)) return fact.label;
  return fact.operation === 'multiplier'
    ? `${fact.label} ${pct(fact.value)}`
    : `${fact.label} ${fact.value >= 0 ? '+' : '−'}${Math.abs(fact.value)}`;
}

/** Does this fact make the fight better for the attacker (the viewer)? Defender-side bonuses help them. */
function helpsAttacker(fact: CombatModifierFact, side: 'attacker' | 'defender'): boolean {
  const positive = fact.operation === 'multiplier' ? fact.value >= 1 : fact.value >= 0;
  return side === 'attacker' ? positive : !positive;
}

const IGNORED_REASON_COPY: Record<NonNullable<CombatModifierFact['ignoredReason']>, string> = {
  role: 'this unit does not play that role',
  condition: 'its condition is not met here',
  'unit-class': 'it does not apply to this kind of unit',
  domain: 'it does not apply on this terrain or domain',
  'inactive-source': 'its source is not active',
};

/** A fact's player-facing explanation, keyed by the canonical fact key -- never a rule re-evaluation. */
const TIP_BY_FACT_KEY: Record<string, string> = {
  'land-supply': 'Move back into supply to remove the overextension penalty.',
  'naval-operations': 'Return to a friendly port to restore your fleet.',
  'air-readiness': 'Let this aircraft rest at its base to restore its readiness.',
};

function damageSummary(name: string, hp: number, damage: DamageRange): string {
  const after = Math.max(0, hp - damage.expected);
  return damage.expected >= hp
    ? `${name}: expected to be destroyed.`
    : `${name}: about ${damage.expected} HP lost (${damage.min}–${damage.max}); ${hp} → ~${after} HP.`;
}

function fate(chance: number): string {
  if (chance >= 0.5) return 'likely destroyed';
  if (chance >= 0.15) return 'could be destroyed';
  return '';
}

function headlineFor(band: BattleOutcomeBand, you: string, them: string, killChance: number): string {
  const { label } = BAND_PRESENTATION[band];
  const kill = killChance >= 0.5 ? ` Likely to destroy the ${them}.` : killChance >= 0.15 ? ` Could destroy the ${them}.` : '';
  switch (band) {
    case 'strong-advantage': return `${label} — your ${you} should come out on top.${kill}`;
    case 'advantage': return `${label} — you should hurt the ${them} more than it hurts you.${kill}`;
    case 'even': return `${label} — both sides will be hurt about the same.${kill}`;
    case 'risky': return `${label} — the ${them} may hurt you more than you hurt it.${kill}`;
    case 'severe-risk': return `${label} — your ${you} will likely be destroyed.`;
  }
}

export interface BattleForecastRequest {
  state: GameState;
  viewerId: string;
  attacker: Unit;
  defender: Unit;
  ownerName: string;
  options?: CombatContextOptions;
}

/** Projects an already-computed forecast for `viewerId`. Pure given its inputs. */
function projectBattleForecast(
  viewerId: string,
  attacker: Unit,
  defender: Unit,
  forecast: CombatForecast,
  ownerName: string,
): BattleForecastView {
  const youName = UNIT_DEFINITIONS[attacker.type]?.name ?? attacker.type;
  const themName = UNIT_DEFINITIONS[defender.type]?.name ?? defender.type;
  const { strengths } = forecast;
  const forYou: string[] = [];
  const againstYou: string[] = [];
  const notActive: string[] = [];
  const tips: string[] = [];

  const sides: Array<{ side: 'attacker' | 'defender'; owner: string; facts: readonly CombatModifierFact[] }> = [
    { side: 'attacker', owner: attacker.owner, facts: strengths.attackerModifierFacts ?? [] },
    { side: 'defender', owner: defender.owner, facts: strengths.defenderModifierFacts ?? [] },
  ];
  for (const { side, owner, facts } of sides) {
    for (const fact of facts) {
      const known = fact.sourceVisibility === 'public' || owner === viewerId;
      if (fact.outcome === 'applied' || fact.outcome === 'capped') {
        if (!known) continue;
        // combined arms is also folded into positioning on the defender side; list each fact once
        (helpsAttacker(fact, side) ? forYou : againstYou).push(factText(fact));
        const tip = TIP_BY_FACT_KEY[fact.key];
        if (tip && owner === viewerId && !helpsAttacker(fact, side)) tips.push(tip);
      } else if (fact.outcome === 'ignored' && known && owner === viewerId) {
        notActive.push(`${fact.label} — not active (${fact.ignoredReason ? IGNORED_REASON_COPY[fact.ignoredReason] : 'conditions not met'})`);
      }
    }
  }

  if (strengths.terrainDefenseBonus > 0) againstYou.push(`Terrain: ${pct(1 + strengths.terrainDefenseBonus)} defense for them`);
  if (strengths.riverAttackPenalty < 0) {
    againstYou.push(`River crossing ${pct(1 + strengths.riverAttackPenalty)} attack`);
    tips.push('A river lies between you. Attack from a tile on the same side to avoid it.');
  }
  for (const part of strengths.cityDefense?.parts ?? []) againstYou.push(part.label);
  if (strengths.defenderDefendsPoorly) forYou.push('Bombard units defend poorly (−50%)');
  if (strengths.exchange?.label) forYou.push(strengths.exchange.label);

  const attackerPositioning = strengths.attackerModifierParts?.find(part => part.label.startsWith('Flanked'));
  if (attackerPositioning) forYou.push(attackerPositioning.label);
  const defenderPositioning = strengths.defenderModifierParts?.find(part => part.label.startsWith('Supported'));
  if (defenderPositioning) againstYou.push(defenderPositioning.label);

  const you: BattleSideView = {
    name: youName, hp: attacker.health, damage: forecast.attackerDamage,
    fate: fate(forecast.attackerDeathChance),
    summary: damageSummary(`Your ${youName}`, attacker.health, forecast.attackerDamage),
  };
  const them: BattleSideView = {
    name: themName, hp: defender.health, damage: forecast.defenderDamage,
    fate: fate(forecast.defenderKillChance),
    summary: damageSummary(`Enemy ${themName}`, defender.health, forecast.defenderDamage),
  };
  const headline = headlineFor(forecast.band, youName, themName, forecast.defenderKillChance);
  const topFactors = [...againstYou, ...forYou].slice(0, 3);
  const why = topFactors.length > 0 ? `Why: ${topFactors.join(', ')}` : 'Why: no special modifiers — a straight fight.';

  return {
    band: forecast.band,
    icon: BAND_PRESENTATION[forecast.band].icon,
    headline,
    you, them, why,
    workingForYou: forYou, workingAgainstYou: againstYou, notActive, tips, ownerName,
    ariaLabel: `Battle preview. ${headline} ${you.summary} ${them.summary}`,
  };
}

/** The one entry the UI/controllers use: canonical context (viewer-redacted) + era, forecast, projection. */
export function buildBattleForecastView(request: BattleForecastRequest): BattleForecastView {
  const { state, viewerId, attacker, defender, ownerName, options } = request;
  const context = buildObservedCombatContext(state, viewerId, attacker, defender, options);
  const opponent = attacker.owner === viewerId ? defender : attacker;
  const forecast = forecastCombat(attacker, defender, state.map, context, estimateCombatEraForViewer(state, viewerId, opponent.owner), state);
  return projectBattleForecast(viewerId, attacker, defender, forecast, ownerName);
}
