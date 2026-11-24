import type { GameState, HexCoord, LandSupplyState, LastStandHoldState, Unit } from '@/core/types';
import { resolveGeneralDefinition, type GeneralDefinition } from '@/systems/great-general-definitions';
import { BASELINE_GENERAL_MECHANICS, resolveGeneralMechanics } from '@/systems/great-general-specialties';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import { appendGeneralCareerEvent } from '@/systems/great-general-career';
import { mapDistance, mapHexesInRange } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { getUnitAttackProfile, getAttackTargets } from '@/systems/attack-targeting';
import { canUnitBombardCity } from '@/systems/city-bombardment-system';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { getVisibility } from '@/systems/fog-of-war';
import { isHostileOwnerTo } from '@/systems/owner-hostility';
import { createCityBreach, isCityBreachedBy } from '@/systems/city-breach';

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
  state: Pick<GameState, 'turn' | 'generatedGenerals'>,
  general: Pick<Unit, 'generalDefinitionId' | 'generalNoCommandThisTurn' | 'generalCommandChargesUsed' | 'generalCommandCooldownUntilTurn'>,
): HeroicCommandEligibility {
  const definition = resolveGeneralDefinition(state, general.generalDefinitionId);
  const maxCharges = definition ? resolveGeneralMechanics(definition).maxCommandCharges : 0;
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
 * Spends one Command Charge, starts the shared cooldown (contract §17:
 * "any ability costs 1 charge and starts the same shared cooldown") and ends the
 * General's remaining action/movement (contract §17: "ends General's remaining
 * action/movement"). Callers (Rally/Seize/Last Stand/Breach issuance in this
 * same file) call this exactly once per successful ability issuance, after
 * applying the ability's own effects -- charge/cooldown state and effect state
 * are independent writes to the same unit, composed by the caller.
 *
 * The §17 action/movement write lives here, not in each issue* executor, because
 * movement legality never re-reads hasActed (the resolver, the range preview and
 * the selected-unit highlights all gate on movementPointsLeft alone): without
 * this write, a General that has moved partway could issue a command and then
 * still spend its leftover movement, and a General that has only commanded would
 * keep appearing in the end-of-turn "unmoved units" prompt. hasMoved is
 * deliberately left as it was -- like fortify/rest, a command issued in place is
 * not itself a move.
 */
export function spendHeroicCommandCharge(state: GameState, generalUnitId: string): GameState {
  const general = state.units[generalUnitId];
  const definition = general ? resolveGeneralDefinition(state, general.generalDefinitionId) : undefined;
  if (!general || !definition) return state;

  const used = (general.generalCommandChargesUsed ?? 0) + 1;
  const withSpend: GameState = {
    ...state,
    units: {
      ...state.units,
      [generalUnitId]: {
        ...general,
        generalCommandChargesUsed: used,
        generalCommandCooldownUntilTurn: state.turn + resolveGeneralMechanics(definition).cooldownTurns,
        hasActed: true,
        movementPointsLeft: 0,
      },
    },
  };

  // #887 MR1: the charge that reaches the (specialty-resolved) lifetime max IS
  // the Final Command; retirement follows at end of this owner's turn.
  if (used === resolveGeneralMechanics(definition).maxCommandCharges) {
    return appendGeneralCareerEvent(withSpend, general.owner, general.generalDefinitionId, {
      type: 'final-command',
      turn: state.turn,
    });
  }
  return withSpend;
}

// #885: Rally heal amount is now specialty-resolved (Supply Master 50, Tireless
// 20, everyone else 30). See resolveGeneralMechanics(def).rally.healAmount.

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

function getRallyEligibleTargets(state: GameState, general: Unit, definition: GeneralDefinition): RallyTarget[] {
  const civ = state.civilizations[general.owner];
  if (!civ) return [];
  const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);
  const healAmount = resolveGeneralMechanics(definition).rally.healAmount;

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
    healthAfter: Math.min(100, unit.health + healAmount),
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

  const definition = resolveGeneralDefinition(state, general.generalDefinitionId);
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
  let totalHpRestored = 0;
  for (const target of preview.targets) {
    const unit = units[target.unitId];
    if (!unit || !unit.landSupply) continue;
    totalHpRestored += target.healthAfter - target.healthBefore;
    units[target.unitId] = {
      ...unit,
      health: target.healthAfter,
      landSupply: { ...unit.landSupply, state: target.stageAfter },
      rallyProtectedThisRound: true,
    };
  }

  const general = state.units[generalUnitId]!;
  const afterSpend = spendHeroicCommandCharge({ ...state, units }, generalUnitId);
  // #887 MR1: canonical "Rally used" career moment — counts + total HP only,
  // no unit-id list, no snapshots.
  return appendGeneralCareerEvent(afterSpend, general.owner, general.generalDefinitionId, {
    type: 'rally-used',
    turn: state.turn,
    unitsAffected: preview.targets.length,
    totalHpRestored,
  });
}

