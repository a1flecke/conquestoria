import { ESPIONAGE_TECH_MAX_SPIES } from '@/systems/espionage-catalog';
import { ESPIONAGE_MODIFIERS } from '@/systems/espionage-modifier-definitions';
import { CRISIS_INTERACTION_DEFINITIONS } from '@/systems/crisis-interaction-definitions';
import { isCityMaturityTech } from '@/systems/city-maturity-system';

/**
 * #1316: what the AI believes a technology's effects owned by bespoke gameplay code are worth.
 *
 * `evaluateAITechCapabilities` already values catalog-driven effects (unlocked units and buildings, yield rows, cost
 * discounts, combat-modifier rows). Some real tech power lives in system code instead: spy slots and mission gates,
 * crisis interventions, road-connected-city gold, city maturity, a defender bonus in the combat resolver. Without this
 * module the AI treats such a tech as era progress and nothing else, while a human receives the effect.
 *
 * Contract:
 * - **State-independent.** A value is a property of the technology, never of the board. Nothing here reads a
 *   `GameState`, an opponent, a difficulty tier, or a random stream, so it cannot give the AI hidden information and
 *   is identical at every difficulty.
 * - **Data-driven.** Prefer deriving from the typed definitions the bespoke system already exports (espionage
 *   modifiers, spy-slot ladder, crisis interactions, city-maturity techs); `BESPOKE_TECH_EFFECTS` holds only what has no
 *   exported definition. There are no tech-id branches in the valuation.
 * - **Bounded.** Each effect is worth at most `BESPOKE_EFFECT_CAP`, each tech at most `BESPOKE_TECH_VALUE_CAP`, so
 *   several small effects can never outrank a critical unit or building unlock or era progress.
 * - **Exhaustive.** `tests/ai/ai-tech-bespoke-value.test.ts` fails when a technology that production code names is in
 *   none of: the catalog tables, the derived sources, `BESPOKE_TECH_EFFECTS`, or `INTENTIONALLY_ZERO_VALUE_TECHS`
 *   (with a reason). A new bespoke tech effect cannot silently become invisible to AI research.
 */

export type BespokeEffectCategory =
  | 'espionage' | 'crisis' | 'infrastructure' | 'city-development' | 'diplomacy'
  | 'military' | 'economy' | 'religion' | 'governance' | 'victory';

export interface BespokeTechEffect {
  techId: string;
  category: BespokeEffectCategory;
  value: number;
  rationale: string;
}

/** Largest value a single effect may carry. */
export const BESPOKE_EFFECT_CAP = 0.6;
/** Largest total a technology's bespoke effects may add to its research score (a modest building's worth). */
export const BESPOKE_TECH_VALUE_CAP = 1;

const MINOR = 0.2;
const MODEST = 0.3;
const SOLID = 0.4;
const MAJOR = 0.5;

/** Value of one extra spy slot. */
const SPY_SLOT_VALUE = 0.15;
/** Espionage success-chance points are worth this much per 1.0 of delta (a 0.30 swing is 0.6). */
const ESPIONAGE_DELTA_VALUE = 2;
const MISSION_GATE_VALUE = MODEST;
const CRISIS_INTERVENTION_VALUE = MODEST;
const CITY_MATURITY_VALUE = MINOR;

const effect = (techId: string, category: BespokeEffectCategory, value: number, rationale: string): BespokeTechEffect =>
  ({ techId, category, value, rationale });

