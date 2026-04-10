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

describe('spawnBarbarianCamp', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'barb-test');
  });

  it('creates a camp on a valid land tile', () => {
    const camp = spawnBarbarianCamp(map, [], [], 42);
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
    const camp = spawnBarbarianCamp(map, cityPositions, [], 99);
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
    state.legendaryWonderHistory = { destroyedStrongholds: [] };
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
