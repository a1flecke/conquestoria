// Sprite lookup for the DOM overlay.
// Improvement markers are NOT here — they use Canvas 2D (see hex-renderer.ts).
// Updated each MR as new sprite types are serialized.

import { svg as archerSvg }       from './archer.svg';
import { svg as galleySvg }        from './galley.svg';
import { svg as musketeerSvg }     from './musketeer.svg';
import { svg as pikemanSvg }       from './pikeman.svg';
import { svg as scoutSvg }         from './scout.svg';
import { svg as scoutHoundSvg }    from './scout_hound.svg';
import { svg as settlerSvg }       from './settler.svg';
import { svg as shadowWardenSvg }  from './shadow_warden.svg';
import { svg as spyAgentSvg }      from './spy_agent.svg';
import { svg as spyHackerSvg }     from './spy_hacker.svg';
import { svg as spyInformantSvg }  from './spy_informant.svg';
import { svg as spyOperativeSvg }  from './spy_operative.svg';
import { svg as spyScoutSvg }      from './spy_scout.svg';
import { svg as swordsmanSvg }     from './swordsman.svg';
import { svg as triremeSvg }       from './trireme.svg';
import { svg as warHoundSvg }      from './war_hound.svg';
import { svg as warriorSvg }       from './warrior.svg';
import { svg as workerSvg }        from './worker.svg';
// MR 2 — ground melee
import { svg as axemanSvg }        from './axeman.svg';
import { svg as spearmanSvg }      from './spearman.svg';
// MR 2 — mounted
import { svg as horsemanSvg }      from './horseman.svg';
import { svg as cavalrySvg }       from './cavalry.svg';
import { svg as knightSvg }        from './knight.svg';
// MR 2 — ranged
import { svg as crossbowmanSvg }   from './crossbowman.svg';
// MR 2 — siege
import { svg as catapultSvg }      from './catapult.svg';
import { svg as ballistaSvg }      from './ballista.svg';
// MR 2 — civilian / naval
import { svg as caravanSvg }       from './caravan.svg';
import { svg as expeditionSvg }    from './expedition.svg';
import { svg as transportSvg }     from './transport.svg';
// MR 4 — late-era naval
import { svg as carrackSvg }       from './carrack.svg';
import { svg as galleonSvg }       from './galleon.svg';
import { svg as steamshipSvg }     from './steamship.svg';
import { svg as troopTransportSvg } from './troop_transport.svg';
// Legendary beasts — faction-neutral, keyed under 'beast'
import { svg as beastBoarSvg }     from './beast_boar.svg';
import { svg as beastWolfSvg }     from './beast_wolf.svg';
import { svg as beastBasiliskSvg } from './beast_basilisk.svg';
import { svg as beastHydraSvg }       from './beast_hydra.svg';
import { svg as beastSeaSerpentSvg }  from './beast_sea_serpent.svg';
import { svg as beastWurmSvg }        from './beast_wurm.svg';

import { svg as amphitheaterSvg }      from './amphitheater.svg';
import { svg as aqueductSvg }          from './aqueduct.svg';
import { svg as archiveSvg }           from './archive.svg';
import { svg as barracksSvg }          from './barracks.svg';
import { svg as forgeSvg }             from './forge.svg';
import { svg as forumSvg }             from './forum.svg';
import { svg as granarySvg }           from './granary.svg';
import { svg as harborSvg }            from './harbor.svg';
import { svg as herbalistSvg }         from './herbalist.svg';
import { svg as intelligenceAgencySvg } from './intelligence-agency.svg';
import { svg as librarySvg }           from './library.svg';
import { svg as lumbermillSvg }        from './lumbermill.svg';
import { svg as marketplaceSvg }       from './marketplace.svg';
import { svg as monumentSvg }          from './monument.svg';
import { svg as observatorySvg }       from './observatory.svg';
import { svg as quarryBuildingSvg }    from './quarry-building.svg';
import { svg as safehouseSvg }         from './safehouse.svg';
import { svg as securityBureauSvg }    from './security-bureau.svg';
import { svg as shrineSvg }            from './shrine.svg';
import { svg as stableSvg }            from './stable.svg';
import { svg as templeSvg }            from './temple.svg';
import { svg as wallsSvg }             from './walls.svg';
import { svg as workshopSvg }          from './workshop.svg';
// MR 3 — remaining buildings
import { svg as dockSvg }              from './dock.svg';
import { svg as bronzeWorkshopSvg }    from './bronze-workshop.svg';
import { svg as armorySvg }            from './armory.svg';
import { svg as ranchSvg }             from './ranch.svg';
import { svg as cavalryAcademySvg }    from './cavalry-academy.svg';
import { svg as ironFoundrySvg }       from './iron-foundry.svg';
import { svg as warAcademySvg }        from './war-academy.svg';
import { svg as masonryWorksSvg }      from './masonry-works.svg';
import { svg as siegeWorkshopSvg }     from './siege-workshop.svg';
import { svg as caravanseraiSvg }      from './caravanserai.svg';
import { svg as bankSvg }              from './bank.svg';
import { svg as stockExchangeSvg }     from './stock_exchange.svg';

