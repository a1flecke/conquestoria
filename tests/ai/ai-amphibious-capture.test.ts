import { describe, expect, it } from 'vitest';
import { processMajorCivStrategicTurn } from '@/ai/ai-major-turn';
import { buildMajorCivPerception } from '@/ai/ai-perception';
import type { PreparedMajorCivPlan } from '@/ai/ai-prepared-turn';
import { rankUnitTacticalActions, type AITacticalAction } from '@/ai/ai-tactics';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { createEmptyMajorCivPlanPortfolio } from '@/core/opponent-ai-state';
import type { AIStrategicPlan, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { declareMajorWar } from '@/systems/diplomacy-war';
import { hexKey } from '@/systems/hex-utils';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { loadUnitOntoTransport, syncTransportCargoPositions } from '@/systems/transport-system';
import { createUnit, resetUnitTurn } from '@/systems/unit-lifecycle';
import { normalizeLoadedState } from '@/storage/save-manager';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { assertAirBaseIntegrity, assertBilateralWar, assertCargoReciprocity } from '../helpers/save-state-invariants';

/**
 * #1434 -- an AI force that has to cross water must finish the job. Every scenario drives
 * `processMajorCivStrategicTurn` turn after turn (with the canonical `resetUnitTurn` between
 * calls) exactly as the issue's reproduction does, so a regression in ranking, execution or
 * plan bookkeeping shows up as a stuck or oscillating force, not as an isolated score.
 *
 * Geometry (small non-wrapped map, everything else coast): origin (0,0), enemy city (5,0),
 * the human's second city (0,4) so the war outlives the capture, and -- when `landing` --
 * the only landing tile (4,1), which is adjacent to the city.
 */
const AI = 'ai-1';
const HUMAN = 'player';
const CITY = 'enemy-city';

interface Options {
  landing?: boolean;
  garrison?: boolean;
  noShip?: boolean;
  peace?: boolean;
  /** A tile the ship can reach with no land route to the city. */
  strandedLanding?: boolean;
}

function makeState(options: Options): GameState {
  const state = createNewGame({
    civType: 'egypt', mapSize: 'small', opponentCount: 1,
    gameTitle: 'Amphibious', seed: 'major-turn', opponentChallenge: 'veteran',
  });
  state.turn = 21;
  state.units = {};
  state.cities = {};
  state.barbarianCamps = {};
  state.map.wrapsHorizontally = false;
  const land = new Set(['0,0', '5,0', '0,4']);
  if (options.landing) land.add('4,1');
  if (options.strandedLanding) land.add('2,1');
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    tile.terrain = land.has(key) ? 'grassland' : 'coast';
    tile.elevation = 'lowland';
    tile.owner = null;
    tile.resource = null;
    tile.improvement = 'none';
    tile.improvementTurnsLeft = 0;
  }
  for (const civ of Object.values(state.civilizations)) { civ.units = []; civ.cities = []; }
  state.civilizations[AI].visibility.tiles = Object.fromEntries(
    Object.keys(state.map.tiles).map(key => [key, 'visible' as const]));
  return state;
}

function addUnit(state: GameState, id: string, type: UnitType, owner: string, position: HexCoord, o: Partial<Unit> = {}): Unit {
  const unit = { ...createUnit(type, owner, position, state.idCounters), id, ...o };
  state.units[id] = unit;
  state.civilizations[owner]?.units.push(id);
  return unit;
}

function addCity(state: GameState, id: string, owner: string, position: HexCoord) {
  const city = foundCity(owner, position, state.map, state.idCounters);
  city.id = id;
  state.cities[id] = city;
  state.civilizations[owner]?.cities.push(id);
  state.map.tiles[hexKey(position)].owner = owner;
  return city;
}

function prepared(state: GameState, plan: AIStrategicPlan): PreparedMajorCivPlan {
  const portfolio = { ...createEmptyMajorCivPlanPortfolio(), primaryPlan: plan, lastPlannedTurn: state.turn };
  return {
    civId: AI, perception: buildMajorCivPerception(state, AI), portfolio,
    assignments: { portfolio, assignmentsByPlanId: { [plan.id]: [...plan.assignedUnitIds] }, recoveryUnitIds: [], forceDemands: [], rejectedByUnitId: {} },
    forceDemands: [], traces: [],
    nationalIntent: { current: 'develop', previous: null, selectedTurn: 0, reconsiderAfterTurn: 0, shockActive: false, shockFreeStreak: 0, reasonCodes: [] },
  };
}