/** Effects with no exported typed definition to derive from; each names the system that owns the behaviour. */
export const BESPOKE_TECH_EFFECTS: readonly BespokeTechEffect[] = [
  // Espionage mission gates (private stage tables in espionage-catalog.ts).
  effect('espionage-scouting', 'espionage', MISSION_GATE_VALUE, 'gates the scouting missions'),
  effect('espionage-informants', 'espionage', MISSION_GATE_VALUE, 'gates the intelligence-gathering missions'),
  effect('spy-networks', 'espionage', MISSION_GATE_VALUE, 'gates steal_tech / sabotage_production / incite_unrest'),
  effect('sabotage', 'espionage', MISSION_GATE_VALUE, 'alternate gate for the same covert-action stage'),
  effect('cryptography', 'espionage', MISSION_GATE_VALUE, 'gates the assassination / forgery / rebel missions'),
  effect('counter-intelligence', 'espionage', MISSION_GATE_VALUE, 'alternate gate for the same stage, plus counter-espionage'),
  effect('propaganda', 'espionage', MISSION_GATE_VALUE, 'gates flip_loyalty'),
  effect('black-chambers', 'espionage', MISSION_GATE_VALUE, 'gates intercept_courier'),
  effect('diplomatic-networks', 'espionage', MISSION_GATE_VALUE, 'gates bribe_official'),
  effect('covert-operations', 'espionage', MISSION_GATE_VALUE, 'gates sabotage_relief'),
  effect('disinformation-bureau', 'espionage', MISSION_GATE_VALUE, 'gates expose_scandal'),
  effect('counterintelligence', 'espionage', MISSION_GATE_VALUE, 'gates signals intercept'),
  effect('cold-war-networks', 'espionage', MISSION_GATE_VALUE, 'gates misinformation / election interference'),
  effect('satellite-surveillance', 'espionage', MISSION_GATE_VALUE, 'gates spy-satellite missions'),
  effect('cyber-intelligence', 'espionage', MISSION_GATE_VALUE, 'gates cyber operative attacks'),
  effect('digital-surveillance', 'espionage', MINOR, 'counter-espionage turn mechanics (espionage-counterintel)'),
  // Road-connected-city gold and road/rail movement (tech-yield-system resolvers, road-network, unit-movement-cost).
  effect('postal-service', 'infrastructure', SOLID, '+1 gold per owned road tile'),
  effect('courier-network', 'infrastructure', SOLID, '+1 gold per road-connected city'),
  effect('colonial-railways', 'infrastructure', SOLID, '+2 gold per road-connected city'),
  effect('transcontinental-rail', 'infrastructure', MAJOR, '+2 gold per railway-connected city'),
  effect('electric-telegraph', 'infrastructure', MAJOR, 'connected-city gold and allied shared vision'),
  effect('road-building', 'infrastructure', SOLID, 'lets workers build roads, which road gold and relief read'),
  effect('bridge-building', 'infrastructure', MODEST, 'river crossings cost no extra movement'),
  effect('military-logistics', 'infrastructure', SOLID, 'roads cost half movement; supply sources'),
  effect('railway-expansion', 'infrastructure', MAJOR, 'road discount, supply and governance capacity'),
  effect('gps-navigation', 'infrastructure', MODEST, 'terrain-cost relief for land units in own territory'),
  effect('trade-winds', 'infrastructure', SOLID, '+1 movement for naval units'),
  effect('mass-surveillance', 'infrastructure', SOLID, 'extra vision every round'),
  effect('deep-ocean-research', 'economy', MODEST, '+1 trade-route capacity in coastal cities'),
  // Combat resolver and fortification.
  effect('professional-army', 'military', SOLID, '+10% for defenders in cities'),
  effect('fortification-engineering', 'military', SOLID, 'walls give +5 to the garrison'),
  effect('fortification', 'military', MODEST, 'fortification fact in the combat context'),
  effect('fortresses', 'military', MODEST, 'lets workers build forts'),
  // Economy and production side effects applied outside the yield table.
  effect('cloud-computing', 'economy', 0.6, 'science-track techs cost 15% less'),
  effect('3d-printing', 'economy', MAJOR, 'production overflow carries to the next queue item'),
  effect('gene-therapy', 'economy', MODEST, 'completion bonus applied at unit production'),
  effect('private-spaceflight', 'economy', MODEST, 'new air units gain permanent movement'),
  effect('petroleum-industry', 'economy', MODEST, 'lets workers build oil wells'),
  effect('irrigation', 'economy', MODEST, 'river farms yield +1 production (tile-yield)'),
  effect('mercantilism', 'economy', MODEST, '+1 trade-route capacity (trade-route-economy)'),
  // Diplomacy actions.
  effect('diplomacy-tech', 'diplomacy', SOLID, 'unlocks Non-Aggression Pacts'),
  effect('writing', 'diplomacy', MINOR, 'required for defensive leagues'),
  effect('currency', 'diplomacy', MINOR, 'embargo / trade-agreement actions'),
  effect('banking', 'diplomacy', MINOR, 'embargo / trade-agreement actions'),
  // Religion, governance, victory.
  effect('missionary-zeal', 'religion', SOLID, 'more missionary charges and faster conversion'),
  effect('constitutional-law', 'governance', MODEST, 'reduces unrest in newly captured cities'),
  effect('space-exploration', 'victory', MAJOR, 'unlocks the space race'),
  effect('mars-mission-architecture', 'victory', MAJOR, 'unlocks the Mars race'),
  effect('epidemic-control', 'crisis', SOLID, 'halves famine population loss (crisis-effects)'),
  // Era 13 network and autonomy systems (autonomy-capacity, network-plan-definitions, propagandist-system).
  effect('general-purpose-ai', 'governance', MODEST, 'raises autonomy capacity'),
  effect('quantum-networking', 'governance', MODEST, 'raises autonomy capacity'),
  effect('digital-personhood', 'governance', MODEST, 'raises autonomy capacity'),
  effect('machine-ethics', 'governance', MINOR, 'unlocks an autonomy posture'),
  effect('autonomous-mobility', 'infrastructure', MODEST, 'unlocks a network plan'),
  effect('ambient-interfaces', 'infrastructure', MODEST, 'unlocks a network plan'),
  effect('hypersonic-coordination', 'military', MODEST, 'network combat coordination'),
  effect('digital-democracy', 'governance', MINOR, 'propagandist-system effect'),
  effect('contemplative-technology', 'governance', MINOR, 'propagandist-system effect'),
];

/**
 * Technologies production code names that deliberately carry no bespoke AI value, with the reason. Every entry is
 * checked to name a real technology that production code references, so the list cannot rot.
 */
