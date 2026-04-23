// src/systems/espionage-stealth.ts
import type { Unit, GameState, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-system';
import { isSpyUnitType } from './espionage-system';
import { hexDistance } from './hex-utils';

function hasNearbyDetector(units: Record<string, Unit>, viewerCivId: string, spyPosition: { q: number; r: number }): boolean {
  for (const u of Object.values(units)) {
    if (u.owner !== viewerCivId) continue;
    const def = UNIT_DEFINITIONS[u.type];
    const isDetector = !!def?.spyDetectionChance || isSpyUnitType(u.type);
    if (!isDetector) continue;
    if (hexDistance(u.position, spyPosition) <= (def?.visionRange ?? 2)) return true;
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

export function getVisibleUnitsForPlayer(
  units: Record<string, Unit>,
  state: GameState,
  viewerCivId: string,
): Record<string, Unit> {
  const result: Record<string, Unit> = {};

  for (const [id, unit] of Object.entries(units)) {
    if (unit.owner === viewerCivId) {
      result[id] = unit;
      continue;
    }

    const spyRecord = state.espionage?.[unit.owner]?.spies[id];
    const disguise = spyRecord?.disguiseAs;

    if (!disguise || !spyRecord || spyRecord.status !== 'idle') {
      result[id] = unit;
      continue;
    }

    // Own spy units and scout_hound units see through all disguises
    if (hasNearbyDetector(units, viewerCivId, unit.position)) {
      result[id] = unit;
      continue;
    }

    const fakeType = DISGUISE_TYPE_MAP[disguise] ?? 'warrior';
    const fakeOwner = disguise === 'barbarian' ? 'barbarian' : unit.owner;
    result[id] = { ...unit, type: fakeType as UnitType, owner: fakeOwner };
  }

  return result;
}
