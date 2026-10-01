import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import {
  NAVAL_DEPLETED_AT,
  NAVAL_EXTENDED_AT,
  NAVAL_PORT_RADIUS,
  getNavalEnduranceStatus,
  getNavalOperationalState,
  getNavalOperationsCombatPenalty,
  getNavalOperationsMovementPenalty,
  resolveNavalOperationsForCiv,
} from '@/systems/naval-operations';
import { resolveLandSupplyForCiv } from '@/systems/supply-system';
import { resetUnitTurn } from '@/systems/unit-lifecycle';

/** Land is q <= 5 (rome-owned), ocean is q >= 6. Rome's port city sits on the shore at (5,5). */
function makeState(opts: { harbor?: boolean; portOwner?: string } = {}): GameState {
  const map: GameMap = { width: 40, height: 20, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 40; q++) {
    for (let r = 0; r < 20; r++) {
      const coord = { q, r };
      const land = q <= 5;
      map.tiles[hexKey(coord)] = {
        coord, terrain: land ? 'grassland' : 'ocean', elevation: 'lowland', resource: null,
        improvement: 'none', owner: land ? 'rome' : null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const cities: GameState['cities'] = {
    port: {
      id: 'port', name: 'Ostia', owner: opts.portOwner ?? 'rome', position: { q: 5, r: 5 },
      buildings: opts.harbor ? ['harbor'] : [],
    } as unknown as City,
  };
  return {
    map, cities, units: {}, turn: 10, currentPlayer: 'rome',
    civilizations: { rome: { techState: { completed: [] }, units: [], cities: ['port'] } as any },
  } as unknown as GameState;
}

function ship(overrides: Partial<Unit> & { id: string; position: Unit['position'] }): Unit {
  return {
    type: 'trireme', owner: 'rome', health: 100, movementPointsLeft: 3, hasMoved: false, hasActed: false,
    isResting: false, experience: 0,
    ...overrides,
  } as Unit;
}

function withUnit(state: GameState, unit: Unit): GameState {
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

const FAR = { q: 30, r: 5 };

describe('naval operational endurance (#883)', () => {
  it('a newly built ship is ready and reports no consequences', () => {
    const state = withUnit(makeState(), ship({ id: 's1', type: 'galley', position: { q: 6, r: 5 } }));
    const ops = getNavalOperationalState(state, state.units.s1!);
    expect(ops.participates).toBe(true);
    expect(ops.status).toBe('ready');
    expect(ops.combatMultiplier).toBe(1);
    expect(ops.movementPenalty).toBe(0);
  });

  it('operating away from support accumulates turns and crosses each threshold', () => {
    let state = withUnit(makeState(), ship({ id: 's1', type: 'galley', position: FAR }));
    const seen: Record<number, string> = {};
    for (let turn = 1; turn <= NAVAL_DEPLETED_AT + 1; turn++) {
      state = resolveNavalOperationsForCiv(state, 'rome');
      seen[turn] = getNavalEnduranceStatus(state.units.s1!);
    }
    expect(seen[NAVAL_EXTENDED_AT - 1]).toBe('ready');
    expect(seen[NAVAL_EXTENDED_AT]).toBe('extended');
    expect(seen[NAVAL_DEPLETED_AT - 1]).toBe('extended');
    expect(seen[NAVAL_DEPLETED_AT]).toBe('depleted');
  });

  it('a ship cannot operate forever for free: the penalties apply and are bounded', () => {
    let state = withUnit(makeState(), ship({ id: 's1', type: 'galley', position: FAR }));
    for (let i = 0; i < 200; i++) state = resolveNavalOperationsForCiv(state, 'rome');
    const unit = state.units.s1!;
    expect(getNavalEnduranceStatus(unit)).toBe('depleted');
    expect(getNavalOperationsCombatPenalty(unit).multiplier).toBeLessThan(1);
    expect(getNavalOperationsMovementPenalty(unit)).toBe(1);
    expect(unit.navalOps!.awayTurns).toBeLessThan(40); // capped: recovery time stays bounded
  });

  it('extended costs combat only; depleted adds one movement point but never strands the ship', () => {
    const extended = ship({ id: 's1', position: FAR, navalOps: { awayTurns: NAVAL_EXTENDED_AT } });
    const depleted = ship({ id: 's2', position: FAR, navalOps: { awayTurns: NAVAL_DEPLETED_AT } });
    expect(getNavalOperationsCombatPenalty(extended).multiplier).toBe(0.9);
    expect(getNavalOperationsMovementPenalty(extended)).toBe(0);
    expect(getNavalOperationsCombatPenalty(depleted).multiplier).toBe(0.8);
    expect(getNavalOperationsMovementPenalty(depleted)).toBe(1);
    expect(getNavalOperationsCombatPenalty(extended).label).toMatch(/-10%/);
    // Movement: feeds the one canonical per-turn allowance, floor 1.
    expect(resetUnitTurn(depleted).movementPointsLeft).toBe(Math.max(1, 4 - 1));
    expect(resetUnitTurn({ ...depleted, type: 'galley' }).movementPointsLeft).toBeGreaterThanOrEqual(1);
  });

  it('combat counts as high-intensity: acting while away burns extra endurance', () => {
    const idle = resolveNavalOperationsForCiv(withUnit(makeState(), ship({ id: 's1', position: FAR })), 'rome');
    const fought = resolveNavalOperationsForCiv(withUnit(makeState(), ship({ id: 's1', position: FAR, hasActed: true })), 'rome');
    expect(fought.units.s1!.navalOps!.awayTurns).toBeGreaterThan(idle.units.s1!.navalOps!.awayTurns);
    const rested = resolveNavalOperationsForCiv(withUnit(makeState(), ship({ id: 's1', position: FAR, hasActed: true, isResting: true })), 'rome');
    expect(rested.units.s1!.navalOps!.awayTurns).toBe(idle.units.s1!.navalOps!.awayTurns);
  });

  it('returning to port recovers predictably: near a port eases, in port fully restores', () => {
    const near = { q: 5 + NAVAL_PORT_RADIUS, r: 5 };
    let state = withUnit(makeState(), ship({ id: 's1', position: near, navalOps: { awayTurns: NAVAL_DEPLETED_AT } }));
    state = resolveNavalOperationsForCiv(state, 'rome');
    expect(state.units.s1!.navalOps!.awayTurns).toBeLessThan(NAVAL_DEPLETED_AT);
    expect(getNavalOperationalState(state, state.units.s1!).supportSource?.cityName).toBe('Ostia');

    state = withUnit(state, { ...state.units.s1!, position: { q: 5, r: 5 } });
    state = resolveNavalOperationsForCiv(state, 'rome');
    expect(getNavalEnduranceStatus(state.units.s1!)).toBe('ready');
    expect(state.units.s1!.navalOps).toBeUndefined();
  });

  it('a harbor extends the support radius', () => {
    const edge = { q: 5 + NAVAL_PORT_RADIUS + 1, r: 5 };
    const plain = withUnit(makeState(), ship({ id: 's1', position: edge }));
    const harbor = withUnit(makeState({ harbor: true }), ship({ id: 's1', position: edge }));
    expect(getNavalOperationalState(plain, plain.units.s1!).supportSource).toBeNull();
    expect(getNavalOperationalState(harbor, harbor.units.s1!).supportSource?.cityName).toBe('Ostia');
  });

  it('a captured or razed port stops supporting the fleet immediately', () => {
    const state = withUnit(makeState({ portOwner: 'carthage' }), ship({ id: 's1', position: { q: 6, r: 5 } }));
    expect(getNavalOperationalState(state, state.units.s1!).supportSource).toBeNull();
    const next = resolveNavalOperationsForCiv(state, 'rome');
    expect(next.units.s1!.navalOps?.awayTurns).toBe(1);
    const razed = withUnit({ ...makeState(), cities: {} } as GameState, ship({ id: 's1', position: { q: 6, r: 5 } }));
    expect(getNavalOperationalState(razed, razed.units.s1!).supportSource).toBeNull();
  });

  it('Open Borders / alliance with a foreign port grant passage, not replenishment', () => {
    const state = withUnit(makeState({ portOwner: 'carthage' }), ship({ id: 's1', position: { q: 6, r: 5 }, navalOps: { awayTurns: 8 } }));
    (state as any).civilizations.rome.diplomacy = { relationships: { carthage: 90 }, treaties: [
      { type: 'open_borders', civA: 'rome', civB: 'carthage' },
      { type: 'alliance', civA: 'rome', civB: 'carthage' },
    ], atWarWith: [] };
    const next = resolveNavalOperationsForCiv(state, 'rome');
    expect(next.units.s1!.navalOps!.awayTurns).toBe(9);
  });

  it('carriers and transports participate; civilian traders, minor civs and pirates do not', () => {
    const state = makeState();
    expect(getNavalOperationalState(withUnit(state, ship({ id: 'c', type: 'carrier', position: FAR })), ship({ id: 'c', type: 'carrier', position: FAR })).participates).toBe(true);
    expect(getNavalOperationalState(state, ship({ id: 't', type: 'troop_transport', position: FAR })).participates).toBe(true);
    expect(getNavalOperationalState(state, ship({ id: 'n', type: 'naval_trader', position: FAR })).participates).toBe(false);
    expect(getNavalOperationalState(state, ship({ id: 'p', owner: 'pirate', position: FAR })).participates).toBe(false);
    expect(getNavalOperationalState(state, ship({ id: 'm', owner: 'mc-athens', position: FAR })).participates).toBe(false);
    expect(getNavalEnduranceStatus(ship({ id: 'p', owner: 'pirate', position: FAR, navalOps: { awayTurns: 99 } }))).toBe('ready');
  });

  it('a land unit and its shore-supply assignment are untouched', () => {
    let state = withUnit(makeState(), ship({ id: 's1', position: FAR }));
    state = withUnit(state, { id: 'w1', type: 'warrior', owner: 'rome', position: { q: 2, r: 2 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit);
    const after = resolveNavalOperationsForCiv(state, 'rome');
    expect(after.units.w1).toBe(state.units.w1);
    const landA = resolveLandSupplyForCiv(state, 'rome');
    const landB = resolveLandSupplyForCiv(after, 'rome');
    expect(landB.units.w1!.landSupply).toEqual(landA.units.w1!.landSupply);
    expect(landB.units.s1!.landSupply).toBeUndefined();
  });

  it('is deterministic, immutable and idempotent for a ready ship in port', () => {
    const state = withUnit(makeState(), ship({ id: 's1', position: { q: 5, r: 5 } }));
    expect(resolveNavalOperationsForCiv(state, 'rome')).toBe(state);
    const far = withUnit(makeState(), ship({ id: 's1', position: FAR }));
    const a = resolveNavalOperationsForCiv(far, 'rome');
    const b = resolveNavalOperationsForCiv(far, 'rome');
    expect(a).toEqual(b);
    expect(far.units.s1!.navalOps).toBeUndefined();
  });

  it('tolerates a malformed saved value without stranding the navy', () => {
    for (const bad of [{ awayTurns: -4 }, { awayTurns: NaN }, { awayTurns: 'x' }, {}, null] as any[]) {
      const unit = ship({ id: 's1', position: FAR, navalOps: bad });
      expect(getNavalEnduranceStatus(unit)).toBe('ready');
    }
  });

  it('explains what is wrong and how long recovery takes', () => {
    const state = withUnit(makeState(), ship({ id: 's1', position: FAR, navalOps: { awayTurns: NAVAL_EXTENDED_AT } }));
    const ops = getNavalOperationalState(state, state.units.s1!);
    expect(ops.status).toBe('extended');
    expect(ops.turnsToNextStage).toBe(NAVAL_DEPLETED_AT - NAVAL_EXTENDED_AT);
    expect(ops.reasons.join(' ')).toMatch(/support/i);
    expect(ops.etaToSupportTurns).toBeGreaterThan(0);
  });
});

describe('naval operations in canonical combat (#883)', () => {
  it('the combat context carries one fact that calculateCombatStrengths consumes for attacker and defender alike', async () => {
    const { buildCombatContextForDefender } = await import('@/systems/combat-context');
    const { calculateCombatStrengths } = await import('@/systems/combat-system');
    const base = makeState();
    const target = { q: 31, r: 5 };
    const fresh = ship({ id: 'a', type: 'frigate', position: { q: 30, r: 5 } });
    const worn = ship({ id: 'a', type: 'frigate', position: { q: 30, r: 5 }, navalOps: { awayTurns: NAVAL_DEPLETED_AT } });
    const foe = ship({ id: 'd', type: 'frigate', owner: 'carthage', position: target });
    const strengthOf = (attacker: Unit, defender: Unit) => {
      const state = { ...base, units: { [attacker.id]: attacker, [defender.id]: defender } } as GameState;
      const context = buildCombatContextForDefender(state, attacker, defender);
      return { context, strengths: calculateCombatStrengths(attacker, defender, state.map, context) };
    };
    const ready = strengthOf(fresh, foe);
    const depleted = strengthOf(worn, foe);
    expect(ready.context.attackerNavalOperationsFact).toBeUndefined();
    expect(depleted.context.attackerNavalOperationsFact).toMatchObject({ key: 'naval-operations', outcome: 'applied', value: 0.8, sourceVisibility: 'owner' });
    expect(depleted.strengths.attackerStrength).toBeCloseTo(ready.strengths.attackerStrength * 0.8, 5);
    expect(depleted.strengths.attackerModifierFacts).toContainEqual(expect.objectContaining({ key: 'naval-operations' }));
    // A depleted DEFENDER weakens identically.
    const asDefender = strengthOf(foe, worn);
    const asDefenderReady = strengthOf(foe, fresh);
    expect(asDefender.strengths.defenderStrength).toBeCloseTo(asDefenderReady.strengths.defenderStrength * 0.8, 5);
  });

  it('a land unit fighting a ship is never touched by naval operations', async () => {
    const { buildCombatContextForDefender } = await import('@/systems/combat-context');
    const state = withUnit(makeState(), ship({ id: 'a', type: 'warrior', position: { q: 3, r: 3 }, navalOps: { awayTurns: 99 } }));
    const context = buildCombatContextForDefender(state, state.units.a!, ship({ id: 'd', owner: 'carthage', position: { q: 4, r: 3 } }));
    expect(context.attackerNavalOperationsMultiplier).toBe(1);
  });
});

describe('naval operations and saves (#883)', () => {
  it('a pre-#883 save loads with every navy ready and processes a round unchanged', async () => {
    const { createNewGame } = await import('@/core/game-state');
    const { normalizeLoadedStateForTest } = await import('@/storage/save-manager');
    const game = createNewGame(undefined, 'naval-ops-old-save', 'small');
    const loaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(game)));
    for (const unit of Object.values(loaded.units)) expect(getNavalEnduranceStatus(unit)).toBe('ready');
  });

  it('a mid-endurance ship round-trips through save/load with its history intact', async () => {
    const { createNewGame } = await import('@/core/game-state');
    const { normalizeLoadedStateForTest } = await import('@/storage/save-manager');
    const game = createNewGame(undefined, 'naval-ops-mid', 'small');
    const owner = game.currentPlayer;
    const hull = { ...ship({ id: 'ship-x', owner, position: { q: 3, r: 3 }, navalOps: { awayTurns: 9 } }) };
    game.units = { ...game.units, [hull.id]: hull };
    game.civilizations[owner]!.units = [...game.civilizations[owner]!.units, hull.id];
    const loaded = normalizeLoadedStateForTest(JSON.parse(JSON.stringify(game)));
    expect(loaded.units['ship-x']!.navalOps).toEqual({ awayTurns: 9 });
    expect(getNavalEnduranceStatus(loaded.units['ship-x']!)).toBe('extended');
  });
});
