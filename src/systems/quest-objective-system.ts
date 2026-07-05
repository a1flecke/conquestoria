import type { GameState, HexCoord, Quest, QuestAction, QuestTarget, QuestType } from '@/core/types';
import { calculateCivEconomy } from './economy-system';
import { getCivAvailableResources } from './resource-acquisition-system';
import { RESOURCE_DEFINITIONS } from './resource-definitions';
import { calculateProjectedCityYields } from './city-work-system';
import { getProductionCostForItem, getTrainableUnitsForCity } from './city-system';
import { resolveCivDefinition } from './civ-registry';
import { hasDiscoveredCity, hasDiscoveredMinorCiv } from './discovery-system';
import { getVisibility } from './fog-of-war';
import { hexDistance } from './hex-utils';
import { findPath } from './unit-system';
import { canEstablishRoute } from './trade-system';
import { isMinorCivAtWar } from './minor-civ-diplomacy';
import {
  ERA_QUEST_TUNING,
  type QuestEra,
  type QuestObjectiveOption,
} from './quest-chain-definitions';

export interface QuestGenerationContext {
  state: GameState;
  minorCivId: string;
  majorCivId: string;
  currentTurn: number;
  duration?: number;
}

export interface QuestObjectiveHandler {
  createTarget(context: QuestGenerationContext, option: QuestObjectiveOption): QuestTarget | null;
  isFeasible(state: GameState, majorCivId: string, minorCivId: string, quest: Quest, remainingTurns: number): boolean;
  applyAction(state: GameState, minorCivId: string, quest: Quest, action: QuestAction): GameState | null;
  isComplete(quest: Quest): boolean;
  describe(state: GameState, playerId: string, quest: Quest): string;
}

function questEra(era: number): QuestEra {
  return Math.max(1, Math.min(4, era)) as QuestEra;
}

function roundUpToFive(value: number): number {
  return Math.ceil(value / 5) * 5;
}

export function canReachGoldRequirement(
  state: GameState,
  majorCivId: string,
  requiredGold: number,
  duration: number,
): boolean {
  const civ = state.civilizations[majorCivId];
  if (!civ) return false;
  const { netGoldPerTurn } = calculateCivEconomy(state, majorCivId);
  return civ.gold + Math.max(0, netGoldPerTurn) * duration >= requiredGold;
}

export function hasAccessibleLuxury(state: GameState, majorCivId: string): boolean {
  const luxuryIds = new Set(
    RESOURCE_DEFINITIONS.filter(definition => definition.type === 'luxury').map(definition => definition.id),
  );
  return [...getCivAvailableResources(state, majorCivId)].some(resource => luxuryIds.has(resource));
}

export function isQuestHostileOwner(state: GameState, majorCivId: string, ownerId: string): boolean {
  if (ownerId === majorCivId) return false;
  if (ownerId === 'barbarian' || ownerId === 'rebels' || ownerId === 'beasts') return true;
  if (ownerId.startsWith('mc-')) {
    return isMinorCivAtWar(state, majorCivId, ownerId);
  }
  return state.civilizations[majorCivId]?.diplomacy.atWarWith.includes(ownerId) ?? false;
}

function queueCostBeforeCaravan(state: GameState, cityId: string): number | null {
  const city = state.cities[cityId];
  const civ = city ? state.civilizations[city.owner] : undefined;
  if (!city || !civ) return null;
  const bonusEffect = resolveCivDefinition(state, civ.civType)?.bonusEffect;
  let remaining = 0;
  let foundCaravan = false;

  for (let index = 0; index < city.productionQueue.length; index++) {
    const itemId = city.productionQueue[index];
    const cost = getProductionCostForItem(itemId, { city, bonusEffect, era: state.era, completedTechs: civ.techState.completed });
    remaining += index === 0 ? Math.max(0, cost - city.productionProgress) : cost;
    if (itemId === 'caravan') {
      foundCaravan = true;
      break;
    }
  }

  if (!foundCaravan) {
    remaining += getProductionCostForItem('caravan', { city, bonusEffect, era: state.era, completedTechs: civ.techState.completed });
  }
  return remaining;
}

