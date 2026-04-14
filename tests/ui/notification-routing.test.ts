import { describe, expect, it } from 'vitest';
import type { CombatResult, GameState } from '@/core/types';
import {
  routeCombatResolved,
  routePeaceMade,
  routeWarDeclared,
  type NotificationSink,
} from '@/ui/notification-routing';

function makeSink() {
  const calls: Array<{ civId: string; message: string; type: string }> = [];
  const sink: NotificationSink = (civId, message, type) => calls.push({ civId, message, type });
  return { sink, calls };
}

function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    civilizations: {
      p1: { id: 'p1', name: 'Alice', diplomacy: { relationships: {}, atWarWith: [] } },
      p2: { id: 'p2', name: 'Bob', diplomacy: { relationships: {} } },
      p3: { id: 'p3', name: 'Carol', diplomacy: { relationships: {} } },
    } as any,
    units: {},
    ...partial,
  } as GameState;
}

describe('notification routing', () => {
  it('war-declared writes to both attacker and defender logs', () => {
    const state = makeState();
    const { sink, calls } = makeSink();
    routeWarDeclared(state, 'p1', 'p2', sink);
    const byCiv = Object.fromEntries(calls.map(c => [c.civId, c]));
    expect(byCiv.p1?.message).toMatch(/You declared war on Bob/);
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

  it('combat-resolved writes to the defender owner log, not the current player', () => {
    const state = makeState({
      units: {
        a: { id: 'a', type: 'warrior', owner: 'p1' } as any,
        d: { id: 'd', type: 'warrior', owner: 'p2' } as any,
      },
    });
    const result: CombatResult = {
      attackerId: 'a',
      defenderId: 'd',
      attackerDamage: 10,
      defenderDamage: 20,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };
    const { sink, calls } = makeSink();
    routeCombatResolved(state, result, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p2');
    expect(calls[0]!.message).toMatch(/was attacked by Alice/);
  });

  it('combat-resolved labels barbarian attackers explicitly and still targets defender owner', () => {
    const state = makeState({
      units: {
        a: { id: 'a', type: 'warrior', owner: 'barbarian' } as any,
        d: { id: 'd', type: 'warrior', owner: 'p3' } as any,
      },
    });
    const result: CombatResult = {
      attackerId: 'a',
      defenderId: 'd',
      attackerDamage: 0,
      defenderDamage: 100,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 },
      defenderPosition: { q: 1, r: 0 },
    };
    const { sink, calls } = makeSink();
    routeCombatResolved(state, result, sink);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.civId).toBe('p3');
    expect(calls[0]!.message).toMatch(/destroyed by Barbarians/);
  });
});
