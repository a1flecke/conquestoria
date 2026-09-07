import type { GameState, HexCoord } from '@/core/types';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { appendNotification } from '@/core/notification-log';
import { syncTransportCargoPositions } from '@/systems/transport-system';

/**
 * Schema 9 (#751) — coastal-only hulls saved on open ocean are relocated to the
 * nearest reachable coast (cargo travelling with them), or removed when no coast
 * is reachable. Two stranded units never land on the same tile.
 */

/**
 * BFS outward from `start` over ocean/coast tiles only, returning the nearest coast tile not in
 * `occupied`. Deterministic (neighbors visited in sorted hexKey order) so migration output
 * doesn't depend on map object iteration order. Returns null if the connected water body has no
 * free coast tile at all (only possible on a pathological all-ocean or fully-occupied map).
 */
function nearestCoastTile(map: GameState['map'], start: HexCoord, occupied: ReadonlySet<string>): HexCoord | null {
  const visited = new Set<string>([hexKey(start)]);
  let frontier: HexCoord[] = [start];
  while (frontier.length > 0) {
    const next: HexCoord[] = [];
    for (const coord of frontier) {
      const neighbors = map.wrapsHorizontally
        ? getWrappedHexNeighbors(coord, map.width)
        : hexNeighbors(coord);
      const sorted = [...neighbors].sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
      for (const neighbor of sorted) {
        const key = hexKey(neighbor);
        if (visited.has(key)) continue;
        visited.add(key);
        const tile = map.tiles[key];
        if (!tile || (tile.terrain !== 'ocean' && tile.terrain !== 'coast')) continue;
        if (tile.terrain === 'coast' && !occupied.has(key)) return neighbor;
        if (tile.terrain === 'ocean' || tile.terrain === 'coast') next.push(neighbor);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * #751: coastal-only hulls (Galley, Transport, and their pirate equivalents) used to be able to
 * enter ocean tiles due to the bug this MR fixes. Any existing save may have one of those units
 * sitting on `ocean` right now, which is no longer a legal position for its hull. Relocate to
 * the nearest coast tile (deterministic BFS); if no coast is reachable at all (pathological
 * landlocked-ocean map), remove the unit rather than leave it permanently stranded and
 * unselectable — mirrors the deletion fallback in migrateLegacyBasedAircraft above.
 *
 * Per game-systems.md's spawn-occupancy rule (never stack units placed onto the map, even
 * though this relocates rather than spawns, the same hazard applies): each stranded unit's
 * destination is added to `occupied` immediately after being claimed, so two different stranded
 * units — potentially different owners — can never be relocated onto the same tile, and a
 * destination already held by a unit that isn't itself being relocated away is never chosen.
 */
export function migrateCoastalHullsOffOcean(state: GameState): GameState {
  const units = { ...state.units };
  const removedIds = new Set<string>();
  const relocatedIds: string[] = [];

  const strandedIds = Object.values(state.units)
    .filter(unit => {
      const def = UNIT_DEFINITIONS[unit.type];
      if (!def || def.domain !== 'naval' || def.waterAccess === 'ocean') return false;
      const tile = state.map.tiles[hexKey(unit.position)];
      return tile?.terrain === 'ocean';
    })
    .map(unit => unit.id)
    .sort();
  const strandedIdSet = new Set(strandedIds);

  const occupied = new Set(
    Object.values(state.units)
      .filter(unit => !strandedIdSet.has(unit.id))
      .map(unit => hexKey(unit.position)),
  );

  for (const unitId of strandedIds) {
    const unit = units[unitId];
    if (!unit) continue;
    const destination = nearestCoastTile(state.map, unit.position, occupied);
    if (!destination) {
      delete units[unitId];
      removedIds.add(unitId);
      continue;
    }
    occupied.add(hexKey(destination));
    units[unitId] = { ...unit, position: { ...destination } };
    relocatedIds.push(unitId);
  }

  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
    civId,
    removedIds.size > 0 ? { ...civ, units: civ.units.filter(id => !removedIds.has(id)) } : civ,
  ]));

  let working: GameState = { ...state, units, civilizations };
  for (const unitId of relocatedIds) {
    working = syncTransportCargoPositions(working, unitId);
    const unit = working.units[unitId]!;
    const name = UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
    appendNotification(working, unit.owner, {
      message: `Your ${name} couldn't survive the open ocean and put in near shore.`,
      type: 'warning',
      turn: working.turn,
    });
  }
  return working;
}
