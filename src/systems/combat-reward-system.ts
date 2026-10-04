import { lehmerFoldByCodePoint } from './deterministic-hash';
import type { EventBus } from '@/core/event-bus';
import type { CombatResult, CombatRewardNotification, GameState, Unit, UnitType } from '@/core/types';
import { emitEndedTradeRoutes, releaseCapturedUnitsFromRoutes, removeUnitsFromSlice, type EndedTradeRoute } from '@/systems/unit-removal-system';
import { applyCampDestructionAtTarget } from '@/systems/barbarian-system';
import { recordCombatForCiv } from '@/systems/threat-pressure-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { applyQuestGameplayAction, type ChainTransition } from '@/systems/quest-chain-system';
import { canCaptureDefeatedUnits, canReceiveCivilizationCombatRewards, CRISIS_FORCE_OWNER, isMajorCivOwner, isPirateOwner } from '@/core/owner-kind';
import { awardGeneralProgress, GENERAL_PROGRESS_AWARDS, GENERAL_PROGRESS_XP_RATIO, STRONGER_FORCE_MARGIN, describeGeneralCareerEnd } from '@/systems/great-general-system';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { consumeLastStandHoldFormationWide } from '@/systems/great-general-abilities';
import { appendGeneralCareerEvent, summarizeGeneralCareer } from '@/systems/great-general-career';
import type { GeneralCareerEventReason } from '@/core/types';
import { recordHuntKillerIfApplicable } from '@/systems/hunt-crisis-linkage';
import {
  breakPirateTributeOnAttack,
  destroyPirateFaction,
  type PirateActionEvent,
} from '@/systems/pirate-actions';
import { applyVassalageWarConsequences } from './diplomacy-system';
import { recordMilitaryAttack } from './diplomacy-war';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { resolveBoundedSplash } from '@/systems/combat-system';
import { recordCampPressureFromCombatOutcome } from '@/systems/barbarian-pressure';
import { normalizeCrisisForces } from '@/systems/crisis-force-system';
import { resolveRogueElephantHostHandlerDeaths } from '@/systems/rogue-elephant-host-system';
import { hexKey } from '@/systems/hex-utils';
import { recordBeastSlain, type BeastSlainPayload } from '@/systems/beast-system';
import { VETERANCY_TIERS, normalizedExperience, type VeterancyTier } from '@/systems/veterancy-tiers';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { appendLegendaryWonderMilitaryFacts } from '@/systems/legendary-wonder-history';
import { getFortificationTier } from '@/systems/fortification-system';
import {
  emitCivilizationLivenessTransitions,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';

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

// The table moved to a leaf (`veterancy-tiers.ts`, #1014) so `beast-system` can use it without
// importing this module; re-exported here so existing importers are unchanged.
export type { VeterancyTier, VeterancyTierId } from '@/systems/veterancy-tiers';
export { VETERANCY_TIERS } from '@/systems/veterancy-tiers';

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
  /**
   * Lairs whose last beast this fight destroyed (#1014). The state consequence is already
   * applied; a real executor emits `beast:slain` for each so every civ is told and the
   * slayer's ceremony/choice panel opens. Empty for a hypothetical (simulated) fight.
   */
  beastsSlain: BeastSlainPayload[];
  /**
   * The barbarian camp this fight's kill destroyed (#1200): a defender a major civ defeats on a camp tile
   * destroys the camp, whoever the executor is. Reward, quest progress and `barbarian:camp-destroyed` (bus
   * only) are applied here; a player-facing executor reads this for its toast and advisor.
   */
  campDestroyed?: { campId: string; reward: number };
}

