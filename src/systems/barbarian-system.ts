import type {
  AIStrategicPlan,
  BarbarianCamp,
  GameMap,
  GameState,
  HexCoord,
  IdCounters,
  OpponentAIState,
  ResourceType,
  Unit,
  UnitType,
} from '@/core/types';
import { createEmptyOpponentAIState } from '@/core/opponent-ai-state';
import { OPPONENT_CHALLENGE_PROFILES, resolveOpponentChallenge } from '@/core/opponent-challenge';
import { canAttackByProfileOnMap } from './attack-targeting';
import {
  hexKey,
  mapDistance,
  mapNeighbors,
} from './hex-utils';
import { selectDefenderForAttack } from './combat-system';
import { getCityGarrisonUnit } from './city-siege-system';
import { applyQuestGameplayAction, type ChainTransition } from './quest-chain-system';
import { UNIT_DEFINITIONS } from './unit-system';
import { recordHuntCampKillerIfApplicable } from './hunt-crisis-linkage';
import { resolveCivilizationEra } from './tech-definitions';
import { classifyOwner } from '@/core/owner-kind';
import { resolveNeutralPressureEra } from './era-resolution';

// Seeded LCG — avoids Math.random() per project rules
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

export function spawnBarbarianCamp(
  map: GameMap,
  cityPositions: HexCoord[],
  existingCamps: BarbarianCamp[],
  seed: number,
  counters: IdCounters,
): BarbarianCamp | null {
  const rng = lcg(seed);
  const existingPositions = new Set(existingCamps.map(c => hexKey(c.position)));

  const candidates = Object.values(map.tiles).filter(tile => {
    if (tile.terrain === 'ocean' || tile.terrain === 'coast' ||
        tile.terrain === 'mountain' || tile.terrain === 'snow') return false;
    if (existingPositions.has(hexKey(tile.coord))) return false;

    // Must be far from cities
    for (const cityPos of cityPositions) {
      if (mapDistance(map, tile.coord, cityPos) < 6) return false;
    }

    // Must be far from other camps
    for (const camp of existingCamps) {
      if (mapDistance(map, tile.coord, camp.position) < 4) return false;
    }

    return true;
  });

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(rng() * candidates.length)];

  return {
    id: `camp-${counters.nextCampId++}`,
    position: { ...chosen.coord },
    strength: 5 + Math.floor(rng() * 5),
    spawnCooldown: 5,
  };
}

export function destroyCamp(camp: BarbarianCamp): number {
  return 15 + camp.strength * 2;
}

export function applyCampDestruction(
  state: GameState,
  civId: string,
  campId: string,
  turn: number,
): { state: GameState; reward: number; questTransitions: ChainTransition[] } {
  const camp = state.barbarianCamps[campId];
  if (!camp) {
    return { state, reward: 0, questTransitions: [] };
  }

  const reward = destroyCamp(camp);
  const nextState = structuredClone(state);
  delete nextState.barbarianCamps[campId];
  nextState.legendaryWonderHistory = {
    discoveredSites: nextState.legendaryWonderHistory?.discoveredSites ?? [],
    destroyedStrongholds: [
      ...(nextState.legendaryWonderHistory?.destroyedStrongholds ?? []),
      { civId, campId, position: camp.position, turn },
    ],
  };
  nextState.civilizations[civId].gold += reward;

  const progress = applyQuestGameplayAction(nextState, {
    type: 'camp_destroyed', actorCivId: civId, campId, position: camp.position, turn,
  });
  const withHuntAttribution = recordHuntCampKillerIfApplicable(progress.state, campId, civId);
  return { state: withHuntAttribution, reward, questTransitions: progress.transitions };
}

