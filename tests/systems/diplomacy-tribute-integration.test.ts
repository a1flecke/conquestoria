import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { chooseTributeDemandTarget } from '@/ai/ai-tribute';
import { evaluateTributeConsent } from '@/ai/ai-treaty-consent';
import { buildCouncilAgenda } from '@/systems/council-system';
import { applyDiplomaticAction, acceptDiplomaticRequest, resolveDiplomaticAction, DIPLOMATIC_ACTION_DENIAL_MESSAGES } from '@/systems/diplomacy-system';
import {
  TRIBUTE_COOLDOWN_ROUNDS,
  TRIBUTE_DENIAL_MESSAGES,
  TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY,
  getLiveTributeBetween,
  getTributeDemandEligibility,
  type TributeDenialReason,
} from '@/systems/diplomacy-tribute';
import { buildViewerMilitaryIntel } from '@/systems/diplomatic-strength';
import { hexKey } from '@/systems/hex-utils';
import {
  routeTributeAccepted,
  routeTributeDemanded,
  routeTributeEnded,
  routeTributeRefused,
} from '@/ui/notification-routes/diplomacy-routes';
import { DEMANDER, TARGET, addUnit, letTargetSeeDemander, makeTributeState } from './helpers/tribute-fixture';

const bus = () => new EventBus();
const demand = (state: GameState) => applyDiplomaticAction(state, DEMANDER, TARGET, 'demand_tribute', bus());

function addTargetArmy(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    const unit = addUnit(state, TARGET, 'swordsman', { q: 8, r: 5 }, `target-army-${i}`);
    state.civilizations[DEMANDER].visibility.tiles[hexKey(unit.position)] = 'visible';
  }
}

describe('the tribute action contract (#1334)', () => {
  it('is offered exactly when the shared eligibility allows it, with the same typed reason otherwise', () => {
    const ok = makeTributeState();
    expect(getTributeDemandEligibility(ok, DEMANDER, TARGET).ok).toBe(true);
    expect(resolveDiplomaticAction(ok, DEMANDER, TARGET, 'demand_tribute')).toEqual({ ok: true });

    const unknown = makeTributeState();
    unknown.civilizations[DEMANDER].visibility.tiles = {};
    const denied = resolveDiplomaticAction(unknown, DEMANDER, TARGET, 'demand_tribute');
    expect(denied).toEqual({ ok: false, reason: 'unknown-military' });
    expect(getTributeDemandEligibility(unknown, DEMANDER, TARGET)).toEqual({ ok: false, reason: 'unknown-military' });
  });

  it('has player-facing copy for every denial that never quotes a number', () => {
    for (const reason of Object.keys(TRIBUTE_DENIAL_MESSAGES) as TributeDenialReason[]) {
      expect(TRIBUTE_DENIAL_MESSAGES[reason].length, reason).toBeGreaterThan(10);
      expect(TRIBUTE_DENIAL_MESSAGES[reason], reason).not.toMatch(/\d/);
      expect(DIPLOMATIC_ACTION_DENIAL_MESSAGES[reason], reason).toBeTruthy();
    }
  });

  it('never confirms an unmet civilization and refuses a vassal as the demander', () => {
    const state = makeTributeState();
    state.civilizations[DEMANDER].knownCivilizations = [];
    state.civilizations[TARGET].knownCivilizations = [];
    state.civilizations[DEMANDER].visibility.tiles = {};
    expect(resolveDiplomaticAction(state, DEMANDER, TARGET, 'demand_tribute')).toEqual({ ok: false, reason: 'not-met' });
    const vassal = makeTributeState();
    vassal.civilizations[DEMANDER].diplomacy.vassalage.overlord = 'ai-9';
    expect(resolveDiplomaticAction(vassal, DEMANDER, TARGET, 'demand_tribute')).toEqual({ ok: false, reason: 'vassal-restricted' });
  });

  it('a human target receives a pending demand and nothing is decided for them', () => {
    const state = makeTributeState();
    state.civilizations[TARGET].isHuman = true;
    const result = demand(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getLiveTributeBetween(result.state, DEMANDER, TARGET)).toBeUndefined();
    const pending = (result.state.pendingDiplomacyRequests ?? []).filter(r => r.type === 'tribute');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ fromCivId: DEMANDER, toCivId: TARGET });
    expect(pending[0].tribute!.goldPerRound).toBeGreaterThan(0);
    const accepted = acceptDiplomaticRequest(result.state, TARGET, pending[0].id, bus());
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(getLiveTributeBetween(accepted.state, DEMANDER, TARGET)).toBeDefined();
  });
});

