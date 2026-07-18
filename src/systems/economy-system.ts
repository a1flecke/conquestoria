import type {
  City,
  EconomyMaintenanceBreakdown,
  EconomyStatus,
  GameState,
  TreasuryStrainLevel,
  Unit,
  UnitType,
} from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { BUILDINGS, completeCityProductionItem, getProductionCostForItem, isBuildingObsolete, TRAINABLE_UNITS } from './city-system';
import { calculateProjectedCityYields } from './city-work-system';
import { createSpyFromUnit, isSpyUnitType } from './espionage-system';
import { getLegendaryWonderCityYieldBonus, getLegendaryWonderCivYieldBonus } from './legendary-wonder-system';
import { getActiveNationalProjectsForCiv, getNationalProjectCivYieldBonus } from './national-project-system';
import { processTradeRouteIncome } from './trade-system';
import { getClaimedTrophyGoldPerTurn } from './beast-system';
import { getReligionTithesGold } from './religion-system';
import { createUnit, UNIT_DEFINITIONS } from './unit-system';
import { resolveCivDefinition } from './civ-registry';
import { getCivAvailableResources, getCivHappinessFromResources } from './resource-acquisition-system';
import {
  getEmpireTechPercents,
  getCivLuxuryTechGold,
  getEmpireFlatTechYields,
  getCivWonderTechGold,
  getCivRoutePartnerTechGold,
  getMaintenanceDiscountMultiplier,
  getRoadTileTechGold,
  getConnectedCityTechGold,
} from './tech-yield-system';
import { getOwnedRoadTileCount, getCitiesConnectedToCapital } from './road-network';
import { isAtWar } from './diplomacy-system';

export const ECONOMY_RULES = {
  rushBuyMultiplier: 2.5,
  coreFreeBuildings: new Set([
    'city-center',
    'herbalist',
    'workshop',
    'shrine',
    'barracks',
    'library',
    'granary',
  ]),
  freeUnitTypes: new Set<UnitType>(['settler', 'worker', 'scout']),
  buildingUpkeep: {
    default: 1,
    advanced: 2,
  },
  advancedBuildingIds: new Set([
    'forge',
    'observatory',
    'harbor',
    'amphitheater',
    'security-bureau',
    'intelligence-agency',
  ]),
  unitUpkeep: {
    default: 1,
    advanced: 2,
  },
  advancedUnitTypes: new Set<UnitType>([
    'swordsman',
    'pikeman',
    'musketeer',
    'galley',
    'trireme',
    'spy_scout',
    'spy_informant',
    'spy_agent',
    'spy_operative',
    'spy_hacker',
    'scout_hound',
    'shadow_warden',
    'war_hound',
  ]),
  specialistUnitTypes: new Set<UnitType>([
    'galley',
    'trireme',
    'spy_scout',
    'spy_informant',
    'spy_agent',
    'spy_operative',
    'spy_hacker',
    'scout_hound',
    'shadow_warden',
    'war_hound',
  ]),
  basicDefenderTypes: new Set<UnitType>(['warrior', 'archer']),
  defenderSlotsPerCity: 2,
  strainThresholds: {
    highUnpaidMaintenance: 5,
    highUnpaidRatio: 0.25,
    criticalUnpaidMaintenance: 10,
    criticalUnpaidRatio: 0.5,
  },
} as const;

export interface CalculateCivEconomyOptions {
  grossGoldPerTurn?: number;
  pirateModifiers?: PirateEconomyModifiers;
  maintenanceOverride?: {
    buildingUpkeep?: number;
    unitUpkeep?: number;
  };
}

export interface PirateEconomyModifiers {
  plunderByCiv: Record<string, number>;
  blockadedCityIds: string[];
}

export interface EconomyProjection extends EconomyStatus {
  civId: string;
  startingGold: number;
  endingGold: number;
  grossGoldPerTurn: number;
  grossGoldIncome: number;
  maintenanceGoldPerTurn: number;
  buildingMaintenance: number;
  unitMaintenance: number;
  totalMaintenance: number;
  projectedGold: number;
  rushBuyDisabled: boolean;
  breakdown: EconomyMaintenanceBreakdown;
}

