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
  it('hides undiscovered natural wonders and gates legendaries without a project or intel', () => {
    const model = getWonderCodexViewModel(makeState(), 'player');

    expect(model.catalogEntries.some(entry => entry.id === 'great_volcano')).toBe(false);
    expect(model.catalogEntries.filter(entry => entry.kind === 'legendary')).toHaveLength(0);
  });

  it('shows discovered natural pages with source image and safe map action', () => {
    const state = makeState();
    state.discoveredWonders.great_volcano = 'player';
    state.wonderDiscoverers.great_volcano = ['player'];

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'great_volcano' });

    expect(model.selectedPage?.title).toBe('Great Volcano');
    expect(model.selectedPage?.image.src).toBe('/images/wonders/codex/volcano.jpg');
    expect(model.selectedPage?.image.sourceUrl).toMatch(/^https:\/\//);
    expect(model.selectedPage?.videoPreview).toMatchObject({
      id: 'video-great-volcano-tonga-eruption',
      wonderId: 'great_volcano',
      surface: 'codex',
      mimeType: 'video/mp4',
      audio: 'silent',
    });
    expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/great-volcano-tonga-eruption.mp4');
    expect(model.selectedPage?.videoPreview?.fallbackImage.src).toBe('/images/wonders/codex/volcano.jpg');
    expect(model.selectedPage?.statusLines.join(' ')).toContain('Q0, R0');
    expect(model.selectedPage?.actions).toContainEqual({
      type: 'view-map',
      label: 'View on Map',
      wonderId: 'great_volcano',
      coord: { q: 0, r: 0 },
    });
  });

  it('does not load a page for a wonder the player cannot see', () => {
    const state = makeState();

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'great_volcano' });

    expect(model.selectedPage?.id).not.toBe('great_volcano');
    expect(model.selectedPage).toBeNull();
  });

  it('does not invent video previews for visible unsupported Codex pages', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'crystal_caverns';
    state.discoveredWonders.crystal_caverns = 'player';
    state.wonderDiscoverers.crystal_caverns = ['player'];

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'crystal_caverns' });

    expect(model.selectedPage?.id).toBe('crystal_caverns');
    expect(model.selectedPage?.videoPreview).toBeUndefined();
  });

  it('shows Stage 3B natural videos on discovered Codex pages', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'coral_reef';
    state.discoveredWonders.coral_reef = 'player';
    state.wonderDiscoverers.coral_reef = ['player'];

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'coral_reef' });

    expect(model.selectedPage?.videoPreview).toMatchObject({
      id: 'video-coral-reef-art-park',
      wonderId: 'coral_reef',
      surface: 'codex',
      audio: 'silent',
    });
    expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/coral-reef-art-park.mp4');
    expect(model.selectedPage?.videoPreview?.fallbackImage.src).toBe('/images/wonders/codex/coral.jpg');
  });

  it('shows Stage 3C natural videos on discovered Codex pages', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 1, r: 0 })].wonder = 'bioluminescent_bay';
    state.discoveredWonders.bioluminescent_bay = 'player';
    state.wonderDiscoverers.bioluminescent_bay = ['player'];

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'bioluminescent_bay' });

    expect(model.selectedPage?.videoPreview).toMatchObject({
      id: 'video-bioluminescent-bay-vieques-kayak',
      wonderId: 'bioluminescent_bay',
      surface: 'codex',
      audio: 'silent',
    });
    expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/bioluminescent-bay-vieques-kayak.mp4');
    expect(model.selectedPage?.videoPreview?.fallbackImage.src).toBe('/images/wonders/codex/coral.jpg');
  });

  it('shows Stage 3B legendary videos on safe owned completed Codex pages', () => {
    const state = makeState();
    const baseCity = state.cities[Object.keys(state.cities)[0]];
    state.cities['safe-city'] = { ...baseCity, id: 'safe-city', owner: 'player' };
    state.completedLegendaryWonders = {
      'grand-canal': { ownerId: 'player', cityId: 'safe-city', turnCompleted: 58 },
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'grand-canal' });

    expect(model.selectedPage?.videoPreview).toMatchObject({
      id: 'video-grand-canal-gongchen-hangzhou',
      wonderId: 'grand-canal',
      surface: 'codex',
      audio: 'silent',
    });
    expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/grand-canal-gongchen-hangzhou.mp4');
    expect(model.selectedPage?.videoPreview?.fallbackImage.src).toBe('/images/wonders/codex/canal.jpg');
  });

  it('shows Stage 3C legendary videos on safe owned completed Codex pages', () => {
    const state = makeState();
    const baseCity = state.cities[Object.keys(state.cities)[0]];
    state.cities['safe-city'] = { ...baseCity, id: 'safe-city', owner: 'player' };
    state.completedLegendaryWonders = {
      'world-archive': { ownerId: 'player', cityId: 'safe-city', turnCompleted: 68 },
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'world-archive' });

    expect(model.selectedPage?.videoPreview).toMatchObject({
      id: 'video-world-archive-printing-press',
      wonderId: 'world-archive',
      surface: 'codex',
      audio: 'silent',
    });
    expect(model.selectedPage?.videoPreview?.src).toBe('/videos/wonders/world-archive-printing-press.mp4');
    expect(model.selectedPage?.videoPreview?.fallbackImage.src).toBe('/images/wonders/codex/archive.jpg');
  });

  it('rival-owned project and completion do not appear in player catalog and no private data leaks', () => {
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

    // Rival-owned projects and completions do not grant visibility to viewer
    expect(model.catalogEntries.some(e => e.id === 'oracle-of-delphi')).toBe(false);
    expect(model.catalogEntries.some(e => e.id === 'grand-canal')).toBe(false);
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

  it('keeps host-location-only rival intel as known-host text without landmark preview', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [{
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
        learnedTurn: 62,
        source: 'spy-location',
      }],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model.selectedPage);

    expect(model.selectedPage?.stateLabel).toBe('Known rival host');
    expect(model.selectedPage?.knownRivalLandmarkPreview).toBeUndefined();
    expect(model.selectedPage?.rivalIntel?.summaryLine).toContain('Known host: Rival Harbor');
    expect(serialized).not.toContain('"cityId":"rival-city"');
    expect(serialized).not.toContain('Reward:');
    expect(model.selectedPage?.actions).toEqual([]);
  });

  it('adds known-rival landmark preview only from paired host-location and completed intel', () => {
    const state = makeState();
    state.legendaryWonderIntel = {
      player: [
        {
          kind: 'host-location-known',
          eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          cityId: 'rival-city',
          cityName: 'Rival Harbor',
          coord: { q: 4, r: 2 },
          learnedTurn: 62,
          source: 'spy-location',
        },
        {
          kind: 'completed',
          eventId: 'completed:oracle-of-delphi:ai-1:70',
          wonderId: 'oracle-of-delphi',
          civId: 'ai-1',
          civName: 'Rival',
          completionTurn: 70,
          learnedTurn: 70,
        },
      ],
    };

    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const serialized = JSON.stringify(model.selectedPage);

    expect(model.selectedPage?.stateLabel).toBe('Known rival completed');
    expect(model.selectedPage?.knownRivalLandmarkPreview).toMatchObject({
      cityName: 'Rival Harbor',
      learnedTurn: 62,
      items: [{ wonderId: 'oracle-of-delphi', label: 'Oracle of Delphi', state: 'completed' }],
    });
    expect(serialized).not.toContain('"cityId":"rival-city"');
    expect(serialized).not.toContain('Reward:');
    expect(model.selectedPage?.actions).toEqual([]);
  });

  it('keeps host-location intel scoped to the current hot-seat viewer', () => {
    const state = makeState();
    state.civilizations['player-2'] = {
      ...state.civilizations.player,
      id: 'player-2',
      name: 'Second Player',
      isHuman: true,
      cities: [],
      units: [],
    };
    state.legendaryWonderIntel = {
      player: [{
        kind: 'host-location-known',
        eventId: 'location:oracle-of-delphi:ai-1:rival-city:62',
        wonderId: 'oracle-of-delphi',
        civId: 'ai-1',
        civName: 'Rival',
        cityId: 'rival-city',
        cityName: 'Rival Harbor',
        coord: { q: 4, r: 2 },
        learnedTurn: 62,
        source: 'spy-location',
      }],
    };

    const viewerA = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    const viewerB = getWonderCodexViewModel(state, 'player-2', { initialWonderId: 'oracle-of-delphi' });

    expect(viewerA.selectedPage?.rivalIntel?.summaryLine).toContain('Known host: Rival Harbor');
    expect(viewerA.selectedPage?.knownRivalLandmarkPreview).toBeUndefined();
    expect(viewerB.catalogEntries.some(entry => entry.id === 'oracle-of-delphi')).toBe(false);
    expect(viewerB.selectedPage).toBeNull();
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

  it('returns true when the player owns a completed legendary wonder', () => {
    const state = baseState();
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: 'c1', turnCompleted: 50 },
    };
    expect(isLegendaryWonderVisibleToPlayer(state, 'player', 'oracle-of-delphi')).toBe(true);
    expect(isLegendaryWonderVisibleToPlayer(state, 'other-player', 'oracle-of-delphi')).toBe(false);
  });

  it('returns true when the player project phase is lost_race', () => {
    const state = baseState();
    state.legendaryWonderProjects!['p1'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'c1',
      phase: 'lost_race',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    };
    expect(isLegendaryWonderVisibleToPlayer(state, 'player', 'oracle-of-delphi')).toBe(true);
  });
});

