import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { processAITurn } from '@/ai/basic-ai';
import { resolveCivilizationEra, resolveWorldAge, TECH_TREE } from '@/systems/tech-definitions';

const LAGGARD = 'ai-1';
const TARGET = 'ai-2';

function techsThroughEra(era: number): string[] {
  return TECH_TREE.filter(tech => tech.era <= era).map(tech => tech.id);
}

/**
 * Four major civilizations: `player`, `ai-2` and `ai-3` advance through era 4
 * -- a majority of 4 -- while `ai-1` (the acting laggard, personality
 * `greece`, diplomacyFocus 0.9) stays at era 1 with no diplomacy techs. `ai-2`
 * doubles as the laggard's high-relationship, already-met treaty target;
 * `getAvailableActions` only gates on the *actor's* own techs/era, so the
 * target's own era is irrelevant to the bug. `resolveWorldAge` needs a
 * majority of living civs, so this requires >=4 total -- with 2 the World Age
 * collapses onto the laggard's own era and the divergence this reproduces is
 * invisible (the same reason #984's fixture needed >=3).
 */
function laggardAiWorldState(seed: string): GameState {
  const state = createNewGame({
    civType: 'rome',
    seed,
    mapSize: 'medium',
    opponentCount: 3,
    gameTitle: 'basic-ai-diplomacy-era-parity',
  });
  const advanced = techsThroughEra(4);
  state.civilizations.player.techState.completed = [...advanced];
  state.civilizations[TARGET].techState.completed = [...advanced];
  state.civilizations['ai-3'].techState.completed = [...advanced];
  state.civilizations[LAGGARD].techState.completed = [];
  state.civilizations[LAGGARD].civType = 'greece'; // diplomacyFocus 0.9 -- clears the >0.4 NAP bar unambiguously
  state.civilizations[TARGET].civType = 'egypt'; // diplomacyFocus 0.7 -- clears evaluateTreatyConsent's >0.3 NAP bar
  state.era = resolveWorldAge(state.civilizations);

  const laggard = state.civilizations[LAGGARD];
  const target = state.civilizations[TARGET];
  laggard.knownCivilizations = [...(laggard.knownCivilizations ?? []), TARGET];
  target.knownCivilizations = [...(target.knownCivilizations ?? []), LAGGARD];
  // >0 clears NAP's relationship bar without also clearing alliance's (>50)
  // or trade's (>10) -- `evaluateDiplomacy`'s if/else-if chain would otherwise
  // propose the higher-priority treaty instead of NAP, masking this exact bug.
  laggard.diplomacy.relationships[TARGET] = 5;
  target.diplomacy.relationships[LAGGARD] = 5;
  return state;
}

describe('#1027 — a laggard AI civ cannot sign treaties a laggard human could not', () => {
  it('the fixture separates World Age from the laggard civ era', () => {
    const state = laggardAiWorldState('basic-ai-fixture');
    expect(Object.keys(state.civilizations).length).toBeGreaterThanOrEqual(4);
    expect(state.era).toBe(4);
    expect(resolveCivilizationEra(state.civilizations[LAGGARD].techState.completed)).toBe(1);
  });

  it('does not sign a Non-Aggression Pact for a civ era 1 laggard, even at World Age 4', () => {
    const state = laggardAiWorldState('basic-ai-nap-parity');
    const result = processAITurn(state, LAGGARD, new EventBus());

    const signedNap = result.civilizations[LAGGARD].diplomacy.treaties
      .some(t => t.type === 'non_aggression_pact');
    const pendingNap = (result.pendingDiplomacyRequests ?? [])
      .some(r => r.type === 'treaty' && r.treatyType === 'non_aggression_pact' && r.fromCivId === LAGGARD);

    expect(signedNap || pendingNap).toBe(false);
  });
});
