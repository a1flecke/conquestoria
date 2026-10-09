import type { City, GameMap, GameState, HexCoord, ResourceType, ResourceYield, Unit, WorkerActionType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getWorkableTilesForCity } from '@/systems/city-work-system';
import { getTileYield } from '@/systems/tile-yield';
import { getAvailableWorkerActions, getKnownTileResourceForWorkerAction, IMPROVEMENT_DEFINITIONS } from '@/systems/improvement-system';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { getRoadBuildTarget } from '@/systems/road-network';
import { applyWorkerAction, getWorkerChargesRemaining } from '@/systems/worker-action-system';
import { executeUnitMove, isWorkerBusy, resolveUnitMoveIntent } from '@/systems/unit-movement-system';
import { getBlockingMapEntityKeys } from '@/systems/unit-movement-legality';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';
import { findPath } from '@/systems/unit-pathfinding';
import { hexKey, mapDistance, mapNeighbors } from '@/systems/hex-utils';
import { getMovementCostForUnitInContext } from '@/systems/unit-movement-cost';
import { getVisibility } from '@/systems/fog-of-war';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { getRoadBuildTurns } from '@/systems/road-system';
import { getActiveNationalProjectsForCiv } from '@/systems/national-project-system';
import { isAIHostileOwner } from './ai-hostility';
import { buildKnownPathMap } from './ai-prepared-turn';

// Bound precise routing, not territory size: each worker can consider its own
// nearby jobs, so a distant worker isn't starved by a capital-only shortlist.
export const WORKER_PATH_TRIALS = 4;
export const WORKER_SHORTLIST_SIZE = 12;

export interface WorkerDevelopmentJob {
  coord: HexCoord;
  action: WorkerActionType;
  category: 'resource' | 'productivity' | 'road';
  resource?: ResourceType;
  acquisitionValue: number;
  productivityValue: number;
  buildTurns: number;
}

export interface WorkerDevelopmentAssignment {
  workerId: string;
  job: WorkerDevelopmentJob;
  nextStep?: HexCoord;
}

function weightedYield(yields: ResourceYield, city: City, foodStrained: boolean, goldStrained: boolean): number {
  return yields.food * (foodStrained || city.focus === 'food' ? 6 : 3)
    + yields.production * (city.focus === 'production' ? 6 : 3)
    + yields.gold * (goldStrained || city.focus === 'gold' ? 6 : 2)
    + yields.science * (city.focus === 'science' ? 6 : 2);
}

