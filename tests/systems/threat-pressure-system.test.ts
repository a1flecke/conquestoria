import { describe, it, expect } from 'vitest';
import { generateBalancedMap } from '@/systems/balanced-map-generator';
import { generateContinentMap } from '@/systems/continent-map-generator';
import { tagLandmassRegions } from '@/systems/landmass-tagger';
import {
  canStartIndependentThreat,
  computeThreatScore,
  deriveActiveIndependentThreatIds,
  empireShare,
  nearestLandmassId,
  recordCombatForCiv,
  processIndependentThreatPressureForHumans,
  processLandResurgence,
  processThreatPressure,
  processPirateSpawn,
  processPirateFleets,
  PIRATE_OWNER,
} from '@/systems/threat-pressure-system';
import type { GameMap, GameState, HexTile, Civilization } from '@/core/types';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import { EventBus } from '@/core/event-bus';

function makeTestState(overrides: Partial<GameState> = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  // 10 land tiles tagged continent-0
  for (let q = 0; q < 10; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: q < 8 ? 'p1' : null, improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, regionKey: 'continent-0',
    };
  }
  // ocean tile adjacent for nearestLandmassId test
  tiles['0,1'] = {
    coord: { q: 0, r: 1 }, terrain: 'ocean', elevation: 'lowland', resource: null,
    improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };

  const p1: Civilization = {
    id: 'p1', name: 'Player 1', color: '#fff', isHuman: true, civType: 'rome',
    cities: ['city-1'], units: [],
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    gold: 0, visibility: { tiles: {} }, score: 0,
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 1, peakMilitary: 0 } },
    lastCombatTurnByLandmass: {},
  };

  return {
    turn: 10, era: 2,
    civilizations: { p1 },
    map: { width: 15, height: 5, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: { 'city-1': { id: 'city-1', owner: 'p1', position: { q: 0, r: 0 } } as any },
    barbarianCamps: {}, minorCivs: {}, currentPlayer: 'p1',
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    gameOver: false, winner: null,
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    ...overrides,
  } as unknown as GameState;
}

describe('landmass tagging', () => {
  it('generateBalancedMap assigns regionKey to all land tiles', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed', 2);
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey, `tile at ${tile.coord.q},${tile.coord.r} missing regionKey`).toBeDefined();
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });

  it('ocean tiles have no regionKey', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed-2', 2);
    const oceanTiles = Object.values(map.tiles).filter(t => t.terrain === 'ocean');
    for (const tile of oceanTiles) {
      expect(tile.regionKey).toBeUndefined();
    }
  });
});

