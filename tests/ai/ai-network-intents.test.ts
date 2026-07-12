import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
import { assignNetworkIntentsForAI } from '@/ai/ai-network-intents';

function city(id: string, owner: string, q: number): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 2, food: 0, foodNeeded: 10,
    buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
}

function cyber(): Unit {
  return { id: 'ai-cyber', type: 'cyber_unit', owner: 'ai-1', position: { q: 1, r: 0 }, movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false };
}

describe('AI network intents', () => {
  it('assigns a legal Exploit only when the target city is earned intel, otherwise leaves the Cyber Unit on Hold', () => {
    const state = createNewGame(undefined, 'ai-network-intent', 'small');
    state.units = { 'ai-cyber': cyber() };
    state.cities = { target: city('target', 'player', 2) };
    state.civilizations['ai-1'] = {
      ...state.civilizations['ai-1'], units: ['ai-cyber'], cities: [],
      techState: { ...state.civilizations['ai-1'].techState, completed: ['quantum-computing'] },
      diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
      knownCivilizations: ['player'],
    };
    state.civilizations.player = {
      ...state.civilizations.player,
      cities: ['target'],
      diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
    };

    const unknown = assignNetworkIntentsForAI(state, 'ai-1', { knownCityIds: new Set() });
    expect(unknown.autonomyByCiv!['ai-1'].plans).toEqual({});

    const known = assignNetworkIntentsForAI(state, 'ai-1', { knownCityIds: new Set(['target']) });
    expect(Object.values(known.autonomyByCiv!['ai-1'].plans)).toEqual([
      expect.objectContaining({ definitionId: 'exploit', target: { kind: 'city', cityId: 'target' } }),
    ]);
  });
});
