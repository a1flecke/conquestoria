import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { chooseGeneralCommandAction, processAIGeneralCommand } from '@/ai/ai-general-command';
import { OPPONENT_CHALLENGE_PROFILES } from '@/core/opponent-challenge';
import type { Unit } from '@/core/types';

function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    generalDefinitionId: 'gen_hannibal', ...overrides,
  } as Unit;
}

describe('#544 MR5 — contract items 80-82: AI uses Rally, Seize, and Last Stand appropriately', () => {
  it('issues Rally when a degraded, damaged ally is in range', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c80' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 30, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'unit-1'];
    expect(chooseGeneralCommandAction(state, 'gen-1')?.ability).toBe('rally');
  });

  it('issues Seize the Moment when an already-acted combat unit is in range and nothing needs healing', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c81' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true, isResting: false,
    } as Unit;
    state.civilizations.player!.units = ['gen-1', 'unit-1'];
    expect(chooseGeneralCommandAction(state, 'gen-1')?.ability).toBe('seize_the_moment');
  });

  it('issues Last Stand when a formation is the only eligible opportunity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c82' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    state.units['defender-1'] = {
      id: 'defender-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.units['defender-2'] = {
      id: 'defender-2', type: 'archer', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'defender-1', 'defender-2'];
    // A visible incoming attacker gives this formation real, non-marginal
    // Last Stand value (contract's "incoming threat" scoring factor) --
    // without one, a bare 2-unit/zero-threat brace falls under the shared
    // spend layer's MINIMUM_OPPORTUNITY_VALUE floor and correctly gets
    // skipped as too marginal to spend a scarce charge on.
    state.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    state.civilizations.player!.diplomacy.atWarWith = [aiId];
    state.units['attacker-1'] = {
      id: 'attacker-1', type: 'warrior', owner: 'player', position: { q: 2, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations.player!.units = [...state.civilizations.player!.units, 'attacker-1'];
    state.civilizations[aiId]!.visibility.tiles = Object.fromEntries(
      Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
    );
    // No eligible Rally target (no landSupply set), no acted unit for
    // Seize -- Last Stand wins by elimination among the three abilities,
    // and now clears the marginal-value floor because of the real threat.
    expect(chooseGeneralCommandAction(state, 'gen-1')?.ability).toBe('last_stand');
  });
});

describe('#544 MR5 — contract item 83: difficulty alters judgment only', () => {
  it('the same scenario produces the same chosen ability at every difficulty', () => {
    const base = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c83' });
    base.units['gen-1'] = makeGeneral();
    base.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 20, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    base.civilizations.player!.units = ['gen-1', 'unit-1'];

    for (const challenge of Object.keys(OPPONENT_CHALLENGE_PROFILES) as Array<keyof typeof OPPONENT_CHALLENGE_PROFILES>) {
      const state = { ...base, opponentChallenge: challenge };
      expect(chooseGeneralCommandAction(state, 'gen-1')?.ability).toBe('rally');
    }
  });

  it('ai-general-command.ts never reads state.opponentChallenge/civ.challenge directly -- only through the single resolveOpponentChallenge(state) call site (source grep)', async () => {
    const fs = await import('node:fs');
    const stripComments = (src: string) => src
      .split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    const source = stripComments(fs.readFileSync('src/ai/ai-general-command.ts', 'utf8'));
    // Direct field access (e.g. `state.opponentChallenge` or `civ.challenge`)
    // would bypass resolveOpponentChallenge's fallback-to-'standard' logic --
    // this codebase's one sanctioned way to read difficulty is always
    // through the resolver, never the raw field.
    expect(source).not.toMatch(/\.opponentChallenge\b/);
    expect(source).not.toMatch(/\.challenge\b/);
    const resolveCallSites = (source.match(/resolveOpponentChallenge\(state\)/g) ?? []).length;
    expect(resolveCallSites).toBe(1);
  });
});

describe('#544 MR5 — contract item 84: no hidden-info AI', () => {
  it('Last Stand never scores threat from a hostile unit outside AI visibility', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'c84' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    state.units['defender-1'] = {
      id: 'defender-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'defender-1'];
    const baselineScore = chooseGeneralCommandAction(state, 'gen-1')?.score ?? 0;

    const withHiddenEnemy = structuredClone(state);
    withHiddenEnemy.civilizations[aiId]!.diplomacy.atWarWith = ['player'];
    withHiddenEnemy.civilizations.player!.diplomacy.atWarWith = [aiId];
    withHiddenEnemy.units['hidden-enemy'] = {
      id: 'hidden-enemy', type: 'warrior', owner: 'player', position: { q: 50, r: 50 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as Unit;
    withHiddenEnemy.civilizations.player!.units = [...withHiddenEnemy.civilizations.player!.units, 'hidden-enemy'];
    // No visibility grant -- default state has nothing revealed at (50,50).
    const hiddenScore = chooseGeneralCommandAction(withHiddenEnemy, 'gen-1')?.score ?? 0;
    expect(hiddenScore).toBe(baselineScore);
  });
});

describe('#544 MR5 — hot-seat privacy', () => {
  it('processAIGeneralCommand only ever touches the acting civ\'s own units', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'hs-1' });
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.units['gen-1'] = makeGeneral({ owner: aiId });
    state.units['unit-1'] = {
      id: 'unit-1', type: 'warrior', owner: aiId, position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 30, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      landSupply: { state: 'severe', hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    } as Unit;
    state.civilizations[aiId]!.units = ['gen-1', 'unit-1'];
    const playerCivBefore = state.civilizations.player;

    const result = processAIGeneralCommand(state, aiId, 'pre-tactical');
    expect(result.civilizations.player).toBe(playerCivBefore);
  });
});
