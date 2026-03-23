// --- Hex Coordinates ---

export interface HexCoord {
  q: number;
  r: number;
}

// --- Terrain ---

export type TerrainType =
  | 'grassland' | 'plains' | 'desert' | 'tundra' | 'snow'
  | 'forest' | 'hills' | 'mountain' | 'ocean' | 'coast'
  | 'jungle' | 'swamp' | 'volcanic';

export type Elevation = 'lowland' | 'highland' | 'mountain';

export interface TerrainInfo {
  type: TerrainType;
  elevation: Elevation;
  movementCost: number;
  defenseBonus: number;
  yields: ResourceYield;
  passable: boolean;
  visionBonus: number; // extra vision range from this tile
}

// --- Resources ---

export interface ResourceYield {
  food: number;
  production: number;
  gold: number;
  science: number;
}

// --- Map ---

export type VisibilityState = 'unexplored' | 'fog' | 'visible';

export type ImprovementType = 'farm' | 'mine' | 'none';

export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: Elevation;
  resource: string | null;          // strategic/luxury resource on this tile
  improvement: ImprovementType;
  owner: string | null;             // civilization ID that owns this tile
  improvementTurnsLeft: number;     // turns remaining to complete improvement
  hasRiver: boolean;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Record<string, HexTile>;   // key is "q,r"
  wrapsHorizontally: boolean;
  rivers: Array<{ from: HexCoord; to: HexCoord }>;
}

// --- Visibility (per player) ---

export interface VisibilityMap {
  tiles: Record<string, VisibilityState>; // key is "q,r"
}

// --- Units ---

export type UnitType = 'settler' | 'worker' | 'scout' | 'warrior';

export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;          // 0 for non-combat units
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  owner: string;             // civilization ID
  position: HexCoord;
  movementPointsLeft: number;
  health: number;            // 0-100
  experience: number;
  hasMoved: boolean;
  hasActed: boolean;         // used action this turn (build, found, etc.)
}

// --- Cities ---

export type BuildingCategory = 'production' | 'food' | 'science' | 'economy' | 'military' | 'culture';

export interface AdjacencyBonus {
  adjacentTo: string;
  yields: Partial<ResourceYield>;
}

export interface Building {
  id: string;
  name: string;
  category?: BuildingCategory;
  yields: ResourceYield;
  productionCost: number;
  description: string;
  techRequired?: string | null;
  adjacencyBonuses?: AdjacencyBonus[];
}

export interface City {
  id: string;
  name: string;
  owner: string;
  position: HexCoord;
  population: number;
  food: number;              // accumulated food toward next population
  foodNeeded: number;        // food required for next pop
  buildings: string[];       // building IDs
  productionQueue: string[]; // what's being built (building or unit ID)
  productionProgress: number;
  ownedTiles: HexCoord[];    // tiles this city works
  grid: (string | null)[][];  // 5x5 city interior grid
  gridSize: number;           // unlocked grid size (3, 4, or 5)
}

// --- Tech ---

export type TechTrack = 'military' | 'economy' | 'science' | 'civics' | 'exploration';

export type TechStatus = 'locked' | 'available' | 'researching' | 'completed';

export interface Tech {
  id: string;
  name: string;
  track: TechTrack;
  cost: number;
  prerequisites: string[];   // tech IDs
  unlocks: string[];         // what this tech enables (descriptions)
  era: number;               // 1-3 for milestone 1
}

export interface TechState {
  completed: string[];       // tech IDs
  currentResearch: string | null;
  researchProgress: number;
  trackPriorities: Record<TechTrack, 'high' | 'medium' | 'low' | 'ignore'>;
}

// --- Civilization Definitions ---

export type PersonalityTrait = 'aggressive' | 'diplomatic' | 'expansionist' | 'trader';

export interface PersonalityTraits {
  traits: PersonalityTrait[];
  warLikelihood: number;      // 0-1, how likely to declare war
  diplomacyFocus: number;     // 0-1, how much to prioritize diplomacy
  expansionDrive: number;     // 0-1, how much to prioritize expansion
}

export type CivBonusEffect =
  | { type: 'faster_wonders'; speedMultiplier: number }
  | { type: 'auto_roads' }
  | { type: 'diplomacy_start_bonus'; bonus: number }
  | { type: 'mounted_movement'; bonus: number }
  | { type: 'free_tech_on_era' }
  | { type: 'faster_military'; speedMultiplier: number };

export interface CivDefinition {
  id: string;
  name: string;
  color: string;
  bonusName: string;
  bonusDescription: string;
  bonusEffect: CivBonusEffect;
  personality: PersonalityTraits;
}

// --- Diplomacy ---

export type DiplomaticAction =
  | 'declare_war'
  | 'request_peace'
  | 'non_aggression_pact'
  | 'trade_agreement'
  | 'open_borders'
  | 'alliance';