describe('legendary wonder catalog gating', () => {
  it('excludes legendary wonders the player has no project or rival intel for', () => {
    const state = createNewGame(undefined, 'gate-test');
    state.legendaryWonderProjects = {};
    const model = getWonderCodexViewModel(state, 'player');
    const legendaryIds = model.catalogEntries
      .filter(e => e.kind === 'legendary')
      .map(e => e.id);
    expect(legendaryIds).toHaveLength(0);
  });

  it('includes a legendary wonder once the player project phase is questing', () => {
    const state = createNewGame(undefined, 'gate-questing-test');
    state.legendaryWonderProjects = {
      p1: {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: 'c1',
        phase: 'questing',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [],
      },
    };
    const model = getWonderCodexViewModel(state, 'player');
    expect(model.catalogEntries.some(e => e.id === 'oracle-of-delphi')).toBe(true);
  });

  it('selectedPage is null when no legendary wonders are visible and no naturals are known', () => {
    const state = createNewGame(undefined, 'gate-null-test');
    state.legendaryWonderProjects = {};
    state.wonderDiscoverers = {};
    for (const tile of Object.values(state.map.tiles)) tile.wonder = null;
    const model = getWonderCodexViewModel(state, 'player');
    expect(model.catalogEntries).toHaveLength(0);
    expect(model.selectedPage).toBeNull();
  });
});

describe('legendary page view-model fields', () => {
  it('canStartBuild is true when project is ready_to_build and city requirements are met', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'sacred-sites'],
      resources: ['stone'],
      hasRiver: true,
    });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    expect(model.selectedPage?.canStartBuild).toBe(true);
  });

  it('canStartBuild is false when project is still questing', () => {
    const state = makeLegendaryWonderFixture();
    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    expect(model.selectedPage?.canStartBuild).toBe(false);
  });

  it('questSteps are populated from the project when available', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 1 });
    const model = getWonderCodexViewModel(state, 'player', { initialWonderId: 'oracle-of-delphi' });
    expect(Array.isArray(model.selectedPage?.questSteps)).toBe(true);
    expect(model.selectedPage?.questSteps?.length).toBeGreaterThan(0);
    expect(model.selectedPage?.questSteps?.[0]?.completed).toBe(true);
  });
});
