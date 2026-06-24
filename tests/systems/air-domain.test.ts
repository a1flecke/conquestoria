import { describe, it, expect } from 'vitest';
import {
  getMovementCostForUnit,
  getMovementStepCost,
  UNIT_DEFINITIONS,
  createUnit,
} from '@/systems/unit-system';
import { calculateCombatStrengths } from '@/systems/combat-system';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';
import type { GameMap, Unit } from '@/core/types';

// ============================================================
// Shared helpers
// ============================================================

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeSimpleMap(tiles: GameMap['tiles']): GameMap {
  return {
    width: 4, height: 4, wrapsHorizontally: false, rivers: [],
    tiles,
  };
}

function makeTile(q: number, r: number, terrain: string): GameMap['tiles'][string] {
  return {
    coord: { q, r }, terrain: terrain as never,
    elevation: 'lowland', resource: null, improvement: 'none',
    owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

// ============================================================
// Task A: Air domain — movement
// ============================================================

describe('air domain — movement bypass', () => {
  it('observation_balloon has domain "air"', () => {
    expect(UNIT_DEFINITIONS.observation_balloon.domain).toBe('air');
  });

  it('biplane has domain "air"', () => {
    expect(UNIT_DEFINITIONS.biplane.domain).toBe('air');
  });

  it('air unit costs 1 on mountain terrain (land costs 4)', () => {
    expect(getMovementCostForUnit('mountain', 'air')).toBe(1);
    expect(getMovementCostForUnit('mountain', 'land')).toBe(4);
  });

  it('air unit costs 1 on ocean terrain (land costs Infinity)', () => {
    expect(getMovementCostForUnit('ocean', 'air')).toBe(1);
    expect(getMovementCostForUnit('ocean', 'land')).toBe(Infinity);
  });

  it('air unit costs 1 on forest terrain (land costs 2)', () => {
    expect(getMovementCostForUnit('forest', 'air')).toBe(1);
    expect(getMovementCostForUnit('forest', 'land')).toBe(2);
  });

  it('air unit pays no river crossing penalty', () => {
    const riverMap: GameMap = {
      width: 4, height: 4, wrapsHorizontally: false,
      rivers: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }],
      tiles: {
        '0,0': makeTile(0, 0, 'plains'),
        '1,0': makeTile(1, 0, 'plains'),
      },
    };
    const balloon = createUnit('observation_balloon', 'p1', { q: 0, r: 0 }, mkC());
    const cost = getMovementStepCost(
      balloon, riverMap, { q: 0, r: 0 }, { q: 1, r: 0 },
      { completedTechs: [] },
    );
    expect(cost).toBe(1); // no river penalty — air bypass
  });

  it('land unit pays river crossing penalty without bridge-building', () => {
    const riverMap: GameMap = {
      width: 4, height: 4, wrapsHorizontally: false,
      rivers: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }],
      tiles: {
        '0,0': makeTile(0, 0, 'plains'),
        '1,0': makeTile(1, 0, 'plains'),
      },
    };
    const warrior = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const cost = getMovementStepCost(
      warrior, riverMap, { q: 0, r: 0 }, { q: 1, r: 0 },
      { completedTechs: [] },
    );
    expect(cost).toBeGreaterThan(1); // river penalty applied
  });

  it('observation_balloon has visionRange 4 (double the standard 2)', () => {
    expect(UNIT_DEFINITIONS.observation_balloon.visionRange).toBe(4);
  });

  it('biplane has visionRange 3', () => {
    expect(UNIT_DEFINITIONS.biplane.visionRange).toBe(3);
  });
});

// ============================================================
// Task C: Anti-air battery combat modifier
// ============================================================

