import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { normalizeTributeContracts } from '@/storage/migrations/steps/tribute-contracts';
import { normalizeVassalage } from '@/storage/vassalage-normalization';
import { acceptTributeDemand, demandTribute, getLiveTributeBetween, settleTributeForCiv, TRIBUTE_DURATION_ROUNDS } from '@/systems/diplomacy-tribute';
import { tickTreaties } from '@/systems/diplomacy-treaties';
import { DEMANDER, TARGET, makeTributeState } from '../systems/helpers/tribute-fixture';
import { assertTreatyReciprocity } from '../helpers/save-state-invariants';

// #1334: tribute state is additive (a new treaty type and a new request type), repaired on every load; no schema bump.
const bus = () => new EventBus();
const reload = (state: GameState, version = CURRENT_SAVE_SCHEMA_VERSION): GameState =>
  migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: version })));

function pending(): GameState {
  const result = demandTribute(makeTributeState(), DEMANDER, TARGET, bus());
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

function active(): GameState {
  const demand = demandTribute(makeTributeState(), DEMANDER, TARGET, bus());
  if (!demand.ok) throw new Error(demand.reason);
  const accepted = acceptTributeDemand(demand.state, TARGET, demand.request.id, bus());
  if (!accepted.ok) throw new Error(accepted.reason);
  return accepted.state;
}

describe('tribute persistence (#1334)', () => {
  it('keeps the schema version: tribute is additive and needs no numbered migration', () => {
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBeGreaterThan(0);
    const fresh = makeTributeState();
    expect(JSON.stringify(fresh)).not.toContain('"tribute"');
    expect(reload(fresh).civilizations[DEMANDER].diplomacy.treaties).toEqual(fresh.civilizations[DEMANDER].diplomacy.treaties);
  });

  it.each([26, CURRENT_SAVE_SCHEMA_VERSION])('a pending demand survives a reload at schema %s with its exact terms and can still be answered', version => {
    const state = pending();
    const restored = reload(state, version);
    expect(restored.pendingDiplomacyRequests).toEqual(state.pendingDiplomacyRequests);
    const request = restored.pendingDiplomacyRequests![0];
    const accepted = acceptTributeDemand(restored, TARGET, request.id, bus());
    expect(accepted.ok).toBe(true);
  });

  it('an active contract survives a reload mid-duration and still pays, then expires, after it', () => {
    let state = reload(active());
    const perRound = getLiveTributeBetween(state, DEMANDER, TARGET)!.tribute.goldPerRound;
    const start = state.civilizations[TARGET].gold;
    let rounds = 0;
    for (let i = 0; i < TRIBUTE_DURATION_ROUNDS + 3; i++) {
      if (i === 4) state = reload(state);
      for (const civId of [DEMANDER, TARGET]) {
        const settled = settleTributeForCiv(state, civId, bus());
        state = settled.state;
        for (const [id, delta] of Object.entries(settled.goldDeltaByCiv)) {
          state = { ...state, civilizations: { ...state.civilizations, [id]: { ...state.civilizations[id], gold: state.civilizations[id].gold + delta } } };
        }
        if (settled.goldDeltaByCiv[TARGET]) rounds += 1;
        const civ = state.civilizations[civId];
        state = { ...state, civilizations: { ...state.civilizations, [civId]: { ...civ, diplomacy: tickTreaties(civ.diplomacy) } } };
      }
    }
    expect(rounds).toBe(TRIBUTE_DURATION_ROUNDS);
    expect(state.civilizations[TARGET].gold).toBe(start - perRound * TRIBUTE_DURATION_ROUNDS);
    expect(getLiveTributeBetween(state, DEMANDER, TARGET)).toBeUndefined();
    assertTreatyReciprocity(state);
  });

  it('repairs are idempotent and leave a well-formed contract untouched', () => {
    const state = active();
    expect(normalizeTributeContracts(state)).toBe(state);
    expect(normalizeTributeContracts(normalizeTributeContracts(state))).toBe(state);
  });

  it('drops a contract recorded on only one civ, without fabricating the other side', () => {
    const state = structuredClone(active());
    state.civilizations[TARGET].diplomacy.treaties = [];
    const repaired = normalizeTributeContracts(state);
    expect(repaired.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(repaired.civilizations[TARGET].diplomacy.treaties).toHaveLength(0);
  });

  it.each([
    ['no terms', (t: any) => { delete t.tribute; }],
    ['non-integer gold', (t: any) => { t.tribute.goldPerRound = 7.5; }],
    ['huge gold', (t: any) => { t.tribute.goldPerRound = 9999; }],
    ['zero gold', (t: any) => { t.tribute.goldPerRound = 0; }],
    ['turns beyond the term', (t: any) => { t.turnsRemaining = 99; }],
    ['negative turns', (t: any) => { t.turnsRemaining = -1; }],
    ['holder not a party', (t: any) => { t.tribute.payerId = 'ai-9'; }],
  ])('drops a malformed contract (%s)', (_name, damage) => {
    const state = structuredClone(active());
    damage(state.civilizations[DEMANDER].diplomacy.treaties.find(t => t.type === 'tribute'));
    const repaired = normalizeTributeContracts(state);
    expect(repaired.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
    expect(repaired.civilizations[TARGET].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(0);
  });

  it('drops a duplicate record of the same contract', () => {
    const state = structuredClone(active());
    const copy = state.civilizations[DEMANDER].diplomacy.treaties.find(t => t.type === 'tribute')!;
    state.civilizations[DEMANDER].diplomacy.treaties.push(structuredClone(copy));
    const repaired = normalizeTributeContracts(state);
    expect(repaired.civilizations[DEMANDER].diplomacy.treaties.filter(t => t.type === 'tribute')).toHaveLength(1);
  });

  it.each([
    ['payer mismatch', (r: any) => { r.tribute.payerId = DEMANDER; }],
    ['huge gold', (r: any) => { r.tribute.goldPerRound = 9999; }],
    ['no terms', (r: any) => { delete r.tribute; }],
    ['long term', (r: any) => { r.tribute.rounds = 500; }],
  ])('drops a tampered pending demand (%s)', (_name, damage) => {
    const state = structuredClone(pending());
    damage(state.pendingDiplomacyRequests![0]);
    expect(normalizeVassalage(state).pendingDiplomacyRequests).toEqual([]);
  });

  it('drops an expired pending demand like any other request', () => {
    const state = pending();
    expect(normalizeVassalage({ ...state, turn: state.turn + 10 }).pendingDiplomacyRequests).toEqual([]);
  });
});
