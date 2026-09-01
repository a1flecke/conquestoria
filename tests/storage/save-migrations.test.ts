import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, CombatRole, GameState, Unit } from '@/core/types';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  migrateSaveToCurrent,
  normalizeImprovementValues,
  UnsupportedSaveSchemaVersionError,
} from '@/storage/save-migrations';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getTradeUnitTripBonus, canEstablishRoute } from '@/systems/trade-system';
import { applyUnitUpgradeToState } from '@/systems/unit-upgrade-system';
import { foundCity } from '@/systems/city-system';
import { processPurposefulBarbarians } from '@/systems/barbarian-system';
import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import { getHeroicCommandEligibility } from '@/systems/great-general-abilities';
import { checkAndQueueGeneralCandidateChoice } from '@/systems/great-general-system';
import { getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import { getEligibleStrategicLaunchPlatforms } from '@/systems/strategic-launch-system';
import { hasArmsControlTreaty } from '@/systems/diplomacy-system';

describe('save migrations', () => {
  it('#701 initializes and normalizes crisis-force records idempotently', () => {
    const save = createNewGame('rome', 'crisis-force-migration', 'small');
    save.saveSchemaVersion = 14;
    const crisisUnit = { ...Object.values(save.units)[0]!, id: 'orphan-crisis', owner: CRISIS_FORCE_OWNER };
    save.units['orphan-crisis'] = crisisUnit;
    save.crisisForces = {
      invalid: { id: 'invalid', targetCivId: 'missing', severity: 'standard', createdTurn: 1, unitIds: ['orphan-crisis'] },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.crisisForces).toEqual({});
    expect(migrated.units['orphan-crisis']).toBeUndefined();
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('#702 retains a valid committed herd route and removes malformed routes', () => {
    const save = createNewGame('rome', 'herd-route-migration', 'small');
    save.saveSchemaVersion = 15;
    const unit = { ...Object.values(save.units)[0]!, id: 'herd-1', owner: CRISIS_FORCE_OWNER, position: { q: 1, r: 1 } };
    save.units[unit.id] = unit;
    save.crisisForces = {
      stampede: {
        id: 'stampede', targetCivId: 'player', severity: 'standard', createdTurn: 1, unitIds: [unit.id],
        herdRoutes: {
          [unit.id]: { unitId: unit.id, committedTurn: 1, steps: [] },
          invalid: { unitId: 'missing', committedTurn: 1, steps: [{ q: 1.5, r: 1 }] },
          'herd-1-off-map': { unitId: unit.id, committedTurn: 1, steps: [{ q: 999, r: 999 }] },
        },
      },
    };

    const migrated = migrateSaveToCurrent(save);
    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.crisisForces?.stampede.herdRoutes).toEqual({ [unit.id]: { unitId: unit.id, committedTurn: 1, steps: [] } });
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('#703 initializes malformed Stampede state and removes its orphaned force at schema 17', () => {
    const save = createNewGame('rome', 'stampede-schema-17', 'small');
    save.saveSchemaVersion = 16;
    const herd = { ...Object.values(save.units)[0]!, id: 'stampede-orphan-herd', owner: CRISIS_FORCE_OWNER };
    save.units[herd.id] = herd;
    save.crisisForces = {
      'stampede-player-1': {
        id: 'stampede-player-1', targetCivId: 'player', severity: 'standard', createdTurn: 1, unitIds: [herd.id],
      },
    };
    save.stampedes = { player: { targetCivId: 'missing' } } as never;

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.stampedes).toEqual({});
    expect(migrated.crisisForces).toEqual({});
    expect(migrated.units[herd.id]).toBeUndefined();
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('#705 initializes Host state at schema 18, removes malformed records, and is idempotent', () => {
    const save = createNewGame('rome', 'rogue-host-schema-18', 'small');
    save.saveSchemaVersion = 17;
    save.rogueElephantHosts = {
      player: { targetCivId: 'missing', phase: 'active', forceId: 'missing-force' },
    } as never;

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.rogueElephantHosts).toEqual({});
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('#706 preserves an in-progress Host dispersal and Recovered Harnesses through schema 19', () => {
    const save = createNewGame('rome', 'rogue-host-schema-19', 'small');
    save.saveSchemaVersion = 18;
    const herd = { ...Object.values(save.units)[0]!, id: 'host-herd', type: 'beast_stampede_herd' as const, owner: CRISIS_FORCE_OWNER };
    save.units[herd.id] = herd;
    save.crisisForces = {
      'rogue-host': { id: 'rogue-host', targetCivId: 'player', severity: 'standard', createdTurn: 3, unitIds: [herd.id] },
    };
    save.rogueElephantHosts = {
      player: {
        targetCivId: 'player', forceId: 'rogue-host', phase: 'dispersing', dispersalTurnsRemaining: 2,
        recoveredHarnesses: { expiresTurn: 14 }, recoveredHarnessesEligibleUnitSeen: true,
      },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.rogueElephantHosts?.player).toMatchObject({
      phase: 'dispersing', forceId: 'rogue-host', dispersalTurnsRemaining: 2,
      recoveredHarnesses: { expiresTurn: 14 }, recoveredHarnessesEligibleUnitSeen: true,
    });
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('#707 preserves a current-schema Stampede warning and its committed route idempotently', () => {
    const save = createNewGame('rome', 'stampede-current-round-trip', 'small');
    const herd = { ...Object.values(save.units)[0]!, id: 'stampede-herd', type: 'beast_stampede_herd' as const, owner: CRISIS_FORCE_OWNER };
    save.units[herd.id] = herd;
    save.crisisForces = {
      stampede: {
        id: 'stampede', targetCivId: 'player', severity: 'standard', createdTurn: 1, unitIds: [herd.id],
        herdRoutes: { [herd.id]: { unitId: herd.id, committedTurn: 1, steps: [] } },
      },
    };
    save.stampedes = {
      player: {
        targetCivId: 'player', forceId: 'stampede', phase: 'warning', createdTurn: 1,
        eligibleTurns: 2, activeTurns: 0, cityDamage: 0, civilianDeaths: 0, pillagedTileKeys: [],
      },
    };

    const loaded = migrateSaveToCurrent(structuredClone(save));

    expect(loaded.stampedes?.player).toMatchObject({ forceId: 'stampede', phase: 'warning', eligibleTurns: 2 });
    expect(loaded.crisisForces?.stampede.herdRoutes?.[herd.id]).toEqual({ unitId: herd.id, committedTurn: 1, steps: [] });
    expect(migrateSaveToCurrent(structuredClone(loaded))).toEqual(loaded);
  });

  it('#698 migrates camp pressure, rejects malformed facts, and remains idempotent', () => {
    const save = createNewGame('rome', 'camp-pressure-migration', 'small');
    save.turn = 9;
    save.barbarianCamps = {
      'camp-a': { id: 'camp-a', position: { q: 2, r: 2 }, strength: 5, spawnCooldown: 3 },
    };
    save.saveSchemaVersion = 13;
    save.barbarianCampPressure = {
      'camp-a': { armorLastObservedTurn: 4, airLastObservedTurn: -1 },
      missing: { armorLastObservedTurn: 4 },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.barbarianCampPressure).toEqual({ 'camp-a': { armorLastObservedTurn: 4 } });
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it("#700 preserves a due camp's normalized local pressure across a legacy save replay", () => {
    const save = createNewGame('rome', 'camp-pressure-due-replay', 'small');
    save.turn = 20;
    save.saveSchemaVersion = 13;
    save.barbarianCamps = {
      'camp-a': { id: 'camp-a', position: { q: 2, r: 2 }, strength: 6, spawnCooldown: 1 },
    };
    save.barbarianCampPressure = {
      'camp-a': { armorLastObservedTurn: 20, airLastObservedTurn: 9 },
    };

    const migrated = migrateSaveToCurrent(structuredClone(save));
    const replay = processPurposefulBarbarians(migrated);
    const replayAgain = processPurposefulBarbarians(migrateSaveToCurrent(structuredClone(migrated)));

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(replay.barbarianCampPressure).toEqual({ 'camp-a': { armorLastObservedTurn: 20, airLastObservedTurn: 9 } });
    expect(replay.spawnedUnits).toEqual(replayAgain.spawnedUnits);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });
  it('preserves Fort saves, clamps invalid build timers, and clears unknown improvements idempotently', () => {
    const savedGame = createNewGame('rome', 'fort-save-normalization', 'small');
    const [fortKey, invalidKey] = Object.keys(savedGame.map.tiles);
    savedGame.map.tiles[fortKey] = {
      ...savedGame.map.tiles[fortKey],
      improvement: 'fort',
      improvementTurnsLeft: 99,
    };
    savedGame.map.tiles[invalidKey] = {
      ...savedGame.map.tiles[invalidKey],
      improvement: 'obsolete-fort' as never,
      improvementTurnsLeft: 4,
    };

    const normalized = normalizeImprovementValues(savedGame);

    expect(normalized.map.tiles[fortKey]).toMatchObject({ improvement: 'fort', improvementTurnsLeft: 5 });
    expect(normalized.map.tiles[invalidKey]).toMatchObject({ improvement: 'none', improvementTurnsLeft: 0 });
    expect(normalizeImprovementValues(normalized)).toEqual(normalized);
  });

  it.each(['legacy', 'current'] as const)('preserves an upgraded damaged veteran through %s save normalization', schema => {
    const save = createNewGame('rome', `upgrade-${schema}-round-trip`, 'small');
    const civ = save.civilizations.player;
    const source = civ.units.map(id => save.units[id]).find(Boolean)!;
    const city = foundCity(civ.id, source.position, save.map, save.idCounters);
    save.cities[city.id] = city;
    civ.cities = [city.id];
    source.id = 'upgrade-veteran';
    source.type = 'spy_scout';
    source.health = 41;
    source.experience = 3;
    save.units = { [source.id]: source };
    civ.units = [source.id];
    civ.gold = 100;
    civ.techState.completed = ['espionage-scouting', 'espionage-informants'];
    if (schema === 'legacy') delete (save as Partial<GameState>).saveSchemaVersion;

    const upgraded = applyUnitUpgradeToState(migrateSaveToCurrent(save), source.id, 'spy_informant');
    expect(upgraded.upgraded).toBe(true);
    const loadedAgain = migrateSaveToCurrent(migrateSaveToCurrent(upgraded.state));
    expect(loadedAgain.units[source.id]).toMatchObject({
      type: 'spy_informant', health: 41, experience: 3, movementPointsLeft: 0, hasActed: true,
    });
    expect(loadedAgain.civilizations.player.gold).toBe(75);
  });
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

  it('#672 Chariot is definition data, so a saved Chariot round-trips without a schema migration', () => {
    const savedGame = createNewGame('rome', 'chariot-save-compatibility', 'small');
    const unit = Object.values(savedGame.units)[0]!;
    unit.type = 'chariot';

    const loaded = migrateSaveToCurrent(structuredClone(savedGame));
    const loadedAgain = migrateSaveToCurrent(structuredClone(loaded));

    expect(loaded.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(loaded.units[unit.id]?.type).toBe('chariot');
    expect(loadedAgain).toEqual(loaded);
  });

  it('#688 Tank Depot infrastructure is definition data and survives save normalization unchanged', () => {
    const savedGame = createNewGame('rome', 'tank-depot-save-compatibility', 'small');
    const cityId = Object.keys(savedGame.cities)[0]!;
    savedGame.cities[cityId]!.buildings = ['tank_depot'];
    const loaded = migrateSaveToCurrent(structuredClone(savedGame));
    expect(loaded.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(loaded.cities[cityId]!.buildings).toEqual(['tank_depot']);
    expect(migrateSaveToCurrent(loaded)).toEqual(loaded);
  });

  it('#693 Bunker infrastructure is definition data and survives save normalization unchanged', () => {
    const savedGame = createNewGame('rome', 'bunker-save-compatibility', 'small');
    const cityId = Object.keys(savedGame.cities)[0]!;
    savedGame.cities[cityId]!.buildings = ['walls', 'star_fort', 'bunker'];
    const loaded = migrateSaveToCurrent(structuredClone(savedGame));

    expect(loaded.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(loaded.cities[cityId]!.buildings).toEqual(['walls', 'star_fort', 'bunker']);
    expect(migrateSaveToCurrent(loaded)).toEqual(loaded);
  });

  it('#678 preserves a legacy Biplane queue by retiming it to the legal fighter successor', () => {
    const savedGame = createNewGame('rome', 'retimed-biplane-queue', 'small');
    const source = Object.values(savedGame.units)[0]!;
    const city = foundCity('player', source.position, savedGame.map, savedGame.idCounters);
    city.productionQueue = ['warrior', 'biplane', 'archer'];
    savedGame.cities = { [city.id]: city };
    savedGame.civilizations.player.cities = [city.id];
    savedGame.civilizations.player.techState.completed = ['aviation', 'air-superiority'];

    const migrated = migrateSaveToCurrent(savedGame);
    expect(migrated.cities[city.id]?.productionQueue).toEqual(['warrior', 'wwii_fighter', 'archer']);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
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

  it('grandfathers pre-retime queued Cavalry exactly once without making new early Cavalry legal', () => {
    const legacySave = createNewGame('rome', 'legacy-cavalry-queue', 'small');
    legacySave.saveSchemaVersion = 9; // schema 10 owns the Cavalry retime
    const city = Object.values(legacySave.cities)[0]!;
    city.productionQueue = ['cavalry', 'cavalry'];
    city.productionProgress = 80;

    const migrated = migrateSaveToCurrent(legacySave);
    const loadedAgain = migrateSaveToCurrent(migrated);

    expect(migrated.cities[city.id]).toMatchObject({
      productionQueue: ['cavalry', 'cavalry'], legacyTechGrace: ['cavalry', 'cavalry'],
    });
    expect(loadedAgain).toEqual(migrated);
  });

  it('grandfathers schema-10 queued Knights exactly once after the Cuirassier retime', () => {
    const legacySave = createNewGame('rome', 'legacy-knight-queue', 'small');
    legacySave.saveSchemaVersion = 10;
    const city = Object.values(legacySave.cities)[0]!;
    city.productionQueue = ['knight', 'knight'];

    const migrated = migrateSaveToCurrent(legacySave);
    const loadedAgain = migrateSaveToCurrent(migrated);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.cities[city.id]).toMatchObject({
      productionQueue: ['knight', 'knight'], legacyTechGrace: ['knight', 'knight'],
    });
    expect(loadedAgain).toEqual(migrated);
  });

  it('removes malformed legacy Cavalry grace data from an otherwise current save', () => {
    const save = createNewGame('rome', 'malformed-cavalry-grace', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const city = Object.values(save.cities)[0]!;
    city.legacyTechGrace = { cavalry: true } as unknown as string[];

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.cities[city.id].legacyTechGrace).toBeUndefined();
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('retains only Cavalry in persisted retime grace data', () => {
    const save = createNewGame('rome', 'wrong-unit-cavalry-grace', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const city = Object.values(save.cities)[0]!;
    city.legacyTechGrace = ['horseman', 'cavalry'];

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.cities[city.id].legacyTechGrace).toEqual(['cavalry']);
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

  it('#545 MR4 defaults strategicStrikesReceivedFrom to [] at schema 20 and is idempotent', () => {
    const save = createNewGame('rome', 'strategic-strikes-received-schema-20', 'small');
    save.saveSchemaVersion = 19;
    delete (save.civilizations.player.diplomacy as { strategicStrikesReceivedFrom?: string[] }).strategicStrikesReceivedFrom;

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.civilizations.player.diplomacy.strategicStrikesReceivedFrom).toEqual([]);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('#545 MR4 preserves an existing strategicStrikesReceivedFrom value through migration', () => {
    const save = createNewGame('rome', 'strategic-strikes-received-preserved', 'small');
    save.saveSchemaVersion = 19;
    save.civilizations.player.diplomacy.strategicStrikesReceivedFrom = ['ai-1'];

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.civilizations.player.diplomacy.strategicStrikesReceivedFrom).toEqual(['ai-1']);
  });

  it('#720 normalizes military quest facts at schema 21 without reconstructing missing history', () => {
    const save = createNewGame('rome', 'military-quest-fact-schema-21', 'small');
    save.saveSchemaVersion = 20;
    save.legendaryWonderHistory = {
      destroyedStrongholds: [],
      discoveredSites: [],
      militaryFacts: [
        { id: 'combat-win:4:a:b:a', kind: 'surviving-combat-win', civId: 'player', unitId: 'a', role: 'frontline', turn: 4 },
        { id: 'combat-win:4:a:b:a', kind: 'surviving-combat-win', civId: 'player', unitId: 'a', role: 'frontline', turn: 4 },
        { id: '', kind: 'successful-interception', civId: 'player', interceptorId: 'fighter', turn: 4 },
      ] as any,
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.legendaryWonderHistory?.militaryFacts).toEqual([
      { id: 'combat-win:4:a:b:a', kind: 'surviving-combat-win', civId: 'player', unitId: 'a', role: 'frontline', turn: 4 },
    ]);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('#721 normalizes owner-scoped tactical wonder effect state at schema 22', () => {
    const save = createNewGame('rome', 'tactical-wonder-effect-schema-22', 'small') as GameState & {
      legendaryWonderTacticalEffects?: unknown;
    };
    save.saveSchemaVersion = 21;
    save.legendaryWonderTacticalEffects = {
      trainingGrantsByCiv: {
        player: { era: 3, grantedRoles: ['frontline', 'ranged', 'frontline', 'not-a-role' as unknown as CombatRole] },
        missing: { era: 3, grantedRoles: ['siege'] },
        malformed: { era: -1, grantedRoles: ['frontline'] },
      },
      interceptionClaimTurnByCiv: { player: 12, missing: 12, malformed: -1 },
    };

    const migrated = migrateSaveToCurrent(save) as GameState & {
      legendaryWonderTacticalEffects?: unknown;
    };

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.legendaryWonderTacticalEffects).toEqual({
      trainingGrantsByCiv: { player: { era: 3, grantedRoles: ['frontline', 'ranged'] } },
      interceptionClaimTurnByCiv: { player: 12 },
    });
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
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

describe('#751 — migrateCoastalHullsOffOcean (schema 9)', () => {
  it('relocates a coastal-only hull stranded on ocean to the nearest coast tile', () => {
    const save = createNewGame('rome', 'naval-migration-relocate', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;

    const coastEntry = Object.entries(save.map.tiles).find(([, tile]) => tile.terrain === 'coast');
    if (!coastEntry) throw new Error('fixture map has no coast tile — regenerate with a different seed');
    const [, coastTile] = coastEntry;
    const oceanNeighborKey = Object.keys(save.map.tiles).find(key => {
      const tile = save.map.tiles[key]!;
      if (tile.terrain !== 'ocean') return false;
      const dq = Math.abs(tile.coord.q - coastTile.coord.q);
      const dr = Math.abs(tile.coord.r - coastTile.coord.r);
      return dq <= 1 && dr <= 1;
    });
    if (!oceanNeighborKey) throw new Error('fixture map has no ocean tile adjacent to a coast tile — regenerate with a different seed');
    const oceanTile = save.map.tiles[oceanNeighborKey]!;

    const galley = { ...Object.values(save.units)[0]!, id: 'stranded-galley', type: 'galley' as const, owner: civ.id, position: { ...oceanTile.coord } };
    save.units = { [galley.id]: galley };
    civ.units = [galley.id];

    const migrated = migrateSaveToCurrent(save);
    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    const relocated = migrated.units[galley.id]!;
    const relocatedTile = migrated.map.tiles[`${relocated.position.q},${relocated.position.r}`]!;
    expect(relocatedTile.terrain).not.toBe('ocean');
  });

  it('moves loaded cargo along with a relocated Transport', () => {
    const save = createNewGame('rome', 'naval-migration-cargo', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;

    const coastEntry = Object.entries(save.map.tiles).find(([, tile]) => tile.terrain === 'coast');
    if (!coastEntry) throw new Error('fixture map has no coast tile — regenerate with a different seed');
    const [, coastTile] = coastEntry;
    const oceanNeighborKey = Object.keys(save.map.tiles).find(key => {
      const tile = save.map.tiles[key]!;
      if (tile.terrain !== 'ocean') return false;
      const dq = Math.abs(tile.coord.q - coastTile.coord.q);
      const dr = Math.abs(tile.coord.r - coastTile.coord.r);
      return dq <= 1 && dr <= 1;
    });
    if (!oceanNeighborKey) throw new Error('fixture map has no ocean tile adjacent to a coast tile — regenerate with a different seed');
    const oceanTile = save.map.tiles[oceanNeighborKey]!;

    const transport = { ...Object.values(save.units)[0]!, id: 'stranded-transport', type: 'transport' as const, owner: civ.id, position: { ...oceanTile.coord }, cargoUnitIds: ['cargo-warrior'] };
    const cargo = { ...Object.values(save.units)[0]!, id: 'cargo-warrior', type: 'warrior' as const, owner: civ.id, position: { ...oceanTile.coord }, transportId: transport.id };
    save.units = { [transport.id]: transport, [cargo.id]: cargo };
    civ.units = [transport.id, cargo.id];

    const migrated = migrateSaveToCurrent(save);
    const relocatedTransport = migrated.units[transport.id]!;
    const relocatedCargo = migrated.units[cargo.id]!;
    expect(relocatedCargo.position).toEqual(relocatedTransport.position);
  });

  it('removes a coastal-only unit with no reachable coast (deletion fallback)', () => {
    const save = createNewGame('rome', 'naval-migration-no-coast', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;

    const oceanTiles: GameState['map']['tiles'] = {};
    for (let q = 0; q < 3; q += 1) {
      for (let r = 0; r < 3; r += 1) {
        oceanTiles[`${q},${r}`] = {
          coord: { q, r }, terrain: 'ocean', elevation: 'lowland', resource: null,
          improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        };
      }
    }
    save.map = { width: 3, height: 3, tiles: oceanTiles, wrapsHorizontally: false, rivers: [] };

    const galley = { ...Object.values(save.units)[0]!, id: 'unreachable-galley', type: 'galley' as const, owner: civ.id, position: { q: 1, r: 1 } };
    save.units = { [galley.id]: galley };
    civ.units = [galley.id];
    // The synthetic 3x3 map above doesn't contain createNewGame's original starting-city
    // position, so both save.cities and civ.cities must be cleared together here — leaving
    // civ.cities pointing at a city id no longer present in save.cities would dangle through
    // this migration pipeline's unconditional passes exactly the way a stale diplomacy
    // reference would (see game-systems.md's Diplomacy Lifecycle rule for the general pattern).
    save.cities = {};
    civ.cities = [];

    const migrated = migrateSaveToCurrent(save);
    expect(migrated.units[galley.id]).toBeUndefined();
    expect(migrated.civilizations.player.units).not.toContain(galley.id);
  });

  it('logs a per-owner notification and does not leak it to other civs (hot-seat privacy)', () => {
    const save = createNewGame('rome', 'naval-migration-notify', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;
    const otherCivId = Object.keys(save.civilizations).find(id => id !== civ.id)!;

    const coastEntry = Object.entries(save.map.tiles).find(([, tile]) => tile.terrain === 'coast');
    if (!coastEntry) throw new Error('fixture map has no coast tile — regenerate with a different seed');
    const [, coastTile] = coastEntry;
    const oceanNeighborKey = Object.keys(save.map.tiles).find(key => {
      const tile = save.map.tiles[key]!;
      if (tile.terrain !== 'ocean') return false;
      const dq = Math.abs(tile.coord.q - coastTile.coord.q);
      const dr = Math.abs(tile.coord.r - coastTile.coord.r);
      return dq <= 1 && dr <= 1;
    });
    if (!oceanNeighborKey) throw new Error('fixture map has no ocean tile adjacent to a coast tile — regenerate with a different seed');
    const oceanTile = save.map.tiles[oceanNeighborKey]!;

    const galley = { ...Object.values(save.units)[0]!, id: 'stranded-galley', type: 'galley' as const, owner: civ.id, position: { ...oceanTile.coord } };
    save.units = { [galley.id]: galley };
    civ.units = [galley.id];

    const migrated = migrateSaveToCurrent(save);
    const ownerNotifications = migrated.notificationLog?.[civ.id] ?? [];
    const otherNotifications = migrated.notificationLog?.[otherCivId] ?? [];
    expect(ownerNotifications.some(entry => entry.message.includes('Galley'))).toBe(true);
    expect(otherNotifications.some(entry => entry.message.includes('Galley'))).toBe(false);
  });

  it('never relocates two stranded units (even different owners) onto the same tile', () => {
    const save = createNewGame('rome', 'naval-migration-no-stack', 'small');
    save.saveSchemaVersion = 8;
    const civ = save.civilizations.player;
    const otherCivId = Object.keys(save.civilizations).find(id => id !== civ.id)!;

    const coastEntry = Object.entries(save.map.tiles).find(([, tile]) => tile.terrain === 'coast');
    if (!coastEntry) throw new Error('fixture map has no coast tile — regenerate with a different seed');
    const [, coastTile] = coastEntry;
    const oceanNeighborKey = Object.keys(save.map.tiles).find(key => {
      const tile = save.map.tiles[key]!;
      if (tile.terrain !== 'ocean') return false;
      const dq = Math.abs(tile.coord.q - coastTile.coord.q);
      const dr = Math.abs(tile.coord.r - coastTile.coord.r);
      return dq <= 1 && dr <= 1;
    });
    if (!oceanNeighborKey) throw new Error('fixture map has no ocean tile adjacent to a coast tile — regenerate with a different seed');
    const oceanTile = save.map.tiles[oceanNeighborKey]!;

    // Two coastal-only units of different owners, stacked on the exact same stranded ocean
    // tile — the shape a pre-#751 save with no stacking checks on naval movement could produce.
    const galleyA = { ...Object.values(save.units)[0]!, id: 'stranded-galley-a', type: 'galley' as const, owner: civ.id, position: { ...oceanTile.coord } };
    const galleyB = { ...Object.values(save.units)[0]!, id: 'stranded-galley-b', type: 'galley' as const, owner: otherCivId, position: { ...oceanTile.coord } };
    save.units = { [galleyA.id]: galleyA, [galleyB.id]: galleyB };
    civ.units = [galleyA.id];
    save.civilizations[otherCivId]!.units = [galleyB.id];

    const migrated = migrateSaveToCurrent(save);
    const posA = migrated.units[galleyA.id]!.position;
    const posB = migrated.units[galleyB.id]!.position;
    expect(`${posA.q},${posA.r}`).not.toBe(`${posB.q},${posB.r}`);
  });
});

describe('#544 MR4 — legacy save load with no General heroic-command fields', () => {
  function makeLegacyGeneralSave(): GameState {
    const save = createNewGame('rome', 'mr4-legacy-general-save', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const civ = save.civilizations.player!;
    const general = {
      ...Object.values(save.units)[0]!,
      id: 'legacy-general', type: 'great_general' as const, owner: civ.id,
      generalDefinitionId: 'gen_caesar',
      // Deliberately no generalCommandChargesUsed/generalCommandCooldownUntilTurn/
      // lastStandHold/rallyProtectedThisRound/hasCapturedCityThisTurn -- exactly
      // what an MR3-era save (predating this MR) would have persisted.
    };
    delete (general as any).generalCommandChargesUsed;
    save.units = { [general.id]: general };
    civ.units = [general.id];
    civ.generalHistory = [{ unitId: general.id, generalDefinitionId: 'gen_caesar', spawnedTurn: 1 }];
    return save;
  }

  it('a save with a great_general unit but no generalCommandChargesUsed/cooldown/lastStandHold fields loads without error, defaulting to full charges', () => {
    const migrated = migrateSaveToCurrent(makeLegacyGeneralSave());
    const general = migrated.units['legacy-general']!;
    expect(general.generalCommandChargesUsed).toBeUndefined();
    expect(general.generalCommandCooldownUntilTurn).toBeUndefined();
    expect(general.lastStandHold).toBeUndefined();
  });

  it('getHeroicCommandEligibility on that legacy-loaded General reports full charges and no cooldown', () => {
    const migrated = migrateSaveToCurrent(makeLegacyGeneralSave());
    const general = migrated.units['legacy-general']!;
    const eligibility = getHeroicCommandEligibility(migrated, general);
    expect(eligibility.chargesRemaining).toBe(3);
    expect(eligibility.cooldownTurnsRemaining).toBe(0);
  });

  it('#544 MR5 — an MR4-era save with no AI-queued pendingGeneralCandidateChoices entry loads cleanly, and AI General acquisition works normally from that point on', () => {
    const save = createNewGame('rome', 'mr5-legacy-ai-general-save', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    // Deliberately no pendingGeneralCandidateChoices entry for any AI civ --
    // exactly what an MR4-era save looks like, since AI civs never queued one
    // before MR5.
    delete (save as Partial<GameState>).pendingGeneralCandidateChoices;
    const aiCivId = Object.keys(save.civilizations).find(id => id !== 'player')!;
    save.civilizations[aiCivId] = {
      ...save.civilizations[aiCivId]!,
      generalProgress: { points: 999, generalsEarned: 0 },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.pendingGeneralCandidateChoices ?? []).toEqual([]);
    const afterCheck = checkAndQueueGeneralCandidateChoice(migrated, aiCivId, 'city:captured', 1);
    expect(afterCheck.pendingGeneralCandidateChoices?.some(c => c.civId === aiCivId)).toBe(true);
  });

  it('#545 legacy save with no strategic-deterrence fields at all loads and behaves correctly', () => {
    const save = createNewGame('rome', 'strategic-deterrence-legacy-migration', 'small');
    save.saveSchemaVersion = 1; // predates every #545 MR
    // Simulate a save from before #545 MR1 shipped -- delete every optional
    // field this arc introduced, even though createNewGame already sets
    // some of them (superweapons: 'on') for a brand-new game.
    delete (save.settings as Partial<GameState['settings']>).superweapons;
    const civId = Object.keys(save.civilizations)[0]!;
    delete (save.civilizations[civId] as Partial<GameState['civilizations'][string]>).strategicArsenal;
    delete (save as Partial<GameState>).builtNationalProjects;
    // Treaty.arsenalCap's optionality is already covered directly by MR6's
    // own 'arsenalCap is set only for arms_control_pact...' test
    // (diplomacy-system.test.ts) -- not re-tested here, since a freshly
    // created game has zero treaties to begin with (nothing to delete the
    // field from) and inventing one would test signTreaty, not migration.

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    // Legacy defaults: arsenal reads 0, capacity/platforms/capability all
    // resolve to their "nothing" answer, superweapons resolves 'off'.
    expect(getStrategicArsenal(migrated.civilizations[civId]!)).toBe(0);
    expect(getStrategicArsenalCapacity(migrated, civId)).toBe(0);
    expect(isSuperweaponsEnabled(migrated)).toBe(false);
    expect(getEligibleStrategicLaunchPlatforms(migrated, civId)).toEqual([]);
    expect(hasArmsControlTreaty(migrated, civId)).toBe(false);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });
});

describe('#888 — generated General identity persistence', () => {
  function makeGeneratedIdentity(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: 'Marcus Valerius, the Steadfast',
      civTypeEligibility: ['rome'],
      era: 3,
      descriptor: 'Legatus. A Roman field commander, risen through the ranks of the host.',
      portraitIcon: '🦅',
      origin: 'generated' as const,
      commandRange: 2,
      commandCapacity: 3,
      abilityIds: ['rally', 'seize_the_moment', 'last_stand'],
      maxCommandCharges: 3,
      cooldownTurns: 10,
      ...overrides,
    };
  }

  it('a legacy save with no generatedGenerals field migrates to an empty registry (idempotent)', () => {
    const save = createNewGame('rome', '888-legacy-generated', 'small');
    save.saveSchemaVersion = 1;
    delete (save as Partial<GameState>).generatedGenerals;

    const migrated = migrateSaveToCurrent(save);
    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.generatedGenerals).toEqual({});
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('round-trips a valid generatedGenerals registry byte-for-byte', () => {
    const save = createNewGame('rome', '888-roundtrip-registry', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const id = 'generated:rome:3:deadbeef';
    (save as GameState).generatedGenerals = { [id]: makeGeneratedIdentity(id) as never };

    const migrated = migrateSaveToCurrent(structuredClone(save));
    expect(migrated.generatedGenerals?.[id]).toEqual(makeGeneratedIdentity(id));
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('drops structurally-malformed registry entries and key/id mismatches, keeps valid ones', () => {
    const save = createNewGame('rome', '888-malformed-registry', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const goodId = 'generated:rome:3:0000aaaa';
    (save as GameState).generatedGenerals = {
      [goodId]: makeGeneratedIdentity(goodId) as never,
      'generated:rome:3:bad-era': makeGeneratedIdentity('generated:rome:3:bad-era', { era: 99 }) as never,
      'generated:rome:3:no-name': makeGeneratedIdentity('generated:rome:3:no-name', { name: '' }) as never,
      'generated:rome:3:neg-range': makeGeneratedIdentity('generated:rome:3:neg-range', { commandRange: -2 }) as never,
      'generated:rome:3:nan-cd': makeGeneratedIdentity('generated:rome:3:nan-cd', { cooldownTurns: Number.NaN }) as never,
      'generated:rome:3:bad-abilities': makeGeneratedIdentity('generated:rome:3:bad-abilities', { abilityIds: [1, 2] }) as never,
      'generated:rome:3:empty-abilities': makeGeneratedIdentity('generated:rome:3:empty-abilities', { abilityIds: [] }) as never,
      'key-id-mismatch': makeGeneratedIdentity('generated:rome:3:elsewhere') as never,
      'generated:rome:3:garbage': 'not-an-object' as never,
    };

    const migrated = migrateSaveToCurrent(save);
    expect(Object.keys(migrated.generatedGenerals ?? {})).toEqual([goodId]);
    // a normalized entry still gets its origin pinned
    expect(migrated.generatedGenerals?.[goodId]?.origin).toBe('generated');
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('mid-choice save (mixed authored + generated candidates) reloads with identical ids, names and order', () => {
    const save = createNewGame('rome', '888-midchoice-mixed', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const genA = 'generated:rome:3:aaaa1111';
    const genB = 'generated:rome:3:bbbb2222';
    (save as GameState).generatedGenerals = {
      [genA]: makeGeneratedIdentity(genA, { name: 'Titus Aurelius' }) as never,
      [genB]: makeGeneratedIdentity(genB, { name: 'Gaius Cornelius' }) as never,
    };
    save.pendingGeneralCandidateChoices = [
      { civId: 'player', candidateDefinitionIds: ['gen_caesar', genA, genB], triggerEventLabel: 'round-end' },
    ];

    const migrated = migrateSaveToCurrent(structuredClone(save));
    expect(migrated.pendingGeneralCandidateChoices).toEqual(save.pendingGeneralCandidateChoices);
    expect(migrated.generatedGenerals?.[genA]?.name).toBe('Titus Aurelius');
    expect(migrated.generatedGenerals?.[genB]?.name).toBe('Gaius Cornelius');
  });

  it('an all-generated pending choice round-trips without regeneration', () => {
    const save = createNewGame('rome', '888-midchoice-allgen', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const ids = ['generated:rome:3:11110000', 'generated:rome:3:22220000', 'generated:rome:3:33330000'];
    (save as GameState).generatedGenerals = Object.fromEntries(
      ids.map(id => [id, makeGeneratedIdentity(id, { name: `Officer ${id.slice(-4)}` })]),
    ) as never;
    save.pendingGeneralCandidateChoices = [
      { civId: 'player', candidateDefinitionIds: [...ids], triggerEventLabel: 'round-end' },
    ];

    const migrated = migrateSaveToCurrent(structuredClone(save));
    expect(migrated.pendingGeneralCandidateChoices![0]!.candidateDefinitionIds).toEqual(ids);
    for (const id of ids) {
      expect(migrated.generatedGenerals?.[id]?.name).toBe(`Officer ${id.slice(-4)}`);
    }
  });

  it('a selected generated General (in generalHistory + as a unit) survives reload with a stable identity', () => {
    const save = createNewGame('rome', '888-selected-survives', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const id = 'generated:rome:3:5e1ec7ed';
    (save as GameState).generatedGenerals = { [id]: makeGeneratedIdentity(id, { name: 'Servius Longinus' }) as never };
    const general = { ...Object.values(save.units)[0]!, id: 'g-1', type: 'great_general' as const, owner: 'player', generalDefinitionId: id };
    save.units = { 'g-1': general };
    save.civilizations.player!.units = ['g-1'];
    save.civilizations.player!.generalHistory = [{ unitId: 'g-1', generalDefinitionId: id, spawnedTurn: 4 }];

    const migrated = migrateSaveToCurrent(structuredClone(save));
    expect(migrated.units['g-1']!.generalDefinitionId).toBe(id);
    expect(migrated.generatedGenerals?.[id]?.name).toBe('Servius Longinus');
    // #887 MR1 migration 24 backfills careerEvents: [] on the legacy entry
    // (no history is fabricated -- an empty ledger).
    expect(migrated.civilizations.player!.generalHistory).toEqual([
      { unitId: 'g-1', generalDefinitionId: id, spawnedTurn: 4, careerEvents: [] },
    ]);
  });
});

describe('#887 MR1 — migration 24: General career ledger normalization', () => {
  it('backfills careerEvents: [] on a legacy generalHistory entry without fabricating any history', () => {
    const save = createNewGame('rome', '887-legacy-career-ledger', 'small');
    save.saveSchemaVersion = 22; // one step behind current
    save.civilizations.player!.generalHistory = [
      { unitId: 'g-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 2, outcome: 'died', diedTurn: 9 },
    ];

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.civilizations.player!.generalHistory).toEqual([
      { unitId: 'g-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 2, outcome: 'died', diedTurn: 9, careerEvents: [] },
    ]);
  });

  it('round-trips an already-populated careerEvents array unchanged and is idempotent', () => {
    const save = createNewGame('rome', '887-populated-career-ledger', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    const careerEvents = [
      { type: 'spawned', turn: 1 },
      { type: 'rally-used', turn: 4, unitsAffected: 3, totalHpRestored: 12 },
      { type: 'city-captured', turn: 8, cityId: 'c1', cityName: 'Athens' },
    ];
    save.civilizations.player!.generalHistory = [
      { unitId: 'g-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1, careerEvents: structuredClone(careerEvents) as never },
    ];

    const migrated = migrateSaveToCurrent(structuredClone(save));
    expect(migrated.civilizations.player!.generalHistory![0]!.careerEvents).toEqual(careerEvents);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('drops structurally-malformed career events (not an object, missing/NaN turn, unknown type)', () => {
    const save = createNewGame('rome', '887-malformed-career-ledger', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    save.civilizations.player!.generalHistory = [
      {
        unitId: 'g-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1,
        careerEvents: [
          { type: 'spawned', turn: 1 },
          'not-an-object',
          { type: 'battle-influenced', turn: Number.NaN, combatId: 'a:b:2', reasons: [], location: { q: 0, r: 0 } },
          { type: 'invented-future-event', turn: 3 },
          { type: 'killed' },
          { type: 'killed', turn: 5 },
        ] as never,
      },
    ];

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.civilizations.player!.generalHistory![0]!.careerEvents).toEqual([
      { type: 'spawned', turn: 1 },
      { type: 'killed', turn: 5 },
    ]);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });

  it('normalizes a non-array careerEvents to []', () => {
    const save = createNewGame('rome', '887-nonarray-career-ledger', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    save.civilizations.player!.generalHistory = [
      { unitId: 'g-1', generalDefinitionId: 'gen_caesar', spawnedTurn: 1, careerEvents: { bogus: true } as never },
    ];

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.civilizations.player!.generalHistory![0]!.careerEvents).toEqual([]);
  });

  it('leaves a civ with no generalHistory untouched (no fabricated array)', () => {
    const save = createNewGame('rome', '887-no-history-career-ledger', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    delete (save.civilizations.player as { generalHistory?: unknown }).generalHistory;

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.civilizations.player!.generalHistory).toBeUndefined();
  });

  it('handles a generated-identity General entry identically', () => {
    const save = createNewGame('rome', '887-generated-career-ledger', 'small');
    save.saveSchemaVersion = 22;
    const id = 'generated:rome:3:abcd1234';
    save.civilizations.player!.generalHistory = [
      { unitId: 'g-1', generalDefinitionId: id, spawnedTurn: 3 },
    ];

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.civilizations.player!.generalHistory).toEqual([
      { unitId: 'g-1', generalDefinitionId: id, spawnedTurn: 3, careerEvents: [] },
    ]);
  });
});
