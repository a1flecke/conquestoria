import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHotSeatGame, createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { resolveCivDefinition } from '@/systems/civ-registry';
const dbState = new Map<string, unknown>();

vi.mock('@/storage/db', () => ({
  dbGet: vi.fn(async (key: string) => dbState.get(key)),
  dbPut: vi.fn(async (key: string, value: unknown) => { dbState.set(key, value); }),
  dbDelete: vi.fn(async (key: string) => { dbState.delete(key); }),
  dbGetAllKeys: vi.fn(async () => Array.from(dbState.keys())),
}));

import { loadGame, migrateLegacyNamingState, normalizeLoadedStateForTest, saveGame } from '@/storage/save-manager';
import type { CustomCivDefinition, GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

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
const customCiv: CustomCivDefinition = {
  id: 'custom-sunfolk',
  name: 'Sunfolk',
  color: '#d9a441',
  leaderName: 'Aurelia',
  cityNames: ['Solara', 'Embergate', 'Sunspire', 'Goldmere', 'Dawnwatch', 'Auric'],
  primaryTrait: 'scholarly',
  temperamentTraits: ['diplomatic', 'trader'],
};

describe('save persistence (#38)', () => {
  let ls: ReturnType<typeof makeLocalStorageMock>;

  beforeEach(() => {
    ls = makeLocalStorageMock();
    dbState.clear();
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

  it('round-trips compact economy status through JSON serialization', () => {
    const state = {
      economyStatusByCiv: {
        player: {
          turn: 9,
          grossGoldIncome: 4,
          buildingMaintenance: 1,
          unitMaintenance: 3,
          netGoldPerTurn: 0,
          unpaidMaintenance: 0,
          strainLevel: 'none',
        },
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.economyStatusByCiv.player).toEqual(state.economyStatusByCiv.player);
  });

  it('round-trips occupied city state through save and load', async () => {
    const state = createNewGame(undefined, 'occupied-save', 'small');
    state.cities.athens = {
      ...foundCity('player', { q: 1, r: 0 }, state.map, mkC()),
      id: 'athens',
      name: 'Athens',
      owner: 'player',
      position: { q: 1, r: 0 },
      occupation: { originalOwnerId: 'ai-1', turnsRemaining: 6 },
    };
    state.civilizations.player.cities = ['athens'];

    await saveGame('slot-occupied-city', 'Occupied City', state);
    const loaded = await loadGame('slot-occupied-city');

    expect(loaded?.cities.athens.occupation).toEqual(state.cities.athens.occupation);
  });

  it('round-trips pending diplomacy requests through save and load', async () => {
    const state = createNewGame(undefined, 'pending-peace-save', 'small');
    state.pendingDiplomacyRequests = [
      { id: 'req-1', type: 'peace', fromCivId: 'ai-1', toCivId: 'player', turnIssued: state.turn },
    ];

    await saveGame('slot-pending-peace', 'Pending Peace', state);
    const loaded = await loadGame('slot-pending-peace');

    expect(loaded?.pendingDiplomacyRequests).toEqual(state.pendingDiplomacyRequests);
  });

  it('preserves legacy tile owner as holder when normalizing ambiguous territory', async () => {
    const state = createNewGame(undefined, 'legacy-territory-holder');
    const city = {
      ...foundCity('player', { q: 10, r: 10 }, state.map, mkC()),
      id: 'legacy-city',
      position: { q: 10, r: 10 },
    };
    state.cities = { [city.id]: city };
    state.civilizations.player.cities = [city.id];
    const coord = { q: city.position.q + 1, r: city.position.r };
    const key = hexKey(coord);
    state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'grassland', owner: 'ai-1' };
    state.cities[city.id] = { ...city, ownedTiles: [...city.ownedTiles, coord], workedTiles: [coord] };

    const normalized = normalizeLoadedStateForTest(state);

    expect(normalized.map.tiles[key].owner).toBe('ai-1');
    expect(normalized.cities[city.id].workedTiles).not.toContainEqual(coord);
  });

  it('normalizes older saves without pending diplomacy requests', async () => {
    const state = createNewGame(undefined, 'legacy-pending-peace-save', 'small');
    delete (state as Partial<GameState>).pendingDiplomacyRequests;

    await saveGame('slot-legacy-pending-peace', 'Legacy Pending Peace', state);
    const loaded = await loadGame('slot-legacy-pending-peace');

    expect(loaded?.pendingDiplomacyRequests).toEqual([]);
  });

  it('normalizes legacy minor-civ chain maps without emitting a synthetic status transition', () => {
    const state = createNewGame(undefined, 'legacy-minor-chain-maps', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.diplomacy.relationships.player = 35;
    delete (minorCiv as Partial<typeof minorCiv>).chainStatusByCiv;
    delete (minorCiv as Partial<typeof minorCiv>).questCooldownUntilByCiv;
    delete (minorCiv as Partial<typeof minorCiv>).lastNotifiedStatusByCiv;

    const loaded = normalizeLoadedStateForTest(state);
    const normalized = loaded.minorCivs[minorCiv.id];

    expect(normalized.chainStatusByCiv).toEqual({});
    expect(normalized.questCooldownUntilByCiv).toEqual({});
    expect(normalized.lastNotifiedStatusByCiv.player).toBe('friendly');
  });

  it('normalizes legacy minor-civ coalition fields for solo saves', () => {
    const state = createNewGame(undefined, 'legacy-minor-coalition-solo', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    delete (minorCiv as any).regionalGrievanceByCiv;
    delete (state as any).minorCivCoalitions;
    delete (state as any).minorCivRegionalCooldowns;

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].regionalGrievanceByCiv).toEqual({});
    expect(loaded.minorCivCoalitions).toEqual({});
    expect(loaded.minorCivRegionalCooldowns).toEqual({});
  });

  it('drops malformed coalition records while preserving hot-seat pending events', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'legacy-minor-coalition-hotseat');
    const minorCiv = Object.values(state.minorCivs)[0];
    const grievance = {
      targetCivId: 'player-1',
      pressure: 55,
      status: 'mobilizing',
      lastUpdatedTurn: state.turn,
      lastConquestTurn: state.turn - 1,
      decayBlockedUntilTurn: state.turn + 4,
      cooldownUntilTurn: state.turn + 12,
      causes: [{
        type: 'minor-civ-conquest',
        turn: state.turn - 1,
        minorCivId: minorCiv.id,
        distance: 4,
        pressure: 35,
      }],
    };
    (minorCiv as any).regionalGrievanceByCiv = { 'player-1': grievance };
    (state as any).minorCivCoalitions = {
      invalid: {
        id: 'invalid',
        targetCivId: 'player-1',
        memberIds: ['missing-minor-civ'],
        status: 'active',
        createdTurn: state.turn,
        updatedTurn: state.turn,
        cooldownUntilTurn: state.turn + 18,
      },
    };
    (state as any).minorCivRegionalCooldowns = {
      invalid: { targetCivId: 'player-1', memberIds: ['missing-minor-civ'], cooldownUntil: state.turn + 12 },
    };
    state.pendingEvents = {
      'player-1': [{
        type: 'minor-civ:coalition-status',
        minorCivId: minorCiv.id,
        targetCivId: 'player-1',
        status: 'mobilizing',
      } as any],
    };

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].regionalGrievanceByCiv?.['player-1']).toEqual(grievance);
    expect(loaded.minorCivCoalitions).toEqual({});
    expect(loaded.minorCivRegionalCooldowns).toEqual({});
    expect(loaded.pendingEvents?.['player-1']?.[0]).toMatchObject({
      type: 'minor-civ:coalition-status',
      minorCivId: minorCiv.id,
      targetCivId: 'player-1',
      status: 'mobilizing',
    });
  });

  it('normalizes missing hidden minor-civ economy state after coalition state', () => {
    const state = createNewGame(undefined, 'minor-economy-legacy', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    delete (minorCiv as any).economy;
    minorCiv.regionalGrievanceByCiv = {
      player: {
        targetCivId: 'player',
        pressure: 55,
        status: 'mobilizing',
        lastUpdatedTurn: state.turn,
        causes: [],
        mobilizationProgress: 12,
      },
    };

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].economy).toMatchObject({
      policy: 'balanced',
      posture: 'settled',
      lastProcessedTurn: Math.max(0, state.turn - 1),
    });
    expect(loaded.minorCivs[minorCiv.id].regionalGrievanceByCiv?.player).toMatchObject({
      pressure: 55,
      status: 'mobilizing',
      mobilizationProgress: 12,
    });
  });

  it('drops malformed pending minor-civ economy spawns without creating units on load', () => {
    const state = createNewGame(undefined, 'minor-economy-bad-pending', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const unitCountBefore = Object.keys(state.units).length;
    (minorCiv as any).economy = {
      policy: 'balanced',
      posture: 'settled',
      lastProcessedTurn: state.turn,
      pendingUnitSpawn: { unitType: 'settler', completedTurn: 'bad', attempts: -1 },
    };

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].economy?.pendingUnitSpawn).toBeUndefined();
    expect(Object.keys(loaded.units)).toHaveLength(unitCountBefore);
  });

  it('drops valid-looking pending minor-civ economy spawns for unsafe unit types', () => {
    const state = createNewGame(undefined, 'minor-economy-unsafe-pending', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    (minorCiv as any).economy = {
      policy: 'balanced',
      posture: 'settled',
      lastProcessedTurn: state.turn,
      pendingUnitSpawn: { unitType: 'settler', completedTurn: state.turn, attempts: 1 },
    };

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].economy?.pendingUnitSpawn).toBeUndefined();
  });

  it('removes malformed chain metadata without changing treasury or relationship', () => {
    const state = createNewGame(undefined, 'invalid-minor-chain-save', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const beforeGold = state.civilizations.player.gold;
    const beforeRelationship = minorCiv.diplomacy.relationships.player;
    minorCiv.activeQuests.player = {
      id: 'quest-91',
      type: 'gift_gold',
      description: 'Invalid partial chain quest',
      target: { type: 'gift_gold', amount: 25 },
      reward: { relationshipBonus: 15 },
      progress: 0,
      status: 'active',
      turnIssued: state.turn,
      expiresOnTurn: state.turn + 20,
      chainId: 'missing-chain',
      stepIndex: 1,
    };

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].activeQuests.player).toBeUndefined();
    expect(loaded.minorCivs[minorCiv.id].questCooldownUntilByCiv.player).toBe(state.turn + 3);
    expect(loaded.civilizations.player.gold).toBe(beforeGold);
    expect(loaded.minorCivs[minorCiv.id].diplomacy.relationships.player).toBe(beforeRelationship);
  });

  it('rejects chain statuses with fields from a different lifecycle state', () => {
    const state = createNewGame(undefined, 'invalid-minor-chain-status-save', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.chainStatusByCiv.player = {
      chainId: 'trade-partnership',
      status: 'pending',
      statusTurn: state.turn,
      pendingStepIndex: 1,
      pendingExpiresOnTurn: state.turn + 10,
      earnedTurn: state.turn,
    } as any;

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].chainStatusByCiv.player).toBeUndefined();
  });

  it('rejects malformed non-object chain statuses', () => {
    const state = createNewGame(undefined, 'invalid-minor-chain-status-object', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.chainStatusByCiv.player = null as any;

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].chainStatusByCiv.player).toBeUndefined();
  });

  it('rejects normal quests whose target discriminator disagrees with the quest type', () => {
    const state = createNewGame(undefined, 'invalid-normal-quest-target', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.activeQuests.player = {
      id: 'quest-invalid-normal', type: 'gift_gold', description: 'Mismatched target',
      target: { type: 'trade_route', minorCivId: minorCiv.id }, reward: { relationshipBonus: 10 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
    } as any;

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].activeQuests.player).toBeUndefined();
  });

  it('rejects chain state belonging to a different minor-civ archetype', () => {
    const state = createNewGame(undefined, 'invalid-cross-archetype-chain', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    minorCiv.definitionId = 'sparta';
    minorCiv.chainStatusByCiv.player = {
      chainId: 'trade-partnership', status: 'allied', statusTurn: state.turn, earnedTurn: state.turn,
    };

    const loaded = normalizeLoadedStateForTest(state);

    expect(loaded.minorCivs[minorCiv.id].chainStatusByCiv.player).toBeUndefined();
  });

  it('hydrates remembered camp positions in legacy active quests', () => {
    const state = createNewGame(undefined, 'legacy-camp-quest-position', 'small');
    const minorCiv = Object.values(state.minorCivs)[0];
    const camp = Object.values(state.barbarianCamps)[0];
    if (!camp) throw new Error('Expected a generated barbarian camp');
    minorCiv.activeQuests.player = {
      id: 'quest-legacy-camp', type: 'destroy_camp', description: 'Destroy the camp',
      target: { type: 'destroy_camp', campId: camp.id } as any, reward: { relationshipBonus: 10 },
      progress: 0, status: 'active', turnIssued: state.turn, expiresOnTurn: state.turn + 20,
    };

    const loaded = normalizeLoadedStateForTest(state);
    const target = loaded.minorCivs[minorCiv.id].activeQuests.player?.target;

    expect(target).toMatchObject({ type: 'destroy_camp', campId: camp.id, position: camp.position });
  });

  it('strips grid and gridSize from legacy saves on load', async () => {
    const state = createNewGame('rome', 'legacy-city-grid-strip-seed');
    const city = Object.values(state.cities)[0];
    const legacyCity = city as any;
    legacyCity.grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null));
    legacyCity.gridSize = 5;

    await saveGame('slot-legacy-grid-strip', 'Legacy Grid Strip', state);
    const loaded = await loadGame('slot-legacy-grid-strip');

    const loadedCity = Object.values(loaded!.cities)[0] as any;
    expect(loadedCity.grid).toBeUndefined();
    expect(loadedCity.gridSize).toBeUndefined();
    expect(loadedCity.buildings).toBeDefined();
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

  it('round-trips completed legendary wonder intel through JSON serialization', () => {
    const state = {
      legendaryWonderIntel: {
        observer: [
          {
            kind: 'completed',
            eventId: 'completed:oracle-of-delphi:rival:58',
            wonderId: 'oracle-of-delphi',
            civId: 'rival',
            civName: 'Rival',
            completionTurn: 58,
            learnedTurn: 58,
          },
        ],
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.legendaryWonderIntel.observer[0]).toEqual({
      kind: 'completed',
      eventId: 'completed:oracle-of-delphi:rival:58',
      wonderId: 'oracle-of-delphi',
      civId: 'rival',
      civName: 'Rival',
      completionTurn: 58,
      learnedTurn: 58,
    });
  });

  it('keeps legacy started legendary wonder intel serializable', () => {
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

    expect(roundTrip.legendaryWonderIntel.observer[0].intelLevel).toBe('started');
    expect(roundTrip.legendaryWonderIntel.observer[0].cityName).toBe('Rival Harbor');
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

  it('round-trips a custom civ campaign through saveGame/loadGame and still resolves the selected civ after load', async () => {
    const state = createNewGame({
      civType: 'custom-sunfolk',
      mapSize: 'small',
      opponentCount: 1,
      gameTitle: 'Saved Custom Civ',
      customCivilizations: [customCiv],
    });

    await saveGame('slot-custom-civ', 'Saved Custom Civ', state);
    const roundTrip = await loadGame('slot-custom-civ') as GameState;
    const resolved = resolveCivDefinition(roundTrip, roundTrip.civilizations.player.civType);

    expect(roundTrip.settings.customCivilizations).toEqual([customCiv]);
    expect(resolved?.id).toBe('custom-sunfolk');
    expect(resolved?.name).toBe('Sunfolk');
    expect(resolved?.bonusEffect).toEqual({ type: 'extra_tech_speed', speedMultiplier: 1.15 });
  });

  it('trims legacy production queues to the active item plus three follow-ups on load', async () => {
    const state = createNewGame('rome', 'legacy-queue-seed');
    state.cities['city-1'] = {
      id: 'city-1',
      name: 'Rome',
      owner: 'player',
      position: { q: 2, r: 2 },
      population: 2,
      food: 0,
      foodNeeded: 15,
      buildings: [],
      productionQueue: ['warrior', 'shrine', 'worker', 'library'],
      productionProgress: 0,
      ownedTiles: [{ q: 2, r: 2 }],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };
    state.civilizations.player.cities = ['city-1'];

    await saveGame('slot-legacy-queue', 'Legacy Queue Save', state);
    const loaded = await loadGame('slot-legacy-queue');

    expect(loaded?.cities['city-1'].productionQueue).toEqual(['warrior', 'shrine', 'worker', 'library']);
  });

  it('adds an empty research queue when loading older saves', async () => {
    const state = createNewGame('rome', 'legacy-research-queue-seed');
    delete (state.civilizations.player.techState as Partial<typeof state.civilizations.player.techState>).researchQueue;

    await saveGame('slot-legacy-research-queue', 'Legacy Research Queue Save', state);
    const loaded = await loadGame('slot-legacy-research-queue');

    expect(loaded?.civilizations.player.techState.researchQueue).toEqual([]);
  });

  it('normalizes legacy duplicate or off-pool city names on load', () => {
    const state = createNewGame('rome', 'legacy-naming-seed');
    state.cities['city-1'] = {
      id: 'city-1',
      name: 'Rome',
      owner: 'player',
      position: { q: 2, r: 2 },
      population: 2,
      food: 0,
      foodNeeded: 15,
      buildings: [],
      productionQueue: [],
      productionProgress: 0,
      ownedTiles: [{ q: 2, r: 2 }],
      workedTiles: [],
      focus: 'balanced',
      maturity: 'outpost',
      unrestLevel: 0,
      unrestTurns: 0,
      spyUnrestBonus: 0,
    };
    state.cities['city-2'] = {
      ...state.cities['city-1'],
      id: 'city-2',
      position: { q: 4, r: 4 },
    };

    const loaded = migrateLegacyNamingState(JSON.parse(JSON.stringify(state)) as GameState);
    const names = Object.values(loaded.cities).map(city => city.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('preserves the older city name when duplicate legacy ids reach double digits', () => {
    const state = createNewGame('rome', 'legacy-double-digit-seed');
    state.cities = {
      'city-2': {
        id: 'city-2',
        name: 'Rome',
        owner: 'player',
        position: { q: 2, r: 2 },
        population: 2,
        food: 0,
        foodNeeded: 15,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 2, r: 2 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
      'city-10': {
        id: 'city-10',
        name: 'Rome',
        owner: 'player',
        position: { q: 10, r: 10 },
        population: 2,
        food: 0,
        foodNeeded: 15,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        ownedTiles: [{ q: 10, r: 10 }],
        workedTiles: [],
        focus: 'balanced',
        maturity: 'outpost',
        unrestLevel: 0,
        unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    };

    const loaded = migrateLegacyNamingState(JSON.parse(JSON.stringify(state)) as GameState);

    expect(loaded.cities['city-2'].name).toBe('Rome');
    expect(loaded.cities['city-10'].name).not.toBe('Rome');
  });
});
