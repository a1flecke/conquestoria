import { describe, it, expect } from 'vitest';
import type { City, Civilization, GameState, HexCoord, HexTile } from '@/core/types';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { getRelationship } from '@/systems/diplomacy-system';
import { hexKey, hexesInRange } from '@/systems/hex-utils';

const ACTOR_CITY_POS: HexCoord = { q: -10, r: -10 };
const TARGET_POS: HexCoord = { q: 0, r: 0 };

const AT_PEACE = {
  relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
  vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
};
const attackerAtWar = { ...AT_PEACE, atWarWith: ['defender'] };
const defenderAtWar = { ...AT_PEACE, atWarWith: ['attacker'] };

function makeTile(coord: HexCoord, owner: string | null): HexTile {
  return {
    coord, terrain: 'hills', elevation: 'lowland', resource: null, improvement: 'none',
    owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

function makeCiv(overrides: Partial<Civilization> = {}): Civilization {
  return {
    id: 'attacker', name: 'Attacker', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 1000, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: AT_PEACE,
    ...overrides,
  } as Civilization;
}

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'target', name: 'Target', owner: 'defender', position: TARGET_POS,
    population: 5, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
    productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
    ...overrides,
  } as City;
}

function makeExecutionState(overrides: Partial<GameState> = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  for (const coord of hexesInRange(TARGET_POS, 4)) tiles[hexKey(coord)] = makeTile(coord, 'defender');
  tiles[hexKey(ACTOR_CITY_POS)] = makeTile(ACTOR_CITY_POS, 'attacker');

  return {
    turn: 50, era: 10, currentPlayer: 'attacker', gameOver: false, winner: null,
    map: { width: 60, height: 60, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      silo: { id: 'silo', name: 'Silo City', owner: 'attacker', position: ACTOR_CITY_POS, buildings: ['missile_silo'] } as any,
      target: makeCity(),
    },
    civilizations: {
      attacker: makeCiv({
        id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar,
        visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
      }),
      defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
    },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [],
    settings: { superweapons: 'on' } as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 1, nextCityId: 1, nextRouteId: 1 },
    ...overrides,
  } as GameState;
}

describe('executeStrategicLaunch (#545 MR4 §11)', () => {
  it('applies unprovoked first-use deltas (-60 target) when the actor has never been struck', () => {
    const state = makeExecutionState();
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.attacker.diplomacy.relationships.defender).toBe(-60);
    expect(result.state.civilizations.defender.diplomacy.relationships.attacker).toBe(-60);
  });

  it('records the strike so the target civ can classify a future counter-strike as retaliation', () => {
    const state = makeExecutionState();
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.defender.diplomacy.strategicStrikesReceivedFrom).toEqual(['attacker']);
  });

  it('does not duplicate the actor id if struck again before any retaliation resets it', () => {
    const state = makeExecutionState({
      civilizations: {
        attacker: makeCiv({
          id: 'attacker', cities: ['silo'], strategicArsenal: 2, diplomacy: attackerAtWar,
          visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
        }),
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: { ...defenderAtWar, strategicStrikesReceivedFrom: ['attacker'] } }),
      },
    });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.defender.diplomacy.strategicStrikesReceivedFrom).toEqual(['attacker']);
  });

  it('applies retaliation deltas (-20 target) when the actor was struck by the target civ first', () => {
    const state = makeExecutionState({
      civilizations: {
        attacker: makeCiv({
          id: 'attacker', cities: ['silo'], strategicArsenal: 1,
          diplomacy: { ...attackerAtWar, strategicStrikesReceivedFrom: ['defender'] },
          visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
        }),
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
      },
    });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.attacker.diplomacy.relationships.defender).toBe(-20);
    expect(result.state.civilizations.defender.diplomacy.relationships.attacker).toBe(-20);
  });

  it('applies witness deltas to a civ that has met both actor and target', () => {
    const state = makeExecutionState({
      civilizations: {
        attacker: makeCiv({
          id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar,
          visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
          knownCivilizations: ['defender', 'witness'],
        }),
        defender: makeCiv({
          id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar,
          knownCivilizations: ['attacker', 'witness'],
        }),
        witness: makeCiv({
          id: 'witness', name: 'Witness', diplomacy: { ...AT_PEACE, relationships: { attacker: 0, defender: 0 } },
          knownCivilizations: ['attacker', 'defender'],
        }),
      },
    });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.attacker.diplomacy.relationships.witness).toBe(-25);
    expect(result.state.civilizations.witness.diplomacy.relationships.attacker).toBe(-25);
  });

  it('never touches a civ that has not met both actor and target', () => {
    const state = makeExecutionState({
      civilizations: {
        attacker: makeCiv({
          id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar,
          visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
          knownCivilizations: ['defender'],
        }),
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
        stranger: makeCiv({ id: 'stranger', name: 'Stranger', diplomacy: { ...AT_PEACE, relationships: { attacker: 0 } }, knownCivilizations: ['attacker'] }),
      },
    });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(getRelationship(result.state.civilizations.attacker.diplomacy, 'stranger')).toBe(0);
  });

  it('passes through legality failures unchanged (never applies reputation on a failed launch)', () => {
    const state = makeExecutionState({
      civilizations: {
        attacker: makeCiv({ id: 'attacker', strategicArsenal: 0 }),
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
      },
    });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-arsenal');
  });
});
