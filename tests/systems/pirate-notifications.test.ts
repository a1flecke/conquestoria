import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import {
  applyPirateNotifications,
  type PirateNotificationEvent,
} from '@/systems/pirate-notifications';

function fixture() {
  const state = createNewGame(undefined, 'pirate-notifications', 'small');
  state.turn = 14;
  state.pirates = createEmptyPirateState();
  state.pirates.factions['pirate-1'] = {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'raiding', maritimeStage: 3,
    notoriety: 3, shipIds: [],
    headquarters: { kind: 'coastal-enclave', position: { q: 3, r: 3 }, integrity: 100, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
    transitionGuards: { emittedEventKeys: [] },
  } satisfies PirateFactionState;
  state.pirates.intelByCiv.player = {
    'pirate-1': { factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 14 },
  };
  return state;
}

describe('pirate notifications', () => {
  it('groups routine events once per viewer, faction, and round across replay', () => {
    const state = fixture();
    const events: PirateNotificationEvent[] = [
      { type: 'sighting', factionId: 'pirate-1', viewerId: 'player' },
      { type: 'raid', factionId: 'pirate-1', viewerId: 'player', amount: 8 },
      { type: 'relocated', factionId: 'pirate-1', viewerId: 'player' },
    ];

    const first = applyPirateNotifications(state, events);
    const replay = applyPirateNotifications(first, events);

    expect(first.notificationLog!.player).toHaveLength(1);
    expect(first.notificationLog!.player[0].message).toMatch(/3 pirate updates/i);
    expect(replay.notificationLog!.player).toHaveLength(1);
  });

  it('keeps demand, blockade, exposure, and destruction individually visible and reviewable', () => {
    const state = fixture();
    const events: PirateNotificationEvent[] = [
      { type: 'demand', factionId: 'pirate-1', viewerId: 'player', cost: 40 },
      { type: 'blockade', factionId: 'pirate-1', viewerId: 'player', cityId: 'port' },
      { type: 'contract-exposed', factionId: 'pirate-1', viewerId: 'player' },
      { type: 'destroyed', factionId: 'pirate-1', viewerId: 'player', historyId: 'history-1' },
    ];

    const next = applyPirateNotifications(state, events);

    expect(next.notificationLog!.player).toHaveLength(4);
    expect(next.notificationLog!.player.map(entry => entry.review)).toEqual([
      { kind: 'pirate-faction', factionId: 'pirate-1' },
      { kind: 'pirate-faction', factionId: 'pirate-1' },
      { kind: 'pirate-faction', factionId: 'pirate-1' },
      { kind: 'pirate-history', historyId: 'history-1' },
    ]);
  });

  it('delivers only to explicitly named viewers', () => {
    const state = fixture();
    const next = applyPirateNotifications(state, [
      { type: 'blockade', factionId: 'pirate-1', viewerId: 'player', cityId: 'port' },
    ]);
    expect(next.notificationLog!.player).toHaveLength(1);
    expect(next.notificationLog!['ai-1']).toBeUndefined();
  });
});
