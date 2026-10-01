import type { AirBaseRef, GameState, Unit } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { getNavalEnduranceStatus } from './naval-endurance';

/**
 * Aircraft readiness (#884) -- the ONE owner of "can this aircraft fly another effective mission".
 *
 * Distinct from `hasActed` (one mission per turn, resets every turn) and from naval endurance
 * (#883, distance-from-port): this is a multi-turn *tempo* ledger. Missions add strain, an idle
 * round at a supporting base removes it, and a worn/spent aircraft is weaker or grounded for
 * strikes. Persisted state is only `Unit.airStrain` (absent = ready); status, base support and
 * carrier limits are derived from current state every call.
 *
 * Base support reads facts that exist today: a city base's `hp` (bombardment/siege damage) and a
 * carrier base's #883 naval status through `getNavalEnduranceStatus` -- never a copy of that math.
 * Support is the aircraft's own base only; Open Borders/alliance grant no air basing (#870).
 */

export type AirReadinessStatus = 'ready' | 'worn' | 'spent';
export type AirReadinessMission = 'strike' | 'recon' | 'patrol' | 'interception';

export const AIR_WORN_AT = 3;
export const AIR_SPENT_AT = 6;
export const AIR_MAX_STRAIN = 8;
export const AIR_RECOVERY_PER_ROUND = 2;
export const AIR_DEGRADED_BASE_RECOVERY = 1;
/** A city base below this HP (siege / bombardment damage) is a damaged airfield. */
export const AIR_DAMAGED_BASE_HP = 50;

export const AIR_MISSION_STRAIN: Record<AirReadinessMission, number> = {
  strike: 2,
  recon: 1,
  patrol: 1,
  interception: 1,
};

export const AIR_WORN_COMBAT_MULTIPLIER = 0.9;
export const AIR_SPENT_COMBAT_MULTIPLIER = 0.8;

export function unitParticipatesInAirReadiness(unit: Pick<Unit, 'type' | 'owner'>): boolean {
  return UNIT_DEFINITIONS[unit.type]?.airOperation !== undefined && classifyOwner(unit.owner) === 'major';
}

function readStrain(unit: Pick<Unit, 'airStrain'>): number {
  const value = unit.airStrain as unknown;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(AIR_MAX_STRAIN, Math.floor(value));
}

function statusFor(strain: number): AirReadinessStatus {
  if (strain >= AIR_SPENT_AT) return 'spent';
  if (strain >= AIR_WORN_AT) return 'worn';
  return 'ready';
}

export function getAirReadinessStatus(unit: Pick<Unit, 'type' | 'owner' | 'airStrain'>): AirReadinessStatus {
  return unitParticipatesInAirReadiness(unit) ? statusFor(readStrain(unit)) : 'ready';
}

export function getAirReadinessCombatPenalty(unit: Pick<Unit, 'type' | 'owner' | 'airStrain'>): { multiplier: number; label?: string } {
  const status = getAirReadinessStatus(unit);
  if (status === 'worn') return { multiplier: AIR_WORN_COMBAT_MULTIPLIER, label: `Aircraft readiness -${Math.round((1 - AIR_WORN_COMBAT_MULTIPLIER) * 100)}%` };
  if (status === 'spent') return { multiplier: AIR_SPENT_COMBAT_MULTIPLIER, label: `Aircraft readiness -${Math.round((1 - AIR_SPENT_COMBAT_MULTIPLIER) * 100)}%` };
  return { multiplier: 1 };
}

/** Returns the unit with `mission`'s strain added (bounded). Used by the mission executors. */
export function withAirStrain<T extends Unit>(unit: T, mission: AirReadinessMission): T {
  if (!unitParticipatesInAirReadiness(unit)) return unit;
  const next = Math.min(AIR_MAX_STRAIN, readStrain(unit) + AIR_MISSION_STRAIN[mission]);
  return { ...unit, airStrain: next };
}

export type AirBaseSupportReason = 'healthy' | 'damaged-base' | 'carrier-extended' | 'carrier-depleted' | 'no-base';

export interface AirBaseSupport {
  recoveryPerRound: number;
  reason: AirBaseSupportReason;
  baseName: string | null;
}

export function getAirBaseSupport(state: GameState, unit: Pick<Unit, 'owner' | 'airBase'>): AirBaseSupport {
  const base: AirBaseRef | undefined = unit.airBase;
  if (!base) return { recoveryPerRound: 0, reason: 'no-base', baseName: null };
  if (base.kind === 'city') {
    const city = state.cities[base.cityId];
    if (!city || city.owner !== unit.owner) return { recoveryPerRound: 0, reason: 'no-base', baseName: null };
    const damaged = (city.hp ?? 100) < AIR_DAMAGED_BASE_HP;
    return {
      recoveryPerRound: damaged ? AIR_DEGRADED_BASE_RECOVERY : AIR_RECOVERY_PER_ROUND,
      reason: damaged ? 'damaged-base' : 'healthy',
      baseName: city.name ?? 'its airfield',
    };
  }
  const carrier = state.units[base.unitId];
  if (!carrier || carrier.owner !== unit.owner) return { recoveryPerRound: 0, reason: 'no-base', baseName: null };
  const name = UNIT_DEFINITIONS[carrier.type]?.name ?? 'Carrier';
  const naval = getNavalEnduranceStatus(carrier);
  if (naval === 'depleted') return { recoveryPerRound: 0, reason: 'carrier-depleted', baseName: name };
  if (naval === 'extended') return { recoveryPerRound: AIR_DEGRADED_BASE_RECOVERY, reason: 'carrier-extended', baseName: name };
  return { recoveryPerRound: AIR_RECOVERY_PER_ROUND, reason: 'healthy', baseName: name };
}

