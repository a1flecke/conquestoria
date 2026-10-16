// Great General command presentation contract (#889). Leaf: type-only import of another leaf, never the barrel, so the
// event map can name it without closing an import cycle through the systems layer.
import type { HexCoord } from './hex';

export type GeneralAbilityKind = 'rally' | 'seize' | 'last-stand';

/**
 * What a Great General command looked like to the player: which units it touched, where, in whose colours and with
 * what one-line result. Derived by `describeGeneralAbilityMoment` from the before/after state difference; presentation
 * only, never persisted.
 */
export interface GeneralAbilityMoment {
  readonly kind: GeneralAbilityKind;
  readonly civId: string;
  readonly generalUnitId: string;
  readonly generalName: string;
  /** The last Command Charge: the General retires at the end of this turn. */
  readonly isFinalCommand: boolean;
  readonly generalCoord: HexCoord;
  /** Distinct hexes of the units the command touched, nearest-first and bounded for drawing. */
  readonly affectedCoords: readonly HexCoord[];
  readonly affectedCount: number;
  /** The General's crest colours, so each General's commands look like theirs. */
  readonly accent: string;
  readonly glow: string;
  /** One plain sentence stating the result (and the retirement, for a Final Command). */
  readonly summary: string;
}