export function estimateCaravanReadyTurns(state: GameState, majorCivId: string, cityId: string): number {
  const city = state.cities[cityId];
  const civ = state.civilizations[majorCivId];
  if (!city || city.owner !== majorCivId || !civ) return Number.POSITIVE_INFINITY;

  const availableResources = getCivAvailableResources(state, majorCivId);
  const trainable = getTrainableUnitsForCity(
    city,
    civ.techState.completed,
    state.map,
    civ.civType,
    availableResources,
  ).some(unit => unit.type === 'caravan');
  const queued = city.productionQueue.includes('caravan');
  if (!trainable && !queued) return Number.POSITIVE_INFINITY;

  const bonusEffect = resolveCivDefinition(state, civ.civType)?.bonusEffect;
  const productionPerTurn = Math.max(1, calculateProjectedCityYields(state, cityId, bonusEffect).production);
  const remainingProduction = queueCostBeforeCaravan(state, cityId);
  return remainingProduction === null ? Number.POSITIVE_INFINITY : Math.ceil(remainingProduction / productionPerTurn);
}

function hasRouteCapacity(state: GameState, cityId: string): boolean {
  const used = (state.marketplace?.tradeRoutes ?? []).filter(route => route.fromCityId === cityId).length;
  const buildings = state.cities[cityId]?.buildings ?? [];
  const capacity = Math.min(5, 1
    + Number(buildings.includes('caravanserai'))
    + Number(buildings.includes('marketplace'))
    + Number(buildings.includes('bank'))
    + Number(buildings.includes('stock_exchange')));
  return capacity > used;
}

function idleCaravanCanReachDestination(state: GameState, majorCivId: string, destinationId: string): boolean {
  return state.civilizations[majorCivId].units
    .map(unitId => state.units[unitId])
    .filter(unit => unit?.type === 'caravan' && !unit.committedToRouteId)
    .some(caravan => Boolean(caravan && canEstablishRoute(state, caravan, destinationId).ok));
}

export function canPursueMinorCivTradeRoute(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
  duration: number,
): boolean {
  const civ = state.civilizations[majorCivId];
  const minorCiv = state.minorCivs[minorCivId];
  const destination = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!civ || !minorCiv || !destination || minorCiv.isDestroyed) return false;
  if (!civ.techState.completed.includes('trade-routes')) return false;
  if (!hasDiscoveredMinorCiv(state, majorCivId, minorCivId)) return false;
  if (isMinorCivAtWar(state, majorCivId, minorCivId)) return false;
  if ((minorCiv.diplomacy.relationships[majorCivId] ?? 0) < 0) return false;

  if (idleCaravanCanReachDestination(state, majorCivId, destination.id)) return true;

  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city || !hasRouteCapacity(state, cityId)) continue;
    if (!findPath(city.position, destination.position, state.map, 'land')) continue;
    if (estimateCaravanReadyTurns(state, majorCivId, cityId) + 1 <= duration) return true;
  }
  return false;
}

function eligibleHostileUnits(
  state: GameState,
  majorCivId: string,
  issuerPosition: HexCoord,
  radius: number,
) {
  const visibility = state.civilizations[majorCivId]?.visibility;
  if (!visibility) return [];
  return Object.values(state.units)
    .filter(unit => isQuestHostileOwner(state, majorCivId, unit.owner))
    .filter(unit => hexDistance(unit.position, issuerPosition) <= radius)
    .filter(unit => getVisibility(visibility, unit.position) === 'visible')
    .sort((left, right) => hexDistance(left.position, issuerPosition) - hexDistance(right.position, issuerPosition)
      || left.id.localeCompare(right.id));
}

function getIssuerContext(context: QuestGenerationContext) {
  const { state, minorCivId, majorCivId } = context;
  const minorCiv = state.minorCivs[minorCivId];
  const issuerCity = minorCiv ? state.cities[minorCiv.cityId] : undefined;
  if (!minorCiv || !issuerCity || minorCiv.isDestroyed || !state.civilizations?.[majorCivId]) return null;
  return { minorCiv, issuerCity, duration: context.duration ?? 20, tuning: ERA_QUEST_TUNING[questEra(state.era)] };
}

function applyProgress(
  state: GameState,
  minorCivId: string,
  actorCivId: string,
  goldCost: number = 0,
): GameState {
  const nextState = structuredClone(state);
  if (goldCost > 0) nextState.civilizations[actorCivId].gold -= goldCost;
  nextState.minorCivs[minorCivId].activeQuests[actorCivId].progress += 1;
  return nextState;
}

