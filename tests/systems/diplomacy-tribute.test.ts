import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { processTurn } from '@/core/turn-manager';
import { assertTreatyReciprocity } from '../helpers/save-state-invariants';
import {
  TRIBUTE_COOLDOWN_ROUNDS,
  TRIBUTE_DURATION_ROUNDS,
  TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY,
  TRIBUTE_RELATIONSHIP_FLOOR,
  TRIBUTE_STRENGTH_RATIO,
  acceptTributeDemand,
  demandTribute,
  getLiveTributeBetween,
  getTributeDemandEligibility,
  refuseTributeDemand,
  settleTributeForCiv,
} from '@/systems/diplomacy-tribute';
import { acceptDiplomaticRequest, declareMajorWar, rejectDiplomaticRequest } from '@/systems/diplomacy-system';
import { tickTreaties } from '@/systems/diplomacy-treaties';
import { buildViewerMilitaryIntel, estimatePerceivedCivStrength } from '@/systems/diplomatic-strength';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { hexKey } from '@/systems/hex-utils';

import { DEMANDER, HIDDEN_SPOT, TARGET, TARGET_SPOT, addUnit, makeTributeState as makeState, techsThroughEra } from './helpers/tribute-fixture';

const bus = () => new EventBus();
const wire = (state: GameState) => {
  const result = demandTribute(state, DEMANDER, TARGET, bus());
  if (!result.ok) throw new Error(`demand denied: ${result.reason}`);
  return result;
};
const reason = (state: GameState) => {
  const result = getTributeDemandEligibility(state, DEMANDER, TARGET);
  return result.ok ? 'ok' : result.reason;
};

function signed(state: GameState): GameState {
  const demand = wire(state);
  const accepted = acceptTributeDemand(demand.state, TARGET, demand.request.id, bus());
  if (!accepted.ok) throw new Error(`accept denied: ${accepted.reason}`);
  return accepted.state;
}

/** One round in per-civ phase order for the pair: settle, then tick the civ's treaties. */
function round(state: GameState): { state: GameState; paid: number } {
  let next = state;
  const before = next.civilizations[TARGET].gold;
  let paid = 0;
  for (const civId of [DEMANDER, TARGET]) {
    const settled = settleTributeForCiv(next, civId, bus());
    next = settled.state;
    for (const [id, delta] of Object.entries(settled.goldDeltaByCiv)) {
      next = { ...next, civilizations: { ...next.civilizations, [id]: { ...next.civilizations[id], gold: next.civilizations[id].gold + delta } } };
    }
    paid += settled.goldDeltaByCiv[TARGET] ?? 0;
    const civ = next.civilizations[civId];
    next = { ...next, civilizations: { ...next.civilizations, [civId]: { ...civ, diplomacy: tickTreaties(civ.diplomacy) } } };
  }
  expect(next.civilizations[TARGET].gold - before).toBe(paid);
  return { state: next, paid };
}

