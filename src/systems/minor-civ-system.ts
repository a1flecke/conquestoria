import type {
  AIStrategicPlan,
  GameMap,
  GameState,
  MinorCivArchetype,
  MinorCivState,
  HexCoord,
  City,
  Unit,
  UnitType,
} from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import { OPPONENT_CHALLENGE_PROFILES, resolveOpponentChallenge } from '@/core/opponent-challenge';
import { isAlwaysHostilePair } from '@/core/owner-kind';
import { MINOR_CIV_DEFINITIONS } from './minor-civ-definitions';
import { resolveWorldAge } from './tech-definitions';
import { resolveCombatEra, resolveNeutralPressureEra } from './era-resolution';
import { createDiplomacyState, modifyRelationship } from './diplomacy-system';
import { applyResearchBonus } from './tech-system';
import {
  hexKey,
  mapDistance,
  mapNeighbors,
} from './hex-utils';
import { createUnit, resetUnitTurn, UNIT_DEFINITIONS } from './unit-system';
import { foundCity } from './city-system';
import { collectUsedCityNames } from './city-name-system';
import { generateQuest } from './quest-system';
import { isMinorCivAtWar, isMinorCivHostileToOwner } from './minor-civ-diplomacy';
import { processMinorCivEconomyTurn } from './minor-civ-economy-system';
import { deterministicCombatSeed, resolveCombat } from './combat-system';
import { buildCombatContextForDefender } from './combat-context';
import { hasDiscoveredMinorCiv } from './discovery-system';
import { canAttackByProfileOnMap } from './attack-targeting';
import {
  type ChainTransition,
  emitMinorCivQuestTransitions,
  getMinorCivRelationshipStatus,
  isMinorCivAllianceActive,
  reconcileMinorCivQuestTurn,
} from './quest-chain-system';
import { executeUnitMove } from './unit-movement-system';
import { canUnitAttackTarget } from './attack-targeting';
import { applyCombatOutcomeToState } from './combat-reward-system';
import { buildCombatPresentation } from './viewer-event-presentation';
import { removeRouteForUnit } from './trade-system';
import {
  applyRegionalGrievanceForMinorCivConquest,
  processMinorCivCoalitionsTurn,
  processMinorCivRegionalGrievanceTurn,
} from './minor-civ-coalition-system';

const PLACEMENT_COUNTS: Record<string, [number, number]> = {
  small: [2, 4],
  medium: [4, 6],
  large: [6, 8],
};

const IMPASSABLE: Set<string> = new Set(['ocean', 'coast', 'mountain']);

export interface PlacementResult {
  minorCivs: Record<string, MinorCivState>;
  cities: Record<string, City>;
  units: Record<string, Unit>;
}

export function placeMinorCivs(
  state: GameState,
  mapSize: 'small' | 'medium' | 'large',
  seed: string,
): PlacementResult {
  const [min, max] = PLACEMENT_COUNTS[mapSize] ?? [2, 4];

  // Seeded RNG
  let rngState = hashSeed(seed + '-mc');
  const rng = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };

  const count = min + Math.floor(rng() * (max - min + 1));

  // Shuffle definitions
  const shuffled = [...MINOR_CIV_DEFINITIONS].sort(() => rng() - 0.5);
  const selected = shuffled.slice(0, count);

  // Get positions to avoid
  const startPositions = Object.values(state.units)
    .filter(u => u.type === 'settler')
    .map(u => u.position);
  const cityPositions = Object.values(state.cities).map(c => c.position);

  // Get passable tiles
  const candidates = Object.values(state.map.tiles)
    .filter(t => !IMPASSABLE.has(t.terrain) && !t.wonder)
    .map(t => t.coord)
    .sort(() => rng() - 0.5);

  const majorCivIds = Object.keys(state.civilizations);
  const placedPositions: HexCoord[] = [];
  const result: PlacementResult = {
    minorCivs: {},
    cities: { ...state.cities },
    units: { ...state.units },
  };

  for (const def of selected) {
    const pos = findValidPosition(
      state.map,
      candidates,
      startPositions,
      cityPositions,
      placedPositions,
    );
    if (!pos) continue;

    placedPositions.push(pos);

    // Create city with archetype buildings
    const city = foundCity(`mc-${def.id}`, pos, state.map, state.idCounters, {
      civType: def.id,
      namingPool: [def.name],
      civName: def.name,
      usedNames: new Set([...collectUsedCityNames(state), ...Object.values(result.cities).map(city => city.name)]),
    });
    city.population = 3;
    const archetypeBuilding = def.archetype === 'militaristic' ? 'barracks'
      : def.archetype === 'mercantile' ? 'marketplace'
      : 'library';
    if (!city.buildings.includes(archetypeBuilding)) {
      city.buildings.push(archetypeBuilding);
    }
    result.cities[city.id] = city;

    // Create garrison unit
    const garrison = createUnit('warrior', `mc-${def.id}`, pos, state.idCounters);
    result.units[garrison.id] = garrison;

    // Create minor civ state
    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
      regionalGrievanceByCiv: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };

    result.minorCivs[mcState.id] = mcState;
  }

  return result;
}