export const INTENTIONALLY_ZERO_VALUE_TECHS: Readonly<Record<string, string>> = {
  tactics: 'effect lives in the unit-modifier table (valued there); unrest-guidance only reads it for advice copy',
  philosophy: 'unrest-guidance advice copy; its buildings are valued through unlocks',
  'code-of-laws': 'unrest-guidance advice copy; its building is valued through unlocks',
  magistracy: 'courthouse relief is valued by unrestReliefTechBonus (UNREST_RELIEF_SOURCES)',
  'political-philosophy': 'regional-capital relief is valued by unrestReliefTechBonus (UNREST_RELIEF_SOURCES)',
  decolonization: 'federal-autonomy relief is valued by unrestReliefTechBonus; the yield row is valued generically',
  'separation-of-powers': 'bureaucracy relief is valued by unrestReliefTechBonus; the yield row is valued generically',
  'precision-casting': 'combat-modifier row is valued generically; unrest-guidance only reads it for advice copy',
  'universal-suffrage': 'yield row is valued generically; unrest-guidance only reads it for advice copy',
  'propaganda-campaigns': 'yield row is valued generically; unrest-guidance only reads it for advice copy',
  drama: 'the string is a presentation bucket name, not the technology',
  quarantine: 'the string is an AI crisis-action kind, not a technology gate',
  internet: 'the string is a wonder id used by the codex and roster, not a technology effect',
  'social-media': 'gates which wonder intel a viewer sees; information presentation only',
  galleys: 'pirate roster / ecology naming; the unit unlock is valued through unlocks',
  navigation: 'pirate roster / ecology naming; the unit unlock is valued through unlocks',
  triremes: 'pirate roster / ecology naming; the unit unlock is valued through unlocks',
  caravels: 'pirate roster / ecology naming; the unit unlock is valued through unlocks',
  'amphibious-warfare': 'pirate roster / ecology naming; the unit unlocks are valued through unlocks',
  'air-superiority': 'combat-role presentation; the unit unlocks are valued through unlocks',
  'torpedo-warfare': 'combat-modifier row is valued generically',
};

function deriveEspionageModifierEffects(): BespokeTechEffect[] {
  return ESPIONAGE_MODIFIERS
    .filter(row => row.source.kind === 'tech')
    .map(row => effect(
      row.source.id,
      'espionage',
      Math.min(BESPOKE_EFFECT_CAP, Math.round(Math.abs(row.delta) * ESPIONAGE_DELTA_VALUE * 100) / 100),
      `${row.side} ${row.effect} ${row.delta > 0 ? '+' : ''}${row.delta} (${row.label})`,
    ));
}

function deriveSpySlotEffects(): BespokeTechEffect[] {
  const ladder = Object.entries(ESPIONAGE_TECH_MAX_SPIES).sort((a, b) => a[1] - b[1]);
  return ladder.flatMap(([techId, slots], index) => {
    const gained = slots - (ladder[index - 1]?.[1] ?? 0);
    return gained > 0 ? [effect(techId, 'espionage', Math.min(BESPOKE_EFFECT_CAP, gained * SPY_SLOT_VALUE), `+${gained} spy slot(s)`)] : [];
  });
}

function deriveCrisisInterventionEffects(): BespokeTechEffect[] {
  const techIds = new Set<string>();
  for (const definition of CRISIS_INTERACTION_DEFINITIONS) {
    const required = definition.techRequired;
    if (!required) continue;
    for (const id of typeof required === 'string' ? [required] : Object.values(required)) techIds.add(id);
  }
  return [...techIds].map(id => effect(id, 'crisis', CRISIS_INTERVENTION_VALUE, 'gates a crisis intervention'));
}

function deriveCityMaturityEffect(techId: string): BespokeTechEffect[] {
  return isCityMaturityTech(techId) ? [effect(techId, 'city-development', CITY_MATURITY_VALUE, 'counts toward city maturity')] : [];
}

let derivedByTech: Map<string, BespokeTechEffect[]> | undefined;

function derivedEffects(): Map<string, BespokeTechEffect[]> {
  if (!derivedByTech) {
    derivedByTech = new Map();
    for (const item of [...deriveEspionageModifierEffects(), ...deriveSpySlotEffects(), ...deriveCrisisInterventionEffects(), ...BESPOKE_TECH_EFFECTS]) {
      derivedByTech.set(item.techId, [...(derivedByTech.get(item.techId) ?? []), item]);
    }
  }
  return derivedByTech;
}

/** Every bespoke effect recognised for a technology: derived from typed definitions, then the explicit table. */
export function getBespokeTechEffects(techId: string): BespokeTechEffect[] {
  return [...(derivedEffects().get(techId) ?? []), ...deriveCityMaturityEffect(techId)];
}

/** Total bounded bespoke value of a technology. Pure function of the technology; never reads game state. */
export function getBespokeTechValue(techId: string): number {
  const total = getBespokeTechEffects(techId).reduce((sum, item) => sum + Math.min(BESPOKE_EFFECT_CAP, item.value), 0);
  return Math.min(BESPOKE_TECH_VALUE_CAP, Math.round(total * 100) / 100);
}