describe('tagLandmassRegions', () => {
  function makeTile(q: number, r: number, terrain: string): HexTile {
    return {
      coord: { q, r }, terrain: terrain as any, elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
  }

  it('assigns continent-0 to the largest connected land component (≥9 tiles)', () => {
    const tiles: Record<string, HexTile> = {};
    // 10-tile connected component (large enough for continent threshold=9)
    [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1]].forEach(([q,r]) => {
      tiles[`${q},${r}`] = makeTile(q, r, 'grassland');
    });
    // 2-tile isolated component (island)
    [[8,8],[8,9]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    const map: GameMap = { width: 15, height: 15, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['0,0'].regionKey).toBe('continent-0');
    expect(tagged['4,1'].regionKey).toBe('continent-0');
  });

  it('labels components under 9 tiles as island-N', () => {
    const tiles: Record<string, HexTile> = {};
    // 10-tile large component
    [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1]].forEach(([q,r]) => {
      tiles[`${q},${r}`] = makeTile(q, r, 'grassland');
    });
    // 2-tile isolated component
    [[8,8],[8,9]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    const map: GameMap = { width: 15, height: 15, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['8,8'].regionKey).toMatch(/^island-\d+$/);
  });

  it('leaves ocean tiles without regionKey', () => {
    const tiles: Record<string, HexTile> = {};
    tiles['0,0'] = makeTile(0, 0, 'grassland');
    tiles['1,0'] = makeTile(1, 0, 'ocean');
    const map: GameMap = { width: 5, height: 5, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['1,0'].regionKey).toBeUndefined();
  });
});

describe('processLandResurgence', () => {
  function makeResurgenceState(): GameState {
    const state = makeTestState({ era: 2, turn: 30 });
    // Player idle for 15 turns (score ≥ 2.5)
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 15 };
    // 8 of 10 tiles owned = 80% dominance
    return state;
  }

  it('spawns a resurgent camp when score ≥ 2.5 and cooldown passed', () => {
    const state = makeResurgenceState();
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const resurgentCamps = Object.values(updated.barbarianCamps).filter(c => c.resurgent);
    expect(resurgentCamps.length).toBeGreaterThan(0);
  });

  it('does not spawn when score < 2.5', () => {
    const state = makeTestState({ era: 1, turn: 5 });
    // Low score: era 1, idle 0 turns, low ownership
    Object.values(state.map.tiles).forEach(t => { if (t.owner === 'p1') t.owner = null; });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 5 };
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const resurgentCamps = Object.values(updated.barbarianCamps).filter(c => c.resurgent);
    expect(resurgentCamps.length).toBe(0);
  });

  it('does not spawn when cooldown is active', () => {
    const state = makeResurgenceState();
    state.resurgentCampCooldownByCivLandmass = { 'p1:continent-0': 35 }; // cooldown until turn 35
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const resurgentCamps = Object.values(updated.barbarianCamps).filter(c => c.resurgent);
    expect(resurgentCamps.length).toBe(0);
  });

  it('camp strength scales with era', () => {
    const state = makeResurgenceState();
    const bus = { emit: () => {} } as any;
    const updated = processLandResurgence(state, 'p1', 'continent-0', bus);
    const camp = Object.values(updated.barbarianCamps).find(c => c.resurgent);
    expect(camp?.strength).toBeGreaterThanOrEqual(6); // era-2 minimum
    expect(camp?.strength).toBeLessThanOrEqual(10);   // era-2 maximum
  });

  it('does not consume IDs, cooldown, or events when a governed resurgence is denied', () => {
    const state = makeResurgenceState();
    const beforeCounters = structuredClone(state.idCounters);
    const events: string[] = [];
    const bus = { emit: (event: string) => events.push(event) } as any;

    const updated = processLandResurgence(state, 'p1', 'continent-0', bus, {
      spawnPolicy: {
        canStart: (_candidateState, candidate) => {
          expect(candidate.threatId).toBe(`barbarian:camp-${state.idCounters.nextCampId}`);
          expect(candidate.affectedHumanIds).toContain('p1');
          return false;
        },
      },
    });

    expect(updated).toBe(state);
    expect(state.idCounters).toEqual(beforeCounters);
    expect(state.resurgentCampCooldownByCivLandmass).toBeUndefined();
    expect(events).toEqual([]);
  });
});

describe('processThreatPressure — hot-seat isolation', () => {
  it('only evaluates human players — AI civ never gets resurgence', () => {
    const state = makeTestState({ era: 3, turn: 30 });
    state.civilizations['p1'].isHuman = false;
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 10 };
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    processThreatPressure(state, 'p1', bus);
    expect(events.filter(e => e.e === 'threat:barbarian-resurgence').length).toBe(0);
  });

  it('multi-landmass: evaluates each landmass independently', () => {
    const state = makeTestState({ era: 2, turn: 30 });
    // Add continent-1 tiles
    for (let q = 20; q < 30; q++) {
      state.map.tiles[`${q},0`] = {
        coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner: 'p1', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        regionKey: 'continent-1',
      };
    }
    // Add city on continent-1
    state.cities['city-2'] = { id: 'city-2', owner: 'p1', position: { q: 20, r: 0 } } as any;
    state.civilizations['p1'].cities.push('city-2');
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 15, 'continent-1': 15 };

    const score0 = computeThreatScore(state, 'p1', 'continent-0');
    const score1 = computeThreatScore(state, 'p1', 'continent-1');
    expect(score0).toBeGreaterThan(2.5);
    expect(score1).toBeGreaterThan(2.5);
  });
});

