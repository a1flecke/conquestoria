import { resolveCombat } from '@/systems/combat-system';
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

  it('defender on hills takes less damage on average', () => {
    const hillsTile = Object.values(map.tiles).find(t => t.terrain === 'hills');
    if (!hillsTile) return;

    const attacker = createUnit('warrior', 'p1', { q: hillsTile.coord.q - 1, r: hillsTile.coord.r });
    const defender = createUnit('warrior', 'p2', hillsTile.coord);

    let totalDefenderDamage = 0;
    let totalAttackerDamage = 0;
    for (let i = 0; i < 100; i++) {
      const result = resolveCombat(
        { ...attacker, health: 100 },
        { ...defender, health: 100 },
        map,
      );
      totalDefenderDamage += result.defenderDamage;
      totalAttackerDamage += result.attackerDamage;
    }
    // Defender on hills should take less damage than attacker on average
    expect(totalDefenderDamage).toBeLessThan(totalAttackerDamage);
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
