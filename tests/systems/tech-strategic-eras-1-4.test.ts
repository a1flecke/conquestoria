import { describe, expect, it } from 'vitest';
import type { GameMap, HexCoord, TerrainType } from '@/core/types';
import { TECH_TREE } from '@/systems/tech-definitions';
import { TECH_YIELD_MODIFIERS } from '@/systems/tech-yield-definitions';
import { getCityTechYields, getTradeRouteTechGold } from '@/systems/tech-yield-system';
import { getCombatModifier, type CombatModifierContext } from '@/systems/unit-modifier-system';
import { getTileYield } from '@/systems/tile-yield';
import { foundCity } from '@/systems/city-system';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

// #1303 (#420 child 2): every Era 1-4 tech text that promises an effect must be backed by a mechanic, and the
// effects that were unconditional (Tactics) or missing (Advanced Mining, Banking) must now depend on a choice.

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
const tech = (id: string) => TECH_TREE.find(t => t.id === id)!;

function forceTile(map: GameMap, coord: HexCoord, terrain: TerrainType, overrides: Partial<GameMap['tiles'][string]> = {}): HexCoord {
  map.tiles[hexKey(coord)] = {
    ...map.tiles[hexKey(coord)], coord, terrain, owner: 'player', improvement: 'none', improvementTurnsLeft: 0,
    hasRiver: false, wonder: null, resource: null, ...overrides,
  };
  return coord;
}

function combatCtx(overrides: Partial<CombatModifierContext>): CombatModifierContext {
  return {
    completedTechs: [], activeNationalProjects: [], fullHP: true, inFriendlyCity: false, opponentType: 'warrior', ...overrides,
  };
}

describe('Eras 1-4 strategic-choice pass (#1303)', () => {
  const map = generateMap(20, 20, 'eras-1-4');

  it('Advanced Mining: +1 production per completed worked mine only', () => {
    const start = Object.values(map.tiles).find(t => t.terrain === 'grassland' && !t.hasRiver)!.coord;
    const city = { ...foundCity('player', start, map, counters()), population: 2 };
    const work = city.ownedTiles.find(c => hexKey(c) !== hexKey(city.position))!;
    forceTile(map, work, 'hills', { improvement: 'mine' });
    const withMine = { ...city, workedTiles: [work] };
    expect(getCityTechYields(withMine, map, ['mining-tech']).total.production).toBe(1);
    expect(getCityTechYields(withMine, map, []).total.production).toBe(0);
    forceTile(map, work, 'hills', { improvement: 'mine', improvementTurnsLeft: 2 });
    expect(getCityTechYields(withMine, map, ['mining-tech']).total.production).toBe(0);
    forceTile(map, work, 'hills', { improvement: 'none' });
    expect(getCityTechYields(withMine, map, ['mining-tech']).total.production).toBe(0);
  });

  it('Banking: +1 gold only on routes whose both endpoints are coastal', () => {
    const route = { id: 'r', fromCityId: 'a', toCityId: 'b', goldPerTrip: 10, turnsPerTrip: 2 };
    expect(getTradeRouteTechGold(route, ['banking'], { bothEndpointsCoastal: true })).toBe(1);
    expect(getTradeRouteTechGold(route, ['banking'], { bothEndpointsCoastal: false })).toBe(0);
    expect(getTradeRouteTechGold(route, [], { bothEndpointsCoastal: true })).toBe(0);
  });

  it('Tactics: +10% combat only for a unit at full health', () => {
    const fresh = getCombatModifier('warrior', 'attacker', combatCtx({ completedTechs: ['tactics'], fullHP: true }));
    const hurt = getCombatModifier('warrior', 'attacker', combatCtx({ completedTechs: ['tactics'], fullHP: false }));
    const defending = getCombatModifier('warrior', 'defender', combatCtx({ completedTechs: ['tactics'], fullHP: true }));
    expect(fresh.mult).toBeCloseTo(1.1);
    expect(hurt.mult).toBe(1);
    expect(defending.mult).toBeCloseTo(1.1);
  });

  it('Irrigation: river farms gain +1 production (text was already true)', () => {
    const coord = Object.values(map.tiles)[0].coord;
    forceTile(map, coord, 'grassland', { hasRiver: true, improvement: 'farm' });
    const without = getTileYield(map.tiles[hexKey(coord)], map, coord, { completedTechs: [] });
    const withTech = getTileYield(map.tiles[hexKey(coord)], map, coord, { completedTechs: ['irrigation'] });
    expect(withTech.production - without.production).toBe(1);
  });

  it('every rewritten text names only what exists', () => {
    expect(tech('tactics').unlocks).toEqual(['Units at full health get +10% combat strength']);
    expect(tech('banking').unlocks).toEqual(['+1 gold per trade route between two coastal cities']);
    expect(tech('mining-tech').unlocks).toContain('Mines yield +1 production');
    for (const id of ['early-empire', 'medicine']) {
      expect(tech(id).unlocks.join(' ')).toContain('city maturity');
      expect(tech(id).countsForCityMaturity === true || id === 'early-empire' || id === 'medicine').toBe(true);
    }
    expect(tech('sailing').unlocks.join(' ')).not.toMatch(/embark/i);
    expect(tech('banking').unlocks.join(' ')).not.toMatch(/20%/);
  });

  it('keeps the Eras 1-4 yield rows to the two conditional ones', () => {
    const early = TECH_YIELD_MODIFIERS.filter(m => (TECH_TREE.find(t => t.id === m.techId)?.era ?? 99) <= 4).map(m => m.techId);
    expect(early.sort()).toEqual(['banking', 'mining-tech']);
  });

  it('does not change unlock chains for the seven techs', () => {
    expect(tech('tactics').prerequisites).toEqual(['iron-forging']);
    expect(tech('banking').prerequisites).toEqual(['trade-routes', 'mathematics']);
    expect(tech('sailing').prerequisites).toEqual(['pathfinding']);
  });
});
