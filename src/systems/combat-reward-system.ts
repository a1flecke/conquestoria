import type { CombatResult, CombatRewardNotification, GameState, Unit, UnitType } from '@/core/types';
import { cleanupDeadSpyUnit } from '@/systems/espionage-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { applyQuestGameplayAction, type ChainTransition } from '@/systems/quest-chain-system';
import { canCaptureDefeatedUnits, canReceiveCivilizationCombatRewards, CRISIS_FORCE_OWNER, isMajorCivOwner, isPirateOwner } from '@/core/owner-kind';
import { awardGeneralProgress, GENERAL_PROGRESS_AWARDS, GENERAL_PROGRESS_XP_RATIO, STRONGER_FORCE_MARGIN, describeGeneralCareerEnd } from '@/systems/great-general-system';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { consumeLastStandHoldFormationWide } from '@/systems/great-general-abilities';
import { recordHuntKillerIfApplicable } from '@/systems/hunt-crisis-linkage';
import {
  breakPirateTributeOnAttack,
  destroyPirateFaction,
  type PirateActionEvent,
} from '@/systems/pirate-actions';
import { recordMilitaryAttack } from './diplomacy-system';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { resolveBoundedSplash } from '@/systems/combat-system';
import { recordCampPressureFromCombatOutcome } from '@/systems/barbarian-pressure';
import { normalizeCrisisForces } from '@/systems/crisis-force-system';
import { resolveRogueElephantHostHandlerDeaths } from '@/systems/rogue-elephant-host-system';
import { hexKey } from '@/systems/hex-utils';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { appendLegendaryWonderMilitaryFacts } from '@/systems/legendary-wonder-history';
import { getFortificationTier } from '@/systems/fortification-system';

/** Age-of-Sail through ironclad — boarding-action flavor. Everything else
 * (destroyer onward) uses modern "disabled and captured" phrasing. Same
 * underlying mechanic at every era — this only changes notification text. */
const PRE_INDUSTRIAL_NAVAL_TYPES: readonly UnitType[] = [
  'galley', 'trireme', 'frigate', 'ironclad',
  'pirate_galley', 'pirate_corsair', 'pirate_frigate',
];

const SUBMARINE_TYPES: ReadonlySet<UnitType> = new Set(['submarine', 'missile_submarine']);

/**
 * Reveal-on-fire (#542): a concealed submarine's ranged attack profile means it can
 * fire without ever becoming adjacent to a detector, unlike beast/forest concealment
 * (both melee-range). This is the ONE place that sets revealedThisTurn -- both the
 * human path (player-action-controller.ts) and the AI path (ai-major-turn.ts) call
 * applyCombatOutcomeToState, so setting it here (not per-caller) satisfies
 * end-to-end-wiring.md's "Shared State Mutations must be actor-complete" rule.
 */
function submarineRevealPatch(type: UnitType): { revealedThisTurn: true } | Record<string, never> {
  return SUBMARINE_TYPES.has(type) ? { revealedThisTurn: true } : {};
}

export function isCapturableNavalMilitary(type: UnitType): boolean {
  if (type === 'beast_sea_serpent') return false;
  const classes = UNIT_CLASS_BY_TYPE[type];
  return classes.includes('naval') && !classes.includes('civilian');
}

export function meetsCaptureMargin(loserStrength: number, winnerStrength: number, winnerHealthAfter: number): boolean {
  return loserStrength <= winnerStrength * 0.5 && winnerHealthAfter >= 50;
}

// A deep-sea-flotilla pirate faction's flagship must never be captured: destroyPirateFaction
// (called later in applyCombatOutcomeToState when the flagship is actually destroyed) removes
// every ship in the faction, including the flagship, from state.units — capturing the flagship
// here and then having that cleanup delete it out from under the new owner would silently
// undo the capture. Faction-destruction-on-capture is a separate, unscoped feature; until it
// exists, flagships are always destroyed on defeat, never captured.
function isPirateFlagship(state: GameState, unit: Unit): boolean {
  const faction = state.pirates?.factions[unit.owner];
  return faction?.headquarters.kind === 'deep-sea-flotilla' && faction.headquarters.flagshipUnitId === unit.id;
}

