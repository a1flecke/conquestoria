import { tagLandmassRegions } from '@/systems/landmass-tagger';
import type { SaveMigration } from '../types';

// Typed through `SaveMigration` so this step adds no importer to the `@/core/types` compatibility barrel (#1361).
type GameState = Parameters<SaveMigration>[0];

const LANDMASS_TAG = /^(continent|island)-\d+$/;

/**
 * Schema 41 — a landmass that crosses the horizontal seam carries one tag.
 *
 * `tagLandmassRegions` used to ignore the wrap, so a continent crossing the left/right edge of a wrapping map
 * was tagged as two landmasses. That counted a city founded on the home continent, just across the seam, as a
 * foreign-landmass settlement and split the continent's threat pressure in two. The load path only tags land
 * that has no tag, so an older save keeps the split tags until this step re-tags it, once.
 *
 * Every new landmass is a union of old ones, so each old tag maps to exactly one new tag. Records keyed by an
 * old tag move to the new one; where two old tags merge, the later turn wins (the most recent combat, the
 * cooldown that ends last). Any other persisted `regionKey` that names an old tag (advisor memories, freight
 * ports) is renamed in place. Pirate suppression records also use the `regionKey` name for a hex key, which
 * never matches a landmass tag and is left alone. A flat map, or one whose tags are already right, is returned
 * unchanged.
 */
export function migrateLandmassSeamTags(state: GameState): GameState {
  const map = state.map;
  if (!map?.tiles || !map.wrapsHorizontally) return state;

  const retagged = tagLandmassRegions(map);
  const mapping = new Map<string, string>();
  let changed = false;
  for (const key of Object.keys(map.tiles).sort()) {
    const before = map.tiles[key]?.regionKey;
    const after = retagged[key]?.regionKey;
    if (before !== after) changed = true;
    if (before && after && !mapping.has(before)) mapping.set(before, after);
  }
  if (!changed) return state;

  const renameTag = (tag: string): string => mapping.get(tag) ?? tag;
  const renameCivLandmassKey = (key: string): string => {
    const split = key.lastIndexOf(':');
    return split < 0 ? key : `${key.slice(0, split)}:${renameTag(key.slice(split + 1))}`;
  };
  const mergeLatest = (record: Record<string, number> | undefined, rename: (key: string) => string) => {
    if (!record) return record;
    const merged: Record<string, number> = {};
    for (const key of Object.keys(record).sort()) {
      const target = rename(key);
      merged[target] = Math.max(merged[target] ?? -Infinity, record[key]!);
    }
    return merged;
  };

  const civilizations = Object.fromEntries(Object.entries(state.civilizations ?? {}).map(([id, civ]) => [
    id,
    civ.lastCombatTurnByLandmass
      ? { ...civ, lastCombatTurnByLandmass: mergeLatest(civ.lastCombatTurnByLandmass, renameTag) }
      : civ,
  ]));

  const next: GameState = {
    ...state,
    map: { ...map, tiles: retagged },
    civilizations,
    ...(state.pirateFleetCooldownByCivLandmass
      ? { pirateFleetCooldownByCivLandmass: mergeLatest(state.pirateFleetCooldownByCivLandmass, renameCivLandmassKey) }
      : {}),
    ...(state.resurgentCampCooldownByCivLandmass
      ? { resurgentCampCooldownByCivLandmass: mergeLatest(state.resurgentCampCooldownByCivLandmass, renameCivLandmassKey) }
      : {}),
  };

  // Persisted references that name a landmass tag outside the map (the map's own tags are already new).
  const { map: retaggedMap, ...rest } = next;
  return { ...(renameRegionKeys(rest, renameTag) as typeof rest), map: retaggedMap };
}

function renameRegionKeys(value: unknown, renameTag: (tag: string) => string): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map(item => {
      const renamed = renameRegionKeys(item, renameTag);
      if (renamed !== item) changed = true;
      return renamed;
    });
    return changed ? items : value;
  }
  if (!value || typeof value !== 'object') return value;
  let changed = false;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, child]) => {
    let renamed: unknown;
    if (key === 'regionKey' && typeof child === 'string' && LANDMASS_TAG.test(child)) {
      renamed = renameTag(child);
    } else {
      renamed = renameRegionKeys(child, renameTag);
    }
    if (renamed !== child) changed = true;
    return [key, renamed] as const;
  });
  return changed ? Object.fromEntries(entries) : value;
}
