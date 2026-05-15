import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createLastSeenTilePresentation, refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';

describe('last-seen-presentation', () => {
  it('captures serializable tile presentation for visible tiles', () => {
    const state = createNewGame(undefined, 'last-seen-visible', 'small');
    const tile = state.map.tiles['0,0'];
    tile.terrain = 'forest';
    tile.elevation = 'highland';
    tile.resource = 'deer';
    tile.owner = 'player';
    tile.improvement = 'farm';
    tile.improvementTurnsLeft = 0;

    const snapshot = createLastSeenTilePresentation(state, 'player', tile);

    expect(snapshot).toMatchObject({
      coord: tile.coord,
      terrain: 'forest',
      elevation: 'highland',
      resource: 'deer',
      owner: 'player',
      improvement: 'farm',
      improvementTurnsLeft: 0,
      hasRiver: tile.hasRiver,
      wonder: tile.wonder,
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('updates only currently visible tiles for the viewer', () => {
    const state = createNewGame(undefined, 'last-seen-refresh', 'small');
    state.civilizations.player.visibility.tiles = { '0,0': 'visible', '1,0': 'fog' };
    state.map.tiles['0,0'].terrain = 'forest';
    state.map.tiles['1,0'].terrain = 'desert';

    refreshLastSeenPresentationsForCiv(state, 'player');

    expect(state.civilizations.player.visibility.lastSeen?.['0,0']?.terrain).toBe('forest');
    expect(state.civilizations.player.visibility.lastSeen?.['1,0']).toBeUndefined();
  });

  it('keeps hot-seat viewers separate', () => {
    const state = createNewGame(undefined, 'last-seen-hotseat', 'small');
    state.civilizations.player.visibility.tiles = { '0,0': 'visible' };
    state.civilizations['ai-1'].visibility.tiles = { '0,0': 'fog' };

    refreshLastSeenPresentationsForCiv(state, 'player');

    expect(state.civilizations.player.visibility.lastSeen?.['0,0']).toBeDefined();
    expect(state.civilizations['ai-1'].visibility.lastSeen?.['0,0']).toBeUndefined();
  });

  it('does not update fogged city presentation from live city changes', () => {
    const state = createNewGame(undefined, 'last-seen-city', 'small');
    state.cities.enemyCity = {
      id: 'enemyCity',
      name: 'Old City',
      owner: 'ai-1',
      position: { q: 0, r: 0 },
      population: 2,
      buildings: [],
      productionQueue: ['warrior'],
      productionProgress: 0,
      food: 0,
      foodNeeded: 10,
      workedTiles: [],
      ownedTiles: [{ q: 0, r: 0 }],
      focus: 'balanced',
      maturity: 'outpost',
      grid: [],
      gridSize: 3,
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };
    state.civilizations.player.visibility.tiles = { '0,0': 'visible' };
    refreshLastSeenPresentationsForCiv(state, 'player');

    state.civilizations.player.visibility.tiles = { '0,0': 'fog' };
    state.cities.enemyCity = { ...state.cities.enemyCity, name: 'Live City', owner: 'player', population: 9 };
    refreshLastSeenPresentationsForCiv(state, 'player');

    expect(state.civilizations.player.visibility.lastSeen?.['0,0']?.city).toEqual({
      id: 'enemyCity',
      name: 'Old City',
      owner: 'ai-1',
      population: 2,
    });
  });
});
