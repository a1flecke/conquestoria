import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('selected-unit-highlights', () => {
  it('does not mark non-adjacent melee targets as attack highlights', () => {
    const state = createNewGame(undefined, 'melee-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'warrior', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }, mkC()), id: 'enemy' },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '2,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('2,0');
    expect(result.highlights.filter(h => h.type === 'attack').map(h => hexKey(h.coord))).not.toContain('2,0');
  });

  it('marks visible archer targets as attack and not movement', () => {
    const state = createNewGame(undefined, 'archer-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }, mkC()), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }, mkC()), id: 'enemy' },
    };
    state.civilizations.player.units = ['archer'];
    state.civilizations.player.visibility.tiles = { '2,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = buildSelectedUnitHighlights(state, 'archer');

    expect(result.attackTargets.map(target => hexKey(target.coord))).toContain('2,0');
    expect(result.highlights).toContainEqual({ coord: { q: 2, r: 0 }, type: 'attack' });
    expect(result.highlights.filter(h => h.type === 'move').map(h => hexKey(h.coord))).not.toContain('2,0');
  });

  it('does not highlight fogged archer targets', () => {
    const state = createNewGame(undefined, 'archer-fog-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }, mkC()), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }, mkC()), id: 'enemy' },
    };
    state.civilizations.player.units = ['archer'];
    state.civilizations.player.visibility.tiles = { '2,0': 'fog' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];

    const result = buildSelectedUnitHighlights(state, 'archer');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('2,0');
    expect(result.highlights.filter(h => h.type === 'attack')).toHaveLength(0);
  });

  it('leaves adjacent hostile cities on the city-assault path instead of combat-preview attack targets', () => {
    const state = createNewGame(undefined, 'city-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'warrior', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '1,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.cities.enemyCity = {
      ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()),
      id: 'enemyCity',
      name: 'Enemy City',
      owner: 'ai-1',
      position: { q: 1, r: 0 },
      population: 4,
      ownedTiles: [{ q: 1, r: 0 }],
    };

    const result = buildSelectedUnitHighlights(state, 'warrior');

    expect(result.attackTargets.map(target => hexKey(target.coord))).not.toContain('1,0');
    expect(result.highlights.filter(h => h.type === 'attack').map(h => hexKey(h.coord))).not.toContain('1,0');
  });

  it('adds worker guidance highlights for buildable, owned-blocked, and foreign-blocked movement-preview tiles', () => {
    const state = createNewGame(undefined, 'worker-guidance-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      worker: { ...createUnit('worker', 'player', { q: 0, r: 0 }, mkC()), id: 'worker', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['worker'];
    state.civilizations.player.visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'visible',
      '29,0': 'visible',
      '1,-1': 'visible',
    };
    state.map.tiles['1,0'] = { coord: { q: 1, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, owner: 'player', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    state.map.tiles['29,0'] = { coord: { q: 29, r: 0 }, terrain: 'tundra', elevation: 'lowland', resource: null, owner: 'player', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    state.map.tiles['1,-1'] = { coord: { q: 1, r: -1 }, terrain: 'plains', elevation: 'lowland', resource: null, owner: 'ai-1', improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null };

    const result = buildSelectedUnitHighlights(state, 'worker');

    expect(result.highlights).toContainEqual({ coord: { q: 1, r: 0 }, type: 'worker-buildable' });
    expect(result.highlights).toContainEqual({ coord: { q: 29, r: 0 }, type: 'worker-owned-blocked' });
    expect(result.highlights).toContainEqual({ coord: { q: 1, r: -1 }, type: 'worker-foreign-blocked' });
  });

  it('does not add foreign-blocked worker guidance on unexplored plausible terrain', () => {
    const state = createNewGame(undefined, 'worker-guidance-unexplored-no-leak', 'small');
    state.currentPlayer = 'player';
    state.units = {
      worker: { ...createUnit('worker', 'player', { q: 0, r: 0 }, mkC()), id: 'worker', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['worker'];
    state.civilizations.player.visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'visible',
    };
    state.map.tiles['1,-1'] = {
      coord: { q: 1, r: -1 },
      terrain: 'plains',
      elevation: 'lowland',
      resource: null,
      owner: 'ai-1',
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };

    const result = buildSelectedUnitHighlights(state, 'worker');

    expect(result.highlights).not.toContainEqual({ coord: { q: 1, r: -1 }, type: 'worker-foreign-blocked' });
  });
});
