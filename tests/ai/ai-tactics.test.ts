import { describe, expect, it } from 'vitest';
import {
  chooseTacticalSequence,
  chooseUnitTacticalAction,
  rankUnitTacticalActions,
  type AITacticalContext,
} from '@/ai/ai-tactics';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState } from '@/core/pirate-state';
import type {
  AIStrategicPlan,
  GameState,
  HexCoord,
  OpponentChallenge,
  Unit,
  UnitType,
} from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';

const AI = 'ai-1';
const HUMAN = 'player';

function makeState(challenge: OpponentChallenge = 'standard'): GameState {
  const state = createNewGame({
    civType: 'egypt',
    mapSize: 'small',
    opponentCount: 1,
    gameTitle: 'AI tactics',
    seed: 'ai-tactics',
    opponentChallenge: challenge,
  });
  state.gameId = 'ai-tactics-game';
  state.turn = 12;
  state.units = {};
  state.cities = {};
  state.map.wrapsHorizontally = false;
  state.map.rivers = [];
  for (const tile of Object.values(state.map.tiles)) {
    tile.terrain = 'grassland';
    tile.elevation = 'lowland';
    tile.owner = null;
    tile.improvement = 'none';
    tile.improvementTurnsLeft = 0;
    tile.resource = null;
    tile.hasRiver = false;
  }
  for (const civ of Object.values(state.civilizations)) {
    civ.units = [];
    civ.cities = [];
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

function addCity(state: GameState, id: string, owner: string, position: HexCoord) {
  const city = foundCity(owner, position, state.map, state.idCounters);
  city.id = id;
  state.cities[id] = city;
  state.civilizations[owner].cities.push(id);
  return city;
}

function makePlan(
  target: AIStrategicPlan['target'],
  assignedUnitIds: string[],
  overrides: Partial<AIStrategicPlan> = {},
): AIStrategicPlan {
  return {
    id: 'tactical-plan',
    actorId: AI,
    objective: target.kind === 'city' ? 'capture' : 'expand',
    target,
    theaterId: 'test-theater',
    phase: 'attacking',
    reasonCodes: ['continue-active-war'],
    commitment: 0.7,
    createdTurn: 10,
    reconsiderAfterTurn: 15,
    expiresAfterTurn: 25,
    lastProgressTurn: 11,
    requiredRoles: { frontline: 1, capture: 1 },
    assignedUnitIds,
    ...overrides,
  };
}

function context(
  state: GameState,
  plan: AIStrategicPlan,
): AITacticalContext {
  return {
    state,
    actorId: AI,
    plan,
    assignedUnitIds: plan.assignedUnitIds,
  };
}

describe('AI tactical action ranking', () => {
  it('uses safe ranged fire before committing a capture unit', () => {
    const state = makeState('veteran');
    addUnit(state, 'archer', 'archer', AI, { q: 0, r: 0 });
    addUnit(state, 'swordsman', 'swordsman', AI, { q: 1, r: 0 });
    addUnit(state, 'defender', 'warrior', HUMAN, { q: 2, r: 0 });
    const city = addCity(state, 'target-city', HUMAN, { q: 3, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['archer', 'swordsman'],
    );

    const actions = chooseTacticalSequence(context(state, plan));

    expect(actions[0]).toMatchObject({ kind: 'attack', unitId: 'archer' });
    expect(actions.findIndex(action => action.unitId === 'swordsman'))
      .toBeGreaterThan(actions.findIndex(action => action.unitId === 'archer'));
  });

  it('does not opportunistically attack beasts when beast contests are disabled', () => {
    const state = makeState('veteran');
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    addUnit(state, 'beast', 'beast_boar', 'beasts', { q: 1, r: 0 });
    const city = addCity(state, 'target-city', HUMAN, { q: 4, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['captor'],
    );

    const actions = rankUnitTacticalActions(
      context(state, plan),
      'captor',
    );

    expect(actions).not.toContainEqual(expect.objectContaining({
      action: {
        kind: 'attack',
        unitId: 'captor',
        targetUnitId: 'beast',
      },
    }));
  });

  it('does not attack a pirate faction while tribute protection is active', () => {
    const state = makeState('veteran');
    state.map.tiles['0,0'].terrain = 'ocean';
    state.map.tiles['1,0'].terrain = 'ocean';
    state.map.tiles['3,0'].terrain = 'ocean';
    addUnit(state, 'warship', 'galley', AI, { q: 0, r: 0 });
    addUnit(
      state,
      'protected-pirate',
      'pirate_galley',
      'pirate-1',
      { q: 1, r: 0 },
    );
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1',
      name: 'The Red Wake',
      spawnedRound: 2,
      behavior: 'blockading',
      maritimeStage: 1,
      notoriety: 1,
      shipIds: ['protected-pirate'],
      headquarters: {
        kind: 'coastal-enclave',
        position: { q: 3, r: 0 },
        integrity: 100,
        maxIntegrity: 100,
      },
      tributeByCiv: {
        [AI]: {
          paidRound: state.turn,
          protectedUntilRound: state.turn + 3,
        },
      },
      demandByCiv: {},
      contract: null,
      intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };
    const plan = makePlan(
      { kind: 'region', id: 'sea-lane', anchor: { q: 3, r: 0 } },
      ['warship'],
      { objective: 'blockade' },
    );

    const actions = rankUnitTacticalActions(
      context(state, plan),
      'warship',
    );

    expect(actions).not.toContainEqual(expect.objectContaining({
      action: {
        kind: 'attack',
        unitId: 'warship',
        targetUnitId: 'protected-pirate',
      },
    }));
  });

  it('does not send a fast unit beyond support cohesion', () => {
    const state = makeState('veteran');
    addUnit(state, 'horseman', 'horseman', AI, { q: 1, r: 0 });
    const support = addUnit(state, 'support', 'warrior', AI, { q: 0, r: 2 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 7, r: 0 } },
      ['horseman', 'support'],
      { objective: 'expand' },
    );

    const action = chooseUnitTacticalAction(context(state, plan), 'horseman');

    expect(action.kind).toBe('move');
    const supportTurns = Math.ceil(
      hexDistance(
        support.position,
        action.kind === 'move' ? action.destination : support.position,
      )
      / UNIT_DEFINITIONS[support.type].movementPoints,
    );
    expect(supportTurns).toBeLessThanOrEqual(1);
  });

  it('withdraws a damaged unit toward reachable healing', () => {
    const state = makeState('standard');
    const city = addCity(state, 'home', AI, { q: 0, r: 0 });
    addUnit(state, 'damaged', 'warrior', AI, { q: 2, r: 0 }, {
      health: 35,
      movementPointsLeft: 1,
    });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 7, r: 0 } },
      ['damaged'],
    );

    const action = chooseUnitTacticalAction(context(state, plan), 'damaged');

    expect(action).toMatchObject({ kind: 'withdraw', unitId: 'damaged' });
    expect(hexDistance(action.kind === 'withdraw' ? action.destination : { q: 9, r: 9 }, city.position))
      .toBeLessThan(hexDistance({ q: 2, r: 0 }, city.position));
  });

  it('does not withdraw into a peaceful foreign city', () => {
    const state = makeState('standard');
    addCity(state, 'home', AI, { q: 0, r: 0 });
    const foreign = addCity(state, 'foreign', HUMAN, { q: 1, r: 0 });
    state.civilizations[AI].diplomacy.atWarWith = [];
    state.civilizations[HUMAN].diplomacy.atWarWith = [];
    addUnit(state, 'damaged', 'warrior', AI, { q: 2, r: 0 }, {
      health: 35,
      movementPointsLeft: 1,
    });
    for (const tile of Object.values(state.map.tiles)) {
      if (
        hexDistance(tile.coord, { q: 2, r: 0 }) === 1
        && hexKey(tile.coord) !== hexKey(foreign.position)
      ) {
        tile.terrain = 'mountain';
      }
    }
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 7, r: 0 } },
      ['damaged'],
    );

    const action = chooseUnitTacticalAction(context(state, plan), 'damaged');

    expect(
      action.kind === 'withdraw'
        && hexKey(action.destination) === hexKey(foreign.position),
    ).toBe(false);
  });

  it('never attacks during peace or attacks an unseen target', () => {
    const peaceful = makeState('veteran');
    peaceful.civilizations[AI].diplomacy.atWarWith = [];
    peaceful.civilizations[HUMAN].diplomacy.atWarWith = [];
    addUnit(peaceful, 'attacker', 'warrior', AI, { q: 0, r: 0 });
    addUnit(peaceful, 'target', 'warrior', HUMAN, { q: 1, r: 0 });
    const peacefulPlan = makePlan(
      { kind: 'unit', id: 'target', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      { objective: 'repel' },
    );

    expect(rankUnitTacticalActions(context(peaceful, peacefulPlan), 'attacker')
      .some(candidate => candidate.action.kind === 'attack')).toBe(false);

    const hidden = makeState('veteran');
    addUnit(hidden, 'attacker', 'warrior', AI, { q: 0, r: 0 });
    addUnit(hidden, 'target', 'warrior', HUMAN, { q: 1, r: 0 });
    hidden.civilizations[AI].visibility.tiles[hexKey({ q: 1, r: 0 })] = 'fog';
    const hiddenPlan = makePlan(
      { kind: 'unit', id: 'target', lastKnownPosition: { q: 1, r: 0 } },
      ['attacker'],
      { objective: 'repel' },
    );

    expect(rankUnitTacticalActions(context(hidden, hiddenPlan), 'attacker')
      .some(candidate => candidate.action.kind === 'attack')).toBe(false);
  });

  it('does not generate attacks outside canonical range', () => {
    const state = makeState('veteran');
    addUnit(state, 'attacker', 'warrior', AI, { q: 0, r: 0 });
    addUnit(state, 'target', 'warrior', HUMAN, { q: 3, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: 'target', lastKnownPosition: { q: 3, r: 0 } },
      ['attacker'],
      { objective: 'repel' },
    );

    expect(rankUnitTacticalActions(context(state, plan), 'attacker')
      .some(candidate => candidate.action.kind === 'attack')).toBe(false);
  });

  it('does not choose an occupied movement destination', () => {
    const state = makeState('veteran');
    addUnit(state, 'mover', 'horseman', AI, { q: 0, r: 0 });
    addUnit(state, 'blocker', 'warrior', AI, { q: 3, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 7, r: 0 } },
      ['mover'],
      { objective: 'expand' },
    );

    const action = chooseUnitTacticalAction(context(state, plan), 'mover');

    expect(action.kind).toBe('move');
    expect(action.kind === 'move' ? action.destination : null)
      .not.toEqual({ q: 3, r: 0 });
  });

  it('accounts for river attack penalties when otherwise equal targets exist', () => {
    const state = makeState('veteran');
    addUnit(state, 'attacker', 'swordsman', AI, { q: 1, r: 1 });
    addUnit(state, 'across-river', 'warrior', HUMAN, { q: 2, r: 1 });
    addUnit(state, 'clear-target', 'warrior', HUMAN, { q: 1, r: 2 });
    state.map.rivers = [{ from: { q: 1, r: 1 }, to: { q: 2, r: 1 } }];
    const plan = makePlan(
      { kind: 'region', id: 'battlefield', anchor: { q: 4, r: 4 } },
      ['attacker'],
      { objective: 'repel' },
    );

    expect(chooseUnitTacticalAction(context(state, plan), 'attacker'))
      .toMatchObject({ kind: 'attack', targetUnitId: 'clear-target' });
  });

  it('keeps transported cargo from attacking or moving independently', () => {
    const state = makeState('veteran');
    const transport = addUnit(state, 'transport', 'transport', AI, { q: 1, r: 1 }, {
      cargoUnitIds: ['cargo'],
    });
    addUnit(state, 'cargo', 'warrior', AI, transport.position, {
      transportId: transport.id,
    });
    addUnit(state, 'target', 'warrior', HUMAN, { q: 2, r: 1 });
    const plan = makePlan(
      { kind: 'unit', id: 'target', lastKnownPosition: { q: 2, r: 1 } },
      ['cargo'],
      { objective: 'repel' },
    );

    const tactical = context(state, plan);
    const action = chooseUnitTacticalAction(tactical, 'cargo');

    expect(['unload', 'hold']).toContain(action.kind);
    expect(rankUnitTacticalActions(tactical, 'cargo')
      .some(candidate =>
        candidate.action.kind === 'attack'
        || candidate.action.kind === 'move'
        || candidate.action.kind === 'withdraw')).toBe(false);
  });

  it('does not move into a peaceful foreign city outside capture legality', () => {
    const state = makeState('veteran');
    state.civilizations[AI].diplomacy.atWarWith = [];
    state.civilizations[HUMAN].diplomacy.atWarWith = [];
    addUnit(state, 'mover', 'horseman', AI, { q: 0, r: 0 });
    const city = addCity(state, 'peaceful-city', HUMAN, { q: 3, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['mover'],
    );

    expect(rankUnitTacticalActions(context(state, plan), 'mover')
      .some(candidate =>
        candidate.action.kind === 'move'
        && hexKey(candidate.action.destination) === hexKey(city.position))).toBe(false);
  });

  it('does not force the sole last-city defender to retreat', () => {
    const state = makeState('standard');
    const city = addCity(state, 'last-city', AI, { q: 0, r: 0 });
    addUnit(state, 'defender', 'warrior', AI, city.position, { health: 35 });
    addUnit(state, 'attacker', 'warrior', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['defender'],
      { objective: 'defend', requiredRoles: { frontline: 1 } },
    );

    expect(chooseUnitTacticalAction(context(state, plan), 'defender'))
      .toMatchObject({ kind: 'attack', targetUnitId: 'attacker' });
  });

  it('never degrades an available lethal city defense through seeded mistakes', () => {
    const state = makeState('explorer');
    const city = addCity(state, 'last-city', AI, { q: 0, r: 0 });
    addUnit(state, 'defender', 'swordsman', AI, city.position);
    addUnit(state, 'fragile', 'warrior', HUMAN, { q: 1, r: 0 }, { health: 1 });
    addUnit(state, 'healthy', 'warrior', HUMAN, { q: 0, r: 1 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['defender'],
      { objective: 'defend', requiredRoles: { frontline: 1 } },
    );

    const lethal = rankUnitTacticalActions(context(state, plan), 'defender')
      .find(candidate =>
        candidate.action.kind === 'attack'
        && candidate.action.targetUnitId === 'fragile');

    expect(lethal?.mandatory).toBe(true);
    expect(chooseUnitTacticalAction(context(state, plan), 'defender'))
      .toMatchObject({ kind: 'attack', targetUnitId: 'fragile' });
  });

  it('does not attack a target already predicted dead earlier in the sequence', () => {
    const state = makeState('veteran');
    addUnit(state, 'archer-a', 'archer', AI, { q: 0, r: 0 });
    addUnit(state, 'archer-b', 'archer', AI, { q: 0, r: 1 });
    addUnit(state, 'fragile', 'warrior', HUMAN, { q: 2, r: 0 }, { health: 1 });
    const plan = makePlan(
      { kind: 'unit', id: 'fragile', lastKnownPosition: { q: 2, r: 0 } },
      ['archer-a', 'archer-b'],
      { objective: 'repel' },
    );

    const attacks = chooseTacticalSequence(context(state, plan))
      .filter(action => action.kind === 'attack' && action.targetUnitId === 'fragile');

    expect(attacks).toHaveLength(1);
  });

  it('does not capture a city without a capture-capable unit', () => {
    const state = makeState('veteran');
    addUnit(state, 'catapult', 'catapult', AI, { q: 0, r: 0 });
    const city = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['catapult'],
    );

    expect(rankUnitTacticalActions(context(state, plan), 'catapult')
      .some(candidate => candidate.action.kind === 'capture-city')).toBe(false);
  });

  it('captures an adjacent exposed enemy city with a capture-capable unit', () => {
    const state = makeState('veteran');
    addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
    const city = addCity(state, 'target-city', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['captor'],
    );

    expect(chooseUnitTacticalAction(context(state, plan), 'captor'))
      .toEqual({ kind: 'capture-city', unitId: 'captor', cityId: city.id });
  });

  it('does not capture a city remotely with a ranged unit', () => {
    const state = makeState('veteran');
    addUnit(state, 'archer', 'archer', AI, { q: 0, r: 0 }, {
      movementPointsLeft: 2,
    });
    const city = addCity(state, 'target-city', HUMAN, { q: 2, r: 0 });
    const plan = makePlan(
      { kind: 'city', id: city.id, lastKnownPosition: city.position },
      ['archer'],
    );

    expect(rankUnitTacticalActions(context(state, plan), 'archer')
      .some(candidate => candidate.action.kind === 'capture-city')).toBe(false);
  });

  it('makes unloading endangered cargo mandatory when a safe tile exists', () => {
    const state = makeState('explorer');
    const transport = addUnit(state, 'transport', 'transport', AI, { q: 1, r: 1 }, {
      cargoUnitIds: ['cargo'],
      health: 20,
    });
    addUnit(state, 'cargo', 'warrior', AI, transport.position, {
      transportId: transport.id,
    });
    const plan = makePlan(
      { kind: 'region', id: 'landing', anchor: { q: 3, r: 1 } },
      ['cargo'],
      { objective: 'expand', requiredRoles: { frontline: 1 } },
    );

    const ranked = rankUnitTacticalActions(context(state, plan), 'cargo');

    expect(ranked[0]?.action.kind).toBe('unload');
    expect(ranked[0]?.mandatory).toBe(true);
    expect(chooseUnitTacticalAction(context(state, plan), 'cargo'))
      .toEqual(ranked[0]?.action);
  });

  it('keeps Explorer seeded mistakes deterministic and within legal near-best actions', () => {
    const state = makeState('explorer');
    addUnit(state, 'attacker', 'swordsman', AI, { q: 1, r: 1 });
    addUnit(state, 'target-a', 'warrior', HUMAN, { q: 2, r: 1 }, { health: 90 });
    addUnit(state, 'target-b', 'warrior', HUMAN, { q: 1, r: 2 }, { health: 100 });
    const plan = makePlan(
      { kind: 'unit', id: 'target-a', lastKnownPosition: { q: 2, r: 1 } },
      ['attacker'],
      { objective: 'repel' },
    );
    const tactical = context(state, plan);
    const legalNearBest = rankUnitTacticalActions(tactical, 'attacker')
      .filter(candidate => candidate.action.kind === 'attack')
      .slice(0, 3)
      .map(candidate => candidate.id);

    const first = chooseUnitTacticalAction(tactical, 'attacker');
    const second = chooseUnitTacticalAction(tactical, 'attacker');
    const selected = rankUnitTacticalActions(tactical, 'attacker')
      .find(candidate => JSON.stringify(candidate.action) === JSON.stringify(first));

    expect(first).toEqual(second);
    expect(selected).toBeDefined();
    expect(legalNearBest).toContain(selected!.id);
  });

  it('moves as far as legal movement permits instead of advancing one hex', () => {
    const state = makeState('veteran');
    const mover = addUnit(state, 'mover', 'horseman', AI, { q: 0, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 6, r: 0 } },
      ['mover'],
      { objective: 'expand' },
    );

    const action = chooseUnitTacticalAction(context(state, plan), mover.id);

    expect(action).toMatchObject({ kind: 'move' });
    expect(action.kind === 'move' ? hexDistance(mover.position, action.destination) : 0)
      .toBe(UNIT_DEFINITIONS.horseman.movementPoints);
  });

  it('regenerates against predicted occupancy so two units do not claim one tile', () => {
    const state = makeState('veteran');
    addUnit(state, 'unit-a', 'warrior', AI, { q: 0, r: 0 });
    addUnit(state, 'unit-b', 'warrior', AI, { q: 0, r: 1 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 4, r: 0 } },
      ['unit-a', 'unit-b'],
      { objective: 'expand' },
    );

    const moves = chooseTacticalSequence(context(state, plan))
      .filter(action => action.kind === 'move');

    expect(new Set(moves.map(action => hexKey(action.destination))).size).toBe(moves.length);
  });

  it('predicts city founding so nearby settlers do not found illegal duplicate cities', () => {
    const state = makeState('veteran');
    addUnit(state, 'settler-a', 'settler', AI, { q: 0, r: 0 });
    addUnit(state, 'settler-b', 'settler', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: { q: 4, r: 0 } },
      ['settler-a', 'settler-b'],
      { objective: 'expand', requiredRoles: { settlement: 2 } },
    );

    const foundings = chooseTacticalSequence(context(state, plan))
      .filter(action => action.kind === 'found-city');

    expect(foundings).toHaveLength(1);
  });
});
