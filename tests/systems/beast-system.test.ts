import { describe, it, expect } from 'vitest';
import { placeBeastLairs, BEAST_OWNER, LAIR_COUNTS, processBeasts, recordBeastSlain, getBeastHoardGold, isBeastConcealedFrom } from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { generateMap } from '@/systems/map-generator';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { createNewGame } from '@/core/game-state';
import type { BeastLair, Unit } from '@/core/types';

describe('placeBeastLairs', () => {
  const map = generateMap(40, 30, 'beast-test-seed');
  const starts = [{ q: 5, r: 5 }, { q: 30, r: 20 }];

  it('places lairs only on matching habitat terrain, away from starts', () => {
    const lairs = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    for (const lair of Object.values(lairs)) {
      const def = BEAST_DEFINITIONS[lair.beastId];
      const tile = map.tiles[hexKey(lair.position)];
      expect(def.habitatTerrains).toContain(tile.terrain);
      expect(tile.wonder).toBeNull();
      for (const start of starts) {
        expect(hexDistance(lair.position, start)).toBeGreaterThanOrEqual(6);
      }
      expect(lair.status).toBe('dormant');
      expect(lair.unitIds).toEqual([]);
      expect(lair.strength).toBe(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    const b = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    expect(a).toEqual(b);
  });

  it('never places more lairs than the map-size budget', () => {
    const lairs = placeBeastLairs(map, starts, 'small', 'beast-test-seed');
    expect(Object.keys(lairs).length).toBeLessThanOrEqual(LAIR_COUNTS.small);
  });

  it('exports the beasts owner constant', () => {
    expect(BEAST_OWNER).toBe('beasts');
  });
});

// ---- Helpers shared across behavior + slay tests ----

function makeLair(overrides: Partial<BeastLair> = {}): BeastLair {
  return {
    id: 'lair-giant_boar', beastId: 'giant_boar',
    position: { q: 10, r: 10 }, status: 'dormant',
    strength: 0, unitIds: [], ...overrides,
  };
}

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1', type: 'warrior', owner: 'player', position: { q: 12, r: 10 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

function tinyMap(terrainAt: Record<string, string>) {
  const tiles: Record<string, any> = {};
  for (const [key, terrain] of Object.entries(terrainAt)) {
    const [q, r] = key.split(',').map(Number);
    tiles[key] = { coord: { q, r }, terrain, elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
  }
  return { width: 40, height: 30, tiles, wrapsHorizontally: false } as any;
}

const behaviorMap = generateMap(40, 30, 'beast-test-seed');

describe('processBeasts', () => {
  it('awakens a dormant lair once the era requirement is met (seeded chance)', () => {
    let awakened = 0;
    // 10% chance per turn — run 200 seeds to guarantee at least one awakening
    for (let seed = 1; seed <= 200; seed++) {
      const result = processBeasts([makeLair()], behaviorMap, [], [], 1, 'wild', seed);
      if (result.awakenings.length > 0) awakened++;
    }
    expect(awakened).toBeGreaterThan(0);
    expect(awakened).toBeLessThan(200);
  });

  it('never awakens before the awaken era', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const result = processBeasts([makeLair()], behaviorMap, [], [], 0, 'wild', seed);
      expect(result.awakenings).toEqual([]);
    }
  });

  it('does nothing in off mode', () => {
    const result = processBeasts([makeLair()], behaviorMap, [], [], 3, 'off', 7);
    expect(result.awakenings).toEqual([]);
    expect(result.spawnOrders).toEqual([]);
  });

  it('orders an attack when an intruder is adjacent, in wild mode only', () => {
    const lair = makeLair({ status: 'awake', unitIds: ['beast-1'] });
    const beast = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const intruder = makeUnit({ id: 'u1', position: { q: 11, r: 10 } });
    const wild = processBeasts([lair], behaviorMap, [intruder], [beast], 1, 'wild', 7);
    expect(wild.attackOrders).toEqual([{ attackerUnitId: 'beast-1', defenderUnitId: 'u1' }]);
    const calm = processBeasts([lair], behaviorMap, [intruder], [beast], 1, 'calm', 7);
    expect(calm.attackOrders).toEqual([]);
  });

  it('never moves a beast beyond its leash radius', () => {
    // leashRadius = 3; beast at edge (q:13,r:10 is distance 3 from lair at q:10,r:10)
    const lair = makeLair({ status: 'awake', unitIds: ['beast-1'] });
    const beast = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 13, r: 10 } });
    const farIntruder = makeUnit({ id: 'u1', position: { q: 17, r: 10 } });
    const result = processBeasts([lair], behaviorMap, [farIntruder], [beast], 1, 'wild', 7);
    for (const order of result.moveOrders) {
      expect(hexDistance(order.toCoord, lair.position)).toBeLessThanOrEqual(3);
    }
  });
});

// ---- Task 6: slay reward tests ----