describe('independent threat pressure governor', () => {
  function makeHuman(id: string, cityId: string, position: { q: number; r: number }): Civilization {
    return {
      ...structuredClone(makeTestState().civilizations.p1),
      id,
      name: id,
      cities: [cityId],
      units: [],
      isHuman: true,
      isEliminated: false,
      visibility: { tiles: {} },
    };
  }

  function makePressureState(challenge: 'explorer' | 'standard' | 'veteran' = 'standard'): GameState {
    const state = makeTestState({
      opponentChallenge: challenge,
      opponentAI: createEmptyOpponentAIState(),
    });
    state.civilizations = {
      'player-3': makeHuman('player-3', 'city-3', { q: 8, r: 0 }),
      'player-1': makeHuman('player-1', 'city-1', { q: 0, r: 0 }),
      'player-2': makeHuman('player-2', 'city-2', { q: 4, r: 0 }),
    };
    state.cities = {
      'city-1': { id: 'city-1', owner: 'player-1', position: { q: 0, r: 0 } } as any,
      'city-2': { id: 'city-2', owner: 'player-2', position: { q: 4, r: 0 } } as any,
      'city-3': { id: 'city-3', owner: 'player-3', position: { q: 8, r: 0 } } as any,
    };
    state.currentPlayer = 'player-3';
    return state;
  }

  function addPirateThreat(state: GameState, factionId: string, targetCivId: string): void {
    state.pirates = {
      version: 1,
      factions: {
        ...(state.pirates?.factions ?? {}),
        [factionId]: {
          id: factionId,
          name: factionId,
          spawnedRound: state.turn,
          behavior: 'raiding',
          maritimeStage: 1,
          notoriety: 0,
          shipIds: [],
          headquarters: {
            kind: 'coastal-enclave',
            position: { q: 2, r: 0 },
            integrity: 100,
            maxIntegrity: 100,
          },
          tributeByCiv: {},
          demandByCiv: {},
          contract: null,
          intent: { kind: 'raid', targetCivId, plannedRound: state.turn },
          transitionGuards: { emittedEventKeys: [] },
        },
      },
      history: [],
      pressure: { value: 0, suppression: [] },
      intelByCiv: {},
      nextSpawnCheckTurn: 0,
      activatedTurn: 0,
      activationWarningDeliveredByCiv: {},
    } as GameState['pirates'];
  }

  it('reconciles every living human once in stable civilization ID order regardless of current player', () => {
    const state = makePressureState();
    state.civilizations['player-2'].isEliminated = true;

    const result = processIndependentThreatPressureForHumans(state, new EventBus());

    expect(Object.keys(result.opponentAI!.pressureByCiv))
      .toEqual(['player-1', 'player-3']);
    expect(state.opponentAI!.pressureByCiv).toEqual({});
  });

  it.each([
    ['explorer', 1],
    ['standard', 2],
    ['veteran', 3],
  ] as const)('%s caps new independent threats at %i per human', (challenge, cap) => {
    const state = makePressureState(challenge);
    state.opponentAI!.pressureByCiv['player-1'] = {
      activeIndependentThreatIds: Array.from({ length: cap }, (_, index) => `barbarian:camp-${index}`),
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: {},
      lastStrategicAudioTurn: null,
    };
    for (let index = 0; index < cap; index++) {
      state.barbarianCamps[`camp-${index}`] = {
        id: `camp-${index}`,
        position: { q: index + 1, r: 0 },
        strength: 5,
        spawnCooldown: 2,
      };
    }

    expect(canStartIndependentThreat(state, 'player-1', 'barbarian:camp-new'))
      .toMatchObject({ allowed: false, reason: 'pressure-cap', activeCount: cap, cap });
  });

  it('keeps shared threat identity per human without sharing their pressure budgets', () => {
    const state = makePressureState('explorer');
    addPirateThreat(state, 'pirate-7', 'player-1');
    state.pirates!.factions['pirate-7'].contract = {
      employerId: 'player-3',
      targetId: 'player-2',
      startedRound: 1,
      expiresAfterRound: 20,
      successfulRaidCount: 0,
      exposed: false,
      exposureResolvedRaidKeys: [],
    };

    const result = processIndependentThreatPressureForHumans(state, new EventBus());

    expect(result.opponentAI!.pressureByCiv['player-1'].activeIndependentThreatIds)
      .toEqual(['pirate:pirate-7']);
    expect(result.opponentAI!.pressureByCiv['player-2'].activeIndependentThreatIds)
      .toEqual(['pirate:pirate-7']);
    expect(canStartIndependentThreat(result, 'player-3', 'barbarian:new'))
      .toMatchObject({ allowed: true, activeCount: 0 });
  });

  it('starts a shared resurgence only when every newly affected human has cap room', () => {
    const makeEligible = () => {
      const state = makePressureState('explorer');
      state.turn = 30;
      state.era = 3;
      state.civilizations['player-3'].isEliminated = true;
      state.cities['city-2'].position = { q: 8, r: 0 };
      state.civilizations['player-1'].lastCombatTurnByLandmass = { 'continent-0': 0 };
      state.civilizations['player-2'].lastCombatTurnByLandmass = { 'continent-0': 0 };
      state.map.tiles = Object.fromEntries(Array.from({ length: 9 }, (_, q) => [
        `${q},0`,
        {
          ...state.map.tiles['0,0'],
          coord: { q, r: 0 },
          owner: q < 4 ? 'player-1' : q > 4 ? 'player-2' : null,
          regionKey: 'continent-0',
        },
      ]));
      return state;
    };

    const allowed = processIndependentThreatPressureForHumans(makeEligible(), new EventBus());
    const [sharedId] = allowed.opponentAI!.pressureByCiv['player-1']
      .activeIndependentThreatIds;
    expect(sharedId).toMatch(/^barbarian:camp-/);
    expect(allowed.opponentAI!.pressureByCiv['player-2'].activeIndependentThreatIds)
      .toContain(sharedId);

    const blocked = makeEligible();
    addPirateThreat(blocked, 'pirate-1', 'player-2');
    blocked.opponentAI!.pressureByCiv['player-2'] = {
      activeIndependentThreatIds: ['pirate:pirate-1'],
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: {},
      lastStrategicAudioTurn: null,
    };
    const blockedEvents: unknown[] = [];
    const bus = new EventBus();
    bus.on('threat:barbarian-resurgence', event => blockedEvents.push(event));

    const result = processIndependentThreatPressureForHumans(blocked, bus);

    expect(result.barbarianCamps).toEqual({});
    expect(result.idCounters.nextCampId).toBe(blocked.idCounters.nextCampId);
    expect(result.resurgentCampCooldownByCivLandmass).toBeUndefined();
    expect(blockedEvents).toEqual([]);
  });

  it('blocks migration and recovery only for new starts while leaving an existing over-cap threat alive', () => {
    const state = makePressureState('explorer');
    addPirateThreat(state, 'pirate-1', 'player-1');
    addPirateThreat(state, 'pirate-2', 'player-1');
    state.opponentAI!.migrationGraceRoundsRemaining = 1;
    state.opponentAI!.pressureByCiv['player-1'] = {
      activeIndependentThreatIds: ['pirate:pirate-1', 'pirate:pirate-2'],
      recoveryUntilTurn: state.turn + 3,
      lastResolvedThreatTurn: state.turn - 1,
      lastWarningTurnByKey: { existing: 4 },
      lastStrategicAudioTurn: 5,
    };

    expect(canStartIndependentThreat(state, 'player-1', 'pirate:pirate-1'))
      .toMatchObject({ allowed: true, reason: 'allowed', activeCount: 2, cap: 1 });
    expect(canStartIndependentThreat(state, 'player-1', 'barbarian:new'))
      .toMatchObject({ allowed: false, reason: 'migration-grace' });

    state.opponentAI!.migrationGraceRoundsRemaining = 0;
    expect(canStartIndependentThreat(state, 'player-1', 'barbarian:new'))
      .toMatchObject({ allowed: false, reason: 'recovery' });

    const result = processIndependentThreatPressureForHumans(state, new EventBus());
    expect(result.pirates!.factions['pirate-1']).toEqual(state.pirates!.factions['pirate-1']);
    expect(result.opponentAI!.pressureByCiv['player-1'].activeIndependentThreatIds)
      .toEqual(['pirate:pirate-1', 'pirate:pirate-2']);
  });

  it.each([
    ['explorer', 3],
    ['standard', 2],
    ['veteran', 1],
  ] as const)('%s begins %i rounds of recovery only after explicit destruction', (challenge, rounds) => {
    const state = makePressureState(challenge);
    addPirateThreat(state, 'pirate-1', 'player-1');
    state.opponentAI!.pressureByCiv['player-1'] = {
      activeIndependentThreatIds: ['pirate:pirate-1'],
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: { retained: 2 },
      lastStrategicAudioTurn: 3,
    };
    state.pirates!.factions['pirate-1'].intent = null;

    const retargeted = processIndependentThreatPressureForHumans(state, new EventBus());
    expect(retargeted.opponentAI!.pressureByCiv['player-1'].activeIndependentThreatIds)
      .toEqual(['pirate:pirate-1']);
    expect(retargeted.opponentAI!.pressureByCiv['player-1'].recoveryUntilTurn).toBe(0);

    delete state.pirates!.factions['pirate-1'];
    const resolved = processIndependentThreatPressureForHumans(state, new EventBus());
    expect(resolved.opponentAI!.pressureByCiv['player-1']).toEqual({
      activeIndependentThreatIds: [],
      recoveryUntilTurn: state.turn + rounds,
      lastResolvedThreatTurn: state.turn,
      lastWarningTurnByKey: { retained: 2 },
      lastStrategicAudioTurn: 3,
    });

    const repeated = processIndependentThreatPressureForHumans(resolved, new EventBus());
    expect(repeated.opponentAI!.pressureByCiv['player-1']).toEqual(
      resolved.opponentAI!.pressureByCiv['player-1'],
    );
  });

  it('starts recovery for destroyed camps and explicitly slain beasts', () => {
    const state = makePressureState('standard');
    state.barbarianCamps['camp-1'] = {
      id: 'camp-1',
      position: { q: 2, r: 0 },
      strength: 5,
      spawnCooldown: 2,
    };
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-giant_boar': {
          id: 'lair-giant_boar',
          beastId: 'giant_boar',
          position: { q: 2, r: 0 },
          status: 'awake',
          strength: 1,
          unitIds: [],
        },
      },
      sightingsByCiv: {},
    };
    state.opponentAI!.pressureByCiv['player-1'] = {
      activeIndependentThreatIds: ['barbarian:camp-1', 'beast:lair-giant_boar'],
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: {},
      lastStrategicAudioTurn: null,
    };
    const stillActive = processIndependentThreatPressureForHumans(state, new EventBus());
    expect(stillActive.opponentAI!.pressureByCiv['player-1'].activeIndependentThreatIds)
      .toEqual(['barbarian:camp-1', 'beast:lair-giant_boar']);

    delete state.barbarianCamps['camp-1'];
    state.beasts.lairs['lair-giant_boar'].status = 'slain';
    const resolved = processIndependentThreatPressureForHumans(state, new EventBus());

    expect(resolved.opponentAI!.pressureByCiv['player-1']).toMatchObject({
      activeIndependentThreatIds: [],
      lastResolvedThreatTurn: state.turn,
      recoveryUntilTurn: state.turn + 2,
    });
  });

  it('reconciles a resolution before considering a same-round replacement spawn', () => {
    const state = makePressureState('standard');
    state.turn = 30;
    state.era = 3;
    state.civilizations['player-2'].isEliminated = true;
    state.civilizations['player-3'].isEliminated = true;
    state.civilizations['player-1'].lastCombatTurnByLandmass = { 'continent-0': 0 };
    state.cities = {
      'city-1': { ...state.cities['city-1'], position: { q: 0, r: 0 } },
    };
    state.civilizations['player-1'].cities = ['city-1'];
    state.map.tiles = Object.fromEntries(Array.from({ length: 20 }, (_, q) => [
      `${q},0`,
      {
        ...state.map.tiles['0,0'],
        coord: { q, r: 0 },
        owner: q < 10 ? 'player-1' : null,
        regionKey: 'continent-0',
      },
    ]));
    state.opponentAI!.pressureByCiv['player-1'] = {
      activeIndependentThreatIds: ['barbarian:destroyed'],
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: {},
      lastStrategicAudioTurn: null,
    };

    const result = processIndependentThreatPressureForHumans(state, new EventBus());

    expect(result.barbarianCamps).toEqual({});
    expect(result.opponentAI!.pressureByCiv['player-1']).toMatchObject({
      activeIndependentThreatIds: [],
      recoveryUntilTurn: state.turn + 2,
      lastResolvedThreatTurn: state.turn,
    });
  });

  it('counts only barbarians, modern pirates, and materially threatening awake beasts', () => {
    const state = makePressureState();
    state.civilizations.ai = {
      ...makeHuman('ai', 'ai-city', { q: 9, r: 0 }),
      isHuman: false,
    };
    state.cities['ai-city'] = { id: 'ai-city', owner: 'ai', position: { q: 9, r: 0 } } as any;
    state.civilizations['player-1'].diplomacy.atWarWith = ['ai', 'player-2'];
    state.minorCivs.minor = { id: 'minor', isDestroyed: false } as any;
    state.units.rebel = { id: 'rebel', owner: 'rebels', position: { q: 0, r: 1 } } as any;
    state.beasts = {
      mode: 'wild',
      lairs: {
        'lair-giant_boar': {
          id: 'lair-giant_boar',
          beastId: 'giant_boar',
          position: { q: 2, r: 0 },
          status: 'awake',
          strength: 1,
          unitIds: [],
        },
      },
      sightingsByCiv: {},
    };

    expect(deriveActiveIndependentThreatIds(state, 'player-1'))
      .toEqual(['beast:lair-giant_boar']);
  });
});

