import { describe, expect, it, vi } from 'vitest';
import type { CombatResult, GameState } from '@/core/types';
import {
  routeBarbarianSpawned,
  routeCombatResolved,
  routeLegendaryWonder,
  routeFactionTransition,
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
  const calls: Array<{ civId: string; message: string; type: string }> = [];
  const sink: NotificationSink = (civId, message, type) => calls.push({ civId, message, type });
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

  it('legendary-wonder-completed fans out to every civ, naming builder only for civs that have met them', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeLegendaryWonder(
      state,
      { type: 'wonder:legendary-completed', civId: 'p1', cityId: 'c1', wonderId: 'great-wall' },
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

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-1', dedup, sink, isVisible);
    expect(calls).toHaveLength(1);

    routeBarbarianSpawned(state, { q: 0, r: 0 }, 'camp-2', dedup, sink, isVisible);
    expect(calls.map(c => c.civId)).toEqual(['p1', 'p1']);
  });
});
