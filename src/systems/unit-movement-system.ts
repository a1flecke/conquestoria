import type { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, VillageOutcomeType } from '@/core/types';
import { updateVisibility } from '@/systems/fog-of-war';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { hexKey } from '@/systems/hex-utils';
import { moveUnit, getMovementCost } from '@/systems/unit-system';
import { visitVillage } from '@/systems/village-system';
import { processWonderDiscovery } from '@/systems/wonder-system';

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
  const tile = state.map.tiles[hexKey(to)];
  const cost = tile ? getMovementCost(tile.terrain) : 1;
  state.units[unitId] = moveUnit(unit, to, cost);
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
  syncCivilizationContactsFromVisibility(state, options.civId);
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
