/**
 * Positive strategy (#1374): the meaningful choices the player's own strategy has created right now.
 *
 * Kept deliberately apart from `StrategicConstraint`. A constraint is a condition hurting the empire and is ranked by
 * severity; an opportunity is a choice currently available and is ranked by `priority`. The two scales are not
 * comparable and never share a list, so an optional choice can never read as an emergency.
 *
 * This module only maps the domain projections (`getWarObjectiveOpportunities`, `getGovernanceOpportunity`) into one
 * ranked list. It never re-derives legality or reads hidden state: the projections own that. Presentation metadata is one
 * table typed `Record<StrategicOpportunityKind, ...>`, so a new kind cannot compile without its advisor and copy.
 * Ephemeral by design: opportunities are current-state only and are not part of the persisted assessment digest.
 */
import type { AdvisorType, CouncilCardAction, GameState } from '@/core/types';
import { getGovernanceOpportunity } from '@/systems/governance-opportunity-presentation';
import { getWarObjectiveOpportunities } from '@/systems/war-objective-presentation';

export type StrategicOpportunityKind = 'war-objective' | 'governance';

export interface StrategicOpportunity {
  /** Stable, so the same opportunity keeps one card id (and one telemetry id) across turns. */
  id: string;
  kind: StrategicOpportunityKind;
  /** 1-100, comparable only with other opportunities. */
  priority: number;
  title: string;
  why: string;
  destination?: CouncilCardAction;
}

export const MAX_STRATEGIC_OPPORTUNITIES = 3;

export interface StrategicOpportunityPresentation {
  /** Tie-break among equal priorities: lower first. Unique per kind. */
  rank: number;
  advisor: AdvisorType;
  /** Why the choice matters; states only what the game really does. */
  whyItMatters: string;
}

export const STRATEGIC_OPPORTUNITY_PRESENTATION: Record<StrategicOpportunityKind, StrategicOpportunityPresentation> = {
  'war-objective': {
    rank: 0,
    advisor: 'warchief',
    whyItMatters: 'A war with a clear aim is easier to steer, and Diplomacy is where you set the aim or open talks.',
  },
  governance: {
    rank: 1,
    advisor: 'chancellor',
    whyItMatters: 'Unspent governance capacity does nothing on its own. The Governance panel shows what each option costs and who it pleases.',
  },
};

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildStrategicOpportunities(state: GameState, viewerCivId: string): StrategicOpportunity[] {
  const opportunities: StrategicOpportunity[] = [];

  for (const war of getWarObjectiveOpportunities(state, viewerCivId)) {
    opportunities.push({ id: war.id, kind: 'war-objective', priority: war.priority, title: war.title, why: war.why, destination: war.destination });
  }
  const governance = getGovernanceOpportunity(state, viewerCivId);
  if (governance) {
    opportunities.push({ id: governance.id, kind: 'governance', priority: governance.priority, title: governance.title, why: governance.why, destination: governance.destination });
  }

  return opportunities
    .sort((a, b) =>
      b.priority - a.priority
      || STRATEGIC_OPPORTUNITY_PRESENTATION[a.kind].rank - STRATEGIC_OPPORTUNITY_PRESENTATION[b.kind].rank
      || compareIds(a.id, b.id))
    .slice(0, MAX_STRATEGIC_OPPORTUNITIES);
}
