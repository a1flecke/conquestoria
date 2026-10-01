import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import {
  AIR_MAX_STRAIN,
  AIR_SPENT_AT,
  AIR_WORN_AT,
  getAirMissionDenial,
  getAirReadinessCombatPenalty,
  getAirReadinessState,
  getAirReadinessStatus,
  resolveAirReadinessForCiv,
} from '@/systems/air-readiness';
import {
  getLegalAirMissionTargets, rebaseAircraft, resolveAirBaseLoss, resolveAirStrike, resolvePatrolMission,
  resolveReconMission, baseNewAirUnit,
} from '@/systems/air-operations-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { calculateCombatStrengths } from '@/systems/combat-system';
import { NAVAL_DEPLETED_AT, NAVAL_EXTENDED_AT } from '@/systems/naval-endurance';

function aircraft(overrides: Partial<Unit> & { id: string }): Unit {
  return {
    type: 'bomber', owner: 'player', position: { q: 2, r: 2 }, movementPointsLeft: 6, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, airBase: { kind: 'city', cityId: 'city-1' },
    ...overrides,
  } as Unit;
}

function makeState(extra: Partial<GameState> = {}): GameState {
  const bomber = aircraft({ id: 'striker' });
  const target = { id: 'target', type: 'warrior', owner: 'enemy', position: { q: 5, r: 2 }, health: 100, experience: 0, movementPointsLeft: 1, hasMoved: false, hasActed: false, isResting: false } as Unit;
  return {
    gameId: 'air-readiness', turn: 9,
    map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {} },
    units: { striker: bomber, target, reserve: { ...target, id: 'reserve', position: { q: 9, r: 9 } } },
    cities: {
      'city-1': { id: 'city-1', name: 'Alba', owner: 'player', position: { q: 2, r: 2 }, buildings: ['airfield'] },
      'city-2': { id: 'city-2', name: 'Brea', owner: 'player', position: { q: 3, r: 2 }, buildings: ['airfield'] },
    },
    builtNationalProjects: {},
    civilizations: {
      player: { units: ['striker'], cities: ['city-1', 'city-2'], techState: { completed: [] }, diplomacy: { atWarWith: ['enemy'], events: [], treaties: [], relationships: {} } },
      enemy: { units: ['target', 'reserve'], cities: [], techState: { completed: [] }, diplomacy: { atWarWith: ['player'], events: [], treaties: [], relationships: {} } },
    },
    ...extra,
  } as unknown as GameState;
}

const withUnit = (state: GameState, unit: Unit): GameState => ({ ...state, units: { ...state.units, [unit.id]: unit } });
const strainOf = (state: GameState, id = 'striker') => state.units[id]?.airStrain ?? 0;