function findValidPosition(
  map: GameMap,
  candidates: HexCoord[],
  startPositions: HexCoord[],
  cityPositions: HexCoord[],
  placedPositions: HexCoord[],
): HexCoord | null {
  for (const pos of candidates) {
    if (startPositions.some(s => mapDistance(map, pos, s) < 8)) continue;
    if (cityPositions.some(c => mapDistance(map, pos, c) < 6)) continue;
    if (placedPositions.some(p => mapDistance(map, pos, p) < 10)) continue;
    return pos;
  }
  return null;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// === Turn Processing ===

export function processMinorCivTurn(
  state: GameState,
  bus: EventBus,
): GameState {
  let nextState = structuredClone(state);
  if (!nextState.opponentAI) {
    nextState.opponentAI = createEmptyOpponentAIState();
  }
  nextState.opponentAI!.minorCivs = Object.fromEntries(
    Object.entries(nextState.opponentAI!.minorCivs).filter(([minorCivId]) => {
      const minor = nextState.minorCivs[minorCivId];
      return Boolean(minor && !minor.isDestroyed && nextState.cities[minor.cityId]);
    }),
  );
  for (const mcId of Object.keys(nextState.minorCivs).sort()) {
    let mc = nextState.minorCivs[mcId];
    if (mc.isDestroyed) continue;

    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def) continue;

    for (const unitId of mc.units) {
      const unit = nextState.units[unitId];
      if (unit) nextState.units[unitId] = resetUnitTurn(unit);
    }
    nextState = processMinorCivRegionalGrievanceTurn(nextState, mcId, { allowDefenderSpawns: false });
    const economyResult = processMinorCivEconomyTurn(nextState, mcId, bus);
    nextState = economyResult.state;
    mc = nextState.minorCivs[mcId];
    const planned = planPurposefulMinorCivTurn(nextState, mcId);
    if (planned.plan) {
      nextState.opponentAI!.minorCivs[mcId] = planned.plan;
    } else {
      delete nextState.opponentAI!.minorCivs[mcId];
    }
    nextState = executePurposefulMinorCivOrders(nextState, planned, bus);
    nextState = processQuests(nextState, mcId, def, bus);
    mc = nextState.minorCivs[mcId];
    nextState = applyAllyBonuses(nextState, mc, def);
    mc = nextState.minorCivs[mcId];
    nextState = processGarrison(nextState, mc);
    emitRelationshipThresholds(nextState, nextState.minorCivs[mcId], bus);
  }

  nextState = processMinorCivCoalitionsTurn(nextState);

  return nextState;
}

export interface PurposefulMinorCivPlanResult {
  plan: AIStrategicPlan | null;
  moveOrders: Array<{ unitId: string; to: HexCoord }>;
  attackOrders: Array<{ attackerUnitId: string; defenderUnitId: string }>;
}

const MINOR_OPERATIONAL_RADIUS = 6;
const MINOR_RESOURCE_RADIUS = 4;

function minorDistance(state: GameState, a: HexCoord, b: HexCoord): number {
  return mapDistance(state.map, a, b);
}

function makeMinorPlan(
  state: GameState,
  mc: MinorCivState,
  target: AIStrategicPlan['target'],
  objective: AIStrategicPlan['objective'],
  reason: AIStrategicPlan['reasonCodes'][number],
): AIStrategicPlan {
  const city = state.cities[mc.cityId]!;
  return {
    id: `minor-plan:${mc.id}:${state.turn}:${objective}`,
    actorId: mc.id,
    objective,
    target,
    theaterId: `minor:${mc.id}`,
    phase: target.kind === 'region' ? 'scouting' : 'advancing',
    reasonCodes: [reason],
    commitment: objective === 'defend' ? 1 : 0.7,
    createdTurn: state.turn,
    reconsiderAfterTurn: state.turn + 2,
    expiresAfterTurn: state.turn + 6,
    lastProgressTurn: state.turn,
    rallyPoint: { ...city.position },
    requiredRoles: { frontline: 1 },
    assignedUnitIds: mc.units.filter(unitId => Boolean(state.units[unitId])).sort(),
  };
}

