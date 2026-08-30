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
import { svg as beastHandlerSvg }  from './beast_handler.svg';
import { svg as warElephantSvg }   from './war_elephant.svg';
import { svg as warriorSvg }       from './warrior.svg';
import { svg as workerSvg }        from './worker.svg';
// MR 2 — ground melee
import { svg as axemanSvg }        from './axeman.svg';
import { svg as spearmanSvg }      from './spearman.svg';
// MR 2 — mounted
import { svg as horsemanSvg }      from './horseman.svg';
import { svg as cavalrySvg }       from './cavalry.svg';
import { svg as knightSvg }        from './knight.svg';
import { svg as cuirassierSvg }    from './cuirassier.svg';
// MR 2 — ranged
import { svg as crossbowmanSvg }   from './crossbowman.svg';
// MR 2 — siege
import { svg as catapultSvg }      from './catapult.svg';
import { svg as ballistaSvg }      from './ballista.svg';
// #711 siege and capital ships
import { svg as trebuchetSvg }     from './trebuchet.svg';
import { svg as rocketArtillerySvg } from './rocket_artillery.svg';
import { svg as battleshipSvg }    from './battleship.svg';
import { svg as missileCruiserSvg } from './missile_cruiser.svg';
// MR 2 — civilian / naval
import { svg as caravanSvg }       from './caravan.svg';
import { svg as expeditionSvg }    from './expedition.svg';
import { svg as transportSvg }     from './transport.svg';
// #759 batch 1
import { svg as combatDroneSvg }       from './combat_drone.svg';
import { svg as autonomousFrigateSvg } from './autonomous_frigate.svg';
import { svg as exosuitInfantrySvg }   from './exosuit_infantry.svg';
import { svg as propagandistSvg }      from './propagandist.svg';
import { svg as droneControllerSvg }   from './drone_controller.svg';
// #709 industrial vehicles — registered after visual-gate approval.
import { svg as armoredCarSvg }        from './armored_car.svg';
import { svg as mechanizedInfantrySvg } from './mechanized_infantry.svg';
import { svg as mainBattleTankSvg }    from './main_battle_tank.svg';
// #710 air-defense and orphaned visual batch — registered after visual-gate approval.
import { svg as paratrooperSvg }       from './paratrooper.svg';
import { svg as navalStrikeAircraftSvg } from './naval_strike_aircraft.svg';
import { svg as maritimePatrolAircraftSvg } from './maritime_patrol_aircraft.svg';
import { svg as supercarrierSvg }      from './supercarrier.svg';
import { svg as greatGeneralSvg }      from './great_general.svg';
// Legendary beasts — faction-neutral, keyed under 'beast'
import { svg as beastBoarSvg }     from './beast_boar.svg';
import { svg as beastWolfSvg }     from './beast_wolf.svg';
import { svg as beastBasiliskSvg } from './beast_basilisk.svg';
import { svg as beastHydraSvg }       from './beast_hydra.svg';
import { svg as beastSeaSerpentSvg }  from './beast_sea_serpent.svg';
import { svg as beastWurmSvg }        from './beast_wurm.svg';
import { svg as beastRocSvg }         from './beast_roc.svg';
import { svg as beastDragonSvg }      from './beast_dragon.svg';
import { svg as pirateGalleySvg } from './pirate_galley.svg';
import { svg as pirateCorsairSvg } from './pirate_corsair.svg';
import { svg as pirateFrigateSvg } from './pirate_frigate.svg';
import { svg as pirateIroncladSvg } from './pirate_ironclad.svg';
import { svg as pirateFastAttackCraftSvg } from './pirate_fast_attack_craft.svg';
import { svg as pirateMothershipSvg } from './pirate_mothership.svg';
import { svg as pirateEnclaveStage1Svg } from './pirate_enclave_stage_1.svg';
import { svg as pirateEnclaveStage2Svg } from './pirate_enclave_stage_2.svg';
import { svg as pirateEnclaveStage3Svg } from './pirate_enclave_stage_3.svg';
import { svg as pirateEnclaveStage4Svg } from './pirate_enclave_stage_4.svg';
import { svg as pirateEnclaveStage5Svg } from './pirate_enclave_stage_5.svg';
import { svg as pirateFlotillaStage2Svg } from './pirate_flotilla_stage_2.svg';
import { svg as pirateFlotillaStage3Svg } from './pirate_flotilla_stage_3.svg';
import { svg as pirateFlotillaStage4Svg } from './pirate_flotilla_stage_4.svg';
import { svg as pirateFlotillaStage5Svg } from './pirate_flotilla_stage_5.svg';

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