const destroyCampHandler: QuestObjectiveHandler = {
  createTarget(context, option) {
    if (option.type !== 'destroy_camp') return null;
    const issuer = getIssuerContext(context);
    if (!issuer) return null;
    const visibility = context.state.civilizations[context.majorCivId].visibility;
    const camp = Object.values(context.state.barbarianCamps)
      .filter(candidate => hexDistance(candidate.position, issuer.issuerCity.position) <= option.radius)
      .filter(candidate => getVisibility(visibility, candidate.position) === 'visible')
      .sort((left, right) => hexDistance(left.position, issuer.issuerCity.position) - hexDistance(right.position, issuer.issuerCity.position)
        || left.id.localeCompare(right.id))[0];
    return camp ? { type: 'destroy_camp', campId: camp.id, position: { ...camp.position } } : null;
  },
  isFeasible(state, majorCivId, _minorCivId, quest) {
    if (quest.target.type !== 'destroy_camp') return false;
    if (state.barbarianCamps[quest.target.campId]) return true;
    const visibility = state.civilizations[majorCivId]?.visibility;
    return !visibility || getVisibility(visibility, quest.target.position) !== 'visible';
  },
  applyAction(state, minorCivId, quest, action) {
    return quest.target.type === 'destroy_camp'
      && action.type === 'camp_destroyed'
      && action.campId === quest.target.campId
      ? applyProgress(state, minorCivId, action.actorCivId)
      : null;
  },
  isComplete: quest => quest.progress >= 1,
  describe: () => 'Destroy a nearby barbarian camp',
};

const giftGoldHandler: QuestObjectiveHandler = {
  createTarget(context, option) {
    if (option.type !== 'gift_gold') return null;
    const issuer = getIssuerContext(context);
    if (!issuer) return null;
    const amount = roundUpToFive(issuer.tuning.baseGold * option.goldMultiplier);
    return canReachGoldRequirement(context.state, context.majorCivId, amount, issuer.duration)
      ? { type: 'gift_gold', amount }
      : null;
  },
  isFeasible(state, majorCivId, _minorCivId, quest, remainingTurns) {
    return quest.target.type === 'gift_gold'
      && canReachGoldRequirement(state, majorCivId, quest.target.amount, remainingTurns);
  },
  applyAction(state, minorCivId, quest, action) {
    return quest.target.type === 'gift_gold'
      && action.type === 'gift_gold'
      && action.minorCivId === minorCivId
      && action.amount === quest.target.amount
      && (state.civilizations[action.actorCivId]?.gold ?? 0) >= quest.target.amount
      ? applyProgress(state, minorCivId, action.actorCivId, quest.target.amount)
      : null;
  },
  isComplete: quest => quest.progress >= 1,
  describe: (_state, _playerId, quest) => quest.target.type === 'gift_gold'
    ? `Gift ${quest.target.amount} gold`
    : 'Contribute gold',
};

const defeatUnitsHandler: QuestObjectiveHandler = {
  createTarget(context, option) {
    if (option.type !== 'defeat_units') return null;
    const issuer = getIssuerContext(context);
    if (!issuer) return null;
    const eligible = eligibleHostileUnits(context.state, context.majorCivId, issuer.issuerCity.position, option.radius);
    if (eligible.length === 0) return null;
    return {
      type: 'defeat_units',
      count: Math.min(option.fixedCount ?? issuer.tuning.militaryCount, eligible.length),
      nearPosition: { ...issuer.issuerCity.position },
      radius: option.radius,
      cityId: issuer.issuerCity.id,
    };
  },
  isFeasible: (_state, _majorCivId, _minorCivId, quest) => quest.target.type === 'defeat_units',
  applyAction(state, minorCivId, quest, action) {
    return quest.target.type === 'defeat_units'
      && action.type === 'unit_defeated'
      && isQuestHostileOwner(state, action.actorCivId, action.defeatedOwnerId)
      && hexDistance(action.position, quest.target.nearPosition) <= quest.target.radius
      ? applyProgress(state, minorCivId, action.actorCivId)
      : null;
  },
  isComplete: quest => quest.target.type === 'defeat_units' && quest.progress >= quest.target.count,
  describe(state, playerId, quest) {
    if (quest.target.type !== 'defeat_units') return 'Defeat nearby hostile units';
    const cityId = quest.cityId ?? quest.target.cityId;
    if (cityId && hasDiscoveredCity(state, playerId, cityId)) {
      return `Clear ${quest.target.count} units from ${state.cities[cityId]?.name ?? 'the target city'}`;
    }
    return `Clear ${quest.target.count} units near a foreign city`;
  },
};

