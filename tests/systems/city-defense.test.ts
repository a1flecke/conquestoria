import { describe, it, expect } from 'vitest';
import {
  calculateCombatStrengths,
  getCityDefenseBreakdown,
  resolveCombat,
  type CityDefenseInput,
} from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { createUnit } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';
import type { GameMap, GameState } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

const map = generateMap(30, 30, 'city-defense-test');

function baseCityDefenseInput(overrides: Partial<CityDefenseInput> = {}): CityDefenseInput {
  return {
    cityBuildings: [],
    defenderCompletedTechs: [],
    attackerDomain: 'land',
    ...overrides,
  };
}

describe('getCityDefenseBreakdown', () => {
  it('applies no modifiers with no buildings or techs', () => {
    const breakdown = getCityDefenseBreakdown(baseCityDefenseInput());
    expect(breakdown.multiplier).toBe(1);
    expect(breakdown.flatBonus).toBe(0);
    expect(breakdown.parts).toHaveLength(0);
  });

  it('walls grant ×1.25 defense multiplier', () => {
    const breakdown = getCityDefenseBreakdown(baseCityDefenseInput({ cityBuildings: ['walls'] }));
    expect(breakdown.multiplier).toBeCloseTo(1.25);
    expect(breakdown.flatBonus).toBe(0);
  });

  it('star_fort adds +5 flat defense when walls are present', () => {
    const breakdown = getCityDefenseBreakdown(
      baseCityDefenseInput({ cityBuildings: ['walls', 'star_fort'] }),
    );
    expect(breakdown.multiplier).toBeCloseTo(1.25);
    expect(breakdown.flatBonus).toBe(5);
  });

  it('star_fort WITHOUT walls contributes nothing (negative test)', () => {
    const breakdown = getCityDefenseBreakdown(
      baseCityDefenseInput({ cityBuildings: ['star_fort'] }),
    );
    expect(breakdown.multiplier).toBe(1);
    expect(breakdown.flatBonus).toBe(0);
  });

  it('fortification-engineering adds +5 flat defense when walls are present', () => {
    const breakdown = getCityDefenseBreakdown(
      baseCityDefenseInput({
        cityBuildings: ['walls'],
        defenderCompletedTechs: ['fortification-engineering'],
      }),
    );
    expect(breakdown.flatBonus).toBe(5);
  });

  it('fortification-engineering WITHOUT walls contributes nothing (negative test)', () => {
    const breakdown = getCityDefenseBreakdown(
      baseCityDefenseInput({ defenderCompletedTechs: ['fortification-engineering'] }),
    );
    expect(breakdown.flatBonus).toBe(0);
  });

  it('professional-army grants ×1.10 regardless of walls', () => {
    const withoutWalls = getCityDefenseBreakdown(
      baseCityDefenseInput({ defenderCompletedTechs: ['professional-army'] }),
    );
    expect(withoutWalls.multiplier).toBeCloseTo(1.10);

    const withWalls = getCityDefenseBreakdown(
      baseCityDefenseInput({
        cityBuildings: ['walls'],
        defenderCompletedTechs: ['professional-army'],
      }),
    );
    expect(withWalls.multiplier).toBeCloseTo(1.25 * 1.10);
  });

  it('torpedo-warfare grants +5 flat only against a naval attacker (negative: land attacker)', () => {
    const vsNaval = getCityDefenseBreakdown(
      baseCityDefenseInput({ defenderCompletedTechs: ['torpedo-warfare'], attackerDomain: 'naval' }),
    );
    expect(vsNaval.flatBonus).toBe(5);

    const vsLand = getCityDefenseBreakdown(
      baseCityDefenseInput({ defenderCompletedTechs: ['torpedo-warfare'], attackerDomain: 'land' }),
    );
    expect(vsLand.flatBonus).toBe(0);
  });

  it('stacks walls + star_fort + fortification-engineering + professional-army in documented order', () => {
    const breakdown = getCityDefenseBreakdown(
      baseCityDefenseInput({
        cityBuildings: ['walls', 'star_fort'],
        defenderCompletedTechs: ['fortification-engineering', 'professional-army'],
      }),
    );
    // multiplier: 1.25 (walls) * 1.10 (professional-army); flat: 5 (star_fort) + 5 (fort-eng)
    expect(breakdown.multiplier).toBeCloseTo(1.25 * 1.10);
    expect(breakdown.flatBonus).toBe(10);

    // str-40 defender at full HP: 40 * multiplier + flat
    const finalStrength = 40 * breakdown.multiplier + breakdown.flatBonus;
    expect(finalStrength).toBeCloseTo(40 * 1.375 + 10);
  });
});

describe('calculateCombatStrengths with defenderCity', () => {
  it('applies ×1.25 defense with walls vs an identical no-walls baseline', () => {
    const attacker = createUnit('swordsman', 'p1', { q: 5, r: 5 }, mkC());
    const defender = createUnit('spearman', 'p2', { q: 6, r: 5 }, mkC());

    const noWalls = calculateCombatStrengths(attacker, defender, map, {
      defenderCity: baseCityDefenseInput(),
    });
    const withWalls = calculateCombatStrengths(attacker, defender, map, {
      defenderCity: baseCityDefenseInput({ cityBuildings: ['walls'] }),
    });

    expect(withWalls.defenderStrength).toBeCloseTo(noWalls.defenderStrength * 1.25);
  });

  it('preview surfaces cityDefense breakdown parts', () => {
    const attacker = createUnit('swordsman', 'p1', { q: 5, r: 5 }, mkC());
    const defender = createUnit('spearman', 'p2', { q: 6, r: 5 }, mkC());

    const preview = calculateCombatStrengths(attacker, defender, map, {
      defenderCity: baseCityDefenseInput({ cityBuildings: ['walls', 'star_fort'] }),
    });

    expect(preview.cityDefense?.parts.map(p => p.label)).toEqual([
      'Walls ×1.25',
      'Star Fort +5',
    ]);
  });

  it('does not apply city defense when defenderCity is absent', () => {
    const attacker = createUnit('swordsman', 'p1', { q: 5, r: 5 }, mkC());
    const defender = createUnit('spearman', 'p2', { q: 6, r: 5 }, mkC());

    const preview = calculateCombatStrengths(attacker, defender, map);
    expect(preview.cityDefense).toBeUndefined();
  });
});

