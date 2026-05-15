import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { HexCoord, Unit, UnitType } from '@/core/types';
import { canUnitAttackTarget, getAttackTargets, getUnitAttackProfile } from '@/systems/attack-targeting';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

function unit(id: string, type: UnitType, owner: string, position: HexCoord): Unit {
  return { ...createUnit(type, owner, position), id, owner, position };
}

function stateWithUnits(units: Record<string, Unit>, visibility: Record<string, 'visible' | 'fog' | 'unexplored'> = {}) {
  const state = createNewGame(undefined, 'attack-targeting-test', 'small');
  state.units = units;
  state.civilizations.player.units = Object.keys(units).filter(id => units[id].owner === 'player');
  state.civilizations['ai-1'].units = Object.keys(units).filter(id => units[id].owner === 'ai-1');
  state.civilizations.player.visibility.tiles = visibility;
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  return state;
}

describe('attack-targeting', () => {
  it('gives warriors the default melee profile and archers an explicit ranged profile', () => {
    expect(getUnitAttackProfile('warrior')).toEqual({ kind: 'melee', range: 1, targets: ['unit', 'city'] });
    expect(getUnitAttackProfile('archer')).toEqual({ kind: 'ranged', range: 2, targets: ['unit'] });
  });

  it('rejects non-adjacent melee attacks even when the enemy is inside movement range', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });

  it('allows archers to attack visible hostile units at range without moving into the defender hex', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetType: 'unit',
      targetUnitId: 'defender',
      range: 2,
    });
  });

  it('rejects ranged attacks against fogged targets through the player path', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'fog' });

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'not-visible',
    });
  });

  it('rejects unit attacks against major civs that are not at war', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, defender }, { '2,0': 'visible' });
    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'not-hostile',
    });
  });

  it('allows human players to target minor-civ units without making AI treat them as hostile', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 0 });
    const minor = unit('minor-warrior', 'warrior', 'mc-sparta', { q: 1, r: 0 });
    const aiAttacker = unit('ai-attacker', 'warrior', 'ai-1', { q: 2, r: 0 });
    const state = stateWithUnits({ attacker, 'minor-warrior': minor, 'ai-attacker': aiAttacker }, { '1,0': 'visible' });

    expect(canUnitAttackTarget(state, attacker, { q: 1, r: 0 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetType: 'unit',
      targetUnitId: 'minor-warrior',
    });
    expect(canUnitAttackTarget(state, aiAttacker, { q: 1, r: 0 }, { requireVisibility: false })).toEqual({
      ok: false,
      reason: 'not-hostile',
    });
  });

  it('rejects ordinary archer attacks against cities from range', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const state = stateWithUnits({ attacker }, { '2,0': 'visible' });
    state.cities.enemyCity = {
      id: 'enemyCity',
      name: 'Enemy City',
      owner: 'ai-1',
      position: { q: 2, r: 0 },
      population: 4,
      buildings: [],
      productionQueue: [],
      productionProgress: 0,
      food: 0,
      foodNeeded: 10,
      ownedTiles: [{ q: 2, r: 0 }],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      grid: [],
      gridSize: 3,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };

    expect(canUnitAttackTarget(state, attacker, { q: 2, r: 0 }, { viewerId: 'player' })).toEqual({
      ok: false,
      reason: 'unsupported-target',
    });
  });

  it('uses wrapped distance for melee adjacency at the horizontal edge', () => {
    const attacker = unit('attacker', 'warrior', 'player', { q: 0, r: 1 });
    const defender = unit('defender', 'warrior', 'ai-1', { q: 9, r: 1 });
    const state = stateWithUnits({ attacker, defender }, { '9,1': 'visible' });
    state.map.wrapsHorizontally = true;
    state.map.width = 10;

    expect(canUnitAttackTarget(state, attacker, { q: 9, r: 1 }, { viewerId: 'player' })).toMatchObject({
      ok: true,
      targetUnitId: 'defender',
      range: 1,
    });
  });

  it('collects only legal attack target coordinates', () => {
    const attacker = unit('attacker', 'archer', 'player', { q: 0, r: 0 });
    const visibleDefender = unit('visible-defender', 'warrior', 'ai-1', { q: 2, r: 0 });
    const foggedDefender = unit('fogged-defender', 'warrior', 'ai-1', { q: 1, r: 1 });
    const state = stateWithUnits(
      { attacker, 'visible-defender': visibleDefender, 'fogged-defender': foggedDefender },
      { '2,0': 'visible', '1,1': 'fog' },
    );

    expect(getAttackTargets(state, attacker, { viewerId: 'player' }).map(target => hexKey(target.coord))).toEqual(['2,0']);
  });
});
