import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { resolveHotSeatPostSimulation } from '@/core/hotseat-outcome';
import { processTurn } from '@/core/turn-manager';
import type { GameState } from '@/core/types';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { foundCity } from '@/systems/city-system';
import { acceptDiplomaticRequest, applyDiplomaticAction } from '@/systems/diplomacy-system';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { createUnit } from '@/systems/unit-lifecycle';
import { makeLivenessGame, withoutOwnedAssets } from '../systems/helpers/civilization-liveness-fixture';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';

/**
 * How a campaign ends TODAY (#1437), pinned at the round boundary. Everything here describes
 * current `main`; none of it is a statement about how outcomes ought to work. A test that has to
 * change means terminal behavior changed, which is a product decision, not a refactor.
 *
 * Owner / reader / writer table for the terminal fields
 * (`gameOver`, `winner`, `gameOverReason`, event `victory:resolved`):
 *
 *   concern                        owner (writes)                              readers
 *   -----------------------------  ------------------------------------------  ----------------------------------
 *   Domination eligibility         domination-rules + domination-sovereignty   victory-system, presentation DTOs
 *   Domination terminal write      victory-system.finalizeDominationVictory    turn-presentation, save-manager
 *   Independence blocker           victory-system.getDominationResolutionBlocker  finalizeDominationVictory only
 *   World-race winner (public)     world-race-system.processRace               victory-system, science presentation
 *   Science terminal write         victory-system.finalizeScienceVictory       turn-presentation, save-manager
 *   Order of the two               round-phases/finalization (Domination 1st)  --
 *   All humans eliminated (hot seat) hotseat-outcome.resolveHotSeatPostSimulation  victory-panel, domination-presentation
 *   Solo human eliminated          no dedicated writer: the survivor(s) resolve as Domination
 *   Viewer-specific rendering      domination-presentation / science-victory-presentation  victory panel
 */

interface Observed {
  name: string;
  payload: unknown;
}

function observe(bus: EventBus): Observed[] {
  const seen: Observed[] = [];
  bus.on('victory:resolved', payload => seen.push({ name: 'victory:resolved', payload }));
  bus.on('worldrace:completed', payload => seen.push({ name: 'worldrace:completed', payload }));
  bus.on('turn:start', payload => seen.push({ name: 'turn:start', payload }));
  return seen;
}

function victoryEvents(seen: Observed[]): Observed[] {
  return seen.filter(entry => entry.name === 'victory:resolved');
}

/** Solo fixture where the only rival has no city and no settler: `player` satisfies Domination. */
function dominationOnly(): GameState {
  return withoutOwnedAssets(makeLivenessGame(), 'ai-1');
}

/** Three-civ hot-seat fixture: `overlord` holds `vassal`, and `third` has been eliminated. */
function overlordWithVassal(): GameState {
  const bus = new EventBus();
  const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus).state;
  const accepted = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0]!.id, bus).state;
  return withoutOwnedAssets(accepted, 'third');
}

function withScienceWinner(state: GameState, winnerCivId: string): GameState {
  return {
    ...state,
    worldRaces: {
      ...state.worldRaces,
      'interstellar-colony': { kind: 'interstellar-colony', winnerCivId, completedTurn: state.turn },
    },
  };
}

/**
 * A petition the overlord (human, so nobody answers it inside the round) can still be holding at
 * finalization: the vassal is strong enough to petition (3 of the overlord's 4 combat units) and
 * its protection score is above the automatic-breakaway line, which would otherwise end the
 * vassalage in the vassalage tick before finalization ever looks.
 */
function withIndependencePetition(state: GameState): GameState {
  const next = structuredClone(state);
  const vassal = next.civilizations.vassal!;
  const anchor = next.units[vassal.units[0]!]!;
  for (let i = 0; i < 2; i += 1) {
    const unit = createUnit('warrior', 'vassal', { ...anchor.position }, next.idCounters);
    next.units[unit.id] = unit;
    vassal.units.push(unit.id);
  }
  next.pendingDiplomacyRequests = [{
    id: 'independence:vassal:overlord',
    type: 'independence',
    fromCivId: 'vassal',
    toCivId: 'overlord',
    turnIssued: next.turn,
  }];
  return next;
}

function reload(state: GameState): GameState {
  const parsed = parseSaveFile(serializeSaveFile(state));
  if (parsed.status !== 'success') throw new Error(parsed.message);
  return normalizeLoadedState(parsed.state);
}