// contract §20: "moderate defensive bonus... exact defense/area/duration are
// data-driven and not locked." #885: defense multiplier and duration are now
// specialty-resolved (Defensive Commander 1.25 / 3 turns, Bold Commander 1.10,
// everyone else 1.15 / 2) — see resolveGeneralMechanics(def).lastStand. Radius
// stays fixed at 1 for every General (radius 2 is too swingy; #885 balance rule).
const LAST_STAND_AREA_RADIUS = 1; // target hex plus its immediate neighbors

export interface LastStandTarget {
  unitId: string;
}

export interface LastStandPreview {
  eligibility: HeroicCommandEligibility;
  targetHex: HexCoord;
  area: HexCoord[];
  targets: LastStandTarget[];
  defenseBonusPercent: number;
  durationTurns: number;
}

function isLastStandEligibleUnitType(type: Unit['type']): boolean {
  return !UNIT_CLASS_BY_TYPE[type]?.includes('civilian');
}

function getLastStandArea(state: GameState, general: Unit, targetHex: HexCoord, commandRange: number): HexCoord[] | null {
  if (mapDistance(state.map, general.position, targetHex) > commandRange) return null;
  return mapHexesInRange(state.map, targetHex, LAST_STAND_AREA_RADIUS);
}

export function getLastStandPreview(state: GameState, generalUnitId: string, targetHex: HexCoord): LastStandPreview {
  const general = state.units[generalUnitId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  const empty: LastStandPreview = {
    eligibility, targetHex, area: [], targets: [],
    defenseBonusPercent: Math.round((BASELINE_GENERAL_MECHANICS.lastStand.defenseMultiplier - 1) * 100),
    durationTurns: BASELINE_GENERAL_MECHANICS.lastStand.durationTurns,
  };
  if (!general || !eligibility.eligible) return empty;

  const definition = resolveGeneralDefinition(state, general.generalDefinitionId);
  const civ = state.civilizations[general.owner];
  if (!definition || !civ) return empty;
  const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);
  const lastStand = resolveGeneralMechanics(definition).lastStand;
  const resolved: LastStandPreview = {
    ...empty,
    defenseBonusPercent: Math.round((lastStand.defenseMultiplier - 1) * 100),
    durationTurns: lastStand.durationTurns,
  };

  const area = getLastStandArea(state, general, targetHex, commandRange);
  if (!area) return resolved;
  const areaKeys = new Set(area.map(h => `${h.q},${h.r}`));

  const targets = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => isLastStandEligibleUnitType(u.type))
    .filter(u => areaKeys.has(`${u.position.q},${u.position.r}`))
    .sort((a, b) => mapDistance(state.map, targetHex, a.position) - mapDistance(state.map, targetHex, b.position) || a.id.localeCompare(b.id))
    .slice(0, commandCapacity)
    .map(u => ({ unitId: u.id }));

  return { ...resolved, area, targets };
}