describe('processPirateSpawn', () => {
  function makeCoastalState(): GameState {
    const state = makeTestState({ era: 2, turn: 40 });
    // High idle — score ≥ 4.0 needed for pirate spawn
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 0 }; // 40 turns idle
    // City at 0,0 (coast). Landmass tiles at 0,0 through 9,0 (from makeTestState).
    // Ocean tiles at 10..15,0 — adjacent to 9,0 (continent-0), 10+ tiles from city.
    state.map.tiles['0,0'] = { ...state.map.tiles['0,0'], terrain: 'coast', owner: 'p1' };
    for (let q = 10; q <= 15; q++) {
      state.map.tiles[`${q},0`] = {
        coord: { q, r: 0 }, terrain: 'ocean', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
    state.cities['city-1'] = { ...state.cities['city-1'], position: { q: 0, r: 0 } } as any;
    return state;
  }

  it('spawns a pirate fleet when score ≥ 4.0 and no cooldown', () => {
    const state = makeCoastalState();
    const events: any[] = [];
    const bus = { emit: (e: string, p: any) => events.push({ e, ...p }) } as any;
    const updated = processPirateSpawn(state, 'p1', 'continent-0', bus);
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(1);
    expect(events.some(e => e.e === 'threat:pirate-fleet-spawned')).toBe(true);
  });

  it('does not spawn when max 2 fleets already active for this civ+landmass', () => {
    const state = makeCoastalState();
    state.pirateFleets = {
      'fleet-1': { id: 'fleet-1', unitId: 'u1', targetCivId: 'p1', targetCityId: 'city-1', landmassId: 'continent-0', era: 2, plunderCooldown: 0 },
      'fleet-2': { id: 'fleet-2', unitId: 'u2', targetCivId: 'p1', targetCityId: 'city-1', landmassId: 'continent-0', era: 2, plunderCooldown: 0 },
    };
    const bus = { emit: () => {} } as any;
    const updated = processPirateSpawn(state, 'p1', 'continent-0', bus);
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(2);
  });

  it('does not spawn when score < 4.0', () => {
    const state = makeCoastalState();
    // Low idle so score is low
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 39 }; // 1 turn idle
    const bus = { emit: () => {} } as any;
    const updated = processPirateSpawn(state, 'p1', 'continent-0', bus);
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(0);
  });
});

