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
      prepare: (snapshot, civId) => prepared(snapshot as typeof state, civId),
      executePrepared: (current, value) => {
        seen.push(value.civId);
        return { state: current };
      },
    });

    expect(seen).toEqual(['ai-2', 'ai-3', 'ai-1']);
    expect(result.state.opponentAI?.lastProcessedRound).toBe(1);
    processNonHumanMajorRound(result.state, new EventBus(), {
      prepare: (snapshot, civId) => prepared(snapshot as typeof state, civId),
      executePrepared: (current, value) => {
        seen.push(value.civId);
        return { state: current };
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
    const executePrepared = vi.fn((current, value: PreparedMajorCivPlan) => {
      if (value.civId === 'ai-1') {
        current.civilizations['ai-new'] = {
          ...structuredClone(current.civilizations['ai-1']),
          id: 'ai-new',
          name: 'Late Arrival',
        };
      }
      return { state: current };
    });

    processNonHumanMajorRound(state, new EventBus(), {
      prepare: (snapshot, civId) => prepared(snapshot as typeof state, civId),
      executePrepared,
    });

    expect(executePrepared).toHaveBeenCalledTimes(1);
    expect(executePrepared.mock.calls.every(([, value]) => value.civId !== 'ai-new')).toBe(true);
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
      prepare: (snapshot, civId) => {
        const value = prepared(snapshot as typeof state, civId);
        value.portfolio.primaryPlan = {
          id: `plan-${civId}`,
          actorId: civId,
          objective: 'expand',
          target: {
            kind: 'region',
            id: `region-${civId}`,
            anchor: { q: 0, r: 0 },
          },
          theaterId: 'home',
          phase: 'mobilizing',
          reasonCodes: ['nearby-opportunity'],
          commitment: 0.5,
          createdTurn: state.turn,
          reconsiderAfterTurn: state.turn + 2,
          expiresAfterTurn: state.turn + 8,
          lastProgressTurn: state.turn,
          requiredRoles: { settlement: 1 },
          assignedUnitIds: [],
        };
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

  it('executes the prepared strategic path by default when planning is enabled', () => {
    const state = createNewGame(undefined, 'scheduler-live-strategy', 'small');
    const settlerId = state.civilizations['ai-1'].units
      .find(unitId => state.units[unitId]?.type === 'settler');
    if (!settlerId) throw new Error('missing AI settler');
    const founded = vi.fn();
    const bus = new EventBus();
    bus.on('city:founded', founded);

    const result = processNonHumanMajorRound(state, bus, {
      prepare: (snapshot, civId) => {
        const value = prepared(snapshot as typeof state, civId);
        const settler = state.units[settlerId];
        value.portfolio.primaryPlan = {
          id: 'settle-home',
          actorId: civId,
          objective: 'expand',
          target: {
            kind: 'region',
            id: 'home',
            anchor: { ...settler.position },
          },
          theaterId: 'home',
          phase: 'attacking',
          reasonCodes: ['nearby-opportunity'],
          commitment: 0.5,
          createdTurn: state.turn,
          reconsiderAfterTurn: state.turn + 2,
          expiresAfterTurn: state.turn + 8,
          lastProgressTurn: state.turn,
          requiredRoles: { settlement: 1 },
          assignedUnitIds: [settlerId],
        };
        value.assignments.assignmentsByPlanId = {
          'settle-home': [settlerId],
        };
        return value;
      },
    });

    expect(result.state.units[settlerId]).toBeUndefined();
    expect(result.state.civilizations['ai-1'].cities).toHaveLength(1);
    expect(founded).toHaveBeenCalledOnce();
  });

  it('drops a stale primary action while preserving valid defense work', () => {
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
    const aiTwoSettler = state.civilizations['ai-2'].units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'settler')!;
    const defendedCity = foundCity('ai-2', aiTwoSettler.position, state.map, state.idCounters);
    state.cities[defendedCity.id] = defendedCity;
    state.civilizations['ai-2'].cities.push(defendedCity.id);
    const executed: PreparedMajorCivPlan[] = [];

    const result = processNonHumanMajorRound(state, new EventBus(), {
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
          value.portfolio.defensePlansByCityId[defendedCity.id] = {
            id: 'defend-home',
            actorId: civId,
            objective: 'defend',
            target: {
              kind: 'city',
              id: defendedCity.id,
              lastKnownPosition: defendedCity.position,
            },
            theaterId: 'home',
            phase: 'mobilizing',
            reasonCodes: ['urgent-defense'],
            commitment: 1,
            createdTurn: 0,
            reconsiderAfterTurn: 1,
            expiresAfterTurn: 5,
            lastProgressTurn: 0,
            requiredRoles: { frontline: 1 },
            assignedUnitIds: [],
          };
        }
        return value;
      },
      executePrepared: (current, value) => {
        executed.push(value);
        if (value.civId === 'ai-1') {
          const next = structuredClone(current);
          delete next.cities[targetCity.id];
          return { state: next };
        }
        return { state: current };
      },
    });

    expect(executed.map(value => value.civId)).toEqual(['ai-1', 'ai-2']);
    expect(executed[1].portfolio.primaryPlan).toBeNull();
    expect(executed[1].portfolio.defensePlansByCityId[defendedCity.id]).toBeDefined();
    expect(result.state.opponentAI?.majorCivs['ai-2']?.primaryPlan).toBeNull();
  });

  it('removes stale defense plans before prepared execution', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Stale defense',
      seed: 'scheduler-stale-defense',
    });
    state.turn = 0;
    const aiTwoSettler = state.civilizations['ai-2'].units
      .map(id => state.units[id])
      .find(unit => unit?.type === 'settler')!;
    const defendedCity = foundCity('ai-2', aiTwoSettler.position, state.map, state.idCounters);
    state.cities[defendedCity.id] = defendedCity;
    state.civilizations['ai-2'].cities.push(defendedCity.id);
    let executedAiTwo: PreparedMajorCivPlan | null = null;

    const result = processNonHumanMajorRound(state, new EventBus(), {
      prepare: (snapshot, civId) => {
        const value = prepared(snapshot as typeof state, civId);
        if (civId === 'ai-2') {
          value.portfolio.primaryPlan = {
            id: 'expand-valid',
            actorId: civId,
            objective: 'expand',
            target: {
              kind: 'region',
              id: 'safe-region',
              anchor: aiTwoSettler.position,
            },
            theaterId: 'home',
            phase: 'mobilizing',
            reasonCodes: ['nearby-opportunity'],
            commitment: 0.5,
            createdTurn: 0,
            reconsiderAfterTurn: 2,
            expiresAfterTurn: 8,
            lastProgressTurn: 0,
            requiredRoles: { settlement: 1 },
            assignedUnitIds: [],
          };
          value.portfolio.defensePlansByCityId[defendedCity.id] = {
            id: 'defend-stale',
            actorId: civId,
            objective: 'defend',
            target: {
              kind: 'city',
              id: defendedCity.id,
              lastKnownPosition: defendedCity.position,
            },
            theaterId: 'home',
            phase: 'mobilizing',
            reasonCodes: ['urgent-defense'],
            commitment: 1,
            createdTurn: 0,
            reconsiderAfterTurn: 1,
            expiresAfterTurn: 6,
            lastProgressTurn: 0,
            requiredRoles: { frontline: 1 },
            assignedUnitIds: [],
          };
          value.forceDemands = [{
            role: 'frontline',
            desired: 2,
            assigned: 0,
            missing: 2,
            priority: 600,
            sourcePlanIds: ['defend-stale', 'expand-valid'],
          }, {
            role: 'recon',
            desired: 1,
            assigned: 0,
            missing: 1,
            priority: 600,
            sourcePlanIds: ['defend-stale'],
          }];
          value.assignments.forceDemands = value.forceDemands;
        }
        return value;
      },
      executePrepared: (current, value) => {
        if (value.civId === 'ai-1') {
          const next = structuredClone(current);
          delete next.cities[defendedCity.id];
          return { state: next };
        }
        executedAiTwo = value;
        return { state: current };
      },
    });

    expect(executedAiTwo).not.toBeNull();
    expect(executedAiTwo!.portfolio.defensePlansByCityId).toEqual({});
    expect(executedAiTwo!.forceDemands).toEqual([
      expect.objectContaining({
        role: 'frontline',
        sourcePlanIds: ['expand-valid'],
      }),
    ]);
    expect(result.state.opponentAI?.majorCivs['ai-2']?.defensePlansByCityId).toEqual({});
  });

  it('skips a resource objective claimed peacefully after preparation', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'small',
      opponentCount: 2,
      gameTitle: 'Stale resource',
      seed: 'scheduler-stale-resource',
    });
    state.turn = 0;
    const targetTile = Object.values(state.map.tiles)[0];
    targetTile.resource = 'iron';
    targetTile.owner = null;
    const executed: Array<{
      civId: string;
      hasPrimaryPlan: boolean;
    }> = [];

    const result = processNonHumanMajorRound(state, new EventBus(), {
      prepare: (snapshot, civId) => {
        const value = prepared(snapshot as typeof state, civId);
        if (civId === 'ai-2') {
          value.portfolio.primaryPlan = {
            id: 'secure-iron',
            actorId: civId,
            objective: 'secure-resource',
            target: {
              kind: 'resource',
              resource: 'iron',
              position: targetTile.coord,
            },
            theaterId: 'resource',
            phase: 'mobilizing',
            reasonCodes: ['nearby-opportunity'],
            commitment: 0.5,
            createdTurn: 0,
            reconsiderAfterTurn: 2,
            expiresAfterTurn: 8,
            lastProgressTurn: 0,
            requiredRoles: { 'resource-expedition': 1 },
            assignedUnitIds: [],
          };
        }
        return value;
      },
      executePrepared: (current, value) => {
        executed.push({
          civId: value.civId,
          hasPrimaryPlan: value.portfolio.primaryPlan !== null,
        });
        if (value.civId === 'ai-1') {
          const next = structuredClone(current);
          next.map.tiles[`${targetTile.coord.q},${targetTile.coord.r}`].owner = 'player';
          return { state: next };
        }
        return { state: current };
      },
    });

    expect(executed).toEqual([
      { civId: 'ai-1', hasPrimaryPlan: false },
      { civId: 'ai-2', hasPrimaryPlan: false },
    ]);
    expect(result.state.opponentAI?.majorCivs['ai-2']?.primaryPlan).toBeNull();
  });

  it('isolates a failed actor preparation and reports it without blocking peers', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'small',
      opponentCount: 2,
      gameTitle: 'Planner isolation',
      seed: 'scheduler-wrong-actor',
    });
    const executed: string[] = [];

    const result = processNonHumanMajorRound(state, new EventBus(), {
      prepare: (snapshot, civId) => civId === 'ai-1'
        ? {
            ...prepared(snapshot as typeof state, civId),
            civId: 'player',
          }
        : prepared(snapshot as typeof state, civId),
      executePrepared: (current, value) => {
        executed.push(value.civId);
        return { state: current };
      },
    });

    expect(executed).toEqual(['ai-2']);
    expect(result.planningErrors).toEqual([expect.objectContaining({
      actorId: 'ai-1',
      phase: 'prepare',
      message: expect.stringMatching(/prepared actor/i),
    })]);
  });

  it('never plans or executes additional hot-seat humans', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Hot seat scheduler',
      seed: 'scheduler-hot-seat',
    });
    state.civilizations['ai-2'].isHuman = true;
    const preparedIds: string[] = [];
    const executedIds: string[] = [];

    processNonHumanMajorRound(state, new EventBus(), {
      prepare: (snapshot, civId) => {
        preparedIds.push(civId);
        return prepared(snapshot as typeof state, civId);
      },
      executePrepared: (current, value) => {
        executedIds.push(value.civId);
        return { state: current };
      },
    });

    expect(preparedIds).toEqual(['ai-1']);
    expect(executedIds).toEqual(['ai-1']);
  });
});
