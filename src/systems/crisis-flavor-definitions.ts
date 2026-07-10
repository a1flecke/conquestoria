import type { City, CrisisArchetype, GameState, OpponentChallenge, TerrainType } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

export interface CrisisSeverity {
  yieldPenalty: number;                 // 0.25 = city yields ×0.75 while afflicted
  popLossEveryNTurnsIgnored: number | null;
  autoExpireTurns: number | null;
}

export interface CrisisFlavor {
  id: string;
  archetype: CrisisArchetype;
  eraBand: [number, number];
  geographyPredicate: (state: GameState, city: City) => boolean;
  spreadBoostPredicate?: (state: GameState, city: City) => boolean;
  severityByChallenge: Record<OpponentChallenge, CrisisSeverity>;
  displayNamesByEra: Record<number, string>;   // sparse — nearest era at or below is used
  advisorLine: string;                         // '{name} has reached {city}! <what to do>'
  responseActions: Array<'quarantine' | 'remedy'>;
}

function nearTerrain(state: GameState, city: City, terrains: TerrainType[], radius: number): boolean {
  const seen = new Set<string>([hexKey(city.position)]);
  let frontier = [city.position];
  for (let step = 0; step < radius; step++) {
    const next = [];
    for (const coord of frontier) {
      for (const nb of hexNeighbors(coord)) {
        const key = hexKey(nb);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(nb);
        const t = state.map.tiles[key];
        if (t && terrains.includes(t.terrain)) return true;
      }
    }
    frontier = next;
  }
  return false;
}

export const CRISIS_FLAVORS: CrisisFlavor[] = [
  {
    id: 'plague',
    archetype: 'outbreak',
    eraBand: [2, 12],
    geographyPredicate: (state, city) =>
      city.population >= 4 || nearTerrain(state, city, ['swamp', 'jungle'], 2),
    spreadBoostPredicate: (state, city) => nearTerrain(state, city, ['swamp', 'jungle'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.15, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.25, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.35, popLossEveryNTurnsIgnored: 3,    autoExpireTurns: null },
    },
    displayNamesByEra: { 2: 'The Sweating Sickness', 4: 'The Great Pestilence', 6: 'Cholera Outbreak', 9: 'Influenza Pandemic' },
    advisorLine: '{name} has reached {city}! Quarantine the city to stop the spread, or fund a remedy effort to cure it.',
    responseActions: ['quarantine', 'remedy'],
  },
];

export function getCrisisFlavor(id: string): CrisisFlavor | undefined {
  return CRISIS_FLAVORS.find(f => f.id === id);
}

export function getCrisisDisplayName(flavor: CrisisFlavor, era: number): string {
  const keys = Object.keys(flavor.displayNamesByEra).map(Number).sort((a, b) => a - b);
  let chosen = keys[0];
  for (const key of keys) {
    if (key <= era) chosen = key;
  }
  return flavor.displayNamesByEra[chosen];
}
