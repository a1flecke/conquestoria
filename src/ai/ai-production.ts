import type { GameState, PersonalityTraits, TrainableUnitEntry } from '@/core/types';
import type { AIStrategicRole } from '@/core/types/ai';
import {
  BUILDINGS,
  TRAINABLE_UNITS,
  getTrainableUnitsForCity,
  cityFollowsOwnFaith,
} from '@/systems/city-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { getAllWorldRaceKinds, getWorldRaceDefinition } from '@/systems/world-race-definitions';
import { hasCompletedWorldRaceComponent } from '@/systems/world-race-system';
import {
  calculateCivUnitMaintenance,
  calculateMaintenance,
  getEconomyStatusForCiv,
} from '@/systems/economy-system';
import { getCivAvailableResources, getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import { computeUnrestPressure } from '@/systems/faction-pressure';
import { UNREST_RELIEF_SOURCES } from '@/systems/faction-relief';
import { UNREST_TRIGGER_PRESSURE } from '@/systems/faction-unrest-model';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { buildProductionCostContext, getContextualProductionCost } from '@/systems/production-cost-context';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { createUnit } from '@/systems/unit-lifecycle';
import { canCompleteAirUnitProduction, getAirBaseRoster } from '@/systems/air-operations-system';
import { enqueueCityProduction, removeCityProductionCommand, reorderCityProductionCommand, setIdleProduction } from '@/systems/planning-system';
import { getQueueableProductionForCity } from '@/systems/city-production-eligibility';
import { evaluateMaterialFunding, getMaterialRecipe } from '@/systems/resource-material-costs';
import { accrueNativeStockForCompletedRound, getCivMaterialLedger } from '@/systems/resource-material-state';
import { getCityMaterialProjection, syncCityMaterialCommitment } from '@/systems/city-production-materials';
import { getAvailableTechs } from '@/systems/tech-system';
import type { AIForceDemand } from './ai-unit-assignment';
import { getAIStrategicRoles } from './ai-unit-roles';
import { weightProductionRoles } from './ai-personality';
import { NATIONAL_INTENT_POSTURE } from './ai-national-intent-posture';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getVisibility } from '@/systems/fog-of-war';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { isAIHostileOwner } from './ai-hostility';
import { buildMajorCivPerception } from './ai-perception';
import { getChallengeProfileForCiv } from '@/core/opponent-challenge';
import { computeResearchScoringBaseline, getMarginalCivResearchGain } from '@/systems/research-output-system';
import { getOwnedCities } from '@/systems/city-ownership';
import { majorCivWarOpponentIds } from '@/core/owner-kind';

