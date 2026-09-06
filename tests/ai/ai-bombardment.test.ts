import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, UnitType } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import { rankUnitTacticalActions, AI_BOMBARDMENT_FOLLOWUP_RADIUS, type AITacticalContext } from '@/ai/ai-tactics';
import { resolveCityInteraction } from '@/systems/city-interaction';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

/** AI civ `ai-1` besieging the human `player`'s city at (4,0). */
function siegeState(options: {
  siegeUnit?: UnitType;
  siegePos?: { q: number; r: number };
  followUp?: { type: UnitType; pos: { q: number; r: number } } | null;
} = {}): GameState {
  const state = createNewGame(undefined, 'ai-bombard', 'small');
  state.currentPlayer = 'ai-1';
  state.turn = 12;
  for (let q = 0; q <= 10; q += 1) {
    state.map.tiles[`${q},0`] = { ...state.map.tiles[`${q},0`]!, terrain: 'plains' };
  }

  const siege = {
    ...createUnit(options.siegeUnit ?? 'catapult', 'ai-1', options.siegePos ?? { q: 2, r: 0 }, mkC()),
    id: 'siege', movementPointsLeft: 2,
  };
  state.units = { siege };
  const aiUnits = ['siege'];

  if (options.followUp !== null) {
    const spec = options.followUp ?? { type: 'swordsman' as UnitType, pos: { q: 3, r: 0 } };
    state.units.footman = { ...createUnit(spec.type, 'ai-1', spec.pos, mkC()), id: 'footman', movementPointsLeft: 2 };
    aiUnits.push('footman');
  }

  state.civilizations['ai-1'].units = aiUnits;
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].visibility = { tiles: Object.fromEntries(
    Array.from({ length: 11 }, (_, q) => [`${q},0`, 'visible' as const]),
  ) };

  state.cities = {};
  const city = { ...foundCity('player', { q: 4, r: 0 }, state.map, state.idCounters), id: 'target', owner: 'player', hp: 100, population: 6 };
  state.cities = { target: city };
  state.civilizations.player.cities = ['target'];
  state.civilizations.player.units = [];
  return state;
}

function bombardActions(state: GameState) {
  const context: AITacticalContext = {
    state,
    actorId: 'ai-1',
    plan: {
      id: 'tactical-plan',
      actorId: 'ai-1',
      objective: 'capture',
      target: { kind: 'city', id: 'target', lastKnownPosition: { q: 4, r: 0 } },
      theaterId: 'test-theater',
      phase: 'attacking',
      reasonCodes: ['continue-active-war'],
      commitment: 0.7,
      createdTurn: 10,
      reconsiderAfterTurn: 15,
      expiresAfterTurn: 25,
      lastProgressTurn: 11,
      requiredRoles: { frontline: 1, capture: 1 },
      assignedUnitIds: ['siege', 'footman'],
    } as never,
    assignedUnitIds: ['siege', 'footman'],
  };
  return rankUnitTacticalActions(context, 'siege')
    .filter(entry => entry.action.kind === 'bombard-city');
}

describe('#974 AI bombardment parity', () => {
  it('generates a bombard action for a LAND siege unit, not only for ships', () => {
    const actions = bombardActions(siegeState());
    expect(actions.map(a => a.action)).toContainEqual({ kind: 'bombard-city', unitId: 'siege', cityId: 'target' });
  });

  // Bombarding can never capture, so its value comes mostly from the storm it enables. But
  // it is never fully excluded -- matching rankCapture's own convention, and preserving the
  // pre-#974 case of a fleet wearing down a coastal city with no landing force.
  it('still offers bombardment with no follow-up in reach, but ranks it lower', () => {
    const withFollowUp = bombardActions(siegeState())[0];
    const alone = bombardActions(siegeState({ followUp: null }))[0];

    expect(alone).toBeDefined();
    expect(withFollowUp).toBeDefined();
    expect(alone.score).toBeLessThan(withFollowUp.score);
  });

  it('ranks a follow-up beyond the radius the same as having none at all', () => {
    const farAway = bombardActions(siegeState({
      followUp: { type: 'swordsman', pos: { q: 4 + AI_BOMBARDMENT_FOLLOWUP_RADIUS + 2, r: 0 } },
    }))[0];
    const alone = bombardActions(siegeState({ followUp: null }))[0];

    expect(farAway.score).toBe(alone.score);
  });

  it('scores a bombardment higher when it buys a bigger swing in assault odds', () => {
    // Buildings are held identical so the DAMAGE dealt is the same in both cases and
    // population is the only variable -- otherwise this measures the damage difference
    // rather than the odds swing, which is the thing being scored.
    const nearCertain = siegeState();
    nearCertain.cities.target = { ...nearCertain.cities.target, population: 1, buildings: [] };
    const contested = siegeState();
    contested.cities.target = { ...contested.cities.target, population: 20, buildings: [] };

    const easy = bombardActions(nearCertain)[0];
    const hard = bombardActions(contested)[0];

    expect(easy).toBeDefined();
    expect(hard).toBeDefined();
    // Softening a city the follow-up already beats easily buys little; softening a
    // contested one moves the odds far more, so it must outrank.
    expect(hard.score).toBeGreaterThan(easy.score);
  });

  it('uses the same legality the player does -- no AI-only city exception', () => {
    const state = siegeState();
    const fromResolver = resolveCityInteraction(state, state.units.siege, state.cities.target)
      .available.some(action => action.kind === 'bombard');

    expect(bombardActions(state).length > 0).toBe(fromResolver);
  });

  it('never bombards a city it cannot see', () => {
    const state = siegeState();
    state.civilizations['ai-1'].visibility = { tiles: {} };
    expect(bombardActions(state)).toHaveLength(0);
  });
});
