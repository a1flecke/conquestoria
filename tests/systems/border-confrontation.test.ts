import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import { CURRENT_SAVE_SCHEMA_VERSION, migrateSaveToCurrent } from '@/storage/save-migrations';
import { BORDER_TENSION_RADIUS } from '@/systems/border-tension';
import { declareMajorWar } from '@/systems/diplomacy-system';
import { isAtWar } from '@/systems/diplomacy-queries';
import { signTreaty } from '@/systems/diplomacy-treaties';
import {
  BORDER_CONFRONTATION_COOLDOWN_TURNS,
  BORDER_CONFRONTATION_RECORD_RETENTION_TURNS,
  BORDER_WITHDRAWAL_BROKEN_RELATIONSHIP_PENALTY,
  BORDER_WITHDRAWAL_KEPT_RELATIONSHIP_BONUS,
  BORDER_WITHDRAWAL_PROMISE_TURNS,
  BORDER_WITHDRAWAL_REFUSAL_RELATIONSHIP_PENALTY,
  acceptWithdrawalDemand,
  assessBorderWithdrawalFeasibility,
  decideBorderWithdrawalAsAI,
  demandWithdrawal,
  getActiveBorderPromise,
  getBorderConfrontationEligibility,
  getBorderConfrontationStatusForViewer,
  getLastBorderDemandTurn,
  reconcileBorderConfrontations,
  refuseWithdrawalDemand,
} from '@/systems/border-confrontation';
import { evaluateBorderWithdrawalConsent } from '@/ai/ai-border-consent';
import {
  FAR_SPOT,
  HOST,
  INTRUDER,
  BORDER_WIDTH,
  addBorderUnit,
  makeBorderConfrontationState,
} from './helpers/border-confrontation-fixture';

const bus = () => new EventBus();
const reason = (state: GameState) => {
  const result = getBorderConfrontationEligibility(state, HOST, INTRUDER);
  return result.ok ? 'ok' : result.reason;
};

function demanded(state: GameState): { state: GameState; requestId: string } {
  const result = demandWithdrawal(state, HOST, INTRUDER, bus());
  if (!result.ok) throw new Error(`demand denied: ${result.reason}`);
  return { state: result.state, requestId: result.request.id };
}

function promised(state: GameState): GameState {
  const demand = demanded(state);
  const accepted = acceptWithdrawalDemand(demand.state, INTRUDER, demand.requestId, bus());
  if (!accepted.ok) throw new Error(`accept denied: ${accepted.reason}`);
  return accepted.state;
}

describe('border-confrontation eligibility (#1766)', () => {
  it('is legal when the approached civ can see an armed unit inside the existing radius, across the seam', () => {
    expect(reason(makeBorderConfrontationState())).toBe('ok');
    expect(reason(makeBorderConfrontationState({ unitAt: { q: BORDER_WIDTH - 1, r: 2 } }))).toBe('ok');
  });

  it('uses the existing radius and seam handling, not a second distance rule', () => {
    const across = makeBorderConfrontationState({ unitAt: { q: BORDER_WIDTH - 1, r: 2 } });
    across.map.wrapsHorizontally = false;
    expect(reason(across)).toBe('no-border-tension');
    expect(reason(makeBorderConfrontationState({ unitAt: { q: BORDER_TENSION_RADIUS + 1, r: 2 } }))).toBe('no-border-tension');
  });

  it('ignores unarmed units', () => {
    expect(reason(makeBorderConfrontationState({ unitType: 'settler' }))).toBe('no-border-tension');
  });

  it('never offers a demand from a unit the approached civ cannot see', () => {
    expect(reason(makeBorderConfrontationState({ hostSeesUnit: false }))).toBe('no-border-tension');
  });

  it('is denied at war, under an alliance, under Open Borders, and under vassalage', () => {
    const atWar = declareMajorWar(makeBorderConfrontationState(), HOST, INTRUDER, bus());
    expect(isAtWar(atWar.civilizations[HOST].diplomacy, INTRUDER)).toBe(true);
    expect(reason(atWar)).toBe('at-war');

    for (const [type, expected] of [
      ['alliance', 'allied'],
      ['open_borders', 'open-borders'],
    ] as const) {
      const state = makeBorderConfrontationState();
      state.civilizations[HOST].diplomacy = signTreaty(state.civilizations[HOST].diplomacy, HOST, INTRUDER, type, -1, state.turn);
      state.civilizations[INTRUDER].diplomacy = signTreaty(state.civilizations[INTRUDER].diplomacy, INTRUDER, HOST, type, -1, state.turn);
      expect(reason(state), type).toBe(expected);
    }

    const vassal = makeBorderConfrontationState();
    vassal.civilizations[HOST].diplomacy.vassalage.overlord = INTRUDER;
    vassal.civilizations[INTRUDER].diplomacy.vassalage.vassals = [HOST];
    expect(reason(vassal)).toBe('vassal-relationship');
  });

  it('is denied without contact and against itself', () => {
    const unmet = makeBorderConfrontationState();
    unmet.civilizations[HOST].knownCivilizations = [];
    unmet.civilizations[INTRUDER].knownCivilizations = [];
    // No current visible evidence either: an unmet civ's city is not on the approached civ's map.
    unmet.civilizations[HOST].visibility.tiles = {};
    unmet.civilizations[INTRUDER].visibility.tiles = {};
    expect(reason(unmet)).toBe('no-contact');
    expect(getBorderConfrontationEligibility(unmet, HOST, HOST)).toEqual({ ok: false, reason: 'self' });
  });

  it('keeps one active confrontation per pair and enforces the cooldown', () => {
    const demandedState = demanded(makeBorderConfrontationState()).state;
    expect(reason(demandedState)).toBe('active-confrontation');

    // An unanswered demand that was dropped still counts through the recorded demand turn.
    const dropped = { ...demandedState, pendingDiplomacyRequests: [] };
    expect(getLastBorderDemandTurn(dropped, HOST, INTRUDER)).toBe(dropped.turn);
    expect(reason(dropped)).toBe('cooldown');

    const cooled = { ...dropped, turn: dropped.turn + BORDER_CONFRONTATION_COOLDOWN_TURNS };
    expect(reason(cooled)).toBe('ok');
  });
});

