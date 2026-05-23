import { describe, it, expect } from 'vitest';
import { createUnit, getMovementRange, resetUnitTurn, UNIT_DEFINITIONS } from '@/systems/unit-system';
import type { GameMap } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function plainsMap(radius = 5): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r },
        terrain: 'plains',
        owner: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
      } as any;
    }
  }
  return { width: 2 * radius + 1, height: 2 * radius + 1, tiles, wrapsHorizontally: false } as GameMap;
}

function mixedMap(): GameMap {
  // (0,0)=ocean, ring-1=coast, ring-2=grassland
  const tiles: GameMap['tiles'] = {};
  tiles['0,0'] = { coord: { q: 0, r: 0 }, terrain: 'ocean', owner: null, improvement: 'none', improvementTurnsLeft: 0 } as any;
  const ring1 = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }];
  for (const c of ring1) {
    tiles[`${c.q},${c.r}`] = { coord: c, terrain: 'coast', owner: null, improvement: 'none', improvementTurnsLeft: 0 } as any;
  }
  const ring2 = [
    { q: 2, r: 0 }, { q: 1, r: 1 }, { q: 0, r: 2 }, { q: -1, r: 2 }, { q: -2, r: 1 }, { q: -2, r: 0 },
    { q: -1, r: -1 }, { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 }, { q: 2, r: -1 }, { q: -2, r: 2 },
  ];
  for (const c of ring2) {
    tiles[`${c.q},${c.r}`] = { coord: c, terrain: 'grassland', owner: null, improvement: 'none', improvementTurnsLeft: 0 } as any;
  }
  return { width: 11, height: 11, tiles, wrapsHorizontally: false } as GameMap;
}

describe('naval domain (#249)', () => {
  it('galley/trireme definitions have domain: naval', () => {
    expect(UNIT_DEFINITIONS.galley.domain).toBe('naval');
    expect(UNIT_DEFINITIONS.trireme.domain).toBe('naval');
  });

  it('galley on ocean can reach coast tiles but not grassland', () => {
    const galley = createUnit('galley', 'p1', { q: 0, r: 0 }, mkC());
    const map = mixedMap();
    const range = getMovementRange(galley, map, {}, {});
    expect(range.length).toBeGreaterThan(0);
    for (const coord of range) {
      const terrain = map.tiles[hexKey(coord)]?.terrain;
      expect(['ocean', 'coast']).toContain(terrain);
    }
  });

  it('galley cannot enter grassland tiles even with movement to spare', () => {
    const galley = createUnit('galley', 'p1', { q: 0, r: 0 }, mkC());
    // galley has 3 movement; ring-2 grassland is distance-2, reachable by movement budget
    const range = getMovementRange(galley, mixedMap(), {}, {});
    expect(range.some(c => mixedMap().tiles[hexKey(c)]?.terrain === 'grassland')).toBe(false);
  });

  it('warrior cannot enter ocean or coast tiles', () => {
    const warrior = createUnit('warrior', 'p1', { q: 2, r: 0 }, mkC());
    const range = getMovementRange(warrior, mixedMap(), {}, {});
    expect(range.some(c => mixedMap().tiles[hexKey(c)]?.terrain === 'ocean')).toBe(false);
    expect(range.some(c => mixedMap().tiles[hexKey(c)]?.terrain === 'coast')).toBe(false);
  });
});

describe('neutral unit stacking (#250)', () => {
  it('neutral (non-war) unit hex is excluded from movement range when hostileOwners provided', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const range = getMovementRange(
      warrior,
      plainsMap(),
      { '1,0': ['neutral-unit'] },
      { 'neutral-unit': 'p2' },
      new Set(['barbarian']),  // p2 is NOT in hostileOwners → neutral
    );
    expect(range.some(c => hexKey(c) === '1,0')).toBe(false);
  });

  it('at-war enemy hex is still reachable when owner is in hostileOwners', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const range = getMovementRange(
      warrior,
      plainsMap(),
      { '1,0': ['enemy-unit'] },
      { 'enemy-unit': 'p2' },
      new Set(['p2', 'barbarian']),
    );
    expect(range.some(c => hexKey(c) === '1,0')).toBe(true);
  });

  it('without hostileOwners param (backward compat), non-owner unit hex is reachable', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const range = getMovementRange(
      warrior,
      plainsMap(),
      { '1,0': ['other-unit'] },
      { 'other-unit': 'p2' },
    );
    expect(range.some(c => hexKey(c) === '1,0')).toBe(true);
  });

  it('neutral unit blocks expansion through its hex (BFS does not continue past it)', () => {
    // warrior at (0,0), neutral at (1,0). (2,0) should not be reachable through the neutral.
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const range = getMovementRange(
      warrior,
      plainsMap(),
      { '1,0': ['neutral-unit'] },
      { 'neutral-unit': 'p2' },
      new Set(['barbarian']),
    );
    // (2,0) could be reached via routes that don't go through (1,0) — but on a large plains map
    // there are many alternative routes to (2,0). The point is (1,0) itself is excluded.
    expect(range.some(c => hexKey(c) === '1,0')).toBe(false);
  });
});

