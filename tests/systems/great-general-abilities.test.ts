import { describe, expect, it, vi } from 'vitest';
import { getHeroicCommandEligibility, spendHeroicCommandCharge, getRallyPreview, issueRally } from '@/systems/great-general-abilities';
import { createNewGame } from '@/core/game-state';
import type { Unit } from '@/core/types';

export function makeGeneral(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'gen-1',
    type: 'great_general',
    owner: 'player',
    position: { q: 0, r: 0 },
    movementPointsLeft: 3,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    generalDefinitionId: 'gen_caesar',
    ...overrides,
  } as Unit;
}

describe('getHeroicCommandEligibility', () => {
  it('is eligible with full charges, no cooldown, and no spawn-turn restriction', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-1' });
    const result = getHeroicCommandEligibility(state, makeGeneral());
    expect(result.eligible).toBe(true);
    expect(result.chargesRemaining).toBe(3);
    expect(result.isFinalCharge).toBe(false);
  });

  it('is ineligible on the General\'s spawn turn (contract §13/§17)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-2' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalNoCommandThisTurn: true }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/next turn/i);
  });

  it('is ineligible with zero charges remaining', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-3' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandChargesUsed: 3 }));
    expect(result.eligible).toBe(false);
    expect(result.chargesRemaining).toBe(0);
  });

  it('is ineligible while on cooldown, and reports turns remaining', () => {
    const state = { ...createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-4' }), turn: 5 };
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandCooldownUntilTurn: 12 }));
    expect(result.eligible).toBe(false);
    expect(result.cooldownTurnsRemaining).toBe(7);
  });

  it('flags the 3rd charge as isFinalCharge (Final Command, contract §21)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-5' });
    const result = getHeroicCommandEligibility(state, makeGeneral({ generalCommandChargesUsed: 2 }));
    expect(result.eligible).toBe(true);
    expect(result.chargesRemaining).toBe(1);
    expect(result.isFinalCharge).toBe(true);
  });
});

describe('spendHeroicCommandCharge', () => {
  it('increments generalCommandChargesUsed and starts the shared cooldown from the definition', () => {
    const state = { ...createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-6' }), turn: 8 };
    state.units['gen-1'] = makeGeneral();
    const result = spendHeroicCommandCharge(state, 'gen-1');
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
    expect(result.units['gen-1'].generalCommandCooldownUntilTurn).toBe(18); // turn 8 + cooldownTurns 10
  });

  it('is a no-op state pass-through when the unit id does not resolve to a General', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'abil-7' });
    const result = spendHeroicCommandCharge(state, 'nonexistent');
    expect(result).toBe(state);
  });
});

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 1, health: 40, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  } as Unit;
}

describe('getRallyPreview / issueRally', () => {
  function setup(severity: 'grace' | 'degraded' | 'severe' = 'severe', health = 40) {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-1' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({
      health,
      landSupply: { state: severity, hostileUnsupportedTurns: 5, suppliedTurnsSinceRecovery: 0 },
    });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    return state;
  }

  it('previews the stage transition: severe -> degraded', () => {
    const preview = getRallyPreview(setup('severe'), 'gen-1');
    expect(preview.targets).toHaveLength(1);
    expect(preview.targets[0].stageBefore).toBe('severe');
    expect(preview.targets[0].stageAfter).toBe('degraded');
  });

  it('previews the stage transition: degraded -> grace', () => {
    const preview = getRallyPreview(setup('degraded'), 'gen-1');
    expect(preview.targets[0].stageAfter).toBe('grace');
  });

  it('grace does not reduce further (contract §18: "no extra stage reduction")', () => {
    const preview = getRallyPreview(setup('grace'), 'gen-1');
    expect(preview.targets[0].stageAfter).toBe('grace');
  });

  it('restores bounded HP up to 100, never above', () => {
    const preview = getRallyPreview(setup('severe', 90), 'gen-1');
    expect(preview.targets[0].healthAfter).toBe(100);
    expect(preview.targets[0].healthAfter).toBeLessThanOrEqual(100);
  });

  it('does NOT set Full Supply (contract §18: "Rally does not make units Full Supply")', () => {
    const state = setup('severe');
    const result = issueRally(state, 'gen-1');
    expect(result.units['unit-1'].landSupply!.state).not.toBe('full');
    expect(result.units['unit-1'].landSupply!.state).toBe('degraded');
  });

  it('sets rallyProtectedThisRound on every targeted unit', () => {
    const result = issueRally(setup('severe'), 'gen-1');
    expect(result.units['unit-1'].rallyProtectedThisRound).toBe(true);
  });

  it('spends exactly one charge and starts the shared cooldown', () => {
    const state = { ...setup('severe'), turn: 3 };
    const result = issueRally(state, 'gen-1');
    expect(result.units['gen-1'].generalCommandChargesUsed).toBe(1);
    expect(result.units['gen-1'].generalCommandCooldownUntilTurn).toBe(13);
  });

  it('is a no-op when the General is ineligible (e.g. on cooldown)', () => {
    const state = setup('severe');
    state.units['gen-1'] = { ...state.units['gen-1'], generalCommandCooldownUntilTurn: 999 };
    const result = issueRally(state, 'gen-1');
    expect(result).toBe(state);
  });

  it('does NOT spend a charge when there are zero eligible targets (review fix: never waste a lifetime charge on a no-op)', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-4' });
    state.units['gen-1'] = makeGeneral(); // no other units in range at all
    state.civilizations.player.units = ['gen-1'];
    const result = issueRally(state, 'gen-1');
    expect(result).toBe(state);
    expect(result.units['gen-1'].generalCommandChargesUsed).toBeUndefined();
  });

  it('excludes full-supply and stable-unsupported units from targeting', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-2' });
    state.units['gen-1'] = makeGeneral();
    state.units['unit-1'] = makeUnit({ landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } });
    state.civilizations.player.units = ['gen-1', 'unit-1'];
    expect(getRallyPreview(state, 'gen-1').targets).toHaveLength(0);
  });

  it('prioritizes by missing HP and stage severity, capped at commandCapacity', () => {
    const state = createNewGame({ civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 'rally-3' });
    state.units['gen-1'] = makeGeneral(); // V1 commandCapacity = 3
    for (let i = 1; i <= 4; i++) {
      state.units[`unit-${i}`] = makeUnit({
        id: `unit-${i}`, health: 100 - i * 10,
        landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
      });
    }
    state.civilizations.player.units = ['gen-1', 'unit-1', 'unit-2', 'unit-3', 'unit-4'];
    const preview = getRallyPreview(state, 'gen-1');
    expect(preview.targets).toHaveLength(3);
    // unit-4 has the most missing HP (60) -- must be included over unit-1 (least missing HP, 90)
    expect(preview.targets.map(t => t.unitId)).toContain('unit-4');
    expect(preview.targets.map(t => t.unitId)).not.toContain('unit-1');
  });
});
