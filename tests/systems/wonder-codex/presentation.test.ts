import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getWonderCodexViewModel } from '@/systems/wonder-codex/presentation';
import { makeLegendaryWonderFixture } from '../helpers/legendary-wonder-fixture';

function makeState(): GameState {
  const state = createNewGame(undefined, 'wonder-codex-presentation-test');
  for (const tile of Object.values(state.map.tiles)) tile.wonder = null;
  state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = 'great_volcano';
  state.discoveredWonders = {};
  state.wonderDiscoverers = {};
  return state;
}

describe('wonder-codex presentation', () => {
  it('hides undiscovered natural wonders without hiding the legendary catalog', () => {
    const model = getWonderCodexViewModel(makeState(), 'player');

    expect(model.catalogEntries.some(entry => entry.id === 'great_volcano')).toBe(false);
    expect(model.catalogEntries.some(entry => entry.id === 'oracle-of-delphi')).toBe(true);
  });

  it('shows discovered natural pages with source image and safe map action', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'great_volcano' });

    expect(model.selectedPage?.title).toBe('Great Volcano');
    expect(model.selectedPage?.image.src).toBe('/images/wonders/codex/volcano.jpg');
    expect(model.selectedPage?.image.sourceUrl).toMatch(/^https:\/\//);
    expect(model.selectedPage?.statusLines.join(' ')).toContain('Q0, R0');
    expect(model.selectedPage?.actions).toContainEqual({
      type: 'view-map',
      label: 'View on Map',
      wonderId: 'great_volcano',
      coord: { q: 0, r: 0 },
    });
  });

  it('falls back to the first visible entry when a deep link is not viewer-safe', () => {
    const state = makeState();

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'great_volcano' });

    expect(model.selectedPage?.id).not.toBe('great_volcano');
    expect(model.selectedPage?.kind).toBe('legendary');
  });

  it('does not expose rival legendary project or completion details', () => {
    const state = makeState();
    state.legendaryWonderProjects = {
      rival: {
        wonderId: 'oracle-of-delphi',
        ownerId: 'ai-1',
        cityId: 'rival-city',
        phase: 'building',
        investedProduction: 90,
        transferableProduction: 0,
        questSteps: [],
      },
    };
    state.completedLegendaryWonders = {
      'grand-canal': { ownerId: 'ai-1', cityId: 'rival-canal-city', turnCompleted: 9 },
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model);

    expect(model.selectedPage?.stateLabel).toBe('Legendary wonder');
    expect(model.selectedPage?.statusLines.join(' ')).not.toContain('Reward:');
    expect(serialized).not.toContain('rival-city');
    expect(serialized).not.toContain('rival-canal-city');
    expect(serialized).not.toContain('90');
    expect(serialized).not.toContain('Completed');
  });

  it('does not label blocked ready-to-build legendary projects as available', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });

    expect(model.selectedPage?.stateLabel).toBe('Legendary wonder');
    expect(model.selectedPage?.statusLines.join(' ')).not.toContain('Reward:');
  });

  it('surfaces owned host city action only for safe owned city state', () => {
    const state = makeState();
    const baseCity = state.cities[Object.keys(state.cities)[0]];
    state.cities['safe-city'] = { ...baseCity, id: 'safe-city', owner: 'player' };
    state.legendaryWonderProjects = {
      own: {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: 'safe-city',
        phase: 'building',
        investedProduction: 40,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });

    expect(model.selectedPage?.stateLabel).toBe('Under construction');
    expect(model.selectedPage?.actions[0]).toMatchObject({ type: 'open-city', cityId: 'safe-city' });
  });
});