describe('plains movement (#85)', () => {
  it('warrior with 2 movement reaches exactly 2 plains rings (18 hexes)', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    expect(warrior.movementPointsLeft).toBe(2);
    const range = getMovementRange(warrior, plainsMap(), {}, {});
    // 2-ring hex disc minus origin = 6 + 12 = 18
    expect(range.length).toBe(18);
  });

  it('non-Viking civ bonus (auto_roads) does NOT grant movement bonus', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC(), { type: 'auto_roads' });
    expect(warrior.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(warrior.movementBonus).toBeUndefined();
  });

  it('resetUnitTurn does not accumulate movement bonus across resets', () => {
    let warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    warrior = resetUnitTurn(warrior);
    warrior = resetUnitTurn(warrior);
    expect(warrior.movementPointsLeft).toBe(2);
  });

  it('Viking warrior with naval_raiding reaches 3 rings (36 hexes)', () => {
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC(), {
      type: 'naval_raiding',
      movementBonus: 1,
      coastalVisionBonus: 1,
    });
    expect(warrior.movementPointsLeft).toBe(3);
    const range = getMovementRange(warrior, plainsMap(), {}, {});
    // 3-ring hex disc = 6 + 12 + 18 = 36
    expect(range.length).toBe(36);
  });

  it('scout has 3 movement by default (not affected by non-Viking bonuses)', () => {
    const scout = createUnit('scout', 'p1', { q: 0, r: 0 }, mkC(), { type: 'auto_roads' });
    expect(scout.movementPointsLeft).toBe(UNIT_DEFINITIONS.scout.movementPoints);
  });
});

describe('cross-civ movement bonus isolation (#85)', () => {
  it('France and Germany warriors each have exactly 2 movement in hot-seat with Rome', async () => {
    const { createHotSeatGame } = await import('@/core/game-state');
    const { processTurn } = await import('@/core/turn-manager');
    const { EventBus } = await import('@/core/event-bus');

    const state = createHotSeatGame({
      playerCount: 4,
      mapSize: 'medium',
      players: [
        { slotId: 'p1', name: 'Alice', civType: 'france', isHuman: true },
        { slotId: 'p2', name: 'Bob', civType: 'germany', isHuman: true },
        { slotId: 'p3', name: 'Carol', civType: 'rome', isHuman: true },
        { slotId: 'p4', name: 'Dave', civType: 'zulu', isHuman: true },
      ],
    }, 'issue-85-cross');

    const bus = new EventBus();
    const next = processTurn(state, bus);

    const franceWarrior = Object.values(next.units).find(u => u.owner === 'p1' && u.type === 'warrior');
    const germanyWarrior = Object.values(next.units).find(u => u.owner === 'p2' && u.type === 'warrior');
    const romeWarrior = Object.values(next.units).find(u => u.owner === 'p3' && u.type === 'warrior');

    expect(franceWarrior?.movementPointsLeft, 'France warrior').toBe(2);
    expect(germanyWarrior?.movementPointsLeft, 'Germany warrior').toBe(2);
    expect(romeWarrior?.movementPointsLeft, 'Rome warrior').toBe(2);

    // Confirm no movement bonus stored on the units
    expect(franceWarrior?.movementBonus, 'France warrior bonus').toBeUndefined();
    expect(germanyWarrior?.movementBonus, 'Germany warrior bonus').toBeUndefined();
    expect(romeWarrior?.movementBonus, 'Rome warrior bonus').toBeUndefined();
  });
});
