import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import type { City, CombatResult, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { processPiratesForCompletedRound, PIRATE_ROUND_TRACE } from '@/systems/pirate-system';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import { PIRATE_NOTORIETY, PIRATE_SIEGE_BLOCKADE_TURNS } from '@/systems/pirate-definitions';

function fixture(): GameState {
  const state = createNewGame(undefined, 'pirate-round', 'small');
  state.turn = 12;
  const tiles: GameState['map']['tiles'] = {};
  for (let q = 0; q < 12; q++) {
    for (let r = 0; r < 12; r++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'ocean', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  tiles['5,5'] = { ...tiles['5,5'], terrain: 'plains' };
  state.map = { width: 12, height: 12, wrapsHorizontally: false, rivers: [], tiles };
  state.units = {};
  state.cities = {};
  state.pirates = { ...createEmptyPirateState(), activatedTurn: 1, nextSpawnCheckTurn: 16 };
  for (const civ of Object.values(state.civilizations)) {
    civ.units = [];
    civ.cities = [];
    civ.gold = 100;
  }
  return state;
}

function addUnit(state: GameState, id: string, type: UnitType, owner: string, position: HexCoord): Unit {
  const unit: Unit = {
    id, type, owner, position, movementPointsLeft: 4, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  };
  state.units[id] = unit;
  return unit;
}

function addCity(state: GameState): City {
  const city: City = {
    id: 'port', name: 'Port', owner: 'player', position: { q: 5, r: 5 }, population: 3,
    food: 0, foodNeeded: 15, buildings: ['marketplace'], productionQueue: [], productionProgress: 0,
    ownedTiles: [{ q: 5, r: 5 }], workedTiles: [], focus: 'balanced', maturity: 'town',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
  state.cities[city.id] = city;
  state.civilizations.player.cities = [city.id];
  return city;
}

function faction(headquarters: PirateFactionState['headquarters'], shipIds: string[]): PirateFactionState {
  return {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading',
    maritimeStage: 3, notoriety: 5, shipIds, headquarters, tributeByCiv: {}, demandByCiv: {},
    contract: null, intent: null, transitionGuards: { emittedEventKeys: [] },
  };
}

describe('completed-round pirate coordinator', () => {
  it('threads pressure gating through ecology without faction, unit, intel, notification, or audio side effects', () => {
    const state = fixture();
    state.opponentChallenge = 'explorer';
    state.opponentAI = createEmptyOpponentAIState();
    state.barbarianCamps['existing-pressure'] = {
      id: 'existing-pressure',
      position: { q: 1, r: 1 },
      strength: 5,
      spawnCooldown: 2,
    };
    state.opponentAI.pressureByCiv.player = {
      activeIndependentThreatIds: ['barbarian:existing-pressure'],
      recoveryUntilTurn: 0,
      lastResolvedThreatTurn: null,
      lastWarningTurnByKey: {},
      lastStrategicAudioTurn: null,
    };
    state.civilizations.player.techState.completed = ['galleys'];
    state.pirates = {
      ...createEmptyPirateState(),
      activatedTurn: 1,
      nextSpawnCheckTurn: state.turn,
      pressure: { value: 17, suppression: [] },
    };
    const playerCity = {
      ...Object.values(createNewGame(undefined, 'pirate-city-template', 'small').cities)[0],
      id: 'distant-port',
      owner: 'player',
      position: { q: 0, r: 0 },
    };
    state.cities[playerCity.id] = playerCity;
    state.civilizations.player.cities = [playerCity.id];
    const bus = new EventBus();
    const sideEffects: unknown[] = [];
    bus.on('unit:created', event => sideEffects.push(event));
    bus.on('pirate:faction-spawned', event => sideEffects.push(event));
    bus.on('pirate:audio-cue', event => sideEffects.push(event));

    const result = processPiratesForCompletedRound(state, bus);

    expect(result.state.pirates!.factions).toEqual({});
    expect(result.state.pirates!.pressure.value).toBe(18);
    expect(Object.values(result.state.pirates!.intelByCiv).every(
      viewerIntel => Object.keys(viewerIntel).length === 0,
    )).toBe(true);
    expect(result.state.pendingEvents?.player ?? []).toEqual([]);
    expect(sideEffects).toEqual([]);
  });

  it('moves a purposeful fleet along canonical multi-step cohesive paths and retains intent', () => {
    const state = fixture();
    addCity(state);
    addUnit(state, 'leader', 'pirate_frigate', 'pirate-1', { q: 5, r: 1 });
    addUnit(state, 'escort', 'pirate_corsair', 'pirate-1', { q: 4, r: 1 });
    state.pirates!.factions['pirate-1'] = faction({
      kind: 'coastal-enclave',
      position: { q: 1, r: 1 },
      integrity: 100,
      maxIntegrity: 100,
    }, ['leader', 'escort']);
    const before = structuredClone(state);
    const bus = new EventBus();
    const moveEvents: Array<{ unitId: string }> = [];
    bus.on('unit:move', event => moveEvents.push(event));

    const result = processPiratesForCompletedRound(
      state,
      bus,
    );

    expect(state).toEqual(before);
    expect(result.state.pirates!.factions['pirate-1'].intent).toMatchObject({
      targetCityId: 'port',
      mode: 'engage',
      leaderUnitId: 'leader',
    });
    expect(result.facts.movements.some(movement => movement.path.length > 1)).toBe(true);
    expect(result.state.units.leader.movementPointsLeft).toBeLessThan(4);
    expect(Math.max(
      Math.abs(result.state.units.leader.position.q - result.state.units.escort.position.q),
      Math.abs(result.state.units.leader.position.r - result.state.units.escort.position.r),
    )).toBeLessThanOrEqual(2);
    expect(moveEvents).toHaveLength(result.facts.movements.length);
  });

  it('repairs a missing purposeful flagship to the strongest stable surviving hull', () => {
    const state = fixture();
    addUnit(state, 'strong-b', 'pirate_frigate', 'pirate-1', { q: 5, r: 3 });
    addUnit(state, 'strong-a', 'pirate_frigate', 'pirate-1', { q: 5, r: 4 });
    state.pirates!.factions['pirate-1'] = faction({
      kind: 'deep-sea-flotilla',
      flagshipUnitId: 'missing',
      relocation: { planned: null, lastRelocatedRound: null },
    }, ['missing', 'strong-b', 'strong-a']);

    const result = processPiratesForCompletedRound(
      state,
      new EventBus(),
    );

    expect(result.state.pirates!.factions['pirate-1']).toBeDefined();
    expect(result.state.pirates!.factions['pirate-1'].headquarters).toMatchObject({
      kind: 'deep-sea-flotilla',
      flagshipUnitId: 'strong-a',
    });
  });

  it('withdraws a damaged purposeful fleet instead of attacking', () => {
    const state = fixture();
    addUnit(state, 'raider', 'pirate_frigate', 'pirate-1', { q: 5, r: 3 }).health = 10;
    addUnit(state, 'target', 'galley', 'player', { q: 5, r: 2 });
    state.civilizations.player.units = ['target'];
    state.pirates!.factions['pirate-1'] = faction({
      kind: 'coastal-enclave',
      position: { q: 1, r: 1 },
      integrity: 100,
      maxIntegrity: 100,
    }, ['raider']);

    const result = processPiratesForCompletedRound(
      state,
      new EventBus(),
    );

    expect(result.state.pirates!.factions['pirate-1'].intent?.mode).toBe('withdraw');
    expect(result.facts.attacks).toEqual([]);
    expect(result.state.units.target.health).toBe(100);
  });

  it('advances factions with deterministic mixed-fleet reinforcements without upgrading old ships', () => {
    const state = fixture();
    state.pirates!.nextSpawnCheckTurn = 99;
    state.civilizations.player.techState.completed = ['galleys', 'navigation', 'triremes'];
    const oldShip = addUnit(state, 'old-galley', 'pirate_galley', 'pirate-1', { q: 6, r: 6 });
    const current = faction({
      kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100,
    }, [oldShip.id]);
    current.behavior = 'raiding';
    current.notoriety = 2;
    current.maritimeStage = 1;
    state.pirates!.factions[current.id] = current;
    const bus = new EventBus();
    const createdIds: string[] = [];
    bus.on('unit:created', ({ unit }) => createdIds.push(unit.id));

    const result = processPiratesForCompletedRound(state, bus);
    const advanced = result.state.pirates!.factions[current.id];
    const types = advanced.shipIds.map(id => result.state.units[id].type);

    expect(advanced.maritimeStage).toBe(3);
    expect(advanced.transitionGuards.lastStageReinforcementRound).toBe(state.turn);
    expect(result.state.units[oldShip.id]).toMatchObject({ type: 'pirate_galley', owner: current.id });
    expect(types).toContain('pirate_frigate');
    expect(createdIds.length).toBeGreaterThan(0);
    expect(createdIds.every(id => advanced.shipIds.includes(id))).toBe(true);
  });

  it('retires implausibly ancient hulls at Stage 5 while preserving aging frigates', () => {
    const state = fixture();
    state.pirates!.nextSpawnCheckTurn = 99;
    state.civilizations.player.techState.completed = [
      'galleys', 'navigation', 'triremes', 'caravels', 'amphibious-warfare',
    ];
    addUnit(state, 'ancient-galley', 'pirate_galley', 'pirate-1', { q: 6, r: 6 });
    addUnit(state, 'old-corsair', 'pirate_corsair', 'pirate-1', { q: 6, r: 7 });
    addUnit(state, 'aging-frigate', 'pirate_frigate', 'pirate-1', { q: 7, r: 6 });
    const current = faction({
      kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100,
    }, ['ancient-galley', 'old-corsair', 'aging-frigate']);
    current.maritimeStage = 4;
    state.pirates!.factions[current.id] = current;

    const result = processPiratesForCompletedRound(state, new EventBus());
    const types = result.state.pirates!.factions[current.id].shipIds.map(id => result.state.units[id].type);

    expect(types).toContain('pirate_mothership');
    expect(types).toContain('pirate_frigate');
    expect(types).not.toContain('pirate_galley');
    expect(types).not.toContain('pirate_corsair');
    expect(result.state.units['ancient-galley']).toBeUndefined();
    expect(result.state.units['old-corsair']).toBeUndefined();
  });

  it('defers maritime-stage reinforcement when no legal water placement exists', () => {
    const state = fixture();
    state.pirates!.nextSpawnCheckTurn = 99;
    state.civilizations.player.techState.completed = ['galleys', 'navigation'];
    for (const tile of Object.values(state.map.tiles)) tile.terrain = 'plains';
    addUnit(state, 'old-galley', 'pirate_galley', 'pirate-1', { q: 6, r: 6 });
    const current = faction({
      kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100,
    }, ['old-galley']);
    current.behavior = 'patrolling';
    current.notoriety = 0;
    current.maritimeStage = 1;
    state.pirates!.factions[current.id] = current;

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.pirates!.factions[current.id].maritimeStage).toBe(1);
    expect(result.state.pirates!.factions[current.id].shipIds).toEqual(['old-galley']);
  });

  it('does not enter blockading behavior before maritime Stage 2', () => {
    const state = fixture();
    state.pirates!.nextSpawnCheckTurn = 99;
    state.civilizations.player.techState.completed = ['galleys'];
    addUnit(state, 'galley', 'pirate_galley', 'pirate-1', { q: 6, r: 6 });
    const current = faction({
      kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100,
    }, ['galley']);
    current.maritimeStage = 1;
    current.notoriety = 5;
    current.behavior = 'raiding';
    state.pirates!.factions[current.id] = current;

    expect(processPiratesForCompletedRound(state, new EventBus()).state.pirates!.factions[current.id].behavior)
      .toBe('raiding');
  });

  it('promotes a faction to besieging when notoriety >= threshold and stage >= the siege floor', () => {
    const state = fixture();
    state.pirates!.nextSpawnCheckTurn = 99;
    addUnit(state, 'frigate', 'pirate_frigate', 'pirate-1', { q: 6, r: 6 });
    const current = faction({
      kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100,
    }, ['frigate']);
    current.maritimeStage = 3;
    current.notoriety = PIRATE_NOTORIETY.besieging;
    current.behavior = 'blockading';
    state.pirates!.factions[current.id] = current;

    expect(processPiratesForCompletedRound(state, new EventBus()).state.pirates!.factions[current.id].behavior)
      .toBe('besieging');
  });

  it('does NOT promote to besieging below the siege stage floor, even at high notoriety', () => {
    const state = fixture();
    state.pirates!.nextSpawnCheckTurn = 99;
    addUnit(state, 'corsair', 'pirate_corsair', 'pirate-1', { q: 6, r: 6 });
    const current = faction({
      kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100,
    }, ['corsair']);
    current.maritimeStage = 2;
    current.notoriety = PIRATE_NOTORIETY.besieging + 5;
    current.behavior = 'blockading';
    state.pirates!.factions[current.id] = current;

    expect(processPiratesForCompletedRound(state, new EventBus()).state.pirates!.factions[current.id].behavior)
      .not.toBe('besieging');
  });

  it('activates a legacy campaign past Galleys and warns each viewer once without consuming a spawn check', () => {
    const state = fixture();
    state.pirates = createEmptyPirateState();
    state.civilizations.player.techState.completed.push('galleys');
    state.civilizations['ai-1'].techState.completed.push('galleys');

    const first = processPiratesForCompletedRound(state, new EventBus());
    const replay = processPiratesForCompletedRound(first.state, new EventBus());

    expect(first.state.pirates!.activatedTurn).toBe(12);
    expect(first.state.pirates!.nextSpawnCheckTurn).toBe(16);
    expect(first.state.pirates!.activationWarningDeliveredByCiv).toEqual({ player: true, 'ai-1': true });
    expect(first.state.notificationLog!.player.filter(entry => /pirate waters/i.test(entry.message))).toHaveLength(1);
    expect(replay.state.notificationLog!.player.filter(entry => /pirate waters/i.test(entry.message))).toHaveLength(1);
    expect(replay.state.pirates!.nextSpawnCheckTurn).toBe(16);
  });

  it('uses the approved phase order and final ship positions for same-round raids and blockades', () => {
    const state = fixture();
    addCity(state);
    addUnit(state, 'ship-a', 'pirate_frigate', 'pirate-1', { q: 5, r: 3 });
    addUnit(state, 'ship-b', 'pirate_corsair', 'pirate-1', { q: 4, r: 3 });
    state.pirates!.factions['pirate-1'] = faction({
      kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100,
    }, ['ship-a', 'ship-b']);

    const bus = new EventBus();
    const movementEvents: Array<{ unitId: string; from: HexCoord; to: HexCoord; path: HexCoord[] }> = [];
    bus.on('unit:move', event => movementEvents.push(event));
    const result = processPiratesForCompletedRound(state, bus);

    expect(result.trace).toEqual(PIRATE_ROUND_TRACE);
    expect(result.facts.movements).toHaveLength(2);
    expect(movementEvents).toEqual(result.facts.movements.map(movement => ({
      ...movement,
      path: [movement.from, ...movement.path],
    })));
    expect(result.economyModifiers.plunderByCiv.player).toBe(12);
    expect(result.economyModifiers.blockadedCityIds).toEqual(['port']);
  });

  it('does not reset or attack with ships that relocated in the same phase', () => {
    const state = fixture();
    addUnit(state, 'flagship', 'pirate_frigate', 'pirate-1', { q: 5, r: 3 });
    addUnit(state, 'target', 'galley', 'player', { q: 5, r: 1 });
    state.civilizations.player.units = ['target'];
    state.pirates!.factions['pirate-1'] = faction({
      kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship', relocation: {
        lastRelocatedRound: null,
        planned: { plannedRound: 11, resolvesOnRound: 12, direction: 'south-east', path: [{ q: 6, r: 3 }, { q: 7, r: 3 }] },
      },
    }, ['flagship']);

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.facts.movements.some(movement => movement.unitId === 'flagship')).toBe(true);
    expect(result.facts.attacks).toEqual([]);
    expect(result.state.units.flagship).toMatchObject({ hasActed: true, movementPointsLeft: 0 });
    expect(result.state.units.target.health).toBe(100);
  });

  it('emits canonical combat results so visible pirate attacks animate through the shared path', () => {
    const state = fixture();
    addUnit(state, 'raider', 'pirate_frigate', 'pirate-1', { q: 5, r: 3 });
    addUnit(state, 'target', 'galley', 'player', { q: 5, r: 2 });
    state.civilizations.player.units = ['target'];
    state.pirates!.factions['pirate-1'] = faction({
      kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100,
    }, ['raider']);
    const bus = new EventBus();
    const combatEvents: CombatResult[] = [];
    bus.on('combat:resolved', event => combatEvents.push(event.result));

    const result = processPiratesForCompletedRound(state, bus);

    expect(result.facts.attacks).toHaveLength(1);
    expect(combatEvents).toEqual(result.facts.attacks);
  });

  it('normalizes expired protection and contracts before choosing targets and remains replay-safe', () => {
    const state = fixture();
    addCity(state);
    addUnit(state, 'ship', 'pirate_frigate', 'pirate-1', { q: 5, r: 4 });
    const current = faction({
      kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100,
    }, ['ship']);
    current.tributeByCiv.player = { paidRound: 1, protectedUntilRound: 12 };
    current.contract = {
      employerId: 'ai-1', targetId: 'player', startedRound: 1, expiresAfterRound: 12,
      successfulRaidCount: 0, exposed: false, exposureResolvedRaidKeys: [],
    };
    state.pirates!.factions[current.id] = current;

    const first = processPiratesForCompletedRound(state, new EventBus());
    const replay = processPiratesForCompletedRound(first.state, new EventBus());

    expect(first.state.pirates!.factions[current.id].tributeByCiv.player).toBeUndefined();
    expect(first.state.pirates!.factions[current.id].contract).toBeNull();
    expect(first.economyModifiers.plunderByCiv.player).toBe(12);
    expect(replay.events.filter(event => event.type === 'activated')).toHaveLength(0);
  });
});

describe('pirate naval siege (#522)', () => {
  function besiegingFaction(streakBeforeThisRound: number): PirateFactionState {
    const f = faction({
      kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100,
    }, ['ship-a', 'ship-b']);
    f.behavior = 'besieging';
    f.maritimeStage = 3;
    f.notoriety = PIRATE_NOTORIETY.besieging;
    f.blockadeStreakByCity = { port: streakBeforeThisRound };
    return f;
  }

  function siegeReadyState(cityHp: number): GameState {
    const state = fixture();
    addCity(state);
    state.cities.port = { ...state.cities.port!, hp: cityHp };
    addUnit(state, 'ship-a', 'pirate_frigate', 'pirate-1', { q: 5, r: 3 });
    addUnit(state, 'ship-b', 'pirate_corsair', 'pirate-1', { q: 4, r: 3 });
    state.pirates!.factions['pirate-1'] = besiegingFaction(PIRATE_SIEGE_BLOCKADE_TURNS - 1);
    return state;
  }

  it('fully blocks siege damage when the city has a garrison', () => {
    const state = siegeReadyState(50);
    addUnit(state, 'garrison', 'warrior', 'player', { q: 5, r: 5 });

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.cities.port!.hp).toBe(50);
  });

  it('damages an undefended city once the blockade streak reaches the threshold', () => {
    const state = siegeReadyState(50);

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.cities.port!.hp).toBeLessThan(50);
    expect(result.state.pirates!.factions['pirate-1']!.blockadeStreakByCity?.port).toBe(PIRATE_SIEGE_BLOCKADE_TURNS);
  });

  it('does not damage a city before the blockade streak reaches the threshold', () => {
    const state = siegeReadyState(50);
    state.pirates!.factions['pirate-1']!.blockadeStreakByCity = { port: PIRATE_SIEGE_BLOCKADE_TURNS - 2 };

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.cities.port!.hp).toBe(50);
  });

  it('balance: no siege stage one-shots a full-HP undefended city (a prepared player always gets multiple rounds)', () => {
    for (const stage of [3, 4, 5] as const) {
      const state = siegeReadyState(100);
      state.pirates!.factions['pirate-1']!.maritimeStage = stage;

      const result = processPiratesForCompletedRound(state, new EventBus());

      expect(result.state.cities.port!.hp).toBeGreaterThan(0);
    }
  });

  it('balance: a garrisoned city takes zero cumulative damage across repeated besieging rounds at every stage', () => {
    for (const stage of [3, 4, 5] as const) {
      let state = siegeReadyState(100);
      state.pirates!.factions['pirate-1']!.maritimeStage = stage;
      addUnit(state, 'garrison', 'warrior', 'player', { q: 5, r: 5 });

      for (let round = 0; round < 5; round++) {
        const result = processPiratesForCompletedRound({ ...state, turn: state.turn + round }, new EventBus());
        state = result.state;
      }

      expect(state.cities.port!.hp).toBe(100);
    }
  });

  it('sacks (never destroys) a civ\'s last remaining city even past the destruction era', () => {
    const state = siegeReadyState(2);
    state.era = 12;
    state.opponentChallenge = 'veteran';

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.cities.port).toBeDefined();
    expect(result.state.cities.port!.hp).toBe(1);
    expect(result.events.some(event => event.type === 'city-razed')).toBe(false);
  });

  it('destroys a non-last city past the destruction era and emits pirate:city-destroyed', () => {
    const state = siegeReadyState(2);
    state.era = 12;
    state.opponentChallenge = 'veteran';
    state.cities.second = { ...state.cities.port!, id: 'second', hp: 100, position: { q: 8, r: 8 } };
    state.civilizations.player.cities = ['port', 'second'];

    const bus = new EventBus();
    const destroyedEvents: Array<{ cityId: string; ownerId: string; factionId: string }> = [];
    bus.on('pirate:city-destroyed', event => destroyedEvents.push(event));

    const result = processPiratesForCompletedRound(state, bus);

    expect(result.state.cities.port).toBeUndefined();
    expect(destroyedEvents).toEqual([{ cityId: 'port', ownerId: 'player', factionId: 'pirate-1' }]);
    expect(result.events.some(event => event.type === 'city-razed' && event.cityId === 'port')).toBe(true);
  });

  it('emits exactly one "siege" alert on the transition into falling HP, not every damaging round', () => {
    const state = siegeReadyState(100);

    const first = processPiratesForCompletedRound(state, new EventBus());
    expect(first.events.filter(event => event.type === 'siege')).toHaveLength(1);

    const second = processPiratesForCompletedRound({ ...first.state, turn: state.turn + 1 }, new EventBus());
    expect(second.events.filter(event => event.type === 'siege')).toHaveLength(0);
  });

  it('does not besiege a city that is only blockaded, not besieging-tier', () => {
    const state = siegeReadyState(50);
    state.pirates!.factions['pirate-1']!.behavior = 'blockading';

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.cities.port!.hp).toBe(50);
  });

  it('hot-seat: the blockade streak and siege damage advance once per completed round, not once per human civ turn', () => {
    // processPiratesForCompletedRound is the exact entrypoint hot-seat's
    // runCompletedRound/processTurn call exactly once per completed round -- never once
    // per human player-turn within that round (mirrors the #549 HP-regen contract). Both
    // 'player' and 'ai-1' are marked human here to model a hot-seat game; a bug that
    // scoped this per-human-turn instead of per-round would double the streak/damage.
    const state = siegeReadyState(100);
    state.civilizations.player.isHuman = true;
    state.civilizations['ai-1']!.isHuman = true;

    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.pirates!.factions['pirate-1']!.blockadeStreakByCity?.port).toBe(PIRATE_SIEGE_BLOCKADE_TURNS);
    expect(result.events.filter(event => event.type === 'siege')).toHaveLength(1);
  });

  it('actor parity: a non-player (AI) civ\'s coastal city can be besieged and sacked by the same path', () => {
    const state = fixture();
    addCity(state);
    state.cities.port = { ...state.cities.port!, owner: 'ai-1', hp: 2 };
    state.civilizations.player.cities = [];
    state.civilizations['ai-1']!.cities = ['port'];
    addUnit(state, 'ship-a', 'pirate_frigate', 'pirate-1', { q: 5, r: 3 });
    addUnit(state, 'ship-b', 'pirate_corsair', 'pirate-1', { q: 4, r: 3 });
    state.pirates!.factions['pirate-1'] = besiegingFaction(PIRATE_SIEGE_BLOCKADE_TURNS - 1);
    state.era = 12;
    state.opponentChallenge = 'veteran';

    const result = processPiratesForCompletedRound(state, new EventBus());

    // 'ai-1' has only this one city, so the last-city guard forces a sack, never a
    // destroy -- pirates can pressure and plunder an AI civ but never eliminate it.
    expect(result.state.cities.port).toBeDefined();
    expect(result.state.cities.port!.hp).toBe(1);
    expect(result.economyModifiers).toBeDefined();
  });

  it('applies counter-fire to a besieging ship attacking a walled, ungarrisoned city (#522)', () => {
    const state = siegeReadyState(100);
    state.cities.port = { ...state.cities.port!, buildings: ['walls'], population: 20 };

    const shipBefore = state.units['ship-a']!.health;
    const result = processPiratesForCompletedRound(state, new EventBus());

    const shipAfter = result.state.units['ship-a']?.health ?? 0;
    expect(shipAfter).toBeLessThan(shipBefore);
  });

  it('does not counter-fire when the besieged city has no walls', () => {
    const state = siegeReadyState(100);
    state.cities.port = { ...state.cities.port!, buildings: [], population: 20 };

    const shipBefore = state.units['ship-a']!.health;
    const result = processPiratesForCompletedRound(state, new EventBus());

    expect(result.state.units['ship-a']?.health ?? 0).toBe(shipBefore);
  });

  it('emits city:counter-fire so the player gets feedback that their walls fought back (#522)', () => {
    const state = siegeReadyState(100);
    state.cities.port = { ...state.cities.port!, buildings: ['walls'], population: 20 };

    const bus = new EventBus();
    const onCounterFire = vi.fn();
    bus.on('city:counter-fire', onCounterFire);
    processPiratesForCompletedRound(state, bus);

    expect(onCounterFire).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'port', source: 'pirate' }));
  });
});
