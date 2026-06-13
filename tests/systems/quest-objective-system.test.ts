import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { QUEST_TYPES } from '@/core/types';
import { emptyIdCounters } from '@/core/id-counters';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';
import {
  canReachGoldRequirement,
  createQuestTarget,
  estimateCaravanReadyTurns,
  hasAccessibleLuxury,
  QUEST_OBJECTIVE_HANDLERS,
} from '@/systems/quest-objective-system';

function objectiveState(seed: string) {
  const state = createNewGame(undefined, seed, 'small');
  const minorCivId = Object.keys(state.minorCivs)[0];
  const minorCiv = state.minorCivs[minorCivId];
  const city = state.cities[minorCiv.cityId];
  state.civilizations.player.visibility.tiles[hexKey(city.position)] = 'visible';
  return { state, minorCivId, city };
}

describe('quest objective feasibility', () => {
  it('covers every runtime quest type with an objective handler', () => {
    expect(Object.keys(QUEST_OBJECTIVE_HANDLERS).sort()).toEqual([...QUEST_TYPES].sort());
  });
  it('bounds a military request to one currently visible hostile', () => {
    const { state, minorCivId, city } = objectiveState('quest-visible-hostile');
    const hostile = createUnit('warrior', 'barbarian', { q: city.position.q + 1, r: city.position.r }, emptyIdCounters());
    state.units[hostile.id] = hostile;
    state.civilizations.player.visibility.tiles[hexKey(hostile.position)] = 'visible';

    const target = createQuestTarget({ state, minorCivId, majorCivId: 'player', currentTurn: state.turn }, {
      type: 'defeat_units',
      radius: 10,
      description: 'Defeat nearby hostiles',
    });

    expect(target).toMatchObject({ type: 'defeat_units', count: 1 });
  });

  it('does not count a hostile unit hidden by fog', () => {
    const { state, minorCivId, city } = objectiveState('quest-fogged-hostile');
    const hostile = createUnit('warrior', 'barbarian', { q: city.position.q + 1, r: city.position.r }, emptyIdCounters());
    state.units[hostile.id] = hostile;
    state.civilizations.player.visibility.tiles[hexKey(hostile.position)] = 'fog';

    const target = createQuestTarget({ state, minorCivId, majorCivId: 'player', currentTurn: state.turn }, {
      type: 'defeat_units',
      radius: 10,
      description: 'Defeat nearby hostiles',
    });

    expect(target).toBeNull();
  });

  it('rejects a gold target outside the twenty-turn economy projection', () => {
    const { state } = objectiveState('quest-gold-projection');
    state.civilizations.player.gold = 0;
    expect(canReachGoldRequirement(state, 'player', 10_000, 20)).toBe(false);
  });

  it('requires accessible luxury for festival feasibility without consuming it', () => {
    const { state } = objectiveState('quest-festival-luxury');
    expect(hasAccessibleLuxury(state, 'player')).toBe(false);

    state.civilizations.player.techState.completed.push('pottery');
    state.marketplace!.purchasedResources = [{ civId: 'player', resource: 'wine', expiresOnTurn: state.turn + 5 }];
    expect(hasAccessibleLuxury(state, 'player')).toBe(true);
    expect(state.marketplace!.purchasedResources).toHaveLength(1);
  });

  it('includes queued work when estimating whether a caravan can meet the deadline', () => {
    const { state, city } = objectiveState('quest-caravan-eta');
    const cityId = city.id;
    city.owner = 'player';
    state.civilizations.player.cities = [cityId];
    city.productionQueue = ['observatory'];
    city.productionProgress = 0;
    state.civilizations.player.techState.completed.push('trade-routes', 'astronomy');

    expect(estimateCaravanReadyTurns(state, 'player', cityId)).toBeGreaterThan(20);
  });
});
