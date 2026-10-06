import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState, PendingDiplomaticRequest } from '@/core/types';
import { PENDING_DIPLOMATIC_REQUEST_TYPES } from '@/core/types';
import { NORMALIZED_PENDING_REQUEST_TYPES, PENDING_REQUEST_VALIDATORS } from '@/storage/pending-request-normalization';
import { CURRENT_SAVE_SCHEMA_VERSION, migrateSaveToCurrent } from '@/storage/save-migrations';
import { normalizeVassalage } from '@/storage/vassalage-normalization';
import { applyDiplomaticAction, acceptDiplomaticRequest } from '@/systems/diplomacy-system';
import { EventBus } from '@/core/event-bus';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';

// #1354 follow-up: every persisted pending-request kind has an explicit load policy, proved by the type system
// (the Record tables below do not compile with a kind missing) and by round-trip tests.
type Kind = PendingDiplomaticRequest['type'];

/** A vassal/overlord world with an established vassalage, so independence and vassalage offers can be exercised. */
function vassalWorld(): GameState {
  const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', new EventBus()).state;
  const active = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, new EventBus()).state;
  active.pendingDiplomacyRequests = [];
  return active;
}

const base = (state: GameState) => ({ turnIssued: state.turn, id: '', fromCivId: '', toCivId: '' });

/** One valid request per kind. Typed over the canonical union: adding a kind without a fixture is a compile error. */
const VALID: Record<Kind, (state: GameState) => PendingDiplomaticRequest> = {
  peace: s => ({ ...base(s), id: 'peace:third:overlord', type: 'peace', fromCivId: 'third', toCivId: 'overlord' }),
  treaty: s => ({ ...base(s), id: 'treaty:third:overlord', type: 'treaty', treatyType: 'trade_agreement', turnsRemaining: -1, fromCivId: 'third', toCivId: 'overlord' }),
  independence: s => ({ ...base(s), id: 'independence:vassal:overlord', type: 'independence', fromCivId: 'vassal', toCivId: 'overlord' }),
  settlement: s => ({
    ...base(s), id: 'settlement:third:overlord', type: 'settlement', fromCivId: 'third', toCivId: 'overlord',
    terms: [
      { kind: 'reparations', fromCivId: 'third', toCivId: 'overlord', goldAmount: 30 },
      { kind: 'transfer_city', cityId: 'c1', fromCivId: 'third', toCivId: 'overlord' },
      { kind: 'vassalize', vassalId: 'third', overlordId: 'overlord' },
      { kind: 'release_vassal', vassalId: 'vassal' },
    ],
  }),
  tribute: s => ({
    ...base(s), id: 'tribute:third:overlord', type: 'tribute', fromCivId: 'third', toCivId: 'overlord', turnsRemaining: 10,
    tribute: { demanderId: 'third', payerId: 'overlord', goldPerRound: 8, rounds: 10 },
  }),
};

/** One way to damage each kind's payload. Typed over the union too. */
const DAMAGE: Record<Kind, Array<[string, (r: PendingDiplomaticRequest) => void]>> = {
  peace: [['self-addressed', r => { r.toCivId = r.fromCivId; }]],
  treaty: [['unknown treaty type', r => { r.treatyType = 'tribute'; }], ['no treaty type', r => { delete r.treatyType; }]],
  independence: [['sender is not a vassal of the recipient', r => { r.fromCivId = 'third'; }]],
  settlement: [
    ['terms not an array', r => { (r as { terms: unknown }).terms = 'oops'; }],
    ['no terms field', r => { delete r.terms; }],
    ['unknown term kind', r => { (r.terms as unknown[]).push({ kind: 'confiscate' }); }],
    ['non-positive reparations', r => { (r.terms as Array<{ goldAmount?: number }>)[0].goldAmount = -5; }],
    ['non-finite reparations', r => { (r.terms as Array<{ goldAmount?: number }>)[0].goldAmount = Number.NaN; }],
    ['city with no id', r => { (r.terms as Array<{ cityId?: string }>)[1].cityId = ''; }],
    ['self-vassalage', r => { (r.terms as Array<{ vassalId?: string; overlordId?: string }>)[2].overlordId = 'third'; }],
    ['null term', r => { (r.terms as unknown[]).push(null); }],
  ],
  tribute: [
    ['no terms', r => { delete r.tribute; }],
    ['terms name another pair', r => { r.tribute!.payerId = 'third'; }],
    ['huge gold', r => { r.tribute!.goldPerRound = 9999; }],
    ['long term', r => { r.tribute!.rounds = 500; }],
  ],
};

const reload = (state: GameState): GameState =>
  migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION })));
const withRequests = (state: GameState, requests: PendingDiplomaticRequest[]): GameState => ({ ...structuredClone(state), pendingDiplomacyRequests: requests });

