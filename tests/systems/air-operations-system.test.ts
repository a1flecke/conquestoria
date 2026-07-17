import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { baseNewAirUnit, canCompleteAirUnitProduction, getAirBaseCapacity, getAirBaseRoster, getLegalAirMissionTargets, getLegalRebaseDestinations, isBasedAirUnit, rebaseAircraft, resolveAirBaseLoss, resolveAirStrike, resolveReconMission, selectInterceptor, startIntercept, syncCarrierBasedAircraft } from '@/systems/air-operations-system';
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
    expect(getAirBaseCapacity({ ...state, builtNationalProjects: { 'player:air_force_command': { civId: 'player', cityId: 'city-1', eraBuilt: 9 } } }, { kind: 'city', cityId: 'city-1' })).toBe(4);
  });

  it('lands a newly trained aircraft in the producing city only when its compatible base has capacity', () => {
    const newAircraft = { ...biplane, id: 'air-2', airBase: undefined };

    expect(canCompleteAirUnitProduction(state, 'city-1', 'biplane')).toEqual({ ok: true, base: { kind: 'city', cityId: 'city-1' } });
    expect(baseNewAirUnit(state, 'city-1', newAircraft)).toMatchObject({
      ok: true,
      state: { units: { 'air-2': { airBase: { kind: 'city', cityId: 'city-1' }, position: { q: 2, r: 2 } } } },
    });
    const full = { ...state, units: { ...state.units, second: { ...biplane, id: 'second' }, third: { ...biplane, id: 'third' } } };
    expect(canCompleteAirUnitProduction(full, 'city-1', 'biplane')).toEqual({ ok: false, reason: 'base-full' });
  });

  it('rebases a based aircraft to a compatible friendly base within ferry range', () => {
    const rebaseState = {
      ...state,
      map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {} },
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

  it('synchronizes each based aircraft with a moved carrier', () => {
    const carrierState = {
      ...state,
      units: {
        carrier: { ...biplane, id: 'carrier', type: 'carrier', position: { q: 6, r: 2 }, airBase: undefined },
        'air-1': { ...biplane, airBase: { kind: 'carrier', unitId: 'carrier' } },
      },
    } as unknown as GameState;

    expect(syncCarrierBasedAircraft(carrierState, 'carrier').units['air-1']?.position).toEqual({ q: 6, r: 2 });
  });

  it('spends a fighter to intercept and selects the strongest eligible defender deterministically', () => {
    const missionState = {
      ...state,
      map: { width: 10, height: 10, wrapsHorizontally: false },
      units: {
        fighterA: { ...biplane, id: 'fighter-a', type: 'jet_fighter', health: 80, airMission: 'intercept' },
        fighterB: { ...biplane, id: 'fighter-b', type: 'jet_fighter', health: 100, airMission: 'intercept' },
        incoming: { ...biplane, id: 'incoming', owner: 'enemy', position: { q: 4, r: 2 }, airBase: { kind: 'city', cityId: 'enemy-city' } },
      },
      cities: {
        ...state.cities,
        'enemy-city': { id: 'enemy-city', owner: 'enemy', position: { q: 4, r: 2 }, buildings: ['airfield'] },
      },
    } as unknown as GameState;

    expect(startIntercept({ ...missionState, units: { ...missionState.units, fighterA: { ...missionState.units.fighterA, airMission: undefined } } }, 'fighterA')).toMatchObject({
      ok: true,
      state: { units: { fighterA: { airMission: 'intercept', hasActed: true } } },
    });
    expect(selectInterceptor(missionState, missionState.units.incoming!, { q: 4, r: 2 })?.id).toBe('fighter-b');
  });

  it('reveals a recon center only for its owner until the next turn', () => {
    const recon = { ...biplane, id: 'recon', type: 'recon_aircraft' as const };
    const reconState = {
      ...state,
      turn: 8,
      map: { width: 10, height: 10, wrapsHorizontally: false },
      units: { recon },
      civilizations: { player: { visibility: { tiles: {} } } },
    } as unknown as GameState;

    expect(getLegalAirMissionTargets(reconState, 'recon', 'recon')).toContainEqual({ q: 4, r: 2 });
    expect(resolveReconMission(reconState, 'recon', { q: 4, r: 2 })).toMatchObject({
      ok: true,
      state: {
        units: { recon: { hasActed: true } },
        reconReveals: [{ ownerCivId: 'player', center: { q: 4, r: 2 }, range: 3, expiresAtTurn: 8 }],
      },
    });
  });

  it('resolves a destroyed carrier by removing its sorted based-aircraft roster', () => {
    const carrierLossState = {
      ...state,
      units: {
        carrier: { ...biplane, id: 'carrier', type: 'carrier', airBase: undefined },
        zulu: { ...biplane, id: 'zulu', airBase: { kind: 'carrier', unitId: 'carrier' } },
        alpha: { ...biplane, id: 'alpha', airBase: { kind: 'carrier', unitId: 'carrier' } },
      },
      civilizations: { player: { units: ['carrier', 'zulu', 'alpha'] } },
    } as unknown as GameState;

    const result = resolveAirBaseLoss(carrierLossState, { kind: 'carrier', unitId: 'carrier' }, { kind: 'carrier-destroyed' });

    expect(result.outcomes).toEqual([
      { aircraftId: 'alpha', outcome: 'destroyed' },
      { aircraftId: 'zulu', outcome: 'destroyed' },
    ]);
    expect(result.state.units.alpha).toBeUndefined();
    expect(result.state.civilizations.player!.units).toEqual(['carrier']);
  });

  it('evacuates facility-loss aircraft to a compatible friendly base within ferry range', () => {
    const lossState = {
      ...state,
      map: { width: 10, height: 10, wrapsHorizontally: false },
      cities: {
        ...state.cities,
        reserve: { id: 'reserve', owner: 'player', position: { q: 4, r: 2 }, buildings: ['airfield'] },
      },
    } as unknown as GameState;

    const result = resolveAirBaseLoss(lossState, { kind: 'city', cityId: 'city-1' }, { kind: 'facility-removed' });

    expect(result.outcomes).toEqual([{ aircraftId: 'air-1', outcome: 'evacuated' }]);
    expect(result.state.units['air-1']).toMatchObject({ airBase: { kind: 'city', cityId: 'reserve' }, position: { q: 4, r: 2 } });
  });

  it('uses a deterministic one-third capture transition for based aircraft', () => {
    const captureState = {
      ...state,
      gameId: 'capture-test', turn: 11,
      civilizations: { player: { units: ['air-1'] }, enemy: { units: [] } },
    } as unknown as GameState;

    const first = resolveAirBaseLoss(captureState, { kind: 'city', cityId: 'city-1' }, { kind: 'captured', victorId: 'enemy' });
    const second = resolveAirBaseLoss(captureState, { kind: 'city', cityId: 'city-1' }, { kind: 'captured', victorId: 'enemy' });

    expect(first).toEqual(second);
    expect(first.outcomes).toHaveLength(1);
    expect(['evacuated', 'destroyed', 'captured']).toContain(first.outcomes[0]!.outcome);
  });

  it('resolves one interceptor exchange before a single air strike target exchange', () => {
    const missionState = {
      ...state,
      gameId: 'air-strike-test', turn: 9,
      map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {} },
      units: {
        striker: { ...biplane, id: 'striker', type: 'bomber', position: { q: 2, r: 2 } },
        interceptor: { ...biplane, id: 'interceptor', type: 'jet_fighter', owner: 'enemy', position: { q: 4, r: 2 }, airBase: { kind: 'city', cityId: 'enemy-city' }, airMission: 'intercept' },
        target: { ...biplane, id: 'target', type: 'warrior', owner: 'enemy', position: { q: 5, r: 2 }, airBase: undefined },
      },
      cities: { ...state.cities, 'enemy-city': { id: 'enemy-city', owner: 'enemy', position: { q: 4, r: 2 }, buildings: ['airfield'] } },
      civilizations: { player: { units: ['striker'], techState: { completed: [] } }, enemy: { units: ['interceptor', 'target'], techState: { completed: [] } } },
    } as unknown as GameState;

    const result = resolveAirStrike(missionState, 'striker', { q: 5, r: 2 });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ interception: { interceptorId: 'interceptor' } });
    expect(result.state.units.striker?.hasActed).toBe(true);
    expect(result.state.units.interceptor?.interceptedTurn).toBe(9);
  });
});
