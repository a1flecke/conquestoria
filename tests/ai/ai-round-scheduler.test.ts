import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import {
  getLivingNonHumanMajorIds,
  processNonHumanMajorRound,
  rotateIdsForRound,
} from '@/ai/ai-round-scheduler';
import type { PreparedMajorCivPlan } from '@/ai/ai-prepared-turn';
import { buildMajorCivPerception } from '@/ai/ai-perception';
import { createEmptyMajorCivPortfolio } from '@/ai/ai-plan-portfolio';
import { foundCity } from '@/systems/city-system';

function prepared(state: ReturnType<typeof createNewGame>, civId: string): PreparedMajorCivPlan {
  const portfolio = createEmptyMajorCivPortfolio();
  return {
    civId,
    perception: buildMajorCivPerception(state, civId),
    portfolio,
    assignments: {
      portfolio,
      assignmentsByPlanId: {},
      recoveryUnitIds: [],
      forceDemands: [],
      rejectedByUnitId: {},
    },
    forceDemands: [],
    traces: [{
      actorId: civId,
      turn: state.turn,
      decision: 'objective',
      selectedId: null,
      candidates: [],
    }],
  };
}

describe('AI round scheduler', () => {
  it('processes every living non-human civilization once in rotating order', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 3,
      gameTitle: 'Scheduler',
      seed: 'scheduler-order',
    });
    state.turn = 1;
    const seen: string[] = [];

    const result = processNonHumanMajorRound(state, new EventBus(), {
      execute: (current, civId) => {
        seen.push(civId);
        return current;
      },
    });

    expect(seen).toEqual(['ai-2', 'ai-3', 'ai-1']);
    expect(result.state.opponentAI?.lastProcessedRound).toBe(1);
    processNonHumanMajorRound(result.state, new EventBus(), {
      execute: (current, civId) => {
        seen.push(civId);
        return current;
      },
    });
    expect(seen).toHaveLength(3);
  });

  it('excludes humans, eliminated AI, and inert empty records but includes cityless settlers', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 3,
      gameTitle: 'Eligibility',
      seed: 'scheduler-eligibility',
    });
    state.civilizations['ai-1'].isEliminated = true;
    state.civilizations['ai-2'].cities = [];
    expect(state.civilizations['ai-2'].units.some(id => state.units[id]?.owner === 'ai-2')).toBe(true);
    state.civilizations['ai-3'].cities = [];
    state.civilizations['ai-3'].units = [];
    for (const [unitId, unit] of Object.entries(state.units)) {
      if (unit.owner === 'ai-3') delete state.units[unitId];
    }

    expect(getLivingNonHumanMajorIds(state)).toEqual(['ai-2']);
  });

  it('freezes the actor list so AI records added during execution wait until next round', () => {
    const state = createNewGame(undefined, 'scheduler-frozen', 'small');
    const execute = vi.fn((current, civId: string) => {
      if (civId === 'ai-1') {
        current.civilizations['ai-new'] = {
          ...structuredClone(current.civilizations['ai-1']),
          id: 'ai-new',
          name: 'Late Arrival',
        };
      }
      return current;
    });

    processNonHumanMajorRound(state, new EventBus(), { execute });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalledWith(expect.anything(), 'ai-new', expect.anything());
  });

  it('handles zero actors and negative or large rotation rounds deterministically', () => {
    expect(rotateIdsForRound([], 4)).toEqual([]);
    expect(rotateIdsForRound(['a', 'b', 'c'], -1)).toEqual(['c', 'a', 'b']);
    expect(rotateIdsForRound(['a', 'b', 'c'], 7)).toEqual(['b', 'c', 'a']);
  });

  it('plans every actor from the same immutable pre-AI snapshot', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Shared snapshot',
      seed: 'scheduler-snapshot',
    });
    const snapshots: Readonly<typeof state>[] = [];

    const result = processNonHumanMajorRound(state, new EventBus(), {
      strategicPlanningEnabled: true,
      prepare: (snapshot, civId) => {
        snapshots.push(snapshot);
        return prepared(snapshot as typeof state, civId);
      },
      executePrepared: current => ({ state: current }),
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toBe(snapshots[1]);
    expect(snapshots[0]).not.toBe(result.state);
    expect(result.traces).toHaveLength(2);
    expect((result.state as typeof result.state & { traces?: unknown }).traces).toBeUndefined();
  });

  it('passes each actor its own prepared perception, assignments, and demand', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Prepared identity',
      seed: 'scheduler-prepared-identity',
    });
    const seen: PreparedMajorCivPlan[] = [];

    processNonHumanMajorRound(state, new EventBus(), {
      strategicPlanningEnabled: true,
      prepare: (snapshot, civId) => {
        const value = prepared(snapshot as typeof state, civId);
        value.forceDemands = [{
          role: 'frontline',
          desired: 1,
          assigned: 0,
          missing: 1,
          priority: 100,
          sourcePlanIds: [`plan-${civId}`],
        }];
        return value;
      },
      executePrepared: (current, value) => {
        seen.push(value);
        return { state: current };
      },
    });

    expect(seen.map(value => value.civId).sort()).toEqual(['ai-1', 'ai-2']);
    for (const value of seen) {
      expect(value.perception.actorId).toBe(value.civId);
      expect(value.assignments.portfolio).toBe(value.portfolio);
      expect(value.forceDemands[0].sourcePlanIds).toEqual([`plan-${value.civId}`]);
    }
  });

  it('skips a prepared action when an earlier actor removes its target', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Stale target',
      seed: 'scheduler-stale-target',
    });
    state.turn = 0;
    const playerSettler = state.civilizations.player.units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'settler')!;
    const targetCity = foundCity('player', playerSettler.position, state.map, state.idCounters);
    state.cities[targetCity.id] = targetCity;
    state.civilizations.player.cities.push(targetCity.id);
    const executed: string[] = [];

    processNonHumanMajorRound(state, new EventBus(), {
      strategicPlanningEnabled: true,
      prepare: (snapshot, civId) => {
        const value = prepared(snapshot as typeof state, civId);
        if (civId === 'ai-2') {
          value.portfolio.primaryPlan = {
            id: 'capture-target',
            actorId: civId,
            objective: 'capture',
            target: { kind: 'city', id: targetCity.id, lastKnownPosition: targetCity.position },
            theaterId: 'test',
            phase: 'attacking',
            reasonCodes: ['nearby-opportunity'],
            commitment: 0.5,
            createdTurn: 0,
            reconsiderAfterTurn: 1,
            expiresAfterTurn: 5,
            lastProgressTurn: 0,
            requiredRoles: { capture: 1 },
            assignedUnitIds: [],
          };
        }
        return value;
      },
      executePrepared: (current, value) => {
        executed.push(value.civId);
        if (value.civId === 'ai-1') {
          const next = structuredClone(current);
          delete next.cities[targetCity.id];
          return { state: next };
        }
        return { state: current };
      },
    });

    expect(executed).toEqual(['ai-1']);
  });

  it('keeps the existing live AI path when strategic planning is disabled', () => {
    const state = createNewGame(undefined, 'scheduler-disabled', 'small');
    const prepare = vi.fn();
    const execute = vi.fn(current => current);

    processNonHumanMajorRound(state, new EventBus(), {
      strategicPlanningEnabled: false,
      prepare,
      execute,
    });

    expect(prepare).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });
});