function fixture(options: Options): { state: GameState; plan: AIStrategicPlan } {
  let state = makeState(options);
  addUnit(state, 'captor', 'swordsman', AI, { q: 0, r: 0 });
  if (!options.noShip) addUnit(state, 'ship', 'transport', AI, { q: 1, r: 0 });
  // The AI holds no city, so a parked settler keeps it alive for the war transition (liveness).
  addUnit(state, 'ai-survival-settler', 'settler', AI, { q: 0, r: 0 }, { movementPointsLeft: 0, hasActed: true });
  const city = addCity(state, CITY, HUMAN, { q: 5, r: 0 });
  addCity(state, 'human-home', HUMAN, { q: 0, r: 4 });
  if (options.garrison) addUnit(state, 'garrison', 'warrior', HUMAN, city.position);
  const plan: AIStrategicPlan = {
    id: 'major-plan', actorId: AI, objective: 'capture',
    target: { kind: 'city', id: city.id, lastKnownPosition: city.position },
    theaterId: 'local:test', phase: 'advancing', reasonCodes: ['continue-active-war'],
    commitment: 0.7, createdTurn: 18, reconsiderAfterTurn: 22, expiresAfterTurn: 80,
    lastProgressTurn: 19, requiredRoles: { capture: 1, transport: 1 },
    assignedUnitIds: options.noShip ? ['captor'] : ['captor', 'ship'],
  };
  // Liveness is checked by the war transition, so the war is declared once both sides hold assets.
  if (!options.peace) state = declareMajorWar(state, AI, HUMAN);
  state = refreshLastSeenPresentationsForCiv(state, AI);
  return { state, plan };
}

interface Round {
  turn: number;
  actions: AITacticalAction[];
  captured: number;
  lastProgressTurn: number | undefined;
}

function nextTurn(state: GameState): GameState {
  return {
    ...state, turn: state.turn + 1,
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [id, resetUnitTurn(unit)])),
  };
}

function runOperation(start: { state: GameState; plan: AIStrategicPlan }, turns: number, reloadAfter?: number) {
  let { state, plan } = start;
  const rounds: Round[] = [];
  for (let i = 0; i < turns; i += 1) {
    const bus = new EventBus();
    let captured = 0;
    bus.on('city:captured', () => { captured += 1; });
    const result = processMajorCivStrategicTurn(state, prepared(state, plan), bus);
    rounds.push({
      turn: state.turn,
      actions: result.actions,
      captured,
      lastProgressTurn: result.state.opponentAI?.majorCivs[AI]?.primaryPlan?.lastProgressTurn,
    });
    state = nextTurn(result.state);
    if (reloadAfter === i) {
      const parsed = parseSaveFile(serializeSaveFile(state));
      if (parsed.status !== 'success') throw new Error(parsed.message);
      state = normalizeLoadedState(parsed.state);
    }
    plan = state.opponentAI?.majorCivs[AI]?.primaryPlan ?? plan;
    assertBilateralWar(state);
    assertCargoReciprocity(state);
    assertAirBaseIntegrity(state);
  }
  return { state, rounds };
}

/** Places the loaded hull (and its cargo) on `to`, as a completed sail would. */
function moveTransport(state: GameState, shipId: string, to: HexCoord): GameState {
  const moved = { ...state, units: { ...state.units, [shipId]: { ...state.units[shipId]!, position: { ...to } } } };
  return syncTransportCargoPositions(moved, shipId);
}

const kinds = (rounds: Round[]) => rounds.flatMap(round => round.actions.map(action => action.kind));

