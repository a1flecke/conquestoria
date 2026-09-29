import type { GameMap, GameState, Treaty, TreatyType, Unit, UnitType } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { createUnit } from '@/systems/unit-system';

/**
 * #871 fixture: a flat grassland board where three civs stand in a row.
 *
 *   q:   0 1 2 | 3 4 5 | 6 7 8 9
 *        home    rival   far-side (unclaimed)
 *
 * `player` owns columns 0-2, `rival` owns 3-5, columns 6+ are unclaimed. The rival's land spans
 * every row, so reaching the far side means crossing it -- there is no way around. `third` is a
 * bystander that owns nothing (used to prove relations are pairwise, never global).
 * Every tile is visible to `player` unless a test overrides it.
 */
export const RIVAL_COLUMNS = [3, 4, 5] as const;
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 3;

export interface TerritorialWorld {
  state: GameState;
  /** Unit ids by role name, in the order created. */
  units: Record<string, string>;
}

function grassland(width: number, height: number): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      const owner = q <= 2 ? 'player' : (RIVAL_COLUMNS as readonly number[]).includes(q) ? 'rival' : null;
      tiles[hexKey({ q, r })] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
      };
    }
  }
  return { width, height, wrapsHorizontally: false, tiles, rivers: [] };
}

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

export function makeTerritorialWorld(): TerritorialWorld {
  const map = grassland(BOARD_WIDTH, BOARD_HEIGHT);
  const ids = ['player', 'rival', 'third'];
  const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(key => [key, 'visible' as const])) };
  const civ = (id: string) => ({
    id, name: id, color: '#888', isHuman: id === 'player', civType: 'generic',
    cities: [] as string[], units: [] as string[],
    techState: { completed: [] as string[], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} },
    gold: 0, visibility, knownCivilizations: ids.filter(other => other !== id), score: 0,
    diplomacy: createDiplomacyState(ids, id),
  });
  const state = {
    turn: 10, era: 1, gameId: 'territorial-access', currentPlayer: 'player', gameOver: false, winner: null, map,
    units: {}, cities: {},
    civilizations: { player: civ('player'), rival: civ('rival'), third: civ('third') },
    barbarianCamps: {}, minorCivs: {}, tribalVillages: {}, defensiveLeagues: [],
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
  } as unknown as GameState;
  return { state, units: {} };
}

/** Add a unit for `owner` at `(q, r)` with a full movement budget; returns its id. */
export function addUnit(
  world: TerritorialWorld,
  role: string,
  type: UnitType,
  owner: string,
  q: number,
  r: number,
  movementPoints = 12,
): string {
  const unit: Unit = createUnit(type, owner, { q, r }, counters());
  // Deterministic, collision-free ids across calls in one world.
  const id = `unit-${role}`;
  const placed: Unit = { ...unit, id, movementPointsLeft: movementPoints };
  world.state.units[id] = placed;
  const civ = world.state.civilizations[owner];
  if (civ) civ.units = [...civ.units, id];
  world.units[role] = id;
  return id;
}

/** Record `type` between two civs on BOTH sides (as `commitTreatyAgreement` would). */
export function signBoth(world: TerritorialWorld, a: string, b: string, type: TreatyType): void {
  const treaty = (self: string, other: string): Treaty => ({ type, civA: self, civB: other, turnsRemaining: -1 });
  const civA = world.state.civilizations[a]!;
  const civB = world.state.civilizations[b]!;
  civA.diplomacy = { ...civA.diplomacy, treaties: [...civA.diplomacy.treaties, treaty(a, b)] };
  civB.diplomacy = { ...civB.diplomacy, treaties: [...civB.diplomacy.treaties, treaty(b, a)] };
}

export function removeBoth(world: TerritorialWorld, a: string, b: string, type: TreatyType): void {
  for (const id of [a, b]) {
    const civ = world.state.civilizations[id]!;
    civ.diplomacy = { ...civ.diplomacy, treaties: civ.diplomacy.treaties.filter(t => t.type !== type) };
  }
}

/** Bilateral war, written directly (the canonical transition lives in diplomacy-war). */
export function setWar(world: TerritorialWorld, a: string, b: string): void {
  const civA = world.state.civilizations[a]!;
  const civB = world.state.civilizations[b]!;
  civA.diplomacy = { ...civA.diplomacy, atWarWith: [...civA.diplomacy.atWarWith, b] };
  civB.diplomacy = { ...civB.diplomacy, atWarWith: [...civB.diplomacy.atWarWith, a] };
}

/** `vassal` becomes `overlord`'s vassal, reciprocally. */
export function setVassal(world: TerritorialWorld, vassal: string, overlord: string): void {
  const v = world.state.civilizations[vassal]!;
  const o = world.state.civilizations[overlord]!;
  v.diplomacy = { ...v.diplomacy, vassalage: { ...v.diplomacy.vassalage, overlord } };
  o.diplomacy = { ...o.diplomacy, vassalage: { ...o.diplomacy.vassalage, vassals: [...o.diplomacy.vassalage.vassals, vassal] } };
}

export const asPlayer = { actor: 'player', civId: 'player' } as const;
