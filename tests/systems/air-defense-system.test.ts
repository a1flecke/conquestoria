import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import {
  civHasAirDefenseCoverage,
  getKnownAirDefenseProviders,
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
  it('treats a partial city record as having no completed air-defense buildings', () => {
    const next = state();
    next.cities.alpha = {
      id: 'alpha', owner: 'defender', position: { q: 1, r: 0 },
    } as GameState['cities'][string];

    expect(resolveAirDefenseCoverage(next, defender, 'defender').flatDefenseModifier).toBe(0);
  });

  it('requires a completed Radar Station before a SAM Site provides coverage', () => {
    const next = state();
    next.cities.alpha!.buildings = ['anti_air_battery', 'sam_site'];

    expect(resolveAirDefenseCoverage(next, defender, 'defender')).toMatchObject({
      flatDefenseModifier: 8,
      providers: [expect.objectContaining({ id: 'city:alpha:anti_air_battery' })],
    });
  });

  it('invalidates cached coverage when Radar is removed from the current state revision', () => {
    const next = state();
    next.cities.alpha!.buildings = ['anti_air_battery', 'radar_station', 'sam_site'];

    expect(resolveAirDefenseCoverage(next, defender, 'defender').flatDefenseModifier).toBe(12);
    next.cities.alpha!.buildings = ['anti_air_battery', 'sam_site'];

    expect(resolveAirDefenseCoverage(next, defender, 'defender').flatDefenseModifier).toBe(8);
    expect(getKnownAirDefenseProviders(next, 'defender'))
      .not.toContainEqual(expect.objectContaining({ id: 'city:alpha:sam_site' }));
  });

  it('uses SAM Site at radius two as the strongest ground air-defense provider', () => {
    const next = state();
    next.cities.alpha!.buildings = ['anti_air_battery', 'radar_station', 'sam_site'];
    const covered = { ...defender, position: { q: 1, r: 0 } };

    const coverage = resolveAirDefenseCoverage(next, covered, 'defender');

    expect(coverage.flatDefenseModifier).toBe(12);
    expect(coverage.providers).toContainEqual(expect.objectContaining({ id: 'city:alpha:sam_site', radius: 2, defenseModifier: 12 }));
    expect(coverage.facts).toContainEqual(expect.objectContaining({ label: 'SAM Site', outcome: 'applied', value: 12 }));
    expect(coverage.facts).toContainEqual(expect.objectContaining({ label: 'Anti-Air Battery', outcome: 'superseded', value: 8 }));
    expect(resolveAirDefenseCoverage(next, { ...defender, position: { q: 3, r: 0 } }, 'defender').flatDefenseModifier).toBe(12);
  });

  it('does not cover a defender beyond the SAM Site radius or reveal it to an unseeing viewer', () => {
    const next = state();
    next.cities.alpha!.buildings = ['anti_air_battery', 'radar_station', 'sam_site'];
    next.civilizations.attacker!.visibility.tiles = {};

    expect(resolveAirDefenseCoverage(next, { ...defender, position: { q: 4, r: 0 } }, 'defender').flatDefenseModifier).toBe(0);
    expect(getKnownAirDefenseProviders(next, 'attacker').some(provider => provider.id === 'city:alpha:sam_site')).toBe(false);
  });

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

  it('covers adjacent defenders from a Mobile AA unit and exposes it to its owner', () => {
    const next = state();
    next.units = {
      aa: { id: 'aa', owner: 'defender', type: 'mobile_aa', position: { q: 0, r: 0 } },
    } as unknown as GameState['units'];
    const covered = { ...defender, position: { q: 1, r: 0 } };

    expect(resolveAirDefenseCoverage(next, covered, 'defender')).toMatchObject({
      flatDefenseModifier: 8,
      providers: expect.arrayContaining([expect.objectContaining({ id: 'unit:aa:mobile_aa', radius: 1 })]),
    });
    expect(getKnownAirDefenseProviders(next, 'defender')).toContainEqual(
      expect.objectContaining({ id: 'unit:aa:mobile_aa' }),
    );
  });

  it('does not cover defenders beyond the Mobile AA radius', () => {
    const next = state();
    next.units = {
      aa: { id: 'aa', owner: 'defender', type: 'mobile_aa', position: { q: 0, r: 0 } },
    } as unknown as GameState['units'];

    expect(resolveAirDefenseCoverage(next, { ...defender, position: { q: 2, r: 0 } }, 'defender').flatDefenseModifier).toBe(0);
  });

  it('limits Missile Cruiser air defense to adjacent friendly naval units', () => {
    const next = state();
    next.units = {
      cruiser: { id: 'cruiser', owner: 'defender', type: 'missile_cruiser', position: { q: 0, r: 0 } },
    } as unknown as GameState['units'];
    const navalDefender = { ...defender, type: 'battleship' as const, position: { q: 1, r: 0 } };

    expect(resolveAirDefenseCoverage(next, navalDefender, 'defender').flatDefenseModifier).toBe(10);
    expect(resolveAirDefenseCoverage(next, { ...defender, position: { q: 0, r: 1 } }, 'defender').flatDefenseModifier).toBe(0);
  });
});

describe('civHasAirDefenseCoverage', () => {
  it('is true for a civ with an Anti-Air Battery already built (#783 follow-up)', () => {
    expect(civHasAirDefenseCoverage(state(), 'defender')).toBe(true);
  });

  it('is true for a civ with a Mobile AA unit on the map', () => {
    const next = state();
    next.units = {
      aa: { id: 'aa', owner: 'attacker', type: 'mobile_aa', position: { q: 0, r: 0 } },
    } as unknown as GameState['units'];

    expect(civHasAirDefenseCoverage(next, 'attacker')).toBe(true);
  });

  it('is false for a civ with no AA-providing building or unit built', () => {
    expect(civHasAirDefenseCoverage(state(), 'attacker')).toBe(false);
  });

  it('stays false for a civ that has researched the unlocking tech but built nothing yet', () => {
    const next = state();
    next.civilizations.attacker!.techState.completed = ['air-superiority'];

    expect(civHasAirDefenseCoverage(next, 'attacker')).toBe(false);
  });

  it('is false for an unknown civ id', () => {
    expect(civHasAirDefenseCoverage(state(), 'nobody')).toBe(false);
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
