import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('refresh bypass debt', () => {
  it('tracks how many state writes still bypass the refresh path', () => {
    const main = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf8');
    const bypasses = main.match(/setStateWithoutRefresh\(/g)?.length ?? 0;
    // Ratchet only. Lower when you eliminate a bypass; never raise it.
    //
    // 64, not the plan's estimated 46-48: a write folds into commit() only when
    // BOTH renderLoop.setGameState(...) and updateHUD() are the *immediately
    // following* statements, with nothing else between the write and them —
    // no notification, no bus.emit, no other side effect. That is deliberately
    // stricter than "anywhere in the same synchronous block": an earlier,
    // looser version of this fold (permitting intervening statements as long
    // as no bus.emit was among them) silently reordered ~15 sites' event
    // emissions, notifications, and visibility refreshes to run after the
    // renderer/HUD refresh instead of before — never observable as a paint
    // artifact (nothing yields mid-block), but still a real change to when
    // those side effects fire relative to the commit, which the plan's
    // "behavior-preserving, no judgment calls" rule forbids. Strict adjacency
    // is the only fold rule that can't reorder anything, by construction.
    expect(bypasses).toBeLessThanOrEqual(64);
  });
});