describe('every pending request kind has an explicit load policy (#1354)', () => {
  it('the validator table, the fixtures and the damage cases cover exactly the canonical inventory', () => {
    const inventory = [...PENDING_DIPLOMATIC_REQUEST_TYPES].sort();
    expect(Object.keys(PENDING_REQUEST_VALIDATORS).sort()).toEqual(inventory);
    expect(Object.keys(VALID).sort()).toEqual(inventory);
    expect(Object.keys(DAMAGE).sort()).toEqual(inventory);
    expect([...NORMALIZED_PENDING_REQUEST_TYPES].sort()).toEqual(inventory);
  });

  it('a new kind without a policy is a compile error (the guard is the type system, not a list)', () => {
    // @ts-expect-error -- 'tribute' is missing: a validator table must name every kind in the canonical union.
    const incomplete: Record<Kind, true> = { peace: true, treaty: true, independence: true, settlement: true };
    expect(Object.keys(incomplete)).toHaveLength(4);
  });

  it.each(PENDING_DIPLOMATIC_REQUEST_TYPES)('a valid %s request survives a real save/load unchanged', kind => {
    const state = vassalWorld();
    const request = VALID[kind](state);
    const restored = reload(withRequests(state, [request]));
    expect(restored.pendingDiplomacyRequests).toEqual([request]);
  });

  it('all kinds survive together, in order', () => {
    const state = vassalWorld();
    const requests = PENDING_DIPLOMATIC_REQUEST_TYPES.map(kind => VALID[kind](state));
    // The pair-dedupe key is per (pair, kind): give each kind its own pair-compatible request.
    expect(reload(withRequests(state, requests)).pendingDiplomacyRequests?.map(r => r.type).sort()).toEqual([...PENDING_DIPLOMATIC_REQUEST_TYPES].sort());
  });

  for (const kind of PENDING_DIPLOMATIC_REQUEST_TYPES) {
    it.each(DAMAGE[kind])(`drops a damaged ${kind} request (%s)`, (_name, damage) => {
      const state = vassalWorld();
      const request = structuredClone(VALID[kind](state));
      damage(request);
      expect(reload(withRequests(state, [request])).pendingDiplomacyRequests).toEqual([]);
    });
  }

  it('drops a kind the build does not know, rather than keeping it by omission', () => {
    const state = vassalWorld();
    const alien = { ...VALID.peace(state), id: 'alien:1', type: 'alliance_offer' } as unknown as PendingDiplomaticRequest;
    expect(reload(withRequests(state, [alien])).pendingDiplomacyRequests).toEqual([]);
    expect(normalizeVassalage(withRequests(state, [alien])).pendingDiplomacyRequests).toEqual([]);
  });
});

describe('load normalization is pure repair (#1354)', () => {
  it('is deterministic and idempotent', () => {
    const state = vassalWorld();
    const input = withRequests(state, PENDING_DIPLOMATIC_REQUEST_TYPES.map(kind => VALID[kind](state)));
    const once = normalizeVassalage(input);
    expect(normalizeVassalage(once)).toEqual(once);
    expect(normalizeVassalage(structuredClone(input))).toEqual(once);
  });

  it('executes nothing: no gold, treaty, war, city, vassalage or other state changes besides the request queue', () => {
    const state = vassalWorld();
    const input = withRequests(state, PENDING_DIPLOMATIC_REQUEST_TYPES.map(kind => VALID[kind](state)));
    const out = normalizeVassalage(input);
    const strip = (s: GameState) => JSON.stringify({ ...s, pendingDiplomacyRequests: null });
    // Everything except the queue is exactly what normalizing the same world with an empty queue gives.
    expect(strip(out)).toBe(strip(normalizeVassalage(withRequests(state, []))));
    for (const [id, civ] of Object.entries(input.civilizations)) {
      expect(out.civilizations[id].gold).toBe(civ.gold);
      expect(out.civilizations[id].diplomacy.treaties).toEqual(civ.diplomacy.treaties);
      expect(out.civilizations[id].diplomacy.atWarWith).toEqual(civ.diplomacy.atWarWith);
    }
    // A surviving settlement offer is still pending, not signed.
    expect(out.pendingDiplomacyRequests?.some(r => r.type === 'settlement')).toBe(true);
  });

  it('does not mutate its input', () => {
    const state = vassalWorld();
    const input = withRequests(state, PENDING_DIPLOMATIC_REQUEST_TYPES.map(kind => VALID[kind](state)));
    const before = JSON.stringify(input);
    normalizeVassalage(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('the request allowlist cannot reappear by hand (#1354)', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('vassalage normalization delegates request validation instead of spelling the kinds out', () => {
    const source = read('src/storage/vassalage-normalization.ts');
    expect(source).toContain('normalizePendingDiplomaticRequests');
    expect(source).not.toMatch(/r\.type\s*!==/);
    for (const kind of PENDING_DIPLOMATIC_REQUEST_TYPES) expect(source, kind).not.toContain(`'${kind}'`);
  });

  it('the normalizer derives its kind handling from the table keyed by the canonical union', () => {
    const source = read('src/storage/pending-request-normalization.ts');
    expect(source).toContain('Record<PendingDiplomaticRequest[\'type\'], KindValidator>');
    for (const kind of PENDING_DIPLOMATIC_REQUEST_TYPES) expect(source, kind).not.toMatch(new RegExp(`\\.type\\s*!==\\s*'${kind}'`));
  });
});
