import { afterEach } from 'vitest';
import { BUILDINGS } from '@/systems/city-system';
import { BUILDING_ART, BUILDING_ART_IDS, type BuildingArtEntry } from '@/renderer/buildings/building-art-catalog';
import { BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';

/**
 * Stand-ins used once every building is painted (#615 finished the catalog): their art rows are removed for the duration of one
 * test, so the panel and the renderer take the same path a genuinely unpainted building takes (its SVG sprite and emoji). Each
 * needs its own SVG sprite and its own production icon.
 */
const STAND_IN_IDS = ['granary', 'workshop', 'forge'];

let hidden: Array<{ id: string; entry: BuildingArtEntry }> = [];

// The art catalog is read live by every consumer (path lookup, banner anchor, sprite loader), so removing and restoring the row
// is all it takes. Restored after every test so the catalog-wide checks (each PNG exists, anchors are in range) still see them.
afterEach(restoreStandIns);

function restoreStandIns(): void {
  if (hidden.length === 0) return;
  const art = BUILDING_ART as Record<string, BuildingArtEntry>;
  for (const { id, entry } of hidden) {
    art[id] = entry;
    (BUILDING_ART_IDS as string[]).push(id);
  }
  hidden = [];
}

function hideStandIns(): void {
  if (hidden.length > 0) return;
  const art = BUILDING_ART as Record<string, BuildingArtEntry>;
  for (const id of STAND_IN_IDS) {
    if (!art[id]) continue;
    hidden.push({ id, entry: art[id] });
    delete art[id];
    (BUILDING_ART_IDS as string[]).splice(BUILDING_ART_IDS.indexOf(id), 1);
  }
}

function listRealUnpaintedBuildingIds(): string[] {
  return Object.keys(BUILDINGS)
    .filter(id => BUILDING_SPRITE_CATALOG[id] && !BUILDING_ART_IDS.includes(id))
    .sort();
}

/**
 * Buildings that use their SVG sprite (no production art, #620), in a stable order.
 *
 * Tests that need "a building without art" take one from here instead of naming an id. Naming one (granary, workshop, then
 * modular_arcology) broke each time that building was painted, once per art group. While any real building is unpainted the
 * list is those buildings. Once every building has art the list is the stand-ins above, hidden until the end of the current
 * test, so a test written against this helper keeps meaning "a building that falls back to its SVG" without being edited again.
 * Call it inside a test or a `beforeEach`, never at describe time (the hiding ends with the first test).
 */
export function getUnpaintedBuildingIds(): string[] {
  const real = listRealUnpaintedBuildingIds();
  if (real.length > 0 && hidden.length === 0) return real;
  hideStandIns();
  return listRealUnpaintedBuildingIds();
}

/** The `index`th unpainted building. Throws, saying why, if the catalog has none even with the stand-ins hidden. */
export function getUnpaintedBuildingId(index = 0): string {
  const id = getUnpaintedBuildingIds()[index];
  if (!id) {
    throw new Error(
      `Fewer than ${index + 1} buildings are left without production art, so this test has no real building to stand in for ` +
      '"a building that falls back to its SVG sprite". Add a stand-in with its own SVG sprite and production icon.',
    );
  }
  return id;
}
