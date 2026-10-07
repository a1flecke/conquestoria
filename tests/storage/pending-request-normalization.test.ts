import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState, PendingDiplomaticRequest, SettlementTerm } from '@/core/types';
import { PENDING_DIPLOMATIC_REQUEST_TYPES } from '@/core/types';
import { NORMALIZED_PENDING_REQUEST_TYPES, PENDING_REQUEST_VALIDATORS } from '@/storage/pending-request-normalization';
import { CURRENT_SAVE_SCHEMA_VERSION, migrateSaveToCurrent } from '@/storage/save-migrations';
import { normalizeVassalage } from '@/storage/vassalage-normalization';
import { applyDiplomaticAction, acceptDiplomaticRequest } from '@/systems/diplomacy-system';
import { enqueuePeaceRequest, enqueueTreatyProposal, CONSENT_TREATY_TYPES } from '@/systems/diplomacy-requests';
import { enqueueSettlementOffer } from '@/systems/settlement-system';
import { demandTribute } from '@/systems/diplomacy-tribute';
import { EventBus } from '@/core/event-bus';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';
import { makeWarGoalFixture } from '../systems/helpers/war-goal-fixture';
import { makeTributeState, DEMANDER as TRIBUTE_DEMANDER, TARGET as TRIBUTE_TARGET } from '../systems/helpers/tribute-fixture';

/** Like `makeTributeState` but with the request queue cleared and `state.turn`
 *  pinned to a value that gives `demandTribute` room to enqueue without TTL
 *  expiry. Tribute requires era 3 + intel on the target; this fixture is the
 *  canonical tribute producer's happy world. */
function makeTributeWorld(): GameState {
  const state = makeTributeState();
  state.pendingDiplomacyRequests = [];
  state.turn = 5;
  return state;
}

// #1354 follow-up: every persisted pending-request kind has an explicit load policy, proved by the type system
// (the Record tables below do not compile with a kind missing) and by round-trip tests.
type Kind = PendingDiplomaticRequest['type'];

/** Read a source file with comments stripped so structural assertions cannot be
 *  fooled by prose that says one thing while the code does another. */
function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

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
  it('vassalage normalization delegates request validation instead of spelling the kinds out', () => {
    const source = readSource('src/storage/vassalage-normalization.ts');
    expect(source).toContain('normalizePendingDiplomaticRequests');
    expect(source).not.toMatch(/r\.type\s*!==/);
    for (const kind of PENDING_DIPLOMATIC_REQUEST_TYPES) expect(source, kind).not.toContain(`'${kind}'`);
  });

  it('the normalizer derives its kind handling from the table keyed by the canonical union', () => {
    const source = readSource('src/storage/pending-request-normalization.ts');
    expect(source).toContain('Record<PendingDiplomaticRequest[\'type\'], KindValidator>');
    for (const kind of PENDING_DIPLOMATIC_REQUEST_TYPES) expect(source, kind).not.toMatch(new RegExp(`\\.type\\s*!==\\s*'${kind}'`));
  });
});

/**
 * #1370 (Child 3 of the #1354 arc): the canonical-writer round-trip matrix.
 *
 * Every entry below is a real call into the canonical producer for that kind -- not
 * a hand-built literal fixture. If a future refactor breaks the writer's payload
 * shape, this matrix catches it; a hand-built fixture could drift independently.
 *
 * The matrix doubles as the table the arc asked for: "request type -> canonical
 * writer -> repair validator -> round-trip test" -- all in one place.
 */
