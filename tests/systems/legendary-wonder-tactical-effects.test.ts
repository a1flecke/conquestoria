import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { LegendaryWonderDefinition } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { mapNeighbors } from '@/systems/hex-utils';
import { createUnit } from '@/systems/unit-system';
import {
  applyLegendaryWonderTrainingEffects,
  getTacticalFortOccupantHealingBonus,
  getTacticalAdjacentCitadelDefense,
  getTacticalSamRadius,
  getCompletedLegendaryWonderTacticalEffects,
  getTacticalWonderAiValue,
} from '@/systems/legendary-wonder-tactical-effects';

const definitions: LegendaryWonderDefinition[] = [{
  id: 'test-wonder', name: 'Test Wonder', era: 3, productionCost: 1,
  requiredTechs: [], requiredResources: [], cityRequirement: 'any', questSteps: [],
  reward: { summary: 'Test', tacticalEffects: [{ kind: 'fort-occupant-healing', amount: 5, aiValue: 14 }] },
}];

describe('legendary wonder tactical effects', () => {
  it('resolves only effects from wonders completed by the requesting owner', () => {
    const state = createNewGame('rome', 'tactical-effect-owner', 'small');
    state.completedLegendaryWonders = { 'test-wonder': { ownerId: 'player', cityId: Object.keys(state.cities)[0]!, turnCompleted: 1 } };

    expect(getCompletedLegendaryWonderTacticalEffects(state, 'player', definitions)).toEqual(definitions[0]!.reward.tacticalEffects);
    expect(getCompletedLegendaryWonderTacticalEffects(state, 'ai-1', definitions)).toEqual([]);
    expect(getTacticalWonderAiValue(state, 'player', definitions)).toBe(14);
  });

  it('grants a role-training effect once per role in the current era', () => {
    const state = createNewGame('rome', 'tactical-training', 'small');
    state.completedLegendaryWonders = {
      'test-wonder': { ownerId: 'player', cityId: Object.keys(state.cities)[0]!, turnCompleted: 1 },
    };
    const trainingDefinitions: LegendaryWonderDefinition[] = [{
      ...definitions[0]!,
      reward: {
        summary: 'Training test',
        tacticalEffects: [{
          kind: 'per-era-role-training-xp',
          roles: ['frontline', 'ranged'],
          experience: 10,
          maxGrantsPerEra: 4,
          aiValue: 10,
        }],
      },
    }];

    const first = applyLegendaryWonderTrainingEffects(state, {
      civId: 'player', unitType: 'warrior', era: 3, isEligibleLandCombatUnit: true,
      definitions: trainingDefinitions,
    });
    const repeated = applyLegendaryWonderTrainingEffects(first.state, {
      civId: 'player', unitType: 'warrior', era: 3, isEligibleLandCombatUnit: true,
      definitions: trainingDefinitions,
    });
    const nextEra = applyLegendaryWonderTrainingEffects(repeated.state, {
      civId: 'player', unitType: 'warrior', era: 4, isEligibleLandCombatUnit: true,
      definitions: trainingDefinitions,
    });

    expect(first.experienceBonus).toBe(10);
    expect(first.state.legendaryWonderTacticalEffects?.trainingGrantsByCiv.player).toEqual({
      era: 3, grantedRoles: ['frontline'],
    });
    expect(repeated.experienceBonus).toBe(0);
    expect(nextEra.experienceBonus).toBe(10);
    expect(nextEra.state.legendaryWonderTacticalEffects?.trainingGrantsByCiv.player).toEqual({
      era: 4, grantedRoles: ['frontline'],
    });
  });

  it('does not claim a role-training reward for an ineligible unit or beyond its cap', () => {
    const state = createNewGame('rome', 'tactical-training-negative', 'small');
    state.completedLegendaryWonders = {
      'test-wonder': { ownerId: 'player', cityId: Object.keys(state.cities)[0]!, turnCompleted: 1 },
    };
    const cappedDefinitions: LegendaryWonderDefinition[] = [{
      ...definitions[0]!,
      reward: {
        summary: 'Training test',
        tacticalEffects: [{
          kind: 'per-era-role-training-xp', roles: ['frontline', 'ranged'], experience: 10, maxGrantsPerEra: 1, aiValue: 10,
        }],
      },
    }];

    const civilian = applyLegendaryWonderTrainingEffects(state, {
      civId: 'player', unitType: 'settler', era: 3, isEligibleLandCombatUnit: false, definitions: cappedDefinitions,
    });
    const first = applyLegendaryWonderTrainingEffects(civilian.state, {
      civId: 'player', unitType: 'warrior', era: 3, isEligibleLandCombatUnit: true, definitions: cappedDefinitions,
    });
    const capped = applyLegendaryWonderTrainingEffects(first.state, {
      civId: 'player', unitType: 'archer', era: 3, isEligibleLandCombatUnit: true, definitions: cappedDefinitions,
    });

    expect(civilian.experienceBonus).toBe(0);
    expect(first.experienceBonus).toBe(10);
    expect(capped.experienceBonus).toBe(0);
    expect(capped.state.legendaryWonderTacticalEffects?.trainingGrantsByCiv.player).toEqual({
      era: 3, grantedRoles: ['frontline'],
    });
  });

  it('returns Fort healing only for an owned completed land-combat occupant', () => {
    const state = createNewGame('rome', 'tactical-fort-healing', 'small');
    const startPosition = state.units[state.civilizations.player.units[0]!].position;
    const unit = createUnit('warrior', 'player', startPosition, state.idCounters);
    const tile = state.map.tiles[hexKey(unit.position)]!;
    tile.owner = 'player';
    tile.improvement = 'fort';
    tile.improvementTurnsLeft = 0;
    state.completedLegendaryWonders = {
      'test-wonder': { ownerId: 'player', cityId: Object.keys(state.cities)[0]!, turnCompleted: 1 },
    };
    const healingDefinitions: LegendaryWonderDefinition[] = [{
      ...definitions[0]!,
      reward: { summary: 'Healing test', tacticalEffects: [{ kind: 'fort-occupant-healing', amount: 5, aiValue: 14 }] },
    }];

    expect(getTacticalFortOccupantHealingBonus(state, unit, healingDefinitions)).toBe(5);
    tile.improvementTurnsLeft = 1;
    expect(getTacticalFortOccupantHealingBonus(state, unit, healingDefinitions)).toBe(0);
  });

  it('returns one non-stacking Citadel defense bonus for an eligible adjacent defender', () => {
    const state = createNewGame('rome', 'tactical-citadel-defense', 'small');
    const defenderPosition = state.units[state.civilizations.player.units[0]!].position;
    const defender = createUnit('warrior', 'player', defenderPosition, state.idCounters);
    const sourcePosition = mapNeighbors(state.map, defenderPosition)[0]!;
    const source = createUnit('warrior', 'player', sourcePosition, state.idCounters);
    state.units[source.id] = source;
    const sourceTile = state.map.tiles[hexKey(sourcePosition)]!;
    sourceTile.owner = 'player';
    sourceTile.improvement = 'fort';
    sourceTile.improvementTurnsLeft = 0;
    state.civilizations.player.techState.completed.push('fortification-engineering');
    state.completedLegendaryWonders = {
      'test-wonder': { ownerId: 'player', cityId: Object.keys(state.cities)[0]!, turnCompleted: 1 },
    };
    const citadelDefinitions: LegendaryWonderDefinition[] = [{
      ...definitions[0]!,
      reward: {
        summary: 'Citadel test',
        tacticalEffects: [{
          kind: 'adjacent-citadel-defense', multiplier: 1.05, stackingGroup: 'citadel', excludedRoles: ['siege'], aiValue: 14,
        }],
      },
    }];

    expect(getTacticalAdjacentCitadelDefense(state, defender, citadelDefinitions)).toMatchObject({
      multiplier: 1.05,
      label: 'Legendary Citadel +5%',
    });
    sourceTile.improvementTurnsLeft = 1;
    expect(getTacticalAdjacentCitadelDefense(state, defender, citadelDefinitions).multiplier).toBe(1);
  });

  it('extends only a completed owner’s declared SAM radius', () => {
    const state = createNewGame('rome', 'tactical-sam-radius', 'small');
    state.completedLegendaryWonders = {
      'test-wonder': { ownerId: 'player', cityId: Object.keys(state.cities)[0]!, turnCompleted: 1 },
    };
    const samDefinitions: LegendaryWonderDefinition[] = [{
      ...definitions[0]!,
      reward: { summary: 'SAM test', tacticalEffects: [{ kind: 'aa-radius-extension', providerKind: 'sam-site', radius: 3, aiValue: 14 }] },
    }];

    expect(getTacticalSamRadius(state, 'player', 2, samDefinitions)).toBe(3);
    expect(getTacticalSamRadius(state, 'ai-1', 2, samDefinitions)).toBe(2);
  });
});
