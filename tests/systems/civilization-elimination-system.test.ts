import { describe, expect, it } from 'vitest';
import { createHotSeatGame } from '@/core/game-state';
import {
  eliminateCivilization,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';

function stateWithDefeatedActor() {
  const state = createHotSeatGame({
    playerCount: 2,
    mapSize: 'small',
    players: [
      { name: 'Winner', slotId: 'player-1', civType: 'england', isHuman: true },
      { name: 'Defeated', slotId: 'player-2', civType: 'germany', isHuman: true },
    ],
  }, 'elimination-fixture');
  const settlerId = state.civilizations['player-2'].units.find(unitId =>
    state.units[unitId]?.type === 'settler');
  if (!settlerId) throw new Error('Fixture requires a defeated-player settler');
  delete state.units[settlerId];
  state.civilizations['player-2'].units = state.civilizations['player-2'].units
    .filter(unitId => unitId !== settlerId);
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
  it('does not eliminate a cityless civilization with a surviving settler', () => {
    const state = makeLivenessGame();

    expect(eliminateCivilization(state, 'ai-1', 'player')).toEqual({
      state,
      eliminated: false,
    });
  });

  it('finalizes every assetless actor once with no invented victor', () => {
    let state = makeLivenessGame();
    state = withoutOwnedAssets(state, 'player');
    state = withoutOwnedAssets(state, 'ai-1');

    const first = reconcileCivilizationLiveness(state, state);

    expect(first.transitions.filter(transition => transition.kind === 'eliminated')
      .map(transition => [transition.civId, transition.eliminatedBy]))
      .toEqual([
        ['ai-1', null],
        ['player', null],
      ]);
    expect(reconcileCivilizationLiveness(first.state, first.state).transitions).toEqual([]);
  });

  it('records an attributed defeat at the reconciliation boundary', () => {
    const before = makeLivenessGame();
    const after = withoutOwnedAssets(before, 'ai-1');

    const reconciled = reconcileCivilizationLiveness(before, after, 'player');

    expect(reconciled.state.dominationIntel?.player?.defeatsByCivId['ai-1']).toMatchObject({
      civId: 'ai-1',
      defeatedById: 'player',
      source: 'participant',
    });
  });

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

  it('does not eliminate an actor that owns a city omitted from its roster', () => {
    const state = makeLivenessGame();
    const city = Object.values(state.cities).find(candidate => candidate.owner === 'player');
    if (!city) throw new Error('Fixture requires a player city');
    state.cities[city.id] = { ...city, owner: 'ai-1' };
    state.civilizations['ai-1'].cities = [];

    const result = eliminateCivilization(state, 'ai-1', 'player');

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
