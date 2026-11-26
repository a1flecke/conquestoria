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
export const KNOWN_START_VIOLATIONS: ReadonlyArray<KnownStartViolation> = [
  { config: 'earth/large/historical', owner: 'major', failure: 'frozen' },
  { config: 'earth/large/historical', owner: 'major', failure: 'land-food' },
  { config: 'earth/large/historical', owner: 'major', failure: 'land-production' },
  { config: 'earth/large/historical', owner: 'major', failure: 'land-r2' },
  { config: 'earth/large/historical', owner: 'major', failure: 'polar-band' },
  { config: 'earth/medium/historical', owner: 'major', failure: 'land-food' },
  { config: 'earth/medium/historical', owner: 'major', failure: 'land-production' },
  { config: 'earth/medium/historical', owner: 'major', failure: 'land-r2' },
  { config: 'earth/small/historical', owner: 'major', failure: 'expansion-room' },
  { config: 'earth/small/historical', owner: 'major', failure: 'land-food' },
  { config: 'earth/small/historical', owner: 'major', failure: 'land-production' },
  { config: 'earth/small/historical', owner: 'major', failure: 'land-r2' },
  { config: 'old-world/large/historical', owner: 'major', failure: 'land-food' },
  { config: 'old-world/large/historical', owner: 'major', failure: 'land-production' },
  { config: 'old-world/large/historical', owner: 'major', failure: 'land-r2' },
  { config: 'old-world/medium/historical', owner: 'major', failure: 'land-food' },
];