function seededRoll(seed: number, victorId: string, defeatedId: string): number {
  let state = lehmerFoldByCodePoint(Math.abs(seed), `${victorId}:${defeatedId}`);
  state = (state * 48271) % 2147483647;
  return state / 2147483647;
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
 * transport cargo is part of the transport's removal closure
 * (`unit-removal-system.ts`) — no extra call needed for that case.
 */
function findEscortedGeneralId(
  units: Record<string, Unit>,
  position: Unit['position'],
  ownerId: string,
): string | undefined {
  return Object.values(units).find(
    u => u.type === 'great_general' && u.owner === ownerId && hexKey(u.position) === hexKey(position),
  )?.id;
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
                endOfCareerLine: definition
                  ? describeGeneralCareerEnd(definition, 'died', summarizeGeneralCareer(entry))
                  : undefined,
                heroicCommandsUsed: general.generalCommandChargesUsed ?? 0,
                // #887 MR1: terminal career event. Distinct from `retired` —
                // retireGeneralsAtTurnEnd skips a General whose unit is already
                // gone, so a killed General never also gets a `retired` event.
                careerEvents: [...(entry.careerEvents ?? []), { type: 'killed' as const, turn: state.turn }],
              }
            : entry,
        ),
      },
    };
  }
  return { ...state, civilizations };
}

/**
 * #887 MR1: transition-owned Great General career events for one combat —
 * `unit-saved` (from the clamp sites), `battle-influenced` and `city-defended`.
 * "Influenced" = an active issuer Last Stand hold on, or a same-turn Seize grant
 * to, the attacker or defender. Mere command-range proximity is NOT influence.
 * One `battle-influenced` per distinct General; `city-defended` only when the
 * defender's tile is an owned city, the defender survived and the attacker did
 * not. Reads pre-combat holds/markers from `preState`; appends onto `nextState`.
 */
function recordGeneralCareerCombatEvents(
  preState: GameState,
  result: CombatResult,
  saves: Array<{ unit: Unit; hold: NonNullable<Unit['lastStandHold']> }>,
  nextState: GameState,
): GameState {
  let out = nextState;
  const turn = preState.turn;

  // 1. unit-saved (one per actual Last Stand clamp this combat)
  for (const { unit, hold } of saves) {
    out = appendGeneralCareerEvent(out, unit.owner, hold.generalDefinitionId, {
      type: 'unit-saved',
      turn,
      via: 'last-stand',
      unitId: unit.id,
      unitType: unit.type,
      remainingHp: 1,
      location: { ...unit.position },
    });
  }

  // 2. gather influence per participant. A General only casts Last Stand / Seize
  // on its OWN civ's units, so the influencing General's owner is that unit's owner.
  const combatId = `${result.attackerId}:${result.defenderId}:${turn}`;
  const influence = new Map<string, { civId: string; reasons: Set<GeneralCareerEventReason> }>();
  const add = (generalId: string | undefined, civId: string, reason: GeneralCareerEventReason) => {
    if (!generalId) return;
    let e = influence.get(generalId);
    if (!e) { e = { civId, reasons: new Set() }; influence.set(generalId, e); }
    e.reasons.add(reason);
  };
  for (const id of [result.attackerId, result.defenderId]) {
    const u = preState.units[id];
    if (!u) continue;
    if (u.lastStandHold && turn <= u.lastStandHold.expiresTurn) add(u.lastStandHold.generalDefinitionId, u.owner, 'last-stand');
    if (u.seizeGrantedBy && u.seizeGrantedBy.turn === turn) add(u.seizeGrantedBy.generalDefinitionId, u.owner, 'seize');
  }
  if (influence.size === 0) return out;

  // 3. battle-influenced — one per distinct General
  const location = { ...result.defenderPosition };
  for (const [generalId, { civId, reasons }] of influence) {
    out = appendGeneralCareerEvent(out, civId, generalId, {
      type: 'battle-influenced', turn, combatId, reasons: [...reasons].sort(), location,
    });
  }

  // 4. city-defended — the defender's tile is a city owned by the defender, the
  // defender still exists and the attacker does not.
  const cityAtTile = Object.values(preState.cities)
    .find(c => hexKey(c.position) === hexKey(result.defenderPosition));
  const defenderOwner = preState.units[result.defenderId]?.owner;
  if (
    cityAtTile && defenderOwner && cityAtTile.owner === defenderOwner
    && out.units[result.defenderId] && !out.units[result.attackerId]
  ) {
    for (const [generalId, { civId }] of influence) {
      out = appendGeneralCareerEvent(out, civId, generalId, {
        type: 'city-defended', turn, cityId: cityAtTile.id, cityName: cityAtTile.name,
      });
    }
  }
  return out;
}

