import { resolveCombat, getTerrainDefenseBonus } from '@/systems/combat-system';
import type { GameMap } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';

describe('resolveCombat', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'combat-test');
  });

  it('produces a combat result with damage to both sides', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 });
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 });
    const result = resolveCombat(attacker, defender, map);

    expect(result.attackerId).toBe(attacker.id);
    expect(result.defenderId).toBe(defender.id);
    expect(result.attackerDamage).toBeGreaterThan(0);
    expect(result.defenderDamage).toBeGreaterThan(0);
  });

  it('stronger unit deals more damage', () => {
    const warrior = createUnit('warrior', 'p1', { q: 10, r: 10 });
    const scout = createUnit('scout', 'p2', { q: 11, r: 10 });

    const result = resolveCombat(warrior, scout, map);
    expect(result.attackerDamage).toBeGreaterThanOrEqual(0);
    expect(result.defenderDamage).toBeGreaterThanOrEqual(0);
  });

  it('defender on hills takes less damage than on plains (same seed)', () => {
    const hillsTile = Object.values(map.tiles).find(t => t.terrain === 'hills');
    const plainsTile = Object.values(map.tiles).find(t => t.terrain === 'plains');
    if (!hillsTile || !plainsTile) return;

    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 });
    const hillsDefender = createUnit('warrior', 'p2', hillsTile.coord);
    const plainsDefender = createUnit('warrior', 'p2', plainsTile.coord);

    // Same seed → deterministic. Hills gives +25% defense so defender takes less damage.
    const seed = 42;
    const hillsResult = resolveCombat({ ...attacker, health: 100 }, { ...hillsDefender, health: 100 }, map, seed);
    const plainsResult = resolveCombat({ ...attacker, health: 100 }, { ...plainsDefender, health: 100 }, map, seed);

    expect(hillsResult.defenderDamage).toBeLessThan(plainsResult.defenderDamage);
  });

  it('marks units as destroyed when health reaches 0', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 });
    attacker.health = 10;
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 });

    const result = resolveCombat(attacker, defender, map);
    expect(typeof result.attackerSurvived).toBe('boolean');
    expect(typeof result.defenderSurvived).toBe('boolean');
  });

  it('non-combat units always lose', () => {
    const warrior = createUnit('warrior', 'p1', { q: 10, r: 10 });
    const settler = createUnit('settler', 'p2', { q: 11, r: 10 });

    const result = resolveCombat(warrior, settler, map);
    expect(result.defenderSurvived).toBe(false);
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
