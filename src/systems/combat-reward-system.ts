import type { CombatResult, CombatRewardNotification, GameState, Unit } from '@/core/types';
import { cleanupDeadSpyUnit } from '@/systems/espionage-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { applyQuestGameplayAction, type ChainTransition } from '@/systems/quest-chain-system';
import { canReceiveCivilizationCombatRewards, isMajorCivOwner, isPirateOwner } from '@/core/owner-kind';
import { recordHuntKillerIfApplicable } from '@/systems/hunt-crisis-linkage';
import {
  breakPirateTributeOnAttack,
  destroyPirateFaction,
  type PirateActionEvent,
} from '@/systems/pirate-actions';
import { recordMilitaryAttack } from './diplomacy-system';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';

export type VeterancyTierId = 'recruit' | 'seasoned' | 'veteran' | 'elite';

export interface VeterancyTier {
  id: VeterancyTierId;
  label: string;
  minExperience: number;
  combatModifier: number;
}

export interface CombatRewardSurprise {
  type: 'battlefield_insight' | 'salvaged_supplies';
  label: string;
  experienceAwarded: number;
  goldAwarded: number;
}

export interface CombatReward extends CombatRewardNotification {}

export interface DefeatRewardInput {
  victor: Unit;
  defeated: Unit;
  seed: number;
  victorHealthAfterCombat?: number;
}

export interface DefeatRewardResult {
  experienceAwarded: number;
  healthRestored: number;
  goldAwarded: number;
  surprise: CombatRewardSurprise | null;
}

export interface CombatOutcomeApplication {
  state: GameState;
  rewards: CombatReward[];
  attackerDefeated: boolean;
  defenderDefeated: boolean;
  attackerCaptured: boolean;
  defenderCaptured: boolean;
  questTransitions: ChainTransition[];
  pirateEvents: PirateActionEvent[];
}

export const VETERANCY_TIERS: VeterancyTier[] = [
  { id: 'recruit', label: 'Recruit', minExperience: 0, combatModifier: 0 },
  { id: 'seasoned', label: 'Seasoned', minExperience: 10, combatModifier: 0.05 },
  { id: 'veteran', label: 'Veteran', minExperience: 25, combatModifier: 0.1 },
  { id: 'elite', label: 'Elite', minExperience: 50, combatModifier: 0.15 },
];

function normalizedExperience(unit: Pick<Unit, 'experience'>): number {
  return Math.max(0, unit.experience ?? 0);
}

function seededRoll(seed: number, victorId: string, defeatedId: string): number {
  let state = Math.abs(seed);
  for (const char of `${victorId}:${defeatedId}`) {
    state = (state * 48271 + char.charCodeAt(0)) % 2147483647;
  }
  state = (state * 48271) % 2147483647;
  return state / 2147483647;
}

export function getVeterancyTierForExperience(experience: number): VeterancyTier {
  const xp = Math.max(0, experience);
  return [...VETERANCY_TIERS].reverse().find(tier => xp >= tier.minExperience) ?? VETERANCY_TIERS[0];
}

export function getVeterancyTier(unit: Pick<Unit, 'experience'>): VeterancyTier {
  return getVeterancyTierForExperience(normalizedExperience(unit));
}

export function getVeterancyCombatModifier(unit: Pick<Unit, 'experience'>): number {
  return getVeterancyTier(unit).combatModifier;
}

export function getExperienceToNextTier(unit: Pick<Unit, 'experience'>): number | null {
  const xp = normalizedExperience(unit);
  const next = VETERANCY_TIERS.find(tier => tier.minExperience > xp);
  return next ? next.minExperience - xp : null;
}

