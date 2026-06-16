import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { confirmBusyWorkerMove } from '@/input/worker-movement-flow';
import { makeEdgeMoveState } from '../systems/unit-movement-system.test-helpers';

describe('worker-movement-flow', () => {
  it('abandons in-progress work and then moves the worker', () => {
    const { state, unitId } = makeEdgeMoveState();
    state.units[unitId] = {
      ...state.units[unitId],
      type: 'worker',
      workerTask: { action: 'farm', coord: { q: 0, r: 1 } },
    };
    state.map.tiles['0,1'].improvement = 'farm';
    state.map.tiles['0,1'].improvementTurnsLeft = 3;

    const result = confirmBusyWorkerMove(state, unitId, { q: 1, r: 1 }, {
      actor: 'player',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.state.units[unitId].workerTask).toBeUndefined();
    expect(result.state.units[unitId].position).toEqual({ q: 1, r: 1 });
    expect(result.state.map.tiles['0,1']).toMatchObject({ improvement: 'none', improvementTurnsLeft: 0 });
  });

  it('is idempotent after the task has already been abandoned', () => {
    const { state, unitId } = makeEdgeMoveState();
    state.units[unitId] = {
      ...state.units[unitId],
      type: 'worker',
      workerTask: { action: 'farm', coord: { q: 0, r: 1 } },
    };
    state.map.tiles['0,1'].improvement = 'farm';
    state.map.tiles['0,1'].improvementTurnsLeft = 3;

    confirmBusyWorkerMove(state, unitId, { q: 1, r: 1 }, { actor: 'player', civId: 'player' });

    expect(() => confirmBusyWorkerMove(state, unitId, { q: 1, r: 2 }, { actor: 'player', civId: 'player' })).not.toThrow();
    expect(state.map.tiles['0,1']).toMatchObject({ improvement: 'none', improvementTurnsLeft: 0 });
  });

  it('keeps in-progress work when the confirmed move fails validation', () => {
    const { state, unitId } = makeEdgeMoveState();
    state.units[unitId] = {
      ...state.units[unitId],
      type: 'worker',
      workerTask: { action: 'farm', coord: { q: 0, r: 1 } },
    };
    state.units.blocker = {
      id: 'blocker',
      type: 'warrior',
      owner: 'barbarian',
      position: { q: 1, r: 1 },
      movementPointsLeft: 2,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };
    state.map.tiles['0,1'].improvement = 'farm';
    state.map.tiles['0,1'].improvementTurnsLeft = 3;
    state.civilizations.player.visibility.tiles['1,1'] = 'visible';

    const result = confirmBusyWorkerMove(state, unitId, { q: 1, r: 1 }, {
      actor: 'player',
      civId: 'player',
      bus: new EventBus(),
    });

    expect(result.ok).toBe(false);
    expect(result.state.units[unitId].workerTask).toEqual({ action: 'farm', coord: { q: 0, r: 1 } });
    expect(result.state.map.tiles['0,1']).toMatchObject({ improvement: 'farm', improvementTurnsLeft: 3 });
  });
});
