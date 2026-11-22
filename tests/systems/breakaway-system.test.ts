import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import {
  createBreakawayFromCity,
  getReabsorbQuote,
  getReunificationRate,
  processBreakawayTurn,
  REABSORB_GOLD_COST,
  REABSORB_RELATIONSHIP_MINIMUM,
  REUNIFICATION_BASE_PER_TURN,
  REUNIFICATION_GOLD_PER_POINT,
  REUNIFICATION_NEIGHBOUR_RADIUS,
  REUNIFICATION_OFFER_THRESHOLD,
  REUNIFICATION_PER_NEIGHBOUR,
  REUNIFICATION_WAR_LOSS,
  reconquerBreakawayCity,
  tryReabsorbBreakaway,
} from '@/systems/breakaway-system';
import { makeBreakawayFixture } from './helpers/breakaway-fixture';

describe('breakaway-system', () => {
  it('turns an unresolved revolt into a breakaway civ with deterministic metadata', () => {
    const { state } = makeBreakawayFixture({ unrestLevel: 2, unrestTurns: 10, turn: 40 });
    const bus = new EventBus();

    const result = createBreakawayFromCity(state, 'city-border', bus);
    const spawned = Object.values(result.civilizations).find(c => c.breakaway?.originCityId === 'city-border');

    expect(spawned).toBeDefined();
    expect(result.cities['city-border'].owner).toBe(spawned!.id);
    expect(spawned!.breakaway?.status).toBe('secession');
    expect(spawned!.breakaway?.establishesOnTurn).toBe(90);
    expect(result.units['unit-player'].owner).toBe(spawned!.id);
    expect(result.civilizations.player.units).not.toContain('unit-player');
    expect(result.map.tiles['4,0'].owner).toBe(spawned!.id);
    expect(result.map.tiles['4,1'].owner).toBe(spawned!.id);
  });

  it('promotes a surviving breakaway state into an established civilization after 50 turns', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 62 });
    const bus = new EventBus();
    const criticalEvents: string[] = [];
    const establishedEvents: string[] = [];
    bus.on('faction:critical-status', event => criticalEvents.push(event.cityId));
    bus.on('faction:breakaway-established', event => establishedEvents.push(event.civId));

    const result = processBreakawayTurn(state, bus);

    expect(result.civilizations[breakawayId].breakaway?.status).toBe('established');
    expect(establishedEvents).toEqual([breakawayId]);
    expect(criticalEvents).toEqual([]);
  });

  it('emits a recurring critical status while a breakaway secession is unresolved', () => {
    const { state, breakawayId, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 });
    const bus = new EventBus();
    const events: Array<{ cityId: string; owner: string; status: string; breakawayId?: string }> = [];
    bus.on('faction:critical-status', event => events.push(event));

    processBreakawayTurn(state, bus);

    expect(events).toEqual([
      { cityId, owner: 'player', status: 'breakaway', breakawayId },
    ]);
  });

  it('a seceding city cannot be bought back before it is halfway to rejoining', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, relationship: 70, gold: 1000, reunification: 49 });
    expect(getReabsorbQuote(state, 'player', breakawayId)).toEqual({ ok: false, reason: 'not-ready' });
    expect(() => tryReabsorbBreakaway(state, 'player', breakawayId)).toThrow(/not ready/i);
  });

  it('prices an offer by how far the seceding city still has to come', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, gold: 100, reunification: 60 });
    expect(getReabsorbQuote(state, 'player', breakawayId)).toEqual({ ok: false, reason: 'gold-too-low', cost: 40 * REUNIFICATION_GOLD_PER_POINT });
    const richer = makeBreakawayFixture({ breakawayStartedTurn: 12, gold: 250, reunification: 90 });
    expect(getReabsorbQuote(richer.state, 'player', richer.breakawayId)).toEqual({ ok: true, cost: 10 * REUNIFICATION_GOLD_PER_POINT });
  });

  it('an offer brings a seceding city home and charges the quoted price', () => {
    const { state, breakawayId, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12, gold: 250, reunification: 60 });

    const result = tryReabsorbBreakaway(state, 'player', breakawayId);

    expect(result.cities[cityId].owner).toBe('player');
    expect(result.civilizations.player.gold).toBe(250 - 40 * REUNIFICATION_GOLD_PER_POINT);
    expect(result.civilizations.player.cities).toContain(cityId);
    expect(result.civilizations[breakawayId]).toBeUndefined();
    expect(result.units['unit-breakaway'].owner).toBe('player');
    expect(result.civilizations.player.units).toContain('unit-breakaway');
    expect(result.map.tiles['4,0'].owner).toBe('player');
    expect(result.map.tiles['4,1'].owner).toBe('player');
  });

  it('an established breakaway needs relations peace alone can reach, plus gold', () => {
    const low = makeBreakawayFixture({ breakawayStartedTurn: 12, established: true, relationship: REABSORB_RELATIONSHIP_MINIMUM - 1, gold: 1000 });
    expect(getReabsorbQuote(low.state, 'player', low.breakawayId)).toEqual({ ok: false, reason: 'relationship-too-low' });
    const ready = makeBreakawayFixture({ breakawayStartedTurn: 12, established: true, relationship: REABSORB_RELATIONSHIP_MINIMUM, gold: 250 });
    expect(getReabsorbQuote(ready.state, 'player', ready.breakawayId)).toEqual({ ok: true, cost: REABSORB_GOLD_COST });
    // +30 is the ceiling of ordinary relationship drift: the old 50 could never be reached.
    expect(REABSORB_RELATIONSHIP_MINIMUM).toBeLessThanOrEqual(30);
  });

  it('refuses an offer while at war with the breakaway', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, gold: 1000, reunification: 80 });
    state.civilizations.player.diplomacy.atWarWith = [breakawayId];
    expect(getReabsorbQuote(state, 'player', breakawayId)).toEqual({ ok: false, reason: 'at-war' });
  });

  it('rejects reabsorption attempts from civs other than the origin owner', () => {
    const { state, breakawayId } = makeBreakawayFixture({
      breakawayStartedTurn: 12,
      relationship: 70,
      gold: 250,
      includeThirdCiv: true,
      reunification: 80,
    });

    expect(() => tryReabsorbBreakaway(state, 'outsider', breakawayId)).toThrow(/broke away from/i);
  });

  it('reapplies instability pressure after reconquest instead of restoring a fully stable city', () => {
    const { state, breakawayId } = makeBreakawayFixture({ established: false, breakawayStartedTurn: 12 });

    const result = reconquerBreakawayCity(state, 'player', breakawayId, 'city-border');

    expect(result.cities['city-border'].owner).toBe('player');
    expect(result.cities['city-border'].unrestLevel).toBeGreaterThan(0);
  });

  it('spawned breakaway civ inherits lastSeen snapshots from the previous owner', () => {
    const { state } = makeBreakawayFixture({ unrestLevel: 2, unrestTurns: 10, turn: 40 });
    const bus = new EventBus();

    // Plant a lastSeen snapshot on the player at tile '3,0' (plains in the fixture map)
    state.civilizations.player.visibility.lastSeen = {
      '3,0': {
        coord: { q: 3, r: 0 },
        terrain: 'plains',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
        owner: 'player',
        hasRiver: false,
        wonder: null,
      },
    };

    const result = createBreakawayFromCity(state, 'city-border', bus);
    const spawned = Object.values(result.civilizations).find(c => c.breakaway?.originCityId === 'city-border');

    expect(spawned).toBeDefined();
    expect(spawned!.visibility.lastSeen?.['3,0']?.terrain).toBe('plains');
  });
});

