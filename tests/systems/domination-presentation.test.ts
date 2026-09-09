import { describe, expect, it } from 'vitest';
import { projectDominationProgressForViewer } from '@/systems/domination-presentation';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';

describe('Domination progress presentation', () => {
  it('shows only earned counts and dated known reports', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
    state.turn = 9;
    state.dominationIntel = {
      player: {
        defeatsByCivId: {
          'former-breakaway': {
            civId: 'former-breakaway',
            civName: 'Former Breakaway',
            observedTurn: 4,
            defeatedById: 'player',
            source: 'participant',
          },
        },
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

    const model = projectDominationProgressForViewer(state, 'player');

    expect(model).toMatchObject({
      ruleText: 'To win, be the last independent empire.',
      ownEarnedDefeatCount: 1,
      uncertaintyText: expect.stringContaining('may be unknown'),
    });
    expect(model.rows).toContainEqual(expect.objectContaining({
      civId: 'former-breakaway', evidence: 'current', reportTurn: 4,
    }));
    expect(model.rows).toContainEqual(expect.objectContaining({
      civId: 'ai-1', evidence: 'reported', reportTurn: 8,
    }));
    expect(model).not.toHaveProperty('totalWorldRivals');
    expect(model).not.toHaveProperty('conditionMet');
  });

  it('does not expose a hidden rival changed after an observer report', () => {
    const state = makeLivenessGame();
    state.dominationIntel = {
      player: {
        defeatsByCivId: {},
        reportsByContenderId: {
          'ai-1': {
            contenderId: 'ai-1',
            observedTurn: state.turn,
            contenderRole: 'independent',
            directVassalIds: [],
            defeatedCivIds: [],
          },
        },
      },
    };
    const hiddenVariant = withoutOwnedAssets(structuredClone(state), 'ai-1');

    expect(projectDominationProgressForViewer(hiddenVariant, 'player')).toEqual(
      projectDominationProgressForViewer(state, 'player'),
    );
  });

  it('keeps a reported elimination historical rather than calling it a confirmed current defeat', () => {
    const state = makeLivenessGame();
    state.turn = 9;
    state.dominationIntel = {
      player: {
        defeatsByCivId: {},
        reportsByContenderId: {
          overlord: {
            contenderId: 'overlord',
            observedTurn: 7,
            contenderRole: 'independent',
            directVassalIds: [],
            defeatedCivIds: ['ai-1'],
          },
        },
      },
    };

    const row = projectDominationProgressForViewer(state, 'player').rows
      .find(candidate => candidate.civId === 'ai-1');

    expect(row).toMatchObject({ evidence: 'reported', reportTurn: 7 });
    expect(row?.text).toContain('was reported eliminated on turn 7.');
  });

  it('guides a player with no rival reports to explore instead of opening an empty intelligence screen', () => {
    const state = makeLivenessGame();
    for (const civilization of Object.values(state.civilizations)) {
      civilization.knownCivilizations = [];
      civilization.diplomacy.atWarWith = [];
      civilization.diplomacy.treaties = [];
    }
    state.dominationIntel = {};

    const model = projectDominationProgressForViewer(state, 'player');

    expect(model.rows).toEqual([]);
    expect(model.guidance).toEqual({
      kind: 'text',
      text: 'Explore to meet other empires and learn about their progress.',
    });
  });
});