const tradeRouteHandler: QuestObjectiveHandler = {
  createTarget(context, option) {
    if (option.type !== 'trade_route') return null;
    const issuer = getIssuerContext(context);
    if (!issuer) return null;
    return canPursueMinorCivTradeRoute(context.state, context.majorCivId, context.minorCivId, issuer.duration)
      ? { type: 'trade_route', minorCivId: context.minorCivId }
      : null;
  },
  isFeasible(state, majorCivId, minorCivId, quest, remainingTurns) {
    return quest.target.type === 'trade_route'
      && canPursueMinorCivTradeRoute(state, majorCivId, minorCivId, remainingTurns);
  },
  applyAction(state, minorCivId, quest, action) {
    return quest.target.type === 'trade_route'
      && action.type === 'trade_route_created'
      && state.cities[action.fromCityId]?.owner === action.actorCivId
      && state.minorCivs[minorCivId]?.cityId === action.toCityId
      ? applyProgress(state, minorCivId, action.actorCivId)
      : null;
  },
  isComplete: quest => quest.progress >= 1,
  describe(state, playerId, quest) {
    return quest.target.type === 'trade_route' && hasDiscoveredMinorCiv(state, playerId, quest.target.minorCivId)
      ? 'Establish a trade route to this city-state'
      : 'Establish a trade route to a discovered city-state';
  },
};

const sponsorFestivalHandler: QuestObjectiveHandler = {
  createTarget(context, option) {
    if (option.type !== 'sponsor_festival') return null;
    const issuer = getIssuerContext(context);
    if (!issuer) return null;
    return hasAccessibleLuxury(context.state, context.majorCivId)
      && canReachGoldRequirement(context.state, context.majorCivId, issuer.tuning.festivalGold, issuer.duration)
      ? { type: 'sponsor_festival', amount: issuer.tuning.festivalGold, requiresLuxury: true }
      : null;
  },
  isFeasible(state, majorCivId, _minorCivId, quest, remainingTurns) {
    return quest.target.type === 'sponsor_festival'
      && hasAccessibleLuxury(state, majorCivId)
      && canReachGoldRequirement(state, majorCivId, quest.target.amount, remainingTurns);
  },
  applyAction(state, minorCivId, quest, action) {
    return quest.target.type === 'sponsor_festival'
      && action.type === 'sponsor_festival'
      && action.minorCivId === minorCivId
      && (state.civilizations[action.actorCivId]?.gold ?? 0) >= quest.target.amount
      && hasAccessibleLuxury(state, action.actorCivId)
      ? applyProgress(state, minorCivId, action.actorCivId, quest.target.amount)
      : null;
  },
  isComplete: quest => quest.progress >= 1,
  describe: (_state, _playerId, quest) => quest.target.type === 'sponsor_festival'
    ? `Sponsor a cultural festival for ${quest.target.amount} gold using a luxury resource`
    : 'Sponsor a cultural festival',
};

export const QUEST_OBJECTIVE_HANDLERS = {
  destroy_camp: destroyCampHandler,
  gift_gold: giftGoldHandler,
  defeat_units: defeatUnitsHandler,
  trade_route: tradeRouteHandler,
  sponsor_festival: sponsorFestivalHandler,
} satisfies Record<QuestType, QuestObjectiveHandler>;

export function createQuestTarget(
  context: QuestGenerationContext,
  option: QuestObjectiveOption,
): QuestTarget | null {
  return QUEST_OBJECTIVE_HANDLERS[option.type].createTarget(context, option);
}

export function isQuestTargetFeasible(
  state: GameState,
  majorCivId: string,
  minorCivId: string,
  quest: Quest,
  remainingTurns: number,
): boolean {
  return QUEST_OBJECTIVE_HANDLERS[quest.type].isFeasible(state, majorCivId, minorCivId, quest, remainingTurns);
}

export function applyQuestObjectiveAction(
  state: GameState,
  minorCivId: string,
  quest: Quest,
  action: QuestAction,
): GameState | null {
  return QUEST_OBJECTIVE_HANDLERS[quest.type].applyAction(state, minorCivId, quest, action);
}

export function isQuestObjectiveComplete(quest: Quest): boolean {
  return QUEST_OBJECTIVE_HANDLERS[quest.type].isComplete(quest);
}

export function describeQuestObjectiveForPlayer(state: GameState, playerId: string, quest: Quest): string {
  return QUEST_OBJECTIVE_HANDLERS[quest.type].describe(state, playerId, quest);
}
