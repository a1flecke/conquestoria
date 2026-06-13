import { describe, expect, it } from 'vitest';
import type { GameMap, Unit, UnitType } from '@/core/types';
import { PIRATE_STAGE_DEFINITIONS, composePirateFleet } from '@/systems/pirate-definitions';
import { resolveCombat } from '@/systems/combat-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

const OCEAN_MAP: GameMap = {
  width: 2,
  height: 1,
  wrapsHorizontally: false,
  rivers: [],
  tiles: {
    '0,0': { coord: { q: 0, r: 0 }, terrain: 'ocean', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
    '1,0': { coord: { q: 1, r: 0 }, terrain: 'ocean', elevation: 'lowland', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null },
  },
};

function unit(type: UnitType, owner: string, q: number): Unit {
  return {
    id: `${owner}-${type}`,
    type,
    owner,
    position: { q, r: 0 },
    movementPointsLeft: UNIT_DEFINITIONS[type].movementPoints,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}

function exchangeCount(pirateType: UnitType, defenderType: UnitType, seed: number, era: number): number {
  let pirate = unit(pirateType, 'pirate-1', 0);
  let defender = unit(defenderType, 'player', 1);
  for (let exchange = 1; exchange <= 12; exchange++) {
    const result = resolveCombat(pirate, defender, OCEAN_MAP, seed + exchange, undefined, era);
    pirate = { ...pirate, health: pirate.health - result.attackerDamage };
    defender = { ...defender, health: defender.health - result.defenderDamage };
    if (pirate.health <= 0 || defender.health <= 0) return exchange;
  }
  return 13;
}

describe('pirate fleet balance', () => {
  it('keeps each current anchor stronger than its era counter without exceeding twice its strength', () => {
    const contemporary: UnitType[] = ['galley', 'galley', 'trireme', 'trireme', 'trireme'];
    for (const [index, stage] of PIRATE_STAGE_DEFINITIONS.entries()) {
      const pirateStrength = UNIT_DEFINITIONS[stage.anchorHull].strength;
      const counterStrength = UNIT_DEFINITIONS[contemporary[index]].strength;
      expect(pirateStrength, stage.anchorHull).toBeGreaterThan(counterStrength);
      expect(pirateStrength, stage.anchorHull).toBeLessThanOrEqual(counterStrength * 2);
    }
  });

  it('resolves fixed-seed contemporary encounters in a readable 2-7 exchange band', () => {
    const contemporary: UnitType[] = ['galley', 'galley', 'trireme', 'trireme', 'trireme'];
    for (const [index, stage] of PIRATE_STAGE_DEFINITIONS.entries()) {
      const counts = [11, 29, 47, 83, 131].map(seed =>
        exchangeCount(stage.anchorHull, contemporary[index], seed, stage.stage),
      );
      expect(Math.min(...counts), `${stage.anchorHull} minimum exchanges`).toBeGreaterThanOrEqual(2);
      expect(Math.max(...counts), `${stage.anchorHull} maximum exchanges`).toBeLessThanOrEqual(7);
    }
  });

  it('keeps late fleets historically mixed while the anchor remains their strongest ship', () => {
    for (const stageNumber of [4, 5] as const) {
      const stage = PIRATE_STAGE_DEFINITIONS[stageNumber - 1];
      const fleets = Array.from({ length: 40 }, (_, seed) =>
        composePirateFleet(stageNumber, 'blockading', `late-${stageNumber}-${seed}`),
      );
      expect(fleets.some(fleet => new Set(fleet).size > 1)).toBe(true);
      expect(fleets.some(fleet => fleet.some(hull => hull !== stage.anchorHull))).toBe(true);
      for (const fleet of fleets) {
        const anchorStrength = UNIT_DEFINITIONS[stage.anchorHull].strength;
        expect(Math.max(...fleet.map(hull => UNIT_DEFINITIONS[hull].strength))).toBe(anchorStrength);
      }
    }
  });
});
