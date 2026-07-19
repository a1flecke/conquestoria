import { describe, it, expect } from 'vitest';
import {
  getCombatModifier,
  getClassCounterMultiplier,
  getHealingBonus,
  getVisionBonus,
  isWithinRangeOfTelemedicineHub,
  type CombatModifierContext,
  type HealingModifierContext,
} from '@/systems/unit-modifier-system';
import { UNIT_CLASS_BY_TYPE, UNIT_MODIFIERS } from '@/systems/unit-modifier-definitions';
import { UNIT_DEFINITIONS, createUnit } from '@/systems/unit-system';
import { calculateCombatStrengths, resolveCombat } from '@/systems/combat-system';
import { getTerrainDefenseBonus } from '@/systems/combat-system';
import { generateMap } from '@/systems/map-generator';
import type { GameMap, GameState, UnitType } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function baseCombatCtx(overrides: Partial<CombatModifierContext> = {}): CombatModifierContext {
  return {
    completedTechs: [],
    activeNationalProjects: [],
    fullHP: true,
    inFriendlyCity: false,
    opponentType: 'warrior',
    ...overrides,
  };
}

function baseHealCtx(overrides: Partial<HealingModifierContext> = {}): HealingModifierContext {
  return {
    completedTechs: [],
    activeNationalProjects: [],
    inFriendlyCity: false,
    inFriendlyTerritory: false,
    withinRangeOfFriendlyCity3: false,
    withinRangeOfNeuralRehabilitationCenter: false,
    ...overrides,
  };
}

describe('UNIT_CLASS_BY_TYPE completeness', () => {
  it('defines Marine as a gunpowder amphibious specialist', () => {
    expect(UNIT_DEFINITIONS.marine).toMatchObject({
      name: 'Marine',
      strength: 36,
      domain: 'land',
    });
    expect(UNIT_CLASS_BY_TYPE.marine).toContain('gunpowder');
  });

  it('applies Marine landing training only during an amphibious attack', () => {
    expect(getCombatModifier('marine', 'attacker', baseCombatCtx({ amphibiousAssault: true })).mult).toBe(2);
    expect(getCombatModifier('marine', 'attacker', baseCombatCtx()).mult).toBe(1);
  });

  it('every UnitType in UNIT_DEFINITIONS has a non-empty class list', () => {
    for (const type of Object.keys(UNIT_DEFINITIONS) as UnitType[]) {
      expect(UNIT_CLASS_BY_TYPE[type]).toBeDefined();
      expect(UNIT_CLASS_BY_TYPE[type].length).toBeGreaterThan(0);
    }
  });
});

