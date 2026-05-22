import { describe, expect, it, vi } from 'vitest';
import type { CombatResult, GameState } from '@/core/types';
import {
  formatEconomyTreasuryStrainMessage,
  getNotificationTargetsForEvent,
  routeBarbarianSpawned,
  routeCombatRewardEarned,
  routeCombatResolved,
  routeEconomyTreasuryStrain,
  queueFirstContactPendingEvents,
  routeLegendaryWonder,
  routeFactionTransition,
  routeFirstContact,
  routePeaceMade,
  routePeaceRequested,
  routeWarDeclared,
  type NotificationSink,
} from '@/ui/notification-routing';

vi.mock('@/systems/discovery-system', () => ({
  hasMetCivilization: (_s: unknown, viewer: string, target: string) => viewer === 'p2' && target === 'p1',
}));

vi.mock('@/systems/legendary-wonder-definitions', () => ({
  getLegendaryWonderDefinition: (id: string) => ({ id, name: `Wonder(${id})` }),
}));

function makeSink() {
  const calls: Array<{ civId: string; message: string; type: string; target?: unknown }> = [];
  const sink: NotificationSink = (civId, message, type, target) => calls.push({ civId, message, type, target });
  return { sink, calls };
}

function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    turn: 5,
    currentPlayer: 'p3',
    civilizations: {
      p1: { id: 'p1', name: 'Alice', diplomacy: { relationships: {}, atWarWith: [] }, visibility: { tiles: {} } },
      p2: { id: 'p2', name: 'Bob', diplomacy: { relationships: {} }, visibility: { tiles: {} } },
      p3: { id: 'p3', name: 'Carol', diplomacy: { relationships: {} }, visibility: { tiles: {} } },
    } as any,
    units: {},
    cities: { c1: { id: 'c1', name: 'Thebes', owner: 'p1', position: { q: 0, r: 0 } } } as any,
    ...partial,
  } as GameState;
}

