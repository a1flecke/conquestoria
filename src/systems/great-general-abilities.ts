import type { GameState, LandSupplyState, Unit } from '@/core/types';
import { GENERAL_DEFINITIONS } from '@/systems/great-general-definitions';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import { mapDistance } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export interface HeroicCommandEligibility {
  eligible: boolean;
  reason?: string;
  chargesRemaining: number;
  isFinalCharge: boolean;
  cooldownTurnsRemaining: number;
}

/**
 * #544 MR4 contract §17: shared gate every heroic ability (Rally, Seize,
 * Last Stand) checks before doing anything else. One charge/cooldown model
 * for all three -- no independent per-ability cooldowns, no combat-driven
 * recharge, no tech/difficulty acceleration (difficulty-invariant: this
 * function never reads state.opponentChallenge or civ.challenge).
 */
export function getHeroicCommandEligibility(
  state: Pick<GameState, 'turn'>,
  general: Pick<Unit, 'generalDefinitionId' | 'generalNoCommandThisTurn' | 'generalCommandChargesUsed' | 'generalCommandCooldownUntilTurn'>,
): HeroicCommandEligibility {
  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  const maxCharges = definition?.maxCommandCharges ?? 0;
  const chargesUsed = general.generalCommandChargesUsed ?? 0;
  const chargesRemaining = Math.max(0, maxCharges - chargesUsed);
  const cooldownUntil = general.generalCommandCooldownUntilTurn ?? 0;
  const cooldownTurnsRemaining = Math.max(0, cooldownUntil - state.turn);

  if (general.generalNoCommandThisTurn) {
    return {
      eligible: false,
      reason: 'This General just took command and cannot act until next turn.',
      chargesRemaining,
      isFinalCharge: false,
      cooldownTurnsRemaining,
    };
  }
  if (chargesRemaining <= 0) {
    return { eligible: false, reason: 'No Command Charges remaining.', chargesRemaining, isFinalCharge: false, cooldownTurnsRemaining };
  }
  if (cooldownTurnsRemaining > 0) {
    return {
      eligible: false,
      reason: `Command is on cooldown for ${cooldownTurnsRemaining} more turn(s).`,
      chargesRemaining,
      isFinalCharge: false,
      cooldownTurnsRemaining,
    };
  }
  return { eligible: true, chargesRemaining, isFinalCharge: chargesRemaining === 1, cooldownTurnsRemaining: 0 };
}

/**
 * Spends one Command Charge and starts the shared cooldown (contract §17:
 * "any ability costs 1 charge and starts the same shared cooldown"). Callers
 * (Rally/Seize/Last Stand issuance in this same file) call this exactly
 * once per successful ability issuance, after applying the ability's own
 * effects -- charge/cooldown state and effect state are independent writes
 * to the same unit, composed by the caller.
 */
export function spendHeroicCommandCharge(state: GameState, generalUnitId: string): GameState {
  const general = state.units[generalUnitId];
  const definition = general ? GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId) : undefined;
  if (!general || !definition) return state;

  return {
    ...state,
    units: {
      ...state.units,
      [generalUnitId]: {
        ...general,
        generalCommandChargesUsed: (general.generalCommandChargesUsed ?? 0) + 1,
        generalCommandCooldownUntilTurn: state.turn + definition.cooldownTurns,
      },
    },
  };
}

const RALLY_HEAL_AMOUNT = 30; // contract §18: "exact HP is data-driven and not locked"

/** contract §18: severe -> degraded, degraded -> grace, grace -> grace (no
 * further reduction). full/stable-unsupported are not eligible targets at
 * all (filtered out before this ever runs). */
function rallyStageAfter(stage: LandSupplyState): LandSupplyState {
  if (stage === 'severe') return 'degraded';
  if (stage === 'degraded') return 'grace';
  return stage;
}

function stageSeverityWeight(stage: LandSupplyState): number {
  if (stage === 'severe') return 50;
  if (stage === 'degraded') return 30;
  if (stage === 'grace') return 10;
  return 0;
}

export interface RallyTarget {
  unitId: string;
  healthBefore: number;
  healthAfter: number;
  stageBefore: LandSupplyState;
  stageAfter: LandSupplyState;
}

export interface RallyPreview {
  eligibility: HeroicCommandEligibility;
  targets: RallyTarget[];
}

function getRallyEligibleTargets(state: GameState, general: Unit, definition: { commandRange: number; commandCapacity: number }): RallyTarget[] {
  const civ = state.civilizations[general.owner];
  if (!civ) return [];
  const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);

  const candidates = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => u.landSupply !== undefined
      && (u.landSupply.state === 'grace' || u.landSupply.state === 'degraded' || u.landSupply.state === 'severe'))
    .filter(u => mapDistance(state.map, general.position, u.position) <= commandRange)
    .map(u => ({
      unit: u,
      priority: (100 - u.health) + stageSeverityWeight(u.landSupply!.state),
    }))
    .sort((a, b) => b.priority - a.priority || a.unit.id.localeCompare(b.unit.id))
    .slice(0, commandCapacity);

  return candidates.map(({ unit }) => ({
    unitId: unit.id,
    healthBefore: unit.health,
    healthAfter: Math.min(100, unit.health + RALLY_HEAL_AMOUNT),
    stageBefore: unit.landSupply!.state,
    stageAfter: rallyStageAfter(unit.landSupply!.state),
  }));
}