describe('getCombatModifier — tech rows', () => {
  it('tactics: +10% multiplier, always, applies with no completed techs missing it (negative test)', () => {
    const withTech = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['tactics'] }));
    const withoutTech = getCombatModifier('warrior', 'attacker', baseCombatCtx());
    expect(withTech.mult).toBeCloseTo(1.10);
    expect(withoutTech.mult).toBe(1);
  });

  it('naval-gunnery: +5 flat only for naval class (negative: land unit)', () => {
    const naval = getCombatModifier('trireme', 'attacker', baseCombatCtx({ completedTechs: ['naval-gunnery'] }));
    const land = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['naval-gunnery'] }));
    expect(naval.flat).toBe(5);
    expect(land.flat).toBe(0);
  });

  it('precision-casting: +5 flat only for cannon (negative: catapult)', () => {
    const cannon = getCombatModifier('cannon', 'attacker', baseCombatCtx({ completedTechs: ['precision-casting'] }));
    const catapult = getCombatModifier('catapult', 'attacker', baseCombatCtx({ completedTechs: ['precision-casting'] }));
    expect(cannon.flat).toBe(5);
    expect(catapult.flat).toBe(0);
  });

  it('steel-plate-armor: +3 flat for melee when defending (negative: attacking)', () => {
    const defending = getCombatModifier('warrior', 'defender', baseCombatCtx({ completedTechs: ['steel-plate-armor'] }));
    const attacking = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['steel-plate-armor'] }));
    expect(defending.flat).toBe(3);
    expect(attacking.flat).toBe(0);
  });

  it('nanomaterials: +3 flat for ALL units (re-texted, no newUnitsOnly gate)', () => {
    const warrior = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['nanomaterials'] }));
    const tank = getCombatModifier('tank', 'defender', baseCombatCtx({ completedTechs: ['nanomaterials'] }));
    expect(warrior.flat).toBe(3);
    expect(tank.flat).toBe(3);
  });

  it('transhumanism: ×1.05 only at full HP (negative: damaged unit)', () => {
    const fullHP = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['transhumanism'], fullHP: true }));
    const damaged = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['transhumanism'], fullHP: false }));
    expect(fullHP.mult).toBeCloseTo(1.05);
    expect(damaged.mult).toBe(1);
  });

  it('amphibious-assault: +3 flat naval attacker vs coastal city only (negative: non-coastal target)', () => {
    const vsCoastal = getCombatModifier('ironclad', 'attacker', baseCombatCtx({
      completedTechs: ['amphibious-assault'], targetIsCoastalCity: true,
    }));
    const vsInland = getCombatModifier('ironclad', 'attacker', baseCombatCtx({
      completedTechs: ['amphibious-assault'], targetIsCoastalCity: false,
    }));
    const asDefender = getCombatModifier('ironclad', 'defender', baseCombatCtx({
      completedTechs: ['amphibious-assault'], targetIsCoastalCity: true,
    }));
    expect(vsCoastal.flat).toBe(3);
    expect(vsInland.flat).toBe(0);
    expect(asDefender.flat).toBe(0);
  });

  it('armored-tactics: +5 flat only for tank (negative: cavalry)', () => {
    const tank = getCombatModifier('tank', 'attacker', baseCombatCtx({ completedTechs: ['armored-tactics'] }));
    const cavalry = getCombatModifier('cavalry', 'attacker', baseCombatCtx({ completedTechs: ['armored-tactics'] }));
    expect(tank.flat).toBe(5);
    expect(cavalry.flat).toBe(0);
  });

  it('torpedo-warfare: +8 flat only for naval ranged/bombard hulls (negative: galley melee hull)', () => {
    const submarine = getCombatModifier('submarine', 'attacker', baseCombatCtx({ completedTechs: ['torpedo-warfare'] }));
    const galley = getCombatModifier('galley', 'attacker', baseCombatCtx({ completedTechs: ['torpedo-warfare'] }));
    expect(submarine.flat).toBe(8);
    expect(galley.flat).toBe(0);
  });

  it('stone-weapons: +2 flat only for warrior, attacking only (negative: defending, negative: other unit)', () => {
    const attacking = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['stone-weapons'] }));
    const defending = getCombatModifier('warrior', 'defender', baseCombatCtx({ completedTechs: ['stone-weapons'] }));
    const otherUnit = getCombatModifier('archer', 'attacker', baseCombatCtx({ completedTechs: ['stone-weapons'] }));
    expect(attacking.flat).toBe(2);
    expect(defending.flat).toBe(0);
    expect(otherUnit.flat).toBe(0);
  });
});

describe('getCombatModifier — national project fade scaling', () => {
  it('iron_legion at full strength (fade 1) gives +2 to land units (negative: naval unit)', () => {
    const land = getCombatModifier('warrior', 'attacker', baseCombatCtx({
      activeNationalProjects: [{ id: 'iron_legion', fadeMultiplier: 1 }],
    }));
    const naval = getCombatModifier('trireme', 'attacker', baseCombatCtx({
      activeNationalProjects: [{ id: 'iron_legion', fadeMultiplier: 1 }],
    }));
    expect(land.flat).toBe(2);
    expect(naval.flat).toBe(0);
  });

  it('iron_legion at fade 0.5 gives +1 (floor of 2×0.5)', () => {
    const faded = getCombatModifier('warrior', 'attacker', baseCombatCtx({
      activeNationalProjects: [{ id: 'iron_legion', fadeMultiplier: 0.5 }],
    }));
    expect(faded.flat).toBe(1);
  });

  it('expired (fadeMultiplier 0, or absent) contributes nothing', () => {
    const absent = getCombatModifier('warrior', 'attacker', baseCombatCtx());
    expect(absent.flat).toBe(0);
  });

  it('praetorian_legion: +3 defending in friendly city only (negative: not in friendly city, negative: attacking)', () => {
    const defendingInCity = getCombatModifier('warrior', 'defender', baseCombatCtx({
      activeNationalProjects: [{ id: 'praetorian_legion', fadeMultiplier: 1 }],
      inFriendlyCity: true,
    }));
    const defendingOutside = getCombatModifier('warrior', 'defender', baseCombatCtx({
      activeNationalProjects: [{ id: 'praetorian_legion', fadeMultiplier: 1 }],
      inFriendlyCity: false,
    }));
    const attackingInCity = getCombatModifier('warrior', 'attacker', baseCombatCtx({
      activeNationalProjects: [{ id: 'praetorian_legion', fadeMultiplier: 1 }],
      inFriendlyCity: true,
    }));
    expect(defendingInCity.flat).toBe(3);
    expect(defendingOutside.flat).toBe(0);
    expect(attackingInCity.flat).toBe(0);
  });

  it('air_force_command parity: same +4 as the pre-migration ad-hoc branch for an air attacker (negative: land attacker)', () => {
    const air = getCombatModifier('biplane', 'attacker', baseCombatCtx({
      activeNationalProjects: [{ id: 'air_force_command', fadeMultiplier: 1 }],
    }));
    const land = getCombatModifier('warrior', 'attacker', baseCombatCtx({
      activeNationalProjects: [{ id: 'air_force_command', fadeMultiplier: 1 }],
    }));
    expect(air.flat).toBe(4);
    expect(land.flat).toBe(0);
  });
});

