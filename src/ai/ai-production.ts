import type {
  AIStrategicRole,
  GameState,
  PersonalityTraits,
  TrainableUnitEntry,
} from '@/core/types';
import {
  BUILDINGS,
  TRAINABLE_UNITS,
  getAvailableBuildings,
  getProductionCostForItem,
  getTrainableUnitsForCity,
  cityFollowsOwnFaith,
} from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import {
  calculateCivUnitMaintenance,
  calculateMaintenance,
  getEconomyStatusForCiv,
} from '@/systems/economy-system';
import { getCivAvailableResources, getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import {
  UNREST_RELIEF_SOURCES,
  UNREST_TRIGGER_PRESSURE,
  computeUnrestPressure,
} from '@/systems/faction-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { canCompleteAirUnitProduction, getAirBaseRoster } from '@/systems/air-operations-system';
import { enqueueCityProduction } from '@/systems/planning-system';
import { getActiveNationalProjectsForCiv, getCircularManufacturingMaterial, getReservedNationalProjectKeys } from '@/systems/national-project-system';
import { getArsenalStatus } from '@/systems/strategic-arsenal-system';
import type { AIForceDemand } from './ai-unit-assignment';
import { getAIStrategicRoles } from './ai-unit-roles';
import { weightProductionRoles } from './ai-personality';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getVisibility } from '@/systems/fog-of-war';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { isAIHostileOwner } from './ai-hostility';
import { buildMajorCivPerception } from './ai-perception';
import { getChallengeProfileForCiv } from '@/core/opponent-challenge';
import { getMarginalCivResearchGain } from '@/systems/research-output-system';

export interface AIProductionCandidate {
  itemId: string;
  kind: 'unit' | 'building';
  roles: readonly AIStrategicRole[];
  productionTurns: number;
  maintenanceImpact: number;
  roleDemandScore: number;
  economyScore: number;
  researchValueScore: number;
  personalityScore: number;
  emergencyDefenseScore: number;
  citySpecializationScore: number;
  maintenanceRisk: number;
  defensiveEspionageScore: number;
  airDefenseThreatScore: number;
  submarineThreatScore: number;
  carrierCompositionScore: number;
  strategicArsenalValueScore: number;
  unrestReliefScore: number;
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
        cityFollowsOwnFaith(state, city),
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

// A milestone national project (#591 MR4) has no civYieldBonus by contract -- its
// effect is a one-time state mutation (e.g. founding a religion), not an ongoing
// yield. Scoring it via yields alone would value it at 0, deeply undercutting its
// production cost in the candidate score formula below and making the AI functionally
// never build it. Flat value roughly matching a mid-tier same-era normal NP (e.g.
// era 3's iron_legion at 2.5, philosophers_circle at 3.75) -- generic to the
// `milestone` flag, not sacred_council-specific, so any future milestone NP scores
// reasonably without a new branch here.
const MILESTONE_NP_ECONOMY_VALUE = 4;

export function economyValue(buildingId: string, researchValueScore?: number): number {
  const building = BUILDINGS[buildingId];
  if (building?.nationalProject?.milestone) return MILESTONE_NP_ECONOMY_VALUE;
  const yields = building?.nationalProject
    ? building.civYieldBonus ?? building.yields
    : building?.yields;
  const yieldScore = yields
    ? (yields.food ?? 0)
      + (yields.production ?? 0) * 1.25
      + (yields.gold ?? 0) * 1.5
      + (researchValueScore ?? (yields.science ?? 0) * 1.25)
    : 0;
  // Happiness (#552): weighted flat, same scalar as +1 gold — there is no
  // per-city "need" signal already threaded through this scoring function to
  // condition on (e.g. current unrest pressure), so a flat weight is the
  // simplest change that makes the AI value the same buildings players do,
  // without inventing a new signal path. Revisit if a future MR adds one.
  const happinessScore = (building?.happiness ?? 0) * 1.5;
  return yieldScore + happinessScore;
}

const STRATEGIC_ARSENAL_VALUE_PER_WAR = 35;
const STRATEGIC_ARSENAL_VALUE_MAX_WARS = 3;

/**
 * #545: bounded, capability-driven value signal for any arsenalCapacityGated item
 * (only `warhead` today) -- without this, such an item nets a reliably negative
 * score under generic economyValue scoring (zero yields), and the AI would never
 * build one. Threat-conditioned (scales with current war count, capped) rather than
 * a flat bonus, matching this file's existing airDefenseThreatScore precedent and
 * the general principle (seen across other 4X AI design) that WMD-class production
 * eagerness should be driven by real strategic context, not a flat economic value.
 * Generic via Building.arsenalCapacityGated -- not an id branch; a future similar
 * item is covered automatically. Buildings only (units never carry
 * arsenalCapacityGated), so the two unit-candidate call sites always pass 0.
 */
function strategicArsenalValueScore(state: GameState, civId: string, buildingId: string): number {
  const building = BUILDINGS[buildingId];
  if (!building?.arsenalCapacityGated) return 0;
  const civ = state.civilizations[civId];
  const warCount = Math.min(civ?.diplomacy.atWarWith.length ?? 0, STRATEGIC_ARSENAL_VALUE_MAX_WARS);
  return warCount * STRATEGIC_ARSENAL_VALUE_PER_WAR;
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

function defensiveEspionageScore(
  state: GameState,
  civId: string,
  cityId: string,
  buildingId: string,
): number {
  const value = BUILDINGS[buildingId]?.defensiveEspionageAiValue ?? 0;
  if (value <= 0) return 0;
  const threats = Object.values(state.espionage?.[civId]?.detectedThreats ?? {});
  return threats.some(threat =>
    threat.cityId === cityId && threat.expiresOnTurn >= state.turn,
  ) ? value : 0;
}

// #919 MR2: 2 unrest pressure ≈ 1 happiness in faction-system's maths; the happiness
// AI scalar is 1.5, so 1.5 / 2 = 0.75 per point of simulated pressure drop.
const UNREST_RELIEF_AI_WEIGHT = 0.75;
// Scale the relief score up when the city is already meaningfully pressured — a
// Courthouse in a calm tall empire genuinely is near-worthless. Conditioning on real
// pressure here is defensible (unlike the deliberately-flat happiness term).
const UNREST_RELIEF_AI_URGENCY_MULT = 2;

// Pure: a copy of `state` with `buildingId` appended to that city's buildings.
function withBuilding(state: GameState, cityId: string, buildingId: string): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: { ...city, buildings: [...city.buildings, buildingId] },
    },
  };
}

