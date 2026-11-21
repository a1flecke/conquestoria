import { describe, it, expect } from 'vitest';
import { applyAiMinorCivGifts, applyAiMinorCivQuestPayments } from '@/ai/ai-diplomacy';
import { EventBus } from '@/core/event-bus';
import { NATIONAL_INTENT_POSTURE } from '@/ai/ai-national-intent-posture';
import type { GameState, PersonalityTraits, Quest } from '@/core/types';
import { makeBreakawayFixture } from '../systems/helpers/breakaway-fixture';

const DIPLOMATIC: PersonalityTraits = {
  traits: ['diplomatic'],
  warLikelihood: 0.2,
  expansionDrive: 0.3,
  diplomacyFocus: 0.8,
};

const POSTURE = NATIONAL_INTENT_POSTURE.develop;

/** A city-state 'mc-sparta' at (6,0) that the acting civ ('player') has a low relationship with. */
function makeGiftFixture(options: { discovered: boolean; atWar?: boolean }): GameState {
  const { state } = makeBreakawayFixture({ breakawayStartedTurn: 10 });
  state.minorCivs = {
    'mc-sparta': {
      id: 'mc-sparta',
      definitionId: 'sparta',
      cityId: 'mc-city',
      units: [],
      diplomacy: {
        relationships: { player: 10 },
        treaties: [],
        events: [],
        atWarWith: options.atWar ? ['player'] : [],
        treacheryScore: 0,
        vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
      },
      activeQuests: {},
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 0,
    },
  };
  state.cities['mc-city'] = {
    ...state.cities['city-border'],
    id: 'mc-city',
    owner: 'mc-sparta',
    position: { q: 6, r: 0 },
    ownedTiles: [{ q: 6, r: 0 }],
  };
  if (options.atWar) {
    state.civilizations.player.diplomacy = {
      ...state.civilizations.player.diplomacy,
      atWarWith: [...state.civilizations.player.diplomacy.atWarWith, 'mc-sparta'],
    };
  }
  if (options.discovered) state.civilizations.player.visibility.tiles['6,0'] = 'fog';
  state.civilizations.player.gold = 100;
  return state;
}

describe('applyAiMinorCivGifts', () => {
  it('gifts a discovered, peaceful city-state through the shared gift action', () => {
    const state = makeGiftFixture({ discovered: true });

    const next = applyAiMinorCivGifts(state, 'player', DIPLOMATIC, POSTURE);

    expect(next.civilizations.player.gold).toBe(75);
    expect(next.minorCivs['mc-sparta'].diplomacy.relationships.player).toBe(20);
    expect(state.civilizations.player.gold).toBe(100);
  });

  it('never gifts a city-state the civ has not discovered', () => {
    const state = makeGiftFixture({ discovered: false });

    const next = applyAiMinorCivGifts(state, 'player', DIPLOMATIC, POSTURE);

    expect(next.civilizations.player.gold).toBe(100);
    expect(next.minorCivs['mc-sparta'].diplomacy.relationships.player).toBe(10);
  });

  it('never gifts a city-state the civ is at war with', () => {
    const state = makeGiftFixture({ discovered: true, atWar: true });

    const next = applyAiMinorCivGifts(state, 'player', DIPLOMATIC, POSTURE);

    expect(next.civilizations.player.gold).toBe(100);
    expect(next.minorCivs['mc-sparta'].diplomacy.relationships.player).toBe(10);
  });

  it('stops gifting when the treasury cannot cover another gift', () => {
    const state = makeGiftFixture({ discovered: true });
    state.civilizations.player.gold = 24;

    const next = applyAiMinorCivGifts(state, 'player', DIPLOMATIC, POSTURE);

    expect(next.civilizations.player.gold).toBe(24);
  });
});

function goldQuest(amount: number): Quest {
  return {
    id: 'quest-1', type: 'gift_gold', description: 'Send gold', target: { type: 'gift_gold', amount },
    reward: { relationshipBonus: 20 }, progress: 0, status: 'active', turnIssued: 1, expiresOnTurn: 50,
  };
}

/** Puts the acting civ's own city under a quarantined outbreak, so it is saving for a cure. */
function withPendingCure(state: GameState): GameState {
  const cityId = state.civilizations.player.cities[0];
  state.activeCrises = {
    'crisis-1': {
      id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'player',
      cityIds: [cityId], quarantinedCityIds: [cityId], tileKeys: [], startedTurn: 0, stage: 'active', turnsInStage: 10,
    },
  };
  state.opponentChallenge = 'standard';
  state.civilizations.player.isHuman = false;
  return state;
}

function cureReserveOf(state: GameState): number {
  return state.cities[state.civilizations.player.cities[0]].population * 15 * 2;
}

describe('city-state spending waits for a pending crisis cure', () => {
  it('skips a discretionary gift that would dip below the cure reserve', () => {
    const state = withPendingCure(makeGiftFixture({ discovered: true }));
    state.civilizations.player.gold = cureReserveOf(state) + 24;

    const next = applyAiMinorCivGifts(state, 'player', DIPLOMATIC, POSTURE);

    expect(next.civilizations.player.gold).toBe(cureReserveOf(state) + 24);
  });

  it('still gifts from gold above the cure reserve', () => {
    const state = withPendingCure(makeGiftFixture({ discovered: true }));
    state.civilizations.player.gold = cureReserveOf(state) + 25;

    const next = applyAiMinorCivGifts(state, 'player', DIPLOMATIC, POSTURE);

    expect(next.civilizations.player.gold).toBe(cureReserveOf(state));
  });

  it('holds a city-state gold quest until the cure is affordable as well', () => {
    const state = withPendingCure(makeGiftFixture({ discovered: true }));
    state.minorCivs['mc-sparta'].activeQuests.player = goldQuest(75);
    state.civilizations.player.gold = cureReserveOf(state) + 74;

    const held = applyAiMinorCivQuestPayments(state, 'player', new EventBus());
    expect(held.civilizations.player.gold).toBe(cureReserveOf(state) + 74);

    state.civilizations.player.gold = cureReserveOf(state) + 75;
    const paid = applyAiMinorCivQuestPayments(state, 'player', new EventBus());
    expect(paid.civilizations.player.gold).toBe(cureReserveOf(state));
  });

  it('pays a city-state gold quest when there is no cure to save for', () => {
    const state = makeGiftFixture({ discovered: true });
    state.minorCivs['mc-sparta'].activeQuests.player = goldQuest(75);
    state.civilizations.player.gold = 75;

    const paid = applyAiMinorCivQuestPayments(state, 'player', new EventBus());

    expect(paid.civilizations.player.gold).toBe(0);
  });
});
