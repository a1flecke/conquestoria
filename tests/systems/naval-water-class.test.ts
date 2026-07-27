import { describe, it, expect } from 'vitest';
import { UNIT_DEFINITIONS, createUnit, getMovementBlockerReason } from '@/systems/unit-system';
import { PIRATE_HULL_DEFINITIONS, PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';
import type { GameMap } from '@/core/types';

describe('naval hull water-class catalog coverage', () => {
  it('every naval UnitDefinition sets waterAccess explicitly', () => {
    const missing = Object.values(UNIT_DEFINITIONS)
      .filter(def => def.domain === 'naval' && def.waterAccess === undefined)
      .map(def => def.type);
    expect(missing).toEqual([]);
  });

  it('every naval UnitDefinition sets a valid waterAccess value', () => {
    const invalid = Object.values(UNIT_DEFINITIONS)
      .filter(def => def.domain === 'naval')
      .filter(def => def.waterAccess !== 'coastal' && def.waterAccess !== 'ocean')
      .map(def => def.type);
    expect(invalid).toEqual([]);
  });

  it('every PirateHullDefinition sets a valid waterAccess value', () => {
    const invalid = PIRATE_HULL_TYPES
      .filter(type => {
        const access = PIRATE_HULL_DEFINITIONS[type].waterAccess;
        return access !== 'coastal' && access !== 'ocean';
      });
    expect(invalid).toEqual([]);
  });

  it('pirate hull waterAccess flows through into UNIT_DEFINITIONS (createPirateUnitDefinition wiring)', () => {
    for (const type of PIRATE_HULL_TYPES) {
      expect(UNIT_DEFINITIONS[type]?.waterAccess).toBe(PIRATE_HULL_DEFINITIONS[type].waterAccess);
    }
  });

  it('matches the final hull classification table from the design spec', () => {
    const coastalOnly: readonly string[] = ['galley', 'transport'];
    const oceanGoing: readonly string[] = [
      'trireme', 'carrack', 'galleon', 'steamship', 'troop_transport', 'frigate', 'ironclad',
      'pre_dreadnought', 'submarine', 'carrier', 'destroyer', 'missile_submarine',
      'autonomous_frigate', 'naval_trader', 'steamship_trader', 'cargo_freighter', 'container_ship',
    ];
    for (const type of coastalOnly) {
      expect(UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS]?.waterAccess).toBe('coastal');
    }
    for (const type of oceanGoing) {
      expect(UNIT_DEFINITIONS[type as keyof typeof UNIT_DEFINITIONS]?.waterAccess).toBe('ocean');
    }

    const coastalPirates: readonly string[] = ['pirate_galley', 'pirate_corsair'];
    const oceanPirates: readonly string[] = [
      'pirate_frigate', 'pirate_ironclad', 'pirate_fast_attack_craft', 'pirate_mothership',
    ];
    for (const type of coastalPirates) {
      expect(PIRATE_HULL_DEFINITIONS[type as keyof typeof PIRATE_HULL_DEFINITIONS].waterAccess).toBe('coastal');
    }
    for (const type of oceanPirates) {
      expect(PIRATE_HULL_DEFINITIONS[type as keyof typeof PIRATE_HULL_DEFINITIONS].waterAccess).toBe('ocean');
    }
  });
});

function createWaterMap(): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < 5; q += 1) {
    for (let r = 0; r < 5; r += 1) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  tiles['0,0'] = { ...tiles['0,0']!, terrain: 'coast' };
  tiles['1,0'] = { ...tiles['1,0']!, terrain: 'coast' };
  tiles['2,0'] = { ...tiles['2,0']!, terrain: 'ocean' };
  return { width: 5, height: 5, tiles, wrapsHorizontally: false, rivers: [] };
}

const mkCounters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('naval hull water-class movement enforcement', () => {
  it('blocks a coastal-only hull (Galley) from entering ocean', () => {
    const map = createWaterMap();
    const galley = createUnit('galley', 'player', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(galley, { q: 2, r: 0 }, map)?.code).toBe('requires-ocean-hull');
  });

  it('allows a coastal-only hull (Transport) to enter coast', () => {
    const map = createWaterMap();
    const transport = createUnit('transport', 'player', { q: 0, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(transport, { q: 1, r: 0 }, map)).toBeNull();
  });

  it('allows an ocean-going hull (Trireme) to enter ocean', () => {
    const map = createWaterMap();
    const trireme = createUnit('trireme', 'player', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(trireme, { q: 2, r: 0 }, map)).toBeNull();
  });

  it('allows an ocean-going hull (Carrack) to enter ocean', () => {
    const map = createWaterMap();
    const carrack = createUnit('carrack', 'player', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(carrack, { q: 2, r: 0 }, map)).toBeNull();
  });

  it('blocks a coastal-only pirate hull (pirate_galley) from entering ocean', () => {
    const map = createWaterMap();
    const pirate = createUnit('pirate_galley', 'pirates', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(pirate, { q: 2, r: 0 }, map)?.code).toBe('requires-ocean-hull');
  });

  it('allows an ocean-going pirate hull (pirate_frigate) to enter ocean', () => {
    const map = createWaterMap();
    const pirate = createUnit('pirate_frigate', 'pirates', { q: 1, r: 0 }, mkCounters());
    expect(getMovementBlockerReason(pirate, { q: 2, r: 0 }, map)).toBeNull();
  });

  it('uses plain, non-jargon language in the blocked-move message', () => {
    const map = createWaterMap();
    const galley = createUnit('galley', 'player', { q: 1, r: 0 }, mkCounters());
    const reason = getMovementBlockerReason(galley, { q: 2, r: 0 }, map);
    expect(reason?.message.toLowerCase()).not.toContain('waterAccess'.toLowerCase());
    expect(reason?.message.toLowerCase()).not.toContain('hull class');
  });
});