function minorPlanPosition(state: GameState, plan: AIStrategicPlan): HexCoord | null {
  if (plan.target.kind === 'unit') return state.units[plan.target.id]?.position ?? null;
  if (plan.target.kind === 'city') return state.cities[plan.target.id]?.position ?? null;
  if (plan.target.kind === 'camp') return state.barbarianCamps[plan.target.id]?.position ?? null;
  return plan.target.kind === 'resource' ? plan.target.position : plan.target.anchor;
}

function chooseMinorStep(
  state: GameState,
  unit: Unit,
  target: HexCoord,
): HexCoord | null {
  const occupied = new Set(Object.values(state.units)
    .filter(candidate => candidate.id !== unit.id && !candidate.transportId)
    .map(candidate => hexKey(candidate.position)));
  const candidates = mapNeighbors(state.map, unit.position);
  return candidates
    .filter(coord => {
      const terrain = state.map.tiles[hexKey(coord)]?.terrain;
      return terrain !== undefined
        && terrain !== 'ocean'
        && terrain !== 'coast'
        && terrain !== 'mountain'
        && !occupied.has(hexKey(coord));
    })
    .filter(coord =>
      minorDistance(state, coord, target) < minorDistance(state, unit.position, target))
    .sort((a, b) =>
      minorDistance(state, a, target) - minorDistance(state, b, target)
      || a.q - b.q
      || a.r - b.r)[0] ?? null;
}

function isAlliedDefenseTarget(state: GameState, mc: MinorCivState, unit: Unit): boolean {
  return Object.entries(mc.chainStatusByCiv ?? {}).some(([allyId, status]) => {
    if (status.status !== 'allied') return false;
    const ally = state.civilizations[allyId];
    if (!ally?.diplomacy.atWarWith.includes(unit.owner)) return false;
    return ally.cities.some(cityId => {
      const city = state.cities[cityId];
      return city && minorDistance(state, city.position, unit.position) <= 2;
    }) || ally.units.some(unitId => {
      const allyUnit = state.units[unitId];
      return allyUnit && minorDistance(state, allyUnit.position, unit.position) <= 1;
    });
  });
}