describe('tribute demand eligibility (#1334)', () => {
  it('is allowed when every condition holds, with era-scaled terms', () => {
    const state = makeState();
    expect(resolveCivilizationEra(state.civilizations[DEMANDER].techState.completed)).toBeGreaterThanOrEqual(3);
    const result = getTributeDemandEligibility(state, DEMANDER, TARGET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const era = resolveCivilizationEra(state.civilizations[DEMANDER].techState.completed);
      expect(result.terms).toEqual({ demanderId: DEMANDER, payerId: TARGET, goldPerRound: 5 + era, rounds: TRIBUTE_DURATION_ROUNDS });
    }
  });

  it('is denied before era 3', () => {
    const state = makeState();
    state.civilizations[DEMANDER].techState.completed = techsThroughEra(1);
    expect(reason(state)).toBe('too-early');
  });

  it('is denied without contact', () => {
    const state = makeState();
    state.civilizations[DEMANDER].knownCivilizations = [];
    state.civilizations[TARGET].knownCivilizations = [];
    state.civilizations[DEMANDER].visibility.tiles = {};
    expect(reason(state)).toBe('no-contact');
  });

  it('treats a met civilization with no observed military as unknown, not weak', () => {
    const state = makeState();
    state.civilizations[DEMANDER].visibility.tiles = {};
    expect(reason(state)).toBe('unknown-military');
  });

  it('ignores hidden target units entirely (differential)', () => {
    const base = makeState();
    const hidden = makeState();
    for (let i = 0; i < 20; i++) addUnit(hidden, TARGET, 'tank', HIDDEN_SPOT, `hidden-tank-${i}`);
    expect(reason(hidden)).toBe(reason(base));
    expect(getTributeDemandEligibility(hidden, DEMANDER, TARGET)).toEqual(getTributeDemandEligibility(base, DEMANDER, TARGET));
  });

  it('changes with legitimately visible military', () => {
    const state = makeState();
    for (let i = 0; i < 12; i++) {
      const tank = addUnit(state, TARGET, 'tank', TARGET_SPOT, `visible-tank-${i}`);
      state.civilizations[DEMANDER].visibility.tiles[hexKey(tank.position)] = 'visible';
    }
    expect(reason(state)).toBe('not-strong-enough');
  });

  it('requires 1.5x the target\'s upper uncertainty bound: 1.49x denied, 1.5x allowed', () => {
    const state = makeState();
    const demander = state.civilizations[DEMANDER];
    // Start from a demander too weak, then add warriors one at a time until the ratio first reaches 1.5.
    for (const id of [...demander.units].filter(unitId => state.units[unitId].type === 'swordsman')) {
      delete state.units[id];
      demander.units = demander.units.filter(unitId => unitId !== id);
    }
    let previous = 'not-strong-enough';
    let crossed = false;
    for (let i = 0; i < 40 && !crossed; i++) {
      addUnit(state, DEMANDER, 'warrior', { q: 1 + (i % 6), r: 1 + Math.floor(i / 6) }, `ratio-warrior-${i}`);
      const intel = buildViewerMilitaryIntel(state, DEMANDER);
      const own = estimatePerceivedCivStrength(intel, DEMANDER, 3).midpoint;
      const theirs = estimatePerceivedCivStrength(intel, TARGET, 3).uncertaintyUpper;
      const current = reason(state);
      if (own >= TRIBUTE_STRENGTH_RATIO * theirs) {
        expect(current).toBe('ok');
        expect(previous).toBe('not-strong-enough');
        crossed = true;
      } else {
        expect(current).toBe('not-strong-enough');
      }
      previous = current;
    }
    expect(crossed).toBe(true);
  });

  it.each([
    ['at war', (s: GameState) => { s.civilizations[DEMANDER].diplomacy.atWarWith.push(TARGET); s.civilizations[TARGET].diplomacy.atWarWith.push(DEMANDER); }, 'at-war'],
    ['vassal relationship', (s: GameState) => { s.civilizations[TARGET].diplomacy.vassalage.overlord = DEMANDER; s.civilizations[DEMANDER].diplomacy.vassalage.vassals.push(TARGET); }, 'vassal-relationship'],
    ['alliance', (s: GameState) => { for (const [a, b] of [[DEMANDER, TARGET], [TARGET, DEMANDER]]) s.civilizations[a].diplomacy.treaties.push({ type: 'alliance', civA: a, civB: b, turnsRemaining: -1 }); }, 'allied'],
    ['non-aggression pact', (s: GameState) => { for (const [a, b] of [[DEMANDER, TARGET], [TARGET, DEMANDER]]) s.civilizations[a].diplomacy.treaties.push({ type: 'non_aggression_pact', civA: a, civB: b, turnsRemaining: 5 }); }, 'non-aggression-pact'],
    ['hostile relations', (s: GameState) => { s.civilizations[DEMANDER].diplomacy.relationships[TARGET] = TRIBUTE_RELATIONSHIP_FLOOR - 1; }, 'relations-too-hostile'],
  ])('is denied while %s', (_name, mutate, expected) => {
    const state = makeState();
    mutate(state);
    expect(reason(state)).toBe(expected);
  });

  it('allows the relationship floor itself', () => {
    const state = makeState();
    state.civilizations[DEMANDER].diplomacy.relationships[TARGET] = TRIBUTE_RELATIONSHIP_FLOOR;
    expect(reason(state)).toBe('ok');
  });

  it('is not blocked by trade agreements or open borders alone', () => {
    const state = makeState();
    for (const type of ['trade_agreement', 'open_borders'] as const) {
      for (const [a, b] of [[DEMANDER, TARGET], [TARGET, DEMANDER]]) state.civilizations[a].diplomacy.treaties.push({ type, civA: a, civB: b, turnsRemaining: -1 });
    }
    expect(reason(state)).toBe('ok');
  });

  it('is denied while a demand is pending and during the cooldown, then allowed again', () => {
    const state = makeState();
    const demand = wire(state);
    expect(reason(demand.state)).toBe('pending-demand');
    const refused = refuseTributeDemand(demand.state, TARGET, demand.request.id, bus());
    if (!refused.ok) throw new Error('refusal failed');
    // Refusal cost 10 relations, which is still above the floor from a 0 start.
    expect(reason(refused.state)).toBe('cooldown');
    const later = { ...refused.state, turn: refused.state.turn + TRIBUTE_COOLDOWN_ROUNDS - 1 };
    expect(reason(later)).toBe('cooldown');
    expect(reason({ ...refused.state, turn: refused.state.turn + TRIBUTE_COOLDOWN_ROUNDS })).toBe('ok');
  });

  it('is denied while a tribute contract is active', () => {
    expect(reason(signed(makeState()))).toBe('active-tribute');
  });
});

