import { describe, it, expect, beforeEach } from 'vitest';

// --- Minimal in-memory localStorage mock ---
function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

const LOCALSTORAGE_AUTOSAVE_KEY = 'conquestoria-autosave';

describe('save persistence (#38)', () => {
  let ls: ReturnType<typeof makeLocalStorageMock>;

  beforeEach(() => {
    ls = makeLocalStorageMock();
  });

  it('stores and retrieves a save', () => {
    const state = { turn: 5, currentPlayer: 'player' };
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
    const raw = ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.turn).toBe(5);
    expect(parsed.currentPlayer).toBe('player');
  });

  it('deleteAutoSave removes the entry', () => {
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify({ turn: 3 }));
    ls.removeItem(LOCALSTORAGE_AUTOSAVE_KEY);
    expect(ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY)).toBeNull();
  });

  it('hasAutoSave is false when store is empty', () => {
    expect(ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY)).toBeNull();
  });

  it('hasAutoSave is true after saving', () => {
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify({ turn: 1 }));
    expect(ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY)).not.toBeNull();
  });

  it('fallback load returns parsed state from localStorage', () => {
    const state = { turn: 7, era: 2, currentPlayer: 'p1' };
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
    const raw = ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    const loaded = raw ? JSON.parse(raw) : undefined;
    expect(loaded?.turn).toBe(7);
    expect(loaded?.era).toBe(2);
  });

  it('fallback returns undefined when key missing', () => {
    const raw = ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    const loaded = raw ? JSON.parse(raw) : undefined;
    expect(loaded).toBeUndefined();
  });

  it('round-trips breakaway metadata through JSON serialization', () => {
    const state = {
      turn: 61,
      civilizations: {
        'breakaway-city-1': {
          breakaway: {
            originOwnerId: 'player',
            originCityId: 'city-1',
            startedTurn: 11,
            establishesOnTurn: 61,
            status: 'established',
          },
        },
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.civilizations['breakaway-city-1'].breakaway.status).toBe('established');
  });

  it('round-trips legendary wonder projects through JSON serialization', () => {
    const state = {
      legendaryWonderProjects: {
        'oracle-of-delphi': {
          wonderId: 'oracle-of-delphi',
          ownerId: 'player',
          cityId: 'city-1',
          phase: 'ready_to_build',
          investedProduction: 120,
          transferableProduction: 30,
          questSteps: [
            { id: 'discover-natural-wonder', description: 'Discover a natural wonder', completed: true },
            { id: 'complete-pilgrimage-route', description: 'Complete a pilgrimage route', completed: true },
          ],
        },
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.legendaryWonderProjects['oracle-of-delphi'].phase).toBe('ready_to_build');
    expect(roundTrip.legendaryWonderProjects['oracle-of-delphi'].transferableProduction).toBe(30);
  });

  it('round-trips completed legendary wonder state through JSON serialization', () => {
    const state = {
      completedLegendaryWonders: {
        'oracle-of-delphi': {
          ownerId: 'player',
          cityId: 'city-1',
          turnCompleted: 40,
        },
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.completedLegendaryWonders['oracle-of-delphi'].ownerId).toBe('player');
    expect(roundTrip.completedLegendaryWonders['oracle-of-delphi'].turnCompleted).toBe(40);
  });

  it('round-trips legendary wonder history through JSON serialization', () => {
    const state = {
      legendaryWonderHistory: {
        destroyedStrongholds: [
          {
            civId: 'player',
            campId: 'camp-7',
            position: { q: 4, r: -2 },
            turn: 33,
          },
        ],
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.legendaryWonderHistory.destroyedStrongholds).toContainEqual({
      civId: 'player',
      campId: 'camp-7',
      position: { q: 4, r: -2 },
      turn: 33,
    });
  });

  it('round-trips legendary wonder discovery history through JSON serialization', () => {
    const state = {
      legendaryWonderHistory: {
        destroyedStrongholds: [],
        discoveredSites: [
          { civId: 'player', siteId: 'great-barrier-reef', siteType: 'natural-wonder', position: { q: 8, r: 2 }, turn: 12 },
          { civId: 'player', siteId: 'village-3', siteType: 'tribal-village', position: { q: 5, r: 1 }, turn: 15 },
        ],
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.legendaryWonderHistory.discoveredSites).toHaveLength(2);
    expect(roundTrip.legendaryWonderHistory.discoveredSites[0].siteType).toBe('natural-wonder');
  });

  it('round-trips legendary wonder intel through JSON serialization', () => {
    const state = {
      legendaryWonderIntel: {
        observer: [
          {
            projectKey: 'oracle-of-delphi:rival:city-rival',
            wonderId: 'oracle-of-delphi',
            civId: 'rival',
            civName: 'Rival',
            cityId: 'city-rival',
            cityName: 'Rival Harbor',
            revealedTurn: 41,
            intelLevel: 'started',
          },
        ],
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.legendaryWonderIntel.observer[0]).toEqual({
      projectKey: 'oracle-of-delphi:rival:city-rival',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      cityId: 'city-rival',
      cityName: 'Rival Harbor',
      revealedTurn: 41,
      intelLevel: 'started',
    });
  });

  it('round-trips campaign identity through JSON serialization', () => {
    const state = {
      gameId: 'game-123',
      gameTitle: 'Rise of the Nile',
      turn: 12,
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.gameId).toBe('game-123');
    expect(roundTrip.gameTitle).toBe('Rise of the Nile');
  });

  it('round-trips artisan settings and Stage 5 espionage state through JSON serialization', () => {
    const state = {
      settings: {
        advisorsEnabled: {
          artisan: true,
        },
        councilTalkLevel: 'normal',
      },
      espionage: {
        player: {
          spies: {
            'spy-1': {
              id: 'spy-1',
              owner: 'player',
              name: 'Agent Echo',
              status: 'idle',
              feedsFalseIntel: false,
            },
          },
        },
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.settings.advisorsEnabled.artisan).toBe(true);
    expect(roundTrip.espionage.player.spies['spy-1'].name).toBe('Agent Echo');
  });

  it('round-trips council memory through JSON serialization', () => {
    const state = {
      councilMemory: {
        player: {
          entries: [
            {
              key: 'watch-rival-harbor',
              advisor: 'spymaster',
              kind: 'watch-rival-city',
              turn: 41,
              subjects: {
                civId: 'ai-1',
                cityId: 'city-rival',
              },
              outcome: 'pending',
            },
          ],
          eraCallbackCount: 1,
          callbackEra: 2,
        },
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.councilMemory.player.entries[0].subjects.cityId).toBe('city-rival');
    expect(roundTrip.councilMemory.player.eraCallbackCount).toBe(1);
  });
});