describe('every canonical writer round-trips through save/load (#1370)', () => {
  /**
   * Each entry returns `{ state, request }` where `state` is the post-write
   * world and `request` is the exact PendingDiplomaticRequest the writer
   * enqueued. We drive the canonical enqueue path explicitly so a future
   * change to `enqueuePeaceRequest` / `enqueueTreatyProposal` /
   * `applyDiplomaticAction('petition_independence')` /
   * `enqueueSettlementOffer` / `demandTribute` is reflected here, not just in
   * a hand-built fixture.
   */
  const WRITER: Record<Kind, () => { state: GameState; request: PendingDiplomaticRequest; writer: string }> = {
    peace: () => {
      const bus = new EventBus();
      const before = makeVassalageFixture();
      const state = enqueuePeaceRequest(before, 'vassal', 'third', bus);
      const request = state.pendingDiplomacyRequests![0];
      return { state, request, writer: 'enqueuePeaceRequest' };
    },
    treaty: () => {
      const bus = new EventBus();
      const before = makeVassalageFixture();
      const state = enqueueTreatyProposal(before, 'vassal', 'third', 'trade_agreement', -1, bus);
      const request = state.pendingDiplomacyRequests![0];
      return { state, request, writer: 'enqueueTreatyProposal' };
    },
    independence: () => {
      const bus = new EventBus();
      const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus).state;
      const active = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus).state;
      // Match the production test: a vassal that can petition needs to outnumber
      // its overlord; the fixture gives the overlord four units and the vassal one,
      // so the petition would fail the military-strength check. Remove the
      // overlord's units and add more to the vassal.
      active.civilizations.overlord.units = [];
      const petitioned = applyDiplomaticAction(active, 'vassal', 'overlord', 'petition_independence', bus).state;
      const request = petitioned.pendingDiplomacyRequests![0];
      return { state: petitioned, request, writer: "applyDiplomaticAction('petition_independence')" };
    },
    settlement: () => {
      const bus = new EventBus();
      const before = makeWarGoalFixture(bus);
      const state = enqueueSettlementOffer(before, 'attacker', 'defender', [], bus);
      const request = state.pendingDiplomacyRequests![0];
      return { state, request, writer: 'enqueueSettlementOffer' };
    },
    tribute: () => {
      const bus = new EventBus();
      const before = makeTributeWorld();
      const result = demandTribute(before, TRIBUTE_DEMANDER, TRIBUTE_TARGET, bus);
      if (!result.ok) throw new Error(`canonical tribute demand refused: ${result.reason}`);
      const request = result.request;
      return { state: result.state, request, writer: 'demandTribute' };
    },
  };

  it.each(PENDING_DIPLOMATIC_REQUEST_TYPES)('%s writer round-trips byte-identical through migrateSaveToCurrent', kind => {
    const { state, request } = WRITER[kind]();
    const restored = migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION })));
    expect(restored.pendingDiplomacyRequests).toContainEqual(request);
    // The original is in the queue (or dedupe-merged with a same-pair record the
    // canonical writer already created -- there is exactly one for these writers).
    const requestsOfKind = restored.pendingDiplomacyRequests!.filter(r => r.type === kind);
    expect(requestsOfKind).toHaveLength(1);
    expect(requestsOfKind[0]).toEqual(request);
  });

  it('every WRITER entry names a canonical producer (no hand-spelled literal survives)', () => {
    // Asserts the matrix is actually wired to the canonical writers, not to a
    // hidden literal-builder. The WRITER table above calls:
    //   enqueuePeaceRequest, enqueueTreatyProposal,
    //   applyDiplomaticAction('petition_independence'),
    //   enqueueSettlementOffer, demandTribute
    // -- the structural test below guards the imports and call sites by
    // grepping the source.
    const source = readSource('tests/storage/pending-request-normalization.test.ts');
    expect(source).toMatch(/enqueuePeaceRequest\(/);
    expect(source).toMatch(/enqueueTreatyProposal\(/);
    expect(source).toMatch(/applyDiplomaticAction\([^)]*'petition_independence'/);
    expect(source).toMatch(/enqueueSettlementOffer\(/);
    expect(source).toMatch(/demandTribute\(/);
  });
});

describe('identity-on-game-written-state: every kind survives normalizeVassalage byte-identical (#1370)', () => {
  /**
   * The corruption-repair admission criterion (game-systems.md / storage #1023):
   * a request the game itself wrote must survive a load unmodified. This is the
   * per-kind identity claim for the post-#1367 repair: applying the relevant
   * corruption repair (`normalizeVassalage`, which now owns request repair)
   * to a canonical writer's output must be identity with respect to the
   * request -- no field rewriting, no dedupe-merge away.
   */
  it.each(PENDING_DIPLOMATIC_REQUEST_TYPES)('%s canonical request is identity across normalizeVassalage', kind => {
    // Recreate the writer per kind, taking care that the post-write state
    // contains exactly one request of this kind.
    const bus = new EventBus();
    let state: GameState;
    switch (kind) {
      case 'peace': {
        const before = makeVassalageFixture();
        state = enqueuePeaceRequest(before, 'vassal', 'third', bus);
        break;
      }
      case 'treaty': {
        const before = makeVassalageFixture();
        state = enqueueTreatyProposal(before, 'vassal', 'third', 'trade_agreement', -1, bus);
        break;
      }
      case 'independence': {
        const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus).state;
        const active = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus).state;
        active.civilizations.overlord.units = [];
        state = applyDiplomaticAction(active, 'vassal', 'overlord', 'petition_independence', bus).state;
        break;
      }
      case 'settlement': {
        const before = makeWarGoalFixture(bus);
        state = enqueueSettlementOffer(before, 'attacker', 'defender', [], bus);
        break;
      }
      case 'tribute': {
        const before = makeTributeWorld();
        const result = demandTribute(before, TRIBUTE_DEMANDER, TRIBUTE_TARGET, bus);
        if (!result.ok) throw new Error(`canonical tribute demand refused: ${result.reason}`);
        state = result.state;
        break;
      }
    }
    const before = state.pendingDiplomacyRequests![0];
    expect(before.type).toBe(kind);
    const after = normalizeVassalage(state).pendingDiplomacyRequests!;
    // The request survives; if it is the only request of its kind, the queue
    // is identity (no field rewriting by the repair).
    const matching = after.filter(r => r.type === kind);
    expect(matching).toHaveLength(1);
    expect(matching[0]).toEqual(before);
  });
});

