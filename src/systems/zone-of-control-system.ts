import type { GameState, HexCoord, Unit } from '@/core/types';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

function domainOf(unit: Unit): 'land' | 'naval' | 'air' {
  return UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
}

export function isZocEligibleCombatUnit(unit: Unit): boolean {
  const definition = UNIT_DEFINITIONS[unit.type];
  return !unit.transportId
    && definition.strength > 0
    && domainOf(unit) !== 'air'
    && !UNIT_CLASS_BY_TYPE[unit.type].includes('recon');
}

export interface ZoneOfControlResult {
  limited: boolean;
  sourceUnitIds: readonly string[];
}

export function getZoneOfControlAt(
  state: Readonly<GameState>,
  mover: Unit,
  destination: HexCoord,
): ZoneOfControlResult {
  if (!isZocEligibleCombatUnit(mover)) return { limited: false, sourceUnitIds: [] };
  const neighbors = state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(destination, state.map.width)
    : hexNeighbors(destination);
  const sourceUnitIds = Object.values(state.units)
    .filter(candidate => isZocEligibleCombatUnit(candidate)
      && domainOf(candidate) === domainOf(mover)
      && isHostileOwnerTo(state, mover.owner, candidate.owner)
      && neighbors.some(neighbor => neighbor.q === candidate.position.q && neighbor.r === candidate.position.r))
    .map(candidate => candidate.id);
  return { limited: sourceUnitIds.length > 0, sourceUnitIds };
}

export function getCombatAdjacentOccupiedTileCount(
  state: Readonly<GameState>,
  ownerId: string,
  defender: Unit,
  excludedUnitId?: string,
): number {
  const neighbors = state.map.wrapsHorizontally
    ? getWrappedHexNeighbors(defender.position, state.map.width)
    : hexNeighbors(defender.position);
  const keys = new Set(neighbors.map(hexKey));
  const occupied = new Set(
    Object.values(state.units)
      .filter(unit => unit.id !== excludedUnitId
        && unit.owner === ownerId
        && isZocEligibleCombatUnit(unit)
        && keys.has(hexKey(unit.position)))
      .map(unit => hexKey(unit.position)),
  );
  return occupied.size;
}
