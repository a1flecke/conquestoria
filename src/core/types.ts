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

export interface LegendaryWonderStep {
  id: string;
  description: string;
  completed: boolean;
}

export interface LegendaryWonderDefinition {
  id: string;
  name: string;
  era: number;
  productionCost: number;
  requiredTechs: string[];
  requiredResources: string[];
  cityRequirement: 'river' | 'coastal' | 'any';
  questSteps: Array<{
    id: string;
    type:
      | 'discover_wonder'
      | 'trade_route'
      | 'research_count'
      | 'defeat_stronghold'
      | 'buildings-in-multiple-cities'
      | 'trade-routes-established'
      | 'map-discoveries';
    description?: string;
    targetCount?: number;
    track?: TechTrack;
    scope?: 'near-city' | 'any';
    radius?: number;
    routeRequirement?: 'any' | 'coastal' | 'overseas' | 'long-range';
    minimumRouteDistance?: number;
    cityScope?: 'host-city' | 'empire';
    minimumBuildingsPerCity?: number;
    discoveryTypes?: Array<'natural-wonder' | 'tribal-village'>;
  }>;
  reward: LegendaryWonderReward;
}

export interface LegendaryWonderProject {
  wonderId: string;
  ownerId: string;
  cityId: string;
  phase: 'locked' | 'questing' | 'ready_to_build' | 'building' | 'completed' | 'lost_race';
  investedProduction: number;
  transferableProduction: number;
  questSteps: LegendaryWonderStep[];
}

export interface LegendaryWonderReward {
  summary: string;
  instantResearch?: number;
  civYieldBonus?: Partial<ResourceYield>;
  cityYieldBonus?: Partial<ResourceYield>;
}

export interface CompletedLegendaryWonder {
  ownerId: string;
  cityId: string;
  turnCompleted: number;
}

export interface DestroyedStrongholdRecord {
  civId: string;
  campId: string;
  position: HexCoord;
  turn: number;
}

export type LegendaryWonderDiscoverySiteType = 'natural-wonder' | 'tribal-village';

export interface LegendaryWonderDiscoveredSiteRecord {
  civId: string;
  siteId: string;
  siteType: LegendaryWonderDiscoverySiteType;
  position: HexCoord;
  turn: number;
}

export interface LegendaryWonderHistory {
  destroyedStrongholds: DestroyedStrongholdRecord[];
  discoveredSites: LegendaryWonderDiscoveredSiteRecord[];
}

export interface LegendaryWonderIntelEntry {
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  revealedTurn: number;
  intelLevel: 'started';
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

export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
  | 'scout_hound';

export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;          // 0 for non-combat units
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
  spyDetectionChance?: number; // 0–1, probability per adjacent spy unit per turn
}

export interface Unit {
  id: string;
  type: UnitType;
  owner: string;             // civilization ID
  position: HexCoord;
  movementPointsLeft: number;
  movementBonus?: number;    // civ-specific persistent bonus applied on turn reset
  health: number;            // 0-100
  experience: number;
  hasMoved: boolean;
  hasActed: boolean;         // used action this turn (build, found, etc.)
  isResting: boolean;        // player explicitly chose to rest/heal this turn
  automation?: {
    mode: 'auto-explore';
    lastTargets: string[];
    startedTurn: number;
  };
}

// --- Cities ---

export type BuildingCategory = 'production' | 'food' | 'science' | 'economy' | 'military' | 'culture' | 'espionage';
export type CityFocus = 'balanced' | 'food' | 'production' | 'gold' | 'science' | 'custom';
export type CityMaturity = 'outpost' | 'village' | 'town' | 'city' | 'metropolis';

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
  pacing?: PacingMetadata;
}

export interface OccupiedCityState {
  originalOwnerId: string;
  turnsRemaining: number;
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
  ownedTiles: HexCoord[];    // city territory/control, not active citizen assignment
  workedTiles: HexCoord[];
  focus: CityFocus;
  maturity: CityMaturity;
  lastFocusReminderTurn?: number;
  grid: (string | null)[][];  // 7x7 city interior grid with centered unlocked rings
  gridSize: 3 | 5 | 7;        // unlocked centered grid size
  unrestLevel: 0 | 1 | 2;     // 0=stable, 1=unrest, 2=revolt
  unrestTurns: number;         // turns spent at current unrest level (>= 1 when unrestLevel > 0)
  conquestTurn?: number;       // turn this city was captured; cleared after 15 turns
  occupation?: OccupiedCityState;
  spyUnrestBonus: number;      // bonus pressure injected by enemy espionage; decays 5/turn
  productionDisabledTurns?: number; // late-game sabotage/cyber effect timer
}

