import type { City, CrisisArchetype, GameState, HexCoord, HexTile, OpponentChallenge, TerrainType } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

export interface CrisisSeverity {
  yieldPenalty: number;                 // 0.25 = city yields ×0.75 while afflicted
  popLossEveryNTurnsIgnored: number | null;
  autoExpireTurns: number | null;
}

export interface CatastropheParams {
  blastRadius: number;
  devastationTurnsByChallenge: Record<OpponentChallenge, number>;
  destroysEpicenterImprovement: boolean; // only meaningful on veteran era >= 3; resolver enforces
}

export interface HuntParams {
  spawnKind: 'beast' | 'barbarian-camp' | 'pirate';
  // Deviation from the original plan's `namePoolKey`: the spawner picks the named-foe
  // pool by the target civ's own civType (matches BANDIT_LORD_NAMES's existing
  // civType-keyed shape) rather than a fixed pool key — more thematic, and civType is
  // already known at spawn time, so a separate key would be redundant.
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
  catastrophe?: CatastropheParams;             // only present when archetype === 'catastrophe'
  hunt?: HuntParams;                            // only present when archetype === 'hunt'
}

function tilesWithinRadius(state: GameState, center: HexCoord, radius: number): HexTile[] {
  const seen = new Set<string>([hexKey(center)]);
  let frontier = [center];
  const collected: HexTile[] = [];
  for (let step = 0; step < radius; step++) {
    const next: HexCoord[] = [];
    for (const coord of frontier) {
      for (const nb of hexNeighbors(coord)) {
        const key = hexKey(nb);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(nb);
        const t = state.map.tiles[key];
        if (t) collected.push(t);
      }
    }
    frontier = next;
  }
  return collected;
}

function nearTerrain(state: GameState, city: City, terrains: TerrainType[], radius: number): boolean {
  return tilesWithinRadius(state, city.position, radius).some(t => terrains.includes(t.terrain));
}

function countNearTerrain(state: GameState, city: City, terrains: TerrainType[], radius: number): number {
  return tilesWithinRadius(state, city.position, radius).filter(t => terrains.includes(t.terrain)).length;
}

function hasRiverOrCoastalFlood(state: GameState, city: City): boolean {
  const cityTile = state.map.tiles[hexKey(city.position)];
  if (cityTile?.hasRiver) return true;
  return nearTerrain(state, city, ['coast'], 1);
}

function isCoastalCity(state: GameState, city: City): boolean {
  const cityTile = state.map.tiles[hexKey(city.position)];
  if (cityTile?.terrain === 'coast') return true;
  return nearTerrain(state, city, ['ocean', 'coast'], 1);
}

