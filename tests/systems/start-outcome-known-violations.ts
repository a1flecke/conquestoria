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

/** Violations placement still produces. Must only shrink; the start-outcome matrix fails on a stale entry. */
// Remaining entries are exact True Start homelands that fail the floor on the regenerated maps (an island too small
// for a second city, a polar homeland). Moving a real homeland is the next delivery's decision (design B4).
export const KNOWN_START_VIOLATIONS: ReadonlyArray<KnownStartViolation> = [
  { config: 'earth/large/historical', owner: 'major', failure: 'expansion-room' },
  { config: 'earth/large/historical', owner: 'major', failure: 'land-food' },
  { config: 'earth/large/historical', owner: 'major', failure: 'land-r2' },
  { config: 'earth/large/historical', owner: 'major', failure: 'polar-band' },
  { config: 'earth/medium/historical', owner: 'major', failure: 'polar-band' },
  { config: 'earth/small/historical', owner: 'major', failure: 'land-production' },
  { config: 'new-world/large/historical', owner: 'major', failure: 'land-food' },
  { config: 'new-world/large/historical', owner: 'major', failure: 'land-production' },
  { config: 'new-world/large/historical', owner: 'major', failure: 'land-r2' },
  { config: 'new-world/medium/historical', owner: 'major', failure: 'land-food' },
  { config: 'new-world/medium/historical', owner: 'major', failure: 'land-r2' },
  { config: 'old-world/medium/historical', owner: 'major', failure: 'expansion-room' },
  { config: 'old-world/medium/historical', owner: 'major', failure: 'land-food' },
  { config: 'old-world/medium/historical', owner: 'major', failure: 'land-production' },
  { config: 'old-world/medium/historical', owner: 'major', failure: 'land-r2' },
];
