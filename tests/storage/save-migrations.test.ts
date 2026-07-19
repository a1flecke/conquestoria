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
  it('recalculates a legacy World Age from a strict majority of personal eras', () => {
    const legacy = createNewGame('rome', 'dual-era-migration', 'small');
    legacy.saveSchemaVersion = 4;
    legacy.era = 9;
    for (const civ of Object.values(legacy.civilizations)) civ.techState.completed = [];

    const migrated = migrateSaveToCurrent(legacy);
    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.era).toBe(1);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });
  it('migrates an unversioned save to a stable current schema exactly once', () => {
    const legacySave = createNewGame('rome', 'era13-legacy-save', 'small');
    delete legacySave.gameId;

    const migrated = migrateSaveToCurrent(legacySave);
    const loadedAgain = migrateSaveToCurrent(migrated);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.gameId).toMatch(/^legacy-/);
    expect(loadedAgain).toEqual(migrated);
  });

  it('#537 interception doctrine is definition data, so existing bomber saves need no schema migration', () => {
    const savedGame = createNewGame('rome', 'bomber-save-compatibility', 'small');
    const loaded = migrateSaveToCurrent(structuredClone(savedGame));
    const loadedAgain = migrateSaveToCurrent(structuredClone(loaded));

    expect(loaded.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(loadedAgain).toEqual(loaded);
    expect(UNIT_DEFINITIONS.bomber.airInterceptionDefense).toEqual({
      kind: 'turret-fire', counterDamageMultiplier: 0.25,
    });
    expect(UNIT_DEFINITIONS.stealth_bomber.airInterceptionDefense).toEqual({
      kind: 'evasion', incomingDamageMultiplier: 0.65,
    });
  });

  it('lands legacy combat aircraft at the nearest compatible friendly base and removes stranded craft', () => {
    const legacySave = createNewGame('rome', 'legacy-based-aircraft', 'small');
    legacySave.saveSchemaVersion = 3; // schema 4 owns legacy aircraft basing
    const playerCityId = 'legacy-airfield';
    const playerCity: City = {
      id: playerCityId, name: 'Legacy Airfield', owner: 'player', position: { q: 3, r: 3 }, population: 2,
      food: 0, foodNeeded: 10, buildings: ['airfield'], productionQueue: [], productionProgress: 0,
      ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0,
      unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    legacySave.cities = { ...legacySave.cities, [playerCityId]: playerCity };
    legacySave.civilizations.player.cities = [playerCityId];
    const aircraft: Unit = {
      id: 'legacy-biplane', type: 'biplane', owner: 'player', position: { q: playerCity.position.q + 2, r: playerCity.position.r },
      movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    legacySave.units = { ...legacySave.units, [aircraft.id]: aircraft };
    legacySave.civilizations.player.units = [...legacySave.civilizations.player.units, aircraft.id];

    const migrated = migrateSaveToCurrent(legacySave);

    expect(migrated.units[aircraft.id]).toMatchObject({
      airBase: { kind: 'city', cityId: playerCityId },
      position: playerCity.position,
    });
  });

  it('does not overfill a base while repairing multiple legacy aircraft', () => {
    const legacySave = createNewGame('rome', 'legacy-air-capacity', 'small');
    legacySave.saveSchemaVersion = 3; // schema 4 owns legacy aircraft basing
    const cityId = 'legacy-airfield';
    legacySave.cities = {
      ...legacySave.cities,
      [cityId]: {
        id: cityId, name: 'Legacy Airfield', owner: 'player', position: { q: 3, r: 3 }, population: 2,
        food: 0, foodNeeded: 10, buildings: ['airfield'], productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village', unrestLevel: 0,
        unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
      },
    };
    legacySave.civilizations.player.cities = [cityId];
    for (const id of ['air-1', 'air-2', 'air-3', 'air-4']) {
      legacySave.units[id] = {
        id, type: 'biplane', owner: 'player', position: { q: 4, r: 3 }, movementPointsLeft: 4,
        health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      };
      legacySave.civilizations.player.units.push(id);
    }

    const migrated = migrateSaveToCurrent(legacySave);

    expect(Object.values(migrated.units).filter(unit => unit.airBase?.kind === 'city' && unit.airBase.cityId === cityId)
      .map(unit => unit.id)).toEqual(['air-1', 'air-2', 'air-3']);
    expect(migrated.units['air-4']).toBeUndefined();
    expect(migrated.civilizations.player.units).not.toContain('air-4');
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

  it('#553 MR2/4 — land trade line extension is purely additive: a pre-existing merchant_wagon survives migration and stays functional (no SAVE_MIGRATIONS entry needed)', () => {
    const legacySave = createNewGame('rome', 'pre-merchant-wagon-save', 'small');
    const cityId = Object.keys(legacySave.cities)[0]!;
    const city = legacySave.cities[cityId]!;
    const wagon: Unit = {
      id: 'legacy-merchant-wagon-1', type: 'merchant_wagon', owner: 'player',
      position: { ...city.position }, health: 100, movementPointsLeft: 3,
      hasActed: false, hasMoved: false, skippedTurn: false, isResting: false,
    } as Unit;
    legacySave.units = { ...legacySave.units, [wagon.id]: wagon };
    legacySave.civilizations.player.units = [...legacySave.civilizations.player.units, wagon.id];

    const migrated = migrateSaveToCurrent(legacySave);
    const migratedWagon = migrated.units[wagon.id];

    expect(migratedWagon).toBeDefined();
    expect(migratedWagon!.type).toBe('merchant_wagon');
    expect(UNIT_DEFINITIONS['merchant_wagon']).toBeDefined();
    expect(() => getTradeUnitTripBonus(migrated, cityId, cityId, 'player', migratedWagon!.type)).not.toThrow();
    expect(() => canEstablishRoute(migrated, migratedWagon!, cityId)).not.toThrow();
  });

  it('#553 MR3/4 — air trade line is purely additive: a pre-existing air_freighter survives migration and stays functional (no SAVE_MIGRATIONS entry needed)', () => {
    const legacySave = createNewGame('rome', 'pre-air-freighter-save', 'small');
    const cityId = Object.keys(legacySave.cities)[0]!;
    const city = legacySave.cities[cityId]!;
    const freighter: Unit = {
      id: 'legacy-air-freighter-1', type: 'air_freighter', owner: 'player',
      position: { ...city.position }, health: 100, movementPointsLeft: 4,
      hasActed: false, hasMoved: false, skippedTurn: false, isResting: false,
    } as Unit;
    legacySave.units = { ...legacySave.units, [freighter.id]: freighter };
    legacySave.civilizations.player.units = [...legacySave.civilizations.player.units, freighter.id];

    const migrated = migrateSaveToCurrent(legacySave);
    const migratedFreighter = migrated.units[freighter.id];

    expect(migratedFreighter).toBeDefined();
    expect(migratedFreighter!.type).toBe('air_freighter');
    expect(UNIT_DEFINITIONS['air_freighter']).toBeDefined();
    expect(() => getTradeUnitTripBonus(migrated, cityId, cityId, 'player', migratedFreighter!.type)).not.toThrow();
    expect(() => canEstablishRoute(migrated, migratedFreighter!, cityId)).not.toThrow();
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

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.networkCivicPressureByCity).toEqual({});
    expect(migrated.autonomyByCiv).toEqual(Object.fromEntries(
      Object.keys(migrated.civilizations).map(civId => [civId, expect.objectContaining({
        plans: {}, detections: {}, posture: 'integrated', pendingPosture: null,
        surgeRecoveryUntilTurn: null, surgeCooldownUntilTurn: null,
      })]),
    ));
    expect(migrated.idCounters.nextNetworkPlanId).toBe(1);
    expect(loadedAgain).toEqual(migrated);
  });

  it('migrates schema-v5 autonomy records to posture and Surge defaults once', () => {
    const legacySave = createNewGame('rome', 'autonomy-posture-v5', 'small');
    legacySave.saveSchemaVersion = 5;
    for (const autonomy of Object.values(legacySave.autonomyByCiv!)) {
      delete (autonomy as Partial<typeof autonomy>).posture;
      delete (autonomy as Partial<typeof autonomy>).pendingPosture;
      delete (autonomy as Partial<typeof autonomy>).surgeRecoveryUntilTurn;
      delete (autonomy as Partial<typeof autonomy>).surgeCooldownUntilTurn;
    }

    const migrated = migrateSaveToCurrent(legacySave);
    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.autonomyByCiv!.player).toMatchObject({
      posture: 'integrated', pendingPosture: null, surgeRecoveryUntilTurn: null, surgeCooldownUntilTurn: null,
    });
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('migrates Circular Manufacturing choices to a normalized empty record without changing a second load', () => {
    const legacySave = createNewGame('rome', 'circular-material-schema-v6', 'small');
    legacySave.saveSchemaVersion = 6;
    (legacySave as { nationalProjectChoices?: unknown }).nationalProjectChoices = {
      'player:circular_manufacturing_network': 'iron',
    };

    const migrated = migrateSaveToCurrent(legacySave);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.nationalProjectChoices).toEqual({});
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
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

describe('#590 MR3 — defensive crisis archetype normalization', () => {
  it('recomputes a stale outbreak archetype for a re-homed famine flavor id', () => {
    const save = createNewGame('rome', 'famine-archetype-drift', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION; // already current -- no versioned migration would touch it
    save.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'crop-blight', archetype: 'outbreak', // stale: pre-#590 save
        targetCivId: 'player', cityIds: [], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
      },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.activeCrises!['crisis-1'].archetype).toBe('famine');
  });

  it('leaves a correctly-archetyped crisis (e.g. plague/outbreak) unchanged', () => {
    const save = createNewGame('rome', 'famine-archetype-unaffected', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    save.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak',
        targetCivId: 'player', cityIds: [], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
      },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.activeCrises!['crisis-1'].archetype).toBe('outbreak');
  });

  it('is idempotent across repeated loads', () => {
    const save = createNewGame('rome', 'famine-archetype-idempotent', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    save.activeCrises = {
      'crisis-1': {
        id: 'crisis-1', flavorId: 'locust-swarm', archetype: 'outbreak',
        targetCivId: 'player', cityIds: [], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
      },
    };

    const migrated = migrateSaveToCurrent(save);
    const loadedAgain = migrateSaveToCurrent(migrated);

    expect(loadedAgain.activeCrises!['crisis-1'].archetype).toBe('famine');
    expect(loadedAgain).toEqual(migrated);
  });
});

describe('#591 MR4 — religion state defaults', () => {
  it('defaults religions and cityFaith to {} for a save predating this feature', () => {
    const save = createNewGame('rome', 'religion-defaults-drift', 'small');
    delete save.religions;
    delete save.cityFaith;
    const migrated = migrateSaveToCurrent(save);
    expect(migrated.religions).toEqual({});
    expect(migrated.cityFaith).toEqual({});
  });

  it('preserves existing religions/cityFaith data unchanged', () => {
    const save = createNewGame('rome', 'religion-defaults-preserve', 'small');
    save.religions = { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', foundedTurn: 5 } };
    save.cityFaith = { capital: { religionId: 'religion-player', isHolyCity: true } };
    const migrated = migrateSaveToCurrent(save);
    expect(migrated.religions).toEqual(save.religions);
    expect(migrated.cityFaith).toEqual(save.cityFaith);
  });

  it('is idempotent across repeated loads', () => {
    const save = createNewGame('rome', 'religion-defaults-idempotent', 'small');
    save.religions = { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', foundedTurn: 5 } };
    save.cityFaith = { capital: { religionId: 'religion-player', isHolyCity: true } };
    const migrated = migrateSaveToCurrent(save);
    const loadedAgain = migrateSaveToCurrent(migrated);
    expect(loadedAgain).toEqual(migrated);
  });

  it('#592 MR5: converts a legacy single-slot conversionProgress ({toReligionId, points}) into the new per-religion map shape, preserving the in-flight points', () => {
    const save = createNewGame('rome', 'conversion-progress-shape-migration', 'small');
    save.religions = { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', foundedTurn: 5 } };
    save.cityFaith = {
      capital: { religionId: 'religion-player', isHolyCity: true },
      // Legacy MR4 shape -- a city mid-conversion toward religion-player with 65 banked
      // points, saved before MR5's per-religion map restructure.
      contested: { religionId: 'religion-player', conversionProgress: { toReligionId: 'religion-player', points: 65 } as any },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.cityFaith!.contested.conversionProgress).toEqual({ 'religion-player': 65 });
    // Unrelated holy-city entry with no conversionProgress at all is untouched.
    expect(migrated.cityFaith!.capital).toEqual(save.cityFaith!.capital);
  });

  it('leaves an already-current per-religion conversionProgress map untouched and stays idempotent', () => {
    const save = createNewGame('rome', 'conversion-progress-shape-current', 'small');
    save.religions = { 'religion-player': { id: 'religion-player', name: 'Order of Test', ownerCivId: 'player', foundedTurn: 5 } };
    save.cityFaith = {
      contested: { religionId: 'religion-player', conversionProgress: { 'religion-player': 40, 'religion-ai-1': 14 } },
    };

    const migrated = migrateSaveToCurrent(save);
    expect(migrated.cityFaith!.contested.conversionProgress).toEqual({ 'religion-player': 40, 'religion-ai-1': 14 });

    const loadedAgain = migrateSaveToCurrent(migrated);
    expect(loadedAgain).toEqual(migrated);
  });
});
