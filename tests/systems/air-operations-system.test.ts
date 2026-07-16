import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { getAirBaseCapacity, getAirBaseRoster, getLegalRebaseDestinations, isBasedAirUnit, rebaseAircraft } from '@/systems/air-operations-system';
import type { GameState, Unit } from '@/core/types';

describe('air-operation definitions', () => {
  it('gives every based aircraft its approved base, range, and mission contract', () => {
    expect((UNIT_DEFINITIONS.biplane as any).airOperation).toEqual({
      baseKinds: ['airfield', 'carrier'], operationalRange: 3, ferryRange: 6,
      missions: ['strike', 'intercept', 'rebase'], carrierEligible: true,
    });
    expect((UNIT_DEFINITIONS.attack_helicopter as any).airOperation).toMatchObject({
      baseKinds: ['helicopter_base'], operationalRange: 4, ferryRange: 8,
      missions: ['strike', 'rebase'], carrierEligible: false,
    });
    expect((UNIT_DEFINITIONS.jet_fighter as any).airOperation).toMatchObject({ operationalRange: 5, ferryRange: 10 });
    expect((UNIT_DEFINITIONS.bomber as any).airOperation).toMatchObject({ operationalRange: 6, ferryRange: 12 });
    expect((UNIT_DEFINITIONS.stealth_bomber as any).airOperation).toMatchObject({ operationalRange: 7, ferryRange: 14 });
  });

  it('adds the modern Recon Aircraft to the trainable roster at Jet Aviation', () => {
    expect((UNIT_DEFINITIONS as any).recon_aircraft).toMatchObject({
      domain: 'air', strength: 0,
      airOperation: {
        baseKinds: ['airfield'], operationalRange: 5, ferryRange: 10,
        missions: ['recon', 'rebase'], carrierEligible: false,
      },
    });
    expect(TRAINABLE_UNITS.find(unit => unit.type === ('recon_aircraft' as any))).toMatchObject({
      techRequired: 'jet-aviation',
    });
  });
});

describe('air bases', () => {
  const biplane: Unit = {
    id: 'air-1', type: 'biplane', owner: 'player', position: { q: 2, r: 2 },
    movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false,
    isResting: false, airBase: { kind: 'city', cityId: 'city-1' },
  };
  const state = {
    units: { 'air-1': biplane },
    cities: { 'city-1': { id: 'city-1', owner: 'player', position: { q: 2, r: 2 }, buildings: ['airfield'] } },
    builtNationalProjects: {},
  } as unknown as GameState;

  it('derives the city roster and Airfield capacity from state', () => {
    expect(isBasedAirUnit(biplane)).toBe(true);
    expect(getAirBaseRoster(state, { kind: 'city', cityId: 'city-1' }).map(unit => unit.id)).toEqual(['air-1']);
    expect(getAirBaseCapacity(state, { kind: 'city', cityId: 'city-1' })).toBe(3);
    expect(getAirBaseCapacity({ ...state, builtNationalProjects: { 'player:air_force_command': { civId: 'player', buildingId: 'air_force_command' } } }, { kind: 'city', cityId: 'city-1' })).toBe(4);
  });

  it('rebases a based aircraft to a compatible friendly base within ferry range', () => {
    const rebaseState = {
      ...state,
      map: { width: 10, height: 10, wrapsHorizontally: false },
      cities: {
        ...state.cities,
        'city-2': { id: 'city-2', owner: 'player', position: { q: 4, r: 2 }, buildings: ['airfield'] },
      },
    } as unknown as GameState;

    expect(getLegalRebaseDestinations(rebaseState, 'air-1')).toEqual([{ kind: 'city', cityId: 'city-2' }]);
    expect(rebaseAircraft(rebaseState, 'air-1', { kind: 'city', cityId: 'city-2' })).toMatchObject({
      ok: true,
      state: { units: { 'air-1': { airBase: { kind: 'city', cityId: 'city-2' }, hasActed: true } } },
    });
  });
});
