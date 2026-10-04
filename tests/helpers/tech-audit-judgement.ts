import type { YieldKind } from '@/systems/tech-yield-definitions';
import { FLAT_YIELD_KINDS, type TechAuditRow } from './tech-audit-inventory';

/**
 * #420 child 1 — the derivation rules that turn inventory facts into a *default* judgement, and the
 * gate that says when a human judgement is mandatory. Defaults only describe what the facts imply
 * ("this is an unconditional flat bonus"); they never invent a replacement. Anything the rules flag
 * must carry an authored entry in `tests/systems/tech-audit/tech-audit-data.ts`, and the audit test
 * fails for a flagged tech without one.
 */

export type AuditClass = 'KEEP' | 'TUNE' | 'REPLACE' | 'WIRE' | 'FOLLOW-UP' | 'OBSOLETE';

/**
 * 0 = progression / flavor node (no mechanic);
 * 1 = an unconditional number (low signal);
 * 2 = conditional, but the condition is weak, ubiquitous or repeated elsewhere;
 * 3 = changes what the player can do or decides (capability, scaling to a choice, a system verb).
 */
export type ChoiceRating = 0 | 1 | 2 | 3;

export interface TechJudgement {
  cls: AuditClass;
  rating: ChoiceRating;
  /** Why, in one sentence. */
  note: string;
  /** For REPLACE / TUNE / WIRE: the proposed replacement, using a mechanic that already exists. */
  candidate?: string;
  /** The tech's displayed text must be rewritten to stay honest, whatever else changes. */
  textFix?: boolean;
  /** For FOLLOW-UP: what needs its own design (never a tech-balance child). */
  followUp?: string;
}

/** Yield kinds whose value grows with a choice the player makes (routes, partners, wonders, terrain, ...). */
const SCALING_KINDS: ReadonlySet<YieldKind['kind']> = new Set([
  'perTradeRoute', 'tradeRoutePercent', 'perLuxuryResource', 'perOwnedNaturalWonder', 'foundingBonus',
  'foundingProductionBonus', 'terrainYield', 'perCompletedLegendaryWonder', 'perRoutePartnerCiv', 'perCityRoute',
  'lowestCityScience', 'foodFromScience', 'maintenanceDiscount',
]);

/** A numeric effect claim in the displayed text. */
const NUMERIC_CLAIM = /\+\d|\d\s*%/;
/** A capability claim that needs a mechanic behind it. */
const CAPABILITY_CLAIM = /\b(faster|immune|halved|healthier|more productive|embark|map edges|uncharted|wider reach|dominate)/i;

export function hasFlatEffect(row: TechAuditRow): boolean {
  return row.yieldEffects.some(effect => FLAT_YIELD_KINDS.has(effect.kind));
}

export function hasBroadCombatModifier(row: TechAuditRow): boolean {
  return row.unitModifiers.some(modifier => modifier.broad);
}

/** Cost discounts that apply to a whole category of production with no condition. */
export function hasBroadDiscount(row: TechAuditRow): boolean {
  return row.costDiscounts.some(discount => /^(units|military-units|buildings) /.test(discount));
}

/** Effect lines in the displayed text, i.e. not a resource reveal. */
export function effectClaims(row: TechAuditRow): string[] {
  return row.unlockText.filter(line => !line.startsWith('Reveal '));
}

/**
 * A numeric or capability claim in the text with nothing in the effect tables behind it. A code owner
 * can still exist (that is for the reviewer to confirm), so this only flags — it never decides.
 */
export function hasUnbackedClaim(row: TechAuditRow): boolean {
  const hasTableEffect = row.yieldEffects.length > 0 || row.unitModifiers.length > 0 || row.costDiscounts.length > 0;
  if (hasTableEffect) return false;
  return effectClaims(row).some(line => NUMERIC_CLAIM.test(line) || CAPABILITY_CLAIM.test(line));
}

export interface NicheGroup {
  signature: string;
  techIds: string[];
}