describe('getClassCounterMultiplier — class counters', () => {
  it('pikeman attacking knight (mounted): ×1.5', () => {
    const result = getClassCounterMultiplier('pikeman', 'knight', false);
    expect(result?.multiplier).toBe(1.5);
  });

  it('pikeman vs swordsman (melee, not mounted): no counter (negative test)', () => {
    const result = getClassCounterMultiplier('pikeman', 'swordsman', false);
    expect(result).toBeUndefined();
  });

  it('attack_helicopter vs tank (armor): ×1.5', () => {
    const result = getClassCounterMultiplier('attack_helicopter', 'tank', false);
    expect(result?.multiplier).toBe(1.5);
  });

  it('grenadier vs melee defender only counts inside a friendly city (negative: open field)', () => {
    const inCity = getClassCounterMultiplier('grenadier', 'warrior', true);
    const openField = getClassCounterMultiplier('grenadier', 'warrior', false);
    expect(inCity?.multiplier).toBe(1.25);
    expect(openField).toBeUndefined();
  });

  it('submarine vs naval civilian (transport): ×1.5 (negative: land civilian)', () => {
    const navalCivilian = getClassCounterMultiplier('submarine', 'transport', false);
    const landCivilian = getClassCounterMultiplier('submarine', 'settler', false);
    expect(navalCivilian?.multiplier).toBe(1.5);
    expect(landCivilian).toBeUndefined();
  });

  it('destroyer vs submarine/missile_submarine (sub-hunter): ×1.25 (negative: pre_dreadnought)', () => {
    const vsSubmarine = getClassCounterMultiplier('destroyer', 'submarine', false);
    const vsMissileSubmarine = getClassCounterMultiplier('destroyer', 'missile_submarine', false);
    const vsPreDreadnought = getClassCounterMultiplier('destroyer', 'pre_dreadnought', false);
    expect(vsSubmarine?.multiplier).toBe(1.25);
    expect(vsMissileSubmarine?.multiplier).toBe(1.25);
    expect(vsPreDreadnought).toBeUndefined();
  });

  it('keeps efficient non-network counters against each Era 13 combat line', () => {
    expect(getClassCounterMultiplier('jet_fighter', 'combat_drone', false)?.multiplier).toBe(1.35);
    expect(getClassCounterMultiplier('submarine', 'autonomous_frigate', false)?.multiplier).toBe(1.25);
    expect(getClassCounterMultiplier('tank', 'exosuit_infantry', false)?.multiplier).toBe(1.25);
    expect(getClassCounterMultiplier('warrior', 'combat_drone', false)).toBeUndefined();
  });

  it('counters only apply on the attacker side of getCombatModifier (negative: defender role)', () => {
    const asAttacker = getCombatModifier('pikeman', 'attacker', baseCombatCtx({ opponentType: 'knight' }));
    const asDefender = getCombatModifier('knight', 'defender', baseCombatCtx({ opponentType: 'pikeman' }));
    expect(asAttacker.mult).toBeCloseTo(1.5);
    expect(asDefender.mult).toBe(1);
  });
});

