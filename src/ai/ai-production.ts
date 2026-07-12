import type {
  AIStrategicRole,
  GameState,
  PersonalityTraits,
} from '@/core/types';
import {
  BUILDINGS,
  TRAINABLE_UNITS,
  getAvailableBuildings,
  getProductionCostForItem,
  getTrainableUnitsForCity,
} from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import {
  calculateCivUnitMaintenance,
  calculateMaintenance,
  getEconomyStatusForCiv,
} from '@/systems/economy-system';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { createUnit } from '@/systems/unit-system';
import { enqueueCityProduction } from '@/systems/planning-system';
import { getActiveNationalProjectsForCiv, getReservedNationalProjectKeys } from '@/systems/national-project-system';
import type { AIForceDemand } from './ai-unit-assignment';
import { getAIStrategicRoles } from './ai-unit-roles';
import { weightProductionRoles } from './ai-personality';

export interface AIProductionCandidate {
  itemId: string;
  kind: 'unit' | 'building';
  roles: readonly AIStrategicRole[];
  productionTurns: number;
  maintenanceImpact: number;
  roleDemandScore: number;
  economyScore: number;
  personalityScore: number;
  emergencyDefenseScore: number;
  citySpecializationScore: number;
  maintenanceRisk: number;
  fulfilledRole?: AIStrategicRole;
  score: number;
}

const COMBAT_CARGO_ROLES = new Set<AIStrategicRole>([
  'capture',
  'frontline',
  'ranged',
  'siege',
  'mobile',
]);

const UNIQUE_SUPPORT_ROLES = new Set<AIStrategicRole>(['recon', 'detection']);

function cloneDemands(demands: readonly AIForceDemand[]): AIForceDemand[] {
  return demands.map(entry => ({
    ...entry,
    sourcePlanIds: [...entry.sourcePlanIds],
    missing: Math.max(0, Math.floor(entry.missing)),
  }));
}

function validQueuedUnitRoles(
  state: GameState,
  civId: string,
): AIStrategicRole[][] {
  const civ = state.civilizations[civId];
  if (!civ) return [];
  const resources = getCivAvailableResources(state, civId);
  return civ.cities.flatMap(cityId => {
    const city = state.cities[cityId];
    if (!city) return [];
    const validTypes = new Set(
      getTrainableUnitsForCity(
        city,
        civ.techState.completed,
        state.map,
        civ.civType,
        resources,
      ).map(unit => unit.type),
    );
    return city.productionQueue.flatMap(itemId =>
      validTypes.has(itemId as never)
        ? [[...getAIStrategicRoles(itemId as never)]]
        : []);
  });
}

function residualDemands(
  state: GameState,
  civId: string,
  demands: readonly AIForceDemand[],
): AIForceDemand[] {
  const residual = cloneDemands(demands);
  for (const roles of validQueuedUnitRoles(state, civId)) {
    const matching = residual
      .filter(entry => entry.missing > 0 && roles.includes(entry.role))
      .sort((left, right) =>
        right.priority - left.priority || left.role.localeCompare(right.role))[0];
    if (matching) matching.missing -= 1;
  }
  return residual;
}

function matchingDemand(
  roles: readonly AIStrategicRole[],
  demands: readonly AIForceDemand[],
): AIForceDemand | undefined {
  return demands
    .filter(entry => entry.missing > 0 && roles.includes(entry.role))
    .sort((left, right) =>
      right.priority - left.priority
      || right.missing - left.missing
      || left.role.localeCompare(right.role))[0];
}

function isEmergencyDemand(demand: AIForceDemand | undefined, cityId: string): boolean {
  return Boolean(
    demand
    && (
      demand.priority >= 500
      || demand.sourcePlanIds.includes(`defense-overflow:${cityId}`)
      || demand.sourcePlanIds.some(id => id.includes(cityId) && id.includes('defend'))
    ),
  );
}

function projectedUnitMaintenanceImpact(
  state: GameState,
  civId: string,
  cityId: string,
  type: (typeof TRAINABLE_UNITS)[number]['type'],
): number {
  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  if (!city || !civ) return 0;
  const before = calculateCivUnitMaintenance(state, civId).upkeep;
  const counters = structuredClone(state.idCounters);
  const unit = createUnit(type, civId, city.position, counters);
  unit.id = `forecast:${cityId}:${type}`;
  const projected: GameState = {
    ...state,
    units: { ...state.units, [unit.id]: unit },
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        units: [...civ.units, unit.id],
      },
    },
  };
  return Math.max(0, calculateCivUnitMaintenance(projected, civId).upkeep - before);
}