export function planPurposefulMinorCivTurn(
  state: GameState,
  minorCivId: string,
): PurposefulMinorCivPlanResult {
  const mc = state.minorCivs[minorCivId];
  const city = mc ? state.cities[mc.cityId] : undefined;
  if (!mc || mc.isDestroyed || !city) {
    return { plan: null, moveOrders: [], attackOrders: [] };
  }
  const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === mc.definitionId);
  if (!definition) return { plan: null, moveOrders: [], attackOrders: [] };

  const localUnits = Object.values(state.units)
    .filter(unit =>
      unit.owner !== mc.id
      && !unit.transportId
      && minorDistance(state, city.position, unit.position) <= MINOR_OPERATIONAL_RADIUS)
    .sort((a, b) =>
      minorDistance(state, city.position, a.position) - minorDistance(state, city.position, b.position)
      || a.id.localeCompare(b.id));
  const legalHostiles = localUnits.filter(unit =>
    isMinorCivHostileToOwner(state, mc.id, unit.owner));
  const immediateCityThreat = legalHostiles.find(unit =>
    minorDistance(state, city.position, unit.position) <= 2);

  const resourceCoords = city.ownedTiles
    .filter(coord => {
      const tile = state.map.tiles[hexKey(coord)];
      return minorDistance(state, city.position, coord) <= MINOR_RESOURCE_RADIUS
        && Boolean(tile?.resource)
        && tile.improvement !== 'none'
        && tile.improvementTurnsLeft === 0;
    });
  const resourceThreat = legalHostiles.find(unit =>
    resourceCoords.some(coord => minorDistance(state, coord, unit.position) <= 1));
  const alwaysHostile = definition.archetype === 'militaristic'
    ? legalHostiles.find(unit => isAlwaysHostilePair(mc.id, unit.owner))
    : undefined;
  const allyThreat = legalHostiles.find(unit => isAlliedDefenseTarget(state, mc, unit));
  const recentAggressorIds = new Set(mc.diplomacy.events
    .filter(event => event.type === 'military_attacked' && state.turn - event.turn <= 6)
    .map(event => event.otherCiv));
  const retaliatoryTarget = legalHostiles.find(unit => recentAggressorIds.has(unit.owner));

  const chosen = immediateCityThreat
    ?? resourceThreat
    ?? alwaysHostile
    ?? allyThreat
    ?? retaliatoryTarget;
  let objective: AIStrategicPlan['objective'] = 'defend';
  let reason: AIStrategicPlan['reasonCodes'][number] = 'homeland-secure';
  if (chosen === alwaysHostile && chosen !== immediateCityThreat && chosen !== resourceThreat) {
    objective = 'repel';
    reason = 'nearby-opportunity';
  } else if (chosen === allyThreat && chosen !== immediateCityThreat && chosen !== resourceThreat) {
    objective = 'support-ally';
    reason = 'alliance-obligation';
  } else if (chosen === retaliatoryTarget && chosen !== immediateCityThreat && chosen !== resourceThreat) {
    objective = 'repel';
    reason = 'retaliate-recent-attack';
  } else if (chosen) {
    reason = 'urgent-defense';
  }

  const target = chosen
    ? { kind: 'unit' as const, id: chosen.id, lastKnownPosition: { ...chosen.position } }
    : { kind: 'region' as const, id: `patrol:${mc.id}`, anchor: { ...city.position } };
  let plan = makeMinorPlan(state, mc, target, objective, reason);
  const existing = state.opponentAI?.minorCivs[mc.id];
  const existingPosition = existing ? minorPlanPosition(state, existing) : null;
  const existingTargetRemainsHostile = existing?.target.kind !== 'unit'
    || Boolean(
      state.units[existing.target.id]
      && isMinorCivHostileToOwner(state, mc.id, state.units[existing.target.id].owner),
    );
  const existingMatchesChosen = Boolean(
    chosen
    && existing?.target.kind === 'unit'
    && existing.target.id === chosen.id,
  );
  if (
    !immediateCityThreat
    && existing
    && existing.target.kind !== 'city'
    && existingPosition
    && existingTargetRemainsHostile
    && state.turn <= existing.expiresAfterTurn
    && minorDistance(state, city.position, existingPosition) <= MINOR_OPERATIONAL_RADIUS
    && (!chosen || existingMatchesChosen)
  ) {
    plan = { ...existing, assignedUnitIds: plan.assignedUnitIds };
  }

  const profile = OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)];
  const challengeThreshold = resolveOpponentChallenge(state) === 'explorer'
    ? 1.15
    : resolveOpponentChallenge(state) === 'veteran' ? 0.9 : 1;
  const archetypeThreshold = definition.archetype === 'militaristic' ? 0.9 : 1.2;
  const ownStrength = mc.units.reduce((total, unitId) => {
    const unit = state.units[unitId];
    return total + (unit ? UNIT_DEFINITIONS[unit.type].strength : 0);
  }, 0);
  const targetPosition = minorPlanPosition(state, plan) ?? city.position;
  const targetUnit = plan.target.kind === 'unit' ? state.units[plan.target.id] : undefined;
  const targetStrength = targetUnit ? UNIT_DEFINITIONS[targetUnit.type].strength : 0;
  const leavingHome = minorDistance(state, city.position, targetPosition) > 3;
  const requiredRatio = leavingHome ? archetypeThreshold * challengeThreshold : 0.75;
  const authorized = targetStrength === 0 || ownStrength >= targetStrength * Math.max(0.75, requiredRatio);
  const moveOrders: PurposefulMinorCivPlanResult['moveOrders'] = [];
  const attackOrders: PurposefulMinorCivPlanResult['attackOrders'] = [];

  for (const unitId of [...mc.units].sort()) {
    const unit = state.units[unitId];
    if (!unit || unit.movementPointsLeft <= 0 || unit.hasActed) continue;
    const withdrawing = unit.health < profile.retreatHealthPercent;
    const destination = withdrawing || !authorized ? city.position : targetPosition;
    if (
      !withdrawing
      && authorized
      && targetUnit
      && canUnitAttackTarget(state, unit, targetUnit.position, { requireVisibility: false }).ok
    ) {
      attackOrders.push({ attackerUnitId: unit.id, defenderUnitId: targetUnit.id });
      continue;
    }
    if (
      hexKey(unit.position) === hexKey(destination)
      || (!chosen && minorDistance(state, unit.position, city.position) <= 3)
    ) continue;
    const step = chooseMinorStep(state, unit, destination);
    if (step) moveOrders.push({ unitId: unit.id, to: step });
  }

  if (!authorized && chosen) plan = { ...plan, phase: 'mobilizing', commitment: 0.4 };
  return { plan, moveOrders, attackOrders };
}

