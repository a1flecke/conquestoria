import { describe, expect, it, vi } from 'vitest';
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
import * as combatSystem from '@/systems/combat-system';

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

describe('naval city bombardment', () => {
  it('offers a visible hostile city to an eligible warship without treating it as a capture', () => {
    const state = makeState();
    const ship = addUnit(state, 'ship', 'frigate', AI, { q: 2, r: 2 }, { movementPointsLeft: 3 });
    const city = addCity(state, 'target-city', HUMAN, { q: 3, r: 2 });
    const plan = makePlan({ kind: 'city', id: city.id, lastKnownPosition: city.position }, [ship.id]);

    expect(rankUnitTacticalActions({ state, actorId: AI, plan, assignedUnitIds: [ship.id] }, ship.id)
      .some(candidate => candidate.action.kind === 'bombard-city'
        && candidate.action.unitId === ship.id
        && candidate.action.cityId === city.id)).toBe(true);
  });
});

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
  it('uses the canonical pair seed for attack previews and simulations', () => {
    const state = makeState('veteran');
    const attacker = addUnit(state, 'attacker', 'warrior', AI, { q: 0, r: 0 });
    const defender = addUnit(state, 'defender', 'warrior', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: defender.id, lastKnownPosition: defender.position },
      [attacker.id],
      { objective: 'repel' },
    );
    const expectedSeed = combatSystem.deterministicCombatSeed(
      state.gameId,
      state.turn,
      attacker.id,
      defender.id,
    );
    const resolveCombatSpy = vi.spyOn(combatSystem, 'resolveCombat');

    try {
      const actions = chooseTacticalSequence(context(state, plan));
      const matchingSeeds = resolveCombatSpy.mock.calls.filter(
        ([seenAttacker, seenDefender, , seed]) => seenAttacker.id === attacker.id
          && seenDefender.id === defender.id
          && seed === expectedSeed,
      );

      expect(actions).toContainEqual({
        kind: 'attack', unitId: attacker.id, targetUnitId: defender.id,
      });
      expect(matchingSeeds.length).toBeGreaterThanOrEqual(2);
    } finally {
      resolveCombatSpy.mockRestore();
    }
  });

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

  it.each(['autonomous_frigate', 'exosuit_infantry'] satisfies UnitType[])('selects %s for a legal tactical attack', type => {
    const state = makeState('standard');
    const attacker = addUnit(state, 'attacker', type, AI, { q: 0, r: 0 });
    const defender = addUnit(state, 'defender', 'warrior', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: defender.id, lastKnownPosition: defender.position },
      [attacker.id],
      { objective: 'repel' },
    );

    expect(chooseUnitTacticalAction(context(state, plan), attacker.id))
      .toMatchObject({ kind: 'attack', unitId: attacker.id, targetUnitId: defender.id });
  });

  it('selects Combat Drone for a legal air strike from its air base', () => {
    const state = makeState('standard');
    const base = addCity(state, 'drone-base', AI, { q: 0, r: 0 });
    const drone = addUnit(state, 'drone', 'combat_drone', AI, { q: 0, r: 0 }, {
      airBase: { kind: 'city', cityId: base.id },
    });
    const defender = addUnit(state, 'defender', 'warrior', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: defender.id, lastKnownPosition: defender.position },
      [drone.id],
      { objective: 'repel' },
    );

    expect(chooseUnitTacticalAction(context(state, plan), drone.id))
      .toMatchObject({ kind: 'air-strike', unitId: drone.id, target: defender.position });
  });

  it('scores a revealed stealth bomber from its resolved evasion exchange, not raw counter-strength', () => {
    const state = makeState('veteran');
    const fighter = addUnit(state, 'fighter', 'jet_fighter', AI, { q: 0, r: 0 });
    const bomber = addUnit(state, 'bomber', 'stealth_bomber', HUMAN, { q: 1, r: 0 });
    const signalsHub = addCity(state, 'signals-hub', AI, { q: 0, r: 1 });
    signalsHub.buildings = ['signals_hub'];
    const plan = makePlan(
      { kind: 'unit', id: bomber.id, lastKnownPosition: bomber.position },
      [fighter.id],
      { objective: 'repel' },
    );

    const candidate = rankUnitTacticalActions(context(state, plan), fighter.id)
      .find(entry => entry.action.kind === 'attack' && entry.action.targetUnitId === bomber.id);
    const preview = combatSystem.resolveCombat(
      fighter,
      bomber,
      state.map,
      combatSystem.deterministicCombatSeed(state.gameId, state.turn, fighter.id, bomber.id),
      undefined,
      state.era,
    );
    const expectedDamageRatio = Math.min(2, preview.defenderDamage / bomber.health);
    const deathRisk = Math.min(2, preview.attackerDamage / fighter.health);

    expect(preview.exchange?.kind).toBe('evasion');
    expect(candidate?.score).toBeCloseTo(500 + 30 + expectedDamageRatio * 25 - deathRisk * 40, 5);
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

  // #845 regression: before the DEFAULT_ATTACK_PROFILE fix, this exact scenario silently
  // produced zero attack candidates for the Galley -- not because of tribute protection or any
  // other AI-specific gate, but because canAttackUnitDomain rejected ANY naval-vs-naval attack
  // for a unit lacking its own attackProfile. This is civ-vs-civ (not pirate-hunting, which
  // routes through a separate bespoke path and never hit the bug), so it proves the fix applies
  // to ordinary AI-vs-player and AI-vs-AI naval combat, not just the pirate special case.
  it('offers a Galley an attack against an adjacent hostile naval unit (civ-vs-civ, not pirates)', () => {
    const state = makeState('veteran');
    state.map.tiles['0,0'].terrain = 'ocean';
    state.map.tiles['1,0'].terrain = 'ocean';
    const warship = addUnit(state, 'warship', 'galley', AI, { q: 0, r: 0 });
    const enemyShip = addUnit(state, 'enemy-ship', 'trireme', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: enemyShip.id, lastKnownPosition: enemyShip.position },
      [warship.id],
      { objective: 'repel' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), warship.id);

    expect(actions).toContainEqual(expect.objectContaining({
      action: { kind: 'attack', unitId: 'warship', targetUnitId: 'enemy-ship' },
    }));
  });

  it('offers the same attack at a lower opponent-challenge (difficulty) setting too', () => {
    const state = makeState('standard');
    state.map.tiles['0,0'].terrain = 'ocean';
    state.map.tiles['1,0'].terrain = 'ocean';
    const warship = addUnit(state, 'warship', 'trireme', AI, { q: 0, r: 0 });
    const enemyShip = addUnit(state, 'enemy-ship', 'galley', HUMAN, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'unit', id: enemyShip.id, lastKnownPosition: enemyShip.position },
      [warship.id],
      { objective: 'repel' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), warship.id);

    expect(actions).toContainEqual(expect.objectContaining({
      action: { kind: 'attack', unitId: 'warship', targetUnitId: 'enemy-ship' },
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

  it('lets cargo choose a legal amphibious attack instead of unloading first', () => {
    const state = makeState('veteran');
    state.map.tiles['1,1'].terrain = 'coast';
    state.map.tiles['2,1'].terrain = 'plains';
    const transport = addUnit(state, 'transport', 'troop_transport', AI, { q: 1, r: 1 }, {
      cargoUnitIds: ['cargo'],
    });
    addUnit(state, 'cargo', 'marine', AI, transport.position, {
      transportId: transport.id,
      movementPointsLeft: 2,
      hasActed: false,
    });
    addUnit(state, 'target', 'warrior', HUMAN, { q: 2, r: 1 });
    const plan = makePlan(
      { kind: 'unit', id: 'target', lastKnownPosition: { q: 2, r: 1 } },
      ['cargo'],
      { objective: 'repel' },
    );

    expect(rankUnitTacticalActions(context(state, plan), 'cargo').some(candidate =>
      candidate.action.kind === 'embarked-attack'
      && candidate.action.targetUnitId === 'target')).toBe(true);
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

  // #843: getMovementRangeDetails no longer treats an undefended enemy city as a
  // walk-through tile -- this proves the AI's own move candidates never include a
  // destination on the far side of one, matching the fix in unit-system.ts. Before the
  // fix, an undefended city radiated no Zone of Control (unlike a hostile unit), so the
  // BFS walked straight through it; isForeignCityDestination only ever filtered the
  // city's own coordinate, never tiles beyond it, so this scenario was unprotected.
  it('does not path an AI unit through an undefended enemy city toward a target beyond it (#843)', () => {
    const state = makeState('veteran');
    // 3 movement points is exactly the cost of the straight line (0,0)->(1,0)->(2,0)->(3,0)
    // on uniform-cost grassland -- the ONLY length-3 path between those two hexes given this
    // codebase's 6 hex directions (any detour costs 4+), so this isolates "walked through the
    // city" from "took a legal detour around it" (the latter is fine and not what's under test).
    const mover = addUnit(state, 'mover', 'warrior', AI, { q: 0, r: 0 }, { movementPointsLeft: 3 });
    const city = addCity(state, 'undefended-city', HUMAN, { q: 2, r: 0 });
    const beyondCity = { q: 3, r: 0 };
    const plan = makePlan(
      { kind: 'region', id: 'far-front', anchor: beyondCity },
      [mover.id],
    );

    const moveDestinations = rankUnitTacticalActions(context(state, plan), mover.id)
      .filter(candidate => candidate.action.kind === 'move')
      .map(candidate => (candidate.action as { destination: HexCoord }).destination);

    expect(moveDestinations.some(destination => hexKey(destination) === hexKey(city.position))).toBe(false);
    expect(moveDestinations.some(destination => hexKey(destination) === hexKey(beyondCity))).toBe(false);
    // Sanity check the fixture is actually exercising movement at all.
    expect(moveDestinations.length).toBeGreaterThan(0);
  });

  // #845: before rankCampAssault existed, an AI unit adjacent to an undefended camp with a
  // camp-targeting plan had no action for it at all -- movementRange() (post-#843) correctly
  // stopped offering the camp's own tile as an ordinary move destination, but nothing offered
  // the dedicated assault instead, so the plan stalled indefinitely with the unit sitting idle
  // next to a camp it could never destroy without accidental combat against a garrison.
  it('offers an AI unit an assault-camp action against an adjacent undefended camp', () => {
    const state = makeState('veteran');
    const mover = addUnit(state, 'mover', 'warrior', AI, { q: 0, r: 0 }, { movementPointsLeft: 2 });
    state.barbarianCamps.camp = { id: 'camp', position: { q: 1, r: 0 }, strength: 4, spawnCooldown: 3 };
    const plan = makePlan(
      { kind: 'camp', id: 'camp', lastKnownPosition: { q: 1, r: 0 } },
      [mover.id],
      { objective: 'repel' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), mover.id);

    expect(actions).toContainEqual(expect.objectContaining({
      action: { kind: 'assault-camp', unitId: 'mover', campId: 'camp' },
    }));
  });

  it('pursues a visible ranged attacker before advancing toward an unrelated strategic target', () => {
    const state = makeState('standard');
    const melee = addUnit(state, 'melee', 'swordsman', AI, { q: 0, r: 0 }, { movementPointsLeft: 2 });
    addUnit(state, 'ranged-threat', 'archer', HUMAN, { q: 2, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'distant-front', anchor: { q: 0, r: 10 } },
      [melee.id],
      { objective: 'repel' },
    );

    expect(chooseUnitTacticalAction(context(state, plan), melee.id)).toEqual({
      kind: 'move', unitId: melee.id, destination: { q: 1, r: 0 },
    });
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

  it('scores a low-odds capture lower than a high-odds one for the same unit (#522)', () => {
    const weakState = makeState('veteran');
    addUnit(weakState, 'captor', 'warrior', AI, { q: 0, r: 0 });
    const weakCity = addCity(weakState, 'weak-target', HUMAN, { q: 1, r: 0 });
    weakCity.population = 1;
    weakCity.buildings = [];
    const weakPlan = makePlan({ kind: 'city', id: weakCity.id, lastKnownPosition: weakCity.position }, ['captor']);
    const weakScore = rankUnitTacticalActions(context(weakState, weakPlan), 'captor')
      .find(candidate => candidate.action.kind === 'capture-city')?.score;

    const strongState = makeState('veteran');
    addUnit(strongState, 'captor', 'warrior', AI, { q: 0, r: 0 });
    const strongCity = addCity(strongState, 'strong-target', HUMAN, { q: 1, r: 0 });
    strongCity.population = 40;
    strongCity.buildings = ['walls', 'star_fort'];
    const strongPlan = makePlan({ kind: 'city', id: strongCity.id, lastKnownPosition: strongCity.position }, ['captor']);
    const strongScore = rankUnitTacticalActions(context(strongState, strongPlan), 'captor')
      .find(candidate => candidate.action.kind === 'capture-city')?.score;

    expect(weakScore).toBeDefined();
    expect(strongScore).toBeDefined();
    expect(strongScore!).toBeLessThan(weakScore!);
  });

  it('still offers a low-odds capture as a candidate, never refuses outright (#522)', () => {
    const state = makeState('veteran');
    addUnit(state, 'captor', 'warrior', AI, { q: 0, r: 0 });
    const city = addCity(state, 'strong-target', HUMAN, { q: 1, r: 0 });
    city.population = 50;
    city.buildings = ['walls', 'star_fort'];
    const plan = makePlan({ kind: 'city', id: city.id, lastKnownPosition: city.position }, ['captor']);

    const candidates = rankUnitTacticalActions(context(state, plan), 'captor');

    expect(candidates.some(candidate => candidate.action.kind === 'capture-city')).toBe(true);
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

  it.each(['explorer', 'standard', 'veteran'] satisfies OpponentChallenge[])('escorts a threatened high-value formation with Mobile AA on %s', challenge => {
    const state = makeState(challenge);
    const mobileAa = addUnit(state, 'mobile-aa', 'mobile_aa', AI, { q: 0, r: 0 });
    const protectedUnit = addUnit(state, 'protected-tank', 'tank', AI, { q: 2, r: 0 });
    addUnit(state, 'visible-striker', 'biplane', HUMAN, { q: 4, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'front', anchor: protectedUnit.position },
      [mobileAa.id, protectedUnit.id],
      { objective: 'repel' },
    );

    const action = chooseUnitTacticalAction(context(state, plan), mobileAa.id);

    expect(action).toMatchObject({ kind: 'move', unitId: mobileAa.id });
    expect(action.kind === 'move' ? hexDistance(action.destination, protectedUnit.position) : Infinity)
      .toBeLessThanOrEqual(UNIT_DEFINITIONS.mobile_aa.airDefenseProvider!.radius);
  });

  it('ranks a move toward an unescorted transport near a remembered submarine sighting (#542)', () => {
    const state = makeState('veteran');
    for (let q = 0; q <= 4; q++) {
      const tile = state.map.tiles[hexKey({ q, r: 0 })];
      if (tile) tile.terrain = 'ocean';
    }
    const destroyer = addUnit(state, 'destroyer-1', 'destroyer', AI, { q: 0, r: 0 });
    const transport = addUnit(state, 'transport-1', 'transport', AI, { q: 3, r: 0 });
    const observed = { q: 4, r: 0 };
    state.civilizations[AI].visibility.tiles[hexKey(observed)] = 'fog';
    const tile = state.map.tiles[hexKey(observed)];
    state.civilizations[AI].visibility.lastSeen = {
      [hexKey(observed)]: {
        coord: { ...observed },
        terrain: tile.terrain,
        elevation: tile.elevation,
        resource: tile.resource,
        improvement: tile.improvement,
        improvementTurnsLeft: tile.improvementTurnsLeft,
        owner: tile.owner,
        hasRiver: tile.hasRiver,
        wonder: tile.wonder,
        observedTurn: state.turn,
        source: 'observed',
        units: [{ id: 'rival-sub', type: 'submarine', owner: HUMAN, healthBand: 'healthy' }],
      },
    };
    const plan = makePlan(
      { kind: 'region', id: 'front', anchor: destroyer.position },
      [destroyer.id],
      { objective: 'repel' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), destroyer.id);

    const moveTowardTransport = actions.find(candidate =>
      candidate.action.kind === 'move'
      && hexDistance(candidate.action.destination, transport.position)
        < hexDistance(destroyer.position, transport.position));
    expect(moveTowardTransport).toBeDefined();
  });

  it('does not rank an escort move when there is no remembered submarine sighting (#542)', () => {
    const state = makeState('veteran');
    for (let q = 0; q <= 4; q++) {
      const tile = state.map.tiles[hexKey({ q, r: 0 })];
      if (tile) tile.terrain = 'ocean';
    }
    const destroyer = addUnit(state, 'destroyer-1', 'destroyer', AI, { q: 0, r: 0 });
    addUnit(state, 'transport-1', 'transport', AI, { q: 3, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'front', anchor: destroyer.position },
      [destroyer.id],
      { objective: 'repel' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), destroyer.id);

    // Every move action present should be ordinary positioning, not an escort move
    // specifically scored above the baseline the plan's own rankMoves would produce.
    expect(actions.filter(candidate => candidate.action.kind === 'move' && candidate.score >= 400 * 0.3))
      .toEqual([]);
  });

  it('submarine positioning bonus rewards a destination outside every hostile detector range (#542)', () => {
    const state = makeState('standard');
    for (let q = 0; q <= 10; q++) {
      const tile = state.map.tiles[hexKey({ q, r: 0 })];
      if (tile) tile.terrain = 'ocean';
    }
    const sub = addUnit(state, 'sub-1', 'submarine', AI, { q: 0, r: 0 });
    // autonomous_frigate detection range 3, positioned so q=4 (distance 3) is revealed
    // and q=1 (distance 6) stays concealed -- both are outside the submarine's own
    // attack range (2) from the frigate, so scorePostMovePositioning contributes 0 to
    // both, isolating the stealth bonus as the only differentiator.
    addUnit(state, 'frigate-1', 'autonomous_frigate', HUMAN, { q: 7, r: 0 });
    const target = { q: 15, r: 0 };
    const plan = makePlan(
      { kind: 'region', id: 'front', anchor: target },
      [sub.id],
      { objective: 'expand' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), sub.id);
    const currentTargetDistance = hexDistance(sub.position, target);

    const q1 = actions.find(a => a.action.kind === 'move' && a.action.destination.q === 1 && a.action.destination.r === 0);
    expect(q1).toBeDefined();
    const q1Progress = currentTargetDistance - hexDistance({ q: 1, r: 0 }, target);
    expect(q1!.score).toBe(300 + q1Progress * 30 + 30); // concealed: +30 stealth bonus

    const q4 = actions.find(a => a.action.kind === 'move' && a.action.destination.q === 4 && a.action.destination.r === 0);
    expect(q4).toBeDefined();
    const q4Progress = currentTargetDistance - hexDistance({ q: 4, r: 0 }, target);
    expect(q4!.score).toBe(300 + q4Progress * 30); // revealed by the frigate: no stealth bonus
  });

  it('does not apply the stealth positioning bonus to non-submarine units', () => {
    const state = makeState('standard');
    for (let q = 0; q <= 10; q++) {
      const tile = state.map.tiles[hexKey({ q, r: 0 })];
      if (tile) tile.terrain = 'coast'; // galley cannot enter open ocean
    }
    const ship = addUnit(state, 'galley-1', 'galley', AI, { q: 0, r: 0 });
    const target = { q: 15, r: 0 };
    const plan = makePlan(
      { kind: 'region', id: 'front', anchor: target },
      [ship.id],
      { objective: 'expand' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), ship.id);
    const currentTargetDistance = hexDistance(ship.position, target);
    const q1 = actions.find(a => a.action.kind === 'move' && a.action.destination.q === 1 && a.action.destination.r === 0);
    expect(q1).toBeDefined();
    const q1Progress = currentTargetDistance - hexDistance({ q: 1, r: 0 }, target);
    expect(q1!.score).toBe(300 + q1Progress * 30); // no stealth bonus for a non-submarine
  });

  it('does not escort against a strike aircraft hidden by fog', () => {
    const state = makeState('standard');
    const mobileAa = addUnit(state, 'mobile-aa', 'mobile_aa', AI, { q: 0, r: 0 });
    const protectedUnit = addUnit(state, 'protected-tank', 'tank', AI, { q: 2, r: 0 });
    const hiddenAircraft = addUnit(state, 'hidden-striker', 'biplane', HUMAN, { q: 4, r: 0 });
    state.civilizations[AI].visibility.tiles[hexKey(hiddenAircraft.position)] = 'fog';
    const plan = makePlan(
      { kind: 'region', id: 'front', anchor: protectedUnit.position },
      [mobileAa.id, protectedUnit.id],
      { objective: 'repel' },
    );

    const actions = rankUnitTacticalActions(context(state, plan), mobileAa.id);

    expect(actions.some(candidate => candidate.action.kind === 'move'
      && candidate.score >= 550)).toBe(false);
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

describe('AI road-building', () => {
  it('offers the same legal Fort action to an AI worker through the canonical action list', () => {
    const state = makeState('veteran');
    state.civilizations[AI].techState.completed = ['fortresses'];
    addCity(state, 'capital', AI, { q: 0, r: 0 });
    state.map.tiles[hexKey({ q: 1, r: 0 })]!.owner = AI;
    const worker = addUnit(state, 'fort-worker', 'worker', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'frontier', anchor: worker.position },
      [worker.id],
      { objective: 'expand', requiredRoles: {} },
    );

    expect(rankUnitTacticalActions(context(state, plan), worker.id))
      .toContainEqual(expect.objectContaining({ action: { kind: 'worker-action', unitId: worker.id, action: 'fort' } }));
  });

  it.each(['explorer', 'standard', 'veteran'] as const)('moves an AI worker to the same visible threatened Fort frontier on %s', difficulty => {
    const state = makeState(difficulty);
    state.civilizations[AI].techState.completed = ['fortresses'];
    addCity(state, 'capital', AI, { q: 0, r: 0 });
    state.map.tiles[hexKey({ q: 2, r: 0 })]!.owner = AI;
    const worker = addUnit(state, 'fort-worker', 'worker', AI, { q: 1, r: 0 });
    addUnit(state, 'threat', 'warrior', HUMAN, { q: 3, r: 0 });
    const plan = makePlan({ kind: 'region', id: 'frontier', anchor: { q: 2, r: 0 } }, [worker.id], { objective: 'expand', requiredRoles: {} });

    expect(chooseUnitTacticalAction(context(state, plan), worker.id))
      .toMatchObject({ kind: 'move', unitId: worker.id, destination: { q: 2, r: 0 } });
  });

  it('queues build_road for an idle worker standing on the road-building target tile', () => {
    const state = makeState('veteran');
    state.civilizations[AI].techState.completed = ['road-building'];
    const capital = addCity(state, 'capital', AI, { q: 0, r: 0 });
    const outpost = addCity(state, 'outpost', AI, { q: 2, r: 0 });
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key].owner = AI;
    }
    const worker = addUnit(state, 'road-worker', 'worker', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'infra', anchor: capital.position },
      [worker.id],
      { objective: 'expand', requiredRoles: {} },
    );

    const action = chooseUnitTacticalAction(context(state, plan), worker.id);
    expect(action).toEqual({ kind: 'worker-action', unitId: worker.id, action: 'build_road' });
    expect(outpost.id).toBe('outpost'); // sanity: second city exists and is the disconnection target
  });

  it('does not queue a worker action after the worker has spent all movement', () => {
    const state = makeState('veteran');
    state.civilizations[AI].techState.completed = ['road-building'];
    const capital = addCity(state, 'capital', AI, { q: 0, r: 0 });
    addCity(state, 'outpost', AI, { q: 2, r: 0 });
    for (const tile of Object.values(state.map.tiles)) tile.owner = AI;
    const worker = addUnit(state, 'road-worker', 'worker', AI, { q: 1, r: 0 }, {
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: false,
    });
    const plan = makePlan(
      { kind: 'region', id: 'infra', anchor: capital.position },
      [worker.id],
      { objective: 'expand', requiredRoles: {} },
    );

    expect(chooseUnitTacticalAction(context(state, plan), worker.id)).toEqual({ kind: 'hold', unitId: worker.id });
  });

  it('moves the worker toward the road target when not yet standing on it', () => {
    const state = makeState('veteran');
    state.civilizations[AI].techState.completed = ['road-building'];
    addCity(state, 'capital', AI, { q: 0, r: 0 });
    addCity(state, 'outpost', AI, { q: 2, r: 0 });
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key].owner = AI;
    }
    const worker = addUnit(state, 'road-worker', 'worker', AI, { q: 0, r: 1 });
    const plan = makePlan(
      { kind: 'region', id: 'infra', anchor: { q: 0, r: 0 } },
      [worker.id],
      { objective: 'expand', requiredRoles: {} },
    );

    const action = chooseUnitTacticalAction(context(state, plan), worker.id);
    expect(action.kind).toBe('move');
  });

  it('does not queue road-building without the tech (negative)', () => {
    const state = makeState('veteran');
    addCity(state, 'capital', AI, { q: 0, r: 0 });
    addCity(state, 'outpost', AI, { q: 2, r: 0 });
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key].owner = AI;
    }
    const worker = addUnit(state, 'road-worker', 'worker', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'infra', anchor: { q: 0, r: 0 } },
      [worker.id],
      { objective: 'expand', requiredRoles: {} },
    );

    const action = chooseUnitTacticalAction(context(state, plan), worker.id);
    expect(action.kind === 'worker-action' ? action.action : null).not.toBe('build_road');
  });
});

describe('AI worker restore_land (MR2 catastrophe)', () => {
  it('does not propose restore_land once devastation has naturally expired (stale field must be turn-gated)', () => {
    const state = makeState('veteran');
    const capital = addCity(state, 'capital', AI, { q: 0, r: 0 });
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key].owner = AI;
      state.map.tiles[key].terrain = 'snow'; // no valid improvement on snow (see other tests)
    }
    state.turn = 45;
    state.map.tiles[hexKey({ q: 1, r: 0 })].devastatedUntilTurn = 45; // expired at the current turn
    const worker = addUnit(state, 'restore-worker', 'worker', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'infra', anchor: capital.position },
      [worker.id],
      { objective: 'expand', requiredRoles: {} },
    );

    const actions = rankUnitTacticalActions(context(state, plan), worker.id);
    expect(actions.some(a => a.action.kind === 'worker-action' && a.action.action === 'restore_land')).toBe(false);
  });

  it('does propose restore_land while a tile is still actively devastated', () => {
    const state = makeState('veteran');
    const capital = addCity(state, 'capital', AI, { q: 0, r: 0 });
    for (const key of Object.keys(state.map.tiles)) {
      state.map.tiles[key].owner = AI;
      state.map.tiles[key].terrain = 'snow';
    }
    state.turn = 40;
    state.map.tiles[hexKey({ q: 1, r: 0 })].devastatedUntilTurn = 45; // still active at turn 40
    const worker = addUnit(state, 'restore-worker', 'worker', AI, { q: 1, r: 0 });
    const plan = makePlan(
      { kind: 'region', id: 'infra', anchor: capital.position },
      [worker.id],
      { objective: 'expand', requiredRoles: {} },
    );

    const actions = rankUnitTacticalActions(context(state, plan), worker.id);
    expect(actions.some(a => a.action.kind === 'worker-action' && a.action.action === 'restore_land')).toBe(true);
  });
});
