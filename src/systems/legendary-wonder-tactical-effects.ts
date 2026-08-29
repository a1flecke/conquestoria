import type { GameState, LegendaryWonderDefinition, LegendaryWonderTacticalEffect, Unit, UnitType } from '@/core/types';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { hexKey, mapNeighbors } from '@/systems/hex-utils';
import { getFortificationTier } from '@/systems/fortification-system';
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

export function getLegendaryWonderTacticalEffectAiValue(
  effects: readonly LegendaryWonderTacticalEffect[] | undefined,
): number {
  return effects?.reduce((total, effect) => total + effect.aiValue, 0) ?? 0;
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

export interface TacticalCitadelDefenseResult {
  multiplier: number;
  label?: string;
}

export function getTacticalAdjacentCitadelDefense(
  state: GameState,
  defender: Unit,
  definitions?: readonly LegendaryWonderDefinition[],
): TacticalCitadelDefenseResult {
  const defenderDefinition = UNIT_DEFINITIONS[defender.type];
  const role = getUnitRoleDefinition(defender.type)?.primaryRole;
  if (defender.transportId || defenderDefinition.domain === 'naval' || defenderDefinition.domain === 'air'
    || defenderDefinition.strength <= 0 || !role) return { multiplier: 1 };
  const hasOccupiedCitadel = mapNeighbors(state.map, defender.position).some(position => {
    const tile = state.map.tiles[hexKey(position)];
    if (!tile || tile.owner !== defender.owner || tile.improvement !== 'fort' || tile.improvementTurnsLeft > 0) return false;
    if (getFortificationTier(state.civilizations[defender.owner]?.techState.completed ?? []).id !== 'citadel') return false;
    return Object.values(state.units).some(unit => unit.owner === defender.owner && !unit.transportId && hexKey(unit.position) === hexKey(position));
  });
  if (!hasOccupiedCitadel) return { multiplier: 1 };

  const effects = getCompletedLegendaryWonderTacticalEffects(state, defender.owner, definitions)
    .filter((effect): effect is Extract<LegendaryWonderTacticalEffect, { kind: 'adjacent-citadel-defense' }> =>
      effect.kind === 'adjacent-citadel-defense' && !effect.excludedRoles.includes(role));
  if (effects.length === 0) return { multiplier: 1 };
  const strongestByGroup = new Map<string, Extract<LegendaryWonderTacticalEffect, { kind: 'adjacent-citadel-defense' }>>();
  for (const effect of effects) {
    const current = strongestByGroup.get(effect.stackingGroup);
    if (!current || effect.multiplier > current.multiplier) strongestByGroup.set(effect.stackingGroup, effect);
  }
  const selected = [...strongestByGroup.values()]
    .sort((left, right) => left.stackingGroup.localeCompare(right.stackingGroup));
  const multiplier = selected.reduce((total, effect) => total * effect.multiplier, 1);
  return {
    multiplier,
    label: `Legendary Citadel +${Math.round((multiplier - 1) * 100)}%`,
  };
}

export function getTacticalSamRadius(
  state: GameState,
  civId: string,
  baseRadius: number,
  definitions?: readonly LegendaryWonderDefinition[],
): number {
  return getCompletedLegendaryWonderTacticalEffects(state, civId, definitions)
    .reduce((radius, effect) => effect.kind === 'aa-radius-extension' && effect.providerKind === 'sam-site'
      ? Math.max(radius, effect.radius)
      : radius, baseRadius);
}

export interface TacticalInterceptionClaimResult {
  state: GameState;
  multiplier: number;
}

export function claimTacticalFirstOwnerTurnInterception(
  state: GameState,
  civId: string,
  isEligible: boolean,
  definitions?: readonly LegendaryWonderDefinition[],
): TacticalInterceptionClaimResult {
  if (!isEligible || state.legendaryWonderTacticalEffects?.interceptionClaimTurnByCiv[civId] === state.turn) {
    return { state, multiplier: 1 };
  }
  const effects = getCompletedLegendaryWonderTacticalEffects(state, civId, definitions)
    .filter((effect): effect is Extract<LegendaryWonderTacticalEffect, { kind: 'first-owner-turn-interception-modifier' }> =>
      effect.kind === 'first-owner-turn-interception-modifier');
  if (effects.length === 0) return { state, multiplier: 1 };
  const multiplier = Math.max(...effects.map(effect => effect.multiplier));
  const tacticalState = state.legendaryWonderTacticalEffects ?? {
    trainingGrantsByCiv: {},
    interceptionClaimTurnByCiv: {},
  };
  return {
    state: {
      ...state,
      legendaryWonderTacticalEffects: {
        ...tacticalState,
        interceptionClaimTurnByCiv: {
          ...tacticalState.interceptionClaimTurnByCiv,
          [civId]: state.turn,
        },
      },
    },
    multiplier,
  };
}