export type AirMissionDenialReason = 'spent' | 'carrier-depleted';
export interface AirMissionDenial {
  reason: AirMissionDenialReason;
  message: string;
}

export const AIR_MISSION_DENIAL_MESSAGES: Record<AirMissionDenialReason, string> = {
  spent: 'This aircraft is spent — let it rest a few turns at its base (no missions) before another strike.',
  'carrier-depleted': 'Its carrier is depleted and cannot sustain strikes — bring the carrier into port first.',
};

/** The one gate for high-intensity (strike) missions. Lighter missions are never blocked by readiness. */
export function getAirMissionDenial(
  state: GameState,
  unitId: string,
  mission: 'strike' | 'recon' | 'patrol' | 'intercept' | 'rebase',
): AirMissionDenial | null {
  const unit = state.units[unitId];
  if (!unit || mission !== 'strike' || !unitParticipatesInAirReadiness(unit)) return null;
  if (getAirReadinessStatus(unit) === 'spent') return { reason: 'spent', message: AIR_MISSION_DENIAL_MESSAGES.spent };
  if (getAirBaseSupport(state, unit).reason === 'carrier-depleted') {
    return { reason: 'carrier-depleted', message: AIR_MISSION_DENIAL_MESSAGES['carrier-depleted'] };
  }
  return null;
}

export interface AirReadinessState {
  participates: boolean;
  status: AirReadinessStatus;
  strain: number;
  combatMultiplier: number;
  support: AirBaseSupport;
  /** Idle rounds to be ready again at the current base; null when ready or the base gives no recovery. */
  recoveryTurns: number | null;
  strikeDenial: AirMissionDenial | null;
  reasons: string[];
}

/** Explainable, owner-scoped answer for the panel and AI. */
export function getAirReadinessState(state: GameState, unit: Unit): AirReadinessState {
  const support = getAirBaseSupport(state, unit);
  if (!unitParticipatesInAirReadiness(unit)) {
    return { participates: false, status: 'ready', strain: 0, combatMultiplier: 1, support, recoveryTurns: null, strikeDenial: null, reasons: [] };
  }
  const strain = readStrain(unit);
  const status = statusFor(strain);
  const penalty = getAirReadinessCombatPenalty(unit);
  const recoveryTurns = strain >= AIR_WORN_AT && support.recoveryPerRound > 0
    ? Math.ceil((strain - (AIR_WORN_AT - 1)) / support.recoveryPerRound)
    : null;
  const strikeDenial = getAirMissionDenial(state, unit.id, 'strike');
  const reasons: string[] = [];
  if (status === 'worn') reasons.push(`Worn: ${Math.round((1 - penalty.multiplier) * 100)}% less combat strength from recent missions.`);
  if (status === 'spent') reasons.push(`Spent: ${Math.round((1 - penalty.multiplier) * 100)}% less combat strength and cannot strike until rested.`);
  if (support.reason === 'damaged-base') reasons.push(`${support.baseName} is badly damaged — aircraft recover at half speed there.`);
  if (support.reason === 'carrier-extended') reasons.push(`${support.baseName} is on extended operations — aircraft recover at half speed aboard.`);
  if (support.reason === 'carrier-depleted') reasons.push(`${support.baseName} is depleted — aircraft cannot recover or strike from it.`);
  if (status !== 'ready' && recoveryTurns !== null) reasons.push(`Ready again in about ${recoveryTurns} idle turn${recoveryTurns === 1 ? '' : 's'} (a mission or rebase uses the turn and pauses recovery).`);
  return { participates: true, status, strain, combatMultiplier: penalty.multiplier, support, recoveryTurns, strikeDenial, reasons };
}

/**
 * End-of-round recovery for one civ's air wings. Reads `hasActed` before the owner's next unit
 * reset (same placement as land supply / naval endurance): a round with a mission, rebase or
 * intercept stance gives no recovery. Immutable; returns the same state when nothing changed.
 */
export function resolveAirReadinessForCiv(state: GameState, civId: string): GameState {
  let units = state.units;
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId || !unitParticipatesInAirReadiness(unit)) continue;
    const strain = readStrain(unit);
    if (strain === 0 && unit.airStrain === undefined) continue;
    if (unit.hasActed) continue;
    const next = Math.max(0, strain - getAirBaseSupport(state, unit).recoveryPerRound);
    if (next === strain && unit.airStrain === strain) continue;
    units = units === state.units ? { ...state.units } : units;
    if (next === 0) {
      const { airStrain: _cleared, ...rest } = unit;
      units[unit.id] = rest as Unit;
    } else {
      units[unit.id] = { ...unit, airStrain: next };
    }
  }
  return units === state.units ? state : { ...state, units };
}
