import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processAITurn } from '@/ai/basic-ai';

// Issue #435 defense-in-depth: even if the decision layer regresses and emits a
// treaty or war decision for an unmet civ (the June 2026 mass-discovery bug),
// the execution layer in basic-ai must refuse to write it.
vi.mock('@/ai/ai-diplomacy', async importOriginal => {
  const actual = await importOriginal<typeof import('@/ai/ai-diplomacy')>();
  return {
    ...actual,
    evaluateDiplomacy: vi.fn(() => [
      { action: 'trade_agreement', targetCiv: 'player' },
      { action: 'declare_war', targetCiv: 'player' },
    ]),
  };
});

describe('basic-ai treaty execution contact guard', () => {
  it('refuses rogue treaty and war decisions against a civ the actor has not met', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Rogue Decision Guard',
      seed: 'rogue-decision-guard',
    });
    state.era = 3;
    state.civilizations['ai-1'].knownCivilizations = [];
    state.civilizations.player.knownCivilizations = [];
    state.civilizations['ai-1'].diplomacy.relationships.player = 30;
    state.civilizations.player.diplomacy.relationships['ai-1'] = 30;

    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.civilizations['ai-1'].diplomacy.treaties).toEqual([]);
    expect(result.civilizations.player.diplomacy.treaties).toEqual([]);
    expect(result.civilizations['ai-1'].diplomacy.atWarWith).toEqual([]);
    expect(result.civilizations.player.diplomacy.atWarWith).toEqual([]);
  });
});