interface LegacyEconomyStatus {
  civId?: string;
  grossGoldPerTurn?: number;
  grossGoldIncome?: number;
  maintenanceGoldPerTurn?: number;
  buildingMaintenance?: number;
  unitMaintenance?: number;
  netGoldPerTurn?: number;
  projectedGold?: number;
  unpaidMaintenance?: number;
  strainLevel?: string;
  rushBuyDisabled?: boolean;
  breakdown?: Partial<EconomyMaintenanceBreakdown>;
  turn?: number;
}

export type MaintenanceReason = 'exempt' | 'free-support' | 'free-defender' | 'paid' | 'obsolete';

export interface MaintenanceRow {
  id: string;
  label: string;
  upkeep: number;
  reason: MaintenanceReason;
}

export interface CityBuildingMaintenance {
  cityId: string;
  freeSupport: number;
  supportUsed: number;
  upkeep: number;
  exemptBuildings: MaintenanceRow[];
  supportedBuildings: MaintenanceRow[];
  paidBuildings: MaintenanceRow[];
  rows: MaintenanceRow[];
}

export interface CivUnitMaintenance {
  civId: string;
  freeSupport: number;
  supportUsed: number;
  defenderSlots: number;
  defenderSlotsUsed: number;
  upkeep: number;
  exemptUnits: MaintenanceRow[];
  freeDefenderUnits: MaintenanceRow[];
  supportedUnits: MaintenanceRow[];
  paidUnits: MaintenanceRow[];
  rows: MaintenanceRow[];
}

export type RushBuyDisabledReason =
  | 'no-active-production'
  | 'invalid-active-item'
  | 'not-owner'
  | 'not-enough-gold'
  | 'treasury-strain-too-high'
  | 'wonders-cannot-be-bought';

export interface RushBuyQuote {
  available: boolean;
  itemId: string | null;
  cost: number;
  reason: RushBuyDisabledReason | null;
  message: string | null;
  status: EconomyProjection;
}

export type RushBuyResult =
  | { success: true; state: GameState; itemId: string; label: string; cost: number }
  | { success: false; state: GameState; reason: RushBuyDisabledReason; message: string };

function getBuildingUpkeep(buildingId: string): number {
  if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) return 0;
  return ECONOMY_RULES.advancedBuildingIds.has(buildingId)
    ? ECONOMY_RULES.buildingUpkeep.advanced
    : ECONOMY_RULES.buildingUpkeep.default;
}

function getUnitUpkeep(unitType: UnitType): number {
  if (ECONOMY_RULES.freeUnitTypes.has(unitType)) return 0;
  return ECONOMY_RULES.advancedUnitTypes.has(unitType)
    ? ECONOMY_RULES.unitUpkeep.advanced
    : ECONOMY_RULES.unitUpkeep.default;
}

function getBuildingLabel(buildingId: string): string {
  return BUILDINGS[buildingId]?.name ?? buildingId;
}

function getUnitLabel(unit: Unit): string {
  return UNIT_DEFINITIONS[unit.type]?.name ?? unit.type;
}

function getFreeBuildingSlots(city: City): number {
  const maturityBonusByLevel: Record<City['maturity'], number> = {
    outpost:    0,
    village:    0,
    town:       1,
    city:       2,
    metropolis: 3,
  };
  return Math.floor(city.population / 2) + maturityBonusByLevel[city.maturity];
}

function getFreeGeneralUnitSlots(cities: City[]): number {
  const totalPopulation = cities.reduce((sum, city) => sum + city.population, 0);
  return 2 + cities.length * 2 + Math.floor(totalPopulation / 3);
}

function getTreasuryStrainLevel(unpaidMaintenance: number, totalMaintenance: number): TreasuryStrainLevel {
  if (unpaidMaintenance <= 0) return 'none';
  const ratio = unpaidMaintenance / Math.max(1, totalMaintenance);
  if (
    unpaidMaintenance >= ECONOMY_RULES.strainThresholds.criticalUnpaidMaintenance
    || ratio >= ECONOMY_RULES.strainThresholds.criticalUnpaidRatio
  ) {
    return 'critical';
  }
  if (
    unpaidMaintenance >= ECONOMY_RULES.strainThresholds.highUnpaidMaintenance
    || ratio >= ECONOMY_RULES.strainThresholds.highUnpaidRatio
  ) {
    return 'high';
  }
  return 'low';
}

