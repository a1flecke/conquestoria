import type { GameState, HexCoord, WorkerActionType } from '@/core/types';
import type { HexHighlight } from '@/renderer/render-loop';
import { getAttackTargets, type AttackTarget } from '@/systems/attack-targeting';
import { getVisibility } from '@/systems/fog-of-war';
import { hexDistance, hexKey, wrappedHexDistance } from '@/systems/hex-utils';
import { getAvailableWorkerActions, getKnownTileResourceForWorkerAction } from '@/systems/improvement-system';
import { buildUnitOccupancy } from '@/systems/unit-occupancy';
import { getMovementRangeDetails } from '@/systems/unit-system';
import {
  getLandUnitWaterRecovery,
  NO_LAND_UNIT_WATER_RECOVERY,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';
import { getEmbarkedAssaultTargets } from '@/systems/transport-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getShoreSupplyCapability } from '@/systems/supply-participation';
import { LAND_SUPPLY_RADII } from '@/systems/supply-sources';
import { getFortificationPlacement, getFortificationTier } from '@/systems/fortification-system';
import { mapHexesInRange } from '@/systems/hex-utils';

export interface SelectedUnitHighlightResult {
  movementRange: HexCoord[];
  zocLimitedRange: HexCoord[];
  attackTargets: AttackTarget[];
  highlights: HexHighlight[];
  waterRecovery: LandUnitWaterRecovery;
}

const WORKER_ACTIONS: WorkerActionType[] = ['farm', 'mine', 'lumber_camp', 'watermill', 'drain_swamp', 'restore_land'];

function isCityTile(state: GameState, coord: HexCoord): boolean {
  const key = hexKey(coord);
  return Object.values(state.cities).some(city => hexKey(city.position) === key);
}

function isPlausibleWorkerActionTile(
  state: GameState,
  coord: HexCoord,
  completedTechs: string[],
): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile) return false;
  const knownResource = getKnownTileResourceForWorkerAction(tile, completedTechs);
  return getAvailableWorkerActions(tile, completedTechs, undefined, { isCityTile: isCityTile(state, coord), knownResource, currentTurn: state.turn })
    .some(action => WORKER_ACTIONS.includes(action));
}

function buildWorkerGuidanceHighlights(
  state: GameState,
  unitId: string,
  movementRange: HexCoord[],
): HexHighlight[] {
  const unit = state.units[unitId];
  if (!unit || unit.type !== 'worker') return [];

  const visibility = state.civilizations[state.currentPlayer]?.visibility;
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const coords = [unit.position, ...movementRange];
  const seenKeys = new Set<string>();
  const highlights: HexHighlight[] = [];

  for (const coord of coords) {
    const key = hexKey(coord);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const tile = state.map.tiles[key];
    if (!tile) continue;
    if (visibility && getVisibility(visibility, coord) === 'unexplored') continue;

    const knownResource = getKnownTileResourceForWorkerAction(tile, completedTechs);
    const options = { isCityTile: isCityTile(state, coord), knownResource, currentTurn: state.turn };
    const availableActions = getAvailableWorkerActions(tile, completedTechs, unit.owner, options);
    if (availableActions.length > 0) {
      highlights.push({ coord, type: 'worker-buildable' });
    } else if (tile.owner === unit.owner) {
      highlights.push({ coord, type: 'worker-owned-blocked' });
    } else if (isPlausibleWorkerActionTile(state, coord, completedTechs)) {
      highlights.push({ coord, type: 'worker-foreign-blocked' });
    }
  }

  return highlights;
}

function buildHostileOwners(state: GameState, civId: string): Set<string> {
  const civ = state.civilizations[civId];
  const hostile = new Set<string>(['barbarian', ...(civ?.diplomacy?.atWarWith ?? [])]);
  for (const [mcId, mc] of Object.entries(state.minorCivs)) {
    if (mc.diplomacy?.atWarWith?.includes(civId)) {
      hostile.add(mcId);
    }
  }
  return hostile;
}

function isPreviewableMoveDestination(state: GameState, from: HexCoord, to: HexCoord): boolean {
  const visibility = state.civilizations[state.currentPlayer]?.visibility;
  if (!visibility || getVisibility(visibility, to) !== 'unexplored') return true;
  const distance = state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
  return distance === 1;
}