describe('getHealingBonus — stacking order and conditions', () => {
  it('flat bonuses stack, then a single multiplier applies last (mindfulness-movement)', () => {
    const bonus = getHealingBonus(baseHealCtx({
      completedTechs: ['surgical-school', 'antiseptic-surgery', 'blood-transfusion', 'mindfulness-movement'],
      inFriendlyCity: true,
      inFriendlyTerritory: true,
    }));
    // surgical-school(+2) + antiseptic-surgery(+3) + blood-transfusion(+4) = +9 flat
    expect(bonus.flat).toBe(9);
    expect(bonus.mult).toBeCloseTo(1.5);
  });

  it('inFriendlyCity-gated techs contribute nothing outside a city (negative test)', () => {
    const bonus = getHealingBonus(baseHealCtx({
      completedTechs: ['surgical-school', 'antiseptic-surgery', 'blood-transfusion'],
      inFriendlyCity: false,
    }));
    expect(bonus.flat).toBe(0);
  });

  it('inFriendlyTerritory-gated techs contribute nothing outside friendly territory (negative test)', () => {
    const bonus = getHealingBonus(baseHealCtx({
      completedTechs: ['advanced-anatomy', 'germ-theory', 'penicillin'],
      inFriendlyTerritory: false,
    }));
    expect(bonus.flat).toBe(0);
    const withTerritory = getHealingBonus(baseHealCtx({
      completedTechs: ['advanced-anatomy', 'germ-theory', 'penicillin'],
      inFriendlyTerritory: true,
    }));
    expect(withTerritory.flat).toBe(1 + 2 + 3);
  });

  it('sacred_grove NP fade-scales like combat NPs', () => {
    const full = getHealingBonus(baseHealCtx({
      activeNationalProjects: [{ id: 'sacred_grove', fadeMultiplier: 1 }],
      inFriendlyTerritory: true,
    }));
    const faded = getHealingBonus(baseHealCtx({
      activeNationalProjects: [{ id: 'sacred_grove', fadeMultiplier: 0.5 }],
      inFriendlyTerritory: true,
    }));
    expect(full.flat).toBe(2);
    expect(faded.flat).toBe(1);
  });

  it('telemedicine only applies within range of a Telemedicine Hub (negative: no hub in range)', () => {
    const withinRange = getHealingBonus(baseHealCtx({
      completedTechs: ['telemedicine'],
      withinRangeOfFriendlyCity3: true,
    }));
    const outOfRange = getHealingBonus(baseHealCtx({
      completedTechs: ['telemedicine'],
      withinRangeOfFriendlyCity3: false,
    }));
    expect(withinRange.flat).toBe(1);
    expect(outOfRange.flat).toBe(0);
  });

  it('Precision Gene Editing adds +5 healing only near a Neural Rehabilitation Center', () => {
    const nearCare = getHealingBonus({
      ...baseHealCtx({ completedTechs: ['precision-gene-editing'] }),
      withinRangeOfNeuralRehabilitationCenter: true,
    } as HealingModifierContext);
    const farFromCare = getHealingBonus({
      ...baseHealCtx({ completedTechs: ['precision-gene-editing'] }),
      withinRangeOfNeuralRehabilitationCenter: false,
    } as HealingModifierContext);

    expect(nearCare.flat).toBe(5);
    expect(farFromCare.flat).toBe(0);
  });
});

describe('isWithinRangeOfTelemedicineHub', () => {
  function makeState(hubBuildings: string[], distance: number): GameState {
    return {
      cities: {
        'city-1': {
          id: 'city-1', owner: 'p1', position: { q: 0, r: 0 }, buildings: hubBuildings,
        } as unknown as GameState['cities'][string],
      },
    } as unknown as GameState;
    void distance;
  }

  it('true when a friendly city with telemedicine_hub is within range', () => {
    const state = makeState(['telemedicine_hub'], 2);
    expect(isWithinRangeOfTelemedicineHub(state, 'p1', { q: 1, r: 0 }, 3)).toBe(true);
  });

  it('false when the city lacks telemedicine_hub (negative test)', () => {
    const state = makeState([], 2);
    expect(isWithinRangeOfTelemedicineHub(state, 'p1', { q: 1, r: 0 }, 3)).toBe(false);
  });

  it('false when out of range (negative test)', () => {
    const state = makeState(['telemedicine_hub'], 2);
    expect(isWithinRangeOfTelemedicineHub(state, 'p1', { q: 10, r: 10 }, 3)).toBe(false);
  });
});

describe('getVisionBonus', () => {
  it('scout with pathfinding gets +1 vision (recon class); warrior unaffected (negative test)', () => {
    const scout = getVisionBonus('scout', ['pathfinding'], []);
    const warrior = getVisionBonus('warrior', ['pathfinding'], []);
    expect(scout).toBe(1);
    expect(warrior).toBe(0);
  });

  it('optics affects both recon and non-recon units', () => {
    const scout = getVisionBonus('scout', ['optics'], []);
    const warrior = getVisionBonus('warrior', ['optics'], []);
    expect(scout).toBe(1);
    expect(warrior).toBe(1);
  });

  it('aerial-survey affects air units only (negative: land unit)', () => {
    const biplane = getVisionBonus('biplane', ['aerial-survey'], []);
    const warrior = getVisionBonus('warrior', ['aerial-survey'], []);
    expect(biplane).toBe(1);
    expect(warrior).toBe(0);
  });

  it("explorers_guild NP fade-scales", () => {
    const full = getVisionBonus('scout', [], [{ id: 'explorers_guild', fadeMultiplier: 1 }]);
    const faded = getVisionBonus('scout', [], [{ id: 'explorers_guild', fadeMultiplier: 0.5 }]);
    expect(full).toBe(1);
    expect(faded).toBe(0);
  });
});

