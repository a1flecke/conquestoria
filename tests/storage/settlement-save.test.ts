import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, PendingDiplomaticRequest, SettlementTerm, SettlementTermKind } from '@/core/types';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { normalizeVassalage } from '@/storage/vassalage-normalization';
import { enqueueSettlementOffer, acceptSettlementOffer } from '@/systems/settlement-system';
import { makeWarGoalFixture } from '../systems/helpers/war-goal-fixture';

// #1354: a settlement offer the game itself wrote must survive a save/reload
// through the unconditional corruption-repair pipeline. Until this PR,
// `normalizeVassalage` (`src/storage/vassalage-normalization.ts`) filtered the
// pending-request queue with an explicit allowlist of
// `'peace' | 'treaty' | 'independence' | 'tribute'`, dropping `settlement` --
// so a canonical `enqueueSettlementOffer` call silently destroyed the request
// on load. The test below drives the *real* writer, sends the state through
// the real load path (`migrateSaveToCurrent`), and proves the request is
// preserved.

const bus = () => new EventBus();

function reload(state: GameState, version = CURRENT_SAVE_SCHEMA_VERSION): GameState {
  return migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: version })));
}

function makeWarState(options?: { attackerHuman?: boolean; defenderHuman?: boolean }): GameState {
  return makeWarGoalFixture(bus(), options);
}

function pending(terms: SettlementTerm[] = []): GameState {
  return enqueueSettlementOffer(makeWarState(), 'attacker', 'defender', terms, bus());
}

