import type { UnitType } from '@/core/types';
import type { UnitSpriteMotion, UnitSpriteProps } from './units';
import type { BuildingSpriteProps } from './buildings';
import {
  SettlerSprite, WorkerSprite, MissionarySprite, ScoutSprite, ScoutHoundSprite,
  WarHoundSprite, BeastHandlerSprite, WarElephantSprite, ShadowWardenSprite, WarriorSprite, SwordsmanSprite,
  PikemanSprite, ArcherSprite, MusketeerSprite, GalleySprite,
  TriremeSprite, TransportSprite, SpyScoutSprite, SpyInformantSprite, SpyAgentSprite,
  SpyOperativeSprite, SpyIntelligenceOfficerSprite, SpyStationChiefSprite, SpyHackerSprite, CyberUnitSprite,
  AxemanSprite, SpearmanSprite, HorsemanSprite, ChariotSprite, CavalrySprite, KnightSprite, CuirassierSprite,
  CrossbowmanSprite, CatapultSprite, TrebuchetSprite, BallistaSprite, CannonSprite, ArtillerySprite, RocketArtillerySprite, GrenadierSprite,
  RiflemanSprite, MarineSprite, IroncladSprite,
  MachineGunnerSprite, InfantrySprite, MechanizedInfantrySprite, PreDreadnoughtSprite, BattleshipSprite, MissileCruiserSprite, TankSprite, ArmoredCarSprite, MainBattleTankSprite, SubmarineSprite,
  ObservationBalloonSprite, BiplaneSprite, JetFighterSprite, CarrierSprite,
  AttackHelicopterSprite, MissileSubmarineSprite,
  CombatDroneSprite, AutonomousFrigateSprite, ExosuitInfantrySprite,
  PropagandistSprite, DroneControllerSprite,
  CaravanSprite, ExpeditionSprite,
  CarrackSprite, GalleonSprite, SteamshipSprite, TroopTransportSprite,
  NavalTraderSprite, SteamshipTraderSprite, CargoFreighterSprite, ContainerShipSprite,
  FrigateSprite, DestroyerSprite, MerchantWagonSprite,
  FreightConvoySprite, AirFreighterSprite, ReconAircraftSprite, BomberSprite, JetFreighterSprite,
  GlobalAirCargoSprite, StealthBomberSprite,
  AntiTankGunSprite, MobileAaSprite, WwiiFighterSprite, ParatrooperSprite, NavalStrikeAircraftSprite, MaritimePatrolAircraftSprite, SupercarrierSprite, GreatGeneralSprite,
} from './units';
import {
  GranarySprite, HerbalistSprite, AqueductSprite,
  WorkshopSprite, ForgeSprite, LumbermillSprite, QuarrySprite,
  LibrarySprite, ArchiveSprite, ObservatorySprite,
  MarketplaceSprite, HarborSprite, DockSprite,
  BarracksSprite, WallsSprite, StableSprite,
  TempleSprite, MonumentSprite, AmphitheaterSprite, ShrineSprite, ForumSprite, CourthouseSprite,
  SafehouseSprite, IntelAgencySprite, SecurityBureauSprite,
  BronzeWorkshopSprite, ArmorySprite, RanchSprite, CavalryAcademySprite,
  IronFoundrySprite, WarAcademySprite, MasonryWorksSprite, SiegeWorkshopSprite,
  CaravanseraiSprite, BankSprite, StockExchangeSprite,
  NaturalHistoryMuseumSprite, SurgeryGuildSprite, ConcertHallSprite, StarFortSprite,
  CoastalBatterySprite,
  MilitaryAcademySprite, GrandCipherBureauSprite, ColonialAdministrationSprite,
  FactorySprite, SteelMillSprite, FieldHospitalSprite, PrintShopSprite, CensusOfficeSprite,
  NationalRailwaySprite, GrandArsenalSprite, PeoplesUniversitySprite,
  SteelFoundrySprite, TelephoneExchangeSprite, LaborHallSprite, OperaHouseSprite,
  BacteriologyLabSprite, StockExchangeTowerSprite, SanatoriumSprite,
  PowerStationSprite, ExhibitionHallSprite,
  WorldFairSprite, NationalArchivesBuildingSprite, ImperialGeneralStaffSprite,
  OilRefinerySprite, AssemblyLineSprite, RadioStationSprite, AirfieldSprite,
  FilmStudioSprite, NationalInsuranceSprite, HydroelectricDamSprite,
  ResearchInstituteSprite, TankDepotSprite, AntiAirBatterySprite,
  MobilizationActSprite, StateBroadcastingSprite, NationalCensusSprite, AirForceCommandSprite,
  // era 10
  NuclearArsenalSprite, CentralBankSprite, AtomicLaboratorySprite, RadarStationSprite, SamSiteSprite,
  UnDelegationSprite, RocketProgramSprite, PublicHospitalSprite, ChemicalPlantSprite,
  NuclearPowerPlantSprite, TelevisionStationSprite, SignalsBureauSprite,
  ManhattanProjectSprite, PostwarReconstructionSprite, SpaceProgramInitiativeSprite,
  // era 11
  HelicopterBaseSprite, MissileSiloSprite, SemiconductorFabSprite, GeneticResearchLabSprite,
  EnvironmentalAgencySprite, SpaceCenterSprite, AgriculturalStationSprite, TransplantHospitalSprite,
  ContainerPortSprite, ResearchNetworkSprite, SurveillanceAgencySprite,
  ArmsControlTreatySprite, GreenRevolutionProgramSprite, StrategicAirCommandSprite,
  // era 12
  AutomatedPortSprite, BiotechLabSprite, BroadcastTowerSprite, CyberDefenseCenterSprite,
  DataCenterSprite, FintechHubSprite, GeneTherapyClinicSprite, PrecisionFarmSprite,
  SignalsHubSprite, SmartGridSprite, StealthAirbaseSprite, TelemedicineHubSprite,
  // era 13 batch A
  NetworkOperationsCenterSprite, AiSafetyInstituteSprite, DroneFabricatorSprite,
  ElectronicWarfareArraySprite, CivicMediaForumSprite, VerticalFarmSprite,
  NeuralRehabilitationCenterSprite, OceanRoboticsYardSprite,
  // era 13 batch B
  CircularFabricatorSprite, ModularArcologySprite, CarbonCaptureGridSprite,
  ImmersiveArtsLabSprite, NationalAiAssuranceProgramSprite,
  CircularManufacturingNetworkSprite, MarsRoboticsInitiativeSprite,
} from './buildings';
import {
  PyramidsSprite, ColosseumSprite, GreatLibrarySprite, LighthouseSprite, WrightFlyerSprite,
} from './wonders';
import { GiantBoarSprite, DireWolfSprite, EmeraldBasiliskSprite, SeaSerpentSprite, DuneWurmSprite, StormRocSprite, SwampHydraSprite, AncientDragonSprite } from './beasts';
import {
  PirateCorsairSprite,
  PirateFastAttackCraftSprite,
  PirateFrigateSprite,
  PirateGalleySprite,
  PirateIroncladSprite,
  PirateMothershipSprite,
  PirateEnclaveStage1Sprite, PirateEnclaveStage2Sprite, PirateEnclaveStage3Sprite,
  PirateEnclaveStage4Sprite, PirateEnclaveStage5Sprite,
  PirateFlotillaStage2Sprite, PirateFlotillaStage3Sprite, PirateFlotillaStage4Sprite, PirateFlotillaStage5Sprite,
  type LandmarkSpriteProps,
} from './pirates';

