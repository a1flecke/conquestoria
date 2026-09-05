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
import type { EventBus } from '@/core/event-bus';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';
import {
  getAvailableBuildings,
  getTrainableUnitsForCity,
  processCity,
  TRAINABLE_UNITS,
} from '@/systems/city-system';
import { assignCityFocus, normalizeWorkedTilesForCity } from '@/systems/city-work-system';
import { getWrappedHexNeighbors, hexDistance, hexKey, hexNeighbors, wrappedHexDistance } from '@/systems/hex-utils';
import { getMinorCivMobilizationBudget } from '@/systems/minor-civ-coalition-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { calculateCityYields } from '@/systems/resource-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { resolveNeutralPressureEra } from '@/systems/era-resolution';
import { createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { UNIT_CLASS_BY_TYPE, type UnitClass } from '@/systems/unit-modifier-definitions';

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

// Era/maturity-scaled population ceiling for a one-city minor civ (#948, H1 from the #490 audit).
// Reuses resolveNeutralPressureEra — the same canonical era/maturity source that already gates
// minor-civ production eligibility (getMinorCivCompletedTechBand / getMinorCivBuildCandidates) —
// rather than introducing a second era resolver. Values stay at or below the reference-economy
// single-city max-development proxy (population 12, tests/systems/helpers/pacing-reference-economy.ts)
// at every band, and are difficulty-invariant because food yield itself has no existing
// challenge-tier tuning in MINOR_CIV_ECONOMY_TUNING. See .claude/rules/game-balance.md.
export const MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND: ReadonlyArray<{ maxEra: number; ceiling: number }> = [
  { maxEra: 2, ceiling: 6 },
  { maxEra: 5, ceiling: 10 },
  { maxEra: 8, ceiling: 14 },
  { maxEra: Infinity, ceiling: 18 },
];

export function getMinorCivPopulationCeiling(state: GameState, minorCivId: string): number {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  const pressureEra = city ? resolveNeutralPressureEra(state, city.position) ?? 1 : 1;
  const band = MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND.find(entry => pressureEra <= entry.maxEra);
  return band?.ceiling ?? MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND[MINOR_CIV_POPULATION_CEILING_BY_ERA_BAND.length - 1].ceiling;
}

// Emergency levy (#951, consolidating the #490 H3/M2/M3 audit findings). Ordinary defense is
// production-backed and unbounded in scope; the levy is a rare, heavily-gated bypass that trades
// population for an immediate weak defender when a city-state faces a genuine immediate threat
// and normal production has not (yet) produced a defender this turn. See "City-State Emergency
// Levy" in .claude/rules/game-balance.md for the full gate rationale.
//
// Population floor: city-states are placed at population 3 (minor-civ-system.ts); requiring
// population > 2 preserves the pre-#951 conscription gate exactly (a fresh city-state can levy
// once immediately if under genuine threat, dropping to population 2, and then cannot levy again
// until it regrows past the floor).
export const MINOR_CIV_LEVY_MIN_POPULATION = 2;
export const MINOR_CIV_LEVY_POPULATION_COST = 1;
// Levied units arrive under-strength relative to a fully trained production unit (60-80% HP band
// requested by #951); 65 reuses the exact value the pre-#951 conscription branch already used.
export const MINOR_CIV_LEVY_UNIT_HEALTH = 65;
// Hard gate on how often a levy may fire at all, independent of the (shorter, difficulty-scaled)
// localRecoveryUntilTurn posture window — see MINOR_CIV_ECONOMY_TUNING.recoveryTurns above, which
// is always <= this value, so an active recovery window always implies the cooldown is also still
// active. Kept difficulty-invariant (not read from MINOR_CIV_ECONOMY_TUNING) per #951's difficulty
// parity requirement: this is the exact value the pre-#951 CONSCRIPTION_COOLDOWN_TURNS already used.
export const MINOR_CIV_LEVY_COOLDOWN_TURNS = 10;
// A city-state already fielding this many living units is judged to have "enough" standing force
// that ordinary production, not an emergency levy, should be the response.
export const MINOR_CIV_LEVY_MIN_DEFENSIVE_FORCE = 2;

// Emergency levy is land-defense only (#951) regardless of #952's broader (not-yet-scoped) normal
// production domain policy — a city-state must never levy a naval or air unit. 'siege'/'mounted'/
// 'armor' are excluded too: the levy is meant to be the weakest sensible defender, not whatever is
// strongest, and picking the cheapest candidate within these classes achieves that without a
// hardcoded era->unit table (the deleted ERA_DEFENDER_UNIT map this replaces).
const DEFENSIVE_LEVY_CLASSES: ReadonlySet<UnitClass> = new Set(['melee', 'ranged', 'gunpowder']);

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

const UNSAFE_UNIT_TYPES = new Set<UnitType>([
  'settler',
  'worker',
  'spy_scout',
  'spy_informant',
  'spy_agent',
  'spy_operative',
  'spy_intelligence_officer',
  'spy_station_chief',
  'spy_hacker',
  'caravan',
  'expedition',
  'transport',
  'troop_transport',
]);

export const SAFE_MINOR_CIV_UNIT_TYPES = new Set<UnitType>(
  TRAINABLE_UNITS
    .map(unit => unit.type)
    .filter(unitType => !UNSAFE_UNIT_TYPES.has(unitType)),
);

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

export interface MinorCivEconomyTurnResult {
  state: GameState;
  completed?: {
    minorCivId: string;
    cityId: string;
    itemId: string;
    itemClass: 'building' | 'unit';
  };
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

  if (!SAFE_MINOR_CIV_UNIT_TYPES.has(value.unitType as UnitType)) {
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
  if (isFiniteNonNegativeNumber(value.levyCooldownUntilTurn)) {
    economy.levyCooldownUntilTurn = value.levyCooldownUntilTurn;
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
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !city) {
    return [];
  }
  const pressureEra = resolveNeutralPressureEra(state, city.position) ?? 1;
  return TECH_TREE
    .filter(tech => tech.era <= pressureEra)
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
  const pressureEra = resolveNeutralPressureEra(state, city.position) ?? 1;
  const buildings = getAvailableBuildings(city, completedTechs, state.map, resources, pressureEra)
    .filter(building => !building.nationalProject && !building.uniquePerEmpire && !UNSAFE_BUILDING_IDS.has(building.id));
  // minor civs never found a religion — missionary never trainable here
  const units = getTrainableUnitsForCity(city, completedTechs, state.map, undefined, resources, false)
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

  // localRecoveryUntilTurn is the one canonical recovery signal (#951) — it is written only by
  // performMinorCivEmergencyLevy below. Grievance records no longer carry a parallel recovery
  // field of their own.
  const economy = minorCiv.economy;
  if ((economy?.localRecoveryUntilTurn ?? 0) > state.turn) {
    return 'recovering';
  }

  const grievances = Object.values(minorCiv.regionalGrievanceByCiv ?? {});
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
  const posture = evaluateMinorCivEconomyPosture(state, minorCivId);
  const budget = getMinorCivMobilizationBudget(state, minorCivId);
  const effectivePosture = budget.wantsDefender ? 'mobilizing' : posture;
  const cap = getMinorCivUnitCap(state, minorCivId, effectivePosture);
  const currentUnits = minorCiv.units.filter(unitId => Boolean(state.units[unitId])).length;
  const candidates = getMinorCivBuildCandidates(state, minorCivId);
  const scored = [
    ...candidates.buildings.map(building => ({
      id: building.id,
      score: scoreBuilding(building, definition?.archetype, effectivePosture),
    })),
    ...candidates.units.map(unit => ({
      id: unit.type,
      score: scoreUnit(unit, definition?.archetype, effectivePosture, currentUnits, cap),
    })),
  ].filter(candidate => candidate.score >= 0);

  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return scored[0]?.id ?? null;
}

function isLegalSpawnTerrain(state: GameState, coord: HexCoord, unitType: UnitType): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile) {
    return false;
  }

  const domain = UNIT_DEFINITIONS[unitType]?.domain ?? 'land';
  if (domain === 'naval') {
    return tile.terrain === 'ocean' || tile.terrain === 'coast';
  }
  return tile.terrain !== 'ocean' && tile.terrain !== 'coast' && tile.terrain !== 'mountain';
}