describe('buildCombatContextForDefender parity (human vs AI paths)', () => {
  function makeState(): GameState {
    const cityMap: GameMap = {
      width: 4,
      height: 4,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '0,0': {
          coord: { q: 0, r: 0 }, terrain: 'plains', elevation: 'lowland',
          resource: null, improvement: 'none', owner: 'p2',
          improvementTurnsLeft: 0, hasRiver: false, wonder: null,
        },
      },
    };
    const counters = mkC();
    const defender = createUnit('spearman', 'p2', { q: 0, r: 0 }, counters);
    const attacker = createUnit('swordsman', 'p1', { q: 1, r: 0 }, counters);
    return {
      map: cityMap,
      units: { [attacker.id]: attacker, [defender.id]: defender },
      cities: {
        'city-1': {
          id: 'city-1', name: 'Testville', owner: 'p2', position: { q: 0, r: 0 },
          buildings: ['walls', 'star_fort'], population: 1, food: 0, production: 0,
          productionQueue: [], improvementQueue: [],
        } as unknown as GameState['cities'][string],
      },
      civilizations: {
        p1: { civType: 'romans', techState: { completed: [] } } as unknown as GameState['civilizations'][string],
        p2: {
          civType: 'egyptians',
          techState: { completed: ['fortification-engineering', 'professional-army'] },
        } as unknown as GameState['civilizations'][string],
      },
    } as unknown as GameState;
  }

  it('produces an identical CityDefenseBreakdown regardless of call site', () => {
    const state = makeState();
    const attacker = Object.values(state.units).find(u => u.owner === 'p1')!;
    const defender = Object.values(state.units).find(u => u.owner === 'p2')!;

    const contextA = buildCombatContextForDefender(state, attacker, defender);
    const contextB = buildCombatContextForDefender(state, attacker, defender);

    expect(contextA.defenderCity).toEqual(contextB.defenderCity);
    expect(contextA.defenderCity?.cityBuildings).toEqual(['walls', 'star_fort']);
    expect(contextA.defenderCity?.defenderCompletedTechs).toEqual([
      'fortification-engineering',
      'professional-army',
    ]);
  });
});

describe('city defense balance guardrail', () => {
  it('a walled era-2 city with a spearman defender remains takeable 2:1 (attacker wins ≥60%)', () => {
    const trials = 200;
    let attackerWins = 0;
    for (let trial = 0; trial < trials; trial++) {
      let defenderHealth = 100;
      let attackersLeft = 2;
      let currentAttackerHealth = 100;
      let won = false;
      let exchanges = 0;
      while (attackersLeft > 0 && !won && exchanges < 60) {
        const attacker = createUnit('swordsman', 'p1', { q: 5, r: 5 }, mkC());
        const defender = createUnit('spearman', 'p2', { q: 6, r: 5 }, mkC());
        const attackerUnit = { ...attacker, health: currentAttackerHealth };
        const defenderUnit = { ...defender, health: defenderHealth };
        const result = resolveCombat(
          attackerUnit,
          defenderUnit,
          map,
          trial * 7919 + exchanges * 31,
          { defenderCity: baseCityDefenseInput({ cityBuildings: ['walls'] }) },
        );
        defenderHealth = Math.max(0, defenderHealth - result.defenderDamage);
        currentAttackerHealth = Math.max(0, currentAttackerHealth - result.attackerDamage);
        exchanges++;
        if (defenderHealth <= 0) {
          won = true;
        } else if (currentAttackerHealth <= 0) {
          attackersLeft--;
          currentAttackerHealth = 100;
        }
      }
      if (won) attackerWins++;
    }
    expect(attackerWins / trials).toBeGreaterThanOrEqual(0.6);
  });

  // MR9 city-assault viability regression: an era-8 combined-arms stack (artillery bombard
  // + machine_gunner ranged, alternating attacks against the same defender's cumulative HP)
  // must still be able to take a walled era-8 city — mass-firepower-era offense outpacing
  // fortification-era-6 defense is the whole point of the era-8 power spike.
  it('an era-8 artillery + machine_gunner stack takes a walled era-8 city within 6 combined attacks on average', () => {
    const trials = 200;
    let totalExchanges = 0;
    const attackers: Array<'artillery' | 'machine_gunner'> = ['artillery', 'machine_gunner'];
    for (let trial = 0; trial < trials; trial++) {
      let defenderHealth = 100;
      let exchanges = 0;
      while (defenderHealth > 0 && exchanges < 20) {
        const attackerType = attackers[exchanges % attackers.length];
        const attacker = createUnit(attackerType, 'p1', { q: 5, r: 5 }, mkC());
        const defender = { ...createUnit('rifleman', 'p2', { q: 6, r: 5 }, mkC()), health: defenderHealth };
        const result = resolveCombat(
          attacker,
          defender,
          map,
          trial * 7919 + exchanges * 31,
          { defenderCity: baseCityDefenseInput({ cityBuildings: ['walls'] }) },
        );
        defenderHealth = Math.max(0, defenderHealth - result.defenderDamage);
        exchanges++;
      }
      totalExchanges += exchanges;
    }
    expect(totalExchanges / trials).toBeLessThanOrEqual(6);
  });
});
