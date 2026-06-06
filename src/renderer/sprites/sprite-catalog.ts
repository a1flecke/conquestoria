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
  CrossbowmanSprite, CatapultSprite, BallistaSprite,
  CaravanSprite, ExpeditionSprite,
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
} from './buildings';
import {
  PyramidsSprite, ColosseumSprite, GreatLibrarySprite, LighthouseSprite,
} from './wonders';

export type UnitSpriteComponent = (props: UnitSpriteProps) => string;
export type BuildingSpriteComponent = (props: BuildingSpriteProps) => string;

type UnitMotionStyle = 'humanoid' | 'animal' | 'naval';

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
  catapult: 'naval',
  ballista: 'naval',
  caravan: 'humanoid',
  expedition: 'humanoid',
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
  // Bespoke sprites pending Claude Design prompts — using TransportSprite as placeholder
  carrack:         withMotion('carrack', TransportSprite),
  galleon:         withMotion('galleon', TransportSprite),
  steamship:       withMotion('steamship', TransportSprite),
  troop_transport: withMotion('troop_transport', TransportSprite),
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
  caravan:        withMotion('caravan', CaravanSprite),
  expedition:     withMotion('expedition', ExpeditionSprite),
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
};

export const UNIT_SPRITE_SIZE = 128;
export const BUILDING_SPRITE_SIZE = 192;
