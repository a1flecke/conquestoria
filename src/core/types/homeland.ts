import type { HexCoord } from './hex';

/**
 * Turn-1 homeland choice (design 2026-11-25, Phase C). A human civilization is offered up to three reserved starts: the
 * start it was placed on and up to two alternates. Every start-relative creation step saw all of them, so any choice
 * leaves a legal, fair world.
 */
export interface HomelandOption {
  coord: HexCoord;
  /** Short name of what the land is like, from the site's own surroundings ("River valley"). */
  character: string;
  /** One line of what is near the start, written from what a settler could see. */
  summary: string;
  /** How well the land around the start feeds a young city. */
  food: HomelandBand;
  /** How much the land around the start produces. */
  production: HomelandBand;
}

export type HomelandBand = 'lean' | 'fair' | 'rich';

export interface HomelandChoice {
  /** Option 0 is the start the civilization was placed on. */
  options: HomelandOption[];
  /** The option the civilization currently stands on. */
  selected: number;
}