function legalSpawnPositions(state: GameState, minorCivId: string, unitType: UnitType): HexCoord[] {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!city) {
    return [];
  }

  const occupied = new Set(
    Object.values(state.units)
      .filter(unit => !unit.transportId)
      .map(unit => hexKey(unit.position)),
  );
  const adjacent = state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(city.position, state.map.width)
    : hexNeighbors(city.position);

  return [city.position, ...adjacent]
    .filter(coord => isLegalSpawnTerrain(state, coord, unitType) && !occupied.has(hexKey(coord)))
    .sort((left, right) => left.q - right.q || left.r - right.r);
}

function createMinorCivUnit(
  state: GameState,
  minorCivId: string,
  unitType: UnitType,
): { state: GameState; created: boolean; unitId?: string } {
  const minorCiv = state.minorCivs[minorCivId];
  const position = legalSpawnPositions(state, minorCivId, unitType)[0];
  if (!minorCiv || !position) {
    return { state, created: false };
  }

  const unit = createUnit(unitType, minorCivId, position, state.idCounters);
  unit.movementPointsLeft = 0;
  unit.hasMoved = true;
  unit.hasActed = true;

  return {
    state: {
      ...state,
      units: { ...state.units, [unit.id]: unit },
      minorCivs: {
        ...state.minorCivs,
        [minorCivId]: {
          ...minorCiv,
          units: [...minorCiv.units.filter(unitId => Boolean(state.units[unitId])), unit.id],
        },
      },
    },
    created: true,
    unitId: unit.id,
  };
}