export function calculateDefeatReward(input: DefeatRewardInput): DefeatRewardResult {
  const defeatedStrength = UNIT_DEFINITIONS[input.defeated.type]?.strength ?? 0;
  const defeatedCanFight = defeatedStrength > 0;
  const baseExperience = defeatedCanFight ? Math.max(8, Math.round(defeatedStrength * 0.8)) : 3;
  const victorHealth = Math.max(0, input.victorHealthAfterCombat ?? input.victor.health);
  const baseHealth = Math.min(100 - victorHealth, defeatedCanFight ? 8 : 3);
  const canReceiveGold = canReceiveCivilizationCombatRewards(input.victor.owner);
  const defeatedIsHorde = input.defeated.owner === 'barbarian' || input.defeated.owner === 'rebels';
  const baseGold = canReceiveGold
    ? (input.defeated.owner === 'beasts' ? 0 : (defeatedCanFight ? (defeatedIsHorde ? 8 : 4) : 1))
    : 0;
  const roll = seededRoll(input.seed, input.victor.id, input.defeated.id);

  let surprise: CombatRewardSurprise | null = null;
  if (defeatedCanFight && roll < 0.2) {
    surprise = {
      type: 'battlefield_insight',
      label: 'Battlefield Insight',
      experienceAwarded: 4,
      goldAwarded: 0,
    };
  } else if (defeatedCanFight && canReceiveGold && roll < 0.4) {
    surprise = {
      type: 'salvaged_supplies',
      label: 'Salvaged Supplies',
      experienceAwarded: 0,
      goldAwarded: 5,
    };
  }

  return {
    experienceAwarded: baseExperience + (surprise?.experienceAwarded ?? 0),
    healthRestored: baseHealth,
    goldAwarded: baseGold + (surprise?.goldAwarded ?? 0),
    surprise,
  };
}

export function formatCombatRewardMessage(reward: CombatReward): string {
  const parts = [`+${reward.experienceAwarded} XP`];
  if (reward.healthRestored > 0) parts.push(`+${reward.healthRestored} HP`);
  if (reward.goldAwarded > 0) parts.push(`+${reward.goldAwarded} gold`);
  if (reward.surprise) parts.push(reward.surprise.label);
  return `Combat reward: ${parts.join(', ')}`;
}

export function collectCombatRewards(
  result: CombatResult,
  attackerBefore: Unit,
  defenderBefore: Unit,
  seed: number,
): CombatReward[] {
  const rewards: CombatReward[] = [];
  if (!result.defenderSurvived && result.attackerSurvived) {
    if (isPirateOwner(attackerBefore.owner)) return rewards;
    const victorHealthAfterCombat = Math.max(1, attackerBefore.health - result.attackerDamage);
    const values = calculateDefeatReward({ victor: attackerBefore, defeated: defenderBefore, seed, victorHealthAfterCombat });
    const reward = {
      recipientUnitId: attackerBefore.id,
      recipientCivId: attackerBefore.owner,
      defeatedUnitId: defenderBefore.id,
      ...values,
      message: '',
    };
    rewards.push({ ...reward, message: formatCombatRewardMessage(reward) });
  }
  if (!result.attackerSurvived && result.defenderSurvived) {
    if (isPirateOwner(defenderBefore.owner)) return rewards;
    const victorHealthAfterCombat = Math.max(1, defenderBefore.health - result.defenderDamage);
    const values = calculateDefeatReward({ victor: defenderBefore, defeated: attackerBefore, seed, victorHealthAfterCombat });
    const reward = {
      recipientUnitId: defenderBefore.id,
      recipientCivId: defenderBefore.owner,
      defeatedUnitId: attackerBefore.id,
      ...values,
      message: '',
    };
    rewards.push({ ...reward, message: formatCombatRewardMessage(reward) });
  }
  return rewards;
}