// #919 MR2: generic — scores any building registered in UNREST_RELIEF_SOURCES by the
// unrest-pressure drop it would produce in THIS city, scaled up when the city is
// already pressured. No courthouse id branch; a future ladder-rung building with a
// UNREST_RELIEF_SOURCES entry is covered automatically.
function unrestReliefScore(
  state: GameState,
  civId: string,
  cityId: string,
  buildingId: string,
): number {
  if (!UNREST_RELIEF_SOURCES.some(source => source.buildingId === buildingId)) return 0;
  const ownerHappiness = getCivHappinessFromResources(state, civId);
  const before = computeUnrestPressure(cityId, state, ownerHappiness);
  if (before <= 0) return 0; // nothing to relieve — skip the second (O(cities)) pressure pass
  const after = computeUnrestPressure(cityId, withBuilding(state, cityId, buildingId), ownerHappiness);
  const drop = Math.max(0, before - after);
  if (drop === 0) return 0;
  const urgent = before >= 0.6 * UNREST_TRIGGER_PRESSURE;
  return drop * UNREST_RELIEF_AI_WEIGHT * (urgent ? UNREST_RELIEF_AI_URGENCY_MULT : 1);
}

function getVisibleAirDefenseThreatenedCityIds(
  state: GameState,
  civId: string,
): ReadonlySet<string> {
  const civ = state.civilizations[civId];
  if (!civ) return new Set();
  const cities = civ.cities
    .map(cityId => state.cities[cityId])
    .filter((city): city is NonNullable<typeof city> => city?.owner === civId);
  const threatenedCityIds = new Set<string>();

  for (const unit of Object.values(state.units)) {
    const definition = UNIT_DEFINITIONS[unit.type];
    const range = definition.airOperation?.operationalRange;
    const isVisibleHostileStrikeAircraft = unit.owner !== civId
      && isAIHostileOwner(state, civId, unit.owner)
      && definition.domain === 'air'
      && definition.airOperation?.missions.includes('strike')
      && range !== undefined
      && getVisibility(civ.visibility, unit.position) === 'visible';
    if (!isVisibleHostileStrikeAircraft || range === undefined) continue;
    for (const city of cities) {
      const distance = state.map.wrapsHorizontally
        ? wrappedHexDistance(unit.position, city.position, state.map.width)
        : hexDistance(unit.position, city.position);
      if (distance <= range) threatenedCityIds.add(city.id);
    }
  }

  return threatenedCityIds;
}

function airDefenseThreatScore(
  threatenedCityIds: ReadonlySet<string>,
  cityId: string,
  buildingId: string,
): number {
  const capability = BUILDINGS[buildingId]?.airDefenseProvider;
  return capability && threatenedCityIds.has(cityId)
    ? Math.min(120, capability.defenseModifier * 10)
    : 0;
}

