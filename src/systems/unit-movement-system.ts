import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, VillageOutcomeType } from '@/core/types';
import { updateVisibility } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { hexKey, wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import { moveUnit, getMovementCostForUnit, findPath, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery } from '@/systems/wonder-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';

export interface ExecuteUnitMoveOptions {
  actor: 'player' | 'automation' | 'ai';
  civId: string;
  bus?: EventBus;
}

export interface WonderDiscoveryResult {
  wonderId: string;
  position: HexCoord;
  isFirstDiscoverer: boolean;
}

export interface ExecuteUnitMoveResult {
  from: HexCoord;
  to: HexCoord;
  revealedTiles: HexCoord[];
  discoveredWonders: WonderDiscoveryResult[];
  villageOutcome?: {
    outcome: VillageOutcomeType;
    message: string;
    position: HexCoord;
  };
}

export function isWorkerBusy(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.type !== 'worker' || !unit.workerTask) return false;
  const taskKey = hexKey(unit.workerTask.coord);
  const tile = state.map.tiles[taskKey];
  return hexKey(unit.position) === taskKey
    && tile?.improvement === unit.workerTask.action
    && tile.improvementTurnsLeft > 0;
}

export function abandonWorkerTask(state: GameState, unitId: string): void {
  const unit = state.units[unitId];
  if (!unit?.workerTask) return;
  const key = hexKey(unit.workerTask.coord);
  const tile = state.map.tiles[key];
  if (tile?.improvement === unit.workerTask.action && tile.improvementTurnsLeft > 0) {
    tile.improvement = 'none';
    tile.improvementTurnsLeft = 0;
  }
  state.units = {
    ...state.units,
    [unitId]: { ...unit, workerTask: undefined },
  };
}

function getCivUnits(state: GameState, civId: string) {
  return state.civilizations[civId]?.units
    .map(id => state.units[id])
    .filter((unit): unit is NonNullable<typeof unit> => unit !== undefined) ?? [];
}

function getCivCityPositions(state: GameState, civId: string): HexCoord[] {
  return state.civilizations[civId]?.cities
    .map(id => state.cities[id]?.position)
    .filter((coord): coord is HexCoord => coord !== undefined) ?? [];
}

export function executeUnitMove(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: ExecuteUnitMoveOptions,
): ExecuteUnitMoveResult {
  const unit = state.units[unitId];
  if (!unit) {
    return {
      from: to,
      to,
      revealedTiles: [],
      discoveredWonders: [],
    };
  }

  const from = { ...unit.position };
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';

  // Calculate total path cost
  let cost = 0;
  const path = findPath(from, to, state.map, domain);
  if (path) {
    for (let i = 1; i < path.length; i++) {
      const tile = state.map.tiles[hexKey(path[i])];
      cost += tile ? getMovementCostForUnit(tile.terrain, domain) : 1;
    }
  } else {
    // Fallback for single-step moves or if pathfinding fails unexpectedly
    const tile = state.map.tiles[hexKey(to)];
    cost = tile ? getMovementCostForUnit(tile.terrain, domain) : 1;
  }
  state.units = {
    ...state.units,
    [unitId]: moveUnit(unit, to, cost),
  };
  options.bus?.emit('unit:move', { unitId, from, to });

  let villageOutcome: ExecuteUnitMoveResult['villageOutcome'];
  const villageAtDestination = Object.values(state.tribalVillages).find(village => hexKey(village.position) === hexKey(to));
  if (villageAtDestination) {
    let rngState = state.turn * 16807 + unit.id.charCodeAt(0);
    const villageRng = () => {
      rngState = (rngState * 48271) % 2147483647;
      return rngState / 2147483647;
    };
    const result = visitVillage(state, villageAtDestination.id, state.units[unitId], villageRng);
    villageOutcome = {
      outcome: result.outcome,
      message: result.message,
      position: villageAtDestination.position,
    };
    options.bus?.emit('village:visited', {
      civId: options.civId,
      position: villageAtDestination.position,
      outcome: result.outcome,
      message: result.message,
    });
  }

  const revealedTiles = updateVisibility(
    state.civilizations[options.civId].visibility,
    getCivUnits(state, options.civId),
    state.map,
    getCivCityPositions(state, options.civId),
  );
  refreshLastSeenPresentationsForCiv(state, options.civId);
  const contacts = syncCivilizationContactsFromVisibility(state, options.civId);
  for (const contact of contacts) {
    options.bus?.emit('civilization:first-contact', contact);
  }
  if (revealedTiles.length > 0) {
    options.bus?.emit('fog:revealed', { tiles: revealedTiles });
  }

  const discoveredWonders: WonderDiscoveryResult[] = [];
  for (const revealedCoord of revealedTiles) {
    const revealedTile = state.map.tiles[hexKey(revealedCoord)];
    if (!revealedTile?.wonder) {
      continue;
    }
    const isFirstDiscoverer = processWonderDiscovery(state, options.civId, revealedTile.wonder);
    const discovery = {
      wonderId: revealedTile.wonder,
      position: revealedCoord,
      isFirstDiscoverer,
    };
    discoveredWonders.push(discovery);
    options.bus?.emit('wonder:discovered', {
      civId: options.civId,
      wonderId: revealedTile.wonder,
      position: revealedCoord,
      isFirstDiscoverer,
    });
  }

  return {
    from,
    to,
    revealedTiles,
    discoveredWonders,
    villageOutcome,
  };
}