export function normalizeEconomyStatus(
  raw: LegacyEconomyStatus | undefined,
  civId: string,
  currentTurn: number,
): EconomyStatus {
  void civId;
  if (!raw) {
    return {
      turn: currentTurn,
      grossGoldIncome: 0,
      buildingMaintenance: 0,
      unitMaintenance: 0,
      netGoldPerTurn: 0,
      unpaidMaintenance: 0,
      strainLevel: 'none',
    };
  }

  const grossGoldIncome = raw.grossGoldIncome ?? raw.grossGoldPerTurn ?? 0;
  const buildingMaintenance = raw.buildingMaintenance
    ?? raw.breakdown?.buildingUpkeep
    ?? raw.maintenanceGoldPerTurn
    ?? 0;
  const unitMaintenance = raw.unitMaintenance
    ?? raw.breakdown?.unitUpkeep
    ?? 0;
  const totalMaintenance = buildingMaintenance + unitMaintenance;
  const netGoldPerTurn = raw.netGoldPerTurn ?? grossGoldIncome - totalMaintenance;
  const unpaidMaintenance = raw.unpaidMaintenance ?? 0;

  return {
    turn: raw.turn ?? currentTurn,
    grossGoldIncome,
    buildingMaintenance,
    unitMaintenance,
    netGoldPerTurn,
    unpaidMaintenance,
    strainLevel: getTreasuryStrainLevel(unpaidMaintenance, totalMaintenance),
  };
}

function getBuildingMaintenancePriority(buildingId: string): number {
  if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) return 0;
  const building = BUILDINGS[buildingId];
  if (building?.pacing?.band === 'starter') return 1;
  if (building?.category === 'food' || building?.category === 'production' || building?.category === 'economy') return 2;
  if (ECONOMY_RULES.advancedBuildingIds.has(buildingId)) return 4;
  return 3;
}

function getUnitMaintenancePriority(unit: Unit): number {
  if (ECONOMY_RULES.freeUnitTypes.has(unit.type)) return 0;
  if (ECONOMY_RULES.basicDefenderTypes.has(unit.type)) return 1;
  if (!ECONOMY_RULES.specialistUnitTypes.has(unit.type) && (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) > 0) return 2;
  if (ECONOMY_RULES.advancedUnitTypes.has(unit.type)) return 3;
  return 4;
}

function compareBuildingSupportCandidates(
  left: { id: string; upkeep: number },
  right: { id: string; upkeep: number },
): number {
  const priorityDelta = getBuildingMaintenancePriority(left.id) - getBuildingMaintenancePriority(right.id);
  if (priorityDelta !== 0) return priorityDelta;
  if (left.upkeep !== right.upkeep) return left.upkeep - right.upkeep;
  return left.id.localeCompare(right.id);
}

function compareUnitSupportCandidates(left: Unit, right: Unit): number {
  const priorityDelta = getUnitMaintenancePriority(left) - getUnitMaintenancePriority(right);
  if (priorityDelta !== 0) return priorityDelta;
  const upkeepDelta = getUnitUpkeep(left.type) - getUnitUpkeep(right.type);
  if (upkeepDelta !== 0) return upkeepDelta;
  return left.id.localeCompare(right.id);
}

