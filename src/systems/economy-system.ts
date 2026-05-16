import type {
  City,
  EconomyMaintenanceBreakdown,
  EconomyStatus,
  EconomyStrainLevel,
  GameState,
  Unit,
  UnitType,
} from '@/core/types';
import { getProductionCostForItem } from './city-system';
import { calculateProjectedCityYields } from './city-work-system';
import { EventBus } from '@/core/event-bus';
import { getLegendaryWonderCityYieldBonus, getLegendaryWonderCivYieldBonus } from './legendary-wonder-system';
import { processTradeRouteIncome } from './trade-system';
import { UNIT_DEFINITIONS } from './unit-system';
import { resolveCivDefinition } from './civ-registry';

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
  advancedBuildingUpkeep: new Set([
    'forge',
    'observatory',
    'harbor',
    'amphitheater',
    'security-bureau',
    'intelligence-agency',
  ]),
  freeUnitTypes: new Set<UnitType>(['settler', 'worker', 'scout']),
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
  criticalDeficitThreshold: -10,
  criticalTreasuryThreshold: 15,
} as const;

export interface CalculateCivEconomyOptions {
  grossGoldPerTurn?: number;
  maintenanceOverride?: {
    buildingUpkeep?: number;
    unitUpkeep?: number;
  };
}

export interface RushBuyQuote {
  available: boolean;
  itemId: string | null;
  cost: number;
  reason: string | null;
  status: EconomyStatus;
}

function getBuildingUpkeep(buildingId: string): number {
  if (ECONOMY_RULES.coreFreeBuildings.has(buildingId)) return 0;
  return ECONOMY_RULES.advancedBuildingUpkeep.has(buildingId) ? 2 : 1;
}

function getUnitUpkeep(unitType: UnitType): number {
  if (ECONOMY_RULES.freeUnitTypes.has(unitType)) return 0;
  return ECONOMY_RULES.advancedUnitTypes.has(unitType) ? 2 : 1;
}

function getFreeBuildingSlots(city: City): number {
  const maturityBonusByLevel: Record<City['maturity'], number> = {
    outpost: 0,
    village: 1,
    town: 2,
    city: 3,
    metropolis: 4,
  };
  return 4 + Math.floor(city.population / 2) + maturityBonusByLevel[city.maturity];
}

function getFreeGeneralUnitSlots(cities: City[]): number {
  const totalPopulation = cities.reduce((sum, city) => sum + city.population, 0);
  return 2 + cities.length * 2 + Math.floor(totalPopulation / 3);
}

function sortByHighestAvoidedUpkeep(a: { upkeep: number; id: string }, b: { upkeep: number; id: string }): number {
  if (b.upkeep !== a.upkeep) return b.upkeep - a.upkeep;
  return a.id.localeCompare(b.id);
}

