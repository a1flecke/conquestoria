import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processAITurn } from '@/ai/basic-ai';
import { evaluateDiplomacy } from '@/ai/ai-diplomacy';

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

// #554: an AI offering a treaty to a human must not sign it instantly --
// the human has to accept a pending proposal in the diplomacy panel first.
describe('basic-ai treaty consent (#554)', () => {
  it('never writes a treaty into a human civ\'s state without consent', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Treaty Consent',
      seed: 'treaty-consent-human',
    });
    state.era = 3;
    state.civilizations['ai-1'].knownCivilizations = ['player'];
    state.civilizations.player.knownCivilizations = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.relationships.player = 60;
    state.civilizations.player.diplomacy.relationships['ai-1'] = 60;
    state.pendingDiplomacyRequests = [];

    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.civilizations.player.diplomacy.treaties).toHaveLength(0);
    expect(result.civilizations['ai-1'].diplomacy.treaties).toHaveLength(0);
    expect(result.pendingDiplomacyRequests?.some(r =>
      r.type === 'treaty' && r.fromCivId === 'ai-1' && r.toCivId === 'player')).toBe(true);
  });

  it('still signs AI<->AI treaties instantly', () => {
    const state = createNewGame({
      civType: 'egypt',
      mapSize: 'medium',
      opponentCount: 2,
      gameTitle: 'Treaty Consent AI-AI',
      seed: 'treaty-consent-ai-ai',
    });
    state.era = 3;
    const civIds = Object.keys(state.civilizations);
    const secondAiId = civIds.find(id => id !== 'ai-1' && id !== 'player')!;
    state.civilizations['ai-1'].knownCivilizations = [secondAiId];
    state.civilizations[secondAiId].knownCivilizations = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.relationships[secondAiId] = 60;
    state.civilizations[secondAiId].diplomacy.relationships['ai-1'] = 60;
    state.pendingDiplomacyRequests = [];

    // Override this file's module-level mock (hardcoded to targetCiv: 'player')
    // for this one call, so the decision targets the other AI instead.
    vi.mocked(evaluateDiplomacy).mockReturnValueOnce([
      { action: 'trade_agreement', targetCiv: secondAiId },
    ]);

    const result = processAITurn(state, 'ai-1', new EventBus());

    expect(result.civilizations['ai-1'].diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(true);
    expect(result.civilizations[secondAiId].diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(true);
    expect(result.pendingDiplomacyRequests ?? []).toHaveLength(0);
  });
});
