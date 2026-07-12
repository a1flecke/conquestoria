import { describe, expect, it, vi } from 'vitest';
import { processMajorCivStrategicTurn } from '@/ai/ai-major-turn';
import { buildMajorCivPerception } from '@/ai/ai-perception';
import type { PreparedMajorCivPlan } from '@/ai/ai-prepared-turn';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';
import type {
  AIStrategicPlan,
  GameState,
  HexCoord,
  Unit,
  UnitType,
} from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';

const AI = 'ai-1';
const HUMAN = 'player';

function makeState(): GameState {
  const state = createNewGame({
    civType: 'egypt',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'Major turn',
    seed: 'major-turn',
    opponentChallenge: 'veteran',
  });
  state.turn = 20;
  state.units = {};
  state.cities = {};
  state.barbarianCamps = {};
  state.map.wrapsHorizontally = false;
  for (const tile of Object.values(state.map.tiles)) {
    tile.terrain = 'grassland';
    tile.elevation = 'lowland';
    tile.owner = null;
    tile.resource = null;
    tile.improvement = 'none';
    tile.improvementTurnsLeft = 0;
  }
  for (const civilization of Object.values(state.civilizations)) {
    civilization.units = [];
    civilization.cities = [];
  }
  state.civilizations[AI].diplomacy.atWarWith = [HUMAN];
  state.civilizations[HUMAN].diplomacy.atWarWith = [AI];
  state.civilizations[AI].visibility.tiles = Object.fromEntries(
    Object.keys(state.map.tiles).map(key => [key, 'visible' as const]),
  );
  return state;
}

function addUnit(
  state: GameState,
  id: string,
  type: UnitType,
  owner: string,
  position: HexCoord,
  overrides: Partial<Unit> = {},
): Unit {
  const unit = {
    ...createUnit(type, owner, position, state.idCounters),
    id,
    ...overrides,
  };
  state.units[id] = unit;
  state.civilizations[owner]?.units.push(id);
  return unit;
}

function addCity(
  state: GameState,
  id: string,
  owner: string,
  position: HexCoord,
) {
  const city = foundCity(owner, position, state.map, state.idCounters);
  city.id = id;
  state.cities[id] = city;
  state.civilizations[owner]?.cities.push(id);
  state.map.tiles[hexKey(position)].owner = owner;
  return city;
}

function makePlan(
  target: AIStrategicPlan['target'],
  assignedUnitIds: string[],
  overrides: Partial<AIStrategicPlan> = {},
): AIStrategicPlan {
  return {
    id: 'major-plan',
    actorId: AI,
    objective: target.kind === 'city' ? 'capture' : 'expand',
    target,
    theaterId: 'local:test',
    phase: 'attacking',
    reasonCodes: ['continue-active-war'],
    commitment: 0.7,
    createdTurn: 18,
    reconsiderAfterTurn: 22,
    expiresAfterTurn: 30,
    lastProgressTurn: 19,
    requiredRoles: { frontline: 1 },
    assignedUnitIds,
    ...overrides,
  };
}

function prepared(
  state: GameState,
  plan: AIStrategicPlan,
): PreparedMajorCivPlan {
  const portfolio = {
    ...createEmptyMajorCivPlanPortfolio(),
    primaryPlan: plan,
    lastPlannedTurn: state.turn,
  };
  return {
    civId: AI,
    perception: buildMajorCivPerception(state, AI),
    portfolio,
    assignments: {
      portfolio,
      assignmentsByPlanId: { [plan.id]: [...plan.assignedUnitIds] },
      recoveryUnitIds: [],
      forceDemands: [],
      rejectedByUnitId: {},
    },
    forceDemands: [],
    traces: [],
  };
}