export function calculateCityBuildingMaintenance(state: GameState, cityOrId: City | string): CityBuildingMaintenance {
  const city = typeof cityOrId === 'string' ? state.cities[cityOrId] : cityOrId;
  const cityId = typeof cityOrId === 'string' ? cityOrId : cityOrId.id;
  if (!city) {
    return { cityId, freeSupport: 0, supportUsed: 0, upkeep: 0, exemptBuildings: [], supportedBuildings: [], paidBuildings: [], rows: [] };
  }

  const freeSupport = getFreeBuildingSlots(city);
  const exemptBuildings: MaintenanceRow[] = [];
  const candidates: MaintenanceRow[] = [];
  const owner = state.civilizations[city.owner];

  for (const buildingId of city.buildings) {
    const building = BUILDINGS[buildingId];
    if (!building) continue;
    if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) {
      exemptBuildings.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: 0, reason: 'exempt' });
      continue;
    }
    if (isBuildingObsolete(building, owner?.techState.completed ?? [])) {
      exemptBuildings.push({ id: buildingId, label: getBuildingLabel(buildingId), upkeep: 0, reason: 'obsolete' });
      continue;
    }
    candidates.push({
      id: buildingId,
      label: getBuildingLabel(buildingId),
      upkeep: getBuildingUpkeep(buildingId),
      reason: 'paid',
    });
  }

  candidates.sort(compareBuildingSupportCandidates);

  const supportedBuildings = candidates.slice(0, freeSupport).map(row => ({ ...row, upkeep: 0, reason: 'free-support' as const }));
  const paidBuildings = candidates.slice(freeSupport).map(row => ({ ...row, reason: 'paid' as const }));
  const maintenanceMultiplier = getMaintenanceDiscountMultiplier(owner?.techState.completed ?? [], city.buildings.length);
  const upkeep = Math.round(paidBuildings.reduce((sum, row) => sum + row.upkeep, 0) * maintenanceMultiplier);

  return {
    cityId,
    freeSupport,
    supportUsed: supportedBuildings.length,
    upkeep,
    exemptBuildings,
    supportedBuildings,
    paidBuildings,
    rows: [...exemptBuildings, ...supportedBuildings, ...paidBuildings],
  };
}

export function calculateCivUnitMaintenance(state: GameState, civId: string): CivUnitMaintenance {
  const civ = state.civilizations[civId];
  if (!civ) {
    return {
      civId,
      freeSupport: 0,
      supportUsed: 0,
      defenderSlots: 0,
      defenderSlotsUsed: 0,
      upkeep: 0,
      exemptUnits: [],
      freeDefenderUnits: [],
      supportedUnits: [],
      paidUnits: [],
      rows: [],
    };
  }

  const cities = (civ.cities ?? []).map(cityId => state.cities[cityId]).filter((city): city is City => Boolean(city));
  const units = (civ.units ?? []).map(unitId => state.units[unitId]).filter((unit): unit is Unit => Boolean(unit));
  const exemptUnitIds = new Set<string>();
  const exemptUnits: MaintenanceRow[] = [];

  for (const unit of units) {
    if (ECONOMY_RULES.freeUnitTypes.has(unit.type)) {
      exemptUnitIds.add(unit.id);
      exemptUnits.push({ id: unit.id, label: getUnitLabel(unit), upkeep: 0, reason: 'exempt' });
    }
  }

  const defenderSlots = cities.length * ECONOMY_RULES.defenderSlotsPerCity;
  const combatUnits = units
    .filter(unit => !exemptUnitIds.has(unit.id) && (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) > 0)
    .sort(compareUnitSupportCandidates);
  const freeDefenderUnits = combatUnits.slice(0, defenderSlots).map(unit => ({
    id: unit.id,
    label: getUnitLabel(unit),
    upkeep: 0,
    reason: 'free-defender' as const,
  }));

  const freeUnitIds = new Set([...exemptUnitIds, ...freeDefenderUnits.map(row => row.id)]);
  const freeSupport = getFreeGeneralUnitSlots(cities);
  const supportCandidates = units
    .filter(unit => !freeUnitIds.has(unit.id))
    .sort(compareUnitSupportCandidates);
  const supportedUnits = supportCandidates.slice(0, freeSupport).map(unit => ({
    id: unit.id,
    label: getUnitLabel(unit),
    upkeep: 0,
    reason: 'free-support' as const,
  }));

  for (const row of supportedUnits) freeUnitIds.add(row.id);

  const paidUnits = units
    .filter(unit => !freeUnitIds.has(unit.id))
    .sort(compareUnitSupportCandidates)
    .map(unit => ({
      id: unit.id,
      label: getUnitLabel(unit),
      upkeep: getUnitUpkeep(unit.type),
      reason: 'paid' as const,
    }));
  const upkeep = paidUnits.reduce((sum, row) => sum + row.upkeep, 0);

  return {
    civId,
    freeSupport,
    supportUsed: supportedUnits.length,
    defenderSlots,
    defenderSlotsUsed: freeDefenderUnits.length,
    upkeep,
    exemptUnits,
    freeDefenderUnits,
    supportedUnits,
    paidUnits,
    rows: [...exemptUnits, ...freeDefenderUnits, ...supportedUnits, ...paidUnits],
  };
}