export function applyCampDestructionAtTarget(
  state: GameState,
  civId: string,
  target: HexCoord,
  turn: number,
): { state: GameState; reward: number; campId: string | null; questTransitions: ChainTransition[] } {
  const campEntry = Object.entries(state.barbarianCamps).find(([, camp]) =>
    hexKey(camp.position) === hexKey(target),
  );
  if (!campEntry) {
    return { state, reward: 0, campId: null, questTransitions: [] };
  }

  const [campId] = campEntry;
  const destroyed = applyCampDestruction(state, civId, campId, turn);
  return {
    state: destroyed.state,
    reward: destroyed.reward,
    campId,
    questTransitions: destroyed.questTransitions,
  };
}

export interface BarbarianMoveOrder {
  unitId: string;
  toCoord: HexCoord;
}

export interface BarbarianAttackOrder {
  attackerUnitId: string;
  defenderUnitId: string;
}

export interface BarbarianCityAttackOrder {
  attackerUnitId: string;
  cityId: string;
  damage: number;
}

export interface BarbarianProcessResult {
  updatedCamps: BarbarianCamp[];
  spawnedUnits: Array<{ campId: string; position: HexCoord; unitType?: UnitType }>;
  moveOrders: BarbarianMoveOrder[];
  attackOrders: BarbarianAttackOrder[];
  cityAttackOrders: BarbarianCityAttackOrder[];
}

export const BARBARIAN_ROSTER_BY_ERA: Array<{
  maxEra: number;
  melee: UnitType[];
  ranged: UnitType[];
}> = [
  { maxEra: 2, melee: ['warrior', 'axeman'], ranged: ['archer'] },
  { maxEra: 4, melee: ['swordsman', 'spearman'], ranged: ['crossbowman'] },
  { maxEra: 7, melee: ['pikeman', 'musketeer'], ranged: ['crossbowman'] },
  { maxEra: 9, melee: ['rifleman'], ranged: ['grenadier'] },
  { maxEra: 11, melee: ['tank', 'rifleman'], ranged: ['machine_gunner'] },
];

export function getBarbarianRosterForEra(era: number) {
  return BARBARIAN_ROSTER_BY_ERA.find(roster => era <= roster.maxEra)
    ?? BARBARIAN_ROSTER_BY_ERA.at(-1)!;
}

function minimumEraForBarbarianUnit(unitType: UnitType): number {
  const rosterIndex = BARBARIAN_ROSTER_BY_ERA.findIndex(roster =>
    roster.melee.includes(unitType) || roster.ranged.includes(unitType));
  if (rosterIndex <= 0) return 1;
  return BARBARIAN_ROSTER_BY_ERA[rosterIndex - 1]!.maxEra + 1;
}

export function canBarbarianPressureEngage(
  state: GameState,
  unit: Unit,
  targetOwnerId: string | null | undefined,
): boolean {
  if (!targetOwnerId || classifyOwner(targetOwnerId) !== 'major') return true;
  const target = state.civilizations[targetOwnerId];
  if (!target) return true;
  return minimumEraForBarbarianUnit(unit.type)
    <= resolveCivilizationEra(target.techState.completed);
}

export interface PurposefulBarbarianProcessResult extends BarbarianProcessResult {
  opponentAI: OpponentAIState;
}

const BARBARIAN_SENSE_RADIUS = 7;
const BARBARIAN_DEFENSE_RADIUS = 4;

function barbarianDistance(state: GameState, a: HexCoord, b: HexCoord): number {
  return mapDistance(state.map, a, b);
}