function removeUnitFromCopies(
  units: Record<string, Unit>,
  civilizations: GameState['civilizations'],
  espionage: NonNullable<GameState['espionage']> | undefined,
  unitId: string,
): {
  units: Record<string, Unit>;
  civilizations: GameState['civilizations'];
  espionage: NonNullable<GameState['espionage']> | undefined;
} {
  const removed = units[unitId];
  if (!removed) return { units, civilizations, espionage };
  const removedIds = new Set([unitId, ...(removed.cargoUnitIds ?? [])]);
  const remainingUnits: Record<string, Unit> = {};
  for (const [candidateId, candidate] of Object.entries(units)) {
    if (removedIds.has(candidateId)) continue;
    if (candidate.transportId === unitId) continue;
    if (removed.transportId && candidateId === removed.transportId) {
      remainingUnits[candidateId] = {
        ...candidate,
        cargoUnitIds: (candidate.cargoUnitIds ?? []).filter(cargoUnitId => cargoUnitId !== unitId),
      };
    } else {
      remainingUnits[candidateId] = candidate;
    }
  }

  let nextCivilizations = { ...civilizations };
  let nextEspionage = espionage;

  for (const [civId, civ] of Object.entries(civilizations)) {
    nextCivilizations = {
      ...nextCivilizations,
      [civId]: {
        ...civ,
        units: civ.units.filter(id => !removedIds.has(id)),
      },
    };
  }

  for (const removedId of removedIds) {
    const removedUnit = units[removedId];
    if (removedUnit) {
      nextEspionage = nextEspionage ? cleanupDeadSpyUnit(nextEspionage, removedUnit.owner, removedId) : nextEspionage;
    }
  }

  return { units: remainingUnits, civilizations: nextCivilizations, espionage: nextEspionage };
}

