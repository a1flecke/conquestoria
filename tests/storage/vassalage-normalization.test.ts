import { describe, it, expect } from 'vitest';
import { normalizeVassalage } from '@/storage/vassalage-normalization';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { makeVassalageFixture } from '../systems/helpers/vassalage-fixture';
import { applyDiplomaticAction, acceptDiplomaticRequest } from '@/systems/diplomacy-system';
import { EventBus } from '@/core/event-bus';

describe('#910 vassalage save data', () => {
  it('defaults missing nested state and repairs malformed scalar/array fields without mutating input', () => {
    const state = makeVassalageFixture();
    const raw = state as any;
    delete raw.civilizations.third.diplomacy.vassalage;
    raw.civilizations.vassal.diplomacy.vassalage = { overlord: 'missing', vassals: 'oops', protectionScore: -3, protectionTimers: [null], peakCities: NaN, peakMilitary: -1 };
    raw.pendingDiplomacyRequests = [null, {}, { id: 'bad', type: 'unknown' }];
    const next = normalizeVassalage(state);
    expect(next.civilizations.third.diplomacy.vassalage).toMatchObject({ overlord: null, vassals: [], protectionScore: 100, protectionTimers: [] });
    expect(next.civilizations.vassal.diplomacy.vassalage).toMatchObject({ overlord: null, vassals: [], peakCities: 0, peakMilitary: 0, protectionTimers: [] });
    expect(next.pendingDiplomacyRequests).toEqual([]);
    expect(raw.civilizations.third.diplomacy.vassalage).toBeUndefined();
    expect(normalizeVassalage(next)).toEqual(next);
  });
  it.each([0, 24, 25, 26, CURRENT_SAVE_SCHEMA_VERSION])('preserves consent pending and atomic acceptance at schema %s', version => {
    const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', new EventBus());
    const restored = migrateSaveToCurrent(JSON.parse(JSON.stringify({ ...pending, saveSchemaVersion: version })));
    expect(restored.pendingDiplomacyRequests).toEqual(pending.pendingDiplomacyRequests);
    expect(restored.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
    expect(restored.defensiveLeagues).toEqual(pending.defensiveLeagues);
    const active = acceptDiplomaticRequest(restored, 'overlord', restored.pendingDiplomacyRequests![0].id, new EventBus());
    expect(normalizeVassalage(active).civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
  });
  it('preserves active roles and human independence requests, and removes expired or dangling requests', () => {
    const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', new EventBus());
    const active = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, new EventBus());
    active.civilizations.overlord.units = [];
    const petition = applyDiplomaticAction(active, 'vassal', 'overlord', 'petition_independence', new EventBus());
    expect(normalizeVassalage(petition).pendingDiplomacyRequests).toEqual(petition.pendingDiplomacyRequests);
    const expired = normalizeVassalage({ ...petition, turn: petition.turn + 10 });
    expect(expired.pendingDiplomacyRequests).toEqual([]);
    expect(expired.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
    const malformed = structuredClone(petition);
    malformed.civilizations.overlord.diplomacy.vassalage.vassals = [];
    const normalized = normalizeVassalage(malformed);
    expect(normalized.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
    expect(normalized.civilizations.vassal.diplomacy.treaties.some(t => t.type === 'vassalage')).toBe(false);
    expect(normalized.pendingDiplomacyRequests).toEqual([]);
  });
});


it('does not restart malformed or expired protection timers during load', () => {
  const pending = applyDiplomaticAction(makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', new EventBus());
  const active = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, new EventBus());
  active.civilizations.vassal.diplomacy.atWarWith = ['third'];
  for (const turnsRemaining of [NaN, -1, 0, 'bad']) {
    (active.civilizations.vassal.diplomacy.vassalage as any).protectionTimers = [{attackerCivId: 'third', turnsRemaining}];
    expect(normalizeVassalage(active).civilizations.vassal.diplomacy.vassalage.protectionTimers).toEqual([]);
  }
});
