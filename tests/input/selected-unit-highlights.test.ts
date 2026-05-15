import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

describe('selected-unit-highlights', () => {
  it('does not mark non-adjacent melee targets as attack highlights', () => {
    const state = createNewGame(undefined, 'melee-highlight', 'small');
    state.currentPlayer = 'player';
    state.units = {
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'warrior', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }), id: 'enemy' },
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
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }), id: 'enemy' },
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
      archer: { ...createUnit('archer', 'player', { q: 0, r: 0 }), id: 'archer', movementPointsLeft: 2 },
      enemy: { ...createUnit('warrior', 'ai-1', { q: 2, r: 0 }), id: 'enemy' },
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
      warrior: { ...createUnit('warrior', 'player', { q: 0, r: 0 }), id: 'warrior', movementPointsLeft: 2 },
    };
    state.civilizations.player.units = ['warrior'];
    state.civilizations.player.visibility.tiles = { '1,0': 'visible' };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.cities.enemyCity = {
      ...foundCity('ai-1', { q: 1, r: 0 }, state.map),
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
});
