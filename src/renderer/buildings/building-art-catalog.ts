// Production art for buildings (#620): one transparent, civ-neutral PNG per building under public/images/buildings/art/, each
// with a provenance record in design/building-art/. The SVG component in BUILDING_SPRITE_CATALOG stays as the offline /
// load-failure fallback, exactly as the canvas drawing does for legendary wonder art. The art has no flag: every surface adds
// the owner's banner over it (building-art-sprite.ts), so civ colour still flows only from the palette.

/** Where the owner's banner pole stands on the art, in the 192x192 sprite frame. */
export interface BuildingArtEntry {
  readonly bannerX: number;
  readonly bannerY: number;
}

export const BUILDING_ART: Readonly<Record<string, BuildingArtEntry>> = {
  royal_mint: { bannerX: 16, bannerY: 146 },
  blast_furnace: { bannerX: 16, bannerY: 138 },
  sacred_grove: { bannerX: 16, bannerY: 128 },
  guildhall: { bannerX: 18, bannerY: 138 },
  grand_bazaar: { bannerX: 16, bannerY: 108 },
  tribal_muster_ground: { bannerX: 14, bannerY: 112 },
  communal_stores: { bannerX: 14, bannerY: 120 },
  distillery: { bannerX: 14, bannerY: 122 },
  praetorian_legion: { bannerX: 12, bannerY: 126 },
  iron_legion: { bannerX: 12, bannerY: 124 },
  artillery_corps_hq: { bannerX: 12, bannerY: 118 },
  foundry_guild: { bannerX: 12, bannerY: 118 },
  scribes_hall: { bannerX: 10, bannerY: 114 },
  philosophers_circle: { bannerX: 10, bannerY: 122 },
  road_corps: { bannerX: 10, bannerY: 104 },
  sacred_council: { bannerX: 12, bannerY: 142 },
  imperial_archive: { bannerX: 12, bannerY: 132 },
  royal_academy: { bannerX: 12, bannerY: 136 },
  university: { bannerX: 10, bannerY: 118 },
  monastery: { bannerX: 10, bannerY: 108 },
  explorers_guild: { bannerX: 12, bannerY: 130 },
  art_gallery: { bannerX: 12, bannerY: 132 },
};

export const BUILDING_ART_IDS: readonly string[] = Object.keys(BUILDING_ART);

/** App-relative path (no leading slash; resolve it with `resolveAppAssetUrl`), or null for a building without art. */
export function getBuildingArtPath(buildingId: string): string | null {
  return Object.prototype.hasOwnProperty.call(BUILDING_ART, buildingId) ? `images/buildings/art/${buildingId}.png` : null;
}