describe('border-confrontation promise lifecycle (#1766)', () => {
  it('accepting records a promise with a fixed deadline and removes the pending demand', () => {
    const state = promised(makeBorderConfrontationState());
    expect(state.pendingDiplomacyRequests).toEqual([]);
    const promise = getActiveBorderPromise(state, HOST, INTRUDER);
    expect(promise).toMatchObject({
      hostCivId: HOST,
      intruderCivId: INTRUDER,
      status: 'promised',
      deadlineTurn: 10 + BORDER_WITHDRAWAL_PROMISE_TURNS,
    });
    expect(reason(state)).toBe('active-confrontation');
  });

  it('fulfils an honoured promise and improves relations on both sides', () => {
    let state = promised(makeBorderConfrontationState());
    (state.units['rival-unit'] as Unit).position = FAR_SPOT;
    state = { ...state, turn: 10 + BORDER_WITHDRAWAL_PROMISE_TURNS };
    state = reconcileBorderConfrontations(state, bus());
    expect(getActiveBorderPromise(state, HOST, INTRUDER)).toBeUndefined();
    expect(state.borderConfrontations?.[0].status).toBe('fulfilled');
    expect(state.civilizations[HOST].diplomacy.relationships[INTRUDER]).toBe(BORDER_WITHDRAWAL_KEPT_RELATIONSHIP_BONUS);
    expect(state.civilizations[INTRUDER].diplomacy.relationships[HOST]).toBe(BORDER_WITHDRAWAL_KEPT_RELATIONSHIP_BONUS);
    expect(state.civilizations[INTRUDER].diplomacy.treacheryScore).toBe(0);
  });

  it('breaks a violated promise: relations fall and the existing treachery reputation rises', () => {
    let state = promised(makeBorderConfrontationState());
    state = { ...state, turn: 10 + BORDER_WITHDRAWAL_PROMISE_TURNS };
    state = reconcileBorderConfrontations(state, bus());
    expect(state.borderConfrontations?.[0].status).toBe('broken');
    // The victim takes the direct penalty plus the existing treachery broadcast against the betrayer; the betrayer's
    // own view of the victim takes only the direct penalty.
    expect(state.civilizations[HOST].diplomacy.relationships[INTRUDER]).toBeLessThanOrEqual(-BORDER_WITHDRAWAL_BROKEN_RELATIONSHIP_PENALTY);
    expect(state.civilizations[INTRUDER].diplomacy.relationships[HOST]).toBe(-BORDER_WITHDRAWAL_BROKEN_RELATIONSHIP_PENALTY);
    expect(state.civilizations[INTRUDER].diplomacy.treacheryScore).toBeGreaterThan(0);
  });

  it('does not evaluate the promise before the deadline', () => {
    let state = promised(makeBorderConfrontationState());
    state = { ...state, turn: 10 + BORDER_WITHDRAWAL_PROMISE_TURNS - 1 };
    state = reconcileBorderConfrontations(state, bus());
    expect(getActiveBorderPromise(state, HOST, INTRUDER)).toBeDefined();
  });

  it('refusing costs relations immediately and never charges treachery', () => {
    const demand = demanded(makeBorderConfrontationState());
    const refused = refuseWithdrawalDemand(demand.state, INTRUDER, demand.requestId, bus());
    expect(refused.ok).toBe(true);
    if (!refused.ok) return;
    expect(refused.state.borderConfrontations?.[0].status).toBe('refused');
    expect(refused.state.civilizations[HOST].diplomacy.relationships[INTRUDER]).toBe(-BORDER_WITHDRAWAL_REFUSAL_RELATIONSHIP_PENALTY);
    expect(refused.state.civilizations[INTRUDER].diplomacy.relationships[HOST]).toBe(-BORDER_WITHDRAWAL_REFUSAL_RELATIONSHIP_PENALTY);
    expect(refused.state.civilizations[INTRUDER].diplomacy.treacheryScore).toBe(0);
    expect(isAtWar(refused.state.civilizations[HOST].diplomacy, INTRUDER)).toBe(false);
  });

  it('invalidates a promise made moot by war without any relationship or reputation penalty', () => {
    let state = promised(makeBorderConfrontationState());
    state = declareMajorWar(state, HOST, INTRUDER, bus());
    const relationshipAfterWar = state.civilizations[HOST].diplomacy.relationships[INTRUDER];
    state = reconcileBorderConfrontations(state, bus());
    expect(state.borderConfrontations?.[0].status).toBe('invalidated');
    expect(state.civilizations[INTRUDER].diplomacy.treacheryScore).toBe(0);
    // The declaration's own war penalty stays; invalidation adds nothing.
    expect(state.civilizations[HOST].diplomacy.relationships[INTRUDER]).toBe(relationshipAfterWar);
  });

  it('rejects a stale answer rather than trusting the rendered request', () => {
    const demand = demanded(makeBorderConfrontationState());
    const atWar = declareMajorWar(demand.state, HOST, INTRUDER, bus());
    const accepted = acceptWithdrawalDemand(atWar, INTRUDER, demand.requestId, bus());
    expect(accepted.ok).toBe(false);
    expect(getActiveBorderPromise(atWar, HOST, INTRUDER)).toBeUndefined();
  });

  it('prunes old resolved records', () => {
    let state = promised(makeBorderConfrontationState());
    state = { ...state, turn: 10 + BORDER_WITHDRAWAL_PROMISE_TURNS };
    state = reconcileBorderConfrontations(state, bus());
    state = { ...state, turn: state.turn + BORDER_CONFRONTATION_RECORD_RETENTION_TURNS };
    state = reconcileBorderConfrontations(state, bus());
    expect(state.borderConfrontations).toEqual([]);
  });
});