/** Pure inventory: canonical workable claims and yield deltas, never catalog order. */
export function collectWorkerDevelopmentJobs(state: GameState, civId: string, knownMap?: GameMap): WorkerDevelopmentJob[] {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman || civ.isEliminated) return [];
  const cities = civ.cities.map(id => state.cities[id]).filter((city): city is City => city?.owner === civId);
  const availableResources = getCivAvailableResources(state, civId);
  // Construction already spends the charge and reserves its first-source value.
  // A second copy may still be worth working, but it cannot acquire access twice.
  const pendingResources = new Set<ResourceType>();
  for (const city of cities) for (const coord of city.ownedTiles) {
    const tile = state.map.tiles[hexKey(coord)];
    if (!tile || tile.owner !== civId || getVisibility(civ.visibility, coord) !== 'visible' || tile.improvementTurnsLeft <= 0) continue;
    const resource = getKnownTileResourceForWorkerAction(tile, civ.techState.completed);
    if (resource && RESOURCE_DEFINITIONS.some(definition => definition.id === resource && definition.requiredImprovement === tile.improvement)) {
      pendingResources.add(resource);
    }
  }
  const jobsByKey = new Map<string, WorkerDevelopmentJob>();
  const visibleForeignUnits = Object.values(state.units).filter(unit => !unit.transportId && unit.owner !== civId
    && getVisibility(civ.visibility, unit.position) === 'visible');
  const unsafe = (coord: HexCoord) => visibleForeignUnits.some(unit => hexKey(unit.position) === hexKey(coord)
    || (isAIHostileOwner(state, civId, unit.owner) && UNIT_DEFINITIONS[unit.type].strength > 0
      && mapDistance(state.map, coord, unit.position) <= 2));

  for (const city of cities) {
    const workable = getWorkableTilesForCity(state, city.id).filter(entry => entry.available);
    const workedKeys = new Set(city.workedTiles.map(hexKey));
    const foodStrained = workable.filter(entry => workedKeys.has(hexKey(entry.coord)))
      .reduce((food, entry) => food + entry.yield.food, 0) < city.population * 2;
    const score = (yields: ResourceYield) => weightedYield(yields, city, foodStrained, civ.gold <= 0);
    const workedScores = workable.filter(entry => workedKeys.has(hexKey(entry.coord))).map(entry => score(entry.yield));
    const marginalWorkedScore = workedScores.length < city.population ? 0 : Math.min(...workedScores);
    for (const entry of workable) {
      const key = hexKey(entry.coord);
      const tile = state.map.tiles[key]!;
      if (getVisibility(civ.visibility, entry.coord) !== 'visible' || unsafe(entry.coord)
        || tile.improvementTurnsLeft > 0 || (tile.roadTurnsLeft ?? 0) > 0
        || (tile.devastatedUntilTurn ?? 0) > state.turn) continue;
      const resource = getKnownTileResourceForWorkerAction(tile, civ.techState.completed);
      const definition = RESOURCE_DEFINITIONS.find(candidate => candidate.id === resource);
      const missingResource = Boolean(resource && !availableResources.has(resource) && !pendingResources.has(resource));
      const allowReplacement = Boolean(definition && tile.improvement !== definition.requiredImprovement);
      const actions = getAvailableWorkerActions(tile, civ.techState.completed, civId, {
        knownResource: resource, state, currentTurn: state.turn, allowReplacement,
      });
      for (const action of actions) {
        // Don't spend a finite charge blocking a revealed resource (including one
        // whose required improvement tech is still missing). No speculative forts
        // or destructive swamp drainage in ordinary economic development.
        if (action === 'fort' || action === 'drain_swamp' || action === 'restore_land'
          || (definition && action !== definition.requiredImprovement)) continue;
        const improvement = IMPROVEMENT_DEFINITIONS[action];
        const projected = getTileYield({ ...tile, improvement: action, improvementTurnsLeft: 0,
          terrain: action === 'farm' && (tile.terrain === 'forest' || tile.terrain === 'jungle') ? 'plains' : tile.terrain }, state.map, entry.coord,
        { completedTechs: civ.techState.completed, currentTurn: state.turn });
        const productivityValue = Math.max(0, score(projected)
          - (workedKeys.has(key) ? score(entry.yield) : Math.max(score(entry.yield), marginalWorkedScore)));
        // First-source option value is modest. Immediate food/gold needs can win;
        // repeated copies have no empire bonus (resource access is a Set).
        const acquisitionValue = missingResource ? (definition?.type === 'luxury' && city.unrestLevel > 0 ? 18 : 12) : 0;
        if (productivityValue + acquisitionValue <= 0) continue;
        const job: WorkerDevelopmentJob = { coord: entry.coord, action,
          category: acquisitionValue > 0 ? 'resource' : 'productivity',
          resource: resource ?? undefined, acquisitionValue, productivityValue, buildTurns: improvement.buildTurns };
        const existing = jobsByKey.get(key);
        const valueRate = (candidate: WorkerDevelopmentJob) => (candidate.acquisitionValue + candidate.productivityValue) / candidate.buildTurns;
        if (!existing || valueRate(job) > valueRate(existing)
          || (valueRate(job) === valueRate(existing) && action < existing.action)) jobsByKey.set(key, job);
      }
    }
  }
  const road = civ.techState.completed.includes('road-building')
    ? getRoadBuildTarget({ ...state, map: knownMap ?? buildKnownPathMap(state, civId) }, civId) : null;
  const roadTile = road ? state.map.tiles[hexKey(road)] : undefined;
  const jobs = [...jobsByKey.values()];
  if (road && roadTile && getVisibility(civ.visibility, road) === 'visible' && !unsafe(road)
    && (roadTile.roadTurnsLeft ?? 0) === 0 && roadTile.improvementTurnsLeft === 0) {
    // Road and improvement are separate alternatives on a tile. Suppressing
    // roads whenever a farm is legal would make city connections unreachable.
    jobs.push({ coord: road, action: 'build_road', category: 'road',
      acquisitionValue: 0, productivityValue: 8,
      buildTurns: getRoadBuildTurns(getActiveNationalProjectsForCiv(state, civId).some(project => project.id === 'road_corps')) });
  }
  return jobs.sort((a, b) => hexKey(a.coord).localeCompare(hexKey(b.coord)) || a.action.localeCompare(b.action));
}