describe('an AI target answers from its own perception (#1334)', () => {
  it('accepts when it sees itself clearly outmatched', () => {
    const state = makeTributeState();
    letTargetSeeDemander(state);
    const result = demand(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const contract = getLiveTributeBetween(result.state, DEMANDER, TARGET);
    expect(contract).toBeDefined();
    expect(contract!.tribute.payerId).toBe(TARGET);
    expect((result.state.pendingDiplomacyRequests ?? []).filter(r => r.type === 'tribute')).toHaveLength(0);
  });

  it('refuses, costs relations once and starts no war when it does not see itself outmatched', () => {
    const state = makeTributeState();
    letTargetSeeDemander(state);
    // The target has a hidden-from-the-demander reserve it CAN see itself: its own strength is not hidden from itself.
    for (let i = 0; i < 12; i++) addUnit(state, TARGET, 'swordsman', { q: 14, r: 10 }, `reserve-${i}`);
    const result = demand(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.state;
    expect(getLiveTributeBetween(s, DEMANDER, TARGET)).toBeUndefined();
    expect(s.civilizations[DEMANDER].diplomacy.atWarWith).not.toContain(TARGET);
    expect(s.civilizations[TARGET].diplomacy.atWarWith).not.toContain(DEMANDER);
    expect(s.civilizations[TARGET].diplomacy.relationships[DEMANDER]).toBe(-TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY);
    expect(s.civilizations[DEMANDER].diplomacy.relationships[TARGET]).toBe(-TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY);
  });

  it('refuses when it has never observed the demander: the demand reveals nothing about the army behind it', () => {
    const state = makeTributeState();
    const result = demand(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getLiveTributeBetween(result.state, DEMANDER, TARGET)).toBeUndefined();
    expect(result.state.civilizations[TARGET].diplomacy.relationships[DEMANDER]).toBe(-TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY);
  });

  it('is unaffected by demander units the target cannot see (differential)', () => {
    const base = makeTributeState();
    letTargetSeeDemander(base);
    const withHidden = makeTributeState();
    letTargetSeeDemander(withHidden);
    for (let i = 0; i < 30; i++) addUnit(withHidden, DEMANDER, 'tank', { q: 14, r: 12 }, `hidden-demander-${i}`);
    const a = demand(base);
    const b = demand(withHidden);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(Boolean(getLiveTributeBetween(b.state, DEMANDER, TARGET))).toBe(Boolean(getLiveTributeBetween(a.state, DEMANDER, TARGET)));
  });

  it('the consent rule is the 0.7 outmatched precedent and needs a usable observation', () => {
    const seen = { hasUsableObservation: true, uncertaintyLower: 100 };
    expect(evaluateTributeConsent({ demanderEstimate: seen, ownStrength: 69 }).accepted).toBe(true);
    expect(evaluateTributeConsent({ demanderEstimate: seen, ownStrength: 70 }).accepted).toBe(false);
    expect(evaluateTributeConsent({ demanderEstimate: { hasUsableObservation: false, uncertaintyLower: 100 }, ownStrength: 1 }).accepted).toBe(false);
  });
});

describe('the AI demand candidate (#1334)', () => {
  it('chooses a target exactly when the shared eligibility allows one, through the same intel', () => {
    const state = makeTributeState();
    const intel = buildViewerMilitaryIntel(state, DEMANDER);
    expect(chooseTributeDemandTarget(state, DEMANDER, intel)).toBe(TARGET);
    expect(chooseTributeDemandTarget(state, DEMANDER, intel, new Set([TARGET]))).toBeNull();
    addTargetArmy(state, 14);
    expect(getTributeDemandEligibility(state, DEMANDER, TARGET).ok).toBe(false);
    expect(chooseTributeDemandTarget(state, DEMANDER, buildViewerMilitaryIntel(state, DEMANDER))).toBeNull();
  });

  it('cannot spam: at most one demand per pair per cooldown, however often it is asked', () => {
    let state = makeTributeState();
    letTargetSeeDemander(state);
    for (let i = 0; i < 12; i++) addUnit(state, TARGET, 'swordsman', { q: 14, r: 10 }, `reserve-${i}`);
    const demandTurns: number[] = [];
    for (let turn = 20; turn < 62; turn++) {
      state = { ...state, turn };
      const choice = chooseTributeDemandTarget(state, DEMANDER, buildViewerMilitaryIntel(state, DEMANDER));
      if (!choice) continue;
      const result = applyDiplomaticAction(state, DEMANDER, choice, 'demand_tribute', bus());
      if (result.ok && result.state !== state) { state = result.state; demandTurns.push(turn); }
    }
    expect(demandTurns.length).toBeGreaterThan(0);
    for (let i = 1; i < demandTurns.length; i++) expect(demandTurns[i] - demandTurns[i - 1]).toBeGreaterThanOrEqual(TRIBUTE_COOLDOWN_ROUNDS);
    // Each refusal costs relations, so repeated coercion walks itself out of eligibility rather than looping forever.
    expect(demandTurns.length).toBeLessThanOrEqual(5);
  });
});

describe('Council, notifications and hot-seat privacy (#1334)', () => {
  function withThird(state: GameState): GameState {
    const third = structuredClone(state.civilizations[TARGET]);
    third.name = 'Third Realm';
    third.units = [];
    state.civilizations['ai-9'] = third;
    return state;
  }

  it('shows the target an incoming demand with exact terms, and shows an uninvolved civ nothing', () => {
    const state = withThird(makeTributeState());
    state.civilizations[TARGET].isHuman = true;
    const result = demand(state);
    if (!result.ok) throw new Error(result.reason);
    const request = (result.state.pendingDiplomacyRequests ?? [])[0];
    const cards = buildCouncilAgenda(result.state, TARGET).doNow.filter(card => card.id.startsWith('tribute-demand'));
    expect(cards).toHaveLength(1);
    expect(cards[0].summary).toContain(`${request.tribute!.goldPerRound} gold per round`);
    expect(cards[0].summary).toContain('does not start a war');
    expect(cards[0].action).toEqual({ kind: 'open-diplomacy' });
    for (const viewer of [DEMANDER, 'ai-9']) {
      const text = JSON.stringify(buildCouncilAgenda(result.state, viewer));
      expect(text, viewer).not.toContain('tribute-demand-');
    }
  });

  it('lists an active contract for each party, and no one else, without any strength figure', () => {
    // The AI target accepts only when it can see the demander, so make it visible.
    const fresh = withThird(makeTributeState());
    letTargetSeeDemander(fresh);
    const accepted = applyDiplomaticAction(fresh, DEMANDER, TARGET, 'demand_tribute', bus());
    if (!accepted.ok) throw new Error(accepted.reason);
    const payer = JSON.stringify(buildCouncilAgenda(accepted.state, TARGET).soon);
    const receiver = JSON.stringify(buildCouncilAgenda(accepted.state, DEMANDER).soon);
    expect(payer).toContain('Paying tribute to');
    expect(receiver).toContain('Receiving tribute from');
    expect(JSON.stringify(buildCouncilAgenda(accepted.state, 'ai-9'))).not.toContain('tribute');
    expect(payer + receiver).not.toMatch(/strength|uncertain/i);
  });

  it('notifies recipient-scoped, with exact terms, and always says a refusal does not start a war', () => {
    const state = makeTributeState();
    const sent: Array<{ to: string; message: string }> = [];
    const sink = (to: string, message: string) => { sent.push({ to, message }); };
    routeTributeDemanded(state, { demanderId: DEMANDER, targetId: TARGET, goldPerRound: 8, rounds: 10 }, sink);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(TARGET);
    expect(sent[0].message).toContain('8 gold per round for 10 rounds');
    sent.length = 0;
    routeTributeRefused(state, { demanderId: DEMANDER, payerId: TARGET }, sink);
    expect(sent.map(n => n.to).sort()).toEqual([DEMANDER, TARGET].sort());
    for (const n of sent) expect(n.message).toContain('no war was declared');
    sent.length = 0;
    routeTributeAccepted(state, { demanderId: DEMANDER, payerId: TARGET, goldPerRound: 8, rounds: 10 }, sink);
    expect(sent.map(n => n.to).sort()).toEqual([DEMANDER, TARGET].sort());
    sent.length = 0;
    for (const reason of ['expired', 'war', 'vassalage', 'eliminated'] as const) {
      sent.length = 0;
      routeTributeEnded(state, { demanderId: DEMANDER, payerId: TARGET, reason }, sink);
      expect(sent).toHaveLength(2);
    }
  });
});
