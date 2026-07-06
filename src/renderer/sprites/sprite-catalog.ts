import type { UnitType } from '@/core/types';
import type { UnitSpriteMotion, UnitSpriteProps } from './units';
import type { BuildingSpriteProps } from './buildings';
import {
  SettlerSprite, WorkerSprite, ScoutSprite, ScoutHoundSprite,
  WarHoundSprite, ShadowWardenSprite, WarriorSprite, SwordsmanSprite,
  PikemanSprite, ArcherSprite, MusketeerSprite, GalleySprite,
  TriremeSprite, TransportSprite, SpyScoutSprite, SpyInformantSprite, SpyAgentSprite,
  SpyOperativeSprite, SpyHackerSprite,
  AxemanSprite, SpearmanSprite, HorsemanSprite, CavalrySprite, KnightSprite,
  CrossbowmanSprite, CatapultSprite, BallistaSprite, CannonSprite, GrenadierSprite,
  RiflemanSprite, IroncladSprite,
  MachineGunnerSprite, PreDreadnoughtSprite, TankSprite, SubmarineSprite,
  ObservationBalloonSprite, BiplaneSprite, JetFighterSprite, CarrierSprite,
  AttackHelicopterSprite, MissileSubmarineSprite,
  CaravanSprite, ExpeditionSprite,
  CarrackSprite, GalleonSprite, SteamshipSprite, TroopTransportSprite,
} from './units';
import {
  GranarySprite, HerbalistSprite, AqueductSprite,
  WorkshopSprite, ForgeSprite, LumbermillSprite, QuarrySprite,
  LibrarySprite, ArchiveSprite, ObservatorySprite,
  MarketplaceSprite, HarborSprite, DockSprite,
  BarracksSprite, WallsSprite, StableSprite,
  TempleSprite, MonumentSprite, AmphitheaterSprite, ShrineSprite, ForumSprite,
  SafehouseSprite, IntelAgencySprite, SecurityBureauSprite,
  BronzeWorkshopSprite, ArmorySprite, RanchSprite, CavalryAcademySprite,
  IronFoundrySprite, WarAcademySprite, MasonryWorksSprite, SiegeWorkshopSprite,
  CaravanseraiSprite, BankSprite, StockExchangeSprite,
  NaturalHistoryMuseumSprite, SurgeryGuildSprite, ConcertHallSprite, StarFortSprite,
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
  NuclearArsenalSprite, CentralBankSprite, AtomicLaboratorySprite, RadarStationSprite,
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
  scout: 'humanoid',
  scout_hound: 'animal',
  war_hound: 'animal',
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
  spy_hacker: 'humanoid',
  axeman: 'humanoid',
  spearman: 'humanoid',
  horseman: 'animal',
  cavalry: 'animal',
  knight: 'animal',
  crossbowman: 'humanoid',
  catapult: 'humanoid',
  ballista: 'humanoid',
  cannon:   'humanoid',
  artillery: 'humanoid',
  grenadier: 'humanoid',
  rifleman: 'humanoid',
  frigate: 'naval',
  ironclad: 'naval',
  destroyer: 'naval',
  machine_gunner: 'humanoid',
  infantry: 'humanoid',
  pre_dreadnought: 'naval',
  tank:       'humanoid',
  submarine:  'naval',
  observation_balloon: 'air',
  biplane:    'air',
  jet_fighter: 'air',
  bomber:     'air',
  carrier:    'naval',
  attack_helicopter: 'air',
  missile_submarine: 'naval',
  caravan: 'humanoid',
  expedition: 'humanoid',
  beast_boar: 'animal',
  beast_wolf: 'animal',
  beast_basilisk: 'animal',
  beast_sea_serpent: 'naval',
  beast_wurm: 'animal',
  beast_roc: 'animal',
  beast_hydra: 'animal',
  beast_dragon: 'animal',
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
  scout:          withMotion('scout', ScoutSprite),
  scout_hound:    withMotion('scout_hound', ScoutHoundSprite),
  war_hound:      withMotion('war_hound', WarHoundSprite),
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
  spy_hacker:     withMotion('spy_hacker', SpyHackerSprite),
  axeman:         withMotion('axeman', AxemanSprite),
  spearman:       withMotion('spearman', SpearmanSprite),
  horseman:       withMotion('horseman', HorsemanSprite),
  cavalry:        withMotion('cavalry', CavalrySprite),
  knight:         withMotion('knight', KnightSprite),
  crossbowman:    withMotion('crossbowman', CrossbowmanSprite),
  catapult:       withMotion('catapult', CatapultSprite),
  ballista:       withMotion('ballista', BallistaSprite),
  cannon:         withMotion('cannon', CannonSprite),
  // artillery/infantry/bomber reuse existing sprites as placeholders (same pattern as
  // frigate/destroyer above and stealth_bomber below); bespoke art is a
  // generate-sprite-prompt follow-up.
  artillery:      withMotion('artillery', CannonSprite),
  grenadier:      withMotion('grenadier', GrenadierSprite),
  rifleman:       withMotion('rifleman', RiflemanSprite),
  // frigate/destroyer reuse existing hulls as placeholders (same pattern as stealth_bomber
  // reusing JetFighterSprite below); bespoke sprites are a generate-sprite-prompt follow-up.
  frigate:           withMotion('frigate', TriremeSprite),
  ironclad:          withMotion('ironclad', IroncladSprite),
  destroyer:         withMotion('destroyer', IroncladSprite),
  machine_gunner:    withMotion('machine_gunner', MachineGunnerSprite),
  infantry:          withMotion('infantry', MachineGunnerSprite),
  pre_dreadnought:   withMotion('pre_dreadnought', PreDreadnoughtSprite),
  tank:              withMotion('tank', TankSprite),
  submarine:         withMotion('submarine', SubmarineSprite),
  observation_balloon: withMotion('observation_balloon', ObservationBalloonSprite),
  biplane:           withMotion('biplane', BiplaneSprite),
  jet_fighter:       withMotion('jet_fighter', JetFighterSprite),
  bomber:            withMotion('bomber', JetFighterSprite),
  carrier:           withMotion('carrier', CarrierSprite),
  attack_helicopter: withMotion('attack_helicopter', AttackHelicopterSprite),
  missile_submarine: withMotion('missile_submarine', MissileSubmarineSprite),
  caravan:           withMotion('caravan', CaravanSprite),
  expedition:     withMotion('expedition', ExpeditionSprite),
  beast_boar:         withMotion('beast_boar', GiantBoarSprite),
  beast_wolf:         withMotion('beast_wolf', DireWolfSprite),
  beast_basilisk:     withMotion('beast_basilisk', EmeraldBasiliskSprite),
  beast_sea_serpent:  withMotion('beast_sea_serpent', SeaSerpentSprite),
  beast_wurm:         withMotion('beast_wurm', DuneWurmSprite),
  beast_roc:          withMotion('beast_roc', StormRocSprite),
  beast_hydra:        withMotion('beast_hydra', SwampHydraSprite),
  beast_dragon:       withMotion('beast_dragon', AncientDragonSprite),
  cyber_unit:         withMotion('cyber_unit', SpyHackerSprite),
  stealth_bomber:     withMotion('stealth_bomber', JetFighterSprite),
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
  un_delegation:                  UnDelegationSprite,
  rocket_program:                 RocketProgramSprite,
  public_hospital:                PublicHospitalSprite,
  chemical_plant:                 ChemicalPlantSprite,
  nuclear_power_plant:            NuclearPowerPlantSprite,
  television_station:             TelevisionStationSprite,
  signals_bureau:                 SignalsBureauSprite,
  // era 10 national projects
  manhattan_project:              ManhattanProjectSprite,
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
