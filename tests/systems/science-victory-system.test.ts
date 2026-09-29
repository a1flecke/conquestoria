import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { finalizeScienceVictory } from '@/systems/victory-system';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { foundCity } from '@/systems/city-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 500,
    era: 13,
    currentPlayer: 'p1',
    civilizations: { p1: { id: 'p1' } as never, p2: { id: 'p2' } as never },
    gameOver: false,
    winner: null,
    ...overrides,
  } as unknown as GameState;
}

describe('finalizeScienceVictory (#986)', () => {
  it('does nothing when no world race has a recorded winner', () => {
    const state = makeState();
    const result = finalizeScienceVictory(state, new EventBus());
    expect(result).toBe(state);
    expect(result.gameOver).toBe(false);
  });

  it('does nothing for a race with no endsGameAs (first-satellite winning does not end the game)', () => {
    const state = makeState({
      worldRaces: { 'first-satellite': { kind: 'first-satellite', winnerCivId: 'p1', completedTurn: 500 } },
    });
    const result = finalizeScienceVictory(state, new EventBus());
    expect(result).toBe(state);
    expect(result.gameOver).toBe(false);
  });

  it('sets gameOver/winner/gameOverReason when interstellar-colony has a winner', () => {
    const state = makeState({
      worldRaces: { 'interstellar-colony': { kind: 'interstellar-colony', winnerCivId: 'p2', completedTurn: 500 } },
    });
    const events: Array<{ winnerId: string; reason: string; turn: number }> = [];
    const bus = new EventBus();
    bus.on('victory:resolved', event => events.push(event));

    const result = finalizeScienceVictory(state, bus);

    expect(result.gameOver).toBe(true);
    expect(result.winner).toBe('p2');
    expect(result.gameOverReason).toBe('science');
    expect(events).toEqual([{ winnerId: 'p2', reason: 'science', turn: 500 }]);
  });

  it('is a no-op once the game is already over (never overwrites an existing outcome)', () => {
    const state = makeState({
      gameOver: true,
      winner: 'p1',
      gameOverReason: 'domination',
      worldRaces: { 'interstellar-colony': { kind: 'interstellar-colony', winnerCivId: 'p2', completedTurn: 500 } },
    });
    const result = finalizeScienceVictory(state, new EventBus());
    expect(result).toBe(state);
    expect(result.winner).toBe('p1');
    expect(result.gameOverReason).toBe('domination');
  });

  it('both races can coexist: first-satellite winning does not block interstellar-colony from later ending the game', () => {
    const state = makeState({
      worldRaces: {
        'first-satellite': { kind: 'first-satellite', winnerCivId: 'p1', completedTurn: 100 },
        'interstellar-colony': { kind: 'interstellar-colony', winnerCivId: 'p2', completedTurn: 500 },
      },
    });
    const result = finalizeScienceVictory(state, new EventBus());
    expect(result.gameOver).toBe(true);
    expect(result.winner).toBe('p2');
    expect(result.gameOverReason).toBe('science');
  });
});

function ensureCity(state: GameState, civId: string): string {
  const civ = state.civilizations[civId]!;
  const existing = civ.cities[0];
  if (existing) return existing;
  const settler = civ.units.map(id => state.units[id]).find(unit => unit?.type === 'settler')!;
  const city = foundCity(civId, settler.position, state.map, state.idCounters);
  state.cities[city.id] = city;
  civ.cities.push(city.id);
  return city.id;
}

describe('end-to-end: completing Interstellar Launch Program through processTurn ends the campaign (#986)', () => {
  it('sets gameOver/winner/gameOverReason once a civ completes the launch building', () => {
    const state = createNewGame('rome', 'science-victory-e2e');
    const winnerId = 'player';
    const cityId = ensureCity(state, winnerId);
    state.civilizations[winnerId]!.techState.completed = ['mars-mission-architecture'];
    state.cities[cityId]!.buildings = [...state.cities[cityId]!.buildings, 'interstellar_launch_program'];
    state.builtNationalProjects = {
      [`${winnerId}:interstellar_launch_program`]: { civId: winnerId, cityId, eraBuilt: 13 },
    };

    const result = processTurn(state, new EventBus());

    expect(result.worldRaces?.['interstellar-colony']?.winnerCivId).toBe(winnerId);
    expect(result.gameOver).toBe(true);
    expect(result.winner).toBe(winnerId);
    expect(result.gameOverReason).toBe('science');
  });

  it('does not end the game while the launch is merely queued, not completed', () => {
    const state = createNewGame('rome', 'science-victory-e2e-in-progress');
    const cityId = ensureCity(state, 'player');
    state.civilizations.player!.techState.completed = ['mars-mission-architecture'];
    state.cities[cityId]!.productionQueue = ['interstellar_launch_program'];
    state.cities[cityId]!.productionProgress = 50;

    const result = processTurn(state, new EventBus());

    expect(result.gameOver).toBe(false);
  });
});