function ensureCity(state: GameState, civId: string): string {
  const civ = state.civilizations[civId]!;
  if (civ.cities[0]) return civ.cities[0];
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  const city = foundCity(civId, settler.position, state.map, state.idCounters);
  state.cities[city.id] = city;
  civ.cities.push(city.id);
  return city.id;
}

describe('campaign ending: which outcome a completed round produces (#1437)', () => {
  it('Domination alone ends the campaign once, with the advanced turn in the event', () => {
    const state = dominationOnly();
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(state, bus);

    expect(result).toMatchObject({ gameOver: true, winner: 'player', gameOverReason: 'domination' });
    expect(victoryEvents(events)).toEqual([
      { name: 'victory:resolved', payload: { winnerId: 'player', reason: 'domination', turn: state.turn + 1 } },
    ]);
  });

  it('a recorded Science winner alone ends the campaign as Science', () => {
    const state = withScienceWinner(makeLivenessGame(), 'player');
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(state, bus);

    expect(result).toMatchObject({ gameOver: true, winner: 'player', gameOverReason: 'science' });
    expect(victoryEvents(events)).toEqual([
      { name: 'victory:resolved', payload: { winnerId: 'player', reason: 'science', turn: state.turn + 1 } },
    ]);
  });

  it('with neither condition the round only advances the turn', () => {
    const state = makeLivenessGame();
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(state, bus);

    expect(result.gameOver).toBe(false);
    expect(result.winner).toBeNull();
    expect(result.turn).toBe(state.turn + 1);
    expect(victoryEvents(events)).toEqual([]);
  });

  it('when both are eligible in the same round, Domination wins and the Science winner is not announced as victor', () => {
    // Current precedence: finalizeDominationVictory runs before finalizeScienceVictory, and the
    // second is a no-op once gameOver is set. The vassal's race win stays on record in worldRaces.
    const state = withScienceWinner(overlordWithVassal(), 'vassal');
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(state, bus);

    expect(result).toMatchObject({ gameOver: true, winner: 'overlord', gameOverReason: 'domination' });
    expect(victoryEvents(events)).toHaveLength(1);
    expect(result.worldRaces?.['interstellar-colony']?.winnerCivId).toBe('vassal');
  });

  it('a live independence petition holds Domination back for the round', () => {
    const state = withIndependencePetition(overlordWithVassal());
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(state, bus);

    expect(result.gameOver).toBe(false);
    expect(victoryEvents(events)).toEqual([]);
  });

  it('while Domination is blocked, a Science winner still ends the campaign', () => {
    const state = withScienceWinner(withIndependencePetition(overlordWithVassal()), 'vassal');
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(state, bus);

    expect(result).toMatchObject({ gameOver: true, winner: 'vassal', gameOverReason: 'science' });
    expect(victoryEvents(events)).toHaveLength(1);
  });

  it('a petition from a civ that is not a credited direct vassal does not block Domination', () => {
    const state = withIndependencePetition(overlordWithVassal());
    state.pendingDiplomacyRequests = [{ ...state.pendingDiplomacyRequests![0]!, fromCivId: 'third', id: 'independence:third:overlord' }];
    const result = processTurn(state, new EventBus());

    expect(result).toMatchObject({ gameOver: true, winner: 'overlord', gameOverReason: 'domination' });
  });

  it('a petition the vassal cannot currently make does not block Domination', () => {
    // Same request, but the vassal is too weak to petition (1 of 4 combat units), so it is inert.
    const state = overlordWithVassal();
    state.pendingDiplomacyRequests = withIndependencePetition(state).pendingDiplomacyRequests;
    const result = processTurn(state, new EventBus());

    expect(result).toMatchObject({ gameOver: true, winner: 'overlord', gameOverReason: 'domination' });
  });

  it('a campaign that is already over is never resolved again and publishes nothing', () => {
    const over = { ...withScienceWinner(overlordWithVassal(), 'vassal'), gameOver: true, winner: 'third', gameOverReason: 'science' as const };
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(over, bus);

    expect(result).toMatchObject({ gameOver: true, winner: 'third', gameOverReason: 'science' });
    expect(victoryEvents(events)).toEqual([]);
    // The round itself still completes: the turn counter and turn:start are not gated on gameOver.
    expect(result.turn).toBe(over.turn + 1);
  });
});

