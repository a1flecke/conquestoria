import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { CURRENT_SAVE_SCHEMA_VERSION, migrateSaveToCurrent } from '@/storage/save-migrations';

function saveAtSchema(version: number) {
  const save = createNewGame('rome', `coastal-battery-schema-${version}`, 'small');
  save.saveSchemaVersion = version;
  return save;
}

describe('save migration 13 — Coastal Battery counterfire marker', () => {
  it('adds no marker to legacy cities and preserves a valid mid-turn marker', () => {
    const legacy = saveAtSchema(12);
    const legacyCity = Object.values(legacy.cities)[0]!;
    delete legacyCity.coastalBatteryCounterfireTurn;

    const migratedLegacy = migrateSaveToCurrent(legacy);
    expect(migratedLegacy.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migratedLegacy.cities[legacyCity.id]!.coastalBatteryCounterfireTurn).toBeUndefined();

    const midTurn = saveAtSchema(12);
    const midTurnCity = Object.values(midTurn.cities)[0]!;
    midTurnCity.coastalBatteryCounterfireTurn = 42;
    const migratedMidTurn = migrateSaveToCurrent(midTurn);
    expect(migratedMidTurn.cities[midTurnCity.id]!.coastalBatteryCounterfireTurn).toBe(42);
    expect(migrateSaveToCurrent(migratedMidTurn)).toEqual(migratedMidTurn);
  });

  it('removes malformed markers even from a save already at the current schema', () => {
    const malformed = saveAtSchema(CURRENT_SAVE_SCHEMA_VERSION);
    const city = Object.values(malformed.cities)[0]!;
    city.coastalBatteryCounterfireTurn = Number.NaN;

    const migrated = migrateSaveToCurrent(malformed);
    expect(migrated.cities[city.id]!.coastalBatteryCounterfireTurn).toBeUndefined();
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });
});
