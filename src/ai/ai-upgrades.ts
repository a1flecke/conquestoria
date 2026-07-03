import type { EventBus } from '@/core/event-bus';
import {
  OPPONENT_CHALLENGE_PROFILES,
  resolveOpponentChallenge,
} from '@/core/opponent-challenge';
import type {
  City,
  GameState,
  MajorCivPlanPortfolio,
  Unit,
} from '@/core/types';
import { getCityAppeaseCost } from '@/systems/faction-system';
import { calculateMaintenance } from '@/systems/economy-system';
import {
  TRAINABLE_UNITS,
  getCatalogProductionCost,
} from '@/systems/city-system';
import { findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import {
  applyUnitUpgradeToState,
  getCanonicalUpgradeTarget,
  getUpgradeCost,
} from '@/systems/unit-upgrade-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import type { PreparedMajorCivPlan } from './ai-prepared-turn';
import { getAIStrategicRoles, hasAICombatRole } from './ai-unit-roles';
import { isAIHostileOwner } from './ai-hostility';

export interface ProcessAIUpgradesResult {
  state: GameState;
  upgradedUnitIds: string[];
  routedUnitIds: string[];
}

const NEVER_ROUTE_ROLES = new Set([
  'settlement',
  'worker',
  'resource-expedition',
  'trade',
  'transport',
]);

function distance(
  state: GameState,
  left: { q: number; r: number },
  right: { q: number; r: number },
): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(left, right, state.map.width)
    : hexDistance(left, right);
}

function safeCity(
  state: GameState,
  civId: string,
  city: City,
  prepared: PreparedMajorCivPlan,
): boolean {
  if (city.owner !== civId) return false;
  if (prepared.portfolio.defensePlansByCityId[city.id]) return false;
  return !prepared.perception.units.some(unit =>
    unit.owner !== civId
    && unit.position
    && isAIHostileOwner(state, civId, unit.owner)
    && distance(state, city.position, unit.position) <= 2);
}

function assignedPlanIds(
  prepared: PreparedMajorCivPlan,
  unitId: string,
): string[] {
  return Object.entries(prepared.assignments.assignmentsByPlanId)
    .filter(([, unitIds]) => unitIds.includes(unitId))
    .map(([planId]) => planId);
}

function urgentDefenseAssignment(
  prepared: PreparedMajorCivPlan,
  unitId: string,
): boolean {
  const defensePlanIds = new Set(
    Object.values(prepared.portfolio.defensePlansByCityId).map(plan => plan.id),
  );
  return assignedPlanIds(prepared, unitId).some(planId => defensePlanIds.has(planId));
}

function eligibleForModernization(
  unit: Unit,
  completedTechs: readonly string[],
): boolean {
  if (!getCanonicalUpgradeTarget(unit, completedTechs)) return false;
  const roles = getAIStrategicRoles(unit.type);
  if (roles.includes('espionage')) return true;
  return !roles.some(role => NEVER_ROUTE_ROLES.has(role))
    && hasAICombatRole(unit.type);
}

function treasuryReserve(state: GameState, civId: string): number {
  const maintenance = calculateMaintenance(state, civId);
  const projectedTwoTurnMaintenance = 2
    * (maintenance.buildingUpkeep + maintenance.unitUpkeep);
  const cheapestEmergencyFrontlineCost = Math.min(
    ...TRAINABLE_UNITS
      .filter(unit => getAIStrategicRoles(unit.type).includes('frontline'))
      .map(unit => getCatalogProductionCost(unit.type, state.era)),
  );
  const cityAppeasementReserve = Math.max(
    0,
    ...Object.values(state.cities)
      .filter(city => city.owner === civId && city.unrestLevel > 0)
      .map(getCityAppeaseCost),
  );
  return Math.max(
    projectedTwoTurnMaintenance,
    cheapestEmergencyFrontlineCost,
    cityAppeasementReserve,
  );
}

function updatePortfolio(
  state: GameState,
  civId: string,
  portfolio: MajorCivPlanPortfolio,
): GameState {
  if (!state.opponentAI) return state;
  return {
    ...state,
    opponentAI: {
      ...state.opponentAI,
      majorCivs: {
        ...state.opponentAI.majorCivs,
        [civId]: portfolio,
      },
    },
  };
}

