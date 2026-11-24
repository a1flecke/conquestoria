import type { City, GameMap, GameState, HexTile, Unit, UnitType } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { hexKey } from '@/systems/hex-utils';

/**
 * #1766: a small synthetic world for border-confrontation tests.
 *
 * `host` owns one city at the left edge; `rival` owns a city far away and an armed unit near the host city. The map
 * wraps by default, so the same fixture exercises the seam. Visibility is opt-in: the host sees the unit only when
 * `hostSeesUnit`, and the rival has explored the host city only when `intruderKnowsHostCity`.
 */
export const BORDER_WIDTH = 20;
export const HOST = 'host';
export const INTRUDER = 'rival';
export const HOST_CITY_POSITION = { q: 0, r: 2 };
export const INTRUDER_CITY_POSITION = { q: 15, r: 5 };
export const INTRUDER_UNIT_POSITION = { q: 1, r: 2 };
export const FAR_SPOT = { q: 10, r: 5 };

export interface BorderFixtureOptions {
  unitAt?: { q: number; r: number };
  unitType?: UnitType;
  wraps?: boolean;
  /** The host currently sees the intruding unit. */
  hostSeesUnit?: boolean;
  /** The intruder has explored the host's city. */
  intruderKnowsHostCity?: boolean;
  hostRelationship?: number;
  intruderRelationship?: number;
  /** Defaults to 20 x 6; a tiny map lets a test make the whole world part of the disputed radius. */
  mapWidth?: number;
  mapHeight?: number;
}

function tile(coord: { q: number; r: number }): HexTile {
  return {
    coord,
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  } as HexTile;
}

export function makeBorderConfrontationState(options: BorderFixtureOptions = {}): GameState {
  const wraps = options.wraps ?? true;
  const unitAt = options.unitAt ?? INTRUDER_UNIT_POSITION;
  const width = options.mapWidth ?? BORDER_WIDTH;
  const height = options.mapHeight ?? 6;
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) tiles[`${q},${r}`] = tile({ q, r });
  }
  const map = { width, height, tiles, wrapsHorizontally: wraps, rivers: [] } as GameMap;
  const ids = [HOST, INTRUDER];
  const civ = (id: string, cities: string[], units: string[], relationship: number) => ({
    id,
    name: id,
    color: '#888',
    cities,
    units,
    gold: 50,
    isHuman: false,
    knownCivilizations: [ids.find(other => other !== id)!],
    techState: { completed: [] },
    visibility: { tiles: {}, lastSeen: {} },
    diplomacy: {
      ...createDiplomacyState(ids, id),
      relationships: { [ids.find(other => other !== id)!]: relationship },
    },
  });

  const hostCity = {
    id: 'host-city',
    name: 'Host City',
    owner: HOST,
    position: HOST_CITY_POSITION,
    ownedTiles: [],
    workedTiles: [],
  } as unknown as City;
  const intruderCity = {
    id: 'rival-city',
    name: 'Rival City',
    owner: INTRUDER,
    position: INTRUDER_CITY_POSITION,
    ownedTiles: [],
    workedTiles: [],
  } as unknown as City;
  const unit = {
    id: 'rival-unit',
    owner: INTRUDER,
    type: options.unitType ?? 'warrior',
    position: unitAt,
    health: 100,
    experience: 0,
    movement: 2,
    movementPointsLeft: 2,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  } as Unit;

  const state = {
    turn: 10,
    gameId: 'border-confrontation-fixture',
    idCounters: { nextWarId: 1 },
    map,
    civilizations: {
      [HOST]: civ(HOST, [hostCity.id], [], options.hostRelationship ?? 0),
      [INTRUDER]: civ(INTRUDER, [intruderCity.id], [unit.id], options.intruderRelationship ?? 0),
    },
    cities: { [hostCity.id]: hostCity, [intruderCity.id]: intruderCity },
    units: { [unit.id]: unit },
    pendingDiplomacyRequests: [],
    borderConfrontations: [],
  } as unknown as GameState;

  if (options.hostSeesUnit ?? true) {
    state.civilizations[HOST].visibility.tiles[hexKey(unitAt)] = 'visible';
  }
  state.civilizations[HOST].visibility.tiles[hexKey(HOST_CITY_POSITION)] = 'visible';
  if (options.intruderKnowsHostCity ?? true) {
    state.civilizations[INTRUDER].visibility.tiles[hexKey(HOST_CITY_POSITION)] = 'fog';
  }
  return state;
}

export function addBorderUnit(
  state: GameState,
  owner: string,
  type: UnitType,
  position: { q: number; r: number },
  id: string,
): Unit {
  const unit = {
    id,
    owner,
    type,
    position,
    health: 100,
    experience: 0,
    movement: 2,
    movementPointsLeft: 2,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  } as Unit;
  state.units[id] = unit;
  state.civilizations[owner].units.push(id);
  return unit;
}
