import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { getCrisisDispatchCandidates } from '@/ai/ai-crisis-response';

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
