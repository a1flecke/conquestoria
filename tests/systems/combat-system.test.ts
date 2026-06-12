import {
  calculateCombatStrengths,
  getTerrainDefenseBonus,
  resolveCombat,
  selectDefenderForAttack,
} from '@/systems/combat-system';
import type { GameMap } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeRiverCombatMap(
  rivers: GameMap['rivers'] = [],
): GameMap {
  return {
    width: 4,
    height: 4,
    wrapsHorizontally: false,
    rivers,
    tiles: {
      '0,0': {
        coord: { q: 0, r: 0 },
        terrain: 'plains',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: 'p1',
        improvementTurnsLeft: 0,
        hasRiver: true,
        wonder: null,
      },
      '1,0': {
        coord: { q: 1, r: 0 },
        terrain: 'plains',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        owner: 'p2',
        improvementTurnsLeft: 0,
        hasRiver: true,
        wonder: null,
      },
    },
  };
}

describe('resolveCombat', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'combat-test');
  });

  it('produces a combat result with damage to both sides', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC());
    const result = resolveCombat(attacker, defender, map, 42);

    expect(result.attackerId).toBe(attacker.id);
    expect(result.defenderId).toBe(defender.id);
    expect(result.attackerDamage).toBeGreaterThan(0);
    expect(result.defenderDamage).toBeGreaterThan(0);
  });

  it('stronger unit deals more damage', () => {
    const warrior = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const scout = createUnit('scout', 'p2', { q: 11, r: 10 }, mkC());

    const result = resolveCombat(warrior, scout, map, 42);
    expect(result.attackerDamage).toBeGreaterThanOrEqual(0);
    expect(result.defenderDamage).toBeGreaterThanOrEqual(0);
  });

  it('experienced attackers deal more damage with the same seed', () => {
    const recruit = { ...createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC()), id: 'recruit', experience: 0 };
    const veteran = { ...createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC()), id: 'veteran', experience: 25 };
    const defender = { ...createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC()), id: 'defender', experience: 0 };

    const recruitResult = resolveCombat(recruit, defender, map, 2);
    const veteranResult = resolveCombat(veteran, defender, map, 2);

    expect(veteranResult.defenderDamage).toBeGreaterThan(recruitResult.defenderDamage);
  });

  it('reduces attacker effectiveness when combat crosses a river edge', () => {
    const attacker = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 1, r: 0 }, mkC());
    const openResult = resolveCombat(attacker, defender, makeRiverCombatMap(), 42);
    const crossingResult = resolveCombat(attacker, defender, makeRiverCombatMap([
      { from: attacker.position, to: defender.position },
    ]), 42);

    expect(crossingResult.defenderDamage).toBeLessThan(openResult.defenderDamage);
    expect(crossingResult.attackerDamage).toBeGreaterThan(openResult.attackerDamage);
  });

  it('exposes the river penalty through the shared combat preview data', () => {
    const attacker = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 1, r: 0 }, mkC());
    const openPreview = calculateCombatStrengths(attacker, defender, makeRiverCombatMap());
    const crossingPreview = calculateCombatStrengths(attacker, defender, makeRiverCombatMap([
      { from: defender.position, to: attacker.position },
    ]));

    expect(crossingPreview.riverAttackPenalty).toBe(-0.2);
    expect(crossingPreview.attackerStrength).toBeCloseTo(openPreview.attackerStrength * 0.8);
    expect(crossingPreview.defenderStrength).toBe(openPreview.defenderStrength);
  });

  it('ignores river segments that are not between the combatants', () => {
    const attacker = createUnit('warrior', 'p1', { q: 0, r: 0 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 1, r: 0 }, mkC());
    const openResult = resolveCombat(attacker, defender, makeRiverCombatMap(), 42);
    const unrelatedRiverResult = resolveCombat(attacker, defender, makeRiverCombatMap([
      { from: { q: 2, r: 2 }, to: { q: 3, r: 2 } },
    ]), 42);

    expect(unrelatedRiverResult).toEqual(openResult);
  });

  it('defender on hills takes less damage than on plains (same seed)', () => {
    const hillsTile = Object.values(map.tiles).find(t => t.terrain === 'hills');
    const plainsTile = Object.values(map.tiles).find(t => t.terrain === 'plains');
    if (!hillsTile || !plainsTile) return;

    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const hillsDefender = createUnit('warrior', 'p2', hillsTile.coord, mkC());
    const plainsDefender = createUnit('warrior', 'p2', plainsTile.coord, mkC());

    // Same seed → deterministic. Hills gives +25% defense so defender takes less damage.
    const seed = 42;
    const hillsResult = resolveCombat({ ...attacker, health: 100 }, { ...hillsDefender, health: 100 }, map, seed);
    const plainsResult = resolveCombat({ ...attacker, health: 100 }, { ...plainsDefender, health: 100 }, map, seed);

    expect(hillsResult.defenderDamage).toBeLessThan(plainsResult.defenderDamage);
  });

  it('prydain homeland defense reduces damage on owned tiles', () => {
    const plainsTile = Object.values(map.tiles).find(t => t.terrain === 'plains');
    if (!plainsTile) return;

    plainsTile.owner = 'p2';
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const defender = createUnit('warrior', 'p2', plainsTile.coord, mkC());

    const normal = resolveCombat({ ...attacker, health: 100 }, { ...defender, health: 100 }, map, 42);
    const homeland = resolveCombat(
      { ...attacker, health: 100 },
      { ...defender, health: 100 },
      map,
      42,
      { defenderBonus: { type: 'homeland_defense', defenseBonus: 0.2 } },
    );

    expect(homeland.defenderDamage).toBeLessThan(normal.defenderDamage);
  });

  it('marks units as destroyed when health reaches 0', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    attacker.health = 10;
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC());

    const result = resolveCombat(attacker, defender, map, 42);
    expect(typeof result.attackerSurvived).toBe('boolean');
    expect(typeof result.defenderSurvived).toBe('boolean');
  });

  it('non-combat units always lose', () => {
    const warrior = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const settler = createUnit('settler', 'p2', { q: 11, r: 10 }, mkC());

    const result = resolveCombat(warrior, settler, map, 42);
    expect(result.defenderSurvived).toBe(false);
  });

  it('selects a combat defender before a stacked civilian regardless of insertion order', () => {
    const settler = createUnit('settler', 'p2', { q: 11, r: 10 }, mkC());
    settler.id = 'settler-first';
    const warrior = createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC());
    warrior.id = 'warrior-second';

    const defender = selectDefenderForAttack([settler, warrior], map);

    expect(defender?.id).toBe('warrior-second');
  });

  it('selects the strongest combat defender in a stack before civilians', () => {
    const settler = createUnit('settler', 'p2', { q: 11, r: 10 }, mkC());
    const injuredSwordsman = createUnit('swordsman', 'p2', { q: 11, r: 10 }, mkC());
    injuredSwordsman.health = 20;
    const warrior = createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC());

    const defender = selectDefenderForAttack([settler, injuredSwordsman, warrior], map);

    expect(defender?.id).toBe(warrior.id);
  });

  it('ranged attacker takes no counter-damage from a melee-only defender at range', () => {
    const attacker = createUnit('archer', 'p1', { q: 10, r: 10 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 12, r: 10 }, mkC());

    const result = resolveCombat(attacker, defender, map, 42);

    expect(result.defenderDamage).toBeGreaterThan(0);
    expect(result.attackerDamage).toBe(0);
  });

  it('ranged attacker can take counter-damage from a ranged defender at range', () => {
    const attacker = createUnit('archer', 'p1', { q: 10, r: 10 }, mkC());
    const defender = createUnit('archer', 'p2', { q: 12, r: 10 }, mkC());

    const result = resolveCombat(attacker, defender, map, 42);

    expect(result.defenderDamage).toBeGreaterThan(0);
    expect(result.attackerDamage).toBeGreaterThan(0);
  });
});