describe('#1434 amphibious city capture', () => {
  it('loads, sails, lands, and takes the city once without ever re-boarding', () => {
    const { state, rounds } = runOperation(fixture({ landing: true }), 12);
    expect(state.cities[CITY]!.owner).toBe(AI);
    expect(rounds.reduce((sum, round) => sum + round.captured, 0)).toBe(1);
    // Boarding happens exactly once, on the first turn; the landed force walks the rest.
    expect(rounds[0]!.actions.map(action => action.kind)).toContain('load');
    expect(kinds(rounds.slice(1))).not.toContain('load');
    expect(state.civilizations[AI].cities).toContain(CITY);
    expect(state.civilizations[HUMAN].cities).not.toContain(CITY);
    // Bilateral war survives the capture (the human still holds a city), and the history recorded it once.
    expect(state.civilizations[AI].diplomacy.atWarWith).toContain(HUMAN);
    const events = Object.values(state.wars ?? {}).flatMap(record => record.events);
    expect(events.filter(event => event.type === 'city-captured' && event.cityId === CITY)).toHaveLength(1);
  });

  it('takes a coastal city straight from the ship when there is nowhere to land', () => {
    const { state, rounds } = runOperation(fixture({}), 8);
    expect(state.cities[CITY]!.owner).toBe(AI);
    expect(rounds.reduce((sum, round) => sum + round.captured, 0)).toBe(1);
    expect(kinds(rounds)).toContain('capture-city');
    // After the assault the unit is a land unit in the city, not cargo of the ship.
    expect(state.units.captor!.transportId).toBeUndefined();
    expect(state.units.ship!.cargoUnitIds ?? []).not.toContain('captor');
    expect(state.units.captor!.position).toEqual(state.cities[CITY]!.position);
  });

  it('clears a garrison from the ship, then takes the city once', () => {
    const { state, rounds } = runOperation(fixture({ garrison: true }), 8);
    // The defender is struck from the boat before the city can be taken -- never the other way round.
    const order = kinds(rounds).filter(kind => kind === 'embarked-attack' || kind === 'capture-city');
    expect(order[0]).toBe('embarked-attack');
    expect(state.units.garrison).toBeUndefined();
    expect(state.cities[CITY]!.owner).toBe(AI);
    expect(rounds.reduce((sum, round) => sum + round.captured, 0)).toBe(1);
    expect(kinds(rounds.slice(1))).not.toContain('load');
  });

  it('never cycles between unloading and reloading on a landing with no route to the city', () => {
    const { rounds } = runOperation(fixture({ strandedLanding: true }), 10);
    expect(kinds(rounds.slice(1))).not.toContain('load');
    expect(kinds(rounds)).not.toContain('unload');
  });

  it('neither loads nor captures when no ship exists', () => {
    const { state, rounds } = runOperation(fixture({ noShip: true }), 5);
    expect(kinds(rounds)).not.toContain('load');
    expect(kinds(rounds)).not.toContain('capture-city');
    expect(state.cities[CITY]!.owner).toBe(HUMAN);
  });

  it('offers no assault on a city the civ cannot currently see', () => {
    const { state, plan } = fixture({});
    const boarded = loadUnitOntoTransport(state, 'captor', 'ship');
    if (!boarded.ok) throw new Error('fixture could not board the cargo');
    // Boarding spends the cargo's action; a fresh turn gives it back, as the real round does.
    const adjacent = nextTurn(moveTransport(boarded.state, 'ship', { q: 4, r: 0 }));
    const context = { state: adjacent, actorId: AI, plan, assignedUnitIds: ['captor', 'ship'], allowOffensiveActions: true };
    expect(rankUnitTacticalActions(context, 'captor').map(ranked => ranked.action.kind)).toContain('capture-city');
    adjacent.civilizations[AI].visibility.tiles['5,0'] = 'fog';
    expect(rankUnitTacticalActions(context, 'captor').map(ranked => ranked.action.kind)).not.toContain('capture-city');
  });

  it('does not capture across a peace', () => {
    const { state, rounds } = runOperation(fixture({ peace: true }), 4);
    expect(kinds(rounds)).not.toContain('capture-city');
    expect(state.cities[CITY]!.owner).toBe(HUMAN);
  });

  it('is deterministic and unchanged by a save/reload mid-voyage', () => {
    const base = fixture({ landing: true });
    base.state = normalizeLoadedState(base.state);
    const straight = runOperation(structuredClone(base), 8);
    const repeated = runOperation(structuredClone(base), 8);
    const reloaded = runOperation(structuredClone(base), 8, 0);
    expect(repeated.rounds.map(round => round.actions)).toEqual(straight.rounds.map(round => round.actions));
    expect(reloaded.rounds.map(round => round.actions)).toEqual(straight.rounds.map(round => round.actions));
    assertSimulationEquivalent(straight.state, repeated.state, 'repeat');
    assertSimulationEquivalent(straight.state, reloaded.state, 'save/reload');
  });
});
