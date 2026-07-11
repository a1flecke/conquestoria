import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, PIRATE_STATE_VERSION } from '@/core/pirate-state';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { processPiratesForCompletedRound } from '@/systems/pirate-system';

describe('pirate state', () => {
  it('initializes complete versioned pirate and notification state for new games', () => {
    const state = createNewGame(undefined, 'pirate-state-new-game', 'small');

    expect(state.pirates).toEqual(createEmptyPirateState());
    expect(state.notificationLog).toEqual({});
    expect(state.idCounters.nextPirateFactionId).toBe(1);
    expect(state.idCounters.nextNotificationId).toBe(1);
  });

  it('adds empty pirate and notification state to legacy saves without consuming IDs', () => {
    const legacy = createNewGame(undefined, 'pirate-state-legacy', 'small') as any;
    delete legacy.pirates;
    delete legacy.notificationLog;
    delete legacy.idCounters.nextPirateFactionId;
    delete legacy.idCounters.nextNotificationId;

    const normalized = normalizeLoadedStateForTest(legacy);

    expect(normalized.pirates.version).toBe(PIRATE_STATE_VERSION);
    expect(normalized.pirates).toEqual(createEmptyPirateState());
    expect(normalized.notificationLog).toEqual({});
    expect(normalized.idCounters.nextPirateFactionId).toBe(1);
    expect(normalized.idCounters.nextNotificationId).toBe(1);
  });

  it('repairs malformed intel, expired tribute, invalid contracts, and duplicate markers conservatively', () => {
    const state = createNewGame(undefined, 'pirate-state-repair', 'small') as any;
    state.turn = 40;
    state.pirates = {
      version: 0,
      factions: {
        'pirate-2': {
          id: 'pirate-2',
          name: 'The Red Wake',
          behavior: 'raiding',
          maritimeStage: 5,
          notoriety: 6,
          shipIds: [],
          headquarters: {
            kind: 'coastal-enclave',
            position: { q: 2, r: 2 },
            integrity: 60,
            maxIntegrity: 100,
          },
          tributeByCiv: {
            player: { paidRound: 10, protectedUntilRound: 39 },
          },
          demandByCiv: {
            player: { demandedRound: 12, lastReminderRound: 20, quotedCost: 30 },
          },
          contract: {
            employerId: 'player',
            targetId: 'missing-civ',
            startedRound: 30,
            expiresAfterRound: 45,
            successfulRaidCount: 0,
            exposed: false,
            exposureResolvedRaidKeys: [],
          },
          intent: null,
          transitionGuards: {
            emittedEventKeys: ['seen', 'seen'],
            lastDemandReminderRoundByCiv: { player: 17, missing: 99 },
            lastBehaviorTransitionRound: 16,
            lastStageReinforcementRound: 15,
            lastFlagshipAttackedRound: 18,
          },
        },
      },
      history: [],
      pressure: { value: 12, suppression: [] },
      intelByCiv: {
        player: {
          'pirate-2': {
            factionId: 'pirate-2',
            level: 'tracked',
            discoveredRound: 20,
            lastUpdatedRound: 22,
            observedUnitIds: ['hidden-unit'],
            liveFaction: state.pirates,
          },
          'pirate-404': { factionId: 'pirate-404', level: 'tracked' },
        },
      },
      nextSpawnCheckTurn: 42,
      activatedTurn: 12,
      activationWarningDeliveredByCiv: ['player', 'player'],
    };

    const normalized = normalizeLoadedStateForTest(state);
    const faction = normalized.pirates.factions['pirate-2'];

    expect(faction.spawnedRound).toBe(12);
    expect(faction.tributeByCiv.player).toBeUndefined();
    expect(faction.contract).toBeNull();
    expect(faction.transitionGuards.emittedEventKeys).toEqual(['seen']);
    expect(faction.transitionGuards.lastDemandReminderRoundByCiv).toEqual({ player: 17 });
    expect(faction.transitionGuards.lastBehaviorTransitionRound).toBe(16);
    expect(faction.transitionGuards.lastStageReinforcementRound).toBe(15);
    expect(faction.transitionGuards.lastFlagshipAttackedRound).toBe(18);
    expect(normalized.pirates.activationWarningDeliveredByCiv).toEqual({ player: true });
    expect(normalized.pirates.intelByCiv.player).toEqual({});
  });

  it('loads a pre-#522 save whose factions have no blockadeStreakByCity field without crashing (save-compat)', () => {
    const state = createNewGame(undefined, 'pirate-state-pre-522', 'small') as any;
    state.pirates = {
      version: 0,
      factions: {
        'pirate-9': {
          id: 'pirate-9',
          name: 'The Old Guard',
          spawnedRound: 1,
          behavior: 'blockading',
          maritimeStage: 3,
          notoriety: 5,
          shipIds: [],
          headquarters: { kind: 'coastal-enclave', position: { q: 2, r: 2 }, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {},
          demandByCiv: {},
          contract: null,
          intent: null,
          transitionGuards: { emittedEventKeys: [] },
          // blockadeStreakByCity intentionally omitted -- this is the shape every
          // pre-#522 save has.
        },
      },
      history: [],
      pressure: { value: 0, suppression: [] },
      intelByCiv: {},
      nextSpawnCheckTurn: 10,
      activatedTurn: 1,
      activationWarningDeliveredByCiv: {},
    };

    const normalized = normalizeLoadedStateForTest(state);
    const faction = normalized.pirates.factions['pirate-9'];

    // No faction is stuck in an invalid behavior -- 'blockading' remains a valid value.
    expect(faction.behavior).toBe('blockading');
    expect(faction.blockadeStreakByCity).toBeUndefined();

    // The faction can be processed through a full round without throwing, and starts
    // accruing a fresh streak from 0 rather than crashing on the missing field.
    const result = processPiratesForCompletedRound(normalized, new EventBus());
    expect(() => result).not.toThrow();
    expect(result.state.pirates!.factions['pirate-9']!.blockadeStreakByCity).toBeDefined();
  });

  it('preserves a besieging faction across save normalization (#522)', () => {
    const state = createNewGame(undefined, 'pirate-state-besieging', 'small') as any;
    state.pirates = {
      version: 1,
      factions: {
        'pirate-3': {
          id: 'pirate-3',
          name: 'The Iron Reef',
          spawnedRound: 1,
          behavior: 'besieging',
          maritimeStage: 4,
          notoriety: 12,
          shipIds: [],
          headquarters: { kind: 'coastal-enclave', position: { q: 3, r: 3 }, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {},
          demandByCiv: {},
          contract: null,
          intent: null,
          transitionGuards: { emittedEventKeys: [] },
          blockadeStreakByCity: { 'some-city': 3 },
        },
      },
      history: [],
      pressure: { value: 0, suppression: [] },
      intelByCiv: {},
      nextSpawnCheckTurn: 10,
      activatedTurn: 1,
      activationWarningDeliveredByCiv: {},
    };

    const normalized = normalizeLoadedStateForTest(state);

    expect(normalized.pirates.factions['pirate-3']).toBeDefined();
    expect(normalized.pirates.factions['pirate-3']!.behavior).toBe('besieging');
  });

  it('persists an in-progress blockade streak for a real city across save normalization (#522)', () => {
    const state = createNewGame(undefined, 'pirate-state-streak-persist', 'small') as any;
    const realCityId = Object.keys(state.cities)[0];
    state.pirates = {
      version: 1,
      factions: {
        'pirate-4': {
          id: 'pirate-4',
          name: 'The Iron Reef',
          spawnedRound: 1,
          behavior: 'besieging',
          maritimeStage: 4,
          notoriety: 12,
          shipIds: [],
          headquarters: { kind: 'coastal-enclave', position: { q: 3, r: 3 }, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {},
          demandByCiv: {},
          contract: null,
          intent: null,
          transitionGuards: { emittedEventKeys: [] },
          blockadeStreakByCity: { [realCityId]: 2, 'demolished-city': 5 },
        },
      },
      history: [],
      pressure: { value: 0, suppression: [] },
      intelByCiv: {},
      nextSpawnCheckTurn: 10,
      activatedTurn: 1,
      activationWarningDeliveredByCiv: {},
    };

    const normalized = normalizeLoadedStateForTest(state);
    const faction = normalized.pirates.factions['pirate-4']!;

    // The streak for a city that still exists survives the round-trip...
    expect(faction.blockadeStreakByCity?.[realCityId]).toBe(2);
    // ...but a dangling reference to a city that no longer exists is dropped, matching
    // the same dangling-reference safety pattern lastDemandReminderRoundByCiv already uses.
    expect(faction.blockadeStreakByCity?.['demolished-city']).toBeUndefined();
  });

  it('drops malformed regional suppression coordinates from loaded saves', () => {
    const state = createNewGame(undefined, 'malformed-pirate-suppression', 'small');
    state.pirates = {
      ...createEmptyPirateState(),
      pressure: {
        value: 12,
        suppression: [
          { regionKey: 'not-a-hex', amount: 8, expiresAfterRound: state.turn + 8 },
          { regionKey: '3,-2', amount: 8, expiresAfterRound: state.turn + 8 },
        ],
      },
    };

    expect(normalizeLoadedStateForTest(state).pirates.pressure.suppression).toEqual([
      { regionKey: '3,-2', amount: 8, expiresAfterRound: state.turn + 8 },
    ]);
  });

  it('preserves tracked relocation direction but rejects malformed persisted relocation plans', () => {
    const state = createNewGame(undefined, 'pirate-relocation-save', 'small') as any;
    state.units.flagship = {
      id: 'flagship', type: 'pirate_corsair', owner: 'pirate-1', position: { q: 3, r: 3 },
      movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'raiding', maritimeStage: 2,
      notoriety: 2, shipIds: ['flagship'],
      headquarters: {
        kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship',
        relocation: {
          planned: {
            plannedRound: 4, resolvesOnRound: 5, direction: 'sideways',
            path: [{ q: 3, r: 2 }, { q: 3, r: 1 }],
          },
          lastRelocatedRound: null,
        },
      },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };
    state.pirates.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'tracked', discoveredRound: 2, lastUpdatedRound: 4,
        lastKnownHeadquarters: {
          kind: 'deep-sea-flotilla', position: { q: 3, r: 3 }, observedRound: 4,
        },
        plannedRelocationDirection: 'south-east',
      },
    };

    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.pirates.factions['pirate-1'].headquarters).toMatchObject({
      kind: 'deep-sea-flotilla', relocation: { planned: null },
    });
    expect(normalized.pirates.intelByCiv.player['pirate-1'].plannedRelocationDirection).toBe('south-east');
  });

  it('preserves player-visible pirate intel details across save normalization', () => {
    const state = createNewGame(undefined, 'pirate-intel-detail-save', 'small') as any;
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading', maritimeStage: 4,
      notoriety: 60, shipIds: ['ship-1'],
      headquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, integrity: 35, maxIntegrity: 100 },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };
    state.pirates.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'tracked', discoveredRound: 2, lastUpdatedRound: 8,
        approximateRegion: { center: { q: 4, r: 4 }, radius: 3 },
        lastKnownHeadquarters: {
          kind: 'coastal-enclave', position: { q: 4, r: 4 }, observedRound: 8,
          integrityBand: 'damaged',
        },
        knownBehavior: 'blockading',
        knownMaritimeStage: 4,
        observedUnitIds: ['ship-1'],
        plannedRelocationDirection: 'north-east',
      },
    };

    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.pirates.intelByCiv.player['pirate-1']).toMatchObject({
      knownBehavior: 'blockading',
      knownMaritimeStage: 4,
      observedUnitIds: ['ship-1'],
      plannedRelocationDirection: 'north-east',
      lastKnownHeadquarters: { integrityBand: 'damaged' },
    });
  });

  it('resolves a missing flotilla flagship into one historical destruction record across repeated normalization', () => {
    const state = createNewGame(undefined, 'pirate-missing-flagship', 'small') as any;
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-7'] = {
      id: 'pirate-7',
      name: 'The Last Horizon',
      behavior: 'blockading',
      maritimeStage: 5,
      notoriety: 10,
      shipIds: ['unit-missing'],
      headquarters: {
        kind: 'deep-sea-flotilla',
        flagshipUnitId: 'unit-missing',
        relocation: { planned: null, lastRelocatedRound: null },
      },
      tributeByCiv: {},
      demandByCiv: {},
      contract: null,
      intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };

    const once = normalizeLoadedStateForTest(state);
    const twice = normalizeLoadedStateForTest(once);

    expect(once.pirates.factions['pirate-7']).toBeUndefined();
    expect(twice.pirates.history.filter(entry => entry.factionId === 'pirate-7' && entry.kind === 'destroyed')).toHaveLength(1);
  });
});
