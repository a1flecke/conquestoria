import type { City, GameState, HexCoord, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-definitions';
import {
  NAVAL_ACTION_COST, NAVAL_DEPLETED_AT, NAVAL_EXTENDED_AT, NAVAL_HARBOR_RADIUS_BONUS, NAVAL_MAX_AWAY_TURNS,
  NAVAL_NEAR_PORT_RECOVERY, NAVAL_PORT_RADIUS, getNavalOperationsCombatPenalty, getNavalOperationsMovementPenalty,
  readAwayTurns, statusForAwayTurns, unitParticipatesInNavalOperations,
} from './naval-endurance';
import type { NavalOperationalStatus } from './naval-endurance';
import { isCityCoastal } from './city-lifecycle';
import { getOwnedCities } from './city-ownership';
import { getFreeStandingOwnedUnits } from './unit-ownership';
import { isCityStabilized } from './supply-sources';
import { hexKey, mapDistance } from './hex-utils';

/**
 * Naval operational endurance (#883) -- the ONE owner of "can this fleet keep operating here".
 *
 * Deliberately NOT land supply (`supply-system.ts`): that models army overextension in hostile land
 * and its naval half (`supply-naval.ts`) projects supply onto *land* units. A ship's problem is
 * distance from a friendly port, so it has its own, much smaller model:
 *
 *   awayTurns  -- the only persisted fact (`Unit.navalOps`), absent = ready.
 *   status     -- derived: ready < EXTENDED_AT <= extended < DEPLETED_AT <= depleted.
 *   support    -- derived every call from CURRENT city ownership, never stored, so a captured or
 *                 razed port stops supporting the fleet the same round.
 *
 * Consumers read facts from here, never thresholds: combat (`combat-context.ts`), the per-turn
 * movement allowance (`unit-lifecycle.ts`), the AI withdrawal rule and the selected-unit panel.
 *
 * Support is OWN ports only. Open Borders and alliance grant passage (`territorial-access.ts`), not
 * replenishment -- see `.claude/rules/game-balance.md` "Passage vs Support Inventory".
 */

export * from './naval-endurance';

export interface NavalPort {
  cityId: string;
  cityName: string;
  position: HexCoord;
  radius: number;
}

/**
 * A civ's own coastal cities that have finished captured-source stabilization. Computed once per
 * civ per round (the same performance discipline as `getCivSupplySourceCandidates`).
 */
export function getNavalPorts(state: GameState, civId: string): NavalPort[] {
  return getOwnedCities(state, civId)
    .filter((city: City) => isCityStabilized(state, city) && isCityCoastal(city, state.map))
    .map((city: City) => ({
      cityId: city.id,
      cityName: city.name,
      position: city.position,
      radius: NAVAL_PORT_RADIUS + ((city.buildings ?? []).includes('harbor') ? NAVAL_HARBOR_RADIUS_BONUS : 0),
    }));
}

export type NavalSupportKind = 'in-port' | 'near-port' | 'away';

export interface NavalSupportSource {
  cityId: string;
  cityName: string;
  distance: number;
  kind: 'in-port' | 'near-port';
}

function nearestPort(state: GameState, position: HexCoord, ports: readonly NavalPort[]): { port: NavalPort; distance: number } | null {
  let best: { port: NavalPort; distance: number } | null = null;
  for (const port of ports) {
    const distance = mapDistance(state.map, port.position, position);
    if (!best || distance - port.radius < best.distance - best.port.radius
      || (distance - port.radius === best.distance - best.port.radius && hexKey(port.position) < hexKey(best.port.position))) {
      best = { port, distance };
    }
  }
  return best;
}

/** The port that is supporting this position right now, or null. */
export function getNavalSupportSource(
  state: GameState,
  civId: string,
  position: HexCoord,
  ports: readonly NavalPort[] = getNavalPorts(state, civId),
): NavalSupportSource | null {
  const inPort = ports.find(port => hexKey(port.position) === hexKey(position));
  if (inPort) return { cityId: inPort.cityId, cityName: inPort.cityName, distance: 0, kind: 'in-port' };
  const nearest = nearestPort(state, position, ports);
  if (!nearest || nearest.distance > nearest.port.radius) return null;
  return { cityId: nearest.port.cityId, cityName: nearest.port.cityName, distance: nearest.distance, kind: 'near-port' };
}

export interface NavalOperationalState {
  participates: boolean;
  status: NavalOperationalStatus;
  awayTurns: number;
  /** Null when the ship is away from every own port. */
  supportSource: NavalSupportSource | null;
  combatMultiplier: number;
  movementPenalty: number;
  /** Rounds until the next worse status if the ship stays out; null when depleted or supported. */
  turnsToNextStage: number | null;
  /** Rough rounds to reach support from here; 0 when already supported, null if there is no own port. */
  etaToSupportTurns: number | null;
  nearestPortName: string | null;
  /** Rounds spent supported to be back to ready (in port: 1). Null when already ready. */
  recoveryTurns: number | null;
  /** Plain-language facts, safe for the owner's panel. */
  reasons: string[];
}

const NOT_PARTICIPATING: NavalOperationalState = {
  participates: false, status: 'ready', awayTurns: 0, supportSource: null, combatMultiplier: 1,
  movementPenalty: 0, turnsToNextStage: null, etaToSupportTurns: null, nearestPortName: null,
  recoveryTurns: null, reasons: [],
};

/** The canonical, explainable answer. Owner-scoped: the caller must only show it for the viewer's own ship. */
export function getNavalOperationalState(
  state: GameState,
  unit: Unit,
  ports: readonly NavalPort[] = getNavalPorts(state, unit.owner),
): NavalOperationalState {
  if (!unitParticipatesInNavalOperations(unit)) return NOT_PARTICIPATING;
  const awayTurns = readAwayTurns(unit);
  const status = statusForAwayTurns(awayTurns);
  const penalty = getNavalOperationsCombatPenalty(unit);
  const movementPenalty = getNavalOperationsMovementPenalty(unit);
  const supportSource = getNavalSupportSource(state, unit.owner, unit.position, ports);

  const nearest = nearestPort(state, unit.position, ports);
  const movementPoints = Math.max(1, UNIT_DEFINITIONS[unit.type].movementPoints);
  const etaToSupportTurns = supportSource
    ? 0
    : nearest ? Math.ceil(Math.max(1, nearest.distance - nearest.port.radius) / movementPoints) : null;

  const turnsToNextStage = supportSource || status === 'depleted'
    ? null
    : (status === 'ready' ? NAVAL_EXTENDED_AT : NAVAL_DEPLETED_AT) - awayTurns;

  let recoveryTurns: number | null = null;
  if (awayTurns > 0 && status !== 'ready') {
    recoveryTurns = supportSource?.kind === 'in-port'
      ? 1
      : Math.ceil((awayTurns - (NAVAL_EXTENDED_AT - 1)) / NAVAL_NEAR_PORT_RECOVERY);
  }

  const reasons: string[] = [];
  if (supportSource?.kind === 'in-port') reasons.push(`In port at ${supportSource.cityName} — fully restored by next turn.`);
  else if (supportSource) reasons.push(`Within ${supportSource.cityName}'s port range — recovering ${NAVAL_NEAR_PORT_RECOVERY} per turn; sail into port to restore fully.`);
  else if (nearest) reasons.push(`Away from support — ${nearest.port.cityName} is the nearest port, about ${etaToSupportTurns} turn${etaToSupportTurns === 1 ? '' : 's'} away.`);
  else reasons.push('Away from support — you own no coastal city to resupply from.');
  if (status === 'extended') reasons.push(`Extended operations: ${Math.round((1 - penalty.multiplier) * 100)}% less combat strength.`);
  if (status === 'depleted') reasons.push(`Depleted: ${Math.round((1 - penalty.multiplier) * 100)}% less combat strength and ${movementPenalty} less movement.`);
  if (turnsToNextStage !== null) reasons.push(`${status === 'ready' ? 'Extended' : 'Depleted'} in ${turnsToNextStage} turn${turnsToNextStage === 1 ? '' : 's'} if it stays out.`);

  return {
    participates: true, status, awayTurns, supportSource, combatMultiplier: penalty.multiplier,
    movementPenalty, turnsToNextStage, etaToSupportTurns, nearestPortName: nearest?.port.cityName ?? null,
    recoveryTurns, reasons,
  };
}

/**
 * End-of-round progression for one civ's fleet. Immutable (returns the same state object when
 * nothing changed). Mirrors the placement of `resolveLandSupplyForCiv` in `turn-manager.ts`; reads
 * `hasActed` before the owner's next `resetUnitTurn`, exactly like land supply's attack proxy.
 */
export function resolveNavalOperationsForCiv(state: GameState, civId: string): GameState {
  const ports = getNavalPorts(state, civId);
  let units = state.units;

  for (const unit of getFreeStandingOwnedUnits(state, civId)) {
    if (!unitParticipatesInNavalOperations(unit)) continue;
    const current = readAwayTurns(unit);
    const support = getNavalSupportSource(state, civId, unit.position, ports);
    const acted = unit.hasActed === true && unit.isResting !== true;

    let next: number;
    if (support?.kind === 'in-port') next = 0;
    else if (support) next = acted ? current : Math.max(0, current - NAVAL_NEAR_PORT_RECOVERY);
    else next = Math.min(NAVAL_MAX_AWAY_TURNS, current + 1 + (acted ? NAVAL_ACTION_COST : 0));

    const unchanged = next === current && (next > 0 ? unit.navalOps?.awayTurns === next : unit.navalOps === undefined);
    if (unchanged) continue;

    units = units === state.units ? { ...state.units } : units;
    if (next === 0) {
      const { navalOps: _cleared, ...rest } = unit;
      units[unit.id] = rest as Unit;
    } else {
      units[unit.id] = { ...unit, navalOps: { awayTurns: next } };
    }
  }

  return units === state.units ? state : { ...state, units };
}