function executePurposefulMinorCivOrders(
  state: GameState,
  planned: PurposefulMinorCivPlanResult,
  bus: EventBus,
): GameState {
  let nextState = state;
  for (const order of planned.attackOrders) {
    const attacker = nextState.units[order.attackerUnitId];
    const defender = nextState.units[order.defenderUnitId];
    if (!attacker || !defender || attacker.hasActed) continue;
    const legality = canUnitAttackTarget(nextState, attacker, defender.position, { requireVisibility: false });
    if (!legality.ok || legality.targetType !== 'unit' || legality.targetUnitId !== defender.id) continue;
    const seed = deterministicCombatSeed(nextState.gameId, nextState.turn, attacker.id, defender.id);
    const result = resolveCombat(
      attacker,
      defender,
      nextState.map,
      seed,
      buildCombatContextForDefender(nextState, attacker, defender),
      resolveCombatEra(nextState, attacker, defender),
    );
    const presentation = buildCombatPresentation(nextState, result, attacker, defender);
    const attackerRouteId = attacker.committedToRouteId;
    const defenderRouteId = defender.committedToRouteId;
    const applied = applyCombatOutcomeToState(nextState, result, seed);
    nextState = applied.state;
    emitMinorCivQuestTransitions(bus, applied.questTransitions, nextState);
    if (applied.attackerDefeated && attackerRouteId) {
      nextState = removeRouteForUnit(nextState, attacker.id, bus, 'unit-died', attackerRouteId);
    } else if (applied.attackerCaptured && attackerRouteId) {
      nextState = removeRouteForUnit(nextState, attacker.id, bus, 'unit-captured', attackerRouteId);
    }
    if (applied.defenderDefeated && defenderRouteId) {
      nextState = removeRouteForUnit(nextState, defender.id, bus, 'unit-died', defenderRouteId);
    } else if (applied.defenderCaptured && defenderRouteId) {
      nextState = removeRouteForUnit(nextState, defender.id, bus, 'unit-captured', defenderRouteId);
    }
    bus.emit('combat:resolved', { result, ...presentation });
    for (const reward of applied.rewards) bus.emit('combat:reward-earned', { reward });
  }
  for (const order of planned.moveOrders) {
    const unit = nextState.units[order.unitId];
    if (!unit || unit.hasActed || unit.movementPointsLeft <= 0) continue;
    executeUnitMove(nextState, order.unitId, order.to, { actor: 'world', bus });
  }
  return nextState;
}

function processQuests(
  state: GameState,
  minorCivId: string,
  def: { archetype: MinorCivArchetype },
  bus: EventBus,
): GameState {
  let nextState = state;
  const majorCivIds = Object.keys(state.civilizations);
  for (const civId of majorCivIds) {
    const mc = nextState.minorCivs[minorCivId];
    if (!hasDiscoveredMinorCiv(nextState, civId, minorCivId)) continue;
    if (isMinorCivAtWar(nextState, civId, minorCivId)) continue;

    const reconciled = reconcileMinorCivQuestTurn(nextState, minorCivId, civId, nextState.turn);
    nextState = reconciled.state;
    emitMinorCivQuestTransitions(bus, reconciled.transitions, nextState);

    const current = nextState.minorCivs[minorCivId];
    if (current.activeQuests[civId] || current.chainStatusByCiv[civId]?.status === 'pending') continue;
    if (nextState.turn < (current.questCooldownUntilByCiv[civId] ?? 0)) continue;
    if (current.chainStatusByCiv[civId]?.status === 'allied') continue;

    const rng = makeRng(nextState.turn * 16807 + civId.charCodeAt(0) + minorCivId.charCodeAt(3));
    const newQuest = generateQuest(
      def.archetype,
      minorCivId,
      civId,
      nextState.turn,
      nextState,
      rng,
      nextState.idCounters,
    );
    if (newQuest) {
      current.activeQuests[civId] = newQuest;
      emitMinorCivQuestTransitions(bus, [{ type: 'issued', minorCivId, majorCivId: civId, quest: newQuest }], nextState);
    }
  }
  return nextState;
}

function applyAllyBonuses(state: GameState, mc: MinorCivState, def: { allyBonus: any }): GameState {
  for (const civId of Object.keys(mc.diplomacy.relationships)) {
    if (!isMinorCivAllianceActive(state, civId, mc.id)) continue;

    const civ = state.civilizations[civId];
    if (!civ) continue;

    switch (def.allyBonus.type) {
      case 'gold_per_turn':
        civ.gold += def.allyBonus.amount;
        break;
      case 'science_per_turn':
        if (civ.techState.currentResearch) {
          const bonusResult = applyResearchBonus(civ.techState, def.allyBonus.amount);
          civ.techState = bonusResult.state;
        }
        break;
      case 'production_per_turn': {
        const cityWithQueue = civ.cities
          .map(id => state.cities[id])
          .find(c => c && c.productionQueue.length > 0);
        if (cityWithQueue) {
          cityWithQueue.productionProgress += def.allyBonus.amount;
        }
        break;
      }
      case 'free_unit': {
        if (state.turn % def.allyBonus.everyNTurns === 0) {
          const spawnCity = civ.cities
            .map(id => state.cities[id])
            .find(c => c && !Object.values(state.units).some(u => hexKey(u.position) === hexKey(c.position)));
          if (spawnCity) {
            const freeUnit = createUnit(def.allyBonus.unitType, civId, spawnCity.position, state.idCounters);
            state = { ...state, units: { ...state.units, [freeUnit.id]: freeUnit } };
            civ.units.push(freeUnit.id);
          }
        }
        break;
      }
    }
  }
  return state;
}

