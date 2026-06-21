import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import {
  buildPirateHeadquartersMapPresentation,
  buildPirateHeadquartersSpriteEntities,
} from '@/renderer/pirate-headquarters-presentation';
import { PirateSpriteStateController } from '@/renderer/pirate-sprite-state';

function fixture() {
  const state = createNewGame(undefined, 'pirate-map-presentation', 'small');
  state.turn = 20;
  state.pirates = createEmptyPirateState();
  state.pirates.factions['pirate-1'] = {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 2, behavior: 'raiding', maritimeStage: 3,
    notoriety: 3, shipIds: [],
    headquarters: { kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 40, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
    transitionGuards: { emittedEventKeys: [] },
  } satisfies PirateFactionState;
  for (const civ of Object.values(state.civilizations)) civ.visibility = { tiles: {}, lastSeen: {} };
  return state;
}

describe('pirate headquarters map presentation', () => {
  it('creates no landmark or region without earned intel', () => {
    const result = buildPirateHeadquartersMapPresentation(fixture(), 'player');
    expect(result.entities).toEqual([]);
    expect(result.regions).toEqual([]);
  });

  it('renders rumor intel as an approximate region and never an exact entity', () => {
    const state = fixture();
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'rumor', discoveredRound: 10, lastUpdatedRound: 10,
        approximateRegion: { center: { q: 2, r: 2 }, radius: 4 },
      },
    };

    const result = buildPirateHeadquartersMapPresentation(state, 'player');

    expect(result.entities).toEqual([]);
    expect(result.regions).toEqual([expect.objectContaining({
      factionId: 'pirate-1', center: { q: 2, r: 2 }, radius: 4, label: 'Suspected pirate waters',
    })]);
  });

  it('maps current and last-seen headquarters with stage, tier, damage, and selection', () => {
    const state = fixture();
    state.civilizations.player.visibility.tiles['5,5'] = 'visible';
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 20,
        lastKnownHeadquarters: {
          kind: 'coastal-enclave', position: { q: 5, r: 5 }, observedRound: 20, integrityBand: 'damaged',
        },
        knownBehavior: 'raiding', knownMaritimeStage: 3, observedUnitIds: [],
      },
    };

    const current = buildPirateHeadquartersMapPresentation(state, 'player', 'pirate-1').entities[0];
    expect(current).toMatchObject({
      id: 'pirate-headquarters-pirate-1', factionId: 'pirate-1', subtype: 'coastal-enclave',
      coord: { q: 5, r: 5 }, stage: 3, tier: 2, mode: 'current', damage: 2, selected: true,
    });

    state.pirates!.factions['pirate-1'].headquarters = {
      kind: 'coastal-enclave', position: { q: 7, r: 5 }, integrity: 100, maxIntegrity: 100,
    };
    const stale = buildPirateHeadquartersMapPresentation(state, 'player').entities[0];
    expect(stale).toMatchObject({ coord: { q: 5, r: 5 }, mode: 'last-seen', selected: false });
  });

  it('does not expose one hot-seat viewers exact landmark to another viewer', () => {
    const state = fixture();
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 20,
        lastKnownHeadquarters: { kind: 'coastal-enclave', position: { q: 5, r: 5 }, observedRound: 20 },
      },
    };
    state.pirates!.intelByCiv['ai-1'] = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'rumor', discoveredRound: 19, lastUpdatedRound: 19,
        approximateRegion: { center: { q: 1, r: 1 }, radius: 5 },
      },
    };

    const other = buildPirateHeadquartersMapPresentation(state, 'ai-1');
    expect(other.entities).toEqual([]);
    expect(other.regions[0].center).toEqual({ q: 1, r: 1 });
  });

  it('keeps all four production damage states reachable from saved intel', () => {
    const state = fixture();
    state.civilizations.player.visibility.tiles['5,5'] = 'visible';
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 20,
        lastKnownHeadquarters: {
          kind: 'coastal-enclave', position: { q: 5, r: 5 }, observedRound: 20, integrityBand: 'worn',
        },
        knownBehavior: 'raiding', knownMaritimeStage: 3, observedUnitIds: [],
      },
    };

    expect(buildPirateHeadquartersMapPresentation(state, 'player').entities[0].damage).toBe(1);
  });

  it('builds live landmark entities from current faction mode and transient combat state', () => {
    const state = fixture();
    state.civilizations.player.visibility.tiles['5,5'] = 'visible';
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'tracked', discoveredRound: 10, lastUpdatedRound: 20,
        lastKnownHeadquarters: {
          kind: 'coastal-enclave', position: { q: 5, r: 5 }, observedRound: 20, integrityBand: 'damaged',
        },
        knownBehavior: 'raiding', knownMaritimeStage: 3, observedUnitIds: [],
      },
    };
    const controller = new PirateSpriteStateController();
    controller.apply({ type: 'attack', entityId: 'pirate-headquarters-pirate-1' }, 1_000);

    const entities = buildPirateHeadquartersSpriteEntities(
      state,
      buildPirateHeadquartersMapPresentation(state, 'player').entities,
      controller,
      1_100,
    );

    expect(entities[0]).toMatchObject({
      id: 'pirate-headquarters-pirate-1', subtype: 'pirate_enclave_stage_3',
      state: 'attack', mode: 'raid', damage: 2, tier: 2, stage: 3,
    });
  });
});
