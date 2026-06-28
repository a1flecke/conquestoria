import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import {
  getLivingNonHumanMajorIds,
  processNonHumanMajorRound,
  rotateIdsForRound,
} from '@/ai/ai-round-scheduler';

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
});
