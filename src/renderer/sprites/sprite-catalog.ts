import type { UnitType } from '@/core/types';
import type { UnitSpriteProps } from './units';
import type { BuildingSpriteProps } from './buildings';
import {
  SettlerSprite, WorkerSprite, ScoutSprite, ScoutHoundSprite,
  WarHoundSprite, ShadowWardenSprite, WarriorSprite, SwordsmanSprite,
  PikemanSprite, ArcherSprite, MusketeerSprite, GalleySprite,
  TriremeSprite, SpyScoutSprite, SpyInformantSprite, SpyAgentSprite,
  SpyOperativeSprite, SpyHackerSprite,
} from './units';
import {
  GranarySprite, HerbalistSprite, AqueductSprite,
  WorkshopSprite, ForgeSprite, LumbermillSprite, QuarrySprite,
  LibrarySprite, ArchiveSprite, ObservatorySprite,
  MarketplaceSprite, HarborSprite,
  BarracksSprite, WallsSprite, StableSprite,
  TempleSprite, MonumentSprite, AmphitheaterSprite, ShrineSprite, ForumSprite,
  SafehouseSprite, IntelAgencySprite, SecurityBureauSprite,
} from './buildings';

export type UnitSpriteComponent = (props: UnitSpriteProps) => string;
export type BuildingSpriteComponent = (props: BuildingSpriteProps) => string;

export const UNIT_SPRITE_CATALOG: Record<UnitType, UnitSpriteComponent> = {
  settler:        SettlerSprite,
  worker:         WorkerSprite,
  scout:          ScoutSprite,
  scout_hound:    ScoutHoundSprite,
  war_hound:      WarHoundSprite,
  shadow_warden:  ShadowWardenSprite,
  warrior:        WarriorSprite,
  swordsman:      SwordsmanSprite,
  pikeman:        PikemanSprite,
  archer:         ArcherSprite,
  musketeer:      MusketeerSprite,
  galley:         GalleySprite,
  trireme:        TriremeSprite,
  spy_scout:      SpyScoutSprite,
  spy_informant:  SpyInformantSprite,
  spy_agent:      SpyAgentSprite,
  spy_operative:  SpyOperativeSprite,
  spy_hacker:     SpyHackerSprite,
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
};

export const UNIT_SPRITE_SIZE = 128;
export const BUILDING_SPRITE_SIZE = 192;