export function getCaptureNotificationLabel(type: UnitType): string {
  const name = UNIT_DEFINITIONS[type].name;
  if (type === 'settler') return 'Settler captured — converted to Worker';
  if (isCapturableNavalMilitary(type)) {
    return PRE_INDUSTRIAL_NAVAL_TYPES.includes(type)
      ? `${name} boarded — prize crew aboard!`
      : `${name} disabled and captured!`;
  }
  return `${name} captured!`;
}

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
    // Crisis-force removals settle through their own bounded resolution reward;
    // never layer generic kill loot on top of a Stampede or Rogue Host outcome.
    if (isPirateOwner(attackerBefore.owner) || defenderBefore.owner === CRISIS_FORCE_OWNER) return rewards;
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
    if (isPirateOwner(defenderBefore.owner) || attackerBefore.owner === CRISIS_FORCE_OWNER) return rewards;
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

/**
 * #544 MR4 contract §20/§27: the canonical Last Stand Hold-save check,
 * shared by all three lethal-resolution sites in this function (attacker
 * branch, defender branch, splash loop) so "one canonical resolution hook"
 * is literally true rather than three hand-rolled copies. Mirrors
 * geneTherapyReady's existing shape: check flag (and expiry) -> survive at
 * 1 HP -> consume. The one difference from geneTherapyReady is that
 * consumption is formation-wide, not just on the saved unit itself.
 */
function checkLastStandHold(unitBefore: Unit, currentTurn: number): boolean {
  const hold = unitBefore.lastStandHold;
  return hold !== undefined && currentTurn <= hold.expiresTurn;
}

// #544 MR7: contract §20 says the Hold save "does not protect explicit
// self-sacrifice/self-destruct costs" -- item 77 of the required scenario
// matrix. As of MR7's audit, no self-destruct or self-sacrifice unit
// mechanic exists anywhere in this codebase, so this distinction is
// currently vacuous: every call site above (attacker branch, defender
// branch, splash loop) only ever reaches an *involuntary* lethal outcome. If
// a future mechanic adds a voluntary self-sacrifice/self-destruct cost,
// route it around checkLastStandHold explicitly -- don't assume this gap was
// an oversight just because nothing here currently excludes it.

/**
 * #544 MR3: "if escort is destroyed, General dies too. No escape" (contract
 * §15). A General may share a tile with exactly one friendly combat unit;
 * when that unit is destroyed (by direct combat or splash), any co-located
 * friendly great_general goes down with it. Transport-destroyed-kills-
 * General is handled separately and automatically: a General loaded as
 * transport cargo has its id in the transport's cargoUnitIds, which
 * removeUnitFromCopies already cascades on transport destruction — no
 * extra call needed for that case.
 */
function destroyEscortedGeneralAtPosition(
  units: Record<string, Unit>,
  civilizations: GameState['civilizations'],
  espionage: NonNullable<GameState['espionage']> | undefined,
  position: Unit['position'],
  ownerId: string,
): { units: Record<string, Unit>; civilizations: GameState['civilizations']; espionage: NonNullable<GameState['espionage']> | undefined } {
  const general = Object.values(units).find(
    u => u.type === 'great_general' && u.owner === ownerId && hexKey(u.position) === hexKey(position),
  );
  if (!general) return { units, civilizations, espionage };
  return removeUnitFromCopies(units, civilizations, espionage, general.id);
}

/**
 * #544 MR3: records diedTurn on any great_general whose id existed in
 * `beforeUnits` but is gone from `state.units` by the time this state is
 * final — a single generic pass that catches every removal path uniformly
 * (escort cascade above, transport-cargo cascade, or a direct kill),
 * instead of bespoke bookkeeping at each call site.
 */
