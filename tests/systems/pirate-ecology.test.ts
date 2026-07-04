import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import {
  applyRegionalSuppression,
  calculatePiratePressureGain,
  choosePirateSpawn,
  getCoastalEnclaveCandidates,
  getFlotillaCandidates,
  getPirateMaritimeStage,
  processPirateEcology,
  spawnPirateFaction,
} from '@/systems/pirate-ecology';

function mapWith(
  entries: Array<[number, number, GameMap['tiles'][string]['terrain'], (string | null)?]>,
  width = 12,
  height = 12,
  wrapsHorizontally = false,
): GameMap {
  return {
    width,
    height,
    wrapsHorizontally,
    rivers: [],
    tiles: Object.fromEntries(entries.map(([q, r, terrain, owner = null]) => [`${q},${r}`, {
      coord: { q, r }, terrain, elevation: 'lowland', resource: null,
      improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    }])),
  };
}

function stateWithMap(map: GameMap, size: 'small' | 'medium' | 'large' = 'small'): GameState {
  const state = createNewGame(undefined, `pirate-ecology-${size}`, size);
  state.map = map;
  state.cities = {};
  state.units = {};
  state.pirates = createEmptyPirateState();
  for (const civ of Object.values(state.civilizations)) {
    civ.cities = [];
    civ.units = [];
    civ.visibility = { tiles: {}, lastSeen: {} };
    civ.techState.completed = [];
  }
  return state;
}

