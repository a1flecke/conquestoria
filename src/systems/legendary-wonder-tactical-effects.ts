import type { GameState, LegendaryWonderDefinition, LegendaryWonderTacticalEffect, Unit, UnitType } from '@/core/types';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { hexKey } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export function getCompletedLegendaryWonderTacticalEffects(
  state: GameState,
  civId: string,
  definitions: readonly LegendaryWonderDefinition[] = getLegendaryWonderDefinitions(),
): LegendaryWonderTacticalEffect[] {
  const definitionsById = new Map(definitions.map(definition => [definition.id, definition]));
  return Object.entries(state.completedLegendaryWonders ?? {})
    .filter(([, completion]) => completion.ownerId === civId)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([wonderId]) => definitionsById.get(wonderId)?.reward.tacticalEffects ?? [])
    .map(effect => ({ ...effect, ...(effect.kind === 'per-era-role-training-xp' ? { roles: [...effect.roles] } : {}), ...(effect.kind === 'adjacent-citadel-defense' ? { excludedRoles: [...effect.excludedRoles] } : {}) }));
}

export function getTacticalWonderAiValue(
  state: GameState,
  civId: string,
  definitions?: readonly LegendaryWonderDefinition[],
): number {
  return getCompletedLegendaryWonderTacticalEffects(state, civId, definitions)
    .reduce((total, effect) => total + effect.aiValue, 0);
}

export interface LegendaryWonderTrainingEffectInput {
  civId: string;
  unitType: UnitType;
  era: number;
  isEligibleLandCombatUnit: boolean;
  definitions?: readonly LegendaryWonderDefinition[];
}

export interface LegendaryWonderTrainingEffectResult {
  state: GameState;
  experienceBonus: number;
  grantedRole?: string;
}

/**
 * Claims all matching definition-driven role-training effects exactly once for a
 * newly trained eligible unit. This is intentionally called only from the city
 * production completion path; upgrades, captures, and spawned actors never reach it.
 */
export function applyLegendaryWonderTrainingEffects(
  state: GameState,
  input: LegendaryWonderTrainingEffectInput,
): LegendaryWonderTrainingEffectResult {
  if (!input.isEligibleLandCombatUnit) return { state, experienceBonus: 0 };

  const role = getUnitRoleDefinition(input.unitType)?.primaryRole;
  if (!role) return { state, experienceBonus: 0 };

  const matchingEffects = getCompletedLegendaryWonderTacticalEffects(state, input.civId, input.definitions)
    .filter((effect): effect is Extract<LegendaryWonderTacticalEffect, { kind: 'per-era-role-training-xp' }> =>
      effect.kind === 'per-era-role-training-xp' && effect.roles.includes(role));
  if (matchingEffects.length === 0) return { state, experienceBonus: 0 };

  const tacticalState = state.legendaryWonderTacticalEffects ?? {
    trainingGrantsByCiv: {},
    interceptionClaimTurnByCiv: {},
  };
  const previousGrant = tacticalState.trainingGrantsByCiv[input.civId];
  const grantedRoles = previousGrant?.era === input.era ? previousGrant.grantedRoles : [];
  const maxGrants = Math.min(...matchingEffects.map(effect => effect.maxGrantsPerEra));
  if (grantedRoles.includes(role) || grantedRoles.length >= maxGrants) {
    return { state, experienceBonus: 0 };
  }

  return {
    state: {
      ...state,
      legendaryWonderTacticalEffects: {
        ...tacticalState,
        trainingGrantsByCiv: {
          ...tacticalState.trainingGrantsByCiv,
          [input.civId]: { era: input.era, grantedRoles: [...grantedRoles, role] },
        },
      },
    },
    experienceBonus: matchingEffects.reduce((total, effect) => total + effect.experience, 0),
    grantedRole: role,
  };
}

export function getTacticalFortOccupantHealingBonus(
  state: GameState,
  unit: Unit,
  definitions?: readonly LegendaryWonderDefinition[],
): number {
  const tile = state.map.tiles[hexKey(unit.position)];
  const definition = UNIT_DEFINITIONS[unit.type];
  if (!tile || tile.owner !== unit.owner || tile.improvement !== 'fort' || tile.improvementTurnsLeft > 0
    || unit.transportId || definition.domain === 'naval' || definition.domain === 'air' || definition.strength <= 0) {
    return 0;
  }
  return getCompletedLegendaryWonderTacticalEffects(state, unit.owner, definitions)
    .reduce((total, effect) => total + (effect.kind === 'fort-occupant-healing' ? effect.amount : 0), 0);
}
