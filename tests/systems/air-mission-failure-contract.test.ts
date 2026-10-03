import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import {
  AIR_MISSION_FAILURE_MESSAGES,
  baseNewAirUnit,
  getAirStrikeDenial,
  rebaseAircraft,
  resolveAirStrike,
  resolvePatrolMission,
  resolveReconMission,
  startIntercept,
} from '@/systems/air-operations-system';
import type {
  AirBaseCheck,
  AirMissionFailureReason,
  AirOperationResult,
  AirStrikeResult,
} from '@/systems/air-operations-system';
import { AIR_MISSION_DENIAL_MESSAGES } from '@/systems/air-readiness';

// #1223: every air-mission failure is a closed string union with exhaustive player copy, never a free string.

const base: Unit = {
  id: 'air-1', type: 'bomber', owner: 'player', position: { q: 2, r: 2 },
  movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false,
  isResting: false, airBase: { kind: 'city', cityId: 'city-1' },
};

function makeState(units: Record<string, Unit>, extra: Partial<GameState> = {}): GameState {
  return {
    gameId: 'air-failure-contract', turn: 9,
    map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {} },
    units,
    cities: {
      'city-1': { id: 'city-1', name: 'Home', owner: 'player', position: { q: 2, r: 2 }, buildings: ['airfield'] },
      // A far-away enemy city keeps the enemy alive when a legal strike kills its only field unit.
      'enemy-city': { id: 'enemy-city', name: 'Far', owner: 'enemy', position: { q: 9, r: 9 }, buildings: [] },
    },
    builtNationalProjects: {},
    civilizations: {
      player: { units: Object.keys(units), cities: ['city-1'], techState: { completed: [] }, diplomacy: { atWarWith: ['enemy'], events: [], treaties: [], relationships: {} } },
      enemy: { units: [], cities: ['enemy-city'], techState: { completed: [] }, diplomacy: { atWarWith: ['player'], events: [], treaties: [], relationships: {} } },
    },
    ...extra,
  } as unknown as GameState;
}

function withEnemyTarget(extra: Partial<Unit> = {}, visibleTiles: Record<string, 'visible' | 'fogged'> | null = null): GameState {
  const state = makeState({
    striker: { ...base, id: 'striker' },
    target: { ...base, id: 'target', type: 'warrior', owner: 'enemy', position: { q: 5, r: 2 }, airBase: undefined },
  });
  state.units.striker = { ...state.units.striker!, ...extra };
  if (visibleTiles) state.civilizations.player = { ...state.civilizations.player!, visibility: { tiles: visibleTiles } } as never;
  return state;
}

function expectRefusal(result: AirOperationResult | AirStrikeResult, state: GameState, reason: AirMissionFailureReason): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toBe(reason);
  expect(result.state).toBe(state);
  expect(AIR_MISSION_FAILURE_MESSAGES[result.reason].trim().length).toBeGreaterThan(0);
}

describe('air mission failure copy', () => {
  it('gives every reason non-empty, distinct-enough player copy with no generic fallback', () => {
    const reasons = Object.keys(AIR_MISSION_FAILURE_MESSAGES) as AirMissionFailureReason[];
    expect(reasons.length).toBeGreaterThan(10);
    for (const reason of reasons) {
      const copy = AIR_MISSION_FAILURE_MESSAGES[reason];
      expect(copy.trim().length, reason).toBeGreaterThan(10);
    }
  });

  it('reuses the #884 readiness copy verbatim instead of restating it', () => {
    expect(AIR_MISSION_FAILURE_MESSAGES.spent).toBe(AIR_MISSION_DENIAL_MESSAGES.spent);
    expect(AIR_MISSION_FAILURE_MESSAGES['carrier-depleted']).toBe(AIR_MISSION_DENIAL_MESSAGES['carrier-depleted']);
  });

  it('never names owner-private hidden state (interceptors, air defence, enemy readiness, private tech)', () => {
    for (const copy of Object.values(AIR_MISSION_FAILURE_MESSAGES)) {
      expect(copy).not.toMatch(/interceptor|intercepted|air defen[cs]e|SAM|enemy (readiness|aircraft|base)|their tech/i);
    }
  });
});

