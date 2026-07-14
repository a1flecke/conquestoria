import { describe, expect, it } from 'vitest';
import type { ActiveCrisis, GameState } from '@/core/types';
import { getCrisisDispatchCandidates, getCrisisResponseActions, applyCrisisResponses } from '@/ai/ai-crisis-response';

function faction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading',
    maritimeStage: 3, notoriety: 5, shipIds: ['ship-1'],
    headquarters: { kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null,
    intent: { kind: 'blockade', targetCivId: 'ai-1', targetCityId: 'ai-city', plannedRound: 1 },
    transitionGuards: { emittedEventKeys: [] },
    ...overrides,
  };
}

function baseState(challenge: string): GameState {
  return {
    opponentChallenge: challenge,
    civilizations: {
      'ai-1': {
        id: 'ai-1', isHuman: false, isEliminated: false,
        visibility: { tiles: { '2,1': 'visible' } },
      },
    },
    units: { 'ship-1': { id: 'ship-1', type: 'pirate_frigate', owner: 'pirate-1', position: { q: 2, r: 1 } } },
    pirates: { factions: { 'pirate-1': faction() } },
  } as unknown as GameState;
}

describe('getCrisisDispatchCandidates', () => {
  it('produces one pirate-fleet candidate targeting the fleet leader unit', () => {
    const candidates = getCrisisDispatchCandidates(baseState('standard'), 'ai-1');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: 'pirate-fleet',
      sourceId: 'pirate-1',
      targetUnitId: 'ship-1',
    });
  });

  it('scales score by crisisDispatchWeight (veteran > explorer for the same state)', () => {
    const veteranScore = getCrisisDispatchCandidates(baseState('veteran'), 'ai-1')[0]!.score;
    const explorerScore = getCrisisDispatchCandidates(baseState('explorer'), 'ai-1')[0]!.score;
    expect(veteranScore).toBeGreaterThan(explorerScore);
  });

  it('produces zero candidates when the fleet leader unit is dead', () => {
    const state = baseState('standard');
    delete (state.units as Record<string, unknown>)['ship-1'];
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });

  it('produces zero candidates when the fleet has no live faction', () => {
    const state = baseState('standard');
    state.pirates = { factions: {} } as GameState['pirates'];
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });

  it('produces zero candidates when the fleet targets a different civ', () => {
    const state = baseState('standard');
    (state.pirates!.factions['pirate-1'] as { intent: { targetCivId: string } }).intent.targetCivId = 'ai-2';
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });

  it('produces zero candidates when the civ cannot currently see the fleet leader (no unearned exact targets)', () => {
    const state = baseState('standard');
    (state.civilizations['ai-1'] as { visibility: { tiles: Record<string, string> } })
      .visibility.tiles = {};
    expect(getCrisisDispatchCandidates(state, 'ai-1')).toEqual([]);
  });
});

// #529 MR3 Task 3.2 — quarantine + fund-remedy response policy.
function outbreakCrisis(overrides: Partial<ActiveCrisis> = {}): ActiveCrisis {
  return {
    id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'ai-1',
    cityIds: ['c1'], tileKeys: [], startedTurn: 0, stage: 'active', turnsInStage: 1,
    ...overrides,
  };
}

function responseState(overrides: Record<string, unknown> = {}): GameState {
  return {
    turn: 4,
    opponentChallenge: 'standard',
    civilizations: {
      'ai-1': { id: 'ai-1', isHuman: false, isEliminated: false, gold: 1000 },
    },
    cities: {
      c1: { id: 'c1', population: 5, owner: 'ai-1' },
    },
    activeCrises: { 'crisis-1': outbreakCrisis() },
    ...overrides,
  } as unknown as GameState;
}

