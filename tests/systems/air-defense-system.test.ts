import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import {
  resolveAirDefenseCoverage,
  selectStrongestAirDefenseProviders,
  type ResolvedAirDefenseProvider,
} from '@/systems/air-defense-system';

function provider(overrides: Partial<ResolvedAirDefenseProvider> = {}): ResolvedAirDefenseProvider {
  return {
    id: 'city:alpha:anti_air_battery',
    label: 'Anti-Air Battery',
    position: { q: 1, r: 0 },
    ownerId: 'defender',
    radius: 0,
    defenseModifier: 8,
    stackingGroup: 'ground-air-defense',
    ...overrides,
  };
}

function state(): GameState {
  return {
    turn: 1,
    era: 9,
    map: {
      width: 4, height: 4, wrapsHorizontally: false, rivers: [],
      tiles: {
        '0,0': { coord: { q: 0, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
        '1,0': { coord: { q: 1, r: 0 }, terrain: 'plains', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
      },
    },
    units: {},
    cities: {
      alpha: { id: 'alpha', name: 'Alpha', owner: 'defender', position: { q: 1, r: 0 }, buildings: ['anti_air_battery'], population: 1, food: 0, production: 0, gold: 0, science: 0, culture: 0, housing: 1, amenities: 0, workedTiles: [], productionQueue: [], currentProduction: 0, foundedTurn: 1 },
    },
    civilizations: {
      attacker: { id: 'attacker', name: 'Attacker', civType: 'rome', color: '#fff', secondaryColor: '#000', cities: [], units: [], techState: { completed: [], currentResearch: null, researchProgress: 0 }, visibility: { tiles: { '1,0': 'visible' }, lastSeen: {} }, diplomacy: { atWarWith: ['defender'], relationships: {} }, resources: { food: 0, production: 0, gold: 0, science: 0, culture: 0 } },
      defender: { id: 'defender', name: 'Defender', civType: 'rome', color: '#fff', secondaryColor: '#000', cities: ['alpha'], units: [], techState: { completed: [], currentResearch: null, researchProgress: 0 }, visibility: { tiles: {}, lastSeen: {} }, diplomacy: { atWarWith: ['attacker'], relationships: {} }, resources: { food: 0, production: 0, gold: 0, science: 0, culture: 0 } },
    },
    barbarianCamps: {}, minorCivs: {}, tutorial: { completedSteps: [] }, currentPlayer: 'attacker', gameOver: false, winner: null, settings: { musicVolume: 0.5, soundVolume: 0.5, musicEnabled: true, soundEnabled: true }, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {}, builtNationalProjects: {}, idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }, embargoes: [], defensiveLeagues: [],
  } as unknown as GameState;
}

const defender = { id: 'defender-unit', owner: 'defender', type: 'rifleman', position: { q: 1, r: 0 } } as Unit;

describe('resolveAirDefenseCoverage', () => {
  it('preserves Anti-Air Battery +8 coverage for a visible defending city', () => {
    const coverage = resolveAirDefenseCoverage(state(), defender, 'attacker');

    expect(coverage.flatDefenseModifier).toBe(8);
    expect(coverage.facts).toEqual([expect.objectContaining({ label: 'Anti-Air Battery', outcome: 'applied', value: 8 })]);
  });

  it('does not expose a provider that the viewer has not observed', () => {
    const hidden = state();
    hidden.civilizations.attacker!.visibility.tiles = {};

    expect(resolveAirDefenseCoverage(hidden, defender, 'attacker')).toEqual({ flatDefenseModifier: 8, facts: [], providers: [] });
  });
});

describe('selectStrongestAirDefenseProviders', () => {
  it('uses only the strongest source in one stacking group and marks the other source superseded', () => {
    const result = selectStrongestAirDefenseProviders([
      provider(),
      provider({ id: 'unit:mobile-aa', label: 'Mobile AA', defenseModifier: 10 }),
    ]);

    expect(result.flatDefenseModifier).toBe(10);
    expect(result.facts).toContainEqual(expect.objectContaining({ label: 'Mobile AA', outcome: 'applied', value: 10 }));
    expect(result.facts).toContainEqual(expect.objectContaining({ label: 'Anti-Air Battery', outcome: 'superseded', value: 8 }));
  });
});
