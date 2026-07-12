import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, GameState, Unit } from '@/core/types';
import { getNetworkIntentPanelModel } from '@/ui/network-intent-panel';

function city(id: string, owner: string, q: number): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 1, food: 0, foodNeeded: 10,
    buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    idleProduction: null,
  };
}

function cyber(): Unit {
  return {
    id: 'cyber', type: 'cyber_unit', owner: 'player', position: { q: 1, r: 0 },
    movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
}

function state(): GameState {
  const game = createNewGame(undefined, 'network-intent-panel', 'small');
  game.units = { cyber: cyber() };
  game.cities = {
    friendly: city('friendly', 'player', 0),
    enemy: city('enemy', 'ai-1', 2),
    distant: city('distant', 'ai-1', 5),
  };
  game.civilizations.player = {
    ...game.civilizations.player,
    units: ['cyber'], cities: ['friendly'],
    techState: { ...game.civilizations.player.techState, completed: ['quantum-computing'] },
    diplomacy: { ...game.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
  };
  game.civilizations['ai-1'] = {
    ...game.civilizations['ai-1'], cities: ['enemy', 'distant'],
    diplomacy: { ...game.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
  };
  return game;
}

describe('network intent panel model', () => {
  it('keeps both persistent choices understandable and filters city targets to legal range and war state', () => {
    const model = getNetworkIntentPanelModel(state(), 'player', 'cyber');

    expect(model).toMatchObject({ sourceName: 'Cyber Unit', currentIntentLabel: 'Hold' });
    expect(model.hardenTargets).toEqual([{ cityId: 'friendly', cityName: 'friendly' }]);
    expect(model.exploitTargets).toEqual([{ cityId: 'enemy', cityName: 'enemy' }]);
    expect(model.hardenDescription).toContain('half');
    expect(model.exploitDescription).toContain('10%');
  });
});
