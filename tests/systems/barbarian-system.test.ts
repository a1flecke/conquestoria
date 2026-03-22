import {
  spawnBarbarianCamp,
  processBarbarians,
  destroyCamp,
} from '@/systems/barbarian-system';
import type { GameMap, BarbarianCamp } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey, hexDistance } from '@/systems/hex-utils';

describe('spawnBarbarianCamp', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'barb-test');
  });

  it('creates a camp on a valid land tile', () => {
    const camp = spawnBarbarianCamp(map, [], []);
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
    const camp = spawnBarbarianCamp(map, cityPositions, []);
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
});

describe('processBarbarians', () => {
  it('decrements spawn cooldown', () => {
    const camp: BarbarianCamp = {
      id: 'camp-1', position: { q: 10, r: 10 },
      strength: 5, spawnCooldown: 3,
    };
    const result = processBarbarians([camp], generateMap(30, 30, 'barb-proc'), []);
    expect(result.updatedCamps[0].spawnCooldown).toBe(2);
  });
});