export type UnitSpriteComponent = (props: UnitSpriteProps) => string;
export type BuildingSpriteComponent = (props: BuildingSpriteProps) => string;
export type LandmarkSpriteComponent = (props: LandmarkSpriteProps) => string;
export type PirateHeadquartersSpriteId =
  | 'pirate_enclave_stage_1' | 'pirate_enclave_stage_2' | 'pirate_enclave_stage_3'
  | 'pirate_enclave_stage_4' | 'pirate_enclave_stage_5'
  | 'pirate_flotilla_stage_2' | 'pirate_flotilla_stage_3'
  | 'pirate_flotilla_stage_4' | 'pirate_flotilla_stage_5';

type UnitMotionStyle = 'humanoid' | 'animal' | 'naval' | 'air';

const UNIT_MOTION_STYLES: Record<UnitType, UnitMotionStyle> = {
  settler: 'humanoid',
  worker: 'humanoid',
  missionary: 'humanoid',
  scout: 'humanoid',
  scout_hound: 'animal',
  war_hound: 'animal',
  beast_handler: 'animal',
  war_elephant: 'animal',
  shadow_warden: 'humanoid',
  warrior: 'humanoid',
  swordsman: 'humanoid',
  pikeman: 'humanoid',
  archer: 'humanoid',
  musketeer: 'humanoid',
  galley: 'naval',
  trireme: 'naval',
  transport:       'naval',
  // New naval transport types — bespoke sprites pending Claude Design prompts
  carrack:         'naval',
  galleon:         'naval',
  steamship:       'naval',
  troop_transport: 'naval',
  pirate_galley: 'naval',
  pirate_corsair: 'naval',
  pirate_frigate: 'naval',
  pirate_ironclad: 'naval',
  pirate_fast_attack_craft: 'naval',
  pirate_mothership: 'naval',
  spy_scout: 'humanoid',
  spy_informant: 'humanoid',
  spy_agent: 'humanoid',
  spy_operative: 'humanoid',
  spy_intelligence_officer: 'humanoid',
  spy_station_chief: 'humanoid',
  spy_hacker: 'humanoid',
  axeman: 'humanoid',
  spearman: 'humanoid',
  horseman: 'animal',
  chariot: 'animal',
  cavalry: 'animal',
  armored_car: 'humanoid',
  knight: 'animal',
  cuirassier: 'animal',
  crossbowman: 'humanoid',
  catapult: 'humanoid',
  trebuchet: 'humanoid',
  ballista: 'humanoid',
  cannon:   'humanoid',
  artillery: 'humanoid',
  rocket_artillery: 'humanoid',
  grenadier: 'humanoid',
  marine: 'humanoid',
  rifleman: 'humanoid',
  frigate: 'naval',
  ironclad: 'naval',
  destroyer: 'naval',
  machine_gunner: 'humanoid',
  infantry: 'humanoid',
  mechanized_infantry: 'humanoid',
  paratrooper: 'humanoid',
  pre_dreadnought: 'naval',
  battleship: 'naval',
  missile_cruiser: 'naval',
  tank:       'humanoid',
  main_battle_tank: 'humanoid',
  anti_tank_gun: 'humanoid',
  mobile_aa: 'humanoid',
  submarine:  'naval',
  observation_balloon: 'air',
  biplane:    'air',
  wwii_fighter: 'air',
  recon_aircraft: 'air',
  jet_fighter: 'air',
  bomber:     'air',
  carrier:    'naval',
  naval_strike_aircraft: 'air',
  maritime_patrol_aircraft: 'air',
  supercarrier: 'naval',
  attack_helicopter: 'air',
  missile_submarine: 'naval',
  combat_drone: 'air',
  autonomous_frigate: 'naval',
  exosuit_infantry: 'humanoid',
  propagandist: 'humanoid',
  drone_controller: 'humanoid',
  great_general: 'humanoid',
  caravan: 'humanoid',
  merchant_wagon: 'humanoid',
  freight_convoy: 'humanoid',
  // Trade Routes Overhaul (#553 MR1/4) — Naval Trader line, matches other naval hulls
  naval_trader: 'naval',
  steamship_trader: 'naval',
  cargo_freighter: 'naval',
  container_ship: 'naval',
  // Trade Routes Overhaul (#553 MR3/4) — Air trade line
  air_freighter: 'air',
  jet_freighter: 'air',
  global_air_cargo: 'air',
  expedition: 'humanoid',
  beast_boar: 'animal',
  beast_wolf: 'animal',
  beast_basilisk: 'animal',
  beast_sea_serpent: 'naval',
  beast_wurm: 'animal',
  beast_roc: 'animal',
  beast_hydra: 'animal',
  beast_dragon: 'animal',
  beast_stampede_herd: 'animal',
  rogue_handler: 'humanoid',
  rogue_elephant: 'animal',
  cyber_unit:   'humanoid',
  stealth_bomber: 'air',
};

