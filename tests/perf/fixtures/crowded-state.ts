/**
 * #1007 — deterministic crowded late-game fixtures.
 *
 * #1064 (F1) means an AI-driven campaign on `main` never reaches "dozens of
 * cities, hundreds of units" — so this places entities DIRECTLY via `#846`'s
 * `buildScenario` (`ScenarioDefinition` steps applied through the real system
 * helpers, from `createHotSeatGame`). Deterministic by construction: fixed seed
 * + fixed step list, no dependency on AI reproducibility.
 *
 * `entityScale` (1 | 2) multiplies cities + units + camps — the knob for the
 * turn / AI-round / save-size / structuredClone / move-range guards. Map area is
 * a separate concern (`pathfindingMaps()` below) because `findPath` cost scales
 * with map area, not entity count.
 */
import type { GameMap, GameState, HexCoord, HotSeatConfig, UnitType } from '@/core/types';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { findPath } from '@/systems/unit-pathfinding';
import { TECH_TREE } from '@/systems/tech-definitions';
import { buildScenario } from '@/testing/scenario-builder';
import type { ScenarioDefinition, ScenarioStep } from '@/testing/scenario-types';

const CIV_TYPES = ['rome', 'greece', 'china', 'egypt', 'persia', 'babylon', 'mongolia', 'japan'] as const;
const PERF_SEED = 'perf-crowded-1007';
const MID_TECH_IDS: readonly string[] = TECH_TREE.filter(tech => tech.era <= 5).map(tech => tech.id);
const UNIT_ROTATION: readonly UnitType[] = ['warrior', 'archer', 'scout', 'spearman'];
const BLOCKED_TERRAIN = new Set(['ocean', 'coast', 'mountain']);

function hotSeatConfig(): HotSeatConfig {
  return {
    playerCount: CIV_TYPES.length,
    mapSize: 'large',
    players: CIV_TYPES.map((civType, i) => ({
      name: `Player ${i + 1}`,
      slotId: `player-${i + 1}`,
      civType,
      isHuman: i < 4, // 4 human slots, 4 AI slots — exercises both paths
    })),
  };
}

/** Free land tiles on `state`'s map, sorted by hexKey, excluding tiles already occupied. */
function freeLandTiles(state: GameState): HexCoord[] {
  const occupied = new Set<string>();
  for (const city of Object.values(state.cities)) occupied.add(hexKey(city.position));
  for (const unit of Object.values(state.units)) occupied.add(hexKey(unit.position));
  for (const camp of Object.values(state.barbarianCamps ?? {})) occupied.add(hexKey(camp.position));
  return Object.entries(state.map.tiles)
    .filter(([key, tile]) => !BLOCKED_TERRAIN.has(tile.terrain) && !occupied.has(key))
    .map(([key]) => {
      const [q, r] = key.split(',').map(Number);
      return { q: q!, r: r! };
    })
    .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
}

export interface CrowdedGameOptions {
  entityScale: 1 | 2;
}

/**
 * 8 civs on a large map, mid-tech, `entityScale × { 24 cities, 160 units,
 * 6 camps }` placed on a strided free-land lattice, three civ pairs at war
 * (but no civ near a victory threshold — city counts stay even).
 */