/** #544 MR4 review fix: mirrors issueRally's zero-target guard. */
export function issueLastStand(state: GameState, generalUnitId: string, targetHex: HexCoord): GameState {
  const preview = getLastStandPreview(state, generalUnitId, targetHex);
  if (!preview.eligibility.eligible || preview.targets.length === 0) return state;

  // Deterministic, unique-enough-per-issuance id -- no RNG needed (Global
  // Constraints: this MR never needs Math.random or seededLcg).
  const formationId = `${generalUnitId}-${state.turn}-${targetHex.q},${targetHex.r}`;
  // #885: the hold carries the *resolved* multiplier/duration this General had
  // when it was cast, so an in-flight hold never retro-changes on a content patch.
  const general = state.units[generalUnitId]!;
  const definition = resolveGeneralDefinition(state, general.generalDefinitionId)!;
  const lastStand = resolveGeneralMechanics(definition).lastStand;
  const hold: LastStandHoldState = {
    formationId,
    defenseBonusMultiplier: lastStand.defenseMultiplier,
    expiresTurn: state.turn + lastStand.durationTurns,
    // #887 MR1: stable issuer id so a unit-saved / battle-influenced career
    // event resolves even after the General unit itself is gone.
    generalDefinitionId: definition.id,
  };

  let units = { ...state.units };
  for (const target of preview.targets) {
    const unit = units[target.unitId];
    if (!unit) continue;
    units[target.unitId] = { ...unit, lastStandHold: hold };
  }

  const afterSpend = spendHeroicCommandCharge({ ...state, units }, generalUnitId);
  // #887 MR1: canonical "Last Stand issued" career moment.
  return appendGeneralCareerEvent(afterSpend, general.owner, general.generalDefinitionId, {
    type: 'last-stand-issued',
    turn: state.turn,
    unitsProtected: preview.targets.length,
  });
}

/** Mirrors resolveLandSupplyCombatPenalty's { multiplier, label? } shape
 * (supply-combat.ts) so combat-context.ts wires both identically. */
export function resolveLastStandDefenseBonus(
  unit: Pick<Unit, 'lastStandHold'>,
  currentTurn: number,
): { multiplier: number; label?: string } {
  const hold = unit.lastStandHold;
  if (!hold || currentTurn > hold.expiresTurn) return { multiplier: 1 };
  return { multiplier: hold.defenseBonusMultiplier, label: `Last Stand +${Math.round((hold.defenseBonusMultiplier - 1) * 100)}%` };
}

/** #544 MR4 contract §20: "one shared formation-wide Hold! survival save."
 * Consumed exactly once per formation -- called by applyCombatOutcomeToState
 * (Task 8) the first time any member's Hold save actually triggers, clearing
 * lastStandHold from every unit sharing that formationId so no other member
 * can also be saved by the same one-time save. The passive defense bonus
 * this formation was granting also ends at that moment, which is intended:
 * once the formation has taken its one lethal hit, the "hold this ground"
 * moment is over. */
export function consumeLastStandHoldFormationWide(units: Record<string, Unit>, formationId: string): Record<string, Unit> {
  const next = { ...units };
  for (const [id, unit] of Object.entries(units)) {
    if (unit.lastStandHold?.formationId === formationId) {
      const { lastStandHold: _lastStandHold, ...rest } = unit;
      next[id] = rest as Unit;
    }
  }
  return next;
}

export interface SeizeEligibleUnit {
  unitId: string;
  label: string;
  /**
   * #1807: can this unit actually spend the grant if it receives one? A candidate with
   * neither a legal attack target (viewer-scoped) nor any reachable tile would be
   * granted nothing but still consume one of the charge's capacity slots — the picker
   * disables such rows with `reason` and the issuance drops them rather than burning a
   * lifetime charge on units that cannot act.
   */
  spendable: boolean;
  /** Player-facing copy for the disabled row; present when `spendable` is false. */
  reason?: string;
}

export interface SeizeTheMomentEligibility {
  eligibility: HeroicCommandEligibility;
  eligible: SeizeEligibleUnit[];
  /**
   * How many of `eligible` one charge actually activates (commandCapacity plus a
   * Bold Commander's extra target). Returned with the candidate pool so the picker
   * can stop the player selecting more units than the executor will activate, and
   * so `issueSeizeTheMoment` never re-derives the number it truncates to.
   */
  capacity: number;
}

/**
 * #1807 (contract §19: "bounded extra action budget... data-driven and not locked"):
 * the movement budget one Seize grant writes. One point funds exactly one reposition
 * (a land step costs at least one, or two half-cost road steps) or one attack — never
 * a full movement refresh, and never in addition to movement the unit already had
 * (`issueSeizeTheMoment` grants `Math.max(current, this)`).
 */
export const SEIZE_GRANT_MOVEMENT_POINTS = 1;

const SEIZE_UNSPENDABLE_GENERIC_REASON = 'No target or open tile in reach.';

/**
 * #1807: would the grant buy this unit anything, right now, on the real map? Pure
 * read-only probe over the unit exactly as the grant would leave it (acted, one
 * granted point, live marker): the canonical attack enumeration with the acting
 * owner's own fog, then the canonical movement-range BFS for the reposition.
 */