// Reuses getMinorCivBuildCandidates (the same tech/era/resource-filtered catalog ordinary
// production draws from) rather than a hardcoded era->unit table. Filtering to land-domain units
// in a basic defensive UnitClass, then taking the cheapest, naturally yields the weakest sensible
// era-appropriate defender without needing to know which era it is.
function chooseEmergencyLevyUnitType(state: GameState, minorCivId: string): UnitType | null {
  const candidates = getMinorCivBuildCandidates(state, minorCivId).units
    .filter(unit => {
      const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
      if (domain !== 'land') return false;
      return (UNIT_CLASS_BY_TYPE[unit.type] ?? []).some(unitClass => DEFENSIVE_LEVY_CLASSES.has(unitClass));
    })
    .sort((left, right) => left.cost - right.cost || left.type.localeCompare(right.type));
  return candidates[0]?.type ?? null;
}

export type MinorCivEmergencyLevyIneligibleReason =
  | 'no-threat'
  | 'region-immature'
  | 'cooldown'
  | 'population-floor'
  | 'sufficient-force'
  | 'unit-cap'
  | 'no-candidate'
  | 'no-spawn';

export type MinorCivEmergencyLevyEvaluation =
  | { eligible: true; unitType: UnitType }
  | { eligible: false; reason: MinorCivEmergencyLevyIneligibleReason };