function projectedBuildingMaintenanceImpact(
  state: GameState,
  civId: string,
  cityId: string,
  buildingId: string,
): number {
  const city = state.cities[cityId];
  if (!city) return 0;
  const before = calculateMaintenance(state, civId);
  const projected: GameState = {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: {
        ...city,
        buildings: [...city.buildings, buildingId],
      },
    },
  };
  const after = calculateMaintenance(projected, civId);
  return Math.max(
    0,
    after.buildingUpkeep + after.unitUpkeep
      - before.buildingUpkeep - before.unitUpkeep,
  );
}

export function economyValue(buildingId: string): number {
  const building = BUILDINGS[buildingId];
  const yields = building?.nationalProject
    ? building.civYieldBonus ?? building.yields
    : building?.yields;
  const yieldScore = yields
    ? (yields.food ?? 0)
      + (yields.production ?? 0) * 1.25
      + (yields.gold ?? 0) * 1.5
      + (yields.science ?? 0) * 1.25
    : 0;
  // Happiness (#552): weighted flat, same scalar as +1 gold — there is no
  // per-city "need" signal already threaded through this scoring function to
  // condition on (e.g. current unrest pressure), so a flat weight is the
  // simplest change that makes the AI value the same buildings players do,
  // without inventing a new signal path. Revisit if a future MR adds one.
  const happinessScore = (building?.happiness ?? 0) * 1.5;
  return yieldScore + happinessScore;
}

function reserveAllows(
  state: GameState,
  civId: string,
  maintenanceImpact: number,
  emergency: boolean,
  economyScore: number,
): boolean {
  const civ = state.civilizations[civId];
  if (!civ) return false;
  const status = getEconomyStatusForCiv(state, civId);
  const maintenance = calculateMaintenance(state, civId);
  const projectedMaintenance = maintenance.buildingUpkeep
    + maintenance.unitUpkeep
    + maintenanceImpact;
  const reserveRounds = status.strainLevel === 'none' ? 1 : 2;
  const hasReserve = civ.gold >= projectedMaintenance * reserveRounds;

  if (status.strainLevel === 'critical') {
    return emergency || (economyScore > 0 && maintenanceImpact === 0);
  }
  if (status.strainLevel === 'high') {
    return hasReserve && (emergency || economyScore > 0);
  }
  return hasReserve;
}

function generateWithResidual(
  state: GameState,
  civId: string,
  cityId: string,
  demands: readonly AIForceDemand[],
  personality: PersonalityTraits,
): AIProductionCandidate[] {
  const civ = state.civilizations[civId];
  const city = state.cities[cityId];
  if (!civ || !city || city.owner !== civId) return [];
  const resources = getCivAvailableResources(state, civId);
  const civDefinition = resolveCivDefinition(state, civ.civType ?? '');
  const productionPerTurn = Math.max(
    1,
    calculateProjectedCityYields(state, cityId, civDefinition?.bonusEffect).production,
  );
  const builtNationalProjectKeys = getReservedNationalProjectKeys(state, civId);
  const activeNationalProjects = getActiveNationalProjectsForCiv(state, civId);
  const cargoDemand = demands.some(entry =>
    entry.missing > 0 && COMBAT_CARGO_ROLES.has(entry.role));
  const needsCaptureCapacity = demands.some(entry =>
    entry.missing > 0 && (entry.role === 'capture' || entry.role === 'frontline'));
  const hasCaptureCapacity = civ.units.some(unitId => {
    const unit = state.units[unitId];
    if (!unit) return false;
    const roles = getAIStrategicRoles(unit.type);
    return roles.includes('capture') || roles.includes('frontline');
  }) || validQueuedUnitRoles(state, civId).some(roles =>
    roles.includes('capture') || roles.includes('frontline'));
  const candidates: AIProductionCandidate[] = [];

  for (const unit of getTrainableUnitsForCity(
    city,
    civ.techState.completed,
    state.map,
    civ.civType,
    resources,
  )) {
    const roles = getAIStrategicRoles(unit.type);
    const fulfilled = matchingDemand(roles, demands);
    if (!fulfilled) continue;
    if (roles.includes('transport') && !cargoDemand) continue;
    if (
      needsCaptureCapacity
      && !hasCaptureCapacity
      && !roles.includes('capture')
      && !roles.includes('frontline')
      && (roles.includes('siege') || roles.includes('ranged'))
    ) {
      continue;
    }
    if (
      roles.some(role => UNIQUE_SUPPORT_ROLES.has(role))
      && !roles.some(role =>
        demands.some(entry =>
          entry.role === role && entry.missing > 0))
    ) {
      continue;
    }
    const emergency = isEmergencyDemand(fulfilled, cityId);
    const maintenanceImpact = projectedUnitMaintenanceImpact(
      state,
      civId,
      cityId,
      unit.type,
    );
    if (!reserveAllows(state, civId, maintenanceImpact, emergency, 0)) continue;
    const cost = getProductionCostForItem(unit.type, {
      city,
      bonusEffect: civDefinition?.bonusEffect,
      era: state.era,
      completedTechs: civ.techState.completed,
      activeNationalProjects,
      availableResources: resources,
    });
    const productionTurns = Math.max(1, Math.ceil(cost / productionPerTurn));
    const roleDemandScore = fulfilled.missing * 40 + fulfilled.priority / 5;
    const emergencyDefenseScore = emergency ? 10 : 0;
    const personalityScore = weightProductionRoles(personality, roles);
    const citySpecializationScore = city.buildings.includes('barracks')
      && roles.some(role => COMBAT_CARGO_ROLES.has(role))
      ? 2
      : 0;
    const maintenanceRisk = maintenanceImpact;
    const score = roleDemandScore * 4
      + emergencyDefenseScore * 3
      + personalityScore
      + citySpecializationScore
      - productionTurns * 1.5
      - maintenanceRisk * 3;
    candidates.push({
      itemId: unit.type,
      kind: 'unit',
      roles,
      productionTurns,
      maintenanceImpact,
      roleDemandScore,
      economyScore: 0,
      personalityScore,
      emergencyDefenseScore,
      citySpecializationScore,
      maintenanceRisk,
      fulfilledRole: fulfilled.role,
      score,
    });
  }

  for (const building of getAvailableBuildings(
    city,
    civ.techState.completed,
    state.map,
    resources,
    state.era,
    builtNationalProjectKeys,
    civId,
  )) {
    const economyScore = economyValue(building.id);
    const maintenanceImpact = projectedBuildingMaintenanceImpact(
      state,
      civId,
      cityId,
      building.id,
    );
    if (!reserveAllows(state, civId, maintenanceImpact, false, economyScore)) continue;
    const cost = getProductionCostForItem(building.id, {
      city,
      bonusEffect: civDefinition?.bonusEffect,
      era: state.era,
      completedTechs: civ.techState.completed,
      activeNationalProjects,
      availableResources: resources,
    });
    const productionTurns = Math.max(1, Math.ceil(cost / productionPerTurn));
    const personalityScore = weightProductionRoles(personality, []);
    const citySpecializationScore = building.category === city.focus ? 1 : 0;
    const maintenanceRisk = maintenanceImpact;
    const score = economyScore * 2
      + personalityScore
      + citySpecializationScore
      - productionTurns * 1.5
      - maintenanceRisk * 3;
    candidates.push({
      itemId: building.id,
      kind: 'building',
      roles: [],
      productionTurns,
      maintenanceImpact,
      roleDemandScore: 0,
      economyScore,
      personalityScore,
      emergencyDefenseScore: 0,
      citySpecializationScore,
      maintenanceRisk,
      score,
    });
  }

  return candidates.sort((left, right) =>
    right.score - left.score || left.itemId.localeCompare(right.itemId));
}