describe('anti_air_battery combat modifier', () => {
  const plainsTile = makeTile(1, 0, 'plains');
  const map = makeSimpleMap({
    '0,0': makeTile(0, 0, 'plains'),
    '1,0': plainsTile,
  });

  function makeUnit(type: Unit['type'], owner: string, q: number, r: number): Unit {
    return createUnit(type, owner, { q, r }, mkC());
  }

  it('biplane vs defender: +8 defense when defenderCityHasAntiAir is true', () => {
    const biplane = makeUnit('biplane', 'p1', 0, 0);
    const defender = makeUnit('rifleman', 'p2', 1, 0);

    const withoutAntiAir = calculateCombatStrengths(biplane, defender, map, {});
    const withAntiAir    = calculateCombatStrengths(biplane, defender, map, { defenderCityHasAntiAir: true });

    expect(withAntiAir.defenderStrength - withoutAntiAir.defenderStrength).toBe(8);
  });

  it('land unit vs defender: anti-air battery has NO effect (not an air attacker)', () => {
    const warrior  = makeUnit('warrior', 'p1', 0, 0);
    const defender = makeUnit('rifleman', 'p2', 1, 0);

    const withoutAntiAir = calculateCombatStrengths(warrior, defender, map, {});
    const withAntiAir    = calculateCombatStrengths(warrior, defender, map, { defenderCityHasAntiAir: true });

    expect(withAntiAir.defenderStrength).toBeCloseTo(withoutAntiAir.defenderStrength, 6);
  });

  it('observation_balloon vs defender: +8 defense applies (air domain)', () => {
    const balloon  = makeUnit('observation_balloon', 'p1', 0, 0);
    const defender = makeUnit('warrior', 'p2', 1, 0);

    const withoutAntiAir = calculateCombatStrengths(balloon, defender, map, {});
    const withAntiAir    = calculateCombatStrengths(balloon, defender, map, { defenderCityHasAntiAir: true });

    expect(withAntiAir.defenderStrength - withoutAntiAir.defenderStrength).toBe(8);
  });
});

// ============================================================
// Task D: Air Force Command combat modifier
// ============================================================

describe('air_force_command combat modifier', () => {
  const map = makeSimpleMap({
    '0,0': makeTile(0, 0, 'plains'),
    '1,0': makeTile(1, 0, 'plains'),
  });

  function makeUnit(type: Unit['type'], owner: string, q: number, r: number): Unit {
    return createUnit(type, owner, { q, r }, mkC());
  }

  it('biplane attacker: +4 attack when attackerHasAirForceCommand is true', () => {
    const biplane  = makeUnit('biplane', 'p1', 0, 0);
    const defender = makeUnit('rifleman', 'p2', 1, 0);

    const without = calculateCombatStrengths(biplane, defender, map, {});
    const with_   = calculateCombatStrengths(biplane, defender, map, { attackerHasAirForceCommand: true });

    expect(with_.attackerStrength - without.attackerStrength).toBe(4);
  });

  it('land attacker: air_force_command has NO effect (not an air unit)', () => {
    const warrior  = makeUnit('warrior', 'p1', 0, 0);
    const defender = makeUnit('rifleman', 'p2', 1, 0);

    const without = calculateCombatStrengths(warrior, defender, map, {});
    const with_   = calculateCombatStrengths(warrior, defender, map, { attackerHasAirForceCommand: true });

    expect(with_.attackerStrength).toBeCloseTo(without.attackerStrength, 6);
  });

  it('both modifiers stack correctly: anti-air cancels some of the air-force-command bonus', () => {
    const biplane  = makeUnit('biplane', 'p1', 0, 0);
    const defender = makeUnit('rifleman', 'p2', 1, 0);

    const base       = calculateCombatStrengths(biplane, defender, map, {});
    const bothActive = calculateCombatStrengths(biplane, defender, map, {
      defenderCityHasAntiAir: true,
      attackerHasAirForceCommand: true,
    });

    expect(bothActive.attackerStrength - base.attackerStrength).toBe(4);
    expect(bothActive.defenderStrength - base.defenderStrength).toBe(8);
  });
});

// ============================================================
// Task A: Beast spawn occupancy — air units excluded
// ============================================================

describe('beast spawn occupancy — air units excluded', () => {
  it('observation_balloon domain is "air" so beast-system skips it', () => {
    // The beast-system checks: UNIT_DEFINITIONS[u.type]?.domain !== 'air'
    // Verify the domain is correct so the occupancy skip works.
    const def = UNIT_DEFINITIONS['observation_balloon'];
    expect(def.domain).toBe('air');
    // Non-air unit should NOT have domain 'air'
    expect(UNIT_DEFINITIONS['warrior'].domain).toBeUndefined();
    expect(UNIT_DEFINITIONS['galley'].domain).toBe('naval');
  });
});