// ── Unit sprites ─────────────────────────────────────────────────────────────

const UNIT_SPRITES: Record<string, Record<string, string>> = {
  archer:        archerSvg,
  galley:        galleySvg,
  musketeer:     musketeerSvg,
  pikeman:       pikemanSvg,
  scout:         scoutSvg,
  scout_hound:   scoutHoundSvg,
  settler:       settlerSvg,
  shadow_warden: shadowWardenSvg,
  spy_agent:     spyAgentSvg,
  spy_hacker:    spyHackerSvg,
  spy_informant: spyInformantSvg,
  spy_operative: spyOperativeSvg,
  spy_scout:     spyScoutSvg,
  swordsman:     swordsmanSvg,
  trireme:       triremeSvg,
  war_hound:     warHoundSvg,
  warrior:       warriorSvg,
  worker:        workerSvg,
  // MR 2
  axeman:        axemanSvg,
  spearman:      spearmanSvg,
  horseman:      horsemanSvg,
  cavalry:       cavalrySvg,
  knight:        knightSvg,
  crossbowman:   crossbowmanSvg,
  catapult:      catapultSvg,
  ballista:      ballistaSvg,
  caravan:       caravanSvg,
  expedition:    expeditionSvg,
  transport:     transportSvg,
  // MR 4
  carrack:        carrackSvg,
  galleon:        galleonSvg,
  steamship:      steamshipSvg,
  troop_transport: troopTransportSvg,
  // Legendary beasts
  beast_boar:     beastBoarSvg,
  beast_wolf:     beastWolfSvg,
  beast_basilisk: beastBasiliskSvg,
  beast_hydra:       beastHydraSvg,
  beast_sea_serpent: beastSeaSerpentSvg,
  beast_wurm:        beastWurmSvg,
};

export function getUnitSpriteV2(unitType: string, faction: string): string | null {
  // Faction-neutral sprites (e.g. beasts) are stored under 'beast' and shared across all factions
  return UNIT_SPRITES[unitType]?.[faction] ?? UNIT_SPRITES[unitType]?.['beast'] ?? null;
}

// ── Building sprites ──────────────────────────────────────────────────────────

const BUILDING_SPRITES: Record<string, Record<string, string>> = {
  amphitheater:          amphitheaterSvg,
  aqueduct:              aqueductSvg,
  archive:               archiveSvg,
  barracks:              barracksSvg,
  forge:                 forgeSvg,
  forum:                 forumSvg,
  granary:               granarySvg,
  harbor:                harborSvg,
  herbalist:             herbalistSvg,
  'intelligence-agency': intelligenceAgencySvg,
  library:               librarySvg,
  lumbermill:            lumbermillSvg,
  marketplace:           marketplaceSvg,
  monument:              monumentSvg,
  observatory:           observatorySvg,
  'quarry-building':     quarryBuildingSvg,
  safehouse:             safehouseSvg,
  'security-bureau':     securityBureauSvg,
  shrine:                shrineSvg,
  stable:                stableSvg,
  temple:                templeSvg,
  walls:                 wallsSvg,
  workshop:              workshopSvg,
  // MR 3
  dock:                  dockSvg,
  'bronze-workshop':     bronzeWorkshopSvg,
  armory:                armorySvg,
  ranch:                 ranchSvg,
  'cavalry-academy':     cavalryAcademySvg,
  'iron-foundry':        ironFoundrySvg,
  'war-academy':         warAcademySvg,
  'masonry-works':       masonryWorksSvg,
  'siege-workshop':      siegeWorkshopSvg,
  caravanserai:          caravanseraiSvg,
  bank:                  bankSvg,
  stock_exchange:        stockExchangeSvg,
};

export function getBuildingSpriteV2(buildingType: string, faction: string): string | null {
  return BUILDING_SPRITES[buildingType]?.[faction] ?? null;
}

// ── Improvement sprites ───────────────────────────────────────────────────────
// Improvement markers have NO animation and are rendered via Canvas 2D
// (resource_outpost pattern: SVG → HTMLImageElement → ctx.drawImage).
// This function always returns null — it exists only to satisfy the SpriteOverlay
// interface for the 'improvement' kind; the overlay never creates elements for them.

export function getImprovementSpriteV2(_improvementType: string): string | null {
  return null;
}
