import type { BeastId, BeastLair, BeastsMode, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { BEAST_DEFINITIONS, getBeastDefinitionByUnitType, type BeastDefinition } from '@/systems/beast-definitions';
import { hexKey, hexDistance, hexNeighbors } from '@/systems/hex-utils';
import { createRng } from '@/systems/map-generator';

export const BEAST_OWNER = 'beasts';

export const LAIR_COUNTS = { small: 3, medium: 5, large: 7 } as const;

const MIN_DISTANCE_FROM_START = 6;
const MIN_DISTANCE_BETWEEN_LAIRS = 5;

export function placeBeastLairs(
  map: GameMap,
  startPositions: HexCoord[],
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): Record<string, BeastLair> {
  const rng = createRng(seed + '-beasts');
  const budget = LAIR_COUNTS[mapSize];
  const lairs: Record<string, BeastLair> = {};
  const placed: HexCoord[] = [];

  // Deterministic beast order: shuffle the roster, then take up to budget
  const roster: BeastDefinition[] = Object.values(BEAST_DEFINITIONS);
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }

  for (const def of roster) {
    if (placed.length >= budget) break;
    const candidates = Object.values(map.tiles).filter(tile =>
      def.habitatTerrains.includes(tile.terrain)
      && tile.wonder === null
      && startPositions.every(s => hexDistance(tile.coord, s) >= MIN_DISTANCE_FROM_START)
      && placed.every(p => hexDistance(tile.coord, p) >= MIN_DISTANCE_BETWEEN_LAIRS),
    );
    if (candidates.length === 0) continue;   // no valid habitat — skip this beast, never force-place
    const tile = candidates[Math.floor(rng() * candidates.length)];
    const lair: BeastLair = {
      id: `lair-${def.id}`,
      beastId: def.id,
      position: { ...tile.coord },
      status: 'dormant',
      strength: 0,
      unitIds: [],
    };
    lairs[lair.id] = lair;
    placed.push(tile.coord);
  }
  return lairs;
}

// ---- LCG for per-turn seeded randomness ----