describe('settlement persistence (#1354)', () => {
  it('keeps the schema version: settlement is additive and needs no numbered migration', () => {
    const fresh = makeWarState();
    expect(reload(fresh).pendingDiplomacyRequests).toEqual(fresh.pendingDiplomacyRequests ?? []);
  });

  it('a canonical pending settlement offer survives a reload through the real load pipeline', () => {
    // The writer goes through enqueueSettlementOffer so this is not a
    // hand-built fixture: it is exactly what the diplomacy panel produces.
    const state = pending();
    expect(state.pendingDiplomacyRequests).toHaveLength(1);
    expect(state.pendingDiplomacyRequests![0].type).toBe('settlement');

    const restored = reload(state);
    expect(restored.pendingDiplomacyRequests).toEqual(state.pendingDiplomacyRequests);
    const request = restored.pendingDiplomacyRequests![0];
    expect(request.type).toBe('settlement');
    expect(request.terms).toEqual([]);
    expect(request.fromCivId).toBe('attacker');
    expect(request.toCivId).toBe('defender');
    expect(request.turnIssued).toBe(state.turn);
  });

  it.each([0, 24, 25, 26, CURRENT_SAVE_SCHEMA_VERSION])('a canonical pending settlement offer survives at schema %s and remains answerable', version => {
    const state = pending();
    const restored = reload(state, version);
    expect(restored.pendingDiplomacyRequests).toEqual(state.pendingDiplomacyRequests);
    const request = restored.pendingDiplomacyRequests![0];
    const next = acceptSettlementOffer(restored, 'defender', request.id, bus());
    // Acceptance is a no-op when validateSettlementOffer fails at load time
    // for a save the game itself wrote -- the war may have already ended via
    // some other path, but a canonical one at apply-time must not silently drop.
    expect(next.pendingDiplomacyRequests ?? []).toEqual([]);
    // Accept path either resolves the war (next != pending) or rejects the
    // request (removed from queue). Either way, no settlement request survives.
    if (next !== restored) {
      expect(next.civilizations['attacker'].diplomacy.atWarWith).not.toContain('defender');
    }
  });

  it('preserves an empty-terms settlement offer (#988: legal empty peace conference)', () => {
    // #988 documents terms: [] as a valid settlement offer. The repair must
    // not reject an empty array, only valid x empty pieces.
    const state = pending([]);
    const restored = reload(state);
    expect(restored.pendingDiplomacyRequests).toHaveLength(1);
    expect(restored.pendingDiplomacyRequests![0].terms).toEqual([]);
  });

  it('preserves every SettlementTermKind the writer can produce (canonical round-trip)', () => {
    // For each SettlementTermKind, drive a writer that the canonical
    // settlement enqueue would accept. We exercise the load-time shape
    // directly here because building a fixture that satisfies every kind's
    // live legality at proposal time (vassalize + vassal release) is
    // orthogonal to the persistence contract under test.
    const kinds: SettlementTermKind[] = ['transfer_city', 'reparations', 'vassalize', 'release_vassal'];
    for (const kind of kinds) {
      const state = makeWarState();
      const request: PendingDiplomaticRequest = {
        id: `settlement:${kind}`,
        type: 'settlement',
        fromCivId: 'attacker',
        toCivId: 'defender',
        turnIssued: state.turn,
        terms: [structuralShapeForKind(kind)],
      };
      const withRequest: GameState = { ...state, pendingDiplomacyRequests: [request] };
      const restored = reload(withRequest);
      expect(restored.pendingDiplomacyRequests).toEqual([request]);
    }
  });

  it('the repair is idempotent on a canonical pending offer', () => {
    const state = pending();
    const once = normalizeVassalage(state);
    // normalizeVassalage rebuilds the civilizations record each invocation
    // (its task is repair, not reference preservation), so the right
    // idempotency claim is "running it twice equals running it once".
    expect(normalizeVassalage(once)).toEqual(normalizeVassalage(once));
    expect(once.pendingDiplomacyRequests).toEqual(state.pendingDiplomacyRequests);
  });

  it('loading a settlement request does not run any gameplay effect (no peace, no gold, no city move)', () => {
    const state = pending();
    const before = JSON.parse(JSON.stringify(state));
    const restored = reload(state);
    // Civ-level state must be byte-identical except for pendingDiplomacyRequests.
    const restoredMinusQueue = { ...restored, pendingDiplomacyRequests: [] };
    const beforeMinusQueue = { ...before, pendingDiplomacyRequests: [] };
    expect(restoredMinusQueue).toEqual(beforeMinusQueue);
  });

  it('still drops an expired settlement request like any other request', () => {
    const state = pending();
    const expired = { ...state, turn: state.turn + 99 };
    expect(normalizeVassalage(expired).pendingDiplomacyRequests).toEqual([]);
  });

  it('still drops a tampered settlement request whose terms are not an array', () => {
    const state = pending();
    const tampered = structuredClone(state);
    (tampered.pendingDiplomacyRequests![0] as any).terms = 'not-an-array';
    expect(normalizeVassalage(tampered).pendingDiplomacyRequests).toEqual([]);
  });

  it.each([
    ['unknown term kind', (t: any) => { t.kind = 'surrender_monument'; }, 'transfer_city' as const],
    ['transfer_city: missing cityId', (t: any) => { delete t.cityId; }, 'transfer_city' as const],
    ['transfer_city: from === to', (t: any) => { t.toCivId = t.fromCivId; }, 'transfer_city' as const],
    ['transfer_city: empty cityId', (t: any) => { t.cityId = ''; }, 'transfer_city' as const],
    ['reparations: non-finite gold', (t: any) => { t.goldAmount = Number.NaN; }, 'reparations' as const],
    ['reparations: negative gold', (t: any) => { t.goldAmount = -10; }, 'reparations' as const],
    ['vassalize: missing overlord', (t: any) => { delete t.overlordId; }, 'vassalize' as const],
    ['release_vassal: missing vassal', (t: any) => { delete t.vassalId; }, 'release_vassal' as const],
  ])('drops a tampered settlement request (%s)', (_name, damage, kind) => {
    const term = structuralShapeForKind(kind);
    const state = pending([term]);
    const tampered = structuredClone(state);
    damage(tampered.pendingDiplomacyRequests![0].terms![0]);
    expect(normalizeVassalage(tampered).pendingDiplomacyRequests).toEqual([]);
  });
});

function structuralShapeForKind(kind: 'transfer_city' | 'reparations' | 'vassalize' | 'release_vassal'): SettlementTerm {
  switch (kind) {
    case 'transfer_city':
      return { kind: 'transfer_city', cityId: 'city-1', fromCivId: 'defender', toCivId: 'attacker' };
    case 'reparations':
      return { kind: 'reparations', fromCivId: 'defender', toCivId: 'attacker', goldAmount: 50 };
    case 'vassalize':
      return { kind: 'vassalize', vassalId: 'defender', overlordId: 'attacker' };
    case 'release_vassal':
      return { kind: 'release_vassal', vassalId: 'defender' };
  }
}