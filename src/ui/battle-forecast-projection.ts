import type { CombatModifierFact, GameState, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { buildCombatContextForDefender, type CombatContextOptions } from '@/systems/combat-context';
import type { CombatContext } from '@/systems/combat-system';
import { resolveCombatEra } from '@/systems/era-resolution';
import { forecastCombat, type BattleOutcomeBand, type CombatForecast, type DamageRange } from '@/systems/battle-forecast';
import { isUnitConcealedFrom } from '@/systems/concealment';
import { isZocEligibleCombatUnit } from '@/systems/zone-of-control-system';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';

/**
 * The viewer-safe battle forecast (#1135). The omniscient forecast (`systems/battle-forecast.ts`,
 * numbers from the real combat math) is projected here into what *this viewer* may be told.
 *
 * - The forecast is computed from the canonical combat math over a *viewer-known* context
 *   (`redactCombatContextForViewer`): facts the viewer has not earned -- an enemy's tech, hidden
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
}

const BAND_PRESENTATION: Record<BattleOutcomeBand, { icon: string; label: string }> = {
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

function visibleDefenderSupport(state: GameState, viewerId: string, defender: Unit): { visible: number } {
  const neighbors = state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(defender.position, state.map.width)
    : hexNeighbors(defender.position);
  const keys = new Set(neighbors.map(hexKey));
  const byTile = new Map<string, Unit[]>();
  for (const unit of Object.values(state.units)) {
    if (unit.id === defender.id || unit.owner !== defender.owner || !isZocEligibleCombatUnit(unit) || !keys.has(hexKey(unit.position))) continue;
    const list = byTile.get(hexKey(unit.position)) ?? [];
    list.push(unit);
    byTile.set(hexKey(unit.position), list);
  }
  let visible = 0;
  for (const units of byTile.values()) {
    if (units.some(unit => !isUnitConcealedFrom(state, unit, viewerId))) visible++;
  }
  return { visible };
}

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
export function projectBattleForecast(
  state: GameState,
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
  if (defenderPositioning) {
    const support = visibleDefenderSupport(state, viewerId, defender);
    if (support.visible > 0) againstYou.push(`Supported +${support.visible * 10}%`);
  }

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

function neutraliseSide(context: CombatContext, side: 'attacker' | 'defender'): CombatContext {
  const next: CombatContext = { ...context };
  const set = (key: string, value: unknown) => { (next as Record<string, unknown>)[key] = value; };
  const cap = side === 'attacker' ? 'attacker' : 'defender';
  // Owner-visibility fact sources: the state of a force the viewer cannot inspect.
  for (const source of ['CombinedArms', 'LandSupply', 'NavalOperations', 'AirReadiness']) {
    set(`${cap}${source}Multiplier`, 1);
    set(`${cap}${source}Fact`, undefined);
  }
  set(`${cap}NetworkStrengthBonus`, 0);
  const engine = side === 'attacker' ? context.attackerModifiers : context.defenderModifiers;
  if (engine) {
    // The engine's mult/flat are exactly the product/sum of its applied facts; keep the public ones.
    const publicApplied = (engine.facts ?? []).filter(fact => fact.sourceVisibility === 'public' && fact.outcome === 'applied');
    const rebuilt = {
      mult: publicApplied.filter(f => f.operation === 'multiplier').reduce((total, f) => total * f.value, 1),
      flat: publicApplied.filter(f => f.operation === 'flat').reduce((total, f) => total + f.value, 0),
      parts: [],
      facts: publicApplied,
    };
    set(`${cap}Modifiers`, rebuilt);
  }
  if (side === 'defender') {
    next.airDefenseCoverage = undefined;
    if (context.defenderCity) next.defenderCity = { ...context.defenderCity, defenderCompletedTechs: [] };
  }
  return next;
}

/**
 * The combat context as `viewerId` may know it. Everything a side's owner alone can know is
 * neutralised on any side the viewer does not own; support is re-counted from supporters the
 * viewer can actually see (concealed ones do not count).
 */
export function redactCombatContextForViewer(
  state: GameState,
  viewerId: string,
  attacker: Unit,
  defender: Unit,
  context: CombatContext,
): CombatContext {
  let next = context;
  if (attacker.owner !== viewerId) next = neutraliseSide(next, 'attacker');
  if (defender.owner !== viewerId) {
    next = neutraliseSide(next, 'defender');
    const visible = visibleDefenderSupport(state, viewerId, defender).visible;
    next = {
      ...next,
      defenderPositioningMultiplier: 1 + visible * 0.1,
      defenderPositioningPart: visible > 0 ? { label: `Supported +${visible * 10}%`, kind: 'mult' } : undefined,
    };
  }
  return next;
}

/** The one entry the UI/controllers use: canonical context (viewer-redacted) + era, forecast, projection. */
export function buildBattleForecastView(request: BattleForecastRequest): BattleForecastView {
  const { state, viewerId, attacker, defender, ownerName, options } = request;
  const context = redactCombatContextForViewer(
    state, viewerId, attacker, defender,
    buildCombatContextForDefender(state, attacker, defender, options),
  );
  const forecast = forecastCombat(attacker, defender, state.map, context, resolveCombatEra(state, attacker, defender), state);
  return projectBattleForecast(state, viewerId, attacker, defender, forecast, ownerName);
}
