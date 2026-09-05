import type { NotificationCityAction, NotificationLog } from './notification-log';
import type { PirateFactionId, PirateHeadquarters, PirateMaritimeStage, PirateState } from './pirate-state';

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
  revealLine?: string;
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

export type LegendaryWonderResourceScope = 'empire' | 'host-city';

export interface LegendaryWonderResourceCountQuestStep {
  id: string;
  type: 'resource-count';
  resource: ResourceType;
  target: number;
  scope: LegendaryWonderResourceScope;
  description?: string;
}

interface LegendaryWonderQuestStepBase {
  id: string;
  description?: string;
}

export type LegendaryWonderStandardQuestStep =
  | (LegendaryWonderQuestStepBase & { type: 'required-techs'; techIds: string[] })
  | (LegendaryWonderQuestStepBase & {
    type: 'specific-buildings'; buildingIds: string[]; cityScope: 'host-city' | 'distinct-cities'; targetCount?: number;
  })
  | (LegendaryWonderQuestStepBase & {
    type: 'network-plan-resolutions'; targetCount: number; definitionIds: string[]; stableOnly: boolean; hostCityOnly?: boolean;
  })
  | (LegendaryWonderQuestStepBase & { type: 'discover_wonder'; targetCount?: number })
  | (LegendaryWonderQuestStepBase & {
    type: 'trade_route' | 'trade-routes-established';
    targetCount?: number;
    routeRequirement?: 'any' | 'coastal' | 'overseas' | 'long-range';
    minimumRouteDistance?: number;
  })
  | (LegendaryWonderQuestStepBase & { type: 'research_count'; targetCount?: number; track?: TechTrack })
  | (LegendaryWonderQuestStepBase & { type: 'defeat_stronghold'; targetCount?: number; scope?: 'near-city' | 'any'; radius?: number })
  | (LegendaryWonderQuestStepBase & {
    type: 'buildings-in-multiple-cities'; targetCount?: number; cityScope?: 'host-city' | 'empire'; minimumBuildingsPerCity?: number;
  })
  | (LegendaryWonderQuestStepBase & { type: 'map-discoveries'; targetCount?: number; discoveryTypes?: Array<'natural-wonder' | 'tribal-village'> })
  | (LegendaryWonderQuestStepBase & { type: 'field-combat-roles'; targetUnitCount: number; targetRoleCount: number; allowedRoles?: CombatRole[] })
  | (LegendaryWonderQuestStepBase & { type: 'surviving-combat-wins'; targetCount: number; allowedRoles?: CombatRole[] })
  | (LegendaryWonderQuestStepBase & { type: 'fort-completions'; targetCount: number; distinctCityTerritories?: boolean })
  | (LegendaryWonderQuestStepBase & { type: 'fortification-repels'; targetCount: number; tiers?: Array<'fort' | 'citadel'> })
  | (LegendaryWonderQuestStepBase & { type: 'successful-interceptions'; targetCount: number });

export type LegendaryWonderQuestStepDefinition =
  | LegendaryWonderStandardQuestStep
  | LegendaryWonderResourceCountQuestStep;

export interface LegendaryWonderDefinition {
  id: string;
  name: string;
  era: number;
  productionCost: number;
  requiredTechs: string[];
  requiredResources: string[];
  cityRequirement: 'river' | 'coastal' | 'any';
  questSteps: LegendaryWonderQuestStepDefinition[];
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
  // research_count step baselines, snapshotted when the project enters 'questing'.
  // Keyed by quest-step id. Optional — legacy saves (pre-MR10) default to undefined,
  // which evaluateLegendaryWonderStep treats as baseline 0 (grandfathered: lifetime
  // counts still complete the step, matching pre-MR10 behavior for in-flight projects).
  questBaselines?: Record<string, number>;
}

export type LegendaryWonderAvailabilityStatus =
  | 'questing' | 'blocked' | 'buildable' | 'building' | 'scrapped' | 'lost_race' | 'completed';

export interface LegendaryWonderAvailabilityRecord {
  status: LegendaryWonderAvailabilityStatus;
}

export interface LegendaryWonderReward {
  summary: string;
  instantResearch?: number;
  civYieldBonus?: Partial<ResourceYield>;
  cityYieldBonus?: Partial<ResourceYield>;
  tacticalEffects?: LegendaryWonderTacticalEffect[];
}

export type LegendaryWonderTacticalEffect =
  | { kind: 'per-era-role-training-xp'; roles: CombatRole[]; experience: number; maxGrantsPerEra: number; aiValue: number }
  | { kind: 'fort-occupant-healing'; amount: number; aiValue: number }
  | { kind: 'adjacent-citadel-defense'; multiplier: number; stackingGroup: string; excludedRoles: CombatRole[]; aiValue: number }
  | { kind: 'aa-radius-extension'; providerKind: 'sam-site'; radius: number; aiValue: number }
  | { kind: 'first-owner-turn-interception-modifier'; multiplier: number; stackingGroup: string; aiValue: number };

export interface LegendaryWonderTacticalEffectState {
  trainingGrantsByCiv: Record<string, { era: number; grantedRoles: CombatRole[] }>;
  interceptionClaimTurnByCiv: Record<string, number>;
}

export interface CompletedLegendaryWonder {
  ownerId: string;
  cityId: string;
  turnCompleted: number;
}

export interface BuiltNationalProjectRecord {
  civId: string;
  cityId: string;
  eraBuilt: number;
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

export interface LegendaryWonderNetworkPlanResolutionRecord {
  civId: string;
  planId: string;
  definitionId: string;
  cityId?: string;
  stable: boolean;
  turn: number;
}

export type LegendaryWonderMilitaryFact =
  | {
    id: string;
    kind: 'surviving-combat-win';
    civId: string;
    unitId: string;
    role: CombatRole;
    turn: number;
  }
  | {
    id: string;
    kind: 'fort-completed';
    civId: string;
    cityId: string;
    position: HexCoord;
    turn: number;
  }
  | {
    id: string;
    kind: 'fortification-repel';
    civId: string;
    unitId: string;
    tier: 'fort' | 'citadel';
    turn: number;
  }
  | {
    id: string;
    kind: 'successful-interception';
    civId: string;
    interceptorId: string;
    turn: number;
  };

export interface LegendaryWonderHistory {
  destroyedStrongholds: DestroyedStrongholdRecord[];
  discoveredSites: LegendaryWonderDiscoveredSiteRecord[];
  networkPlanResolutions?: LegendaryWonderNetworkPlanResolutionRecord[];
  militaryFacts?: LegendaryWonderMilitaryFact[];
}

// --- Great Generals (#544 MR3, heroic commands #544 MR4) ---

export type HeroicAbilityId = 'rally' | 'seize_the_moment' | 'last_stand';

/** #544 MR4: Last Stand's shared formation state — one object drives both
 * the ongoing defense multiplier (read every combat while unexpired) and
 * the one-time "Hold!" survival save (consumed formation-wide on first
 * trigger, see consumeLastStandHoldFormationWide). */
export interface LastStandHoldState {
  formationId: string;
  defenseBonusMultiplier: number;
  expiresTurn: number; // inclusive: still active while state.turn <= expiresTurn
  /** #887 MR1: the stable id of the General who issued this hold (gen_* or
   * generated:*), so a `unit-saved` / `battle-influenced` career event can be
   * attributed even after the General unit itself is gone. Absent on a
   * pre-#887 in-flight hold — that one hold then yields no attribution. */
  generalDefinitionId?: string;
}

export interface GeneralProgressState {
  points: number;
  generalsEarned: number; // count of thresholds crossed so far, this game
}

/**
 * #544 MR3: a Great General identity — either an authored roster entry
 * (`src/systems/great-general-definitions.ts`) or a #888 fallback-generated
 * officer (`origin: 'generated'`, persisted in `GameState.generatedGenerals`).
 * Lives in core `types.ts` alongside `GeneralHistoryEntry` /
 * `PendingGeneralCandidateChoice` because `GameState` now references it;
 * `great-general-definitions.ts` re-exports it for existing importers.
 */
export interface GeneralDefinition {
  id: string;
  name: string;
  /** CivDefinition.id values this commander is thematically tied to. Empty
   * array = universal/fantasy fallback, drawable by any civ. */
  civTypeEligibility: string[];
  era: number; // 1-12, matches this codebase's existing era numbering
  descriptor: string; // one-line contextual text (contract §13 "Candidate presentation")
  portraitIcon: string; // single emoji — non-bespoke-art icon convention
  commandRange: number;
  commandCapacity: number;
  abilityIds: HeroicAbilityId[];
  maxCommandCharges: number;
  cooldownTurns: number;
  /** #888: `'generated'` on a fallback officer; absent on authored entries. A
   * discriminator for #885/#886/#889 to opt generated identities in/out of
   * future per-identity content without another schema change. */
  origin?: 'generated';
}

/** #888: a fallback-generated officer identity — structurally a
 * `GeneralDefinition` with `origin` pinned, so every consumer works unchanged
 * once it resolves through `resolveGeneralDefinition`. The persisted record in
 * `GameState.generatedGenerals` is authoritative; name pools are never
 * re-consulted to resolve one, so a pool edit cannot rename an existing officer. */
export interface GeneratedGeneralIdentity extends GeneralDefinition {
  origin: 'generated';
}

export interface GeneralHistoryEntry {
  unitId: string;
  generalDefinitionId: string;
  spawnedTurn: number;
  diedTurn?: number;
  /** #544 MR4: set once the General's career ends by either path. Absent
   * means still active. */
  outcome?: 'retired' | 'died';
  retiredTurn?: number;
  /** #544 MR4 contract §23: "one concise end-of-career line." */
  endOfCareerLine?: string;
  /** #544 MR4 contract §23: "heroic commands used/counts." Snapshotted from
   * the unit's own generalCommandChargesUsed at the moment its career ends,
   * since the live Unit record is gone after removal. */
  heroicCommandsUsed?: number;
  /** #887 MR1: the campaign chronicle — meaningful career moments recorded at
   * canonical gameplay mutation sources (never reconstructed from later state).
   * Appended in mutation order; same-turn order = array order. Absent on a
   * pre-#887 entry (migration 24 backfills `[]` without fabricating history). */
  careerEvents?: GeneralCareerEvent[];
}

/** #887 MR1: why a General is credited with influencing a battle. */
export type GeneralCareerEventReason = 'last-stand' | 'seize';

/**
 * #887 MR1: one recorded moment in a Great General's career. Plain serializable
 * facts only — no display strings, no #886 profile prose, no #885 specialty
 * copy. Presentation resolves names/profile/specialty from the definition later.
 * Stored inside the owning `GeneralHistoryEntry.careerEvents`.
 */
export type GeneralCareerEvent =
  | { type: 'spawned'; turn: number }
  | { type: 'rally-used'; turn: number; unitsAffected: number; totalHpRestored: number }
  | { type: 'seize-used'; turn: number; unitsRefreshed: number }
  | { type: 'last-stand-issued'; turn: number; unitsProtected: number }
  | { type: 'unit-saved'; turn: number; via: 'last-stand'; unitId: string; unitType: UnitType; remainingHp: number; location: HexCoord }
  | { type: 'battle-influenced'; turn: number; combatId: string; reasons: GeneralCareerEventReason[]; location: HexCoord }
  | { type: 'city-defended'; turn: number; cityId: string; cityName: string }
  | { type: 'city-captured'; turn: number; cityId: string; cityName: string }
  | { type: 'final-command'; turn: number }
  | { type: 'retired'; turn: number; reason: 'charges-expended' }
  | { type: 'killed'; turn: number };

export interface PendingGeneralCandidateChoice {
  civId: string;             // slayer civ; only this civ may resolve it
  candidateDefinitionIds: string[]; // 2-3 GENERAL_DEFINITIONS ids, already generated
  triggerEventLabel: string; // e.g. "city:captured" -- context text for the panel
}

export type LegendaryWonderIntelKind = 'started' | 'completed' | 'host-location-known';

export interface LegacyLegendaryWonderStartedIntelEntry {
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  revealedTurn: number;
  intelLevel: 'started';
  kind?: undefined;
  eventId?: undefined;
}

export interface LegendaryWonderStartedIntelEntry {
  kind: 'started';
  eventId: string;
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  revealedTurn: number;
  intelLevel?: 'started';
}

export interface LegendaryWonderCompletedIntelEntry {
  kind: 'completed';
  eventId: string;
  wonderId: string;
  civId: string;
  civName: string;
  completionTurn: number;
  learnedTurn: number;
}

export interface LegendaryWonderHostLocationIntelEntry {
  kind: 'host-location-known';
  eventId: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  coord: HexCoord;
  learnedTurn: number;
  source: 'spy-location' | 'map-intel' | 'debug-grant';
}

export type LegendaryWonderIntelEntry =
  | LegacyLegendaryWonderStartedIntelEntry
  | LegendaryWonderStartedIntelEntry
  | LegendaryWonderCompletedIntelEntry
  | LegendaryWonderHostLocationIntelEntry;

export type NormalizedLegendaryWonderIntelEntry =
  | LegendaryWonderStartedIntelEntry
  | LegendaryWonderCompletedIntelEntry
  | LegendaryWonderHostLocationIntelEntry;

// --- Tribal Villages ---

export type VillageOutcomeType = 'gold' | 'food' | 'science' | 'free_unit' | 'free_tech' | 'ambush' | 'illness';

export interface TribalVillage {
  id: string;
  position: HexCoord;
}

// --- Map ---

export type VisibilityState = 'unexplored' | 'fog' | 'visible';

export type ImprovementType = 'farm' | 'mine' | 'lumber_camp' | 'watermill'
  | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'oil_well' | 'fort' | 'resource_outpost' | 'none';
// resource_outpost is excluded: only Expeditions can establish outposts, not Workers
export type BuildableImprovementType = Exclude<ImprovementType, 'none' | 'resource_outpost'>;
export type WorkerActionType = BuildableImprovementType | 'drain_swamp' | 'build_road' | 'restore_land';

export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: Elevation;
  resource: string | null;          // strategic/luxury resource on this tile
  improvement: ImprovementType;
  owner: string | null;             // civilization ID that owns this tile
  improvementTurnsLeft: number;     // turns remaining to complete improvement
  improvementOwner?: string;        // civ that started the in-progress improvement
  hasRiver: boolean;
  wonder: string | null;           // wonder definition ID
  regionKey?: string;              // landmass ID for threat pressure (e.g. 'continent-0', 'island-2')
  // Roads are an overlay, not a replacement improvement — a tile can have a farm AND a road.
  hasRoad?: boolean;               // optional: legacy saves default falsy, no migration needed
  roadTurnsLeft?: number;          // turns remaining to complete an in-progress road
  roadOwner?: string;              // civ that started the in-progress road
  devastatedUntilTurn?: number;    // catastrophe crisis: tile yields zero until this turn
  /**
   * Turn a completed Fort improvement most recently changed owner (#544).
   * `undefined` means "never captured" — always stabilized. Reset on every
   * ownership change (contract §7), mirroring `City.conquestTurn`'s
   * existing pattern for cities.
   */
  fortStabilizationSinceTurn?: number;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Record<string, HexTile>;   // key is "q,r"
  wrapsHorizontally: boolean;
  rivers: Array<{ from: HexCoord; to: HexCoord }>;
}

