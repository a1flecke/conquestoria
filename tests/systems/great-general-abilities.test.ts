import { describe, expect, it, vi } from 'vitest';
import { getHeroicCommandEligibility, spendHeroicCommandCharge } from '@/systems/great-general-abilities';
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