// --- Tech ---

export type TechTrack =
  | 'military' | 'economy' | 'science' | 'civics' | 'exploration'
  | 'agriculture' | 'medicine' | 'philosophy' | 'arts' | 'maritime'
  | 'metallurgy' | 'construction' | 'communication' | 'espionage' | 'spirituality';

export type TechStatus = 'locked' | 'available' | 'researching' | 'completed';

export type PacingBand =
  | 'starter'
  | 'core'
  | 'specialist'
  | 'infrastructure'
  | 'power-spike'
  | 'marquee';

export type PacingContentType = 'building' | 'unit' | 'tech' | 'wonder';

export interface PacingMetadata {
  band: PacingBand;
  role: string;
  impact: number;
  scope: 'city' | 'military' | 'empire';
  snowball: number;
  urgency: number;
  situationality: number;
  unlockBreadth: number;
}

export interface Tech {
  id: string;
  name: string;
  track: TechTrack;
  cost: number;
  prerequisites: string[];   // tech IDs
  unlocks: string[];         // what this tech enables (descriptions)
  era: number;               // 1-3 for milestone 1
  countsForEraAdvancement?: boolean;
  countsForCityMaturity?: boolean;
  pacing?: PacingMetadata;
}

export interface TechState {
  completed: string[];       // tech IDs
  currentResearch: string | null;
  researchQueue: string[];
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
  | { type: 'faster_growth'; foodReduction: number }
  | { type: 'culture_pressure'; radiusBonus: number }
  | { type: 'industrial_efficiency'; productionBonus: number }
  | { type: 'fortified_defense'; defenseBonus: number }
  | { type: 'grassland_cavalry_heal'; healPerTurn: number }
  | { type: 'tundra_bonus'; foodBonus: number; productionBonus: number }
  | { type: 'siege_bonus'; damageMultiplier: number }
  | { type: 'peaceful_growth'; foodBonus: number; militaryPenalty: number }
  | { type: 'forest_industry'; productionBurst: number }
  | { type: 'wonder_rewards'; rewardMultiplier: number }
  | { type: 'naval_raiding'; movementBonus: number; coastalVisionBonus: number }
  | { type: 'homeland_defense'; defenseBonus: number }
  | { type: 'espionage_growth'; experienceBonus: number }
  | { type: 'forest_guardians'; defenseBonus: number; visionBonus: number; concealmentInForest: boolean; forestYieldBonus: number }
  | { type: 'allied_kingdoms'; treatyRelationshipBonus: number; allianceYieldBonus: number }
  | { type: 'coastal_science'; coastalScienceBonus: number; navalProductionBonus: number; navalCombatBonus: number };

export interface CivDefinition {
  id: string;
  name: string;
  color: string;
  leaderName?: string;
  cityNames?: string[];
  bonusName: string;
  bonusDescription: string;
  bonusEffect: CivBonusEffect;
  personality: PersonalityTraits;
}

export type CustomCivPrimaryTraitId =
  | 'trade-dominance'
  | 'naval-supremacy'
  | 'scholarly'
  | 'expansionist'
  | 'stealth'
  | 'wonder-craft';

export type CustomCivTemperamentTrait = PersonalityTrait;

export interface CustomCivDefinition {
  id: string;
  name: string;
  color: string;
  leaderName: string;
  cityNames: string[];
  primaryTrait: CustomCivPrimaryTraitId;
  temperamentTraits: CustomCivTemperamentTrait[];
}

// --- Diplomacy ---

export type DiplomaticAction =
  | 'declare_war'
  | 'request_peace'
  | 'non_aggression_pact'
  | 'trade_agreement'
  | 'open_borders'
  | 'alliance'
  | 'offer_vassalage'
  | 'petition_independence'
  | 'propose_embargo'
  | 'join_embargo'
  | 'leave_embargo'
  | 'propose_league'
  | 'invite_to_league'
  | 'petition_league'
  | 'leave_league'
  | 'reabsorb_breakaway';

export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance' | 'vassalage';

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

export interface VassalageState {
  overlord: string | null;
  vassals: string[];
  protectionScore: number;
  protectionTimers: Array<{
    attackerCivId: string;
    turnsRemaining: number;
  }>;
  peakCities: number;
  peakMilitary: number;
}

export interface DiplomacyState {
  relationships: Record<string, number>;    // civId -> score (-100 to +100)
  treaties: Treaty[];
  events: DiplomaticEvent[];
  atWarWith: string[];
  treacheryScore: number;
  vassalage: VassalageState;
}

export interface Embargo {
  id: string;
  targetCivId: string;
  participants: string[];
  proposedTurn: number;
}

export interface DefensiveLeague {
  id: string;
  members: string[];
  formedTurn: number;
}

export interface PendingDiplomaticRequest {
  id: string;
  type: 'peace';
  fromCivId: string;
  toCivId: string;
  turnIssued: number;
}

// --- Espionage ---

export type SpyStatus =
  | 'idle'         // unit is on the map, available
  | 'stationed'    // infiltrated enemy city, off map
  | 'embedded'     // inside own city doing counter-espionage
  | 'on_mission'   // running a mission, off map
  | 'cooldown'     // between missions or after expulsion, may be on map
  | 'captured'     // caught, awaiting verdict
  | 'interrogated';// being held for interrogation

export type DisguiseType = 'barbarian' | 'warrior' | 'scout' | 'archer' | 'worker';

export type SpyMissionType =
  // Stage 1 (espionage-scouting tech)
  | 'scout_area'          // reveal fog around target city
  | 'monitor_troops'      // report unit movements near city
  // Stage 2 (espionage-informants tech)
  | 'gather_intel'        // reveal tech progress, treasury, treaties
  | 'identify_resources'  // reveal strategic resources in city territory
  | 'monitor_diplomacy'   // see trade partners and relationships
  // Stage 3 (spy-networks or sabotage tech)
  | 'steal_tech'          // copy one tech target has that you don't
  | 'sabotage_production' // target city loses 3-5 turns of production progress
  | 'incite_unrest'       // increase spyUnrestBonus in target city
  | 'counter_espionage'   // passive defensive assignment (increases CI score)
  // Stage 4 (cryptography or counter-intelligence tech)
  | 'assassinate_advisor' // disable one advisor for 10 turns
  | 'forge_documents'     // diplomatic relationship penalty between two other civs
  | 'fund_rebels'         // escalate unrest in already-unrest city
  | 'arms_smuggling'      // spawn hostile units near target city
  // Stage 5 (digital-surveillance and cyber-warfare tech)
  | 'cyber_attack'
  | 'misinformation_campaign'
  | 'election_interference'
  | 'satellite_surveillance';

export interface SpyMission {
  type: SpyMissionType;
  turnsRemaining: number;
  turnsTotal: number;
  targetCivId: string;
  targetCityId: string;
}

export type SpyPromotion = 'infiltrator' | 'handler' | 'sentinel';
// infiltrator: bonus to direct-effect missions (steal, sabotage, assassinate, arms)
// handler:     bonus to influence missions (incite, forge, fund_rebels, counter_esp)
// sentinel:    bonus to counter-intelligence and detection avoidance

export interface Spy {
  id: string;
  owner: string;
  name: string;
  targetCivId: string | null;
  targetCityId: string | null;
  position: HexCoord | null;       // null when idle at home
  status: SpyStatus;
  experience: number;              // 0-100
  currentMission: SpyMission | null;
  cooldownTurns: number;           // turns until spy can act again after expulsion
  promotion?: SpyPromotion;          // set once, permanent
  promotionAvailable: boolean;       // true when XP >= 60 and no promotion yet (unused for now, for future UI)
  turnedBy?: string;
  feedsFalseIntel?: boolean;
  unitType: UnitType;                   // physical unit type — needed to recreate unit on expulsion
  disguiseAs?: DisguiseType | null;
  infiltrationCityId?: string | null;  // city spy is currently inside
  cityVisionTurnsLeft?: number;        // turns of full city-tile vision remaining
  cooldownMode?: 'stay_low' | 'passive_observe';
  stolenTechFrom?: Record<string, string[]>; // civId -> techIds already stolen
  lastSweepTurn?: number;              // turn the spy last ran a sweep (prevents double-sweep)
}

export interface DetectedSpyThreat {
  cityId: string;
  foreignCivId: string;
  detectedTurn: number;
  expiresOnTurn: number;
}

export type InterrogationIntelType =
  | 'spy_identity' | 'city_location' | 'production_queue'
  | 'wonder_in_progress' | 'map_area' | 'tech_hint';

export interface InterrogationIntel {
  type: InterrogationIntelType;
  data: Record<string, unknown>;
}

export interface InterrogationRecord {
  id: string;
  spyId: string;
  spyOwner: string;
  turnsRemaining: number;
  extractedIntel: InterrogationIntel[];
}

export interface EspionageCivState {
  spies: Record<string, Spy>;
  maxSpies: number;                // scales with espionage tech
  counterIntelligence: Record<string, number>; // cityId -> detection score (0-100)
  detectedThreats?: Record<string, DetectedSpyThreat>;
  activeInterrogations?: Record<string, InterrogationRecord>;
  recentDetections?: Array<{ position: HexCoord; turn: number; wasDisguised: boolean }>;
}

export type EspionageState = Record<string, EspionageCivState>;

export interface TrainableUnitEntry {
  type: UnitType;
  name: string;
  cost: number;
  techRequired?: string;
  obsoletedByTech?: string;
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
  knownCivilizations?: string[];
  score: number;
  diplomacy: DiplomacyState;
  advisorDisabledUntil?: Partial<Record<AdvisorType, number>>; // turn number until re-enabled
  researchPenaltyTurns?: number;
  researchPenaltyMultiplier?: number;
  satelliteSurveillanceTargets?: Record<string, number>;
  breakaway?: BreakawayMetadata;
}

export interface BreakawayMetadata {
  originOwnerId: string;
  originCityId: string;
  startedTurn: number;
  establishesOnTurn: number;
  status: 'secession' | 'established';
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
  | { type: 'defeat_units'; count: number; nearPosition: HexCoord; radius: number; cityId?: string }
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
  cityId?: string;
  minorCivId?: string;
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
  customCivilizations?: CustomCivDefinition[];
}

export interface SoloSetupConfig {
  civType: string;
  mapSize: 'small' | 'medium' | 'large';
  opponentCount: number;
  gameTitle: string;
  settingsOverrides?: Partial<GameSettings>;
  seed?: string;
  customCivilizations?: CustomCivDefinition[];
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

export type AdvisorType =
  | 'builder'
  | 'explorer'
  | 'chancellor'
  | 'warchief'
  | 'treasurer'
  | 'scholar'
  | 'spymaster'
  | 'artisan';

export type CouncilTalkLevel = 'quiet' | 'normal' | 'chatty' | 'chaos';

export interface CouncilCard {
  id: string;
  advisor: AdvisorType;
  bucket: 'do-now' | 'soon' | 'to-win' | 'drama';
  cardType?: 'standard' | 'wonder';
  title: string;
  summary: string;
  why: string;
  priority: number;
  actionLabel?: string;
}

export interface CouncilAgenda {
  doNow: CouncilCard[];
  soon: CouncilCard[];
  toWin: CouncilCard[];
  drama: CouncilCard[];
}

export interface CouncilInterrupt {
  civId: string;
  advisor: AdvisorType;
  summary: string;
  sourceCardId: string;
}

export interface CouncilState {
  talkLevel: CouncilTalkLevel;
  lastShownTurn: number;
}

export type CouncilMemoryOutcome =
  | 'pending'
  | 'followed'
  | 'ignored'
  | 'succeeded'
  | 'failed'
  | 'obsolete';

export type CouncilMemoryKind =
  | 'frontier-expansion'
  | 'watch-rival-city'
  | 'wonder-plan'
  | 'city-development'
  | 'advisor-disagreement';

export type CouncilCallbackTone = 'reflective' | 'smug' | 'resentful';

export interface CouncilMemorySubjects {
  cityId?: string;
  civId?: string;
  regionKey?: string;
  wonderId?: string;
  advisorFor?: AdvisorType;
  advisorAgainst?: AdvisorType;
  forAction?: string;
  againstAction?: string;
}

export interface CouncilMemoryEntry {
  key: string;
  advisor: AdvisorType;
  kind: CouncilMemoryKind;
  turn: number;
  subjects: CouncilMemorySubjects;
  outcome?: CouncilMemoryOutcome;
  previousOutcome?: CouncilMemoryOutcome;
  lastCallbackTurn?: number;
}

export interface CouncilMemoryLedger {
  entries: CouncilMemoryEntry[];
  eraCallbackCount: number;
  callbackEra: number;
}

export type CouncilMemoryState = Record<string, CouncilMemoryLedger>;

// --- Save Slots ---

export interface SaveSlotMeta {
  id: string;
  name: string;
  civType: string;
  turn: number;
  lastPlayed: string;
  kind?: 'manual' | 'autosave';
  gameMode?: GameMode;
  playerCount?: number;
  playerNames?: string[];
  gameId?: string;
  gameTitle?: string;
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
  gameId?: string;
  gameTitle?: string;
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
  councilMemory?: CouncilMemoryState;
  tribalVillages: Record<string, TribalVillage>;
  discoveredWonders: Record<string, string>;       // wonderId -> first discoverer civId
  wonderDiscoverers: Record<string, string[]>;     // wonderId -> all discoverer civIds
  legendaryWonderProjects?: Record<string, LegendaryWonderProject>;
  completedLegendaryWonders?: Record<string, CompletedLegendaryWonder>;
  legendaryWonderHistory?: LegendaryWonderHistory;
  legendaryWonderIntel?: Record<string, LegendaryWonderIntelEntry[]>;
  espionage?: EspionageState;
  embargoes: Embargo[];
  defensiveLeagues: DefensiveLeague[];
  pendingDiplomacyRequests?: PendingDiplomaticRequest[];
}

export interface GameSettings {
  mapSize: 'small' | 'medium' | 'large';
  soundEnabled: boolean;
  musicEnabled: boolean;
  musicVolume: number;       // 0-1
  sfxVolume: number;         // 0-1
  tutorialEnabled: boolean;
  advisorsEnabled: Record<AdvisorType, boolean>;
  councilTalkLevel: CouncilTalkLevel;
  customCivilizations?: CustomCivDefinition[];
}

// --- Events ---

export interface GameEvents {
  'turn:start': { turn: number; playerId: string };
  'turn:end': { turn: number; playerId: string };
  'unit:move': { unitId: string; from: HexCoord; to: HexCoord };
  'unit:created': { unit: Unit };
  'unit:destroyed': { unitId: string; position: HexCoord };
  'city:founded': { city: City };
  'city:captured': { cityId: string; newOwner: string; previousOwner: string };
  'diplomacy:vassalage-offered': { fromCivId: string; toCivId: string };
  'diplomacy:vassalage-accepted': { vassalId: string; overlordId: string };
  'diplomacy:vassalage-ended': { vassalId: string; overlordId: string; reason: 'independence' | 'war' | 'auto_breakaway' | 'overlord_eliminated' };
  'diplomacy:independence-petition': { vassalId: string; overlordId: string; accepted: boolean };
  'diplomacy:protection-failed': { overlordId: string; vassalId: string; attackerId: string };
  'diplomacy:vassal-auto-war': { vassalId: string; overlordId: string; targetCivId: string };
  'diplomacy:treachery': { civId: string; action: string; newScore: number };
  'diplomacy:embargo-proposed': { proposerId: string; targetCivId: string; embargoId: string };
  'diplomacy:embargo-joined': { civId: string; embargoId: string };
  'diplomacy:embargo-left': { civId: string; embargoId: string };
  'diplomacy:league-formed': { leagueId: string; members: string[] };
  'diplomacy:league-joined': { civId: string; leagueId: string };
  'diplomacy:league-dissolved': { leagueId: string; reason: string };
  'diplomacy:league-triggered': { leagueId: string; attackerId: string; defenderId: string };
  'city:building-complete': { cityId: string; buildingId: string };
  'city:unit-trained': { cityId: string; unitType: UnitType };
  'city:grew': { cityId: string; newPopulation: number };
  'city:maturity-upgraded': { cityId: string; previous: CityMaturity; current: CityMaturity };
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
  'diplomacy:peace-requested': { fromCivId: string; toCivId: string };
  'diplomacy:peace-made': { civA: string; civB: string };
  'diplomacy:treaty-proposed': { fromCiv: string; toCiv: string; treaty: TreatyType };
  'diplomacy:treaty-accepted': { civA: string; civB: string; treaty: TreatyType };
  'diplomacy:treaty-broken': { breakerId: string; otherCiv: string; treaty: TreatyType };
  'advisor:message': { advisor: AdvisorType; message: string; icon: string; tone?: CouncilCallbackTone; memoryKey?: string };
  'trade:route-created': { route: TradeRoute };
  'trade:price-changed': { resource: ResourceType; oldPrice: number; newPrice: number };
  'wonder:discovered': { civId: string; wonderId: string; position: HexCoord; isFirstDiscoverer: boolean };
  'wonder:eruption': { wonderId: string; position: HexCoord; tilesAffected: HexCoord[] };
  'wonder:legendary-ready': { civId: string; cityId: string; wonderId: string };
  'wonder:legendary-completed': { civId: string; cityId: string; wonderId: string };
  'wonder:legendary-lost': { civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number };
  'wonder:legendary-race-revealed': { observerId: string; civId: string; cityId: string; wonderId: string };
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
  'espionage:spy-recruited': { civId: string; spy: Spy };
  'espionage:spy-assigned': { civId: string; spyId: string; targetCivId: string; targetCityId: string };
  'espionage:spy-arrived': { civId: string; spyId: string; targetCityId: string };
  'espionage:mission-started': { civId: string; spyId: string; missionType: SpyMissionType };
  'espionage:mission-succeeded': { civId: string; spyId: string; missionType: SpyMissionType; result: Record<string, unknown> };
  'espionage:mission-failed': { civId: string; spyId: string; missionType: SpyMissionType };
  'espionage:spy-detected': { detectingCivId: string; spyOwner: string; spyId: string; cityId: string };
  'espionage:spy-detected-traveling': { detectingCivId: string; spyOwner: string; spyUnitId: string; position: HexCoord; wasDisguised: boolean };
  'espionage:spy-expelled': { civId: string; spyId: string; fromCivId: string };
  'espionage:spy-captured': { capturingCivId: string; spyOwner: string; spyId: string };
  'espionage:spy-recalled': { civId: string; spyId: string; reason?: string };
  'espionage:spy-infiltrated': { civId: string; spyId: string; cityId: string };
  'espionage:spy-caught-infiltrating': { capturingCivId: string; spyOwner: string; spyId: string; cityId: string };
  'espionage:spy-auto-exfiltrated': { civId: string; spyId: string; cityId: string };
  'faction:unrest-started': { cityId: string; owner: string };
  'faction:revolt-started': { cityId: string; owner: string };
  'faction:unrest-resolved': { cityId: string; owner: string };
  'faction:breakaway-started': { cityId: string; oldOwner: string; breakawayId: string };
  'faction:breakaway-established': { civId: string; originOwnerId: string };
  'faction:breakaway-reabsorbed': { civId: string; ownerId: string; cityId: string };
  'espionage:spy-promoted': { civId: string; spyId: string; promotion: SpyPromotion };
  'espionage:advisor-assassinated': { targetCivId: string; advisorType: AdvisorType; disabledUntilTurn: number };
  'espionage:documents-forged': { civA: string; civB: string; relationshipPenalty: number };
  'espionage:spy-executed': { executingCivId: string; spyOwner: string; spyId: string; spyName: string };
  'espionage:intel-extracted': { captorId: string; intel: InterrogationIntel[] };
  'unit:obsolete': { civId: string; unitId: string; unitType: UnitType };
  'espionage:spy-expired': { civId: string; spyId: string; spyName: string; unitType: UnitType };
}
