import { describe, it, expect } from 'vitest';
import { getVisibility } from '@/systems/fog-of-war';
import { createNewGame } from '@/core/game-state';

describe('fog-of-war info leak', () => {
  it('unexplored tiles exist on a new game map', () => {
    const state = createNewGame(undefined, 'fog-test');
    const vis = state.civilizations.player.visibility;
    const unexploredTile = Object.values(state.map.tiles).find(
      t => getVisibility(vis, t.coord) === 'unexplored',
    );
    expect(unexploredTile).toBeDefined();
    expect(getVisibility(vis, unexploredTile!.coord)).toBe('unexplored');
  });

  it('visible tiles have full visibility state', () => {
    const state = createNewGame(undefined, 'fog-test');
    const vis = state.civilizations.player.visibility;
    const visibleTile = Object.values(state.map.tiles).find(
      t => getVisibility(vis, t.coord) === 'visible',
    );
    expect(visibleTile).toBeDefined();
    expect(getVisibility(vis, visibleTile!.coord)).toBe('visible');
  });
});
