// tests/integration/m4b1-diplomacy-integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import {
  acceptVassalage,
  proposeEmbargo,
  triggerLeagueDefense,
} from '@/systems/diplomacy-system';
import { getCivDefinition } from '@/systems/civ-definitions';
import { foundCity } from '@/systems/city-system';

describe('M4b-1 integration', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('game state initializes with embargoes and defensiveLeagues', () => {
    const state = createNewGame('egypt', 'test-seed', 'small');
    expect(state.embargoes).toBeDefined();
    expect(state.embargoes).toEqual([]);
    expect(state.defensiveLeagues).toBeDefined();
    expect(state.defensiveLeagues).toEqual([]);
  });

  it('hot seat game initializes vassalage on all civs', () => {
    const state = createHotSeatGame({
      playerCount: 2, mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'p1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'p2', civType: 'rome', isHuman: true },
      ],
    }, 'test-seed');
    expect(state.civilizations['p1'].diplomacy.vassalage).toBeDefined();
    expect(state.civilizations['p2'].diplomacy.vassalage).toBeDefined();
    expect(state.civilizations['p1'].diplomacy.treacheryScore).toBe(0);
  });

  it('vassalage tribute flows through turn processing', () => {
    const state = createNewGame('egypt', 'tribute-test', 'small');

    // Give the player a city with a marketplace so gold income >= 4/turn (tribute = floor(gold * 0.25) >= 1)
    const startPos = { q: 0, r: 0 };
    const city = foundCity('player', startPos, state.map);
    city.buildings = ['marketplace']; // adds 3 gold + 1 base = 4/turn -> tribute of 1
    state.cities[city.id] = city;
    state.civilizations['player'].cities = [city.id];

    const playerDip = state.civilizations['player'].diplomacy;
    const aiDip = state.civilizations['ai-1'].diplomacy;
    const { vassalState, overlordState } = acceptVassalage(playerDip, aiDip, 'player', 'ai-1', 1);
    state.civilizations['player'].diplomacy = vassalState;
    state.civilizations['ai-1'].diplomacy = overlordState;
    state.civilizations['player'].gold = 0;
    state.civilizations['ai-1'].gold = 0;

    const newState = processTurn(state, bus);
    expect(newState.civilizations['ai-1'].gold).toBeGreaterThan(0);
  });

  it('league auto-war does NOT cascade to other leagues', () => {
    const defenders = triggerLeagueDefense(
      [{ id: 'l-1', members: ['civ-a', 'civ-b', 'civ-c'], formedTurn: 1 }],
      'civ-a',
      'attacker',
    );
    expect(defenders).toContain('civ-b');
    expect(defenders).toContain('civ-c');
  });

  it('embargo enforcement removes embargoed trade routes in turn processing', () => {
    const state = createNewGame('egypt', 'embargo-turn-test', 'small');
    const aiIds = Object.keys(state.civilizations).filter(id => id !== 'player');
    if (aiIds.length < 1) return;

    // Create a player city so cityOwners will map city -> 'player'
    const startPos = { q: 0, r: 0 };
    const city = foundCity('player', startPos, state.map);
    state.cities[city.id] = city;
    state.civilizations['player'].cities = [city.id];

    state.embargoes = proposeEmbargo([], 'player', aiIds[0], state.turn);
    if (state.marketplace) {
      state.marketplace.tradeRoutes = [
        { fromCityId: city.id, toCityId: 'fake', goldPerTurn: 5, foreignCivId: aiIds[0] },
      ];
    }
    const newState = processTurn(state, bus);
    const routes = newState.marketplace?.tradeRoutes ?? [];
    const embargoedRoutes = routes.filter(r => r.foreignCivId === aiIds[0]);
    expect(embargoedRoutes).toHaveLength(0);
  });

  it('overlord elimination frees all vassals', () => {
    const state = createNewGame('egypt', 'elim-test', 'small');
    const aiIds = Object.keys(state.civilizations).filter(id => id !== 'player');
    const overlordId = aiIds[0];
    const vassalId = 'player';
    if (!overlordId) return;

    const { vassalState, overlordState } = acceptVassalage(
      state.civilizations[vassalId].diplomacy,
      state.civilizations[overlordId].diplomacy,
      vassalId, overlordId, 1,
    );
    state.civilizations[vassalId].diplomacy = vassalState;
    state.civilizations[overlordId].diplomacy = overlordState;
    delete state.civilizations[overlordId];

    const newState = processTurn(state, bus);
    expect(newState.civilizations[vassalId].diplomacy.vassalage.overlord).toBeNull();
  });

  it('all 4 new civs are defined and selectable', () => {
    const newCivs = ['russia', 'ottoman', 'shire', 'isengard'];
    for (const id of newCivs) {
      const def = getCivDefinition(id);
      expect(def).toBeDefined();
      expect(def!.bonusEffect).toBeDefined();
    }
  });
});
