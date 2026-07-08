import type {
  Building,
  GameState,
  HexCoord,
  MinorCivArchetype,
  MinorCivEconomyState,
  MinorCivPolicy,
  MinorCivPosture,
  ResourceType,
  TrainableUnitEntry,
  UnitType,
} from '@/core/types';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import { getAvailableBuildings, getTrainableUnitsForCity, TRAINABLE_UNITS } from '@/systems/city-system';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { TECH_TREE } from '@/systems/tech-definitions';

export const MINOR_CIV_ECONOMY_TUNING = {
  explorer: {
    productionMultiplier: 0.75,
    queueDecisionInterval: 5,
    caps: { settled: 1, fortifying: 2, mobilizing: 3, recovering: 1 },
    recoveryTurns: 8,
    pendingSpawnMaxAttempts: 3,
  },
  standard: {
    productionMultiplier: 1,
    queueDecisionInterval: 4,
    caps: { settled: 2, fortifying: 3, mobilizing: 4, recovering: 2 },
    recoveryTurns: 6,
    pendingSpawnMaxAttempts: 3,
  },
  veteran: {
    productionMultiplier: 1.15,
    queueDecisionInterval: 3,
    caps: { settled: 2, fortifying: 4, mobilizing: 5, recovering: 2 },
    recoveryTurns: 5,
    pendingSpawnMaxAttempts: 4,
  },
} as const;

const MINOR_CIV_POLICIES = new Set<MinorCivPolicy>([
  'balanced',
  'defense',
  'economy',
  'knowledge',
  'recovery',
]);

const MINOR_CIV_POSTURES = new Set<MinorCivPosture>([
  'settled',
  'fortifying',
  'mobilizing',
  'recovering',
]);

const SAFE_UNIT_TYPES = new Set<UnitType>(TRAINABLE_UNITS.map(unit => unit.type));

const UNSAFE_UNIT_TYPES = new Set<UnitType>([
  'settler',
  'worker',
  'spy_scout',
  'spy_informant',
  'spy_agent',
  'spy_operative',
  'spy_hacker',
  'caravan',
  'expedition',
  'transport',
  'troop_transport',
]);

const UNSAFE_BUILDING_IDS = new Set<string>();

function getMinorCivDefinition(minorCivId: string, state: GameState) {
  const minorCiv = state.minorCivs[minorCivId];
  return minorCiv
    ? MINOR_CIV_DEFINITIONS.find(definition => definition.id === minorCiv.definitionId)
    : undefined;
}