describe('processPirateFleets', () => {
  function makeFleetState(): GameState {
    const state = makeTestState({ era: 2, turn: 50 });
    // Add ocean path between spawn and target city
    for (let r = 1; r <= 7; r++) {
      state.map.tiles[`5,${r}`] = {
        coord: { q: 5, r }, terrain: 'ocean', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
    state.map.tiles['5,0'] = { ...state.map.tiles['5,0'], terrain: 'coast' };
    state.cities['city-1'] = { ...state.cities['city-1'], position: { q: 5, r: 0 } } as any;

    const unit = {
      id: 'u-pirate', type: 'galley' as const, owner: PIRATE_OWNER,
      position: { q: 5, r: 7 }, health: 100, movementPointsLeft: 2,
      hasMoved: false, experience: 0, isFortified: false,
    } as any;
    state.units['u-pirate'] = unit;
    state.pirateFleets = {
      'fleet-1': {
        id: 'fleet-1', unitId: 'u-pirate', targetCivId: 'p1',
        targetCityId: 'city-1', landmassId: 'continent-0', era: 2, plunderCooldown: 0,
      },
    };
    return state;
  }

  it('moves pirate fleet toward target city', () => {
    const state = makeFleetState();
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    const unit = updated.units['u-pirate'];
    // Should have moved closer to city at 5,0
    expect(unit.position.r).toBeLessThan(7);
  });

  it('removes fleet from state when its unit is destroyed', () => {
    const state = makeFleetState();
    delete state.units['u-pirate']; // unit died in combat
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(0);
  });

  it('plunder steals gold from target civ when adjacent', () => {
    const state = makeFleetState();
    state.civilizations['p1'].gold = 80;
    // Place unit adjacent to city (distance ≤ 2)
    state.units['u-pirate'] = { ...state.units['u-pirate'], position: { q: 5, r: 2 } } as any;
    state.pirateFleets = { ...state.pirateFleets, 'fleet-1': { ...state.pirateFleets!['fleet-1'], plunderCooldown: 0 } };
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    // era-2 plunder: Math.floor((1 + (2-1)*0.5) * 5) = Math.floor(1.5*5) = 7
    expect(updated.civilizations['p1'].gold).toBeLessThan(80);
  });

  it('siege deals HP damage to city when adjacent (era ≥ 2)', () => {
    const state = makeFleetState();
    // Place unit adjacent to city
    state.units['u-pirate'] = { ...state.units['u-pirate'], position: { q: 5, r: 2 } } as any;
    state.pirateFleets = { ...state.pirateFleets, 'fleet-1': { ...state.pirateFleets!['fleet-1'], plunderCooldown: 1 } }; // suppress plunder
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    const cityHp = updated.cities['city-1'].hp ?? 100;
    expect(cityHp).toBeLessThan(100);
    expect(cityHp).toBe(90); // era-2 siege: 10 HP lost
  });

  it('siege event fires exactly once per turn regardless of repeated calls', () => {
    const state = makeFleetState();
    state.units['u-pirate'] = { ...state.units['u-pirate'], position: { q: 5, r: 2 } } as any;
    state.pirateFleets = { ...state.pirateFleets, 'fleet-1': { ...state.pirateFleets!['fleet-1'], plunderCooldown: 1 } };
    const events: string[] = [];
    const bus = { emit: (e: string) => events.push(e) } as any;
    processPirateFleets(state, bus);
    expect(events.filter(e => e === 'threat:pirate-siege').length).toBe(1);
  });

  it('retargets to the wrap-nearer city rather than the raw-nearer one across the seam (issue #520)', () => {
    const state = makeTestState({ turn: 10, era: 2 });
    state.map.wrapsHorizontally = true;
    const width = state.map.width;
    state.cities = {
      'city-raw-near': { id: 'city-raw-near', owner: 'p1', position: { q: 5, r: 0 } } as any,
      'city-wrap-near': { id: 'city-wrap-near', owner: 'p1', position: { q: width - 1, r: 0 } } as any,
    };
    state.civilizations.p1.cities = ['city-raw-near', 'city-wrap-near'];
    state.units['u-pirate'] = {
      id: 'u-pirate', type: 'galley', owner: PIRATE_OWNER,
      position: { q: 0, r: 0 }, health: 100, movementPointsLeft: 2,
      hasMoved: false, experience: 0, isFortified: false,
    } as any;
    state.pirateFleets = {
      'fleet-1': {
        id: 'fleet-1', unitId: 'u-pirate', targetCivId: 'p1',
        targetCityId: 'stale-city', landmassId: 'continent-0', era: 2, plunderCooldown: 0,
      },
    };
    const bus = { emit: () => {} } as any;

    const updated = processPirateFleets(state, bus);

    expect(updated.pirateFleets!['fleet-1'].targetCityId).toBe('city-wrap-near');
  });
});

describe('pirate hot-seat behavior', () => {
  it('fleet destruction sets cooldown for civ+landmass pair', () => {
    const state = makeTestState({ era: 2, turn: 50 });
    state.pirateFleets = {
      'fleet-1': { id: 'fleet-1', unitId: 'u-gone', targetCivId: 'p1', targetCityId: 'city-1',
        landmassId: 'continent-0', era: 2, plunderCooldown: 0 },
    };
    // Unit not present (already destroyed)
    const bus = { emit: () => {} } as any;
    const updated = processPirateFleets(state, bus);
    expect(updated.pirateFleetCooldownByCivLandmass?.['p1:continent-0']).toBe(60); // turn 50 + 10
    expect(Object.keys(updated.pirateFleets ?? {}).length).toBe(0);
  });
});

describe('continent-map-generator landmass tagging', () => {
  it('assigns regionKey to all non-ocean tiles', () => {
    const { map } = generateContinentMap(40, 40, 'continent-test');
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });
});

describe('empireShare', () => {
  it('returns ~0.8 when 8 of 10 viable tiles are owned by player', () => {
    const state = makeTestState();
    const share = empireShare(state, 'p1', 'continent-0');
    expect(share).toBeCloseTo(0.8, 1);
  });

  it('returns 0 when player owns no tiles', () => {
    const state = makeTestState();
    Object.values(state.map.tiles).forEach(t => { if (t.owner === 'p1') t.owner = null; });
    expect(empireShare(state, 'p1', 'continent-0')).toBe(0);
  });
});

describe('computeThreatScore', () => {
  it('returns ~1 for era-1 player with no empire share and 0 idle turns', () => {
    const state = makeTestState({ era: 1, turn: 5 });
    // Remove all ownership so empireShare = 0
    Object.values(state.map.tiles).forEach(t => { if (t.owner === 'p1') t.owner = null; });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 5 }; // no idle
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeCloseTo(1.0, 1); // era 1 × (1 + 0 + 0) = 1.0
  });

  it('returns > 5 for era-2 dominant player with 10 idle turns', () => {
    const state = makeTestState({ era: 2, turn: 20 });
    state.civilizations['p1'].lastCombatTurnByLandmass = { 'continent-0': 10 };
    const score = computeThreatScore(state, 'p1', 'continent-0');
    expect(score).toBeGreaterThan(5);
  });

  it('returns 0 for AI civ', () => {
    const state = makeTestState();
    state.civilizations['p1'].isHuman = false;
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBe(0);
  });

  it('returns 0 when civ has no city on landmass', () => {
    const state = makeTestState();
    state.civilizations['p1'].cities = [];
    expect(computeThreatScore(state, 'p1', 'continent-0')).toBe(0);
  });
});

describe('nearestLandmassId', () => {
  it('finds continent-0 from adjacent ocean tile', () => {
    const state = makeTestState();
    // tile '0,1' is ocean adjacent to '0,0' which has regionKey continent-0
    const id = nearestLandmassId({ q: 0, r: 1 }, state.map);
    expect(id).toBe('continent-0');
  });

  it('returns null when no land within 10 tiles', () => {
    const state = makeTestState();
    // Replace all land tiles with ocean
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key] = { ...state.map.tiles[key], terrain: 'ocean', regionKey: undefined };
    }
    const id = nearestLandmassId({ q: 0, r: 0 }, state.map);
    expect(id).toBeNull();
  });
});

describe('recordCombatForCiv', () => {
  it('updates lastCombatTurnByLandmass for the combat landmass', () => {
    const state = makeTestState({ turn: 15 });
    state.civilizations['p1'].lastCombatTurnByLandmass = {};
    // tile '0,0' has regionKey 'continent-0'
    const updated = recordCombatForCiv(state, 'p1', { q: 0, r: 0 });
    expect(updated.civilizations['p1'].lastCombatTurnByLandmass?.['continent-0']).toBe(15);
  });

  it('uses nearestLandmassId when the combat tile has no regionKey', () => {
    const state = makeTestState({ turn: 20 });
    state.civilizations['p1'].lastCombatTurnByLandmass = {};
    // tile '0,1' is ocean with no regionKey, but adjacent to continent-0
    const updated = recordCombatForCiv(state, 'p1', { q: 0, r: 1 });
    expect(updated.civilizations['p1'].lastCombatTurnByLandmass?.['continent-0']).toBe(20);
  });
});
