import type { Unit } from '@/core/types';
import { classifyOwner } from '@/core/owner-kind';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { isMilitaryUnitType } from './unit-modifier-definitions';

/**
 * Naval endurance leaf (#883): thresholds, participation, and the status / penalties derived from
 * the persisted `Unit.navalOps` history alone. Pure and dependency-light on purpose, so the per-turn
 * movement allowance (`unit-lifecycle.ts`) and combat can read it without pulling in the geography
 * half (`naval-operations.ts`: ports, support, progression).
 */

export type NavalOperationalStatus = 'ready' | 'extended' | 'depleted';

/** Rounds away from support before a fleet is "extended" / "depleted". */
export const NAVAL_EXTENDED_AT = 6;
export const NAVAL_DEPLETED_AT = 12;
/** Bounded so that recovery after a long cruise always takes a handful of turns, never dozens. */
export const NAVAL_MAX_AWAY_TURNS = 16;
/** Extra endurance burned by a round in which the ship acted (fought, bombarded). */
export const NAVAL_ACTION_COST = 1;
/** Endurance restored per round spent within a port's support range but not in the port itself. */
export const NAVAL_NEAR_PORT_RECOVERY = 2;
/** Own coastal city support radius, and the bonus a Harbor adds. */
export const NAVAL_PORT_RADIUS = 2;
export const NAVAL_HARBOR_RADIUS_BONUS = 2;

export const NAVAL_EXTENDED_COMBAT_MULTIPLIER = 0.9;
export const NAVAL_DEPLETED_COMBAT_MULTIPLIER = 0.8;
export const NAVAL_DEPLETED_MOVEMENT_PENALTY = 1;

/** Only major-civ warships and transports take part; traders, minor civs, pirates and beasts never do. */
export function unitParticipatesInNavalOperations(unit: Pick<Unit, 'type' | 'owner'>): boolean {
  const definition = UNIT_DEFINITIONS[unit.type];
  if (!definition || definition.domain !== 'naval') return false;
  if (classifyOwner(unit.owner) !== 'major') return false;
  // Warships and troop carriers (hulls with cargo); civilian traders and the like never do.
  return isMilitaryUnitType(unit.type) || definition.cargoCapacity !== undefined;
}

/** Tolerant reader: a malformed or negative saved value means "ready", never a stranded navy. */
export function readAwayTurns(unit: Pick<Unit, 'navalOps'>): number {
  const value = (unit.navalOps as { awayTurns?: unknown } | null | undefined)?.awayTurns;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(NAVAL_MAX_AWAY_TURNS, Math.floor(value));
}

export function statusForAwayTurns(awayTurns: number): NavalOperationalStatus {
  if (awayTurns >= NAVAL_DEPLETED_AT) return 'depleted';
  if (awayTurns >= NAVAL_EXTENDED_AT) return 'extended';
  return 'ready';
}

/** Status from the persisted history alone -- what combat and movement consume. */
export function getNavalEnduranceStatus(unit: Pick<Unit, 'type' | 'owner' | 'navalOps'>): NavalOperationalStatus {
  if (!unitParticipatesInNavalOperations(unit)) return 'ready';
  return statusForAwayTurns(readAwayTurns(unit));
}

export interface NavalOperationsCombatPenalty {
  multiplier: number;
  label?: string;
}

export function getNavalOperationsCombatPenalty(unit: Pick<Unit, 'type' | 'owner' | 'navalOps'>): NavalOperationsCombatPenalty {
  const status = getNavalEnduranceStatus(unit);
  if (status === 'extended') {
    return { multiplier: NAVAL_EXTENDED_COMBAT_MULTIPLIER, label: `Extended operations -${Math.round((1 - NAVAL_EXTENDED_COMBAT_MULTIPLIER) * 100)}%` };
  }
  if (status === 'depleted') {
    return { multiplier: NAVAL_DEPLETED_COMBAT_MULTIPLIER, label: `Depleted fleet -${Math.round((1 - NAVAL_DEPLETED_COMBAT_MULTIPLIER) * 100)}%` };
  }
  return { multiplier: 1 };
}

export function getNavalOperationsMovementPenalty(unit: Pick<Unit, 'type' | 'owner' | 'navalOps'>): number {
  return getNavalEnduranceStatus(unit) === 'depleted' ? NAVAL_DEPLETED_MOVEMENT_PENALTY : 0;
}