function canSeizeCandidateSpendGrant(
  state: GameState,
  unit: Unit,
  definition: GeneralDefinition,
): { spendable: boolean; reason?: string } {
  const probe: Unit = {
    ...unit,
    movementPointsLeft: SEIZE_GRANT_MOVEMENT_POINTS,
    seizeGrantedBy: { generalDefinitionId: definition.id, turn: state.turn },
  };
  // Attack half. viewerId is the acting owner: the spendability decision must never
  // depend on enemies that owner cannot see (the #1807 review's privacy requirement —
  // same rule as every other player-facing offer surface). Unit targets first...
  if (getAttackTargets(state, probe, { viewerId: unit.owner }).length > 0) {
    return { spendable: true };
  }
  // ...then the city bombardment form, so a siege unit whose only granted spend is
  // shelling a visible hostile city is still honestly offered.
  if (isCityBombardUnit(unit.type)) {
    const hasBombardableCity = Object.values(state.cities).some(city =>
      city.owner !== unit.owner
      && canUnitBombardCity(state, probe, city, { requireVisibility: true }).ok);
    if (hasBombardableCity) return { spendable: true };
  }
  // Reposition half. Cargo and based aircraft never walk, so the grant buys them
  // nothing here; otherwise the range preview the map highlights already draw from
  // decides. Every tile it reports is either a genuine move or a hostile occupant the
  // attack half already considered.
  if (unit.transportId || unit.airBase) {
    return { spendable: false, reason: SEIZE_UNSPENDABLE_GENERIC_REASON };
  }
  const probeState: GameState = { ...state, units: { ...state.units, [unit.id]: probe } };
  if (getMovementRangeDetails(probeState, unit.id).reachable.length > 0) {
    return { spendable: true };
  }
  return { spendable: false, reason: SEIZE_UNSPENDABLE_GENERIC_REASON };
}

/** contract §19: player-selected, so this returns the full in-range/acted
 * candidate pool for the UI to render as checkboxes, together with the capacity
 * that pool is trimmed to at issuance. The picker must enforce that capacity as
 * the player selects ("N of capacity selected"); the executor's
 * `.slice(0, capacity)` is the backstop for a direct or AI call, never a silent
 * trim of a hand-picked list. */
