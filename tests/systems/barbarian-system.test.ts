import {
  spawnBarbarianCamp,
  processBarbarians,
  processPurposefulBarbarians,
  getBarbarianRosterForEra,
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

  it('rejects a candidate that is only far by raw distance but adjacent across the wrap seam (issue #520)', () => {
    const wrapMap = generateMap(30, 12, 'barb-wrap-placement');
    wrapMap.wrapsHorizontally = true;
    for (const tile of Object.values(wrapMap.tiles)) {
      tile.terrain = 'ocean';
    }
    wrapMap.tiles['29,5'].terrain = 'grassland';
    const cityPos = { q: 0, r: 5 };

    const camp = spawnBarbarianCamp(wrapMap, [cityPos], [], 12345, mkC());

    expect(camp).toBeNull();
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

  it('records the killer civ on a Hunt crisis (MR3) when its bandit camp is destroyed', () => {
    const state = createNewGame('egypt', 'hunt-camp-attribution', 'small');
    state.barbarianCamps['camp-1'] = {
      id: 'camp-1', position: { q: 4, r: 4 }, strength: 5, spawnCooldown: 0, banditLordName: 'Test Lord',
    };
    state.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'bandit-uprising', archetype: 'hunt', targetCivId: 'ai-1',
        cityIds: [], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 1,
        huntEntityId: 'camp-1', foeName: 'Test Lord',
      },
    };

    const result = applyCampDestruction(state, 'player', 'camp-1', state.turn);

    expect(result.state.activeCrises!['crisis-1'].lastHuntKillerCivId).toBe('player');
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

describe('processPurposefulBarbarians', () => {
  function purposefulState() {
    const state = createNewGame(undefined, 'purposeful-barbarians', 'small');
    for (const tile of Object.values(state.map.tiles)) {
      tile.terrain = 'plains';
      tile.elevation = 'lowland';
      tile.resource = null;
      tile.improvement = 'none';
      tile.improvementTurnsLeft = 0;
    }
    state.barbarianCamps = {
      'camp-a': {
        id: 'camp-a',
        position: { q: 5, r: 5 },
        strength: 6,
        spawnCooldown: 4,
      },
    };
    state.units = {};
    state.cities = {};
    state.civilizations.player.cities = [];
    state.civilizations.player.units = [];
    state.opponentAI = undefined;
    return state;
  }

  it('adopts a nearby raider and prefers an exposed worker over a farther city', () => {
    const state = purposefulState();
    const raider = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, state.idCounters);
    raider.id = 'raider';
    const worker = createUnit('worker', 'player', { q: 7, r: 5 }, state.idCounters);
    worker.id = 'worker';
    state.units = { raider, worker };
    state.civilizations.player.units = [worker.id];
    state.cities.far = {
      id: 'far',
      owner: 'player',
      position: { q: 10, r: 5 },
      hp: 30,
    } as never;
    state.civilizations.player.cities = ['far'];

    const first = processPurposefulBarbarians(state);
    expect(first.opponentAI.barbarianHomeCampByUnitId.raider).toBe('camp-a');
    expect(first.opponentAI.barbarianCamps['camp-a']).toMatchObject({
      objective: 'raid',
      target: { kind: 'unit', id: 'worker' },
    });

    const persisted = processPurposefulBarbarians({
      ...state,
      opponentAI: first.opponentAI,
      turn: state.turn + 1,
    });
    expect(persisted.opponentAI.barbarianCamps['camp-a'].target).toMatchObject({
      kind: 'unit',
      id: 'worker',
    });
  });

  it('preempts raids to defend a camp and never senses beyond radius seven', () => {
    const state = purposefulState();
    const raider = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, state.idCounters);
    raider.id = 'raider';
    const defender = createUnit('warrior', 'player', { q: 8, r: 5 }, state.idCounters);
    defender.id = 'camp-threat';
    const unseenWorker = createUnit('worker', 'player', { q: 14, r: 5 }, state.idCounters);
    unseenWorker.id = 'unseen-worker';
    state.units = { raider, defender, unseenWorker };
    state.civilizations.player.units = [defender.id, unseenWorker.id];

    const result = processPurposefulBarbarians(state);

    expect(result.opponentAI.barbarianCamps['camp-a']).toMatchObject({
      objective: 'defend',
      target: { kind: 'unit', id: 'camp-threat' },
    });
    expect(JSON.stringify(result.opponentAI)).not.toContain('unseen-worker');
  });

  it('uses the final roster band beyond its declared maximum era', () => {
    expect(getBarbarianRosterForEra(12)).toEqual({
      maxEra: 11,
      melee: ['tank', 'rifleman'],
      ranged: ['machine_gunner'],
    });
  });

  it('withdraws a surviving raider after its persisted target is removed', () => {
    const state = purposefulState();
    const raider = createUnit('warrior', 'barbarian', { q: 7, r: 5 }, state.idCounters);
    raider.id = 'raider';
    const worker = createUnit('worker', 'player', { q: 9, r: 5 }, state.idCounters);
    worker.id = 'worker';
    state.units = { raider, worker };
    state.civilizations.player.units = [worker.id];
    const planned = processPurposefulBarbarians(state);
    delete state.units.worker;
    state.civilizations.player.units = [];

    const result = processPurposefulBarbarians({
      ...state,
      turn: state.turn + 1,
      opponentAI: planned.opponentAI,
    });

    expect(result.opponentAI.barbarianCamps['camp-a'].phase).toBe('withdrawing');
    expect(result.moveOrders).toContainEqual({
      unitId: raider.id,
      toCoord: { q: 6, r: 5 },
    });
  });

  it('attacks an undefended city normally when adjacent (garrison regression)', () => {
    const state = purposefulState();
    // Camp stays at (5,5); raider starts far enough from it that a garrison at the
    // city (far from the camp) can't be mistaken for a camp-defense threat.
    const raider = createUnit('warrior', 'barbarian', { q: 11, r: 5 }, state.idCounters);
    raider.id = 'raider';
    state.units = { raider };
    state.cities.town = {
      id: 'town', owner: 'player', position: { q: 12, r: 5 }, hp: 30,
    } as never;
    state.civilizations.player.cities = ['town'];

    const result = processPurposefulBarbarians(state);

    expect(result.cityAttackOrders).toHaveLength(1);
    expect(result.cityAttackOrders[0]).toMatchObject({ attackerUnitId: 'raider', cityId: 'town' });
    expect(result.attackOrders).toHaveLength(0);
  });

  it('attacks the garrison unit instead of damaging the city when one is present (#522)', () => {
    const state = purposefulState();
    const raider = createUnit('warrior', 'barbarian', { q: 11, r: 5 }, state.idCounters);
    raider.id = 'raider';
    const garrison = createUnit('warrior', 'player', { q: 12, r: 5 }, state.idCounters);
    garrison.id = 'garrison';
    state.units = { raider, garrison };
    state.cities.town = {
      id: 'town', owner: 'player', position: { q: 12, r: 5 }, hp: 30,
    } as never;
    state.civilizations.player.cities = ['town'];
    state.civilizations.player.units = ['garrison'];

    const result = processPurposefulBarbarians(state);

    expect(result.cityAttackOrders).toHaveLength(0);
    expect(result.attackOrders).toHaveLength(1);
    expect(result.attackOrders[0]).toMatchObject({ attackerUnitId: 'raider', defenderUnitId: 'garrison' });
  });

  it('does not let a high-era raider threaten an adjacent civilization that has not reached its roster tier', () => {
    const state = purposefulState();
    state.era = 11;
    const raider = createUnit('tank', 'barbarian', { q: 11, r: 5 }, state.idCounters);
    raider.id = 'late-raider';
    state.units = { [raider.id]: raider };
    state.cities.town = {
      id: 'town', owner: 'player', position: { q: 12, r: 5 }, hp: 30,
    } as never;
    state.civilizations.player.cities = ['town'];
    state.civilizations.player.techState.completed = [];

    const result = processPurposefulBarbarians(state);

    expect(result.attackOrders).toHaveLength(0);
    expect(result.cityAttackOrders).toHaveLength(0);
    expect(result.moveOrders).toHaveLength(0);
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

  it('does not evolve a camp that is only far from a city by raw distance, adjacent across the wrap seam (issue #520)', () => {
    const state = createNewGame(undefined, 'evolve-wrap', 'small');
    state.map.wrapsHorizontally = true;
    const width = state.map.width;
    state.units = {};
    state.cities = { 'city-wrap': { id: 'city-wrap', position: { q: 0, r: 5 } } as never };
    state.barbarianCamps = {};
    state.barbarianCamps['camp-wrap'] = {
      id: 'camp-wrap',
      position: { q: width - 1, r: 5 },
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