/** contract §18/§24: "automatic targeting with preview" -- no player
 * selection step, the panel just shows what Rally will do and Confirm/Cancel. */
export function getRallyPreview(state: GameState, generalUnitId: string): RallyPreview {
  const general = state.units[generalUnitId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  if (!general || !eligibility.eligible) return { eligibility, targets: [] };

  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  if (!definition) return { eligibility, targets: [] };

  return { eligibility, targets: getRallyEligibleTargets(state, general, definition) };
}

/** #544 MR4 review fix: a General has only 3 lifetime charges on a
 * ~10-turn shared cooldown -- burning one on a misclick with zero eligible
 * targets (nothing nearby needs Rally) would be a punishing, confusing
 * waste of a scarce resource. Mirrors issueLastStand's own empty-targets
 * guard; issueSeizeTheMoment gets the same treatment. */
export function issueRally(state: GameState, generalUnitId: string): GameState {
  const preview = getRallyPreview(state, generalUnitId);
  if (!preview.eligibility.eligible || preview.targets.length === 0) return state;

  let units = { ...state.units };
  for (const target of preview.targets) {
    const unit = units[target.unitId];
    if (!unit || !unit.landSupply) continue;
    units[target.unitId] = {
      ...unit,
      health: target.healthAfter,
      landSupply: { ...unit.landSupply, state: target.stageAfter },
      rallyProtectedThisRound: true,
    };
  }

  return spendHeroicCommandCharge({ ...state, units }, generalUnitId);
}

export interface SeizeEligibleUnit {
  unitId: string;
  label: string;
}

/** contract §19: player-selected, so this returns the full in-range/acted
 * candidate pool for the UI to render as checkboxes -- capacity is enforced
 * at issuance time (below), not here, so the picker can show "N of
 * commandCapacity selected" feedback rather than silently truncating the list. */
export function getSeizeTheMomentEligibleUnits(
  state: GameState,
  generalUnitId: string,
): { eligibility: HeroicCommandEligibility; eligible: SeizeEligibleUnit[] } {
  const general = state.units[generalUnitId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  if (!general || !eligibility.eligible) return { eligibility, eligible: [] };

  const definition = GENERAL_DEFINITIONS.find(g => g.id === general.generalDefinitionId);
  const civ = state.civilizations[general.owner];
  if (!definition || !civ) return { eligibility, eligible: [] };
  const { commandRange } = getEffectiveCommandStats(general, definition);

  const eligible = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => u.hasActed === true)
    .filter(u => mapDistance(state.map, general.position, u.position) <= commandRange)
    .sort((a, b) => a.id.localeCompare(b.id))
    // #544 MR4 review fix: raw UnitType strings (e.g. 'great_general',
    // multi-word types) are internal identifiers, not player-facing names --
    // this codebase's convention for the real display name is
    // UNIT_DEFINITIONS[type].name. HP is appended so two units of the same
    // type in the same picker (a common case -- Seize is most useful with
    // several units acting together) are visually distinguishable without
    // cross-referencing map position.
    .map(u => ({ unitId: u.id, label: `${UNIT_DEFINITIONS[u.type]?.name ?? u.type} (${u.health} HP)` }));

  return { eligibility, eligible };
}

/**
 * contract §19: "bounded extra action budget, not a full reset... at most
 * one additional attack, no full movement refresh, no reset of
 * cooldowns/charges/ammo-like state." Only hasActed is cleared -- hasMoved
 * stays true and movementPointsLeft is untouched, so a unit can only
 * reposition with whatever movement it already had left over, and gets
 * exactly one more legal attack. selectedUnitIds beyond commandCapacity are
 * silently truncated (stable order: eligible-list order, i.e. id-sorted).
 */
export function issueSeizeTheMoment(
  state: GameState,
  generalUnitId: string,
  selectedUnitIds: string[],
): GameState {
  const { eligibility, eligible } = getSeizeTheMomentEligibleUnits(state, generalUnitId);
  if (!eligibility.eligible) return state;

  const general = state.units[generalUnitId];
  const definition = GENERAL_DEFINITIONS.find(g => g.id === general?.generalDefinitionId);
  if (!general || !definition) return state;
  const { commandCapacity } = getEffectiveCommandStats(general, definition);

  const eligibleIds = new Set(eligible.map(e => e.unitId));
  const toActivate = selectedUnitIds.filter(id => eligibleIds.has(id)).slice(0, commandCapacity);
  // #544 MR4 review fix: mirrors issueRally's zero-target guard -- confirming
  // Seize with no valid selection (empty array, or every selected id turned
  // out ineligible) must not burn one of the General's 3 lifetime charges on
  // nothing happening.
  if (toActivate.length === 0) return state;

  let units = { ...state.units };
  for (const unitId of toActivate) {
    const unit = units[unitId];
    if (!unit) continue;
    units[unitId] = { ...unit, hasActed: false, hasMoved: false };
  }

  return spendHeroicCommandCharge({ ...state, units }, generalUnitId);
}