export function calculateMaintenance(state: GameState, civId: string): EconomyMaintenanceBreakdown {
  const civ = state.civilizations[civId];
  if (!civ) {
    return {
      buildingUpkeep: 0,
      unitUpkeep: 0,
      freeBuildings: 0,
      freeUnits: 0,
      paidBuildings: 0,
      paidUnits: 0,
    };
  }

  const cityBreakdowns = civ.cities.map(cityId => calculateCityBuildingMaintenance(state, cityId));
  const unitBreakdown = calculateCivUnitMaintenance(state, civId);

  return {
    buildingUpkeep: cityBreakdowns.reduce((sum, breakdown) => sum + breakdown.upkeep, 0),
    unitUpkeep: unitBreakdown.upkeep,
    freeBuildings: cityBreakdowns.reduce(
      (sum, breakdown) => sum + breakdown.exemptBuildings.length + breakdown.supportedBuildings.length,
      0,
    ),
    freeUnits: unitBreakdown.exemptUnits.length + unitBreakdown.freeDefenderUnits.length + unitBreakdown.supportedUnits.length,
    paidBuildings: cityBreakdowns.reduce((sum, breakdown) => sum + breakdown.paidBuildings.length, 0),
    paidUnits: unitBreakdown.paidUnits.length,
  };
}

export function projectCivGrossGold(
  state: GameState,
  civId: string,
  pirateModifiers: PirateEconomyModifiers = { plunderByCiv: {}, blockadedCityIds: [] },
): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;

  const civDef = resolveCivDefinition(state, civ.civType ?? '');
  const blockadedCityIds = new Set(pirateModifiers.blockadedCityIds);
  const empireTechPercents = getEmpireTechPercents(civ.techState.completed);
  let grossGold = 0;

  for (const cityId of civ.cities) {
    const projected = calculateProjectedCityYields(state, cityId, civDef?.bonusEffect);
    const wonderCityBonuses = getLegendaryWonderCityYieldBonus(state, civId, cityId);
    const cityGold = (projected.gold + (wonderCityBonuses.gold ?? 0)) * (1 + (empireTechPercents.gold ?? 0) / 100);
    grossGold += blockadedCityIds.has(cityId) ? cityGold * 0.75 : cityGold;
  }

  const wonderCivBonuses = getLegendaryWonderCivYieldBonus(state, civId);
  grossGold += wonderCivBonuses.gold ?? 0;
  const npCivBonuses = getNationalProjectCivYieldBonus(state, civId);
  grossGold += npCivBonuses.gold ?? 0;
  grossGold += getCivLuxuryTechGold(civ.techState.completed, getCivHappinessFromResources(state, civId));
  grossGold += getEmpireFlatTechYields(civ.techState.completed).gold;
  grossGold += getRoadTileTechGold(civ.techState.completed, getOwnedRoadTileCount(state, civId));
  grossGold += getConnectedCityTechGold(civ.techState.completed, getCitiesConnectedToCapital(state, civId).size);

  const completedWonderCount = Object.values(state.completedLegendaryWonders ?? {})
    .filter(wonder => wonder.ownerId === civId).length;
  grossGold += getCivWonderTechGold(civ.techState.completed, completedWonderCount);

  const routePartnerCivIds = new Set<string>();
  for (const route of state.marketplace?.tradeRoutes ?? []) {
    const routeFromCity = state.cities[route.fromCityId];
    const routeToCity = state.cities[route.toCityId];
    let partnerCivId: string | undefined;
    if (routeFromCity?.owner === civId && route.foreignCivId) {
      partnerCivId = route.foreignCivId;
    } else if (routeToCity?.owner === civId && routeFromCity && routeFromCity.owner !== civId) {
      partnerCivId = routeFromCity.owner;
    }
    if (!partnerCivId || !state.civilizations[partnerCivId]) continue;
    if (isAtWar(civ.diplomacy, partnerCivId)) continue;
    routePartnerCivIds.add(partnerCivId);
  }
  grossGold += getCivRoutePartnerTechGold(civ.techState.completed, routePartnerCivIds.size);

  if (civDef?.bonusEffect.type === 'allied_kingdoms') {
    const allianceCount = civ.diplomacy.treaties.filter(treaty => treaty.type === 'alliance').length;
    grossGold += allianceCount * civDef.bonusEffect.allianceYieldBonus;
  }

  for (const treaty of civ.diplomacy.treaties) {
    if (treaty.type === 'trade_agreement' && treaty.goldPerTurn) {
      grossGold += treaty.goldPerTurn;
    }
  }

  if (state.marketplace) {
    grossGold += processTradeRouteIncome(
      state.marketplace.tradeRoutes.filter(route =>
        state.cities[route.fromCityId]?.owner === civId
        && !blockadedCityIds.has(route.fromCityId)
        && !blockadedCityIds.has(route.toCityId),
      ),
      state,
    );
  }

  grossGold += getClaimedTrophyGoldPerTurn(state, civId);
  grossGold += getReligionTithesGold(state, civId);

  return grossGold;
}

