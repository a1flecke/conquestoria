import type { GovernanceFaction, GovernancePolicyId } from './governance-types';

/**
 * #987 — the governance policy catalog. Exactly 3 entries, deliberately: the
 * issue asks for "2-4 real policies with real tradeoffs", and the arc's own
 * non-goals rule out "dozens of governance policies" / "generic political
 * simulation". Each policy is a flat, deterministic, attributable unrest
 * pressure row (added inside faction-system.ts's getUnrestPressureBreakdown,
 * the same row-model convention as every existing pressure/relief source —
 * see .claude/rules/game-balance.md's "Governance Policy Inventory") plus a
 * fixed governance-load cost. None of these touch the #927 relief ladder's
 * own rows (Distance from capital / Empire overextension / War weariness /
 * Recent conquest) or its UNREST_RELIEF_SOURCES table — a policy's pressure
 * row is its own independent line, exactly like 'Religious serenity' or
 * 'Luxury resources' already are.
 *
 * Add a new policy by appending a row here — never a policy-id branch in
 * getUnrestPressureBreakdown, governance-capacity.ts, basic-ai.ts, or
 * governance-panel.ts, all of which are generic over this table.
 */
export interface GovernancePolicyDefinition {
  id: GovernancePolicyId;
  name: string;
  description: string;
  /** Governance load this policy consumes while active — see governance-capacity.ts. */
  loadCost: number;
  pleases: GovernanceFaction[];
  angers: GovernanceFaction[];
  /** Label of the new unrest-pressure row this policy adds while active.
   * Must not collide with any label already used by an UNREST_RELIEF_SOURCES
   * entry or another base pressure row in faction-system.ts. */
  pressureRowLabel: string;
  /** Positive = adds pressure (angers a faction); negative = relieves it
   * (pleases a faction net-empire-wide). Never zero — a policy with no
   * pressure effect is not "a real tradeoff". */
  pressureAmount: number;
}

export const GOVERNANCE_POLICY_DEFINITIONS: GovernancePolicyDefinition[] = [
  {
    id: 'conscription-levy',
    name: 'Conscription Levy',
    description: 'Compulsory service strengthens the military\'s standing but resented by ordinary citizens.',
    loadCost: 1,
    pleases: ['military'],
    angers: ['commons'],
    pressureRowLabel: 'Conscription Levy',
    pressureAmount: 3,
  },
  {
    id: 'free-trade-charter',
    name: 'Free Trade Charter',
    description: 'Open markets please merchants but the influx of foreign goods and ideas unsettles the clergy.',
    loadCost: 1,
    pleases: ['merchants'],
    angers: ['clergy'],
    pressureRowLabel: 'Free Trade Charter',
    pressureAmount: 2,
  },
  {
    id: 'local-autonomy-writ',
    name: 'Local Autonomy Writ',
    description: 'Devolves day-to-day rule to local councils, delighting the commons at the expense of military coordination.',
    loadCost: 1,
    pleases: ['commons'],
    angers: ['military'],
    pressureRowLabel: 'Local Autonomy Writ',
    pressureAmount: -3,
  },
];

export function getGovernancePolicyDefinition(id: GovernancePolicyId): GovernancePolicyDefinition {
  const def = GOVERNANCE_POLICY_DEFINITIONS.find(policy => policy.id === id);
  if (!def) throw new Error(`Unknown governance policy id: ${id}`);
  return def;
}
