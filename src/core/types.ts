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

// --- Natural Wonders ---

export type WonderEffectType = 'adjacent_yield_bonus' | 'healing' | 'eruption' | 'vision' | 'combat_bonus' | 'none';

export type WonderEffect =
  | { type: 'adjacent_yield_bonus'; yields: Partial<ResourceYield> }
  | { type: 'healing'; hpPerTurn: number }
  | { type: 'eruption'; chance: number }
  | { type: 'vision'; bonus: number }
  | { type: 'combat_bonus'; defenseBonus: number }
  | { type: 'none' };

export interface WonderDefinition {
  id: string;
  name: string;
  description: string;
  yields: ResourceYield;
  discoveryBonus: { type: 'gold' | 'science' | 'production'; amount: number };
  effect: WonderEffect;
  validTerrain: TerrainType[];
}

// --- Tribal Villages ---

export type VillageOutcomeType = 'gold' | 'food' | 'science' | 'free_unit' | 'free_tech' | 'ambush' | 'illness';

export interface TribalVillage {
  id: string;
  position: HexCoord;
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
  wonder: string | null;           // wonder definition ID
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

export type UnitType = 'settler' | 'worker' | 'scout' | 'warrior' | 'swordsman' | 'pikeman' | 'musketeer';

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

export type TechTrack =
  | 'military' | 'economy' | 'science' | 'civics' | 'exploration'
  | 'agriculture' | 'medicine' | 'philosophy' | 'arts' | 'maritime'
  | 'metallurgy' | 'construction' | 'communication' | 'espionage' | 'spirituality';

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
  | { type: 'faster_military'; speedMultiplier: number }
  | { type: 'extra_tech_speed'; speedMultiplier: number }
  | { type: 'trade_route_bonus'; bonusGold: number }
  | { type: 'naval_bonus'; visionBonus: number }
  | { type: 'combat_production'; productionBonus: number }
  | { type: 'bushido' }
  | { type: 'faster_growth'; foodReduction: number };

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

// --- Minor Civilizations ---

export type MinorCivArchetype = 'militaristic' | 'mercantile' | 'cultural';

export type AllyBonus =
  | { type: 'free_unit'; unitType: UnitType; everyNTurns: number }
  | { type: 'gold_per_turn'; amount: number }
  | { type: 'science_per_turn'; amount: number }
  | { type: 'production_per_turn'; amount: number };

export interface MinorCivDefinition {
  id: string;
  name: string;
  archetype: MinorCivArchetype;
  description: string;
  allyBonus: AllyBonus;
  color: string;
}

export type QuestType = 'destroy_camp' | 'gift_gold' | 'defeat_units' | 'trade_route';

export type QuestTarget =
  | { type: 'destroy_camp'; campId: string }
  | { type: 'gift_gold'; amount: number }
  | { type: 'defeat_units'; count: number; nearPosition: HexCoord; radius: number }
  | { type: 'trade_route'; minorCivId: string };

export interface QuestReward {
  relationshipBonus: number;
  gold?: number;
  science?: number;
  freeUnit?: UnitType;
}

export interface Quest {
  id: string;
  type: QuestType;
  description: string;
  target: QuestTarget;
  reward: QuestReward;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  turnIssued: number;
  expiresOnTurn: number | null;
  chainNext?: string;
}

export interface MinorCivState {
  id: string;
  definitionId: string;
  cityId: string;
  units: string[];
  diplomacy: DiplomacyState;
  activeQuests: Record<string, Quest>;
  isDestroyed: boolean;
  garrisonCooldown: number;
  lastEraUpgrade: number;
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

// --- Game Modes ---

export type GameMode = 'solo' | 'hotseat';

export interface HotSeatPlayer {
  name: string;
  slotId: string;     // e.g. 'player-1', 'player-2', 'ai-1'
  civType: string;    // e.g. 'egypt', 'rome' — maps to CivDefinition.id
  isHuman: boolean;
}

export interface HotSeatConfig {
  playerCount: number;
  mapSize: 'small' | 'medium' | 'large';
  players: HotSeatPlayer[];
}

export interface GameEvent {
  type: string;
  message: string;
  turn: number;
}

// --- Trade & Resources ---

export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone';
export type ResourceType = LuxuryResource | StrategicResource;

export interface TradeRoute {
  fromCityId: string;
  toCityId: string;
  goldPerTurn: number;
  foreignCivId?: string;
}

export interface MarketplaceState {
  prices: Record<string, number>;
  priceHistory: Record<string, number[]>;
  fashionable: ResourceType | null;
  fashionTurnsLeft: number;
  tradeRoutes: TradeRoute[];
}

// --- Advisors ---

export type AdvisorType = 'builder' | 'explorer' | 'chancellor' | 'warchief' | 'treasurer' | 'scholar';

// --- Save Slots ---

export interface SaveSlotMeta {
  id: string;
  name: string;
  civType: string;
  turn: number;
  lastPlayed: string;
  gameMode?: GameMode;
  playerCount?: number;
  playerNames?: string[];
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
  minorCivs: Record<string, MinorCivState>;
  tutorial: TutorialState;
  currentPlayer: string;     // civ ID whose turn it is
  gameOver: boolean;
  winner: string | null;
  settings: GameSettings;
  marketplace?: MarketplaceState;
  hotSeat?: HotSeatConfig;
  pendingEvents?: Record<string, GameEvent[]>;
  tribalVillages: Record<string, TribalVillage>;
  discoveredWonders: Record<string, string>;       // wonderId -> first discoverer civId
  wonderDiscoverers: Record<string, string[]>;     // wonderId -> all discoverer civIds
}

export interface GameSettings {
  mapSize: 'small' | 'medium' | 'large';
  soundEnabled: boolean;
  musicEnabled: boolean;
  musicVolume: number;       // 0-1
  sfxVolume: number;         // 0-1
  tutorialEnabled: boolean;
  advisorsEnabled: Record<AdvisorType, boolean>;
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
  'tutorial:step': { step: TutorialStep; message: string; advisor: 'builder' | 'explorer' | 'scholar' };
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
  'advisor:message': { advisor: AdvisorType; message: string; icon: string };
  'trade:route-created': { route: TradeRoute };
  'trade:price-changed': { resource: ResourceType; oldPrice: number; newPrice: number };
  'wonder:discovered': { civId: string; wonderId: string; position: HexCoord; isFirstDiscoverer: boolean };
  'wonder:eruption': { wonderId: string; position: HexCoord; tilesAffected: HexCoord[] };
  'village:visited': { civId: string; position: HexCoord; outcome: VillageOutcomeType; message: string };
  'ui:select-unit': { unitId: string };
  'ui:select-city': { cityId: string };
  'ui:deselect': {};
  'minor-civ:quest-issued': { minorCivId: string; majorCivId: string; quest: Quest };
  'minor-civ:quest-completed': { minorCivId: string; majorCivId: string; quest: Quest; reward: QuestReward };
  'minor-civ:evolved': { campId: string; minorCivId: string; position: HexCoord };
  'minor-civ:destroyed': { minorCivId: string; conquerorId: string };
  'minor-civ:allied': { minorCivId: string; majorCivId: string };
  'minor-civ:scuffle': { attackerId: string; defenderId: string; position: HexCoord };
  'minor-civ:guerrilla': { minorCivId: string; targetCivId: string; position: HexCoord };
  'minor-civ:era-upgrade': { minorCivId: string; newEra: number };
  'minor-civ:relationship-threshold': { minorCivId: string; majorCivId: string; newStatus: 'hostile' | 'neutral' | 'friendly' | 'allied' };
  'minor-civ:quest-expired': { minorCivId: string; majorCivId: string; quest: Quest };
}
