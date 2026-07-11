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
});