export interface TerritoryFrontierState {
  coord: HexCoord;
  holderCivId: string;
  challengerCivId: string;
  holderCityId: string;
  challengerCityId: string;
  progress: number;
  trend: 'held' | 'contested' | 'likely-to-flip';
  reason: string;
}

// --- Visibility (per player) ---

export interface VisibilityMap {
  tiles: Record<string, VisibilityState>; // key is "q,r"
  lastSeen?: Record<string, LastSeenTilePresentation>;
}

export interface LastSeenCityPresentation {
  id: string;
  name: string;
  owner: string;
  population: number;
}

export type LastSeenHealthBand = 'healthy' | 'damaged' | 'critical';

export interface LastSeenUnitPresentation {
  id: string;
  owner: string;
  type: UnitType;
  healthBand: LastSeenHealthBand;
}

export interface LastSeenTilePresentation {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: Elevation;
  resource: string | null;
  improvement: ImprovementType;
  improvementTurnsLeft: number;
  owner: string | null;
  hasRiver: boolean;
  wonder: string | null;
  hasRoad?: boolean;
  hasRail?: boolean;
  city?: LastSeenCityPresentation;
  observedTurn?: number;
  source?: 'observed' | 'legacy-reconstructed';
  units?: LastSeenUnitPresentation[];
}

// --- Units ---

export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer' | 'missionary'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'axeman' | 'spearman' | 'horseman' | 'chariot' | 'cavalry' | 'armored_car' | 'knight' | 'cuirassier'
  | 'crossbowman' | 'catapult' | 'trebuchet' | 'ballista' | 'cannon' | 'grenadier' | 'marine' | 'rifleman' | 'ironclad'
  | 'frigate' | 'destroyer' | 'artillery' | 'rocket_artillery' | 'infantry' | 'mechanized_infantry'
  | 'machine_gunner' | 'pre_dreadnought' | 'battleship' | 'missile_cruiser'
  | 'observation_balloon' | 'biplane' | 'wwii_fighter' | 'jet_fighter' | 'bomber' | 'recon_aircraft'
  | 'tank' | 'main_battle_tank' | 'anti_tank_gun' | 'mobile_aa' | 'submarine' | 'carrier'
  | 'naval_strike_aircraft' | 'maritime_patrol_aircraft' | 'supercarrier'
  | 'attack_helicopter' | 'missile_submarine'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_intelligence_officer' | 'spy_station_chief' | 'spy_hacker'
  | 'scout_hound' | 'shadow_warden' | 'war_hound' | 'beast_handler' | 'war_elephant'
  | 'caravan' | 'merchant_wagon' | 'freight_convoy'
  | 'naval_trader' | 'steamship_trader' | 'cargo_freighter' | 'container_ship'
  | 'air_freighter' | 'jet_freighter' | 'global_air_cargo'
  | 'expedition'
  | 'transport'
  | 'carrack' | 'galleon' | 'steamship' | 'troop_transport'
  | 'pirate_galley' | 'pirate_corsair' | 'pirate_frigate'
  | 'pirate_ironclad' | 'pirate_fast_attack_craft' | 'pirate_mothership'
  | 'beast_boar' | 'beast_wolf' | 'beast_basilisk' | 'beast_sea_serpent'
  | 'beast_wurm' | 'beast_roc' | 'beast_hydra' | 'beast_dragon' | 'beast_stampede_herd' | 'rogue_handler' | 'rogue_elephant'
  | 'cyber_unit' | 'stealth_bomber'
  | 'combat_drone' | 'autonomous_frigate' | 'exosuit_infantry' | 'propagandist' | 'drone_controller'
  | 'paratrooper'
  | 'great_general';

/** Declarative composition slot for ordinary barbarian camps. */
export type BarbarianRoleSlot = 'frontline' | 'ranged' | 'siege' | 'mobile' | 'specialist' | 'anti-air';
export type BarbarianRarity = 'common' | 'uncommon' | 'rare';
export type BarbarianObservationRequirement = 'armor' | 'air';
export type BarbarianExclusionReason =
  | 'civilian'
  | 'naval'
  | 'air'
  | 'unique'
  | 'crisis'
  | 'strategic-deterrence'
  | 'unsupported';

/**
 * Static composition metadata. The barbarian composer will consume this in a
 * later issue; keeping it data-only here preserves the existing live roster.
 */
export type BarbarianEligibility =
  | {
      status: 'eligible';
      eraWindow: { min: number; max?: number };
      roleSlot: BarbarianRoleSlot;
      weight: number;
      rarity: BarbarianRarity;
      /** Ceiling while a camp remains below the escalation threshold. */
      maxPerCampBeforeEscalation?: number;
      /** Absolute ceiling, regardless of camp escalation. */
      maxPerCamp?: number;
      requiresObservation?: BarbarianObservationRequirement;
      excludesUnits?: readonly UnitType[];
    }
  | { status: 'excluded'; reason: BarbarianExclusionReason };

export interface UnitAttackProfile {
  kind: 'melee' | 'ranged' | 'siege' | 'bombard';
  range: number;
  targets: Array<'unit' | 'city'>;
  /** Unit domains this profile can engage. Omitted profiles use canonical legacy defaults. */
  targetDomains?: Array<'land' | 'naval' | 'air'>;
}

export type AirInterceptionDefense =
  | { kind: 'turret-fire'; counterDamageMultiplier: number }
  | { kind: 'evasion'; incomingDamageMultiplier: number };

export type AirBaseKind = 'airfield' | 'helicopter_base' | 'stealth_airbase' | 'carrier';
export type AirMission = 'strike' | 'intercept' | 'rebase' | 'recon' | 'patrol';
export type AirBaseRef = { kind: 'city'; cityId: string } | { kind: 'carrier'; unitId: string };

export interface AirOperationDefinition {
  baseKinds: AirBaseKind[];
  operationalRange: number;
  ferryRange: number;
  missions: AirMission[];
  carrierEligible: boolean;
  interceptionStrengthMultiplier?: number;
}

export interface ParadropCapability {
  /** Hex distance from the launch city, wrap-aware. Not airOperation's operationalRange/ferryRange — a Paratrooper is a land unit, not an aircraft, and doesn't occupy an air-base roster slot. */
  range: number;
  /** Building kinds on a friendly city that make it a valid launch point. Reuses AirBaseKind (not narrowed) so a future launch point is a data change, not a type change; only 'airfield' is populated today. */
  baseKinds: AirBaseKind[];
}

export interface AirAssaultCapability {
  /** Building kinds this unit's air-base roster can launch an Air Assault from. Reuses AirBaseKind like ParadropCapability does, for the same reason — a future launch point is a data change, not a type change; only 'helicopter_base' is populated today. */
  baseKinds: AirBaseKind[];
}

export type AirDefenseProviderKind = 'building' | 'unit' | 'naval-unit';
export interface AirDefenseProviderDefinition { id: string; kind: AirDefenseProviderKind; radius: number; defenseModifier: number; stackingGroup: string; label: string; protectedDomains?: Array<'land' | 'naval' | 'air'>; }
export type AirDefenseProviderCapability = Omit<AirDefenseProviderDefinition, 'id' | 'kind' | 'label'> & {
  /** Completed city-building IDs required for this provider to operate. */
  requiresCompletedBuildingIds?: readonly string[];
};
export interface AirDefenseCoverageProvider { id: string; label: string; position: HexCoord; ownerId: string; radius: number; defenseModifier: number; stackingGroup: string; protectedDomains?: Array<'land' | 'naval' | 'air'>; }
export interface AirDefenseCoverageResult { flatDefenseModifier: number; facts: CombatModifierFact[]; providers: AirDefenseCoverageProvider[]; }

export interface StrategicLaunchCapability {
  /** Hex range from the platform's position, wrap-aware; 'unlimited' for a fixed
   * silo with no maximum reach (#545 spec §3/§4). Never a sentinel number. */
  range: number | 'unlimited';
}