describe('air readiness (#884)', () => {
  it('a fresh aircraft is ready, and readiness is distinct from hasActed', () => {
    const state = makeState();
    expect(getAirReadinessStatus(state.units.striker!)).toBe('ready');
    const used = { ...state.units.striker!, hasActed: true };
    expect(getAirReadinessStatus(used)).toBe('ready');
  });

  it('a strike consumes more readiness than recon or patrol', () => {
    const struck = resolveAirStrike(makeState(), 'striker', { q: 5, r: 2 });
    expect(struck.ok).toBe(true);
    expect(strainOf(struck.state)).toBe(2);
    const recon = resolveReconMission(makeState(), 'striker', { q: 3, r: 2 });
    // bombers cannot recon; use an aircraft that can
    expect(recon.ok).toBe(false);
    const scout = makeState({ units: { s: aircraft({ id: 's', type: 'recon_aircraft' }) } as any, cities: { 'city-1': { id: 'city-1', owner: 'player', position: { q: 2, r: 2 }, buildings: ['airfield'] } } as any });
    const done = resolveReconMission(scout, 's', { q: 3, r: 2 });
    expect(done.ok).toBe(true);
    expect(strainOf(done.state, 's')).toBe(1);
  });

  it('crosses worn and spent thresholds, with combat and strike consequences', () => {
    const worn = aircraft({ id: 'w', airStrain: AIR_WORN_AT });
    const spent = aircraft({ id: 's', airStrain: AIR_SPENT_AT });
    expect(getAirReadinessStatus(worn)).toBe('worn');
    expect(getAirReadinessStatus(spent)).toBe('spent');
    expect(getAirReadinessCombatPenalty(worn).multiplier).toBe(0.9);
    expect(getAirReadinessCombatPenalty(spent).multiplier).toBe(0.8);
    expect(getAirReadinessCombatPenalty(spent).label).toMatch(/-20%/);
  });

  it('a spent aircraft cannot strike; target list, denial copy and executor all agree', () => {
    const state = withUnit(makeState(), aircraft({ id: 'striker', airStrain: AIR_SPENT_AT }));
    expect(getLegalAirMissionTargets(state, 'striker', 'strike')).toEqual([]);
    const denial = getAirMissionDenial(state, 'striker', 'strike');
    expect(denial?.reason).toBe('spent');
    expect(denial?.message).toMatch(/rest/i);
    const result = resolveAirStrike(state, 'striker', { q: 5, r: 2 });
    expect(result.ok).toBe(false);
    // a worn aircraft still strikes
    const wornState = withUnit(makeState(), aircraft({ id: 'striker', airStrain: AIR_WORN_AT }));
    expect(getAirMissionDenial(wornState, 'striker', 'strike')).toBeNull();
    expect(resolveAirStrike(wornState, 'striker', { q: 5, r: 2 }).ok).toBe(true);
  });

  it('readiness reaches combat through the canonical context, for striker and interceptor alike', () => {
    const base = makeState();
    const strikerReady = base.units.striker!;
    const strikerSpent = aircraft({ id: 'striker', airStrain: AIR_SPENT_AT });
    const target = base.units.target!;
    const strength = (u: Unit, isIntercepting = false) => {
      const s = withUnit(base, u);
      const ctx = buildCombatContextForDefender(s, u, target, { isIntercepting });
      return { ctx, v: calculateCombatStrengths(u, target, s.map, ctx).attackerStrength };
    };
    const a = strength(strikerReady);
    const b = strength(strikerSpent);
    expect(b.v).toBeCloseTo(a.v * 0.8, 5);
    expect(b.ctx.attackerAirReadinessFact).toMatchObject({ key: 'air-readiness', sourceVisibility: 'owner', outcome: 'applied' });
    expect(strength(strikerSpent, true).v).toBeLessThan(strength(strikerReady, true).v);
  });

  it('a city strike uses the same readiness factor', () => {
    const enemyCity = { id: 'ec', name: 'Enemy', owner: 'enemy', position: { q: 5, r: 2 }, buildings: [], population: 3, hp: 100 };
    const mk = (strain: number) => {
      let s = makeState();
      s = { ...s, cities: { ...s.cities, ec: enemyCity as any }, units: { striker: aircraft({ id: 'striker', airStrain: strain }), target: s.units.target, reserve: s.units.reserve } } as GameState;
      (s.civilizations as any).enemy.cities = ['ec'];
      return resolveAirStrike(s, 'striker', { q: 5, r: 2 });
    };
    const fresh = mk(0); const worn = mk(AIR_WORN_AT);
    expect(fresh.ok && worn.ok).toBe(true);
    const lost = (r: typeof fresh) => 100 - (r.state.cities.ec?.hp ?? 100);
    expect(lost(worn)).toBeLessThanOrEqual(lost(fresh));
  });

  it('rests recover at a healthy base, but not on a round the aircraft acted', () => {
    let state = withUnit(makeState(), aircraft({ id: 'striker', airStrain: 5 }));
    state = resolveAirReadinessForCiv(state, 'player');
    expect(strainOf(state)).toBe(3);
    const acted = resolveAirReadinessForCiv(withUnit(makeState(), aircraft({ id: 'striker', airStrain: 5, hasActed: true })), 'player');
    expect(strainOf(acted)).toBe(5);
    let long = withUnit(makeState(), aircraft({ id: 'striker', airStrain: AIR_MAX_STRAIN }));
    for (let i = 0; i < 6; i++) long = resolveAirReadinessForCiv(long, 'player');
    expect(long.units.striker!.airStrain).toBeUndefined();
  });

  it('strikes cannot be flown every turn at full effectiveness', () => {
    let strain = 0;
    for (let i = 0; i < 6; i++) {
      const fresh = withUnit(makeState(), aircraft({ id: 'striker', ...(strain ? { airStrain: strain } : {}) }));
      const r = resolveAirStrike(fresh, 'striker', { q: 5, r: 2 });
      if (!r.ok) break;
      // the round ends with the aircraft having acted: no recovery
      strain = resolveAirReadinessForCiv(r.state, 'player').units.striker!.airStrain ?? 0;
    }
    expect(strain).toBeGreaterThanOrEqual(AIR_SPENT_AT);
    const spentNow = withUnit(makeState(), aircraft({ id: 'striker', airStrain: strain }));
    expect(resolveAirStrike(spentNow, 'striker', { q: 5, r: 2 }).ok).toBe(false);
  });

  it('a damaged city base recovers more slowly; rebasing does not restore readiness', () => {
    const damaged = withUnit(makeState({ cities: { 'city-1': { id: 'city-1', name: 'Alba', owner: 'player', position: { q: 2, r: 2 }, buildings: ['airfield'], hp: 30 } } as any }), aircraft({ id: 'striker', airStrain: 5 }));
    expect(strainOf(resolveAirReadinessForCiv(damaged, 'player'))).toBe(4);
    const state = withUnit(makeState(), aircraft({ id: 'striker', airStrain: 5 }));
    const moved = rebaseAircraft(state, 'striker', { kind: 'city', cityId: 'city-2' });
    expect(moved.ok).toBe(true);
    expect(strainOf(moved.state)).toBe(5);
  });

  it('carriers: a depleted #883 carrier cannot sustain strikes or recovery; extended halves recovery', () => {
    const carrierUnit = (awayTurns: number) => ({ id: 'cv', type: 'carrier', owner: 'player', position: { q: 2, r: 2 }, health: 100, experience: 0, movementPointsLeft: 4, hasMoved: false, hasActed: false, isResting: false, ...(awayTurns ? { navalOps: { awayTurns } } : {}) }) as Unit;
    const onCarrier = (awayTurns: number, strain: number) => {
      let s = makeState();
      s = { ...s, units: { ...s.units, cv: carrierUnit(awayTurns), jet: aircraft({ id: 'jet', type: 'jet_fighter', airBase: { kind: 'carrier', unitId: 'cv' }, airStrain: strain }) } } as GameState;
      return s;
    };
    expect(strainOf(resolveAirReadinessForCiv(onCarrier(0, 5), 'player'), 'jet')).toBe(3);
    expect(strainOf(resolveAirReadinessForCiv(onCarrier(NAVAL_EXTENDED_AT, 5), 'player'), 'jet')).toBe(4);
    expect(strainOf(resolveAirReadinessForCiv(onCarrier(NAVAL_DEPLETED_AT, 5), 'player'), 'jet')).toBe(5);
    const depleted = onCarrier(NAVAL_DEPLETED_AT, 0);
    expect(getAirMissionDenial(depleted, 'jet', 'strike')?.reason).toBe('carrier-depleted');
    expect(getAirMissionDenial(onCarrier(0, 0), 'jet', 'strike')).toBeNull();
    expect(getAirReadinessState(depleted, depleted.units.jet!).reasons.join(' ')).toMatch(/carrier/i);
  });

  it('lost bases: an evacuated aircraft keeps its strain, a captured one comes up fresh, a lost carrier removes the wing', () => {
    const state = makeState({ gameId: 'g', civilizations: { player: { units: ['striker'] }, enemy: { units: [] } } as any });
    const strained = withUnit(state, aircraft({ id: 'striker', airStrain: 5 }));
    const evac = resolveAirBaseLoss(strained, { kind: 'city', cityId: 'city-1' }, { kind: 'facility-removed' });
    expect(evac.outcomes[0]!.outcome).toBe('evacuated');
    expect(strainOf(evac.state)).toBe(5);
    for (let turn = 1; turn < 30; turn++) {
      const cap = resolveAirBaseLoss({ ...strained, turn }, { kind: 'city', cityId: 'city-1' }, { kind: 'captured', victorId: 'enemy' });
      if (cap.outcomes[0]!.outcome === 'captured') {
        expect(cap.state.units.striker!.airStrain).toBeUndefined();
        return;
      }
    }
    throw new Error('expected a captured outcome for some turn');
  });

  it('new aircraft come out ready; malformed values read as ready; no hidden leak to another viewer is possible from the status fn', () => {
    const state = makeState();
    const based = baseNewAirUnit(state, 'city-2', aircraft({ id: 'new', airBase: undefined }));
    expect(based.ok && getAirReadinessStatus(based.state.units.new!)).toBe('ready');
    for (const bad of [-3, NaN, 'x' as any, null as any]) expect(getAirReadinessStatus(aircraft({ id: 'z', airStrain: bad }))).toBe('ready');
  });

  it('is deterministic, immutable and a no-op for a ready wing', () => {
    const state = makeState();
    expect(resolveAirReadinessForCiv(state, 'player')).toBe(state);
    const strained = withUnit(state, aircraft({ id: 'striker', airStrain: 4 }));
    expect(resolveAirReadinessForCiv(strained, 'player')).toEqual(resolveAirReadinessForCiv(strained, 'player'));
    expect(strained.units.striker!.airStrain).toBe(4);
  });

  it('patrol uses the same readiness ledger', () => {
    const sub = makeState({ units: { p: aircraft({ id: 'p', type: 'maritime_patrol_aircraft' as any }) } as any });
    const res = resolvePatrolMission(sub, 'p', { q: 2, r: 2 });
    expect(res.ok).toBe(true);
    expect(strainOf(res.state, 'p')).toBe(1);
  });
});
