import {
  spawnBarbarianCamp,
  processBarbarians,
  destroyCamp,
  applyCampDestruction,
} from '@/systems/barbarian-system';
import type { GameMap, BarbarianCamp } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey, hexDistance } from '@/systems/hex-utils';
import { checkCampEvolution } from '@/systems/minor-civ-system';
import { createNewGame } from '@/core/game-state';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { createUnit } from '@/systems/unit-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('spawnBarbarianCamp', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'barb-test');
  });

  it('creates a camp on a valid land tile', () => {
    const camp = spawnBarbarianCamp(map, [], [], 42, mkC());
    expect(camp).not.toBeNull();
    if (camp) {
      const tile = map.tiles[hexKey(camp.position)];
      expect(tile).toBeDefined();
      expect(tile.terrain).not.toBe('ocean');
      expect(tile.terrain).not.toBe('mountain');
    }
  });

  it('avoids spawning near cities', () => {
    const cityPositions = [{ q: 15, r: 15 }];
    const camp = spawnBarbarianCamp(map, cityPositions, [], 99, mkC());
    if (camp) {
      const dist = hexDistance(camp.position, { q: 15, r: 15 });
      expect(dist).toBeGreaterThan(5);
    }
  });
});

describe('destroyCamp', () => {
  it('returns gold reward', () => {
    const camp: BarbarianCamp = {
      id: 'camp-1', position: { q: 10, r: 10 },
      strength: 5, spawnCooldown: 3,
    };
    const reward = destroyCamp(camp);
    expect(reward).toBeGreaterThan(0);
  });

  it('records the destroying civ and camp position when a barbarian camp falls', () => {
    const state = createNewGame('egypt', 'wonder-history');
    state.legendaryWonderHistory = { destroyedStrongholds: [], discoveredSites: [] };
    state.barbarianCamps = {
      'camp-1': {
        id: 'camp-1',
        position: { q: 4, r: 4 },
        strength: 5,
        spawnCooldown: 0,
      },
    };

    const result = applyCampDestruction(state, 'player', 'camp-1', 25);

    expect(result.state.legendaryWonderHistory?.destroyedStrongholds).toContainEqual({
      civId: 'player',
      campId: 'camp-1',
      position: { q: 4, r: 4 },
      turn: 25,
    });
    expect(result.state.barbarianCamps['camp-1']).toBeUndefined();
    expect(result.reward).toBeGreaterThan(0);
  });

  it('completes the matching camp quest at the destruction source', () => {
    const state = createNewGame('egypt', 'camp-quest-source', 'small');
    const minorCivId = Object.keys(state.minorCivs)[0];
    state.barbarianCamps['camp-1'] = {
      id: 'camp-1', position: { q: 4, r: 4 }, strength: 5, spawnCooldown: 0,
    };
    state.minorCivs[minorCivId].activeQuests.player = {
      id: 'quest-camp', type: 'destroy_camp', description: 'Destroy the camp',
      target: { type: 'destroy_camp', campId: 'camp-1', position: { q: 4, r: 4 } }, reward: { relationshipBonus: 10 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
    };

    const result = applyCampDestruction(state, 'player', 'camp-1', state.turn);

    expect(result.questTransitions.some(transition => transition.type === 'completed')).toBe(true);
    expect(result.state.minorCivs[minorCivId].activeQuests.player).toBeUndefined();
  });
});

describe('processBarbarians', () => {
  it('decrements spawn cooldown', () => {
    const camp: BarbarianCamp = {
      id: 'camp-1', position: { q: 10, r: 10 },
      strength: 5, spawnCooldown: 3,
    };
    const result = processBarbarians([camp], generateMap(30, 30, 'barb-proc'), [], 123);
    expect(result.updatedCamps[0].spawnCooldown).toBe(2);
  });

  it('targets a combat defender before a stacked settler', () => {
    const map = generateMap(30, 30, 'barb-stack-target');
    const barbarian = createUnit('warrior', 'barbarian', { q: 10, r: 10 }, mkC());
    barbarian.id = 'barb';
    const settler = createUnit('settler', 'player', { q: 11, r: 10 }, mkC());
    settler.id = 'settler-first';
    const warrior = createUnit('warrior', 'player', { q: 11, r: 10 }, mkC());
    warrior.id = 'warrior-second';

    const result = processBarbarians([], map, [settler, warrior], 42, [barbarian]);

    expect(result.attackOrders).toContainEqual({
      attackerUnitId: 'barb',
      defenderUnitId: 'warrior-second',
    });
  });

  it('does not let barbarian melee units attack non-adjacent targets', () => {
    const map = generateMap(30, 30, 'barb-melee-range');
    const barbarian = createUnit('warrior', 'barbarian', { q: 10, r: 10 }, mkC());
    barbarian.id = 'barb';
    const warrior = createUnit('warrior', 'player', { q: 12, r: 10 }, mkC());
    warrior.id = 'player-warrior';

    const result = processBarbarians([], map, [warrior], 42, [barbarian]);

    expect(result.attackOrders).toHaveLength(0);
  });

  it('uses wrapped distance when barbarian melee units attack across the horizontal edge', () => {
    const map = generateMap(10, 6, 'barb-wrap-range');
    map.wrapsHorizontally = true;
    const barbarian = createUnit('warrior', 'barbarian', { q: 0, r: 2 }, mkC());
    barbarian.id = 'barb';
    const warrior = createUnit('warrior', 'player', { q: 9, r: 2 }, mkC());
    warrior.id = 'player-warrior';

    const result = processBarbarians([], map, [warrior], 42, [barbarian]);

    expect(result.attackOrders).toContainEqual({
      attackerUnitId: 'barb',
      defenderUnitId: 'player-warrior',
    });
  });
});

describe('barbarian camp evolution', () => {
  it('evolves camp at strength 8+', () => {
    const state = createNewGame(undefined, 'evolve-test', 'medium');
    // Clear existing camps so only our test camp is checked
    state.barbarianCamps = {};
    state.barbarianCamps['camp-evolve'] = {
      id: 'camp-evolve',
      position: { q: 25, r: 25 },
      strength: 8,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 50);
    if (result) {
      expect(result.newMinorCiv).toBeDefined();
      expect(result.removeCampId).toBe('camp-evolve');
    }
  });

  it('does not evolve camp below strength 8', () => {
    const state = createNewGame(undefined, 'no-evolve', 'medium');
    // Clear all existing camps so only the weak one is checked
    state.barbarianCamps = {};
    state.barbarianCamps['camp-weak'] = {
      id: 'camp-weak',
      position: { q: 25, r: 25 },
      strength: 5,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 10);
    expect(result).toBeNull();
  });

  it('does not evolve if too close to existing city', () => {
    const state = createNewGame(undefined, 'evolve-dist', 'small');
    // Clear all existing camps
    state.barbarianCamps = {};
    const settler = Object.values(state.units).find(u => u.type === 'settler')!;
    state.barbarianCamps['camp-close'] = {
      id: 'camp-close',
      position: settler.position,
      strength: 10,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 10);
    expect(result).toBeNull();
  });

  it('respects max minor civ cap (all 12 defs used)', () => {
    const state = createNewGame(undefined, 'evolve-cap', 'small');
    // Fill up all 12 definition slots
    for (const def of MINOR_CIV_DEFINITIONS) {
      const fakeId = `mc-${def.id}`;
      state.minorCivs[fakeId] = {
        id: fakeId, definitionId: def.id, cityId: '', units: [],
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [] },
        activeQuests: {}, isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
      } as any;
    }

    state.barbarianCamps['camp-max'] = {
      id: 'camp-max',
      position: { q: 25, r: 25 },
      strength: 10,
      spawnCooldown: 0,
    };

    const result = checkCampEvolution(state, 10);
    expect(result).toBeNull();
  });
});

