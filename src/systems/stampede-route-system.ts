import { CRISIS_FORCE_OWNER } from '@/core/owner-kind';
import type { CrisisForce, GameState, HerdRoute, HexCoord, Unit } from '@/core/types';
import { getFortificationTier } from './fortification-system';
import { hexKey, mapDistance, mapNeighbors } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import { getVisibility } from './fog-of-war';
import { isHostileOwnerTo } from './owner-hostility';

export interface HerdRoutePresentationItem { unitId: string; steps: HexCoord[]; stopsAtFort: boolean; }
export interface HerdRoutePresentation { routes: HerdRoutePresentationItem[]; }

const LAND_TERRAINS = new Set(['grassland', 'plains', 'desert', 'tundra', 'snow', 'forest', 'hills', 'jungle', 'swamp', 'volcanic']);

function seededRank(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function force(state: GameState, forceId: string): CrisisForce | undefined {
  return state.crisisForces?.[forceId];
}

function targetCenter(state: GameState, record: CrisisForce, origin: HexCoord): HexCoord | undefined {
  return Object.values(state.cities)
    .filter(city => city.owner === record.targetCivId)
    .sort((left, right) => mapDistance(state.map, left.position, origin) - mapDistance(state.map, right.position, origin) || left.id.localeCompare(right.id))[0]?.position;
}

function isCityCenter(state: GameState, coord: HexCoord): boolean {
  return Object.values(state.cities).some(city => hexKey(city.position) === hexKey(coord));
}

function isOccupied(state: GameState, coord: HexCoord, ignoredUnitId: string): boolean {
  return Object.values(state.units).some(unit => unit.id !== ignoredUnitId && !unit.transportId && hexKey(unit.position) === hexKey(coord));
}

function isFort(state: GameState, coord: HexCoord): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  return tile?.improvement === 'fort' && tile.improvementTurnsLeft === 0;
}

export function getHerdAvoidanceScore(state: GameState, coord: HexCoord): number {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile) return 0;
  let score = 0;
  if (isFort(state, coord)) {
    score += getFortificationTier(state.civilizations[tile.owner ?? '']?.techState.completed ?? []).id === 'citadel' ? 4 : 3;
  }
  for (const neighbor of mapNeighbors(state.map, coord)) {
    const unit = Object.values(state.units).find(candidate => hexKey(candidate.position) === hexKey(neighbor));
    const domain = UNIT_DEFINITIONS[unit?.type ?? 'warrior']?.domain;
    if (!unit?.isFortified || unit.transportId || domain === 'naval' || domain === 'air' || UNIT_DEFINITIONS[unit.type]?.strength <= 0) continue;
    score += 2;
  }
  return Math.min(6, score);
}

function legal(state: GameState, unit: Unit, coord: HexCoord, allowHostileBlocker: boolean): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  const blockers = Object.values(state.units)
    .filter(candidate => candidate.id !== unit.id && !candidate.transportId && hexKey(candidate.position) === hexKey(coord));
  return Boolean(tile && LAND_TERRAINS.has(tile.terrain) && !isCityCenter(state, coord)
    && (blockers.length === 0 || (blockers.length === 1 && allowHostileBlocker && isHostileOwnerTo(state, unit.owner, blockers[0]!.owner))));
}

function nextStep(state: GameState, record: CrisisForce, unit: Unit, center: HexCoord, from: HexCoord, allowHostileBlocker: boolean): HexCoord | undefined {
  const currentDistance = mapDistance(state.map, from, center);
  return mapNeighbors(state.map, from)
    .filter(coord => legal(state, unit, coord, allowHostileBlocker))
    .sort((left, right) => {
      const leftOutward = mapDistance(state.map, left, center) > currentDistance ? 0 : 1;
      const rightOutward = mapDistance(state.map, right, center) > currentDistance ? 0 : 1;
      return leftOutward - rightOutward
        || getHerdAvoidanceScore(state, left) - getHerdAvoidanceScore(state, right)
        || seededRank(`${state.gameId}:${record.id}:${unit.id}:${state.turn}:${hexKey(left)}`) - seededRank(`${state.gameId}:${record.id}:${unit.id}:${state.turn}:${hexKey(right)}`);
    })[0];
}

export function planHerdRoute(state: GameState, forceId: string, unitId: string): HerdRoute {
  const record = force(state, forceId);
  const unit = state.units[unitId];
  if (!record || !unit || unit.owner !== CRISIS_FORCE_OWNER || !record.unitIds.includes(unitId)) return { unitId, committedTurn: state.turn, steps: [] };
  const center = targetCenter(state, record, unit.position);
  if (!center) return { unitId, committedTurn: state.turn, steps: [] };
  const first = nextStep(state, record, unit, center, unit.position, true);
  if (!first || isFort(state, first)) return { unitId, committedTurn: state.turn, steps: first ? [first] : [] };
  const second = nextStep(state, record, unit, center, first, false);
  return { unitId, committedTurn: state.turn, steps: second ? [first, second] : [first] };
}

export function commitHerdRouteForTurn(state: GameState, forceId: string, unitId: string): GameState {
  const record = force(state, forceId);
  if (!record) return state;
  const route = planHerdRoute(state, forceId, unitId);
  return { ...state, crisisForces: { ...state.crisisForces, [forceId]: { ...record, herdRoutes: { ...record.herdRoutes, [unitId]: route } } } };
}

export function getHerdRoutePresentationForViewer(state: GameState, viewerId: string): HerdRoutePresentation {
  const viewer = state.civilizations[viewerId];
  if (!viewer) return { routes: [] };
  const routes = Object.values(state.crisisForces ?? {}).flatMap(record => {
    if (record.targetCivId !== viewerId) return [];
    return Object.values(record.herdRoutes ?? {}).flatMap(route => {
      const unit = state.units[route.unitId];
      if (!unit || getVisibility(viewer.visibility, unit.position) !== 'visible') return [];
      const visibleSteps = route.steps.filter(step => getVisibility(viewer.visibility, step) === 'visible').map(step => ({ ...step }));
      if (visibleSteps.length !== route.steps.length) return [];
      return [{ unitId: route.unitId, steps: visibleSteps, stopsAtFort: route.steps.length === 1 && isFort(state, route.steps[0]!) }];
    });
  });
  return { routes };
}