function distance(state: GameState, left: HexCoord, right: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(left, right, state.map.width)
    : hexDistance(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizePendingSpawn(
  value: unknown,
  state: Pick<GameState, 'turn'>,
): MinorCivEconomyState['pendingUnitSpawn'] {
  if (!isRecord(value) || typeof value.unitType !== 'string') {
    return undefined;
  }

  if (!SAFE_UNIT_TYPES.has(value.unitType as UnitType)) {
    return undefined;
  }

  if (
    !isFiniteNonNegativeNumber(value.completedTurn)
    || !isFiniteNonNegativeNumber(value.attempts)
    || value.completedTurn > state.turn
  ) {
    return undefined;
  }

  return {
    unitType: value.unitType as UnitType,
    completedTurn: value.completedTurn,
    attempts: value.attempts,
  };
}

function normalizeRecentProductionSummary(value: unknown): MinorCivEconomyState['recentProductionSummary'] {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.itemId !== 'string'
    || (value.itemClass !== 'building' && value.itemClass !== 'unit' && value.itemClass !== 'idle')
    || !isFiniteNonNegativeNumber(value.completedTurn)
  ) {
    return undefined;
  }

  return {
    itemId: value.itemId,
    itemClass: value.itemClass,
    completedTurn: value.completedTurn,
  };
}

export function createDefaultMinorCivEconomyState(state: Pick<GameState, 'turn'>): MinorCivEconomyState {
  return {
    policy: 'balanced',
    posture: 'settled',
    lastProcessedTurn: Math.max(0, state.turn - 1),
  };
}

function normalizeEconomyState(value: unknown, state: Pick<GameState, 'turn'>): MinorCivEconomyState {
  const defaults = createDefaultMinorCivEconomyState(state);
  if (!isRecord(value)) {
    return defaults;
  }

  const economy: MinorCivEconomyState = {
    policy: typeof value.policy === 'string' && MINOR_CIV_POLICIES.has(value.policy as MinorCivPolicy)
      ? value.policy as MinorCivPolicy
      : defaults.policy,
    posture: typeof value.posture === 'string' && MINOR_CIV_POSTURES.has(value.posture as MinorCivPosture)
      ? value.posture as MinorCivPosture
      : defaults.posture,
    lastProcessedTurn: isFiniteNonNegativeNumber(value.lastProcessedTurn)
      ? value.lastProcessedTurn
      : defaults.lastProcessedTurn,
  };

  if (isFiniteNonNegativeNumber(value.lastPostureChangeTurn)) {
    economy.lastPostureChangeTurn = value.lastPostureChangeTurn;
  }
  if (isFiniteNonNegativeNumber(value.localRecoveryUntilTurn)) {
    economy.localRecoveryUntilTurn = value.localRecoveryUntilTurn;
  }
  if (isFiniteNonNegativeNumber(value.lastQueueDecisionTurn)) {
    economy.lastQueueDecisionTurn = value.lastQueueDecisionTurn;
  }

  const pendingUnitSpawn = normalizePendingSpawn(value.pendingUnitSpawn, state);
  if (pendingUnitSpawn) {
    economy.pendingUnitSpawn = pendingUnitSpawn;
  }

  const recentProductionSummary = normalizeRecentProductionSummary(value.recentProductionSummary);
  if (recentProductionSummary) {
    economy.recentProductionSummary = recentProductionSummary;
  }

  return economy;
}

export function normalizeMinorCivEconomyState(state: GameState): GameState {
  const minorCivs = { ...state.minorCivs };
  for (const [minorCivId, minorCiv] of Object.entries(minorCivs)) {
    minorCivs[minorCivId] = {
      ...minorCiv,
      economy: normalizeEconomyState(minorCiv.economy, state),
    };
  }
  return { ...state, minorCivs };
}

export function getMinorCivCompletedTechBand(state: GameState, minorCivId: string): string[] {
  if (!state.minorCivs[minorCivId]) {
    return [];
  }
  return TECH_TREE
    .filter(tech => tech.era <= state.era)
    .map(tech => tech.id)
    .sort();
}

export function getMinorCivAvailableResources(state: GameState, minorCivId: string): Set<ResourceType> {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !city) {
    return new Set();
  }

  const completedTechs = new Set(getMinorCivCompletedTechBand(state, minorCivId));
  const resourceDefinitions = new Map(RESOURCE_DEFINITIONS.map(definition => [definition.id, definition]));
  const resources = new Set<ResourceType>();
  const cityKey = hexKey(city.position);

  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    const tile = state.map.tiles[key];
    if (!tile?.resource || tile.owner !== minorCiv.id) {
      continue;
    }

    const resourceType = tile.resource as ResourceType;
    const definition = resourceDefinitions.get(resourceType);
    if (!definition || !completedTechs.has(definition.tech)) {
      continue;
    }

    if (
      key === cityKey
      || (tile.improvement === definition.requiredImprovement && tile.improvementTurnsLeft === 0)
    ) {
      resources.add(resourceType);
    }
  }

  return resources;
}

export function getMinorCivBuildCandidates(
  state: GameState,
  minorCivId: string,
): { buildings: Building[]; units: TrainableUnitEntry[] } {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !city || city.owner !== minorCiv.id || minorCiv.isDestroyed) {
    return { buildings: [], units: [] };
  }

  const completedTechs = getMinorCivCompletedTechBand(state, minorCivId);
  const resources = getMinorCivAvailableResources(state, minorCivId);
  const buildings = getAvailableBuildings(city, completedTechs, state.map, resources, state.era)
    .filter(building => !building.nationalProject && !building.uniquePerEmpire && !UNSAFE_BUILDING_IDS.has(building.id));
  const units = getTrainableUnitsForCity(city, completedTechs, state.map, undefined, resources)
    .filter(unit => !UNSAFE_UNIT_TYPES.has(unit.type));

  return { buildings, units };
}

function hasImmediateCityThreat(state: GameState, minorCivId: string): boolean {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !city) {
    return false;
  }

  return Object.values(state.units).some(unit => (
    unit.owner !== minorCiv.id
    && !unit.transportId
    && distance(state, city.position, unit.position) <= 2
    && (minorCiv.diplomacy.atWarWith.includes(unit.owner) || unit.owner === 'barbarian')
  ));
}