describe('tribute demand, acceptance and refusal (#1334)', () => {
  it('freezes the terms at proposal even if the demander advances an era before the answer', () => {
    const state = makeState();
    const demand = wire(state);
    const proposed = demand.request.tribute!;
    const advanced = { ...demand.state };
    advanced.civilizations = { ...advanced.civilizations, [DEMANDER]: { ...advanced.civilizations[DEMANDER], techState: { ...advanced.civilizations[DEMANDER].techState, completed: techsThroughEra(8) } } };
    const accepted = acceptTributeDemand(advanced, TARGET, demand.request.id, bus());
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const contract = getLiveTributeBetween(accepted.state, DEMANDER, TARGET)!;
    expect(contract.tribute.goldPerRound).toBe(proposed.goldPerRound);
    expect(contract.turnsRemaining).toBe(proposed.rounds);
  });

  it('accepting creates exactly one mirrored contract with identical terms and no relationship change', () => {
    const state = makeState();
    const signedState = signed(state);
    const a = signedState.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute');
    const b = signedState.civilizations[TARGET].diplomacy.treaties.filter(t => t.type === 'tribute');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].tribute).toEqual(b[0].tribute);
    expect(a[0].turnsRemaining).toBe(b[0].turnsRemaining);
    expect(signedState.civilizations[DEMANDER].diplomacy.relationships[TARGET]).toBe(0);
    expect(signedState.civilizations[TARGET].diplomacy.relationships[DEMANDER]).toBe(0);
    expect(signedState.pendingDiplomacyRequests ?? []).toHaveLength(0);
    assertTreatyReciprocity(signedState);
  });

  it('refusal creates no contract, no war, and exactly one relationship consequence on each side', () => {
    const state = makeState();
    const demand = wire(state);
    const refused = refuseTributeDemand(demand.state, TARGET, demand.request.id, bus());
    expect(refused.ok).toBe(true);
    if (!refused.ok) return;
    const s = refused.state;
    expect(getLiveTributeBetween(s, DEMANDER, TARGET)).toBeUndefined();
    expect(s.civilizations[DEMANDER].diplomacy.atWarWith).not.toContain(TARGET);
    expect(s.civilizations[TARGET].diplomacy.atWarWith).not.toContain(DEMANDER);
    expect(s.civilizations[DEMANDER].diplomacy.relationships[TARGET]).toBe(-TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY);
    expect(s.civilizations[TARGET].diplomacy.relationships[DEMANDER]).toBe(-TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY);
    expect(s.civilizations[DEMANDER].diplomacy.events.filter(e => e.type === 'tribute_refused')).toHaveLength(1);
    expect(s.pendingDiplomacyRequests ?? []).toHaveLength(0);
  });

  it('only the addressed civilization can answer, and a request cannot be answered twice', () => {
    const demand = wire(makeState());
    expect(acceptTributeDemand(demand.state, DEMANDER, demand.request.id, bus())).toMatchObject({ ok: false, reason: 'request-not-found' });
    const accepted = acceptTributeDemand(demand.state, TARGET, demand.request.id, bus());
    if (!accepted.ok) throw new Error('accept failed');
    expect(acceptTributeDemand(accepted.state, TARGET, demand.request.id, bus())).toMatchObject({ ok: false });
  });

  it('returns a typed stale denial when war begins before the answer, leaving the request for the target to decline', () => {
    const demand = wire(makeState());
    const atWar = declareMajorWar(demand.state, DEMANDER, TARGET);
    const result = acceptTributeDemand(atWar, TARGET, demand.request.id, bus());
    expect(result).toMatchObject({ ok: false, reason: 'request-no-longer-valid' });
    expect(result.state).toBe(atWar);
  });

  it('the generic request path accepts, and an explicit decline refuses; an internal drop has no consequence', () => {
    const demand = wire(makeState());
    const viaGeneric = acceptDiplomaticRequest(demand.state, TARGET, demand.request.id, bus());
    expect(viaGeneric.ok).toBe(true);
    const declined = rejectDiplomaticRequest(demand.state, TARGET, demand.request.id, bus());
    expect(declined.civilizations[TARGET].diplomacy.relationships[DEMANDER]).toBe(-TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY);
    const dropped = rejectDiplomaticRequest(demand.state, TARGET, demand.request.id);
    expect(dropped.civilizations[TARGET].diplomacy.relationships[DEMANDER]).toBe(0);
    expect(dropped.pendingDiplomacyRequests ?? []).toHaveLength(0);
  });

  it('a demand never auto-accepts, whoever the target is', () => {
    const state = makeState();
    state.civilizations[TARGET].isHuman = true;
    const demand = wire(state);
    expect(getLiveTributeBetween(demand.state, DEMANDER, TARGET)).toBeUndefined();
    expect((demand.state.pendingDiplomacyRequests ?? []).filter(r => r.type === 'tribute')).toHaveLength(1);
  });
});

