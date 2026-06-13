import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, PIRATE_STATE_VERSION } from '@/core/pirate-state';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';

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
          transitionGuards: { emittedEventKeys: ['seen', 'seen'] },
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

    expect(faction.tributeByCiv.player).toBeUndefined();
    expect(faction.contract).toBeNull();
    expect(faction.transitionGuards.emittedEventKeys).toEqual(['seen']);
    expect(normalized.pirates.activationWarningDeliveredByCiv).toEqual({ player: true });
    expect(normalized.pirates.intelByCiv.player).toEqual({});
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