function mixSeed(n: number): number {
  // MurmurHash3 finalizer — good avalanche for small integers like turn numbers
  let h = n ^ (n >>> 16);
  h = Math.imul(h, 0x85ebca6b);
  h = h ^ (h >>> 13);
  h = Math.imul(h, 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h || 1;
}

function lcg(seed: number): () => number {
  let s = mixSeed(seed);
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

const AWAKEN_CHANCE_PER_TURN = 0.10;
export const LAIR_GROWTH_INTERVAL_TURNS = 10;
export const LAIR_GROWTH_CAP = 5;
export const LAIR_GROWTH_EXPERIENCE = 16;

export interface BeastMoveOrder { unitId: string; toCoord: HexCoord }
export interface BeastAttackOrder { attackerUnitId: string; defenderUnitId: string }
export interface BeastSpawnOrder { lairId: string; beastId: BeastId; position: HexCoord }
export interface BeastAwakening { lairId: string; beastId: BeastId; position: HexCoord }

export interface BeastProcessResult {
  updatedLairs: BeastLair[];
  spawnOrders: BeastSpawnOrder[];
  moveOrders: BeastMoveOrder[];
  attackOrders: BeastAttackOrder[];
  awakenings: BeastAwakening[];
}

const IMPASSABLE_FOR_BEASTS = new Set(['ocean', 'coast', 'mountain']);

export function processBeasts(
  lairs: BeastLair[],
  map: GameMap,
  intruderUnits: Unit[],
  beastUnits: Unit[],
  era: number,
  mode: BeastsMode,
  seed: number,
): BeastProcessResult {
  const empty: BeastProcessResult = { updatedLairs: lairs, spawnOrders: [], moveOrders: [], attackOrders: [], awakenings: [] };
  if (mode === 'off') return empty;

  const rng = lcg(seed);
  const updatedLairs: BeastLair[] = [];
  const spawnOrders: BeastSpawnOrder[] = [];
  const awakenings: BeastAwakening[] = [];
  const moveOrders: BeastMoveOrder[] = [];
  const attackOrders: BeastAttackOrder[] = [];

  const occupied = new Map<string, string>();
  for (const u of [...beastUnits, ...intruderUnits]) occupied.set(hexKey(u.position), u.id);

  for (const lair of lairs) {
    const def = BEAST_DEFINITIONS[lair.beastId];
    if (lair.status === 'dormant' && era >= def.awakenEra && rng() < AWAKEN_CHANCE_PER_TURN) {
      awakenings.push({ lairId: lair.id, beastId: lair.beastId, position: lair.position });
      // Spawn packSize beasts on lair tile then free passable neighbors
      const spawnTiles: HexCoord[] = [];
      if (!occupied.has(hexKey(lair.position))) spawnTiles.push(lair.position);
      for (const n of hexNeighbors(lair.position)) {
        if (spawnTiles.length >= def.packSize) break;
        const tile = map.tiles[hexKey(n)];
        if (tile && !IMPASSABLE_FOR_BEASTS.has(tile.terrain) && !occupied.has(hexKey(n))) spawnTiles.push(n);
      }
      for (const pos of spawnTiles.slice(0, def.packSize)) {
        spawnOrders.push({ lairId: lair.id, beastId: lair.beastId, position: { ...pos } });
        occupied.set(hexKey(pos), 'pending-spawn');
      }
      updatedLairs.push({ ...lair, status: 'awake' });
    } else {
      updatedLairs.push(lair);
    }
  }

  if (mode === 'calm') {
    return { updatedLairs, spawnOrders, moveOrders: [], attackOrders: [], awakenings };
  }

  const lairByUnitId = new Map<string, BeastLair>();
  for (const lair of updatedLairs) for (const id of lair.unitIds) lairByUnitId.set(id, lair);

  for (const beast of beastUnits) {
    if (beast.movementPointsLeft <= 0) continue;
    const lair = lairByUnitId.get(beast.id);
    if (!lair) continue;
    const def = BEAST_DEFINITIONS[lair.beastId];

    const inLeash = (c: HexCoord) => hexDistance(c, lair.position) <= def.leashRadius;
    const targets = intruderUnits
      .filter(u => inLeash(u.position))
      .sort((a, b) => hexDistance(a.position, beast.position) - hexDistance(b.position, beast.position));
    const target = targets[0];

    if (target && hexDistance(target.position, beast.position) === 1) {
      attackOrders.push({ attackerUnitId: beast.id, defenderUnitId: target.id });
      continue;
    }

    const goal = target ? target.position : lair.position;
    if (hexKey(goal) === hexKey(beast.position)) continue;
    const step = hexNeighbors(beast.position)
      .filter(n => {
        const tile = map.tiles[hexKey(n)];
        return tile && !IMPASSABLE_FOR_BEASTS.has(tile.terrain) && !occupied.has(hexKey(n)) && inLeash(n);
      })
      .sort((a, b) => hexDistance(a, goal) - hexDistance(b, goal))[0];
    if (step && hexDistance(step, goal) < hexDistance(beast.position, goal)) {
      occupied.delete(hexKey(beast.position));
      occupied.set(hexKey(step), beast.id);
      moveOrders.push({ unitId: beast.id, toCoord: step });
    }
  }

  return { updatedLairs, spawnOrders, moveOrders, attackOrders, awakenings };
}

// ---- Slay rewards ----

export function isBeastUnit(unit: Pick<Unit, 'owner'>): boolean {
  return unit.owner === BEAST_OWNER;
}

export function getBeastHoardGold(def: BeastDefinition, era: number): number {
  // Tier base, +50% per era past the awaken era — late kills stay worthwhile
  const eraBonus = Math.max(0, era - def.awakenEra);
  return Math.round(def.hoardGoldBase * (1 + 0.5 * eraBonus));
}

export interface BeastSlainPayload {
  lairId: string;
  beastId: BeastId;
  slayerCivId: string;
  slayerUnitId: string;
  goldAwarded: number;
}

/**
 * Shared slay consequence — MUST be called from every path that kills a beast
 * (player attack in main.ts, AI/beast combat in turn-manager.ts).
 * Returns a new GameState; never mutates the input.
 */
export function recordBeastSlain(
  state: GameState,
  defeated: Unit,
  victor: Unit,
): { state: GameState; slain?: BeastSlainPayload } {
  if (!isBeastUnit(defeated) || !state.beasts) return { state };

  const lair = Object.values(state.beasts.lairs).find(l => l.unitIds.includes(defeated.id));
  if (!lair) return { state };

  const remaining = lair.unitIds.filter(id => id !== defeated.id);
  if (remaining.length > 0) {
    const updatedLair: BeastLair = { ...lair, unitIds: remaining };
    return {
      state: { ...state, beasts: { ...state.beasts, lairs: { ...state.beasts.lairs, [lair.id]: updatedLair } } },
    };
  }

  const def = BEAST_DEFINITIONS[lair.beastId];
  const gold = getBeastHoardGold(def, state.era);
  const slayerCiv = state.civilizations[victor.owner];
  const updatedLair: BeastLair = {
    ...lair, unitIds: [], status: 'slain', slainBy: victor.owner, slainTurn: state.turn,
  };

  let next: GameState = {
    ...state,
    beasts: { ...state.beasts, lairs: { ...state.beasts.lairs, [lair.id]: updatedLair } },
  };
  if (slayerCiv) {
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        [victor.owner]: { ...slayerCiv, gold: slayerCiv.gold + gold },
      },
    };
  }
  // Victory Feast: the slaying unit is fully healed
  const victorUnit = next.units[victor.id];
  if (victorUnit) {
    next = { ...next, units: { ...next.units, [victor.id]: { ...victorUnit, health: 100 } } };
  }

  return {
    state: next,
    slain: slayerCiv
      ? { lairId: lair.id, beastId: lair.beastId, slayerCivId: victor.owner, slayerUnitId: victor.id, goldAwarded: gold }
      : undefined,
  };
}