export function calculateCivEconomy(
  state: GameState,
  civId: string,
  options: CalculateCivEconomyOptions = {},
): EconomyProjection {
  const civ = state.civilizations[civId];
  const modifiers = options.pirateModifiers ?? { plunderByCiv: {}, blockadedCityIds: [] };
  const baseProjectedGross = projectCivGrossGold(state, civId);
  const modifiedProjectedGross = projectCivGrossGold(state, civId, modifiers);
  const grossGoldIncome = options.grossGoldPerTurn === undefined
    ? modifiedProjectedGross
    : options.grossGoldPerTurn + (modifiedProjectedGross - baseProjectedGross);
  const baseBreakdown = calculateMaintenance(state, civId);
  const breakdown = {
    ...baseBreakdown,
    buildingUpkeep: options.maintenanceOverride?.buildingUpkeep ?? baseBreakdown.buildingUpkeep,
    unitUpkeep: options.maintenanceOverride?.unitUpkeep ?? baseBreakdown.unitUpkeep,
  };
  const buildingMaintenance = breakdown.buildingUpkeep;
  const unitMaintenance = breakdown.unitUpkeep;
  const totalMaintenance = buildingMaintenance + unitMaintenance;
  const netGoldPerTurn = grossGoldIncome - totalMaintenance;
  const startingGold = Math.max(0, (civ?.gold ?? 0) - Math.max(0, modifiers.plunderByCiv[civId] ?? 0));
  const endingGold = Math.max(0, startingGold + netGoldPerTurn);
  const unpaidMaintenance = Math.max(0, totalMaintenance - (startingGold + grossGoldIncome));
  const strainLevel = getTreasuryStrainLevel(unpaidMaintenance, totalMaintenance);

  return {
    civId,
    turn: state.turn,
    startingGold,
    endingGold,
    grossGoldPerTurn: grossGoldIncome,
    grossGoldIncome,
    maintenanceGoldPerTurn: totalMaintenance,
    buildingMaintenance,
    unitMaintenance,
    totalMaintenance,
    netGoldPerTurn,
    projectedGold: endingGold,
    unpaidMaintenance,
    strainLevel,
    rushBuyDisabled: strainLevel === 'high' || strainLevel === 'critical',
    breakdown,
  };
}

function toResolvedEconomyStatus(result: EconomyProjection): EconomyStatus {
  return {
    turn: result.turn,
    grossGoldIncome: result.grossGoldIncome,
    buildingMaintenance: result.buildingMaintenance,
    unitMaintenance: result.unitMaintenance,
    netGoldPerTurn: result.netGoldPerTurn,
    unpaidMaintenance: result.unpaidMaintenance,
    strainLevel: result.strainLevel,
  };
}

export function applyEconomyTurn(
  state: GameState,
  civId: string,
  grossGoldPerTurn: number,
  pirateModifiers?: PirateEconomyModifiers,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  const status = calculateCivEconomy(state, civId, { grossGoldPerTurn, pirateModifiers });
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        gold: status.projectedGold,
      },
    },
    economyStatusByCiv: {
      ...(state.economyStatusByCiv ?? {}),
      [civId]: toResolvedEconomyStatus(status),
    },
  };
}