function recordGeneralDeaths(beforeUnits: Record<string, Unit>, state: GameState): GameState {
  const deadGenerals = Object.values(beforeUnits).filter(
    u => u.type === 'great_general' && !state.units[u.id],
  );
  if (deadGenerals.length === 0) return state;

  let civilizations = state.civilizations;
  for (const general of deadGenerals) {
    const civ = civilizations[general.owner];
    if (!civ?.generalHistory) continue;
    const definition = resolveGeneralDefinition(state, general.generalDefinitionId);
    civilizations = {
      ...civilizations,
      [general.owner]: {
        ...civ,
        generalHistory: civ.generalHistory.map(entry =>
          entry.unitId === general.id
            ? {
                ...entry,
                diedTurn: state.turn,
                outcome: 'died' as const,
                endOfCareerLine: definition ? describeGeneralCareerEnd(definition, 'died') : undefined,
                heroicCommandsUsed: general.generalCommandChargesUsed ?? 0,
              }
            : entry,
        ),
      },
    };
  }
  return { ...state, civilizations };
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
  const defeatedUnitIds = new Set<string>();

  if (result.attackerSurvived) {
    units[result.attackerId] = {
      ...attackerBefore,
      health: Math.max(1, attackerBefore.health - result.attackerDamage),
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
      ...submarineRevealPatch(attackerBefore.type),
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
      ...submarineRevealPatch(attackerBefore.type),
    };
    attackerActuallyDefeated = false;
  } else if (checkLastStandHold(attackerBefore, state.turn)) {
    // #544 MR4: Last Stand Hold save. Placement note: this branch runs
    // before civilian-capture and naval-prize-capture below, so a defeated
    // unit that would otherwise be *captured* by the enemy instead survives
    // at 1 HP under its own original owner if it also holds an unexpired
    // Last Stand -- the Hold save wins over capture. Deliberate: a captured
    // unit doesn't die, but losing it to the enemy is arguably worse for the
    // player than surviving battered but still theirs.
    units[result.attackerId] = {
      ...attackerBefore,
      health: 1,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
      ...submarineRevealPatch(attackerBefore.type),
    };
    units = consumeLastStandHoldFormationWide(units, attackerBefore.lastStandHold!.formationId);
    attackerActuallyDefeated = false;
  } else if (
    UNIT_CLASS_BY_TYPE[attackerBefore.type].includes('civilian')
    && !attackerBefore.cargoUnitIds?.length
    && canCaptureDefeatedUnits(defenderBefore.owner)
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
  } else if (
    result.defenderSurvived
    && isCapturableNavalMilitary(attackerBefore.type)
    && !isPirateFlagship(state, attackerBefore)
    && !attackerBefore.cargoUnitIds?.length
    // Prize crew moves the ship between two civilizations[] rosters (unlike civilian
    // capture, naval military ships can legitimately be pirate-owned on either side —
    // e.g. a player's frigate vs. a pirate_frigate — so both the old and new owner must
    // be confirmed major civs, not just the new one).
    && canCaptureDefeatedUnits(attackerBefore.owner)
    && canCaptureDefeatedUnits(defenderBefore.owner)
    && meetsCaptureMargin(result.attackerStrength, result.defenderStrength, Math.max(1, defenderBefore.health - result.defenderDamage))
  ) {
    // Prize crew: a decisive naval defeat captures the hull instead of sinking it.
    units[result.attackerId] = { ...attackerBefore, owner: defenderBefore.owner };
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
    defeatedUnitIds.add(result.attackerId);
    const removed = removeUnitFromCopies(units, civilizations, espionage, result.attackerId);
    units = removed.units;
    civilizations = removed.civilizations;
    espionage = removed.espionage;
    const escortCascade = destroyEscortedGeneralAtPosition(units, civilizations, espionage, attackerBefore.position, attackerBefore.owner);
    units = escortCascade.units;
    civilizations = escortCascade.civilizations;
    espionage = escortCascade.espionage;
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
  } else if (checkLastStandHold(defenderBefore, state.turn)) {
    // #544 MR4: Last Stand Hold save, defender side -- exact mirror of the
    // attacker branch above.
    units[result.defenderId] = {
      ...defenderBefore,
      health: 1,
      movementPointsLeft: 0,
      hasMoved: true,
      hasActed: true,
    };
    units = consumeLastStandHoldFormationWide(units, defenderBefore.lastStandHold!.formationId);
    defenderActuallyDefeated = false;
  } else if (
    UNIT_CLASS_BY_TYPE[defenderBefore.type].includes('civilian')
    && !defenderBefore.cargoUnitIds?.length
    && canCaptureDefeatedUnits(attackerBefore.owner)
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
  } else if (
    result.attackerSurvived
    && isCapturableNavalMilitary(defenderBefore.type)
    && !isPirateFlagship(state, defenderBefore)
    && !defenderBefore.cargoUnitIds?.length
    // Mirror of the attacker-side branch above — both old and new owner must be major civs.
    && canCaptureDefeatedUnits(attackerBefore.owner)
    && canCaptureDefeatedUnits(defenderBefore.owner)
    && meetsCaptureMargin(result.defenderStrength, result.attackerStrength, Math.max(1, attackerBefore.health - result.attackerDamage))
  ) {
    // Prize crew: mirror of the attacker-side branch above.
    units[result.defenderId] = { ...defenderBefore, owner: attackerBefore.owner };
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
    defeatedUnitIds.add(result.defenderId);
    const removed = removeUnitFromCopies(units, civilizations, espionage, result.defenderId);
    units = removed.units;
    civilizations = removed.civilizations;
    espionage = removed.espionage;
    const escortCascade = destroyEscortedGeneralAtPosition(units, civilizations, espionage, defenderBefore.position, defenderBefore.owner);
    units = escortCascade.units;
    civilizations = escortCascade.civilizations;
    espionage = escortCascade.espionage;
  }

  const splashHits = result.splashHits ?? resolveBoundedSplash(state, attackerBefore, defenderBefore, result.defenderDamage);
  for (const hit of splashHits) {
    const target = units[hit.unitId];
    if (!target || hit.damage <= 0) continue;
    if (target.health > hit.damage) {
      units[hit.unitId] = { ...target, health: target.health - hit.damage };
      continue;
    }
    // #544 MR4 contract §27: Last Stand protects against "bombardment" --
    // splash is this codebase's bombardment-adjacent lethal-damage path, so
    // it must honor the hold too, even though geneTherapyReady historically
    // never did (that's a separate, pre-existing gap, not extended here).
    if (checkLastStandHold(target, state.turn)) {
      units[hit.unitId] = { ...target, health: 1 };
      units = consumeLastStandHoldFormationWide(units, target.lastStandHold!.formationId);
      continue;
    }
    defeatedUnitIds.add(hit.unitId);
    const removed = removeUnitFromCopies(units, civilizations, espionage, hit.unitId);
    units = removed.units;
    civilizations = removed.civilizations;
    espionage = removed.espionage;
    const escortCascade = destroyEscortedGeneralAtPosition(units, civilizations, espionage, target.position, target.owner);
    units = escortCascade.units;
    civilizations = escortCascade.civilizations;
    espionage = escortCascade.espionage;
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
    if (rewardedCiv) {
      // #544 MR3: Great General progress -- a small fixed ratio of the unit's
      // own veterancy XP gain (already scaled down for weak/beast/barbarian
      // targets by calculateDefeatReward, so trivial kills barely move the
      // needle), plus a bounded stronger-force-victory bonus when the
      // defeated unit belonged to another MAJOR civ and was materially
      // stronger. Barbarian/pirate/beast/crisis/minor-civ kills never earn
      // the stronger-force bonus (none of those concepts meaningfully apply
      // to a barbarian camp raid), but still earn the ordinary XP-ratio
      // progress like any other kill.
      const isDefeatedAttacker = reward.defeatedUnitId === attackerBefore.id;
      const defeatedOwner = isDefeatedAttacker ? attackerBefore.owner : defenderBefore.owner;
      const defeatedStrength = isDefeatedAttacker ? result.attackerStrength : result.defenderStrength;
      const victorStrength = isDefeatedAttacker ? result.defenderStrength : result.attackerStrength;
      let generalProgressPoints = Math.round(reward.experienceAwarded * GENERAL_PROGRESS_XP_RATIO);
      if (isMajorCivOwner(defeatedOwner) && victorStrength > 0 && defeatedStrength >= victorStrength * STRONGER_FORCE_MARGIN) {
        generalProgressPoints += GENERAL_PROGRESS_AWARDS.strongerForceVictory;
      }
      civilizations = {
        ...civilizations,
        [reward.recipientCivId]: {
          ...rewardedCiv,
          gold: rewardedCiv.gold + reward.goldAwarded,
          generalProgress: awardGeneralProgress(rewardedCiv, generalProgressPoints),
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

  // #582: any carrier-family hull, not just plain 'carrier' -- a destroyed
  // Supercarrier must also lose (or evacuate) its based aircraft, or they
  // become zombie units referencing a dead airBase.
  if (attackerActuallyDefeated && UNIT_DEFINITIONS[attackerBefore.type].carrierDeckCapacity != null) {
    nextState = destroyCarrierBasedAircraft(nextState, attackerBefore.id);
  }
  if (defenderActuallyDefeated && UNIT_DEFINITIONS[defenderBefore.type].carrierDeckCapacity != null) {
    nextState = destroyCarrierBasedAircraft(nextState, defenderBefore.id);
  }
  // Resolve command breaks before force normalization removes the dead Handler
  // from its force membership; the recorded death ids are the canonical trigger.
  nextState = normalizeCrisisForces(resolveRogueElephantHostHandlerDeaths(
    recordCampPressureFromCombatOutcome(nextState, attackerBefore, defenderBefore),
    defeatedUnitIds,
  ));
  nextState = recordGeneralDeaths(state.units, nextState);
  const militaryFacts = [];
  if ((defenderActuallyDefeated || defenderCaptured)
    && nextState.units[attackerBefore.id]
    && (UNIT_DEFINITIONS[defenderBefore.type]?.strength ?? 0) > 0) {
    const role = getUnitRoleDefinition(attackerBefore.type)?.primaryRole;
    if (role && (UNIT_DEFINITIONS[attackerBefore.type]?.strength ?? 0) > 0) {
      militaryFacts.push({
        id: `combat-win:${state.turn}:${attackerBefore.id}:${defenderBefore.id}:${attackerBefore.id}`,
        kind: 'surviving-combat-win' as const,
        civId: attackerBefore.owner,
        unitId: attackerBefore.id,
        role,
        turn: state.turn,
      });
    }
  }
  if ((attackerActuallyDefeated || attackerCaptured)
    && nextState.units[defenderBefore.id]
    && (UNIT_DEFINITIONS[attackerBefore.type]?.strength ?? 0) > 0) {
    const role = getUnitRoleDefinition(defenderBefore.type)?.primaryRole;
    if (role && (UNIT_DEFINITIONS[defenderBefore.type]?.strength ?? 0) > 0) {
      militaryFacts.push({
        id: `combat-win:${state.turn}:${attackerBefore.id}:${defenderBefore.id}:${defenderBefore.id}`,
        kind: 'surviving-combat-win' as const,
        civId: defenderBefore.owner,
        unitId: defenderBefore.id,
        role,
        turn: state.turn,
      });
    }
    const tile = state.map?.tiles?.[hexKey(defenderBefore.position)];
    if (
      attackerActuallyDefeated
      &&
      tile?.improvement === 'fort'
      && tile.improvementTurnsLeft === 0
      && tile.owner === defenderBefore.owner
      && (UNIT_DEFINITIONS[defenderBefore.type]?.strength ?? 0) > 0
    ) {
      militaryFacts.push({
        id: `fortification-repel:${state.turn}:${attackerBefore.id}:${defenderBefore.id}:${defenderBefore.id}`,
        kind: 'fortification-repel' as const,
        civId: defenderBefore.owner,
        unitId: defenderBefore.id,
        tier: getFortificationTier(state.civilizations[defenderBefore.owner]?.techState.completed ?? []).id,
        turn: state.turn,
      });
    }
  }
  nextState = appendLegendaryWonderMilitaryFacts(nextState, militaryFacts);

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