export function buildSelectedUnitHighlights(state: GameState, unitId: string): SelectedUnitHighlightResult {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== state.currentPlayer) {
    return {
      movementRange: [],
      zocLimitedRange: [],
      attackTargets: [],
      highlights: [],
      waterRecovery: NO_LAND_UNIT_WATER_RECOVERY,
    };
  }
  if (unit.committedToRouteId) {
    return {
      movementRange: [],
      zocLimitedRange: [],
      attackTargets: [],
      highlights: [],
      waterRecovery: NO_LAND_UNIT_WATER_RECOVERY,
    };
  }

  const detailedRange = getMovementRangeDetails(state, unitId);
  const movementRange = detailedRange.reachable
    .filter(coord => isPreviewableMoveDestination(state, unit.position, coord));
  const zocLimitedRange = detailedRange.zocLimited
    .filter(coord => isPreviewableMoveDestination(state, unit.position, coord));
  const attackTargets = unit.transportId
    ? getEmbarkedAssaultTargets(state, unitId, { viewerId: state.currentPlayer })
    : getAttackTargets(state, unit, { viewerId: state.currentPlayer })
      .filter(target => target.result.targetType === 'unit'
        || (target.result.targetType === 'city' && UNIT_DEFINITIONS[unit.type].domain === 'naval'));
  const attackKeys = new Set(attackTargets.map(target => hexKey(target.coord)));
  const nonCombatMovementRange = movementRange
    .filter(coord => !attackKeys.has(hexKey(coord)));
  const waterRecovery = getLandUnitWaterRecovery(
    state,
    unitId,
    nonCombatMovementRange,
  );
  const recoveryKeys = new Set(
    waterRecovery.destinations.map(coord => hexKey(coord)),
  );
  const zocKeys = new Set(zocLimitedRange.map(hexKey));

  const moveHighlights = nonCombatMovementRange.map(coord => ({
    coord,
    type: recoveryKeys.has(hexKey(coord))
      ? 'water-recovery' as const
      : zocKeys.has(hexKey(coord))
        ? 'zoc-limited' as const
      : 'move' as const,
  }));

  const attackHighlights = attackTargets.map(target => ({ coord: target.coord, type: 'attack' as const }));
  const workerHighlights = buildWorkerGuidanceHighlights(state, unitId, movementRange)
    .filter(highlight => !recoveryKeys.has(hexKey(highlight.coord)));
  const supplyProjectionHighlights = buildSupplyProjectionHighlights(state, unit);

  return {
    movementRange,
    zocLimitedRange,
    attackTargets,
    highlights: [...moveHighlights, ...attackHighlights, ...workerHighlights, ...supplyProjectionHighlights],
    waterRecovery,
  };
}

/**
 * Live projected supply coverage (#544 MR2, contract §12) while a friendly
 * naval logistics-capable unit or a fort-eligible Worker is selected. This
 * codebase is mobile-first/tap-based with no hover/drag concept for ship
 * placement (no `hoveredHex`/drag state exists anywhere in the renderer or
 * controllers) -- selection is the closest analog to "hovering" this
 * codebase already uses for every other preview-before-you-commit surface
 * (movement range, attack targets, water recovery), so that's what this
 * reuses rather than inventing a new interaction. `unit.owner ===
 * state.currentPlayer` is already guaranteed by `buildSelectedUnitHighlights`'s
 * own early-return gate before this is ever called.
 */
function buildSupplyProjectionHighlights(state: GameState, unit: GameState['units'][string]): HexHighlight[] {
  const shoreCapability = getShoreSupplyCapability(unit.type);
  if (shoreCapability) {
    return mapHexesInRange(state.map, unit.position, shoreCapability.projectsLandSupplyRange)
      .map(coord => ({ coord, type: 'supply-projected' as const }));
  }

  if (unit.type === 'worker') {
    const placement = getFortificationPlacement(state, unit.owner, unit.position);
    if (placement.ok) {
      const tier = getFortificationTier(state.civilizations[unit.owner]?.techState.completed ?? []);
      return mapHexesInRange(state.map, unit.position, LAND_SUPPLY_RADII[tier.id])
        .map(coord => ({ coord, type: 'supply-projected' as const }));
    }
  }

  return [];
}
