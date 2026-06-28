import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { buildMovePresentationByViewer } from '@/systems/viewer-event-presentation';

describe('viewer event presentation', () => {
  it('captures only event-time contiguous visible movement segments', () => {
    const state = createNewGame(undefined, 'viewer-segments', 'small');
    const unit = Object.values(state.units).find(candidate => candidate.owner !== 'player')!;
    const path = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 4, r: 0 },
    ];
    state.civilizations.player.visibility.tiles = {
      '0,0': 'visible',
      '1,0': 'visible',
      '2,0': 'fog',
      '3,0': 'visible',
      '4,0': 'visible',
    };

    const presentation = buildMovePresentationByViewer(state, unit, path);

    expect(presentation.player.visibleSegments).toEqual([
      [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      [{ q: 3, r: 0 }, { q: 4, r: 0 }],
    ]);
  });

  it('omits a viewer with no event-time visible segment even if fog changes later', () => {
    const state = createNewGame(undefined, 'viewer-hidden', 'small');
    const unit = Object.values(state.units).find(candidate => candidate.owner !== 'player')!;
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    state.civilizations.player.visibility.tiles = { '0,0': 'fog', '1,0': 'fog' };
    const presentation = buildMovePresentationByViewer(state, unit, path);
    state.civilizations.player.visibility.tiles['0,0'] = 'visible';
    state.civilizations.player.visibility.tiles['1,0'] = 'visible';

    expect(presentation.player).toBeUndefined();
  });
});