function motionTransform(style: UnitMotionStyle, motion: UnitSpriteMotion): string {
  if (motion === 'idle') return '';
  if (style === 'animal') {
    return motion === 'move-a'
      ? 'translate(-3 -2) rotate(-2 64 70)'
      : 'translate(3 1) rotate(2 64 70)';
  }
  if (style === 'naval') {
    return motion === 'move-a'
      ? 'translate(-2 1) rotate(-1 64 82)'
      : 'translate(2 -1) rotate(1 64 82)';
  }
  // air: gentle drift — horizontal sway with subtle altitude bob
  if (style === 'air') {
    return motion === 'move-a'
      ? 'translate(-3 -3)'
      : 'translate(3 0)';
  }
  return motion === 'move-a'
    ? 'translate(0 -2) rotate(-2 64 70)'
    : 'translate(0 1) rotate(2 64 70)';
}

function applyUnitMotion(svg: string, style: UnitMotionStyle, motion: UnitSpriteMotion = 'idle'): string {
  const transform = motionTransform(style, motion);
  const attrs = `data-motion="${motion}"${transform ? ` transform="${transform}"` : ''}`;
  return svg.replace('<g class="cq-sprite-figure">', `<g ${attrs} class="cq-sprite-figure">`);
}

function withMotion(type: UnitType, render: UnitSpriteComponent): UnitSpriteComponent {
  return (props: UnitSpriteProps) => {
    const motion = props.motion ?? 'idle';
    return applyUnitMotion(render({ ...props, motion }), UNIT_MOTION_STYLES[type], motion);
  };
}