describe('typed air mission failure results (#1223)', () => {
  it('strike: a missing or non-strike aircraft is ineligible', () => {
    const state = withEnemyTarget();
    expectRefusal(resolveAirStrike(state, 'nobody', { q: 5, r: 2 }), state, 'ineligible-strike');

    const recon = makeState({ recon: { ...base, id: 'recon', type: 'recon_aircraft' } });
    expectRefusal(resolveAirStrike(recon, 'recon', { q: 5, r: 2 }), recon, 'ineligible-strike');

    const unbased = withEnemyTarget({ airBase: undefined });
    expectRefusal(resolveAirStrike(unbased, 'striker', { q: 5, r: 2 }), unbased, 'ineligible-strike');
  });

  it('strike: an aircraft that already flew this turn reports already-acted', () => {
    const state = withEnemyTarget({ hasActed: true });
    expectRefusal(resolveAirStrike(state, 'striker', { q: 5, r: 2 }), state, 'already-acted');
  });

  it('strike: a target beyond operational range reports out-of-range', () => {
    const state = withEnemyTarget();
    expectRefusal(resolveAirStrike(state, 'striker', { q: 9, r: 9 }), state, 'out-of-range');
  });

  it('strike: an in-range hex that is not a legal target reports invalid-strike-target', () => {
    const state = withEnemyTarget();
    expectRefusal(resolveAirStrike(state, 'striker', { q: 3, r: 2 }), state, 'invalid-strike-target');
  });

  it('strike: readiness composes through the same union (#884 owns the rule)', () => {
    const spent = withEnemyTarget({ airStrain: 8 });
    expectRefusal(resolveAirStrike(spent, 'striker', { q: 5, r: 2 }), spent, 'spent');
  });

  it('strike: the legal path is untouched', () => {
    const state = withEnemyTarget();
    const result = resolveAirStrike(state, 'striker', { q: 5, r: 2 });
    expect(result.ok).toBe(true);
    expect(result.state.units.striker?.hasActed).toBe(true);
  });

  it('getAirStrikeDenial is the one strike eligibility source and agrees with resolveAirStrike', () => {
    const cases: Array<[GameState, string, { q: number; r: number }]> = [
      [withEnemyTarget(), 'striker', { q: 5, r: 2 }],
      [withEnemyTarget(), 'nobody', { q: 5, r: 2 }],
      [withEnemyTarget({ hasActed: true }), 'striker', { q: 5, r: 2 }],
      [withEnemyTarget(), 'striker', { q: 9, r: 9 }],
      [withEnemyTarget(), 'striker', { q: 3, r: 2 }],
      [withEnemyTarget({ airStrain: 8 }), 'striker', { q: 5, r: 2 }],
    ];
    for (const [state, unitId, target] of cases) {
      const denial = getAirStrikeDenial(state, unitId, target);
      const result = resolveAirStrike(state, unitId, target);
      expect(result.ok, `${unitId} ${JSON.stringify(target)}`).toBe(denial === null);
      if (!result.ok) expect(result.reason).toBe(denial);
    }
  });

  it('recon: an illegal center, a spent action and a missing aircraft each get their own reason', () => {
    const state = makeState({ recon: { ...base, id: 'recon', type: 'recon_aircraft' } }, {
      civilizations: { player: { visibility: { tiles: {} } } } as never,
    });
    expectRefusal(resolveReconMission(state, 'recon', { q: 99, r: 99 }), state, 'invalid-recon-target');
    expectRefusal(resolveReconMission(state, 'nobody', { q: 4, r: 2 }), state, 'missing-unit');
    const acted = makeState({ recon: { ...base, id: 'recon', type: 'recon_aircraft', hasActed: true } });
    expectRefusal(resolveReconMission(acted, 'recon', { q: 4, r: 2 }), acted, 'already-acted');
  });

  it('patrol: an illegal center, a spent action and a missing aircraft each get their own reason', () => {
    const state = makeState({ patrol: { ...base, id: 'patrol', type: 'maritime_patrol_aircraft' } });
    expectRefusal(resolvePatrolMission(state, 'patrol', { q: 99, r: 99 }), state, 'invalid-patrol-target');
    expectRefusal(resolvePatrolMission(state, 'nobody', { q: 4, r: 2 }), state, 'missing-unit');
    const acted = makeState({ patrol: { ...base, id: 'patrol', type: 'maritime_patrol_aircraft', hasActed: true } });
    expectRefusal(resolvePatrolMission(acted, 'patrol', { q: 4, r: 2 }), acted, 'already-acted');
  });

  it('intercept stance: a non-fighter is ineligible, a fighter that already acted reports already-acted', () => {
    const ground = makeState({ grunt: { ...base, id: 'grunt', type: 'warrior', airBase: undefined } });
    expectRefusal(startIntercept(ground, 'grunt'), ground, 'ineligible-interceptor');
    const acted = makeState({ jet: { ...base, id: 'jet', type: 'jet_fighter', hasActed: true } });
    expectRefusal(startIntercept(acted, 'jet'), acted, 'already-acted');
    const fresh = makeState({ jet: { ...base, id: 'jet', type: 'jet_fighter' } });
    expect(startIntercept(fresh, 'jet').ok).toBe(true);
  });

  it('rebase: missing unit, not-based aircraft, spent action and an unreachable base are typed', () => {
    const state = makeState({ air: { ...base, id: 'air' } });
    const far = { kind: 'city' as const, cityId: 'nowhere' };
    expectRefusal(rebaseAircraft(state, 'nobody', far), state, 'missing-unit');
    expectRefusal(rebaseAircraft(state, 'air', far), state, 'invalid-destination');
    const unbased = makeState({ air: { ...base, id: 'air', airBase: undefined } });
    expectRefusal(rebaseAircraft(unbased, 'air', far), unbased, 'not-based-aircraft');
    const acted = makeState({ air: { ...base, id: 'air', hasActed: true } });
    expectRefusal(rebaseAircraft(acted, 'air', far), acted, 'already-acted');
  });

  it('basing a new aircraft reports the base reason through the same union', () => {
    const full = makeState({
      a: { ...base, id: 'a' }, b: { ...base, id: 'b' }, c: { ...base, id: 'c' },
    });
    const fresh: Unit = { ...base, id: 'd', airBase: undefined };
    const result = baseNewAirUnit(full, 'city-1', fresh);
    expectRefusal(result, full, 'base-full');
    const check: AirBaseCheck = { ok: false, reason: 'base-full' };
    expect(AIR_MISSION_FAILURE_MESSAGES[check.reason]).toBeTruthy();
  });

  describe('hidden state does not leak through a refusal', () => {
    it('a strike at a hex holding an unseen hostile unit is refused exactly like a strike at an empty hex', () => {
      // The enemy unit sits at 5,2 but the player's visibility only covers the empty hex 3,2.
      const hiddenUnit = withEnemyTarget({}, { '3,2': 'visible' });
      const emptyHex = withEnemyTarget({}, { '3,2': 'visible' });
      emptyHex.units = { striker: emptyHex.units.striker! };

      const atHidden = resolveAirStrike(hiddenUnit, 'striker', { q: 5, r: 2 });
      const atEmpty = resolveAirStrike(emptyHex, 'striker', { q: 5, r: 2 });

      expect(atHidden.ok).toBe(false);
      expect(atEmpty.ok).toBe(false);
      if (atHidden.ok || atEmpty.ok) return;
      expect(atHidden.reason).toBe(atEmpty.reason);
      expect(AIR_MISSION_FAILURE_MESSAGES[atHidden.reason]).toBe(AIR_MISSION_FAILURE_MESSAGES[atEmpty.reason]);
    });

    it('a stale target and a never-legal target share one safe explanation', () => {
      expect(AIR_MISSION_FAILURE_MESSAGES['missing-target']).toBe(AIR_MISSION_FAILURE_MESSAGES['invalid-strike-target']);
    });
  });
});

describe('the public result types are closed unions, not strings (#1223)', () => {
  it('rejects a free-string or misspelled reason at compile time', () => {
    // `tsc` (yarn build) is what enforces these; at runtime they only prove the fixtures are constructible.
    const typo: AirOperationResult = {
      ok: false,
      state: {} as GameState,
      // @ts-expect-error -- a typo is not an AirMissionFailureReason
      reason: 'ineligble-interceptor',
    };
    const freeString: AirStrikeResult = {
      ok: false,
      state: {} as GameState,
      // @ts-expect-error -- an arbitrary sentence is not an AirMissionFailureReason
      reason: 'The aircraft is busy',
    };
    expect(typo.ok).toBe(false);
    expect(freeString.ok).toBe(false);
  });

  it('keeps the strike-only reasons out of the operation union', () => {
    const operation: AirOperationResult = {
      ok: false,
      state: {} as GameState,
      // @ts-expect-error -- out-of-range is a strike reason; recon/patrol/rebase never produce it
      reason: 'out-of-range',
    };
    expect(operation.ok).toBe(false);
  });
});