export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance';

export interface Treaty {
  type: TreatyType;
  civA: string;
  civB: string;
  turnsRemaining: number;     // -1 = permanent until broken
  goldPerTurn?: number;       // for trade agreements
}

export interface DiplomaticEvent {
  type: string;               // 'war_declared', 'peace_made', 'treaty_broken', etc.
  turn: number;
  otherCiv: string;
  weight: number;             // decays over time
}

export interface DiplomacyState {
  relationships: Record<string, number>;    // civId -> score (-100 to +100)
  treaties: Treaty[];
  events: DiplomaticEvent[];
  atWarWith: string[];
}

// --- Civilizations ---

export interface Civilization {
  id: string;
  name: string;
  color: string;
  isHuman: boolean;
  civType: string;              // references CivDefinition.id, 'generic' for legacy
  cities: string[];          // city IDs
  units: string[];           // unit IDs
  techState: TechState;
  gold: number;
  visibility: VisibilityMap;
  score: number;
  diplomacy: DiplomacyState;
}

// --- Barbarians ---

export interface BarbarianCamp {
  id: string;
  position: HexCoord;
  strength: number;          // grows over time
  spawnCooldown: number;     // turns until next raider spawns
}

// --- Combat ---

export interface CombatResult {
  attackerId: string;
  defenderId: string;
  attackerDamage: number;
  defenderDamage: number;
  attackerSurvived: boolean;
  defenderSurvived: boolean;
  attackerPosition: HexCoord;
  defenderPosition: HexCoord;
}

// --- Tutorial ---

export type TutorialStep =
  | 'welcome'
  | 'found_city'
  | 'explore'
  | 'build_improvement'
  | 'research_tech'
  | 'build_unit'
  | 'combat'
  | 'complete';

export interface TutorialState {
  active: boolean;
  currentStep: TutorialStep;
  completedSteps: TutorialStep[];
}

// --- Game State (the whole thing) ---

export interface GameState {
  turn: number;
  era: number;
  civilizations: Record<string, Civilization>;
  map: GameMap;
  units: Record<string, Unit>;
  cities: Record<string, City>;
  barbarianCamps: Record<string, BarbarianCamp>;
  tutorial: TutorialState;
  currentPlayer: string;     // civ ID whose turn it is
  gameOver: boolean;
  winner: string | null;
  settings: GameSettings;
}

export interface GameSettings {
  mapSize: 'small';          // only small for M1
  soundEnabled: boolean;
  musicEnabled: boolean;
  musicVolume: number;       // 0-1
  sfxVolume: number;         // 0-1
  tutorialEnabled: boolean;
}

// --- Events ---

export interface GameEvents {
  'turn:start': { turn: number; playerId: string };
  'turn:end': { turn: number; playerId: string };
  'unit:move': { unitId: string; from: HexCoord; to: HexCoord };
  'unit:created': { unit: Unit };
  'unit:destroyed': { unitId: string; position: HexCoord };
  'city:founded': { city: City };
  'city:building-complete': { cityId: string; buildingId: string };
  'city:unit-trained': { cityId: string; unitType: UnitType };
  'city:grew': { cityId: string; newPopulation: number };
  'combat:resolved': { result: CombatResult };
  'tech:completed': { civId: string; techId: string };
  'tech:started': { civId: string; techId: string };
  'fog:revealed': { tiles: HexCoord[] };
  'improvement:started': { unitId: string; coord: HexCoord; type: ImprovementType };
  'improvement:completed': { coord: HexCoord; type: ImprovementType };
  'barbarian:spawned': { campId: string; unitId: string };
  'barbarian:camp-destroyed': { campId: string; reward: number };
  'tutorial:step': { step: TutorialStep; message: string; advisor: 'builder' | 'explorer' };
  'notification:show': { message: string; type: 'info' | 'warning' | 'success' };
  'game:saved': { turn: number };
  'game:loaded': { turn: number };
  'game:over': { winnerId: string };
  'grid:slot-unlocked': { cityId: string; newGridSize: number };
  'grid:building-placed': { cityId: string; buildingId: string; row: number; col: number };
  'diplomacy:war-declared': { attackerId: string; defenderId: string };
  'diplomacy:peace-made': { civA: string; civB: string };
  'diplomacy:treaty-proposed': { fromCiv: string; toCiv: string; treaty: TreatyType };
  'diplomacy:treaty-accepted': { civA: string; civB: string; treaty: TreatyType };
  'diplomacy:treaty-broken': { breakerId: string; otherCiv: string; treaty: TreatyType };
  'ui:select-unit': { unitId: string };
  'ui:select-city': { cityId: string };
  'ui:deselect': {};
}