export interface AIProductionCandidate {
  itemId: string;
  kind: 'unit' | 'building';
  roles: readonly AIStrategicRole[];
  /** Every candidate is legally plannable; fundability is a separate, per-round fact. */
  plannable: true;
  /** The whole hard recipe is available from this civ's free stock right now. */
  fundableNow: boolean;
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
  worldRaceScore: number;
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
  return getOwnedCities(state, civId).flatMap(city => {
    // #1506 MR09 task 10: only a materially funded active head is real force supply. A waiting head
    // and every unreserved tail are plans, not completed military demand — otherwise the AI would
    // stop producing a role it has not actually funded yet.
    if (!getCityMaterialProjection(state, city.id).funded) return [];
    const itemId = city.productionQueue[0];
    if (!itemId) return [];
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
    return validTypes.has(itemId as never)
      ? [[...getAIStrategicRoles(itemId as never)]]
      : [];
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
  // Nuclear-arsenal value scales with MAJOR-civ wars only — a city-state coalition
  // war should not pull the AI toward silos (#1041).
  const warCount = Math.min(majorCivWarOpponentIds(civ?.diplomacy.atWarWith).length, STRATEGIC_ARSENAL_VALUE_MAX_WARS);
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
  const building = BUILDINGS[buildingId];
  const builtNationalProjects = building?.nationalProject && building.uniquePerEmpire
    ? {
        ...(state.builtNationalProjects ?? {}),
        [`${city.owner}:${buildingId}`]: {
          civId: city.owner,
          cityId,
          eraBuilt: resolveCivilizationEra(state.civilizations[city.owner]?.techState.completed ?? []),
        },
      }
    : state.builtNationalProjects;
  return {
    ...state,
    builtNationalProjects,
    cities: {
      ...state.cities,
      [cityId]: { ...city, buildings: [...city.buildings, buildingId] },
    },
  };
}

// #919 MR2: generic — scores any building registered in UNREST_RELIEF_SOURCES by the
// empire-wide unrest-pressure drop it would produce. A local building such as a
// Courthouse naturally only changes its host city; a future regional source can
// improve several cities without needing an AI id branch.
function unrestReliefScore(
  state: GameState,
  civId: string,
  cityId: string,
  buildingId: string,
): number {
  if (!UNREST_RELIEF_SOURCES.some(source => source.buildingId === buildingId)) return 0;
  const ownerHappiness = getCivHappinessFromResources(state, civId);
  const cityIds = state.civilizations[civId]?.cities
    .filter(candidateId => state.cities[candidateId]?.owner === civId) ?? [];
  const beforeByCity = cityIds.map(candidateId => computeUnrestPressure(candidateId, state, ownerHappiness));
  const before = beforeByCity.reduce((sum, pressure) => sum + pressure, 0);
  if (before <= 0) return 0; // nothing to relieve — skip the simulated pass
  const simulatedState = withBuilding(state, cityId, buildingId);
  const after = cityIds
    .map(candidateId => computeUnrestPressure(candidateId, simulatedState, ownerHappiness))
    .reduce((sum, pressure) => sum + pressure, 0);
  const drop = Math.max(0, before - after);
  if (drop === 0) return 0;
  const urgent = beforeByCity.some(pressure => pressure >= 0.6 * UNREST_TRIGGER_PRESSURE);
  return drop * UNREST_RELIEF_AI_WEIGHT * (urgent ? UNREST_RELIEF_AI_URGENCY_MULT : 1);
}

// #992: data-table-driven, like unrestReliefScore above — a new race adds a row to
// WORLD_RACE_DEFINITIONS, never a building-id branch here. Scores the component and
// launch buildings only while this civ can still plausibly win: a race someone else has
// already won gets zero (the building would be dequeued/refunded anyway once queued —
// see world-race-system.ts — so bidding it up here would only waste a turn of production
// choice). The launch building additionally scores 0 until its own component prerequisite
// is built, matching `requiresBuildings`' real legality gate rather than guessing early.
const WORLD_RACE_COMPONENT_AI_WEIGHT = 8;
const WORLD_RACE_LAUNCH_AI_WEIGHT = 14;

function worldRaceScore(state: GameState, civId: string, buildingId: string): number {
  for (const kind of getAllWorldRaceKinds()) {
    const definition = getWorldRaceDefinition(kind);
    const race = state.worldRaces?.[kind];
    if (race?.winnerCivId && race.winnerCivId !== civId) continue;
    if (buildingId === definition.componentBuildingId) return WORLD_RACE_COMPONENT_AI_WEIGHT;
    if (buildingId === definition.launchBuildingId) {
      return hasCompletedWorldRaceComponent(state, civId, kind) ? WORLD_RACE_LAUNCH_AI_WEIGHT : 0;
    }
  }
  return 0;
}

function getVisibleAirDefenseThreatenedCityIds(
  state: GameState,
  civId: string,
): ReadonlySet<string> {
  const civ = state.civilizations[civId];
  if (!civ) return new Set();
  const cities = getOwnedCities(state, civId);
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

/** Is this item's whole hard recipe covered by the civ's free stock right now? */
function recipeFundableNow(state: GameState, civId: string, itemId: string): boolean {
  const lookup = getMaterialRecipe(itemId);
  if (!lookup.known) return false;
  if (lookup.recipe.rows.length === 0) return true;
  return evaluateMaterialFunding(getCivMaterialLedger(state, civId), lookup.recipe).funded;
}

/**
 * A pure one-resource-phase projection: capped native accrual for the next completed round, then
 * the real stable-order active claims. It never reads incoming shipments, future sources, future
 * queue tails or hypothetical imports, and never mutates the real state or its accrual marker.
 */
function projectOneResourcePhase(state: GameState, civId: string): GameState {
  let projected = accrueNativeStockForCompletedRound(state, civId, state.turn + 1);
  for (const cityId of [...(state.civilizations[civId]?.cities ?? [])].sort()) {
    projected = syncCityMaterialCommitment(projected, cityId);
  }
  return projected;
}

function projectedRecipeFundable(state: GameState, civId: string, itemId: string): boolean {
  const lookup = getMaterialRecipe(itemId);
  if (!lookup.known) return false;
  if (lookup.recipe.rows.length === 0) return true;
  const projected = projectOneResourcePhase(state, civId);
  return evaluateMaterialFunding(getCivMaterialLedger(projected, civId), lookup.recipe).funded;
}

function projectedWaitingHeadFundable(state: GameState, civId: string, cityId: string): boolean {
  return getCityMaterialProjection(projectOneResourcePhase(state, civId), cityId).funded;
}

/**
 * Selection for useful work: prefer a candidate whose full recipe is fundable now; otherwise keep a
 * legal plan only when the next resource phase can fund the whole recipe. A source-less item is
 * never queued to wait for a shipment that MR09 cannot send.
 */
function pickCandidate(
  state: GameState,
  civId: string,
  cityId: string,
  demands: readonly AIForceDemand[],
  personality: PersonalityTraits,
): AIProductionCandidate | undefined {
  const candidates = generateWithResidual(state, civId, cityId, demands, personality);
  const fundable = candidates.find(candidate => candidate.fundableNow);
  if (fundable) return fundable;
  return candidates.find(candidate => projectedRecipeFundable(state, civId, candidate.itemId));
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
  // One plannable surface, exactly what `enqueueCityProduction` accepts. This keeps the
  // quantity-aware predecessor retirement (a successor only retires its predecessor when the
  // successor's whole recipe is fundable), so a material-short AI still sees the free alternative.
  const offered = getQueueableProductionForCity(state, cityId);
  if (!offered) return [];
  const civDefinition = resolveCivDefinition(state, civ.civType ?? '');
  // #1086: read-only lookup of this civ's already-persisted intent (written back by
  // ai-round-scheduler.ts's writePreparedPortfolios in the same round intent was
  // resolved) -- no new parameter threaded through every production caller.
  const posture = NATIONAL_INTENT_POSTURE[
    state.opponentAI?.nationalIntentByCiv[civId]?.current ?? 'develop'
  ];
  const productionPerTurn = Math.max(
    1,
    calculateProjectedCityYields(state, cityId, civDefinition?.bonusEffect).production,
  );
  // #1069: computed once per city-scoring call and reused across every building candidate below,
  // instead of each candidate independently re-deriving the whole civ's projected research
  // output from scratch. See docs/superpowers/specs/2026-09-15-issue-1069-ai-round-perf-design.md §5.
  const researchBaseline = computeResearchScoringBaseline(state, civId);
  const productionCostContext = buildProductionCostContext(state, civId, cityId);
  // #1066: a transport can be justified two ways -- an existing combat-cargo
  // demand (the original "ferry my army overseas" case), or an explicit
  // `transport` demand on its own (the amphibious-objective-routing case,
  // where `resolveObjectiveTravelCandidates` seeds `requiredRoles.transport`
  // directly for a civilian/settler crossing with no combat unit involved).
  const cargoDemand = demands.some(entry =>
    entry.missing > 0 && (COMBAT_CARGO_ROLES.has(entry.role) || entry.role === 'transport'));
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

  for (const unit of offered.units) {
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
    const cost = getContextualProductionCost(unit.type, productionCostContext);
    const productionTurns = Math.max(1, Math.ceil(cost / productionPerTurn));
    const roleDemandScore = fulfilled.missing * 40 + fulfilled.priority / 5;
    const emergencyDefenseScore = emergency ? 10 : 0;
    const personalityScore = weightProductionRoles(personality, roles, posture);
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
      plannable: true,
      fundableNow: recipeFundableNow(state, civId, unit.type),
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
      worldRaceScore: 0,
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
    const missionaryTrainable = offered.units.some(candidate => candidate.type === 'missionary');
    if (missionaryTrainable) {
      const maintenanceImpact = projectedUnitMaintenanceImpact(state, civId, cityId, 'missionary');
      if (reserveAllows(state, civId, maintenanceImpact, false, 1)) {
        const cost = getContextualProductionCost('missionary', productionCostContext);
        const productionTurns = Math.max(1, Math.ceil(cost / productionPerTurn));
        const personalityScore = weightProductionRoles(personality, ['missionary'], posture);
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
          plannable: true,
          fundableNow: recipeFundableNow(state, civId, 'missionary'),
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
          worldRaceScore: 0,
          score,
        });
      }
    }
  }

  for (const building of offered.buildings) {
    const researchValueScore = getMarginalCivResearchGain(state, civId, cityId, building.id, researchBaseline) * 1.25;
    const economyScore = economyValue(building.id, researchValueScore);
    const maintenanceImpact = projectedBuildingMaintenanceImpact(
      state,
      civId,
      cityId,
      building.id,
    );
    if (!reserveAllows(state, civId, maintenanceImpact, false, economyScore)) continue;
    const cost = getContextualProductionCost(building.id, productionCostContext);
    const productionTurns = Math.max(1, Math.ceil(cost / productionPerTurn));
    const personalityScore = weightProductionRoles(personality, [], posture);
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
    const buildingWorldRaceScore = worldRaceScore(state, civId, building.id);
    const score = economyScore * 2
      + personalityScore
      + citySpecializationScore
      + buildingDefensiveScore
      + buildingAirDefenseScore
      + buildingStrategicArsenalScore
      + buildingUnrestReliefScore
      + buildingWorldRaceScore
      - productionTurns * 1.5
      - maintenanceRisk * 3;
    candidates.push({
      itemId: building.id,
      kind: 'building',
      roles: [],
      plannable: true,
      fundableNow: recipeFundableNow(state, civId, building.id),
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
      worldRaceScore: buildingWorldRaceScore,
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
  const candidates = generateWithResidual(
    state,
    civId,
    cityId,
    residualDemands(state, civId, demands),
    personality,
  );
  // #1506 MR09: "build now" consumes the same offered/fundable surface the queue accepts. The AI does
  // not yet buy materials or plan around a waiting head — that is the procurement policy slice — so
  // proposing an item it cannot enqueue would only stall a city.
  const offered = getQueueableProductionForCity(state, cityId);
  if (!offered) return candidates;
  const allowed = new Set<string>([
    ...offered.buildings.map(building => building.id),
    ...offered.units.map(unit => unit.type),
  ]);
  return candidates.filter(candidate => allowed.has(candidate.itemId));
}

export type AIIdleProductionMode = 'gold' | 'science';

/**
 * What a queue-empty city with nothing worth building should convert its output into, from this civ's own
 * facts only: gold when the treasury is strained (`high`/`critical`) or when no further research exists
 * (science would be wasted), otherwise science. Conversion is the existing `City.idleProduction` mechanism the
 * player's City Panel drives; this only chooses a mode, it never computes a yield.
 */
export function chooseAIIdleProductionMode(state: GameState, civId: string): AIIdleProductionMode {
  const civ = state.civilizations[civId];
  if (!civ) return 'gold';
  const strain = getEconomyStatusForCiv(state, civId).strainLevel;
  if (strain === 'high' || strain === 'critical') return 'gold';
  const hasResearchPath = civ.techState.currentResearch != null
    || getAvailableTechs(civ.techState).length > 0;
  return hasResearchPath ? 'science' : 'gold';
}

export interface AIReplacedWaiting {
  cityId: string;
  /** The waiting head that was removed. */
  itemId: string;
  /** Stored production deliberately lost with that head. */
  progressLost: number;
  /** The fundable replacement queued in its place, or null when the city was left on idle conversion. */
  replacement: string | null;
}

export interface AIProductionReport {
  /** Cities that had no candidate at all and were put on (or kept on) idle conversion, with the mode. */
  readonly converted: Readonly<Record<string, AIIdleProductionMode>>;
  /** Cities whose best candidate the canonical enqueue refused: a generator/eligibility drift, never masked by conversion. */
  readonly enqueueRefused: readonly string[];
  /** AI waiting heads replaced because the next resource phase cannot fund their whole recipe. */
  readonly replacedWaiting: readonly AIReplacedWaiting[];
}

/**
 * `applyAIProduction` plus what it decided for cities it did not enqueue. A city with a candidate is queued
 * exactly as before; a city with NO candidate converts its output via `idleProduction` instead of wasting it
 * (an existing mode is dormant while a queue is active, since `processCity` only credits it on an empty queue).
 */
export function applyAIProductionWithReport(
  state: GameState,
  civId: string,
  demands: readonly AIForceDemand[],
  personality: PersonalityTraits,
): { state: GameState; report: AIProductionReport } {
  const civ = state.civilizations[civId];
  if (!civ) return { state, report: { converted: {}, enqueueRefused: [], replacedWaiting: [] } };
  const residual = residualDemands(state, civId, demands);
  const idle = getOwnedCities(state, civId)
    .filter(city => city.productionQueue.length === 0);
  // The comparator used to call generateWithResidual TWICE per comparison -- O(n log n)
  // full candidate generations per civ per round, each one costing a city-yield
  // projection. Precomputing is provably order-identical: the comparator already read
  // `state` (not `nextState`), and `residual` is still pristine here because it is only
  // mutated inside the enqueue loop below.
  const bestByCityId = new Map(idle.map(city => [
    city.id,
    pickCandidate(state, civId, city.id, residual, personality),
  ]));
  const idleCities = [...idle].sort((left, right) => {
    const leftEmergency = residual.some(entry =>
      entry.missing > 0 && isEmergencyDemand(entry, left.id)) ? 1 : 0;
    const rightEmergency = residual.some(entry =>
      entry.missing > 0 && isEmergencyDemand(entry, right.id)) ? 1 : 0;
    if (leftEmergency !== rightEmergency) return rightEmergency - leftEmergency;
    const leftEta = bestByCityId.get(left.id)?.productionTurns ?? Number.POSITIVE_INFINITY;
    const rightEta = bestByCityId.get(right.id)?.productionTurns ?? Number.POSITIVE_INFINITY;
    return leftEta - rightEta || left.id.localeCompare(right.id);
  });
  let nextState = state;
  let idleMode: AIIdleProductionMode | undefined;
  const converted: Record<string, AIIdleProductionMode> = {};
  const enqueueRefused: string[] = [];
  const replacedWaiting: AIReplacedWaiting[] = [];

  for (const city of idleCities) {
    const current = nextState.cities[city.id];
    if (!current || current.productionQueue.length > 0) continue;
    const selected = pickCandidate(
      nextState,
      civId,
      city.id,
      residual,
      personality,
    );
    if (!selected) {
      idleMode ??= chooseAIIdleProductionMode(nextState, civId);
      converted[city.id] = idleMode;
      if (current.idleProduction !== idleMode) {
        nextState = {
          ...nextState,
          cities: { ...nextState.cities, [city.id]: setIdleProduction(current, idleMode) },
        };
      }
      continue;
    }
    // #1220: the same validated enqueue the player's panel uses. Candidates come from the same eligibility, so a
    // refusal means the candidate generator drifted from it; skip the city rather than queue something illegal.
    const queued = enqueueCityProduction(nextState, city.id, selected.itemId);
    if (!queued.ok) {
      enqueueRefused.push(city.id);
      continue;
    }
    nextState = queued.state;
    if (selected.fulfilledRole) {
      const fulfilled = residual.find(entry => entry.role === selected.fulfilledRole);
      if (fulfilled) fulfilled.missing = Math.max(0, fulfilled.missing - 1);
    }
  }

  // #1506 MR09 task 10: an AI city already waiting on materials is reconsidered every round. Keep
  // invested work only when a pure next-resource-phase projection funds the whole recipe; otherwise
  // replace it through the canonical queue commands (preserving the tail) or convert to idle. Human
  // queues are never touched, and no timer or extra persisted AI state is added.
  if (!civ.isHuman) {
    const waitingCityIds = getOwnedCities(nextState, civId)
      .filter(city => city.productionQueue.length > 0 && !getCityMaterialProjection(nextState, city.id).funded)
      .map(city => city.id)
      .sort();
    for (const cityId of waitingCityIds) {
      const current = nextState.cities[cityId];
      if (!current || current.productionQueue.length === 0) continue;
      if (getCityMaterialProjection(nextState, cityId).funded) continue;
      if (projectedWaitingHeadFundable(nextState, civId, cityId)) continue;

      const candidates = generateWithResidual(nextState, civId, cityId, residual, personality);
      const replacement = candidates.find(candidate => candidate.fundableNow);
      const waitingItem = current.productionQueue[0];
      const progressLost = current.productionProgress;
      const removed = removeCityProductionCommand(
        nextState,
        cityId,
        0,
        current.productionMaterials?.queueRevision ?? 0,
      );
      if (!removed.ok) continue;
      nextState = removed.state;

      let replacementId: string | null = null;
      if (replacement) {
        const appended = enqueueCityProduction(nextState, cityId, replacement.itemId);
        if (appended.ok) {
          nextState = appended.state;
          const refreshed = nextState.cities[cityId];
          if (refreshed.productionQueue[0] !== replacement.itemId && refreshed.productionQueue.length > 1) {
            const moved = reorderCityProductionCommand(
              nextState,
              cityId,
              refreshed.productionQueue.length - 1,
              0,
              refreshed.productionMaterials?.queueRevision ?? 0,
            );
            if (moved.ok) nextState = moved.state;
          }
          replacementId = replacement.itemId;
        }
      }

      if (!replacementId && nextState.cities[cityId].productionQueue.length === 0) {
        const mode = chooseAIIdleProductionMode(nextState, civId);
        converted[cityId] = mode;
        if (nextState.cities[cityId].idleProduction !== mode) {
          nextState = {
            ...nextState,
            cities: { ...nextState.cities, [cityId]: setIdleProduction(nextState.cities[cityId], mode) },
          };
        }
      }

      replacedWaiting.push({ cityId, itemId: waitingItem, progressLost, replacement: replacementId });
    }
  }

  return { state: nextState, report: { converted, enqueueRefused, replacedWaiting } };
}

export function applyAIProduction(
  state: GameState,
  civId: string,
  demands: readonly AIForceDemand[],
  personality: PersonalityTraits,
): GameState {
  return applyAIProductionWithReport(state, civId, demands, personality).state;
}