export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;          // 0 for non-combat units
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
  /** Ordinary-camp composition metadata; static until the barbarian composer consumes it. */
  barbarianEligibility: BarbarianEligibility;
  domain?: 'land' | 'naval' | 'air';
  waterAccess?: 'coastal' | 'ocean'; // required whenever domain === 'naval' — see #751
  spyDetectionChance?: number; // 0–1, probability per adjacent spy unit per turn
  attackProfile?: UnitAttackProfile;
  splash?: UnitSplashCapability;
  airInterceptionDefense?: AirInterceptionDefense;
  airOperation?: AirOperationDefinition;
  paradrop?: ParadropCapability;
  /** Air-base-roster-driven troop insertion (see airborne-system.ts's executeAirAssault). Range is read from this same unit's airOperation.operationalRange, not stored here — the two must never drift apart by editing one and not the other (see the code comment at attack_helicopter's operationalRange definition). */
  airAssault?: AirAssaultCapability;
  /** True on units eligible to be carried by another unit's Air Assault action. Not derived from UnitClass — 'gunpowder' is too broad (also covers artillery/AA/anti-tank). */
  airAssaultPassengerEligible?: true;
  airDefenseProvider?: AirDefenseProviderCapability;
  /** #545: this unit is a strategic-launch platform once built (Missile Submarine). */
  strategicLaunchPlatform?: StrategicLaunchCapability;
  terrainCostOverrides?: Partial<Record<string, number>>;
  cargoCapacity?: number;
  cargoSize?: number;
  cityAssaultMultiplier?: number;
  combinedArms?: UnitCombinedArmsCapability;
  /** Portion of an improvement-derived Fort/Citadel multiplier that remains. */
  fortificationPenetration?: number;
  /** ASW specialist radius: detects concealed submarines within this range instead of
   * the ordinary adjacency-only rule. See src/systems/concealment.ts. */
  detection?: NavalDetectionCapability;
  /** Air-base roster slots this naval unit's own deck provides when hosting an AirBaseRef{kind:'carrier'}. Only meaningful on carrier-capable naval hulls. */
  carrierDeckCapacity?: number;
  /**
   * Whether this unit type is modeled by the land-supply system (#544).
   * Absent means "derive from domain + unit class" (see
   * `unitParticipatesInLandSupply` in supply-participation.ts) — explicit
   * `true`/`false` here always wins over that derivation, so a future
   * non-civ organized force (or the Great General unit, MR3) can opt in
   * without changing engine logic, and a land-military unit can opt out if
   * a future design needs an exception.
   */
  participatesInLandSupply?: boolean;
  /**
   * How many land-supply "slots" a participating land unit consumes from a
   * naval logistics source (#544 §10). Initialized to the same number as
   * `cargoSize` where applicable, but read independently — never derived
   * from `cargoSize` at runtime, so the two can diverge in a future balance
   * pass without a code change.
   */
  landSupplyCost?: number;
  /** Naval only: total land-supply slots this ship can project (#544 §10). */
  landSupplyCapacity?: number;
  /** Naval only: hex range within which it can shore-supply (#544 §10). */
  projectsLandSupplyRange?: number;
}

export type LandSupplyState = 'full' | 'stable-unsupported' | 'grace' | 'degraded' | 'severe';

export interface UnitLandSupplyStatus {
  state: LandSupplyState;
  /** Consecutive owner-turns ending in hostile territory with no covering source. Resets to 0 the instant either condition is false. */
  hostileUnsupportedTurns: number;
  /** Consecutive owner-turns at Full Supply without attacking — drives field-recovery clearing. */
  suppliedTurnsSinceRecovery: number;
}

export interface NavalDetectionCapability {
  concealedNavalRange: number;
}

export interface UnitCombinedArmsCapability {
  provides?: readonly string[];
  requiresAdjacent?: { providerTag: string; multiplier: number; label: string };
}

export interface UnitSplashCapability {
  damageFraction: number;
  maxTargets: number;
  label: string;
}

export interface WorkerTask {
  action: WorkerActionType;
  coord: HexCoord;
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
  /** Scenario-owned combat value; absent units use their catalog definition. */
  combatStrengthOverride?: number;
  hasMoved: boolean;
  hasActed: boolean;         // used action this turn (build, found, etc.)
  chargesRemaining?: number; // workers default to 2; omitted on legacy saves
  missionaryCooldownUntilTurn?: number; // set after preach(); missionary can't preach again until state.turn >= this
  workerTask?: WorkerTask;    // active multi-turn improvement the worker is assigned to
  isResting: boolean;        // player explicitly chose to rest/heal this turn
  skippedTurn?: boolean;     // player chose to hold this unit out of unit cycling this turn
  isFortified?: boolean;    // unit is in defensive stance; excluded from unmoved-unit cycling, +25% defense
  geneTherapyReady?: boolean;
  // undefined = tech never researched; true = charged and ready; false = cooldown (must rest in city to reset)
  /** #544 land-supply progression. Absent means "never resolved" — treated identically to Full Supply. */
  landSupply?: UnitLandSupplyStatus;
  automation?:
    | { mode: 'auto-explore'; lastTargets: string[]; startedTurn: number }
    | { mode: 'journey'; destination: HexCoord };
  committedToRouteId?: string;   // set on establish; blocks movement while set
  tripsRemaining?: number;       // S5 sets it; S6b decrements on each completed round trip
  routeDirection?: 'outbound' | 'inbound';  // S6b uses; S5 leaves undefined
  cargoUnitIds?: string[];      // unit ids loaded into this carrier
  transportId?: string;         // set when this unit is loaded as cargo
  airBase?: AirBaseRef;
  airMission?: 'intercept';
  interceptedTurn?: number;
  /** Set true when a concealed submarine fires; makes it visible/targetable to every
   * civ with fog visibility of its tile for the rest of this round. Cleared the same
   * way hasActed resets at the owning civ's next turn-start. See concealment.ts. */
  revealedThisTurn?: boolean;
  /** #544 MR3: which GENERAL_DEFINITIONS entry this specific great_general
   * instance is. Absent for every other unit type. */
  generalDefinitionId?: string;
  /** #544 MR3: true only on the turn a General spawns (contract §13: "no
   * heroic command on spawn turn, no passive stabilization on spawn turn,
   * operational next owner turn"). Cleared at the start of this unit's
   * owner's next turn. */
  generalNoCommandThisTurn?: boolean;
  /** #544 MR4: charges spent out of GeneralDefinition.maxCommandCharges.
   * Absent = 0 used (full charges) — legacy-save-safe by construction, same
   * convention as chargesRemaining. */
  generalCommandChargesUsed?: number;
  /** #544 MR4: unit can't issue another heroic command until
   * state.turn >= this. Absent = no active cooldown. Mirrors
   * missionaryCooldownUntilTurn exactly. */
  generalCommandCooldownUntilTurn?: number;
  /** #544 MR4 contract §18: Rally "prevents worsening again until next
   * owner turn." Consumed by advanceOverextensionStage's stabilizedByGeneral
   * input for the remainder of this round, then cleared by resetUnitTurn at
   * this unit's owner's next turn. */
  rallyProtectedThisRound?: boolean;
  /** #887 MR1: recording-only. Set by issueSeizeTheMoment on each unit whose
   * action it refreshed; read (only when `turn === state.turn`) by combat/
   * capture career attribution to credit that General with "battle influenced
   * (seize)". Cleared by resetUnitTurn alongside rallyProtectedThisRound. Does
   * NOT affect any gameplay resolution. */
  seizeGrantedBy?: { generalDefinitionId: string; turn: number };
  /** #544 MR4 contract §20: Last Stand's defense bonus + one-time Hold save
   * for this unit's formation. Absent = not under Last Stand. */
  lastStandHold?: LastStandHoldState;
  /** #544 MR4 contract §19: "a unit may not chain multiple captures in the
   * same turn." Set by beginMajorCityAssault on the capturing unit;
   * cleared by resetUnitTurn. */
  hasCapturedCityThisTurn?: boolean;
}

export interface CrisisForce {
  id: string;
  targetCivId: string;
  unitIds: string[];
  createdTurn: number;
  severity: OpponentChallenge;
  herdRoutes?: Record<string, HerdRoute>;
}

export interface HerdRoute {
  unitId: string;
  committedTurn: number;
  steps: HexCoord[];
}

export type StampedePhase = 'warning' | 'active' | 'resolved';
export type StampedeOutcome = 'defeated' | 'contained' | 'survived';

/** Target-scoped, serializable lifecycle and recurrence facts for Beast Stampedes. */
export interface StampedeState {
  targetCivId: string;
  forceId?: string;
  phase?: StampedePhase;
  createdTurn?: number;
  resolvedTurn?: number;
  eligibleTurns: number;
  activeTurns: number;
  cityDamage: number;
  civilianDeaths: number;
  pillagedTileKeys: string[];
  /** Reset at the start of each active pass; total history stays in pillagedTileKeys. */
  pillagesThisTurn?: number;
  outcome?: StampedeOutcome;
  rewardGranted?: boolean;
  herdingInsight?: { expiresTurn: number; consumed?: boolean };
  /** Persisted so an expired charge only converts when its unit never became trainable. */
  herdingInsightEligibleUnitSeen?: boolean;
  lastResolvedTurn?: number;
}

export type RogueElephantHostPhase = 'warning' | 'active' | 'dispersing' | 'resolved';
export type RogueElephantHostOutcome = 'defeated' | 'dispersed' | 'escaped';
export type RogueHostTarget =
  | { kind: 'valuable-improvement'; tileKey: string }
  | { kind: 'fort'; tileKey: string }
  | { kind: 'city-approach'; cityId: string; tileKey: string };

/** Target-scoped lifecycle facts for the coordinated Rogue Elephant Host. */
export interface RogueElephantHostState {
  targetCivId: string;
  forceId?: string;
  phase?: RogueElephantHostPhase;
  createdTurn?: number;
  /** Retained after #706 resolution so the Host can occur at most once per game. */
  completed?: boolean;
  target?: RogueHostTarget;
  /** A broken command keeps its own short lifecycle; it is not an ordinary Stampede. */
  dispersalTurnsRemaining?: number;
  outcome?: RogueElephantHostOutcome;
  resolvedTurn?: number;
  rewardGranted?: boolean;
  recoveredHarnesses?: { expiresTurn: number; consumed?: boolean };
  /** Persisted so expiry converts only if War Elephant never became trainable. */
  recoveredHarnessesEligibleUnitSeen?: boolean;
}

// --- Cities ---

export type BuildingCategory = 'production' | 'food' | 'science' | 'economy' | 'military' | 'culture' | 'espionage';
export type CityFocus = 'balanced' | 'food' | 'production' | 'gold' | 'science' | 'custom';
export type CityMaturity = 'outpost' | 'village' | 'town' | 'city' | 'metropolis';

export interface NationalProject {
  homeEra: number;
  // #591 MR4: one-time permanent-trigger project (e.g. Sacred Council). Buildable from
  // homeEra onward with NO upper build-window bound, and NEVER expires. See
  // .claude/rules/game-balance.md "Milestone National Projects".
  milestone?: true;
}

export interface Building {
  id: string;
  name: string;
  category?: BuildingCategory;
  yields: ResourceYield;
  productionCost: number;
  description: string;
  techRequired?: string | null;
  /** Additional technologies required alongside the legacy single-tech gate. */
  requiredTechs?: string[];
  coastalRequired?: boolean;
  pacing?: PacingMetadata;
  resourceRequired?: ResourceType[];
  routeCapacity?: number;   // trade route slots added to the FROM city; 0 or absent = none
  requiresBuildings?: string[];   // chain of building IDs that must be built first
  /** This project may be placed only outside the civilization's true capital. */
  cannotBuildInCapital?: true;
  uniquePerEmpire?: true;         // only one instance per civ (used by national projects)
  nationalProject?: NationalProject;  // present when this building is a national project
  civYieldBonus?: Partial<ResourceYield>;  // empire-wide yield bonus while active
  obsoletedByTech?: string;  // once this tech completes, building is hidden from queue, silently dequeued, upkeep-free
  happiness?: number;  // per-city unrest-pressure reduction while built (#552); NOT for nationalProject buildings — those must be empire-wide, see game-balance.md
  /** AI priority granted only when this city has a live detected hostile-spy threat. */
  defensiveEspionageAiValue?: number;
  airDefenseProvider?: AirDefenseProviderCapability;
  /** #545: this building is a strategic-launch platform once built (Missile Silo). */
  strategicLaunchPlatform?: StrategicLaunchCapability;
  /** #545: completing this item does not persist into city.buildings — it fires
   * completedBuilding for one turn (so turn-manager.ts's completion hook runs), then
   * is immediately re-buildable. Generic primitive for any future repeatable,
   * consumed-on-completion production item; only `warhead` uses it today. */
  consumedOnCompletion?: true;
  /** #545: getAvailableBuildings hides this item once the civ's strategicArsenal
   * is at or above getStrategicArsenalCapacity, or Manhattan Project is unbuilt.
   * Generic gate field; only `warhead` uses it today. */
  arsenalCapacityGated?: true;
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
  /** One-time save-migration exemption for pre-resource-gate queued items. */
  legacyResourceGrace?: string[];
  /** One-time save-migration exemption for queued items retimed behind new technologies. */
  legacyTechGrace?: string[];
  ownedTiles: HexCoord[];    // city territory/control, not active citizen assignment
  workedTiles: HexCoord[];
  focus: CityFocus;
  maturity: CityMaturity;
  lastFocusReminderTurn?: number;
  cyberMarketDisruption?: { turnsRemaining: number };
  unrestLevel: 0 | 1 | 2;     // 0=stable, 1=unrest, 2=revolt
  unrestTurns: number;         // turns spent at current unrest level (>= 1 when unrestLevel > 0)
  conquestTurn?: number;       // turn this city was captured; cleared after 15 turns
  occupation?: OccupiedCityState;
  spyUnrestBonus: number;      // bonus pressure injected by enemy espionage; decays 5/turn
  productionDisabledTurns?: number; // late-game sabotage/cyber effect timer
  appeasedOnTurn?: number;     // turn appeaseFaction last succeeded on this city; blocks a second appease the same turn
  idleProduction?: 'gold' | 'science' | null; // conversion mode when queue is empty
  hp?: number;               // city hit points for pirate siege (default 100)
  concessionImmunityUntilTurn?: number; // uprising concession: no new unrest until this turn
  resilienceBonusUntilTurn?: number;    // catastrophe recovery: +1 food +1 production until this turn
  /** Global turn when this city's Coastal Battery last returned naval siege damage. */
  coastalBatteryCounterfireTurn?: number;
}