// No severity-driven yield penalty, pop loss, or auto-expiry for Hunt flavors — the
// archetype resolves via combat (the foe dying), not attrition or a timer. Shared
// across all three hunt flavors since none of them vary this by challenge level;
// challenge instead governs veteran-only escalation (see tickHuntCrisis).
const NO_ATTRITION_SEVERITY: Record<OpponentChallenge, CrisisSeverity> = {
  explorer: { yieldPenalty: 0, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
  standard: { yieldPenalty: 0, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
  veteran: { yieldPenalty: 0, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
};

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
  {
    id: 'volcanic-eruption',
    archetype: 'catastrophe',
    eraBand: [2, 12],
    geographyPredicate: (state, city) => nearTerrain(state, city, ['volcanic'], 3),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.10, popLossEveryNTurnsIgnored: null, autoExpireTurns: 4 },
      standard: { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: null, autoExpireTurns: 8 },
      veteran:  { yieldPenalty: 0.30, popLossEveryNTurnsIgnored: null, autoExpireTurns: 10 },
    },
    displayNamesByEra: { 2: 'The Mountain of Fire Wakes', 7: 'Cataclysmic Eruption' },
    advisorLine: '{name} strikes near {city}! Send workers to restore the land within 5 turns for a resilience bonus.',
    responseActions: [],
    catastrophe: {
      blastRadius: 2,
      devastationTurnsByChallenge: { explorer: 4, standard: 8, veteran: 10 },
      destroysEpicenterImprovement: true,
    },
  },
  {
    id: 'earthquake',
    archetype: 'catastrophe',
    eraBand: [2, 12],
    geographyPredicate: (state, city) => nearTerrain(state, city, ['mountain', 'hills'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.10, popLossEveryNTurnsIgnored: null, autoExpireTurns: 4 },
      standard: { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: null, autoExpireTurns: 8 },
      veteran:  { yieldPenalty: 0.30, popLossEveryNTurnsIgnored: null, autoExpireTurns: 10 },
    },
    displayNamesByEra: { 2: 'The Ground Trembles', 8: 'The Great Quake' },
    advisorLine: '{name} strikes near {city}! Send workers to restore the land within 5 turns for a resilience bonus.',
    responseActions: [],
    catastrophe: {
      blastRadius: 2,
      devastationTurnsByChallenge: { explorer: 4, standard: 8, veteran: 10 },
      destroysEpicenterImprovement: true,
    },
  },
  {
    id: 'river-flood',
    archetype: 'catastrophe',
    eraBand: [2, 12],
    geographyPredicate: (state, city) => hasRiverOrCoastalFlood(state, city),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.10, popLossEveryNTurnsIgnored: null, autoExpireTurns: 4 },
      standard: { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: null, autoExpireTurns: 8 },
      veteran:  { yieldPenalty: 0.30, popLossEveryNTurnsIgnored: null, autoExpireTurns: 10 },
    },
    displayNamesByEra: { 2: 'The River Rises', 6: 'The Hundred-Year Flood' },
    advisorLine: '{name} strikes near {city}! Send workers to restore the land within 5 turns for a resilience bonus.',
    responseActions: [],
    catastrophe: {
      blastRadius: 1,
      devastationTurnsByChallenge: { explorer: 4, standard: 8, veteran: 10 },
      destroysEpicenterImprovement: true,
    },
  },
  {
    id: 'wildfire',
    archetype: 'catastrophe',
    eraBand: [2, 12],
    geographyPredicate: (state, city) => countNearTerrain(state, city, ['forest'], 2) >= 3,
    severityByChallenge: {
      explorer: { yieldPenalty: 0.10, popLossEveryNTurnsIgnored: null, autoExpireTurns: 4 },
      standard: { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: null, autoExpireTurns: 8 },
      veteran:  { yieldPenalty: 0.30, popLossEveryNTurnsIgnored: null, autoExpireTurns: 10 },
    },
    displayNamesByEra: { 2: 'Fire on the Wind', 9: 'Megafire' },
    advisorLine: '{name} strikes near {city}! Send workers to restore the land within 5 turns for a resilience bonus.',
    responseActions: [],
    catastrophe: {
      blastRadius: 2,
      devastationTurnsByChallenge: { explorer: 4, standard: 8, veteran: 10 },
      destroysEpicenterImprovement: true,
    },
  },
  {
    id: 'harsh-winter',
    archetype: 'catastrophe',
    eraBand: [2, 12],
    geographyPredicate: (state, city) => nearTerrain(state, city, ['tundra', 'snow'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.10, popLossEveryNTurnsIgnored: null, autoExpireTurns: 4 },
      standard: { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: null, autoExpireTurns: 8 },
      veteran:  { yieldPenalty: 0.30, popLossEveryNTurnsIgnored: null, autoExpireTurns: 10 },
    },
    displayNamesByEra: { 2: 'The Long Winter', 5: 'The Little Ice Age' },
    advisorLine: '{name} strikes near {city}! Send workers to restore the land within 5 turns for a resilience bonus.',
    responseActions: [],
    catastrophe: {
      blastRadius: 2,
      devastationTurnsByChallenge: { explorer: 4, standard: 8, veteran: 10 },
      destroysEpicenterImprovement: true,
    },
  },
  {
    id: 'beast-awakening',
    archetype: 'hunt',
    eraBand: [2, 6],
    geographyPredicate: (state, city) =>
      // Matches turn-manager.ts's own beast-processing gate: `state.beasts` must exist
      // AND not be 'off' — undefined means beasts were never initialized (e.g. a legacy
      // save mid-migration), not "on by default".
      !!state.beasts && state.beasts.mode !== 'off' && nearTerrain(state, city, ['forest', 'mountain', 'jungle'], 4),
    severityByChallenge: NO_ATTRITION_SEVERITY,
    displayNamesByEra: { 2: 'Beast Awakening' },
    advisorLine: '{name} has awoken near {city}! Slay it to end the threat — any civilization may claim the hunt.',
    responseActions: [],
    hunt: { spawnKind: 'beast' },
  },
  {
    id: 'bandit-uprising',
    archetype: 'hunt',
    eraBand: [2, 8],
    geographyPredicate: () => true,
    severityByChallenge: NO_ATTRITION_SEVERITY,
    displayNamesByEra: { 2: 'Bandit Uprising' },
    advisorLine: '{name} has raised a bandit camp near {city}! Slay it to end the threat — any civilization may claim the hunt.',
    responseActions: [],
    hunt: { spawnKind: 'barbarian-camp' },
  },
  {
    id: 'corsair-armada',
    archetype: 'hunt',
    eraBand: [4, 12],
    geographyPredicate: (state, city) => isCoastalCity(state, city),
    severityByChallenge: NO_ATTRITION_SEVERITY,
    displayNamesByEra: { 4: 'Corsair Armada' },
    advisorLine: '{name} raids the waters near {city}! Slay it to end the threat — any civilization may claim the hunt.',
    responseActions: [],
    hunt: { spawnKind: 'pirate' },
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
