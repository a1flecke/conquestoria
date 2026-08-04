import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('refresh bypass debt', () => {
  it('tracks how many state writes still bypass the refresh path', () => {
    const main = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf8');
    const bypasses = main.match(/setStateWithoutRefresh\(/g)?.length ?? 0;
    // Ratchet only. Lower when you eliminate a bypass; never raise it.
    //
    // 47, not the plan's estimated 46: the estimate came from grepping for
    // `gameState = …` with no nearby `renderLoop.setGameState`, which counts a
    // write whose only refresh is `updateHUD()` (main.ts's beast-hoard choice)
    // as already-refreshing. Folding that one into commit() would add a map
    // refresh the player does not get today — a behaviour change Phase 11 owns.
    expect(bypasses).toBeLessThanOrEqual(47);
  });
});
