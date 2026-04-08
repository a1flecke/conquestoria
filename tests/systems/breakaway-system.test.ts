import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import {
  createBreakawayFromCity,
  processBreakawayTurn,
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

    const result = processBreakawayTurn(state, bus);
    expect(result.civilizations[breakawayId].breakaway?.status).toBe('established');
  });

  it('requires both relationship and gold to reabsorb a breakaway state', () => {
    const { state, breakawayId } = makeBreakawayFixture({ breakawayStartedTurn: 12, relationship: 35, gold: 150 });
    expect(() => tryReabsorbBreakaway(state, 'player', breakawayId)).toThrow(/relationship/i);
  });

  it('reabsorbs a breakaway state when the relationship and gold thresholds are met', () => {
    const { state, breakawayId, cityId } = makeBreakawayFixture({ breakawayStartedTurn: 12, relationship: 70, gold: 250 });

    const result = tryReabsorbBreakaway(state, 'player', breakawayId);

    expect(result.cities[cityId].owner).toBe('player');
    expect(result.civilizations.player.gold).toBe(50);
    expect(result.civilizations.player.cities).toContain(cityId);
    expect(result.civilizations[breakawayId]).toBeUndefined();
    expect(result.units['unit-breakaway'].owner).toBe('player');
    expect(result.civilizations.player.units).toContain('unit-breakaway');
    expect(result.map.tiles['4,0'].owner).toBe('player');
    expect(result.map.tiles['4,1'].owner).toBe('player');
  });

  it('rejects reabsorption attempts from civs other than the origin owner', () => {
    const { state, breakawayId } = makeBreakawayFixture({
      breakawayStartedTurn: 12,
      relationship: 70,
      gold: 250,
      includeThirdCiv: true,
    });

    expect(() => tryReabsorbBreakaway(state, 'outsider', breakawayId)).toThrow(/origin owner/i);
  });

  it('reapplies instability pressure after reconquest instead of restoring a fully stable city', () => {
    const { state, breakawayId } = makeBreakawayFixture({ established: false, breakawayStartedTurn: 12 });

    const result = reconquerBreakawayCity(state, 'player', breakawayId, 'city-border');

    expect(result.cities['city-border'].owner).toBe('player');
    expect(result.cities['city-border'].unrestLevel).toBeGreaterThan(0);
  });
});
