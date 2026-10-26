import { BUILDINGS } from '@/systems/city-system';
import { BUILDING_ART_IDS } from '@/renderer/buildings/building-art-catalog';
import { BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';

/**
 * Real buildings that still use their SVG sprite (no production art, #620), in a stable order.
 *
 * Tests that need "a building without art" take one from here instead of naming an id. Naming one (granary, workshop, then
 * modular_arcology) broke each time that building was painted, once per art group. The unpainted set shrinks as art lands, so a
 * test written against this helper keeps meaning "a building that falls back to its SVG" without being edited again.
 */
export function getUnpaintedBuildingIds(): string[] {
  return Object.keys(BUILDINGS)
    .filter(id => BUILDING_SPRITE_CATALOG[id] && !BUILDING_ART_IDS.includes(id))
    .sort();
}

/** The `index`th unpainted building. Throws, saying why, once every building has art (a test then needs a synthetic entry). */
export function getUnpaintedBuildingId(index = 0): string {
  const id = getUnpaintedBuildingIds()[index];
  if (!id) {
    throw new Error(
      `Fewer than ${index + 1} buildings are left without production art, so this test has no real building to stand in for ` +
      '"a building that falls back to its SVG sprite". Register a synthetic catalog entry in the test instead.',
    );
  }
  return id;
}