describe('notification routing', () => {
  it('war-declared writes to both attacker and defender logs', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeWarDeclared(state, 'p1', 'p2', sink);
    const byCiv = Object.fromEntries(calls.map(c => [c.civId, c]));
    expect(byCiv.p1?.message).toMatch(/War has been declared on Bob/);
    expect(byCiv.p2?.message).toMatch(/Alice has declared war/);
    expect(byCiv.p2?.type).toBe('warning');
    expect(calls.find(c => c.civId === 'p3')).toBeUndefined();
  });

  it('peace-made writes to both parties', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routePeaceMade(state, 'p1', 'p2', sink);
    expect(calls.map(c => c.civId).sort()).toEqual(['p1', 'p2']);
    expect(calls.every(c => c.type === 'success')).toBe(true);
    expect(calls.find(c => c.civId === 'p3')).toBeUndefined();
  });

  it('peace-requested writes only to the recipient civ', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routePeaceRequested(state, 'p1', 'p2', sink);

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p2',
        message: expect.stringMatching(/Alice requests peace/i),
        type: 'info',
      }),
    ]);
  });

  it('routes treasury strain to the affected civilization with the rush-buy consequence', () => {
    const state = makeState({ era: 3 } as Partial<GameState>);
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(
      state,
      { civId: 'p1', level: 'critical', netGoldPerTurn: -12, unpaidMaintenance: 4 },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Rush buy is unavailable/i),
        type: 'warning',
      }),
    ]);
    expect(calls[0]!.message).toMatch(/Unhappiness pressure is rising/i);
  });

  it('keeps low treasury strain actionable and avoids early-era unhappiness messaging', () => {
    const state = makeState({ era: 2 } as Partial<GameState>);
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(
      state,
      { civId: 'p1', level: 'low', netGoldPerTurn: -2, unpaidMaintenance: 2 },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Rush buy is still available/i),
        type: 'warning',
      }),
    ]);
    expect(calls[0]!.message).not.toMatch(/Unhappiness/i);
  });

  it('blocks rush buy at high strain before era-three unhappiness messaging starts', () => {
    const state = makeState({ era: 2 } as Partial<GameState>);
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(
      state,
      { civId: 'p1', level: 'high', netGoldPerTurn: -8, unpaidMaintenance: 5 },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Rush buy is unavailable/i),
        type: 'warning',
      }),
    ]);
    expect(calls[0]!.message).not.toMatch(/Unhappiness/i);
  });

  it('formats treasury strain copy once for logs and immediate toasts', () => {
    const state = makeState({ era: 3 } as Partial<GameState>);
    const event = { civId: 'p1', level: 'high' as const, netGoldPerTurn: -8, unpaidMaintenance: 5 };
    const { sink, calls } = makeSink();

    routeEconomyTreasuryStrain(state, event, sink);

    expect(formatEconomyTreasuryStrainMessage(state, event)).toBe(calls[0]!.message);
    expect(calls[0]!.message).toContain('Treasury strain is high');
    expect(calls[0]!.message).toContain('Rush buy is unavailable until the budget recovers.');
    expect(calls[0]!.message).toContain('Unhappiness pressure is rising.');
  });

  it('first-contact writes encounter messages to both civ logs', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routeFirstContact(state, 'p1', 'p2', sink);

    expect(calls).toEqual([
      expect.objectContaining({ civId: 'p1', message: expect.stringMatching(/encountered Bob/i), type: 'info' }),
      expect.objectContaining({ civId: 'p2', message: expect.stringMatching(/encountered Alice/i), type: 'info' }),
    ]);
  });

  it('first-contact queues hot-seat notable events for both players', () => {
    const state = makeState({ pendingEvents: {} } as Partial<GameState>);

    queueFirstContactPendingEvents(state, 'p1', 'p2');

    expect(state.pendingEvents?.p1).toEqual([
      expect.objectContaining({ type: 'first-contact', message: expect.stringMatching(/Encountered Bob/i), turn: state.turn }),
    ]);
    expect(state.pendingEvents?.p2).toEqual([
      expect.objectContaining({ type: 'first-contact', message: expect.stringMatching(/Encountered Alice/i), turn: state.turn }),
    ]);
  });

  it('combat-resolved writes to the defender owner log even when current player is a third civ', () => {
    const state = makeState({
      currentPlayer: 'p3',
      units: {
        a: { id: 'a', type: 'warrior', owner: 'p1' } as any,
        d: { id: 'd', type: 'warrior', owner: 'p2' } as any,
      },
    } as Partial<GameState>);
    const result: CombatResult = {
      attackerId: 'a', defenderId: 'd',
      attackerDamage: 10, defenderDamage: 20,
      attackerSurvived: true, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const { sink, calls } = makeSink();
    routeCombatResolved(state, result, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p2');
    expect(calls[0]!.message).toMatch(/was attacked by Alice/);
  });

  it('combat-resolved labels barbarian attackers explicitly', () => {
    const state = makeState({
      units: {
        a: { id: 'a', type: 'warrior', owner: 'barbarian' } as any,
        d: { id: 'd', type: 'warrior', owner: 'p3' } as any,
      },
    } as Partial<GameState>);
    const result: CombatResult = {
      attackerId: 'a', defenderId: 'd',
      attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    const { sink, calls } = makeSink();
    routeCombatResolved(state, result, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p3');
    expect(calls[0]!.message).toMatch(/destroyed by Barbarians/);
  });

  it('routes combat reward messages to the rewarded civ only', () => {
    const state = makeState();
    const { sink, calls } = makeSink();

    routeCombatRewardEarned(state, {
      recipientCivId: 'p1',
      recipientUnitId: 'unit-a',
      defeatedUnitId: 'unit-d',
      experienceAwarded: 10,
      healthRestored: 8,
      goldAwarded: 4,
      surprise: null,
      message: 'Combat reward: +10 XP, +8 HP, +4 gold',
    }, sink);

    expect(calls).toEqual([
      { civId: 'p1', message: 'Combat reward: +10 XP, +8 HP, +4 gold', type: 'success' },
    ]);
  });

  it('legendary-wonder-completed fans out to every civ, naming builder only for civs that have met them', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeLegendaryWonder(
      state,
      { type: 'wonder:legendary-completed', civId: 'p1', cityId: 'c1', wonderId: 'great-wall', turnCompleted: 40 },
      sink,
    );
    const byCiv = Object.fromEntries(calls.map(c => [c.civId, c]));
    // Builder sees own-city success message.
    expect(byCiv.p1?.type).toBe('success');
    expect(byCiv.p1?.message).toMatch(/Thebes completed/);
    // p2 mocked as having met p1 → sees builder's civ name.
    expect(byCiv.p2?.message).toMatch(/Alice completed/);
    // p3 has not met p1 → sees redacted label.
    expect(byCiv.p3?.message).toMatch(/A rival civilization completed/);
  });

  it('legendary-wonder-race-revealed targets the observer only', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeLegendaryWonder(
      state,
      { type: 'wonder:legendary-race-revealed', observerId: 'p2', civId: 'p1', cityId: 'c1', wonderId: 'great-wall' },
      sink,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p2');
  });

  it('routes breakaway-started as a critical warning to the origin owner', () => {
    const state = makeState({
      turn: 34,
      cities: {
        paris: { id: 'paris', name: 'Paris', owner: 'breakaway-paris', position: { q: 4, r: 2 } },
      } as any,
      civilizations: {
        p1: { id: 'p1', name: 'France', diplomacy: { relationships: {}, atWarWith: [] }, visibility: { tiles: {} } },
        'breakaway-paris': {
          id: 'breakaway-paris',
          name: 'Paris Secession',
          diplomacy: { relationships: {}, atWarWith: [] },
          visibility: { tiles: {} },
          breakaway: { originOwnerId: 'p1', originCityId: 'paris', startedTurn: 34, establishesOnTurn: 84, status: 'secession' },
        },
      } as any,
    });
    const { sink, calls } = makeSink();

    routeFactionTransition(
      state,
      { type: 'faction:breakaway-started', cityId: 'paris', oldOwner: 'p1', breakawayId: 'breakaway-paris' },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Paris.*broken away/i),
        type: 'warning',
      }),
    ]);
  });

  it('routes recurring breakaway critical status to the origin owner', () => {
    const state = makeState({
      turn: 35,
      cities: {
        paris: { id: 'paris', name: 'Paris', owner: 'breakaway-paris', position: { q: 4, r: 2 } },
      } as any,
      civilizations: {
        p1: { id: 'p1', name: 'France', diplomacy: { relationships: {}, atWarWith: [] }, visibility: { tiles: {} } },
        'breakaway-paris': {
          id: 'breakaway-paris',
          name: 'Paris Secession',
          diplomacy: { relationships: {}, atWarWith: [] },
          visibility: { tiles: {} },
          breakaway: { originOwnerId: 'p1', originCityId: 'paris', startedTurn: 34, establishesOnTurn: 84, status: 'secession' },
        },
      } as any,
    });
    const { sink, calls } = makeSink();

    routeFactionTransition(
      state,
      { type: 'faction:critical-status', cityId: 'paris', owner: 'p1', status: 'breakaway', breakawayId: 'breakaway-paris' },
      sink,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        civId: 'p1',
        message: expect.stringMatching(/Paris.*still in secession/i),
        type: 'warning',
      }),
    ]);
  });

  it('legendary-wonder-ready targets the builder only', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeLegendaryWonder(
      state,
      { type: 'wonder:legendary-ready', civId: 'p1', cityId: 'c1', wonderId: 'great-wall' },
      sink,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
  });

  it('barbarian-spawned notifies every civ whose visibility covers the tile, once per camp', () => {
    const state = makeState();
    (state.civilizations.p1 as any).visibility = { tiles: { '0,0': 'visible' } };
    (state.civilizations.p2 as any).visibility = { tiles: { '0,0': 'fog' } };
    const dedup = new Map<string, Set<string>>();
    const { sink, calls } = makeSink();
    const isVisible = (vis: any, pos: { q: number; r: number }) =>
      vis?.tiles?.[`${pos.q},${pos.r}`] === 'visible';

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-1', dedup, sink, isVisible);
    expect(calls.map(c => c.civId)).toEqual(['p1']);
    expect(calls[0]!.target).toEqual({
      kind: 'map',
      coord: { q: 0, r: 0 },
      label: 'Barbarian raiders',
    });

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-1', dedup, sink, isVisible);
    expect(calls).toHaveLength(1);

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-2', dedup, sink, isVisible);
    expect(calls.map(c => c.civId)).toEqual(['p1', 'p1']);
  });

  it('routes territory improvement transfer notifications to involved civs and visible observers', () => {
    const state = makeState();
    (state.civilizations.p1 as any).visibility = { tiles: { '5,5': 'visible' } };
    (state.civilizations.p2 as any).visibility = { tiles: { '5,5': 'visible' } };
    (state.civilizations.p3 as any).visibility = { tiles: { '5,5': 'visible' } };

    const targets = getNotificationTargetsForEvent(state, {
      type: 'territory:tile-flipped',
      coord: { q: 5, r: 5 },
      previousOwner: 'p1',
      newOwner: 'p2',
      improvement: 'farm',
      constructionCancelled: false,
    });

    expect(targets.sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('improvement completion routing', () => {
  it('routes improvement completion to the builder, not the current player', () => {
    const calls: Array<{ civId: string; message: string }> = [];
    const sink: NotificationSink = (civId, message) => calls.push({ civId, message });

    // Builder is p1, current player is p2 (last to end their turn)
    sink('p1', 'Mine completed!', 'success');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p1');
    expect(calls[0]!.message).toBe('Mine completed!');
    expect(calls.find(c => c.civId === 'p2')).toBeUndefined();
  });
});

describe('bus listener routing contract', () => {
  it('appendToCivLog routes to the correct civ even when a different player is current', () => {
    const calls: Array<{ civId: string; message: string }> = [];
    const sink: NotificationSink = (civId, message) => calls.push({ civId, message });

    // Simulate p1's tech/city events completing while currentPlayer = p2
    sink('p1', 'Research complete: Bronze Working!', 'success');
    sink('p1', 'Springfield grew to 3 population!', 'success');
    sink('p1', 'Springfield: granary completed!', 'success');

    const p1Calls = calls.filter(c => c.civId === 'p1');
    const p2Calls = calls.filter(c => c.civId === 'p2');
    expect(p1Calls).toHaveLength(3);
    expect(p2Calls).toHaveLength(0);
  });
});