function sortCombatUnitsForFreeDefenders(a: Unit, b: Unit): number {
  const aUpkeep = getUnitUpkeep(a.type);
  const bUpkeep = getUnitUpkeep(b.type);
  if (bUpkeep !== aUpkeep) return bUpkeep - aUpkeep;
  const aStrength = UNIT_DEFINITIONS[a.type]?.strength ?? 0;
  const bStrength = UNIT_DEFINITIONS[b.type]?.strength ?? 0;
  if (bStrength !== aStrength) return bStrength - aStrength;
  return a.id.localeCompare(b.id);
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

  let buildingUpkeep = 0;
  let freeBuildings = 0;
  let paidBuildings = 0;
  const cities = civ.cities.map(cityId => state.cities[cityId]).filter((city): city is City => Boolean(city));

  for (const city of cities) {
    const coreBuildings = city.buildings.filter(buildingId => ECONOMY_RULES.coreFreeBuildings.has(buildingId));
    freeBuildings += coreBuildings.length;

    const paidCandidates = city.buildings
      .filter(buildingId => !ECONOMY_RULES.coreFreeBuildings.has(buildingId))
      .map(buildingId => ({ id: buildingId, upkeep: getBuildingUpkeep(buildingId) }))
      .sort(sortByHighestAvoidedUpkeep);

    const freeSlots = getFreeBuildingSlots(city);
    for (const [index, candidate] of paidCandidates.entries()) {
      if (index < freeSlots) {
        freeBuildings++;
      } else {
        paidBuildings++;
        buildingUpkeep += candidate.upkeep;
      }
    }
  }

  const units = civ.units.map(unitId => state.units[unitId]).filter((unit): unit is Unit => Boolean(unit));
  let unitUpkeep = 0;
  let freeUnits = 0;
  let paidUnits = 0;
  const freeUnitIds = new Set<string>();

  for (const unit of units) {
    if (ECONOMY_RULES.freeUnitTypes.has(unit.type)) {
      freeUnitIds.add(unit.id);
      freeUnits++;
    }
  }

  const combatUnits = units
    .filter(unit => !freeUnitIds.has(unit.id) && (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) > 0)
    .sort(sortCombatUnitsForFreeDefenders);
  for (const unit of combatUnits.slice(0, cities.length * 2)) {
    freeUnitIds.add(unit.id);
    freeUnits++;
  }

  const supportCandidates = units
    .filter(unit => !freeUnitIds.has(unit.id))
    .map(unit => ({ id: unit.id, upkeep: getUnitUpkeep(unit.type) }))
    .sort(sortByHighestAvoidedUpkeep);
  const supportSlots = getFreeGeneralUnitSlots(cities);
  for (const candidate of supportCandidates.slice(0, supportSlots)) {
    freeUnitIds.add(candidate.id);
    freeUnits++;
  }

  for (const unit of units) {
    if (freeUnitIds.has(unit.id)) continue;
    paidUnits++;
    unitUpkeep += getUnitUpkeep(unit.type);
  }

  return {
    buildingUpkeep,
    unitUpkeep,
    freeBuildings,
    freeUnits,
    paidBuildings,
    paidUnits,
  };
}

export function projectCivGrossGold(state: GameState, civId: string): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;

  const civDef = resolveCivDefinition(state, civ.civType ?? '');
  let grossGold = 0;

  for (const cityId of civ.cities) {
    const projected = calculateProjectedCityYields(state, cityId, civDef?.bonusEffect);
    const wonderCityBonuses = getLegendaryWonderCityYieldBonus(state, civId, cityId);
    grossGold += projected.gold + (wonderCityBonuses.gold ?? 0);
  }

  const wonderCivBonuses = getLegendaryWonderCivYieldBonus(state, civId);
  grossGold += wonderCivBonuses.gold ?? 0;

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
      state.marketplace.tradeRoutes.filter(route => state.cities[route.fromCityId]?.owner === civId),
    );
  }

  return grossGold;
}

function getStrainLevel(netGoldPerTurn: number, projectedGold: number, unpaidMaintenance: number): EconomyStrainLevel {
  if (
    unpaidMaintenance > 0 ||
    (netGoldPerTurn <= ECONOMY_RULES.criticalDeficitThreshold && projectedGold <= ECONOMY_RULES.criticalTreasuryThreshold)
  ) {
    return 'critical';
  }
  if (netGoldPerTurn < 0) return 'strained';
  return 'stable';
}

export function calculateCivEconomy(
  state: GameState,
  civId: string,
  options: CalculateCivEconomyOptions = {},
): EconomyStatus {
  const civ = state.civilizations[civId];
  const grossGoldPerTurn = options.grossGoldPerTurn ?? projectCivGrossGold(state, civId);
  const baseBreakdown = calculateMaintenance(state, civId);
  const breakdown = {
    ...baseBreakdown,
    buildingUpkeep: options.maintenanceOverride?.buildingUpkeep ?? baseBreakdown.buildingUpkeep,
    unitUpkeep: options.maintenanceOverride?.unitUpkeep ?? baseBreakdown.unitUpkeep,
  };
  const maintenanceGoldPerTurn = breakdown.buildingUpkeep + breakdown.unitUpkeep;
  const netGoldPerTurn = grossGoldPerTurn - maintenanceGoldPerTurn;
  const currentGold = civ?.gold ?? 0;
  const projectedGold = Math.max(0, currentGold + netGoldPerTurn);
  const unpaidMaintenance = Math.max(0, maintenanceGoldPerTurn - currentGold - grossGoldPerTurn);
  const strainLevel = getStrainLevel(netGoldPerTurn, projectedGold, unpaidMaintenance);

  return {
    civId,
    grossGoldPerTurn,
    maintenanceGoldPerTurn,
    netGoldPerTurn,
    projectedGold,
    unpaidMaintenance,
    strainLevel,
    rushBuyDisabled: strainLevel === 'critical',
    breakdown,
  };
}

