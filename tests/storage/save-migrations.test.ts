import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, Unit } from '@/core/types';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  migrateSaveToCurrent,
  UnsupportedSaveSchemaVersionError,
} from '@/storage/save-migrations';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getTradeUnitTripBonus, canEstablishRoute } from '@/systems/trade-system';

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

  it('#553 MR1/4 — Trade Routes Overhaul is purely additive: a pre-existing caravan and its committed route survive migration and stay functional (no SAVE_MIGRATIONS entry needed)', () => {
    const legacySave = createNewGame('rome', 'pre-naval-trader-save', 'small');
    const cityId = Object.keys(legacySave.cities)[0]!;
    const city = legacySave.cities[cityId]!;
    const caravan: Unit = {
      id: 'legacy-caravan-1', type: 'caravan', owner: 'player',
      position: { ...city.position }, health: 100, movementPointsLeft: 3,
      hasActed: false, hasMoved: false, skippedTurn: false, isResting: false,
    } as Unit;
    legacySave.units = { ...legacySave.units, [caravan.id]: caravan };
    legacySave.civilizations.player.units = [...legacySave.civilizations.player.units, caravan.id];

    const migrated = migrateSaveToCurrent(legacySave);
    const migratedCaravan = migrated.units[caravan.id];

    expect(migratedCaravan).toBeDefined();
    expect(migratedCaravan!.type).toBe('caravan');
    // Old caravans keep working unchanged — UNIT_DEFINITIONS still resolves them and
    // trade-system functions accept them without needing a unit-type migration.
    expect(UNIT_DEFINITIONS['caravan']).toBeDefined();
    expect(() => getTradeUnitTripBonus(migrated, cityId, cityId, 'player', migratedCaravan!.type)).not.toThrow();
    expect(() => canEstablishRoute(migrated, migratedCaravan!, cityId)).not.toThrow();
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

  it('migrates schema-v1 maps and marketplace prices deterministically for late resources', () => {
    const legacySave = createNewGame('rome', 'late-resource-migration', 'small');
    legacySave.saveSchemaVersion = 1;
    for (const tile of Object.values(legacySave.map.tiles)) {
      if (['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals'].includes(tile.resource ?? '')) {
        tile.resource = null;
      }
    }
    for (const resource of ['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals']) {
      delete legacySave.marketplace!.prices[resource];
      delete legacySave.marketplace!.priceHistory[resource];
    }

    const migrated = migrateSaveToCurrent(legacySave);
    const loadedAgain = migrateSaveToCurrent(migrated);
    const resources = new Set(Object.values(migrated.map.tiles).map(tile => tile.resource));

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    for (const resource of ['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals']) {
      expect(resources).toContain(resource);
      expect(migrated.marketplace!.prices[resource]).toBeGreaterThan(0);
      expect(migrated.marketplace!.priceHistory[resource]).toEqual([migrated.marketplace!.prices[resource]]);
    }
    expect(loadedAgain).toEqual(migrated);
  });

  it('grandfathers a schema-v1 hard-resource queue once', () => {
    const legacySave = createNewGame('rome', 'legacy-resource-queue', 'small');
    legacySave.saveSchemaVersion = 1;
    const city = Object.values(legacySave.cities)[0]!;
    city.productionQueue = ['oil_refinery'];

    const migrated = migrateSaveToCurrent(legacySave);
    expect(migrated.cities[city.id].legacyResourceGrace).toEqual(['oil_refinery']);
  });

  it('migrates a schema-v2 pre-Autonomy save to empty network state once', () => {
    const legacySave = createNewGame('rome', 'autonomy-pre-activation', 'small');
    legacySave.saveSchemaVersion = 2;
    delete legacySave.autonomyByCiv;
    delete legacySave.networkCivicPressureByCity;
    delete legacySave.idCounters.nextNetworkPlanId;

    const migrated = migrateSaveToCurrent(legacySave);
    const loadedAgain = migrateSaveToCurrent(migrated);

    expect(migrated.saveSchemaVersion).toBe(3);
    expect(migrated.networkCivicPressureByCity).toEqual({});
    expect(migrated.autonomyByCiv).toEqual(Object.fromEntries(
      Object.keys(migrated.civilizations).map(civId => [civId, { plans: {}, detections: {} }]),
    ));
    expect(migrated.idCounters.nextNetworkPlanId).toBe(1);
    expect(loadedAgain).toEqual(migrated);
  });

  it('migrates activated legacy Cyber Units in stable order with one Exploit per city', () => {
    const legacySave = createNewGame('rome', 'autonomy-activated-migration', 'small');
    legacySave.saveSchemaVersion = 2;
    const city: City = {
      id: 'city-ai', name: 'Target', owner: 'ai-1', position: { q: 0, r: 0 }, population: 1,
      food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0,
      unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    const cyber = (id: string): Unit => ({
      id, type: 'cyber_unit', owner: 'player', position: { q: 1, r: 0 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    });
    legacySave.cities = { [city.id]: city };
    legacySave.units = { 'unit-9': cyber('unit-9'), 'unit-2': cyber('unit-2') };
    legacySave.civilizations.player = {
      ...legacySave.civilizations.player,
      units: ['unit-9', 'unit-2'],
      techState: { ...legacySave.civilizations.player.techState, completed: ['quantum-computing'] },
      diplomacy: { ...legacySave.civilizations.player.diplomacy, atWarWith: ['ai-1'] },
    };
    legacySave.civilizations['ai-1'] = {
      ...legacySave.civilizations['ai-1'],
      cities: [city.id],
      diplomacy: { ...legacySave.civilizations['ai-1'].diplomacy, atWarWith: ['player'] },
    };
    delete legacySave.autonomyByCiv;

    const migrated = migrateSaveToCurrent(legacySave);

    expect(migrated.autonomyByCiv!.player.plans).toEqual({
      'network-plan-1': expect.objectContaining({ sourceUnitId: 'unit-2', definitionId: 'exploit', target: { kind: 'city', cityId: 'city-ai' } }),
    });
    expect(migrated.idCounters.nextNetworkPlanId).toBe(2);
  });
});
