import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { normalizeLoadedState } from '@/storage/save-manager';
import {
  startE2ERuntime,
  type E2ERuntimeDependencies,
} from '@/testing/e2e-runtime';

function dependencies(
  state = createNewGame(undefined, 'e2e-runtime'),
  spritePromise: Promise<void> = Promise.resolve(),
): E2ERuntimeDependencies & { enterSoloCampaign: ReturnType<typeof vi.fn> } {
  const enterSoloCampaign = vi.fn(() => spritePromise);
  return {
    loadAutosave: vi.fn(async () => ({
      state: normalizeLoadedState(state),
      source: { id: 'autosave:e2e-runtime:1', kind: 'autosave' as const },
    })),
    enterSoloCampaign,
    getVisibleHexCopies: vi.fn(() => [{ x: 10, y: 20 }]),
    getCityBadgeSlots: vi.fn(() => []),
  };
}

describe('startE2ERuntime', () => {
  it('rejects missing challenge and hot-seat autosaves before entry', async () => {
    const withoutChallenge = createNewGame(undefined, 'e2e-runtime-missing-challenge');
    delete withoutChallenge.opponentChallenge;
    const invalidChallengeDeps = dependencies(withoutChallenge);
    await expect(startE2ERuntime(invalidChallengeDeps)).rejects.toThrow(/opponent challenge/i);
    expect(invalidChallengeDeps.enterSoloCampaign).not.toHaveBeenCalled();

    const hotSeatState = createNewGame(undefined, 'e2e-runtime-hot-seat');
    hotSeatState.hotSeat = { playerCount: 2, mapSize: 'small', players: [] };
    const hotSeatBefore = structuredClone(hotSeatState);
    const hotSeatDeps = dependencies(hotSeatState);
    await expect(startE2ERuntime(hotSeatDeps)).rejects.toThrow(/hot-seat/i);
    expect(hotSeatDeps.enterSoloCampaign).not.toHaveBeenCalled();
    expect(hotSeatState).toEqual(hotSeatBefore);
  });

  it.each(['explorer', 'standard', 'veteran'] as const)(
    'accepts %s without resolving or rewriting it',
    async opponentChallenge => {
      const state = createNewGame(undefined, `e2e-runtime-${opponentChallenge}`);
      state.opponentChallenge = opponentChallenge;
      const deps = dependencies(state);

      await startE2ERuntime(deps);

      expect(deps.enterSoloCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ opponentChallenge }),
      );
    },
  );

  it('rejects an unknown challenge without entering', async () => {
    const state = createNewGame(undefined, 'e2e-runtime-unknown-challenge');
    state.opponentChallenge = 'impossible' as never;
    const deps = dependencies(state);

    await expect(startE2ERuntime(deps)).rejects.toThrow(/valid opponent challenge/i);
    expect(deps.enterSoloCampaign).not.toHaveBeenCalled();
  });

  it('exposes only frozen readiness and serialized geometry queries', async () => {
    const deps = dependencies();
    const runtime = await startE2ERuntime(deps);

    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Object.keys(runtime).sort()).toEqual([
      'errors', 'getCityBadgeSlots', 'getVisibleHexCopies', 'readiness',
    ]);
    expect(runtime.getVisibleHexCopies({ q: 0, r: 0 })).toEqual([{ x: 10, y: 20 }]);
    expect(runtime).not.toHaveProperty('gameState');
    expect(runtime).not.toHaveProperty('camera');
    expect(runtime).not.toHaveProperty('renderLoop');
  });

  it('records sprite rejection without blocking campaign readiness', async () => {
    const deps = dependencies(
      createNewGame(undefined, 'e2e-runtime-sprite-rejection'),
      Promise.reject(new Error('bad sprite')),
    );
    const runtime = await startE2ERuntime(deps);

    expect(runtime.readiness()).toContain('campaign-ready');
    await Promise.resolve();
    expect(runtime.readiness()).not.toContain('sprites-ready');
    expect(runtime.errors()).toContainEqual(expect.stringContaining('bad sprite'));
  });
});