// Deterministic, read-only eligibility check (#951) — every gate the design doc requires, in one
// place, so both the mutating levy path and tests can share a single source of truth for "may an
// emergency levy fire right now." Threat visibility is bounded to what a minor civ's AI is
// otherwise entitled to see: live war state and hasImmediateCityThreat's local-radius unit scan
// (already used for posture), plus getMinorCivMobilizationBudget's own-grievance pressure signal
// — never a hidden global read of another civ's military strength.
export function evaluateMinorCivEmergencyLevy(state: GameState, minorCivId: string): MinorCivEmergencyLevyEvaluation {
  const minorCiv = state.minorCivs[minorCivId];
  const city = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || minorCiv.isDestroyed || !city || city.owner !== minorCiv.id) {
    return { eligible: false, reason: 'no-threat' };
  }

  const budget = getMinorCivMobilizationBudget(state, minorCivId);
  const severeThreat = budget.allowsEmergencyLevy || hasImmediateCityThreat(state, minorCivId);
  if (!severeThreat) {
    return { eligible: false, reason: 'no-threat' };
  }

  // Preserves the pre-#951 conscription branch's era>=2 embargo: a brand-new era-1 city-state
  // cannot levy no matter how severe the (rare, era-1) threat looks — early-game safety, so a
  // young player cannot trigger an emergency army by merely being at war or having a barbarian
  // wander adjacent in the first few turns. Resolved target-first (matching the deleted branch's
  // own `resolveNeutralPressureEra(..., targetCivId)` call) so a distant target civ's own tech era
  // still counts even if it has no nearby city within the neutral-pressure radius; falls back to
  // the position-only neutral era for a target-less threat (e.g. a barbarian with no grievance).
  const threatEra = resolveNeutralPressureEra(state, city.position, budget.targetCivId)
    ?? resolveNeutralPressureEra(state, city.position)
    ?? 1;
  if (threatEra < 2) {
    return { eligible: false, reason: 'region-immature' };
  }

  if ((minorCiv.economy?.levyCooldownUntilTurn ?? 0) > state.turn) {
    return { eligible: false, reason: 'cooldown' };
  }

  if (city.population <= MINOR_CIV_LEVY_MIN_POPULATION) {
    return { eligible: false, reason: 'population-floor' };
  }

  // Live unit cap is checked before the "sufficient force" floor: MINOR_CIV_LEVY_MIN_DEFENSIVE_FORCE
  // is deliberately below every currently tuned 'mobilizing' cap, so in practice the force-floor
  // gate below is what fires day-to-day — this ordering just means an already-at-cap city-state
  // (however that happened) is never blamed on "enough force" when the real blocker is the cap.
  const currentUnits = minorCiv.units.filter(unitId => Boolean(state.units[unitId])).length;
  const cap = getMinorCivUnitCap(state, minorCivId, 'mobilizing');
  if (currentUnits + 1 > cap) {
    return { eligible: false, reason: 'unit-cap' };
  }

  if (currentUnits >= MINOR_CIV_LEVY_MIN_DEFENSIVE_FORCE) {
    return { eligible: false, reason: 'sufficient-force' };
  }

  const unitType = chooseEmergencyLevyUnitType(state, minorCivId);
  if (!unitType) {
    return { eligible: false, reason: 'no-candidate' };
  }

  if (legalSpawnPositions(state, minorCivId, unitType).length === 0) {
    return { eligible: false, reason: 'no-spawn' };
  }

  return { eligible: true, unitType };
}

// The sole emergency-defender mutation path (#951). Only called from processMinorCivEconomyTurn,
// and only when normal production has not already completed a unit this turn — see the call site
// for the ordering rationale. A failed spawn (evaluated eligible, but createMinorCivUnit still
// can't place it — spawn legality can shift between the read-only check above and this mutation
// only if something else in this same turn already consumed the last legal tile, which does not
// happen on this call path) charges no population and sets no cooldown/recovery.
function performMinorCivEmergencyLevy(
  state: GameState,
  minorCivId: string,
  tuning: (typeof MINOR_CIV_ECONOMY_TUNING)[keyof typeof MINOR_CIV_ECONOMY_TUNING],
): { state: GameState; completed?: MinorCivEconomyTurnResult['completed'] } {
  const evaluation = evaluateMinorCivEmergencyLevy(state, minorCivId);
  if (!evaluation.eligible) {
    return { state };
  }

  const spawned = createMinorCivUnit(state, minorCivId, evaluation.unitType);
  if (!spawned.created || !spawned.unitId) {
    return { state };
  }

  const city = state.cities[state.minorCivs[minorCivId].cityId];
  let nextState: GameState = {
    ...spawned.state,
    units: {
      ...spawned.state.units,
      [spawned.unitId]: { ...spawned.state.units[spawned.unitId], health: MINOR_CIV_LEVY_UNIT_HEALTH },
    },
    cities: {
      ...spawned.state.cities,
      [city.id]: { ...spawned.state.cities[city.id], population: city.population - MINOR_CIV_LEVY_POPULATION_COST },
    },
  };
  nextState = updateMinorEconomy(nextState, minorCivId, {
    levyCooldownUntilTurn: nextState.turn + MINOR_CIV_LEVY_COOLDOWN_TURNS,
    localRecoveryUntilTurn: nextState.turn + tuning.recoveryTurns,
  });

  return {
    state: nextState,
    completed: { minorCivId, cityId: city.id, itemId: evaluation.unitType, itemClass: 'unit' },
  };
}

