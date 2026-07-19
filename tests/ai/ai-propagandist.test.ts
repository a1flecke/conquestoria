import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
import { usePropagandistActionsForAI } from '@/ai/ai-propagandist';

function city(id: string, owner: string, q: number): City {
  return { id, name: id, owner, position: { q, r: 0 }, population: 2, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null };
}

describe('AI Propagandist use', () => {
  it('uses the same bounded Undermine action against a nearby bilateral-war city', () => {
    const state = createNewGame('rome', 'ai-propagandist', 'small');
    const enemy = city('enemy', 'player', 1);
    state.cities = { enemy };
    const unit: Unit = { id: 'ai-prop', type: 'propagandist', owner: 'ai-1', position: { q: 0, r: 0 }, movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false };
    state.units = { [unit.id]: unit };
    state.civilizations['ai-1'] = { ...state.civilizations['ai-1'], units: [unit.id], cities: [], diplomacy: { ...state.civilizations['ai-1'].diplomacy, atWarWith: ['player'] } };
    state.civilizations.player = { ...state.civilizations.player, cities: ['enemy'], diplomacy: { ...state.civilizations.player.diplomacy, atWarWith: ['ai-1'] } };

    const result = usePropagandistActionsForAI(state, 'ai-1');

    expect(result.cities.enemy.spyUnrestBonus).toBe(10);
    expect(result.units['ai-prop'].hasActed).toBe(true);
  });

  it('rallies its own city when a nearby foreign city is not a legal war target', () => {
    const state = createNewGame('rome', 'ai-propagandist-rally', 'small');
    const neutral = city('neutral', 'player', 1);
    const own = { ...city('own', 'ai-1', -1), spyUnrestBonus: 20 };
    state.cities = { neutral, own };
    const unit: Unit = { id: 'ai-prop', type: 'propagandist', owner: 'ai-1', position: { q: 0, r: 0 }, movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false };
    state.units = { [unit.id]: unit };
    state.civilizations['ai-1'] = { ...state.civilizations['ai-1'], units: [unit.id], cities: ['own'] };
    state.civilizations.player = { ...state.civilizations.player, cities: ['neutral'] };

    const result = usePropagandistActionsForAI(state, 'ai-1');

    expect(result.cities.own.spyUnrestBonus).toBe(10);
    expect(result.cities.neutral.spyUnrestBonus).toBe(0);
    expect(result.units['ai-prop'].hasActed).toBe(true);
  });
});