export function getSeizeTheMomentEligibleUnits(
  state: GameState,
  generalUnitId: string,
): SeizeTheMomentEligibility {
  const general = state.units[generalUnitId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  if (!general || !eligibility.eligible) return { eligibility, eligible: [], capacity: 0 };

  const definition = resolveGeneralDefinition(state, general.generalDefinitionId);
  const civ = state.civilizations[general.owner];
  if (!definition || !civ) return { eligibility, eligible: [], capacity: 0 };
  const { commandRange, commandCapacity } = getEffectiveCommandStats(general, definition);
  // #885: a Bold Commander's Seize reaches commandCapacity + 1 units (still one
  // extra attack each, still no movement refund — no full turn reset).
  const capacity = commandCapacity + resolveGeneralMechanics(definition).seize.extraTargets;

  const eligible = civ.units
    .map(id => state.units[id])
    .filter((u): u is Unit => Boolean(u))
    .filter(u => u.id !== general.id)
    .filter(u => u.hasActed === true)
    // #1807: a grant is movement money plus an attack permission. Air units neither
    // walk nor attack through it (their combat runs on air missions with their own
    // gates), and a trader committed to a route is "commissioned", not free to act —
    // its allowance belongs to the route runner (#1502). Neither can spend a grant,
    // so neither is offered one.
    .filter(u => (UNIT_DEFINITIONS[u.type]?.domain ?? 'land') !== 'air')
    .filter(u => !u.committedToRouteId)
    .filter(u => mapDistance(state.map, general.position, u.position) <= commandRange)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(u => {
      const { spendable, reason } = canSeizeCandidateSpendGrant(state, u, definition);
      return {
        unitId: u.id,
        // #544 MR4 review fix: raw UnitType strings (e.g. 'great_general',
        // multi-word types) are internal identifiers, not player-facing names --
        // this codebase's convention for the real display name is
        // UNIT_DEFINITIONS[type].name. HP is appended so two units of the same
        // type in the same picker (a common case -- Seize is most useful with
        // several units acting together) are visually distinguishable without
        // cross-referencing map position.
        label: `${UNIT_DEFINITIONS[u.type]?.name ?? u.type} (${u.health} HP)`,
        spendable,
        ...(spendable ? {} : { reason }),
      };
    });

  return { eligibility, eligible, capacity };
}

/**
 * contract §19: "bounded extra action budget, not a full reset... at most
 * one additional attack, no full movement refresh, no reset of
 * cooldowns/charges/ammo-like state." #1807's model: `hasActed` is never cleared —
 * every movement-free executor (upgrade, pillage, propagandist, spy commands,
 * worker, load/unload, fortify, rest) keeps refusing the unit through its own
 * `!hasActed` gate, so the grant cannot be absorbed by anything outside §19's
 * "reposition, or make another legal attack". What the unit receives instead is
 * the bounded budget: `SEIZE_GRANT_MOVEMENT_POINTS` gated by the per-turn
 * `seizeGrantedBy` marker, which `canSpendUnitAction` (the one action-points gate)
 * reads. One-shot by construction: every attack path zeroes the granted movement
 * itself, and a granted reposition marks the marker `spent` so reposition-then-
 * attack is refused. The caller-selected list is trimmed to `capacity` (eligible-
 * list order, i.e. id-sorted) and to candidates that can actually spend the grant;
 * a picker that offers the pool must enforce that same number (see
 * `SeizeTheMomentEligibility`).
 */
export function issueSeizeTheMoment(
  state: GameState,
  generalUnitId: string,
  selectedUnitIds: string[],
): GameState {
  const { eligibility, eligible, capacity: cap } = getSeizeTheMomentEligibleUnits(state, generalUnitId);
  if (!eligibility.eligible) return state;

  const general = state.units[generalUnitId];
  const definition = resolveGeneralDefinition(state, general?.generalDefinitionId);
  if (!general || !definition) return state;

  const eligibleById = new Map(eligible.map(entry => [entry.unitId, entry]));
  // Execution-time truth: re-derived spendability filters the selection, so a stale
  // picker callback (state changed since the pool was listed) grants only units the
  // grant can still serve.
  const toActivate = selectedUnitIds
    .filter(id => eligibleById.get(id)?.spendable === true)
    .slice(0, cap);
  // #544 MR4 review fix, extended by #1807: confirming Seize with no valid selection
  // (empty array, every selected id turned out ineligible, or every eligible selection
  // boxed in with nothing the grant can buy) must not burn one of the General's 3
  // lifetime charges on nothing happening.
  if (toActivate.length === 0) return state;

  let units = { ...state.units };
  let refreshed = 0;
  for (const unitId of toActivate) {
    const unit = units[unitId];
    if (!unit) continue;
    refreshed += 1;
    units[unitId] = {
      ...unit,
      // hasActed stays set (#1807 — see the doc comment above). hasMoved likewise
      // stays as it was (contract §19: "not a full reset"), so the round-end recovery
      // gates (passive heal, gene-therapy recharge) still see that this unit acted.
      // A rest was the action this unit spent to become eligible. Handing it another
      // action ends that commitment: the round-end heal pays `isResting` (+15, and it
      // outranks every gate except a friendly city), so a resting unit that is seized
      // and then fights again must not also be paid for having rested.
      isResting: false,
      // The bounded budget itself: never a full refresh, never a reduction.
      movementPointsLeft: Math.max(unit.movementPointsLeft, SEIZE_GRANT_MOVEMENT_POINTS),
      // #887 MR1/#1807: the marker gates the granted action (canSpendUnitAction) and
      // credits this General for any battle/capture the unit influences THIS turn —
      // read while `.turn === state.turn` whether or not it has been spent; cleared
      // by resetUnitTurn.
      seizeGrantedBy: { generalDefinitionId: definition.id, turn: state.turn },
    };
  }

  const afterSpend = spendHeroicCommandCharge({ ...state, units }, generalUnitId);
  return appendGeneralCareerEvent(afterSpend, general.owner, general.generalDefinitionId, {
    type: 'seize-used',
    turn: state.turn,
    unitsRefreshed: refreshed,
  });
}

// ---------------------------------------------------------------------------
// #939: Breach the Walls -- the Siegemaster's signature command
// ---------------------------------------------------------------------------

/**
 * A ground or naval unit that can shell a city from range (`canUnitBombardCity`'s attack-profile test): melee units
 * also "target" cities but cannot bombard, and aircraft strike by their own missions. Shared by the AI's Breach and
 * Siegemaster valuations so neither re-derives it.
 */
export function isCityBombardUnit(type: Unit['type']): boolean {
  const profile = getUnitAttackProfile(type);
  return (UNIT_DEFINITIONS[type]?.domain ?? 'land') !== 'air'
    && (profile.kind === 'bombard' || profile.kind === 'ranged')
    && profile.targets.includes('city');
}

export interface BreachPreview {
  eligibility: HeroicCommandEligibility;
  /** False for a General whose specialty has no Breach: the command is not offered at all. */
  available: boolean;
  /** Why this city cannot be breached right now (player-facing copy); undefined when it can. */
  denial?: string;
  cityId: string;
  cityName: string;
  durationTurns: number;
  hasGarrison: boolean;
}

/**
 * Hostile cities this General could Breach right now: within command range, currently visible to its owner,
 * hostile (at war / always-hostile), and not already breached by this civ. Sorted by id for determinism.
 */
export function getBreachTargetCityIds(state: GameState, generalUnitId: string): string[] {
  const general = state.units[generalUnitId];
  const definition = general ? resolveGeneralDefinition(state, general.generalDefinitionId) : undefined;
  const visibility = general ? state.civilizations[general.owner]?.visibility : undefined;
  if (!general || !definition || !visibility) return [];
  if (resolveGeneralMechanics(definition).breach.durationTurns <= 0) return [];
  const { commandRange } = getEffectiveCommandStats(general, definition);
  return Object.values(state.cities)
    .filter(city => city.owner !== general.owner)
    .filter(city => isHostileOwnerTo(state, general.owner, city.owner))
    .filter(city => !isCityBreachedBy(city, general.owner))
    .filter(city => mapDistance(state.map, general.position, city.position) <= commandRange)
    .filter(city => getVisibility(visibility, city.position) === 'visible')
    .map(city => city.id)
    .sort((a, b) => a.localeCompare(b));
}

/** The one legality source for Breach: the preview, the executor and the AI all ask it. */
export function getBreachPreview(state: GameState, generalUnitId: string, cityId: string): BreachPreview {
  const general = state.units[generalUnitId];
  const city = state.cities[cityId];
  const eligibility = general
    ? getHeroicCommandEligibility(state, general)
    : { eligible: false, reason: 'General not found.', chargesRemaining: 0, isFinalCharge: false, cooldownTurnsRemaining: 0 };
  const definition = general ? resolveGeneralDefinition(state, general.generalDefinitionId) : undefined;
  const durationTurns = definition ? resolveGeneralMechanics(definition).breach.durationTurns : 0;
  const base = {
    eligibility,
    available: durationTurns > 0,
    cityId,
    cityName: city?.name ?? 'Unknown city',
    durationTurns,
    hasGarrison: city
      ? Object.values(state.units).some(u => u.owner === city.owner && u.position.q === city.position.q && u.position.r === city.position.r)
      : false,
  };
  if (!general || !definition || !city) return { ...base, denial: 'No such General or city.' };
  if (durationTurns <= 0) return { ...base, denial: 'This General has no Breach command.' };
  if (!eligibility.eligible) return { ...base, denial: eligibility.reason };
  if (!getBreachTargetCityIds(state, generalUnitId).includes(cityId)) {
    return { ...base, denial: 'Choose a visible hostile city within your General\'s command range whose walls are not already open.' };
  }
  return base;
}

/**
 * Opens the walls of `cityId` to the General owner's siege for the specialty's duration. Re-runs the preview's
 * legality before its first write and returns the state unchanged when refused (no charge is ever spent on a
 * refused Breach).
 */
export function issueBreach(state: GameState, generalUnitId: string, cityId: string): GameState {
  const preview = getBreachPreview(state, generalUnitId, cityId);
  if (preview.denial !== undefined) return state;
  const general = state.units[generalUnitId]!;
  const city = state.cities[cityId]!;
  const withBreach: GameState = {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...city, breach: createCityBreach(general.owner, general.generalDefinitionId!, state.turn, preview.durationTurns) },
    },
  };
  return spendHeroicCommandCharge(withBreach, generalUnitId);
}
