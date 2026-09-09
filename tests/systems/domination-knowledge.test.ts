import { describe, expect, it } from 'vitest';
import { buildDominationKnowledge } from '@/systems/domination-knowledge';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';

describe('Domination knowledge', () => {
  it('uses only the observer role and earned foreign evidence', () => {
    const state = makeLivenessGame();
    state.turn = 10;
    state.dominationIntel = {
      player: {
        defeatsByCivId: {},
        reportsByContenderId: {
          'ai-1': {
            contenderId: 'ai-1',
            observedTurn: 8,
            contenderRole: 'independent',
            directVassalIds: [],
            defeatedCivIds: [],
          },
        },
      },
    };
    const hiddenVariant = withoutOwnedAssets(structuredClone(state), 'ai-1');

    expect(buildDominationKnowledge(hiddenVariant, 'player')).toEqual(
      buildDominationKnowledge(state, 'player'),
    );
  });

  it('keeps historical defeat names after a removed breakaway and does not infer global defeats', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
    state.turn = 3;
    state.dominationIntel = {
      player: {
        defeatsByCivId: {
          'former-breakaway': {
            civId: 'former-breakaway',
            civName: 'Former Breakaway',
            observedTurn: 2,
            defeatedById: null,
            source: 'witness',
          },
        },
        reportsByContenderId: {},
      },
    };

    const knowledge = buildDominationKnowledge(state, 'player');

    expect(knowledge.ownEarnedDefeatIds).toEqual(['former-breakaway']);
    expect(knowledge.knownActorFacts).toContainEqual(expect.objectContaining({
      civId: 'former-breakaway',
      civName: 'Former Breakaway',
      disposition: 'eliminated',
      evidence: 'defeat',
    }));
    expect(knowledge.ownEarnedDefeatIds).not.toContain('ai-1');
  });

  it('does not treat an old nonterminal report as current political truth', () => {
    const state = makeLivenessGame();
    state.turn = 12;
    state.dominationIntel = {
      player: {
        defeatsByCivId: {},
        reportsByContenderId: {
          'ai-1': {
            contenderId: 'ai-1',
            observedTurn: 6,
            contenderRole: 'independent',
            directVassalIds: [],
            defeatedCivIds: [],
          },
        },
      },
    };

    expect(buildDominationKnowledge(state, 'player').knownActorFacts).toContainEqual(expect.objectContaining({
      civId: 'ai-1',
      disposition: 'unknown',
      evidence: 'report',
      observedTurn: 6,
    }));
  });
});