// --- Economy ---

export type TreasuryStrainLevel = 'none' | 'low' | 'high' | 'critical';
export type EconomyStrainLevel = TreasuryStrainLevel;

export type ProductionDropReason =
  | 'obsoleted'                  // building or unit: obsoletedByTech / isBuildingObsolete fired
  | 'resource-lost'              // building or unit: required resource no longer available
  | 'no-longer-available'        // building or unit: neither obsoleted nor resource-lost explains it
                                  // (e.g. a save-compat queue item whose tech or local prerequisite is unmet)
  | 'build-window-expired'       // national-project building: outside homeEra/homeEra+1
  | 'coastal-access-lost'        // building or unit: city lost coastal access
  | 'training-building-missing'  // unit: trainedFromBuilding no longer present
  | 'air-base-unavailable';      // unit: compatible base is missing or full

export interface DroppedProductionItem {
  itemId: string;                 // building id (key into BUILDINGS) or UnitType
  itemKind: 'building' | 'unit';
  reason: ProductionDropReason;
}

export interface EconomyMaintenanceBreakdown {
  buildingUpkeep: number;
  unitUpkeep: number;
  freeBuildings: number;
  freeUnits: number;
  paidBuildings: number;
  paidUnits: number;
}

export interface EconomyStatus {
  turn: number;
  grossGoldIncome: number;
  buildingMaintenance: number;
  unitMaintenance: number;
  netGoldPerTurn: number;
  unpaidMaintenance: number;
  strainLevel: TreasuryStrainLevel;
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
  unlocks: string[];         // effect text only — no unit or building names
  unlocksUnits?: UnitType[];      // trainable unit types gated by this tech
  unlocksBuildings?: string[];    // building IDs (keys of BUILDINGS) gated by this tech
  era: number;               // 1-3 for milestone 1
  historicalStatus?: 'historical' | 'emerging' | 'speculative';
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
  | 'reabsorb_breakaway'
  | 'arms_control_pact';

export type TreatyType = 'non_aggression_pact' | 'trade_agreement' | 'open_borders' | 'alliance' | 'vassalage' | 'arms_control_pact';

export interface Treaty {
  type: TreatyType;
  civA: string;
  civB: string;
  turnsRemaining: number;     // -1 = permanent until broken
  goldPerTurn?: number;       // for trade agreements
  // #545 MR6: only set for arms_control_pact -- see computeArmsControlCap in
  // strategic-arsenal-system.ts. Absent on every other treaty type.
  arsenalCap?: number;
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
  /** #545 MR4 spec §11: ids of every civ that has ever struck this civ with a
   * strategic strike. Append-only, never pruned or decayed -- unlike the
   * capped rolling `events` log, a nuclear strike must never be "forgotten"
   * for retaliation-classification purposes. Optional (absent means never
   * struck), matching this codebase's convention for new fields on widely
   * hand-constructed types (e.g. `Civilization.strategicArsenal?`) -- a
   * required field here would break every test file that builds a
   * `DiplomacyState` literal without it. Always read via `?? []`; see
   * strategic-launch-system.ts's isStrategicStrikeRetaliation. */
  strategicStrikesReceivedFrom?: string[];
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
  type: 'peace' | 'treaty';
  treatyType?: TreatyType;        // set when type === 'treaty'
  turnsRemaining?: number;         // treaty duration to sign with (mirrors AI decision: 10 for NAP, -1 otherwise)
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
  // propaganda tech (#524 MR2a): gates flip_loyalty specifically, not the shared Stage 4 set
  | 'flip_loyalty'        // on success, peacefully transfers a foreign non-capital city to the spy's owner
  // Stage 5 (digital-surveillance and cyber-warfare tech)
  | 'cyber_attack'
  | 'misinformation_campaign'
  | 'election_interference'
  | 'satellite_surveillance'
  // covert-operations tech (#526 MR7): human-initiated only, see chooseAiMission
  | 'sabotage_relief'     // pause a rival's outbreak remedy for 4 turns; witnessed on discovery
  // #442 MR1: black-chambers tech (era 5) — its own bucket, not folded into Stage 4
  | 'intercept_courier'   // severs one active trade route touching the target city
  // #442 MR1: diplomatic-networks tech (era 5) — its own bucket, not folded into Stage 4
  | 'bribe_official'      // steals a capped share of the target civ's treasury
  // #442 MR2: disinformation-bureau tech (era 8) — its own bucket, not folded into Stage 4
  | 'expose_scandal'      // bounded relationship penalty between the target and each of its treaty partners
  // #442 MR2: counterintelligence tech (era 9) — its own bucket. Remote-capable (see
  // missionRequiresPlacedSpy) — the first non-digital remote mission, justified inline there.
  | 'signals_intercept';  // one-time empire-wide snapshot of the target civ's unit positions/health

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
  // #442 MR2 signals_intercept: latest empire-wide troop snapshot per target civ. A
  // one-shot intel reveal, not an ongoing grant (unlike satellite_surveillance) — each
  // new signals_intercept overwrites the previous snapshot for that target, since a
  // stale disposition list has no value once the target's units have moved.
  signalsIntelligence?: Record<string, { turn: number; units: Array<{ type: UnitType; position: HexCoord; health: number }> }>;
  // Post-#442 audit fix: monitor_troops/gather_intel/identify_resources/monitor_diplomacy
  // already computed a MissionResult in resolveMissionResult but never persisted or
  // rendered it (dead computed data — see end-to-end-wiring.md). These four fields follow
  // the exact same snapshot-and-overwrite convention signals_intercept established above:
  // one-shot intel, latest report per target replaces the previous one, no ongoing grant.
  //
  // monitor_troops: city-scoped troop observation, keyed by the observed city (a civ can
  // have multiple cities under separate observation).
  troopObservations?: Record<string, { turn: number; targetCivId: string; units: Array<{ type: UnitType; position: HexCoord; health: number }> }>;
  // gather_intel: civ-wide tech/treasury/treaty snapshot, keyed by target civ. Tech
  // progress is summarized as a count + current research rather than the full completed
  // list, to keep the stored payload a small bounded snapshot rather than an
  // ever-growing raw dump of target-civ state.
  intelReports?: Record<string, { turn: number; completedTechCount: number; currentResearch: string | null; researchProgress: number; treasury: number; treaties: Treaty[] }>;
  // identify_resources: city-territory resource snapshot, keyed by the surveyed city.
  resourceReports?: Record<string, { turn: number; targetCivId: string; resources: string[] }>;
  // monitor_diplomacy: civ-wide relationship/trade-partner snapshot, keyed by target civ.
  diplomacyReports?: Record<string, { turn: number; relationships: Record<string, number>; tradePartners: string[] }>;
}

export type EspionageState = Record<string, EspionageCivState>;

export interface TrainableUnitEntry {
  type: UnitType;
  name: string;
  cost: number;
  techRequired?: string;
  /** Additional technologies required alongside the legacy single-tech gate. */
  requiredTechs?: string[];
  obsoletedByTech?: string;
  /** Retires this unit only after every listed technology is complete. */
  obsoletedWhenAllTechs?: string[];
  upgradesTo?: UnitType;
  civTypeRequired?: string;  // only available/shown for this civ
  replacesUnit?: UnitType;   // hides this standard unit for the civ above
  resourceRequired?: ResourceType[];
  coastalRequired?: boolean;
  trainedFromBuilding?: string;  // city must contain this building to train the unit
}

export type CombatRole =
  | 'frontline'
  | 'ranged'
  | 'siege'
  | 'shock'
  | 'pursuit'
  | 'reconnaissance'
  | 'detection'
  | 'anti-mounted'
  | 'anti-armor'
  | 'air-superiority'
  | 'ground-air-defense'
  | 'capital-ship'
  | 'escort'
  | 'formation-support'
  | 'capture'
  | 'civilian';

export type UpgradeFamily =
  | 'line-infantry'
  | 'mounted'
  | 'ranged-infantry'
  | 'siege'
  | 'surface-warship'
  | 'submarine'
  | 'fighter'
  | 'bomber'
  | 'naval-strike'
  | 'air-support'
  | 'transport'
  | 'trade'
  | 'espionage'
  | 'detection'
  | 'civilian';

export type LocalInfrastructureFamily =
  | 'mounted-light-support'
  | 'mounted-heavy'
  | 'classical-siege'
  | 'armored';

export interface UnitRoleDefinition {
  primaryRole: CombatRole;
  secondaryRoles?: readonly CombatRole[];
  counters: readonly CombatRole[];
  vulnerableTo: readonly CombatRole[];
  roleSummary: string;
  upgradeFamily: UpgradeFamily;
  /** Typed local-infrastructure families consumed by production and city-healing effects. */
  localInfrastructureFamilies?: readonly LocalInfrastructureFamily[];
  aiRoles: readonly AIStrategicRole[];
  /** Public, player-facing facts that are true regardless of the viewer's private state. */
  publicFacts?: readonly string[];
  terminalReason?: string;
  domainTransitionReason?: string;
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
  nearDefeat?: boolean;   // true when cities.length <= 1; used by audio system
  isEliminated?: boolean; // true once all cities are captured; hides civ from diplomacy
  lastCombatTurnByLandmass?: Record<string, number>; // landmassId → turn of last combat
  // Per-player challenge (humans only): governs internal-pressure knobs (crisis
  // frequency/severity, unrest contagion) ONLY — AI behavior stays on the
  // game-wide `opponentChallenge`. Falls back to game-wide when unset.
  challenge?: OpponentChallenge;
  pendingChallenge?: OpponentChallenge; // applied at the start of this civ's next turn
  recentCrisisHistory?: string[]; // last 4 crisis flavor ids, for anti-repeat weighting
  lastCrisisOnsetTurn?: number;
  feastUntilTurn?: number; // beast-slayer's feast (hunt crisis): +2 happiness while active
  /** #544 MR3: civ-wide Great General earn progress. Absent = no progress yet. */
  generalProgress?: GeneralProgressState;
  /** #544 MR3: every General this civ has ever spawned, alive or dead. A
   * generalDefinitionId in here is never redrawn as a candidate again
   * (contract §13: "a used General never appears again"). */
  generalHistory?: GeneralHistoryEntry[];
  /** #545: shared empire-wide warhead count. Absent (legacy saves, or a
   * civ that has never produced one) means zero — see
   * strategic-arsenal-system.ts's getStrategicArsenal. Never exceeds
   * getStrategicArsenalCapacity in normal play; MR1's capacity resolver
   * intentionally does not clamp this field itself (see spec §1's
   * "capacity is a production-eligibility gate, not a live clamp"). */
  strategicArsenal?: number;
  /** #927 rung 6: Federal Autonomy stance. Undefined/false = centralized
   * (the safe default for legacy saves). Never named `autonomy` alone — that
   * word is already `AutonomyPostureId` in the unrelated Cyber/network-warfare
   * system (src/core/autonomy-state.ts). */
  federalismEnabled?: boolean;
  /** Turn of the most recent federalismEnabled toggle (either direction);
   * enforces FEDERALISM_LOCK_TURNS in faction-system.ts. */
  federalismChangedTurn?: number;
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
  resurgent?: boolean;       // true for threat-pressure spawned camps
  banditLordName?: string;   // named leader for high-threat resurgent camps
}

export interface BarbarianCampPressure {
  armorLastObservedTurn?: number;
  airLastObservedTurn?: number;
}

export interface PirateFleet {
  id: string;
  unitId: string;            // Unit in state.units with owner === 'pirate'
  targetCivId: string;       // player civ the fleet is pressuring
  targetCityId: string;      // nearest coastal city at spawn time
  landmassId: string;
  era: number;               // era at spawn time, governs siege damage
  plunderCooldown: number;   // turns remaining before next plunder attempt
}

// --- Legendary Beasts ---

export type BeastId = 'giant_boar' | 'dire_wolf' | 'emerald_basilisk' | 'sea_serpent' | 'dune_wurm' | 'storm_roc' | 'swamp_hydra' | 'ancient_dragon';

export type BeastsMode = 'off' | 'calm' | 'wild';

export type BeastLairStatus = 'dormant' | 'awake' | 'slain' | 'claimed';

export type BeastHoardChoice = 'gold' | 'lore' | 'trophy';

export interface PendingHoardChoice {
  lairId: string;
  civId: string;     // slayer civ; only this civ may resolve it
}

export interface BeastLair {
  id: string;                 // `lair-${beastId}`
  beastId: BeastId;
  position: HexCoord;
  status: BeastLairStatus;
  strength: number;           // bonus experience fed to beast units while the lair is ignored
  awakenedTurn?: number;
  slainBy?: string;           // civ id that landed the killing blow
  slainTurn?: number;
  claimedBy?: string;         // civ that chose the Trophy option (MR4)
  unitIds: string[];          // live beast unit ids leashed to this lair
}

export interface BeastsState {
  mode: BeastsMode;
  lairs: Record<string, BeastLair>;
  sightingsByCiv: Record<string, BeastId[]>;   // per-civ bestiary sightings (MR2 populates)
  pendingHoardChoices?: PendingHoardChoice[];   // queued for human players (MR4)
  migrationPending?: boolean;                  // true on legacy saves; processTurn places lairs on first tick
}

// --- Minor Civilizations ---

export const MINOR_CIV_ARCHETYPES = ['militaristic', 'mercantile', 'cultural'] as const;
export type MinorCivArchetype = typeof MINOR_CIV_ARCHETYPES[number];

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

export const QUEST_TYPES = ['destroy_camp', 'gift_gold', 'defeat_units', 'trade_route', 'sponsor_festival'] as const;
export type QuestType = typeof QUEST_TYPES[number];

export type QuestTarget =
  | { type: 'destroy_camp'; campId: string; position: HexCoord }
  | { type: 'gift_gold'; amount: number }
  | { type: 'defeat_units'; count: number; nearPosition: HexCoord; radius: number; cityId?: string }
  | { type: 'trade_route'; minorCivId: string }
  | { type: 'sponsor_festival'; amount: number; requiresLuxury: true };

export interface QuestReward {
  relationshipBonus: number;
  gold?: number;
  science?: number;
  freeUnit?: UnitType;
}

interface QuestBase {
  id: string;
  type: QuestType;
  description: string;
  target: QuestTarget;
  cityId?: string;
  reward: QuestReward;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  turnIssued: number;
  expiresOnTurn: number | null;
}

export type Quest = QuestBase & (
  | { chainId?: never; stepIndex?: never }
  | { chainId: string; stepIndex: 0 | 1 | 2 }
);

export type MinorCivChainStatus =
  | {
      chainId: string;
      status: 'pending';
      statusTurn: number;
      pendingStepIndex: 0 | 1 | 2;
      pendingExpiresOnTurn: number;
    }
  | { chainId: string; status: 'allied'; statusTurn: number; earnedTurn: number }
  | { chainId: string; status: 'broken'; statusTurn: number; earnedTurn: number };

export type MinorCivRelationshipStatus = 'at-war' | 'hostile' | 'neutral' | 'friendly' | 'allied';

export type MinorCivRegionalGrievanceStatus = 'wary' | 'mobilizing' | 'coalition-talks' | 'cooling';

export type MinorCivRegionalGrievanceCause =
  | {
      type: 'minor-civ-conquest';
      turn: number;
      minorCivId: string;
      distance: number;
      pressure: number;
    }
  | {
      type: 'reparations';
      turn: number;
      actorCivId: string;
      pressure: number;
    };

export interface MinorCivRegionalGrievance {
  targetCivId: string;
  pressure: number;
  status: MinorCivRegionalGrievanceStatus;
  lastUpdatedTurn: number;
  lastConquestTurn?: number;
  decayBlockedUntilTurn?: number;
  causes: MinorCivRegionalGrievanceCause[];
}

export type MinorCivCoalitionStatus = 'forming' | 'active' | 'cooling';

export interface MinorCivCoalitionRecord {
  id: string;
  targetCivId: string;
  memberIds: string[];
  status: MinorCivCoalitionStatus;
  createdTurn: number;
  updatedTurn: number;
  cooldownUntilTurn: number;
}

export interface MinorCivRegionalCooldown {
  targetCivId: string;
  memberIds: string[];
  cooldownUntil: number;
}

export type MinorCivPosture = 'settled' | 'fortifying' | 'mobilizing' | 'recovering';

export type MinorCivPolicy = 'balanced' | 'defense' | 'economy' | 'knowledge' | 'recovery';

export interface MinorCivEconomyState {
  policy: MinorCivPolicy;
  posture: MinorCivPosture;
  lastProcessedTurn: number;
  lastPostureChangeTurn?: number;
  localRecoveryUntilTurn?: number;
  /** Turn on/after which the next emergency levy may fire (#951). Hard gate, independent of posture. */
  levyCooldownUntilTurn?: number;
  lastQueueDecisionTurn?: number;
  pendingUnitSpawn?: {
    unitType: UnitType;
    completedTurn: number;
    attempts: number;
  };
  recentProductionSummary?: {
    itemId: string;
    itemClass: 'building' | 'unit' | 'idle';
    completedTurn: number;
  };
}

export type QuestAction =
  | { type: 'gift_gold'; actorCivId: string; minorCivId: string; amount: number; turn: number }
  | { type: 'sponsor_festival'; actorCivId: string; minorCivId: string; turn: number }
  | { type: 'trade_route_created'; actorCivId: string; fromCityId: string; toCityId: string; routeId: string; turn: number }
  | { type: 'unit_defeated'; actorCivId: string; defeatedOwnerId: string; unitId: string; position: HexCoord; turn: number }
  | { type: 'camp_destroyed'; actorCivId: string; campId: string; position: HexCoord; turn: number };

export interface MinorCivState {
  id: string;
  definitionId: string;
  cityId: string;
  units: string[];
  diplomacy: DiplomacyState;
  activeQuests: Record<string, Quest>;
  chainStatusByCiv: Record<string, MinorCivChainStatus>;
  questCooldownUntilByCiv: Record<string, number>;
  lastNotifiedStatusByCiv: Record<string, MinorCivRelationshipStatus>;
  regionalGrievanceByCiv?: Record<string, MinorCivRegionalGrievance>;
  economy?: MinorCivEconomyState;
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
  attackerStrength: number;
  defenderStrength: number;
  attackerPosition: HexCoord;
  defenderPosition: HexCoord;
  modifierFacts?: {
    attacker: CombatModifierFact[];
    defender: CombatModifierFact[];
  };
  exchange?: CombatExchangeSummary;
  splashHits?: CombatSplashHit[];
}

export interface CombatSplashHit {
  unitId: string;
  damage: number;
}

export interface CombatModifierFact {
  key: string;
  label: string;
  sourceVisibility: 'owner' | 'public';
  operation: 'flat' | 'multiplier';
  value: number;
  outcome: 'applied' | 'ignored' | 'capped' | 'superseded';
  ignoredReason?: 'role' | 'condition' | 'unit-class' | 'domain' | 'inactive-source';
}

export type CombatExchangeKind = 'none' | 'turret-fire' | 'evasion' | 'shock' | 'siege-anti-personnel';

export interface CombatExchangeSummary {
  kind: Exclude<CombatExchangeKind, 'none'>;
  label: string;
}

export interface CombatRewardNotification {
  recipientUnitId: string;
  recipientCivId: string;
  defeatedUnitId: string;
  experienceAwarded: number;
  healthRestored: number;
  goldAwarded: number;
  surprise: {
    type: 'battlefield_insight' | 'salvaged_supplies';
    label: string;
    experienceAwarded: number;
    goldAwarded: number;
  } | null;
  message: string;
}

// --- Map Scripts ---

export type MapScript =
  | 'procedural'
  | 'earth'
  | 'old-world'
  | 'new-world'
  | 'balanced'
  | 'single-continent';

export type StartPlacementMode = 'balanced' | 'historical';
export type GameOverReason = 'domination' | 'all-humans-eliminated';

// --- Game Modes ---

export type GameMode = 'solo' | 'hotseat';

export interface HotSeatPlayer {
  name: string;
  slotId: string;     // e.g. 'player-1', 'player-2', 'ai-1'
  civType: string;    // e.g. 'egypt', 'rome' — maps to CivDefinition.id
  isHuman: boolean;
  challenge?: OpponentChallenge; // human players only; per-player crisis/unrest difficulty
}

export interface HotSeatConfig {
  playerCount: number;
  mapSize: 'small' | 'medium' | 'large';
  /** Keep map generation fields in sync with SoloSetupConfig. */
  mapScript?: MapScript;
  startPlacementMode?: StartPlacementMode;
  players: HotSeatPlayer[];
  customCivilizations?: CustomCivDefinition[];
  // #545 MR7: mirrors SoloSetupConfig.settingsOverrides -- lets hot-seat
  // setup (e.g. the superweapons card) pass an explicit settings override
  // through to createHotSeatGame's createDefaultSettings call.
  settingsOverrides?: Partial<GameSettings>;
}

export interface SoloSetupConfig {
  civType: string;
  mapSize: 'small' | 'medium' | 'large';
  opponentCount: number;
  gameTitle: string;
  opponentChallenge?: OpponentChallenge;
  settingsOverrides?: Partial<GameSettings>;
  seed?: string;
  customCivilizations?: CustomCivDefinition[];
  mapScript?: MapScript;
  startPlacementMode?: StartPlacementMode;
}

export interface GameEvent {
  type: string;
  message: string;
  turn: number;
  target?: { kind: 'map'; coord: HexCoord; label: string };
}

export type OpponentChallenge = 'explorer' | 'standard' | 'veteran';

export type AIStrategicRole =
  | 'capture'
  | 'frontline'
  | 'anti-armor'
  | 'ranged'
  | 'siege'
  | 'mobile'
  | 'air-combat'
  | 'air-defense'
  | 'naval-combat'
  | 'transport'
  | 'escort'
  | 'recon'
  | 'detection'
  | 'settlement'
  | 'worker'
  | 'resource-expedition'
  | 'trade'
  | 'espionage'
  | 'missionary';

export type AIStrategicObjective =
  | 'defend'
  | 'recover'
  | 'expand'
  | 'secure-resource'
  | 'raid'
  | 'blockade'
  | 'repel'
  | 'capture'
  | 'support-ally';

export type AIPlanReason =
  | 'urgent-defense'
  | 'nearby-opportunity'
  | 'retaliate-recent-attack'
  | 'continue-active-war'
  | 'alliance-obligation'
  | 'critical-resource'
  | 'no-local-alternative'
  | 'homeland-secure'
  | 'recover-damaged-force'
  | 'modernization-gap'
  | 'camp-defense'
  | 'visible-stampede'
  | 'opportunistic-raid';

export type AIPlanPhase =
  | 'scouting'
  | 'mobilizing'
  | 'advancing'
  | 'attacking'
  | 'consolidating'
  | 'withdrawing'
  | 'complete'
  | 'abandoned';

export type AITarget =
  | { kind: 'city'; id: string; lastKnownPosition: HexCoord }
  | { kind: 'unit'; id: string; lastKnownPosition: HexCoord }
  | { kind: 'resource'; resource: ResourceType; position: HexCoord }
  | { kind: 'camp'; id: string; lastKnownPosition: HexCoord }
  | { kind: 'region'; id: string; anchor: HexCoord };

export interface AIStrategicPlan {
  id: string;
  actorId: string;
  objective: AIStrategicObjective;
  target: AITarget;
  theaterId: string;
  phase: AIPlanPhase;
  reasonCodes: AIPlanReason[];
  commitment: number;
  createdTurn: number;
  reconsiderAfterTurn: number;
  expiresAfterTurn: number;
  lastProgressTurn: number;
  rallyPoint?: HexCoord;
  requiredRoles: Partial<Record<AIStrategicRole, number>>;
  assignedUnitIds: string[];
}

export interface MajorCivPlanPortfolio {
  primaryPlan: AIStrategicPlan | null;
  defensePlansByCityId: Record<string, AIStrategicPlan>;
  upgradeRoutesByUnitId: Record<string, {
    cityId: string;
    createdTurn: number;
  }>;
  modernizationDemand: number;
  researchTargetTechId: string | null;
  lastPlannedTurn: number;
  lastExecutedTurn: number;
}

export interface CivPressureLedger {
  activeIndependentThreatIds: string[];
  recoveryUntilTurn: number;
  lastResolvedThreatTurn: number | null;
  lastWarningTurnByKey: Record<string, number>;
  lastStrategicAudioTurn: number | null;
}

export interface OpponentAIState {
  version: 1;
  migrationGraceRoundsRemaining: number;
  majorCivs: Record<string, MajorCivPlanPortfolio>;
  barbarianCamps: Record<string, AIStrategicPlan>;
  barbarianHomeCampByUnitId: Record<string, string>;
  minorCivs: Record<string, AIStrategicPlan>;
  pressureByCiv: Record<string, CivPressureLedger>;
  lastPlannedRound: number | null;
  lastProcessedRound: number | null;
  lastFinalizedRound: number | null;
}

// --- Trade & Resources ---

export type LuxuryResource = 'silk' | 'wine' | 'spices' | 'gems' | 'ivory' | 'incense'
  | 'gold' | 'silver' | 'furs' | 'sheep';
export type StrategicResource = 'copper' | 'iron' | 'horses' | 'stone' | 'cattle' | 'salt'
  | 'coal' | 'oil' | 'aluminum' | 'uranium' | 'rare-earth-elements' | 'battery-minerals';
export type ResourceType = LuxuryResource | StrategicResource;

export interface TradeRoute {
  id: string;              // 'route-N' using state.idCounters.nextRouteId
  fromCityId: string;
  toCityId: string;
  goldPerTrip: number;     // replaces goldPerTurn; S5 amortises to effective per-turn
  turnsPerTrip: number;    // ceil(hexDistance(from, to) / 3); stored for display + income math
  foreignCivId?: string;
}

export interface PurchasedResourceEntry {
  civId: string;          // hot-seat: which civ made the purchase
  resource: ResourceType;
  expiresOnTurn: number;  // = state.turn + 10 at time of purchase
}

export interface MarketplaceState {
  prices: Record<string, number>;
  priceHistory: Record<string, number[]>;
  fashionable: ResourceType | null;
  fashionTurnsLeft: number;
  tradeRoutes: TradeRoute[];
  purchasedResources?: PurchasedResourceEntry[];  // optional; defaults to [] for old saves
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
  | 'complete'
  | 'supply_intro'
  | 'general_command_intro';

export interface TutorialState {
  active: boolean;
  currentStep: TutorialStep;
  completedSteps: TutorialStep[];
}

// --- ID Counters ---

export interface IdCounters {
  nextUnitId:  number;
  nextCityId:  number;
  nextCampId:  number;
  nextQuestId: number;
  nextRouteId?: number;  // defaults to 1 on old saves (optional for back-compat)
  nextPirateFactionId?: number;
  nextNotificationId?: number;
  nextNetworkPlanId?: number;
}

// --- Game State (the whole thing) ---

export interface GameState {
  turn: number;
  era: number;
  /** Incremented only by ordered, deterministic save migrations. */
  saveSchemaVersion?: number;
  /**
   * Pure function of the seed string (see createGameId in game-state.ts) --
   * the base for every deterministic combat/AI/pirate/crisis RNG seed in the
   * codebase. NOT unique per playthrough instance -- two games created with
   * the same seed share the same gameId by design, since reproducibility
   * from a seed is the point. Never use this for save-slot/autosave/epic
   * identity or cross-playthrough cache-key purposes; use playthroughId.
   */
  gameId?: string;
  /**
   * Unique per playthrough instance, even across two games sharing the same
   * seed (and therefore the same gameId above). Salted with the real
   * creation timestamp (see createPlaythroughId in game-state.ts) --
   * deliberately NOT reproducible, since its only job is disambiguating
   * separate playthroughs for save-slot grouping/autosave keys/pruning and
   * cross-playthrough notification-suppression caches. Absent on saves
   * created before this field existed; callers must fall back to gameId.
   */
  playthroughId?: string;
  gameTitle?: string;
  opponentChallenge?: OpponentChallenge;
  pendingOpponentChallenge?: OpponentChallenge;
  opponentAI?: OpponentAIState;
  autonomyByCiv?: Record<string, import('./autonomy-state').AutonomyCivState>;
  networkCivicPressureByCity?: Record<string, number>;
  civilizations: Record<string, Civilization>;
  map: GameMap;
  units: Record<string, Unit>;
  cities: Record<string, City>;
  barbarianCamps: Record<string, BarbarianCamp>;
  /** Coarse camp-owned observations; never stores live unit or viewer data. */
  barbarianCampPressure?: Record<string, BarbarianCampPressure>;
  minorCivs: Record<string, MinorCivState>;
  minorCivCoalitions?: Record<string, MinorCivCoalitionRecord>;
  minorCivRegionalCooldowns?: Record<string, MinorCivRegionalCooldown>;
  tutorial: TutorialState;
  currentPlayer: string;     // civ ID whose turn it is
  gameOver: boolean;
  winner: string | null;
  gameOverReason?: GameOverReason;
  settings: GameSettings;
  marketplace?: MarketplaceState;
  economyStatusByCiv?: Record<string, EconomyStatus>;
  hotSeat?: HotSeatConfig;
  pendingEvents?: Record<string, GameEvent[]>;
  councilMemory?: CouncilMemoryState;
  tribalVillages: Record<string, TribalVillage>;
  beasts?: BeastsState;       // optional: legacy saves have no beasts
  pirateFleets?: Record<string, PirateFleet>;
  pirateFleetCooldownByCivLandmass?: Record<string, number>; // key: '${civId}:${landmassId}'
  resurgentCampCooldownByCivLandmass?: Record<string, number>; // key: '${civId}:${landmassId}'
  discoveredWonders: Record<string, string>;       // wonderId -> first discoverer civId
  wonderDiscoverers: Record<string, string[]>;     // wonderId -> all discoverer civIds
  legendaryWonderProjects?: Record<string, LegendaryWonderProject>;
  legendaryWonderAvailability?: Record<string, LegendaryWonderAvailabilityRecord>;
  completedLegendaryWonders?: Record<string, CompletedLegendaryWonder>;
  legendaryWonderTacticalEffects?: LegendaryWonderTacticalEffectState;
  builtNationalProjects?: Record<string, BuiltNationalProjectRecord>; // key: `${civId}:${buildingId}`
  /** Player-authored, empire-scoped choices made by national projects. */
  nationalProjectChoices?: Record<string, ResourceType>;
  legendaryWonderHistory?: LegendaryWonderHistory;
  legendaryWonderIntel?: Record<string, LegendaryWonderIntelEntry[]>;
  espionage?: EspionageState;
  pirates?: PirateState;       // normalized on load; absent on legacy saves
  notificationLog?: NotificationLog; // normalized on load; absent on legacy saves
  idCounters: IdCounters;
  embargoes: Embargo[];
  defensiveLeagues: DefensiveLeague[];
  pendingDiplomacyRequests?: PendingDiplomaticRequest[];
  territoryFrontiers?: Record<string, TerritoryFrontierState>;
  mapScript?: MapScript;  // undefined on old saves → treat as 'procedural'
  startPlacementMode?: StartPlacementMode;
  activeCrises?: Record<string, ActiveCrisis>;
  /** Non-diplomatic world-pressure actors; normalized on load. */
  crisisForces?: Record<string, CrisisForce>;
  /** Target-scoped Beast Stampede recurrence and lifecycle state; normalized on load. */
  stampedes?: Record<string, StampedeState>;
  /** Target-scoped Rogue Elephant Host state; normalized on load. */
  rogueElephantHosts?: Record<string, RogueElephantHostState>;
  reconReveals?: ReconReveal[];
  patrolReveals?: PatrolReveal[];
  // #591 MR4: religion core. Optional -- absent on legacy saves and the many minimal
  // literal-GameState test fixtures across this codebase (same convention as
  // activeCrises/pirates/espionage). Defaulted to {} in createNewGame for new games and
  // in migrateSaveToCurrent for old saves; every other reader must use `?? {}`.
  religions?: Record<string, Religion>;
  cityFaith?: Record<string, CityFaith>;
  /** #544 MR3: queued General candidate choices, one per civ that has
   * crossed a threshold and not yet chosen. Mirrors BeastsState's
   * pendingHoardChoices shape/convention. */
  pendingGeneralCandidateChoices?: PendingGeneralCandidateChoice[];
  /** #888: registry of fallback-generated officer identities that have been
   * materialised this game (offered as a candidate and/or selected). Keyed by
   * the generated id. The persisted record is authoritative — `resolveGeneralDefinition`
   * reads it and the name pools are never re-consulted, so a later pool edit
   * cannot rename an existing officer. Absent on legacy saves and minimal test
   * fixtures; defaulted to `{}` by migration 23 + `normalizeGeneratedGenerals`,
   * and every reader uses `?? {}` / `resolveGeneralDefinition`'s optional chain. */
  generatedGenerals?: Record<string, GeneratedGeneralIdentity>;
}

// --- Religion (#591 MR4) ---

export type ReligionBoon = 'serenity' | 'tithes' | 'fervor';

export interface Religion {
  id: string;            // 'religion-<ownerCivId>'
  name: string;          // invented, renameable
  ownerCivId: string;
  boon?: ReligionBoon;    // absent = choice pending; re-prompt owner each turn; NO boon effects until chosen
  foundedTurn: number;
}

export interface CityFaith {
  religionId: string;
  isHolyCity?: true;      // founding city — permanently immune to conversion, under ANY owner
  // Per-religion progress ledger (MR5, #592): keyed by candidate religionId, NOT a single
  // slot. This lets ambient passive pressure toward religion A accumulate independently of
  // missionary-driven preach progress toward religion B in the same city — previously a
  // single {toReligionId, points} slot meant a preach investment could be silently wiped
  // out the moment ambient pressure pointed elsewhere. Conversion fires for whichever
  // religionId's bucket first reaches CONVERSION_THRESHOLD.
  conversionProgress?: Record<string, number>;
  // MR5 anti-flip-flop guard: once set, no religionId OTHER than conversionCooldownExemptCivId's
  // faith may convert this city until state.turn >= conversionCooldownUntilTurn. The exempt
  // civ (the city's owner at the moment of the LAST conversion) can always re-convert its own
  // city immediately — this preserves "preach a flipped city back" as an owner privilege while
  // still stopping rival faiths from ping-ponging a border city turn after turn.
  conversionCooldownUntilTurn?: number;
  conversionCooldownExemptCivId?: string;
  // #593 MR6: loyalty flip track. Only ever set for a minor-civ or non-human-AI-owned
  // city bordering a foreign faith's territory (see isLoyaltyTrackEligible in
  // religion-loyalty-system.ts) -- human-owned cities are never tracked here.
  // sinceOwnerId is the city's owner at the moment this record was (re)started --
  // inline review fix: the spec requires "ownership transfers" to clear the record,
  // not just a religionId/target change, so an unrelated conquest (e.g. a third AI
  // civ capturing the city by combat while it still borders the same faith owner)
  // must not let the new owner inherit the old owner's accumulated points.
  loyaltyProgress?: { toCivId: string; points: number; sinceOwnerId: string };
}

export interface ReconReveal {
  ownerCivId: string;
  center: HexCoord;
  range: number;
  expiresAtTurn: number;
}

// #582: submarine-detection half of the Patrol mission. Written alongside a
// ReconReveal by the same resolvePatrolMission call, but consumed separately
// by concealment.ts's hasActiveDetectorInRange -- ordinary terrain/unit
// reconnaissance and submarine detection are different consumers even though
// they share one player action.
export interface PatrolReveal {
  ownerCivId: string;
  center: HexCoord;
  range: number;
  expiresAtTurn: number;
}

export interface GameSettings {
  mapSize: 'small' | 'medium' | 'large';
  soundEnabled: boolean;
  musicEnabled: boolean;
  musicVolume: number;       // 0-1
  sfxVolume: number;         // 0-1
  stingerVolume?: number;    // 0-1; default 1.0
  stingerEnabled?: boolean;  // default true
  tutorialEnabled: boolean;
  beastsMode?: BeastsMode;    // default 'wild' for new games; undefined on legacy saves
  aiContestsBeasts?: boolean; // default false: AI ignores beasts, players keep the glory
  // World-pressure symmetry flags (#526). Optional: legacy saves resolve via
  // resolveWorldPressureFlags defaults — never read these fields directly.
  aiPressure?: 'off' | 'pirates' | 'full';
  aiPressureVisibility?: boolean;
  aiCrisisInteractions?: 'off' | 'benign' | 'full';
  // #545 MR7: superweapons (nukes) toggle. Optional: legacy saves resolve to
  // 'off' via resolveSuperweaponsFlag -- deliberately NOT the same
  // "undefined inherits the live default" convention beastsMode/aiPressure
  // use, since retroactively arming an existing save with no opt-in would
  // defeat the toggle's purpose. New games set this explicitly at creation
  // time (createDefaultSettings for solo, hot-seat setup's own card) --
  // never read this field directly, always go through
  // resolveSuperweaponsFlag/isSuperweaponsEnabled.
  superweapons?: 'off' | 'on';
  advisorsEnabled: Record<AdvisorType, boolean>;
  councilTalkLevel: CouncilTalkLevel;
  customCivilizations?: CustomCivDefinition[];
  /**
   * End-turn supply-warning delivery filter (#544 MR2, contract §12).
   * Presentation-only: never gates `deriveSupplyWarningTransitions`'s own
   * computation, only which already-derived warnings reach the player.
   * `undefined` (legacy saves) is treated identically to `'all'`.
   */
  supplyWarningPreference?: 'all' | 'critical' | 'off';
}

// --- Events ---

export interface GameEvents {
  'turn:start': { turn: number; playerId: string };
  'turn:end': { turn: number; playerId: string };
  'unit:move': {
    unitId: string;
    from: HexCoord;
    to: HexCoord;
    path: HexCoord[];
    presentationByViewer: Record<string, {
      unit: Unit;
      visibleSegments: HexCoord[][];
    }>;
  };
  'unit:created': { unit: Unit };
  'unit:destroyed': { unitId: string; position: HexCoord };
  'pirate:faction-spawned': {
    factionId: PirateFactionId;
    factionName: string;
    headquartersKind: PirateHeadquarters['kind'];
    position: HexCoord;
    maritimeStage: PirateMaritimeStage;
  };
  'pirate:audio-cue': {
    cue: 'sighting' | 'raid' | 'blockade' | 'tribute' | 'contract-accepted' | 'contract-exposed'
      | 'siege' | 'city-razed';
    factionId: string;
    viewerIds: string[];
  };
  'pirate:headquarters-destroyed': { factionId: string; viewerIds: string[] };
  'supply:warning': {
    viewerId: string;
    unitIds: string[];
    kind: 'losing-full' | 'entering-combat-penalty' | 'entering-movement-penalty';
    /** At most one `true` per `deriveSupplyWarningTransitions` call. */
    playAudio: boolean;
  };
  'ai:strategic-warning': {
    viewerId: string;
    actorId: string;
    actorName: string;
    warningKey: string;
    kind:
      | 'mobilizing'
      | 'raid'
      | 'blockade'
      | 'resource-denied'
      | 'resource-restored'
      | 'withdrawing'
      | 'recovery';
    evidence: 'visible' | 'remembered' | 'earned-intel';
    targetLabel?: string;
    regionLabel?: string;
    resource?: ResourceType;
    target?: { kind: 'map'; coord: HexCoord; label: string };
    playAudio: boolean;
  };
  'ai:strategic-warning-audio': {
    viewerId: string;
    turn: number;
  };
  'city:founded': { city: City; founderId: string };
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
  'city:production-item-dropped': { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason };
  'city:national-project-built': { civId: string; cityId: string; buildingId: string; eraBuilt: number };
  'city:national-project-expired': { civId: string; cityId: string; buildingId: string };
  'city:national-project-dequeued': { civId: string; cityId: string; buildingId: string };
  'city:unit-trained': { cityId: string; unitType: UnitType };
  'city:cyber-drained': { cityId: string; cityName: string; drainerOwner: string; drainerUnitId: string; goldLost: number; blocked: boolean; victimCivId: string };
  'network:exploit-warning': { planId: string; victimCivId: string; cityId: string };
  'network:exploit-resolved': { planId: string; cityId: string; ownerCivId: string; goldTransferred: number; delayed: boolean };
  'network:audio-cue': {
    cue: 'constructive-resolution' | 'hostile-warning' | 'hostile-consequence' | 'surge' | 'recovery';
    viewerIds: string[];
  };
  'city:grew': { cityId: string; newPopulation: number };
  'city:maturity-upgraded': { cityId: string; previous: CityMaturity; current: CityMaturity };
  'economy:treasury-strain': { civId: string; level: Exclude<TreasuryStrainLevel, 'none'>; netGoldPerTurn: number; unpaidMaintenance: number };
  'combat:resolved': {
    result: CombatResult;
    visibleToViewerIds: string[];
    attackerType: UnitType;
    defenderType: UnitType;
    attackerOwnerId: string;
    defenderOwnerId: string;
  };
  'combat:reward-earned': { reward: CombatRewardNotification };
  'tech:completed': {
    civId: string;
    techId: string;
    /** MR4 (#917): science that overshot `techId` and was moved into the queued
     * successor's progress. Omitted/0 when nothing carried (no successor). */
    carriedProgress?: number;
    /** The queued technology that received `carriedProgress`, if any. */
    carriedIntoTechId?: string | null;
  };
  'tech:started': { civId: string; techId: string };
  'fog:revealed': { tiles: HexCoord[] };
  'improvement:started': { unitId: string; coord: HexCoord; type: ImprovementType };
  'improvement:completed': { coord: HexCoord; type: ImprovementType };
  'road:started': { unitId: string; coord: HexCoord };
  'road:completed': { coord: HexCoord };
  'territory:tile-flipped': {
    coord: HexCoord;
    previousOwner: string;
    newOwner: string;
    improvement: ImprovementType;
    constructionCancelled: boolean;
  };
  'civilization:first-contact': { civA: string; civB: string };
  'barbarian:spawned': { campId: string; unitId: string };
  'beast:awakened': { lairId: string; beastId: BeastId; position: HexCoord };
  'beast:slain': { lairId: string; beastId: BeastId; slayerCivId: string; slayerUnitId: string; goldAwarded: number };
  'beast:sighted': { beastId: BeastId; civId: string };
  'submarine:sighted': { unitId: string; civId: string };
  'beast:hoard-claimed': { lairId: string; beastId: BeastId; civId: string; choice: BeastHoardChoice };
  'barbarian:camp-destroyed': { campId: string; reward: number };
  'threat:barbarian-resurgence': { civId: string; landmassId: string; campId: string; position: HexCoord; isBanditLord: boolean; banditLordName?: string };
  'threat:pirate-fleet-spawned': { fleetId: string; civId: string; landmassId: string; position: HexCoord };
  'threat:pirate-plunder': { fleetId: string; cityId: string; goldStolen: number };
  'threat:pirate-siege': { fleetId: string; cityId: string; hpLost: number };
  'threat:pirate-fleet-destroyed': { fleetId: string; civId: string; landmassId: string };
  'barbarian:city-attacked': { attackerUnitId: string; cityId: string; hpLost: number };
  'barbarian:city-destroyed': { attackerUnitId: string; cityId: string; ownerId: string };
  // Pirate-faction naval siege (#522) mirror of the barbarian city-siege events above,
  // emitted from pirate-system.ts's completed-round processing (not the dead
  // threat-pressure-system.ts fleet path 'threat:pirate-siege' above).
  'pirate:city-destroyed': { cityId: string; ownerId: string; factionId: string };
  'city:sacked': { cityId: string; source: 'barbarian' | 'pirate'; goldLost: number };
  'city:counter-fire': { cityId: string; attackerUnitId: string; source: 'barbarian' | 'pirate'; damage: number; attackerDied: boolean };
  'city:coastal-battery-fired': {
    cityId: string; attackerUnitId: string; recipientCivId: string;
    source: 'player' | 'ai' | 'barbarian' | 'pirate'; damage: number; attackerDied: boolean;
  };
  'city:naval-bombarded': {
    cityId: string; recipientCivId: string; source: 'player' | 'ai'; hpLost: number;
  };
  /** #545 MR4: fired by the strategic-launch flow's onConfirmLaunch handlers
   * after a successful executeStrategicLaunch commit, so the defending civ
   * gets a delivered notification -- same pattern as city:naval-bombarded
   * above (the resolver itself is pure and emits nothing). */
  'city:strategic-strike': { cityId: string; recipientCivId: string; actorCivId: string; goldLost: number };
  'tutorial:step': { step: TutorialStep; message: string; advisor: 'builder' | 'explorer' | 'scholar' };
  'notification:show': { message: string; type: 'info' | 'warning' | 'success' };
  'game:saved': { turn: number };
  'game:loaded': { turn: number };
  'game:over': { winnerId: string };
  'diplomacy:war-declared': { attackerId: string; defenderId: string; opponentKind: 'major' | 'minor' | 'barbarian' };
  /** #544 MR4: fired when a Great General retires after spending all 3
   * Command Charges (Final Command). Retirement happens silently during
   * end-of-round processing, well after the player confirmed spending the
   * final charge -- this is the player's only feedback that it actually
   * happened. */
  'general:retired': { civId: string; generalName: string; message: string };
  // #526 MR7 Task 7.1: fired alongside diplomacy:war-declared whenever the declared-upon
  // civ has an active crisis -- applyOpportunisticWarPenaltyIfCrisisStruck already applied
  // the reputation deltas by the time this fires.
  'diplomacy:opportunistic-war': { actorId: string; targetCivId: string; crisisId: string };
  'diplomacy:peace-requested': { fromCivId: string; toCivId: string };
  'diplomacy:peace-made': { civA: string; civB: string };
  'era:advanced': { era: number };
  'civilization:era-advanced': { civId: string; previousEra: number; era: number };
  'currentPlayer:changed-after-handoff': {
    civId: string;
    civType: string;
    era: number;
    atWarCount: number;    // exact war count so AudioSystem can track remainingWars precisely
    unrestCityCount: number;
    nearDefeat: boolean;
    inBeastTerritory: boolean;
  };
  'diplomacy:treaty-proposed': { fromCiv: string; toCiv: string; treaty: TreatyType };
  'diplomacy:treaty-accepted': { civA: string; civB: string; treaty: TreatyType };
  // #901: a queued treaty proposal the recipient explicitly declined -- so the
  // original proposer (who may be an inactive hot-seat player) learns the
  // outcome instead of the request silently vanishing from their panel.
  'diplomacy:treaty-declined': { proposerCivId: string; targetCivId: string; treaty: TreatyType };
  'diplomacy:treaty-broken': { breakerId: string; otherCiv: string; treaty: TreatyType };
  'advisor:message': { advisor: AdvisorType; message: string; icon: string; tone?: CouncilCallbackTone; memoryKey?: string };
  'trade:route-created': { route: TradeRoute };
  'trade:route-ended': { routeId: string; fromCityId: string; toCityId: string; reason: 'unit-died' | 'unit-disbanded' | 'war-declared' | 'hostile-relations' | 'embargo' | 'trips-exhausted' | 'unit-captured' | 'espionage' };
  'trade:route-delivered': { unitId: string; routeId: string; toCityId: string };
  'trade:price-changed': { resource: ResourceType; oldPrice: number; newPrice: number };
  'wonder:discovered': { civId: string; wonderId: string; position: HexCoord; isFirstDiscoverer: boolean };
  'wonder:eruption': { wonderId: string; position: HexCoord; tilesAffected: HexCoord[] };
  'wonder:legendary-ready': { civId: string; cityId: string; wonderId: string };
  'wonder:legendary-availability': {
    recipientCivId: string;
    wonderId: string;
    status: LegendaryWonderAvailabilityStatus;
    cityActions: NotificationCityAction[];
  };
  'wonder:legendary-completed': { civId: string; cityId: string; wonderId: string; turnCompleted: number };
  'wonder:legendary-lost': { civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number };
  'wonder:legendary-race-revealed': { observerId: string; civId: string; cityId: string; wonderId: string };
  'village:visited': { civId: string; position: HexCoord; outcome: VillageOutcomeType; message: string };
  'ui:select-unit': { unitId: string };
  'ui:select-city': { cityId: string };
  'ui:deselect': {};
  'minor-civ:quest-issued': { minorCivId: string; majorCivId: string; quest: Quest; state?: GameState };
  'minor-civ:quest-progressed': { minorCivId: string; majorCivId: string; quest: Quest; state?: GameState };
  'minor-civ:quest-retargeted': { minorCivId: string; majorCivId: string; quest: Quest; state?: GameState };
  'minor-civ:quest-cancelled': { minorCivId: string; majorCivId: string; chainId: string; stepIndex: number; state?: GameState };
  'minor-civ:quest-chain-pending': { minorCivId: string; majorCivId: string; chainId: string; stepIndex: number; state?: GameState };
  'minor-civ:quest-completed': { minorCivId: string; majorCivId: string; quest: Quest; reward: QuestReward; state?: GameState };
  'minor-civ:evolved': { campId: string; minorCivId: string; position: HexCoord };
  'minor-civ:destroyed': { minorCivId: string; conquerorId: string };
  'minor-civ:allied': { minorCivId: string; majorCivId: string; chainId?: string; state?: GameState };
  'minor-civ:alliance-broken': { minorCivId: string; majorCivId: string; chainId: string; state?: GameState };
  'minor-civ:scuffle': { attackerId: string; defenderId: string; position: HexCoord };
  'minor-civ:guerrilla': { minorCivId: string; targetCivId: string; position: HexCoord };
  'minor-civ:era-upgrade': { minorCivId: string; newEra: number };
  'minor-civ:relationship-threshold': { minorCivId: string; majorCivId: string; newStatus: MinorCivRelationshipStatus; state?: GameState };
  'minor-civ:quest-expired': { minorCivId: string; majorCivId: string; quest: Quest; state?: GameState };
  'minor-civ:coalition-status': { minorCivId: string; targetCivId: string; status: MinorCivRegionalGrievanceStatus; state?: GameState };
  'minor-civ:coalition-war': { coalitionId: string; targetCivId: string; memberIds: string[]; state?: GameState };
  'minor-civ:production-completed': {
    minorCivId: string;
    cityId: string;
    itemId: string;
    itemClass: 'building' | 'unit';
    state?: GameState;
  };
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
  'faction:critical-status': { cityId: string; owner: string; status: 'unrest' | 'revolt' | 'breakaway'; breakawayId?: string };
  'faction:contagion-spread': { fromCityId: string; toCityId: string; owner: string };
  'faction:concession-made': { cityId: string; owner: string; concessionType: 'charter' };
  'espionage:spy-promoted': { civId: string; spyId: string; promotion: SpyPromotion };
  'espionage:advisor-assassinated': { targetCivId: string; advisorType: AdvisorType; disabledUntilTurn: number };
  'espionage:documents-forged': { civA: string; civB: string; relationshipPenalty: number };
  'espionage:city-flipped': { civId: string; victimCivId: string; cityId: string };
  'espionage:spy-executed': { executingCivId: string; spyOwner: string; spyId: string; spyName: string };
  'espionage:intel-extracted': { captorId: string; intel: InterrogationIntel[] };
  'unit:obsolete': { civId: string; unitId: string; unitType: UnitType };
  'espionage:spy-expired': { civId: string; spyId: string; spyName: string; unitType: UnitType };
  'unit:journey-blocked': { unitId: string; position: HexCoord };
  // Spec 3 — adaptive music events
  'civ:near-defeat':                { civId: string };
  'civ:recovered-from-near-defeat': { civId: string };
  'civ:eliminated':                 { civId: string; eliminatedBy: string };
  // Crisis events & revolutionary movements (#381, #354)
  'crisis:started':   { crisisId: string; flavorId: string; civId: string; cityIds: string[] };
  'religion:founded': { religionId: string; civId: string; cityId: string; name: string };
  'religion:city-converted': { cityId: string; toReligionId: string; fromReligionId?: string };
  'religion:preached': { cityId: string; unitId: string; civId: string; points: number; unitConsumed: boolean };
  'religion:loyalty-warning': { cityId: string; pressuringCivId: string; stage: 'start' | 'midpoint' | 'final'; turnsRemaining: number };
  'religion:city-defected': { cityId: string; fromCivId: string; toCivId: string };
  'crisis:spread':    { crisisId: string; fromCityId: string; toCityId: string };
  // civId/foeName are populated for Hunt transitions (spawn -> menacing, menacing ->
  // assaulting) — carried directly rather than re-read from state because both are set
  // for the first time in the same tick this event fires, and the listener may run
  // against a state snapshot from before this tick's processing (see
  // .claude/rules/end-to-end-wiring.md "Transition Events must be transition-owned").
  'crisis:escalated': { crisisId: string; stage: CrisisStage; civId?: string; foeName?: string };
  'crisis:response':  { crisisId: string; civId: string; action: string };
  // foeName/killerCivId populated for Hunt's 'hunted' outcome, for the same
  // same-tick-freshness reason as crisis:escalated above.
  'crisis:resolved':  { crisisId: string; flavorId: string; civId: string; outcome: CrisisOutcome; foeName?: string; killerCivId?: string };
  // Fires only when a hunt's killer differs from the crisis's own target civ (#526 MR6
  // hunt-their-foe interaction) -- a self-kill never emits this.
  'crisis:foe-hunted-by-ally': { crisisId: string; killerCivId: string; targetCivId: string; foeName?: string };
  // #526 MR6 send_aid interaction.
  'crisis:aid-sent': { crisisId: string; actorCivId: string; targetCivId: string; goldCost: number };
  // #919 MR1: fired once when a civ funds a nationwide remedy (applyEmpireContainment).
  'crisis:contained': { crisisId: string; civId: string; cityCount: number; goldCost: number };
  /** One-time, target-scoped Beast Stampede presentation transition. */
  'stampede:lifecycle':
    | { kind: 'warning'; targetCivId: string }
    | { kind: 'activated'; targetCivId: string; activeTurns: number }
    | { kind: 'resolved'; targetCivId: string; outcome: StampedeOutcome; rewardGranted: boolean };
  /** Target-scoped Rogue Host conversion and terminal result. */
  'rogue-elephant-host:lifecycle':
    | { kind: 'warning'; targetCivId: string }
    | { kind: 'command-broken'; targetCivId: string; dispersalTurnsRemaining: number }
    | { kind: 'resolved'; targetCivId: string; outcome: RogueElephantHostOutcome; rewardGranted: boolean };
  // #526 MR7 sabotage_relief: fired only when the covert sabotage is discovered (the
  // detection roll at mission-success time) -- an undiscovered sabotage fires nothing,
  // per spec §Interactions "Undiscovered: no penalty."
  'espionage:sabotage-relief-discovered': { crisisId: string; actorCivId: string; targetCivId: string };
  // #442 MR1 intercept_courier: espionage-system.ts cannot import trade-system.ts's
  // removeRouteById directly (import cycle through city-system.ts, same reason
  // 'espionage:city-flipped' is applied in turn-manager.ts rather than inline) — the
  // caller subscribes to this event and performs the actual route removal.
  'espionage:courier-intercepted': { civId: string; targetCivId: string; routeId: string; fromCityId: string; toCityId: string };
  'espionage:official-bribed': { civId: string; targetCivId: string; amount: number };
  // #442 MR2 expose_scandal: bounded multilateral reputation broadcast — fires once per
  // successful mission, naming every partner civ whose relationship with the target
  // soured (already capped/deduped by resolveMissionResult before this fires).
  'espionage:scandal-exposed': { civId: string; targetCivId: string; partnerCivIds: string[] };
  // Post-#442 audit fix: immediate acknowledgement that a purely-informational mission
  // (monitor_troops/gather_intel/identify_resources/monitor_diplomacy) produced a report
  // now persisted on the acting civ's EspionageCivState — see the matching fields there.
  // Attacker-only: this is passive reconnaissance with no attribution/detection
  // consequence today, so the target is never notified (unlike courier-intercepted/
  // official-bribed/scandal-exposed above, which are all detectable disruptive acts).
  'espionage:intel-report-acquired': { civId: string; spyId: string; missionType: SpyMissionType; targetCivId: string };
}

// --- Crisis Events & Revolutionary Movements ---

export type CrisisArchetype = 'outbreak' | 'catastrophe' | 'hunt' | 'famine';
export type CrisisStage = 'active' | 'contained' | 'recovery' | 'menacing' | 'assaulting';
export type CrisisOutcome = 'contained' | 'expired' | 'hunted' | 'recovered' | 'abandoned';

export interface ActiveCrisis {
  id: string;
  flavorId: string;
  archetype: CrisisArchetype;
  targetCivId: string;
  cityIds: string[];
  tileKeys: string[];
  startedTurn: number;
  stage: CrisisStage;
  turnsInStage: number;
  quarantinedCityIds?: string[];
  remedyCompletionByCity?: Record<string, number>; // cityId -> turn remedy completes
  huntEntityId?: string;
  foeName?: string;
  lastHuntKillerCivId?: string;
  aidedByCivIds?: string[]; // #526 MR6 send_aid: enforces once-per-crisis-per-actor
  // #526 MR7 sabotage_relief: one active sabotage per crisis, across all actors.
  sabotage?: { byCivId: string; untilTurn: number; discovered: boolean };
  // #590 MR3: consecutive turns of positive food surplus per city, toward the famine
  // archetype's passive auto-contain path (independent of remedy/quarantine).
  famineSurplusStreakByCity?: Record<string, number>;
  // #919 MR1: cityId -> turn through which a just-cured city is immune to re-infection
  // by THIS crisis. Optional; absent on older saves. Pruned once entries expire.
  curedUntilTurn?: Record<string, number>;
}
