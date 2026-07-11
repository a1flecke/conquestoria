import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  migrateSaveToCurrent,
  UnsupportedSaveSchemaVersionError,
} from '@/storage/save-migrations';

describe('save migrations', () => {
  it('migrates an unversioned save to a stable current schema exactly once', () => {
    const legacySave = createNewGame('rome', 'era13-legacy-save', 'small');
    delete legacySave.gameId;

    const migrated = migrateSaveToCurrent(legacySave);
    const loadedAgain = migrateSaveToCurrent(migrated);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.gameId).toMatch(/^legacy-/);
    expect(loadedAgain).toEqual(migrated);
  });

  it('rejects a newer save schema without mutating the save', () => {
    const futureSave = createNewGame('rome', 'future-schema-save', 'small');
    futureSave.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION + 1;
    const before = structuredClone(futureSave);

    expect(() => migrateSaveToCurrent(futureSave)).toThrow(UnsupportedSaveSchemaVersionError);
    expect(futureSave).toEqual(before);
  });

  it('renames legacy Quantum Computing only in persisted technology ID fields', () => {
    const legacySave = createNewGame('rome', 'cloud-boundary-save', 'small');
    legacySave.civilizations.player.techState = {
      ...legacySave.civilizations.player.techState,
      currentResearch: 'quantum-computing',
      researchQueue: ['quantum-computing', 'genomics', 'quantum-computing'],
      researchProgress: 420,
    };
    legacySave.civilizations['ai-1'].techState = {
      ...legacySave.civilizations['ai-1'].techState,
      completed: ['quantum-computing'],
    };
    legacySave.opponentAI = {
      ...legacySave.opponentAI!,
      majorCivs: {
        ...legacySave.opponentAI!.majorCivs,
        'ai-1': { researchTargetTechId: 'quantum-computing' } as any,
      },
    };
    legacySave.espionage = {
      player: {
        spies: {
          'spy-1': { stolenTechFrom: { 'ai-1': ['quantum-computing', 'quantum-computing'] } } as any,
        },
      } as any,
    };
    const prose = 'Quantum Computing is now Cloud Computing.';

    const migrated = migrateSaveToCurrent(legacySave);

    expect(migrated.civilizations.player.techState).toMatchObject({
      currentResearch: 'cloud-computing',
      researchQueue: ['genomics'],
      researchProgress: 420,
    });
    expect(migrated.civilizations['ai-1'].techState.completed).toEqual(['cloud-computing']);
    expect(migrated.opponentAI?.majorCivs['ai-1'].researchTargetTechId).toBe('cloud-computing');
    expect(migrated.espionage?.player.spies['spy-1'].stolenTechFrom?.['ai-1']).toEqual(['cloud-computing']);
    expect(prose).toBe('Quantum Computing is now Cloud Computing.');
  });

  it('leaves a malformed legacy civilization for later state normalization', () => {
    const legacySave = {
      turn: 1,
      currentPlayer: 'player',
      civilizations: { player: { civType: 'rome' } },
    };

    expect(migrateSaveToCurrent(legacySave)).toMatchObject({
      saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      civilizations: { player: { civType: 'rome' } },
    });
  });

  it('tolerates incomplete legacy technology state before later normalization', () => {
    const legacySave = createNewGame('rome', 'partial-tech-state', 'small');
    delete (legacySave.civilizations.player.techState as Partial<typeof legacySave.civilizations.player.techState>).researchQueue;

    expect(() => migrateSaveToCurrent(legacySave)).not.toThrow();
  });
});