export const UNIT_SPRITE_CATALOG: Record<UnitType, UnitSpriteComponent> = {
  settler:        withMotion('settler', SettlerSprite),
  worker:         withMotion('worker', WorkerSprite),
  // Bespoke art shipped in #594 MR7 (previously reused WorkerSprite as a placeholder).
  missionary:     withMotion('missionary', MissionarySprite),
  scout:          withMotion('scout', ScoutSprite),
  scout_hound:    withMotion('scout_hound', ScoutHoundSprite),
  war_hound:      withMotion('war_hound', WarHoundSprite),
  beast_handler:  withMotion('beast_handler', BeastHandlerSprite),
  war_elephant:   withMotion('war_elephant', WarElephantSprite),
  shadow_warden:  withMotion('shadow_warden', ShadowWardenSprite),
  warrior:        withMotion('warrior', WarriorSprite),
  swordsman:      withMotion('swordsman', SwordsmanSprite),
  pikeman:        withMotion('pikeman', PikemanSprite),
  archer:         withMotion('archer', ArcherSprite),
  musketeer:      withMotion('musketeer', MusketeerSprite),
  galley:         withMotion('galley', GalleySprite),
  trireme:        withMotion('trireme', TriremeSprite),
  transport:       withMotion('transport', TransportSprite),
  carrack:         withMotion('carrack', CarrackSprite),
  galleon:         withMotion('galleon', GalleonSprite),
  steamship:       withMotion('steamship', SteamshipSprite),
  troop_transport: withMotion('troop_transport', TroopTransportSprite),
  pirate_galley: withMotion('pirate_galley', PirateGalleySprite),
  pirate_corsair: withMotion('pirate_corsair', PirateCorsairSprite),
  pirate_frigate: withMotion('pirate_frigate', PirateFrigateSprite),
  pirate_ironclad: withMotion('pirate_ironclad', PirateIroncladSprite),
  pirate_fast_attack_craft: withMotion('pirate_fast_attack_craft', PirateFastAttackCraftSprite),
  pirate_mothership: withMotion('pirate_mothership', PirateMothershipSprite),
  spy_scout:      withMotion('spy_scout', SpyScoutSprite),
  spy_informant:  withMotion('spy_informant', SpyInformantSprite),
  spy_agent:      withMotion('spy_agent', SpyAgentSprite),
  spy_operative:  withMotion('spy_operative', SpyOperativeSprite),
  spy_intelligence_officer: withMotion('spy_intelligence_officer', SpyIntelligenceOfficerSprite),
  spy_station_chief: withMotion('spy_station_chief', SpyStationChiefSprite),
  spy_hacker:     withMotion('spy_hacker', SpyHackerSprite),
  axeman:         withMotion('axeman', AxemanSprite),
  spearman:       withMotion('spearman', SpearmanSprite),
  horseman:       withMotion('horseman', HorsemanSprite),
  // De-aliased in #769 batch 1, folding in #708's chariot scope (#708 still owns
  // beast_handler/war_elephant/cuirassier's bespoke sprites — see comments below).
  chariot:        withMotion('chariot', ChariotSprite),
  cavalry:        withMotion('cavalry', CavalrySprite),
  // Temporary Tank silhouette; #709 owns Armored Car's distinct final sprite.
  armored_car:    withMotion('armored_car', ArmoredCarSprite),
  knight:         withMotion('knight', KnightSprite),
  cuirassier:     withMotion('cuirassier', CuirassierSprite),
  crossbowman:    withMotion('crossbowman', CrossbowmanSprite),
  catapult:       withMotion('catapult', CatapultSprite),
  trebuchet:      withMotion('trebuchet', TrebuchetSprite),
  ballista:       withMotion('ballista', BallistaSprite),
  cannon:         withMotion('cannon', CannonSprite),
  // stealth_bomber further down still reuses an existing sprite as a placeholder;
  // bespoke art is a generate-sprite-prompt follow-up.
  // artillery/infantry/marine de-aliased in #769 batch 1.
  artillery:      withMotion('artillery', ArtillerySprite),
  rocket_artillery: withMotion('rocket_artillery', RocketArtillerySprite),
  grenadier:      withMotion('grenadier', GrenadierSprite),
  marine:         withMotion('marine', MarineSprite),
  rifleman:       withMotion('rifleman', RiflemanSprite),
  // frigate/destroyer de-aliased in #769 batch 2.
  frigate:           withMotion('frigate', FrigateSprite),
  ironclad:          withMotion('ironclad', IroncladSprite),
  destroyer:         withMotion('destroyer', DestroyerSprite),
  machine_gunner:    withMotion('machine_gunner', MachineGunnerSprite),
  infantry:          withMotion('infantry', InfantrySprite),
  mechanized_infantry: withMotion('mechanized_infantry', MechanizedInfantrySprite),
  // Temporary Infantry silhouette; bespoke Paratrooper art is a follow-up (#543).
  paratrooper:       withMotion('paratrooper', ParatrooperSprite),
  pre_dreadnought:   withMotion('pre_dreadnought', PreDreadnoughtSprite),
  battleship:        withMotion('battleship', BattleshipSprite),
  missile_cruiser:   withMotion('missile_cruiser', MissileCruiserSprite),
  tank:              withMotion('tank', TankSprite),
  main_battle_tank:  withMotion('main_battle_tank', MainBattleTankSprite),
  // De-aliased in #769 batch 5 — bespoke towed anti-tank gun (wheeled carriage, gun
  // shield, split trail, crouched crew, low direct-fire barrel); no longer a Tank clone.
  anti_tank_gun:     withMotion('anti_tank_gun', AntiTankGunSprite),
  // De-aliased in #769 batch 5 — bespoke self-propelled AA (open-top tracked mount, quad
  // guns angled up, radar/sight dish); distinct from both Tank and the anti-tank gun.
  mobile_aa:         withMotion('mobile_aa', MobileAaSprite),
  submarine:         withMotion('submarine', SubmarineSprite),
  observation_balloon: withMotion('observation_balloon', ObservationBalloonSprite),
  biplane:           withMotion('biplane', BiplaneSprite),
  // De-aliased in #769 batch 5 — bespoke WWII single-engine prop fighter (spinning prop,
  // straight monoplane wing, bubble canopy, no afterburner); one generation before the jet.
  wwii_fighter:      withMotion('wwii_fighter', WwiiFighterSprite),
  // De-aliased in #769 batch 3 — bespoke jet-age recon jet (camera pod, no weapons).
  recon_aircraft:    withMotion('recon_aircraft', ReconAircraftSprite),
  jet_fighter:       withMotion('jet_fighter', JetFighterSprite),
  // De-aliased in #769 batch 3 — bespoke 4-engine strategic bomber (bomb-bay, big span).
  bomber:            withMotion('bomber', BomberSprite),
  carrier:           withMotion('carrier', CarrierSprite),
  // Temporary Jet Fighter silhouette; bespoke Naval Strike Aircraft art is a follow-up (#582).
  naval_strike_aircraft: withMotion('naval_strike_aircraft', NavalStrikeAircraftSprite),
  // Temporary Recon Aircraft silhouette (both non-combat, camera-pod recon-style jets); bespoke Maritime Patrol art is a follow-up (#582).
  maritime_patrol_aircraft: withMotion('maritime_patrol_aircraft', MaritimePatrolAircraftSprite),
  // Temporary Carrier silhouette; bespoke Supercarrier art is a follow-up (#582).
  supercarrier:      withMotion('supercarrier', SupercarrierSprite),
  attack_helicopter: withMotion('attack_helicopter', AttackHelicopterSprite),
  missile_submarine: withMotion('missile_submarine', MissileSubmarineSprite),
  // Era 13 (#652), batch A — bespoke sprites landed 2026-07-26.
  combat_drone: withMotion('combat_drone', CombatDroneSprite),
  autonomous_frigate: withMotion('autonomous_frigate', AutonomousFrigateSprite),
  exosuit_infantry: withMotion('exosuit_infantry', ExosuitInfantrySprite),
  propagandist: withMotion('propagandist', PropagandistSprite),
  drone_controller: withMotion('drone_controller', DroneControllerSprite),
  // #544 MR3: placeholder silhouette pending bespoke art (generate-sprite-prompt follow-up).
  great_general: withMotion('great_general', GreatGeneralSprite),
  caravan:           withMotion('caravan', CaravanSprite),
  // Trade Routes Overhaul (#553 MR2/4) — Land trade line successors to Caravan.
  // merchant_wagon de-aliased in #769 batch 2.
  merchant_wagon:    withMotion('merchant_wagon', MerchantWagonSprite),
  // De-aliased in #769 batch 3 — bespoke motor flatbed truck (successor to Merchant Wagon).
  freight_convoy:    withMotion('freight_convoy', FreightConvoySprite),
  // Trade Routes Overhaul (#553 MR1/4) — Naval Trader line, bespoke sprites
  naval_trader:      withMotion('naval_trader', NavalTraderSprite),
  steamship_trader:  withMotion('steamship_trader', SteamshipTraderSprite),
  cargo_freighter:   withMotion('cargo_freighter', CargoFreighterSprite),
  container_ship:    withMotion('container_ship', ContainerShipSprite),
  // Trade Routes Overhaul (#553 MR3/4) — Air trade line.
  // De-aliased in #769 batch 3 — bespoke prop cargo transport + cargo jet.
  air_freighter:     withMotion('air_freighter', AirFreighterSprite),
  jet_freighter:     withMotion('jet_freighter', JetFreighterSprite),
  // De-aliased in #769 batch 4 — bespoke whale-body autonomous cargo hauler (comms-globe
  // beacon, 4 engines), one generation past JetFreighter.
  global_air_cargo:  withMotion('global_air_cargo', GlobalAirCargoSprite),
  expedition:     withMotion('expedition', ExpeditionSprite),
  beast_boar:         withMotion('beast_boar', GiantBoarSprite),
  beast_wolf:         withMotion('beast_wolf', DireWolfSprite),
  beast_basilisk:     withMotion('beast_basilisk', EmeraldBasiliskSprite),
  beast_sea_serpent:  withMotion('beast_sea_serpent', SeaSerpentSprite),
  beast_wurm:         withMotion('beast_wurm', DuneWurmSprite),
  beast_roc:          withMotion('beast_roc', StormRocSprite),
  beast_hydra:        withMotion('beast_hydra', SwampHydraSprite),
  beast_dragon:       withMotion('beast_dragon', AncientDragonSprite),
  beast_stampede_herd: withMotion('beast_stampede_herd', WarHoundSprite),
  // Temporary mechanics-release fallbacks; #713 owns bespoke Host art.
  rogue_handler:       withMotion('rogue_handler', ScoutSprite),
  rogue_elephant:      withMotion('rogue_elephant', ChariotSprite),
  // De-aliased in #769 batch 1.
  cyber_unit:         withMotion('cyber_unit', CyberUnitSprite),
  // De-aliased in #769 batch 4 — bespoke tailless faceted flying wing (bomb-bay, radar-cloak
  // shimmer); a low-observable silhouette family unlike any other aircraft in the catalog.
  stealth_bomber:     withMotion('stealth_bomber', StealthBomberSprite),
};