describe('tribute payments and lifecycle (#1334)', () => {
  it('pays exactly once per round for exactly the contract length, then expires with no extra payment', () => {
    let state = signed(makeState());
    const perRound = getLiveTributeBetween(state, DEMANDER, TARGET)!.tribute.goldPerRound;
    const demanderStart = state.civilizations[DEMANDER].gold;
    const payerStart = state.civilizations[TARGET].gold;
    let total = 0;
    for (let i = 1; i <= TRIBUTE_DURATION_ROUNDS; i++) {
      const result = round(state);
      state = result.state;
      expect(result.paid, `round ${i}`).toBe(-perRound);
      total += perRound;
    }
    expect(total).toBe(perRound * TRIBUTE_DURATION_ROUNDS);
    expect(state.civilizations[TARGET].gold).toBe(payerStart - total);
    expect(state.civilizations[DEMANDER].gold).toBe(demanderStart + total);
    expect(getLiveTributeBetween(state, DEMANDER, TARGET)).toBeUndefined();
    expect(state.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(state.civilizations[TARGET].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(round(state).paid).toBe(0);
  });

  it('pays only what the payer has and never goes negative or extends the term', () => {
    let state = signed(makeState());
    state = { ...state, civilizations: { ...state.civilizations, [TARGET]: { ...state.civilizations[TARGET], gold: 3 } } };
    const first = round(state);
    expect(first.paid).toBe(-3);
    expect(first.state.civilizations[TARGET].gold).toBe(0);
    const second = round(first.state);
    expect(second.paid).toBe(0);
    expect(second.state.civilizations[TARGET].gold).toBeGreaterThanOrEqual(0);
    expect(getLiveTributeBetween(second.state, DEMANDER, TARGET)!.turnsRemaining).toBe(TRIBUTE_DURATION_ROUNDS - 2);
  });

  it('charges only the payer\'s copy: processing the demander\'s turn never pays', () => {
    const state = signed(makeState());
    const demanderSide = settleTributeForCiv(state, DEMANDER, bus());
    expect(demanderSide.goldDeltaByCiv).toEqual({});
  });

  it('a declared war removes the contract from both civs at once, so nothing is paid afterwards', () => {
    const state = declareMajorWar(signed(makeState()), DEMANDER, TARGET);
    expect(getLiveTributeBetween(state, DEMANDER, TARGET)).toBeUndefined();
    expect(state.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(state.civilizations[TARGET].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(settleTributeForCiv(state, TARGET, bus()).goldDeltaByCiv).toEqual({});
  });

  it('removes a stale contract found at settlement (war flags set without the treaty strip) once, with no payment', () => {
    const base = signed(makeState());
    const state = { ...base, civilizations: { ...base.civilizations } };
    state.civilizations[DEMANDER] = { ...base.civilizations[DEMANDER], diplomacy: { ...base.civilizations[DEMANDER].diplomacy, atWarWith: [TARGET] } };
    state.civilizations[TARGET] = { ...base.civilizations[TARGET], diplomacy: { ...base.civilizations[TARGET].diplomacy, atWarWith: [DEMANDER] } };
    const ended: string[] = [];
    const b = bus();
    b.on('diplomacy:tribute-ended', e => ended.push(e.reason));
    const settled = settleTributeForCiv(state, TARGET, b);
    expect(settled.goldDeltaByCiv).toEqual({});
    expect(ended).toEqual(['war']);
    expect(settled.state.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(settled.state.civilizations[TARGET].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(settleTributeForCiv(settled.state, DEMANDER, b).goldDeltaByCiv).toEqual({});
    expect(ended).toHaveLength(1);
  });

  it('ends on vassalage and never double-pays with vassal tribute', () => {
    const base = signed(makeState());
    const state = { ...base };
    state.civilizations = {
      ...base.civilizations,
      [TARGET]: { ...base.civilizations[TARGET], diplomacy: { ...base.civilizations[TARGET].diplomacy, vassalage: { ...base.civilizations[TARGET].diplomacy.vassalage, overlord: DEMANDER } } },
      [DEMANDER]: { ...base.civilizations[DEMANDER], diplomacy: { ...base.civilizations[DEMANDER].diplomacy, vassalage: { ...base.civilizations[DEMANDER].diplomacy.vassalage, vassals: [TARGET] } } },
    };
    const ended: string[] = [];
    const b = bus();
    b.on('diplomacy:tribute-ended', e => ended.push(e.reason));
    const settled = settleTributeForCiv(state, TARGET, b);
    expect(settled.goldDeltaByCiv).toEqual({});
    expect(ended).toEqual(['vassalage']);
    expect(getLiveTributeBetween(settled.state, DEMANDER, TARGET)).toBeUndefined();
  });

  it('ends when a party is eliminated', () => {
    const state = signed(makeState());
    const target = state.civilizations[TARGET];
    for (const id of [...target.units]) delete state.units[id];
    for (const id of [...target.cities]) delete state.cities[id];
    target.units = [];
    target.cities = [];
    const eliminated = eliminateCivilization(state, TARGET, DEMANDER);
    expect(eliminated.eliminated).toBe(true);
    expect(getLiveTributeBetween(eliminated.state, DEMANDER, TARGET)).toBeUndefined();
    expect(eliminated.state.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    assertTreatyReciprocity(eliminated.state);
  });

  it('moves gold through the real round pipeline: the payer loses and the demander gains exactly the payment', () => {
    const withTribute = signed(makeState());
    const without = makeState();
    const perRound = getLiveTributeBetween(withTribute, DEMANDER, TARGET)!.tribute.goldPerRound;
    const a = processTurn(withTribute, bus());
    const b = processTurn(without, bus());
    expect(a.civilizations[TARGET].gold - b.civilizations[TARGET].gold).toBe(-perRound);
    expect(a.civilizations[DEMANDER].gold - b.civilizations[DEMANDER].gold).toBe(perRound);
    expect(getLiveTributeBetween(a, DEMANDER, TARGET)!.turnsRemaining).toBe(TRIBUTE_DURATION_ROUNDS - 1);
    assertTreatyReciprocity(a);
  });
});