function processMovement(state: GameState, mc: MinorCivState): void {
  const city = state.cities[mc.cityId];
  if (!city) return;

  for (const uid of mc.units) {
    const unit = state.units[uid];
    if (!unit) continue;

    const dist = mapDistance(state.map, unit.position, city.position);
    if (dist > 3) {
      const neighbors = mapNeighbors(state.map, unit.position);
      const closer = neighbors
        .filter(n => mapDistance(state.map, n, city.position) < dist)
        .filter(n => {
          const tile = state.map.tiles[hexKey(n)];
          return tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain';
        })[0];
      if (closer) {
        unit.position = closer;
      }
    }

    unit.movementPointsLeft = UNIT_DEFINITIONS[unit.type]?.movementPoints ?? 2;
    unit.hasActed = false;
  }
}

function emitRelationshipThresholds(state: GameState, mc: MinorCivState, bus: EventBus): void {
  for (const civId of Object.keys(mc.diplomacy.relationships)) {
    const currentStatus = getMinorCivRelationshipStatus(state, civId, mc.id);
    const prevStatus = mc.lastNotifiedStatusByCiv[civId] ?? 'neutral';

    if (currentStatus !== prevStatus) {
      mc.lastNotifiedStatusByCiv[civId] = currentStatus;
      bus.emit('minor-civ:relationship-threshold', {
        minorCivId: mc.id,
        majorCivId: civId,
        newStatus: currentStatus,
        state,
      });
    }
  }
}

function processGarrison(state: GameState, mc: MinorCivState): GameState {
  const aliveUnits = mc.units.filter(uid => state.units[uid]);
  mc.units = aliveUnits;

  if (mc.economy && state.cities[mc.cityId]?.owner === mc.id) {
    return {
      ...state,
      minorCivs: {
        ...state.minorCivs,
        [mc.id]: { ...mc, units: aliveUnits },
      },
    };
  }

  if (aliveUnits.length === 0) {
    if (mc.garrisonCooldown > 0) {
      mc.garrisonCooldown--;
    } else {
      const city = state.cities[mc.cityId];
      if (city) {
        const cityKey = hexKey(city.position);
        const occupied = Object.values(state.units).some(u => hexKey(u.position) === cityKey);
        if (!occupied) {
          const garrison = createUnit('warrior', mc.id, city.position, state.idCounters);
          state = { ...state, units: { ...state.units, [garrison.id]: garrison } };
          mc.units.push(garrison.id);
          mc.garrisonCooldown = 3;
        }
      }
    }
  }
  return state;
}

