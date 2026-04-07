import { describe, it, expect } from 'vitest';
import type { Spy } from '@/core/types';
import {
  checkAndApplyPromotion,
  createEspionageCivState,
  getSpySuccessChance,
  processSpyTurn,
  recruitSpy,
  startMission,
} from '@/systems/espionage-system';

function makeSpy(experience: number): Spy {
  return {
    id: 'spy-1',
    owner: 'player',
    name: 'Agent Shadow',
    targetCivId: null,
    targetCityId: null,
    position: null,
    status: 'idle',
    experience,
    currentMission: null,
    cooldownTurns: 0,
    promotion: undefined,
    promotionAvailable: false,
  };
}

describe('spy promotions', () => {
  it('promotes offensive spies to infiltrator', () => {
    const promoted = checkAndApplyPromotion(makeSpy(60), 'steal_tech');
    expect(promoted.promotion).toBe('infiltrator');
  });

  it('promotes influence spies to handler', () => {
    const promoted = checkAndApplyPromotion(makeSpy(60), 'forge_documents');
    expect(promoted.promotion).toBe('handler');
  });

  it('promotes intel-focused spies to sentinel', () => {
    const promoted = checkAndApplyPromotion(makeSpy(60), 'gather_intel');
    expect(promoted.promotion).toBe('sentinel');
  });

  it('does not promote spies below the XP threshold', () => {
    const promoted = checkAndApplyPromotion(makeSpy(59), 'steal_tech');
    expect(promoted.promotion).toBeUndefined();
  });

  it('applies infiltrator bonus to matching missions', () => {
    const base = getSpySuccessChance(60, 0, 'steal_tech');
    const boosted = getSpySuccessChance(60, 0, 'steal_tech', 'infiltrator');
    expect(boosted).toBeGreaterThan(base);
  });

  it('does not apply infiltrator bonus to mismatched missions', () => {
    const base = getSpySuccessChance(60, 0, 'gather_intel');
    const mismatched = getSpySuccessChance(60, 0, 'gather_intel', 'infiltrator');
    expect(mismatched).toBe(base);
  });

  it('annuvin spies complete missions one turn faster', () => {
    const { state, spy } = recruitSpy(createEspionageCivState(), 'player', 'seed-1');
    state.spies[spy.id].status = 'stationed';
    state.spies[spy.id].targetCivId = 'ai-1';
    state.spies[spy.id].targetCityId = 'city-1';

    const started = startMission(
      state,
      spy.id,
      'gather_intel',
      { type: 'espionage_growth', experienceBonus: 0.2 },
    );
    expect(started.spies[spy.id].currentMission?.turnsTotal).toBe(2);
  });

  it('annuvin spies gain bonus XP from successful missions', () => {
    const { state, spy } = recruitSpy(createEspionageCivState(), 'player', 'seed-1');
    state.spies[spy.id].status = 'on_mission';
    state.spies[spy.id].currentMission = {
      type: 'gather_intel',
      turnsRemaining: 1,
      turnsTotal: 1,
      targetCivId: 'ai-1',
      targetCityId: 'city-1',
    };

    const result = processSpyTurn(state, 'seed-2', 1.2);
    expect(result.state.spies[spy.id].experience).toBe(12);
  });
});