describe('processMajorCivStrategicTurn', () => {
  it('modernizes before tactics so an upgraded unit cannot act twice', () => {
    const state = makeState();
    const home = addCity(state, 'home-city', AI, { q: 0, r: 0 });
    addUnit(state, 'obsolete', 'spy_scout', AI, home.position, {
      experience: 30,
    });
    state.civilizations[AI].techState.completed = [
      'espionage-scouting',
      'espionage-informants',
    ];
    state.civilizations[AI].gold = 200;
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['obsolete'],
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units.obsolete.type).toBe('spy_informant');
    expect(result.state.units.obsolete.hasActed).toBe(true);
    expect(result.actions.some(action => action.unitId === 'obsolete')).toBe(false);
  });

  it('rejects a prepared portfolio whose primary plan belongs to another actor', () => {
    const state = makeState();
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['attacker'],
      { actorId: HUMAN },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions).toEqual([]);
    expect(result.state).toEqual(state);
  });

  it('rallies a mobilizing force without prematurely capturing its target', () => {
    const state = makeState();
    addUnit(state, 'fast-unit', 'horseman', AI, { q: 0, r: 0 });
    addUnit(state, 'support', 'warrior', AI, { q: 0, r: 1 });
    const target = addCity(state, 'target-city', HUMAN, { q: 6, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['fast-unit', 'support'],
      {
        phase: 'mobilizing',
        rallyPoint: { q: 2, r: 0 },
        requiredRoles: { frontline: 1, capture: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN);
    expect(result.actions.some(action => action.kind === 'move')).toBe(true);
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toMatch(/mobilizing|advancing/);
  });

  it('still rallies when a tempting attack is illegal during mobilization', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'nearby-enemy', 'warrior', HUMAN, { q: 1, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 6, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      {
        phase: 'mobilizing',
        rallyPoint: { q: 0, r: 2 },
        requiredRoles: { capture: 1 },
      },
    );
    const bus = new EventBus();
    const combat = vi.fn();
    bus.on('combat:resolved', combat);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(combat).not.toHaveBeenCalled();
    expect(result.actions).toContainEqual(expect.objectContaining({
      kind: 'move',
      unitId: 'captor',
    }));
    expect(result.state.units.captor.position).not.toEqual({ q: 0, r: 0 });
  });

  it('does not capture during mobilization when no rally point is available', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      {
        phase: 'mobilizing',
        rallyPoint: undefined,
        requiredRoles: { capture: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN);
    expect(result.actions.some(action => action.kind === 'capture-city'))
      .toBe(false);
  });

  it('keeps scouting when the target is known only by rumor', () => {
    const state = makeState();
    addUnit(state, 'scout', 'scout', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['scout'],
      {
        phase: 'scouting',
        requiredRoles: { recon: 1 },
      },
    );
    const preparedTurn = prepared(state, plan);
    preparedTurn.perception.knownCities = preparedTurn.perception.knownCities
      .map(city => city.id === target.id
        ? { ...city, confidence: 'rumored' as const }
        : city);

    const result = processMajorCivStrategicTurn(
      state,
      preparedTurn,
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('scouting');
  });

  it('does not enter a new attacking phase during migration grace', () => {
    const state = makeState();
    if (!state.opponentAI) throw new Error('missing opponent AI state');
    state.opponentAI.migrationGraceRoundsRemaining = 2;
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'defender', 'warrior', HUMAN, { q: 1, r: 0 }, {
      health: 100,
    });
    const plan = makePlan(
      { kind: 'unit', id: 'defender', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      {
        objective: 'raid',
        phase: 'advancing',
        createdTurn: state.turn,
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions.some(action => action.kind === 'attack')).toBe(true);
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('advancing');
  });

  it('captures through canonical movement and emits capture and territory parity events', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    state.map.tiles[hexKey(target.position)].improvement = 'farm';
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );
    const before = structuredClone(state);
    const bus = new EventBus();
    const captured = vi.fn();
    const flipped = vi.fn();
    const moved = vi.fn();
    bus.on('city:captured', captured);
    bus.on('territory:tile-flipped', flipped);
    bus.on('unit:move', moved);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(state).toEqual(before);
    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(result.state.units.captor.position).toEqual(target.position);
    expect(captured).toHaveBeenCalledOnce();
    expect(flipped).toHaveBeenCalled();
    expect(moved).toHaveBeenCalledOnce();
  });

  it('applies combat rewards and camp-destruction history through canonical systems', () => {
    const state = makeState();
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'barbarian', 'warrior', 'barbarian', { q: 1, r: 0 }, {
      health: 1,
    });
    state.barbarianCamps.camp = {
      id: 'camp',
      position: { q: 1, r: 0 },
      strength: 1,
      spawnCooldown: 2,
    };
    const plan = makePlan(
      { kind: 'camp', id: 'camp', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      { objective: 'repel', requiredRoles: { frontline: 1 } },
    );
    const bus = new EventBus();
    const combat = vi.fn();
    const destroyed = vi.fn();
    bus.on('combat:resolved', combat);
    bus.on('barbarian:camp-destroyed', destroyed);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.units.barbarian).toBeUndefined();
    expect(result.state.barbarianCamps.camp).toBeUndefined();
    expect(result.state.legendaryWonderHistory?.destroyedStrongholds)
      .toContainEqual(expect.objectContaining({ civId: AI, campId: 'camp' }));
    expect(combat).toHaveBeenCalledOnce();
    expect(destroyed).toHaveBeenCalledOnce();
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .not.toBe('abandoned');
  });

  it('founds a city through the shared whole-state helper', () => {
    const state = makeState();
    addUnit(state, 'settler', 'settler', AI, { q: 2, r: 2 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 2, r: 2 } },
      ['settler'],
      {
        objective: 'expand',
        requiredRoles: { settlement: 1 },
      },
    );
    const bus = new EventBus();
    const founded = vi.fn();
    bus.on('city:founded', founded);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.units.settler).toBeUndefined();
    expect(Object.values(result.state.cities)
      .some(city => city.owner === AI && hexKey(city.position) === '2,2'))
      .toBe(true);
    expect(founded).toHaveBeenCalledOnce();
  });

  it('does not attack or capture a peaceful major civilization', () => {
    const state = makeState();
    state.civilizations[AI].diplomacy.atWarWith = [];
    state.civilizations[HUMAN].diplomacy.atWarWith = [];
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN);
    expect(result.actions.some(action =>
      action.kind === 'attack' || action.kind === 'capture-city'))
      .toBe(false);
  });

  it('advances and captures after the same attacker defeats the final city defender', () => {
    const state = makeState();
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'last-defender', 'warrior', HUMAN, { q: 1, r: 0 }, {
      health: 1,
    });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units['last-defender']).toBeUndefined();
    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(result.state.units.captor.position).toEqual(target.position);
    expect(result.actions.map(action => action.kind))
      .toEqual(['attack', 'capture-city']);
  });

  it('keeps the repel state (damage, action-consumption) when the AI\'s undefended-city assault is repelled (#522)', () => {
    // Regression for a pre-merge review bug: occupyMajorCity's failure branch used to
    // `return { state, captured: false }` -- the ORIGINAL pre-assault state, not
    // assault.state -- silently discarding counter-fire damage and hasActed/
    // movementPointsLeft consumption on a repel. That made a repelled AI assault a
    // free, fully-reversible no-op: the attacker kept full health and could be
    // re-selected to retry the same doomed assault. A hopelessly outmatched attacker
    // (warrior, strength 10) against a maximally defended city (population 40, walls +
    // star_fort) makes the repel effectively certain regardless of RNG seed.
    const state = makeState();
    addUnit(state, 'captor', 'warrior', AI, { q: 0, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    target.population = 40;
    target.buildings = ['walls', 'star_fort'];
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(HUMAN); // repelled, not captured
    const captorAfter = result.state.units.captor;
    if (captorAfter) {
      // Survived the counter-fire: must be marked as having acted, not silently reverted.
      expect(captorAfter.health).toBeLessThan(100);
      expect(captorAfter.hasActed).toBe(true);
      expect(captorAfter.movementPointsLeft).toBe(0);
    } else {
      // Counter-fire killed it -- must actually be gone, not resurrected by a stale
      // pre-assault state, and pruned from the owner's roster.
      expect(result.state.civilizations[AI].units).not.toContain('captor');
    }
  });

  it('executes worker improvements through the canonical worker system', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 1, r: 2 });
    addUnit(state, 'worker', 'worker', AI, { q: 2, r: 2 });
    state.map.tiles['2,2'].owner = AI;
    const plan = makePlan(
      { kind: 'region', id: 'home-region', anchor: { q: 2, r: 2 } },
      ['worker'],
      {
        objective: 'expand',
        requiredRoles: { worker: 1 },
      },
    );
    const bus = new EventBus();
    const started = vi.fn();
    bus.on('improvement:started', started);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.map.tiles['2,2'].improvement).not.toBe('none');
    expect(result.state.units.worker.hasActed).toBe(true);
    expect(started).toHaveBeenCalledOnce();
  });

  it('establishes a legal resource outpost and consumes the expedition', () => {
    const state = makeState();
    state.civilizations[AI].techState.completed.push('bronze-working');
    state.map.tiles['2,2'].resource = 'iron';
    addUnit(state, 'expedition', 'expedition', AI, { q: 2, r: 2 });
    const plan = makePlan(
      { kind: 'resource', resource: 'iron', position: { q: 2, r: 2 } },
      ['expedition'],
      {
        objective: 'secure-resource',
        requiredRoles: { 'resource-expedition': 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.map.tiles['2,2'].improvement)
      .toBe('resource_outpost');
    expect(result.state.units.expedition).toBeUndefined();
    expect(result.state.civilizations[AI].units).not.toContain('expedition');
  });

  it('loads a land unit through the canonical transport helper', () => {
    const state = makeState();
    state.map.tiles['4,0'].terrain = 'ocean';
    addUnit(state, 'passenger', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'transport', 'transport', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'overseas', anchor: { q: 4, r: 0 } },
      ['passenger'],
      {
        objective: 'expand',
        requiredRoles: { transport: 1, frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units.passenger.transportId).toBe('transport');
    expect(result.state.units.transport.cargoUnitIds).toContain('passenger');
  });

  it('unloads endangered cargo through the canonical transport helper', () => {
    const state = makeState();
    const transport = addUnit(
      state,
      'transport',
      'transport',
      AI,
      { q: 1, r: 1 },
      { cargoUnitIds: ['cargo'], health: 20 },
    );
    addUnit(state, 'cargo', 'warrior', AI, transport.position, {
      transportId: transport.id,
    });
    const plan = makePlan(
      { kind: 'region', id: 'landing', anchor: { q: 3, r: 1 } },
      ['cargo'],
      {
        objective: 'expand',
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions[0]?.kind).toBe('unload');
    expect(result.state.units.cargo.transportId).toBeUndefined();
    expect(result.state.units.transport.cargoUnitIds).not.toContain('cargo');
  });

  it('uses wrapped adjacency when capturing across the horizontal seam', () => {
    const state = makeState();
    state.map.wrapsHorizontally = true;
    const attackerPosition = { q: state.map.width - 1, r: 0 };
    addUnit(state, 'captor', 'swordsman', AI, attackerPosition);
    const target = addCity(state, 'target-city', HUMAN, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(result.state.units.captor.position).toEqual({ q: 0, r: 0 });
  });

  it('transitions a badly damaged attacking force into withdrawal', () => {
    const state = makeState();
    addCity(state, 'home', AI, { q: 0, r: 0 });
    addUnit(state, 'damaged', 'swordsman', AI, { q: 2, r: 0 }, {
      health: 10,
    });
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['damaged'],
      { phase: 'attacking', requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('withdrawing');
    expect(result.actions[0]?.kind).toMatch(/withdraw|rest/);
  });

  it('cleans up an adjacent rebel through the same canonical combat path', () => {
    const state = makeState();
    addUnit(state, 'attacker', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'rebel', 'warrior', 'rebels', { q: 1, r: 0 }, {
      health: 1,
    });
    const plan = makePlan(
      { kind: 'unit', id: 'rebel', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      { objective: 'repel', requiredRoles: { frontline: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.units.rebel).toBeUndefined();
    expect(result.actions[0]).toMatchObject({
      kind: 'attack',
      targetUnitId: 'rebel',
    });
  });

  it('uses minor-civilization conquest only when canonical minor war is active', () => {
    const state = makeState();
    const minor = Object.values(state.minorCivs)[0];
    if (!minor) throw new Error('missing generated minor civilization');
    minor.isDestroyed = false;
    minor.units = [];
    minor.diplomacy.atWarWith = [AI];
    state.civilizations[AI].diplomacy.atWarWith.push(minor.id);
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, minor.cityId, minor.id, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );
    const bus = new EventBus();
    const destroyed = vi.fn();
    bus.on('minor-civ:destroyed', destroyed);

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      bus,
    );

    expect(result.state.minorCivs[minor.id].isDestroyed).toBe(true);
    expect(result.state.cities[target.id].owner).toBe(AI);
    expect(destroyed).toHaveBeenCalledOnce();
  });

  it('does not conquer a minor civilization when neither side records a war', () => {
    const state = makeState();
    const minor = Object.values(state.minorCivs)[0];
    if (!minor) throw new Error('missing generated minor civilization');
    minor.isDestroyed = false;
    minor.units = [];
    minor.diplomacy.atWarWith = [];
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const target = addCity(state, minor.cityId, minor.id, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['captor'],
      { requiredRoles: { capture: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.minorCivs[minor.id].isDestroyed).toBe(false);
    expect(result.state.cities[target.id].owner).toBe(minor.id);
    expect(result.actions.some(action =>
      action.kind === 'attack' || action.kind === 'capture-city'))
      .toBe(false);
  });

  it('abandons an invalid target without moving assigned units toward stale coordinates', () => {
    const state = makeState();
    const attacker = addUnit(
      state,
      'attacker',
      'swordsman',
      AI,
      { q: 0, r: 0 },
    );
    const plan = makePlan(
      { kind: 'unit', id: 'missing-target', lastKnownPosition: { q: 4, r: 0 } },
      ['attacker'],
      { objective: 'repel', requiredRoles: { frontline: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.actions).toEqual([]);
    expect(result.state.units.attacker.position).toEqual(attacker.position);
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('abandoned');
  });

  it('executes urgent city defense before an unrelated primary expansion', () => {
    const state = makeState();
    const home = addCity(state, 'home', AI, { q: 0, r: 0 });
    addUnit(state, 'defender', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'threat', 'warrior', HUMAN, { q: 1, r: 0 }, {
      health: 1,
    });
    addUnit(state, 'settler', 'settler', AI, { q: 4, r: 4 });
    const primary = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 4, r: 4 } },
      ['settler'],
      {
        id: 'primary',
        objective: 'expand',
        requiredRoles: { settlement: 1 },
      },
    );
    const defense = makePlan(
      { kind: 'city', id: home.id, lastKnownPosition: home.position },
      ['defender'],
      {
        id: 'defense',
        objective: 'defend',
        requiredRoles: { frontline: 1 },
      },
    );
    const preparedTurn = prepared(state, primary);
    preparedTurn.portfolio.defensePlansByCityId = { [home.id]: defense };
    preparedTurn.assignments.portfolio = preparedTurn.portfolio;
    preparedTurn.assignments.assignmentsByPlanId.defense = ['defender'];

    const result = processMajorCivStrategicTurn(
      state,
      preparedTurn,
      new EventBus(),
    );

    expect(result.actions[0]).toMatchObject({
      kind: 'attack',
      unitId: 'defender',
      targetUnitId: 'threat',
    });
  });

  it('does not withdraw from a stronger nearby civilization while at peace', () => {
    const state = makeState();
    state.civilizations[AI].diplomacy.atWarWith = [HUMAN];
    addUnit(state, 'attacker', 'warrior', AI, { q: 0, r: 0 });
    addUnit(state, 'peaceful-army', 'tank', 'ai-2', { q: 2, r: 0 });
    const target = addCity(state, 'target-city', HUMAN, { q: 5, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: target.id, lastKnownPosition: target.position },
      ['attacker'],
      { phase: 'advancing', requiredRoles: { frontline: 1 } },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .not.toBe('withdrawing');
  });

  it('keeps consolidating while a visible hostile counterattack is nearby', () => {
    const state = makeState();
    const captured = addCity(state, 'captured-city', AI, { q: 1, r: 0 });
    addUnit(state, 'occupier', 'swordsman', AI, { q: 1, r: 0 }, {
      hasActed: true,
      movementPointsLeft: 0,
    });
    addUnit(state, 'counterattacker', 'warrior', HUMAN, { q: 3, r: 0 });
    const plan = makePlan(
      {
        kind: 'city',
        id: captured.id,
        lastKnownPosition: captured.position,
      },
      ['occupier'],
      {
        phase: 'consolidating',
        lastProgressTurn: state.turn - 2,
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('consolidating');
  });

  it('does not count holding position as fresh consolidation progress', () => {
    const state = makeState();
    const captured = addCity(state, 'captured-city', AI, { q: 1, r: 0 });
    addUnit(state, 'occupier', 'swordsman', AI, { q: 1, r: 0 }, {
      hasActed: true,
      movementPointsLeft: 0,
    });
    const plan = makePlan(
      {
        kind: 'city',
        id: captured.id,
        lastKnownPosition: captured.position,
      },
      ['occupier'],
      {
        phase: 'consolidating',
        lastProgressTurn: state.turn - 1,
        requiredRoles: { frontline: 1 },
      },
    );

    const result = processMajorCivStrategicTurn(
      state,
      prepared(state, plan),
      new EventBus(),
    );

    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.phase)
      .toBe('consolidating');
    expect(result.state.opponentAI?.majorCivs[AI].primaryPlan?.lastProgressTurn)
      .toBe(state.turn - 1);
  });
});