/** No cross-turn cache/reservations: current ownership, lives and completions win. */
export function assignWorkerDevelopmentJobs(
  state: GameState, civId: string, excludedWorkerIds: ReadonlySet<string> = new Set(),
): WorkerDevelopmentAssignment[] {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman || civ.isEliminated) return [];
  const workers = civ.units.map(id => state.units[id]).filter((unit): unit is Unit => Boolean(unit)
    && unit.owner === civId && unit.type === 'worker' && !unit.hasActed && unit.movementPointsLeft > 0
    && !unit.transportId && !unit.committedToRouteId && !isWorkerBusy(state, unit.id)
    && getWorkerChargesRemaining(unit) > 0 && !excludedWorkerIds.has(unit.id));
  if (workers.length === 0) return [];
  const knownMap = buildKnownPathMap(state, civId);
  const jobs = collectWorkerDevelopmentJobs(state, civId, knownMap);
  if (jobs.length === 0) return [];
  const utility = (worker: Unit, job: WorkerDevelopmentJob) => (job.acquisitionValue + job.productivityValue)
    / (job.buildTurns + mapDistance(state.map, worker.position, job.coord));
  const reservedSites = new Set<string>();
  const reservedResources = new Set<ResourceType>();
  const assignments: WorkerDevelopmentAssignment[] = [];
  const blocked = getBlockingMapEntityKeys(state, workers[0]!);
  for (const key of [...blocked]) if (civ.visibility.tiles[key] !== 'visible') blocked.delete(key);
  for (const unit of Object.values(state.units)) {
    if (!unit.transportId && unit.owner !== civId && getVisibility(civ.visibility, unit.position) === 'visible') {
      blocked.add(hexKey(unit.position));
      if (isAIHostileOwner(state, civId, unit.owner) && UNIT_DEFINITIONS[unit.type].strength > 0) {
        const adjacent = mapNeighbors(knownMap, unit.position);
        for (const coord of adjacent) {
          blocked.add(hexKey(coord));
          for (const outer of mapNeighbors(knownMap, coord)) blocked.add(hexKey(outer));
        }
      }
    }
  }
  // Cheap reachability labels are shared across workers of this one unit type.
  // Each known passable tile is visited at most once. This prevents four rich
  // sites on another island from exhausting every worker's precise-path budget.
  const componentByKey = new Map<string, string>();
  for (const worker of workers) {
    const startKey = hexKey(worker.position);
    if (componentByKey.has(startKey) || !knownMap.tiles[startKey] || blocked.has(startKey)) continue;
    const queue = [worker.position];
    componentByKey.set(startKey, startKey);
    for (let index = 0; index < queue.length; index++) {
      for (const coord of mapNeighbors(knownMap, queue[index]!)) {
        const key = hexKey(coord);
        const tile = knownMap.tiles[key];
        if (!tile || componentByKey.has(key) || blocked.has(key)
          || getMovementCostForUnitInContext(worker, tile.terrain, { completedTechs: civ.techState.completed }) === Infinity) continue;
        componentByKey.set(key, startKey);
        queue.push(coord);
      }
    }
  }
  const reachableJobs = (worker: Unit) => jobs.filter(job => componentByKey.has(hexKey(worker.position))
    && componentByKey.get(hexKey(job.coord)) === componentByKey.get(hexKey(worker.position)));
  const bestCheapValue = (worker: Unit) => Math.max(0, ...reachableJobs(worker).map(job => utility(worker, job)));
  workers.sort((a, b) => bestCheapValue(b) - bestCheapValue(a) || a.id.localeCompare(b.id));
  for (const worker of workers) {
    const shortlist = reachableJobs(worker).filter(job => !reservedSites.has(hexKey(job.coord))
      && !(job.resource && reservedResources.has(job.resource) && job.productivityValue === 0))
      .sort((a, b) => utility(worker, b) - utility(worker, a)
        || hexKey(a.coord).localeCompare(hexKey(b.coord)) || a.action.localeCompare(b.action))
      .slice(0, WORKER_SHORTLIST_SIZE);
    const routes = new Map<string, { nextStep?: HexCoord; travel: number } | null>();
    const pairs: { job: WorkerDevelopmentJob; value: number; nextStep?: HexCoord; travel: number }[] = [];
    let trials = 0;
    for (const job of shortlist) {
      const key = hexKey(job.coord);
      if (!routes.has(key)) {
        if (hexKey(worker.position) === key) routes.set(key, { travel: 0 });
        else {
          if (trials >= WORKER_PATH_TRIALS) continue;
          trials += 1;
          const path = findPath(worker.position, job.coord, knownMap, 'land', {
            unit: worker, completedTechs: civ.techState.completed, blockedHexKeys: blocked,
            deniedOwnerIds: getDeniedTerritoryOwners(state, worker),
          });
          const nextStep = path?.[1];
          routes.set(key, nextStep && resolveUnitMoveIntent(state, worker.id, nextStep, { actor: 'ai', civId }).ok
            ? { nextStep, travel: path!.length - 1 } : null);
        }
      }
      const route = routes.get(key);
      if (route) pairs.push({ job, ...route,
        value: (job.acquisitionValue + job.productivityValue) / (job.buildTurns + route.travel) });
    }
    // Reserve before shortlisting the next worker; otherwise six co-located
    // workers all route to the same four finalists and two remain idle.
    pairs.sort((a, b) => b.value - a.value || a.travel - b.travel
      || hexKey(a.job.coord).localeCompare(hexKey(b.job.coord)) || a.job.action.localeCompare(b.job.action));
    const selected = pairs[0];
    if (!selected) continue;
    const { job, nextStep } = selected;
    const key = hexKey(job.coord);
    reservedSites.add(key);
    if (job.resource && job.acquisitionValue > 0) reservedResources.add(job.resource);
    assignments.push({ workerId: worker.id, job, nextStep });
  }
  return assignments;
}

export function processWorkerDevelopment(
  state: GameState, civId: string, bus: EventBus, excludedWorkerIds: ReadonlySet<string> = new Set(),
): GameState {
  const assignments = assignWorkerDevelopmentJobs(state, civId, excludedWorkerIds);
  // The canonical mover still has transition-local mutable helpers. Isolate them
  // once for the whole dispatch, rather than cloning the map once per worker.
  let next = assignments.some(assignment => assignment.nextStep) ? structuredClone(state) : state;
  for (const assignment of assignments) {
    if (assignment.nextStep) {
      const movement = executeUnitMove(next, assignment.workerId, assignment.nextStep, { actor: 'ai', civId, bus });
      if (movement.ok) next = movement.state;
    } else {
      const result = applyWorkerAction(next, assignment.workerId, assignment.job.action, { allowReplacement: true });
      if (result.ok) {
        next = result.state;
        for (const event of result.events) bus.emit(event.type, event.payload);
      }
    }
  }
  return next;
}