export function emitEconomyStrainIfNeeded(
  previous: EconomyStatus | undefined,
  current: EconomyStatus,
  bus: EventBus,
  civId: string,
): void {
  if (current.strainLevel === 'none') return;
  const previousStatus = normalizeEconomyStatus(previous as LegacyEconomyStatus | undefined, civId, current.turn);
  if (
    previousStatus.strainLevel === current.strainLevel
    && previousStatus.unpaidMaintenance === current.unpaidMaintenance
    && previousStatus.turn === current.turn
  ) {
    return;
  }
  bus.emit('economy:treasury-strain', {
    civId,
    level: current.strainLevel,
    netGoldPerTurn: current.netGoldPerTurn,
    unpaidMaintenance: current.unpaidMaintenance,
  });
}

export function getEconomyStatusForCiv(state: GameState, civId: string): EconomyStatus {
  return normalizeEconomyStatus(state.economyStatusByCiv?.[civId] as LegacyEconomyStatus | undefined, civId, state.turn);
}

export function getProductionLabel(itemId: string): string {
  return BUILDINGS[itemId]?.name
    ?? TRAINABLE_UNITS.find(unit => unit.type === itemId)?.name
    ?? itemId;
}

export function getRushBuyQuote(state: GameState, civId: string, cityId: string): RushBuyQuote {
  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  const ownerStatus = calculateCivEconomy(state, civId);

  if (!city || !civ) {
    return { available: false, itemId: null, cost: 0, reason: 'invalid-active-item', message: 'This production item cannot be bought.', status: ownerStatus };
  }

  if (city.owner !== civId) {
    return { available: false, itemId: null, cost: 0, reason: 'not-owner', message: 'Only the owner can buy production.', status: ownerStatus };
  }

  const itemId = city.productionQueue[0] ?? null;
  if (!itemId) {
    return { available: false, itemId: null, cost: 0, reason: 'no-active-production', message: 'No active production to buy.', status: ownerStatus };
  }

  if (itemId.startsWith('legendary:')) {
    return { available: false, itemId, cost: 0, reason: 'wonders-cannot-be-bought', message: 'Wonders cannot be bought.', status: ownerStatus };
  }

  if (ownerStatus.strainLevel === 'high' || ownerStatus.strainLevel === 'critical') {
    return {
      available: false,
      itemId,
      cost: 0,
      reason: 'treasury-strain-too-high',
      message: 'Treasury strain is too high.',
      status: ownerStatus,
    };
  }

  const civDef = resolveCivDefinition(state, civ.civType ?? '');
  const cost = getProductionCostForItem(itemId, {
    city,
    bonusEffect: civDef?.bonusEffect,
    era: state.era,
    completedTechs: civ.techState.completed,
    activeNationalProjects: getActiveNationalProjectsForCiv(state, civId),
    availableResources: getCivAvailableResources(state, civId),
  });
  if (cost <= 0) {
    return { available: false, itemId, cost: 0, reason: 'invalid-active-item', message: 'This production item cannot be bought.', status: ownerStatus };
  }

  const remainingProduction = Math.max(1, cost - city.productionProgress);
  const rushCost = Math.ceil(remainingProduction * ECONOMY_RULES.rushBuyMultiplier);
  if (civ.gold < rushCost) {
    return {
      available: false,
      itemId,
      cost: rushCost,
      reason: 'not-enough-gold',
      message: `Not enough gold: need ${rushCost}.`,
      status: ownerStatus,
    };
  }

  return { available: true, itemId, cost: rushCost, reason: null, message: null, status: ownerStatus };
}

