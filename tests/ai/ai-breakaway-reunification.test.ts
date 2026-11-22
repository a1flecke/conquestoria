import { describe, expect, it } from 'vitest';
import { processAITurn, AI_REUNIFICATION_GOLD_RESERVE } from '@/ai/basic-ai';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { createBreakawayFromCity, getReabsorbQuote } from '@/systems/breakaway-system';
import { foundCity } from '@/systems/city-system';

// No AI ever reabsorbed a breakaway: the action was unreachable and the AI never asked for it. An AI now buys back
// a city that broke away from it once the city is ready to talk, through the same quote the player is shown.
function seceded(seed: string, reunification: number, gold: number): { state: GameState; breakawayId: string; cityId: string } {
  let state = createNewGame(undefined, seed, 'small');
  const settlerId = state.civilizations['ai-1'].units.find(id => state.units[id]?.type === 'settler')!;
  const city = foundCity('ai-1', state.units[settlerId].position, state.map, state.idCounters);
  state = {
    ...state,
    turn: 20,
    cities: { ...state.cities, [city.id]: city },
    civilizations: { ...state.civilizations, 'ai-1': { ...state.civilizations['ai-1'], cities: [city.id] } },
  };
  state = createBreakawayFromCity(state, city.id, new EventBus());
  const breakawayId = `breakaway-${city.id}`;
  state.civilizations[breakawayId].breakaway!.reunification = reunification;
  state.civilizations['ai-1'].gold = gold;
  return { state, breakawayId, cityId: city.id };
}

describe('AI reunifies its breakaway city', () => {
  it('pays the quoted price once the city is ready and the civ can keep a reserve', () => {
    const { state, breakawayId, cityId } = seceded('ai-reunify-pays', 80, 1000);
    const quote = getReabsorbQuote(state, 'ai-1', breakawayId);
    expect(quote.ok).toBe(true);

    const after = processAITurn(state, 'ai-1', new EventBus());

    expect(after.cities[cityId].owner).toBe('ai-1');
    expect(after.civilizations[breakawayId]).toBeUndefined();
  });

  it('waits while the city is not yet ready to talk', () => {
    const { state, breakawayId, cityId } = seceded('ai-reunify-waits', 20, 1000);
    const after = processAITurn(state, 'ai-1', new EventBus());
    expect(after.cities[cityId].owner).toBe(breakawayId);
  });

  it('does not spend its last reserve on it', () => {
    const { state, breakawayId, cityId } = seceded('ai-reunify-reserve', 80, 0);
    const cost = getReabsorbQuote({ ...state, civilizations: { ...state.civilizations, 'ai-1': { ...state.civilizations['ai-1'], gold: 1e6 } } }, 'ai-1', breakawayId);
    state.civilizations['ai-1'].gold = (cost.ok ? cost.cost : 0) + AI_REUNIFICATION_GOLD_RESERVE - 1;
    const after = processAITurn(state, 'ai-1', new EventBus());
    expect(after.cities[cityId].owner).toBe(breakawayId);
  });
});
