import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getWonderCodexViewModel } from '@/systems/wonder-codex/presentation';
import { isLegendaryWonderVisibleToPlayer } from '@/systems/legendary-wonder-intel-presentation';
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

  it('surfaces started rival intel from explicit records without action targets', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'started',
          eventId: 'started:oracle-of-delphi:ai-1:rival-city:41',
          projectKey: 'oracle-of-delphi:ai-1:rival-city',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
        },
      ],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model);

    expect(model.selectedPage?.stateLabel).toBe('Spotted rival project');
    expect(model.selectedPage?.rivalIntel?.activityCount).toBe(1);
    expect(model.selectedPage?.rivalIntel?.summaryLine).toContain('Last known: under construction');
    expect(model.selectedPage?.rivalIntel?.events[0]?.text).toContain('Rival began Oracle of Delphi in Rival Harbor on turn 41');
    expect(model.selectedPage?.actions).toEqual([]);
    expect(serialized).not.toContain('"cityId":"rival-city"');
    expect(serialized).not.toContain('Quest steps');
    expect(serialized).not.toContain('Reward:');
  });

  it('renders legacy started rival intel through the safe normalized presentation path', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [
        {
          projectKey: 'oracle-of-delphi:ai-1:rival-city',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          revealedTurn: 41,
          intelLevel: 'started',
        },
      ],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model);

    expect(model.selectedPage?.stateLabel).toBe('Spotted rival project');
    expect(model.selectedPage?.rivalIntel?.events[0]?.text).toContain('Rival Harbor');
    expect(model.selectedPage?.actions).toEqual([]);
    expect(serialized).not.toContain('"cityId":"rival-city"');
  });

  it('surfaces completed rival intel even when hidden completion state is absent', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:ai-1:58',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 58,
          learnedTurn: 58,
        },
      ],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });

    expect(model.selectedPage?.stateLabel).toBe('Known rival completed');
    expect(model.selectedPage?.rivalIntel?.summaryLine).toBe('Known rival completed: Rival completed Oracle of Delphi on turn 58.');
    expect(model.selectedPage?.actions).toEqual([]);
  });

  it('surfaces completed rival intel without host city or reward leakage', () => {
    const state = makeState();
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'ai-1', cityId: 'hidden-city', turnCompleted: 58 },
    };
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:ai-1:58',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 58,
          learnedTurn: 58,
        },
      ],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model);

    expect(model.selectedPage?.stateLabel).toBe('Known rival completed');
    expect(model.selectedPage?.rivalIntel?.summaryLine).toBe('Known rival completed: Rival completed Oracle of Delphi on turn 58.');
    expect(serialized).not.toContain('hidden-city');
    expect(serialized).not.toContain('Reward:');
    expect(model.selectedPage?.actions).toEqual([]);
  });

  it('keeps owned state primary when owned state and rival intel both exist', () => {
    const state = makeState();
    state.legendaryWonderProjects = {
      own: {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'building',
        investedProduction: 40,
        transferableProduction: 0,
        questSteps: [],
      },
    };
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:ai-1:58',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 58,
          learnedTurn: 58,
        },
      ],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });

    expect(model.selectedPage?.stateLabel).toBe('Under construction');
    expect(model.selectedPage?.rivalIntel?.stateLabel).toBe('Known rival completed');
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

  it('adds owned legendary landmark preview to owned completed and active pages only', () => {
    const state = makeState();
    const baseCity = state.cities[Object.keys(state.cities)[0]];
    state.cities['safe-city'] = { ...baseCity, id: 'safe-city', owner: 'player' };
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: 'safe-city', turnCompleted: 58 },
    };

    const owned = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    expect(owned.selectedPage?.landmarkPreview).toMatchObject({
      cityId: 'safe-city',
      cityName: state.cities['safe-city'].name,
    });
    expect(owned.selectedPage?.landmarkPreview?.items[0]).toMatchObject({
      wonderId: 'oracle-of-delphi',
      state: 'completed',
    });

    state.legendaryWonderIntel = {
      player: [{
        kind: 'completed',
        eventId: 'completed:grand-canal:ai-1:58',
        wonderId: 'grand-canal',
        civId: 'ai-1',
        civName: 'Rival',
        completionTurn: 58,
        learnedTurn: 58,
      }],
    };
    const rival = getWonderCodexViewModel(state, 'player', { initialWonderId: 'grand-canal' });
    expect(rival.selectedPage?.landmarkPreview).toBeUndefined();
  });
});

describe('isLegendaryWonderVisibleToPlayer', () => {
  function baseState(): GameState {
    const s = createNewGame(undefined, 'vis-gate-test');
    s.legendaryWonderProjects = {};
    return s;
  }

  it('returns false when the player has no project and no rival intel', () => {
    const state = baseState();
    expect(isLegendaryWonderVisibleToPlayer(state, 'player', 'oracle-of-delphi')).toBe(false);
  });

  it('returns false when the player project phase is locked', () => {
    const state = baseState();
    state.legendaryWonderProjects!['p1'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'c1',
      phase: 'locked',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    };
    expect(isLegendaryWonderVisibleToPlayer(state, 'player', 'oracle-of-delphi')).toBe(false);
  });

  it('returns true when the player project phase is questing', () => {
    const state = baseState();
    state.legendaryWonderProjects!['p1'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'c1',
      phase: 'questing',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    };
    expect(isLegendaryWonderVisibleToPlayer(state, 'player', 'oracle-of-delphi')).toBe(true);
  });

  it('returns true when rival intel exists for the wonder (no owned project needed)', () => {
    const state = baseState();
    state.legendaryWonderIntel = {
      player: [{
        kind: 'started',
        eventId: 'started:grand-canal:rival:5',
        projectKey: 'grand-canal:rival',
        wonderId: 'grand-canal',
        civId: 'rival',
        civName: 'Rival',
        cityId: 'city-rival',
        cityName: 'Rival City',
        revealedTurn: 5,
      }],
    };
    expect(isLegendaryWonderVisibleToPlayer(state, 'player', 'grand-canal')).toBe(true);
    expect(isLegendaryWonderVisibleToPlayer(state, 'player', 'oracle-of-delphi')).toBe(false);
  });
});
