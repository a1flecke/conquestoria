import { describe, it, expect } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { chooseEventChainOption } from '@/systems/event-chain-choices';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import type { GameState, HexCoord } from '@/core/types';

function findLandCoord(state: GameState): HexCoord {
  const tile = Object.values(state.map.tiles).find(t => t.terrain !== 'ocean' && t.terrain !== 'coast');
  if (!tile) throw new Error('No land tile found in test map');
  return tile.coord;
}

function eligibleGame(seed: string): { state: GameState; civId: string } {
  const state = createNewGame('rome', seed, 'small');
  const civId = state.currentPlayer;
  const city = foundCity(civId, findLandCoord(state), state.map, state.idCounters);
  city.id = 'capital';
  state.cities = { capital: city };
  state.civilizations[civId].cities = ['capital'];
  state.civilizations[civId].techState.completed = getEraAdvancementTechs(2).map(t => t.id);
  state.civilizations[civId].gold = 1;
  return { state, civId };
}

function roundTrip(state: GameState): GameState {
  return normalizeLoadedStateForTest(JSON.parse(JSON.stringify(state)) as GameState) as unknown as GameState;
}

describe('event-chain save/reload continuity (#990)', () => {
  it('a save mid-pending-choice reloads with the identical chain (no duplicate stage execution)', () => {
    let { state } = eligibleGame('event-chain-save-seed-1');
    const bus = new EventBus();
    state = processTurn(state, bus);
    const chainId = Object.keys(state.activeEventChains ?? {})[0];
    expect(chainId).toBeDefined();

    const reloaded = roundTrip(state);

    expect(reloaded.activeEventChains?.[chainId]).toEqual(state.activeEventChains![chainId]);
  });

  it('an old save with no activeEventChains key at all loads cleanly with no fabricated history', () => {
    const { state: base } = eligibleGame('event-chain-save-seed-2');
    const { activeEventChains: _omit, ...preFeatureShape } = base;

    const reloaded = roundTrip(preFeatureShape as GameState);

    expect(reloaded.activeEventChains ?? {}).toEqual({});
  });

  it('save → reload → continue matches an uninterrupted run to the same point (Deterministic Simulation Contract clause 2)', () => {
    function driveToResolution(state: GameState, civId: string, bus: EventBus): GameState {
      let s = state;
      const chainId = Object.keys(s.activeEventChains ?? {})[0]!;
      const result = chooseEventChainOption(s, chainId, 'do-nothing', civId, bus);
      s = result.success ? result.state : s;
      const consequenceTurn = s.activeEventChains![chainId].nextEvaluationTurn;
      while (s.turn <= consequenceTurn) s = processTurn(s, bus);
      return s;
    }

    const { state: seed, civId } = eligibleGame('event-chain-save-seed-3');
    const bus = new EventBus();
    const afterOnset = processTurn(seed, bus);

    // Uninterrupted control.
    const control = driveToResolution(structuredClone(afterOnset), civId, new EventBus());

    // Save immediately after onset, reload, then continue the same choice sequence.
    const reloaded = roundTrip(afterOnset);
    const resumed = driveToResolution(reloaded, civId, new EventBus());

    assertSimulationEquivalent(control, resumed);
  });
});
