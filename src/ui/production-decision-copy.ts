// src/ui/production-decision-copy.ts
// Production-decision arc: the words for what `getProductionDecision` knows. Plain strings only (callers set them with
// textContent), kept out of city-panel.ts so the wording is unit-testable and cannot drift from the numbers: every
// sentence is built from the decision's own fields and says "about"/"expected" because the per-turn figure is an
// estimate. Nothing here decides anything; a rule change belongs in the systems query, not in this copy.
import type { ProductionDecision } from '@/systems/production-decision';

export interface ProductionDecisionNotes {
  /** Why buying now is or is not worth gold. Null when there is nothing useful to add (e.g. already disabled with its own reason). */
  rushNote: string | null;
  /** What happens to production beyond the item's remaining cost. Null when there is no surplus. */
  overflowNote: string | null;
  /** Why the item cannot progress by itself (locked or no output). Null when it is progressing. */
  stalledNote: string | null;
}

const turns = (count: number): string => `${count} turn${count === 1 ? '' : 's'}`;

export function describeProductionDecision(decision: ProductionDecision | null): ProductionDecisionNotes {
  if (!decision) return { rushNote: null, overflowNote: null, stalledNote: null };

  let stalledNote: string | null = null;
  if (decision.locked) {
    stalledNote = 'Production is paused in this city right now, so this item will not progress by itself.';
  } else if (decision.turnsToComplete === null) {
    stalledNote = 'This city is not producing anything right now, so this item will not progress by itself.';
  }

  let rushNote: string | null = null;
  if (decision.rush.available) {
    if (decision.rush.redundant) {
      rushNote = 'This city is expected to finish this item next turn without spending gold. Buying now completes it immediately.';
    } else if (decision.rush.turnsSaved === null) {
      rushNote = 'Buying is the only way to finish this item while the city is not producing.';
    } else if (decision.rush.turnsSaved > 0) {
      rushNote = `Buying now finishes this about ${turns(decision.rush.turnsSaved)} sooner than waiting.`;
    }
  }

  let overflowNote: string | null = null;
  const { excess, outcome, carryNeedsQueuedItem } = decision.overflow;
  if (excess > 0 && outcome === 'discarded') {
    overflowNote = `This city makes more than this item still needs: about ${excess} production beyond it would be lost.`
      + (carryNeedsQueuedItem
        ? ' 3d-printing can carry it over, but only when another item is queued behind this one.'
        : ' Surplus normally does not carry over; the 3d-printing technology changes that when another item is queued behind.');
  } else if (excess > 0 && outcome === 'carried') {
    overflowNote = `About ${excess} production beyond this item will carry over to the next queued item.`;
  }

  return { rushNote, overflowNote, stalledNote };
}

/** Shown beside the control that would put another item first. Null when nothing stored would be lost. */
export function describeHeadChangeLoss(progressLost: number): string | null {
  if (!(progressLost > 0)) return null;
  return `Moving this to the front replaces the current project and loses ${progressLost} stored production.`;
}

/** The second-step label once the player has armed a loss-causing change. */
export function headChangeConfirmLabel(progressLost: number): string {
  return `Lose ${progressLost}?`;
}