export function buildCrowdedGame({ entityScale }: CrowdedGameOptions): GameState {
  const config = hotSeatConfig();
  // A base probe built the SAME way buildScenario builds it — same seed, same
  // map, same starting cities/units — so the lattice excludes real occupancy.
  const probe = createHotSeatGame(config, PERF_SEED);
  const lattice = freeLandTiles(probe);
  if (lattice.length < 3000) throw new Error(`perf fixture: only ${lattice.length} free land tiles`);

  const cityCount = entityScale * 24;
  const unitCount = entityScale * 160;
  const campCount = entityScale * 6;
  const total = cityCount + unitCount + campCount;
  // Even stride so placements are spread across the whole map and never repeat.
  const stride = Math.floor(lattice.length / (total + 8));
  if (stride < 1) throw new Error(`perf fixture: lattice too small for ${total} placements`);
  const at = (i: number): HexCoord => lattice[(i + 1) * stride]!;

  const slotIds = CIV_TYPES.map((_, i) => `player-${i + 1}`);
  const steps: ScenarioStep[] = [];

  for (const slotId of slotIds) {
    steps.push({ kind: 'tech', civId: slotId, techIds: MID_TECH_IDS });
  }

  let cursor = 0;
  for (let i = 0; i < cityCount; i += 1, cursor += 1) {
    steps.push({ kind: 'city', civId: slotIds[i % slotIds.length]!, position: at(cursor) });
  }
  for (let i = 0; i < unitCount; i += 1, cursor += 1) {
    steps.push({
      kind: 'unit',
      civId: slotIds[i % slotIds.length]!,
      type: UNIT_ROTATION[i % UNIT_ROTATION.length]!,
      position: at(cursor),
    });
  }
  for (let i = 0; i < campCount; i += 1, cursor += 1) {
    steps.push({ kind: 'camp', position: at(cursor) });
  }

  steps.push({ kind: 'diplomacy', civA: slotIds[0]!, civB: slotIds[1]!, status: 'war' });
  steps.push({ kind: 'diplomacy', civA: slotIds[2]!, civB: slotIds[3]!, status: 'war' });
  steps.push({ kind: 'diplomacy', civA: slotIds[4]!, civB: slotIds[5]!, status: 'war' });

  const definition: ScenarioDefinition = {
    name: `perf-crowded-e${entityScale}`,
    description: `#1007 perf fixture: 8 civs, +${cityCount} cities, +${unitCount} units, +${campCount} camps`,
    seed: PERF_SEED,
    base: { kind: 'hotSeat', config },
    steps,
  };
  return buildScenario(definition);
}

export interface PathfindingFixture {
  map: GameMap;
  from: HexCoord;
  to: HexCoord;
  /** `hexDistance(from, to)` — the straight-line lower bound on the route. */
  straightLine: number;
}

/**
 * A deterministic large map with a SHORT, DIRECT, open-terrain land route
 * (~`TARGET_SPAN` hexes, over passable non-mountain terrain, whose `findPath`
 * route length is within 1.5× of the straight line — i.e. no forced detour).
 *
 * The point: with a tight admissible heuristic A* pops ~O(route length); drop
 * the heuristic (Dijkstra) and it pops ~O(span²) — a large, clean blow-up that
 * GUARD 2 catches on both the absolute pop budget AND pops-per-route-step. A
 * long twisty route (e.g. between far starting cities) already pops many× its
 * length on `main`, so the heuristic's marginal value there is too small to
 * make the sabotage visible.
 */
export function pathfindingFixture(): PathfindingFixture {
  const state = createNewGame({
    civType: 'rome', mapSize: 'large', opponentCount: 7, gameTitle: 'perf-pf',
    opponentChallenge: 'standard', seed: 'perf-pf-large',
  });
  const TARGET_SPAN = 18;
  const passable = (c: HexCoord): boolean => {
    const t = state.map.tiles[hexKey(c)]?.terrain;
    return t !== undefined && t !== 'ocean' && t !== 'coast' && t !== 'mountain';
  };
  // Deterministic scan: sorted land tiles; for each, try a straight eastward
  // partner `TARGET_SPAN` hexes away; take the first pair whose direct route is
  // near-straight (no big detour).
  const land = Object.entries(state.map.tiles)
    .filter(([, tile]) => tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain')
    .map(([k]) => {
      const [q, r] = k.split(',').map(Number);
      return { q: q!, r: r! };
    })
    .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
  for (const from of land) {
    const to = { q: from.q + TARGET_SPAN, r: from.r };
    if (!passable(to)) continue;
    const straightLine = hexDistance(from, to);
    if (straightLine < TARGET_SPAN - 2) continue;
    const path = findPath(from, to, state.map, 'land');
    if (path && path.length <= straightLine * 1.5) {
      return { map: state.map, from, to, straightLine };
    }
  }
  throw new Error('perf pathfinding fixture: no short near-straight open route found — re-pick seed/span');
}

/** `createNewGame` config for the largest map — LOCAL wall-clock report only. */
export function largeMapGenerationInput() {
  return {
    civType: 'rome' as const,
    mapSize: 'large' as const,
    opponentCount: 7,
    gameTitle: 'perf-mapgen',
    opponentChallenge: 'standard' as const,
    seed: 'perf-mapgen',
  };
}