export function evaluateMinorCivEconomyPosture(state: GameState, minorCivId: string): MinorCivPosture {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv || minorCiv.isDestroyed) {
    return 'settled';
  }

  const economy = minorCiv.economy;
  if ((economy?.localRecoveryUntilTurn ?? 0) > state.turn) {
    return 'recovering';
  }

  const grievances = Object.values(minorCiv.regionalGrievanceByCiv ?? {});
  if (grievances.some(grievance => (grievance.recoveryStrainedUntilTurn ?? 0) > state.turn)) {
    return 'recovering';
  }

  if (minorCiv.diplomacy.atWarWith.length > 0 || hasImmediateCityThreat(state, minorCivId)) {
    return 'mobilizing';
  }

  if (grievances.some(grievance => grievance.status === 'mobilizing' || grievance.status === 'coalition-talks')) {
    return 'mobilizing';
  }

  const isCoalitionMember = Object.values(state.minorCivCoalitions ?? {}).some(coalition => (
    coalition.memberIds.includes(minorCivId)
    && (coalition.status === 'forming' || coalition.status === 'active')
  ));
  if (isCoalitionMember) {
    return 'mobilizing';
  }

  const liveUnitCount = minorCiv.units.filter(unitId => Boolean(state.units[unitId])).length;
  if (grievances.some(grievance => grievance.status === 'wary' && grievance.pressure >= 20) || liveUnitCount === 0) {
    return 'fortifying';
  }

  return 'settled';
}

export function getMinorCivUnitCap(
  state: GameState,
  minorCivId: string,
  posture: MinorCivPosture,
): number {
  const challenge = resolveOpponentChallenge(state);
  const tuning = MINOR_CIV_ECONOMY_TUNING[challenge];
  const definition = getMinorCivDefinition(minorCivId, state);
  const archetypeBonus = definition?.archetype === 'militaristic' && (posture === 'fortifying' || posture === 'mobilizing') ? 1 : 0;
  return Math.max(1, tuning.caps[posture] + archetypeBonus);
}

function scoreBuilding(
  building: Building,
  archetype: MinorCivArchetype | undefined,
  posture: MinorCivPosture,
): number {
  let score = 20;
  if (posture === 'fortifying' || posture === 'mobilizing') {
    if (building.id === 'walls' || building.id === 'barracks' || building.id === 'stable') {
      score += 60;
    }
  }
  if (archetype === 'mercantile' && (building.yields.gold > 0 || building.id === 'marketplace')) {
    score += 35;
  }
  if (
    archetype === 'cultural'
    && (building.yields.science > 0 || building.id === 'library' || building.id === 'temple' || building.id === 'monument')
  ) {
    score += 35;
  }
  if (archetype === 'militaristic' && (building.id === 'walls' || building.id === 'barracks')) {
    score += 35;
  }
  score += building.yields.food * 3
    + building.yields.production * 4
    + building.yields.gold * 2
    + building.yields.science * 2;
  return score;
}

function scoreUnit(
  unit: TrainableUnitEntry,
  archetype: MinorCivArchetype | undefined,
  posture: MinorCivPosture,
  currentUnits: number,
  cap: number,
): number {
  if (currentUnits >= cap) {
    return -1;
  }

  let score = posture === 'mobilizing' ? 90 : posture === 'fortifying' ? 60 : 15;
  if (archetype === 'militaristic') {
    score += 20;
  }
  if (unit.type === 'scout') {
    score -= 20;
  }
  return score;
}

export function chooseMinorCivQueueItem(state: GameState, minorCivId: string): string | null {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv) {
    return null;
  }

  const definition = getMinorCivDefinition(minorCivId, state);
  const posture = minorCiv.economy?.posture ?? evaluateMinorCivEconomyPosture(state, minorCivId);
  const cap = getMinorCivUnitCap(state, minorCivId, posture);
  const currentUnits = minorCiv.units.filter(unitId => Boolean(state.units[unitId])).length;
  const candidates = getMinorCivBuildCandidates(state, minorCivId);
  const scored = [
    ...candidates.buildings.map(building => ({
      id: building.id,
      score: scoreBuilding(building, definition?.archetype, posture),
    })),
    ...candidates.units.map(unit => ({
      id: unit.type,
      score: scoreUnit(unit, definition?.archetype, posture, currentUnits, cap),
    })),
  ].filter(candidate => candidate.score >= 0);

  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return scored[0]?.id ?? null;
}