/**
 * #542: does this civ have a still-remembered (not 'rumored') hostile submarine
 * sighting? Sourced from buildMajorCivPerception, whose own decay math already
 * excludes fully-stale memories -- no new confidence threshold is invented here.
 */
function hasRememberedHostileSubmarineSighting(state: GameState, civId: string): boolean {
  const perception = buildMajorCivPerception(state, civId);
  return perception.units.some(unit =>
    (unit.type === 'submarine' || unit.type === 'missile_submarine')
    && unit.confidence !== 'rumored');
}

function submarineThreatScore(
  hasThreat: boolean,
  civId: string,
  state: GameState,
  itemId: string,
): number {
  if (!hasThreat || itemId !== 'destroyer') return 0;
  return 40 * getChallengeProfileForCiv(state, civId).submarineEscortWeight;
}

/**
 * #582: nudges carrier-air-wing composition toward diversity and toward
 * Patrol specifically when a real (perceived, not omniscient) submarine
 * threat exists. Reuses hasRememberedHostileSubmarineSighting unchanged --
 * no new confidence threshold, no raw GameState submarine read.
 *
 * Only considers carriers with at least one open deck slot (a full carrier
 * isn't a real destination for a new aircraft yet); "how stacked would this
 * role be" uses the LEAST-stacked such carrier (the best-case destination
 * for a new unit of this type), not a sum across every carrier the civ
 * owns -- an unrelated carrier's composition shouldn't discourage building
 * a role this specific decision has nothing to do with. The submarine-
 * threat bonus applies once (not once per open carrier) -- it answers "is
 * there a real reason to want a patrol aircraft at all," not "how many
 * carriers could it go to." Scaled by the same submarineEscortWeight
 * challenge-profile term submarineThreatScore already uses, so Patrol
 * urgency scales with difficulty the same way Destroyer urgency does --
 * without this, an Explorer-tier AI would react to a sighting exactly as
 * strongly as a Veteran-tier one, unlike every other submarine-threat
 * response in this file.
 */
