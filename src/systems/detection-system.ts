// src/systems/detection-system.ts
import type { GameState, Unit } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from './unit-system';
import { hexDistance } from './hex-utils';
import { createRng } from './map-generator';
import { isSpyUnitType } from './espionage-system';

export function getPassiveDetectionChance(cityPopulation: number): number {
  return Math.min(0.20, 0.03 + cityPopulation * 0.017);
}

export function processDetection(state: GameState, bus: EventBus): GameState {
  const seed = `detection-${state.turn}`;
  const rng = createRng(seed);
  let nextState = state;

  for (const [spyUnitId, spyUnit] of Object.entries(state.units)) {
    if (!isSpyUnitType(spyUnit.type)) continue;

    // Only idle (on-map, traveling) spies can be detected
    const spyRecord = state.espionage?.[spyUnit.owner]?.spies[spyUnitId];
    if (!spyRecord || spyRecord.status !== 'idle') continue;

    // 1. Scout Hound detection
    for (const detectUnit of Object.values(state.units)) {
      if (detectUnit.owner === spyUnit.owner) continue;
      const def = UNIT_DEFINITIONS[detectUnit.type];
      if (!def?.spyDetectionChance) continue;
      const dist = hexDistance(detectUnit.position, spyUnit.position);
      if (dist > def.visionRange) continue;
      if (rng() < def.spyDetectionChance) {
        nextState = registerDetection(nextState, detectUnit.owner, spyUnit, false, bus);
      }
    }

    // 2. Passive baseline detection — spy adjacent to or on an enemy city tile
    for (const city of Object.values(state.cities)) {
      if (city.owner === spyUnit.owner) continue;
      if (hexDistance(city.position, spyUnit.position) > 1) continue;
      const chance = getPassiveDetectionChance(city.population);
      if (rng() < chance) {
        nextState = registerDetection(nextState, city.owner, spyUnit, spyRecord.disguiseAs != null, bus);
      }
    }
  }

  return nextState;
}

function registerDetection(
  state: GameState,
  detectingCivId: string,
  spyUnit: Unit,
  wasDisguised: boolean,
  bus: EventBus,
): GameState {
  const civEsp = state.espionage?.[detectingCivId];
  if (!civEsp) return state;

  bus.emit('espionage:spy-detected-traveling', {
    detectingCivId,
    spyOwner: spyUnit.owner,
    spyUnitId: spyUnit.id,
    position: spyUnit.position,
    wasDisguised,
  });

  const detection = {
    position: { ...spyUnit.position },
    turn: state.turn,
    wasDisguised,
  };

  return {
    ...state,
    espionage: {
      ...state.espionage,
      [detectingCivId]: {
        ...civEsp,
        recentDetections: [...(civEsp.recentDetections ?? []), detection].slice(-20),
      },
    },
  };
}
