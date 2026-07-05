import { describe, expect, it } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';

function stateWithDefeatedActor() {
  const state = createHotSeatGame({
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Winner', slotId: 'player-1', civType: 'england', isHuman: true },
      { name: 'Defeated', slotId: 'player-2', civType: 'germany', isHuman: true },
    ],
  }, 'elimination-fixture');
  state.civilizations['player-1'].diplomacy.relationships['player-2'] = -80;
  state.civilizations['player-1'].diplomacy.atWarWith = ['player-2'];
  state.civilizations['player-1'].diplomacy.treaties = [{
    type: 'open_borders',
    civA: 'player-1',
    civB: 'player-2',
    turnsRemaining: 5,
  }];
  state.embargoes = [{
    id: 'embargo-1',
    targetCivId: 'player-2',
    participants: ['player-1'],
    proposedTurn: 1,
  }];
  state.defensiveLeagues = [{
    id: 'league-1',
    members: ['player-1', 'player-2'],
    formedTurn: 1,
  }];
  state.pendingDiplomacyRequests = [{
    id: 'peace-1',
    type: 'peace',
    fromCivId: 'player-2',
    toCivId: 'player-1',
    turnIssued: 1,
  }];
  state.opponentAI!.majorCivs['player-2'] = {
    primaryPlan: null,
    defensePlansByCityId: {},
    upgradeRoutesByUnitId: {},
    modernizationDemand: 0,
    researchTargetTechId: null,
    lastPlannedTurn: 0,
    lastExecutedTurn: 0,
  };
  return state;
}

describe('civilization elimination', () => {
  it('atomically removes owned pieces and live cross-system references', () => {
    const state = stateWithDefeatedActor();
    const defeatedUnitIds = [...state.civilizations['player-2'].units];
    const before = structuredClone(state);

    const result = eliminateCivilization(state, 'player-2', 'player-1');

    expect(result.eliminated).toBe(true);
    if (!result.eliminated) return;
    expect(result.removedUnitIds.sort()).toEqual(defeatedUnitIds.sort());
    expect(result.state.civilizations['player-2'].isEliminated).toBe(true);
    expect(result.state.civilizations['player-2'].units).toEqual([]);
    expect(defeatedUnitIds.every(id => result.state.units[id] === undefined)).toBe(true);
    expect(result.state.civilizations['player-1'].diplomacy.relationships['player-2'])
      .toBeUndefined();
    expect(result.state.civilizations['player-1'].diplomacy.atWarWith)
      .not.toContain('player-2');
    expect(result.state.civilizations['player-1'].diplomacy.treaties).toEqual([]);
    expect(result.state.embargoes).toEqual([]);
    expect(result.state.defensiveLeagues).toEqual([]);
    expect(result.state.pendingDiplomacyRequests).toEqual([]);
    expect(result.state.opponentAI?.majorCivs['player-2']).toBeUndefined();
    expect(state).toEqual(before);
  });

  it('does not eliminate an actor that still owns a city', () => {
    const state = stateWithDefeatedActor();
    state.civilizations['player-2'].cities = ['city-1'];

    const result = eliminateCivilization(state, 'player-2', 'player-1');

    expect(result).toEqual({ state, eliminated: false });
  });

  it('is idempotent after the first transition', () => {
    const first = eliminateCivilization(stateWithDefeatedActor(), 'player-2', 'player-1');
    expect(first.eliminated).toBe(true);
    if (!first.eliminated) return;

    expect(eliminateCivilization(first.state, 'player-2', 'player-1')).toEqual({
      state: first.state,
      eliminated: false,
    });
  });
});
