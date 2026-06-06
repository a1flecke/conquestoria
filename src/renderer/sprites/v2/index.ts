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
  // MR 2 adds: axeman, spearman, horseman, cavalry, knight,
  //            crossbowman, catapult, ballista, caravan, expedition, transport
};

export function getUnitSpriteV2(unitType: string, faction: string): string | null {
  return UNIT_SPRITES[unitType]?.[faction] ?? null;
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
  // MR 3 adds remaining buildings (dock, bronze-workshop, armory, ranch,
  //   cavalry-academy, iron-foundry, war-academy, masonry-works,
  //   siege-workshop, caravanserai, bank, stock_exchange)
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
