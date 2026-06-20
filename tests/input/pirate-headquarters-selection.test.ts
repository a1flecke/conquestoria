import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import { resolvePirateHeadquartersSelection } from '@/input/pirate-headquarters-selection';

function fixture() {
  const state = createNewGame(undefined, 'pirate-map-selection', 'small');
  state.pirates = createEmptyPirateState();
  state.pirates.factions['pirate-1'] = {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 2, behavior: 'raiding', maritimeStage: 3,
    notoriety: 3, shipIds: [],
    headquarters: { kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 40, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
    transitionGuards: { emittedEventKeys: [] },
  } satisfies PirateFactionState;
  return state;
}

describe('pirate headquarters selection', () => {
  it('opens a faction dossier only at an earned exact headquarters coordinate', () => {
    const state = fixture();
    state.civilizations.player.visibility.tiles['5,5'] = 'visible';
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 1, lastUpdatedRound: 1,
        lastKnownHeadquarters: { kind: 'coastal-enclave', position: { q: 5, r: 5 }, observedRound: 1 },
      },
    };
    expect(resolvePirateHeadquartersSelection(state, 'player', { q: 5, r: 5 }))
      .toEqual({ kind: 'faction', factionId: 'pirate-1' });
    expect(resolvePirateHeadquartersSelection(state, 'ai-1', { q: 5, r: 5 })).toBeNull();
  });

  it('returns only an approximate region intent for rumor-level intel', () => {
    const state = fixture();
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'rumor', discoveredRound: 1, lastUpdatedRound: 1,
        approximateRegion: { center: { q: 2, r: 2 }, radius: 3 },
      },
    };
    expect(resolvePirateHeadquartersSelection(state, 'player', { q: 2, r: 2 })).toEqual({
      kind: 'region', factionId: 'pirate-1', center: { q: 2, r: 2 }, radius: 3,
    });
    expect(resolvePirateHeadquartersSelection(state, 'player', { q: 5, r: 5 })).toBeNull();
  });
});
