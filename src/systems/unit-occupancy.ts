import type { HexCoord, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export interface UnitOccupancyIndex {
  unitIdsByHex: Record<string, string[]>;
  ownersByUnitId: Record<string, string>;
}

export interface StackRelationship {
  occupantIds: string[];
  friendlyUnitIds: string[];
  hostileUnitIds: string[];
  hasFriendlyStack: boolean;
  hasHostileBlocker: boolean;
}

export function buildUnitOccupancy(units: Record<string, Unit>): UnitOccupancyIndex {
  const unitIdsByHex: Record<string, string[]> = {};
  const ownersByUnitId: Record<string, string> = {};

  for (const [unitId, unit] of Object.entries(units)) {
    const key = hexKey(unit.position);
    unitIdsByHex[key] ??= [];
    unitIdsByHex[key].push(unitId);
    ownersByUnitId[unitId] = unit.owner;
  }

  for (const ids of Object.values(unitIdsByHex)) {
    ids.sort((a, b) => a.localeCompare(b));
  }

  return { unitIdsByHex, ownersByUnitId };
}

export function getUnitIdsAtCoord(index: UnitOccupancyIndex, coord: HexCoord): string[] {
  return [...(index.unitIdsByHex[hexKey(coord)] ?? [])];
}

export function getStackRelationship(
  index: UnitOccupancyIndex,
  movingUnit: Unit,
  coord: HexCoord,
): StackRelationship {
  const occupantIds = getUnitIdsAtCoord(index, coord).filter(id => id !== movingUnit.id);
  const friendlyUnitIds = occupantIds.filter(id => index.ownersByUnitId[id] === movingUnit.owner);
  const hostileUnitIds = occupantIds.filter(id => index.ownersByUnitId[id] !== movingUnit.owner);

  return {
    occupantIds,
    friendlyUnitIds,
    hostileUnitIds,
    hasFriendlyStack: friendlyUnitIds.length > 0,
    hasHostileBlocker: hostileUnitIds.length > 0,
  };
}

export function hasHostileUnitAtCoord(
  index: UnitOccupancyIndex,
  coord: HexCoord,
  ownerId: string,
): boolean {
  return getUnitIdsAtCoord(index, coord).some(unitId => index.ownersByUnitId[unitId] !== ownerId);
}

function isReady(unit: Unit): boolean {
  return unit.movementPointsLeft > 0 && !unit.hasActed;
}

export function sortUnitsForStackPicker(units: Unit[], currentUnitId: string | null = null): Unit[] {
  return [...units].sort((a, b) => {
    const readyDelta = Number(isReady(b)) - Number(isReady(a));
    if (readyDelta !== 0) return readyDelta;

    if (currentUnitId) {
      const currentDelta = Number(b.id === currentUnitId) - Number(a.id === currentUnitId);
      if (currentDelta !== 0) return currentDelta;
    }

    const nameDelta = UNIT_DEFINITIONS[a.type].name.localeCompare(UNIT_DEFINITIONS[b.type].name);
    if (nameDelta !== 0) return nameDelta;

    return a.id.localeCompare(b.id);
  });
}