export function generateAIProductionCandidates(
  state: GameState,
  civId: string,
  cityId: string,
  demands: readonly AIForceDemand[],
  personality: PersonalityTraits,
): AIProductionCandidate[] {
  return generateWithResidual(
    state,
    civId,
    cityId,
    residualDemands(state, civId, demands),
    personality,
  );
}

export function applyAIProduction(
  state: GameState,
  civId: string,
  demands: readonly AIForceDemand[],
  personality: PersonalityTraits,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  const residual = residualDemands(state, civId, demands);
  const idleCities = civ.cities
    .map(cityId => state.cities[cityId])
    .filter(city => city?.owner === civId && city.productionQueue.length === 0)
    .sort((left, right) => {
      const leftEmergency = residual.some(entry =>
        entry.missing > 0 && isEmergencyDemand(entry, left.id)) ? 1 : 0;
      const rightEmergency = residual.some(entry =>
        entry.missing > 0 && isEmergencyDemand(entry, right.id)) ? 1 : 0;
      if (leftEmergency !== rightEmergency) return rightEmergency - leftEmergency;
      const leftEta = generateWithResidual(state, civId, left.id, residual, personality)[0]
        ?.productionTurns ?? Number.POSITIVE_INFINITY;
      const rightEta = generateWithResidual(state, civId, right.id, residual, personality)[0]
        ?.productionTurns ?? Number.POSITIVE_INFINITY;
      return leftEta - rightEta || left.id.localeCompare(right.id);
    });
  let nextState = state;

  for (const city of idleCities) {
    const current = nextState.cities[city.id];
    if (!current || current.productionQueue.length > 0) continue;
    const selected = generateWithResidual(
      nextState,
      civId,
      city.id,
      residual,
      personality,
    )[0];
    if (!selected) continue;
    nextState = {
      ...nextState,
      cities: {
        ...nextState.cities,
        [city.id]: enqueueCityProduction(current, selected.itemId),
      },
    };
    if (selected.fulfilledRole) {
      const fulfilled = residual.find(entry => entry.role === selected.fulfilledRole);
      if (fulfilled) fulfilled.missing = Math.max(0, fulfilled.missing - 1);
    }
  }

  return nextState;
}
