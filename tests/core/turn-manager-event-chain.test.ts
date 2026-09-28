import { describe, it, expect } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { EventBus } from '@/core/event-bus';
import { chooseEventChainOption } from '@/systems/event-chain-choices';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import type { GameState, HexCoord } from '@/core/types';

function findLandCoord(state: GameState): HexCoord {
  const tile = Object.values(state.map.tiles).find(t => t.terrain !== 'ocean' && t.terrain !== 'coast');
  if (!tile) throw new Error('No land tile found in test map');
  return tile.coord;
}

/** A fresh single-city game whose civ is already era-2-eligible and broke —
 * onset-eligible for financial-panic the very next scheduling pass, without
 * relying on organic multi-turn progression (same pragmatic seeding
 * `turn-manager-crisis.test.ts` already uses for crisis wiring tests). */
function eligibleGame(seed: string): { state: GameState; civId: string } {
  const state = createNewGame('rome', seed, 'small');
  const civId = state.currentPlayer;
  const city = foundCity(civId, findLandCoord(state), state.map, state.idCounters);
  city.id = 'capital';
  state.cities = { capital: city };
  state.civilizations[civId].cities = ['capital'];
  const era2Techs = getEraAdvancementTechs(2).map(t => t.id);
  state.civilizations[civId].techState.completed = era2Techs;
  state.civilizations[civId].gold = 1;
  return { state, civId };
}

describe('turn-manager event-chain wiring (#990)', () => {
  it('a real processTurn call schedules a financial-panic chain end to end', () => {
    const { state, civId } = eligibleGame('event-chain-turn-seed-1');
    const bus = new EventBus();

    const afterOneTurn = processTurn(state, bus);

    const chain = Object.values(afterOneTurn.activeEventChains ?? {}).find(c => c.targetCivId === civId);
    expect(chain).toBeDefined();
    expect(chain?.kind).toBe('financial-panic');
    expect(chain?.pendingChoice).toBeDefined();
  });

  it('a player choice, made through the real command, resolves after the delayed consequence turn via processTurn', () => {
    let { state, civId } = eligibleGame('event-chain-turn-seed-2');
    const bus = new EventBus();

    state = processTurn(state, bus);
    const chainId = Object.keys(state.activeEventChains ?? {})[0];
    expect(chainId).toBeDefined();

    const result = chooseEventChainOption(state, chainId, 'do-nothing', civId, bus);
    expect(result.success).toBe(true);
    if (!result.success) return;
    state = result.state;
    const consequenceTurn = state.activeEventChains![chainId].nextEvaluationTurn;

    while (state.turn < consequenceTurn) {
      state = processTurn(state, bus);
    }
    // One more processTurn tick actually evaluates the due stage (processTurn
    // ticks chains due as-of the state.turn it's given, then advances turn).
    state = processTurn(state, bus);

    expect(state.activeEventChains?.[chainId]).toBeUndefined();
  });

  it('determinism: same seed + same choice sequence produce an equivalent trajectory', () => {
    function run(seed: string): GameState {
      let { state, civId } = eligibleGame(seed);
      const bus = new EventBus();
      state = processTurn(state, bus);
      const chainId = Object.keys(state.activeEventChains ?? {})[0];
      const result = chooseEventChainOption(state, chainId, 'bailout', civId, bus);
      state = result.success ? result.state : state;
      for (let i = 0; i < 6; i++) state = processTurn(state, bus);
      return state;
    }

    const a = run('event-chain-determinism-seed');
    const b = run('event-chain-determinism-seed');
    assertSimulationEquivalent(a, b);
  });

  it('a different seed diverges', () => {
    function run(seed: string): GameState {
      let { state, civId } = eligibleGame(seed);
      const bus = new EventBus();
      state = processTurn(state, bus);
      const chainId = Object.keys(state.activeEventChains ?? {})[0];
      if (chainId) {
        const result = chooseEventChainOption(state, chainId, 'bailout', civId, bus);
        state = result.success ? result.state : state;
      }
      return state;
    }

    const a = run('event-chain-diverge-seed-a');
    const b = run('event-chain-diverge-seed-b');
    expect(a.gameId).not.toBe(b.gameId);
  });
});