describe('getCrisisResponseActions', () => {
  it('quarantines only once crisis age reaches crisisResponseDelayTurns (explorer: age 4)', () => {
    const notYet = getCrisisResponseActions(responseState({ turn: 3, opponentChallenge: 'explorer' }), 'ai-1');
    expect(notYet.some(a => a.kind === 'quarantine')).toBe(false);
    const now = getCrisisResponseActions(responseState({ turn: 4, opponentChallenge: 'explorer' }), 'ai-1');
    expect(now).toContainEqual({ kind: 'quarantine', crisisId: 'crisis-1', cityId: 'c1' });
  });

  it('quarantines immediately at crisis age 0 for veteran challenge', () => {
    const actions = getCrisisResponseActions(responseState({ turn: 0, opponentChallenge: 'veteran' }), 'ai-1');
    expect(actions).toContainEqual({ kind: 'quarantine', crisisId: 'crisis-1', cityId: 'c1' });
  });

  it('quarantines the lowest-population unquarantined infected city first', () => {
    const state = responseState({
      turn: 0, opponentChallenge: 'veteran',
      cities: {
        c1: { id: 'c1', population: 5, owner: 'ai-1' },
        c2: { id: 'c2', population: 2, owner: 'ai-1' },
      },
      activeCrises: { 'crisis-1': outbreakCrisis({ cityIds: ['c1', 'c2'] }) },
    });
    const actions = getCrisisResponseActions(state, 'ai-1');
    expect(actions.filter(a => a.kind === 'quarantine')).toEqual([
      { kind: 'quarantine', crisisId: 'crisis-1', cityId: 'c2' },
    ]);
  });

  it('funds a remedy only when treasury meets the challenge multiplier (standard: cost x2.0)', () => {
    // c1 population 5 -> appease cost 75; standard multiplier 2.0 -> need >= 150.
    const short = getCrisisResponseActions(
      responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 149 } } }), 'ai-1',
    );
    expect(short.some(a => a.kind === 'fund-remedy')).toBe(false);
    const enough = getCrisisResponseActions(
      responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 150 } } }), 'ai-1',
    );
    expect(enough).toContainEqual({ kind: 'fund-remedy', crisisId: 'crisis-1', cityId: 'c1' });
  });

  it('never generates actions for a human civ', () => {
    const state = responseState({
      civilizations: { p1: { id: 'p1', isHuman: true, isEliminated: false, gold: 1000 } },
      activeCrises: { 'crisis-1': outbreakCrisis({ targetCivId: 'p1' }) },
    });
    expect(getCrisisResponseActions(state, 'p1')).toEqual([]);
  });

  it('is deterministic: identical actions on cloned state', () => {
    const state = responseState();
    const a = getCrisisResponseActions(structuredClone(state), 'ai-1');
    const b = getCrisisResponseActions(structuredClone(state), 'ai-1');
    expect(a).toEqual(b);
  });
});

describe('applyCrisisResponses', () => {
  it('applies a funded remedy via applyRemedy, deducting real gold', () => {
    const state = responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 200 } } });
    const next = applyCrisisResponses(state);
    expect((next.civilizations['ai-1'] as { gold: number }).gold).toBe(200 - 75);
    expect(next.activeCrises!['crisis-1'].remedyCompletionByCity).toHaveProperty('c1');
  });

  it('does not deduct gold or start a remedy when treasury is short', () => {
    const state = responseState({ civilizations: { 'ai-1': { id: 'ai-1', isHuman: false, gold: 100 } } });
    const next = applyCrisisResponses(state);
    expect((next.civilizations['ai-1'] as { gold: number }).gold).toBe(100);
    expect(next.activeCrises!['crisis-1'].remedyCompletionByCity ?? {}).not.toHaveProperty('c1');
  });

  it('applies a quarantine via applyQuarantine, marking the city quarantined', () => {
    const state = responseState({ turn: 0, opponentChallenge: 'veteran' });
    const next = applyCrisisResponses(state);
    expect(next.activeCrises!['crisis-1'].quarantinedCityIds).toContain('c1');
  });

  it('never touches a human civ crisis', () => {
    const state = responseState({
      civilizations: { p1: { id: 'p1', isHuman: true, isEliminated: false, gold: 1000 } },
      activeCrises: { 'crisis-1': outbreakCrisis({ targetCivId: 'p1' }) },
    });
    const next = applyCrisisResponses(state);
    expect(next.activeCrises!['crisis-1']).toEqual(state.activeCrises!['crisis-1']);
    expect((next.civilizations.p1 as { gold: number }).gold).toBe(1000);
  });
});
