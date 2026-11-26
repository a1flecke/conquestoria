import type { StartFloorFailure } from '@/systems/start-quality';

export interface KnownStartViolation {
  /** `[hotseat:]<script>/<size>/<placement mode or ->` */
  config: string;
  owner: 'major' | 'city-state';
  failure: StartFloorFailure | 'capital-distance';
}

export function startViolationKey(v: KnownStartViolation): string {
  return `${v.config}|${v.owner}|${v.failure}`;
}

/**
 * Violations placement still produces. Empty since True Start homelands were moved onto livable land (#1837); the start
 * outcome matrix fails on any new violation, so this list should stay empty. An entry needs a written reason and an
 * owner issue, and the matrix fails when an entry stops reproducing.
 */
export const KNOWN_START_VIOLATIONS: ReadonlyArray<KnownStartViolation> = [];
