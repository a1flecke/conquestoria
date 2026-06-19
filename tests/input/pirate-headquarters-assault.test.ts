import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import {
  confirmPirateHeadquartersAssault,
  preparePirateHeadquartersAssault,
} from '@/input/pirate-headquarters-assault';

function fixture(): GameState {
  const state = createNewGame(undefined, 'pirate-assault-input', 'small');
  state.map = {
    width: 10, height: 10, wrapsHorizontally: false, rivers: [],
    tiles: {
      '5,5': { coord: { q: 5, r: 5 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
      '5,4': { coord: { q: 5, r: 4 }, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
    },
  };
  state.units = {
    attacker: {
      id: 'attacker', type: 'trireme', owner: 'player', position: { q: 5, r: 4 },
      movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    },
  };
  state.civilizations.player.units = ['attacker'];
  state.pirates = createEmptyPirateState();
  state.pirates.factions['pirate-1'] = {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'raiding',
    maritimeStage: 3, notoriety: 2, shipIds: [],
    headquarters: { kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
    transitionGuards: { emittedEventKeys: [] },
  } satisfies PirateFactionState;
  return state;
}

describe('pirate headquarters assault input flow', () => {
  it('previews first and revalidates the current state when confirmed', () => {
    const state = fixture();
    const pending = preparePirateHeadquartersAssault(state, 'pirate-1', 'attacker');
    expect(pending.preview.available).toBe(true);

    const staleState = {
      ...state,
      units: { ...state.units, attacker: { ...state.units.attacker, hasActed: true } },
    };
    const stale = confirmPirateHeadquartersAssault(staleState, pending);
    expect(stale.success).toBe(false);
    expect(stale.state).toBe(staleState);
    expect(stale.reason).toMatch(/action/i);
  });

  it('does not reuse cached integrity or action availability after the first assault', () => {
    const state = fixture();
    const pending = preparePirateHeadquartersAssault(state, 'pirate-1', 'attacker');
    const first = confirmPirateHeadquartersAssault(state, pending);
    expect(first.success).toBe(true);

    const second = confirmPirateHeadquartersAssault(first.state, pending);
    expect(second.success).toBe(false);
    expect(second.state).toBe(first.state);
    const headquarters = first.state.pirates!.factions['pirate-1'].headquarters;
    expect(headquarters.kind).toBe('coastal-enclave');
    if (headquarters.kind === 'coastal-enclave') {
      expect(headquarters.integrity).toBe(100 - pending.preview.damageToHeadquarters);
    }
  });
});