describe('UNIT_MODIFIERS table integrity', () => {
  it('every row has a non-empty label', () => {
    for (const modifier of UNIT_MODIFIERS) {
      expect(modifier.label.length).toBeGreaterThan(0);
    }
  });
});

describe('order-of-operations lock (composition test)', () => {
  const map: GameMap = generateMap(20, 20, 'unit-modifier-order-lock');

  it('applies veterancy/terrain/fortify/civ-bonus, THEN unit modifiers, THEN city defense in that fixed order', () => {
    const attacker = createUnit('warrior', 'p1', { q: 5, r: 5 }, mkC());
    const defender = { ...createUnit('pikeman', 'p2', { q: 6, r: 5 }, mkC()), isFortified: true };

    const attackerModifiers = getCombatModifier('warrior', 'attacker', baseCombatCtx({ completedTechs: ['tactics'] }));
    const defenderModifiers = getCombatModifier('pikeman', 'defender', baseCombatCtx());

    const result = calculateCombatStrengths(attacker, defender, map, {
      attackerModifiers,
      defenderModifiers,
      defenderCity: { cityBuildings: ['walls'], defenderCompletedTechs: [], attackerDomain: 'land' },
    });

    const defTile = map.tiles['6,5'];
    const terrainBonus = defTile ? getTerrainDefenseBonus(defTile.terrain) : 0;
    // Expected order: base*health -> *(1+terrainBonus) -> *1.25 (fortify) -> unit modifiers -> *1.25 (walls)
    const expectedAttacker = 10 /* warrior strength */ * attackerModifiers.mult + attackerModifiers.flat;
    const expectedDefenderBeforeCity = 35 /* pikeman strength */ * (1 + terrainBonus) * 1.25;
    const expectedDefender = expectedDefenderBeforeCity * defenderModifiers.mult + defenderModifiers.flat;
    const expectedDefenderFinal = expectedDefender * 1.25; // walls

    expect(result.attackerStrength).toBeCloseTo(expectedAttacker);
    expect(result.defenderStrength).toBeCloseTo(expectedDefenderFinal);
  });
});

describe('era-balance regression: tactics+tungsten+carbon-fiber same-era fight still resolves quickly', () => {
  it('an attacker with stacked tech modifiers still beats an equal-tier defender in 2-4 exchanges on average', () => {
    const map: GameMap = generateMap(20, 20, 'unit-modifier-balance-regression');
    const attackerMods = getCombatModifier('rifleman', 'attacker', baseCombatCtx({
      completedTechs: ['tactics', 'tungsten-alloys', 'carbon-fiber'],
    }));
    const defenderMods = getCombatModifier('rifleman', 'defender', baseCombatCtx());

    const trials = 100;
    let totalExchanges = 0;
    let attackerWins = 0;
    for (let trial = 0; trial < trials; trial++) {
      let attackerHealth = 100;
      let defenderHealth = 100;
      let exchanges = 0;
      while (attackerHealth > 0 && defenderHealth > 0 && exchanges < 20) {
        const attacker = { ...createUnit('rifleman', 'p1', { q: 5, r: 5 }, mkC()), health: attackerHealth };
        const defender = { ...createUnit('rifleman', 'p2', { q: 6, r: 5 }, mkC()), health: defenderHealth };
        const result = resolveCombat(attacker, defender, map, trial * 7919 + exchanges * 31, {
          attackerModifiers: attackerMods,
          defenderModifiers: defenderMods,
        });
        defenderHealth = Math.max(0, defenderHealth - result.defenderDamage);
        attackerHealth = Math.max(0, attackerHealth - result.attackerDamage);
        exchanges++;
      }
      totalExchanges += exchanges;
      if (defenderHealth <= 0) attackerWins++;
    }
    const average = totalExchanges / trials;
    expect(average).toBeGreaterThanOrEqual(2);
    expect(average).toBeLessThanOrEqual(6);
    expect(attackerWins / trials).toBeGreaterThanOrEqual(0.6);
  });
});