export const BUILDING_SPRITE_CATALOG: Record<string, BuildingSpriteComponent> = {
  granary:                GranarySprite,
  herbalist:              HerbalistSprite,
  aqueduct:               AqueductSprite,
  workshop:               WorkshopSprite,
  forge:                  ForgeSprite,
  lumbermill:             LumbermillSprite,
  'quarry-building':      QuarrySprite,
  library:                LibrarySprite,
  archive:                ArchiveSprite,
  observatory:            ObservatorySprite,
  marketplace:            MarketplaceSprite,
  harbor:                 HarborSprite,
  dock:                   DockSprite,
  barracks:               BarracksSprite,
  walls:                  WallsSprite,
  stable:                 StableSprite,
  temple:                 TempleSprite,
  monument:               MonumentSprite,
  amphitheater:           AmphitheaterSprite,
  shrine:                 ShrineSprite,
  forum:                  ForumSprite,
  courthouse:             CourthouseSprite,
  // #926: an administrative civic building intentionally reuses the established
  // Courthouse presentation; its distinct gameplay effect is shown in the city panel.
  'military-administration': CourthouseSprite,
  safehouse:              SafehouseSprite,
  'intelligence-agency':  IntelAgencySprite,
  'security-bureau':      SecurityBureauSprite,
  'bronze-workshop':      BronzeWorkshopSprite,
  armory:                 ArmorySprite,
  ranch:                  RanchSprite,
  'cavalry-academy':      CavalryAcademySprite,
  'iron-foundry':         IronFoundrySprite,
  'war-academy':          WarAcademySprite,
  'masonry-works':        MasonryWorksSprite,
  'siege-workshop':       SiegeWorkshopSprite,
  caravanserai:           CaravanseraiSprite,
  bank:                   BankSprite,
  stock_exchange:         StockExchangeSprite,
  // S6 legendary wonder sprites — keyed by wonder ID so the sprite loader
  // caches them and city/production badge renderers can look them up when
  // these wonders are added to the game's legendary-wonder definitions.
  pyramids:               PyramidsSprite,
  colosseum:              ColosseumSprite,
  great_library:          GreatLibrarySprite,
  lighthouse:             LighthouseSprite,
  'wright-flyer':         WrightFlyerSprite,
  // National Project placeholders (era 1–5) — replace with unique SVGs in a future design pass
  sacred_grove:           ShrineSprite,
  tribal_muster_ground:   BarracksSprite,
  communal_stores:        GranarySprite,
  grand_bazaar:           MarketplaceSprite,
  foundry_guild:          ForgeSprite,
  scribes_hall:           LibrarySprite,
  philosophers_circle:    ForumSprite,
  road_corps:             WorkshopSprite,
  iron_legion:            ArmorySprite,
  sacred_council:         TempleSprite,
  imperial_archive:       ArchiveSprite,
  praetorian_legion:      BarracksSprite,
  royal_mint:             BankSprite,
  royal_academy:          ObservatorySprite,
  artillery_corps_hq:     ArmorySprite,
  explorers_guild:        CaravanseraiSprite,
  // Era 5 regular buildings — placeholder sprites (unique assets in a future design pass)
  guildhall:              MarketplaceSprite,
  university:             ObservatorySprite,
  art_gallery:            AmphitheaterSprite,
  blast_furnace:          ForgeSprite,
  distillery:             GranarySprite,
  monastery:              TempleSprite,
  // Era 5 special buildings — placeholder sprites
  harbour_exchange:       HarborSprite,
  apothecary_house:       HerbalistSprite,
  // Era 6 national projects
  military_academy:       MilitaryAcademySprite,
  grand_cipher_bureau:    GrandCipherBureauSprite,
  colonial_administration: ColonialAdministrationSprite,
  // Era 6 regular buildings
  natural_history_museum: NaturalHistoryMuseumSprite,
  surgery_guild:          SurgeryGuildSprite,
  concert_hall:           ConcertHallSprite,
  star_fort:              StarFortSprite,
  bunker:                 StarFortSprite,
  coastal_battery:        CoastalBatterySprite,
  // Era 7 regular buildings
  factory:                FactorySprite,
  steel_mill:             SteelMillSprite,
  field_hospital:         FieldHospitalSprite,
  print_shop:             PrintShopSprite,
  census_office:          CensusOfficeSprite,
  // Era 7 national projects
  national_railway:       NationalRailwaySprite,
  grand_arsenal:          GrandArsenalSprite,
  peoples_university:     PeoplesUniversitySprite,
  // Era 8 regular buildings
  steel_foundry:          SteelFoundrySprite,
  telephone_exchange:     TelephoneExchangeSprite,
  labor_hall:             LaborHallSprite,
  opera_house:            OperaHouseSprite,
  bacteriology_lab:       BacteriologyLabSprite,
  stock_exchange_tower:   StockExchangeTowerSprite,
  sanatorium:             SanatoriumSprite,
  power_station:          PowerStationSprite,
  exhibition_hall:        ExhibitionHallSprite,
  // Era 8 national projects
  world_fair:                     WorldFairSprite,
  national_archives_building:     NationalArchivesBuildingSprite,
  imperial_general_staff:         ImperialGeneralStaffSprite,
  // era-9 regular buildings
  oil_refinery:                   OilRefinerySprite,
  assembly_line:                  AssemblyLineSprite,
  radio_station:                  RadioStationSprite,
  airfield:                       AirfieldSprite,
  film_studio:                    FilmStudioSprite,
  national_insurance:             NationalInsuranceSprite,
  hydroelectric_dam:              HydroelectricDamSprite,
  research_institute:             ResearchInstituteSprite,
  tank_depot:                     TankDepotSprite,
  anti_air_battery:               AntiAirBatterySprite,
  // era-9 national projects
  mobilization_act:               MobilizationActSprite,
  state_broadcasting:             StateBroadcastingSprite,
  national_census:                NationalCensusSprite,
  air_force_command:              AirForceCommandSprite,
  // era 10 buildings
  nuclear_arsenal:                NuclearArsenalSprite,
  central_bank:                   CentralBankSprite,
  atomic_laboratory:              AtomicLaboratorySprite,
  radar_station:                  RadarStationSprite,
  // Temporary Radar Station silhouette; #710 owns SAM Site's dedicated air-defense art.
  sam_site:                       SamSiteSprite,
  un_delegation:                  UnDelegationSprite,
  rocket_program:                 RocketProgramSprite,
  public_hospital:                PublicHospitalSprite,
  chemical_plant:                 ChemicalPlantSprite,
  nuclear_power_plant:            NuclearPowerPlantSprite,
  television_station:             TelevisionStationSprite,
  signals_bureau:                 SignalsBureauSprite,
  // era 10 national projects
  manhattan_project:              ManhattanProjectSprite,
  // #545: temporary reuse of Manhattan Project's silhouette pending warhead's own
  // dedicated art (generate-sprite-prompt skill) -- same "borrow the closest existing
  // sprite, note it's temporary" pattern sam_site uses above with RadarStationSprite.
  warhead:                        ManhattanProjectSprite,
  postwar_reconstruction:         PostwarReconstructionSprite,
  space_program_initiative:       SpaceProgramInitiativeSprite,
  // era 11 buildings
  helicopter_base:                HelicopterBaseSprite,
  missile_silo:                   MissileSiloSprite,
  semiconductor_fab:              SemiconductorFabSprite,
  genetic_research_lab:           GeneticResearchLabSprite,
  environmental_agency:           EnvironmentalAgencySprite,
  space_center:                   SpaceCenterSprite,
  agricultural_station:           AgriculturalStationSprite,
  transplant_hospital:            TransplantHospitalSprite,
  container_port:                 ContainerPortSprite,
  research_network:               ResearchNetworkSprite,
  surveillance_agency:            SurveillanceAgencySprite,
  // era 11 national projects
  arms_control_treaty:            ArmsControlTreatySprite,
  green_revolution_program:       GreenRevolutionProgramSprite,
  strategic_air_command:          StrategicAirCommandSprite,
  // era 12 buildings
  automated_port:                 AutomatedPortSprite,
  biotech_lab:                    BiotechLabSprite,
  broadcast_tower:                BroadcastTowerSprite,
  cyber_defense_center:           CyberDefenseCenterSprite,
  data_center:                    DataCenterSprite,
  fintech_hub:                    FintechHubSprite,
  gene_therapy_clinic:            GeneTherapyClinicSprite,
  precision_farm:                 PrecisionFarmSprite,
  signals_hub:                    SignalsHubSprite,
  smart_grid:                     SmartGridSprite,
  stealth_airbase:                StealthAirbaseSprite,
  telemedicine_hub:               TelemedicineHubSprite,
  // era 12 national projects — reuse thematically-close existing sprites as
  // placeholders (same pattern as unit reuse elsewhere); bespoke art is a
  // generate-sprite-prompt follow-up.
  planetary_data_grid:            DataCenterSprite,
  global_logistics_network:       FintechHubSprite,
  orbital_fabrication_program:    SmartGridSprite,
  // Era 13 (#652), batch A — bespoke sprites landed 2026-07-26.
  network_operations_center:      NetworkOperationsCenterSprite,
  ai_safety_institute:            AiSafetyInstituteSprite,
  drone_fabricator:               DroneFabricatorSprite,
  electronic_warfare_array:       ElectronicWarfareArraySprite,
  civic_media_forum:              CivicMediaForumSprite,
  vertical_farm:                  VerticalFarmSprite,
  neural_rehabilitation_center:   NeuralRehabilitationCenterSprite,
  ocean_robotics_yard:            OceanRoboticsYardSprite,
  // Era 13 (#652), batch B — bespoke sprites landed 2026-07-27. #652 is now
  // fully shipped: all 20 Era 13 units/buildings have bespoke, non-aliased art.
  circular_fabricator:            CircularFabricatorSprite,
  modular_arcology:               ModularArcologySprite,
  carbon_capture_grid:            CarbonCaptureGridSprite,
  immersive_arts_lab:             ImmersiveArtsLabSprite,
  national_ai_assurance_program:  NationalAiAssuranceProgramSprite,
  circular_manufacturing_network: CircularManufacturingNetworkSprite,
  mars_robotics_initiative:       MarsRoboticsInitiativeSprite,
};

export const PIRATE_HEADQUARTERS_SPRITE_CATALOG: Record<PirateHeadquartersSpriteId, LandmarkSpriteComponent> = {
  pirate_enclave_stage_1: PirateEnclaveStage1Sprite,
  pirate_enclave_stage_2: PirateEnclaveStage2Sprite,
  pirate_enclave_stage_3: PirateEnclaveStage3Sprite,
  pirate_enclave_stage_4: PirateEnclaveStage4Sprite,
  pirate_enclave_stage_5: PirateEnclaveStage5Sprite,
  pirate_flotilla_stage_2: PirateFlotillaStage2Sprite,
  pirate_flotilla_stage_3: PirateFlotillaStage3Sprite,
  pirate_flotilla_stage_4: PirateFlotillaStage4Sprite,
  pirate_flotilla_stage_5: PirateFlotillaStage5Sprite,
};

export const UNIT_SPRITE_SIZE = 128;
export const BUILDING_SPRITE_SIZE = 192;
export const LANDMARK_SPRITE_SIZE = 192;