function isPassableBarbarianTile(state: GameState, coord: HexCoord): boolean {
  const terrain = state.map.tiles[hexKey(coord)]?.terrain;
  return Boolean(terrain && terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain');
}

function sensedByCamp(
  state: GameState,
  camp: BarbarianCamp,
  assignedUnits: Unit[],
  coord: HexCoord,
): boolean {
  return [camp.position, ...assignedUnits.map(unit => unit.position)]
    .some(origin => barbarianDistance(state, origin, coord) <= BARBARIAN_SENSE_RADIUS);
}

function planTargetPosition(state: GameState, plan: AIStrategicPlan): HexCoord | null {
  if (plan.target.kind === 'unit') {
    return state.units[plan.target.id]?.position ?? null;
  }
  if (plan.target.kind === 'city') {
    return state.cities[plan.target.id]?.position ?? null;
  }
  if (plan.target.kind === 'camp') {
    return state.barbarianCamps[plan.target.id]?.position ?? null;
  }
  return plan.target.kind === 'resource' ? plan.target.position : plan.target.anchor;
}

function makeBarbarianPlan(
  state: GameState,
  camp: BarbarianCamp,
  target: AIStrategicPlan['target'],
  objective: AIStrategicPlan['objective'],
  reason: AIStrategicPlan['reasonCodes'][number],
  assignedUnitIds: string[],
): AIStrategicPlan {
  return {
    id: `barbarian-plan:${camp.id}:${state.turn}:${objective}`,
    actorId: camp.id,
    objective,
    target,
    theaterId: `camp:${camp.id}`,
    phase: objective === 'defend' ? 'attacking' : 'advancing',
    reasonCodes: [reason],
    commitment: objective === 'defend' ? 1 : 0.7,
    createdTurn: state.turn,
    reconsiderAfterTurn: state.turn + 2,
    expiresAfterTurn: state.turn + 8,
    lastProgressTurn: state.turn,
    rallyPoint: { ...camp.position },
    requiredRoles: { frontline: 1 },
    assignedUnitIds,
  };
}

function chooseStepToward(
  state: GameState,
  unit: Unit,
  target: HexCoord,
): HexCoord | null {
  const occupied = new Set(Object.values(state.units)
    .filter(candidate => candidate.id !== unit.id && !candidate.transportId)
    .map(candidate => hexKey(candidate.position)));
  const neighboringCoords = mapNeighbors(state.map, unit.position);
  return neighboringCoords
    .filter(coord => isPassableBarbarianTile(state, coord) && !occupied.has(hexKey(coord)))
    .filter(coord => barbarianDistance(state, coord, target) < barbarianDistance(state, unit.position, target))
    .sort((a, b) =>
      barbarianDistance(state, a, target) - barbarianDistance(state, b, target)
      || a.q - b.q
      || a.r - b.r)[0] ?? null;
}

function chooseBarbarianSpawnType(
  state: GameState,
  campId: string,
  assignedUnits: Unit[],
): UnitType {
  const camp = state.barbarianCamps[campId];
  const target = camp ? Object.values(state.cities)
    .filter(city => state.civilizations[city.owner] && !state.civilizations[city.owner].isEliminated)
    .sort((a, b) => barbarianDistance(state, camp.position, a.position) - barbarianDistance(state, camp.position, b.position) || a.owner.localeCompare(b.owner))[0]
    : undefined;
  const roster = getBarbarianRosterForEra(camp
    ? resolveNeutralPressureEra(state, camp.position, target?.owner) ?? 1
    : 1);
  const rangedCount = assignedUnits.filter(unit => roster.ranged.includes(unit.type)).length;
  const canAddRanged = (rangedCount + 1) * 3 <= assignedUnits.length + 1;
  const pool = canAddRanged ? [...roster.melee, ...roster.ranged] : roster.melee;
  const seed = [...`${state.gameId ?? 'game'}:${state.turn}:${campId}`]
    .reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 1);
  return pool[seed % pool.length]!;
}

/**
 * Pure, camp-local barbarian planner. The returned orders must be revalidated
 * through canonical movement/combat helpers by the caller.
 */