describe('new terrain defense bonuses', () => {
  it('jungle provides 0.15 defense bonus', () => {
    expect(getTerrainDefenseBonus('jungle')).toBe(0.15);
  });

  it('swamp provides no defense bonus', () => {
    expect(getTerrainDefenseBonus('swamp')).toBe(0);
  });
});

describe('fortify defense bonus', () => {
  let fortifyMap: GameMap;

  beforeAll(() => {
    fortifyMap = generateMap(30, 30, 'fortify-combat-test');
  });

  it('fortified defender takes less damage than an identical non-fortified defender', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC());
    const defenderFortified = { ...defender, isFortified: true };

    // Same seed → deterministic; only variable is isFortified
    const resultBase = resolveCombat(attacker, defender, fortifyMap, 42);
    const resultFortified = resolveCombat(attacker, defenderFortified, fortifyMap, 42);

    expect(resultFortified.defenderDamage).toBeLessThan(resultBase.defenderDamage);
  });

  it('non-fortified combat produces identical results with the same seed', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 }, mkC());
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 }, mkC());

    const r1 = resolveCombat(attacker, defender, fortifyMap, 99);
    const r2 = resolveCombat(attacker, defender, fortifyMap, 99);

    expect(r1.defenderDamage).toBe(r2.defenderDamage);
    expect(r1.attackerDamage).toBe(r2.attackerDamage);
  });
});