/** Yield effects that appear on three or more techs with the same shape: progression that repeats rather than deepens. */
export function findRepeatedNiches(rows: readonly TechAuditRow[], minimum = 3): NicheGroup[] {
  const bySignature = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const effect of row.yieldEffects) {
      const set = bySignature.get(effect.signature) ?? new Set<string>();
      set.add(row.id);
      bySignature.set(effect.signature, set);
    }
  }
  return [...bySignature.entries()]
    .filter(([, ids]) => ids.size >= minimum)
    .map(([signature, ids]) => ({ signature, techIds: [...ids].sort() }))
    .sort((a, b) => b.techIds.length - a.techIds.length || a.signature.localeCompare(b.signature));
}

export function repeatedNicheSignatures(rows: readonly TechAuditRow[]): Set<string> {
  return new Set(findRepeatedNiches(rows).map(group => group.signature));
}

/** What the facts alone imply. Never includes a candidate. */
export function deriveJudgement(row: TechAuditRow, repeated: ReadonlySet<string>): TechJudgement {
  if (hasFlatEffect(row)) {
    return { cls: 'REPLACE', rating: 1, note: 'Unconditional flat or percentage yield with no interaction.' };
  }
  if (hasBroadCombatModifier(row)) {
    return { cls: 'REPLACE', rating: 1, note: 'Unconditional combat bonus across every unit.' };
  }
  if (row.yieldEffects.length > 0) {
    const scaling = row.yieldEffects.some(effect => SCALING_KINDS.has(effect.kind));
    const repeatsElsewhere = row.yieldEffects.some(effect => repeated.has(effect.signature));
    if (scaling && !repeatsElsewhere) return { cls: 'KEEP', rating: 3, note: 'Scales with a choice the player makes.' };
    return repeatsElsewhere
      ? { cls: 'TUNE', rating: 2, note: 'Conditional, but the same shape repeats on three or more techs.' }
      : { cls: 'KEEP', rating: 2, note: 'Conditional on something the player may or may not build.' };
  }
  if (row.unitModifiers.length > 0) {
    return { cls: 'KEEP', rating: 3, note: 'Conditional or class-scoped unit modifier.' };
  }
  if (row.unitUnlocks > 0 || row.buildingUnlocks > 0 || row.codeOwners.length > 0) {
    return { cls: 'KEEP', rating: 3, note: 'Unlocks content or is read by a game system.' };
  }
  return { cls: 'KEEP', rating: 0, note: 'Progression or flavor node: no mechanic claimed.' };
}

/**
 * Why this tech needs an authored judgement, or null when the default stands. The audit test requires an
 * entry in the data module for every tech this returns a reason for.
 */
export function needsDecision(row: TechAuditRow, repeated: ReadonlySet<string>): string | null {
  if (hasFlatEffect(row)) return 'flat yield';
  if (hasBroadCombatModifier(row)) return 'broad combat modifier';
  if (hasBroadDiscount(row)) return 'broad cost discount';
  if (hasUnbackedClaim(row)) return 'effect claim with no table effect behind it';
  if (row.yieldEffects.some(effect => repeated.has(effect.signature))) return 'repeated niche';
  return null;
}

export type AiValuationPath =
  /** Capability from unlocked units / buildings is valued; the tech's own yield effect is not. */
  | 'unlock-valued-effect-blind'
  /** Only a yield or modifier effect: the AI sees era progress and nothing about the effect. */
  | 'effect-blind'
  /** Valued through unlocks only; no effect to value. */
  | 'unlock-valued'
  /** Only era progress (and pacing metadata where present). */
  | 'era-only';

/**
 * `evaluateAITechCapabilities` (src/ai/ai-tech-evaluation.ts) scores units unlocked, the unlocked buildings' own
 * yields, resources revealed, era and `tech.pacing` — it never reads the yield or unit-modifier tables.
 * `tests/systems/tech-strategic-audit.test.ts` pins that fact so this column cannot go stale silently.
 */
export function aiValuationPath(row: TechAuditRow): AiValuationPath {
  const hasEffect = row.yieldEffects.length > 0 || row.unitModifiers.length > 0 || row.costDiscounts.length > 0;
  const hasUnlock = row.unitUnlocks > 0 || row.buildingUnlocks > 0;
  if (hasEffect) return hasUnlock ? 'unlock-valued-effect-blind' : 'effect-blind';
  return hasUnlock ? 'unlock-valued' : 'era-only';
}
