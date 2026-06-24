import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import type { GameState, Unit } from '@/core/types';
import {
  getPirateWatersPresentation,
  refreshPirateIntel,
} from '@/systems/pirate-presentation';

function fixture(): GameState {
  const state = createNewGame(undefined, 'pirate-presentation', 'small');
  state.turn = 20;
  state.pirates = createEmptyPirateState();
  state.map.tiles['4,4'] = {
    coord: { q: 4, r: 4 }, terrain: 'plains', elevation: 'lowland', resource: null,
    improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
  state.map.tiles['4,3'] = {
    coord: { q: 4, r: 3 }, terrain: 'coast', elevation: 'lowland', resource: null,
    improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
  for (const civ of Object.values(state.civilizations)) civ.visibility = { tiles: {}, lastSeen: {} };
  const faction: PirateFactionState = {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 4, behavior: 'blockading',
    maritimeStage: 4, notoriety: 7, shipIds: ['visible-ship', 'hidden-ship'],
    headquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, integrity: 42, maxIntegrity: 100 },
    tributeByCiv: {}, demandByCiv: {}, contract: null,
    intent: { kind: 'blockade', targetCivId: 'player', targetCityId: 'secret-city', plannedRound: 20 },
    transitionGuards: { emittedEventKeys: [] },
  };
  state.pirates.factions[faction.id] = faction;
  const ship = (id: string, q: number): Unit => ({
    id, type: 'pirate_ironclad', owner: faction.id, position: { q, r: 3 },
    movementPointsLeft: 4, health: 65, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  });
  state.units['visible-ship'] = ship('visible-ship', 4);
  state.units['hidden-ship'] = ship('hidden-ship', 8);
  return state;
}

describe('pirate waters presentation privacy', () => {
  it('exposes only an approximate region for rumor-level intel', () => {
    const state = fixture();
    const faction = state.pirates!.factions['pirate-1'];
    faction.headquarters = {
      kind: 'deep-sea-flotilla',
      flagshipUnitId: 'visible-ship',
      relocation: { planned: null, lastRelocatedRound: null },
    };
    faction.maritimeStage = 5;
    faction.demandByCiv.player = { demandedRound: 20, lastReminderRound: 20, quotedCost: 70 };
    state.civilizations.player.gold = 500;
    state.civilizations['ai-1'].cities = ['hidden-port'];
    state.cities['hidden-port'] = {
      id: 'hidden-port', name: 'Hidden Port', owner: 'ai-1', position: { q: 4, r: 4 }, population: 2,
      food: 0, foodNeeded: 15, buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [{ q: 4, r: 4 }], workedTiles: [], focus: 'balanced', maturity: 'town',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'rumor', discoveredRound: 10, lastUpdatedRound: 10,
        approximateRegion: { center: { q: 2, r: 2 }, radius: 4 },
      },
    };

    const entry = getPirateWatersPresentation(state, 'player').factions[0];

    expect(entry).toMatchObject({
      factionId: 'pirate-1', name: 'Unknown pirate faction', level: 'rumor',
      approximateRegion: { center: { q: 2, r: 2 }, radius: 4 },
    });
    expect(entry.headquarters).toBeUndefined();
    expect(entry.behavior).toBeUndefined();
    expect(entry.maritimeStage).toBeUndefined();
    expect(entry.observedUnitIds).toEqual([]);
    expect(entry.tributeQuote).toEqual({
      available: false,
      reason: 'More intelligence is required before negotiating with this faction.',
      cost: 0,
    });
    expect(entry.contractTargets).toEqual([]);
    expect(entry.contractUnavailableReason)
      .toBe('More intelligence is required before negotiating with this faction.');
    expect(JSON.stringify(entry)).not.toContain('secret-city');
    expect(JSON.stringify(entry)).not.toContain('The Red Wake');
    expect(JSON.stringify(entry)).not.toContain('Hidden Port');
    expect(JSON.stringify(entry)).not.toContain('70');
  });

  it('renders sighted intel from its saved snapshot rather than richer live faction state', () => {
    const state = fixture();
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 12,
        lastKnownHeadquarters: {
          kind: 'coastal-enclave', position: { q: 1, r: 1 }, observedRound: 12, integrityBand: 'healthy',
        },
        knownBehavior: 'raiding', knownMaritimeStage: 2, observedUnitIds: ['old-ship'],
      },
    };

    const entry = getPirateWatersPresentation(state, 'player').factions[0];

    expect(entry.name).toBe('The Red Wake');
    expect(entry.headquarters).toMatchObject({ position: { q: 1, r: 1 }, observedRound: 12, current: false });
    expect(entry.behavior).toBe('raiding');
    expect(entry.maritimeStage).toBe(2);
    expect(entry.observedUnitIds).toEqual(['old-ship']);
    expect(entry.headquarters).not.toHaveProperty('integrity', 42);
  });

  it('does not call an obsolete observed headquarters current when only its old tile is visible', () => {
    const state = fixture();
    state.civilizations.player.visibility.tiles['1,1'] = 'visible';
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 12,
        lastKnownHeadquarters: {
          kind: 'coastal-enclave', position: { q: 1, r: 1 }, observedRound: 12, integrityBand: 'healthy',
        },
      },
    };

    const entry = getPirateWatersPresentation(state, 'player').factions[0];

    expect(entry.headquarters?.current).toBe(false);
    expect(entry.focusTarget?.label).toBe('Last known pirate headquarters');
  });

  it('refreshes observed headquarters and only currently visible ships for that viewer', () => {
    const state = fixture();
    state.civilizations.player.visibility.tiles['4,4'] = 'visible';
    state.civilizations.player.visibility.tiles['4,3'] = 'visible';

    const refreshed = refreshPirateIntel(state, 'player');
    const entry = getPirateWatersPresentation(refreshed, 'player').factions[0];

    expect(entry).toMatchObject({
      name: 'The Red Wake', behavior: 'blockading', maritimeStage: 4,
      headquarters: { position: { q: 4, r: 4 }, current: true, integrityBand: 'damaged' },
    });
    expect(entry.observedUnitIds).toEqual(['visible-ship']);
    expect(entry.observedUnitIds).not.toContain('hidden-ship');
  });

  it('shows relocation direction only to tracked viewers while a plan remains active', () => {
    const state = fixture();
    const faction = state.pirates!.factions['pirate-1'];
    faction.headquarters = {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'visible-ship',
      relocation: {
        lastRelocatedRound: null,
        planned: { plannedRound: 20, resolvesOnRound: 21, direction: 'north-east', path: [{ q: 5, r: 2 }, { q: 6, r: 1 }] },
      },
    };
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'tracked', discoveredRound: 10, lastUpdatedRound: 20,
        plannedRelocationDirection: 'north-east',
      },
    };
    expect(getPirateWatersPresentation(state, 'player').factions[0].plannedRelocationDirection).toBe('north-east');

    faction.headquarters.relocation.planned = null;
    const refreshed = refreshPirateIntel(state, 'player');
    expect(getPirateWatersPresentation(refreshed, 'player').factions[0].plannedRelocationDirection).toBeUndefined();
  });

  it('does not leak one hot-seat viewers exact intel to another viewer', () => {
    const state = fixture();
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'tracked', discoveredRound: 10, lastUpdatedRound: 20,
        lastKnownHeadquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, observedRound: 20, integrityBand: 'damaged' },
        knownBehavior: 'blockading', knownMaritimeStage: 4, observedUnitIds: ['visible-ship'],
      },
    };
    state.pirates!.intelByCiv['ai-1'] = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'rumor', discoveredRound: 18, lastUpdatedRound: 18,
        approximateRegion: { center: { q: 0, r: 0 }, radius: 5 },
      },
    };

    const other = getPirateWatersPresentation(state, 'ai-1').factions[0];

    expect(other.level).toBe('rumor');
    expect(other.headquarters).toBeUndefined();
    expect(other.behavior).toBeUndefined();
    expect(other.observedUnitIds).toEqual([]);
  });

  it('projects authoritative action quotes, safe focus targets, and every eligible contract rival', () => {
    const state = fixture();
    const faction = state.pirates!.factions['pirate-1'];
    faction.headquarters = {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'visible-ship', relocation: { planned: null, lastRelocatedRound: null },
    };
    faction.maritimeStage = 5;
    faction.demandByCiv.player = { demandedRound: 20, lastReminderRound: 20, quotedCost: 50 };
    state.civilizations.player.gold = 500;
    state.civilizations.player.diplomacy.relationships['ai-1'] = 0;
    state.civilizations['ai-1'].cities = ['target-port'];
    state.cities['target-port'] = {
      id: 'target-port', name: 'Target Port', owner: 'ai-1', position: { q: 4, r: 4 }, population: 2,
      food: 0, foodNeeded: 15, buildings: [], productionQueue: [], productionProgress: 0,
      ownedTiles: [{ q: 4, r: 4 }], workedTiles: [], focus: 'balanced', maturity: 'town',
      unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
    };
    state.civilizations.player.visibility.tiles['4,4'] = 'fog';
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'sighted', discoveredRound: 10, lastUpdatedRound: 20,
        lastKnownHeadquarters: { kind: 'deep-sea-flotilla', position: { q: 4, r: 3 }, observedRound: 19 },
      },
    };

    const entry = getPirateWatersPresentation(state, 'player').factions[0] as any;

    expect(entry.focusTarget).toMatchObject({ kind: 'headquarters', current: false });
    expect(entry.tributeQuote).toMatchObject({ available: true, durationRounds: 15 });
    expect(entry.contractTargets.map((target: any) => target.civId)).toEqual(['ai-1']);
  });
});