export function applyCombatOutcomeToState(
  state: GameState,
  result: CombatResult,
  seed: number,
): CombatOutcomeApplication {
  const attackerBefore = state.units[result.attackerId];
  const defenderBefore = state.units[result.defenderId];
  if (!attackerBefore || !defenderBefore) {
    return { state, rewards: [], attackerDefeated: false, defenderDefeated: false, attackerCaptured: false, defenderCaptured: false, questTransitions: [], pirateEvents: [] };
  }

  let units = { ...state.units };
  let civilizations = { ...state.civilizations };
  let minorCivs = { ...state.minorCivs };
  let espionage = state.espionage ? { ...state.espionage } : state.espionage;

  const defenderCiv = civilizations[defenderBefore.owner];
  if (
    attackerBefore.owner !== defenderBefore.owner
    && civilizations[attackerBefore.owner]
    && defenderCiv?.diplomacy
  ) {
    civilizations[defenderBefore.owner] = {
      ...defenderCiv,
      diplomacy: recordMilitaryAttack(
        defenderCiv.diplomacy,
        attackerBefore.owner,
        state.turn,
      ),
    };
  }
  const defenderMinor = minorCivs[defenderBefore.owner];
  if (attackerBefore.owner !== defenderBefore.owner && defenderMinor?.diplomacy) {
    minorCivs[defenderBefore.owner] = {
      ...defenderMinor,
      diplomacy: recordMilitaryAttack(
        defenderMinor.diplomacy,
        attackerBefore.owner,
        state.turn,
      ),
    };
  }

  let attackerActuallyDefeated = !result.attackerSurvived;
  let defenderActuallyDefeated = !result.defenderSurvived;
  let attackerCaptured = false;
  let defenderCaptured = false;

  if (result.attackerSurvived) {
    units[result.attackerId] = {
      ...attackerBefore,
      health: Math.max(1, attackerBefore.health - result.attackerDamage),
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
    };
  } else if (attackerBefore.geneTherapyReady === true) {
    // Gene therapy: survive lethal hit at 1 HP, enter cooldown
    units[result.attackerId] = {
      ...attackerBefore,
      health: 1,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
      geneTherapyReady: false,
    };
    attackerActuallyDefeated = false;
  } else if (
    UNIT_CLASS_BY_TYPE[attackerBefore.type].includes('civilian')
    && !attackerBefore.cargoUnitIds?.length
    && isMajorCivOwner(defenderBefore.owner)
  ) {
    // Civilian capture: transfer ownership instead of destroying. Covers cyber_unit
    // (already tagged 'civilian') and every other civilian type uniformly — settler
    // downgrades to worker so a captured settler can't hand the capturing civ a free
    // city-founding unit. No other field resets: health/hasActed/movementPointsLeft
    // carry over exactly as they were, matching this branch's pre-existing behavior.
    // The capturing side (defenderBefore.owner here) must be a major civ: barbarians,
    // pirates, and minor civs are not keys in state.civilizations (they track units in
    // state.minorCivs / state.pirates instead), so writing civilizations[owner] = {
    // ...undefined, units: [...] } for one of them would inject a malformed partial civ
    // object that crashes the next code to iterate Object.values(state.civilizations)
    // expecting complete civs. Barbarians/pirates/minor civs still destroy civilians,
    // same as before this feature.
    // A transport/carrier currently loaded with cargo is excluded — capturing a
    // civilian ship is out of scope for what happens to enemy troops riding along,
    // so a loaded transport still falls through to the destroy branch below, which
    // already cascades cargo cleanup correctly.
    const capturedType = attackerBefore.type === 'settler' ? 'worker' : attackerBefore.type;
    units[result.attackerId] = { ...attackerBefore, type: capturedType, owner: defenderBefore.owner };
    civilizations = {
      ...civilizations,
      [attackerBefore.owner]: {
        ...civilizations[attackerBefore.owner],
        units: (civilizations[attackerBefore.owner]?.units ?? []).filter(id => id !== result.attackerId),
      },
      [defenderBefore.owner]: {
        ...civilizations[defenderBefore.owner],
        units: [...(civilizations[defenderBefore.owner]?.units ?? []), result.attackerId],
      },
    };
    attackerActuallyDefeated = false;
    attackerCaptured = true;
  } else {
    const removed = removeUnitFromCopies(units, civilizations, espionage, result.attackerId);
    units = removed.units;
    civilizations = removed.civilizations;
    espionage = removed.espionage;
  }

  if (result.defenderSurvived) {
    units[result.defenderId] = {
      ...defenderBefore,
      health: Math.max(1, defenderBefore.health - result.defenderDamage),
    };
  } else if (defenderBefore.geneTherapyReady === true) {
    // Gene therapy: survive lethal hit at 1 HP, enter cooldown
    units[result.defenderId] = {
      ...defenderBefore,
      health: 1,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
      geneTherapyReady: false,
    };
    defenderActuallyDefeated = false;
  } else if (
    UNIT_CLASS_BY_TYPE[defenderBefore.type].includes('civilian')
    && !defenderBefore.cargoUnitIds?.length
    && isMajorCivOwner(attackerBefore.owner)
  ) {
    // Civilian capture: mirror of the attacker-side branch above (same cargo exclusion,
    // same major-civ-only capturing-side requirement).
    const capturedType = defenderBefore.type === 'settler' ? 'worker' : defenderBefore.type;
    units[result.defenderId] = { ...defenderBefore, type: capturedType, owner: attackerBefore.owner };
    civilizations = {
      ...civilizations,
      [defenderBefore.owner]: {
        ...civilizations[defenderBefore.owner],
        units: (civilizations[defenderBefore.owner]?.units ?? []).filter(id => id !== result.defenderId),
      },
      [attackerBefore.owner]: {
        ...civilizations[attackerBefore.owner],
        units: [...(civilizations[attackerBefore.owner]?.units ?? []), result.defenderId],
      },
    };
    defenderActuallyDefeated = false;
    defenderCaptured = true;
  } else {
    const removed = removeUnitFromCopies(units, civilizations, espionage, result.defenderId);
    units = removed.units;
    civilizations = removed.civilizations;
    espionage = removed.espionage;
  }

  const rewards = collectCombatRewards(result, attackerBefore, defenderBefore, seed);
  for (const reward of rewards) {
    const rewardedUnit = units[reward.recipientUnitId];
    if (rewardedUnit) {
      units[reward.recipientUnitId] = {
        ...rewardedUnit,
        experience: normalizedExperience(rewardedUnit) + reward.experienceAwarded,
        health: Math.min(100, rewardedUnit.health + reward.healthRestored),
      };
    }

    const rewardedCiv = civilizations[reward.recipientCivId];
    if (rewardedCiv && reward.goldAwarded > 0) {
      civilizations = {
        ...civilizations,
        [reward.recipientCivId]: {
          ...rewardedCiv,
          gold: rewardedCiv.gold + reward.goldAwarded,
        },
      };
    }
  }

  let nextState: GameState = {
      ...state,
      units,
      civilizations,
      minorCivs,
      espionage,
  };
  const pirateEvents: PirateActionEvent[] = [];
  const defenderFaction = state.pirates?.factions[defenderBefore.owner];
  if (defenderFaction && canReceiveCivilizationCombatRewards(attackerBefore.owner)) {
    nextState = breakPirateTributeOnAttack(nextState, defenderFaction.id, attackerBefore.owner);
  }
  const questTransitions: ChainTransition[] = [];
  // A captured civilian is just as gone from the enemy's control as a destroyed one —
  // eligibleHostileUnits (quest-objective-system.ts) treats any hostile unit (civilians
  // included) as a valid defeat_units target, so quest progress must count capture too.
  if (defenderActuallyDefeated || defenderCaptured) {
    const progress = applyQuestGameplayAction(nextState, {
      type: 'unit_defeated', actorCivId: attackerBefore.owner, defeatedOwnerId: defenderBefore.owner,
      unitId: defenderBefore.id, position: defenderBefore.position, turn: state.turn,
    });
    nextState = progress.state;
    questTransitions.push(...progress.transitions);
  }
  if (attackerActuallyDefeated || attackerCaptured) {
    const progress = applyQuestGameplayAction(nextState, {
      type: 'unit_defeated', actorCivId: defenderBefore.owner, defeatedOwnerId: attackerBefore.owner,
      unitId: attackerBefore.id, position: attackerBefore.position, turn: state.turn,
    });
    nextState = progress.state;
    questTransitions.push(...progress.transitions);
  }

  if (
    defenderActuallyDefeated
    && defenderFaction?.headquarters.kind === 'deep-sea-flotilla'
    && defenderFaction.headquarters.flagshipUnitId === defenderBefore.id
  ) {
    const destruction = destroyPirateFaction(nextState, {
      factionId: defenderFaction.id,
      destroyedByOwnerId: attackerBefore.owner,
      reason: 'combat',
      position: defenderBefore.position,
    });
    nextState = destruction.state;
    pirateEvents.push(...destruction.events);
  }
  const attackerFaction = state.pirates?.factions[attackerBefore.owner];
  if (
    attackerActuallyDefeated
    && attackerFaction?.headquarters.kind === 'deep-sea-flotilla'
    && attackerFaction.headquarters.flagshipUnitId === attackerBefore.id
  ) {
    const destruction = destroyPirateFaction(nextState, {
      factionId: attackerFaction.id,
      destroyedByOwnerId: defenderBefore.owner,
      reason: 'combat',
      position: attackerBefore.position,
    });
    nextState = destruction.state;
    pirateEvents.push(...destruction.events);
  }

  if (defenderActuallyDefeated) {
    nextState = recordHuntKillerIfApplicable(nextState, defenderBefore.id, defenderBefore.owner, attackerBefore.owner);
  }
  if (attackerActuallyDefeated) {
    nextState = recordHuntKillerIfApplicable(nextState, attackerBefore.id, attackerBefore.owner, defenderBefore.owner);
  }

  if (attackerActuallyDefeated && attackerBefore.type === 'carrier') {
    nextState = destroyCarrierBasedAircraft(nextState, attackerBefore.id);
  }
  if (defenderActuallyDefeated && defenderBefore.type === 'carrier') {
    nextState = destroyCarrierBasedAircraft(nextState, defenderBefore.id);
  }

  return {
    state: nextState,
    rewards,
    attackerDefeated: attackerActuallyDefeated,
    defenderDefeated: defenderActuallyDefeated,
    attackerCaptured,
    defenderCaptured,
    questTransitions,
    pirateEvents,
  };
}

function destroyCarrierBasedAircraft(state: GameState, carrierId: string): GameState {
  const aircraftIds = new Set(Object.values(state.units)
    .filter(unit => unit.airBase?.kind === 'carrier' && unit.airBase.unitId === carrierId)
    .map(unit => unit.id));
  if (aircraftIds.size === 0) return state;
  return {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).filter(([unitId]) => !aircraftIds.has(unitId))),
    civilizations: Object.fromEntries(Object.entries(state.civilizations).map(([civId, civilization]) => [
      civId,
      { ...civilization, units: civilization.units.filter(unitId => !aircraftIds.has(unitId)) },
    ])),
  };
}