describe('processBarbarians — city targeting', () => {
  const seed = 99999;

  function flatMap(size = 16): GameMap {
    const tiles: Record<string, any> = {};
    for (let q = 0; q < size; q++) {
      for (let r = 0; r < size; r++) {
        tiles[`${q},${r}`] = {
          coord: { q, r },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          owner: null,
          improvementTurnsLeft: 0,
          hasRiver: false,
          wonder: null,
        };
      }
    }
    return { width: size, height: size, wrapsHorizontally: false, rivers: [], tiles };
  }

  it('produces a cityAttackOrders field even when no cities are provided', () => {
    const map = flatMap();
    const barb = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, mkC());
    const result = processBarbarians([], map, [], seed, [barb]);
    expect(result.cityAttackOrders).toBeDefined();
    expect(result.cityAttackOrders).toHaveLength(0);
  });

  it('issues a city attack order when a barbarian is adjacent to an empty city', () => {
    const map = flatMap();
    const barb = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, mkC());
    const city = { id: 'city-1', position: { q: 6, r: 5 }, owner: 'civ-1' };

    const result = processBarbarians([], map, [], seed, [barb], [city]);

    expect(result.cityAttackOrders).toHaveLength(1);
    expect(result.cityAttackOrders[0].attackerUnitId).toBe(barb.id);
    expect(result.cityAttackOrders[0].cityId).toBe('city-1');
    expect(result.cityAttackOrders[0].damage).toBeGreaterThan(0);
  });

  it('prefers a player unit over an empty city when the unit is in chase range', () => {
    const map = flatMap();
    const barb = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, mkC());
    const playerUnit = createUnit('warrior', 'civ-1', { q: 6, r: 5 }, mkC());
    const city = { id: 'city-1', position: { q: 6, r: 5 }, owner: 'civ-1' };

    const result = processBarbarians([], map, [playerUnit], seed, [barb], [city]);

    expect(result.cityAttackOrders).toHaveLength(0);
    expect(result.attackOrders).toHaveLength(1);
    expect(result.attackOrders[0].attackerUnitId).toBe(barb.id);
  });

  it('moves toward an empty city when not yet adjacent', () => {
    const map = flatMap();
    const barb = createUnit('warrior', 'barbarian', { q: 0, r: 0 }, mkC());
    const city = { id: 'city-1', position: { q: 4, r: 0 }, owner: 'civ-1' };

    const result = processBarbarians([], map, [], seed, [barb], [city]);

    expect(result.cityAttackOrders).toHaveLength(0);
    expect(result.moveOrders.some(o => o.unitId === barb.id)).toBe(true);
  });
});