describe('AI withdrawal decision (#1766)', () => {
  it('is deterministic and difficulty-invariant', () => {
    const state = makeBorderConfrontationState();
    const first = decideBorderWithdrawalAsAI(state, INTRUDER, HOST);
    const second = decideBorderWithdrawalAsAI(state, INTRUDER, HOST);
    expect(second).toEqual(first);
  });

  it('a diplomatic leader promises, an aggressive leader refuses', () => {
    const diplomatic = makeBorderConfrontationState();
    diplomatic.civilizations[INTRUDER].civType = 'greece';
    expect(decideBorderWithdrawalAsAI(diplomatic, INTRUDER, HOST).accepted).toBe(true);

    const aggressive = makeBorderConfrontationState();
    aggressive.civilizations[INTRUDER].civType = 'rome';
    expect(decideBorderWithdrawalAsAI(aggressive, INTRUDER, HOST).accepted).toBe(false);
  });

  it('an outmatched leader promises even when aggressive; a clearly stronger one refuses even when diplomatic', () => {
    const outmatched = makeBorderConfrontationState();
    outmatched.civilizations[INTRUDER].civType = 'rome';
    for (let i = 0; i < 8; i++) {
      const visible = addBorderUnit(outmatched, HOST, 'tank', { q: 2 + i, r: 3 }, `host-tank-${i}`);
      outmatched.civilizations[INTRUDER].visibility.tiles[`${visible.position.q},${visible.position.r}`] = 'visible';
    }
    const decision = decideBorderWithdrawalAsAI(outmatched, INTRUDER, HOST);
    expect(decision.feasibility.violatingUnitCount).toBe(1);
    expect(decision.accepted).toBe(true);

    const stronger = makeBorderConfrontationState();
    stronger.civilizations[INTRUDER].civType = 'greece';
    const hostWarrior = addBorderUnit(stronger, HOST, 'warrior', { q: 2, r: 3 }, 'host-warrior');
    stronger.civilizations[INTRUDER].visibility.tiles[`${hostWarrior.position.q},${hostWarrior.position.r}`] = 'visible';
    for (let i = 0; i < 10; i++) addBorderUnit(stronger, INTRUDER, 'tank', { q: 3 + (i % 5), r: 4 }, `rival-tank-${i}`);
    expect(decideBorderWithdrawalAsAI(stronger, INTRUDER, HOST).accepted).toBe(false);
  });

  it('refuses when no legal route out of the disputed radius exists', () => {
    const trapped = makeBorderConfrontationState({
      mapWidth: 4,
      mapHeight: 4,
      unitAt: { q: 1, r: 2 },
      intruderKnowsHostCity: true,
    });
    trapped.civilizations[INTRUDER].civType = 'greece';
    const feasibility = assessBorderWithdrawalFeasibility(trapped, INTRUDER, HOST);
    expect(feasibility).toEqual({ violatingUnitCount: 1, withdrawableUnitCount: 0 });
    expect(decideBorderWithdrawalAsAI(trapped, INTRUDER, HOST).accepted).toBe(false);
  });

  it('a consent policy never promises what cannot be delivered', () => {
    const base = {
      relationship: 100,
      diplomacyFocus: 1,
      warLikelihood: 0,
      ownStrength: 1,
      hostStrengthLower: 100,
      hostObserved: true,
      violatingUnitCount: 2,
      withdrawableUnitCount: 0,
    };
    expect(evaluateBorderWithdrawalConsent(base).accepted).toBe(false);
    expect(evaluateBorderWithdrawalConsent(base).reason).toBe('cannot-withdraw');
    expect(evaluateBorderWithdrawalConsent({ ...base, withdrawableUnitCount: 2 }).accepted).toBe(true);
  });
});