function makeRng(seed: number): () => number {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

// === Conquest ===

export function conquestMinorCiv(
  state: GameState,
  mcId: string,
  conquerorId: string,
): { state: GameState; transitions: ChainTransition[]; conquered: boolean } {
  const existing = state.minorCivs[mcId];
  if (!existing || existing.isDestroyed) return { state, transitions: [], conquered: false };
  const nextState = structuredClone(state);
  const mc = nextState.minorCivs[mcId];
  const transitions: ChainTransition[] = [];
  for (const [majorCivId, status] of Object.entries(mc.chainStatusByCiv)) {
    if (status.status === 'allied') {
      transitions.push({ type: 'alliance-broken', majorCivId, minorCivId: mcId, chainId: status.chainId });
    }
  }

  mc.isDestroyed = true;
  mc.activeQuests = {};
  mc.chainStatusByCiv = {};
  mc.questCooldownUntilByCiv = {};
  mc.lastNotifiedStatusByCiv = {};

  const city = nextState.cities[mc.cityId];
  if (city) {
    city.owner = conquerorId;
    const civ = nextState.civilizations[conquerorId];
    if (civ && !civ.cities.includes(mc.cityId)) {
      civ.cities.push(mc.cityId);
    }
  }

  for (const uid of mc.units) {
    delete nextState.units[uid];
  }
  mc.units = [];

  return {
    state: applyRegionalGrievanceForMinorCivConquest(nextState, mcId, conquerorId),
    transitions,
    conquered: true,
  };
}

// #593 MR6: peaceful counterpart to conquestMinorCiv, used by a religious loyalty
// defection rather than military conquest. Same core bookkeeping (destroyed flag,
// alliance-broken transitions, city ownership transfer) but deliberately does NOT
// delete the garrison units (they're transferred to the new owner, since nothing
// hostile happened) and does NOT call applyRegionalGrievanceForMinorCivConquest
// (peaceful defection isn't a regional act of war). Territory tiles are not touched
// here -- the per-turn recalculateTerritory pass in turn-manager.ts picks up the
// city.owner change on the same turn, matching conquestMinorCiv's existing convention.
export function peacefullyAbsorbMinorCiv(
  state: GameState,
  mcId: string,
  newOwnerId: string,
): { state: GameState; transitions: ChainTransition[]; absorbed: boolean } {
  const existing = state.minorCivs[mcId];
  if (!existing || existing.isDestroyed) return { state, transitions: [], absorbed: false };
  const nextState = structuredClone(state);
  const mc = nextState.minorCivs[mcId];
  const transitions: ChainTransition[] = [];
  for (const [majorCivId, status] of Object.entries(mc.chainStatusByCiv)) {
    if (status.status === 'allied') {
      transitions.push({ type: 'alliance-broken', majorCivId, minorCivId: mcId, chainId: status.chainId });
    }
  }

  mc.isDestroyed = true;
  mc.activeQuests = {};
  mc.chainStatusByCiv = {};
  mc.questCooldownUntilByCiv = {};
  mc.lastNotifiedStatusByCiv = {};

  const city = nextState.cities[mc.cityId];
  if (city) {
    city.owner = newOwnerId;
    const civ = nextState.civilizations[newOwnerId];
    if (civ && !civ.cities.includes(mc.cityId)) {
      civ.cities.push(mc.cityId);
    }
  }

  const transferredUnitIds = mc.units.filter(uid => nextState.units[uid] !== undefined);
  for (const unitId of transferredUnitIds) {
    nextState.units[unitId].owner = newOwnerId;
  }
  const civ = nextState.civilizations[newOwnerId];
  if (civ) {
    civ.units = [...civ.units, ...transferredUnitIds.filter(id => !civ.units.includes(id))];
  }
  mc.units = [];

  return { state: nextState, transitions, absorbed: true };
}

// === Guerrilla & Scuffles ===

export function processGuerrilla(state: GameState, mc: MinorCivState, bus: EventBus): GameState {
  if (mc.isDestroyed) return state;
  const targetCivId = Object.keys(state.civilizations)
    .find(civId => isMinorCivAtWar(state, civId, mc.id));
  if (!targetCivId) return state;

  const guerrillaCount = mc.units.filter(uid => state.units[uid]).length - 1;
  if (guerrillaCount >= 2) return state;

  const city = state.cities[mc.cityId];
  if (!city) return state;

  const cityKey = hexKey(city.position);
  const cityOccupied = Object.values(state.units).some(u => hexKey(u.position) === cityKey);
  if (cityOccupied) return state;

  const guerrilla = createUnit('warrior', mc.id, city.position, state.idCounters);
  state = { ...state, units: { ...state.units, [guerrilla.id]: guerrilla } };
  mc.units.push(guerrilla.id);

  bus.emit('minor-civ:guerrilla', {
    minorCivId: mc.id,
    targetCivId,
    position: city.position,
  });
  return state;
}

export function processScuffles(state: GameState, bus: EventBus): void {
  const activeMcs = Object.values(state.minorCivs).filter(mc => !mc.isDestroyed);

  for (const mc of activeMcs) {
    const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
    if (!def || def.archetype !== 'militaristic') continue;

    const roll = (state.turn * 16807 + mc.id.charCodeAt(3)) % 100;
    if (roll >= 10) continue;

    const mcCity = state.cities[mc.cityId];
    if (!mcCity) continue;

    for (const other of activeMcs) {
      if (other.id === mc.id) continue;
      const otherCity = state.cities[other.cityId];
      if (!otherCity) continue;

      if (mapDistance(state.map, mcCity.position, otherCity.position) <= 8) {
        const attackerUnit = mc.units.map(uid => state.units[uid]).find(u => u);
        const defenderUnit = other.units.map(uid => state.units[uid]).find(u => u);
        if (attackerUnit && defenderUnit && canAttackByProfileOnMap(attackerUnit, defenderUnit, state.map)) {
          const seed = deterministicCombatSeed(state.gameId, state.turn, attackerUnit.id, defenderUnit.id);
          const result = resolveCombat(
            attackerUnit,
            defenderUnit,
            state.map,
            seed,
            buildCombatContextForDefender(state, attackerUnit, defenderUnit),
            resolveCombatEra(state, attackerUnit, defenderUnit),
          );
          attackerUnit.health = Math.max(1, attackerUnit.health - result.attackerDamage);
          defenderUnit.health = Math.max(1, defenderUnit.health - result.defenderDamage);
          bus.emit('minor-civ:scuffle', {
            attackerId: mc.id,
            defenderId: other.id,
            position: otherCity.position,
          });
          break;
        }
      }
    }
  }
}

// === Barbarian Camp Evolution ===

interface EvolutionResult {
  newMinorCiv: MinorCivState;
  newCity: City;
  newGarrison: Unit;
  removeCampId: string;
  transferUnitIds: string[];
}

export function checkCampEvolution(
  state: GameState,
  _currentTurn: number,
): EvolutionResult | null {
  const activeMinorCivs = Object.values(state.minorCivs).filter(mc => !mc.isDestroyed);
  const usedDefs = new Set(activeMinorCivs.map(mc => mc.definitionId));
  const unusedDefs = MINOR_CIV_DEFINITIONS.filter(d => !usedDefs.has(d.id));
  if (unusedDefs.length === 0) return null;

  const allCityPositions = Object.values(state.cities).map(c => c.position);
  const startPositions = Object.values(state.units)
    .filter(u => u.type === 'settler')
    .map(u => u.position);

  for (const camp of Object.values(state.barbarianCamps)) {
    if (camp.strength < 8) continue;
    if (allCityPositions.some(c => mapDistance(state.map, camp.position, c) < 6)) continue;
    if (startPositions.some(s => mapDistance(state.map, camp.position, s) < 6)) continue;

    const def = unusedDefs[0];
    const majorCivIds = Object.keys(state.civilizations);

    const city = foundCity(`mc-${def.id}`, camp.position, state.map, state.idCounters, {
      civType: def.id,
      namingPool: [def.name],
      civName: def.name,
      usedNames: collectUsedCityNames(state),
    });
    city.population = 3;

    const garrison = createUnit('warrior', `mc-${def.id}`, camp.position, state.idCounters);

    const transferIds: string[] = [];
    for (const [uid, unit] of Object.entries(state.units)) {
      if (unit.owner === 'barbarian' && mapDistance(state.map, unit.position, camp.position) <= 3) {
        transferIds.push(uid);
      }
    }

    const mcState: MinorCivState = {
      id: `mc-${def.id}`,
      definitionId: def.id,
      cityId: city.id,
      units: [garrison.id, ...transferIds],
      diplomacy: createDiplomacyState(majorCivIds, `mc-${def.id}`, 0),
      activeQuests: {},
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
      regionalGrievanceByCiv: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: resolveNeutralPressureEra(state, camp.position) ?? 1,
    };

    return {
      newMinorCiv: mcState,
      newCity: city,
      newGarrison: garrison,
      removeCampId: camp.id,
      transferUnitIds: transferIds,
    };
  }

  return null;
}

// === Era Advancement ===

const ERA_UNIT_MAP: Record<number, UnitType> = {
  1: 'warrior',
  2: 'swordsman',
  3: 'pikeman',
  4: 'musketeer',
  5: 'rifleman',
  6: 'rifleman',
  7: 'rifleman',
  8: 'tank',
  9: 'tank',
  10: 'tank',
  11: 'tank',
  12: 'tank',
};

export function checkEraAdvancement(state: GameState): number {
  return resolveWorldAge(state.civilizations);
}

export function processMinorCivEraUpgrade(state: GameState, mc: MinorCivState): void {
  if (mc.isDestroyed) return;
  const city = state.cities[mc.cityId];
  const pressureEra = city ? resolveNeutralPressureEra(state, city.position) : null;
  if (pressureEra === null || pressureEra <= mc.lastEraUpgrade) return;

  const newType = ERA_UNIT_MAP[pressureEra] ?? 'warrior';
  for (const uid of mc.units) {
    const unit = state.units[uid];
    if (unit && unit.type !== 'settler' && unit.type !== 'worker') {
      (unit as any).type = newType;
    }
  }

  if (city) {
    city.population += 1;
  }

  mc.lastEraUpgrade = pressureEra;
}

export type DiplomaticReaction = 'camp_destroyed_nearby' | 'attacked_neighbor' | 'trade_established' | 'wonder_built';

const REACTION_MODIFIERS: Record<DiplomaticReaction, Record<string, number>> = {
  camp_destroyed_nearby: { militaristic: 10, mercantile: 10, cultural: 10 },
  attacked_neighbor: { militaristic: 5, mercantile: -10, cultural: -15 },
  trade_established: { militaristic: 3, mercantile: 15, cultural: 5 },
  wonder_built: { militaristic: 0, mercantile: 5, cultural: 15 },
};

export function applyDiplomaticReaction(
  state: GameState,
  reaction: DiplomaticReaction,
  civId: string,
  mcId: string,
): void {
  const mc = state.minorCivs[mcId];
  if (!mc || mc.isDestroyed) return;

  const def = MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId);
  if (!def) return;

  const modifier = REACTION_MODIFIERS[reaction]?.[def.archetype] ?? 0;
  if (modifier === 0) return;

  mc.diplomacy = modifyRelationship(mc.diplomacy, civId, modifier);
}