export function processPurposefulBarbarians(state: GameState): PurposefulBarbarianProcessResult {
  const opponentAI = structuredClone(state.opponentAI ?? createEmptyOpponentAIState());
  opponentAI.barbarianCamps = Object.fromEntries(
    Object.entries(opponentAI.barbarianCamps)
      .filter(([campId]) => Boolean(state.barbarianCamps[campId])),
  );
  opponentAI.barbarianHomeCampByUnitId = Object.fromEntries(
    Object.entries(opponentAI.barbarianHomeCampByUnitId)
      .filter(([unitId, campId]) =>
        state.units[unitId]?.owner === 'barbarian' && Boolean(state.barbarianCamps[campId])),
  );

  const camps = Object.values(state.barbarianCamps)
    .sort((a, b) => a.id.localeCompare(b.id));
  const barbarianUnits = Object.values(state.units)
    .filter(unit => unit.owner === 'barbarian' && !unit.transportId)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of barbarianUnits) {
    if (opponentAI.barbarianHomeCampByUnitId[unit.id]) continue;
    const nearest = camps
      .filter(camp => barbarianDistance(state, unit.position, camp.position) <= BARBARIAN_SENSE_RADIUS)
      .sort((a, b) =>
        barbarianDistance(state, unit.position, a.position) - barbarianDistance(state, unit.position, b.position)
        || a.id.localeCompare(b.id))[0];
    if (nearest) opponentAI.barbarianHomeCampByUnitId[unit.id] = nearest.id;
  }

  const campTick = processBarbarians(camps, state.map, [], state.turn * 31337);
  const spawnedUnits: PurposefulBarbarianProcessResult['spawnedUnits'] = [];
  const moveOrders: BarbarianMoveOrder[] = [];
  const attackOrders: BarbarianAttackOrder[] = [];
  const cityAttackOrders: BarbarianCityAttackOrder[] = [];
  const profile = OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)];

  for (const camp of camps) {
    const assigned = barbarianUnits.filter(unit =>
      opponentAI.barbarianHomeCampByUnitId[unit.id] === camp.id);
    const assignedIds = assigned.map(unit => unit.id);
    const spawn = campTick.spawnedUnits.find(candidate => candidate.campId === camp.id);
    if (spawn) {
      const occupied = new Set(Object.values(state.units)
        .filter(unit => !unit.transportId)
        .map(unit => hexKey(unit.position)));
      const spawnPosition = [spawn.position, ...mapNeighbors(state.map, spawn.position)]
        .filter(coord => isPassableBarbarianTile(state, coord) && !occupied.has(hexKey(coord)))
        .sort((a, b) =>
          barbarianDistance(state, a, camp.position) - barbarianDistance(state, b, camp.position)
          || a.q - b.q
          || a.r - b.r)[0];
      if (spawnPosition) {
        spawnedUnits.push({
          ...spawn,
          position: spawnPosition,
          unitType: chooseBarbarianSpawnType(state, camp.id, assigned),
        });
      }
    }

    const sensedUnits = Object.values(state.units)
      .filter(unit =>
        unit.owner !== 'barbarian'
        && !unit.transportId
        && sensedByCamp(state, camp, assigned, unit.position))
      .sort((a, b) =>
        barbarianDistance(state, camp.position, a.position) - barbarianDistance(state, camp.position, b.position)
        || a.id.localeCompare(b.id));
    const campThreat = sensedUnits.find(unit =>
      UNIT_DEFINITIONS[unit.type].strength > 0
      && barbarianDistance(state, camp.position, unit.position) <= BARBARIAN_DEFENSE_RADIUS);
    const existing = opponentAI.barbarianCamps[camp.id];
    const existingPosition = existing ? planTargetPosition(state, existing) : null;
    const existingValid = Boolean(
      existing
      && state.turn <= existing.expiresAfterTurn
      && existingPosition
      && sensedByCamp(state, camp, assigned, existingPosition),
    );
    const existingRaidTargetEscaped = Boolean(
      existing
      && existing.objective === 'raid'
      && existing.target.kind === 'unit'
      && (
        !existingPosition
        || !sensedByCamp(state, camp, assigned, existingPosition)
      ),
    );

    let plan: AIStrategicPlan | null = existingRaidTargetEscaped
      ? { ...existing!, phase: 'withdrawing', lastProgressTurn: state.turn }
      : existingValid ? existing! : null;
    if (campThreat && (plan?.objective !== 'defend' || plan.target.kind !== 'unit' || plan.target.id !== campThreat.id)) {
      plan = makeBarbarianPlan(
        state,
        camp,
        { kind: 'unit', id: campThreat.id, lastKnownPosition: { ...campThreat.position } },
        'defend',
        'camp-defense',
        assignedIds,
      );
    }

    if (!plan) {
      const raidUnit = sensedUnits
        .filter(unit => unit.type === 'worker' || unit.type === 'caravan')
        .sort((a, b) => {
          const priority = (unit: Unit) => unit.type === 'caravan' ? 0 : 1;
          return priority(a) - priority(b)
            || barbarianDistance(state, camp.position, a.position) - barbarianDistance(state, camp.position, b.position)
            || a.id.localeCompare(b.id);
        })[0];
      if (raidUnit) {
        plan = makeBarbarianPlan(
          state,
          camp,
          { kind: 'unit', id: raidUnit.id, lastKnownPosition: { ...raidUnit.position } },
          'raid',
          'opportunistic-raid',
          assignedIds,
        );
      }
    }

    if (!plan) {
      const resource = Object.values(state.map.tiles)
        .filter(tile =>
          Boolean(tile.resource)
          && tile.improvement !== 'none'
          && tile.improvementTurnsLeft === 0
          && tile.owner !== null
          && tile.owner !== 'barbarian'
          && sensedByCamp(state, camp, assigned, tile.coord))
        .sort((a, b) =>
          barbarianDistance(state, camp.position, a.coord) - barbarianDistance(state, camp.position, b.coord)
          || hexKey(a.coord).localeCompare(hexKey(b.coord)))[0];
      if (resource?.resource) {
        plan = makeBarbarianPlan(
          state,
          camp,
          { kind: 'resource', resource: resource.resource as ResourceType, position: { ...resource.coord } },
          'raid',
          'opportunistic-raid',
          assignedIds,
        );
      }
    }

    if (!plan) {
      const city = Object.values(state.cities)
        .filter(city =>
          city.owner !== 'barbarian'
          && sensedByCamp(state, camp, assigned, city.position)
          && (city.hp ?? 100) <= Math.max(40, camp.strength * 10))
        .sort((a, b) =>
          barbarianDistance(state, camp.position, a.position) - barbarianDistance(state, camp.position, b.position)
          || a.id.localeCompare(b.id))[0];
      if (city) {
        plan = makeBarbarianPlan(
          state,
          camp,
          { kind: 'city', id: city.id, lastKnownPosition: { ...city.position } },
          'raid',
          'nearby-opportunity',
          assignedIds,
        );
      }
    }

    if (!plan) {
      plan = makeBarbarianPlan(
        state,
        camp,
        { kind: 'region', id: `patrol:${camp.id}`, anchor: { ...camp.position } },
        'defend',
        'homeland-secure',
        assignedIds,
      );
      plan.phase = 'scouting';
      plan.commitment = 0.3;
    }

    const targetPosition = planTargetPosition(state, plan);
    const resourceTarget = plan.target.kind === 'resource' ? plan.target : null;
    const completedResourceRaid = resourceTarget !== null
      && plan.createdTurn < state.turn
      && assigned.some(unit => hexKey(unit.position) === hexKey(resourceTarget.position));
    const lostUnitTarget = plan.target.kind === 'unit' && !state.units[plan.target.id];
    if (completedResourceRaid || lostUnitTarget) {
      plan = {
        ...plan,
        phase: 'withdrawing',
        lastProgressTurn: state.turn,
      };
    }
    plan = { ...plan, assignedUnitIds: assignedIds };
    opponentAI.barbarianCamps[camp.id] = plan;

    for (const unit of assigned) {
      if (unit.movementPointsLeft <= 0 || unit.hasActed) continue;
      const withdrawing = plan.phase === 'withdrawing' || unit.health < profile.retreatHealthPercent;
      const targetOwnerId = plan.target.kind === 'unit'
        ? state.units[plan.target.id]?.owner
        : plan.target.kind === 'city'
          ? state.cities[plan.target.id]?.owner
          : plan.target.kind === 'resource'
            ? state.map.tiles[hexKey(plan.target.position)]?.owner
            : null;
      if (!withdrawing && !canBarbarianPressureEngage(state, unit, targetOwnerId)) continue;
      const destination = withdrawing ? camp.position : targetPosition;
      if (!destination) continue;
      if (!withdrawing && plan.target.kind === 'unit') {
        const defender = state.units[plan.target.id];
        if (
          defender
          && canAttackByProfileOnMap(unit, defender, state.map)
          && UNIT_DEFINITIONS[unit.type].strength >= UNIT_DEFINITIONS[defender.type].strength * 0.75
        ) {
          attackOrders.push({ attackerUnitId: unit.id, defenderUnitId: defender.id });
          continue;
        }
      }
      if (!withdrawing && plan.target.kind === 'city' && barbarianDistance(state, unit.position, destination) <= 1) {
        const city = state.cities[plan.target.id];
        const garrison = city ? getCityGarrisonUnit(state.units, city) : undefined;
        if (garrison) {
          if (canAttackByProfileOnMap(unit, garrison, state.map)) {
            attackOrders.push({ attackerUnitId: unit.id, defenderUnitId: garrison.id });
          }
        } else {
          cityAttackOrders.push({ attackerUnitId: unit.id, cityId: plan.target.id, damage: 10 });
        }
        continue;
      }
      const step = chooseStepToward(state, unit, destination);
      if (step) moveOrders.push({ unitId: unit.id, toCoord: step });
    }
  }

  return {
    updatedCamps: campTick.updatedCamps,
    spawnedUnits,
    moveOrders,
    attackOrders,
    cityAttackOrders,
    opponentAI,
  };
}