export function rushBuyActiveProduction(
  state: GameState,
  civId: string,
  cityId: string,
  bus: EventBus,
): RushBuyResult {
  const quote = getRushBuyQuote(state, civId, cityId);
  if (!quote.available || !quote.itemId) {
    return {
      success: false,
      state,
      reason: quote.reason ?? 'invalid-active-item',
      message: quote.message ?? 'This production item cannot be bought.',
    };
  }

  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  if (!city || !civ || city.owner !== civId) {
    return { success: false, state, reason: 'not-owner', message: 'Only the owner can buy production.' };
  }

  const completion = completeCityProductionItem(city, quote.itemId);
  const nextCiv = { ...civ, gold: civ.gold - quote.cost, units: [...civ.units] };
  if (nextCiv.gold < 0) {
    return { success: false, state, reason: 'not-enough-gold', message: `Not enough gold: need ${quote.cost}.` };
  }
  if (!completion.completedBuilding && !completion.completedUnit) {
    return { success: false, state, reason: 'invalid-active-item', message: 'This production item cannot be bought.' };
  }

  let nextState: GameState = {
    ...state,
    idCounters: { ...state.idCounters },
    cities: {
      ...state.cities,
      [cityId]: completion.city,
    },
    civilizations: {
      ...state.civilizations,
      [civId]: nextCiv,
    },
    units: { ...state.units },
    espionage: state.espionage ? { ...state.espionage } : state.espionage,
  };

  if (completion.completedBuilding) {
    bus.emit('city:building-complete', { cityId, buildingId: completion.completedBuilding });
  }

  if (completion.completedUnit) {
    const civDef = resolveCivDefinition(nextState, civ.civType ?? '');
    const newUnit = createUnit(completion.completedUnit, civId, city.position, nextState.idCounters, civDef?.bonusEffect);
    nextState.units = { ...nextState.units, [newUnit.id]: newUnit };
    nextState.civilizations = {
      ...nextState.civilizations,
      [civId]: {
        ...nextState.civilizations[civId],
        units: [...nextState.civilizations[civId].units, newUnit.id],
      },
    };
    bus.emit('city:unit-trained', { cityId, unitType: completion.completedUnit });

    if (isSpyUnitType(completion.completedUnit) && nextState.espionage?.[civId]) {
      const { state: updatedEspionage, spy } = createSpyFromUnit(
        nextState.espionage[civId],
        newUnit.id,
        civId,
        completion.completedUnit,
        `spy-unit-${newUnit.id}-${nextState.turn}`,
      );
      nextState.espionage = {
        ...nextState.espionage,
        [civId]: updatedEspionage,
      };
      bus.emit('espionage:spy-recruited', { civId, spy });
    }
  }

  const status = calculateCivEconomy(nextState, civId);
  nextState = {
    ...nextState,
    economyStatusByCiv: {
      ...(nextState.economyStatusByCiv ?? {}),
      [civId]: toResolvedEconomyStatus(status),
    },
  };

  return {
    success: true,
    state: nextState,
    itemId: quote.itemId,
    label: getProductionLabel(quote.itemId),
    cost: quote.cost,
  };
}

export function formatGoldHudText(status: EconomyStatus | EconomyProjection, currentGold: number): string {
  const sign = status.netGoldPerTurn >= 0 ? '+' : '';
  const base = `${currentGold} (${sign}${status.netGoldPerTurn} net)`;
  if (status.strainLevel === 'critical') return `${base} · Critical strain`;
  if (status.strainLevel === 'high') return `${base} · Rush-buy blocked`;
  if (status.strainLevel === 'low') return `${base} · Treasury strain`;
  return base;
}

export function formatMaintenanceTooltip(status: EconomyStatus | EconomyProjection): string {
  const buildingMaintenance = 'buildingMaintenance' in status ? status.buildingMaintenance : 0;
  const unitMaintenance = 'unitMaintenance' in status ? status.unitMaintenance : 0;
  const parts = [
    `Income: ${status.grossGoldIncome}`,
    `Maintenance: -${buildingMaintenance + unitMaintenance}`,
  ];
  if ('breakdown' in status) {
    if (status.breakdown.paidBuildings > 0) {
      parts.push(`${status.breakdown.paidBuildings} paid buildings`);
    }
    if (status.breakdown.paidUnits > 0) {
      parts.push(`${status.breakdown.paidUnits} paid units`);
    }
  }
  if (status.unpaidMaintenance > 0) {
    parts.push(`${status.unpaidMaintenance} unpaid`);
  }
  return parts.join(' | ');
}