function updateMinorEconomy(
  state: GameState,
  minorCivId: string,
  patch: Partial<MinorCivEconomyState>,
): GameState {
  const minorCiv = state.minorCivs[minorCivId];
  if (!minorCiv) {
    return state;
  }

  const economy = { ...(minorCiv.economy ?? createDefaultMinorCivEconomyState(state)), ...patch };
  return {
    ...state,
    minorCivs: {
      ...state.minorCivs,
      [minorCivId]: { ...minorCiv, economy },
    },
  };
}

function isMinorCivQueueHeadLegal(state: GameState, minorCivId: string, itemId: string | undefined): boolean {
  if (!itemId) {
    return false;
  }

  const candidates = getMinorCivBuildCandidates(state, minorCivId);
  return candidates.buildings.some(building => building.id === itemId)
    || candidates.units.some(unit => unit.type === itemId);
}

export function processMinorCivEconomyTurn(
  state: GameState,
  minorCivId: string,
  bus?: EventBus,
): MinorCivEconomyTurnResult {
  let nextState = normalizeMinorCivEconomyState(state);
  const minorCiv = nextState.minorCivs[minorCivId];
  const city = minorCiv ? nextState.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || minorCiv.isDestroyed || !city || city.owner !== minorCiv.id) {
    return { state: nextState };
  }

  const tuning = MINOR_CIV_ECONOMY_TUNING[resolveOpponentChallenge(nextState)];
  const economy = minorCiv.economy ?? createDefaultMinorCivEconomyState(nextState);
  const pending = economy.pendingUnitSpawn;
  if (pending) {
    const spawned = createMinorCivUnit(nextState, minorCivId, pending.unitType);
    if (spawned.created) {
      const completed = {
        minorCivId,
        cityId: city.id,
        itemId: pending.unitType,
        itemClass: 'unit' as const,
      };
      nextState = updateMinorEconomy(spawned.state, minorCivId, {
        pendingUnitSpawn: undefined,
        recentProductionSummary: {
          itemId: completed.itemId,
          itemClass: completed.itemClass,
          completedTurn: nextState.turn,
        },
      });
      bus?.emit('minor-civ:production-completed', { ...completed, state: nextState });
      return { state: nextState, completed };
    }

    const attempts = pending.attempts + 1;
    nextState = updateMinorEconomy(nextState, minorCivId, {
      pendingUnitSpawn: attempts > tuning.pendingSpawnMaxAttempts ? undefined : { ...pending, attempts },
    });
    return { state: nextState };
  }

  let posture = evaluateMinorCivEconomyPosture(nextState, minorCivId);
  const work = city.workedTiles.length > city.population
    ? normalizeWorkedTilesForCity(nextState, city.id)
    : assignCityFocus(nextState, city.id, posture === 'recovering' ? 'food' : posture === 'mobilizing' ? 'production' : 'balanced');
  nextState = work.state;

  const currentCity = nextState.cities[city.id];
  let queue = currentCity.productionQueue;
  let madeQueueDecision = false;
  const queueHeadLegal = isMinorCivQueueHeadLegal(nextState, minorCivId, queue[0]);
  const emptyQueueDecisionReady = queue.length === 0
    && (economy.lastQueueDecisionTurn ?? -999) + tuning.queueDecisionInterval <= nextState.turn;
  const invalidQueueHead = queue.length > 0 && !queueHeadLegal;
  if (emptyQueueDecisionReady || invalidQueueHead) {
    const chosen = chooseMinorCivQueueItem(nextState, minorCivId);
    queue = chosen ? [chosen] : [];
    madeQueueDecision = true;
    nextState = {
      ...nextState,
      cities: {
        ...nextState.cities,
        [city.id]: { ...currentCity, productionQueue: queue },
      },
    };
  }

  const completedTechs = getMinorCivCompletedTechBand(nextState, minorCivId);
  const availableResources = getMinorCivAvailableResources(nextState, minorCivId);
  const cityForYields = nextState.cities[city.id];
  const yields = calculateCityYields(cityForYields, nextState.map, undefined, completedTechs, {}, nextState.turn);
  const productionYield = Math.max(0, Math.floor(yields.production * tuning.productionMultiplier));

  // #948 (H1): a one-city minor civ has no housing ceiling in the generic city-growth system, so
  // long peaceful games can produce an implausible megacity. Enforce an era-scaled ceiling here,
  // in the minor-civ economy flow only, rather than changing processCity for every civ. While at
  // or above the ceiling: (1) clamp any already-banked food below the next growth threshold, so a
  // legacy over-cap save can never re-trigger growth from stale banked food, and (2) feed
  // processCity a food yield equal to population (zero net surplus) so food stays flat instead of
  // banking toward a future multi-level jump. This never shrinks an already-over-cap population —
  // it only blocks further growth until the ceiling (era/maturity) catches up.
  const populationCeiling = getMinorCivPopulationCeiling(nextState, minorCivId);
  const growthSuppressed = cityForYields.population >= populationCeiling;
  const cityForProcessing = growthSuppressed
    ? { ...cityForYields, food: Math.min(cityForYields.food, Math.max(0, cityForYields.foodNeeded - 1)) }
    : cityForYields;
  const foodYieldForGrowth = growthSuppressed
    ? Math.min(yields.food, cityForProcessing.population)
    : yields.food;

  const processed = processCity(
    cityForProcessing,
    nextState.map,
    foodYieldForGrowth,
    productionYield,
    undefined,
    completedTechs,
    undefined,
    resolveNeutralPressureEra(nextState, cityForYields.position) ?? 1,
    availableResources,
  );
  nextState = {
    ...nextState,
    cities: { ...nextState.cities, [city.id]: processed.city },
  };

  let completed: MinorCivEconomyTurnResult['completed'];
  if (processed.completedUnit) {
    const spawned = createMinorCivUnit(nextState, minorCivId, processed.completedUnit);
    if (spawned.created) {
      nextState = spawned.state;
      completed = { minorCivId, cityId: city.id, itemId: processed.completedUnit, itemClass: 'unit' };
    } else {
      nextState = updateMinorEconomy(nextState, minorCivId, {
        pendingUnitSpawn: { unitType: processed.completedUnit, completedTurn: nextState.turn, attempts: 1 },
      });
    }
  } else if (processed.completedBuilding) {
    completed = { minorCivId, cityId: city.id, itemId: processed.completedBuilding, itemClass: 'building' };
  }

  // Emergency levy (#951): ordinary paid production satisfies this turn's mobilization budget
  // first. Only consider a levy when no unit finished production this turn — a completed building
  // does not address a military emergency, so it does not suppress the levy check.
  if (completed?.itemClass !== 'unit') {
    const levy = performMinorCivEmergencyLevy(nextState, minorCivId, tuning);
    if (levy.completed) {
      nextState = levy.state;
      completed = levy.completed;
    }
  }

  // Recompute posture after a possible levy so a same-turn recovery transition is visible
  // immediately (minor-civ-presentation.ts's posture fallback) rather than one turn late.
  posture = evaluateMinorCivEconomyPosture(nextState, minorCivId);
  const policy: MinorCivPolicy = posture === 'mobilizing' || posture === 'fortifying'
    ? 'defense'
    : posture === 'recovering'
      ? 'recovery'
      : 'balanced';

  nextState = updateMinorEconomy(nextState, minorCivId, {
    posture,
    policy,
    lastProcessedTurn: nextState.turn,
    lastPostureChangeTurn: posture !== economy.posture ? nextState.turn : economy.lastPostureChangeTurn,
    lastQueueDecisionTurn: madeQueueDecision ? nextState.turn : economy.lastQueueDecisionTurn,
    recentProductionSummary: completed
      ? {
          itemId: completed.itemId,
          itemClass: completed.itemClass,
          completedTurn: nextState.turn,
        }
      : economy.recentProductionSummary,
  });

  if (completed) {
    bus?.emit('minor-civ:production-completed', { ...completed, state: nextState });
  }
  return { state: nextState, completed };
}