describe('recordBeastSlain', () => {
  function stateWithSlainBoar() {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Beast Test');
    const beast: Unit = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const victor: Unit = makeUnit({ id: 'hero-1', owner: state.currentPlayer, health: 40, position: { q: 11, r: 10 } });
    state.units[beast.id] = beast;
    state.units[victor.id] = victor;
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-giant_boar': makeLair({ status: 'awake', unitIds: ['beast-1'] }) },
      sightingsByCiv: {},
    };
    return { state, beast, victor };
  }

  it('marks the lair slain, awards hoard gold, and fully heals the victor', () => {
    const { state, beast, victor } = stateWithSlainBoar();
    const goldBefore = state.civilizations[victor.owner].gold;
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeDefined();
    expect(next.beasts!.lairs['lair-giant_boar'].status).toBe('slain');
    expect(next.beasts!.lairs['lair-giant_boar'].slainBy).toBe(victor.owner);
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore + slain!.goldAwarded);
    expect(next.units['hero-1'].health).toBe(100);
    // immutability: input state untouched
    expect(state.beasts!.lairs['lair-giant_boar'].status).toBe('awake');
  });

  it('returns no slain payload for non-beast defenders', () => {
    const { state, victor } = stateWithSlainBoar();
    const barb = makeUnit({ id: 'barb-1', owner: 'barbarian' });
    expect(recordBeastSlain(state, barb, victor).slain).toBeUndefined();
  });

  it('only marks the lair slain when its last unit dies', () => {
    const { state, beast, victor } = stateWithSlainBoar();
    state.beasts!.lairs['lair-giant_boar'].unitIds = ['beast-1', 'beast-2'];
    const { state: next, slain } = recordBeastSlain(state, beast, victor);
    expect(slain).toBeUndefined();
    expect(next.beasts!.lairs['lair-giant_boar'].status).toBe('awake');
    expect(next.beasts!.lairs['lair-giant_boar'].unitIds).toEqual(['beast-2']);
  });

  it('scales hoard gold with era', () => {
    const def = BEAST_DEFINITIONS.giant_boar;
    expect(getBeastHoardGold(def, 1)).toBe(40);
    expect(getBeastHoardGold(def, 3)).toBeGreaterThan(getBeastHoardGold(def, 1));
  });
});

describe('isBeastConcealedFrom', () => {
  const jungleMap = tinyMap({ '5,5': 'jungle', '6,5': 'grassland', '7,5': 'grassland' });
  const basilisk = makeUnit({ id: 'beast-bas', type: 'beast_basilisk', owner: 'beasts', position: { q: 5, r: 5 } });

  it('conceals a basilisk on jungle when no viewer unit is adjacent', () => {
    const farViewer = makeUnit({ id: 'v1', position: { q: 7, r: 5 } });
    expect(isBeastConcealedFrom(basilisk, jungleMap, [farViewer])).toBe(true);
  });

  it('reveals a basilisk when a viewer unit is adjacent', () => {
    const nearViewer = makeUnit({ id: 'v1', position: { q: 6, r: 5 } });
    expect(isBeastConcealedFrom(basilisk, jungleMap, [nearViewer])).toBe(false);
  });

  it('never conceals a basilisk off its habitat terrain', () => {
    const offHabitat = { ...basilisk, position: { q: 6, r: 5 } };
    expect(isBeastConcealedFrom(offHabitat, jungleMap, [])).toBe(false);
  });

  it('never conceals non-stealth beasts (boar) or non-beasts', () => {
    const boar = makeUnit({ id: 'beast-boar', type: 'beast_boar', owner: 'beasts', position: { q: 5, r: 5 } });
    expect(isBeastConcealedFrom(boar, jungleMap, [])).toBe(false);
    const warrior = makeUnit({ id: 'w1', position: { q: 5, r: 5 } });
    expect(isBeastConcealedFrom(warrior, jungleMap, [])).toBe(false);
  });
});

describe('pack spawning', () => {
  it('spawns up to packSize wolves on awakening, never stacking', () => {
    const map = generateMap(40, 30, 'beast-test-seed');
    const tundraTile = Object.values(map.tiles).find(t => t.terrain === 'tundra');
    if (!tundraTile) return;
    const lair = makeLair({ id: 'lair-dire_wolf', beastId: 'dire_wolf', position: tundraTile.coord });
    for (let seed = 1; seed <= 60; seed++) {
      const result = processBeasts([lair], map, [], [], 1, 'wild', seed);
      if (result.awakenings.length === 0) continue;
      expect(result.spawnOrders.length).toBeGreaterThanOrEqual(1);
      expect(result.spawnOrders.length).toBeLessThanOrEqual(3);
      const keys = result.spawnOrders.map(o => `${o.position.q},${o.position.r}`);
      expect(new Set(keys).size).toBe(keys.length);
      return;
    }
    throw new Error('no seed awakened the wolf lair in 60 tries');
  });
});
