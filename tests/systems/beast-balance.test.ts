import { describe, it, expect } from 'vitest';
import { resolveCombat } from '@/systems/combat-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';
import type { Unit, UnitType } from '@/core/types';

const map = generateMap(20, 20, 'balance-seed');

function unit(type: UnitType, overrides: Partial<Unit> = {}): Unit {
  return {
    id: `u-${type}-${Math.floor((overrides.position?.q ?? 1) * 1000)}`, type, owner: 'player',
    position: { q: 1, r: 1 }, movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

/** Simulate full fights: era-appropriate attacker squad vs one beast; return win rate and avg exchanges. */
function sampleFights(attackerType: UnitType, squadSize: number, beastType: UnitType, trials: number) {
  let wins = 0; let totalExchanges = 0;
  for (let trial = 0; trial < trials; trial++) {
    let beast = unit(beastType, { owner: 'beasts', position: { q: 2, r: 1 } });
    let exchanges = 0; let won = false;
    for (let i = 0; i < squadSize && !won; i++) {
      let attacker = unit(attackerType);
      while (attacker.health > 0 && beast.health > 0 && exchanges < 30) {
        const result = resolveCombat(attacker, beast, map, trial * 7919 + exchanges * 31 + i);
        beast = { ...beast, health: Math.max(0, beast.health - result.defenderDamage) };
        attacker = { ...attacker, health: Math.max(0, attacker.health - result.attackerDamage) };
        exchanges++;
      }
      if (beast.health <= 0) won = true;
    }
    if (won) wins++;
    totalExchanges += exchanges;
  }
  return { winRate: wins / trials, avgExchanges: totalExchanges / trials };
}

describe('beast balance bands (N=200 per matchup)', () => {
  it('era 1: three warriors beat the boar most of the time, one warrior usually dies trying', () => {
    expect(sampleFights('warrior', 3, 'beast_boar', 200).winRate).toBeGreaterThan(0.7);
    expect(sampleFights('warrior', 1, 'beast_boar', 200).winRate).toBeLessThan(0.45);
  });

  it('era 2: a small swordsman squad handles a single wolf comfortably', () => {
    expect(sampleFights('swordsman', 2, 'beast_wolf', 200).winRate).toBeGreaterThan(0.85);
  });

  it('era 2-3: the basilisk demands a real squad', () => {
    expect(sampleFights('swordsman', 1, 'beast_basilisk', 200).winRate).toBeLessThan(0.4);
    expect(sampleFights('swordsman', 3, 'beast_basilisk', 200).winRate).toBeGreaterThan(0.7);
  });

  it('era 4: knights can fell the dragon only in numbers', () => {
    expect(sampleFights('knight', 2, 'beast_dragon', 200).winRate).toBeLessThan(0.5);
    expect(sampleFights('knight', 4, 'beast_dragon', 200).winRate).toBeGreaterThan(0.6);
  });

  it('fights resolve in a reasonable exchange count (no 30-exchange slogs on average)', () => {
    expect(sampleFights('warrior', 3, 'beast_boar', 200).avgExchanges).toBeLessThan(15);
  });
});
