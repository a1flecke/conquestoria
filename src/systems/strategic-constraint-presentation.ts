/**
 * How each strategic constraint kind is ranked, named and advised (#1357).
 *
 * One table, typed `Record<StrategicConstraintKind, ...>`, so adding a kind to `STRATEGIC_CONSTRAINT_KINDS` fails to
 * compile until its tie-break rank, history label, Council advisor and "why it matters" line are written here. The fact
 * and severity of a constraint stay in `strategic-assessment.ts`; this file holds presentation only.
 *
 * Division of labour (do not duplicate): an ONGOING CONDITION hurting the empire is a constraint (food, production,
 * science, gold, unrest, supply, blockade). A DECISION or standing agreement the player must answer or watch is a
 * specialised Council card (an incoming tribute demand, an active tribute). A MECHANISM that merely contributes to a
 * condition appears through that condition's explanation (Imperial Levy is an unrest cause, not its own card).
 */
import type { AdvisorType, StrategicConstraintKind } from '@/core/types';
import { STRATEGIC_CONSTRAINT_KINDS } from '@/core/types';

export interface StrategicConstraintPresentation {
  /** Tie-break among equal severities: lower is more pressing. Unique per kind. */
  rank: number;
  /** The noun used by "<label> is no longer a concern" in the since-your-last-turn history. */
  label: string;
  advisor: AdvisorType;
  /** Why the player should care. States only what the game really does. */
  why: string;
}

export const STRATEGIC_CONSTRAINT_PRESENTATION: Record<StrategicConstraintKind, StrategicConstraintPresentation> = {
  unrest: {
    rank: 0,
    label: 'Unrest',
    advisor: 'chancellor',
    why: 'Unrest cuts a city\'s output and can spread to its neighbours.',
  },
  blockade: {
    rank: 1,
    label: 'The blockade',
    advisor: 'warchief',
    why: 'It lasts until the hostile warships leave, a warship of yours contests the waters, or the war ends.',
  },
  gold: {
    rank: 2,
    label: 'The treasury',
    advisor: 'treasurer',
    why: 'Unpaid upkeep keeps draining the treasury until income catches up.',
  },
  supply: {
    rank: 3,
    label: 'Army supply',
    advisor: 'warchief',
    why: 'Units without supply grow weaker until they return to friendly ground.',
  },
  food: {
    rank: 4,
    label: 'Food',
    advisor: 'treasurer',
    why: 'Food keeps growth alive. A city that cannot grow stops adding output.',
  },
  production: {
    rank: 5,
    label: 'Production',
    advisor: 'builder',
    why: 'A stalled queue wastes turns the empire could spend building.',
  },
  science: {
    rank: 6,
    label: 'Research',
    advisor: 'scholar',
    why: 'Research unlocks every new unit, building and wonder.',
  },
};

/** Most pressing first, derived from the table so the order and the inventory cannot drift. */
export const CONSTRAINT_KIND_ORDER: readonly StrategicConstraintKind[] = [...STRATEGIC_CONSTRAINT_KINDS]
  .sort((a, b) => STRATEGIC_CONSTRAINT_PRESENTATION[a].rank - STRATEGIC_CONSTRAINT_PRESENTATION[b].rank);