export function applyEconomyTurn(state: GameState, civId: string, grossGoldPerTurn: number): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  const status = calculateCivEconomy(state, civId, { grossGoldPerTurn });
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
      [civId]: status,
    },
  };
}

export function emitEconomyStrainIfNeeded(
  previous: EconomyStatus | undefined,
  current: EconomyStatus,
  bus: EventBus,
): void {
  if (current.strainLevel === 'stable') return;
  if (previous?.strainLevel === current.strainLevel && previous.unpaidMaintenance === current.unpaidMaintenance) return;
  bus.emit('economy:treasury-strain', {
    civId: current.civId,
    level: current.strainLevel,
    netGoldPerTurn: current.netGoldPerTurn,
    unpaidMaintenance: current.unpaidMaintenance,
  });
}

export function getEconomyStatusForCiv(state: GameState, civId: string): EconomyStatus {
  return state.economyStatusByCiv?.[civId] ?? calculateCivEconomy(state, civId);
}

export function getRushBuyQuote(state: GameState, cityId: string): RushBuyQuote {
  const city = state.cities[cityId];
  const civ = city ? state.civilizations[city.owner] : undefined;
  const status = city ? getEconomyStatusForCiv(state, city.owner) : calculateCivEconomy(state, '');

  if (!city || !civ) {
    return { available: false, itemId: null, cost: 0, reason: 'City not found.', status };
  }

  const itemId = city.productionQueue[0] ?? null;
  if (!itemId) {
    return { available: false, itemId: null, cost: 0, reason: 'Choose a production item before rush buying.', status };
  }

  if (itemId.startsWith('legendary:')) {
    return { available: false, itemId, cost: 0, reason: 'Legendary wonders cannot be rush bought.', status };
  }

  if (status.rushBuyDisabled) {
    return {
      available: false,
      itemId,
      cost: 0,
      reason: 'Rush buy disabled: treasury strain is critical.',
      status,
    };
  }

  const cost = getProductionCostForItem(itemId, { city, era: state.era });
  if (cost <= 0) {
    return { available: false, itemId, cost: 0, reason: 'This item cannot be rush bought.', status };
  }

  const remainingProduction = Math.max(1, cost - city.productionProgress);
  const rushCost = Math.ceil(remainingProduction * ECONOMY_RULES.rushBuyMultiplier);
  if (civ.gold < rushCost) {
    return {
      available: false,
      itemId,
      cost: rushCost,
      reason: `Need ${rushCost} gold to rush buy.`,
      status,
    };
  }

  return { available: true, itemId, cost: rushCost, reason: null, status };
}

export function formatGoldHudText(status: EconomyStatus, currentGold: number): string {
  const sign = status.netGoldPerTurn >= 0 ? '+' : '';
  return `${currentGold} (${sign}${status.netGoldPerTurn}/turn)`;
}

export function formatMaintenanceTooltip(status: EconomyStatus): string {
  const parts = [
    `Income: ${status.grossGoldPerTurn}`,
    `Maintenance: -${status.maintenanceGoldPerTurn}`,
  ];
  if (status.breakdown.paidBuildings > 0) {
    parts.push(`${status.breakdown.paidBuildings} paid buildings`);
  }
  if (status.breakdown.paidUnits > 0) {
    parts.push(`${status.breakdown.paidUnits} paid units`);
  }
  if (status.unpaidMaintenance > 0) {
    parts.push(`${status.unpaidMaintenance} unpaid`);
  }
  return parts.join(' | ');
}