function cityAtUnit(
  state: GameState,
  civId: string,
  unit: Unit,
): City | undefined {
  return Object.values(state.cities)
    .filter(city => city.owner === civId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .find(city =>
      city.position.q === unit.position.q
      && city.position.r === unit.position.r);
}

function routePath(
  state: GameState,
  unit: Unit,
  city: City,
  completedTechs: readonly string[],
) {
  return findPath(
    unit.position,
    city.position,
    state.map,
    UNIT_DEFINITIONS[unit.type].domain ?? 'land',
    { unit, completedTechs: [...completedTechs] },
  );
}

export function processAIUpgrades(
  state: GameState,
  civId: string,
  prepared: PreparedMajorCivPlan,
  bus: EventBus,
): ProcessAIUpgradesResult {
  const civ = state.civilizations[civId];
  if (!civ) return { state, upgradedUnitIds: [], routedUnitIds: [] };
  let working = structuredClone(state);
  let portfolio = structuredClone(
    working.opponentAI?.majorCivs[civId] ?? prepared.portfolio,
  );
  const upgradedUnitIds: string[] = [];
  const routedUnitIds: string[] = [];
  const reserve = treasuryReserve(working, civId);
  const challenge = resolveOpponentChallenge(working);
  const profile = OPPONENT_CHALLENGE_PROFILES[challenge];
  let remainingCap = Math.max(
    1,
    Math.ceil(profile.maxPrimaryForce / 2) - 1,
  );

  for (const unitId of Object.keys(portfolio.upgradeRoutesByUnitId).sort()) {
    const unit = working.units[unitId];
    const route = portfolio.upgradeRoutesByUnitId[unitId];
    const city = route ? working.cities[route.cityId] : undefined;
    if (
      !unit
      || unit.owner !== civId
      || !city
      || !eligibleForModernization(unit, civ.techState.completed)
      || !safeCity(working, civId, city, prepared)
      || urgentDefenseAssignment(prepared, unitId)
    ) {
      delete portfolio.upgradeRoutesByUnitId[unitId];
      continue;
    }
    const path = routePath(working, unit, city, civ.techState.completed);
    if (!path) {
      delete portfolio.upgradeRoutesByUnitId[unitId];
      continue;
    }
    if (path.length === 1) continue;
    const movement = executeUnitMove(working, unitId, path[1], {
      actor: 'ai',
      civId,
      bus,
    });
    if (!movement.ok) {
      delete portfolio.upgradeRoutesByUnitId[unitId];
      continue;
    }
    routedUnitIds.push(unitId);
  }

  const candidates = civ.units
    .map(unitId => working.units[unitId])
    .filter((unit): unit is Unit =>
      Boolean(unit)
      && unit.owner === civId
      && eligibleForModernization(unit, civ.techState.completed))
    .sort((left, right) => {
      const leftCity = cityAtUnit(working, civId, left);
      const rightCity = cityAtUnit(working, civId, right);
      const leftSafe = leftCity && safeCity(working, civId, leftCity, prepared) ? 1 : 0;
      const rightSafe = rightCity && safeCity(working, civId, rightCity, prepared) ? 1 : 0;
      return rightSafe - leftSafe
        || right.experience - left.experience
        || left.id.localeCompare(right.id);
    });

  for (const unit of candidates) {
    const current = working.units[unit.id];
    if (!current || current.hasActed) continue;
    const targetType = getCanonicalUpgradeTarget(
      current,
      working.civilizations[civId].techState.completed,
    );
    if (!targetType) continue;
    const city = cityAtUnit(working, civId, current);
    if (city && safeCity(working, civId, city, prepared) && remainingCap > 0) {
      const cost = getUpgradeCost(targetType);
      if (working.civilizations[civId].gold - cost < reserve) continue;
      const result = applyUnitUpgradeToState(
        working,
        current.id,
        targetType,
      );
      if (!result.upgraded) continue;
      working = result.state;
      upgradedUnitIds.push(current.id);
      remainingCap -= 1;
      delete portfolio.upgradeRoutesByUnitId[current.id];
      continue;
    }
    if (portfolio.upgradeRoutesByUnitId[current.id]) continue;
    if (assignedPlanIds(prepared, current.id).length > 0) continue;
    const onlyCombatUnit = civ.units
      .map(unitId => working.units[unitId])
      .filter(candidate => candidate && hasAICombatRole(candidate.type))
      .length === 1;
    if (
      onlyCombatUnit
      && Object.keys(prepared.portfolio.defensePlansByCityId).length > 0
    ) {
      continue;
    }
    const destinations = Object.values(working.cities)
      .filter(cityCandidate => safeCity(
        working,
        civId,
        cityCandidate,
        prepared,
      ))
      .flatMap(cityCandidate => {
        const path = routePath(
          working,
          current,
          cityCandidate,
          civ.techState.completed,
        );
        if (!path) return [];
        const rounds = Math.ceil(
          Math.max(0, path.length - 1)
          / Math.max(1, UNIT_DEFINITIONS[current.type].movementPoints),
        );
        return rounds <= 6 ? [{ city: cityCandidate, path, rounds }] : [];
      })
      .sort((left, right) =>
        left.rounds - right.rounds
        || left.path.length - right.path.length
        || left.city.id.localeCompare(right.city.id));
    const destination = destinations[0];
    if (!destination) continue;
    portfolio.upgradeRoutesByUnitId[current.id] = {
      cityId: destination.city.id,
      createdTurn: working.turn,
    };
    const movement = destination.path.length > 1
      ? executeUnitMove(working, current.id, destination.path[1], {
          actor: 'ai',
          civId,
          bus,
        })
      : null;
    if (movement && !movement.ok) {
      delete portfolio.upgradeRoutesByUnitId[current.id];
      continue;
    }
    routedUnitIds.push(current.id);
  }

  portfolio = {
    ...portfolio,
    upgradeRoutesByUnitId: { ...portfolio.upgradeRoutesByUnitId },
  };
  working = updatePortfolio(working, civId, portfolio);
  return { state: working, upgradedUnitIds, routedUnitIds };
}