function carrierCompositionScore(
  state: GameState,
  civId: string,
  unit: TrainableUnitEntry,
): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  if (!definition.airOperation?.carrierEligible) return 0;
  const openCarriers = Object.values(state.units)
    .filter(candidate => candidate.owner === civId && UNIT_DEFINITIONS[candidate.type].carrierDeckCapacity !== undefined)
    .map(carrier => ({
      roster: getAirBaseRoster(state, { kind: 'carrier', unitId: carrier.id }),
      capacity: UNIT_DEFINITIONS[carrier.type].carrierDeckCapacity ?? 0,
    }))
    .filter(({ roster, capacity }) => roster.length < capacity);
  if (openCarriers.length === 0) return 0;

  const leastStackedSameRoleCount = Math.min(...openCarriers.map(({ roster }) =>
    roster.filter(aboard => aboard.type === unit.type).length));
  // discourage stacking one role on one deck; the `> 0` guard avoids
  // producing -0 (Math.min/negation of 0 -> -0) when nothing is stacked.
  let score = leastStackedSameRoleCount > 0 ? -leastStackedSameRoleCount * 15 : 0;

  if (definition.airOperation.missions.includes('patrol') && hasRememberedHostileSubmarineSighting(state, civId)) {
    score += 40 * getChallengeProfileForCiv(state, civId).submarineEscortWeight;
  }
  return score;
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
  const civEra = resolveCivilizationEra(civ.techState.completed);
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
  const airDefenseThreatenedCityIds = getVisibleAirDefenseThreatenedCityIds(state, civId);
  const hasSubmarineThreat = hasRememberedHostileSubmarineSighting(state, civId);
  const candidates: AIProductionCandidate[] = [];

  for (const unit of getTrainableUnitsForCity(
    city,
    civ.techState.completed,
    state.map,
    civ.civType,
    resources,
    cityFollowsOwnFaith(state, city),
  )) {
    if (UNIT_DEFINITIONS[unit.type].airOperation
      && !canCompleteAirUnitProduction(state, cityId, unit.type).ok) continue;
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
      era: civEra,
      completedTechs: civ.techState.completed,
      activeNationalProjects,
      availableResources: resources,
      materialSubstitution: getCircularManufacturingMaterial(state, civId),
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
    const unitSubmarineThreatScore = submarineThreatScore(hasSubmarineThreat, civId, state, unit.type);
    const unitCarrierCompositionScore = carrierCompositionScore(state, civId, unit);
    const score = roleDemandScore * 4
      + emergencyDefenseScore * 3
      + personalityScore
      + citySpecializationScore
      + unitSubmarineThreatScore
      + unitCarrierCompositionScore
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
      researchValueScore: 0,
      personalityScore,
      emergencyDefenseScore,
      citySpecializationScore,
      maintenanceRisk,
      defensiveEspionageScore: 0,
      airDefenseThreatScore: 0,
      submarineThreatScore: unitSubmarineThreatScore,
      carrierCompositionScore: unitCarrierCompositionScore,
      strategicArsenalValueScore: 0,
      unrestReliefScore: 0,
      fulfilledRole: fulfilled.role,
      score,
    });
  }

  // #592 MR5: missionary production scoring. Bypasses the demand-gated military loop
  // above — spreading faith isn't a combat force-composition role, so there's no
  // AIForceDemand entry for it to match against. Only scored when the unit is actually
  // trainable (religion founded + city follows own faith + Temple), mirroring the real
  // trainability gate rather than a duplicated check.
  const civReligion = Object.values(state.religions ?? {}).find(r => r.ownerCivId === civId);
  if (civReligion) {
    const missionaryTrainable = getTrainableUnitsForCity(
      city,
      civ.techState.completed,
      state.map,
      civ.civType,
      resources,
      cityFollowsOwnFaith(state, city),
    ).some(candidate => candidate.type === 'missionary');
    if (missionaryTrainable) {
      const maintenanceImpact = projectedUnitMaintenanceImpact(state, civId, cityId, 'missionary');
      if (reserveAllows(state, civId, maintenanceImpact, false, 1)) {
        const cost = getProductionCostForItem('missionary', {
          city,
          bonusEffect: civDefinition?.bonusEffect,
          era: state.era,
          completedTechs: civ.techState.completed,
          activeNationalProjects,
          availableResources: resources,
        });
        const productionTurns = Math.max(1, Math.ceil(cost / productionPerTurn));
        const personalityScore = weightProductionRoles(personality, ['missionary']);
        // Fervor-boon civs weight missionaries higher — their faith already spreads/
        // converts faster, so each additional missionary compounds more value.
        const fervorWeight = civReligion.boon === 'fervor' ? 2 : 1;
        const score = 6 * fervorWeight
          + personalityScore
          - productionTurns * 1.5
          - maintenanceImpact * 3;
        candidates.push({
          itemId: 'missionary',
          kind: 'unit',
          roles: ['missionary'],
          productionTurns,
          maintenanceImpact,
          roleDemandScore: 0,
          economyScore: 0,
          researchValueScore: 0,
          personalityScore,
          emergencyDefenseScore: 0,
          citySpecializationScore: 0,
          maintenanceRisk: maintenanceImpact,
          defensiveEspionageScore: 0,
          airDefenseThreatScore: 0,
          submarineThreatScore: 0,
          carrierCompositionScore: 0,
          strategicArsenalValueScore: 0,
          unrestReliefScore: 0,
          score,
        });
      }
    }
  }

  const arsenalStatus = getArsenalStatus(state, civId);
  for (const building of getAvailableBuildings(
    city,
    civ.techState.completed,
    state.map,
    resources,
    civEra,
    builtNationalProjectKeys,
    civId,
    arsenalStatus,
  )) {
    const researchValueScore = getMarginalCivResearchGain(state, civId, cityId, building.id) * 1.25;
    const economyScore = economyValue(building.id, researchValueScore);
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
      era: civEra,
      completedTechs: civ.techState.completed,
      activeNationalProjects,
      availableResources: resources,
      materialSubstitution: getCircularManufacturingMaterial(state, civId),
    });
    const productionTurns = Math.max(1, Math.ceil(cost / productionPerTurn));
    const personalityScore = weightProductionRoles(personality, []);
    const citySpecializationScore = building.category === city.focus ? 1 : 0;
    const maintenanceRisk = maintenanceImpact;
    const buildingDefensiveScore = defensiveEspionageScore(state, civId, cityId, building.id);
    const buildingAirDefenseScore = airDefenseThreatScore(
      airDefenseThreatenedCityIds,
      cityId,
      building.id,
    );
    const buildingStrategicArsenalScore = strategicArsenalValueScore(state, civId, building.id);
    const buildingUnrestReliefScore = unrestReliefScore(state, civId, cityId, building.id);
    const score = economyScore * 2
      + personalityScore
      + citySpecializationScore
      + buildingDefensiveScore
      + buildingAirDefenseScore
      + buildingStrategicArsenalScore
      + buildingUnrestReliefScore
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
      researchValueScore,
      personalityScore,
      emergencyDefenseScore: 0,
      citySpecializationScore,
      maintenanceRisk,
      defensiveEspionageScore: buildingDefensiveScore,
      airDefenseThreatScore: buildingAirDefenseScore,
      submarineThreatScore: 0,
      carrierCompositionScore: 0,
      strategicArsenalValueScore: buildingStrategicArsenalScore,
      unrestReliefScore: buildingUnrestReliefScore,
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