// Reabsorbing a breakaway needed relationship 50 while the breakaway starts at -80 and peace alone stops at +30, so
// no one ever did it. A seceding city now has a reunification race: it grows with peace and the origin owner's cities
// nearby, falls in war, opens an offer at halfway and votes to come home at 100.
describe('the reunification race', () => {
  it('grows each turn of peace, faster with the origin owner\'s cities nearby', () => {
    // The fixture's capital is 4 tiles from the seceding city.
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 });
    expect(getReunificationRate(state, breakawayId)).toEqual({ perTurn: REUNIFICATION_BASE_PER_TURN + REUNIFICATION_PER_NEIGHBOUR, nearbyCities: 1, atWar: false });

    const result = processBreakawayTurn(state, new EventBus());
    expect(result.civilizations[breakawayId].breakaway?.reunification).toBe(REUNIFICATION_BASE_PER_TURN + REUNIFICATION_PER_NEIGHBOUR);
  });

  it('a capital too far away adds nothing', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20 });
    state.cities['city-capital'] = { ...state.cities['city-capital'], position: { q: 0, r: REUNIFICATION_NEIGHBOUR_RADIUS + 5 } };
    expect(getReunificationRate(state, breakawayId)?.perTurn).toBe(REUNIFICATION_BASE_PER_TURN);
  });

  it('falls during a war, and never below zero', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20, reunification: 15 });
    state.civilizations.player.diplomacy.atWarWith = [breakawayId];
    state.civilizations[breakawayId].diplomacy.atWarWith = ['player'];

    const once = processBreakawayTurn(state, new EventBus());
    expect(once.civilizations[breakawayId].breakaway?.reunification).toBe(15 - REUNIFICATION_WAR_LOSS);
    const twice = processBreakawayTurn(once, new EventBus());
    expect(twice.civilizations[breakawayId].breakaway?.reunification).toBe(0);
  });

  it('peace alone does not bring the city home inside the 50-turn window', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 12 });
    state.cities['city-capital'] = { ...state.cities['city-capital'], position: { q: 0, r: REUNIFICATION_NEIGHBOUR_RADIUS + 5 } };
    let next = state;
    for (let turn = 12; turn < 62; turn++) next = processBreakawayTurn({ ...next, turn }, new EventBus());
    expect(next.civilizations[breakawayId].breakaway?.reunification).toBeLessThan(100);
    expect(next.cities['city-border'].owner).toBe(breakawayId);
  });

  it('announces once when it passes halfway, with the price of an offer', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20, reunification: REUNIFICATION_OFFER_THRESHOLD - 1 });
    const bus = new EventBus();
    const ready: Array<{ offerCost: number }> = [];
    bus.on('faction:reunification-ready', event => ready.push(event));

    const once = processBreakawayTurn(state, bus);
    processBreakawayTurn({ ...once, turn: 21 }, bus);

    const meter = once.civilizations[breakawayId].breakaway!.reunification!;
    expect(ready).toEqual([expect.objectContaining({ breakawayId, originOwnerId: 'player', offerCost: (100 - meter) * REUNIFICATION_GOLD_PER_POINT })]);
  });

  it('at 100 the city votes to rejoin, free of charge', () => {
    const { state, breakawayId, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 20, reunification: 99, gold: 7 });
    const bus = new EventBus();
    const reabsorbed: Array<{ how: string }> = [];
    bus.on('faction:breakaway-reabsorbed', event => reabsorbed.push(event));

    const result = processBreakawayTurn(state, bus);

    expect(result.cities[cityId].owner).toBe('player');
    expect(result.civilizations[breakawayId]).toBeUndefined();
    expect(result.civilizations.player.gold).toBe(7);
    expect(reabsorbed).toEqual([{ civId: breakawayId, ownerId: 'player', cityId, how: 'vote' }]);
  });

  it('stops for good once the breakaway is established', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, turn: 30, established: true, reunification: 40 });
    const result = processBreakawayTurn(state, new EventBus());
    expect(result.civilizations[breakawayId].breakaway?.reunification).toBe(40);
    expect(getReunificationRate(result, breakawayId)).toBeNull();
  });
});