export function applyCombatOutcomeToState(
  state: GameState,
  result: CombatResult,
  seed: number,
  bus?: EventBus,
): CombatOutcomeApplication {
  const attackerBefore = state.units[result.attackerId];
  const defenderBefore = state.units[result.defenderId];
  if (!attackerBefore || !defenderBefore) {
    return { state, rewards: [], attackerDefeated: false, defenderDefeated: false, attackerCaptured: false, defenderCaptured: false, questTransitions: [], pirateEvents: [], beastsSlain: [] };
  }

  let units = { ...state.units };
  let civilizations = { ...state.civilizations };
  let minorCivs = { ...state.minorCivs };
  let espionage = state.espionage ? { ...state.espionage } : state.espionage;
  let marketplace = state.marketplace;
  const endedRoutes: EndedTradeRoute[] = [];
  // #1198: every kill in this fight leaves through the one canonical removal, applied to the working copies.
  const removeFromWorkingCopies = (unitIds: readonly string[]): void => {
    const removal = removeUnitsFromSlice({ units, civilizations, minorCivs, espionage, marketplace }, unitIds, 'destroyed');
    ({ units, civilizations, minorCivs, espionage, marketplace } = removal.slice);
    endedRoutes.push(...removal.endedRoutes);
  };
  const releaseCaptured = (unitId: string): void => {
    const release = releaseCapturedUnitsFromRoutes({ units, civilizations, minorCivs, espionage, marketplace }, [unitId]);
    ({ units, marketplace } = release.slice);
    endedRoutes.push(...release.endedRoutes);
  };
  const destroyUnitAndEscort = (unitId: string, position: Unit['position'], ownerId: string): void => {
    removeFromWorkingCopies([unitId]);
    const escortId = findEscortedGeneralId(units, position, ownerId);
    if (escortId) removeFromWorkingCopies([escortId]);
  };
  // #887 MR1: units whose otherwise-lethal outcome was clamped by a Last Stand
  // Hold this resolution. Collected at the 3 clamp sites; turned into
  // `unit-saved` career events after the outcome. Precise (no post-hoc guessing).
  const lastStandSaves: Array<{ unit: Unit; hold: NonNullable<Unit['lastStandHold']> }> = [];

  const defenderCiv = civilizations[defenderBefore.owner];
  if (
    attackerBefore.owner !== defenderBefore.owner
    && (civilizations[attackerBefore.owner] || minorCivs[attackerBefore.owner])
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
    lastStandSaves.push({ unit: attackerBefore, hold: attackerBefore.lastStandHold! });
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
    releaseCaptured(result.attackerId);
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
    releaseCaptured(result.attackerId);
    attackerCaptured = true;
  } else {
    defeatedUnitIds.add(result.attackerId);
    destroyUnitAndEscort(result.attackerId, attackerBefore.position, attackerBefore.owner);
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
    lastStandSaves.push({ unit: defenderBefore, hold: defenderBefore.lastStandHold! });
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
    releaseCaptured(result.defenderId);
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
    releaseCaptured(result.defenderId);
    defenderCaptured = true;
  } else {
    defeatedUnitIds.add(result.defenderId);
    destroyUnitAndEscort(result.defenderId, defenderBefore.position, defenderBefore.owner);
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
      lastStandSaves.push({ unit: target, hold: target.lastStandHold! });
      units = consumeLastStandHoldFormationWide(units, target.lastStandHold!.formationId);
      continue;
    }
    defeatedUnitIds.add(hit.unitId);
    destroyUnitAndEscort(hit.unitId, target.position, target.owner);
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
      ...(marketplace !== state.marketplace ? { marketplace } : {}),
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

  // #1200: a defender a major civ defeats on a barbarian camp tile destroys the camp. It is a consequence of
  // the kill, so every executor gets it here (the player and AI turn used to be the only ones); only a major
  // killer is paid, because the reward lands in `civilizations[owner].gold`.
  let campDestroyed: CombatOutcomeApplication['campDestroyed'];
  if (defenderActuallyDefeated && isMajorCivOwner(attackerBefore.owner) && nextState.civilizations[attackerBefore.owner] && nextState.barbarianCamps) {
    const camp = applyCampDestructionAtTarget(nextState, attackerBefore.owner, defenderBefore.position, state.turn);
    if (camp.campId) {
      nextState = camp.state;
      questTransitions.push(...camp.questTransitions);
      campDestroyed = { campId: camp.campId, reward: camp.reward };
    }
  }

  // #1200: idle-pressure bookkeeping (`lastCombatTurnByLandmass` feeds the pirate/threat pressure score) is
  // per MAJOR civ in the fight, attacker and defender alike -- not just whoever happened to be the executor's
  // actor. Rosterless owners (barbarians, pirates, beasts) have no record to keep.
  if (nextState.map?.tiles) {
    for (const ownerId of new Set([attackerBefore.owner, defenderBefore.owner])) {
      if (nextState.civilizations[ownerId]) nextState = recordCombatForCiv(nextState, ownerId, defenderBefore.position);
    }
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

  // #1014: a beast slay is a consequence of the kill, not of whichever executor made it.
  // Whoever destroyed the beast is the slayer: the attacker for a defender or splash victim, the
  // defender for a beast that died on its own attack. `recordBeastSlain` runs on the post-combat
  // state so the victor's full-heal overrides this fight's damage, exactly as the old caller-side
  // call (after the state was committed) did.
  const slayCandidates: Array<{ defeated: Unit; victor: Unit }> = [];
  if (defenderActuallyDefeated) slayCandidates.push({ defeated: defenderBefore, victor: attackerBefore });
  if (attackerActuallyDefeated) slayCandidates.push({ defeated: attackerBefore, victor: defenderBefore });
  for (const splashVictimId of [...defeatedUnitIds].sort()) {
    if (splashVictimId === attackerBefore.id || splashVictimId === defenderBefore.id) continue;
    const splashVictim = state.units[splashVictimId];
    if (splashVictim) slayCandidates.push({ defeated: splashVictim, victor: attackerBefore });
  }
  const beastsSlain: BeastSlainPayload[] = [];
  for (const { defeated, victor } of slayCandidates) {
    const slay = recordBeastSlain(nextState, defeated, nextState.units[victor.id] ?? victor);
    nextState = slay.state;
    if (slay.slain) beastsSlain.push(slay.slain);
  }

  // #582 / #1198: a destroyed carrier-family hull takes its based aircraft with it as part of the canonical
  // removal closure (`unit-removal-system.ts`), however the carrier died (direct kill, splash or escort).
  // Resolve command breaks before force normalization removes the dead Handler
  // from its force membership; the recorded death ids are the canonical trigger.
  nextState = normalizeCrisisForces(resolveRogueElephantHostHandlerDeaths(
    recordCampPressureFromCombatOutcome(nextState, attackerBefore, defenderBefore),
    defeatedUnitIds,
  ));
  nextState = recordGeneralDeaths(state.units, nextState);
  nextState = recordGeneralCareerCombatEvents(state, result, lastStandSaves, nextState);
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

  const afterVassalage = applyVassalageWarConsequences(state, nextState, bus);
  const eliminatedBy = defenderActuallyDefeated || defenderCaptured
    ? attackerBefore.owner
    : attackerActuallyDefeated || attackerCaptured
      ? defenderBefore.owner
      : undefined;
  const liveness = state.cities
    ? reconcileCivilizationLiveness(state, afterVassalage, eliminatedBy)
    : { state: afterVassalage, transitions: [] };
  // A bus means a real execution: a caravan lost in this fight announces its ended route here, once,
  // for every executor (#1198). A hypothetical fight (AI lookahead) passes no bus and stays silent.
  emitEndedTradeRoutes(bus, endedRoutes);
  if (bus && campDestroyed) bus.emit('barbarian:camp-destroyed', campDestroyed);
  if (bus) emitCivilizationLivenessTransitions(liveness, bus);
  // Same convention as the liveness events above: a bus means a real execution, so the
  // transition is announced here, once, for every executor (#1014). A hypothetical fight
  // (AI lookahead) passes no bus and stays silent.
  if (bus) for (const slain of beastsSlain) bus.emit('beast:slain', slain);

  return {
    state: liveness.state,
    rewards,
    attackerDefeated: attackerActuallyDefeated,
    defenderDefeated: defenderActuallyDefeated,
    attackerCaptured,
    defenderCaptured,
    questTransitions,
    pirateEvents,
    beastsSlain,
    campDestroyed,
  };
}