describe('campaign ending: when the race result and the terminal result are published (#1437)', () => {
  it('announces the race win in the round it is built, then the victory with the advanced turn, then the new turn', () => {
    const state = createNewGame('rome', 'campaign-ending-timing');
    const cityId = ensureCity(state, 'player');
    state.civilizations.player!.techState.completed = ['mars-mission-architecture'];
    state.cities[cityId]!.buildings = [...state.cities[cityId]!.buildings, 'interstellar_launch_program'];
    state.builtNationalProjects = { 'player:interstellar_launch_program': { civId: 'player', cityId, eraBuilt: 13 } };
    const bus = new EventBus();
    const events = observe(bus);
    const result = processTurn(state, bus);

    expect(events.map(entry => entry.name)).toEqual(['worldrace:completed', 'victory:resolved', 'turn:start']);
    expect(events[0]!.payload).toMatchObject({ kind: 'interstellar-colony', winnerCivId: 'player', turn: state.turn });
    expect(events[1]!.payload).toEqual({ winnerId: 'player', reason: 'science', turn: state.turn + 1 });
    expect(events[2]!.payload).toMatchObject({ turn: state.turn + 1 });
    expect(result.worldRaces?.['interstellar-colony']?.completedTurn).toBe(state.turn);
  });
});

describe('campaign ending: save and reload around the terminal round (#1437)', () => {
  it('a save taken the round before Domination resolves reaches the identical outcome', () => {
    const base = normalizeLoadedState(dominationOnly());
    const live = processTurn(structuredClone(base), new EventBus());
    const reloaded = processTurn(reload(structuredClone(base)), new EventBus());

    expect(live.gameOver).toBe(true);
    assertSimulationEquivalent(live, reloaded, 'Domination: live vs reload before the terminal round');
  });

  it('a terminal Domination state survives a reload unchanged and does not re-resolve', () => {
    const terminal = processTurn(dominationOnly(), new EventBus());
    const loaded = reload(terminal);

    expect(loaded).toMatchObject({ gameOver: true, winner: 'player', gameOverReason: 'domination' });
    const bus = new EventBus();
    const events = observe(bus);
    const continued = processTurn(loaded, bus);
    expect(victoryEvents(events)).toEqual([]);
    assertSimulationEquivalent(processTurn(terminal, new EventBus()), continued, 'Domination: live vs reload after the terminal round');
  });

  it('a save taken while Domination is blocked still resolves on the same round after reload', () => {
    const base = normalizeLoadedState(withIndependencePetition(overlordWithVassal()));
    const live = processTurn(structuredClone(base), new EventBus());
    const reloaded = processTurn(reload(structuredClone(base)), new EventBus());

    assertSimulationEquivalent(live, reloaded, 'blocked Domination: live vs reload');
  });
});

describe('campaign ending: the all-humans-eliminated path and solo elimination (#1437)', () => {
  function twoHumans(): GameState {
    const state = makeVassalageFixture();
    state.hotSeat = { ...state.hotSeat!, players: state.hotSeat!.players.filter(player => player.slotId !== 'third') };
    return state;
  }

  it('writes a winnerless defeat only when no human seat remains', () => {
    const state = twoHumans();
    state.civilizations.vassal!.isEliminated = true;
    state.civilizations.overlord!.isEliminated = true;
    const result = resolveHotSeatPostSimulation(state, 'overlord');

    expect(result.state).toMatchObject({ gameOver: true, winner: null, gameOverReason: 'all-humans-eliminated' });
  });

  it('never overwrites a Science result that was already resolved', () => {
    const state = twoHumans();
    state.civilizations.vassal!.isEliminated = true;
    state.civilizations.overlord!.isEliminated = true;
    state.gameOver = true;
    state.winner = 'third';
    state.gameOverReason = 'science';
    const result = resolveHotSeatPostSimulation(state, 'overlord');

    expect(result.state).toMatchObject({ gameOver: true, winner: 'third', gameOverReason: 'science' });
  });

  it('does not end a solo campaign when the only human is eliminated: the survivor resolves it as Domination', () => {
    // A solo game has no hot-seat roster, so the all-humans path cannot fire; the AI that is left
    // as the last independent empire wins through the ordinary Domination rule.
    const state = withoutOwnedAssets(makeLivenessGame(), 'player');
    const afterHotSeatCheck = resolveHotSeatPostSimulation(state, 'player');
    expect(afterHotSeatCheck.state.gameOver).toBe(false);

    const result = processTurn(state, new EventBus());
    expect(result).toMatchObject({ gameOver: true, winner: 'ai-1', gameOverReason: 'domination' });
  });
});
