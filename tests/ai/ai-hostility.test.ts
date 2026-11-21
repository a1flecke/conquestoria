import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getOwnHuntFoeUnitIds, isAIHostileOwner, isAIHostileUnit } from '@/ai/ai-hostility';
import type { GameState } from '@/core/types';

describe('ai-hostility', () => {
  it('treats crisis forces as hostile when beast contests are disabled', () => {
    const state = createNewGame('rome', 'crisis-ai-hostility', 'small');
    state.settings.aiContestsBeasts = false;

    expect(isAIHostileOwner(state, 'player', 'crisis-force')).toBe(true);
  });
});

// A hunt crisis aimed at a civ ends only when its foe is killed. With beast contests off the AI
// ignored every beast, so a beast hunt aimed at an AI civ could never end. The foe of the AI's own
// hunt is fair game; every other beast still is not.
describe('the foe of a civ\'s own hunt crisis', () => {
  function huntState() {
    const state = createNewGame('rome', 'hunt-foe-hostility', 'small');
    state.settings.aiContestsBeasts = false;
    state.units['beast-hunt'] = {
      id: 'beast-hunt', type: 'beast_wolf', owner: 'beasts', position: { q: 0, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    } as GameState['units'][string];
    state.units['beast-lair'] = { ...state.units['beast-hunt'], id: 'beast-lair' };
    state.activeCrises = {
      hunt: {
        id: 'hunt', flavorId: 'beast-awakening', archetype: 'hunt', targetCivId: 'player',
        cityIds: [], tileKeys: [], startedTurn: 1, stage: 'menacing', turnsInStage: 1, huntEntityId: 'beast-hunt',
      },
    };
    return state;
  }

  it('is hostile to the civ the hunt targets', () => {
    const state = huntState();
    expect(isAIHostileUnit(state, 'player', state.units['beast-hunt'])).toBe(true);
    expect(getOwnHuntFoeUnitIds(state, 'player')).toEqual(new Set(['beast-hunt']));
  });

  it('leaves every other beast alone', () => {
    const state = huntState();
    expect(isAIHostileUnit(state, 'player', state.units['beast-lair'])).toBe(false);
  });

  it('is not hostile to a civ the hunt does not target', () => {
    const state = huntState();
    state.activeCrises!.hunt.targetCivId = 'someone-else';
    expect(isAIHostileUnit(state, 'player', state.units['beast-hunt'])).toBe(false);
  });

  it('names the pirate ship of a pirate hunt', () => {
    const state = huntState();
    state.activeCrises!.hunt = { ...state.activeCrises!.hunt, flavorId: 'corsair-armada', huntEntityId: 'fleet-1' };
    state.pirateFleets = { 'fleet-1': { unitId: 'ship-1' } } as unknown as GameState['pirateFleets'];
    expect(getOwnHuntFoeUnitIds(state, 'player')).toEqual(new Set(['ship-1']));
  });
});