import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { derivePalette, NEUTRAL_FACTION_PALETTE } from '../sprite-system';
import type { UnitType } from '@/core/types';

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
  beast_handler: beastHandlerSvg,
  war_elephant:  warElephantSvg,
  warrior:       warriorSvg,
  worker:        workerSvg,
  // MR 2
  axeman:        axemanSvg,
  spearman:      spearmanSvg,
  horseman:      horsemanSvg,
  cavalry:       cavalrySvg,
  knight:        knightSvg,
  cuirassier:    cuirassierSvg,
  crossbowman:   crossbowmanSvg,
  catapult:      catapultSvg,
  ballista:      ballistaSvg,
  trebuchet:     trebuchetSvg,
  rocket_artillery: rocketArtillerySvg,
  battleship:    battleshipSvg,
  missile_cruiser: missileCruiserSvg,
  caravan:       caravanSvg,
  expedition:    expeditionSvg,
  transport:     transportSvg,
  // #759 batch 1
  combat_drone:       combatDroneSvg,
  autonomous_frigate: autonomousFrigateSvg,
  exosuit_infantry:   exosuitInfantrySvg,
  propagandist:       propagandistSvg,
  drone_controller:   droneControllerSvg,
  armored_car:        armoredCarSvg,
  mechanized_infantry: mechanizedInfantrySvg,
  main_battle_tank:   mainBattleTankSvg,
  // #710 air-defense and orphaned visual batch
  paratrooper:              paratrooperSvg,
  naval_strike_aircraft:    navalStrikeAircraftSvg,
  maritime_patrol_aircraft: maritimePatrolAircraftSvg,
  supercarrier:             supercarrierSvg,
  great_general:            greatGeneralSvg,
  // Legendary beasts
  beast_boar:     beastBoarSvg,
  beast_wolf:     beastWolfSvg,
  beast_basilisk: beastBasiliskSvg,
  beast_hydra:       beastHydraSvg,
  beast_sea_serpent: beastSeaSerpentSvg,
  beast_wurm:        beastWurmSvg,
  beast_roc:         beastRocSvg,
  beast_dragon:      beastDragonSvg,
  pirate_galley: pirateGalleySvg,
  pirate_corsair: pirateCorsairSvg,
  pirate_frigate: pirateFrigateSvg,
  pirate_ironclad: pirateIroncladSvg,
  pirate_fast_attack_craft: pirateFastAttackCraftSvg,
  pirate_mothership: pirateMothershipSvg,
};

export function isV2NativeUnit(unitType: string): boolean {
  return unitType in UNIT_SPRITES;
}

/**
 * #755: closes the DOM-overlay animation gap for any unit type not hand-authored in
 * UNIT_SPRITES — both the 24 unit types with no v2 entry at all, and (found during design
 * review) any unit owned by a faction with no per-family key here, which is what happens for
 * every minor-civ-owned unit today (getFaction() returns the raw owner id, not one of the 6
 * archetype names, whenever the owner isn't in state.civilizations). Renders the live
 * units.tsx/UNIT_SPRITE_CATALOG function directly instead of a second, hand-authored copy.
 */
function buildLiveFallbackUnitSprite(unitType: string, civColor: string): string | null {
  const spriteFn = UNIT_SPRITE_CATALOG[unitType as UnitType];
  if (!spriteFn) return null; // genuinely unknown type — Canvas handles it, unchanged today
  const palette = civColor ? derivePalette(civColor) : NEUTRAL_FACTION_PALETTE;
  const rawSvg = spriteFn({ palette, svgOnly: true });
  // SpriteFrame's svgOnly output bakes in a fixed pixel width/height (unit sprites: 128x128).
  // The DOM overlay's outer wrapper (sized in sprite-overlay.ts from camera.hexSize) controls
  // actual display size; the inner <svg> must fill it responsively instead of carrying its own
  // fixed size. Replace the baked attribute pair in place — never prepend a duplicate (same fix
  // shape as the city-panel building-icon feature, #665).
  const svg = rawSvg.replace(
    /(<svg\b[^>]*?)\swidth="\d+"\s+height="\d+"/,
    '$1 width="100%" height="100%"',
  );
  // data-kind deliberately omitted: no ambient-effect CSS class (.cq-glow, .cq-fire, etc.) is
  // data-kind-scoped, and guessing wrong (e.g. tagging a land unit "naval") risks triggering an
  // unrelated body-plan animation rule. Revisit per-unit once real v2-native art exists (see the
  // migration-backlog follow-up issue).
  return `<div class="cq-sprite-wrap cq-v2" data-state="idle" style="--phase:0">${svg}</div>`;
}

export function getUnitSpriteV2(unitType: string, faction: string, civColor: string = ''): string | null {
  // Faction-neutral sprites (e.g. beasts) are stored under 'beast' and shared across all factions
  const sprites = UNIT_SPRITES[unitType];
  if (sprites) {
    if (sprites.pirates) return faction === 'pirates' ? sprites.pirates : null;
    return sprites[faction] ?? sprites.beast ?? buildLiveFallbackUnitSprite(unitType, civColor);
  }
  return buildLiveFallbackUnitSprite(unitType, civColor);
}

const PIRATE_HEADQUARTERS_SPRITES: Record<string, Record<string, string>> = {
  pirate_enclave_stage_1: pirateEnclaveStage1Svg,
  pirate_enclave_stage_2: pirateEnclaveStage2Svg,
  pirate_enclave_stage_3: pirateEnclaveStage3Svg,
  pirate_enclave_stage_4: pirateEnclaveStage4Svg,
  pirate_enclave_stage_5: pirateEnclaveStage5Svg,
  pirate_flotilla_stage_2: pirateFlotillaStage2Svg,
  pirate_flotilla_stage_3: pirateFlotillaStage3Svg,
  pirate_flotilla_stage_4: pirateFlotillaStage4Svg,
  pirate_flotilla_stage_5: pirateFlotillaStage5Svg,
};

export function getPirateHeadquartersSpriteV2(headquartersType: string): string | null {
  return PIRATE_HEADQUARTERS_SPRITES[headquartersType]?.pirates ?? null;
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
