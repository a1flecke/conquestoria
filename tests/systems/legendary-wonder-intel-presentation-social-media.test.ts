import { describe, expect, it } from 'vitest';
import { getSocialMediaRivalProjectDetails } from '@/systems/legendary-wonder-intel-presentation';
import { getWonderCodexViewModel } from '@/systems/wonder-codex/presentation';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

function withPlayerRacing(state: ReturnType<typeof makeLegendaryWonderFixture>) {
  return {
    ...state,
    legendaryWonderProjects: {
      ...state.legendaryWonderProjects,
      'grand-canal': {
        ...state.legendaryWonderProjects!['grand-canal'],
        phase: 'building' as const,
      },
    },
  };
}

describe('MR6: social-media rival wonder-progress reveal', () => {
  it('reveals rival phase + invested production when the viewer has the tech and is racing the same wonder', () => {
    const state = withPlayerRacing(makeLegendaryWonderFixture({ completedTechs: ['social-media'] }));

    const details = getSocialMediaRivalProjectDetails(state, 'player', 'grand-canal');

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ civId: 'rival', phase: 'building', investedProduction: 90 });
  });

  it('reveals nothing without the tech', () => {
    const state = withPlayerRacing(makeLegendaryWonderFixture({ completedTechs: [] }));

    expect(getSocialMediaRivalProjectDetails(state, 'player', 'grand-canal')).toEqual([]);
  });

  it('reveals nothing for a wonder the viewer is not racing', () => {
    // 'grand-canal' left at its default 'locked' phase for the player — not an active race.
    const state = makeLegendaryWonderFixture({ completedTechs: ['social-media'] });

    expect(getSocialMediaRivalProjectDetails(state, 'player', 'grand-canal')).toEqual([]);
  });

  it('surfaces the reveal as a status line in the wonder codex view model', () => {
    const state = withPlayerRacing(makeLegendaryWonderFixture({ completedTechs: ['social-media'] }));

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'grand-canal' });

    expect(model.selectedPage?.statusLines.some(line => line.includes('Social Media network'))).toBe(true);
  });
});
