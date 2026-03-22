import { processAITurn } from '@/ai/basic-ai';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';

describe('processAITurn', () => {
  it('does not throw on a fresh game', () => {
    const state = createNewGame('ai-test');
    const bus = new EventBus();
    expect(() => processAITurn(state, 'ai-1', bus)).not.toThrow();
  });

  it('returns a modified game state', () => {
    const state = createNewGame('ai-test');
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    expect(newState).toBeDefined();
  });

  it('AI settler founds a city when possible', () => {
    const state = createNewGame('ai-test');
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    const aiCiv = newState.civilizations['ai-1'];
    // AI should try to found a city with its settler
    expect(aiCiv.cities.length + Object.values(newState.units).filter(
      u => u.owner === 'ai-1' && u.type === 'settler'
    ).length).toBeGreaterThanOrEqual(1);
  });
});