describe('viewer-safe promise status (#1766)', () => {
  it('the host only reports what it can actually see, and the intruder uses its own units and explored cities', () => {
    const state = promised(makeBorderConfrontationState());
    const record = getActiveBorderPromise(state, HOST, INTRUDER)!;
    expect(getBorderConfrontationStatusForViewer(state, HOST, record)).toBe(false);

    // The host loses sight of the unit: it cannot claim the promise is broken from hidden information.
    state.civilizations[HOST].visibility.tiles = {};
    expect(getBorderConfrontationStatusForViewer(state, HOST, record)).toBe(true);

    // The intruder always sees its own unit, so it knows it is still inside the radius.
    expect(getBorderConfrontationStatusForViewer(state, INTRUDER, record)).toBe(false);
    (state.units['rival-unit'] as Unit).position = FAR_SPOT;
    expect(getBorderConfrontationStatusForViewer(state, INTRUDER, record)).toBe(true);
  });
});

describe('border-confrontation persistence (#1766)', () => {
  const reload = (state: GameState): GameState =>
    migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION })));

  it('a pending demand and an accepted promise survive a real save/load', () => {
    const demand = demanded(makeBorderConfrontationState());
    const withPending = reload(demand.state);
    expect(withPending.pendingDiplomacyRequests).toContainEqual(demand.state.pendingDiplomacyRequests![0]);

    const state = promised(makeBorderConfrontationState());
    const restored = reload(state);
    expect(getActiveBorderPromise(restored, HOST, INTRUDER)).toMatchObject({
      status: 'promised',
      deadlineTurn: 10 + BORDER_WITHDRAWAL_PROMISE_TURNS,
    });
    expect(restored.borderConfrontations).toEqual(state.borderConfrontations);
  });

  it('a pre-#1766 save with no field loads and reconciles unchanged', () => {
    const state = makeBorderConfrontationState();
    delete state.borderConfrontations;
    const restored = reload(state);
    expect(reconcileBorderConfrontations(restored, bus()).borderConfrontations).toEqual([]);
  });

  it('reload continuity: a promise resolved after a reload produces the same outcome', () => {
    const state = promised(makeBorderConfrontationState());
    const reloaded = reload(state);
    const resolved = reconcileBorderConfrontations({ ...reloaded, turn: 10 + BORDER_WITHDRAWAL_PROMISE_TURNS }, bus());
    expect(resolved.borderConfrontations?.[0].status).toBe('broken');
  });
});
