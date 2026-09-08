import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { acceptDiplomaticRequest, applyDiplomaticAction } from '@/systems/diplomacy-system';
import {
  buildDominationActorFacts,
  getDominationActorFact,
} from '@/systems/domination-sovereignty';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';
import { makeVassalageFixture } from './helpers/vassalage-fixture';
import { createBreakawayFromCity } from '@/systems/breakaway-system';

describe('Domination sovereignty facts', () => {
  it('uses canonical liveness rather than civilization rosters', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
    state.civilizations['ai-1'].cities = ['ghost-city'];

    expect(getDominationActorFact(state, 'ai-1')).toMatchObject({
      civId: 'ai-1',
      disposition: 'eliminated',
    });
  });

  it('recognizes a real accepted bilateral vassalage treaty as a direct vassal', () => {
    const bus = new EventBus();
    const pending = applyDiplomaticAction(
      makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
    );
    const accepted = acceptDiplomaticRequest(
      pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus,
    );

    expect(getDominationActorFact(accepted, 'vassal')).toEqual({
      civId: 'vassal',
      disposition: 'vassal',
      overlordId: 'overlord',
    });
  });

  it('fails closed when a vassalage treaty is missing from either endpoint', () => {
    const bus = new EventBus();
    const pending = applyDiplomaticAction(
      makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
    );
    const accepted = acceptDiplomaticRequest(
      pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus,
    );
    accepted.civilizations.overlord.diplomacy.treaties = [];

    expect(getDominationActorFact(accepted, 'vassal')).toEqual({
      civId: 'vassal',
      disposition: 'independent',
      overlordId: null,
    });
  });

  it('treats only a qualifying one-city secession as provisional', () => {
    const { state, breakawayId } = makeBreakawayFixture({
      breakawayStartedTurn: 12,
      turn: 20,
    });

    expect(getDominationActorFact(state, breakawayId)).toMatchObject({
      disposition: 'provisional',
    });
  });

  it('recognizes a secession created through the real breakaway lifecycle', () => {
    const initial = makeBreakawayFixture();
    const state = createBreakawayFromCity(initial.state, initial.cityId, new EventBus());

    expect(getDominationActorFact(state, `breakaway-${initial.cityId}`)).toMatchObject({
      disposition: 'provisional',
    });
  });

  it('counts a secession at its establishment deadline and after growth', () => {
    const deadline = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 62 });
    expect(getDominationActorFact(deadline.state, deadline.breakawayId)).toMatchObject({
      disposition: 'independent',
    });

    const growing = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 });
    const capital = growing.state.cities['city-capital'];
    growing.state.cities['city-breakaway-second'] = {
      ...capital,
      id: 'city-breakaway-second',
      owner: growing.breakawayId,
    };
    expect(getDominationActorFact(growing.state, growing.breakawayId)).toMatchObject({
      disposition: 'independent',
    });
  });

  it('does not exempt secessions with no city, an established status, or a lost origin', () => {
    const noCity = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 });
    const city = noCity.state.cities[noCity.cityId];
    delete noCity.state.cities[noCity.cityId];
    noCity.state.units['settler-breakaway'] = { ...noCity.state.units['unit-breakaway'], id: 'settler-breakaway', type: 'settler' };
    expect(getDominationActorFact(noCity.state, noCity.breakawayId)).toMatchObject({
      disposition: 'independent',
    });

    const established = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20, established: true });
    expect(getDominationActorFact(established.state, established.breakawayId)).toMatchObject({
      disposition: 'independent',
    });

    const originLost = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 });
    delete originLost.state.cities['city-capital'];
    expect(getDominationActorFact(originLost.state, originLost.breakawayId)).toMatchObject({
      disposition: 'independent',
    });
  });

  it.each([
    ['a duplicated overlord link', (state: ReturnType<typeof acceptVassalage>) => {
      state.civilizations.overlord.diplomacy.vassalage.vassals.push('vassal');
    }],
    ['a duplicated treaty', (state: ReturnType<typeof acceptVassalage>) => {
      state.civilizations.overlord.diplomacy.treaties.push(
        structuredClone(state.civilizations.overlord.diplomacy.treaties.find(treaty => treaty.type === 'vassalage')!),
      );
    }],
    ['a nested vassalage edge', (state: ReturnType<typeof acceptVassalage>) => {
      state.civilizations.overlord.diplomacy.vassalage.overlord = 'third';
    }],
    ['a cyclic vassalage edge', (state: ReturnType<typeof acceptVassalage>) => {
      state.civilizations.vassal.diplomacy.vassalage.vassals = ['overlord'];
    }],
  ])('fails closed for %s', (_description, corrupt) => {
    const state = acceptVassalage();
    corrupt(state);

    expect(getDominationActorFact(state, 'vassal')).toEqual({
      civId: 'vassal',
      disposition: 'independent',
      overlordId: null,
    });
  });

  it('fails closed when a reversed duplicate treaty shadows the canonical treaty', () => {
    const state = acceptVassalage();
    const reversed = {
      type: 'vassalage' as const,
      civA: 'overlord',
      civB: 'vassal',
      turnsRemaining: -1,
    };
    state.civilizations.vassal.diplomacy.treaties.push(reversed);
    state.civilizations.overlord.diplomacy.treaties.push(structuredClone(reversed));

    expect(getDominationActorFact(state, 'vassal')).toEqual({
      civId: 'vassal',
      disposition: 'independent',
      overlordId: null,
    });
  });

  it('fails closed when the only vassalage treaty has an invalid negative duration', () => {
    const state = acceptVassalage();
    for (const civId of ['vassal', 'overlord']) {
      const treaty = state.civilizations[civId].diplomacy.treaties.find(
        candidate => candidate.type === 'vassalage',
      );
      if (!treaty) throw new Error('fixture requires an active vassalage treaty');
      treaty.turnsRemaining = -2;
    }

    expect(getDominationActorFact(state, 'vassal')).toEqual({
      civId: 'vassal',
      disposition: 'independent',
      overlordId: null,
    });
  });

  it('fails closed when a malformed duplicate accompanies the canonical treaty', () => {
    const state = acceptVassalage();
    for (const civId of ['vassal', 'overlord']) {
      const treaty = state.civilizations[civId].diplomacy.treaties.find(
        candidate => candidate.type === 'vassalage',
      );
      if (!treaty) throw new Error('fixture requires an active vassalage treaty');
      state.civilizations[civId].diplomacy.treaties.push({
        ...structuredClone(treaty),
        turnsRemaining: -2,
      });
    }

    expect(getDominationActorFact(state, 'vassal')).toEqual({
      civId: 'vassal',
      disposition: 'independent',
      overlordId: null,
    });
  });

  it('uses the same sorted fact for single-actor and batch queries', () => {
    const state = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 }).state;
    const batch = buildDominationActorFacts(state);

    expect(batch).toEqual([...batch].sort((a, b) => a.civId.localeCompare(b.civId)));
    for (const fact of batch) expect(getDominationActorFact(state, fact.civId)).toEqual(fact);
    expect(getDominationActorFact(state, 'mc-geneva')).toBeNull();
  });
});

function acceptVassalage() {
  const bus = new EventBus();
  const pending = applyDiplomaticAction(
    makeVassalageFixture(), 'vassal', 'overlord', 'offer_vassalage', bus,
  );
  return acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus);
}