function addCity(state: GameState, id: string, owner: string, position: HexCoord, buildings: string[] = []): City {
  const city: City = {
    id, owner, position, name: id, population: 1, food: 0, foodNeeded: 15,
    buildings, productionQueue: [], productionProgress: 0, ownedTiles: [position],
    workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
  state.cities[id] = city;
  state.civilizations[owner].cities.push(id);
  return city;
}

function addCombatUnit(state: GameState, id: string, owner: string, position: HexCoord): Unit {
  const unit: Unit = {
    id, type: 'warrior', owner, position, movementPointsLeft: 2, health: 100,
    experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };
  state.units[id] = unit;
  state.civilizations[owner].units.push(id);
  return unit;
}

function faction(id: `pirate-${number}`, headquarters: PirateFactionState['headquarters']): PirateFactionState {
  return {
    id, name: id, spawnedRound: 1, behavior: 'patrolling', maritimeStage: 2,
    notoriety: 0, shipIds: [], headquarters, tributeByCiv: {}, demandByCiv: {},
    contract: null, intent: null, transitionGuards: { emittedEventKeys: [] },
  };
}

const ENCLAVE_MAP = mapWith([
  [3, 3, 'plains'], [3, 2, 'coast'], [4, 2, 'coast'], [4, 3, 'coast'],
  [2, 3, 'coast'], [2, 4, 'coast'], [3, 4, 'coast'],
]);

describe('pirate activation and pressure', () => {
  it('does not activate before a major civilization completes Galleys', () => {
    const state = stateWithMap(ENCLAVE_MAP);
    const next = processPirateEcology(state, new EventBus(), 'inactive');
    expect(next).toBe(state);
    expect(next.pirates!.activatedTurn).toBeNull();
  });

  it('activates at Galleys, seeds pressure 4, and leaves viewer warning delivery separate', () => {
    const state = stateWithMap(ENCLAVE_MAP);
    state.turn = 10;
    state.civilizations.player.techState.completed = ['galleys'];
    const next = processPirateEcology(state, new EventBus(), 'activate');
    expect(next.pirates).toMatchObject({
      activatedTurn: 10,
      nextSpawnCheckTurn: 14,
      pressure: { value: 4 },
      activationWarningDeliveredByCiv: {},
    });
  });

  it('derives maritime stage from the highest completed major capability', () => {
    const state = stateWithMap(ENCLAVE_MAP);
    state.civilizations.player.techState.completed = ['galleys', 'navigation', 'triremes'];
    expect(getPirateMaritimeStage(state)).toBe(3);
    state.civilizations['ai-1'].techState.completed.push('caravels');
    expect(getPirateMaritimeStage(state)).toBe(4);
  });

  it('adds exact scheduled pressure from stage, coastal routes, and wealthy coastal cities', () => {
    const state = stateWithMap(mapWith([
      [2, 2, 'plains'], [2, 1, 'coast'], [8, 8, 'plains'], [8, 7, 'coast'],
    ]));
    state.civilizations.player.techState.completed = ['galleys', 'navigation', 'triremes'];
    addCity(state, 'wealthy', 'player', { q: 2, r: 2 }, ['stock_exchange', 'marketplace']);
    addCity(state, 'port', 'ai-1', { q: 8, r: 8 });
    state.marketplace!.tradeRoutes = [{
      id: 'route-1', fromCityId: 'wealthy', toCityId: 'port', goldPerTrip: 8, turnsPerTrip: 4,
    }];
    expect(calculatePiratePressureGain(state, 3)).toBe(6);
  });

  it('runs one spawn on a four-round check and spends only the threshold', () => {
    const state = stateWithMap(ENCLAVE_MAP);
    state.turn = 10;
    state.civilizations.player.techState.completed = ['galleys'];
    const activated = processPirateEcology(state, new EventBus(), 'spawn-once');
    const due = { ...activated, turn: 14 };
    const next = processPirateEcology(due, new EventBus(), 'spawn-once');
    expect(Object.keys(next.pirates!.factions)).toHaveLength(1);
    expect(next.pirates!.pressure.value).toBe(0);
    expect(next.pirates!.nextSpawnCheckTurn).toBe(18);
  });

  it('keeps capped pressure unspent and retries later when no habitat is legal', () => {
    const state = stateWithMap(mapWith([[1, 1, 'plains']]));
    state.turn = 20;
    state.civilizations.player.techState.completed = ['galleys'];
    state.pirates = {
      ...createEmptyPirateState(), activatedTurn: 1, nextSpawnCheckTurn: 20,
      pressure: { value: 17, suppression: [] },
    };
    const next = processPirateEcology(state, new EventBus(), 'no-site');
    expect(next.pirates!.pressure.value).toBe(18);
    expect(next.pirates!.nextSpawnCheckTurn).toBe(24);
    expect(next.pirates!.factions).toEqual({});
  });

  it('keeps pressure and all side effects unspent when the independent-threat policy denies a spawn', () => {
    const state = stateWithMap(mapWith([
      [3, 3, 'plains'], [3, 2, 'coast'], [4, 2, 'coast'], [4, 3, 'coast'],
      [8, 3, 'plains'],
    ]));
    state.turn = 20;
    state.civilizations.player.techState.completed = ['galleys'];
    addCity(state, 'nearby-port', 'player', { q: 8, r: 3 });
    state.pirates = {
      ...createEmptyPirateState(),
      activatedTurn: 1,
      nextSpawnCheckTurn: 20,
      pressure: { value: 17, suppression: [] },
    };
    const beforeCounters = structuredClone(state.idCounters);
    const bus = new EventBus();
    const created: string[] = [];
    const audio: unknown[] = [];
    const spawned: unknown[] = [];
    bus.on('unit:created', event => created.push(event.unit.id));
    bus.on('pirate:faction-spawned', event => spawned.push(event));
    bus.on('pirate:audio-cue', event => audio.push(event));

    const next = processPirateEcology(state, bus, 'denied-pressure', {
      spawnPolicy: {
        canStart: (_candidateState, candidate) => {
          expect(candidate.threatId).toBe('pirate:pirate-1');
          expect(candidate.affectedHumanIds).toEqual(['player']);
          return false;
        },
      },
    });

    expect(next.pirates!.pressure.value).toBe(18);
    expect(next.pirates!.nextSpawnCheckTurn).toBe(24);
    expect(next.pirates!.factions).toEqual({});
    expect(next.pirates!.intelByCiv).toEqual({});
    expect(next.idCounters).toEqual(beforeCounters);
    expect(created).toEqual([]);
    expect(spawned).toEqual([]);
    expect(audio).toEqual([]);
  });
});

describe('pirate habitat candidates', () => {
  it('uses land shoreline anchors for enclaves and ocean-only anchors for flotillas', () => {
    const state = stateWithMap(mapWith([
      [3, 3, 'plains'], [3, 2, 'coast'], [8, 8, 'ocean'], [8, 7, 'coast'],
    ]));
    expect(getCoastalEnclaveCandidates(state).map(candidate => candidate.position)).toContainEqual({ q: 3, r: 3 });
    expect(getCoastalEnclaveCandidates(state).some(candidate => candidate.position.q === 3 && candidate.position.r === 2)).toBe(false);
    expect(getFlotillaCandidates(state).map(candidate => candidate.position)).toEqual([{ q: 8, r: 8 }]);
  });

  it('requires every covert claimed-coast condition independently', () => {
    const makeClaimed = () => {
      const state = stateWithMap(mapWith([[5, 5, 'plains', 'player'], [5, 4, 'coast']]));
      state.civilizations.player.visibility.tiles['5,5'] = 'fog';
      return state;
    };
    expect(getCoastalEnclaveCandidates(makeClaimed())).toHaveLength(1);

    const visible = makeClaimed();
    visible.civilizations.player.visibility.tiles['5,5'] = 'visible';
    expect(getCoastalEnclaveCandidates(visible)).toHaveLength(0);

    const nearCity = makeClaimed();
    addCity(nearCity, 'city-near', 'player', { q: 8, r: 5 });
    expect(getCoastalEnclaveCandidates(nearCity)).toHaveLength(0);

    const guarded = makeClaimed();
    addCombatUnit(guarded, 'guard', 'player', { q: 7, r: 5 });
    expect(getCoastalEnclaveCandidates(guarded)).toHaveLength(0);

    const noWater = makeClaimed();
    delete noWater.map.tiles['5,4'];
    expect(getCoastalEnclaveCandidates(noWater)).toHaveLength(0);

    const illegalTerrain = makeClaimed();
    illegalTerrain.map.tiles['5,5'].terrain = 'mountain';
    expect(getCoastalEnclaveCandidates(illegalTerrain)).toHaveLength(0);
  });

  it('applies city, headquarters, combat-unit, and occupancy exclusions to flotillas', () => {
    const state = stateWithMap(mapWith([[6, 6, 'ocean'], [10, 10, 'ocean']]));
    addCity(state, 'far-city', 'player', { q: 0, r: 0 });
    state.pirates!.factions['pirate-1'] = faction('pirate-1', {
      kind: 'coastal-enclave', position: { q: 0, r: 10 }, integrity: 100, maxIntegrity: 100,
    });
    addCombatUnit(state, 'patrol', 'player', { q: 10, r: 9 });
    state.units.occupied = { ...state.units.patrol, id: 'occupied', owner: 'pirate-1', position: { q: 6, r: 6 } };
    expect(getFlotillaCandidates(state)).toEqual([]);
  });

  it('uses wrap-aware distance at the east and west edges', () => {
    const wrapped = stateWithMap(mapWith([[0, 5, 'plains'], [0, 4, 'coast']], 10, 10, true));
    addCity(wrapped, 'edge-city', 'player', { q: 9, r: 5 });
    expect(getCoastalEnclaveCandidates(wrapped)).toHaveLength(0);

    const unwrapped = stateWithMap(mapWith([[0, 5, 'plains'], [0, 4, 'coast']], 10, 10, false));
    addCity(unwrapped, 'edge-city', 'player', { q: 9, r: 5 });
    expect(getCoastalEnclaveCandidates(unwrapped)).toHaveLength(1);
  });

  it('records eight-round suppression in an eight-hex region and lowers local score', () => {
    const state = stateWithMap(mapWith([
      [3, 3, 'plains'], [3, 2, 'coast'], [10, 10, 'plains'], [10, 9, 'coast'],
    ], 20, 20));
    state.turn = 30;
    const before = getCoastalEnclaveCandidates(state);
    const next = applyRegionalSuppression(state, { q: 3, r: 3 }, 30);
    expect(next.pirates!.pressure.suppression).toContainEqual({
      regionKey: '3,3', amount: 8, expiresAfterRound: 38,
    });
    const after = getCoastalEnclaveCandidates(next);
    expect(after.find(candidate => candidate.position.q === 3)!.score)
      .toBeLessThan(before.find(candidate => candidate.position.q === 3)!.score);
    expect(after.find(candidate => candidate.position.q === 10)!.score)
      .toBe(before.find(candidate => candidate.position.q === 10)!.score);
  });

  it('excludes an existing enclave anchor and prefers coast without nearby major combat units', () => {
    const state = stateWithMap(mapWith([
      [3, 3, 'plains'], [3, 2, 'coast'], [10, 10, 'plains'], [10, 9, 'coast'],
    ], 20, 20));
    state.pirates!.factions['pirate-1'] = faction('pirate-1', {
      kind: 'coastal-enclave', position: { q: 3, r: 3 }, integrity: 100, maxIntegrity: 100,
    });
    const unguardedScore = getCoastalEnclaveCandidates(state)
      .find(candidate => candidate.position.q === 10)!.score;
    addCombatUnit(state, 'nearby-patrol', 'player', { q: 8, r: 10 });

    const candidates = getCoastalEnclaveCandidates(state);
    expect(candidates.some(candidate => candidate.position.q === 3 && candidate.position.r === 3)).toBe(false);
    expect(candidates.find(candidate => candidate.position.q === 10)!.score).toBeLessThan(unguardedScore);
  });
});

describe('pirate spawn selection and creation', () => {
  it('seeds imprecise rumor intel for the owner of a covert claimed-coast enclave', () => {
    const state = stateWithMap(mapWith([
      [5, 5, 'plains', 'player'], [5, 4, 'coast'], [6, 4, 'coast'],
    ]));
    state.civilizations.player.techState.completed = ['galleys'];
    state.civilizations.player.visibility.tiles['5,5'] = 'fog';
    const plan = choosePirateSpawn(state, 'covert-rumor');
    expect(plan).toMatchObject({ habitat: 'coastal-enclave', covertOwnerId: 'player' });

    const spawned = spawnPirateFaction(state, plan!, new EventBus(), 'covert-rumor');
    const factionId = Object.keys(spawned.pirates!.factions)[0]!;
    const intel = spawned.pirates!.intelByCiv.player[factionId];

    expect(intel).toMatchObject({ level: 'rumor', factionId, discoveredRound: state.turn });
    expect(intel.approximateRegion?.radius).toBeGreaterThan(0);
    expect(intel.approximateRegion?.center).not.toEqual(plan!.position);
    expect(intel.lastKnownHeadquarters).toBeUndefined();
  });

  it('enforces map faction caps, the two-flotilla cap, and Stage 1 enclave-only spawning', () => {
    const state = stateWithMap(mapWith([
      [3, 3, 'plains'], [3, 2, 'coast'], [4, 2, 'coast'], [4, 3, 'coast'],
      [8, 8, 'ocean'], [8, 7, 'ocean'], [9, 8, 'ocean'],
    ], 12, 12), 'large');
    state.civilizations.player.techState.completed = ['galleys'];
    for (const seed of Array.from({ length: 20 }, (_, index) => `stage-1-${index}`)) {
      expect(choosePirateSpawn(state, seed)?.habitat).toBe('coastal-enclave');
    }

    state.civilizations.player.techState.completed.push('navigation');
    state.pirates!.factions['pirate-1'] = faction('pirate-1', { kind: 'deep-sea-flotilla', flagshipUnitId: 'f1', relocation: { planned: null, lastRelocatedRound: null } });
    state.pirates!.factions['pirate-2'] = faction('pirate-2', { kind: 'deep-sea-flotilla', flagshipUnitId: 'f2', relocation: { planned: null, lastRelocatedRound: null } });
    for (const seed of Array.from({ length: 20 }, (_, index) => `flotilla-cap-${index}`)) {
      expect(choosePirateSpawn(state, seed)?.habitat).toBe('coastal-enclave');
    }

    state.pirates!.factions['pirate-3'] = faction('pirate-3', { kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100 });
    state.settings.mapSize = 'small';
    expect(choosePirateSpawn(state, 'small-cap')).toBeNull();
  });

  it('uses a stable 3:2 habitat weighting from Stage 2 onward', () => {
    const state = stateWithMap(mapWith([
      [3, 3, 'plains'], [3, 2, 'coast'], [4, 2, 'coast'], [4, 3, 'coast'],
      [8, 8, 'ocean'], [8, 7, 'ocean'], [9, 8, 'ocean'], [7, 9, 'ocean'],
    ], 12, 12), 'large');
    state.civilizations.player.techState.completed = ['galleys', 'navigation'];
    const first = choosePirateSpawn(state, 'stable-habitat');
    expect(choosePirateSpawn(state, 'stable-habitat')).toEqual(first);
    const habitats = Array.from({ length: 200 }, (_, index) => choosePirateSpawn(state, `habitat-${index}`)?.habitat);
    const enclaveCount = habitats.filter(kind => kind === 'coastal-enclave').length;
    expect(enclaveCount).toBeGreaterThanOrEqual(105);
    expect(enclaveCount).toBeLessThanOrEqual(135);
  });

  it('allocates a distinct faction and units, keeps them out of civ rosters, and emits typed events', () => {
    const state = stateWithMap(ENCLAVE_MAP);
    state.turn = 10;
    state.civilizations.player.techState.completed = ['galleys'];
    const bus = new EventBus();
    const created: string[] = [];
    let spawned: { factionId: string; headquartersKind: string } | null = null;
    bus.on('unit:created', event => created.push(event.unit.id));
    bus.on('pirate:faction-spawned', event => { spawned = event; });

    const activated = processPirateEcology(state, bus, 'create-faction');
    const next = processPirateEcology({ ...activated, turn: 14 }, bus, 'create-faction');
    const pirate = next.pirates!.factions['pirate-1'];

    expect(pirate).toMatchObject({ id: 'pirate-1', spawnedRound: 14, behavior: 'patrolling', maritimeStage: 1 });
    expect(next.idCounters.nextPirateFactionId).toBe(2);
    expect(created).toEqual(pirate.shipIds);
    expect(spawned).toMatchObject({ factionId: 'pirate-1', headquartersKind: 'coastal-enclave' });
    expect(pirate.shipIds.every(id => next.units[id]?.owner === 'pirate-1')).toBe(true);
    expect(Object.values(next.civilizations).flatMap(civ => civ.units).some(id => pirate.shipIds.includes(id))).toBe(false);
    expect(new Set(pirate.shipIds.map(id => `${next.units[id].position.q},${next.units[id].position.r}`)).size).toBe(pirate.shipIds.length);
  });

  it('revalidates stale spawn plans and does not consume IDs or emit events on failure', () => {
    const state = stateWithMap(ENCLAVE_MAP);
    state.civilizations.player.techState.completed = ['galleys'];
    const plan = choosePirateSpawn(state, 'stale-plan')!;
    addCombatUnit(state, 'late-arrival', 'player', plan.unitPositions[0]);
    const bus = new EventBus();
    const created: string[] = [];
    bus.on('unit:created', event => created.push(event.unit.id));

    const next = spawnPirateFaction(state, plan, bus);
    expect(next).toBe(state);
    expect(next.idCounters.nextPirateFactionId).toBe(1);
    expect(created).toEqual([]);

    const emptyFleet = spawnPirateFaction(state, {
      ...plan, fleet: [], unitPositions: [],
    }, bus);
    expect(emptyFleet).toBe(state);
  });

  it('assigns deterministic distinct names to concurrently active factions', () => {
    const state = stateWithMap(mapWith([
      [3, 3, 'plains'], [3, 2, 'coast'], [4, 2, 'coast'], [4, 3, 'coast'],
      [12, 12, 'plains'], [12, 11, 'coast'], [13, 11, 'coast'], [13, 12, 'coast'],
    ], 20, 20), 'large');
    state.civilizations.player.techState.completed = ['galleys'];
    const firstPlan = choosePirateSpawn(state, 'first-name')!;
    const first = spawnPirateFaction(state, firstPlan, new EventBus());
    const secondPlan = choosePirateSpawn(first, 'second-name')!;
    const second = spawnPirateFaction(first, secondPlan, new EventBus());

    expect(second.pirates!.factions['pirate-1'].name)
      .not.toBe(second.pirates!.factions['pirate-2'].name);
  });
});
