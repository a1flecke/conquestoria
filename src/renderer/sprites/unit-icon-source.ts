import { UNIT_SPRITE_CATALOG } from './sprite-catalog';
import { derivePalette, NEUTRAL_FACTION_PALETTE } from './sprite-system';
import { listPngUnitManifests } from './png/png-sprite-catalog';
import { buildPngUnitSpriteHtml, resolvePngTint } from './png/png-sprite-html';

/**
 * What a panel draws for a unit icon (#1535): the unit's real sprite from the canonical catalogs, never a list kept beside them.
 * A unit with a PNG manifest is a PNG unit (tinted at runtime, so any owner colour works); every other unit comes from the SVG
 * catalog. The panel owns sizing, id numbering and the wrapper; this module only says which sprite and in what colour.
 */
export type UnitIconSource =
  | { readonly kind: 'png'; readonly html: string }
  | { readonly kind: 'svg'; readonly svg: string };

const isCatalogued = (unitType: string): unitType is keyof typeof UNIT_SPRITE_CATALOG =>
  Object.prototype.hasOwnProperty.call(UNIT_SPRITE_CATALOG, unitType);

/**
 * The sprite for `unitType` in the owner's colour, or null when the id is not a unit with a sprite (the caller keeps its emoji).
 * `ownerColor` is the owner's civ colour, or null for a neutral owner. Never throws.
 */
export function getUnitIconSource(unitType: string, ownerColor: string | null): UnitIconSource | null {
  // Match against the manifest list, not a keyed lookup: `getPngUnitManifest('__proto__')` is truthy (a plain-object table).
  const png = listPngUnitManifests().find(manifest => manifest.id === unitType);
  if (png) return { kind: 'png', html: buildPngUnitSpriteHtml(png, resolvePngTint(ownerColor ?? '', '')) };

  if (!isCatalogued(unitType)) return null;
  const palette = ownerColor ? derivePalette(ownerColor) : NEUTRAL_FACTION_PALETTE;
  const svg = UNIT_SPRITE_CATALOG[unitType]({ palette, svgOnly: true });
  return svg ? { kind: 'svg', svg } : null;
}