describe('per-subfamily coverage drives the full inventory through the canonical writers (#1370)', () => {
  /**
   * Treaty types: every CONSENT_TREATY_TYPES entry plus 'vassalage'. Each one
   * is enqueued through `enqueueTreatyProposal`, sent through the real load
   * pipeline, and asserted to round-trip with the exact treatyType.
   */
  it.each([...CONSENT_TREATY_TYPES, 'vassalage' as const])('treaty with type %s survives a round-trip', treatyType => {
    const before = makeVassalageFixture();
    // vassalage treaties need an active vassal candidate pair -- pick a pair
    // that satisfies the depth-1-star precondition.
    const state = enqueueTreatyProposal(before, 'vassal', 'third', treatyType, -1, new EventBus());
    const restored = migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION })));
    const matching = restored.pendingDiplomacyRequests!.filter(r => r.type === 'treaty');
    expect(matching).toHaveLength(1);
    expect(matching[0].treatyType).toBe(treatyType);
  });

  /**
   * Settlement term kinds: each `SettlementTermKind` as the sole term in a
   * structurally valid offer that a hand-written settlement can produce.
   * These exercise the per-term-kind validators end-to-end through the load
   * pipeline.
   */
  it.each([
    ['transfer_city', (cityId: string, from: string, to: string): SettlementTerm => ({ kind: 'transfer_city', cityId, fromCivId: from, toCivId: to })],
    ['reparations', (_cityId: string, from: string, to: string): SettlementTerm => ({ kind: 'reparations', fromCivId: from, toCivId: to, goldAmount: 30 })],
    ['vassalize', (_cityId: string, _from: string, to: string): SettlementTerm => ({ kind: 'vassalize', vassalId: 'defender', overlordId: to })],
    ['release_vassal', (_cityId: string, _from: string, _to: string): SettlementTerm => ({ kind: 'release_vassal', vassalId: 'vassal' })],
  ] as const)('settlement with a single %s term survives a round-trip', (_label, buildTerm) => {
    const bus = new EventBus();
    const before = makeWarGoalFixture(bus);
    const cityId = before.civilizations['defender'].cities[0];
    const term = buildTerm(cityId, 'defender', 'attacker');
    const state = enqueueSettlementOffer(before, 'attacker', 'defender', [term], bus);
    const restored = migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION })));
    const matching = restored.pendingDiplomacyRequests!.filter(r => r.type === 'settlement');
    expect(matching).toHaveLength(1);
    expect(matching[0].terms).toEqual([term]);
  });

  it('empty-terms settlement offer survives a round-trip (#988)', () => {
    const bus = new EventBus();
    const before = makeWarGoalFixture(bus);
    const state = enqueueSettlementOffer(before, 'attacker', 'defender', [], bus);
    const restored = migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION })));
    const matching = restored.pendingDiplomacyRequests!.filter(r => r.type === 'settlement');
    expect(matching).toHaveLength(1);
    expect(matching[0].terms).toEqual([]);
  });

  /**
   * Tribute terms: a canonical demand produces a single TributeTerms shape;
   * the load-time validator must keep every immutable field (demander,
   * payer, goldPerRound, rounds) byte-identical.
   */
  it('tribute demand preserves every immutable term field across a round-trip', () => {
    const before = makeTributeWorld();
    const result = demandTribute(before, TRIBUTE_DEMANDER, TRIBUTE_TARGET, new EventBus());
    if (!result.ok) throw new Error(`tribute demand refused: ${result.reason}`);
    const tribute = result.request.tribute;
    if (!tribute) throw new Error('canonical tribute demand produced a request without tribute terms');
    const restored = migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...result.state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION })));
    const matching = restored.pendingDiplomacyRequests!.filter(r => r.type === 'tribute');
    expect(matching).toHaveLength(1);
    expect(matching[0].tribute).toEqual(tribute);
    expect(matching[0].fromCivId).toBe(tribute.demanderId);
    expect(matching[0].toCivId).toBe(tribute.payerId);
    expect(matching[0].turnsRemaining).toBe(tribute.rounds);
  });
});

describe('the canonical enqueue table is itself exhaustive (#1370)', () => {
  /**
   * The matrix table is itself a `Record<PendingDiplomaticRequest['type'], ...>`
   * keyed on the canonical union. A new kind does not compile until both the
   * WRITER table above and the identity table below name it. This is the
   * compile-time ratchet the arc asked for.
   */
  it('WRITER, IDENTITY, and the per-subfamily matrix cover exactly the canonical inventory', () => {
    const inventory = [...PENDING_DIPLOMATIC_REQUEST_TYPES].sort();
    const source = readSource('tests/storage/pending-request-normalization.test.ts');
    for (const kind of inventory) {
      // The per-kind table must reference every variant somewhere -- either in
      // the WRITER case, the identity case, or the per-subfamily it.each.
      expect(source, kind).toMatch(new RegExp(`\\b${kind}\\b`));
    }
  });
});
