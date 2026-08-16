import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getBarbarianRosterForEra } from '@/systems/barbarian-system';
import {
  BARBARIAN_ELIGIBILITY_BY_UNIT,
  getBarbarianEligibility,
} from '@/systems/barbarian-roster';
import { getBarbarianReinforcementCandidates } from '@/systems/barbarian-force-composer';
import type { BarbarianEligibility, UnitType } from '@/core/types';

describe('barbarian eligibility catalog', () => {
  it('classifies every current unit definition so future units fail closed', () => {
    expect(Object.keys(BARBARIAN_ELIGIBILITY_BY_UNIT).sort())
      .toEqual(Object.keys(UNIT_DEFINITIONS).sort());

    for (const definition of Object.values(UNIT_DEFINITIONS)) {
      expect(getBarbarianEligibility(definition.type)).toBe(
        BARBARIAN_ELIGIBILITY_BY_UNIT[definition.type],
      );
      expect(definition.barbarianEligibility).toBe(
        BARBARIAN_ELIGIBILITY_BY_UNIT[definition.type],
      );
    }
  });

  it('records the approved future camp composition contract declaratively', () => {
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.chariot).toMatchObject({
      status: 'eligible', eraWindow: { min: 2, max: 4 }, roleSlot: 'mobile', rarity: 'common', weight: 100,
    });
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.trebuchet).toMatchObject({
      status: 'eligible', eraWindow: { min: 4, max: 6 }, roleSlot: 'siege', maxPerCampBeforeEscalation: 1,
    });
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.cavalry).toMatchObject({
      status: 'eligible', eraWindow: { min: 6, max: 8 }, roleSlot: 'mobile', rarity: 'common', weight: 100,
    });
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.cuirassier).toMatchObject({
      status: 'eligible', eraWindow: { min: 6, max: 8 }, roleSlot: 'mobile', rarity: 'rare', excludesUnits: ['cavalry'],
    });
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.armored_car).toMatchObject({
      status: 'eligible', eraWindow: { min: 9, max: 11 }, roleSlot: 'mobile', rarity: 'common', weight: 100,
    });
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.anti_tank_gun).toMatchObject({
      status: 'eligible', eraWindow: { min: 9 }, roleSlot: 'specialist', requiresObservation: 'armor',
    });
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.mobile_aa).toMatchObject({
      status: 'eligible', eraWindow: { min: 10 }, roleSlot: 'anti-air', requiresObservation: 'air', maxPerCamp: 1,
    });
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT.mechanized_infantry).toMatchObject({
      status: 'eligible', eraWindow: { min: 10 }, roleSlot: 'frontline', rarity: 'uncommon',
    });
  });

  it('makes every eligible catalog entry selectable only inside its declared window', () => {
    for (const [unitType, eligibility] of Object.entries(BARBARIAN_ELIGIBILITY_BY_UNIT) as [UnitType, BarbarianEligibility][]) {
      if (eligibility.status === 'excluded') continue;
      const observedThreats = eligibility.requiresObservation ? [eligibility.requiresObservation] : [];

      expect(getBarbarianReinforcementCandidates({ era: eligibility.eraWindow.min, observedThreats }))
        .toContain(unitType);
      if (eligibility.eraWindow.min > 1) {
        expect(getBarbarianReinforcementCandidates({ era: eligibility.eraWindow.min - 1, observedThreats }))
          .not.toContain(unitType);
      }
      if (eligibility.eraWindow.max !== undefined) {
        expect(getBarbarianReinforcementCandidates({ era: eligibility.eraWindow.max + 1, observedThreats }))
          .not.toContain(unitType);
      }
    }
  });

  it.each([
    'beast_handler', 'war_elephant', 'wwii_fighter', 'main_battle_tank',
    'rocket_artillery', 'battleship', 'missile_cruiser',
  ] as const)('explicitly excludes %s from ordinary camps', (unitType) => {
    expect(BARBARIAN_ELIGIBILITY_BY_UNIT[unitType]).toMatchObject({ status: 'excluded' });
  });

  it('does not change the live era roster before the composer is introduced', () => {
    expect([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].map(era => [
      era,
      getBarbarianRosterForEra(era),
    ])).toEqual([
      [1, { maxEra: 2, melee: ['warrior', 'axeman'], ranged: ['archer'] }],
      [2, { maxEra: 2, melee: ['warrior', 'axeman'], ranged: ['archer'] }],
      [3, { maxEra: 4, melee: ['swordsman', 'spearman'], ranged: ['crossbowman'] }],
      [4, { maxEra: 4, melee: ['swordsman', 'spearman'], ranged: ['crossbowman'] }],
      [5, { maxEra: 7, melee: ['pikeman', 'musketeer'], ranged: ['crossbowman'] }],
      [7, { maxEra: 7, melee: ['pikeman', 'musketeer'], ranged: ['crossbowman'] }],
      [8, { maxEra: 9, melee: ['rifleman'], ranged: ['grenadier'] }],
      [9, { maxEra: 9, melee: ['rifleman'], ranged: ['grenadier'] }],
      [10, { maxEra: 11, melee: ['tank', 'rifleman'], ranged: ['machine_gunner'] }],
      [11, { maxEra: 11, melee: ['tank', 'rifleman'], ranged: ['machine_gunner'] }],
      [12, { maxEra: 11, melee: ['tank', 'rifleman'], ranged: ['machine_gunner'] }],
    ]);
  });
});
