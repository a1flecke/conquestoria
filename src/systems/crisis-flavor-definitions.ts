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

function countFarmsInTerritory(state: GameState, city: City): number {
  return city.ownedTiles.filter(coord => state.map.tiles[hexKey(coord)]?.improvement === 'farm').length;
}

function isPlainsOrGrasslandCity(state: GameState, city: City): boolean {
  const cityTile = state.map.tiles[hexKey(city.position)];
  return cityTile?.terrain === 'plains' || cityTile?.terrain === 'grassland';
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
    displayNamesByEra: { 2: 'The Sweating Sickness', 4: 'The Great Pestilence', 6: 'Cholera Outbreak', 9: 'Influenza Pandemic', 11: 'The Novel Contagion' },
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
    displayNamesByEra: { 2: 'The Mountain of Fire Wakes', 5: 'The Fire Below Stirs', 7: 'Cataclysmic Eruption', 10: 'The Ash-Choked Sky' },
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
    displayNamesByEra: { 2: 'The Ground Trembles', 5: 'The Shaking Earth', 8: 'The Great Quake', 11: 'The Seismic Collapse' },
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
    displayNamesByEra: { 2: 'The River Rises', 6: 'The Hundred-Year Flood', 9: 'The Levee Breaks' },
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
    displayNamesByEra: { 2: 'Fire on the Wind', 5: 'The Dry Season Burns', 9: 'Megafire' },
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
    displayNamesByEra: { 2: 'The Long Winter', 5: 'The Little Ice Age', 8: 'The Killing Frost' },
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
    displayNamesByEra: { 2: 'Beast Awakening', 4: 'The Old Terror Wakes', 6: 'The Ancient Stirring' },
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
    displayNamesByEra: { 2: 'Bandit Uprising', 4: 'The Highway Robbers', 6: 'The Outlaw Gang' },
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
    displayNamesByEra: { 4: 'Corsair Armada', 7: 'The Buccaneer Fleet', 10: 'The Iron-Clad Raiders' },
    advisorLine: '{name} raids the waters near {city}! Slay it to end the threat — any civilization may claim the hunt.',
    responseActions: [],
    hunt: { spawnKind: 'pirate' },
  },
  {
    id: 'crop-blight',
    archetype: 'famine', // #590 MR3: re-homed from outbreak — famine, not disease
    // Grace-period floor is era 2 for standard/veteran, era 3 for explorer (see
    // opponent-challenge.ts crisisGraceMaxEra) — an era-1 band start would never
    // actually be reachable, so this starts at era 2 like the other outbreaks/
    // catastrophes rather than shipping unreachable era-1 display-name content.
    eraBand: [2, 10],
    geographyPredicate: (state, city) =>
      countFarmsInTerritory(state, city) >= 2 || isPlainsOrGrasslandCity(state, city),
    spreadBoostPredicate: (state, city) => nearTerrain(state, city, ['plains'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.15, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.25, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.35, popLossEveryNTurnsIgnored: 3,    autoExpireTurns: null },
    },
    displayNamesByEra: { 2: 'The Withering', 4: 'The Blackened Rows', 6: 'The Potato Blight', 9: 'The Rust Fungus' },
    advisorLine: '{name} has struck the fields near {city}! Quarantine the city to stop the spread, or import grain to speed recovery.',
    responseActions: ['quarantine', 'remedy'],
  },
  {
    id: 'locust-swarm',
    archetype: 'famine', // #590 MR3: re-homed from outbreak — famine, not disease
    eraBand: [2, 8],
    geographyPredicate: (state, city) => nearTerrain(state, city, ['plains', 'grassland'], 2),
    spreadBoostPredicate: (state, city) => nearTerrain(state, city, ['plains', 'grassland'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.15, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.25, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.35, popLossEveryNTurnsIgnored: 3,    autoExpireTurns: null },
    },
    displayNamesByEra: { 2: 'The Devouring Cloud', 5: 'The Locust Storm' },
    advisorLine: '{name} descends on the farmland near {city}! Quarantine the city to stop the spread, or import grain to speed recovery.',
    responseActions: ['quarantine', 'remedy'],
  },
  {
    id: 'failed-harvest',
    archetype: 'famine',
    // Mild, era-agnostic: any city can have a bad growing season, no terrain gate.
    // Grace-period floor is era 2 (see crop-blight's comment above) — same convention.
    eraBand: [2, 12],
    geographyPredicate: () => true,
    severityByChallenge: {
      explorer: { yieldPenalty: 0.10, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.15, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: 4,    autoExpireTurns: null },
    },
    displayNamesByEra: { 2: 'A Thin Harvest', 5: 'The Lean Season', 8: 'The Failed Crop' },
    advisorLine: '{name} has left the granaries near {city} half-empty! Quarantine the city to stop the spread, or import grain to speed recovery.',
    responseActions: ['quarantine', 'remedy'],
  },
  {
    id: 'great-famine',
    archetype: 'famine',
    // Severe, later-era escalation of the same farmland geography crop-blight uses —
    // deliberately not a new geography concept, just a worse version for later eras.
    eraBand: [6, 12],
    geographyPredicate: (state, city) =>
      countFarmsInTerritory(state, city) >= 2 || isPlainsOrGrasslandCity(state, city),
    spreadBoostPredicate: (state, city) => nearTerrain(state, city, ['plains'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.30, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.40, popLossEveryNTurnsIgnored: 2,    autoExpireTurns: null },
    },
    displayNamesByEra: { 6: 'The Great Famine', 9: 'The Starving Time' },
    advisorLine: '{name} devastates the countryside near {city}! Quarantine the city to stop the spread, or import grain to speed recovery.',
    responseActions: ['quarantine', 'remedy'],
  },
  {
    id: 'red-tide',
    archetype: 'outbreak',
    eraBand: [3, 12],
    geographyPredicate: (state, city) => isCoastalCity(state, city),
    spreadBoostPredicate: (state, city) => nearTerrain(state, city, ['coast', 'ocean'], 1),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.15, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.25, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.35, popLossEveryNTurnsIgnored: 3,    autoExpireTurns: null },
    },
    displayNamesByEra: { 3: 'The Crimson Waters', 7: 'The Poisoned Tide', 11: 'The Algal Bloom' },
    advisorLine: '{name} fouls the harbor near {city}! Quarantine the city to stop the spread, or fund a remedy effort to cure it.',
    responseActions: ['quarantine', 'remedy'],
  },
  {
    id: 'dire-pack',
    archetype: 'hunt',
    eraBand: [2, 4],
    geographyPredicate: (state, city) => nearTerrain(state, city, ['forest', 'tundra'], 3),
    severityByChallenge: NO_ATTRITION_SEVERITY,
    displayNamesByEra: { 2: 'Dire Pack' },
    advisorLine: '{name} stalks the wilds near {city}! Slay it to end the threat — any civilization may claim the hunt.',
    responseActions: [],
    hunt: { spawnKind: 'beast' },
  },
  {
    id: 'kraken-sighting',
    archetype: 'hunt',
    // Uses spawnKind: 'beast' rather than a pirate sea-monster name pool — the
    // `sea_serpent` entry (habitatTerrains: ['ocean'], awakenEra: 3) already exists in
    // beast-definitions.ts, so no new spawn mechanism was needed (per MR5 scope: data
    // rows only, no resolver changes). Note for reviewers: spawnBeastHunt in
    // crisis-system.ts picks its spawned beast at random from all era-eligible
    // BEAST_DEFINITIONS regardless of which flavor triggered the hunt (pre-existing
    // behavior shared with beast-awakening/dire-pack) — this flavor's geography gate
    // guarantees an ocean-adjacent city, not that the sea_serpent specifically spawns.
    eraBand: [5, 12],
    geographyPredicate: (state, city) => nearTerrain(state, city, ['ocean'], 3),
    severityByChallenge: NO_ATTRITION_SEVERITY,
    displayNamesByEra: { 5: 'Kraken Sighting', 8: 'The Deep Stirs' },
    advisorLine: '{name} has been sighted off the coast near {city}! Slay it to end the threat — any civilization may claim the hunt.',
    responseActions: [],
    hunt: { spawnKind: 'beast' },
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
