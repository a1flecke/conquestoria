// src/systems/espionage-stealth.ts
import type { GameMap, Unit, GameState, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { isSpyUnitType } from './spy-unit-types';
import { mapDistance } from './hex-utils';
import { isUnitConcealedFrom } from './concealment';

function hasNearbyDetector(map: GameMap, units: Record<string, Unit>, viewerCivId: string, spyPosition: { q: number; r: number }): boolean {
  for (const u of Object.values(units)) {
    if (u.transportId) continue;
    if (u.owner !== viewerCivId) continue;
    const def = UNIT_DEFINITIONS[u.type];
    const isDetector = !!def?.spyDetectionChance || isSpyUnitType(u.type);
    if (!isDetector) continue;
    if (mapDistance(map, u.position, spyPosition) <= (def?.visionRange ?? 2)) return true;
  }
  return false;
}

const DISGUISE_TYPE_MAP: Record<string, UnitType> = {
  barbarian: 'warrior',
  warrior: 'warrior',
  scout: 'scout',
  archer: 'archer',
  worker: 'worker',
};

export function projectUnitForPlayer(
  unit: Unit,
  state: GameState,
  viewerCivId: string,
  detectorUnits = state.units,
): Unit | undefined {
  if (unit.transportId) return undefined;
  if (unit.owner === viewerCivId) return unit;
  if (isUnitConcealedFrom(state, unit, viewerCivId)) return undefined;

  const spy = state.espionage?.[unit.owner]?.spies[unit.id];
  if (!spy?.disguiseAs || spy.status !== 'idle') return unit;
  if (hasNearbyDetector(state.map, detectorUnits, viewerCivId, unit.position)) return unit;
  return {
    ...unit,
    type: DISGUISE_TYPE_MAP[spy.disguiseAs] ?? 'warrior',
    owner: spy.disguiseAs === 'barbarian' ? 'barbarian' : unit.owner,
  };
}

export function getVisibleUnitsForPlayer(
  units: Record<string, Unit>,
  state: GameState,
  viewerCivId: string,
): Record<string, Unit> {
  const result: Record<string, Unit> = {};

  for (const [id, unit] of Object.entries(units)) {
    const projected = projectUnitForPlayer(unit, state, viewerCivId, units);
    if (projected) result[id] = projected;
  }

  return result;
}