const BARBARIAN_CHASE_RANGE = 5;

function selectPlayerDefenderAtTarget(playerUnits: Unit[], targetKey: string, map: GameMap): Unit | undefined {
  return selectDefenderForAttack(
    playerUnits.filter(unit => hexKey(unit.position) === targetKey),
    map,
  );
}

export function processBarbarians(
  camps: BarbarianCamp[],
  map: GameMap,
  playerUnits: Unit[],
  seed: number,
  barbarianUnits?: Unit[],
  playerCities?: Array<{ id: string; position: HexCoord; owner: string }>,
): BarbarianProcessResult {
  const rng = lcg(seed ^ 0xdeadbeef);
  const updatedCamps: BarbarianCamp[] = [];
  const spawnedUnits: Array<{ campId: string; position: HexCoord }> = [];
  const moveOrders: BarbarianMoveOrder[] = [];
  const attackOrders: BarbarianAttackOrder[] = [];
  const cityAttackOrders: BarbarianCityAttackOrder[] = [];

  // --- Camp processing: cooldowns and spawning ---
  for (const camp of camps) {
    const newCooldown = camp.spawnCooldown - 1;

    if (newCooldown <= 0) {
      spawnedUnits.push({ campId: camp.id, position: { ...camp.position } });
      updatedCamps.push({
        ...camp,
        spawnCooldown: 4 + Math.floor(rng() * 3),
        strength: camp.strength + 1,
      });
    } else {
      updatedCamps.push({ ...camp, spawnCooldown: newCooldown });
    }
  }

  // --- Barbarian unit movement and attack ---
  if (!barbarianUnits || barbarianUnits.length === 0) {
    return { updatedCamps, spawnedUnits, moveOrders, attackOrders, cityAttackOrders };
  }

  // Build a set of all occupied positions (for collision avoidance)
  const occupiedByUnit: Map<string, string> = new Map(); // hexKey → unitId
  for (const u of barbarianUnits) {
    occupiedByUnit.set(hexKey(u.position), u.id);
  }
  for (const u of playerUnits) {
    occupiedByUnit.set(hexKey(u.position), u.id);
  }

  for (const barbUnit of barbarianUnits) {
    if (barbUnit.movementPointsLeft <= 0) continue;

    // Find the nearest player unit within chase range
    let nearestTarget: Unit | null = null;
    let nearestDist = BARBARIAN_CHASE_RANGE + 1;
    for (const playerUnit of playerUnits) {
      const dist = mapDistance(map, barbUnit.position, playerUnit.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTarget = playerUnit;
      }
    }

    if (!nearestTarget) {
      if (playerCities && playerCities.length > 0) {
        let nearestCity: (typeof playerCities)[0] | null = null;
        let nearestCityDist = BARBARIAN_CHASE_RANGE + 1;
        for (const city of playerCities) {
          const dist = mapDistance(map, barbUnit.position, city.position);
          if (dist < nearestCityDist) {
            nearestCityDist = dist;
            nearestCity = city;
          }
        }
        if (nearestCity) {
          if (nearestCityDist <= 1) {
            cityAttackOrders.push({ attackerUnitId: barbUnit.id, cityId: nearestCity.id, damage: 10 });
          } else {
            const neighbors = mapNeighbors(map, barbUnit.position);
            const passable = neighbors.filter(coord => {
              const t = map.tiles[hexKey(coord)];
              if (!t) return false;
              if (t.terrain === 'ocean' || t.terrain === 'coast' || t.terrain === 'mountain') return false;
              return !occupiedByUnit.get(hexKey(coord));
            });
            if (passable.length > 0) {
              let best = passable[0]!;
              let bestD = mapDistance(map, passable[0]!, nearestCity.position);
              for (const coord of passable) {
                const d = mapDistance(map, coord, nearestCity.position);
                if (d < bestD) { bestD = d; best = coord; }
              }
              moveOrders.push({ unitId: barbUnit.id, toCoord: best });
              occupiedByUnit.delete(hexKey(barbUnit.position));
              occupiedByUnit.set(hexKey(best), barbUnit.id);
            }
          }
        }
      }
      continue;
    }

    // If adjacent to target, issue an attack order
    if (canAttackByProfileOnMap(barbUnit, nearestTarget, map)) {
      const targetKey = hexKey(nearestTarget.position);
      const defender = selectPlayerDefenderAtTarget(playerUnits, targetKey, map) ?? nearestTarget;
      attackOrders.push({ attackerUnitId: barbUnit.id, defenderUnitId: defender.id });
      continue;
    }

    // Otherwise, move one step toward the target
    const neighbors = mapNeighbors(map, barbUnit.position);
    // Filter to passable, unoccupied tiles
    const passable = neighbors.filter(coord => {
      const tile = map.tiles[hexKey(coord)];
      if (!tile) return false;
      if (tile.terrain === 'ocean' || tile.terrain === 'coast' || tile.terrain === 'mountain') return false;
      const key = hexKey(coord);
      // Allow moving onto player unit tiles (will become an attack next turn)
      const occupant = occupiedByUnit.get(key);
      return !occupant || occupant === nearestTarget.id;
    });

    if (passable.length === 0) continue;

    // Pick the neighbor closest to the target
    let bestCoord = passable[0];
    let bestDist = mapDistance(map, passable[0], nearestTarget.position);
    for (const coord of passable) {
      const d = mapDistance(map, coord, nearestTarget.position);
      if (d < bestDist) {
        bestDist = d;
        bestCoord = coord;
      }
    }

    // If the best step is onto the target tile, issue attack instead
    if (hexKey(bestCoord) === hexKey(nearestTarget.position)) {
      const targetKey = hexKey(nearestTarget.position);
      const defender = selectPlayerDefenderAtTarget(playerUnits, targetKey, map) ?? nearestTarget;
      attackOrders.push({ attackerUnitId: barbUnit.id, defenderUnitId: defender.id });
    } else {
      moveOrders.push({ unitId: barbUnit.id, toCoord: bestCoord });
      // Update occupancy map so later units in this loop don't collide
      occupiedByUnit.delete(hexKey(barbUnit.position));
      occupiedByUnit.set(hexKey(bestCoord), barbUnit.id);
    }
  }

  return { updatedCamps, spawnedUnits, moveOrders, attackOrders, cityAttackOrders };
}
